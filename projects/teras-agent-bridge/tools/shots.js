// UI smoke test against the deployed app: node tools/shots.js <baseUrl> <outDir>   (needs puppeteer-core + Chrome)
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer-core');
const base = process.argv[2] || 'https://teras-agent-bridge.up.railway.app', out = process.argv[3] || '/tmp/teras-shots';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--ignore-certificate-errors'] });
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(base + '/#story', { waitUntil: 'networkidle2', timeout: 60000 }); await wait(1500);
  await p.screenshot({ path: out + '/1-story.png', fullPage: true });
  await p.goto(base + '/#assistant', { waitUntil: 'networkidle2' }); await wait(1000);
  await p.type('#askInput', 'Can I renew my road tax?'); await p.click('#askForm button');
  await p.waitForFunction(() => !document.querySelector('#typing'), { timeout: 120000 }); await wait(800);
  await p.screenshot({ path: out + '/2-assistant.png' });
  await p.click('#tabs button[data-tab="govern"]'); await p.click('#govForm button');
  await p.waitForFunction(() => !document.querySelector('#govGrid .loading'), { timeout: 120000 }); await wait(500);
  await p.screenshot({ path: out + '/3-govern.png', fullPage: true });
  await p.click('#tabs button[data-tab="cleanse"]'); await wait(1500);
  await p.click('#green .ln[data-i="3"]');
  await p.waitForFunction(() => document.querySelector('#beforeAfter table'), { timeout: 120000 }); await wait(500);
  await p.screenshot({ path: out + '/4-cleanse.png', fullPage: true });
  await p.click('#tabs button[data-tab="sovereign"]'); await wait(800);
  await p.screenshot({ path: out + '/5-sovereign.png', fullPage: true });
  console.log('errors:', JSON.stringify(errs)); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
