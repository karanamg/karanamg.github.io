/* Integrasi Connect - AI Data Hub (Aras Integrasi) - portal front end */
const API = (window.AIH_GATEWAY || '').replace(/\/+$/, '');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => Number(v || 0).toLocaleString('en-US');
const secs = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
const maskHtml = (t) => esc(t).replace(/\[(REDACTED|MYKAD|EMAIL|PHONE)\]/g, '<span class="mask">[$1]</span>');
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), 2600); };

async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let body = null; try { body = await r.json(); } catch { /* none */ }
  if (!r.ok && !(body && body.job)) throw new Error((body && body.error) || `HTTP ${r.status}`);
  return body;
}

const SYS = {
  SAP_S4HANA: { label: 'SAP S/4HANA', source: 'SAP S/4HANA · OData Client → API_PRODUCT_SRV (live sandbox)' },
  SALESFORCE: { label: 'Salesforce', source: 'Salesforce Service Cloud · SOQL query on Case (simulated org)' },
  FILE_CSV: { label: 'File / CSV', source: 'File drop · CSV parsed in Boomi' },
  OPEN_DATA: { label: 'data.gov.my', source: 'data.gov.my · REST GET /data-catalogue/ (live)' }
};
const sysTag = (type) => `<span class="sys ${type}">${esc(SYS[type]?.label || type)}</span>`;
let CATALOG = [];
const liveTag = (type) => { const c = CATALOG.find((x) => x.type === type); return c ? `<span class="live ${esc(c.status)}">${esc(c.status)}</span>` : ''; };
const cfgSummary = (c) => Object.entries(c.config || {}).filter(([k, v]) => v !== '' && k !== 'csv').map(([k, v]) => `<b>${esc(k)}</b> ${esc(v)}`).join(' · ') || '<span class="muted">No settings</span>';

/* ---------------- state + routing ---------------- */
let TENANTS = [], T = null, PAGE = 'overview';
const drafts = {}, previews = {};
function setHash() { history.replaceState(null, '', `#${T ? T.id : ''}/${PAGE}`); }
$$('#nav a').forEach((a) => a.addEventListener('click', () => go(a.dataset.page)));
function go(page, opts) {
  PAGE = page;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));
  setHash(); return RENDER[page](opts);
}
$('#tenantSel').addEventListener('change', (e) => selectTenant(e.target.value));

async function init() {
  try {
    const h = await api('/api/health');
    $('#conn').className = 'conn ' + (h.boomiConfigured ? 'ok' : 'bad');
    $('#conn').textContent = h.boomiConfigured ? 'Boomi connected' : 'Boomi not configured';
    $('#conn').title = h.boomiHost ? `Boomi runtime: ${h.boomiHost} · API ${h.apiBase}` : '';
    window.LLM = h.llm;
  } catch { $('#conn').className = 'conn bad'; $('#conn').textContent = window.AIH_STATIC_ONLY ? 'Live gateway not configured' : 'Gateway offline'; }
  api('/api/connectors').then((c) => { CATALOG = c.connectors || []; if (T) RENDER[PAGE](); }).catch(() => {});
  await loadTenants();
  const [tid, page, arg] = location.hash.slice(1).split('/');
  await selectTenant(TENANTS.some((t) => t.id === tid) ? tid : TENANTS[0]?.id, page && RENDER[page] ? page : 'overview', arg ? (arg === 'all' ? { all: true } : { conn: arg }) : undefined);
}
async function loadTenants() {
  TENANTS = await api('/api/tenants');
  $('#tenantSel').innerHTML = TENANTS.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
}
async function selectTenant(id, page, opts) {
  if (!id) return;
  T = await api('/api/tenants/' + id);
  $('#tenantSel').value = id;
  document.documentElement.style.setProperty('--tenant', T.color || '#0d9488');
  $('#tenantName').innerHTML = `${esc(T.name)} <span class="cls" title="Data classification">${esc(T.classification)}</span>`;
  $('#tenantMeta').textContent = `${T.industry} · ${T.solution}`;
  $('#envBadge').textContent = `Boomi environment ${T.boomiEnvironment}`;
  $('#envBadge').title = `Runtime: ${T.region}`;
  go(page || PAGE, opts);
}
async function refreshTenant() { T = await api('/api/tenants/' + T.id); }

/* ---------------- overview ---------------- */
const RENDER = {};
RENDER.overview = async () => {
  const el = $('#page-overview');
  const [know, jobs] = await Promise.all([api(`/api/tenants/${T.id}/knowledge`), api(`/api/tenants/${T.id}/jobs`)]);
  const s = (await api('/api/tenants/' + T.id)).summary;
  const initials = T.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  el.innerHTML = `
    <div class="card hero"><div class="ic">${esc(initials)}</div><div style="flex:1">
      <h2 style="margin:0">${esc(T.name)}</h2><div class="muted small">${esc(T.solution)} · ${esc(T.industry)}</div>
      <div class="facts"><div><b>${esc(T.boomiEnvironment)}</b>Boomi environment</div><div><b>${esc(T.region)}</b>Boomi runtime</div>
        <div><b>${esc(T.classification)}</b>Data classification</div><div><b>${T.connections.length} sources</b>Connected systems</div></div></div>
      <div><button class="btn" id="ovRunAll">Run all sources</button></div></div>
    <div class="kpis">
      <div class="kpi"><div class="k">Connected sources</div><div class="v">${T.connections.length}</div><div class="s">${[...new Set(T.connections.map((c) => SYS[c.type]?.label))].join(', ') || 'None yet'}</div></div>
      <div class="kpi"><div class="k">Documents</div><div class="v">${num(s.documents)}</div><div class="s">RAG-ready knowledge documents</div></div>
      <div class="kpi"><div class="k">Chunks indexed</div><div class="v">${num(s.chunks)}</div><div class="s">In the tenant vector index</div></div>
      <div class="kpi"><div class="k">PII values masked</div><div class="v">${num(s.piiMasked)}</div><div class="s">Before data reached the AI platform</div></div>
      <div class="kpi"><div class="k">Last sync</div><div class="v" style="font-size:18px;margin-top:6px">${esc(when(s.lastRun))}</div><div class="s">Through Boomi</div></div>
    </div>
    <div class="grid2">
      <div class="card"><div class="head"><h2>Sources</h2><button class="btn ghost sm" data-go="connections">Manage connections</button></div>
        <table class="t"><tr><th>Connection</th><th>System</th><th class="n">Documents</th><th class="n">Chunks</th><th>Last run</th><th></th></tr>
        ${know.map((k) => `<tr><td><b>${esc(k.name)}</b></td><td>${sysTag(k.type)} ${liveTag(k.type)}</td><td class="n">${num(k.documents)}</td><td class="n">${num(k.chunks)}</td><td>${esc(when(k.lastRun))}</td>
          <td><button class="btn sm ghost" data-run="${esc(k.connId)}">Run</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No connections yet</td></tr>'}</table></div>
      <div class="card"><div class="head"><h2>Recent Boomi runs</h2><button class="btn ghost sm" data-go="run">Open monitor</button></div>${jobsTable(jobs.slice(0, 8))}</div>
    </div>`;
  $('#ovRunAll').onclick = () => go('run', { all: true });
  $$('[data-go]', el).forEach((b) => (b.onclick = () => go(b.dataset.go)));
  $$('[data-run]', el).forEach((b) => (b.onclick = () => go('run', { conn: b.dataset.run })));
  $$('[data-job]', el).forEach((tr) => (tr.onclick = async () => { await go('run'); showJob(tr.dataset.job); }));
};
function jobsTable(jobs) {
  if (!jobs.length) return '<div class="empty">No runs yet</div>';
  return `<div class="wrap"><table class="t jobs"><tr><th>When</th><th>Connection</th><th class="n">Records</th><th class="n">Chunks</th><th class="n">PII</th><th class="n">Boomi</th><th>Result</th></tr>
    ${jobs.map((j) => `<tr ${j.ok ? `class="click" data-job="${esc(j.id)}" title="Show the data fetched and the mapping applied in this run"` : ''}><td>${esc(when(j.at))}</td><td>${sysTag(j.type)} ${esc(j.connName)}${j.mode === 'preview' ? ' <span class="muted small">(preview)</span>' : ''}</td>
      <td class="n">${j.stats ? num(j.stats.sourceRecords) : '-'}</td><td class="n">${j.stats ? num(j.stats.chunks) : '-'}</td><td class="n">${j.stats ? num(j.stats.piiMasked) : '-'}</td>
      <td class="n">${secs(j.boomiMs)}</td><td>${j.ok ? '<span class="badge b-good">✔</span>' : `<span class="badge b-bad" title="${esc(j.error)}">✖</span>`}</td></tr>`).join('')}</table></div>`;
}

/* ---------------- connections ---------------- */
RENDER.connections = () => {
  const el = $('#page-connections');
  el.innerHTML = `
    <div class="head"><div><h2 style="font-size:17px">Connections for ${esc(T.name)}</h2><div class="muted small">Each connection is a source system this customer feeds into its AI platform. Settings are stored per tenant; Boomi runs them all with the same pipeline.</div></div>
      <button class="btn" id="addConn">+ Add connection</button></div>
    <div class="conns">${T.connections.map((c) => `
      <div class="cc"><div class="cc-head"><div><div class="cc-name">${esc(c.name)}</div><div class="cc-sub">${sysTag(c.type)} ${liveTag(c.type)}</div></div>
        <span class="badge ${c.mapping?.title ? 'b-good' : 'b-neutral'}">${c.mapping?.title ? '✔ Mapped' : 'Not mapped'}</span></div>
        <div class="cfg">${cfgSummary(c)}</div>
        <div class="cfg">Mapping: <b>${(c.mapping?.content || []).length}</b> content, <b>${(c.mapping?.metadata || []).length}</b> metadata fields · masks <b>${(c.policy?.maskFields || []).length}</b> fields${c.policy?.autoDetect !== false ? ' + auto-detect' : ''}</div>
        <div class="cc-actions"><button class="btn sm ghost" data-prev="${esc(c.id)}">Test &amp; preview</button><button class="btn sm ghost" data-edit="${esc(c.id)}">Settings</button>
          <button class="btn sm ghost" data-map="${esc(c.id)}">Mapping</button><button class="btn sm" data-run="${esc(c.id)}">Run</button><button class="btn sm danger" data-del="${esc(c.id)}">Remove</button></div></div>`).join('') || '<div class="card empty">No connections yet - add one from the connector catalogue.</div>'}</div>`;
  $('#addConn').onclick = () => connModal();
  $$('[data-prev]', el).forEach((b) => (b.onclick = () => previewModal(b.dataset.prev)));
  $$('[data-edit]', el).forEach((b) => (b.onclick = () => connModal(T.connections.find((c) => c.id === b.dataset.edit))));
  $$('[data-map]', el).forEach((b) => (b.onclick = () => go('mapping', { conn: b.dataset.map })));
  $$('[data-run]', el).forEach((b) => (b.onclick = () => go('run', { conn: b.dataset.run })));
  $$('[data-del]', el).forEach((b) => (b.onclick = async () => {
    if (!confirm('Remove this connection and its indexed knowledge?')) return;
    await api(`/api/tenants/${T.id}/connections/${b.dataset.del}`, { method: 'DELETE' }); await refreshTenant(); RENDER.connections();
  }));
};
function openModal(html) { $('#modalCard').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

async function connModal(existing) {
  let type = existing?.type || CATALOG[0]?.type || 'SAP_S4HANA';
  const files = await api(`/api/tenants/${T.id}/files`).catch(() => []);
  const draw = () => {
    const cat = CATALOG.find((c) => c.type === type) || { config: [] };
    openModal(`<h2>${existing ? 'Connection settings' : 'Add a connection'}</h2>
      ${existing ? '' : `<div class="catalog">${CATALOG.map((c) => `<div class="cat ${c.type === type ? 'sel' : ''}" data-type="${esc(c.type)}">${sysTag(c.type)} ${liveTag(c.type)}<div class="d"><b>${esc(c.name)}</b><br>${esc(c.detail)}</div></div>`).join('')}</div>`}
      <label class="f">Connection name</label><input id="cName" style="width:100%" value="${esc(existing?.name || cat.name || '')}">
      ${cat.config.map((f) => f.key === 'fileName'
        ? `<label class="f">CSV file</label><div class="f-row"><select id="cfg_fileName">${files.map((x) => `<option ${x === existing?.config?.fileName ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
           <label class="btn ghost sm" style="flex:none">Upload CSV<input type="file" id="csvUp" accept=".csv,text/csv" hidden></label></div>`
        : `<label class="f">${esc(f.label)}</label><input id="cfg_${esc(f.key)}" style="width:100%" placeholder="${esc(f.example)}" value="${esc(existing?.config?.[f.key] ?? (existing ? '' : f.example))}">`).join('')}
      <p class="muted small">Boomi connector: <b>${esc(cat.boomiConnector || '')}</b>. In production the credentials for this connection are stored as Boomi environment extensions for ${esc(T.boomiEnvironment)}, never in the portal.</p>
      <div class="head" style="justify-content:flex-end;margin:12px 0 0"><button class="btn ghost" id="mCancel">Cancel</button><button class="btn" id="mSave">${existing ? 'Save' : 'Add connection'}</button></div>`);
    $$('.cat').forEach((d) => (d.onclick = () => { type = d.dataset.type; draw(); }));
    $('#mCancel').onclick = closeModal;
    const up = $('#csvUp');
    if (up) up.onchange = async () => {
      const f = up.files[0]; if (!f) return;
      const r = await fetch(`${API}/api/tenants/${T.id}/files`, { method: 'POST', headers: { 'X-File-Name': encodeURIComponent(f.name) }, body: f });
      const j = await r.json(); if (!r.ok) return toast(j.error || 'Upload failed');
      files.push(j.fileName); draw(); $('#cfg_fileName').value = j.fileName; toast(`Uploaded ${j.fileName}`);
    };
    $('#mSave').onclick = async () => {
      const config = {}; cat.config.forEach((f) => { const v = $('#cfg_' + f.key)?.value?.trim(); if (v) config[f.key] = f.key === 'limit' ? Number(v) : v; });
      if (existing) await api(`/api/tenants/${T.id}/connections/${existing.id}`, { method: 'PUT', body: JSON.stringify({ name: $('#cName').value, config }) });
      else { const c = await api(`/api/tenants/${T.id}/connections`, { method: 'POST', body: JSON.stringify({ type, name: $('#cName').value, config }) }); toast('Connection added - now map its fields'); closeModal(); await refreshTenant(); return go('mapping', { conn: c.id }); }
      closeModal(); await refreshTenant(); RENDER.connections(); toast('Saved');
    };
  };
  draw();
}

async function previewModal(connId) {
  const c = T.connections.find((x) => x.id === connId);
  openModal(`<h2>Test &amp; preview · ${esc(c.name)}</h2><div class="empty">Calling Boomi: <code>POST /ws/rest/aras/v1/ingest</code> (mode=preview)…</div>`);
  try {
    const r = await api(`/api/tenants/${T.id}/connections/${connId}/preview`, { method: 'POST', body: '{}' });
    if (!r.result) throw new Error(r.job.error);
    previews[connId] = r.result;
    const cols = r.result.fields.slice(0, 8).map((f) => f.name);
    openModal(`<h2>Test &amp; preview · ${esc(c.name)}</h2>
      <p class="muted small">✔ Boomi fetched <b>${num(r.result.stats.sourceRecords)}</b> records from ${sysTag(c.type)} in ${secs(r.boomi.ms)} · execution <code>${esc(r.result.executionId)}</code></p>
      <div class="wrap"><table class="t"><tr>${cols.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>
        ${r.result.sample.map((s) => `<tr>${cols.map((h) => `<td>${esc(String(s[h] ?? '').slice(0, 60))}</td>`).join('')}</tr>`).join('')}</table></div>
      <p class="small"><b>${r.result.fields.length} fields detected</b>, ${r.result.fields.filter((f) => f.pii).length} look like personal data: ${r.result.fields.filter((f) => f.pii).map((f) => `<span class="badge b-pii">${esc(f.name)}</span>`).join(' ') || 'none'}</p>
      <div class="head" style="justify-content:flex-end;margin:0"><button class="btn ghost" id="mClose">Close</button><button class="btn" id="mMap">Open mapping studio</button></div>`);
    $('#mClose').onclick = closeModal; $('#mMap').onclick = () => { closeModal(); go('mapping', { conn: connId }); };
  } catch (e) { openModal(`<h2>Preview failed</h2><p>${esc(e.message)}</p><button class="btn" onclick="closeModal()">Close</button>`); }
}

/* ---------------- mapping studio ---------------- */
let MAP_CONN = null, lastTpl = 'title';
RENDER.mapping = async (opts = {}) => {
  const el = $('#page-mapping');
  if (!T.connections.length) { el.innerHTML = '<div class="card empty">Add a connection first.</div>'; return; }
  MAP_CONN = opts.conn || (T.connections.some((c) => c.id === MAP_CONN) ? MAP_CONN : T.connections[0].id);
  const c = T.connections.find((x) => x.id === MAP_CONN);
  const key = T.id + '/' + c.id;
  drafts[key] ||= { mapping: JSON.parse(JSON.stringify(c.mapping || {})), policy: JSON.parse(JSON.stringify(c.policy || {})) };
  const d = drafts[key]; d.mapping.content ||= []; d.mapping.metadata ||= []; d.policy.maskFields ||= [];
  el.innerHTML = `
    <div class="head"><div><h2 style="font-size:17px">Mapping studio</h2><div class="muted small">Map source fields onto the AI knowledge document. The mapping is saved per tenant and applied by Boomi at run time - no code change, no redeploy.</div></div>
      <div class="f-row" style="flex:none;gap:8px"><select id="mapConn">${T.connections.map((x) => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <button class="btn ghost" id="mapPrev">Preview through Boomi</button><button class="btn" id="mapSave">Save mapping</button></div></div>
    <div class="grid-5-7">
      <div class="card"><div class="head"><h2>Source fields ${sysTag(c.type)}</h2><span class="muted small" id="fieldsNote">Loading from Boomi…</span></div><div class="fields" id="fieldList"></div></div>
      <div>
        <div class="card">
          <h2>AI knowledge document</h2>
          <div class="target"><h3>Document ID <span class="hint">template - click a field to insert</span></h3><input type="text" id="tplId" value="${esc(d.mapping.id || '')}" placeholder="{CaseNumber}"></div>
          <div class="target"><h3>Title <span class="hint">template</span></h3><input type="text" id="tplTitle" value="${esc(d.mapping.title || '')}" placeholder="Case {CaseNumber}: {Subject}"></div>
          <div class="target"><h3>Content fields <span class="hint">embedded for semantic search, in this order</span></h3><div id="contentChips"></div></div>
          <div class="target"><h3>Metadata <span class="hint">filters and citations in the AI platform</span><button class="btn sm ghost" id="addMeta">+ Add</button></h3><div id="metaRows"></div></div>
          <div class="target"><h3>Privacy &amp; sovereignty <span class="hint">applied inside Boomi, before data leaves the runtime</span></h3>
            <div class="small">Mask these fields: <span id="maskChips"></span></div>
            <label class="small"><input type="checkbox" id="autoDetect" ${d.policy.autoDetect !== false ? 'checked' : ''}> Also detect MyKad numbers, phone numbers and e-mail addresses inside free text</label>
            <div class="small mt">Chunk size: <b id="chunkVal">${d.policy.chunkSize || 500}</b> characters <input type="range" id="chunkSize" min="200" max="1500" step="50" value="${d.policy.chunkSize || 500}" style="vertical-align:middle;width:180px"></div>
            <div class="small">Classification tag: <span class="cls">${esc(T.classification)}</span> (tenant policy)</div></div>
        </div>
      </div>
    </div>
    <div id="docPrev"></div>`;
  $('#mapConn').onchange = (e) => RENDER.mapping({ conn: e.target.value });
  ['tplId', 'tplTitle'].forEach((id) => { const i = $('#' + id); i.onfocus = () => (lastTpl = id === 'tplId' ? 'id' : 'title'); i.oninput = () => { d.mapping[id === 'tplId' ? 'id' : 'title'] = i.value; }; });
  $('#autoDetect').onchange = (e) => (d.policy.autoDetect = e.target.checked);
  $('#chunkSize').oninput = (e) => { d.policy.chunkSize = Number(e.target.value); $('#chunkVal').textContent = e.target.value; };
  $('#addMeta').onclick = () => { d.mapping.metadata.push({ from: '', to: '' }); drawTargets(); };
  $('#mapSave').onclick = async () => {
    await api(`/api/tenants/${T.id}/connections/${c.id}`, { method: 'PUT', body: JSON.stringify({ mapping: d.mapping, policy: d.policy }) });
    await refreshTenant(); toast('Mapping saved for ' + T.name);
  };
  $('#mapPrev').onclick = () => runPreview(c, d);
  const drawTargets = () => {
    $('#contentChips').innerHTML = d.mapping.content.map((f, i) => `<span class="chip">${esc(f)}<button data-rm="${i}" title="Remove">✕</button></span>`).join('') || '<span class="muted small">Use "+ content" on a source field</span>';
    $$('#contentChips [data-rm]').forEach((b) => (b.onclick = () => { d.mapping.content.splice(Number(b.dataset.rm), 1); drawTargets(); drawFields(); }));
    const opts = (sel) => (previews[c.id]?.fields || []).map((f) => `<option ${f.name === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
    $('#metaRows').innerHTML = d.mapping.metadata.map((m, i) => `<div class="metarow"><select data-mf="${i}"><option value="">source field…</option>${opts(m.from)}${m.from && !(previews[c.id]?.fields || []).some((f) => f.name === m.from) ? `<option selected>${esc(m.from)}</option>` : ''}</select><span>→</span>
      <input data-mt="${i}" value="${esc(m.to)}" placeholder="metadata key"><button class="btn sm danger" data-mr="${i}">✕</button></div>`).join('') || '<span class="muted small">No metadata yet</span>';
    $$('[data-mf]').forEach((s) => (s.onchange = () => { const m = d.mapping.metadata[s.dataset.mf]; m.from = s.value; if (!m.to) { m.to = s.value.replace(/__c$/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(); drawTargets(); } }));
    $$('[data-mt]').forEach((s) => (s.oninput = () => (d.mapping.metadata[s.dataset.mt].to = s.value)));
    $$('[data-mr]').forEach((b) => (b.onclick = () => { d.mapping.metadata.splice(Number(b.dataset.mr), 1); drawTargets(); }));
    $('#maskChips').innerHTML = d.policy.maskFields.map((f) => `<span class="chip">${esc(f)}<button data-um="${esc(f)}">✕</button></span>`).join('') || '<span class="muted">none</span>';
    $$('[data-um]').forEach((b) => (b.onclick = () => { d.policy.maskFields = d.policy.maskFields.filter((x) => x !== b.dataset.um); drawTargets(); drawFields(); }));
  };
  const drawFields = () => {
    const fields = previews[c.id]?.fields || [];
    $('#fieldList').innerHTML = fields.map((f) => `<div class="fld"><div><span class="nm">${esc(f.name)}</span> ${f.pii ? '<span class="badge b-pii">PII?</span>' : ''}</div>
      <div class="acts"><button class="btn sm ghost" data-ins="${esc(f.name)}" title="Insert into the last template you edited">{ }</button>
        <button class="btn sm ghost" data-add="${esc(f.name)}" ${d.mapping.content.includes(f.name) ? 'disabled' : ''}>+ content</button>
        <button class="btn sm ghost" data-meta="${esc(f.name)}">+ meta</button>
        <button class="btn sm ${d.policy.maskFields.includes(f.name) ? '' : 'ghost'}" data-mask="${esc(f.name)}">${d.policy.maskFields.includes(f.name) ? 'Masked' : 'Mask'}</button></div>
      <div class="smp">${esc(f.sample) || '<i>empty</i>'}</div></div>`).join('');
    $$('[data-ins]').forEach((b) => (b.onclick = () => { const i = $(lastTpl === 'id' ? '#tplId' : '#tplTitle'); i.value += `{${b.dataset.ins}}`; d.mapping[lastTpl] = i.value; i.focus(); }));
    $$('[data-add]').forEach((b) => (b.onclick = () => { d.mapping.content.push(b.dataset.add); drawTargets(); drawFields(); }));
    $$('[data-meta]').forEach((b) => (b.onclick = () => { const f = b.dataset.meta; d.mapping.metadata.push({ from: f, to: f.replace(/__c$/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase() }); drawTargets(); }));
    $$('[data-mask]').forEach((b) => (b.onclick = () => { const f = b.dataset.mask; d.policy.maskFields = d.policy.maskFields.includes(f) ? d.policy.maskFields.filter((x) => x !== f) : [...d.policy.maskFields, f]; drawTargets(); drawFields(); }));
  };
  drawTargets();
  if (!previews[c.id]) {
    try { const r = await api(`/api/tenants/${T.id}/connections/${c.id}/preview`, { method: 'POST', body: '{}' }); if (r.result) previews[c.id] = r.result; else throw new Error(r.job.error);
      $('#fieldsNote').textContent = `${previews[c.id].fields.length} fields · read through Boomi in ${secs(r.boomi.ms)}`; }
    catch (e) { $('#fieldsNote').textContent = 'Could not load fields: ' + e.message; }
  } else $('#fieldsNote').textContent = `${previews[c.id].fields.length} fields (from the last Boomi preview)`;
  if (MAP_CONN === c.id && PAGE === 'mapping') { drawFields(); drawTargets(); }
};
async function runPreview(c, d) {
  const box = $('#docPrev'); box.innerHTML = '<div class="card empty">Boomi is applying the mapping…</div>';
  try {
    const r = await api(`/api/tenants/${T.id}/connections/${c.id}/preview`, { method: 'POST', body: JSON.stringify({ mapping: d.mapping, policy: d.policy }) });
    if (!r.result) throw new Error(r.job.error);
    previews[c.id] = r.result;
    box.innerHTML = `<div class="card"><div class="head"><h2>Preview through Boomi</h2><span class="muted small">${secs(r.boomi.ms)} · ${num(r.result.stats.piiMasked)} PII values masked in ${num(r.result.stats.sourceRecords)} records · not saved until you click Save mapping</span></div>
      <div id="linPrev" class="lin"></div></div>`;
    renderLineage('linPrev', c, r.result, d.mapping, d.policy, 'mapping');
  } catch (e) { box.innerHTML = `<div class="card">Preview failed: ${esc(e.message)}</div>`; }
}

/* ---------------- data lineage: source records -> mapping applied -> AI documents ---------------- */
const LIN = {};
const fieldLabel = (f) => { const s = String(f).split('__c').join('').split('_').join(' ').replace(/([a-z])([A-Z])/g, '$1 $2'); return s.charAt(0).toUpperCase() + s.slice(1); };   // same rule as the Boomi script
const fillTpl = (tpl, rec) => String(tpl || '').replace(/\{([^}]+)\}/g, (_, f) => rec[f] ?? '').trim();
const tplFields = (tpl) => [...String(tpl || '').matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
const cut = (v, n = 110) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };
function contentValue(doc, field) {
  const pre = fieldLabel(field) + ': ', line = (doc?.text || '').split('\n').find((l) => l.startsWith(pre));
  return line == null ? null : line.slice(pre.length);
}
function renderLineage(boxId, c, res, mapping = {}, policy = {}, tab = 'source', rec = 0) {
  const box = document.getElementById(boxId); if (!box) return;
  LIN[boxId] = { c, res, mapping, policy };
  const sample = res.sample || [], docs = res.documents || [], fieldNames = (res.fields || []).map((f) => f.name);
  const pii = new Set((res.fields || []).filter((f) => f.pii).map((f) => f.name)), masked = new Set(policy.maskFields || []);
  const total = res.stats?.sourceRecords ?? sample.length, system = res.connection?.system || SYS[c.type]?.label || c.type;
  const tabs = [['source', `1 · Data fetched from source <span class="cnt">${num(total)}</span>`], ['mapping', '2 · Mapping applied'], ['docs', `3 · Sent to the AI platform <span class="cnt">${num(res.stats?.documents ?? docs.length)}</span>`]];
  let body = '';
  if (tab === 'source') {
    body = !sample.length ? '<div class="empty">Boomi did not return the source records for this run. Run it again to see them.</div>' : `
      <p class="muted small">Raw records exactly as Boomi read them from <b>${esc(system)}</b>${sample.length < total ? ` · showing the first ${sample.length} of ${num(total)}` : ` · all ${num(total)} records`}.
        Fields marked <span class="badge b-pii">PII</span> are masked inside Boomi before anything reaches the AI platform; this raw view is only in the Integrasi Connect admin portal.</p>
      <div class="wrap lin-src"><table class="t"><tr><th>#</th>${fieldNames.map((f) => `<th>${esc(f)}${masked.has(f) || pii.has(f) ? ' <span class="badge b-pii">PII</span>' : ''}</th>`).join('')}</tr>
        ${sample.map((r, i) => `<tr><td class="muted">${i + 1}</td>${fieldNames.map((f) => `<td class="${masked.has(f) || pii.has(f) ? 'pii-cell' : ''}" title="${esc(r[f])}">${esc(cut(r[f]))}</td>`).join('')}</tr>`).join('')}</table></div>`;
  } else if (tab === 'mapping') {
    const raw = sample[rec] || {}, doc = docs[rec];
    const status = (src, rawV, outV) => {
      if (outV == null) return '<span class="muted small">-</span>';
      if ((Array.isArray(src) ? src : [src]).some((f) => masked.has(f))) return '<span class="badge b-pii">Masked · field policy</span>';
      if (String(outV) !== String(rawV) && /\[(MYKAD|EMAIL|PHONE|REDACTED)\]/.test(outV)) return '<span class="badge b-pii">Masked · PII detected</span>';
      return '<span class="badge b-good">✔ Copied</span>';
    };
    const rows = [];
    if (mapping.id) rows.push({ grp: 'Identity', tgt: 'Document ID', src: tplFields(mapping.id), how: `template <code>${esc(mapping.id)}</code>`, raw: fillTpl(mapping.id, raw), out: doc?.docId });
    if (mapping.title) rows.push({ grp: 'Identity', tgt: 'Title', src: tplFields(mapping.title), how: `template <code>${esc(mapping.title)}</code>`, raw: fillTpl(mapping.title, raw), out: doc?.title });
    (mapping.content || []).forEach((f, i) => rows.push({ grp: 'Content (embedded for search)', tgt: `Line ${i + 1} · "${fieldLabel(f)}"`, src: [f], how: '', raw: raw[f], out: doc ? contentValue(doc, f) : undefined }));
    (mapping.metadata || []).filter((m) => m.from && m.to).forEach((m) => rows.push({ grp: 'Metadata (filters & citations)', tgt: `metadata.${m.to}`, src: [m.from], how: '', raw: raw[m.from], out: doc?.metadata?.[m.to] }));
    ['source_system', 'connection', 'classification'].forEach((k) => doc?.metadata?.[k] != null && rows.push({ grp: 'Added by Boomi (tenant policy)', tgt: `metadata.${k}`, src: [], how: 'set automatically', raw: '', out: doc.metadata[k], auto: true }));
    const used = new Set(rows.flatMap((r) => r.src)), dropped = fieldNames.filter((f) => !used.has(f));
    let grp = '';
    body = !sample.length ? '<div class="empty">Run the source to see how this mapping transforms its records.</div>' : `
      <div class="head" style="margin-bottom:8px"><p class="muted small" style="margin:0">${boxId === 'linPrev' ? `The mapping you are editing for <b>${esc(T.name)}</b> (not saved yet), applied by Boomi in preview mode.` : `The mapping used for <b>${esc(T.name)}</b>, applied by Boomi at run time.`} Pick a record to trace each value from the source to the AI document.</p>
        <select data-linrec>${sample.map((r, i) => `<option value="${i}" ${i === rec ? 'selected' : ''}>Record ${i + 1}${docs[i] ? ' · ' + esc(cut(docs[i].docId, 30)) : ''}</option>`).join('')}</select></div>
      <div class="wrap"><table class="t lin-map"><tr><th>Target in AI document</th><th>Source field</th><th>Value in source</th><th></th><th>Value sent to AI platform</th><th>Rule</th></tr>
        ${rows.map((r) => `${r.grp !== grp ? `<tr class="grp"><td colspan="6">${esc((grp = r.grp))}</td></tr>` : ''}<tr>
          <td><b>${esc(r.tgt)}</b>${r.how ? `<div class="muted small">${r.how}</div>` : ''}</td>
          <td>${r.src.length ? r.src.map((f) => `<code>${esc(f)}</code>`).join(' ') : '<span class="muted small">-</span>'}</td>
          <td class="${r.src.some((f) => masked.has(f) || pii.has(f)) ? 'pii-cell' : ''}">${r.auto ? '<span class="muted small">-</span>' : esc(cut(r.raw, 160)) || '<i class="muted">empty</i>'}</td>
          <td class="arrow">→</td>
          <td>${r.out == null ? `<i class="muted">${doc ? 'empty - skipped' : 'not in this response'}</i>` : maskHtml(cut(r.out, 160))}</td>
          <td>${r.auto ? '<span class="badge b-neutral">Policy</span>' : status(r.src, r.raw, r.out)}</td></tr>`).join('')}</table></div>
      <p class="small mt"><b>Not sent to the AI platform</b> (fields not in the mapping): ${dropped.map((f) => `<span class="chip off">${esc(f)}</span>`).join(' ') || '<span class="muted">none - every field is used</span>'}</p>
      <p class="muted small">PII policy: masks ${masked.size ? [...masked].map((f) => `<code>${esc(f)}</code>`).join(' ') : 'no fields'}${policy.autoDetect !== false ? ', and detects MyKad numbers, phone numbers and e-mail addresses in free text' : ''} · chunk size ${esc(policy.chunkSize || 500)} characters.</p>`;
  } else {
    body = `<p class="muted small">The RAG-ready documents Boomi produced: masked, mapped and tagged with metadata${res.mode === 'preview' ? ' (preview, so nothing was indexed)' : ', then embedded into the tenant vector index'}.</p>
      <div class="result-docs">${docs.map((d) => `<div class="rdoc"><div class="tt">${maskHtml(d.title)} <span class="muted small">· ${esc(d.docId)} · ${d.chunks} chunk(s)</span></div><div class="tx">${maskHtml(d.text.split('\n').slice(1).join('\n'))}</div>
        <div class="mm">${Object.entries(d.metadata).filter(([k]) => !['tenant', 'ingested_at'].includes(k)).map(([k, v]) => `<span>${esc(k)}: ${esc(v)}</span>`).join('')}</div></div>`).join('') || '<div class="empty">No documents</div>'}</div>`;
  }
  box.innerHTML = `<div class="lin-tabs">${tabs.map(([k, l]) => `<button class="lin-tab ${k === tab ? 'active' : ''}" data-lintab="${k}">${l}</button>`).join('<span class="lin-arrow">›</span>')}</div><div class="lin-body">${body}</div>`;
  $$('[data-lintab]', box).forEach((b) => (b.onclick = () => renderLineage(boxId, c, res, mapping, policy, b.dataset.lintab, rec)));
  const sel = $('[data-linrec]', box); if (sel) sel.onchange = () => renderLineage(boxId, c, res, mapping, policy, 'mapping', Number(sel.value));
}

/* ---------------- run & monitor ---------------- */
const STEPS = [
  { id: 'portal', w: 'Integrasi Connect', t: 'Tenant request sent from the portal' },
  { id: 'api', w: 'Boomi API Service', t: 'POST /ws/rest/aras/v1/ingest', boomi: true },
  { id: 'REQUEST_RECEIVED', w: 'Boomi · [SUB] AIH Ingest Pipeline', t: 'Read tenant request: connection, mapping, PII policy', boomi: true },
  { id: 'ROUTE', w: 'Boomi · Route by source system', t: 'Route', boomi: true },
  { id: 'SOURCE_FETCHED', w: 'Boomi · source connector', t: 'Fetch records', boomi: true },
  { id: 'MAPPED', w: 'Boomi · AI data prep', t: 'Apply the tenant mapping', boomi: true },
  { id: 'PII_MASKED', w: 'Boomi · AI data prep', t: 'Mask personal data (PDPA)', boomi: true },
  { id: 'CHUNKED', w: 'Boomi · AI data prep', t: 'Chunk documents for RAG', boomi: true },
  { id: 'INDEX', w: 'Aras AI platform', t: 'Embed and index into the tenant vector store', ai: true }
];
let RUNNING = false;
RENDER.run = async (opts = {}) => {
  const el = $('#page-run');
  el.innerHTML = `
    <div class="grid-5-7">
      <div>
        <div class="card"><div class="head"><h2>Sources</h2><button class="btn" id="runAll">Run all</button></div>
          <table class="t">${T.connections.map((c) => `<tr><td><b>${esc(c.name)}</b><div>${sysTag(c.type)} ${liveTag(c.type)}</div></td>
            <td style="text-align:right"><button class="btn sm ghost" data-one="${esc(c.id)}">Run</button></td></tr>`).join('') || '<tr><td class="empty">No connections</td></tr>'}</table></div>
        <div class="card"><h2>Recent runs</h2><div id="jobsBox"></div></div>
      </div>
      <div>
        <div class="card"><div class="head"><h2>Live Boomi process</h2><span class="muted small" id="runLabel">Choose a source to run</span></div><ol class="pipeline" id="pipe"></ol></div>
      </div>
    </div>
    <div id="runResult"></div>`;
  resetPipe();
  $('#runAll').onclick = () => runMany(T.connections.map((c) => c.id));
  $$('[data-one]', el).forEach((b) => (b.onclick = () => runMany([b.dataset.one])));
  drawJobs();
  if (opts.all) runMany(T.connections.map((c) => c.id)); else if (opts.conn) runMany([opts.conn]);
};
async function drawJobs() {
  const j = await api(`/api/tenants/${T.id}/jobs`); const b = $('#jobsBox'); if (!b) return;
  b.innerHTML = jobsTable(j.slice(0, 10)) + (j.some((x) => x.ok) ? '<p class="muted small mt">Click a run to see the data fetched and the mapping applied.</p>' : '');
  $$('[data-job]', b).forEach((tr) => (tr.onclick = () => showJob(tr.dataset.job)));
}
async function showJob(id) {
  if (RUNNING) return toast('A run is in progress');
  const box = $('#runResult'); if (!box) return;
  box.innerHTML = '<div class="card empty">Loading run…</div>';
  try {
    const j = await api(`/api/tenants/${T.id}/jobs/${id}`), c = T.connections.find((x) => x.id === j.connId) || { id: j.connId, name: j.connName, type: j.type };
    if (!j.result) throw new Error(j.error || 'This run has no result');
    box.innerHTML = `<div class="card"><div class="head"><h2>${j.mode === 'preview' ? 'Preview' : 'Run'} · ${esc(j.connName)} <span class="muted small">${esc(when(j.at))}</span></h2><span class="muted small">Boomi execution <code>${esc(j.executionId || '')}</code> · ${secs(j.boomiMs)}</span></div>
      <div id="linJob" class="lin"></div></div>`;
    renderLineage('linJob', c, j.result, j.mapping || c.mapping || {}, j.policy || c.policy || {}, 'source');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { box.innerHTML = `<div class="card">${esc(e.message)}</div>`; }
}
function resetPipe(type) {
  $('#pipe').innerHTML = STEPS.map((s, i) => `<li class="step" id="st-${s.id}"><div class="d">${i + 1}</div>
    <div><div class="w ${s.boomi ? 'boomi' : s.ai ? 'ai' : ''}">${esc(s.w)}</div><div class="ti">${esc(s.id === 'SOURCE_FETCHED' && type ? SYS[type].source : s.id === 'ROUTE' && type ? `Route by source system → ${type}` : s.t)}</div><div class="de"></div></div><div class="ms"></div></li>`).join('');
}
function setStep(id, state, detail, ms) {
  const el = $('#st-' + id); if (!el) return;
  el.className = 'step ' + (state || ''); const i = STEPS.findIndex((s) => s.id === id);
  $('.d', el).textContent = { done: '✔', fail: '✖', running: '…' }[state] || String(i + 1);
  if (detail !== undefined) $('.de', el).innerHTML = detail;
  if (ms !== undefined) $('.ms', el).textContent = secs(ms);
}
async function runMany(ids) {
  if (RUNNING) return toast('A run is already in progress'); RUNNING = true;
  try { for (const id of ids) { await runOne(id); await sleep(700); } } finally { RUNNING = false; drawJobs(); }
}
async function runOne(connId) {
  const c = T.connections.find((x) => x.id === connId); if (!c) return;
  resetPipe(c.type); $('#runResult').innerHTML = '';
  $('#runLabel').innerHTML = `${sysTag(c.type)} ${esc(c.name)}`;
  STEPS.slice(2).forEach((s) => setStep(s.id, '', '<span class="muted">Queued</span>'));
  setStep('portal', 'running', `${esc(T.name)} → ${esc(c.name)}`);
  const t0 = performance.now(); await sleep(250);
  setStep('portal', 'done', `${esc(T.name)} · ${esc(c.name)}`, Math.round(performance.now() - t0));
  setStep('api', 'running', 'Waiting for the Boomi runtime…');
  let r;
  try { r = await api(`/api/tenants/${T.id}/connections/${connId}/run`, { method: 'POST', body: '{}' }); }
  catch (e) { setStep('api', 'fail', esc(e.message)); STEPS.slice(2).forEach((s) => setStep(s.id, 'skip', '')); return; }
  if (!r.result) { setStep('api', 'fail', esc(r.job.error), r.boomi?.ms); STEPS.slice(2).forEach((s) => setStep(s.id, 'skip', '')); return; }
  const res = r.result, tr = Object.fromEntries((res.trace || []).map((x) => [x.step, x]));
  setStep('api', 'done', `HTTP 200 from ${esc(r.boomi.host)} · execution <code>${esc((res.executionId || '').replace(/^execution-/, '').slice(0, 13))}…</code>`, r.boomi.ms);
  const t = (k) => Date.parse(tr[k]?.at) || null;
  const seq = [['REQUEST_RECEIVED', null], ['ROUTE', null], ['SOURCE_FETCHED', t('SOURCE_FETCHED') && t('REQUEST_RECEIVED') ? t('SOURCE_FETCHED') - t('REQUEST_RECEIVED') : null],
               ['MAPPED', t('MAPPED') && t('SOURCE_FETCHED') ? t('MAPPED') - t('SOURCE_FETCHED') : null], ['PII_MASKED', null], ['CHUNKED', null]];
  for (const [id, ms] of seq) {
    setStep(id, 'running', id === 'ROUTE' ? `DPP_SOURCE_TYPE = ${esc(c.type)}` : esc(tr[id]?.detail || '')); await sleep(380);
    const detail = id === 'ROUTE' ? `Path <b>${esc(c.type)}</b> → ${esc(SYS[c.type].source.split(' · ')[0])} connector` : id === 'PII_MASKED' ? maskHtml(tr[id]?.detail || '') : esc(tr[id]?.detail || '');
    setStep(id, 'done', detail, ms);
  }
  setStep('INDEX', 'running', 'Embedding chunks…'); await sleep(380);
  setStep('INDEX', 'done', `${num(res.chunkCount)} chunks embedded · ${num(r.indexed)} chunks now in ${esc(T.name)}'s index${window.LLM ? '' : ' (demo embedding model, runs locally)'}`, r.embedMs);
  const st = res.stats;
  $('#runResult').innerHTML = `<div class="card"><div class="head"><h2>Result · ${esc(c.name)}</h2><span class="muted small">Boomi execution <code>${esc(res.executionId)}</code></span></div>
    <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi"><div class="k">Source records</div><div class="v">${num(st.sourceRecords)}</div><div class="s">${esc(res.connection.system)}</div></div>
      <div class="kpi"><div class="k">Documents</div><div class="v">${num(st.documents)}</div><div class="s">${num(st.fieldsMapped)} fields mapped</div></div>
      <div class="kpi"><div class="k">Chunks</div><div class="v">${num(res.chunkCount)}</div><div class="s">Max ${esc(c.policy?.chunkSize || 500)} characters</div></div>
      <div class="kpi"><div class="k">PII masked</div><div class="v">${num(st.piiMasked)}</div><div class="s">${Object.entries(st.piiByType || {}).filter(([, v]) => v).map(([k, v]) => `${v} ${k === 'FIELD' ? 'fields' : k}`).join(', ') || 'none found'}</div></div></div>
    <div id="linRun" class="lin"></div></div>`;
  renderLineage('linRun', c, res, c.mapping || {}, c.policy || {}, 'source');
}

/* ---------------- AI knowledge ---------------- */
RENDER.knowledge = async () => {
  const el = $('#page-knowledge');
  const know = await api(`/api/tenants/${T.id}/knowledge`);
  const total = know.reduce((s, k) => s + k.chunks, 0);
  el.innerHTML = `
    <div class="grid-5-7">
      <div class="card"><h2>${esc(T.name)} knowledge index</h2>
        <table class="t"><tr><th>Source</th><th class="n">Docs</th><th class="n">Chunks</th></tr>
        ${know.map((k) => `<tr><td>${sysTag(k.type)} ${esc(k.name)}</td><td class="n">${num(k.documents)}</td><td class="n">${num(k.chunks)}</td></tr>`).join('')}
        <tr><td><b>Total</b></td><td></td><td class="n"><b>${num(total)}</b></td></tr></table>
        <p class="muted small mt">Every chunk carries tenant, source system, classification and record metadata, so answers can be cited and filtered.
          ${window.LLM ? `Answers are generated by <b>${esc(window.LLM)}</b> from the retrieved chunks.` : 'This demo embeds locally and returns extractive answers; in production the embedding model and LLM run on MTAI GPU infrastructure in Malaysia.'}</p>
        ${total ? '' : '<p><button class="btn" id="kRun">Run all sources first</button></p>'}</div>
      <div class="card"><h2>Ask ${esc(T.solution)}</h2>
        <div class="ask"><input id="q" placeholder="Ask a question about this customer's data…"><button class="btn" id="askBtn">Ask</button></div>
        <div class="sugg">${(T.questions || []).map((q) => `<button>${esc(q)}</button>`).join('')}</div>
        <div id="ansBox"></div></div>
    </div>`;
  if ($('#kRun')) $('#kRun').onclick = () => go('run', { all: true });
  const ask = async (q) => {
    if (!q.trim()) return; $('#q').value = q; $('#ansBox').innerHTML = '<div class="empty">Searching the vector index…</div>';
    try {
      const r = await api(`/api/tenants/${T.id}/ask`, { method: 'POST', body: JSON.stringify({ question: q }) });
      $('#ansBox').innerHTML = `<div class="answer">${maskHtml(r.answer.text)}</div>
        <div class="muted small" style="margin-bottom:8px">${r.hits.length} chunks retrieved from ${num(r.indexed)} in ${r.retrievalMs} ms · ${r.answer.mode === 'llm' ? 'answer generated by ' + esc(r.answer.model) : 'extractive answer'}</div>
        ${r.hits.map((h, i) => `<div class="hit"><div class="hh"><b>[${i + 1}]</b> ${sysTag(Object.keys(SYS).find((k) => SYS[k].label === h.metadata.source_system || h.metadata.source_system.startsWith(SYS[k].label.split(' ')[0])) || 'FILE_CSV')}
          <span>${esc(h.metadata.connection)}</span><code>${esc(h.docId)}</code><span class="score">score ${h.score}</span></div><div class="tx">${maskHtml(h.text)}</div></div>`).join('')}`;
    } catch (e) { $('#ansBox').innerHTML = `<div class="card">${esc(e.message)}</div>`; }
  };
  $('#askBtn').onclick = () => ask($('#q').value);
  $('#q').onkeydown = (e) => { if (e.key === 'Enter') ask($('#q').value); };
  $$('.sugg button', el).forEach((b) => (b.onclick = () => ask(b.textContent)));
};

/* ---------------- composable APIs ---------------- */
RENDER.apis = () => {
  const el = $('#page-apis');
  const tid = T.id;
  const boomiApis = [
    ['POST', '/ws/rest/aras/v1/ingest', 'Preview or ingest one tenant connection - routes to the source connector, applies the tenant mapping, masks PII, chunks for RAG.', null],
    ['GET', '/ws/rest/aras/v1/connectors', 'Connector catalogue (types, settings, Boomi connector used).', '/ws/rest/aras/v1/connectors'],
    ['GET', `/ws/rest/aras/v1/sources/salesforce/cases?tenant=${tid}`, 'Salesforce Service Cloud Cases for a tenant org (simulated).', `/ws/rest/aras/v1/sources/salesforce/cases?tenant=${tid}`],
    ['GET', '/ws/rest/aras/v1/sources/opendata?dataset=hospital_beds&filter=Selangor@state&sort=-date&limit=5', 'Malaysia open data (data.gov.my) through Boomi.', '/ws/rest/aras/v1/sources/opendata?dataset=hospital_beds&filter=Selangor@state&sort=-date&limit=5'],
    ['GET', '/ws/rest/saphub/v1/products?search=pump', 'SAP S/4HANA product search (existing SAPHub Product API, reused as a building block).', '/ws/rest/saphub/v1/products?search=pump']];
  const portalApis = [['GET', '/api/tenants', 'List tenants (customers) with knowledge statistics.'], ['POST', '/api/tenants', 'Onboard a new customer (provisions its Boomi environment in production).'],
    ['POST', '/api/tenants/{tenant}/connections', 'Add a source connection from the catalogue.'], ['PUT', '/api/tenants/{tenant}/connections/{id}', 'Update settings, mapping and PII policy.'],
    ['POST', '/api/tenants/{tenant}/connections/{id}/preview', 'Preview fields and mapped documents through Boomi.'], ['POST', '/api/tenants/{tenant}/connections/{id}/run', 'Run the Boomi ingestion and index the chunks.'],
    ['POST', '/api/tenants/{tenant}/ask', 'Retrieval-augmented question over the tenant knowledge index.']];
  const sample = { mode: 'ingest', tenant: { id: tid, name: T.name, classification: T.classification }, connection: T.connections[0] ? { id: T.connections[0].id, type: T.connections[0].type, config: T.connections[0].config } : {},
    mapping: T.connections[0]?.mapping || {}, policy: T.connections[0]?.policy || {} };
  el.innerHTML = `
    <div class="card"><div class="head"><div><h2>Boomi composable APIs</h2><div class="muted small">API Service <b>AIH Integrasi Connect API</b> on the Boomi runtime. Each source is its own API, so Aras Integrasi products (AISLE and others) can reuse them independently of this portal.</div></div></div>
      <table class="t">${boomiApis.map(([m, p, d, tryPath], i) => `<tr><td style="width:60px"><span class="m ${m}">${m}</span></td><td><code>${esc(p)}</code><div class="muted small">${esc(d)}</div></td>
        <td style="text-align:right">${tryPath ? `<button class="btn sm ghost" data-try="${esc(tryPath)}">Try it</button>` : '<button class="btn sm ghost" id="showBody">Example body</button>'}</td></tr>`).join('')}</table>
      <div id="tryOut"></div></div>
    <div class="card"><h2>Integrasi Connect platform APIs</h2><div class="muted small">The multi-tenant control layer Aras Integrasi owns: tenants, connections, mappings, runs and RAG queries.</div>
      <table class="t mt">${portalApis.map(([m, p, d]) => `<tr><td style="width:60px"><span class="m ${m}">${m}</span></td><td><code>${esc(p)}</code><div class="muted small">${esc(d)}</div></td></tr>`).join('')}</table></div>`;
  $$('[data-try]', el).forEach((b) => (b.onclick = async () => {
    $('#tryOut').innerHTML = `<div class="empty">Calling Boomi <code>${esc(b.dataset.try)}</code>…</div>`;
    try { const r = await api('/api/boomi?path=' + encodeURIComponent(b.dataset.try));
      $('#tryOut').innerHTML = `<p class="small">HTTP <b>${r.status}</b> in ${secs(r.ms)} · <code>GET ${esc(r.path)}</code></p><pre class="json">${esc(JSON.stringify(r.body, null, 2).slice(0, 6000))}</pre>`; }
    catch (e) { $('#tryOut').innerHTML = `<p>${esc(e.message)}</p>`; }
  }));
  $('#showBody').onclick = () => { $('#tryOut').innerHTML = `<p class="small">Example request for <b>${esc(T.name)}</b> (POST /ws/rest/aras/v1/ingest):</p><pre class="json">${esc(JSON.stringify(sample, null, 2))}</pre>`; };
};

/* ---------------- architecture ---------------- */
RENDER.architecture = () => {
  $('#page-architecture').innerHTML = `
    <div class="card"><h2>Reference architecture - sovereign, hybrid, embedded</h2>
      <div class="arch">
        <div class="zone"><h3>Customer systems (per tenant)</h3>
          <div class="box"><b>SAP S/4HANA / ECC</b>Product master, plant maintenance, finance</div>
          <div class="box"><b>Salesforce</b>Service cases, accounts, contacts</div>
          <div class="box"><b>Files and SFTP</b>CSV and Excel exports from legacy systems (SIS, CMMS, HIS)</div>
          <div class="box"><b>Government and open data APIs</b>data.gov.my, agency REST and SOAP services</div>
          <div class="box"><b>Databases</b>Oracle, SQL Server, PostgreSQL through the Database connector</div></div>
        <div class="zone boomi"><h3>Boomi - integration engine embedded in Integrasi Connect</h3>
          <div class="box"><b>Boomi runtime (data plane)</b>Runs on-premise at the customer or in MTAI's sovereign cloud in Malaysia. Data is processed here and never leaves the country.</div>
          <div class="flowline">↓</div>
          <div class="box"><b>Ingest pipeline</b>Connector → route → tenant mapping → PII masking (MyKad, phone, e-mail) → chunking → hand-off to the AI platform</div>
          <div class="box"><b>Composable APIs</b>Each source and the pipeline are APIs that other Aras products can call</div>
          <div class="box"><b>Boomi platform (control plane)</b>Design, deploy and monitor. Holds process metadata, not customer data</div></div>
        <div class="zone ai"><h3>Aras AI platform on MTAI GPU</h3>
          <div class="box"><b>Embedding model</b>Hosted on MTAI GPU clusters</div>
          <div class="box"><b>Vector database</b>Per-tenant index with metadata filters (tenant, source, classification)</div>
          <div class="box"><b>LLM and RAG services</b>Sovereign LLM answering with citations</div>
          <div class="box"><b>Applications</b>AISLE student wellbeing, maintenance assistant, patient insights</div></div>
      </div></div>
    <div class="card"><h2>How the embedded (OEM) model maps to Boomi</h2>
      <table class="t"><tr><th>Integrasi Connect concept</th><th>Boomi capability</th><th>In this demo</th></tr>
        <tr><td><b>Customer (tenant)</b></td><td>One Boomi environment per customer, created with the Platform / Partner API; runtime attached in the customer's data centre or MTAI cloud</td><td>Environment name shown per tenant; one shared Test runtime</td></tr>
        <tr><td><b>Connector catalogue</b></td><td>Integration packs and process libraries, published once and installed per tenant</td><td>4 connectors in folder <b>Companion/ArasIntegrasi-AIDataHub</b></td></tr>
        <tr><td><b>Connection settings and credentials</b></td><td>Environment extensions (connection and process properties), stored encrypted in Boomi</td><td>Settings stored per tenant in the portal</td></tr>
        <tr><td><b>Field mapping</b></td><td>Map extensions per environment, or a configuration-driven pipeline</td><td>Mapping passed at run time and applied by the Boomi pipeline</td></tr>
        <tr><td><b>Run, schedule and monitor</b></td><td>Execute Process API, schedules, execution records and Process Reporting</td><td>Live step view with the Boomi execution ID</td></tr>
        <tr><td><b>White label</b></td><td>Embedded UI components or a partner's own portal on the Boomi APIs</td><td>Integrasi Connect branding, "Powered by Boomi"</td></tr></table></div>
    <div class="grid3">
      <div class="card persona"><div class="who">Chief Strategy Officer · MTAI</div><h2>Time to revenue</h2><ul>
        <li>Each new customer is onboarded by configuration, not a project</li><li>A ready catalogue of enterprise and government connectors to sell on day one</li>
        <li>The Sovereign AI story is backed by on-premise and hybrid runtimes</li></ul></div>
      <div class="card persona"><div class="who">Chief Technology Officer · Aras Integrasi</div><h2>Engineering velocity</h2><ul>
        <li>Buy, don't build: no custom connector code to maintain</li><li>One pipeline serves every tenant; mappings are data, not code</li>
        <li>Hybrid deployment for regulated public-sector environments</li></ul></div>
      <div class="card persona"><div class="who">AI Consultant · MTAI</div><h2>RAG-ready data</h2><ul>
        <li>Clean, mapped, PII-masked, chunked documents with metadata</li><li>Composable APIs for preview, ingest and every source</li>
        <li>Feeds the vector database and LLM running on MTAI GPU</li></ul></div>
    </div>`;
};

/* ---------------- reset the demo ---------------- */
$('#resetDemo').onclick = async () => {
  if (!confirm('Reset the demo?\n\nThis clears every run, the AI knowledge index and any onboarded customers, and restores the three demo tenants with their original connections and mappings.')) return;
  const b = $('#resetDemo'); b.disabled = true; b.textContent = 'Resetting…';
  try {
    await api('/api/reset-demo', { method: 'POST', body: '{}' });
    for (const k of Object.keys(drafts)) drafts[k] = undefined;
    for (const k of Object.keys(previews)) previews[k] = undefined;
    MAP_CONN = null; closeModal(); await loadTenants(); await selectTenant(TENANTS[0]?.id, 'overview');
    toast('Demo reset - all tenants are back to their starting state');
  } catch (e) { toast('Reset failed: ' + e.message); }
  finally { b.disabled = false; b.textContent = '↺ Reset demo'; }
};

/* ---------------- onboard a new customer ---------------- */
$('#newTenant').onclick = () => {
  openModal(`<h2>Onboard a new customer</h2><p class="muted small">Creates a tenant in Integrasi Connect. In production this also provisions the customer's Boomi environment through the Boomi Platform / Partner API.</p>
    <label class="f">Customer name</label><input id="nName" style="width:100%" placeholder="e.g. Majlis Bandaraya Lestari">
    <div class="f-row"><div><label class="f">Industry</label><input id="nInd" style="width:100%" value="Public sector"></div>
      <div><label class="f">Data classification</label><select id="nCls" style="width:100%"><option>Internal</option><option>Confidential</option><option>Restricted</option><option>Public</option></select></div></div>
    <label class="f">Runtime location</label><select id="nReg" style="width:100%"><option>MTAI Sovereign Cloud - Cyberjaya</option><option>Customer data centre (on-premise runtime)</option><option>Hybrid - on-premise runtime with cloud control plane</option></select>
    <div id="prov"></div>
    <div class="head" style="justify-content:flex-end;margin:12px 0 0"><button class="btn ghost" id="nCancel">Cancel</button><button class="btn" id="nGo">Onboard customer</button></div>`);
  $('#nCancel').onclick = closeModal;
  $('#nGo').onclick = async () => {
    const name = $('#nName').value.trim(); if (!name) return toast('Enter a customer name');
    $('#nGo').disabled = true;
    const t = await api('/api/tenants', { method: 'POST', body: JSON.stringify({ name, industry: $('#nInd').value, classification: $('#nCls').value, region: $('#nReg').value, color: '#7c3aed' }) });
    const steps = [`Create tenant ${t.id} in Integrasi Connect`, `Create Boomi environment ${t.boomiEnvironment} (simulated - Platform API in production)`, `Attach runtime: ${t.region} (simulated)`,
      'Install integration pack "Integrasi Connect Sources" (simulated)', 'Ready - add connections and mappings'];
    $('#prov').innerHTML = '<ul class="prov" id="provList"></ul>';
    for (const s of steps) { $('#provList').insertAdjacentHTML('beforeend', `<li><span class="ok">✔</span> ${esc(s)}</li>`); await sleep(450); }
    await loadTenants(); await sleep(400); closeModal(); await selectTenant(t.id, 'connections');
  };
};

init();
