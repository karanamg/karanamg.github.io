// Assemble per-slide renders (Quick Look PNGs) into a 16:9 PDF: node tools/deck_pdf.js <pngDir> <out.pdf> <count>
const fs = require('fs'), path = require('path');
const puppeteer = require(process.env.PUPPETEER_PATH || '/Users/guru/Claude-Guru/tools-local/node/node_modules/puppeteer-core');
const [dir, out, count] = [process.argv[2] || '/tmp/deckhi', process.argv[3] || '/tmp/deck.pdf', Number(process.argv[4] || 16)];
(async () => {
  const imgs = Array.from({ length: count }, (_, i) => path.join(dir, `s${i + 1}.pptx.png`)).map((f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
  const html = `<html><head><style>@page{size:13.333in 7.5in;margin:0}body{margin:0}img{width:13.333in;height:7.5in;display:block;object-fit:contain;page-break-after:always}</style></head><body>${imgs.map((s) => `<img src="${s}">`).join('')}</body></html>`;
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
  const p = await b.newPage(); await p.setContent(html, { waitUntil: 'load' });
  await p.pdf({ path: out, width: '13.333in', height: '7.5in', printBackground: true });
  await b.close(); console.log('wrote', out);
})().catch((e) => { console.error(e.message); process.exit(1); });
