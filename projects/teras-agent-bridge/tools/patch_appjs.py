#!/usr/bin/env python3
"""One-off patch: turns the forked Integrasi Connect app.js into the Teras Connect front end (Teras pages live in teras.js)."""
import os, sys
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'app.js')
s = open(p).read()


def rep(a, b):
    global s
    if a not in s:
        sys.exit('anchor not found: ' + a[:100])
    s = s.replace(a, b, 1)


rep("/* Integrasi Connect - AI Data Hub (Aras Integrasi) - portal front end */\nconst API = (window.AIH_GATEWAY || '').replace(/\\/+$/, '');",
    "/* Teras Connect (forked from Integrasi Connect AI Data Hub) - portal front end. Teras additions live in teras.js */\nconst API = '';\nwindow.RT = localStorage.getItem('teras-rt') || 'onprem';")
rep("headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });",
    "headers: { 'Content-Type': 'application/json', 'X-Teras-Runtime': window.RT, ...(opts.headers || {}) } });")
rep("  OPEN_DATA: { label: 'data.gov.my', source: 'data.gov.my · REST GET /data-catalogue/ (live)' }",
    "  OPEN_DATA: { label: 'data.gov.my', source: 'data.gov.my · REST GET /data-catalogue/ (live)' },\n  IBM_PSERIES: { label: 'IBM P-Series', source: 'IBM P-Series · IBM i DB2 file extract (fixed-width records, cleansed on input)' }")
rep("""    const h = await api('/api/health');
    $('#conn').className = 'conn ' + (h.boomiConfigured ? 'ok' : 'bad');
    $('#conn').textContent = h.boomiConfigured ? 'Boomi connected' : 'Boomi not configured';
    $('#conn').title = h.boomiHost ? `Boomi runtime: ${h.boomiHost} · API ${h.apiBase}` : '';
    window.LLM = h.llm;
  } catch { $('#conn').className = 'conn bad'; $('#conn').textContent = window.AIH_STATIC_ONLY ? 'Live gateway not configured' : 'Gateway offline'; }""",
    """    const h = await api('/api/health');
    window.LLM = h.llm; window.HEALTH = h; if (window.initRuntime) window.initRuntime(h);
  } catch (e) { toast('Gateway offline: ' + e.message); }""")
rep("""  $('#envBadge').textContent = `Boomi environment ${T.boomiEnvironment}`;
  $('#envBadge').title = `Runtime: ${T.region}`;""",
    """  $('#envBadge').textContent = `${T.runtime === 'onprem' ? 'On-prem placement' : 'Cloud placement'} · ${T.boomiEnvironment}`;
  $('#envBadge').title = `Runtime placement for this customer: ${T.region}`;""")
# connection cards: reuse + tool status + publish / green screen buttons
rep("""        <span class="badge ${c.mapping?.title ? 'b-good' : 'b-neutral'}">${c.mapping?.title ? '✔ Mapped' : 'Not mapped'}</span></div>
        <div class="cfg">${cfgSummary(c)}</div>""",
    """        <span class="badge ${c.mapping?.title ? 'b-good' : 'b-neutral'}">${c.mapping?.title ? '✔ Mapped' : 'Not mapped'}</span></div>
        <div class="cfg">${cfgSummary(c)}</div>
        ${c.reusedFrom ? `<div class="cfg reuse">♻ Mapping &amp; PII policy reused from <b>${esc(c.reusedFrom)}</b></div>` : ''}
        ${c.type === 'IBM_PSERIES' ? `<div class="cfg tool-line">⚒ Agent tool <code>${esc(window.toolFor ? window.toolFor(c) : '-')}</code> · <b class="${c.published ? 'pub' : 'unpub'}">${c.published ? 'Published' : 'Not published'}</b></div>` : ''}""")
rep("""<button class="btn sm" data-run="${esc(c.id)}">Run</button><button class="btn sm danger" data-del="${esc(c.id)}">Remove</button></div></div>`).join('')""",
    """<button class="btn sm" data-run="${esc(c.id)}">Run</button>${c.type === 'IBM_PSERIES' ? `<button class="btn sm ghost" data-pub="${esc(c.id)}">${c.published ? 'Unpublish tool' : 'Publish as tool'}</button><button class="btn sm ghost" data-raw="${esc(c.config?.file || 'VEHMST')}">Green screen</button>` : ''}<button class="btn sm danger" data-del="${esc(c.id)}">Remove</button></div></div>`).join('')""")
rep("""  $$('[data-run]', el).forEach((b) => (b.onclick = () => go('run', { conn: b.dataset.run })));
  $$('[data-del]', el)""",
    """  $$('[data-run]', el).forEach((b) => (b.onclick = () => go('run', { conn: b.dataset.run })));
  $$('[data-pub]', el).forEach((b) => (b.onclick = async () => { const c = T.connections.find((x) => x.id === b.dataset.pub);
    await api(`/api/tenants/${T.id}/connections/${c.id}`, { method: 'PUT', body: JSON.stringify({ published: !c.published }) }); await refreshTenant(); RENDER.connections();
    toast(c.published ? 'Tool unpublished' : `Published ${window.toolFor(c)} for the ${T.name} virtual assistant`); }));
  $$('[data-raw]', el).forEach((b) => (b.onclick = () => window.greenScreen(b.dataset.raw)));
  $$('[data-del]', el)""")
# connector catalogue = reusable library
rep("""${existing ? '' : `<div class="catalog">${CATALOG.map((c) => `<div class="cat ${c.type === type ? 'sel' : ''}" data-type="${esc(c.type)}">${sysTag(c.type)} ${liveTag(c.type)}<div class="d"><b>${esc(c.name)}</b><br>${esc(c.detail)}</div></div>`).join('')}</div>`}""",
    """${existing ? '' : `<p class="muted small">Connection library: every connector is built once in Boomi and reused by every customer. Where another customer already mapped it, their mapping template is reused too.</p><div class="catalog">${CATALOG.map((c) => { const lib = (window.LIBRARY || []).find((x) => x.type === c.type); return `<div class="cat ${c.type === type ? 'sel' : ''}" data-type="${esc(c.type)}">${sysTag(c.type)} ${liveTag(c.type)}<div class="d"><b>${esc(c.name)}</b><br>${esc(c.detail)}${lib ? `<div class="used">♻ used by ${lib.usedBy.length ? lib.usedBy.map((u) => esc(u.name.split(' (')[0])).join(', ') : 'no customer yet'}</div>` : ''}</div></div>`; }).join('')}</div>`}""")
rep("""      <p class="muted small">✔ Boomi fetched <b>${num(r.result.stats.sourceRecords)}</b> records from ${sysTag(c.type)} in ${secs(r.boomi.ms)} · execution <code>${esc(r.result.executionId)}</code></p>""",
    """      <p class="muted small">✔ Boomi fetched <b>${num(r.result.stats.sourceRecords)}</b> records from ${sysTag(c.type)} in ${secs(r.boomi.ms)} on ${window.rtBadge ? window.rtBadge(r.job.runtime) : ''} · execution <code>${esc(r.result.executionId)}</code>${c.type === 'IBM_PSERIES' ? ' · <a href="#" id="rawLink">see the raw IBM i records</a>' : ''}</p>""")
rep("""    $('#mClose').onclick = closeModal; $('#mMap').onclick = () => { closeModal(); go('mapping', { conn: connId }); };""",
    """    $('#mClose').onclick = closeModal; $('#mMap').onclick = () => { closeModal(); go('mapping', { conn: connId }); };
    if ($('#rawLink')) $('#rawLink').onclick = (e) => { e.preventDefault(); window.greenScreen(c.config?.file || 'VEHMST'); };""")
# jobs table: runtime column
rep("""<th class="n">Boomi</th><th>Result</th></tr>""", """<th class="n">Boomi</th><th>Runtime</th><th>Result</th></tr>""")
rep("""      <td class="n">${secs(j.boomiMs)}</td><td>${j.ok""", """      <td class="n">${secs(j.boomiMs)}</td><td>${window.rtBadge ? window.rtBadge(j.runtime) : ''}</td><td>${j.ok""")
# pipeline: runtime aware
rep("""  { id: 'api', w: 'Boomi API Service', t: 'POST /ws/rest/aras/v1/ingest', boomi: true },""", """  { id: 'api', w: 'Boomi runtime', t: 'POST /ws/rest/aras/v1/ingest', boomi: true },""")
rep("""<div class="ti">${esc(s.id === 'SOURCE_FETCHED' && type ? SYS[type].source : s.id === 'ROUTE' && type ? `Route by source system → ${type}` : s.t)}</div>""",
    """<div class="ti">${esc(s.id === 'SOURCE_FETCHED' && type ? SYS[type].source : s.id === 'ROUTE' && type ? `Route by source system → ${type}` : s.id === 'api' && window.rtIngest ? window.rtIngest() : s.t)}</div>""")
rep("""  setStep('api', 'done', `HTTP 200 from ${esc(r.boomi.host)} · execution""",
    """  setStep('api', 'done', `${window.rtBadge ? window.rtBadge(r.job.runtime) : ''} HTTP 200 from ${esc(r.boomi.host)}${r.boomi.runtime?.zone === 'ONPREM' ? ' (inside the firewall)' : ''} · execution""")
rep("""  setStep('api', 'running', 'Waiting for the Boomi runtime…');""", """  setStep('api', 'running', `Waiting for the ${window.RT === 'onprem' ? 'on-prem' : 'cloud'} Boomi runtime…`);""")
rep("""      <div class="kpi"><div class="k">Source records</div><div class="v">${num(st.sourceRecords)}</div><div class="s">${esc(res.connection.system)}</div></div>""",
    """      <div class="kpi"><div class="k">Source records</div><div class="v">${num(st.sourceRecords)}</div><div class="s">${esc(res.connection.system)} · ran on ${esc(res.runtime?.name || '')}</div></div>""")
rep("""  { id: 'INDEX', w: 'Aras AI platform', t: 'Embed and index into the tenant vector store', ai: true }""",
    """  { id: 'INDEX', w: 'Aras AI platform', t: 'Embed into the tenant knowledge index (the knowledge_search tool)', ai: true }""")
s = s.replace('restores the three demo tenants', 'restores the four demo tenants')
open(p, 'w').write(s)
print('app.js patched')
