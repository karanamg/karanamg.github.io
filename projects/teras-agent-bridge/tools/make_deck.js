// Teras Connect workshop deck (Aras Integrasi x MTAI x Boomi, 24 Nov 2026) - same visual language as the Integrasi Connect deck.
// node tools/make_deck.js   (needs pptxgenjs: NODE_PATH=/Users/guru/Claude-Guru/tools-local/node/node_modules)
const path = require('path');
const PptxGenJS = require(process.env.PPTXGEN || '/Users/guru/Claude-Guru/tools-local/node/node_modules/pptxgenjs');
const A = (f) => path.join('/Users/guru/Claude-Guru/docs/arasdemo/deck-assets', f);
const OUT = process.env.OUT || '/Users/guru/Claude-Guru/docs/arasdemo/Teras-Connect-Aras-Integrasi.pptx';

const C = { navy: '0B1B33', navy2: '12284A', teal: '0D9488', tealSoft: 'CCFBF1', blue: '1D4ED8', blueSoft: 'DBEAFE', violet: '7C3AED', violetSoft: 'EDE9FE',
  red: 'DC2626', redSoft: 'FEE2E2', amber: 'D97706', amberSoft: 'FEF3C7', ink: '0F172A', ink2: '475569', muted: '94A3B8', line: 'E2E8F0', card: 'F8FAFC', white: 'FFFFFF', green: '16A34A' };
const F = 'Arial';
const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';   // 13.33 x 7.5 in
pptx.author = 'Boomi Solution Engineering'; pptx.title = 'Teras Connect - Aras Integrasi x MTAI x Boomi';
let page = 0;
const ONLY = process.env.ONLY ? Number(process.env.ONLY) : 0;
const want = (n) => { if (ONLY && ONLY !== n) return false; page = n - 1; return true; };

function content(kicker, title) {
  const s = pptx.addSlide(); page++;
  s.background = { color: C.white };
  s.addText(kicker.toUpperCase(), { x: 0.6, y: 0.35, w: 12, h: 0.3, fontFace: F, fontSize: 12, bold: true, color: C.teal, charSpacing: 3 });
  s.addText(title, { x: 0.6, y: 0.68, w: 12.2, h: 0.75, fontFace: F, fontSize: 30, bold: true, color: C.ink });
  s.addText('Teras Connect · Aras Integrasi × MTAI · Powered by Boomi', { x: 0.6, y: 7.05, w: 8, h: 0.25, fontFace: F, fontSize: 9, color: C.muted });
  s.addText(String(page), { x: 12.2, y: 7.05, w: 0.6, h: 0.25, fontFace: F, fontSize: 9, color: C.muted, align: 'right' });
  return s;
}
const box = (s, x, y, w, h, fill, line) => s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: line || fill, width: 1 }, rectRadius: 0.12 });
const txt = (s, t, o) => s.addText(t, { fontFace: F, color: C.ink, valign: 'top', margin: 0, ...o });
function numbered(s, items, x, y, w, gap = 1.12) {
  items.forEach(([t, d, col], i) => {
    s.addShape(pptx.ShapeType.ellipse, { x, y: y + i * gap, w: 0.5, h: 0.5, fill: { color: col || C.blue }, line: { color: col || C.blue } });
    txt(s, String(i + 1), { x, y: y + i * gap + 0.08, w: 0.5, h: 0.34, fontSize: 15, bold: true, color: C.white, align: 'center' });
    txt(s, t, { x: x + 0.7, y: y + i * gap - 0.02, w: w - 0.7, h: 0.36, fontSize: 16, bold: true });
    txt(s, d, { x: x + 0.7, y: y + i * gap + 0.36, w: w - 0.7, h: 0.6, fontSize: 12, color: C.ink2 });
  });
}
const shot = (s, file, x, y, w, h, opt = {}) => { s.addShape(pptx.ShapeType.roundRect, { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, fill: { color: C.white }, line: { color: C.line, width: 1 }, rectRadius: 0.08, shadow: { type: 'outer', blur: 6, offset: 2, angle: 90, color: '000000', opacity: 0.12 } }); s.addImage({ path: A(file), x, y, w, h, ...opt }); };

/* 1 - title */
if (want(1)) {
  const s = pptx.addSlide(); page++;
  s.background = { color: C.navy };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: C.teal }, line: { color: C.teal } });
  [['Aras Integrasi', C.navy2, 1.0, 1.75], ['MTAI', C.navy2, 2.9, 0.95], ['Boomi', C.blue, 4.0, 1.05]].forEach(([t, col, x, w]) => {
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.05, w, h: 0.42, fill: { color: col }, line: { color: col }, rectRadius: 0.21 });
    txt(s, t, { x, y: 1.12, w, h: 0.3, fontSize: 13, bold: true, color: C.white, align: 'center' });
  });
  txt(s, 'Teras Connect', { x: 1.0, y: 1.9, w: 8, h: 1.1, fontSize: 60, bold: true, color: C.white });
  txt(s, 'From any system to governed AI tools', { x: 1.0, y: 3.05, w: 8, h: 0.5, fontSize: 26, color: 'C7D2E3' });
  txt(s, [{ text: 'Sovereign by design · Powered by ', options: { color: '94A3B8' } }, { text: 'Boomi', options: { color: '60A5FA', bold: true } }], { x: 1.0, y: 3.62, w: 8, h: 0.45, fontSize: 22 });
  [['🗄', 'Any system', '1E293B', 8.0], ['⚙', 'Boomi', C.blue, 9.75], ['🤖', 'Teras AI', C.violet, 11.5]].forEach(([e, t, col, x], i) => {
    s.addShape(pptx.ShapeType.ellipse, { x, y: 2.75, w: 1.35, h: 1.35, fill: { color: col }, line: { color: '334155' } });
    txt(s, e, { x, y: 3.08, w: 1.35, h: 0.7, fontSize: 32, align: 'center', color: C.white });
    txt(s, t, { x: x - 0.3, y: 4.25, w: 1.95, h: 0.35, fontSize: 13, bold: true, color: 'CBD5E1', align: 'center' });
    if (i < 2) s.addShape(pptx.ShapeType.rightArrow, { x: x + 1.42, y: 3.3, w: 0.28, h: 0.25, fill: { color: '64748B' }, line: { color: '64748B' } });
  });
  txt(s, 'Boomi OEM workshop · 24 November 2026', { x: 1.0, y: 6.6, w: 8, h: 0.35, fontSize: 14, color: '94A3B8' });
}

/* 2 - challenge */
if (want(2)) {
  const s = content('The challenge', 'Sovereign AI is stuck behind fragmented systems');
  [['🏭', 'SAP · Oracle · ERP', 'Enterprise systems in every Aras vertical'], ['☁', 'Salesforce · SaaS apps', 'Cases, customers, service data'], ['🗄', 'Mainframes - e.g. IBM P-Series', 'IBM i / DB2 files at the "J" departments'], ['📄', 'Files, databases & government APIs', 'CSV exports, data.gov.my, agency services']].forEach(([e, t, d], i) => {
    box(s, 0.6, 1.62 + i * 0.86, 5.2, 0.76, C.card, C.line);
    txt(s, e, { x: 0.8, y: 1.76 + i * 0.86, w: 0.6, h: 0.5, fontSize: 21 });
    txt(s, t, { x: 1.5, y: 1.7 + i * 0.86, w: 4.2, h: 0.32, fontSize: 14, bold: true });
    txt(s, d, { x: 1.5, y: 2.02 + i * 0.86, w: 4.2, h: 0.3, fontSize: 10.5, color: C.ink2 });
  });
  s.addShape(pptx.ShapeType.ellipse, { x: 6.55, y: 2.35, w: 1.5, h: 1.5, fill: { color: C.redSoft }, line: { color: C.redSoft } });
  txt(s, '?', { x: 6.55, y: 2.55, w: 1.5, h: 1.0, fontSize: 54, bold: true, color: C.red, align: 'center' });
  s.addShape(pptx.ShapeType.rightArrow, { x: 5.95, y: 2.95, w: 0.5, h: 0.3, fill: { color: 'CBD5E1' }, line: { color: 'CBD5E1' } });
  s.addShape(pptx.ShapeType.rightArrow, { x: 8.2, y: 2.95, w: 0.5, h: 0.3, fill: { color: 'CBD5E1' }, line: { color: 'CBD5E1' } });
  s.addShape(pptx.ShapeType.ellipse, { x: 8.9, y: 2.15, w: 1.9, h: 1.9, fill: { color: C.violetSoft }, line: { color: C.violetSoft } });
  txt(s, '🤖', { x: 8.9, y: 2.6, w: 1.9, h: 0.9, fontSize: 40, align: 'center' });
  txt(s, 'Sovereign SLM + virtual assistant', { x: 8.4, y: 4.15, w: 2.9, h: 0.6, fontSize: 13, bold: true, color: C.violet, align: 'center' });
  [['🔒', 'Locked, inconsistent data', 'Every source has its own format - from SaaS JSON to fixed-width mainframe records'], ['🛠', 'A project per customer', 'Every new department or customer becomes a bespoke build'], ['🏛', 'Prove it is secure', 'Risk-averse government buyers need evidence, not promises']].forEach(([e, t, d], i) => {
    box(s, 0.6 + i * 4.15, 5.35, 3.95, 1.35, C.redSoft, 'FECACA');
    txt(s, e, { x: 0.8 + i * 4.15, y: 5.6, w: 0.6, h: 0.6, fontSize: 24 });
    txt(s, t, { x: 1.45 + i * 4.15, y: 5.5, w: 3.0, h: 0.35, fontSize: 15, bold: true, color: '7F1D1D' });
    txt(s, d, { x: 1.45 + i * 4.15, y: 5.88, w: 3.0, h: 0.7, fontSize: 11, color: '7F1D1D' });
  });
}

/* 3 - the solution */
if (want(3)) {
  const s = content('The use case: Teras Connect', 'Legacy and enterprise data, served to AI as governed tools');
  const col = (x, title, tcol, fill, items) => {
    box(s, x, 1.65, 3.95, 4.55, fill, fill);
    txt(s, title, { x, y: 1.8, w: 3.95, h: 0.4, fontSize: 17, bold: true, color: tcol, align: 'center' });
    items.forEach(([e, t], i) => { box(s, x + 0.25, 2.35 + i * 0.93, 3.45, 0.78, C.white, C.line); txt(s, e, { x: x + 0.42, y: 2.5 + i * 0.93, w: 0.5, h: 0.5, fontSize: 18 }); txt(s, t, { x: x + 1.0, y: 2.55 + i * 0.93, w: 2.6, h: 0.45, fontSize: 14, bold: true }); });
  };
  col(0.6, 'Customer systems', C.ink2, C.card, [['🏭', 'SAP S/4HANA'], ['☁', 'Salesforce'], ['🗄', 'Mainframes (IBM P-Series)'], ['📄', 'Files · databases · data.gov.my']]);
  col(4.69, 'Boomi, embedded', C.blue, C.blueSoft, [['🔌', 'Connect & reuse'], ['🧹', 'Cleanse on input'], ['🧭', 'Govern on output'], ['⚒', 'Expose as agent tools']]);
  col(8.78, 'Teras AI · MTAI GPU', C.violet, C.violetSoft, [['💬', 'Sovereign SLM'], ['🤖', 'Virtual assistants'], ['🧠', 'Knowledge (RAG)'], ['🏛', 'JPJ · JPN · AISLE · TanyaMedik']]);
  s.addShape(pptx.ShapeType.rightArrow, { x: 4.57, y: 3.75, w: 0.3, h: 0.3, fill: { color: '94A3B8' }, line: { color: '94A3B8' } });
  s.addShape(pptx.ShapeType.rightArrow, { x: 8.66, y: 3.75, w: 0.3, h: 0.3, fill: { color: C.blue }, line: { color: C.blue } });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 6.35, w: 12.13, h: 0.55, fill: { color: C.navy }, line: { color: C.navy }, rectRadius: 0.27 });
  txt(s, 'One build  ·  on-prem or cloud runtime  ·  every customer', { x: 0.6, y: 6.45, w: 12.13, h: 0.35, fontSize: 15, bold: true, color: C.white, align: 'center' });
}

/* 4 - how it works */
if (want(4)) {
  const s = content('Part 1 · Soup-to-nuts', 'From a legacy record to an AI answer in six steps');
  const steps = [['🏢', 'Onboard', 'Customer + runtime'], ['🔌', 'Connect', 'Reuse the library'], ['⇄', 'Map', 'Fields, mask PII'], ['🧹', 'Run', 'Fetch & cleanse'], ['⚒', 'Publish', 'Governed tools'], ['💬', 'Ask', 'Virtual assistant']];
  steps.forEach(([e, t, d], i) => {
    const x = 0.55 + i * 2.07, col = i < 5 ? C.blue : C.violet;
    s.addShape(pptx.ShapeType.chevron, { x, y: 1.75, w: 2.2, h: 1.3, fill: { color: col }, line: { color: col } });
    txt(s, e, { x: x + 0.3, y: 1.85, w: 1.6, h: 0.5, fontSize: 22, align: 'center', color: C.white });
    txt(s, t, { x: x + 0.3, y: 2.38, w: 1.6, h: 0.4, fontSize: 16, bold: true, align: 'center', color: C.white });
    txt(s, d, { x: x + 0.15, y: 3.15, w: 1.9, h: 0.35, fontSize: 11, align: 'center', color: C.ink2 });
  });
  s.addShape(pptx.ShapeType.line, { x: 0.85, y: 3.6, w: 9.95, h: 0, line: { color: C.blue, width: 2 } });
  txt(s, 'B o o m i', { x: 0.85, y: 3.68, w: 9.95, h: 0.3, fontSize: 11, bold: true, color: C.blue, align: 'center' });
  s.addShape(pptx.ShapeType.line, { x: 11.0, y: 3.6, w: 1.75, h: 0, line: { color: C.violet, width: 2 } });
  txt(s, 'T e r a s  A I', { x: 11.0, y: 3.68, w: 1.75, h: 0.3, fontSize: 11, bold: true, color: C.violet, align: 'center' });
  [['~1 s', 'governed tool call on the on-prem runtime: read, cleanse, govern, audit (IBM P-Series source)', C.blueSoft, C.blue],
   ['24', 'personal values masked in one vehicle-registry run, before any AI sees the data', C.redSoft, C.red],
   ['0', 'lines of code to onboard a customer onto existing connectors', C.tealSoft, C.teal]].forEach(([v, d, fill, col], i) => {
    box(s, 0.6 + i * 4.15, 4.3, 3.95, 2.1, fill, fill);
    txt(s, v, { x: 0.6 + i * 4.15, y: 4.45, w: 3.95, h: 1.0, fontSize: 52, bold: true, color: col, align: 'center' });
    txt(s, d, { x: 0.85 + i * 4.15, y: 5.5, w: 3.45, h: 0.8, fontSize: 13, align: 'center' });
  });
  txt(s, 'Measured in the live demo (JPJ tenant, on-prem Boomi runtime)', { x: 0.6, y: 6.55, w: 8, h: 0.3, fontSize: 10, italic: true, color: C.muted });
}

/* 5 - onboard & reuse */
if (want(5)) {
  const s = content('Demo', 'Onboard a customer by configuration, not a project');
  shot(s, 'onboard.png', 0.7, 1.6, 5.15, 5.05);
  numbered(s, [['Runtime placement per customer', 'On-premise (sovereign) or Boomi cloud - chosen at onboarding.', C.teal],
    ['Reuse the connection library', 'SAP, Salesforce, mainframes (IBM P-Series), files and open data - built once in Boomi.', C.blue],
    ['Reuse mappings, not just connectors', 'A new department starts from JPJ\'s mapping and PII policy.', C.blue],
    ['Tools published automatically', 'Live sources become agent tools the moment they are added.', C.violet]], 6.6, 1.8, 6.1);
}

/* 6 - cleanse on input */
if (want(6)) {
  const s = content('Demo · cleanse on input · example: IBM P-Series', 'Even a mainframe record becomes clean, typed data');
  s.addImage({ path: A('raw-record.png'), x: 0.7, y: 1.6, w: 7.6, h: 8.435, sizing: { type: 'crop', x: 0, y: 0, w: 7.6, h: 5.15 } });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.64, y: 1.54, w: 7.72, h: 5.27, fill: { type: 'none' }, line: { color: C.line, width: 1 }, rectRadius: 0.06 });
  numbered(s, [['What the mainframe holds', 'One 127-character line per record, padding, no field names.', C.amber],
    ['Cut by the file layout', 'Each field\'s positions come from the IBM i DDS layout.', C.blue],
    ['Standardised in Boomi', 'CYYMMDD → ISO dates, codes decoded, MyKad and plate formats.', C.blue],
    ['Quality issues flagged', 'A blank 0000000 insurance date becomes null, with a warning.', C.red]], 8.75, 1.8, 4.1);
}

/* 7 - governed tools */
if (want(7)) {
  const s = content('Demo · govern on output', 'Context is governance: who asks decides what they see');
  shot(s, 'tools-policy.png', 0.7, 1.6, 8.0, 3.52);
  numbered(s, [['Same tool, different caller', 'Citizen, counter officer, enforcement or AI analytics.', C.teal],
    ['Policy enforced in Boomi', 'Rows filtered, fields masked or withheld, unknown callers refused.', C.amber],
    ['The model can\'t change it', 'The caller context is attached by the platform, not the SLM.', C.red],
    ['Every call audited', 'Runtime, channel, officer, purpose and decision - per execution.', C.violet]], 9.0, 1.8, 3.9);
  box(s, 0.7, 5.4, 8.0, 1.3, C.amberSoft, 'FDE68A');
  txt(s, '“Pharmacy vs nightclub”', { x: 0.95, y: 5.55, w: 7.5, h: 0.35, fontSize: 15, bold: true, color: '92400E' });
  txt(s, 'The same request for vehicle WXY 1234 returns a full record to the counter officer, a masked record to roadside enforcement, a de-identified record to AI analytics - and a refusal to an unregistered chatbot.', { x: 0.95, y: 5.92, w: 7.5, h: 0.75, fontSize: 12, color: '78350F' });
}

/* 8 - virtual assistant */
if (want(8)) {
  const s = content('Demo · end-to-end consumption', 'The virtual assistant calls Boomi tools - and shows its work');
  shot(s, 'assistant.png', 0.7, 1.6, 7.55, 5.17);
  numbered(s, [['Plain-language request', '"Can I renew my road tax?" in English or Bahasa Melayu.', C.violet],
    ['Chained tool calls', 'Vehicle lookup + summons check, live from the source system (here an IBM P-Series).', C.blue],
    ['A governed answer', 'Not yet: 2 outstanding summons (RM600) - with masked personal data.', C.teal],
    ['A full trace', 'Key normalised, SQL, cleansing rules, policy and Boomi execution ID.', C.amber]], 8.7, 1.8, 4.2);
}

/* 9 - Boomi Agentstudio */
if (want(9)) {
  const s = content('Demo · Boomi Agentstudio', 'The same tools, consumed by a Boomi Agentstudio agent');
  shot(s, 'agentstudio.png', 0.7, 1.6, 7.0, 5.06);
  numbered(s, [['Agent built in Boomi', 'JPJ Counter Assistant: tasks, tools and model settings in Agentstudio.', C.blue],
    ['Boomi APIs as agent tools', 'Vehicle, licence and summons - with the officer context fixed in each tool.', C.teal],
    ['Reasons and remembers', 'Chains vehicle → owner → licence, and follows up "does he have summons?".', C.violet],
    ['Pick the engine per data class', 'Agentstudio for cloud workloads; the sovereign SLM on-prem for sensitive data.', C.amber]], 8.15, 1.8, 4.7);
}

/* 10 - sovereign architecture */
if (want(10)) {
  const s = content('Part 3 · Sovereign scaffolding', 'Boomi runs inside the firewall, next to the SLMs');
  box(s, 3.4, 1.55, 6.55, 0.95, C.blueSoft, '93C5FD');
  txt(s, '☁  Boomi platform (control plane)', { x: 3.4, y: 1.65, w: 6.55, h: 0.35, fontSize: 16, bold: true, color: C.blue, align: 'center' });
  txt(s, 'Design · deploy · monitor. Receives designs and runtime health - not JPJ data', { x: 3.4, y: 2.03, w: 6.55, h: 0.3, fontSize: 11, color: C.ink2, align: 'center' });
  s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 2.75, w: 12.13, h: 0.32, fill: { color: 'FECACA' }, line: { color: 'FCA5A5' } });
  txt(s, 'Public firewall  ·  the on-prem runtime connects outbound only (HTTPS 443)', { x: 0.6, y: 2.8, w: 12.13, h: 0.25, fontSize: 11, bold: true, color: '7F1D1D', align: 'center' });
  box(s, 0.6, 3.3, 12.13, 2.75, 'F0FDFA', '5EEAD4');
  txt(s, '🇲🇾  MTAI sovereign zone · Teras AI on NVIDIA clusters', { x: 0.85, y: 3.42, w: 9, h: 0.35, fontSize: 15, bold: true, color: '115E59' });
  [['🗄 Customer systems', 'SAP · Salesforce · files · databases\nmainframes, e.g. IBM P-Series (IBM i / DB2)', '475569'], ['⚙ Boomi on-prem runtime', 'Atom / Molecule on MTAI infra\nnormalise → read → cleanse → govern → audit', C.blue],
   ['⚒ Governed agent tools', 'jpj_vehicle_lookup · jpj_licence_status\njpj_summons_check · knowledge_search', C.teal], ['🤖 Aras SLM + assistant', 'Sovereign small language model\ntool calling · RAG', C.violet]].forEach(([t, d, col], i) => {
    const x = 0.85 + i * 2.98;
    box(s, x, 3.95, 2.7, 1.85, C.white, C.line);
    s.addShape(pptx.ShapeType.rect, { x, y: 3.95, w: 2.7, h: 0.08, fill: { color: col }, line: { color: col } });
    txt(s, t, { x: x + 0.15, y: 4.12, w: 2.45, h: 0.35, fontSize: 13, bold: true });
    txt(s, d, { x: x + 0.15, y: 4.52, w: 2.45, h: 1.15, fontSize: 10.5, color: C.ink2 });
    if (i < 3) s.addShape(pptx.ShapeType.rightArrow, { x: x + 2.72, y: 4.75, w: 0.24, h: 0.24, fill: { color: C.teal }, line: { color: C.teal } });
  });
  box(s, 0.6, 6.2, 12.13, 0.68, C.card, C.line);
  txt(s, [{ text: '☁ Boomi cloud runtime  ', options: { bold: true, color: C.blue } }, { text: 'Same package, same processes - reaches on-prem systems only through a controlled gateway. For non-sensitive or public workloads.', options: { color: C.ink2 } }], { x: 0.85, y: 6.35, w: 11.7, h: 0.4, fontSize: 12 });
  s.addShape(pptx.ShapeType.line, { x: 6.67, y: 2.5, w: 0, h: 0.25, line: { color: '93C5FD', width: 1.5, dashType: 'dash' } });
}

/* 11 - one build, two runtimes */
if (want(11)) {
  const s = content('Demo · runtime switch', 'One build, two runtimes - switch with one click');
  s.addImage({ path: A('rt-switch.png'), x: 0.7, y: 1.6, w: 4.4, h: 0.39 });
  shot(s, 'compare.png', 0.7, 2.2, 8.6, 3.8);
  numbered(s, [['Same package', 'One environment, deployed to the on-prem Atom and the cloud runtime.', C.teal],
    ['On-prem', '~0.2 s - reads the source (here the IBM i) on the internal network.', C.green],
    ['Cloud', 'Seconds - reaches on-prem sources only via a controlled gateway.', C.blue],
    ['Same result', 'Same cleansing, same policy, same audit - wherever it runs.', C.violet]], 9.6, 1.8, 3.3);
  txt(s, 'The runtime detects where it is running and picks the internal or gateway connection - a "Running on-prem?" decision in the Boomi process.', { x: 0.7, y: 6.25, w: 8.6, h: 0.5, fontSize: 11, italic: true, color: C.ink2 });
}

/* 12 - security patterns */
if (want(12)) {
  const s = content('Part 3 · Security patterns', 'What a government security review will ask - answered');
  [['🏠', 'Runtime where the data lives', 'Atom or Molecule cluster on MTAI VMs or Kubernetes, next to the SLMs and the source systems.'],
   ['↗', 'Outbound-only connectivity', 'The runtime calls the platform over HTTPS; no inbound openings for management.'],
   ['🔐', 'Data stays in the zone', 'Documents are processed locally; retention and logging tunable (e.g. purge immediately).'],
   ['🧭', 'Policy at the edge of the data', 'Channel, requester and purpose enforced before any model sees a record.'],
   ['🔑', 'Secrets stay in Boomi', 'Credentials are encrypted components / extensions - never in the portal or the SLM.'],
   ['🧾', 'Audit every call', 'Runtime, channel, officer, purpose, decision and masked fields per execution.']].forEach(([e, t, d], i) => {
    const x = 0.6 + (i % 3) * 4.15, y = 1.7 + Math.floor(i / 3) * 2.55;
    box(s, x, y, 3.95, 2.3, i < 3 ? C.tealSoft : C.blueSoft, i < 3 ? C.tealSoft : C.blueSoft);
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.25, y: y + 0.25, w: 0.8, h: 0.8, fill: { color: C.white }, line: { color: C.white } });
    txt(s, e, { x: x + 0.25, y: y + 0.4, w: 0.8, h: 0.5, fontSize: 22, align: 'center' });
    txt(s, t, { x: x + 1.2, y: y + 0.3, w: 2.6, h: 0.7, fontSize: 15, bold: true, color: i < 3 ? '115E59' : '1E3A8A' });
    txt(s, d, { x: x + 0.3, y: y + 1.2, w: 3.4, h: 1.0, fontSize: 12, color: C.ink });
  });
}

/* 13 - value */
if (want(13)) {
  const s = content('Value', 'What Boomi means for Aras Integrasi');
  [['⚡', 'Faster time to revenue', 'New departments and customers onboarded by configuration - weeks, not months.', C.tealSoft, C.teal],
   ['🧩', 'Buy, don\'t build', 'Legacy and enterprise connectors, runtime and monitoring - no plumbing code to own.', C.blueSoft, C.blue],
   ['🇲🇾', 'Sovereign trust, provable', 'On-prem runtime, policy in the data path and an audit trail for every AI tool call.', C.redSoft, C.red],
   ['💰', 'A new recurring product', 'Teras Connect sold with every Aras AI solution: JPJ, JPN, AISLE, TanyaMedik, ATLAS.', C.violetSoft, C.violet]].forEach(([e, t, d, fill, col], i) => {
    const x = 0.6 + (i % 2) * 6.17, y = 1.65 + Math.floor(i / 2) * 2.65;
    box(s, x, y, 5.95, 2.45, fill, fill);
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.35, y: y + 0.5, w: 1.45, h: 1.45, fill: { color: C.white }, line: { color: C.white } });
    txt(s, e, { x: x + 0.35, y: y + 0.85, w: 1.45, h: 0.8, fontSize: 36, align: 'center' });
    txt(s, t, { x: x + 2.1, y: y + 0.55, w: 3.65, h: 0.5, fontSize: 21, bold: true, color: col });
    txt(s, d, { x: x + 2.1, y: y + 1.15, w: 3.65, h: 1.0, fontSize: 13 });
  });
}

/* 14 - ROI */
if (want(14)) {
  const s = content('ROI', 'Boomi vs the in-house build');
  const rows = [
    ['', 'Build in-house', 'Embed Boomi (OEM)'],
    ['Platform foundation', '≈ RM3M internal build', 'Boomi subscription (OEM / ELA) - live in days'],
    ['Effort per integration', '600 – 1,200 hours', '≈ 60 – 120 hours (reuse + configuration)'],
    ['15 integrations (3 depts × 5 sources)', '9,000 – 18,000 h ≈ RM1.35 – 2.7M', '900 – 1,800 h ≈ RM0.14 – 0.27M'],
    ['First department live', '6 – 12 months', '4 – 6 weeks'],
    ['Connector upkeep & upgrades', 'In-house team, every year', 'Included in the platform'],
    ['Security & audit evidence', 'Designed and built per project', 'Built in: runtime policy + execution audit'],
  ];
  s.addTable(rows.map((r, i) => r.map((c, j) => ({ text: c, options: { bold: i === 0 || j === 0, color: i === 0 ? C.white : j === 2 ? '065F46' : C.ink,
    fill: { color: i === 0 ? (j === 2 ? C.teal : j === 1 ? '64748B' : C.navy) : j === 2 ? 'F0FDFA' : i % 2 ? C.white : C.card } } }))),
    { x: 0.6, y: 1.6, w: 8.1, colW: [2.7, 2.6, 2.8], fontFace: F, fontSize: 11.5, border: { type: 'solid', color: C.line, pt: 1 }, rowH: 0.52, valign: 'middle' });
  [['~90%', 'less integration effort', C.teal, C.tealSoft], ['RM1.2 – 2.4M', 'engineering effort avoided across 15 integrations', C.blue, C.blueSoft], ['Months → weeks', 'time to revenue per department', C.violet, C.violetSoft]].forEach(([v, d, col, fill], i) => {
    box(s, 9.0, 1.6 + i * 1.47, 3.73, 1.32, fill, fill);
    txt(s, v, { x: 9.0, y: 1.7 + i * 1.47, w: 3.73, h: 0.6, fontSize: i === 1 ? 26 : 30, bold: true, color: col, align: 'center' });
    txt(s, d, { x: 9.15, y: 2.32 + i * 1.47, w: 3.43, h: 0.5, fontSize: 11.5, align: 'center' });
  });
  txt(s, 'Sources: RM3M internal build and 600–1,200 h per DIY integration from the Boomi POV for Aras Integrasi (24 Sept 2026). Illustrative assumptions to validate in the pilot: Boomi effort ≈ 10% of DIY through connector and mapping reuse; blended engineering cost RM150/h. Boomi subscription per the OEM/ELA proposal (to follow).',
    { x: 0.6, y: 6.25, w: 12.13, h: 0.7, fontSize: 10, italic: true, color: C.ink2 });
}

/* 15 - stakeholders */
if (want(15)) {
  const s = content('Who benefits', 'Value for every stakeholder in the room');
  [['📈', 'Chief Strategy Officer · MTAI', 'Trust that sells', ['Prove data security to government buyers', 'Connectors and tools to sell on day one', 'Faster sales cycles, recurring product'], C.tealSoft, C.teal],
   ['🛠', 'CTO · Aras Integrasi', 'Architecture & TCO', ['On-prem runtimes beside the SLMs', 'One pipeline, every department', 'No connector code to maintain'], C.blueSoft, C.blue],
   ['🤖', 'AI Consultant · MTAI', 'Pipelines & tools', ['Any source - incl. mainframes - cleansed on input', 'Governed tools for the assistant', 'RAG-ready, PII-masked knowledge'], C.violetSoft, C.violet]].forEach(([e, who, t, items, fill, col], i) => {
    const x = 0.6 + i * 4.15;
    box(s, x, 1.6, 3.95, 5.2, fill, fill);
    s.addShape(pptx.ShapeType.ellipse, { x: x + 1.37, y: 1.8, w: 1.2, h: 1.2, fill: { color: C.white }, line: { color: C.white } });
    txt(s, e, { x: x + 1.37, y: 2.08, w: 1.2, h: 0.7, fontSize: 30, align: 'center' });
    txt(s, who, { x, y: 3.15, w: 3.95, h: 0.3, fontSize: 12, bold: true, color: C.ink2, align: 'center' });
    txt(s, t, { x, y: 3.5, w: 3.95, h: 0.45, fontSize: 21, bold: true, color: col, align: 'center' });
    items.forEach((it, k) => { box(s, x + 0.25, 4.15 + k * 0.82, 3.45, 0.68, C.white, C.white); txt(s, [{ text: '✓ ', options: { color: col, bold: true } }, { text: it }], { x: x + 0.4, y: 4.3 + k * 0.82, w: 3.2, h: 0.45, fontSize: 12 }); });
  });
}

/* 16 - next steps */
if (want(16)) {
  const s = pptx.addSlide(); page++;
  s.background = { color: C.navy };
  txt(s, 'NEXT STEPS', { x: 0.6, y: 0.35, w: 6, h: 0.3, fontSize: 12, bold: true, color: C.teal, charSpacing: 3 });
  txt(s, 'The path forward', { x: 0.6, y: 0.68, w: 10, h: 0.75, fontSize: 30, bold: true, color: C.white });
  s.addShape(pptx.ShapeType.line, { x: 1.6, y: 3.0, w: 10.1, h: 0, line: { color: '334155', width: 3 } });
  [['1', 'Pilot', ['One "J" department (JPJ)', '2-3 sources (e.g. IBM P-Series) on an on-prem runtime', 'Measure onboarding & audit evidence'], C.teal],
   ['2', 'Productise', ['Teras Connect white-label console', 'Connector + agent-tool catalogue', 'An environment per department'], C.blue],
   ['3', 'Scale', ['All three "J" departments', 'AISLE, TanyaMedik, ATLAS, VoronCitadel', 'OEM / ELA partnership with Boomi'], C.violet]].forEach(([n, t, items, col], i) => {
    const x = 1.0 + i * 4.45;
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.55, y: 2.4, w: 1.2, h: 1.2, fill: { color: col }, line: { color: col } });
    txt(s, n, { x: x + 0.55, y: 2.65, w: 1.2, h: 0.7, fontSize: 32, bold: true, color: C.white, align: 'center' });
    txt(s, t, { x: x - 0.6, y: 3.85, w: 3.5, h: 0.5, fontSize: 24, bold: true, color: C.white, align: 'center' });
    items.forEach((it, k) => txt(s, it, { x: x - 0.8, y: 4.5 + k * 0.45, w: 3.9, h: 0.35, fontSize: 13, color: 'CBD5E1', align: 'center' }));
  });
  s.addShape(pptx.ShapeType.roundRect, { x: 3.7, y: 6.15, w: 5.9, h: 0.65, fill: { color: C.teal }, line: { color: C.teal }, rectRadius: 0.32 });
  txt(s, 'Let\'s agree the pilot department and success criteria', { x: 3.7, y: 6.28, w: 5.9, h: 0.4, fontSize: 15, bold: true, color: C.white, align: 'center' });
  txt(s, 'Teras Connect · Aras Integrasi × MTAI · Powered by Boomi', { x: 0.6, y: 7.05, w: 8, h: 0.25, fontSize: 9, color: '64748B' });
  txt(s, String(page), { x: 12.2, y: 7.05, w: 0.6, h: 0.25, fontSize: 9, color: '64748B', align: 'right' });
}

pptx.writeFile({ fileName: OUT }).then((f) => console.log('wrote', f, page, 'slides'));
