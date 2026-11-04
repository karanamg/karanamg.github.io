/* Meridian Industrial — Product Master Explorer
   Browser → gateway (/api/*) → Boomi API Service "SAPHub Product API" (/ws/rest/saphub/v1)
   → OData Client connector → SAP API Business Hub sandbox (API_PRODUCT_SRV). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API_BASE = (() => { const b = String((window.PORTAL_CONFIG || {}).apiBase || ''); return b && !b.endsWith('/') ? b + '/' : b; })();
  const EXAMPLES = ['bike', 'motor', 'valve', 'gear', 'pump', 'paint', 'cable', 'consult'];
  const TYPES = { FERT: 'Finished product', HALB: 'Semi-finished product', ROH: 'Raw material', HAWA: 'Trading goods', SERV: 'Service', DIEN: 'Service', MAT: 'Material', VERP: 'Packaging', NLAG: 'Non-stock material', UNBW: 'Non-valuated material', ERSA: 'Spare part' };
  const fmtDate = (s) => { if (!s) return ''; const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z'); return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  const fmtNum = (n, unit) => (n === undefined || n === null || n === '') ? '' : `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 })}${unit ? ' ' + unit : ''}`;
  let selected = null, lastRaw = null, searchSeq = 0, detailSeq = 0;

  // ---------------------------------------------------------------- API (with Boomi execution monitor)
  async function api(path) {
    const BF = window.BoomiFlow, run = BF ? BF.start('products', path) : null;
    let res, body;
    try { res = await fetch(API_BASE + path.replace(/^\//, '')); body = await res.json().catch(() => ({})); }
    catch { BF?.fail(run, { error: 'Gateway not reachable' }); throw new Error('The Boomi gateway is not reachable right now. Please try again shortly.'); }
    const ms = Number(res.headers.get('X-Boomi-Latency-Ms')) || null, cache = res.headers.get('X-Cache') === 'HIT';
    if (!res.ok) { BF?.fail(run, { error: `${body.error || 'Request failed'} (HTTP ${res.status})` }); throw Object.assign(new Error(body.error || `Request failed (HTTP ${res.status})`), { detail: body.detail }); }
    if (body.error) { BF?.fail(run, { error: body.error }); throw Object.assign(new Error(body.error), { soft: true }); }
    const summary = body.products ? `${body.count} product(s)` : `${body.product} · ${body.description || 'no EN description'}`;
    BF?.done(run, { status: res.status, ms: cache ? null : ms, cache, cacheAge: res.headers.get('X-Cache-Age-S'), summary });
    return body;
  }

  // ---------------------------------------------------------------- search
  async function search(term) {
    const my = ++searchSeq;
    $('#q').value = term;
    $('#listTitle').textContent = term ? `Results for “${term}”` : 'Products';
    $('#listCount').textContent = '';
    $('#results').innerHTML = `<li class="loading"><span class="spinner"></span>Searching SAP via Boomi…</li>`;
    updateHash();
    try {
      const d = await api(`/api/products?${new URLSearchParams({ search: term })}`);
      if (my !== searchSeq) return;
      const list = d.products || [];
      $('#listCount').textContent = `${list.length} shown`;
      $('#results').innerHTML = list.length ? list.map((p) => `<li data-p="${esc(p.product)}" class="${p.product === selected ? 'sel' : ''}" tabindex="0">
          <span class="pn">${esc(p.product)}</span><span class="ds">${esc(p.description)}</span></li>`).join('')
        : `<li class="none">No products match “${esc(term)}”.<br>Try a product number or another English word.</li>`;
    } catch (e) {
      if (my === searchSeq) $('#results').innerHTML = `<li class="none">${esc(e.message)}</li>`;
    }
  }
  $('#results').addEventListener('click', (e) => { const li = e.target.closest('li[data-p]'); if (li) openProduct(li.dataset.p); });
  $('#results').addEventListener('keydown', (e) => { const li = e.target.closest('li[data-p]'); if (li && e.key === 'Enter') openProduct(li.dataset.p); });
  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); search($('#q').value.trim()); });
  $('#examples').insertAdjacentHTML('beforeend', EXAMPLES.map((t) => `<button type="button" data-t="${t}">${t}</button>`).join(''));
  $('#examples').addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (b) search(b.dataset.t); });

  // ---------------------------------------------------------------- details
  async function openProduct(id) {
    const my = ++detailSeq;
    selected = String(id).toUpperCase();
    $$('#results li[data-p]').forEach((li) => li.classList.toggle('sel', li.dataset.p === selected));
    updateHash();
    $('#detail').innerHTML = `<div class="obj-head"><div class="kicker">Product</div><h1>${esc(selected)}</h1><div class="muted"><span class="spinner"></span>Loading from SAP via Boomi…</div></div>
      <div style="padding:20px 24px">${Array.from({ length: 8 }, () => '<div class="sk"></div>').join('')}</div>`;
    try {
      const d = await api(`/api/products/${encodeURIComponent(selected)}`);
      if (my !== detailSeq) return;
      lastRaw = d; renderProduct(d);
    } catch (e) {
      if (my !== detailSeq) return;
      $('#detail').innerHTML = `<div class="obj-head"><div class="kicker">Product</div><h1>${esc(selected)}</h1></div>
        <div class="alert"><b>${esc(e.soft ? `Product ${selected} was not found in SAP.` : e.message)}</b>${e.detail ? `<small>${esc(e.detail)}</small>` : ''}<small>Check the product number, or search by description on the left.</small></div>`;
    }
  }
  function renderProduct(d) {
    const row = (label, value) => `<dt>${esc(label)}</dt><dd class="${value ? '' : 'na'}">${value ? esc(value) : '—'}</dd>`;
    const deleted = String(d.isMarkedForDeletion) === 'true';
    $('#detail').innerHTML = `
      <div class="obj-head">
        <div class="kicker">Product · ${esc(TYPES[d.productType] || d.productType || '')}</div>
        <h1>${esc(d.description || '(no English description)')}</h1>
        <div class="pn">${esc(d.product)}</div>
        <div class="badges">
          ${d.productType ? `<span class="badge blue">Type ${esc(d.productType)}</span>` : ''}
          ${d.productGroup ? `<span class="badge">Group ${esc(d.productGroup)}</span>` : ''}
          ${d.baseUnit ? `<span class="badge">Base unit ${esc(d.baseUnit)}</span>` : ''}
          <span class="badge ${deleted ? 'crit' : 'good'}">${deleted ? 'Marked for deletion' : 'Active'}</span>
          ${d.description ? `<span class="badge">Description language ${esc(d.descriptionLanguage || 'EN')}</span>` : ''}
        </div>
      </div>
      <div class="kpis">
        <div><div class="v tnum">${esc(fmtNum(d.grossWeight, d.weightUnit) || '—')}</div><div class="l">Gross weight</div></div>
        <div><div class="v tnum">${esc(fmtNum(d.netWeight, d.weightUnit) || '—')}</div><div class="l">Net weight</div></div>
        <div><div class="v tnum">${esc(fmtNum(d.materialVolume, d.volumeUnit) || '—')}</div><div class="l">Volume</div></div>
        <div><div class="v">${esc(fmtDate(d.creationDate) || '—')}</div><div class="l">Created</div></div>
      </div>
      <div class="sections">
        <section class="sec"><h3>Classification</h3><dl class="kv">
          ${row('Product type', d.productType ? `${d.productType} — ${TYPES[d.productType] || ''}` : '')}${row('Product group', d.productGroup)}${row('Division', d.division)}
          ${row('Industry sector', d.industrySector)}${row('Item category group', d.itemCategoryGroup)}${row('Product hierarchy', d.productHierarchy)}</dl></section>
        <section class="sec"><h3>Units &amp; dimensions</h3><dl class="kv">
          ${row('Base unit', d.baseUnit)}${row('Weight unit', d.weightUnit)}${row('Gross weight', fmtNum(d.grossWeight, d.weightUnit))}${row('Net weight', fmtNum(d.netWeight, d.weightUnit))}
          ${row('Volume', fmtNum(d.materialVolume, d.volumeUnit))}${row('Size / dimensions', d.sizeOrDimensionText)}</dl></section>
        <section class="sec"><h3>Identification</h3><dl class="kv">
          ${row('Product', d.product)}${row('Old product number', d.productOldId)}${row('Standard ID (GTIN)', d.productStandardId)}
          ${row('Manufacturer number', d.manufacturerNumber)}${row('Brand', d.brand)}${row('Country of origin', d.countryOfOrigin)}</dl></section>
        <section class="sec"><h3>Status &amp; change log</h3><dl class="kv">
          ${row('Cross-plant status', d.crossPlantStatus)}${row('Marked for deletion', deleted ? 'Yes' : 'No')}${row('Created on', fmtDate(d.creationDate))}
          ${row('Created by', d.createdByUser)}${row('Last changed', fmtDate(d.lastChangeDateTime))}${row('Changed by', d.lastChangedByUser)}</dl></section>
      </div>
      <div class="obj-foot"><span>Live from SAP S/4HANA Cloud (API Business Hub sandbox) through Boomi · description filtered to EN</span><button class="btn" id="rawBtn" type="button">Show JSON</button></div>
      <pre class="raw" id="raw" hidden></pre>`;
    $('#rawBtn').addEventListener('click', () => { const r = $('#raw'); r.hidden = !r.hidden; r.textContent = JSON.stringify(lastRaw, null, 2); $('#rawBtn').textContent = r.hidden ? 'Show JSON' : 'Hide JSON'; });
    document.title = `${d.product} · ${d.description || 'Product'} · Meridian Industrial`;
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openProduct(b.dataset.open); });

  // ---------------------------------------------------------------- deep links: #search=bike&product=FG-MZ-FG-CE900
  function updateHash() {
    const h = new URLSearchParams(); const s = $('#q').value.trim();
    if (s) h.set('search', s); if (selected) h.set('product', selected);
    history.replaceState(null, '', h.toString() ? `#${h}` : location.pathname);
  }

  // ---------------------------------------------------------------- boot
  (async () => {
    if (location.pathname.includes('/projects/')) $('#backLink').hidden = false;
    try {
      const r = await fetch(API_BASE + 'api/health', { cache: 'no-store' });
      const h = r.ok ? await r.json() : null;
      $('#conn').innerHTML = h && h.boomiConfigured ? '<span class="dot on"></span>Boomi connected · live' : '<span class="dot off"></span>Boomi not configured';
    } catch { $('#conn').innerHTML = '<span class="dot off"></span>Gateway offline'; }
    const h = new URLSearchParams(location.hash.slice(1));
    search(h.get('search') || '');
    if (h.get('product')) openProduct(h.get('product'));
  })();
})();
