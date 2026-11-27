// Clean screenshots of the live console for the workshop deck: node tools/deck_shots.js <baseUrl> <outDir>
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer-core');
const base = process.argv[2] || 'http://localhost:8096', out = process.argv[3] || '/tmp/deckshots';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const flat = () => p.addStyleTag({ content: '.top{position:static !important}' });
  const shot = async (sel, name) => { const el = await p.$(sel); await el.screenshot({ path: `${out}/${name}.png` }); console.log('saved', name); };
  const nav = async (page) => { await p.click(`#nav a[data-page="${page}"]`); await wait(1500); };
  await p.goto(base + '/#jpj/overview', { waitUntil: 'networkidle2', timeout: 60000 }); await wait(2000); await flat();
  // runtime switch in the header
  await shot('#rtSwitch', 'rt-switch');
  // 1. connections (library + publish)
  await nav('connections'); await shot('#page-connections', 'connections');
  // 2. run VEHMST on-prem -> raw IBM i record stage
  await nav('run'); await p.click('[data-one="veh"]');
  await p.waitForFunction(() => document.querySelector('#linRun .rawmap'), { timeout: 150000 }); await wait(400);
  await p.select('#linRun [data-rawrec]', '3'); await wait(1500); await shot('#linRun', 'raw-record');
  await shot('#pipe', 'pipeline');
  // 3. agent tools page + a governed call
  await nav('tools'); await p.click('#tGo'); await p.waitForFunction(() => document.querySelector('#tOut .call'), { timeout: 150000 }); await wait(400);
  await shot('.toolgrid', 'tools'); await shot('#page-tools .grid-5-7', 'tools-policy');
  // 4. virtual assistant (Teras SLM, citizen)
  await nav('assistant');
  const eng = await p.$('[data-eng="teras"]'); if (eng) { await eng.click(); await wait(800); }
  await p.evaluate(() => [...document.querySelectorAll('.sugg button')][0].click());
  await p.waitForFunction(() => !document.querySelector('#typing') && document.querySelector('#trace .call'), { timeout: 150000 }); await wait(500);
  await shot('.asst', 'assistant');
  // 5. sovereign: both runtimes
  await nav('sovereign'); await p.click('#cmpGo'); await p.waitForFunction(() => document.querySelectorAll('#cmpOut .call').length === 2, { timeout: 150000 }); await wait(500);
  await shot('#rtCards', 'runtimes'); await shot('#cmpOut', 'compare');
  // 6. onboarding wizard step 2
  await p.click('#newTenant'); await wait(500); await p.type('#nName', 'Jabatan Pendaftaran Negara (JPN)'); await p.click('#nNext'); await wait(800); await shot('#modalCard', 'onboard');
  console.log('errors:', JSON.stringify(errs)); await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
