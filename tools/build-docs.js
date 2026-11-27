// Builds a "How it's built" PDF for every project in projects.json from the project's README.md.
// Output: projects/<slug>/how-its-built.pdf (the "How it's built" button opens it in a pop-up).
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
      const page = await browser.newPage();
      // load from a file (not setContent) so the PDF title metadata comes from <title>, not "about:blank"
      const tmp = path.join(require('os').tmpdir(), `how-its-built-${p.slug}.html`);
      fs.writeFileSync(tmp, html(p, fs.readFileSync(readmePath, 'utf8')));
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
