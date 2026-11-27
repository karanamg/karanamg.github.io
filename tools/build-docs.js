// Builds the "How it's built" document for every project in projects.json from the project's README.md:
//   projects/<slug>/how-its-built.html  - responsive page shown in the site's pop-up
//   projects/<slug>/how-its-built.pdf   - printable copy (Download PDF in the pop-up)
//
// Usage (needs Google Chrome, plus the marked and puppeteer-core npm packages):
//   NODE_PATH=/path/to/node_modules node tools/build-docs.js            # all projects
//   NODE_PATH=/path/to/node_modules node tools/build-docs.js <slug>     # one project
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://karanamg.github.io/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
@page { size: A4; margin: 16mm 15mm 18mm; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.5 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #17201c; margin: 0; }
.cover { background: linear-gradient(160deg, #142b25, #1f3d34); color: #fff; border-radius: 12px; padding: 26px 28px 24px; margin-bottom: 22px; }
.cover .kicker { font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; color: #e0a458; font-weight: 700; }
.cover h1 { font-size: 21pt; line-height: 1.15; margin: 6px 0 10px; letter-spacing: -.01em; }
.cover p { color: #d3e2dc; margin: 0 0 10px; }
.cover ul { margin: 0 0 12px; padding-left: 18px; color: #e8f0ec; }
.cover .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.cover .tag { font-size: 8.5pt; background: rgba(255,255,255,.12); border-radius: 5px; padding: 2px 8px; }
.cover .links { margin-top: 12px; font-size: 9pt; color: #c9dbd4; }
.cover .links a { color: #f0c58c; }
.doc h1 { font-size: 15pt; color: #1f3d34; margin: 0 0 8px; }
.doc h2 { font-size: 13pt; color: #1f3d34; margin: 20px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #e8dccd; break-after: avoid; }
.doc h3 { font-size: 11pt; color: #b8692e; margin: 14px 0 4px; break-after: avoid; }
.doc p, .doc li { orphans: 3; widows: 3; }
.doc a { color: #b8692e; text-decoration: none; }
.doc code { font: 9pt/1.4 "SF Mono", Menlo, Consolas, monospace; background: #f1f3f0; border-radius: 4px; padding: 0 4px; }
.doc pre { background: #f6f7f4; border: 1px solid #e3e7e4; border-radius: 8px; padding: 10px 12px; overflow: hidden; white-space: pre; break-inside: avoid; }
.doc pre code { background: none; padding: 0; font-size: 7pt; line-height: 1.45; }  /* keeps 110+ char diagrams on one line */
.doc table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9pt; break-inside: auto; }
.doc th { text-align: left; background: #1f3d34; color: #fff; padding: 5px 7px; font-weight: 600; }
.doc td { border-bottom: 1px solid #e3e7e4; padding: 5px 7px; vertical-align: top; }
.doc tr { break-inside: avoid; }
.doc tr:nth-child(even) td { background: #fafbf9; }
.doc ul, .doc ol { padding-left: 20px; }
.doc blockquote { margin: 8px 0; padding: 6px 12px; border-left: 3px solid #e0a458; background: #faf1e9; color: #4a5550; }
`;

function html(p, readme) {
  const live = new URL(p.path, SITE).href;
  // drop the README's own H1 (the cover already carries the title)
  const body = marked.parse(readme.replace(/^#\s+[^\n]*\n/, ''));
  return `<!doctype html><html><head><meta charset="utf-8"><title>How it's built · ${esc(p.title)}</title><style>${CSS}</style></head><body>
  <section class="cover">
    <div class="kicker">How it's built</div>
    <h1>${esc(p.title)}</h1>
    <p>${esc(p.summary)}</p>
    ${(p.highlights || []).length ? `<ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
    <div class="row">${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    <div class="links">Live demo: <a href="${esc(live)}">${esc(live)}</a>${p.source ? ` · Source: <a href="${esc(p.source)}">${esc(p.source.replace('https://', ''))}</a>` : ''}</div>
  </section>
  <main class="doc">${body}</main></body></html>`;
}

const WEB_CSS = `
:root { --ink:#17201c; --ink-2:#4a5550; --muted:#6d7873; --line:#e3e7e4; --bg:#f5f6f3; --forest:#1f3d34; --copper:#b8692e; --gold:#e0a458; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 64px; }
body { margin: 0; font: 15.5px/1.65 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: var(--ink); background: var(--bg); -webkit-font-smoothing: antialiased; }
a { color: var(--copper); text-decoration: none; } a:hover { text-decoration: underline; }
.hero { background: radial-gradient(900px 340px at 85% -20%, #2f5a4c 0%, transparent 60%), linear-gradient(160deg, #142b25, #1f3d34); color: #fff; padding: 34px 0 30px; }
.wrap { max-width: 900px; margin: 0 auto; padding: 0 28px; }
.hero-grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 28px; align-items: center; }
.kicker { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--gold); font-weight: 700; }
.hero h1 { font-size: clamp(24px, 3.4vw, 32px); line-height: 1.18; margin: 8px 0 12px; letter-spacing: -.015em; }
.hero p { color: #d3e2dc; margin: 0 0 14px; font-size: 15px; }
.hero ul { margin: 0 0 14px; padding-left: 18px; color: #e8f0ec; font-size: 14px; display: grid; gap: 4px; }
.shot { border-radius: 12px; overflow: hidden; box-shadow: 0 18px 50px rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.15); aspect-ratio: 16/10; background: #0f221d center top / cover no-repeat; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag { font-size: 12px; background: rgba(255,255,255,.12); border-radius: 6px; padding: 2px 9px; color: #eef4f1; }
.cta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.cta a { display: inline-flex; align-items: center; gap: 6px; border-radius: 9px; padding: 8px 14px; font-weight: 600; font-size: 13.5px; border: 1px solid rgba(255,255,255,.28); color: #fff; }
.cta a.primary { background: var(--copper); border-color: var(--copper); }
.cta a:hover { text-decoration: none; filter: brightness(1.08); }
nav.toc { position: sticky; top: 0; z-index: 5; background: rgba(245,246,243,.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
nav.toc .wrap { display: flex; gap: 6px; overflow-x: auto; padding-top: 10px; padding-bottom: 10px; scrollbar-width: none; }
nav.toc a { flex: none; font-size: 13px; color: var(--ink-2); background: #fff; border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px; }
nav.toc a:hover, nav.toc a.on { color: #fff; background: var(--forest); border-color: var(--forest); text-decoration: none; }
main { padding: 26px 0 60px; }
.doc > p:first-child { font-size: 16.5px; color: var(--ink-2); }
.doc h2 { font-size: 21px; color: var(--forest); margin: 34px 0 10px; padding-top: 4px; letter-spacing: -.01em; display: flex; align-items: center; gap: 10px; }
.doc h2::before { content: ""; width: 6px; height: 22px; border-radius: 3px; background: linear-gradient(var(--gold), var(--copper)); }
.doc h3 { font-size: 16.5px; color: var(--copper); margin: 22px 0 6px; }
.doc section { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 4px 24px 18px; margin: 18px 0; box-shadow: 0 1px 2px rgba(16,32,27,.04), 0 8px 24px rgba(16,32,27,.05); }
.doc section > h2 { margin-top: 18px; }
.doc ul, .doc ol { padding-left: 22px; } .doc li { margin: 3px 0; }
.doc code { font: 13px/1.5 "SF Mono", Menlo, Consolas, monospace; background: #f0f2ef; border-radius: 5px; padding: 1px 5px; }
.doc pre { background: #142b25; color: #e4eee9; border-radius: 10px; padding: 14px 16px; overflow-x: auto; }
.doc pre code { background: none; padding: 0; color: inherit; font-size: 12.5px; line-height: 1.55; }
.tbl { overflow-x: auto; margin: 10px 0 14px; border: 1px solid var(--line); border-radius: 10px; }
.doc table { width: 100%; border-collapse: collapse; font-size: 14px; }
.doc th { text-align: left; background: #f0f3f1; color: var(--forest); padding: 9px 12px; font-weight: 700; border-bottom: 1px solid var(--line); white-space: nowrap; }
.doc td { border-bottom: 1px solid var(--line); padding: 9px 12px; vertical-align: top; }
.doc tr:last-child td { border-bottom: none; }
.doc blockquote { margin: 10px 0; padding: 8px 14px; border-left: 3px solid var(--gold); background: #faf1e9; color: var(--ink-2); border-radius: 0 8px 8px 0; }
.foot { color: var(--muted); font-size: 13px; padding: 18px 0 40px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
@media (max-width: 720px) {
  .hero-grid { grid-template-columns: 1fr; } .shot { order: -1; }
  .wrap { padding: 0 18px; } .doc section { padding: 2px 16px 14px; } body { font-size: 15px; }
}
`;

function webHtml(p, readme) {
  const live = new URL(p.path, SITE).href;
  const pdfName = 'how-its-built.pdf';
  const slugify = (t) => t.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const toc = [];
  const r = new marked.Renderer();
  r.heading = (text, level) => {
    if (level !== 2) return `<h${level}>${text}</h${level}>`;
    const id = slugify(text); toc.push({ id, text: text.replace(/<[^>]+>/g, '') });
    return `</section><section id="${id}"><h2>${text}</h2>`;
  };
  r.table = (header, body) => `<div class="tbl"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
  r.link = (href, title, text) => `<a href="${href}" target="_blank" rel="noopener"${title ? ` title="${title}"` : ''}>${text}</a>`;
  let body = marked.parse(readme.replace(/^#\s+[^\n]*\n/, ''), { renderer: r });
  body = `<section class="intro">${body}</section>`.replace(/<section class="intro">\s*<\/section>/, '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>How it's built · ${esc(p.title)}</title><style>${WEB_CSS}</style></head><body>
<header class="hero"><div class="wrap hero-grid">
  <div><div class="kicker">How it's built</div><h1>${esc(p.title)}</h1><p>${esc(p.summary)}</p>
    ${(p.highlights || []).length ? `<ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
    <div class="tags">${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    <div class="cta"><a class="primary" href="${esc(live)}" target="_blank" rel="noopener">Open demo →</a>${p.source ? `<a href="${esc(p.source)}" target="_blank" rel="noopener">Source code ↗</a>` : ''}<a href="${pdfName}" download="${esc(p.slug)}-how-its-built.pdf">Download PDF</a></div></div>
  ${p.thumbnail ? `<div class="shot" style="background-image:url('thumbnail.jpg')" role="img" aria-label="Screenshot"></div>` : ''}
</div></header>
${toc.length ? `<nav class="toc"><div class="wrap">${toc.map((t) => `<a href="#${t.id}">${t.text}</a>`).join('')}</div></nav>` : ''}
<main class="wrap"><div class="doc">${body}</div>
<div class="foot"><span>${esc(p.title)}</span><a href="${esc(SITE)}" target="_top">karanamg.github.io ↗</a></div></main>
<script>
// highlight the section in view
const links = [...document.querySelectorAll('nav.toc a')];
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.hash === '#' + e.target.id)); }), { rootMargin: '-30% 0px -60% 0px' });
document.querySelectorAll('.doc section[id]').forEach((s) => io.observe(s));
</script></body></html>`;
}

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects.json'), 'utf8'));
  const only = process.argv[2];
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  try {
    for (const p of data.projects) {
      if (only && p.slug !== only) continue;
      const dir = path.join(ROOT, 'projects', p.slug);
      const readmePath = path.join(dir, 'README.md');
      if (!fs.existsSync(readmePath)) { console.log(`skip ${p.slug}: no README.md`); continue; }
      const readme = fs.readFileSync(readmePath, 'utf8');
      const webOut = path.join(dir, 'how-its-built.html');
      fs.writeFileSync(webOut, webHtml(p, readme));
      console.log(`built ${path.relative(ROOT, webOut)}`);
      const page = await browser.newPage();
      // load from a file (not setContent) so the PDF title metadata comes from <title>, not "about:blank"
      const tmp = path.join(require('os').tmpdir(), `how-its-built-${p.slug}.html`);
      fs.writeFileSync(tmp, html(p, readme));
      await page.goto('file://' + tmp, { waitUntil: 'load' });
      const out = path.join(dir, 'how-its-built.pdf');
      await page.pdf({
        path: out, format: 'A4', printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: true, headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;font:8px -apple-system,Arial;color:#8a938f;padding:0 15mm;display:flex;justify-content:space-between"><span>${esc(p.title)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      });
      await page.close(); fs.unlinkSync(tmp);
      console.log(`built ${path.relative(ROOT, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
    }
  } finally { await browser.close(); }
})();
