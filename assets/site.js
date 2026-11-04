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
          <div class="actions"><a class="btn primary" href="${esc(p.path)}">Open demo →</a>${p.source ? `<a class="btn" href="${esc(p.source)}" rel="noopener">How it's built</a>` : ''}</div>
        </div>
      </article>`).join('') + (active ? '' : '<div class="card soon"><div><b>More projects on the way</b>New demos are added here as they are built.</div></div>');
    if (!list.length) $('#projects').innerHTML = '<div class="empty">No projects with this tag yet.</div>';
  }
  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tag]'); if (!b) return;
    active = b.dataset.tag; history.replaceState(null, '', active ? `?tag=${encodeURIComponent(active)}` : location.pathname); render();
  });
  render();
})();
