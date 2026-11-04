/* Copperleaf Provisions — Operations Portal
   Every data request goes to the local gateway (/api/*) which calls the Boomi API Service
   "NWPortal Order Lookup API" (/ws/rest/nwportal/v1/*). Boomi in turn calls Northwind OData V2. */
(() => {
  'use strict';

  // ---------------------------------------------------------------- utils
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d });
  const compactMoney = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const odataDate = (s) => { const m = /Date\((-?\d+)/.exec(s || ''); return m ? new Date(Number(m[1])) : null; };
  const fmtDate = (d) => d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
  const initials = (s) => String(s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const orderValue = (o) => (o.items || []).reduce((s, i) => s + Number(i.unitPrice || 0) * Number(i.quantity || 0) * (1 - Number(i.discount || 0)), 0);
  const CATEGORIES = ['Beverages', 'Condiments', 'Confections', 'Dairy Products', 'Grains/Cereals', 'Meat/Poultry', 'Produce', 'Seafood'];
  const ICON = {
    warn: '<svg viewBox="0 0 24 24"><path d="M12 2 1 21h22zm0 6 1 7h-2zm0 9a1.2 1.2 0 1 1 0 2.4A1.2 1.2 0 0 1 12 17z"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>'
  };
  const shippedPill = (d) => d ? `<span class="pill good">${ICON.ok}Shipped</span>` : `<span class="pill warn">${ICON.warn}Awaiting shipment</span>`;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600); }

  // ---------------------------------------------------------------- Boomi API + activity log
  const ROUTES = {
    dashboard: ['NWPortal API Get Dashboard', 'GET /v1/dashboard', '9× $count + 1997 sales views'],
    customers: ['NWPortal API Get Customers', 'GET /v1/customers', 'GET /Customers'],
    suppliers: ['NWPortal API Get Suppliers', 'GET /v1/suppliers', 'GET /Suppliers'],
    employees: ['NWPortal API Get Employees', 'GET /v1/employees', 'GET /Employees ($expand=Employee1)'],
    orders: ['NWPortal API Get Orders', 'GET /v1/orders', 'GET /Orders ($expand=Customer,Employee,Shipper,Order_Details)'],
    invoices: ['NWPortal API Get Invoice by Order', 'GET /v1/invoices/{orderId}', 'GET /Invoices'],
    products: ['NWPortal API Search Products', 'GET /v1/products', 'GET /Products ($expand=Category,Supplier)'],
    orderlines: ['NWPortal API Get Order Lines by Product', 'GET /v1/orderlines/{productId}', 'GET /Order_Details ($expand=Order/Customer,Product)']
  };
  let inflight = 0, calls = 0;
  function setFlow(kind, state, failAt, snap) {
    const r = ROUTES[kind] || ['', '', ''];
    if (snap) { $$('#flow li').forEach((li, i) => { li.className = i === 0 ? 'done' : ''; }); $('#fRoute').textContent = r[1]; $('#fProc').textContent = `${r[0]} (served from snapshot)`; return; }
    $('#fRoute').textContent = r[1]; $('#fProc').textContent = `${r[0]} → [SUB]`;
    $('#flow li:last-child span:not(.n)').textContent = r[2];
    $$('#flow li').forEach((li, i) => {
      li.className = state === 'run' ? (i === 0 ? 'done' : 'active') : state === 'done' ? 'done' : state === 'fail' ? (i < failAt ? 'done' : i === failAt ? 'fail' : '') : '';
    });
  }
  function addLog(kind, path, status, ms, summary, body, cache, snap) {
    const log = $('#log');
    if (!calls) log.innerHTML = '';
    calls++; $('#actCount').textContent = calls;
    const ok = status >= 200 && status < 300;
    const li = document.createElement('li');
    li.innerHTML = `<div class="r1"><span class="code ${ok ? 'ok' : 'bad'}">${status || 'ERR'}</span><code>GET ${esc(path)}</code>${cache ? '<span class="pill neutral">cache</span>' : ''}${snap ? '<span class="pill neutral">snapshot</span>' : ''}</div>
      <div class="r2"><span>${esc((ROUTES[kind] || [''])[0])}</span><span>${ms != null ? num(ms) + ' ms' : ''}</span></div>
      <div class="r2"><span>${esc(summary)}</span><span>${new Date().toLocaleTimeString()}</span></div>
      ${body ? `<details><summary>Response JSON</summary><pre></pre></details>` : ''}`;
    if (body) li.querySelector('details').addEventListener('toggle', (e) => { const pre = e.target.querySelector('pre'); if (!pre.textContent) pre.textContent = JSON.stringify(body, null, 2); }, { once: true });
    log.prepend(li);
    while (log.children.length > 40) log.lastChild.remove();
  }
  function summarise(kind, b) {
    if (kind === 'dashboard') return `KPIs + ${(b.categorySales1997?.items || []).length} categories + top ${(b.topProducts1997?.items || []).length} products`;
    if (kind === 'invoices') return `${(b.lines || []).length} invoice lines`;
    if (kind === 'orderlines') return `${(b.lines || []).length} order lines`;
    const arr = Object.values(b).find(Array.isArray) || [];
    return `${arr.length} of ${b.totalCount ?? arr.length} ${kind}`;
  }
  // ---- Data mode: 'live' when the local gateway (npm start) answers /api/health, otherwise 'snapshot'
  //      (static JSON captured from the same Boomi APIs - used on GitHub Pages where no gateway can run).
  let MODE = 'live', SNAP_META = null;
  const snapCache = new Map();
  async function snapFile(rel) {
    if (!snapCache.has(rel)) snapCache.set(rel, fetch(`data/${rel}`).then((r) => { if (!r.ok) throw Object.assign(new Error('Not in snapshot'), { status: 404 }); return r.json(); }));
    return snapCache.get(rel).catch((e) => { snapCache.delete(rel); throw e; });
  }
  const has = (v, q) => String(v || '').toLowerCase().includes(String(q || '').toLowerCase());
  const page = (arr, skip, size) => arr.slice(skip, skip + size);
  // Re-implements each Boomi route's filtering/paging over the captured data, so the UI code is identical in both modes.
  async function snapshotApi(path) {
    const u = new URL(path, 'http://x'), p = u.searchParams, skip = Number(p.get('skip') || 0), route = u.pathname.replace(/^\/api\//, '');
    if (route === 'dashboard' || route === 'employees') return snapFile(`${route}.json`);
    if (route === 'customers') {
      const all = (await snapFile('customers.json')).customers, s = p.get('search') || '';
      const f = all.filter((c) => !s || has(c.companyName, s) || has(c.contactName, s) || has(c.city, s) || has(c.country, s));
      return { totalCount: f.length, customers: page(f, skip, 20) };
    }
    if (route === 'suppliers') {
      const all = (await snapFile('suppliers.json')).suppliers, s = p.get('search') || '';
      const f = all.filter((c) => !s || has(c.companyName, s) || has(c.contactName, s) || has(c.city, s) || has(c.country, s));
      return { totalCount: f.length, suppliers: page(f, skip, 30) };
    }
    if (route === 'products') {
      const all = (await snapFile('products.json')).products;
      const f = all.filter((x) => has(x.productName, p.get('search')) && has(x.supplier, p.get('supplier')) && has(x.category, p.get('category')));
      return { totalCount: f.length, products: page(f, skip, 20) };
    }
    if (route === 'orders') {
      const all = (await snapFile('orders.json')).orders, cid = (p.get('customerId') || '').toUpperCase();
      const f = all.filter((o) => String(o.customerId).startsWith(cid) && has(o.shipName, p.get('search')));
      return { totalCount: f.length, orders: page(f, skip, 20) };
    }
    let m = route.match(/^orderlines\/(\d+)$/); if (m) return snapFile(`orderlines/${m[1]}.json`).catch(() => ({ productId: m[1], totalLines: 0, lines: [] }));
    m = route.match(/^invoices\/(\d+)$/); if (m) return snapFile(`invoices/${m[1]}.json`).catch(() => ({ orderId: m[1], lineCount: 0, lines: [] }));
    throw new Error('Unknown route');
  }
  async function api(path, { fresh = false } = {}) {
    const kind = path.split(/[/?]/)[2];
    inflight++; $('#activityBtn').classList.add('busy'); setFlow(kind, 'run');
    if (MODE === 'snapshot') {
      const t0 = performance.now();
      try {
        const body = await snapshotApi(path);
        setFlow(kind, 'done', 0, true); addLog(kind, path.replace('/api', '/v1'), 200, Math.round(performance.now() - t0), summarise(kind, body), body, false, true);
        return body;
      } catch (e) { setFlow(kind, 'fail', 2); addLog(kind, path, 0, null, e.message); throw e; }
      finally { inflight--; if (!inflight) $('#activityBtn').classList.remove('busy'); }
    }
    // Relative URL so the portal also works when hosted under a sub-path (e.g. /projects/copperleaf-portal/).
    const url = path.replace(/^\//, '') + (fresh ? (path.includes('?') ? '&' : '?') + 'fresh=1' : '');
    try {
      let res, body;
      try { res = await fetch(url); body = await res.json().catch(() => ({})); }
      catch (e) { setFlow(kind, 'fail', 1); addLog(kind, path, 0, null, 'Portal gateway unreachable'); throw Object.assign(new Error('The portal gateway is not reachable. Is "npm start" running?'), {}); }
      const bp = (res.headers.get('X-Boomi-Path') || path).replace('/ws/rest/nwportal', '');
      const ms = Number(res.headers.get('X-Boomi-Latency-Ms')) || null;
      const cache = res.headers.get('X-Cache') === 'HIT';
      if (!res.ok) {
        setFlow(kind, 'fail', res.status === 503 || res.status === 502 ? 1 : res.status === 404 ? 2 : 3);
        addLog(kind, bp, res.status, ms, body.error || 'Request failed');
        throw Object.assign(new Error(body.error || `Request failed (HTTP ${res.status})`), { detail: body.detail });
      }
      setFlow(kind, 'done'); addLog(kind, bp, res.status, ms, summarise(kind, body), body, cache);
      return body;
    } finally {
      inflight--; if (!inflight) $('#activityBtn').classList.remove('busy');
    }
  }
  const errBox = (e) => `<div class="alert"><b>${esc(e.message)}</b>${e.detail ? `<small>${esc(e.detail)}</small>` : ''}</div>`;
  const loadingNote = (t = 'Fetching live data from Boomi…') => `<div class="loading-note"><span class="spinner"></span>${esc(t)}</div>`;
  const skRows = (n = 6) => `<div class="card-b">${Array.from({ length: n }, () => '<div class="sk sk-line"></div>').join('')}</div>`;

  // ---------------------------------------------------------------- tooltip (delegated)
  const tip = $('#tip');
  document.addEventListener('mousemove', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.classList.remove('on'); return; }
    tip.innerHTML = t.getAttribute('data-tip');
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.add('on');
  });

  // ---------------------------------------------------------------- charts (single series, inline SVG)
  function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  const tipHtml = (title, value, sub) => esc(`<b>${esc(title)}</b><span class="tv">${esc(value)}</span>${sub ? `<br><span>${esc(sub)}</span>` : ''}`);
  function hbar(data, { fmt = num, axisFmt = fmt, labelW = 170, W = 640 } = {}) {
    W = Math.max(320, W); labelW = Math.min(labelW, Math.round(W * .38));
    const rowH = 30, bh = 18, top = 22, H = top + data.length * rowH + 4, plotW = W - labelW - 12;
    const max = niceMax(Math.max(...data.map((d) => d.value))), ticks = (W < 480 ? [0, .5, 1] : [0, .25, .5, .75, 1]).map((f) => f * max);
    const x = (v) => labelW + (v / max) * plotW;
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">`;
    ticks.forEach((t) => { s += `<line class="gl" x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${H}"/><text class="axis-t" x="${x(t)}" y="12" text-anchor="middle">${esc(axisFmt(t))}</text>`; });
    data.forEach((d, i) => {
      const y = top + i * rowH + (rowH - bh) / 2, w = Math.max(1, x(d.value) - labelW), r = Math.min(4, w);
      const path = `M${labelW},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${bh - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - r} z`;
      s += `<g class="row" data-tip="${tipHtml(d.label, fmt(d.value), d.sub)}"><rect class="hit" x="0" y="${top + i * rowH}" width="${W}" height="${rowH}"/>
        <text class="lab" x="${labelW - 10}" y="${y + bh / 2 + 4}" text-anchor="end">${esc(d.label.length > Math.floor(labelW / 7) ? d.label.slice(0, Math.floor(labelW / 7) - 1) + '…' : d.label)}</text>
        <path class="bar" d="${path}"/></g>`;
    });
    return s + '</svg>';
  }
  function vbar(data, { fmt = num, axisFmt = fmt, W = 520 } = {}) {
    W = Math.max(280, W);
    const H = 240, left = 44, bottom = 26, top = 10, plotH = H - top - bottom, plotW = W - left - 8;
    const max = niceMax(Math.max(...data.map((d) => d.value))), ticks = [0, .25, .5, .75, 1].map((f) => f * max);
    const y = (v) => top + plotH - (v / max) * plotH, band = plotW / data.length, bw = Math.min(64, band * .5);
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Column chart">`;
    ticks.forEach((t) => { s += `<line class="gl" x1="${left}" x2="${W - 8}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-t" x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${esc(axisFmt(t))}</text>`; });
    data.forEach((d, i) => {
      const cx = left + band * i + band / 2, h = Math.max(1, top + plotH - y(d.value)), r = Math.min(4, h), x0 = cx - bw / 2, y0 = top + plotH;
      const path = `M${x0},${y0} v-${h - r} a${r},${r} 0 0 1 ${r},-${r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`;
      s += `<g class="row" data-tip="${tipHtml(d.label, fmt(d.value), d.sub)}"><rect class="hit" x="${left + band * i}" y="${top}" width="${band}" height="${plotH + bottom}"/>
        <path class="bar" d="${path}"/><text class="lab" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text></g>`;
    });
    return s + '</svg>';
  }
  const CHARTS = new Map(); let chartSeq = 0;
  function mountCharts(root = document) {
    $$('[data-chart]', root).forEach((el) => { const c = CHARTS.get(el.dataset.chart); if (!c || !el.clientWidth) return; el.innerHTML = c.fn(c.data, { ...c.opts, W: el.clientWidth }); });
  }
  window.addEventListener('resize', debounce(() => mountCharts(), 150));
  function chartCard(title, sub, spec, rows, cols) {
    const id = 'c' + (++chartSeq); CHARTS.set(id, spec);
    return `<div class="card chartcard"><div class="card-h"><div><h2>${esc(title)}</h2><div class="sub">${esc(sub)}</div></div>
      <div class="seg" role="tablist"><button class="on" data-view="chart" type="button">Chart</button><button data-view="table" type="button">Table</button></div></div>
      <div class="card-b"><div class="chart" data-chart="${id}"></div>
      <div class="chart-table tablewrap"><table><thead><tr>${cols.map((c, i) => `<th class="${i ? 'num' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></div>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.chartcard .seg button'); if (!b) return;
    const card = b.closest('.chartcard'); $$('.seg button', card).forEach((x) => x.classList.toggle('on', x === b));
    card.classList.toggle('show-table', b.dataset.view === 'table'); mountCharts(card);
  });

  // ---------------------------------------------------------------- overlays
  const scrim = $('#scrim');
  function openDrawer(el) { $$('.drawer.open').forEach((d) => d !== el && d.classList.remove('open')); el.classList.add('open'); scrim.classList.add('on'); }
  function closeAll() { $$('.drawer.open').forEach((d) => d.classList.remove('open')); scrim.classList.remove('on'); $('#invoiceModal').classList.remove('open'); }
  scrim.addEventListener('click', closeAll);
  document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeAll(); });
  $('#invoiceModal').addEventListener('click', (e) => { if (e.target.id === 'invoiceModal') closeAll(); });
  $('#activityBtn').addEventListener('click', () => openDrawer($('#actDrawer')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#gq').focus(); }
  });
  $('#invPrint').addEventListener('click', () => window.print());

  // ---------------------------------------------------------------- invoice
  async function openInvoice(orderId) {
    const m = $('#invoiceModal'); m.classList.add('open'); $('#invMeta').textContent = `Invoice ${orderId} · loading via Boomi…`;
    $('#invoiceBody').innerHTML = `<div class="invoice">${skRows(10)}</div>`;
    try {
      const d = await api(`/api/invoices/${encodeURIComponent(orderId)}`);
      const L = d.lines || [];
      if (!L.length) { $('#invoiceBody').innerHTML = `<div class="empty"><h3>No invoice found for order ${esc(orderId)}</h3><div>Northwind order numbers run from 10248 to 11077.</div></div>`; $('#invMeta').textContent = ''; return; }
      const h = L[0], sub = L.reduce((s, l) => s + Number(l.extendedPrice || 0), 0), freight = Number(h.freight || 0);
      const addr = (a, c, r, p, co) => [a, [c, r, p].filter(Boolean).join(' '), co].filter(Boolean).map(esc).join('<br>');
      $('#invMeta').textContent = `Invoice ${h.orderId} · ${L.length} lines · ${MODE === 'snapshot' ? 'from Boomi snapshot' : 'live via Boomi'}`;
      $('#invoiceBody').innerHTML = `<div class="invoice">
        <div class="inv-top">
          <div class="inv-brand"><svg width="38" height="38" viewBox="0 0 32 32"><path d="M6 26C6 13 15 5 27 5c0 13-8 21-21 21z" fill="#b8692e"/></svg>
            <div><b>Copperleaf Provisions</b><span class="muted small">12 Harbour Row, Portland OR 97209 · accounts@copperleaf.example</span></div></div>
          <div class="inv-title"><h2>INVOICE</h2><div class="tnum"><b>#${esc(h.orderId)}</b></div><div class="muted small">Order date ${fmtDate(odataDate(h.orderDate))}</div></div>
        </div>
        <div class="inv-parties">
          <div><h4>Bill to</h4><b>${esc(h.customerName)}</b> <span class="muted">(${esc(h.customerId)})</span><br>${addr(h.address, h.city, h.region, h.postalCode, h.country)}</div>
          <div><h4>Ship to</h4><b>${esc(h.shipName)}</b><br>${addr(h.shipAddress, h.shipCity, h.shipRegion, h.shipPostalCode, h.shipCountry)}</div>
          <div><h4>Details</h4>Salesperson: <b>${esc(h.salesperson)}</b><br>Shipper: <b>${esc(h.shipperName)}</b><br>Required: ${fmtDate(odataDate(h.requiredDate))}<br>Shipped: ${h.shippedDate ? fmtDate(odataDate(h.shippedDate)) : '<span class="pill warn">' + ICON.warn + 'Not yet shipped</span>'}</div>
        </div>
        <table><thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Discount</th><th class="num">Amount</th></tr></thead>
          <tbody>${L.map((l) => `<tr><td><b>${esc(l.productName)}</b><div class="sub">Product #${esc(l.productId)}</div></td><td class="num">${num(l.quantity)}</td>
            <td class="num">${money(l.unitPrice)}</td><td class="num">${l.discount ? Math.round(l.discount * 100) + '%' : '—'}</td><td class="num"><b>${money(l.extendedPrice)}</b></td></tr>`).join('')}</tbody></table>
        <div class="inv-total"><table><tr><td>Subtotal</td><td class="num">${money(sub)}</td></tr><tr><td>Freight</td><td class="num">${money(freight)}</td></tr>
          <tr class="grand"><td>Total due</td><td class="num">${money(sub + freight)}</td></tr></table></div>
        <div class="inv-foot">Payment terms: net 30 days. Thank you for your business. · ${MODE === 'snapshot' ? 'Composed from data captured via the Boomi APIs (snapshot).' : 'Generated live from the Northwind order system via Boomi.'}</div>
      </div>`;
    } catch (e) { $('#invoiceBody').innerHTML = errBox(e); $('#invMeta').textContent = ''; }
  }

  // ---------------------------------------------------------------- router
  const PAGES = {};
  const META = {
    dashboard: ['Overview', 'Dashboard'], orders: ['Sales', 'Orders & Invoices'], insight: ['Sales', 'Order Insight'],
    products: ['Master data', 'Products'], customers: ['Master data', 'Customers'], suppliers: ['Master data', 'Suppliers'], employees: ['Master data', 'Employees']
  };
  let renderToken = 0;
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '') || 'dashboard';
    const [name, query] = h.split('?');
    return { name: PAGES[name] ? name : 'dashboard', params: new URLSearchParams(query || '') };
  }
  function go(name, params = {}) {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== 0 && v !== '0')).toString();
    location.hash = `#/${name}${q ? '?' + q : ''}`;
  }
  function route() {
    const { name, params } = parseHash();
    closeAll();
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
    $('#crumb').textContent = META[name][0]; $('#pageTitle').textContent = META[name][1];
    document.title = `${META[name][1]} · Copperleaf Provisions`;
    const token = ++renderToken;
    PAGES[name]($('#view'), params, () => token === renderToken);
  }
  window.addEventListener('hashchange', route);

  // ---------------------------------------------------------------- global search
  $('#gsearch').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#gq').value.trim(); if (!v) return;
    if (/^\d+$/.test(v)) { const n = Number(v); if (n >= 10000) return openInvoice(n); return go('insight', { product: n }); }
    go('customers', { search: v });
  });

  // ================================================================= PAGES
  // ---------------------------------------------------------------- Dashboard
  PAGES.dashboard = async (view, _p, alive) => {
    view.innerHTML = `
      <div class="grid g-kpi" id="kpis">${Array.from({ length: 6 }, () => '<div class="card kpi"><div class="sk sk-line" style="width:50%"></div><div class="sk sk-big"></div><div class="sk sk-line" style="width:70%"></div></div>').join('')}</div>
      ${loadingNote('Boomi is fanning out to 11 Northwind OData queries for the dashboard…')}
      <div class="grid g-2 mt" id="charts1"><div class="card"><div class="card-b"><div class="sk sk-chart"></div></div></div><div class="card"><div class="card-b"><div class="sk sk-chart"></div></div></div></div>
      <div class="grid g-2 mt"><div id="topProducts"><div class="card"><div class="card-b"><div class="sk sk-chart"></div></div></div></div>
        <div class="card" id="recent"><div class="card-h"><div><h2>Latest orders</h2><div class="sub">Newest first · click for invoice</div></div><a class="btn ghost" href="#/orders">View all →</a></div>${skRows(7)}</div></div>`;
    api('/api/orders?skip=0').then((d) => {
      if (!alive()) return;
      const rows = (d.orders || []).slice(0, 8);
      $('#recent').innerHTML = `<div class="card-h"><div><h2>Latest orders</h2><div class="sub">Newest first · click a row for the invoice</div></div><a class="btn ghost" href="#/orders">View all →</a></div>
        <div class="tablewrap"><table><thead><tr><th>Order</th><th>Customer</th><th class="num">Value</th><th>Status</th></tr></thead><tbody>
        ${rows.map((o) => `<tr class="click" data-inv="${o.orderId}"><td class="nowrap"><b>#${o.orderId}</b><div class="sub">${fmtDate(odataDate(o.orderDate))}</div></td>
          <td>${esc(o.customerName)}<div class="sub">${esc(o.shipCity)}, ${esc(o.shipCountry)}</div></td><td class="num"><b>${money(orderValue(o))}</b></td><td>${shippedPill(o.shippedDate)}</td></tr>`).join('')}
        </tbody></table></div>`;
    }).catch((e) => alive() && ($('#recent').innerHTML = errBox(e)));
    try {
      const d = await api('/api/dashboard');
      if (!alive()) return;
      view.querySelector('.loading-note')?.remove();
      const k = d.kpis || {}, cats = d.categorySales1997?.items || [], top = d.topProducts1997?.items || [], years = d.ordersByYear || [];
      const rev = cats.reduce((s, c) => s + Number(c.sales || 0), 0), y97 = years.find((y) => y.year === 1997)?.orders;
      const tile = (label, value, foot, icon, cls = '') => `<div class="card kpi ${cls}"><div class="ico">${icon}</div><div class="label">${label}</div><div class="value">${value}</div><div class="foot">${foot}</div></div>`;
      const I = {
        rev: '<svg viewBox="0 0 24 24"><path d="M11 3h2v2.1c2 .3 3.5 1.6 3.7 3.4h-2.1c-.2-.9-1.1-1.5-2.6-1.5-1.6 0-2.4.7-2.4 1.5 0 .9.8 1.3 2.9 1.8 2.6.6 4.4 1.5 4.4 3.8 0 1.9-1.5 3.2-3.9 3.5V19h-2v-2.4c-2.3-.3-3.9-1.7-4-3.7h2.1c.1 1.1 1.2 1.8 2.9 1.8 1.7 0 2.7-.7 2.7-1.6 0-.9-.7-1.4-3-1.9-2.4-.5-4.3-1.4-4.3-3.7 0-1.8 1.4-3.1 3.6-3.4z"/></svg>',
        ord: '<svg viewBox="0 0 24 24"><path d="M7 3h10l3 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7zm1 8v2h8v-2zm0 4v2h5v-2z"/></svg>',
        cus: '<svg viewBox="0 0 24 24"><path d="M9 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0 2c4 0 7 2 7 5v2H2v-2c0-3 3-5 7-5z"/></svg>',
        prd: '<svg viewBox="0 0 24 24"><path d="M12 2l9 5v10l-9 5-9-5V7z"/></svg>',
        emp: '<svg viewBox="0 0 24 24"><path d="M10 4h4a2 2 0 0 1 2 2v1h4v13H4V7h4V6a2 2 0 0 1 2-2zm0 3h4V6h-4z"/></svg>',
        wrn: ICON.warn
      };
      $('#kpis').innerHTML = [
        tile('Net sales 1997', compactMoney(rev), `${money(rev, 0)} across ${cats.length} categories`, I.rev, 'hero'),
        tile('Orders (all time)', num(k.orders), `${num(y97)} placed in 1997`, I.ord),
        tile('Customers', num(k.customers), 'Active trading accounts', I.cus),
        tile('Products', num(k.products), `From ${num(k.suppliers)} suppliers`, I.prd),
        tile('Employees', num(k.employees), 'Sales & management team', I.emp),
        tile('Awaiting shipment', num(k.unshippedOrders), `<span class="pill warn">${ICON.warn}Needs attention</span>`, I.wrn)
      ].join('');
      $('#kpis .kpi:last-child').classList.add('click'); $('#kpis .kpi:last-child').style.cursor = 'pointer';
      $('#kpis .kpi:last-child').addEventListener('click', () => go('orders'));
      $('#charts1').innerHTML =
        chartCard('Orders by year', 'Order count · 1996 covers Jul–Dec, 1998 covers Jan–May', { fn: vbar, data: years.map((y) => ({ label: String(y.year), value: Number(y.orders), sub: y.year === 1996 ? 'Partial year (Jul–Dec)' : y.year === 1998 ? 'Partial year (Jan–May)' : 'Full year' })), opts: {} },
          years.map((y) => [String(y.year), num(y.orders)]), ['Year', 'Orders']) +
        chartCard('Net sales by category · 1997', 'Source: Category_Sales_for_1997', { fn: hbar, data: cats.map((c) => ({ label: c.category, value: Number(c.sales), sub: `${((c.sales / rev) * 100).toFixed(1)}% of 1997 sales` })), opts: { fmt: (v) => money(v, 0), axisFmt: compactMoney, labelW: 130 } },
          cats.map((c) => [c.category, money(c.sales, 0)]), ['Category', 'Net sales']);
      $('#topProducts').innerHTML = chartCard('Top 10 products · 1997', 'Net sales · source: Product_Sales_for_1997',
        { fn: hbar, data: top.map((t) => ({ label: t.product, value: Number(t.sales), sub: t.category })), opts: { fmt: (v) => money(v, 0), axisFmt: compactMoney, labelW: 190 } },
        top.map((t) => [t.product, money(t.sales, 0)]), ['Product', 'Net sales']);
      mountCharts(view);
    } catch (e) { if (alive()) { view.querySelector('.loading-note')?.remove(); $('#kpis').outerHTML = `<div class="card">${errBox(e)}</div>`; } }
  };

  // ---------------------------------------------------------------- Orders & invoices
  PAGES.orders = async (view, p, alive) => {
    const st = { search: p.get('search') || '', customerId: p.get('customerId') || '', skip: Number(p.get('skip') || 0) };
    view.innerHTML = `<div class="card">
      <div class="toolbar">
        <input class="input" id="oSearch" placeholder="Filter by ship-to name…" value="${esc(st.search)}" style="width:260px">
        ${st.customerId ? `<span class="chip">Customer ${esc(st.customerId)} <button id="clearCust" aria-label="Remove customer filter">✕</button></span>` : ''}
        <span class="grow"></span>
        <form id="openInv" style="display:flex;gap:6px"><input class="input" id="invNo" placeholder="Order # e.g. 10248" style="width:150px" inputmode="numeric"><button class="btn primary" type="submit">Open invoice</button></form>
      </div>
      <div id="oBody">${loadingNote()}${skRows(10)}</div></div>`;
    $('#oSearch').addEventListener('input', debounce((e) => go('orders', { ...st, search: e.target.value.trim(), skip: 0 })));
    $('#clearCust')?.addEventListener('click', () => go('orders', { ...st, customerId: '', skip: 0 }));
    $('#openInv').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#invNo').value.trim(); if (/^\d+$/.test(v)) openInvoice(Number(v)); else toast('Enter a numeric order number, e.g. 10248'); });
    if (st.search) { const i = $('#oSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    if (/^\d+$/.test(p.get('invoice') || '')) openInvoice(p.get('invoice'));
    try {
      const d = await api(`/api/orders?${new URLSearchParams({ search: st.search, customerId: st.customerId, skip: st.skip })}`);
      if (!alive()) return;
      const rows = d.orders || [], total = Number(d.totalCount || 0);
      $('#oBody').innerHTML = rows.length ? `<div class="tablewrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Salesperson</th><th>Ship to</th><th>Shipper</th><th class="num">Lines</th><th class="num">Value</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map((o) => `<tr class="click" data-inv="${o.orderId}">
          <td class="nowrap"><b>#${o.orderId}</b><div class="sub">${fmtDate(odataDate(o.orderDate))}</div></td>
          <td>${esc(o.customerName)}<div class="sub"><a href="#/customers?search=${encodeURIComponent(o.customerName)}" data-stop>${esc(o.customerId)}</a></div></td>
          <td class="nowrap">${esc(o.employeeFirstName)} ${esc(o.employeeLastName)}</td>
          <td>${esc(o.shipCity)}<div class="sub">${esc(o.shipCountry)}</div></td>
          <td class="nowrap">${esc(o.shipperName)}<div class="sub">Freight ${money(o.freight)}</div></td>
          <td class="num">${(o.items || []).length}</td><td class="num"><b>${money(orderValue(o))}</b></td>
          <td>${shippedPill(o.shippedDate)}${o.shippedDate ? `<div class="sub">${fmtDate(odataDate(o.shippedDate))}</div>` : ''}</td>
          <td class="num"><button class="btn ghost" type="button">Invoice →</button></td></tr>`).join('')}</tbody></table></div>
        <div class="tfoot"><span>${num(st.skip + 1)}–${num(st.skip + rows.length)} of ${num(total)} orders · newest first</span>
          <span class="pager"><button class="btn" id="prev" ${st.skip ? '' : 'disabled'}>‹ Previous</button><button class="btn" id="next" ${st.skip + 20 < total ? '' : 'disabled'}>Next ›</button></span></div>`
        : `<div class="empty"><h3>No orders match</h3><div>Try a different ship-to name${st.customerId ? ' or remove the customer filter' : ''}.</div></div>`;
      $('#prev')?.addEventListener('click', () => go('orders', { ...st, skip: Math.max(0, st.skip - 20) }));
      $('#next')?.addEventListener('click', () => go('orders', { ...st, skip: st.skip + 20 }));
    } catch (e) { if (alive()) $('#oBody').innerHTML = errBox(e); }
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop]')) return;
    const r = e.target.closest('[data-inv]'); if (r) openInvoice(r.dataset.inv);
  });

  // ---------------------------------------------------------------- Order insight (product -> order lines)
  const EXAMPLES = [[59, 'Raclette Courdavault'], [24, 'Guaraná Fantástica'], [31, 'Gorgonzola Telino'], [60, 'Camembert Pierrot'], [41, "Jack's New England Clam Chowder"], [2, 'Chang'], [11, 'Queso Cabrales'], [1, 'Chai']];
  let catalogue = null;
  async function loadCatalogue() {
    if (catalogue) return catalogue;
    const pages = await Promise.all([0, 20, 40, 60].map((s) => api(`/api/products?skip=${s}`).catch(() => null)));
    catalogue = new Map(); pages.filter(Boolean).forEach((pg) => (pg.products || []).forEach((x) => catalogue.set(Number(x.productId), x)));
    return catalogue;
  }
  PAGES.insight = async (view, p, alive) => {
    const pid = p.get('product');
    view.innerHTML = `<div class="searchhero"><h2>Find every order that contains a product</h2>
      <p>Enter a product ID or start typing a product name — all customer orders and order lines are fetched live through Boomi.</p>
      <form class="bigsearch" id="iForm" autocomplete="off"><input id="iq" list="plist" placeholder="Product ID, e.g. 11 — or a name like “Chai”" value="${esc(pid || '')}"><datalist id="plist"></datalist><button class="btn primary" type="submit">Search orders</button></form>
      <div class="examples"><span class="lbl">Try a product ID with orders:</span>${EXAMPLES.map(([i, n]) => `<button class="ex" type="button" data-p="${i}"><b>${i}</b>${esc(n)}</button>`).join('')}</div></div>
      <div id="iRes" class="mt">${pid ? '' : '<div class="card empty"><h3>No product selected yet</h3><div>Pick an example above, search by ID or name, or open a product from the Products page.</div></div>'}</div>`;
    $$('.ex', view).forEach((b) => b.addEventListener('click', () => go('insight', { product: b.dataset.p })));
    loadCatalogue().then((c) => { if (alive() && $('#plist')) $('#plist').innerHTML = [...c.values()].sort((a, b) => a.productId - b.productId).map((x) => `<option value="${x.productId}">${esc(x.productName)}</option>`).join(''); });
    $('#iForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const v = $('#iq').value.trim(); if (!v) return;
      if (/^\d+$/.test(v)) return go('insight', { product: v });
      const c = await loadCatalogue(), lv = v.toLowerCase();
      const hit = [...c.values()].find((x) => x.productName.toLowerCase() === lv) || [...c.values()].find((x) => x.productName.toLowerCase().includes(lv));
      hit ? go('insight', { product: hit.productId }) : toast(`No product matches “${v}”`);
    });
    if (!pid) return;
    $('#iRes').innerHTML = `<div class="card">${loadingNote(`Asking Boomi for orders containing product ${pid}…`)}${skRows(8)}</div>`;
    try {
      const d = await api(`/api/orderlines/${encodeURIComponent(pid)}`);
      if (!alive()) return;
      const lines = (d.lines || []).map((l) => { const unit = +l.unitPrice || 0, qty = +l.quantity || 0, disc = +l.discount || 0; return { ...l, unit, qty, disc, total: unit * qty * (1 - disc), od: odataDate(l.orderDate), sd: odataDate(l.shippedDate) }; });
      if (!lines.length) { $('#iRes').innerHTML = `<div class="card empty"><h3>No orders found for product ${esc(pid)}</h3><div>Valid product IDs are 1–77.</div></div>`; return; }
      const name = lines[0].productName;
      let prod = catalogue?.get(Number(pid));
      if (!prod) { try { const s = await api(`/api/products?search=${encodeURIComponent(name)}`); prod = (s.products || []).find((x) => Number(x.productId) === Number(pid)); } catch { /* product card is optional */ } }
      if (!alive()) return;
      renderInsight(pid, name, prod, lines);
    } catch (e) { if (alive()) $('#iRes').innerHTML = `<div class="card">${errBox(e)}</div>`; }
  };
  function renderInsight(pid, name, prod, lines) {
    let sort = { k: 'od', dir: -1 }, filter = '';
    const units = lines.reduce((s, l) => s + l.qty, 0), rev = lines.reduce((s, l) => s + l.total, 0);
    const ds = lines.map((l) => +l.od).filter(Boolean);
    $('#iRes').innerHTML = `<div class="card"><div class="ent"><div class="badge">#${esc(pid)}</div><div style="flex:1"><h2>${esc(name)}</h2>
      <div class="meta">${prod ? `<span>Category <b>${esc(prod.category)}</b></span><span>Supplier <b>${esc(prod.supplier)}</b></span><span>List price <b>${money(prod.unitPrice)}</b></span><span>In stock <b>${num(prod.unitsInStock)}</b></span>${prod.discontinued ? '<span class="pill warn">' + ICON.warn + 'Discontinued</span>' : '<span class="pill good">' + ICON.ok + 'Active</span>'}` : ''}</div>
      <div class="meta"><span>Order history ${fmtDate(new Date(Math.min(...ds)))} – ${fmtDate(new Date(Math.max(...ds)))}</span></div></div></div>
      <div class="stats"><div><div class="v">${num(lines.length)}</div><div class="l">Order lines</div></div><div><div class="v">${num(units)}</div><div class="l">Units ordered</div></div>
      <div><div class="v">${money(rev)}</div><div class="l">Net line revenue</div></div><div><div class="v">${num(new Set(lines.map((l) => l.customerId)).size)}</div><div class="l">Customers</div></div>
      <div><div class="v">${num(new Set(lines.map((l) => l.shipCountry)).size)}</div><div class="l">Ship-to countries</div></div></div></div>
      <div class="card mt"><div class="card-h"><div><h2>Orders &amp; order lines</h2><div class="sub">Click a row to open the invoice</div></div>
        <div style="display:flex;gap:8px"><input class="input" id="lf" placeholder="Filter by order, customer, city…" style="width:230px"><button class="btn" id="csv" type="button">Export CSV</button></div></div>
        <div class="tablewrap" id="lt"></div><div class="tfoot" id="lfoot"></div></div>`;
    const cols = [['orderId', 'Order'], ['od', 'Order date'], ['customerName', 'Customer'], ['shipCountry', 'Ship to'], ['unit', 'Unit price', 1], ['qty', 'Qty', 1], ['disc', 'Discount', 1], ['total', 'Line total', 1], ['sd', 'Status']];
    function draw() {
      const f = filter.toLowerCase();
      const rows = lines.filter((l) => !f || `${l.orderId} ${l.customerName} ${l.customerId} ${l.shipCity} ${l.shipCountry}`.toLowerCase().includes(f))
        .sort((a, b) => { const x = a[sort.k], y = b[sort.k]; return (typeof x === 'string' ? String(x).localeCompare(y) : (+x || 0) - (+y || 0)) * sort.dir; });
      $('#lt').innerHTML = `<table><thead><tr>${cols.map(([k, l, n]) => `<th class="sortable ${n ? 'num' : ''}" data-k="${k}">${l}<span class="arrow">${sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</span></th>`).join('')}</tr></thead><tbody>
        ${rows.map((l) => `<tr class="click" data-inv="${l.orderId}"><td><b>#${l.orderId}</b></td><td class="nowrap">${fmtDate(l.od)}</td><td>${esc(l.customerName)}<div class="sub">${esc(l.customerId)}</div></td>
          <td>${esc(l.shipCity)}<div class="sub">${esc(l.shipCountry)}</div></td><td class="num">${money(l.unit)}</td><td class="num">${num(l.qty)}</td><td class="num">${l.disc ? Math.round(l.disc * 100) + '%' : '—'}</td>
          <td class="num"><b>${money(l.total)}</b></td><td>${shippedPill(l.sd)}</td></tr>`).join('')}</tbody></table>`;
      $('#lfoot').innerHTML = `<span>Showing ${rows.length} of ${lines.length} order lines</span><span>Source: Northwind via Boomi</span>`;
      $$('#lt th').forEach((th) => th.addEventListener('click', () => { const k = th.dataset.k; sort = { k, dir: sort.k === k ? -sort.dir : (['od', 'total', 'qty'].includes(k) ? -1 : 1) }; draw(); }));
      draw.rows = rows;
    }
    draw();
    $('#lf').addEventListener('input', (e) => { filter = e.target.value; draw(); });
    $('#csv').addEventListener('click', () => {
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const out = [['OrderID', 'OrderDate', 'CustomerID', 'Customer', 'ShipCity', 'ShipCountry', 'UnitPrice', 'Quantity', 'Discount', 'LineTotal', 'ShippedDate'].join(',')]
        .concat(draw.rows.map((l) => [l.orderId, l.od?.toISOString().slice(0, 10), l.customerId, l.customerName, l.shipCity, l.shipCountry, l.unit.toFixed(2), l.qty, l.disc, l.total.toFixed(2), l.sd ? l.sd.toISOString().slice(0, 10) : ''].map(q).join(',')));
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv' })), download: `orders_product_${pid}.csv` });
      a.click(); URL.revokeObjectURL(a.href);
    });
  }

  // ---------------------------------------------------------------- Products
  PAGES.products = async (view, p, alive) => {
    const st = { search: p.get('search') || '', category: p.get('category') || '', supplier: p.get('supplier') || '', skip: Number(p.get('skip') || 0) };
    view.innerHTML = `<div class="card"><div class="toolbar">
        <input class="input" id="pSearch" placeholder="Search product name…" value="${esc(st.search)}" style="width:240px">
        <select class="input" id="pCat"><option value="">All categories</option>${CATEGORIES.map((c) => `<option ${c === st.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        ${st.supplier ? `<span class="chip">Supplier: ${esc(st.supplier)} <button id="clrSup" aria-label="Remove supplier filter">✕</button></span>` : ''}
        <span class="grow"></span><span class="muted small">Click a product to see every order containing it</span></div>
      <div id="pBody">${loadingNote()}${skRows(10)}</div></div>`;
    $('#pSearch').addEventListener('input', debounce((e) => go('products', { ...st, search: e.target.value.trim(), skip: 0 })));
    $('#pCat').addEventListener('change', (e) => go('products', { ...st, category: e.target.value, skip: 0 }));
    $('#clrSup')?.addEventListener('click', () => go('products', { ...st, supplier: '', skip: 0 }));
    if (st.search) { const i = $('#pSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    try {
      const d = await api(`/api/products?${new URLSearchParams(st)}`);
      if (!alive()) return;
      const rows = d.products || [], total = Number(d.totalCount || 0);
      const stock = (x) => x.discontinued ? '<span class="pill neutral">Discontinued</span>' : +x.unitsInStock === 0 ? `<span class="pill crit">${ICON.x}Out of stock</span>` : +x.unitsInStock < 10 ? `<span class="pill warn">${ICON.warn}Low stock</span>` : `<span class="pill good">${ICON.ok}In stock</span>`;
      $('#pBody').innerHTML = rows.length ? `<div class="tablewrap"><table><thead><tr><th>ID</th><th>Product</th><th>Category</th><th>Supplier</th><th class="num">Unit price</th><th class="num">Units in stock</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map((x) => `<tr class="click" data-prod="${x.productId}"><td class="muted tnum">${x.productId}</td><td><b>${esc(x.productName)}</b></td><td>${esc(x.category)}</td><td>${esc(x.supplier)}</td>
          <td class="num">${money(x.unitPrice)}</td><td class="num">${num(x.unitsInStock)}</td><td>${stock(x)}</td><td class="num"><button class="btn ghost" type="button">Orders →</button></td></tr>`).join('')}</tbody></table></div>
        <div class="tfoot"><span>${num(st.skip + 1)}–${num(st.skip + rows.length)} of ${num(total)} products</span>
        <span class="pager"><button class="btn" id="prev" ${st.skip ? '' : 'disabled'}>‹ Previous</button><button class="btn" id="next" ${st.skip + 20 < total ? '' : 'disabled'}>Next ›</button></span></div>`
        : `<div class="empty"><h3>No products match</h3><div>Try another name or category.</div></div>`;
      $$('[data-prod]', view).forEach((r) => r.addEventListener('click', () => go('insight', { product: r.dataset.prod })));
      $('#prev')?.addEventListener('click', () => go('products', { ...st, skip: Math.max(0, st.skip - 20) }));
      $('#next')?.addEventListener('click', () => go('products', { ...st, skip: st.skip + 20 }));
    } catch (e) { if (alive()) $('#pBody').innerHTML = errBox(e); }
  };

  // ---------------------------------------------------------------- Customers
  PAGES.customers = async (view, p, alive) => {
    const st = { search: p.get('search') || '', skip: Number(p.get('skip') || 0) };
    view.innerHTML = `<div class="card"><div class="toolbar"><input class="input" id="cSearch" placeholder="Search company, contact, city or country…" value="${esc(st.search)}" style="width:320px">
      <span class="grow"></span><span class="muted small">Click a customer for details and order history</span></div><div id="cBody">${loadingNote()}${skRows(10)}</div></div>`;
    $('#cSearch').addEventListener('input', debounce((e) => go('customers', { search: e.target.value.trim(), skip: 0 })));
    if (st.search) { const i = $('#cSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    try {
      const d = await api(`/api/customers?${new URLSearchParams(st)}`);
      if (!alive()) return;
      const rows = d.customers || [], total = Number(d.totalCount || 0);
      $('#cBody').innerHTML = rows.length ? `<div class="tablewrap"><table><thead><tr><th>Company</th><th>Contact</th><th>City</th><th>Country</th><th>Phone</th><th></th></tr></thead><tbody>
        ${rows.map((c, i) => `<tr class="click" data-cust="${i}"><td><div style="display:flex;gap:10px;align-items:center"><div class="av c" style="width:32px;height:32px;font-size:12px">${esc(initials(c.companyName))}</div><div><b>${esc(c.companyName)}</b><div class="sub">${esc(c.customerId)}</div></div></div></td>
          <td>${esc(c.contactName)}<div class="sub">${esc(c.contactTitle)}</div></td><td>${esc(c.city)}</td><td>${esc(c.country)}</td><td class="nowrap tnum">${esc(c.phone)}</td><td class="num"><button class="btn ghost" type="button">Details →</button></td></tr>`).join('')}</tbody></table></div>
        <div class="tfoot"><span>${num(st.skip + 1)}–${num(st.skip + rows.length)} of ${num(total)} customers</span>
        <span class="pager"><button class="btn" id="prev" ${st.skip ? '' : 'disabled'}>‹ Previous</button><button class="btn" id="next" ${st.skip + 20 < total ? '' : 'disabled'}>Next ›</button></span></div>`
        : `<div class="empty"><h3>No customers match “${esc(st.search)}”</h3><div>Search by company, contact, city or country.</div></div>`;
      $$('[data-cust]', view).forEach((r) => r.addEventListener('click', () => customerPanel(rows[+r.dataset.cust])));
      $('#prev')?.addEventListener('click', () => go('customers', { ...st, skip: Math.max(0, st.skip - 20) }));
      $('#next')?.addEventListener('click', () => go('customers', { ...st, skip: st.skip + 20 }));
      if (rows.length === 1 && st.search) customerPanel(rows[0]);
    } catch (e) { if (alive()) $('#cBody').innerHTML = errBox(e); }
  };
  async function customerPanel(c) {
    const panel = $('#panel'); openDrawer(panel);
    $('#panelHead').innerHTML = `<div style="display:flex;gap:12px;align-items:center"><div class="av c">${esc(initials(c.companyName))}</div><div><h2>${esc(c.companyName)}</h2><div class="muted small">Customer ${esc(c.customerId)} · ${esc(c.city)}, ${esc(c.country)}</div></div></div>`;
    $('#panelBody').innerHTML = `<dl class="kv"><dt>Contact</dt><dd><b>${esc(c.contactName)}</b> · ${esc(c.contactTitle)}</dd><dt>Address</dt><dd>${esc(c.address)}<br>${esc([c.city, c.region, c.postalCode].filter(Boolean).join(' '))}<br>${esc(c.country)}</dd>
      <dt>Phone</dt><dd class="tnum">${esc(c.phone)}</dd>${c.fax ? `<dt>Fax</dt><dd class="tnum">${esc(c.fax)}</dd>` : ''}</dl>
      <h3 class="sec">Order history</h3><div id="cOrders">${loadingNote()}${skRows(5)}</div>`;
    try {
      const d = await api(`/api/orders?customerId=${encodeURIComponent(c.customerId)}`);
      const rows = d.orders || [], total = Number(d.totalCount || 0), value = rows.reduce((s, o) => s + orderValue(o), 0);
      $('#cOrders').innerHTML = rows.length ? `<div class="card" style="box-shadow:none"><div class="stats" style="grid-template-columns:repeat(3,1fr);border-top:0">
          <div><div class="v">${num(total)}</div><div class="l">Orders</div></div><div><div class="v">${money(value, 0)}</div><div class="l">Value${total > rows.length ? ` (latest ${rows.length})` : ''}</div></div><div><div class="v">${num(rows.filter((o) => !o.shippedDate).length)}</div><div class="l">Awaiting shipment</div></div></div></div>
        <div class="tablewrap mt"><table><thead><tr><th>Order</th><th>Salesperson</th><th class="num">Value</th><th>Status</th></tr></thead><tbody>
        ${rows.map((o) => `<tr class="click" data-inv="${o.orderId}"><td><b>#${o.orderId}</b><div class="sub">${fmtDate(odataDate(o.orderDate))}</div></td><td>${esc(o.employeeFirstName)} ${esc(o.employeeLastName)}</td><td class="num"><b>${money(orderValue(o))}</b></td><td>${shippedPill(o.shippedDate)}</td></tr>`).join('')}
        </tbody></table></div>${total > rows.length ? `<p><a href="#/orders?customerId=${encodeURIComponent(c.customerId)}">View all ${total} orders →</a></p>` : ''}`
        : '<div class="empty"><h3>No orders yet</h3></div>';
    } catch (e) { $('#cOrders').innerHTML = errBox(e); }
  }

  // ---------------------------------------------------------------- Suppliers
  PAGES.suppliers = async (view, p, alive) => {
    const st = { search: p.get('search') || '' };
    view.innerHTML = `<div class="card"><div class="toolbar"><input class="input" id="sSearch" placeholder="Search supplier, contact, city or country…" value="${esc(st.search)}" style="width:320px"><span class="grow"></span><span class="muted small" id="sCount"></span></div></div>
      <div id="sBody" class="mt">${loadingNote()}<div class="cards">${Array.from({ length: 6 }, () => '<div class="card pcard"><div class="sk sk-line" style="width:60%"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:80%"></div></div>').join('')}</div></div>`;
    $('#sSearch').addEventListener('input', debounce((e) => go('suppliers', { search: e.target.value.trim() })));
    if (st.search) { const i = $('#sSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    try {
      const d = await api(`/api/suppliers?${new URLSearchParams(st)}`);
      if (!alive()) return;
      const rows = d.suppliers || [];
      $('#sCount').textContent = `${num(d.totalCount)} suppliers`;
      $('#sBody').innerHTML = rows.length ? `<div class="cards">${rows.map((s, i) => `<div class="card pcard" data-sup="${i}" tabindex="0">
          <div class="top"><div class="av">${esc(initials(s.companyName))}</div><div><h3>${esc(s.companyName)}</h3><div class="muted small">${esc(s.city)}, ${esc(s.country)}</div></div></div>
          <div class="rows"><div><span>Contact</span>${esc(s.contactName)}</div><div><span>Title</span>${esc(s.contactTitle)}</div><div><span>Phone</span><span class="tnum" style="color:var(--ink-2)">${esc(s.phone)}</span></div></div></div>`).join('')}</div>`
        : `<div class="card empty"><h3>No suppliers match “${esc(st.search)}”</h3></div>`;
      $$('[data-sup]', view).forEach((c) => { const open = () => supplierPanel(rows[+c.dataset.sup]); c.addEventListener('click', open); c.addEventListener('keydown', (e) => e.key === 'Enter' && open()); });
    } catch (e) { if (alive()) $('#sBody').innerHTML = `<div class="card">${errBox(e)}</div>`; }
  };
  async function supplierPanel(s) {
    openDrawer($('#panel'));
    const home = String(s.homePage || '').split('#').find((x) => /^https?:/.test(x));
    $('#panelHead').innerHTML = `<div style="display:flex;gap:12px;align-items:center"><div class="av">${esc(initials(s.companyName))}</div><div><h2>${esc(s.companyName)}</h2><div class="muted small">Supplier #${esc(s.supplierId)} · ${esc(s.city)}, ${esc(s.country)}</div></div></div>`;
    $('#panelBody').innerHTML = `<dl class="kv"><dt>Contact</dt><dd><b>${esc(s.contactName)}</b> · ${esc(s.contactTitle)}</dd><dt>Address</dt><dd>${esc(s.address)}<br>${esc([s.city, s.region, s.postalCode].filter(Boolean).join(' '))}<br>${esc(s.country)}</dd>
      <dt>Phone</dt><dd class="tnum">${esc(s.phone)}</dd>${s.fax ? `<dt>Fax</dt><dd class="tnum">${esc(s.fax)}</dd>` : ''}${home ? `<dt>Website</dt><dd><a href="${esc(home)}" target="_blank" rel="noopener">${esc(home)}</a></dd>` : ''}</dl>
      <h3 class="sec">Products supplied</h3><div id="sProds">${loadingNote()}${skRows(4)}</div>`;
    try {
      const d = await api(`/api/products?supplier=${encodeURIComponent(s.companyName)}`);
      const rows = d.products || [];
      $('#sProds').innerHTML = rows.length ? `<div class="tablewrap"><table><thead><tr><th>Product</th><th>Category</th><th class="num">Price</th><th class="num">Stock</th></tr></thead><tbody>
        ${rows.map((x) => `<tr class="click" data-goprod="${x.productId}"><td><b>${esc(x.productName)}</b>${x.discontinued ? ' <span class="pill neutral">Discontinued</span>' : ''}</td><td>${esc(x.category)}</td><td class="num">${money(x.unitPrice)}</td><td class="num">${num(x.unitsInStock)}</td></tr>`).join('')}
        </tbody></table></div><p class="muted small">Click a product to see every order that contains it.</p>` : '<div class="empty">No products listed.</div>';
      $$('[data-goprod]').forEach((r) => r.addEventListener('click', () => go('insight', { product: r.dataset.goprod })));
    } catch (e) { $('#sProds').innerHTML = errBox(e); }
  }

  // ---------------------------------------------------------------- Employees
  PAGES.employees = async (view, _p, alive) => {
    view.innerHTML = `${loadingNote()}<div class="cards">${Array.from({ length: 6 }, () => '<div class="card pcard"><div class="sk sk-line" style="width:60%"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:80%"></div></div>').join('')}</div>`;
    try {
      const d = await api('/api/employees');
      if (!alive()) return;
      const rows = d.employees || [];
      const years = (iso) => { const dt = odataDate(iso); return dt ? Math.floor((Date.UTC(1998, 4, 31) - dt) / 3.15576e10) : ''; };
      view.innerHTML = `<div class="cards">${rows.map((e, i) => `<div class="card pcard" data-emp="${i}" tabindex="0">
        <div class="top"><div class="av ${e.reportsTo ? '' : 'c'}">${esc(initials(e.firstName + ' ' + e.lastName))}</div><div><h3>${esc(e.titleOfCourtesy)} ${esc(e.firstName)} ${esc(e.lastName)}</h3><div class="muted small">${esc(e.title)}</div></div></div>
        <div class="rows"><div><span>Reports to</span>${e.managerFirstName ? esc(e.managerFirstName + ' ' + e.managerLastName) : '<span class="pill neutral" style="min-width:0">Top of organisation</span>'}</div>
        <div><span>Location</span>${esc(e.city)}, ${esc(e.country)}</div><div><span>Hired</span>${fmtDate(odataDate(e.hireDate))} · ${years(e.hireDate)} yrs</div><div><span>Extension</span>${esc(e.extension)}</div></div>
        <div class="note">${esc(e.notes)}</div></div>`).join('')}</div>`;
      $$('[data-emp]', view).forEach((c) => { const open = () => employeePanel(rows[+c.dataset.emp]); c.addEventListener('click', open); c.addEventListener('keydown', (ev) => ev.key === 'Enter' && open()); });
    } catch (e) { if (alive()) view.innerHTML = `<div class="card">${errBox(e)}</div>`; }
  };
  function employeePanel(e) {
    openDrawer($('#panel'));
    $('#panelHead').innerHTML = `<div style="display:flex;gap:12px;align-items:center"><div class="av">${esc(initials(e.firstName + ' ' + e.lastName))}</div><div><h2>${esc(e.firstName)} ${esc(e.lastName)}</h2><div class="muted small">${esc(e.title)} · Employee #${esc(e.employeeId)}</div></div></div>`;
    $('#panelBody').innerHTML = `<dl class="kv"><dt>Reports to</dt><dd>${e.managerFirstName ? esc(e.managerFirstName + ' ' + e.managerLastName) : '—'}</dd><dt>Hire date</dt><dd>${fmtDate(odataDate(e.hireDate))}</dd>
      <dt>Birth date</dt><dd>${fmtDate(odataDate(e.birthDate))}</dd><dt>Address</dt><dd>${esc(e.address).replace(/\r?\n/g, '<br>')}<br>${esc([e.city, e.region, e.postalCode].filter(Boolean).join(' '))}<br>${esc(e.country)}</dd>
      <dt>Home phone</dt><dd class="tnum">${esc(e.homePhone)}</dd><dt>Extension</dt><dd>${esc(e.extension)}</dd></dl><h3 class="sec">Profile</h3><p style="margin:0;color:var(--ink-2)">${esc(e.notes)}</p>`;
  }

  // ---------------------------------------------------------------- boot
  async function boot() {
    let h = null;
    try { const r = await fetch('api/health', { cache: 'no-store' }); if (r.ok && (r.headers.get('content-type') || '').includes('json')) h = await r.json(); } catch { /* no gateway */ }
    if (h && h.boomiConfigured) {
      MODE = 'live';
      $('#conn').innerHTML = '<span class="dot on"></span><span>Boomi connected · live</span>'; $('#conn').title = h.boomiHost || '';
    } else {
      try { SNAP_META = await snapFile('meta.json'); } catch { /* no snapshot either */ }
      if (SNAP_META) {
        MODE = 'snapshot';
        const when = new Date(SNAP_META.capturedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        $('#conn').innerHTML = `<span class="dot snap"></span><span>Boomi snapshot · ${esc(when)}</span>`;
        $('#conn').title = `Captured from the live Boomi API on ${SNAP_META.capturedAt}`;
        $('.side-note').innerHTML = 'Data captured from the Boomi real-time APIs<br>Run locally with <code>npm start</code> for live calls<br><a class="back" href="../../">← All projects</a>';
        const bar = document.createElement('div'); bar.className = 'modebar';
        bar.innerHTML = `<span><b>Demo snapshot.</b> This hosted copy uses data captured from the live Boomi APIs on ${esc(when)} (${num(SNAP_META.boomiCalls)} Boomi API calls). Run it locally with the gateway for real-time Boomi calls.</span><button class="icon-btn" aria-label="Dismiss" type="button">✕</button>`;
        bar.querySelector('button').addEventListener('click', () => bar.remove());
        $('.main').insertBefore(bar, $('#view'));
        $('#actDrawer .drawer-head .muted').textContent = 'Snapshot mode: requests are answered from captured Boomi responses';
      } else if (h) {
        $('#conn').innerHTML = '<span class="dot off"></span><span>Boomi not configured</span>';
      } else {
        $('#conn').innerHTML = '<span class="dot off"></span><span>Gateway offline</span>';
      }
    }
    route();
  }
  boot();
})();
