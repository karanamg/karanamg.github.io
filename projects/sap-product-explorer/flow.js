/* Boomi execution monitor — visualises what the SAPHub Boomi processes behind each request do.
   The step layout mirrors the deployed processes (listener → [SUB] subprocess → OData Client connector → SAP API Business Hub).
   Boomi runs the process server-side and only returns the final response, so per-step progress is
   paced from the request's lifecycle; the result, status and timing shown are those of the real call. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = (v) => String(v || '').replace(/'/g, "''");

  const ICONS = {
    wss: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15 15 0 0 0-1.3-4A8 8 0 0 1 18.9 8zM12 4c.8 1.1 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.9 1.9-4zM4.3 14a8 8 0 0 1 0-4h3.3a16 16 0 0 0 0 4zm.8 2h3a15 15 0 0 0 1.3 4A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.3-4 15 15 0 0 0-1.3 4zM12 20c-.8-1.1-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.9-1.9 4zm2.3-6H9.7a14 14 0 0 1 0-4h4.6a14 14 0 0 1 0 4zm.3 6a15 15 0 0 0 1.3-4h3a8 8 0 0 1-4.3 4zm1.8-6a16 16 0 0 0 0-4h3.3a8 8 0 0 1 0 4z"/></svg>',
    start: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    props: '<svg viewBox="0 0 24 24"><path d="M4 6h10v2H4zm0 5h16v2H4zm0 5h7v2H4zm12-11 2 2-2 2zm-3 10h7v2h-7z"/></svg>',
    msg: '<svg viewBox="0 0 24 24"><path d="M4 4h16v12H7l-3 3zm3 4v2h10V8zm0 3v2h7v-2z"/></svg>',
    rest: '<svg viewBox="0 0 24 24"><path d="M4 7h11l-3-3 1.4-1.4L19 8l-5.6 5.4L12 12l3-3H4zm16 10H9l3 3-1.4 1.4L5 16l5.6-5.4L12 12l-3 3h11z"/></svg>',
    notify: '<svg viewBox="0 0 24 24"><path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.9V4h-2v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1z"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M3 5h6v4H3zm0 10h6v4H3zm12-5h6v4h-6zM9 7h3v10H9v-2h1v-6H9zm3 4h3v2h-3z"/></svg>',
    ret: '<svg viewBox="0 0 24 24"><path d="M19 7v4H7.8l3.6-3.6L10 6l-6 6 6 6 1.4-1.4L7.8 13H21V7z"/></svg>',
    pcall: '<svg viewBox="0 0 24 24"><path d="M3 4h8v6H3zm10 10h8v6h-8zM7 10h2v5h4v2H7z"/></svg>',
    branch: '<svg viewBox="0 0 24 24"><path d="M6 3a3 3 0 0 1 1 5.8v6.4A3 3 0 1 1 5 15.2V8.8A3 3 0 0 1 6 3zm12 0a3 3 0 0 1 1 5.8V10a4 4 0 0 1-4 4H9v-2h6a2 2 0 0 0 2-2V8.8A3 3 0 0 1 18 3z"/></svg>',
    odata: '<svg viewBox="0 0 24 24"><path d="M12 3C7.6 3 4 4.3 4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6c0-1.7-3.6-3-8-3zm0 2c3.9 0 6 1.1 6 1s-2.1 1-6 1-6-1-6-1 2.1-1 6-1zm6 13c0 .3-2.1 1-6 1s-6-.7-6-1v-2.5c1.5.7 3.6 1 6 1s4.5-.3 6-1zm0-5c0 .3-2.1 1-6 1s-6-.7-6-1v-2.5c1.5.7 3.6 1 6 1s4.5-.3 6-1z"/></svg>'
  };
  ICONS.odata2 = ICONS.odata; ICONS.catch = '<svg viewBox="0 0 24 24"><path d="M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6zm-1 5h2v6h-2zm0 8h2v2h-2z"/></svg>'; ICONS.dp = '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm11 0h2v3h3v2h-3v3h-2v-3h-3v-2h3z"/></svg>';
  const TYPE = { wss: 'Web Services Server', start: 'Start', props: 'Set Properties', msg: 'Message', rest: 'REST Client', notify: 'Notify', map: 'Map', ret: 'Return Documents', pcall: 'Process Call', branch: 'Branch', odata: 'OData Client', catch: 'Try/Catch', dp: 'Data Process' };

  // ---------------------------------------------------------------- process definitions (mirror the deployed SAPHub Boomi processes)
  function define(kind, path) {
    const u = new URL(path, 'http://x'), seg = u.pathname.split('/').filter(Boolean), p = u.searchParams;
    if (kind !== 'products') return null;
    const id = seg[2] ? decodeURIComponent(seg[2]) : null;
    if (id) {
      const k = q(id.toUpperCase());
      return {
        route: `GET /ws/rest/saphub/v1/products/${id}`, listenerName: 'SAPHub API Get Product Details', subName: '[SUB] SAPHub Get Product Details',
        listener: [{ t: 'wss', d: `GET /ws/rest/saphub/v1/products/${id}` }, { t: 'props', d: `Capture product → DPP_PRODUCT = ${id}` },
          { t: 'catch', d: 'Try/Catch: SAP errors → {"error":…}' }, { t: 'pcall', d: '[SUB] SAPHub Get Product Details', pcall: true }, { t: 'ret', d: 'HTTP response (JSON)' }],
        sub: [{ t: 'start', d: 'Data passthrough' }, { t: 'props', d: `key = '${k}' · filter = Product eq '${k}' and Language eq 'EN'` },
          { t: 'branch', d: '2 paths, run in sequence', branches: [`OData Client Query A_ProductDescription (EN) → DPP_DESCRIPTION`, `OData Client GET A_Product('${k}')`] },
          { t: 'map', d: 'A_Product + EN description → portal JSON' }, { t: 'ret', d: 'Product Details' }],
        extLabel: 'SAP API Business Hub sandbox · API_PRODUCT_SRV (OData V2, APIKey header)',
        extDetail: `GET /A_ProductDescription?$filter=Product eq '${k}' and Language eq 'EN'   +   GET /A_Product('${k}')`,
        dashboard: true
      };
    }
    const s = q(p.get('search'));
    const filter = `Language eq 'EN' and (substringof('${s}',ProductDescription) or substringof('${s}',Product))`;
    return {
      route: `GET /ws/rest/saphub/v1/products${u.search}`, listenerName: 'SAPHub API Search Products', subName: '[SUB] SAPHub Search Products',
      listener: [{ t: 'wss', d: `GET /ws/rest/saphub/v1/products${u.search}` }, { t: 'props', d: `Capture search → DPP_SEARCH = "${p.get('search') || ''}"` },
        { t: 'pcall', d: '[SUB] SAPHub Search Products', pcall: true }, { t: 'ret', d: 'HTTP response (JSON)' }],
      sub: [{ t: 'start', d: 'Data passthrough' }, { t: 'props', d: `CustomFilter = ${filter}` }, { t: 'msg', d: 'Clear document' },
        { t: 'odata', d: 'Query A_ProductDescription (top 20)', rest: true }, { t: 'props', d: 'DPP_RESULT_COUNT = Document Count' },
        { t: 'map', d: 'Each hit → products[] item' }, { t: 'dp', d: 'Combine Documents → one list' }, { t: 'map', d: 'Add search + count' }, { t: 'ret', d: 'Search Results' }],
      extLabel: 'SAP API Business Hub sandbox · API_PRODUCT_SRV (OData V2, APIKey header)',
      extDetail: `GET /A_ProductDescription?$top=20&$filter=${filter}`
    };
  }

  // ---------------------------------------------------------------- panel
  const panel = document.createElement('section');
  panel.className = 'bx'; panel.setAttribute('aria-live', 'polite'); panel.setAttribute('aria-label', 'Boomi execution monitor');
  panel.innerHTML = `<div class="bx-h"><div class="bx-title"><span class="bx-dot"></span><b>Boomi execution</b><code class="bx-route"></code></div>
      <div class="bx-tools"><span class="bx-time tnum">0.0 s</span><span class="bx-more"></span><button type="button" class="bx-btn" data-a="min" title="Minimise">–</button><button type="button" class="bx-btn" data-a="close" title="Hide until next request">✕</button></div></div>
    <div class="bx-b"></div>
    <div class="bx-f"><span class="bx-status"></span><span class="bx-note">Live result &amp; timing · step pacing is approximate (Boomi runs the process server-side)</span></div>`;
  const pill = document.createElement('button');
  pill.type = 'button'; pill.className = 'bx-pill'; pill.innerHTML = '<span class="bx-dot"></span><span class="bx-pill-t">Boomi</span>';
  document.addEventListener('DOMContentLoaded', () => { document.body.append(panel, pill); });
  if (document.readyState !== 'loading') document.body.append(panel, pill);

  let minimized = localStorage.getItem('bxMin') === '1', hidden = true, current = null, seq = 0;
  const running = new Set();
  function show() { hidden = false; layout(); }
  function layout() {
    const open = !hidden && !minimized;
    panel.classList.toggle('open', open);
    pill.classList.toggle('open', !open && seq > 0);   // after the first call, the pill re-opens the last execution
  }
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'min') { minimized = true; localStorage.setItem('bxMin', '1'); clearTimeout(autoHide); layout(); }
    if (a === 'close') { hidden = true; layout(); }
  });
  pill.addEventListener('click', () => { minimized = false; hidden = false; localStorage.setItem('bxMin', '0'); clearTimeout(autoHide); layout(); });
  let autoHide = null;
  panel.addEventListener('mouseenter', () => clearTimeout(autoHide));
  // Tuck the panel away a few seconds after the last execution finishes (unless the pointer is on it).
  function scheduleHide() {
    clearTimeout(autoHide);
    autoHide = setTimeout(() => { if (!running.size && !panel.matches(':hover')) { hidden = true; layout(); } }, 7000);
  }

  function node(step, key) {
    return `<div class="bx-n" data-k="${key}" data-state="idle" title="${esc(TYPE[step.t] + ': ' + step.d)}">
      <span class="bx-i bx-${step.t}">${ICONS[step.t]}</span><span class="bx-l">${esc(TYPE[step.t])}</span><span class="bx-d">${esc(step.d)}</span></div>`;
  }
  function render(run) {
    const f = run.flow;
    $('.bx-route', panel).textContent = f.route;
    const lane = (title, name, steps, pfx) => `<div class="bx-lane"><div class="bx-lt"><span>${title}</span><b>${esc(name)}</b></div>
      <div class="bx-row">${steps.map((s, i) => (i ? '<span class="bx-arrow"></span>' : '') + node(s, pfx + i)).join('')}</div></div>`;
    const branches = f.dashboard ? `<div class="bx-branches">${f.sub.find((s) => s.branches).branches.map((b, i) => `<span class="bx-chip" data-b="${i}" data-state="idle">${i + 1}. ${esc(b)}</span>`).join('')}</div>` : '';
    $('.bx-b', panel).innerHTML = lane('Listener process', f.listenerName, f.listener, 'L') +
      `<div class="bx-drop"><span>Process Call → subprocess</span></div>` + lane('Subprocess', f.subName, f.sub, 'S') + branches +
      `<div class="bx-ext" data-state="idle"><span class="bx-i bx-odata">${ICONS.odata}</span><div><span class="bx-l">${esc(f.extLabel)}</span>
       <span class="bx-d">${esc(f.extDetail)}</span></div></div>`;
  }
  // Execution order of the canvas steps (keys), with the REST connector / branch as the "waiting" point.
  function order(f) {
    const L = f.listener.map((_, i) => 'L' + i), S = f.sub.map((_, i) => 'S' + i);
    const pc = f.listener.findIndex((s) => s.pcall);
    const wait = f.sub.findIndex((s) => s.rest || s.branches);
    return { before: [...L.slice(0, pc + 1), ...S.slice(0, wait + 1)], wait: 'S' + wait, after: [...S.slice(wait + 1), ...L.slice(pc + 1)], pcall: 'L' + pc };
  }
  const setState = (key, st) => { const n = panel.querySelector(`[data-k="${key}"]`); if (n) n.dataset.state = st; };
  const status = (html) => { $('.bx-status', panel).innerHTML = html; };

  function start(kind, path) {
    const flow = define(kind, path); if (!flow) return null;
    const run = { id: ++seq, flow, t0: performance.now(), timers: [], state: 'running', ord: order(flow) };
    running.add(run.id); current = run; render(run); clearTimeout(autoHide); show();
    panel.dataset.state = 'running'; pill.dataset.state = 'running';
    status(`<span class="bx-spin"></span>Boomi is executing <b>${esc(flow.listenerName)}</b>…`);
    const steps = run.ord.before;
    steps.forEach((k, i) => run.timers.push(setTimeout(() => {
      if (run !== current || run.state !== 'running') return;
      if (i > 0 && steps[i - 1] !== run.ord.pcall) setState(steps[i - 1], 'done');
      setState(k, 'active');
      if (k === run.ord.wait) {
        panel.querySelector('.bx-ext').dataset.state = 'active';
        status(`<span class="bx-spin"></span>${flow.dashboard ? 'Branch: fetching the EN description and the product from SAP…' : 'OData Client connector waiting for SAP…'}`);
        if (flow.dashboard) animateBranches(run);
      }
    }, 120 + i * 260)));
    run.tick = setInterval(() => { if (run === current) $('.bx-time', panel).textContent = ((performance.now() - run.t0) / 1000).toFixed(1) + ' s'; }, 100);
    updateMore();
    return run;
  }
  function animateBranches(run) {
    const chips = [...panel.querySelectorAll('.bx-chip')]; let i = 0;
    const step = () => {
      if (run !== current || run.state !== 'running') return;
      if (i > 0) chips[i - 1].dataset.state = 'done';
      if (i < chips.length) { chips[i].dataset.state = 'active'; if (i < chips.length - 1) i++; run.timers.push(setTimeout(step, 750)); }
    };
    step();
  }
  function finish(run, ok, info) {
    if (!run) return;
    run.state = ok ? 'done' : 'fail'; running.delete(run.id); clearInterval(run.tick); run.timers.forEach(clearTimeout);
    updateMore();
    if (!running.size) scheduleHide();
    if (run !== current) { layout(); return; }
    const secs = ((info.ms != null ? info.ms : performance.now() - run.t0) / 1000).toFixed(1);
    $('.bx-time', panel).textContent = `${secs} s`;
    const all = [...run.ord.before, ...run.ord.after];
    if (ok) {
      panel.querySelectorAll('.bx-chip').forEach((c) => { c.dataset.state = 'done'; });
      if (info.cache || info.snap) {
        all.forEach((k) => setState(k, 'skip')); panel.querySelector('.bx-ext').dataset.state = 'skip';
        status(info.cache ? `<span class="bx-ok">↺</span> Served from the gateway cache (${esc(info.cacheAge || '?')} s old): no new Boomi execution needed · ${esc(info.summary)}`
          : `<span class="bx-ok">↺</span> Live gateway unavailable: answered from captured Boomi data · ${esc(info.summary)}`);
        panel.dataset.state = 'done'; pill.dataset.state = 'done'; layout(); return;
      }
      setState(run.ord.wait, 'done'); panel.querySelector('.bx-ext').dataset.state = 'done';
      [...run.ord.before].forEach((k) => setState(k, 'done'));
      run.ord.after.forEach((k, i) => run.timers.push(setTimeout(() => {
        if (run !== current) return;
        setState(k, 'done');
        if (i === run.ord.after.length - 1) { panel.dataset.state = 'done'; pill.dataset.state = 'done'; }
      }, 90 + i * 110)));
      status(`<span class="bx-ok">✓</span> Boomi execution complete · HTTP ${esc(info.status || 200)} in <b>${secs} s</b> · ${esc(info.summary)}`);
    } else {
      const active = panel.querySelector('.bx-n[data-state="active"]:last-of-type') || panel.querySelector(`[data-k="${run.ord.wait}"]`);
      panel.querySelectorAll('.bx-n[data-state="active"]').forEach((n) => { n.dataset.state = 'fail'; });
      if (active) active.dataset.state = 'fail';
      status(`<span class="bx-err">✕</span> ${esc(info.error || 'Request failed')}`);
      panel.dataset.state = 'fail'; pill.dataset.state = 'fail';
    }
    layout();
  }
  function updateMore() {
    const others = [...running].filter((id) => !current || id !== current.id).length;
    $('.bx-more', panel).textContent = others ? `+${others} more running` : '';
    $('.bx-pill-t', pill).textContent = running.size ? `Boomi running (${running.size})` : 'Boomi execution';
    pill.dataset.state = running.size ? 'running' : (current?.state || 'done');
  }
  window.BoomiFlow = { start, done: (run, info) => finish(run, true, info || {}), fail: (run, info) => finish(run, false, info || {}) };
})();
