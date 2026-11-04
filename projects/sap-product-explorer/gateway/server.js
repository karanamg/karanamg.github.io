// SAP Product Explorer — gateway
// Dependency-free Node server that
//   * serves the front end (the folder above this one)
//   * proxies /api/* to the Boomi API Service "SAPHub Product API" (/ws/rest/saphub/v1)
//     with the Boomi shared-web-server credentials kept server-side.
// The Boomi processes call the SAP API Business Hub sandbox (API_PRODUCT_SRV) with the OData Client connector.
//
// Config (Railway variables, or gateway/.env locally):
//   SERVER_BASE_URL, SERVER_USERNAME, SERVER_TOKEN   Boomi runtime + shared web server user
//   ALLOWED_ORIGINS   comma-separated browser origins allowed to call /api (CORS)
//   RATE_LIMIT_PER_MIN, CACHE_TTL_MS                 optional tuning
// Run locally:  npm start  (= node --use-system-ca gateway/server.js)  →  http://localhost:8090

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.resolve(__dirname, '..');
const PRIVATE = __dirname;
const API_BASE = '/ws/rest/saphub/v1';

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
const env = { ...loadEnv(path.join(__dirname, '.env')), ...process.env };
const PORT = Number(env.PORT || 8090);
const BOOMI_BASE = (env.SERVER_BASE_URL || '').replace(/\/+$/, '');
const AUTH = env.SERVER_USERNAME && env.SERVER_TOKEN ? 'Basic ' + Buffer.from(`${env.SERVER_USERNAME}:${env.SERVER_TOKEN}`).toString('base64') : null;
const VERIFY_SSL = String(env.SERVER_VERIFY_SSL || 'true').toLowerCase() !== 'false';
const CACHE_TTL_MS = Number(env.CACHE_TTL_MS || 120000);
const RATE_LIMIT = Number(env.RATE_LIMIT_PER_MIN || 90);
const ALLOWED_ORIGINS = new Set(String(env.ALLOWED_ORIGINS || 'https://karanamg.github.io,http://localhost:8090')
  .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon' };

const cache = new Map();
const hits = new Map();
function rateLimited(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now(), recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 60000) hits.delete(k);
  return recent.length > RATE_LIMIT;
}
function sendJson(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function callBoomi(boomiPath, res, fresh) {
  if (!BOOMI_BASE || !AUTH) return sendJson(res, 503, { error: 'Boomi connection not configured', detail: 'Set SERVER_BASE_URL, SERVER_USERNAME and SERVER_TOKEN.' });
  const hit = cache.get(boomiPath);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return sendJson(res, 200, hit.body, { 'X-Boomi-Path': boomiPath, 'X-Boomi-Latency-Ms': String(hit.ms), 'X-Cache': 'HIT', 'X-Cache-Age-S': String(Math.round((Date.now() - hit.at) / 1000)) });
  }
  const started = Date.now();
  const req = https.request(new URL(BOOMI_BASE + boomiPath), { method: 'GET', headers: { Authorization: AUTH, Accept: 'application/json' }, rejectUnauthorized: VERIFY_SSL, timeout: 90000 }, (up) => {
    const chunks = [];
    up.on('data', (c) => chunks.push(c));
    up.on('end', () => {
      const ms = Date.now() - started, body = Buffer.concat(chunks).toString('utf8');
      const trace = { 'X-Boomi-Path': boomiPath, 'X-Boomi-Status': String(up.statusCode), 'X-Boomi-Latency-Ms': String(ms), 'X-Cache': 'MISS' };
      console.log(`[boomi] ${up.statusCode} ${ms}ms GET ${boomiPath}`);
      if (up.statusCode >= 200 && up.statusCode < 300) {
        // Only cache successful lookups (a product-not-found error should be re-checked next time).
        if (!/"error"\s*:/.test(body)) cache.set(boomiPath, { at: Date.now(), body: body || '{}', ms });
        return sendJson(res, 200, body || '{}', trace);
      }
      sendJson(res, up.statusCode === 401 ? 502 : up.statusCode, { error: up.statusCode === 401 ? 'Boomi rejected the credentials (HTTP 401)' : `Boomi returned HTTP ${up.statusCode}`, detail: body.slice(0, 500) }, trace);
    });
  });
  req.on('timeout', () => req.destroy(new Error('Timed out waiting for Boomi')));
  req.on('error', (e) => sendJson(res, 502, { error: 'Could not reach Boomi', detail: /certificate|issuer/i.test(e.message) ? `${e.message} — run with node --use-system-ca` : e.message }));
  req.end();
}
function serveStatic(urlPath, res) {
  const file = path.normalize(path.join(PUBLIC, urlPath === '/' ? '/index.html' : urlPath));
  if (!file.startsWith(PUBLIC) || file.startsWith(PRIVATE)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Expose-Headers', 'X-Boomi-Path, X-Boomi-Status, X-Boomi-Latency-Ms, X-Cache, X-Cache-Age-S');
  }
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET'); res.writeHead(204); return res.end(); }
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  const fresh = url.searchParams.get('fresh') === '1';

  if (url.pathname === '/api/health') return sendJson(res, 200, { boomiConfigured: Boolean(BOOMI_BASE && AUTH), boomiHost: BOOMI_BASE ? new URL(BOOMI_BASE).host : null, apiBase: API_BASE });
  if (url.pathname.startsWith('/api/') && rateLimited(req)) return sendJson(res, 429, { error: 'Too many requests - please slow down' });

  if (url.pathname === '/api/products') {
    // OData string literal: escape single quotes by doubling them (Boomi embeds the value in $filter).
    const search = String(url.searchParams.get('search') || '').trim().slice(0, 40).replace(/'/g, "''");
    return callBoomi(`${API_BASE}/products?${new URLSearchParams({ search })}`, res, fresh);
  }
  const m = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (m) {
    const product = decodeURIComponent(m[1]).trim().toUpperCase();
    if (!/^[A-Z0-9_\-./]{1,40}$/.test(product)) return sendJson(res, 400, { error: 'Invalid product number' });
    return callBoomi(`${API_BASE}/products/${encodeURIComponent(product)}`, res, fresh);
  }
  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Unknown API route' });
  const PREFIX = '/projects/sap-product-explorer';
  if (url.pathname === PREFIX || url.pathname.startsWith(PREFIX + '/')) { res.writeHead(302, { Location: (url.pathname.slice(PREFIX.length) || '/') + url.search }); return res.end(); }
  serveStatic(url.pathname, res);
}).listen(PORT, () => {
  console.log(`SAP Product Explorer → http://localhost:${PORT}`);
  console.log(BOOMI_BASE && AUTH ? `Proxying /api/* to Boomi at ${new URL(BOOMI_BASE).host}${API_BASE}` : 'WARNING: SERVER_BASE_URL / SERVER_USERNAME / SERVER_TOKEN not set — API calls will return 503.');
});
