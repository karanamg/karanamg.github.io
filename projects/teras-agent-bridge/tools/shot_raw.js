// Screenshot the "0 · Raw IBM i record" lineage stage: node tools/shot_raw.js <baseUrl> <out.png>
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer-core');
const base = process.argv[2] || 'http://localhost:8096', out = process.argv[3] || '/tmp/teras-raw.png';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
  const p = await b.newPage(); await p.setViewport({ width: 1500, height: 1000 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(base + '/#jpj/run', { waitUntil: 'networkidle2', timeout: 60000 }); await wait(1500);
  await p.click('[data-one="veh"]');
  await p.waitForFunction(() => document.querySelector('#linRun .rawmap'), { timeout: 150000 }); await wait(500);
  await p.select('#linRun [data-rawrec]', '3'); await p.waitForFunction(() => document.querySelector('#linRun .rawmap'), { timeout: 30000 }); await wait(700);
  const el = await p.$('#runResult'); await el.screenshot({ path: out });
  await p.click('#linRun .lin-tab:not([data-rawtab])'); await wait(500);
  const tabs = await p.$$eval('#linRun .lin-tab', (x) => x.map((t) => t.textContent.trim() + (t.classList.contains('active') ? ' *' : '')));
  console.log('tabs:', JSON.stringify(tabs)); console.log('errors:', JSON.stringify(errs)); await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
