// Integrasi Connect - AI Data Hub (Aras Integrasi embedded integration demo, powered by Boomi)
// Node gateway that
//   * serves the white-label portal (./public)
//   * stores tenant (customer) configuration: connections, mappings, PII policy       /api/tenants/...
//   * calls the Boomi API Service "AIH Integrasi Connect API" (/ws/rest/aras/v1) to preview and ingest each connection
//   * embeds the RAG-ready chunks Boomi returns into a per-tenant vector index and answers questions over it
// Boomi credentials stay server-side: SERVER_BASE_URL, SERVER_USERNAME, SERVER_TOKEN (env, ./.env or the workspace .env).
// Optional: ANTHROPIC_API_KEY to generate answers with Claude instead of the built-in extractive answer.
// Run:  npm start  ->  http://localhost:8095

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname, PUBLIC = path.join(ROOT, 'public'), DATA = path.join(ROOT, 'data');
const STATE = path.join(DATA, 'state'), UPLOADS = path.join(STATE, 'uploads');
const API_BASE = '/ws/rest/aras/v1';

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
const PORT = Number(env.PORT || 8095);
const BOOMI_BASE = (env.SERVER_BASE_URL || '').replace(/\/+$/, '');
const AUTH = env.SERVER_USERNAME && env.SERVER_TOKEN ? 'Basic ' + Buffer.from(`${env.SERVER_USERNAME}:${env.SERVER_TOKEN}`).toString('base64') : null;
const LLM_KEY = env.ANTHROPIC_API_KEY || '';
const LLM_MODEL = env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const ALLOWED_ORIGINS = new Set(String(env.ALLOWED_ORIGINS || 'https://karanamg.github.io,http://localhost:8095').split(',').map((s) => s.trim()).filter(Boolean));

/* ---------------- state ---------------- */
fs.mkdirSync(UPLOADS, { recursive: true });
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const seed = readJson(path.join(DATA, 'seed_tenants.json'), { tenants: [] });
let tenants = readJson(path.join(STATE, 'tenants.json'), null) || JSON.parse(JSON.stringify(seed.tenants));
let index = readJson(path.join(STATE, 'index.json'), {});      // tenantId -> [{ id, connId, docId, text, metadata, vec }]
let jobs = readJson(path.join(STATE, 'jobs.json'), []);
const save = { tenants: () => fs.writeFile(path.join(STATE, 'tenants.json'), JSON.stringify(tenants, null, 1), () => {}),
               index: () => fs.writeFile(path.join(STATE, 'index.json'), JSON.stringify(index), () => {}),
               jobs: () => fs.writeFile(path.join(STATE, 'jobs.json'), JSON.stringify(jobs.slice(0, 300)), () => {}) };
const tenantById = (id) => tenants.find((t) => t.id === id);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'tenant';

/* ---------------- embeddings + retrieval (demo model: hashed term vectors, runs locally) ---------------- */
const DIM = 1024;
const STOP = new Set('a an the and or of to in on for with at by from is are was were be been it this that these those as about into over after before than then there their they we you our your i me my he she his her its not no yes do does did has have had can could would should will which who what when where why how all any some each per more most less very also just only'.split(' '));
const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '').replace(/(.)\1$/, '$1');
function tokens(text) {
  return String(text).toLowerCase().replace(/\[(mykad|email|phone|redacted)\]/g, ' ').match(/[a-z0-9]+/g)?.filter((w) => w.length > 1 && !STOP.has(w)).map(stem) || [];
}
function embed(text) {
  const v = new Float32Array(DIM), t = tokens(text);
  const add = (term, w) => { const h = crypto.createHash('md5').update(term).digest(); const i = h.readUInt32LE(0) % DIM; v[i] += (h[4] & 1 ? 1 : -1) * w; };
  t.forEach((w, i) => { add(w, 1); if (i) add(t[i - 1] + '_' + w, 0.5); });
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  return Array.from(v, (x) => Math.round((x / n) * 1e4) / 1e4);
}
const cosine = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

function retrieve(tenantId, question, k = 6) {
  const q = embed(question), qt = new Set(tokens(question));
  return (index[tenantId] || []).map((c) => {
    const overlap = tokens(c.text).filter((w) => qt.has(w)).length;
    return { ...c, score: cosine(q, c.vec) + Math.min(overlap, 6) * 0.02 };
  }).filter((c) => c.score > 0.05).sort((a, b) => b.score - a.score).slice(0, k);
}
function extractiveAnswer(question, hits) {
  const qt = new Set(tokens(question));
  if (/\b(how many|number of|total|count|how much|population|enrolment|enrollment)\b/i.test(question)) {   // quantity questions: title + the numeric fields of each record
    const lines = hits.slice(0, 5).map((h, i) => {
      const [title, ...rest] = h.text.split('\n');
      const nums = rest.filter((l) => /:\s*[\d.,]+\s*$/.test(l)).map((l) => l.replace(/:\s*([\d.]+)$/, (m, n) => ': ' + Number(n).toLocaleString('en-US')));
      return nums.length ? `${title} - ${nums.join(', ')} [${i + 1}]` : null;
    }).filter(Boolean);
    if (lines.length) return { text: lines.join('\n'), mode: 'extractive' };
  }
  const sents = [];
  hits.forEach((h, i) => h.text.split(/\n|(?<=[.!?])\s+/).forEach((s, n) => {
    const tk = tokens(s), sc = tk.filter((w) => qt.has(w)).length;
    if (!sc || tk.length < 4 || /^(Status|Priority|Type|Product|Language|Rating|Stage|Sex|District|Beds|Students)\s*:/i.test(s)) return;   // skip short label lines
    sents.push({ s: s.trim().replace(/^Description:\s*/i, ''), sc: sc * (1 + Math.min(tk.length, 25) / 25) + (hits.length - i) * 0.15 - n * 0.05, ref: i + 1 });
  }));
  const seen = new Set(), perHit = {}, best = sents.sort((a, b) => b.sc - a.sc)
    .filter((x) => { const key = tokens(x.s).join(' '); if (seen.has(key) || (perHit[x.ref] || 0) >= 2) return false; seen.add(key); perHit[x.ref] = (perHit[x.ref] || 0) + 1; return true; }).slice(0, 5);
  if (!best.length) return { text: 'No indexed content matches that question yet. Run the tenant connections first.', mode: 'extractive' };
  return { text: best.map((b) => `${b.s} [${b.ref}]`).join('\n'), mode: 'extractive' };
}
function llmAnswer(question, hits, tenant) {
  return new Promise((resolve) => {
    const ctx = hits.map((h, i) => `[${i + 1}] (${h.metadata.source_system} - ${h.metadata.connection}) ${h.text}`).join('\n\n');
    const body = JSON.stringify({ model: LLM_MODEL, max_tokens: 500, system: `You answer questions for ${tenant.name} using only the numbered context. Cite sources like [1]. Personal data appears masked as [REDACTED], [MYKAD], [PHONE] or [EMAIL]; never try to reconstruct it. If the context does not answer the question, say so.`,
      messages: [{ role: 'user', content: `Context:\n${ctx}\n\nQuestion: ${question}` }] });
    const req = https.request('https://api.anthropic.com/v1/messages', { method: 'POST', timeout: 60000,
      headers: { 'x-api-key': LLM_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (r) => {
      let t = ''; r.on('data', (c) => (t += c)); r.on('end', () => {
        try { const j = JSON.parse(t); resolve(j.content ? { text: j.content.map((c) => c.text || '').join(''), mode: 'llm', model: LLM_MODEL } : { ...extractiveAnswer(question, hits), note: j.error?.message }); }
        catch { resolve(extractiveAnswer(question, hits)); }
      });
    });
    req.on('error', () => resolve(extractiveAnswer(question, hits)));
    req.on('timeout', () => req.destroy());
    req.end(body);
  });
}

/* ---------------- Boomi ---------------- */
function boomi(method, apiPath, body) {
  return new Promise((resolve) => {
    if (!BOOMI_BASE || !AUTH) return resolve({ status: 503, ms: 0, error: 'Boomi connection not configured (SERVER_BASE_URL, SERVER_USERNAME, SERVER_TOKEN).' });
    const url = new URL(BOOMI_BASE + apiPath), started = Date.now(), payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = (url.protocol === 'http:' ? http : https).request(url, { method, timeout: 120000,
      headers: { Authorization: AUTH, Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}) } }, (r) => {
      const chunks = []; r.on('data', (c) => chunks.push(c));
      r.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
        resolve({ status: r.statusCode, ms: Date.now() - started, json, text: json ? undefined : text.slice(0, 400) }); });
    });
    req.on('timeout', () => req.destroy(new Error('Boomi did not answer within 120 seconds')));
    req.on('error', (e) => resolve({ status: 502, ms: Date.now() - started, error: e.message }));
    if (payload) req.write(payload);
    req.end();
  });
}
const fileFor = (tenantId, name) => [path.join(UPLOADS, tenantId, name), path.join(DATA, 'files', name)].find((f) => fs.existsSync(f));
function buildRequest(t, c, mode, override = {}) {
  const config = { ...c.config, ...(override.config || {}) };
  if (c.type === 'FILE_CSV') {
    const f = config.fileName && fileFor(t.id, path.basename(config.fileName));
    config.csv = f ? fs.readFileSync(f, 'utf8') : '';
  }
  return { mode, tenant: { id: t.id, name: t.name, classification: t.classification }, connection: { id: c.id, name: c.name, type: c.type, config },
           mapping: override.mapping || c.mapping || {}, policy: override.policy || c.policy || {} };
}
const cache = new Map();
async function cachedGet(p, ttl = 600000) {
  const hit = cache.get(p); if (hit && Date.now() - hit.at < ttl) return hit.r;
  const r = await boomi('GET', p); if (r.status === 200) cache.set(p, { at: Date.now(), r }); return r;
}

/* ---------------- http helpers ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.csv': 'text/csv' };
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req, limit = 4 * 1024 * 1024) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
});
const readJsonBody = async (req) => { const b = (await readBody(req)).toString('utf8'); try { return b ? JSON.parse(b) : {}; } catch { throw Object.assign(new Error('Body must be JSON'), { status: 400 }); } };
const hits = new Map();
const limited = (req, perMin = 120) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now(), recent = (hits.get(ip) || []).filter((t) => now - t < 60000); recent.push(now); hits.set(ip, recent); return recent.length > perMin;
};
function tenantSummary(t) {
  const chunks = index[t.id] || [], tj = jobs.filter((j) => j.tenantId === t.id);
  return { id: t.id, name: t.name, industry: t.industry, solution: t.solution, color: t.color, classification: t.classification, boomiEnvironment: t.boomiEnvironment,
           region: t.region, connections: t.connections.length, chunks: chunks.length, documents: new Set(chunks.map((c) => c.connId + c.docId)).size,
           piiMasked: tj.filter((j) => j.ok && j.latest).reduce((s, j) => s + (j.stats?.piiMasked || 0), 0), lastRun: tj[0]?.at || null };
}

/* ---------------- routes ---------------- */
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost'), p = url.pathname, M = req.method;
  const origin = String(req.headers.origin || '');
  if (origin && ALLOWED_ORIGINS.has(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  if (M === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name'); res.writeHead(204); return res.end(); }
  if (p.startsWith('/api/') && p !== '/api/health' && limited(req)) return send(res, 429, { error: 'Too many requests - please slow down.' });

  if (p === '/api/health') return send(res, 200, { boomiConfigured: Boolean(BOOMI_BASE && AUTH), boomiHost: BOOMI_BASE ? new URL(BOOMI_BASE).host : null, apiBase: API_BASE, llm: LLM_KEY ? LLM_MODEL : null });
  if (p === '/api/connectors') { const r = await cachedGet(`${API_BASE}/connectors`); return send(res, r.status === 200 ? 200 : 502, r.json || { error: r.error || `Boomi HTTP ${r.status}` }); }
  if (p === '/api/boomi' && M === 'GET') {   // composable API "try it" - GET routes only, allow-listed
    const target = url.searchParams.get('path') || '';
    if (!/^\/ws\/rest\/(aras\/v1\/(connectors|sources\/salesforce\/cases|sources\/opendata)|saphub\/v1\/products)(\?|$)/.test(target)) return send(res, 400, { error: 'Only the read-only demo APIs can be called from here.' });
    const r = await boomi('GET', target);
    return send(res, 200, { status: r.status, ms: r.ms, path: target, body: r.json ?? r.text ?? r.error });
  }
  if (p === '/api/tenants' && M === 'GET') return send(res, 200, tenants.map(tenantSummary));
  if (p === '/api/tenants' && M === 'POST') {
    const b = await readJsonBody(req); if (!b.name) return send(res, 400, { error: 'Customer name is required.' });
    let id = slug(b.name); while (tenantById(id)) id += '-2';
    const t = { id, name: String(b.name).slice(0, 80), industry: b.industry || 'Public sector', solution: b.solution || 'AI knowledge assistant', color: b.color || '#7c3aed',
                classification: b.classification || 'Internal', boomiEnvironment: `ARAS-${id.toUpperCase()}-PROD`, region: b.region || 'MTAI Sovereign Cloud - Cyberjaya',
                connections: [], questions: [], createdAt: new Date().toISOString() };
    tenants.push(t); save.tenants(); return send(res, 201, t);
  }
  let m = p.match(/^\/api\/tenants\/([\w-]+)(\/.*)?$/);
  if (!m) {
    if (p === '/api/reset-demo' && M === 'POST') { tenants = JSON.parse(JSON.stringify(seed.tenants)); index = {}; jobs = []; save.tenants(); save.index(); save.jobs(); return send(res, 200, { ok: true }); }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'Unknown API route' });
    return serveStatic(p, url, res);
  }
  const t = tenantById(m[1]); if (!t) return send(res, 404, { error: 'Tenant not found' });
  const sub = m[2] || '';
  if (!sub && M === 'GET') return send(res, 200, { ...t, summary: tenantSummary(t) });
  if (sub === '/jobs') return send(res, 200, jobs.filter((j) => j.tenantId === t.id).slice(0, 50).map(({ result, mapping, policy, ...j }) => j));
  if ((m = sub.match(/^\/jobs\/([\w-]+)$/))) { const j = jobs.find((x) => x.id === m[1] && x.tenantId === t.id); return j ? send(res, 200, j) : send(res, 404, { error: 'Job not found' }); }
  if (sub === '/knowledge') {
    const by = {}; (index[t.id] || []).forEach((c) => { (by[c.connId] ||= { chunks: 0, docs: new Set() }).chunks++; by[c.connId].docs.add(c.docId); });
    return send(res, 200, t.connections.map((c) => ({ connId: c.id, name: c.name, type: c.type, chunks: by[c.id]?.chunks || 0, documents: by[c.id]?.docs.size || 0,
      lastRun: jobs.find((j) => j.tenantId === t.id && j.connId === c.id && j.mode === 'ingest')?.at || null })));
  }
  if (sub === '/files' && M === 'GET') {
    const own = fs.existsSync(path.join(UPLOADS, t.id)) ? fs.readdirSync(path.join(UPLOADS, t.id)) : [];
    const seeded = fs.readdirSync(path.join(DATA, 'files')).filter((f) => f.startsWith(t.id + '_'));
    return send(res, 200, [...new Set([...own, ...seeded])].filter((f) => f.endsWith('.csv')));
  }
  if (sub === '/files' && M === 'POST') {
    const name = path.basename(decodeURIComponent(req.headers['x-file-name'] || 'upload.csv')).replace(/[^\w.\-]/g, '_').slice(0, 80);
    if (!name.endsWith('.csv')) return send(res, 400, { error: 'Upload a .csv file.' });
    const buf = await readBody(req, 2 * 1024 * 1024); fs.mkdirSync(path.join(UPLOADS, t.id), { recursive: true });
    fs.writeFileSync(path.join(UPLOADS, t.id, name), buf); return send(res, 201, { fileName: name, bytes: buf.length });
  }
  if (sub === '/connections' && M === 'POST') {
    const b = await readJsonBody(req); if (!['SAP_S4HANA', 'SALESFORCE', 'FILE_CSV', 'OPEN_DATA'].includes(b.type)) return send(res, 400, { error: 'Unknown connector type.' });
    let id = slug(b.name || b.type); while (t.connections.some((c) => c.id === id)) id += '-2';
    const c = { id, name: b.name || b.type, type: b.type, config: b.config || {}, mapping: { id: '', title: '', content: [], metadata: [] }, policy: { maskFields: [], autoDetect: true, chunkSize: 500 } };
    t.connections.push(c); save.tenants(); return send(res, 201, c);
  }
  if ((m = sub.match(/^\/connections\/([\w-]+)(\/\w+)?$/))) {
    const c = t.connections.find((x) => x.id === m[1]); if (!c) return send(res, 404, { error: 'Connection not found' });
    const action = m[2] || '';
    if (!action && M === 'PUT') { const b = await readJsonBody(req); ['name', 'config', 'mapping', 'policy'].forEach((k) => { if (b[k] !== undefined) c[k] = b[k]; }); save.tenants(); return send(res, 200, c); }
    if (!action && M === 'DELETE') { t.connections = t.connections.filter((x) => x !== c); index[t.id] = (index[t.id] || []).filter((x) => x.connId !== c.id); save.tenants(); save.index(); return send(res, 200, { ok: true }); }
    if ((action === '/preview' || action === '/run') && M === 'POST') {
      const override = await readJsonBody(req), mode = action === '/run' ? 'ingest' : 'preview';
      const reqBody = buildRequest(t, c, mode, override);
      if (c.type === 'FILE_CSV' && !reqBody.connection.config.csv) return send(res, 400, { error: 'Choose or upload a CSV file for this connection first.' });
      const r = await boomi('POST', `${API_BASE}/ingest`, reqBody);
      const result = r.status === 200 && r.json && r.json.mode !== 'error' ? r.json : null;
      let embedMs = 0;
      if (result && mode === 'ingest') {
        const t0 = Date.now();
        index[t.id] = (index[t.id] || []).filter((x) => x.connId !== c.id).concat((result.chunks || []).map((ch) => ({ id: ch.id, connId: c.id, docId: ch.docId, text: ch.text, metadata: ch.metadata, vec: embed(ch.text) })));
        embedMs = Date.now() - t0; save.index();
      }
      const job = { id: crypto.randomUUID(), tenantId: t.id, connId: c.id, connName: c.name, type: c.type, mode, at: new Date().toISOString(), boomiMs: r.ms, embedMs,
                    ok: Boolean(result), error: result ? null : (r.json?.error || r.error || `Boomi returned HTTP ${r.status}`), stats: result?.stats || null,
                    executionId: result?.executionId || null, latest: true };
      if (mode === 'ingest' && job.ok) jobs.forEach((j) => { if (j.tenantId === t.id && j.connId === c.id) j.latest = false; });
      jobs.unshift({ ...job, mapping: reqBody.mapping, policy: reqBody.policy, result: result ? { ...result, chunks: undefined, chunkCount: (result.chunks || []).length } : null }); save.jobs();
      return send(res, result ? 200 : 502, { job, result: result ? { ...result, chunks: (result.chunks || []).slice(0, 5), chunkCount: (result.chunks || []).length } : null,
                                             boomi: { host: BOOMI_BASE ? new URL(BOOMI_BASE).host : null, path: `POST ${API_BASE}/ingest`, ms: r.ms }, embedMs, indexed: (index[t.id] || []).length });
    }
  }
  if (sub === '/ask' && M === 'POST') {
    const b = await readJsonBody(req), q = String(b.question || '').slice(0, 400);
    if (!q.trim()) return send(res, 400, { error: 'Ask a question.' });
    const t0 = Date.now(), found = retrieve(t.id, q, 6), retrMs = Date.now() - t0;
    const answer = found.length ? (LLM_KEY ? await llmAnswer(q, found, t) : extractiveAnswer(q, found)) : { text: 'Nothing indexed for this customer yet - run its connections first.', mode: 'none' };
    return send(res, 200, { question: q, answer, retrievalMs: retrMs, indexed: (index[t.id] || []).length,
                            hits: found.map(({ vec, ...h }) => ({ ...h, score: Math.round(h.score * 1000) / 1000 })) });
  }
  if (sub === '/index' && M === 'DELETE') { index[t.id] = []; save.index(); return send(res, 200, { ok: true }); }
  return send(res, 404, { error: 'Unknown tenant route' });
}

function serveStatic(p, url, res) {
  const PREFIX = '/projects/aras-ai-data-hub';
  if (p === PREFIX || p.startsWith(PREFIX + '/')) { res.writeHead(302, { Location: (p.slice(PREFIX.length) || '/') + url.search }); return res.end(); }
  const file = path.normalize(path.join(PUBLIC, p === '/' ? '/index.html' : decodeURIComponent(p)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  });
}

http.createServer((req, res) => handle(req, res).catch((e) => send(res, e.status || 500, { error: e.message })))
  .listen(PORT, () => {
    console.log(`Integrasi Connect - AI Data Hub -> http://localhost:${PORT}`);
    console.log(BOOMI_BASE && AUTH ? `Boomi API: ${new URL(BOOMI_BASE).host}${API_BASE}` : 'WARNING: SERVER_BASE_URL / SERVER_USERNAME / SERVER_TOKEN not set.');
    console.log(LLM_KEY ? `Answers: Claude (${LLM_MODEL})` : 'Answers: built-in extractive answers (set ANTHROPIC_API_KEY to use Claude)');
  });
