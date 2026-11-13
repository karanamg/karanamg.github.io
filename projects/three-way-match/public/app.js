/* Copperleaf Provisions - AP 3-Way Match front end */
const API = (window.THREEWAY_GATEWAY || '').replace(/\/+$/, '');
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => (v == null || v === '' || isNaN(v) ? '-' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const qty = (v) => (v == null || v === '' ? '-' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 }));
const signed = (v, f = money) => (v == null ? '-' : (Number(v) > 0 ? '+' : '') + f(v));
const pct = (v) => (v == null ? '-' : (Number(v) > 0 ? '+' : '') + Number(v).toFixed(2) + '%');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const when = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const STATUS = {
  MATCHED: { label: 'Matched', cls: 'b-good', icon: '✔', color: 'var(--good)' },
  MATCHED_WITHIN_TOLERANCE: { label: 'Matched within tolerance', cls: 'b-tol', icon: '✔', color: 'var(--good)', hatch: true },
  EXCEPTION: { label: 'Exception', cls: 'b-serious', icon: '!', color: 'var(--serious)' },
  GR_MISSING: { label: 'Awaiting goods receipt', cls: 'b-warning', icon: '⏸', color: 'var(--warning)' },
  PO_NOT_FOUND: { label: 'PO not found', cls: 'b-critical', icon: '✖', color: 'var(--critical)' },
  ERROR: { label: 'Processing error', cls: 'b-neutral', icon: '?', color: 'var(--muted)' }
};
const DECISION = {
  APPROVED_FOR_PAYMENT: { label: 'Approved for payment', text: 'The invoice agrees with the purchase order and goods receipts. Released for payment.' },
  ON_HOLD: { label: 'On hold - AP exception queue', text: 'The invoice was routed to the accounts payable exception queue for review.' },
  REJECTED: { label: 'Rejected - returned to vendor', text: 'The invoice cannot be matched to a purchase order.' },
  ERROR: { label: 'Not processed', text: 'Boomi did not return a match result.' }
};
const LINE = {
  MATCHED: { label: 'Matched', cls: 'b-good', icon: '✔' }, WITHIN_TOLERANCE: { label: 'Within tolerance', cls: 'b-tol', icon: '✔' },
  PRICE_VARIANCE: { label: 'Price variance', cls: 'b-serious', icon: '!' }, QTY_VARIANCE: { label: 'Quantity variance', cls: 'b-serious', icon: '!' },
  VALUE_VARIANCE: { label: 'Value variance', cls: 'b-serious', icon: '!' }, NOT_ON_PO: { label: 'Not on PO', cls: 'b-critical', icon: '✖' }
};
const EXC = { PRICE_VARIANCE: 'Price variance', QTY_VARIANCE: 'Quantity variance', VALUE_VARIANCE: 'Value variance', NOT_ON_PO: 'Line not on PO', GR_MISSING: 'Goods receipt missing', PO_NOT_FOUND: 'PO not found' };
const badge = (m) => `<span class="badge ${m.cls}"><i aria-hidden="true">${m.icon}</i>${esc(m.label)}</span>`;
const statusBadge = (s) => badge(STATUS[s] || STATUS.ERROR);

async function api(path, opts = {}) {
  const r = await fetch(API + path, opts);
  let body = null; try { body = await r.json(); } catch { /* empty */ }
  if (!r.ok && !(body && body.record)) throw Object.assign(new Error((body && (body.error || body.message)) || `HTTP ${r.status}`), { body, status: r.status });
  return body;
}

/* ---------------- tabs ---------------- */
const loaders = {};
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(name) {
  if (!location.hash.startsWith('#history=') || name !== 'process') history.replaceState(null, '', name === 'process' ? location.pathname : '#' + name);
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  if (loaders[name]) loaders[name]();
}

/* ---------------- config / connection ---------------- */
let CONFIG = { samples: [], tolerances: { pricePct: 1, valuePct: 1, qtyUnits: 0 } };
async function init() {
  try {
    const h = await api('/api/health');
    const c = $('#conn');
    c.className = 'conn ' + (h.boomiConfigured ? 'ok' : 'bad');
    c.textContent = h.boomiConfigured ? 'Boomi connected' : 'Boomi not configured';
    if (h.boomiHost) c.title = `Boomi runtime: ${h.boomiHost}`;
  } catch {
    $('#conn').className = 'conn bad';
    $('#conn').textContent = window.THREEWAY_STATIC_ONLY ? 'Live gateway not configured' : 'Gateway offline';
  }
  try { CONFIG = await api('/api/config'); } catch { /* keep defaults */ }
  renderSamples(); renderRules(); resetPipeline();
  const h = location.hash.slice(1);
  if (h.startsWith('history=')) openHistory(h.slice(8));
  else if (['dashboard', 'reference', 'how'].includes(h)) showTab(h);
}

function renderSamples() {
  $('#samples').innerHTML = CONFIG.samples.map((s, i) => `
    <li><div class="meta"><b>${esc(s.vendor)} · ${esc(s.invoiceNumber)}</b><span>${esc(s.scenario)}</span></div>
      <a class="dl" href="${API}/samples/${encodeURIComponent(s.file)}" download>Download PDF</a>
      <button class="btn sm ghost" data-run="${i}">Run</button></li>`).join('');
  $('#samples').querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => runSample(CONFIG.samples[b.dataset.run])));
}

function renderRules() {
  const t = CONFIG.tolerances;
  $('#rules').innerHTML = `<tr><th>Check</th><th>Compares</th><th>Passes when</th><th>Otherwise</th></tr>
    <tr><td><b>Quantity</b></td><td>Invoiced quantity vs goods-receipt quantity (all receipts for the PO line) and PO quantity</td><td>Invoiced ≤ received and ≤ ordered</td><td>${badge(LINE.QTY_VARIANCE)}</td></tr>
    <tr><td><b>Unit price</b></td><td>Invoice unit price vs PO unit price</td><td>Exactly equal, or within ±${t.pricePct}% (within tolerance)</td><td>${badge(LINE.PRICE_VARIANCE)}</td></tr>
    <tr><td><b>Line value</b></td><td>Invoice line amount vs expected value (received qty × PO price); also qty × price on the invoice itself</td><td>Exactly equal, or within ±${t.valuePct}% (within tolerance)</td><td>${badge(LINE.VALUE_VARIANCE)}</td></tr>
    <tr><td><b>PO line</b></td><td>Invoice item vs the lines on the PO</td><td>The item is on the PO</td><td>${badge(LINE.NOT_ON_PO)}</td></tr>
    <tr><td><b>Header</b></td><td>PO exists, a goods receipt exists, vendor matches the PO, subtotal equals the lines</td><td>All true</td><td>${statusBadge('PO_NOT_FOUND')} ${statusBadge('GR_MISSING')} ${statusBadge('EXCEPTION')}</td></tr>`;
}

/* ---------------- upload ---------------- */
const drop = $('#drop'), fileInput = $('#file');
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) processFile(fileInput.files[0], fileInput.files[0].name); fileInput.value = ''; });
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) processFile(f, f.name); });

let busy = false;
async function runSample(s) {
  const blob = await (await fetch(`${API}/samples/${encodeURIComponent(s.file)}`)).blob();
  return processFile(blob, s.file);
}
$('#runAll').addEventListener('click', async () => {
  if (busy) return;
  const b = $('#runAll'); b.disabled = true;
  for (let i = 0; i < CONFIG.samples.length; i++) { b.textContent = `Running ${i + 1} of ${CONFIG.samples.length}…`; await runSample(CONFIG.samples[i]); await sleep(900); }
  b.disabled = false; b.textContent = 'Run all 7 samples';
});

/* ---------------- live pipeline ---------------- */
const STEPS = [
  { id: 'upload', where: 'Browser → gateway', title: 'Upload invoice PDF', icon: '1' },
  { id: 'extract', where: 'Gateway · pdf.js', title: 'Read invoice data from the PDF', icon: '2' },
  { id: 'api', where: 'Boomi API Service', title: 'POST /ws/rest/threeway/v1/match', icon: '3', boomi: true },
  { id: 'INVOICE_RECEIVED', where: 'Boomi · [SUB] 3WM Three-Way Match', title: 'Capture invoice and PO number', icon: '4', boomi: true },
  { id: 'PO_RETRIEVED', where: 'Boomi → SAP S/4HANA (ERP)', title: 'Get purchase order · API_PURCHASEORDER_PROCESS_SRV', icon: '5', boomi: true, sys: 'sap' },
  { id: 'GR_RETRIEVED', where: 'Boomi → Manhattan Active WM (WMS)', title: 'Get goods receipts from warehouse receiving', icon: '6', boomi: true, sys: 'wms' },
  { id: 'MATCH_EVALUATED', where: 'Boomi · 3-way match engine', title: 'Compare quantity, price and value', icon: '7', boomi: true },
  { id: 'ROUTED', where: 'Boomi · Decision', title: 'Route the invoice', icon: '8', boomi: true }
];
function resetPipeline() {
  $('#pipeline').innerHTML = STEPS.map((s) => `
    <li class="step" id="st-${s.id}"><div class="dot">${s.icon}</div>
      <div><div class="where ${s.boomi ? 'boomi' : ''} ${s.sys ? 'sys-' + s.sys : ''}">${esc(s.where)}</div><div class="title">${esc(s.title)}</div><div class="detail"></div></div>
      <div class="ms"></div></li>`).join('');
}
function setStep(id, state, detail, ms) {
  const el = $('#st-' + id); if (!el) return;
  el.className = 'step ' + (state || '');
  const icon = { done: '✔', fail: '✖', warn: '!', running: '…' }[state];
  $('.dot', el).textContent = icon || STEPS.find((s) => s.id === id).icon;
  if (detail !== undefined) $('.detail', el).innerHTML = detail;
  if (ms !== undefined) $('.ms', el).textContent = ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

async function processFile(blob, name) {
  if (busy) return; busy = true;
  resetPipeline(); $('#result').classList.add('hidden');
  $('#runLabel').textContent = name;
  showTab('process');
  try {
    setStep('upload', 'running', `Sending ${esc(name)} (${(blob.size / 1024).toFixed(0)} KB)`);
    const t0 = performance.now();
    const ex = await api('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(name) }, body: blob });
    setStep('upload', 'done', `${esc(ex.fileName)} · ${(ex.bytes / 1024).toFixed(0)} KB received`, Math.max(0, Math.round(performance.now() - t0 - ex.ms)));
    const inv = ex.invoice;
    const warn = ex.warnings.length ? `<br><span class="mark-tol">⚠ ${esc(ex.warnings.join('; '))}</span>` : '';
    setStep('extract', inv.poNumber && inv.lines.length ? 'done' : 'fail',
      `Invoice <b>${esc(inv.invoiceNumber || '?')}</b> from ${esc(inv.vendor.name || '?')} · PO <b>${esc(inv.poNumber || '?')}</b> · ${inv.lines.length} lines · ${money(inv.total)} ${esc(inv.currency)}${warn}`, ex.ms);
    if (!inv.poNumber || !inv.lines.length) throw new Error('The PDF does not contain a PO number and line items, so it cannot be matched.');

    setStep('api', 'running', 'Waiting for the Boomi runtime…');
    ['INVOICE_RECEIVED', 'PO_RETRIEVED', 'GR_RETRIEVED', 'MATCH_EVALUATED', 'ROUTED'].forEach((id) => setStep(id, '', '<span class="muted">Queued</span>'));
    const out = await api('/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice: inv, fileId: ex.fileId, fileName: ex.fileName }) });
    const rec = out.record;
    if (!rec.result) {
      setStep('api', 'fail', esc(rec.error || 'Boomi did not return a result'), rec.boomiMs);
      ['INVOICE_RECEIVED', 'PO_RETRIEVED', 'GR_RETRIEVED', 'MATCH_EVALUATED', 'ROUTED'].forEach((id) => setStep(id, 'skipped', ''));
      renderResult(rec); return;
    }
    setStep('api', 'done', `HTTP 200 from ${esc(out.boomiHost)} · execution <code>${esc(shortExec(rec.result.executionId))}</code>`, rec.boomiMs);
    await replayTrace(rec.result, true);
    renderResult(rec);
  } catch (e) {
    const running = document.querySelector('.step.running');
    if (running) setStep(running.id.slice(3), 'fail', esc(e.message));
    $('#result').classList.remove('hidden');
    $('#result').innerHTML = `<div class="banner b-critical"><div class="big">✖</div><div><h2>Could not process ${esc(name)}</h2><p>${esc(e.message)}</p></div></div>`;
  } finally { busy = false; }
}

const shortExec = (id) => (id || '').replace(/^execution-/, '').slice(0, 13) + (id ? '…' : '');

async function replayTrace(r, animate) {
  const t = r.trace || [], t0 = Date.parse(t[0]?.at) || null;
  let prev = t0;
  for (const s of t) {
    const at = Date.parse(s.at), ms = at && prev ? at - prev : null;
    if (animate) { setStep(s.step, 'running', esc(s.detail)); await sleep(380); }
    let state = 'done';
    if (s.step === 'PO_RETRIEVED' && r.status === 'PO_NOT_FOUND') state = 'fail';
    if (s.step === 'GR_RETRIEVED' && (r.status === 'GR_MISSING' || r.status === 'PO_NOT_FOUND')) state = r.status === 'PO_NOT_FOUND' ? 'skipped' : 'warn';
    if (s.step === 'MATCH_EVALUATED' && r.summary.exceptions > 0) state = 'warn';
    if (s.step === 'ROUTED') state = r.route === 'APPROVE' ? 'done' : r.decision === 'REJECTED' ? 'fail' : 'warn';
    const extra = s.step === 'ROUTED' ? ` · ${statusBadge(r.status)}` : '';
    setStep(s.step, state, esc(s.detail) + extra, s.step === 'INVOICE_RECEIVED' ? null : ms);
    if (at) prev = at;
  }
}

/* ---------------- result ---------------- */
function renderResult(rec) {
  const el = $('#result'); el.classList.remove('hidden');
  const r = rec.result;
  if (!r) {
    el.innerHTML = `<div class="banner b-neutral"><div class="big">?</div><div><h2>Not processed</h2><p>${esc(rec.error || 'Boomi did not return a match result.')}</p></div></div>`;
    return;
  }
  const st = STATUS[r.status] || STATUS.ERROR, dec = DECISION[r.decision] || DECISION.ERROR;
  const po = r.purchaseOrder, grs = r.goodsReceipts || [], sm = r.summary;
  const chk = (c) => (c === 'FAIL' ? '<span class="mark-fail">✖</span>' : c === 'TOLERANCE' ? '<span class="mark-tol">≈</span>' : c === 'OK' ? '<span class="mark-ok">✔</span>' : '');
  const rows = r.lines.map((l) => {
    const c = l.checks || {}, v = l.variance || {};
    return `<tr>
      <td>${esc(l.line)}</td><td><b>${esc(l.description)}</b><div class="sku">${esc(l.sku)}</div></td>
      <td class="n">${qty(l.po?.qty)} <span class="subnote">${esc(l.po?.uom || '')}</span></td><td class="n">${qty(l.gr?.qtyReceived)}</td>
      <td class="n chk-${c.qty}">${qty(l.invoice.qty)} ${chk(c.qty)}</td>
      <td class="n">${money(l.po?.unitPrice)}</td><td class="n chk-${c.price}">${money(l.invoice.unitPrice)} ${chk(c.price)}</td><td class="n">${l.po ? pct(v.pricePct) : '-'}</td>
      <td class="n">${money(l.expectedValue)}</td><td class="n chk-${c.value}">${money(l.invoice.value)} ${chk(c.value)}</td><td class="n">${l.po ? signed(v.value) : '-'}</td>
      <td>${badge(LINE[l.status] || { label: l.status, cls: 'b-neutral', icon: '?' })}<div class="subnote">${esc(l.note || '')}</div></td></tr>`;
  }).join('');
  el.innerHTML = `
    <div class="result-head">
      <div class="banner ${st.cls}"><div class="big" aria-hidden="true">${st.icon}</div>
        <div><h2>${esc(st.label)} · ${esc(dec.label)}</h2><p>${esc(dec.text)}</p></div></div>
    </div>
    <div class="facts">
      <div class="fact"><div class="k">Vendor invoice</div><div class="v">${esc(r.invoice.invoiceNumber)}</div><div class="s">${esc(r.invoice.vendorName)} · ${esc(r.invoice.invoiceDate)}</div></div>
      <div class="fact"><div class="k">Purchase order · SAP S/4HANA</div><div class="v">${esc(r.invoice.poNumber)}</div><div class="s">${po ? `${esc(po.vendorName)} · ${esc(po.orderDate)} · buyer ${esc(po.buyer)}` : 'Not found in SAP S/4HANA'}</div></div>
      <div class="fact"><div class="k">Goods receipts · Manhattan Active WM</div><div class="v">${grs.length ? grs.map((g) => esc(g.grNumber)).join(', ') : 'None'}</div><div class="s">${grs.length ? grs.map((g) => esc(g.receivedDate)).join(', ') + ' · ' + esc(grs[0].warehouse) : 'Nothing received yet'}</div></div>
      <div class="fact"><div class="k">Invoice vs expected</div><div class="v">${money(sm.invoiceValue)} vs ${money(sm.expectedValue)}</div><div class="s">Variance ${signed(sm.variance)} ${esc(r.invoice.currency)} · ${sm.matched} matched, ${sm.withinTolerance} in tolerance, ${sm.exceptions} exceptions</div></div>
    </div>
    ${r.reasons.length ? `<h2>Why it needs attention</h2><ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <h2>Line-by-line comparison</h2>
    <div class="tablewrap"><table class="data">
      <tr class="grp"><th colspan="2"></th><th colspan="3">Quantity</th><th colspan="3">Unit price</th><th colspan="3">Line value</th><th></th></tr>
      <tr><th>Line</th><th>Item</th><th class="n">PO</th><th class="n">Received</th><th class="n">Invoiced</th><th class="n">PO</th><th class="n">Invoice</th><th class="n">Diff</th><th class="n">Expected</th><th class="n">Invoice</th><th class="n">Diff</th><th>Result</th></tr>
      ${rows}</table></div>
    <div class="split">
      <div class="exec">
        <h2>Boomi execution</h2>
        <table class="data compact">
          <tr><td>Process</td><td><b>3WM API Match Invoice</b> → [SUB] 3WM Three-Way Match</td></tr>
          <tr><td>Execution ID</td><td><code>${esc(r.executionId || '-')}</code></td></tr>
          <tr><td>Processed at</td><td>${esc(r.processedAt)}</td></tr>
          <tr><td>API round trip</td><td>${(rec.boomiMs / 1000).toFixed(1)} s (gateway → Boomi → gateway)</td></tr>
          <tr><td>Tolerances</td><td>Price ±${esc(r.tolerance.pricePct)}%, value ±${esc(r.tolerance.valuePct)}%, quantity exact</td></tr>
          <tr><td>Source file</td><td>${esc(rec.fileName || '-')}</td></tr>
        </table>
        <p class="subnote">Find the run in Boomi under <b>Manage → Process Reporting</b> by its execution ID.</p>
      </div>
      ${rec.fileId ? `<div class="pdfbox"><iframe title="Uploaded invoice PDF" src="${API}/api/files/${esc(rec.fileId)}#view=FitH&toolbar=0"></iframe></div>` : ''}
    </div>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- dashboard ---------------- */
loaders.dashboard = loadDashboard;
$('#dashRefresh').addEventListener('click', loadDashboard);
$('#dashReset').addEventListener('click', async () => {
  if (!confirm('Clear the match history on this gateway?')) return;
  await api('/api/history/reset', { method: 'POST' }); loadDashboard();
});
async function loadDashboard() {
  let runs = [];
  try { runs = await api('/api/history'); } catch (e) { $('#kpis').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  $('#dashNote').textContent = runs.length ? `${runs.length} invoices matched through Boomi on this gateway · latest ${when(runs[0].at)}` : 'No invoices yet. Upload one, or use "Run all 7 samples" on the Process invoice tab.';
  const n = runs.length, by = (f) => runs.filter(f);
  const approved = by((r) => r.decision === 'APPROVED_FOR_PAYMENT'), hold = by((r) => r.decision === 'ON_HOLD'), rejected = by((r) => r.decision === 'REJECTED');
  const sum = (a) => a.reduce((s, r) => s + (Number(r.value) || 0), 0);
  const avgMs = n ? runs.reduce((s, r) => s + (r.boomiMs || 0), 0) / n : 0;
  $('#kpis').innerHTML = [
    ['Invoices processed', n, `${by((r) => r.status === 'ERROR').length} errors`],
    ['Auto-approved', approved.length, n ? `${Math.round((approved.length / n) * 100)}% touchless` : '-'],
    ['On hold', hold.length, 'In the AP exception queue'],
    ['Rejected', rejected.length, 'No matching PO'],
    ['Value approved', '$' + money(sum(approved)), `$${money(sum(hold) + sum(rejected))} held or rejected`],
    ['Average Boomi time', n ? (avgMs / 1000).toFixed(1) + ' s' : '-', 'API round trip per invoice']
  ].map(([k, v, s]) => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join('');

  const statusRows = Object.entries(STATUS).map(([key, m]) => ({ key, label: m.label, icon: m.icon, color: m.color, hatch: m.hatch, n: by((r) => r.status === key).length, value: sum(by((r) => r.status === key)) }));
  hbars('#chartStatus', statusRows, (d) => `<span aria-hidden="true">${d.icon}</span>${esc(d.label)}`, (d) => `<b>${esc(d.label)}</b>${d.n} invoice${d.n === 1 ? '' : 's'} · $${money(d.value)}`);
  const excRows = Object.entries(EXC).map(([key, label]) => ({ key, label, color: 'var(--series-1)', n: by((r) => (r.exceptionTypes || []).includes(key)).length }));
  hbars('#chartExceptions', excRows, (d) => esc(d.label), (d) => `<b>${esc(d.label)}</b>${d.n} invoice${d.n === 1 ? '' : 's'} affected`);

  $('#runs').innerHTML = `<tr><th>Processed</th><th>Invoice</th><th>Vendor</th><th>PO</th><th class="n">Value</th><th>Outcome</th><th>Decision</th><th class="n">Boomi</th><th></th></tr>` +
    (runs.length ? runs.map((r) => `<tr class="clickable" data-id="${esc(r.id)}">
      <td>${esc(when(r.at))}</td><td><b>${esc(r.invoiceNumber || '-')}</b></td><td>${esc(r.vendorName || '-')}</td><td>${esc(r.poNumber || '-')}</td>
      <td class="n">${money(r.value)}</td><td>${statusBadge(r.status)}</td><td>${esc((DECISION[r.decision] || DECISION.ERROR).label)}</td>
      <td class="n">${r.boomiMs ? (r.boomiMs / 1000).toFixed(1) + ' s' : '-'}</td>
      <td>${r.fileId ? `<a href="${API}/api/files/${esc(r.fileId)}" target="_blank" rel="noopener">PDF</a>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="9" class="empty">No matches yet</td></tr>`);
  $('#runs').querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) openHistory(tr.dataset.id); }));
}

async function openHistory(id) {
    const rec = await api('/api/history/' + id);
    history.replaceState(null, '', '#history=' + id);
    showTab('process'); resetPipeline(); $('#runLabel').textContent = `${rec.fileName || ''} · from history`;
    setStep('upload', 'done', esc(rec.fileName || '')); setStep('extract', 'done', `Invoice <b>${esc(rec.invoice.invoiceNumber)}</b> · PO <b>${esc(rec.invoice.poNumber)}</b>`);
    if (rec.result) { setStep('api', 'done', `execution <code>${esc(shortExec(rec.result.executionId))}</code>`, rec.boomiMs); await replayTrace(rec.result, false); }
    else setStep('api', 'fail', esc(rec.error || ''), rec.boomiMs);
    renderResult(rec);
}

function hbars(sel, rows, label, tipHtml) {
  const el = $(sel), max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.some((r) => r.n)) { el.innerHTML = '<div class="empty">No data yet</div>'; return; }
  el.innerHTML = rows.map((d, i) => `<div class="hbar"><div class="lab">${label(d)}</div>
      <div class="track"><div class="fill" style="width:${(d.n / max) * 100}%;background:${d.hatch ? `repeating-linear-gradient(45deg, ${d.color} 0 6px, #7fcf7f 6px 9px)` : d.color}"></div><div class="hit" data-i="${i}"></div></div>
      <div class="val">${d.n}</div></div>`).join('');
  el.querySelectorAll('.hit').forEach((h) => {
    h.addEventListener('mousemove', (e) => tip(e, tipHtml(rows[h.dataset.i])));
    h.addEventListener('mouseleave', () => { $('#tip').hidden = true; });
  });
}
function tip(e, html) {
  const t = $('#tip'); t.innerHTML = html; t.hidden = false;
  t.style.left = Math.min(window.innerWidth - t.offsetWidth - 10, e.clientX + 14) + 'px'; t.style.top = (e.clientY + 14) + 'px';
}

/* ---------------- reference data ---------------- */
let refLoaded = false;
loaders.reference = () => { if (!refLoaded) loadReference(); };
$('#refReload').addEventListener('click', loadReference);
async function loadReference() {
  const box = $('#refBody'); box.innerHTML = '<div class="card empty">Loading from Boomi…</div>';
  try {
    const [p, g] = await Promise.all([api('/api/purchaseorders'), api('/api/goodsreceipts')]);
    refLoaded = true;
    const grs = g.goodsReceipts || [];
    box.innerHTML = (p.purchaseOrders || []).map((po) => {
      const mine = grs.filter((x) => x.poNumber === po.poNumber);
      const rec = (line) => mine.reduce((s, x) => s + (x.lines || []).filter((l) => String(l.poLine) === String(line)).reduce((a, l) => a + Number(l.qtyReceived), 0), 0);
      const total = po.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
      const full = po.lines.every((l) => rec(l.line) >= l.qty), none = po.lines.every((l) => rec(l.line) === 0);
      const st = none ? { label: 'Not received', cls: 'b-warning', icon: '⏸' } : full ? { label: 'Fully received', cls: 'b-good', icon: '✔' } : { label: 'Partially received', cls: 'b-serious', icon: '!' };
      return `<div class="po"><div class="po-head"><span class="sys-tag sap">SAP S/4HANA</span><b>PO ${esc(po.poNumber)}</b><span>${esc(po.vendorName)} (${esc(po.vendorId)})</span>
          <span class="muted small">Ordered ${esc(po.orderDate)} · buyer ${esc(po.buyer)} · plant ${esc(po.plant)}</span>${badge(st)}
          <span class="muted small"><span class="sys-tag wms">Manhattan Active WM</span> receipts: ${mine.length ? mine.map((x) => `${esc(x.grNumber)} (${esc(x.receivedDate)})`).join(', ') : 'none'}</span></div>
        <table class="data compact"><tr><th>Line</th><th>Item</th><th>Description</th><th class="n">Ordered</th><th>UoM</th><th class="n">Unit price</th><th class="n">Value</th><th class="n">Received</th></tr>
        ${po.lines.map((l) => `<tr><td>${esc(l.line)}</td><td class="sku">${esc(l.sku)}</td><td>${esc(l.description)}</td><td class="n">${qty(l.qty)}</td><td>${esc(l.uom)}</td><td class="n">${money(l.unitPrice)}</td><td class="n">${money(l.qty * l.unitPrice)}</td><td class="n">${qty(rec(l.line))}</td></tr>`).join('')}
        <tr><td colspan="6"></td><td class="n"><b>${money(total)}</b></td><td></td></tr></table></div>`;
    }).join('');
  } catch (e) { box.innerHTML = `<div class="card empty">Could not load from Boomi: ${esc(e.message)}</div>`; }
}

init();
