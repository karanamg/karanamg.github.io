// Agentstudio engine UI test: node tools/shot_agent.js <baseUrl> <out.png>
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer-core');
const base = process.argv[2] || 'http://localhost:8096', out = process.argv[3] || '/tmp/teras-agent.png';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
  const p = await b.newPage(); await p.setViewport({ width: 1500, height: 1050 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(base + '/#jpj/assistant', { waitUntil: 'networkidle2', timeout: 60000 }); await wait(1500);
  await p.click('[data-eng="agentstudio"]'); await wait(800);
  const askAndWait = async (q) => {
    await p.type('#aq', q); await p.click('#aGo');
    await p.waitForFunction(() => !document.querySelector('#typing'), { timeout: 200000 }); await wait(600);
  };
  await askAndWait('Licence status for the owner of WTT 1');
  await askAndWait('And does he have any outstanding summons?');
  await p.screenshot({ path: out });
  const last = await p.$$eval('.msg.bot', (x) => x[x.length - 1].innerText.slice(0, 400));
  console.log('last answer:', last.replace(/\n+/g, ' | ')); console.log('errors:', JSON.stringify(errs)); await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
