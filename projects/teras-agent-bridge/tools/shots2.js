// UI walkthrough of Teras Connect: node tools/shots2.js <baseUrl> <outDir>   (PUPPETEER_PATH=/private/tmp/aihtest/node_modules/puppeteer-core)
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer-core');
const base = process.argv[2] || 'http://localhost:8096', out = process.argv[3] || '/tmp/teras2';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
  const p = await b.newPage(); await p.setViewport({ width: 1500, height: 1000 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const shot = async (n, full = false) => { await wait(700); await p.screenshot({ path: `${out}/${n}.png`, fullPage: full }); };
  const nav = async (page) => { await p.click(`#nav a[data-page="${page}"]`); await wait(1200); };
  await p.goto(base + '/#jpj/overview', { waitUntil: 'networkidle2', timeout: 60000 }); await wait(2000); await shot('1-overview');
  await nav('connections'); await shot('2-connections', true);
  await nav('run'); await p.click('[data-one="veh"]');
  await p.waitForFunction(() => document.querySelector('#runResult .kpis'), { timeout: 150000 }); await shot('3-run', true);
  await nav('tools'); await p.click('#tGo'); await p.waitForFunction(() => document.querySelector('#tOut .call'), { timeout: 150000 }); await shot('4-tools', true);
  await nav('assistant'); await p.evaluate(() => [...document.querySelectorAll('.sugg button')][0].click());
  await p.waitForFunction(() => !document.querySelector('#typing') && document.querySelector('#trace .call'), { timeout: 150000 }); await shot('5-assistant');
  await nav('sovereign'); await p.click('#cmpGo'); await p.waitForFunction(() => document.querySelectorAll('#cmpOut .call').length === 2, { timeout: 150000 }); await shot('6-sovereign', true);
  await p.click('#newTenant'); await wait(500); await p.type('#nName', 'Jabatan Pendaftaran Negara (JPN)'); await p.click('#nNext'); await wait(600); await shot('7-onboard');
  console.log('errors:', JSON.stringify(errs)); await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
