// Teras Connect - agent tools, personas and the rule-based "Teras SLM" planner (stand-in for Aras Integrasi's sovereign SLM).
// Kept separate from server.js: the planner only decides WHICH governed Boomi tool to call; Boomi decides WHAT the caller may see.
const TOOLS = {
  vehicle: { name: 'jpj_vehicle_lookup', title: 'Vehicle lookup', file: 'VEHMST',
             description: 'Look up a vehicle by registration number (plate), or every vehicle owned by a MyKad number (ic). Returns make, model, road tax and insurance validity, blacklist status and owner (subject to the caller\'s access policy).',
             params: { plate: 'Vehicle registration number, e.g. "WXY 1234"', ic: 'Owner MyKad number, e.g. "850412-10-5523"' } },
  licence: { name: 'jpj_licence_status', title: 'Licence status', file: 'LICMST',
             description: 'Driving licence status for a MyKad number (ic): licence type and classes, expiry date, days to expiry, KEJARA demerit points.',
             params: { ic: 'Licence holder MyKad number' } },
  summons: { name: 'jpj_summons_check', title: 'Summons check', file: 'SUMMST',
             description: 'Traffic summons (saman) by MyKad number (ic) or registration number (plate): offence, date, location, amount, status and outstanding total.',
             params: { ic: 'Offender MyKad number', plate: 'Vehicle registration number' } },
};
const TOOL_BY_NAME = Object.fromEntries(Object.entries(TOOLS).map(([k, t]) => [t.name, k]));
const PERSONAS = {
  citizen: { id: 'citizen', name: 'Ahmad Faizal', role: 'Citizen - MyJPJ virtual assistant', badge: 'MyDigital ID verified', color: '#0ea5e9',
             context: { channel: 'CITIZEN_VA', requester_ic: '850412-10-5523' },
             prompts: ['Can I renew my road tax?', 'Do I have any outstanding saman?', 'When does my driving licence expire?', 'Who owns VAB 8899?', 'Show me the summons for 780115-08-5011'] },
  officer: { id: 'officer', name: 'Pn. Rosnah Ismail', role: 'JPJ counter officer - Putrajaya', badge: 'Officer JPJ-PJY-0451', color: '#16a34a',
             context: { channel: 'COUNTER_OFFICER', officer_id: 'JPJ-PJY-0451', purpose: 'Counter service - road tax renewal enquiry' },
             prompts: ['Can the owner of WXY 1234 renew road tax?', 'Full check on 780115-08-5011', 'Licence status for 010521-10-1234', 'Who owns WTT 1?'] },
  enforcement: { id: 'enforcement', name: 'Insp. Hafiz Rahim', role: 'Roadside enforcement - Op Selamat', badge: 'Officer PDRM-88123', color: '#f59e0b',
             context: { channel: 'ENFORCEMENT', officer_id: 'PDRM-88123', purpose: 'Roadside inspection' },
             prompts: ['Roadside check on BKT 5521', 'Is the licence of 780115-08-5011 valid?', 'Any outstanding summons on WXY 1234?'] },
  analytics: { hidden: true, id: 'analytics', name: 'Teras SLM pipeline', role: 'AI analytics / RAG ingestion', badge: 'Service account', color: '#a855f7',
             context: { channel: 'AI_ANALYTICS', purpose: 'Road-safety analytics and SLM fine-tuning' },
             prompts: ['Summons for 780115-08-5011', 'Vehicles owned by 850412-10-5523', 'Licence profile of 880903-05-5237'] },
  unknown: { hidden: true, id: 'unknown', name: 'Unregistered chatbot', role: 'No declared channel', badge: 'Unknown caller', color: '#ef4444',
             context: { channel: 'PUBLIC_WEB' }, prompts: ['Who owns WXY 1234?'] },
};

/* ---------------- "Teras SLM" planner (rule-based stand-in for the sovereign SLM) ---------------- */
const STOPWORDS = new Set('in on at by rm km to of is me my the for and a an or no yes cdl pdl gdl ldl day days year years top class kelas jan feb mar apr may jun jul aug sep oct nov dec op'.split(' '));
function extract(msg) {
  const ics = [...msg.matchAll(/\b(\d{6})-?(\d{2})-?(\d{4})\b/g)].map((m) => `${m[1]}-${m[2]}-${m[3]}`);
  const rest = msg.replace(/\b\d{6}-?\d{2}-?\d{4}\b/g, ' ');
  const plates = [];
  for (const m of rest.matchAll(/\b([A-Za-z]{1,3})\s?(\d{1,4})([A-Za-z]?)\b/g)) {
    if (STOPWORDS.has(m[1].toLowerCase())) continue;
    plates.push(`${m[1]} ${m[2]}${m[3]}`.toUpperCase());
  }
  return { ics, plates };
}
function plan(message, persona) {
  const t = message.toLowerCase(), has = (re) => re.test(t);
  const { ics, plates } = extract(message);
  const self = persona.context.requester_ic && (has(/\b(my|mine|i|me|saya|aku)\b/) || (!ics.length && !plates.length)) ? persona.context.requester_ic : null;
  const ic = ics[0] || self, plate = plates[0];
  const want = {
    vehicle: has(/road ?tax|lkm|cukai jalan|insuran|vehicle|\bcar\b|kereta|motor|lorry|owner|owns|pemilik|blacklist|senarai hitam|registration|chassis|roadside/),
    licence: has(/licen[cs]e|lesen|demerit|kejara|driving|memandu|\bpoints?\b/),
    summons: has(/summons|saman|\bfines?\b|compound|kompaun|outstanding|tertunggak|offen[cs]e|\bpay\b|bayar|court|mahkamah/),
    renew: has(/renew|pembaharuan|perbaharui|baharu/),
    all: has(/everything|full check|full profile|overview|all records|semua|background|roadside check/),
  };
  if (want.renew && !want.licence) { want.vehicle = true; want.summons = true; }
  if (want.renew && want.licence) want.summons = true;
  if (want.all) { want.vehicle = true; want.licence = Boolean(ic) || !plate; want.summons = true; }
  if (!want.vehicle && !want.licence && !want.summons) {
    if (plate) want.vehicle = true;
    else if (ic) { want.licence = true; want.summons = true; }
  }
  if (!ic && !plate) return { clarify: 'Which vehicle registration number or MyKad number should I check?' };
  const steps = [];
  if (want.vehicle) steps.push({ tool: 'vehicle', query: plate ? { plate } : { ic } });
  if (want.licence) steps.push({ tool: 'licence', query: { ic }, chainFromVehicle: !ic });
  if (want.summons) steps.push({ tool: 'summons', query: ic && !(plate && want.vehicle && !ics.length && !self) ? { ic } : { plate } });
  return { steps, intent: Object.keys(want).filter((k) => want[k]), entities: { ics, plates, self: Boolean(self) } };
}

const fmtRm = (n) => 'RM' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function compose(planned, calls, persona) {
  const lines = [], by = Object.fromEntries(calls.map((c) => [c.tool, c]));
  for (const c of calls) {
    const r = c.result;
    if (!r) { lines.push(`**${TOOLS[c.tool].title}:** the tool call failed (${c.error}).`); continue; }
    if (c.skipped) { lines.push(`**${TOOLS[c.tool].title}:** ${c.skipped}`); continue; }
    if (r.decision === 'DENY') { lines.push(`🔒 **${TOOLS[c.tool].title}:** ${r.reason}`); continue; }
    if (r.status === 'NOT_FOUND') { lines.push(`**${TOOLS[c.tool].title}:** ${r.reason}`); continue; }
    if (c.tool === 'vehicle') {
      lines.push(`**Vehicle${r.count > 1 ? 's' : ''}:**`); (r.summaries || []).forEach((s) => lines.push(`- ${s}`));
      if ((r.records || []).some((v) => v.view === 'public')) lines.push('- 🔒 Owner details are private: for vehicles you do not own, the citizen assistant only shows public status.');
    } else if (c.tool === 'licence') {
      lines.push('**Driving licence:**'); (r.summaries || []).forEach((s) => lines.push(`- ${s}`));
      (r.records || []).forEach((l) => {
        if (l.status === 'Suspended') lines.push(`- ⚠️ Licence is **suspended** - ${l.demerit_points >= 20 ? 'KEJARA demerit limit reached' : 'see JPJ'}.`);
        else if (l.status === 'Expired') lines.push('- ⚠️ Licence has **expired** - it must be renewed before driving.');
        else if (l.expiring_soon) lines.push(`- ⏰ Expires in **${l.days_to_expiry} days** - it can be renewed online through MyJPJ.`);
        if (l.status === 'Active' && l.demerit_points >= 10) lines.push(`- ${l.demerit_points} demerit points: ${20 - l.demerit_points} more before suspension.`);
      });
    } else if (c.tool === 'summons') {
      const tot = r.totals || {};
      lines.push(`**Summons:** ${tot.outstanding_count ? `${tot.outstanding_count} outstanding, totalling **${fmtRm(tot.outstanding_rm)}**` : 'nothing outstanding'}${tot.court_count ? `, ${tot.court_count} referred to court` : ''}.`);
      (r.summaries || []).forEach((s) => lines.push(`- ${s}`));
    }
    if (r.decision === 'PARTIAL' && r.governance) {
      const g = r.governance, bits = [g.recordsFiltered ? `${g.recordsFiltered} record(s) hidden` : '', g.maskedFields?.length ? `masked: ${g.maskedFields.join(', ')}` : '', g.withheldFields?.length ? `withheld: ${g.withheldFields.join(', ')}` : ''].filter(Boolean);
      lines.push(`  _Policy ${r.context?.channel}: ${bits.join('; ')}._`);
    }
  }
  // renewal reasoning across tools - the assistant combines governed results, it never sees the raw mainframe data
  if (planned.intent.includes('renew') && by.vehicle?.result?.records?.length && by.vehicle.result.decision !== 'DENY') {
    const vs = by.vehicle.result.records, v = vs.find((x) => x.road_tax_valid === false) || vs[0], s = by.summons?.result, blockers = [];
    if (v.blacklisted) blockers.push('the vehicle is **blacklisted** by JPJ');
    const open = s && s.decision !== 'DENY' ? (s.records || []).filter((x) => x.status === 'Outstanding' && (!x.plate || x.plate === v.plate || x.plate?.startsWith('VEH-'))) : [];
    if (open.length) blockers.push(`${open.length} outstanding summons on ${v.plate} (${fmtRm(open.reduce((a, x) => a + Number(x.amount_rm || 0), 0))})`);
    if (v.insurance_valid === false) blockers.push('insurance is not valid - renew insurance first');
    lines.unshift(blockers.length ? `**Road tax renewal for ${v.plate}: not yet.** First resolve: ${blockers.join('; ')}.` : `**Road tax renewal for ${v.plate}: yes**, nothing is blocking it${v.road_tax_valid ? '' : ' (road tax has expired, so renew it now)'}.`);
  }
  if (!lines.length) lines.push('I could not find anything for that request.');
  return lines.join('\n');
}

function openapi(base) {
  const paths = {};
  for (const [k, t] of Object.entries(TOOLS)) {
    paths[`/${k}`] = { post: { operationId: t.name, summary: t.title, description: t.description, requestBody: { required: true, content: { 'application/json': { schema: { type: 'object',
      properties: { query: { type: 'object', properties: Object.fromEntries(Object.entries(t.params).map(([p, d]) => [p, { type: 'string', description: d }])) },
                    context: { type: 'object', description: 'Caller context - drives the access policy Boomi applies', properties: { channel: { type: 'string', enum: ['CITIZEN_VA', 'COUNTER_OFFICER', 'ENFORCEMENT', 'AI_ANALYTICS'] }, requester_ic: { type: 'string' }, officer_id: { type: 'string' }, purpose: { type: 'string' } }, required: ['channel'] } }, required: ['query', 'context'] } } } },
      responses: { 200: { description: 'Governed result: status, decision (ALLOW / PARTIAL / DENY), records, summaries, governance, cleansing and source lineage' } } } };
  }
  return { openapi: '3.0.3', info: { title: 'Teras JPJ Legacy Tools API (Boomi)', version: '1.0', description: 'Agent tools over the JPJ IBM P-Series, served by Boomi. Every call is cleansed on input and governed on output by the caller context.' },
           servers: [{ url: base }], components: { securitySchemes: { basic: { type: 'http', scheme: 'basic' } } }, security: [{ basic: [] }], paths };
}

module.exports = { TOOLS, TOOL_BY_NAME, PERSONAS, extract, plan, compose, openapi, FILE_TOOL: { VEHMST: 'vehicle', LICMST: 'licence', SUMMST: 'summons' } };
