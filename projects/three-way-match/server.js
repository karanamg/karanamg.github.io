// Copperleaf Provisions - AP 3-Way Match demo
// Node gateway that
//   * serves the front end (./public, including the sample invoice PDFs)
//   * extracts vendor-invoice data from uploaded PDFs           POST /api/extract
//   * sends the invoice to the Boomi 3-way match API             POST /api/match  ->  POST /ws/rest/threeway/v1/match
//   * keeps a run history for the dashboard                      GET  /api/history
//   * approved invoices are posted to Coupa by Boomi (simulated)  -> result.coupa
//   * proxies the SAP S/4HANA PO / Manhattan WMS receipt data    GET  /api/purchaseorders, /api/goodsreceipts (simulated in Boomi)
// Boomi credentials stay on the server. They are read from environment variables, ./.env, or the workspace .env:
//   SERVER_BASE_URL, SERVER_USERNAME, SERVER_TOKEN
// Run:  npm install && npm start   ->  http://localhost:8090

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { extractInvoice } = require('./lib/extract');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS = path.join(DATA_DIR, 'uploads');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MOCK = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'mock_data.json'), 'utf8'));
const API_BASE = '/ws/rest/threeway/v1';
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_HISTORY = 500;

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = raw.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || raw.trim().startsWith('#')) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = { ...loadEnv(path.resolve(ROOT, '../../../../.env')), ...loadEnv(path.join(ROOT, '.env')), ...process.env };
const PORT = Number(env.PORT || 8090);
const BOOMI_BASE = (env.SERVER_BASE_URL || '').replace(/\/+$/, '');
const AUTH = env.SERVER_USERNAME && env.SERVER_TOKEN ? 'Basic ' + Buffer.from(`${env.SERVER_USERNAME}:${env.SERVER_TOKEN}`).toString('base64') : null;

fs.mkdirSync(UPLOADS, { recursive: true });
let history = [];
try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { history = []; }
const saveHistory = () => fs.writeFile(HISTORY_FILE, JSON.stringify(history), () => {});

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('File too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function boomi(method, apiPath, body) {
  return new Promise((resolve) => {
    if (!BOOMI_BASE || !AUTH) return resolve({ status: 503, ms: 0, error: 'Boomi connection not configured (SERVER_BASE_URL, SERVER_USERNAME, SERVER_TOKEN).' });
    const url = new URL(BOOMI_BASE + apiPath), started = Date.now();
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = (url.protocol === 'http:' ? http : https).request(url, {
      method, timeout: 90000,
      headers: { Authorization: AUTH, Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}) }
    }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8'), ms = Date.now() - started;
        let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
        resolve({ status: r.statusCode, ms, json, text: json ? undefined : text.slice(0, 500) });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Boomi did not answer within 90 seconds')));
    req.on('error', (e) => resolve({ status: 502, ms: Date.now() - started, error: e.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

const refCache = new Map();
async function reference(kind) {
  const hit = refCache.get(kind);
  if (hit && Date.now() - hit.at < 60000) return { ...hit.r, cached: true };
  const r = await boomi('GET', `${API_BASE}/${kind}`);
  if (r.status === 200 && r.json) refCache.set(kind, { at: Date.now(), r });
  return r;
}

const summary = (h) => ({
  id: h.id, at: h.at, fileName: h.fileName, fileId: h.fileId, boomiMs: h.boomiMs,
  invoiceNumber: h.result?.invoice?.invoiceNumber || h.invoice?.invoiceNumber, poNumber: h.invoice?.poNumber,
  vendorName: h.result?.invoice?.vendorName || h.invoice?.vendor?.name, value: h.result?.summary?.invoiceValue ?? h.invoice?.subtotal,
  status: h.result?.status || 'ERROR', decision: h.result?.decision || 'ERROR', executionId: h.result?.executionId,
  coupaPosted: Boolean(h.result?.coupa?.posted), coupaId: h.result?.coupa?.response?.id ?? null,
  // header-level outcomes (no PO / no receipt) explain every line, so they are counted on their own
  exceptionTypes: ['GR_MISSING', 'PO_NOT_FOUND'].includes(h.result?.status) ? [h.result.status]
    : [...new Set((h.result?.lines || []).map((l) => l.status).filter((s) => s !== 'MATCHED' && s !== 'WITHIN_TOLERANCE'))]
});

// simple per-client rate limit to protect the Boomi runtime
const hits = new Map();
function limited(req, perMin = 60) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now(), recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  recent.push(now); hits.set(ip, recent);
  return recent.length > perMin;
}

function serveStatic(p, res) {
  const rel = p === '/' ? '/index.html' : decodeURIComponent(p);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// Browser access from other sites (the GitHub Pages copy). Comma-separated origins.
const ALLOWED_ORIGINS = new Set(String(env.ALLOWED_ORIGINS || 'https://karanamg.github.io,http://localhost:8090,http://127.0.0.1:8090')
  .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean));

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost'), p = url.pathname;
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  if (origin && ALLOWED_ORIGINS.has(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name');
    res.setHeader('Access-Control-Max-Age', '600');
    res.writeHead(204); return res.end();
  }
  if (p.startsWith('/api/') && p !== '/api/health' && limited(req)) return sendJson(res, 429, { error: 'Too many requests - please slow down.' });

  if (p === '/api/health') return sendJson(res, 200, { boomiConfigured: Boolean(BOOMI_BASE && AUTH), boomiHost: BOOMI_BASE ? new URL(BOOMI_BASE).host : null, apiBase: API_BASE, runs: history.length });
  if (p === '/api/config' && req.method === 'GET') return sendJson(res, 200, { buyer: MOCK.buyer, tolerances: MOCK.tolerances, samples: MOCK.sampleInvoices.map((s) => ({ file: s.file, scenario: s.scenario, invoiceNumber: s.invoiceNumber, vendor: s.vendor.name, poNumber: s.poNumber })), boomiHost: BOOMI_BASE ? new URL(BOOMI_BASE).host : null, apiBase: API_BASE });

  if (p === '/api/extract' && req.method === 'POST') {
    const started = Date.now();
    const buf = await readBody(req, MAX_PDF_BYTES);
    if (buf.length < 5 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') return sendJson(res, 400, { error: 'That file is not a PDF.' });
    const fileName = String(req.headers['x-file-name'] ? decodeURIComponent(req.headers['x-file-name']) : 'invoice.pdf').replace(/[^\w.\- ]/g, '_').slice(0, 120);
    const fileId = crypto.randomUUID();
    fs.writeFile(path.join(UPLOADS, fileId + '.pdf'), buf, () => {});
    try {
      const out = await extractInvoice(buf);
      out.invoice.source = fileName;
      return sendJson(res, 200, { ...out, fileId, fileName, bytes: buf.length, ms: Date.now() - started });
    } catch (e) {
      return sendJson(res, 422, { error: 'Could not read text from this PDF. Scanned images need OCR, which this demo does not include.', detail: e.message, fileId, fileName });
    }
  }

  if (p === '/api/match' && req.method === 'POST') {
    let body; try { body = JSON.parse((await readBody(req, 512 * 1024)).toString('utf8')); } catch { return sendJson(res, 400, { error: 'Body must be JSON: { invoice, fileId, fileName }' }); }
    const inv = body.invoice;
    if (!inv || !inv.poNumber || !Array.isArray(inv.lines) || !inv.lines.length) return sendJson(res, 400, { error: 'The invoice needs a PO number and at least one line.' });
    const r = await boomi('POST', `${API_BASE}/match`, inv);
    // Boomi returns { match, coupa }; keep one result object with the Coupa posting attached
    if (r.json && r.json.match) r.json = { ...r.json.match, coupa: r.json.coupa || null };
    const rec = { id: crypto.randomUUID(), at: new Date().toISOString(), fileName: body.fileName || inv.source, fileId: body.fileId || null, invoice: inv,
                  boomiMs: r.ms, boomiStatus: r.status, result: r.status === 200 && r.json && r.json.status !== 'ERROR' ? r.json : null,
                  error: r.error || (r.json && r.json.status === 'ERROR' ? r.json.message : null) || (r.status !== 200 ? `Boomi returned HTTP ${r.status}` : null) };
    history.unshift(rec); history = history.slice(0, MAX_HISTORY); saveHistory();
    return sendJson(res, rec.result ? 200 : 502, { record: rec, boomiPath: `POST ${API_BASE}/match`, boomiHost: BOOMI_BASE ? new URL(BOOMI_BASE).host : null });
  }

  if (p === '/api/history' && req.method === 'GET') return sendJson(res, 200, history.map(summary));
  let m = p.match(/^\/api\/history\/([\w-]+)$/);
  if (m && req.method === 'GET') { const h = history.find((x) => x.id === m[1]); return h ? sendJson(res, 200, h) : sendJson(res, 404, { error: 'Run not found' }); }
  if (p === '/api/history/reset' && req.method === 'POST') { history = []; saveHistory(); return sendJson(res, 200, { ok: true }); }

  m = p.match(/^\/api\/files\/([0-9a-f-]{36})$/);
  if (m && req.method === 'GET') {
    return fs.readFile(path.join(UPLOADS, m[1] + '.pdf'), (err, data) => {
      if (err) return sendJson(res, 404, { error: 'File not found' });
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=3600' }); res.end(data);
    });
  }

  if ((p === '/api/purchaseorders' || p === '/api/goodsreceipts') && req.method === 'GET') {
    const r = await reference(p.slice(5));
    return sendJson(res, r.status === 200 ? 200 : 502, r.json || { error: r.error || `Boomi returned HTTP ${r.status}`, detail: r.text });
  }

  if (p.startsWith('/api/')) return sendJson(res, 404, { error: 'Unknown API route' });
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  const PREFIX = '/projects/three-way-match';
  if (p === PREFIX || p.startsWith(PREFIX + '/')) { res.writeHead(302, { Location: (p.slice(PREFIX.length) || '/') + url.search }); return res.end(); }
  serveStatic(p, res);
}

http.createServer((req, res) => handle(req, res).catch((e) => sendJson(res, e.status || 500, { error: e.message })))
  .listen(PORT, () => {
    console.log(`Copperleaf AP 3-Way Match -> http://localhost:${PORT}`);
    console.log(BOOMI_BASE && AUTH ? `Boomi API: ${new URL(BOOMI_BASE).host}${API_BASE}` : 'WARNING: SERVER_BASE_URL / SERVER_USERNAME / SERVER_TOKEN not set - matching will return 503.');
  });
