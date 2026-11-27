/* Teras Connect additions: runtime switch, connection library, onboarding wizard, agent tools, virtual assistant, sovereign runtimes.
   Loaded after app.js and reuses its helpers ($, $$, esc, api, toast, openModal, closeModal, go, RENDER, T, SYS, sysTag, num, secs, when, sleep, maskHtml). */
const FILE_TOOL = { VEHMST: 'jpj_vehicle_lookup', LICMST: 'jpj_licence_status', SUMMST: 'jpj_summons_check' };
window.toolFor = (c) => FILE_TOOL[(c.config?.file || '').toUpperCase()];
let RUNTIME_STATUS = {}, META = null;
const rtName = (id) => (window.HEALTH?.runtimes || []).find((r) => r.id === id);
window.rtBadge = (rt, compact) => {
  if (!rt) return '';
  const id = typeof rt === 'string' ? rt : rt.id || (rt.zone === 'ONPREM' ? 'onprem' : 'cloud');
  const name = typeof rt === 'object' && rt.name && rt.name !== 'localhost' ? rt.name : rtName(id)?.name || id;
  if (compact) return `<span class="rtb ${id}" title="${esc(name)} - ${esc(rtName(id)?.kind || '')}">${id === 'onprem' ? '🏠 On-prem' : '☁ Cloud'}</span>`;
  return `<span class="rtb ${id}" title="${esc(rtName(id)?.kind || '')}">${id === 'onprem' ? '🏠 On-prem' : '☁ Cloud'} · ${esc(name)}</span>`;
};
window.rtIngest = () => (window.RT === 'onprem' ? 'POST /ws/simple/createArasIngest (on-prem shared web server)' : 'POST /ws/rest/aras/v1/ingest (Boomi API Service, cloud)');

/* ---------------- runtime switch ---------------- */
window.initRuntime = (h) => {
  const rts = h.runtimes || [];
  if (!rts.find((r) => r.id === window.RT && r.available)) window.RT = rts.find((r) => r.available)?.id || 'cloud';
  drawSwitch(); probeRuntimes();   // on load, on runtime switch and on the Runtimes page only - no background polling
  api('/api/library').then((l) => (window.LIBRARY = l)).catch(() => {});
  api('/api/meta').then((m) => (META = m)).catch(() => {});
};
function drawSwitch() {
  const rts = window.HEALTH?.runtimes || [];
  $('#rtSwitch').innerHTML = '<span class="rt-l">Boomi runtime</span>' + rts.map((r) => {
    const st = RUNTIME_STATUS[r.id];
    return `<button class="rt ${r.id} ${r.id === window.RT ? 'on' : ''}" data-rt="${r.id}" ${r.available ? '' : 'disabled'} title="${esc(r.kind)} - ${esc(r.network)}${r.relayed ? ' (relayed through the Teras Connect gateway)' : ''}">
      <span class="dot ${st ? (st.reachable ? 'ok' : 'bad') : ''}"></span>${r.id === 'onprem' ? '🏠 On-prem' : '☁ Cloud'}<small>${esc(r.id === 'onprem' ? r.name : 'Boomi cloud')}</small></button>`;
  }).join('');
  $$('#rtSwitch [data-rt]').forEach((b) => (b.onclick = () => {
    window.RT = b.dataset.rt; localStorage.setItem('teras-rt', window.RT); drawSwitch(); probeRuntimes();
    toast(window.RT === 'onprem' ? 'Every call now runs on the on-prem runtime guru-mac-mcp, inside the firewall' : 'Every call now runs on the Boomi cloud runtime');
    if (typeof RENDER !== 'undefined' && RENDER[PAGE]) RENDER[PAGE]();
  }));
}
async function probeRuntimes() {
  try { (await api('/api/runtimes')).forEach((r) => (RUNTIME_STATUS[r.id] = r)); drawSwitch(); if (PAGE === 'sovereign') drawRuntimeCards(); } catch { /* offline */ }
}

/* ---------------- green screen: the raw IBM i file ---------------- */
window.greenScreen = async (file) => {
  openModal(`<h2>IBM P-Series · JPJPRD/${esc(file)}</h2><div class="empty">Reading the raw file…</div>`);
  const r = await api('/api/legacy?file=' + encodeURIComponent(file)), L = r.layout;
  const ruler = Array.from({ length: L.recordLength }, (_, i) => ((i + 1) % 10 === 0 ? String(((i + 1) / 10) % 10) : (i + 1) % 5 === 0 ? '+' : '.')).join('');
  const spans = (line) => L.fields.map((f) => `<span class="f" title="${esc(f.name)} (${f.from}-${f.to}): ${esc(f.description)}">${esc(line.slice(f.from - 1, f.to).padEnd(f.length, ' '))}</span>`).join('');
  openModal(`<h2>IBM P-Series · JPJPRD/${esc(file)} <span class="muted small">${esc(L.title)}</span></h2>
    <p class="muted small">What the IBM i actually holds: fixed-width records, padding, CYYMMDD dates, implied decimals and one-letter codes. Hover a value to see its field. Boomi parses this with the file layout and cleanses it on input.</p>
    <div class="green"><div class="hdr">DSPPFM FILE(JPJPRD/${esc(file)})   ${r.lines.length} records · record length ${L.recordLength}</div><div class="ruler">${ruler}</div>${r.lines.map((l) => `<div class="ln">${spans(l)}</div>`).join('')}</div>
    <div class="layout">${L.fields.map((f) => `<span class="lf"><b>${esc(f.name)}</b> ${f.from}-${f.to} · ${esc(f.description)}</span>`).join('')}</div>
    <div class="head" style="justify-content:flex-end;margin:10px 0 0"><button class="btn" id="gsClose">Close</button></div>`);
  $('#gsClose').onclick = closeModal;
};

/* ---------------- onboarding wizard: details + runtime placement, then reuse connections from the library ---------------- */
const PICKS = [
  { key: 'veh', type: 'IBM_PSERIES', name: 'Vehicle registry - IBM i VEHMST', config: { file: 'VEHMST' } },
  { key: 'lic', type: 'IBM_PSERIES', name: 'Driving licences - IBM i LICMST', config: { file: 'LICMST' } },
  { key: 'sum', type: 'IBM_PSERIES', name: 'Traffic summons - IBM i SUMMST', config: { file: 'SUMMST' } },
  { key: 'sf', type: 'SALESFORCE', name: 'Salesforce Service Cloud - Cases', config: { object: 'Case' } },
  { key: 'od', type: 'OPEN_DATA', name: 'data.gov.my - open data', config: { dataset: 'hospital_beds', filter: 'Selangor@state', sort: '-date', limit: 12 } },
  { key: 'sap', type: 'SAP_S4HANA', name: 'SAP S/4HANA - products', config: { search: 'pump' } },
];
function reuseNote(p) {
  for (const t of TENANTS) { /* TENANTS summaries do not carry connections; use the library */ }
  const lib = (window.LIBRARY || []).find((x) => x.type === p.type);
  const u = lib?.usedBy?.find((x) => p.type !== 'IBM_PSERIES' || x.connections.some((n) => n.includes(p.config.file)));
  return u ? `♻ reuses the Boomi connector + mapping from ${esc(u.name.split(' (')[0])}` : '♻ reuses the Boomi connector (new mapping)';
}
$('#newTenant').onclick = () => {
  const state = { step: 1, runtime: 'onprem', picks: new Set(['veh', 'sum']) };
  const draw = () => {
    if (state.step === 1) openModal(`<h2>Onboard a new customer <span class="muted small">step 1 of 2</span></h2>
      <p class="muted small">A customer is configuration, not a project: name, data classification and where its Boomi runtime runs.</p>
      <label class="f">Customer name</label><input id="nName" style="width:100%" placeholder="e.g. Jabatan Pendaftaran Negara (JPN)" value="${esc(state.name || '')}">
      <div class="f-row"><div><label class="f">Sector</label><input id="nInd" style="width:100%" value="${esc(state.ind || 'Government')}"></div>
        <div><label class="f">Data classification</label><select id="nCls" style="width:100%">${['Official - Sensitive', 'Confidential', 'Restricted', 'Internal'].map((x) => `<option ${x === state.cls ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
      <label class="f">Runtime placement</label>
      <div class="place">
        <label class="pl ${state.runtime === 'onprem' ? 'sel' : ''}"><input type="radio" name="pl" value="onprem" ${state.runtime === 'onprem' ? 'checked' : ''}><b>🏠 On-premise runtime (sovereign)</b><span>Boomi runtime in the customer's data centre or on MTAI infrastructure, behind the firewall. Data never leaves the zone.</span></label>
        <label class="pl ${state.runtime === 'cloud' ? 'sel' : ''}"><input type="radio" name="pl" value="cloud" ${state.runtime === 'cloud' ? 'checked' : ''}><b>☁ Boomi cloud runtime</b><span>Managed runtime for non-sensitive workloads; same processes, same package.</span></label></div>
      <div class="head" style="justify-content:flex-end;margin:12px 0 0"><button class="btn ghost" id="nCancel">Cancel</button><button class="btn" id="nNext">Next: connections →</button></div>`);
    else openModal(`<h2>Onboard ${esc(state.name)} <span class="muted small">step 2 of 2 · reuse connections</span></h2>
      <p class="muted small">Pick sources from the connection library. Each is already built in Boomi; mapping templates are reused from customers who mapped the same source.</p>
      <div class="picks">${PICKS.map((p) => `<label class="pick ${state.picks.has(p.key) ? 'sel' : ''}"><input type="checkbox" data-pick="${p.key}" ${state.picks.has(p.key) ? 'checked' : ''}>
        <div>${sysTag(p.type)} <b>${esc(p.name)}</b><div class="muted small">${reuseNote(p)}${p.type === 'IBM_PSERIES' ? ' · published as agent tool <code>' + FILE_TOOL[p.config.file] + '</code>' : ''}</div></div></label>`).join('')}</div>
      <div id="prov"></div>
      <div class="head" style="justify-content:flex-end;margin:12px 0 0"><button class="btn ghost" id="nBack">← Back</button><button class="btn" id="nGo">Onboard customer</button></div>`);
    if (state.step === 1) {
      $$('[name=pl]').forEach((r) => (r.onchange = () => { state.runtime = r.value; state.name = $('#nName').value; state.ind = $('#nInd').value; state.cls = $('#nCls').value; draw(); }));
      $('#nCancel').onclick = closeModal;
      $('#nNext').onclick = () => { state.name = $('#nName').value.trim(); state.ind = $('#nInd').value; state.cls = $('#nCls').value; if (!state.name) return toast('Enter a customer name'); state.step = 2; draw(); };
    } else {
      $$('[data-pick]').forEach((c) => (c.onchange = () => { c.checked ? state.picks.add(c.dataset.pick) : state.picks.delete(c.dataset.pick); c.closest('.pick').classList.toggle('sel', c.checked); }));
      $('#nBack').onclick = () => { state.step = 1; draw(); };
      $('#nGo').onclick = async () => {
        $('#nGo').disabled = true;
        const picks = PICKS.filter((p) => state.picks.has(p.key)).map(({ type, name, config }) => ({ type, name, config }));
        const t = await api('/api/tenants', { method: 'POST', body: JSON.stringify({ name: state.name, industry: state.ind, classification: state.cls, runtime: state.runtime, color: '#7c3aed', connections: picks }) });
        const rt = state.runtime === 'onprem' ? 'on-prem runtime guru-mac-mcp (customer data centre)' : 'Boomi cloud runtime';
        const steps = [`Create tenant ${t.id} in Teras Connect`, `Create Boomi environment ${t.boomiEnvironment} (Platform / Partner API in production)`, `Attach ${rt}`,
          'Deploy the Teras Connect package (same processes for every customer)', `Reuse ${picks.length} connection(s) from the library${t.connections.filter((c) => c.reusedFrom).length ? `, ${t.connections.filter((c) => c.reusedFrom).length} with reused mappings` : ''}`,
          `Publish ${t.connections.filter((c) => c.published).length} agent tool(s)`, 'Ready - run the sources and open the virtual assistant'];
        $('#prov').innerHTML = '<ul class="prov" id="provList"></ul>';
        for (const s of steps) { $('#provList').insertAdjacentHTML('beforeend', `<li><span class="ok">✔</span> ${esc(s)}</li>`); await sleep(420); }
        await loadTenants(); await sleep(400); closeModal(); window.RT = state.runtime; localStorage.setItem('teras-rt', window.RT); drawSwitch();
        await selectTenant(t.id, 'connections');
      };
    }
  };
  draw();
};

/* ---------------- agent tools ---------------- */
RENDER.tools = async () => {
  const el = $('#page-tools');
  el.innerHTML = '<div class="card empty">Loading tools…</div>';
  const tools = await api(`/api/tenants/${T.id}/tools`);
  const live = tools.filter((x) => x.kind === 'live');
  el.innerHTML = `
    <div class="head"><div><h2 style="font-size:17px">Agent tools for ${esc(T.name)}</h2><div class="muted small">Published connections become tools the virtual assistant (or any agent runtime) can call. Live tools query the IBM P-Series at question time through Boomi; the knowledge tool searches what Boomi ingested.</div></div>
      <a class="btn ghost sm" href="/openapi.json" target="_blank">OpenAPI 3 spec</a></div>
    <div class="toolgrid">${tools.map((x) => `<div class="tcard ${x.kind}"><div class="tk">${x.kind === 'live' ? 'LIVE TOOL · governed by caller context' : 'KNOWLEDGE TOOL · RAG'}</div>
      <div class="tn">${esc(x.name)}</div><p>${esc(x.description)}</p>
      ${x.kind === 'live' ? `<div class="small"><b>Source:</b> ${esc(x.connection || '')} (IBM i ${esc(x.file)})</div>
        <div class="eps"><div>${window.rtBadge('onprem')} <code>${esc(x.endpoints.onprem)}</code></div><div>${window.rtBadge('cloud')} <code>${esc(x.endpoints.cloud)}</code></div></div>
        <div class="small muted">Inputs: ${Object.keys(x.params).map((k) => `<code>${esc(k)}</code>`).join(', ')} + <code>context</code> (channel, requester, purpose)</div>`
      : `<div class="small"><b>${num(x.chunks)}</b> chunks indexed${x.chunks ? '' : ' - run the sources first'}</div>`}</div>`).join('')}</div>
    ${live.length ? `<div class="grid-5-7" style="margin-top:14px">
      <div class="card"><h2>Who may see what (enforced inside Boomi)</h2>
        <table class="t"><tr><th>Caller channel</th><th>Policy applied by "Govern on output"</th></tr>
          <tr><td><b>CITIZEN_VA</b><div class="muted small">MyJPJ app, MyDigital ID verified</div></td><td>Own records only; MyKad, chassis, phone masked. Other people's vehicles in public view; their licence and summons are refused.</td></tr>
          <tr><td><b>COUNTER_OFFICER</b><div class="muted small">JPJ counter, internal network</div></td><td>Full record - only with an officer ID and a stated purpose (audited).</td></tr>
          <tr><td><b>ENFORCEMENT</b><div class="muted small">Roadside, PDRM / JPJ</div></td><td>Status data; MyKad masked; address, phone, date of birth withheld.</td></tr>
          <tr><td><b>AI_ANALYTICS</b><div class="muted small">SLM training, RAG</div></td><td>De-identified: tokenised MyKad and plates, no names or contact data.</td></tr>
          <tr><td><b>Unknown channel</b></td><td>Refused - every request must declare a known channel.</td></tr></table></div>
      <div class="card"><h2>Try a tool on the ${window.RT === 'onprem' ? 'on-prem' : 'cloud'} runtime</h2>
        <div class="f-row"><select id="tTool">${live.map((x) => `<option value="${esc(x.key)}">${esc(x.name)}</option>`).join('')}</select>
          <input id="tKey" value="WXY 1234" placeholder="plate or MyKad"><select id="tPersona">${(META?.personas || []).map((p) => `<option value="${esc(p.id)}" ${p.id === 'officer' ? 'selected' : ''}>${esc(p.context.channel)} · ${esc(p.name)}</option>`).join('')}</select>
          <button class="btn" id="tGo">Call tool</button></div>
        <div id="tOut" class="mt"></div></div></div>` : '<div class="card mt">This customer has no live tools yet. Add an IBM P-Series connection and publish it as a tool.</div>'}`;
  if ($('#tGo')) $('#tGo').onclick = async () => {
    const tool = $('#tTool').value, k = $('#tKey').value.trim(), query = /^\d{6}-?\d{2}-?\d{4}$/.test(k) ? { ic: k } : { plate: k };
    if (tool === 'licence' && !query.ic) return toast('The licence tool needs a MyKad number');
    $('#tOut').innerHTML = '<div class="empty">Calling Boomi…</div>';
    try { const c = await api(`/api/tenants/${T.id}/tools/${tool}`, { method: 'POST', body: JSON.stringify({ query, persona: $('#tPersona').value }) }); $('#tOut').innerHTML = callCard(c); }
    catch (e) { $('#tOut').innerHTML = `<div class="card">${esc(e.message)}</div>`; }
  };
};

/* ---------------- trace cards ---------------- */
const decisionBadge = (d) => `<span class="dbadge d-${esc(d || 'SKIP')}">${esc(d || '-')}</span>`;
function callCard(c) {
  if (c.kind === 'knowledge') return `<div class="call"><div class="call-h"><span class="tn">knowledge_search</span><span class="dbadge d-ALLOW">RAG</span><span class="ms">${c.ms} ms · ${c.hits.length} of ${num(c.indexed)} chunks</span></div>
    <div class="steps">${c.hits.map((h, i) => `<div class="kstep"><b>[${i + 1}]</b> ${esc(h.metadata.source_system)} · ${esc(h.metadata.connection)} <code>${esc(h.docId)}</code> <span class="muted small">score ${h.score}</span><div class="small">${maskHtml(h.text.slice(0, 220))}</div></div>`).join('') || '<div class="muted small">No matching chunks.</div>'}
    <div class="muted small">Chunks were mapped and PII-masked by Boomi at ingestion time.</div></div></div>`;
  const r = c.result || {};
  if (c.skipped) return `<div class="call"><div class="call-h"><span class="tn">${esc(c.toolName)}</span>${decisionBadge('SKIP')}<span class="ms">not called</span></div><div class="steps"><div class="step-r gov"><span class="n">!</span><div>${esc(c.skipped)}</div></div></div></div>`;
  if (!c.result) return `<div class="call"><div class="call-h"><span class="tn">${esc(c.toolName)}</span>${decisionBadge('DENY')}<span class="ms">${secs(c.ms)}</span></div><div class="steps"><div class="step-r"><span class="n">!</span><div>${esc(c.error)}</div></div></div></div>`;
  const src = r.source || {}, cl = r.cleansing || {}, g = r.governance || {}, ctx = r.context || {}, rt = r.runtime || {};
  const id = 'j' + Math.random().toString(36).slice(2);
  return `<div class="call">
    <div class="call-h"><span class="tn">${esc(r.tool)}</span>${decisionBadge(r.decision)}<span class="tag">${esc(ctx.channel)}</span>${window.rtBadge({ id: c.runtime, name: rt.name, zone: rt.zone })}<span class="ms">${secs(c.ms)}</span></div>
    <div class="steps">
      <div class="step-r"><span class="n">1</span><div><b>Tool call</b> <code>${esc(c.request.method)} ${esc(c.request.path)}</code><br>key <span class="tag">${esc(src.keyAsReceived || '-')}</span> → normalised <span class="tag">${esc(src.keyNormalised || '-')}</span>${ctx.purpose ? ` · purpose “${esc(ctx.purpose)}”` : ''}</div></div>
      <div class="step-r"><span class="n">2</span><div><b>IBM P-Series keyed read</b> · ${esc(rt.legacyPath || '')}<br><code class="small">${esc(src.query || '')}</code> · ${src.recordsRead ?? 0} record(s) × ${src.recordLength || 0} bytes</div></div>
      <div class="step-r cl"><span class="n">3</span><div><b>Cleanse on input</b> · ${cl.valuesFixed || 0} values standardised<div class="tags">${(cl.rulesApplied || []).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}${(cl.issues || []).map((x) => `<span class="tag i">⚠ ${esc(x)}</span>`).join('')}</div></div></div>
      <div class="step-r gov"><span class="n">4</span><div><b>Govern on output</b> · ${esc(r.reason || '')}<div class="tags">${(g.maskedFields || []).map((x) => `<span class="tag m">masked: ${esc(x)}</span>`).join('')}${(g.withheldFields || []).map((x) => `<span class="tag w">withheld: ${esc(x)}</span>`).join('')}${g.recordsFiltered ? `<span class="tag w">${g.recordsFiltered} record(s) filtered</span>` : ''}</div></div></div>
      <div class="step-r au"><span class="n">5</span><div><b>Audit</b> · ${r.count ?? 0} record(s) returned · <code class="small">${esc(r.boomi?.executionId || '')}</code></div></div>
    </div>
    ${(r.summaries || []).length ? `<div class="sums">${r.summaries.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
    <span class="json-toggle" data-json="${id}">{ } request / response JSON</span><pre class="json-pre" id="${id}">${esc(JSON.stringify({ request: c.request.body, response: r }, null, 2))}</pre></div>`;
}
document.addEventListener('click', (e) => { const t = e.target.closest('[data-json]'); if (t) document.getElementById(t.dataset.json).classList.toggle('on'); });

/* ---------------- virtual assistant ---------------- */
const CHATS = {}; let PERSONA = 'citizen';
function md(text) {
  const inline = (s) => maskHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1<i class="muted">$2</i>');
  let out = '', inList = false;
  for (const raw of String(text).split('\n')) {
    const li = raw.match(/^\s*-\s+(.*)$/);
    if (li) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${inline(li[1])}</li>`; continue; }
    if (inList) { out += '</ul>'; inList = false; }
    if (raw.trim()) out += `<p>${inline(raw.trim())}</p>`;
  }
  return out + (inList ? '</ul>' : '');
}
RENDER.assistant = async () => {
  const el = $('#page-assistant');
  const tools = await api(`/api/tenants/${T.id}/tools`), live = tools.filter((x) => x.kind === 'live'), kn = tools.find((x) => x.kind === 'knowledge');
  const personas = live.length ? (META?.personas || []) : [];
  if (live.length && !personas.find((p) => p.id === PERSONA)) PERSONA = 'citizen';
  const key = T.id + '/' + (live.length ? PERSONA : 'staff'), chat = (CHATS[key] ||= []);
  const p = personas.find((x) => x.id === PERSONA);
  const prompts = live.length ? [...(p?.prompts || []).slice(0, 4), ...(T.questions || []).slice(0, 2)] : (T.questions || []);
  el.innerHTML = `
    ${personas.length ? `<div class="personas">${personas.map((x) => `<div class="pcard ${x.id === PERSONA ? 'on' : ''}" data-persona="${x.id}" style="--pc:${x.color}"><b>${esc(x.name)}</b><div class="muted small">${esc(x.role)}</div><span class="tag">${esc(x.context.channel)}</span></div>`).join('')}</div>` : ''}
    <div class="asst">
      <div class="card chatbox"><div class="head"><h2>${esc(T.solution)}${p ? ` · <span class="muted">${esc(p.name)}</span>` : ''}</h2><span class="small muted">Teras SLM (simulated planner) · tools: ${tools.map((x) => `<code>${esc(x.name)}</code>`).join(' ')}</span></div>
        <div class="msgs" id="msgs">${chat.length ? chat.map((m) => m.role === 'user' ? `<div class="msg user">${esc(m.text)}</div>` : `<div class="msg bot">${md(m.text)}${m.meta ? `<div class="meta-l">${m.meta}</div>` : ''}</div>`).join('')
          : `<div class="msg bot"><p>Selamat datang! I'm the ${esc(T.solution)} on <b>Teras AI</b>. ${live.length ? 'I can look up vehicles, licences and summons live from JPJ\'s IBM P-Series through Boomi, and search counter feedback.' : `I answer from ${esc(T.name)}'s knowledge, ingested and PII-masked by Boomi.`}</p><p class="muted small">Every tool call runs on the <b>${window.RT === 'onprem' ? 'on-prem' : 'cloud'}</b> Boomi runtime selected at the top.</p></div>`}</div>
        <div class="sugg">${prompts.map((q) => `<button>${esc(q)}</button>`).join('')}</div>
        <div class="ask"><input id="aq" placeholder="Ask in English or Bahasa Melayu…"><button class="btn" id="aGo">Send</button></div></div>
      <div class="card tracebox"><div class="head"><h2>Tool trace</h2><span class="muted small">what the assistant called, and what Boomi did</span></div><div id="trace">${chat.length && chat[chat.length - 1].calls ? chat[chat.length - 1].calls.map(callCard).join('') : '<div class="empty">Ask a question to see the Boomi tool calls.</div>'}</div></div>
    </div>`;
  $$('.pcard', el).forEach((c) => (c.onclick = () => { PERSONA = c.dataset.persona; RENDER.assistant(); }));
  $$('.sugg button', el).forEach((b) => (b.onclick = () => ask(b.textContent)));
  $('#aGo').onclick = () => ask($('#aq').value);
  $('#aq').onkeydown = (e) => { if (e.key === 'Enter') ask($('#aq').value); };
  $('#msgs').scrollTop = 1e9;
  async function ask(q) {
    q = q.trim(); if (!q) return;
    chat.push({ role: 'user', text: q }); $('#aq').value = '';
    $('#msgs').insertAdjacentHTML('beforeend', `<div class="msg user">${esc(q)}</div><div class="msg bot typing" id="typing">Planning tool calls → Boomi on the ${window.RT === 'onprem' ? 'on-prem' : 'cloud'} runtime…</div>`); $('#msgs').scrollTop = 1e9;
    $('#trace').innerHTML = '<div class="empty">Calling Boomi tools…</div>';
    try {
      const r = await api(`/api/tenants/${T.id}/agent`, { method: 'POST', body: JSON.stringify({ message: q, persona: PERSONA }) });
      const names = [...new Set((r.calls || []).map((c) => c.toolName))];
      chat.push({ role: 'bot', text: r.answer, calls: r.calls, meta: `${names.map((n) => `<code>${esc(n)}</code>`).join(' ')} · ${secs(r.totalMs)} · ${window.rtBadge(r.runtime)}` });
    } catch (e) { chat.push({ role: 'bot', text: '⚠️ ' + e.message }); }
    RENDER.assistant();
  }
};

/* ---------------- Part 3: sovereign runtimes ---------------- */
function drawRuntimeCards() {
  const box = $('#rtCards'); if (!box) return;
  box.innerHTML = (window.HEALTH?.runtimes || []).map((r) => {
    const st = RUNTIME_STATUS[r.id] || {};
    return `<div class="card rtcard ${r.id} ${r.id === window.RT ? 'cur' : ''}">
      <div class="head"><h2>${r.id === 'onprem' ? '🏠' : '☁'} ${esc(r.label)} <span class="muted small">${esc(r.name)}</span></h2><span class="live ${st.reachable ? 'Live' : 'Simulated'}">${st.reachable ? 'Online' : st.detail ? 'Unreachable' : 'Checking…'}</span></div>
      <div class="kv2"><span>Type</span><b>${esc(r.kind)}</b></div>
      <div class="kv2"><span>Endpoint</span><b>${esc(r.host || 'not reachable from this deployment')}</b></div>
      <div class="kv2"><span>Network</span><b>${esc(r.network)}</b></div>
      <div class="kv2"><span>Health</span><b>${esc(st.detail || '')}${st.ms ? ` · ${st.ms} ms` : ''}${r.relayed ? ' · via Teras Connect gateway' : ''}</b></div>
      <div class="kv2"><span>Listeners</span><b>${r.id === 'onprem' ? '/ws/simple/executeTeras{Vehicle|Licence|Summons}, /ws/simple/createArasIngest' : '/ws/rest/teras/v1/{vehicle|licence|summons}, /ws/rest/aras/v1/ingest'}</b></div>
      <button class="btn sm ${r.id === window.RT ? '' : 'ghost'}" data-use="${r.id}" ${r.available ? '' : 'disabled'}>${r.id === window.RT ? '✔ Selected for this console' : 'Use this runtime'}</button></div>`;
  }).join('');
  $$('[data-use]', box).forEach((b) => (b.onclick = () => { window.RT = b.dataset.use; localStorage.setItem('teras-rt', window.RT); drawSwitch(); RENDER.sovereign(); }));
}
RENDER.sovereign = () => {
  const el = $('#page-sovereign');
  el.innerHTML = `
    <div class="head"><div><h2 style="font-size:17px">Sovereign scaffolding - one build, two runtimes</h2><div class="muted small">The same Boomi processes are deployed to an on-premise runtime inside the firewall and to a Boomi cloud runtime (one environment, one package). Switch at the top and every call from this console moves.</div></div></div>
    <div class="grid2" id="rtCards"></div>
    <div class="card"><div class="head"><div><h2>Same tool call, both runtimes</h2><div class="muted small">Calls <code>jpj_vehicle_lookup</code> on the on-prem and the cloud runtime at the same time. Watch where it ran and how it reached the IBM i.</div></div>
      <div class="f-row" style="flex:none"><input id="cmpKey" value="BKT 5521" style="width:130px"><button class="btn" id="cmpGo">Run on both</button></div></div><div id="cmpOut" class="grid2"></div></div>
    <div class="card"><h2>Teras target architecture</h2>
      <div class="sarch">
        <div class="szone cloudz"><div class="zt">Boomi Enterprise Platform · control plane</div><div class="zb">Build · deploy · monitor · API management. Receives designs and runtime health, not JPJ data.</div></div>
        <div class="fwall"><span>Public firewall · on-prem runtime connects <b>outbound only</b> (HTTPS 443)</span></div>
        <div class="szone sovz"><div class="zt">MTAI sovereign zone · Teras AI (on-premise, NVIDIA clusters)</div>
          <div class="sflow"><div class="sn legacy"><b>JPJ IBM Power9</b><span>IBM i 7.4 · DB2 for i<br>VEHMST · LICMST · SUMMST</span></div><div class="sa">→</div>
            <div class="sn boomi"><b>Boomi on-prem runtime</b><span>guru-mac-mcp (Atom)<br>normalise → keyed read → cleanse → govern → audit</span></div><div class="sa">→</div>
            <div class="sn tools"><b>Governed agent tools</b><span>jpj_vehicle_lookup · jpj_licence_status · jpj_summons_check · knowledge_search</span></div><div class="sa">→</div>
            <div class="sn slm"><b>Aras SLM + virtual assistant</b><span>sovereign small language model, tool calling, RAG</span></div></div></div>
        <div class="szone pubz"><div class="zt">Boomi cloud runtime (public cloud)</div><div class="zb">Same package. Reaches the IBM i only through the IBM i HTTP gateway - suitable for non-sensitive or public data.</div></div>
      </div></div>
    <div class="grid3">
      <div class="card"><h3>🏠 Runtime where the data lives</h3><p class="small">Boomi runtimes (Atom, or a Molecule cluster for HA) on MTAI-managed VMs or Kubernetes next to the NVIDIA clusters and SLMs. Integrations execute there; the IBM P-Series is reached on the internal network.</p></div>
      <div class="card"><h3>↗ Outbound-only connectivity</h3><p class="small">The runtime initiates HTTPS to the Boomi platform for deployments and monitoring - no inbound openings for management. The tools the assistant calls are served from inside the zone.</p></div>
      <div class="card"><h3>🔐 Data stays in the zone</h3><p class="small">Documents are processed by the local runtime. Process logging and document retention can be tuned (e.g. purge data immediately) so payloads are not kept - confirm settings against the data-residency policy.</p></div>
      <div class="card"><h3>🧭 Policy at the edge of the data</h3><p class="small">Context (channel, requester, purpose) is enforced in the runtime before data reaches any model. The SLM only receives cleansed, minimised, policy-approved records.</p></div>
      <div class="card"><h3>🔑 Secrets stay local</h3><p class="small">Connection credentials are encrypted in Boomi (connection components / environment extensions) and used only by the runtime - never stored in the portal or seen by the SLM. The IBM i token in this demo is held only by Boomi.</p></div>
      <div class="card"><h3>🧾 Audit every call</h3><p class="small">Each tool call logs runtime, channel, officer, purpose, key, decision and masked fields; executions appear in Boomi process reporting.</p></div>
    </div>
    <p class="muted small">Demo note: the IBM P-Series is simulated (fictitious records); the on-prem runtime is a Boomi Atom in Docker on the presenter's laptop; the "Teras SLM" planner is a rule-based stand-in. In production the runtime runs on MTAI infrastructure.</p>`;
  drawRuntimeCards(); probeRuntimes();
  $('#cmpGo').onclick = async () => {
    const k = $('#cmpKey').value.trim(), query = /^\d{6}-?\d{2}-?\d{4}$/.test(k) ? { ic: k } : { plate: k };
    $('#cmpOut').innerHTML = '<div class="empty">Calling both runtimes…</div><div></div>';
    try { const r = await api('/api/compare-runtimes', { method: 'POST', body: JSON.stringify({ tool: 'vehicle', query, persona: 'officer' }) });
      $('#cmpOut').innerHTML = r.results.map((c) => `<div><h3>${window.rtBadge(c.runtime)}</h3>${callCard(c)}</div>`).join(''); }
    catch (e) { $('#cmpOut').innerHTML = `<div class="card">${esc(e.message)}</div>`; }
  };
};

/* overview: add the tools + runtime facts */
const _overview = RENDER.overview;
RENDER.overview = async () => {
  await _overview();
  const el = $('#page-overview'), tools = await api(`/api/tenants/${T.id}/tools`).catch(() => []);
  const live = tools.filter((x) => x.kind === 'live');
  el.insertAdjacentHTML('afterbegin', `<div class="flowbar">${[['connections', '1', 'Connect', 'Reuse connectors from the library'], ['mapping', '2', 'Map', 'Shape fields, mask PII'], ['run', '3', 'Run', 'Boomi pulls & cleanses'],
    ['tools', '4', 'Publish tools', `${live.length} live + knowledge`], ['assistant', '5', 'Ask', 'Virtual assistant'], ['sovereign', '⛨', 'Runtime', window.RT === 'onprem' ? 'On-prem (sovereign)' : 'Boomi cloud']]
    .map(([pg, n, t, s]) => `<div class="fb" data-go="${pg}"><span class="fbn">${n}</span><div><b>${t}</b><small>${esc(s)}</small></div></div>`).join('<span class="fba">›</span>')}</div>`);
  $$('.flowbar [data-go]', el).forEach((b) => (b.onclick = () => go(b.dataset.go)));
};

/* ---------------- assistant engine: local "Teras SLM" planner or the Boomi Agentstudio agent ---------------- */
let ENGINE = localStorage.getItem('teras-engine') || 'teras';
const AS_CHATS = {};
const _assistant = RENDER.assistant;
RENDER.assistant = async () => {
  const as = window.HEALTH?.agentstudio || {}, can = T.id === (as.tenant || 'jpj');
  if (ENGINE === 'agentstudio' && can && as.ready) await renderAgentstudio(as); else await _assistant();
  if (!can) return;
  $('#page-assistant').insertAdjacentHTML('afterbegin', `<div class="engine-bar"><span class="rt-l">Assistant engine</span>
    <button class="eng ${ENGINE !== 'agentstudio' || !as.ready ? 'on' : ''}" data-eng="teras" title="Rule-based stand-in for Aras Integrasi's sovereign SLM; runs on the runtime selected at the top (on-prem or cloud)">✦ Teras SLM <small>local planner · on-prem or cloud</small></button>
    <button class="eng as ${ENGINE === 'agentstudio' && as.ready ? 'on' : ''}" data-eng="agentstudio" ${as.ready ? '' : 'disabled'} title="${as.ready ? 'Boomi Agentstudio agent - runs in the Boomi cloud; its tools call the Boomi cloud runtime' : 'Not configured: ' + esc((as.missing || []).join(', '))}">◆ Boomi Agentstudio <small>${esc(as.agent || 'agent')} · cloud</small></button></div>`);
  $$('[data-eng]').forEach((b) => (b.onclick = () => { ENGINE = b.dataset.eng; localStorage.setItem('teras-engine', ENGINE); RENDER.assistant(); }));
};
async function renderAgentstudio(as) {
  const el = $('#page-assistant'), st = (AS_CHATS[T.id] ||= { sessionId: null, msgs: [] });
  const prompts = ['Can the owner of WXY 1234 renew road tax?', 'Full check on 780115-08-5011', 'Licence status for the owner of WTT 1', 'Any outstanding summons for 850412-10-5523?'];
  const last = [...st.msgs].reverse().find((m) => m.role === 'bot' && m.events);
  el.innerHTML = `<div class="asst">
    <div class="card chatbox"><div class="head"><h2>◆ ${esc(as.agent)} <span class="muted small">Boomi Agentstudio</span></h2><button class="btn ghost sm" id="asNew">New conversation</button></div>
      <div class="msgs" id="msgs">${st.msgs.length ? st.msgs.map((m) => m.role === 'user' ? `<div class="msg user">${esc(m.text)}</div>` : `<div class="msg bot">${md(m.text)}${m.meta ? `<div class="meta-l">${m.meta}</div>` : ''}</div>`).join('')
        : `<div class="msg bot"><p>This conversation is handled by a <b>Boomi Agentstudio</b> agent. Its three tools are the same governed Boomi APIs (vehicle, licence, summons) - the counter-officer context is fixed inside each tool, so the model cannot change who it is acting for.</p><p class="muted small">Agentstudio runs in the Boomi cloud, so its tools use the <b>Boomi cloud runtime</b>. For data that must stay in the sovereign zone, use the Teras SLM engine on the on-prem runtime.</p></div>`}</div>
      <div class="sugg">${prompts.map((q) => `<button>${esc(q)}</button>`).join('')}</div>
      <div class="ask"><input id="aq" placeholder="Ask the Agentstudio agent…"><button class="btn" id="aGo">Send</button></div></div>
    <div class="card tracebox"><div class="head"><h2>Agent trace</h2><span class="muted small">Agentstudio session and events</span></div><div id="trace">${last ? asTrace(last) : '<div class="empty">Ask a question to see the Agentstudio session.</div>'}</div></div></div>`;
  $$('.sugg button', el).forEach((b) => (b.onclick = () => ask(b.textContent)));
  $('#aGo').onclick = () => ask($('#aq').value);
  $('#aq').onkeydown = (e) => { if (e.key === 'Enter') ask($('#aq').value); };
  $('#asNew').onclick = () => { AS_CHATS[T.id] = { sessionId: null, msgs: [] }; RENDER.assistant(); };
  $('#msgs').scrollTop = 1e9;
  async function ask(q) {
    q = q.trim(); if (!q) return;
    st.msgs.push({ role: 'user', text: q }); $('#aq').value = '';
    $('#msgs').insertAdjacentHTML('beforeend', `<div class="msg user">${esc(q)}</div><div class="msg bot typing" id="typing">Agentstudio agent is thinking and calling Boomi tools…</div>`); $('#msgs').scrollTop = 1e9;
    $('#trace').innerHTML = '<div class="empty">Waiting for the Agentstudio session…</div>';
    try {
      const r = await api(`/api/tenants/${T.id}/agentstudio`, { method: 'POST', body: JSON.stringify({ message: q, sessionId: st.sessionId }) });
      st.sessionId = r.sessionId || st.sessionId;
      st.msgs.push({ role: 'bot', text: r.answer, events: r.events, ms: r.ms, sessionId: st.sessionId, meta: `◆ Boomi Agentstudio · ${secs(r.ms)} · ${window.rtBadge('cloud')}` });
    } catch (e) { st.msgs.push({ role: 'bot', text: '⚠️ ' + e.message }); }
    RENDER.assistant();
  }
}
function asTrace(m) {
  const ev = m.events || [], counts = {};
  ev.forEach((e) => (counts[e.event] = (counts[e.event] || 0) + 1));
  const show = ev.filter((e) => e.event !== 'message' || typeof e.data !== 'object' || Object.keys(e.data || {}).some((k) => k !== 'content' && k !== 'session_id'));
  return `<div class="call"><div class="call-h"><span class="tn">Agentstudio session</span><span class="dbadge d-ALLOW">${ev.length} events</span>${window.rtBadge('cloud')}<span class="ms">${secs(m.ms)}</span></div>
    <div class="steps">
      <div class="step-r"><span class="n">1</span><div><b>Execute API</b> <code>POST /execute/api/v1/{account}/session</code><br>session <code>${esc(m.sessionId || '-')}</code></div></div>
      <div class="step-r cl"><span class="n">2</span><div><b>Agent reasoning + tool calls</b> - each tool calls <code>/ws/rest/teras/v1/*</code> on the Boomi cloud runtime
        <ol class="astl">${ev.filter((e) => e.event === 'progress_notification' && e.data?.content && e.data.content !== 'Thinking' && e.data.type !== 'GENERATING_TITLE')
          .map((e) => `<li class="${e.data.type === 'ACTION' ? 'act' : ''}">${e.data.type === 'ACTION' ? '⚒ ' : '💭 '}${esc(e.data.content)}</li>`).join('') || '<li>No intermediate steps reported</li>'}</ol>
        <div class="tags">${Object.entries(counts).map(([k, v]) => `<span class="tag">${esc(k)} × ${v}</span>`).join('')}</div></div></div>
      <div class="step-r gov"><span class="n">3</span><div><b>Governed by Boomi</b> - each tool call goes through the same cleanse-on-input and counter-officer policy as the Teras tools.</div></div>
    </div>
    ${show.length ? `<span class="json-toggle" data-json="asev">{ } stream events (${show.length})</span><pre class="json-pre" id="asev">${esc(show.map((e) => `event: ${e.event}\n${typeof e.data === 'string' ? e.data : JSON.stringify(e.data, null, 1)}`).join('\n\n').slice(0, 12000))}</pre>` : ''}</div>`;
}

/* ---------------- lineage stage 0 for IBM P-Series: the fixed-width record and its field-by-field transformation ---------------- */
const RAW_MAP = {
  VEHMST: { key: (l) => l.slice(0, 10).trim(), recKey: (r) => String(r.plate || '').replace(/\s/g, ''),
    fields: { PLATE: ['plate', 'trim padding · plate format'], CHASSIS: ['chassis', 'trim padding'], MAKE: ['make', 'trim · title case'], MODEL: ['model', 'trim padding'],
      MFGYR: ['year', 'text → number'], COLOUR: ['colour', 'code decode (Malay → English)'], OWNIC: ['owner_ic', 'MyKad format'], OWNNM: ['owner_name', 'collapse spaces · name case'],
      RTXEXP: ['road_tax_expiry', 'CYYMMDD → ISO date'], INSEXP: ['insurance_expiry', 'CYYMMDD → ISO date'], VSTAT: ['status', 'code decode'], BLKLST: ['blacklisted', 'Y/N → boolean'], VCLASS: ['vehicle_class', 'code decode'] },
    derived: [['road_tax_valid', 'expiry ≥ today'], ['road_tax_days_left', 'days until expiry'], ['insurance_valid', 'expiry ≥ today']] },
  LICMST: { key: (l) => l.slice(0, 12), recKey: (r) => String(r.ic || '').replace(/\D/g, ''),
    fields: { ICNO: ['ic', 'MyKad format'], LNAME: ['name', 'collapse spaces · name case'], DOB: ['date_of_birth', 'CYYMMDD → ISO date'], LTYPE: ['licence_type_desc', 'code decode'],
      LCLASS: ['classes', 'split into a list'], LEXP: ['expiry', 'CYYMMDD → ISO date'], KEJARA: ['demerit_points', 'text → number'], LSTAT: ['status', 'code decode · reconciled with expiry'],
      ADDR: ['address', 'collapse spaces · state names'], PHONE: ['phone', 'Malaysian mobile → +60 format'] },
    derived: [['days_to_expiry', 'days until expiry'], ['expiring_soon', 'expires within 60 days'], ['demerit_limit', 'KEJARA limit']] },
  SUMMST: { key: (l) => l.slice(0, 12).trim(), recKey: (r) => String(r.summons_no || ''),
    fields: { SUMNO: ['summons_no', 'trim padding'], ICNO: ['ic', 'MyKad format'], PLATE: ['plate', 'trim padding · plate format'], OFFCD: ['offence', 'offence code → description'],
      OFFDT: ['offence_date', 'CYYMMDD → ISO date'], LOCN: ['location', 'trim · title case'], AMT: ['amount_rm', 'implied 2 decimals → RM'], SSTAT: ['status', 'code decode'] },
    derived: [['offence_code', 'kept for reference'], ['payable_online', 'status = Outstanding']] },
};
const RAW_CACHE = {};
const showPad = (v) => esc(v).replace(/ /g, '<span class="pad">·</span>');
const _renderLineage = renderLineage;
renderLineage = function (boxId, c, res, mapping = {}, policy = {}, tab = 'source', rec = 0) {
  if (c?.type !== 'IBM_PSERIES') return _renderLineage(boxId, c, res, mapping, policy, tab, rec);
  const first = !LIN[boxId] || LIN[boxId].res !== res;
  if (first && tab === 'source') tab = 'raw';   // IBM runs open on the raw record
  if (tab !== 'raw') { _renderLineage(boxId, c, res, mapping, policy, tab, rec); addRawTab(boxId, c, res, mapping, policy, rec); return; }
  _renderLineage(boxId, c, res, mapping, policy, 'source', rec);   // keeps lineage state + tab strip
  addRawTab(boxId, c, res, mapping, policy, rec, true);
  drawRaw(boxId, c, res, mapping, policy, rec);
};
function addRawTab(boxId, c, res, mapping, policy, rec, active) {
  const box = document.getElementById(boxId); if (!box) return;
  const strip = $('.lin-tabs', box); if (!strip || $('[data-rawtab]', strip)) return;
  strip.insertAdjacentHTML('afterbegin', `<button class="lin-tab ${active ? 'active' : ''}" data-rawtab="1">0 · Raw IBM i record <span class="cnt">fixed-width</span></button><span class="lin-arrow">›</span>`);
  if (active) $$('.lin-tab', strip).forEach((b) => { if (!b.dataset.rawtab) b.classList.remove('active'); });
  $('[data-rawtab]', strip).onclick = () => renderLineage(boxId, c, res, mapping, policy, 'raw', rec);
}
async function drawRaw(boxId, c, res, mapping, policy, rec) {
  const box = document.getElementById(boxId), body = box && $('.lin-body', box); if (!body) return;
  const file = String(c.config?.file || 'VEHMST').toUpperCase(), M = RAW_MAP[file];
  body.innerHTML = '<div class="empty">Reading the raw IBM i file…</div>';
  const raw = RAW_CACHE[file] ||= await api('/api/legacy?file=' + file);
  const L = raw.layout, lines = raw.lines, sample = res.sample || [];
  const i = Math.min(rec, lines.length - 1), line = lines[i];
  const cleaned = sample.find((r) => M.recKey(r) === M.key(line)) || null;
  const masked = new Set(policy.maskFields || []);
  const ruler = Array.from({ length: L.recordLength }, (_, k) => ((k + 1) % 10 === 0 ? String(((k + 1) / 10) % 10) : (k + 1) % 5 === 0 ? '+' : '.')).join('');
  const segs = L.fields.map((f, n) => `<span class="seg s${n % 6}" data-f="${esc(f.name)}" title="${esc(f.name)} · positions ${f.from}-${f.to} · ${esc(f.description)}">${esc(line.slice(f.from - 1, f.to).padEnd(f.length, ' '))}</span>`).join('');
  const val = (v) => (v === null || v === undefined || v === '' ? null : Array.isArray(v) ? JSON.stringify(v) : String(v));   // AI data prep sends nulls as ""
  const rows = L.fields.map((f, n) => {
    const [k, rule] = M.fields[f.name] || ['', ''], r = line.slice(f.from - 1, f.to), out = cleaned ? val(cleaned[k]) : undefined;
    const blank = /^0+$/.test(r.trim()) && out === null;
    return `<tr data-f="${esc(f.name)}"><td><span class="swatch s${n % 6}"></span><b>${esc(f.name)}</b><div class="muted small">${esc(f.description)}</div></td><td class="pos">${f.from}-${f.to}<div class="muted small">${f.length} chars</div></td>
      <td class="rawv">${showPad(r)}</td><td class="arrow">→</td>
      <td class="clv">${out === undefined ? '<i class="muted">run to see</i>' : out === null ? `<span class="nullv">null</span>${blank ? ' <span class="badge b-pii">⚠ blank in source</span>' : ''}` : esc(out)}${masked.has(k) ? ' <span class="badge b-pii">PII · masked later</span>' : ''}</td>
      <td><code>${esc(k)}</code></td><td class="small">${esc(rule)}</td></tr>`;
  }).join('') + M.derived.filter(([k]) => cleaned && k in cleaned).map(([k, rule]) => `<tr class="drv"><td><b>derived</b><div class="muted small">computed by Boomi</div></td><td class="pos">-</td><td class="rawv">-</td><td class="arrow">→</td><td class="clv">${esc(val(cleaned[k]))}</td><td><code>${esc(k)}</code></td><td class="small">${esc(rule)}</td></tr>`).join('');
  body.innerHTML = `
    <div class="head" style="margin-bottom:8px"><p class="muted small" style="margin:0">What the IBM P-Series returned for <b>JPJPRD/${esc(file)}</b>: one ${L.recordLength}-character line per record, no field names. Boomi's <b>Cleanse on input</b> step cuts it by the file layout and standardises each value. Hover a segment or a row to link them.</p>
      <select data-rawrec>${lines.map((l, n) => `<option value="${n}" ${n === i ? 'selected' : ''}>Record ${n + 1} · ${esc(M.key(l))}</option>`).join('')}</select></div>
    <div class="green rawrec"><div class="hdr">DSPPFM FILE(JPJPRD/${esc(file)})  record ${i + 1} of ${lines.length}  ·  length ${L.recordLength}</div><div class="ruler">${ruler}</div><div class="ln">${segs}</div></div>
    <div class="wrap mt"><table class="t rawmap"><tr><th>Field (DDS layout)</th><th>Positions</th><th>Raw value as stored</th><th></th><th>Cleansed by Boomi</th><th>JSON field</th><th>Rule</th></tr>${rows}</table></div>
    <p class="muted small mt">· marks padding spaces in the fixed-width record. ${cleaned ? 'Next tab: these cleansed fields are what the customer mapping works on.' : 'This record was not in the last Boomi result - run the connection to see the cleansed values.'}</p>`;
  $('[data-rawrec]', body).onchange = (e) => renderLineage(boxId, c, res, mapping, policy, 'raw', Number(e.target.value));
  const link = (name, on) => $$(`[data-f="${CSS.escape(name)}"]`, body).forEach((x) => x.classList.toggle('hl', on));
  $$('[data-f]', body).forEach((x) => { x.onmouseenter = () => link(x.dataset.f, true); x.onmouseleave = () => link(x.dataset.f, false); });
}
