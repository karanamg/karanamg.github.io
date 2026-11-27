// Renders the project gallery from /projects.json — add a project by adding an entry there.
(async () => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  $('#year').textContent = new Date().getFullYear();
  let data;
  try { data = await (await fetch('projects.json', { cache: 'no-cache' })).json(); }
  catch { $('#projects').innerHTML = '<div class="empty">Could not load projects.json.</div>'; return; }

  const site = data.site || {};
  if (site.name) { $('#siteName').textContent = site.name; $('#footName').textContent = site.name; document.title = `${site.name} · ${site.tagline || 'Projects'}`; }
  if (site.tagline) $('#tagline').textContent = site.tagline;
  if (site.intro) $('#intro').textContent = site.intro;
  if (site.github) $('#ghLink').href = site.github;
  if (site.repo) $('#repoLink').href = site.repo;

  const projects = (data.projects || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const tags = [...new Set(projects.flatMap((p) => p.tags || []))];
  let active = new URLSearchParams(location.search).get('tag') || '';

  function render() {
    $('#filters').innerHTML = ['', ...tags].map((t) => `<button type="button" class="${t === active ? 'on' : ''}" data-tag="${esc(t)}">${t ? esc(t) : 'All projects'}</button>`).join('');
    const list = projects.filter((p) => !active || (p.tags || []).includes(active));
    const fmt = (d) => { const [y, m] = String(d || '').split('-'); return m ? new Date(Date.UTC(+y, +m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : (y || ''); };
    $('#projects').innerHTML = list.map((p) => `
      <article class="card">
        <a class="thumb" href="${esc(p.path)}" aria-label="Open ${esc(p.title)}" style="background-image:url('${esc(p.thumbnail || '')}')"></a>
        <div class="body">
          <div class="meta"><span>${esc(fmt(p.date))}</span>${p.status ? `<span class="status">${esc(p.status)}</span>` : ''}</div>
          <h2><a href="${esc(p.path)}" style="color:inherit">${esc(p.title)}</a></h2>
          <p>${esc(p.summary)}</p>
          ${(p.highlights || []).length ? `<ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
          <div class="tags">${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
          <div class="actions"><a class="btn primary" href="${esc(p.path)}">Open demo →</a>${p.doc ? `<a class="btn" href="${esc(p.doc)}" data-doc="${esc(p.slug)}" target="_blank" rel="noopener">How it's built</a>` : p.source ? `<a class="btn" href="${esc(p.source)}" rel="noopener">How it's built</a>` : ''}</div>
        </div>
      </article>`).join('') + (active ? '' : '<div class="card soon"><div><b>More projects on the way</b>New demos are added here as they are built.</div></div>');
    if (!list.length) $('#projects').innerHTML = '<div class="empty">No projects with this tag yet.</div>';
  }
  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tag]'); if (!b) return;
    active = b.dataset.tag; history.replaceState(null, '', active ? `?tag=${encodeURIComponent(active)}` : location.pathname); render();
  });
  // "How it's built" opens the project's PDF in a pop-up viewer.
  // Phones can't show a PDF inside a page, so there the link opens the PDF directly.
  const dlg = document.createElement('dialog');
  dlg.className = 'docview';
  dlg.innerHTML = `<div class="dv-bar"><b class="dv-title"></b><span class="dv-actions">
      <a class="btn dv-open" target="_blank" rel="noopener">Open in new tab ↗</a>
      <a class="btn dv-dl" download>Download PDF</a>
      <a class="btn dv-src" target="_blank" rel="noopener">Source code ↗</a>
      <button type="button" class="dv-x" aria-label="Close">×</button></span></div>
    <iframe class="dv-frame" title="How it's built (PDF)"></iframe>`;
  document.body.appendChild(dlg);
  const closeDoc = () => { dlg.close(); dlg.querySelector('.dv-frame').src = 'about:blank'; };
  dlg.querySelector('.dv-x').onclick = closeDoc;
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDoc(); });          // click outside
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDoc(); });             // Esc
  const inlinePdf = () => !matchMedia('(max-width: 700px), (pointer: coarse)').matches && typeof dlg.showModal === 'function';
  $('#projects').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-doc]'); if (!a || !inlinePdf()) return;          // fall back to opening the PDF
    e.preventDefault();
    const p = projects.find((x) => x.slug === a.dataset.doc); if (!p) return;
    dlg.querySelector('.dv-title').textContent = `How it's built · ${p.title}`;
    dlg.querySelector('.dv-open').href = p.doc;
    dlg.querySelector('.dv-dl').href = p.doc; dlg.querySelector('.dv-dl').setAttribute('download', `${p.slug}-how-its-built.pdf`);
    const src = dlg.querySelector('.dv-src'); src.hidden = !p.source; if (p.source) src.href = p.source;
    dlg.querySelector('.dv-frame').src = `${p.doc}#view=FitH&toolbar=1`;
    dlg.showModal();
  });

  render();
})();
