// Copperleaf Provisions — Operations Portal
// Tiny dependency-free Node server:
//   * serves the static front end from ./public
//   * proxies /api/* to the Boomi API Service "NWPortal Order Lookup API"
//     (base path /ws/rest/nwportal/v1) so Boomi credentials never reach the browser.
//
// Credentials are read from gateway/.env (copy .env.example) or from environment variables:
//   SERVER_BASE_URL, SERVER_USERNAME, SERVER_TOKEN
// Run:  npm start   (= node --use-system-ca server.js)   then open http://localhost:8080

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '.env');
const PORT = Number(process.env.PORT || 8080);
const PUBLIC = path.resolve(__dirname, '..');            // the portal front end (index.html, app.js, data/)
const PRIVATE = __dirname;                                // never serve the gateway folder (it holds .env)
const API_BASE = '/ws/rest/nwportal/v1';
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 120000); // short cache so repeat clicks feel instant

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = { ...loadEnv(ENV_PATH), ...process.env };
const BOOMI_BASE = (env.SERVER_BASE_URL || '').replace(/\/+$/, '');
const AUTH = env.SERVER_USERNAME && env.SERVER_TOKEN
  ? 'Basic ' + Buffer.from(`${env.SERVER_USERNAME}:${env.SERVER_TOKEN}`).toString('base64')
  : null;
const VERIFY_SSL = String(env.SERVER_VERIFY_SSL || 'true').toLowerCase() !== 'false';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const cache = new Map(); // boomiPath -> { at, body, ms }

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function callBoomi(boomiPath, res, fresh) {
  if (!BOOMI_BASE || !AUTH) {
    return sendJson(res, 503, {
      error: 'Boomi connection not configured',
      detail: 'Set SERVER_BASE_URL, SERVER_USERNAME and SERVER_TOKEN in gateway/.env, then restart the server.'
    });
  }
  const hit = cache.get(boomiPath);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return sendJson(res, 200, hit.body, {
      'X-Boomi-Path': boomiPath, 'X-Boomi-Status': '200', 'X-Boomi-Latency-Ms': String(hit.ms),
      'X-Cache': 'HIT', 'X-Cache-Age-S': String(Math.round((Date.now() - hit.at) / 1000))
    });
  }
  const target = new URL(BOOMI_BASE + boomiPath);
  const started = Date.now();
  const req = https.request(target, {
    method: 'GET',
    headers: { Authorization: AUTH, Accept: 'application/json' },
    rejectUnauthorized: VERIFY_SSL,
    timeout: 90000
  }, (up) => {
    const chunks = [];
    up.on('data', (c) => chunks.push(c));
    up.on('end', () => {
      const ms = Date.now() - started;
      const body = Buffer.concat(chunks).toString('utf8');
      const trace = { 'X-Boomi-Path': boomiPath, 'X-Boomi-Status': String(up.statusCode), 'X-Boomi-Latency-Ms': String(ms), 'X-Cache': 'MISS' };
      console.log(`[boomi] ${up.statusCode} ${ms}ms GET ${boomiPath}`);
      if (up.statusCode >= 200 && up.statusCode < 300) {
        cache.set(boomiPath, { at: Date.now(), body: body || '{}', ms });
        return sendJson(res, 200, body || '{}', trace);
      }
      sendJson(res, up.statusCode === 401 ? 502 : up.statusCode, {
        error: up.statusCode === 401 ? 'Boomi rejected the credentials (HTTP 401)' : `Boomi returned HTTP ${up.statusCode}`,
        detail: body.slice(0, 500)
      }, trace);
    });
  });
  req.on('timeout', () => req.destroy(new Error('Timed out waiting for Boomi')));
  req.on('error', (e) => sendJson(res, 502, {
    error: 'Could not reach Boomi',
    detail: /certificate|issuer/i.test(e.message)
      ? `${e.message} — start the server with "npm start" (node --use-system-ca) so Node trusts the macOS keychain / corporate SSL inspection CA.`
      : e.message
  }));
  req.end();
}

function serveStatic(urlPath, res) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || file.startsWith(PRIVATE)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// OData string literals escape a single quote by doubling it; values are embedded in $filter by Boomi.
const odataText = (v, max = 60) => String(v || '').slice(0, max).replace(/'/g, "''");
const skipVal = (v) => String(Math.max(0, parseInt(v || '0', 10) || 0));
const qs = (o) => new URLSearchParams(o).toString();

// Route table: browser path -> Boomi API path builder
const LIST_ROUTES = {
  '/api/dashboard': () => `${API_BASE}/dashboard`,
  '/api/employees': () => `${API_BASE}/employees`,
  '/api/customers': (p) => `${API_BASE}/customers?${qs({ search: odataText(p.get('search')), skip: skipVal(p.get('skip')) })}`,
  '/api/suppliers': (p) => `${API_BASE}/suppliers?${qs({ search: odataText(p.get('search')), skip: skipVal(p.get('skip')) })}`,
  '/api/orders': (p) => {
    const customerId = String(p.get('customerId') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
    return `${API_BASE}/orders?${qs({ search: odataText(p.get('search')), customerId, skip: skipVal(p.get('skip')) })}`;
  },
  '/api/products': (p) => `${API_BASE}/products?${qs({
    search: odataText(p.get('search')), supplier: odataText(p.get('supplier'), 80),
    category: odataText(p.get('category'), 40), skip: skipVal(p.get('skip'))
  })}`
};

// --- Browser access from other sites (e.g. the GitHub Pages copy). Comma-separated origins.
const ALLOWED_ORIGINS = new Set(String(env.ALLOWED_ORIGINS || 'https://karanamg.github.io,http://localhost:8080,http://127.0.0.1:8080')
  .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean));
// --- Simple per-client rate limit to protect the Boomi runtime (requests per minute; fresh=1 counts the same).
const RATE_LIMIT = Number(env.RATE_LIMIT_PER_MIN || 90);
const hits = new Map();
function rateLimited(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now(), win = hits.get(ip) || [];
  const recent = win.filter((t) => now - t < 60000); recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 60000) hits.delete(k);
  return recent.length > RATE_LIMIT;
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Expose-Headers', 'X-Boomi-Path, X-Boomi-Status, X-Boomi-Latency-Ms, X-Cache, X-Cache-Age-S');
  }
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET'); res.writeHead(204); return res.end(); }
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  const fresh = url.searchParams.get('fresh') === '1';
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/health' && rateLimited(req)) {
    return sendJson(res, 429, { error: 'Too many requests - please slow down', detail: `Limit ${RATE_LIMIT} requests per minute.` });
  }

  if (url.pathname === '/api/health') {
    return sendJson(res, 200, { boomiConfigured: Boolean(BOOMI_BASE && AUTH), boomiHost: BOOMI_BASE ? new URL(BOOMI_BASE).host : null, apiBase: API_BASE, cacheTtlS: CACHE_TTL_MS / 1000 });
  }
  if (LIST_ROUTES[url.pathname]) return callBoomi(LIST_ROUTES[url.pathname](url.searchParams), res, fresh);

  let m = url.pathname.match(/^\/api\/orderlines\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!/^\d{1,6}$/.test(id)) return sendJson(res, 400, { error: 'Product ID must be a whole number, for example 11.' });
    return callBoomi(`${API_BASE}/orderlines/${id}`, res, fresh);
  }
  m = url.pathname.match(/^\/api\/invoices\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!/^\d{1,6}$/.test(id)) return sendJson(res, 400, { error: 'Order number must be a whole number, for example 10248.' });
    return callBoomi(`${API_BASE}/invoices/${id}`, res, fresh);
  }

  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Unknown API route' });
  serveStatic(url.pathname, res);
}).listen(PORT, () => {
  console.log(`Copperleaf Operations Portal → http://localhost:${PORT}`);
  console.log(BOOMI_BASE && AUTH
    ? `Proxying /api/* to Boomi at ${new URL(BOOMI_BASE).host}${API_BASE} (cache ${CACHE_TTL_MS / 1000}s)`
    : 'WARNING: SERVER_BASE_URL / SERVER_USERNAME / SERVER_TOKEN not set in .env — API calls will return 503.');
});
