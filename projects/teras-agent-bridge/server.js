// Teras Connect - Aras Integrasi x MTAI OEM workshop demo (24 Nov 2026), powered by Boomi.
// Multi-tenant integration console (forked from Integrasi Connect AI Data Hub) extended with:
//   * IBM P-Series (IBM i DB2) as a source - simulated legacy system in ./legacy.js, read by Boomi
//   * publishing a connection as a governed agent tool + a virtual assistant that consumes the tools
//   * a runtime switch: the same Boomi processes on the ON-PREM runtime (Docker Atom guru-mac-mcp, inside the firewall) or the Boomi CLOUD runtime
// Boomi credentials stay server-side: SERVER_BASE_URL / SERVER_USERNAME / SERVER_TOKEN (cloud), ONPREM_BASE_URL (+ optional ONPREM_USERNAME / ONPREM_TOKEN).
// Run:  npm start  ->  http://localhost:8096
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname, PUBLIC = path.join(ROOT, 'public'), DATA = path.join(ROOT, 'data');
const STATE = path.join(DATA, 'state'), UPLOADS = path.join(STATE, 'uploads');
const API_BASE = '/ws/rest/aras/v1';
const legacy = require('./legacy');
const TERAS = require('./teras');

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
const PORT = Number(env.PORT || 8096);
const BOOMI_BASE = (env.SERVER_BASE_URL || '').replace(/\/+$/, '');
const AUTH = env.SERVER_USERNAME && env.SERVER_TOKEN ? 'Basic ' + Buffer.from(`${env.SERVER_USERNAME}:${env.SERVER_TOKEN}`).toString('base64') : null;
const LLM_KEY = env.ANTHROPIC_API_KEY || '';
const LLM_MODEL = env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const LEGACY_TOKEN = env.LEGACY_TOKEN || (fs.existsSync(path.join(ROOT, '.legacy_token')) ? fs.readFileSync(path.join(ROOT, '.legacy_token'), 'utf8').trim() : '');
const ONPREM_BASE = (env.ONPREM_BASE_URL || ((env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID) ? '' : 'http://localhost:9090')).replace(/\/+$/, '');
const ONPREM_AUTH = env.ONPREM_USERNAME && env.ONPREM_TOKEN ? 'Basic ' + Buffer.from(`${env.ONPREM_USERNAME}:${env.ONPREM_TOKEN}`).toString('base64') : null;
// One build, two runtimes. Both are attached to the same Boomi environment, so every deployment lands on both.
// The cloud runtime is an Advanced (API Service) runtime; the on-prem Atom serves the same listener processes on its shared web server.
// Laptop console + corporate SSL inspection: cloud calls can be relayed through the public Teras Connect deployment (token-protected, allow-listed paths).
const CLOUD_RELAY = (env.CLOUD_RELAY_URL ?? ((env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID) ? '' : 'https://teras-agent-bridge.up.railway.app')).replace(/\/+$/, '');
const RELAY_PATHS = /^\/ws\/rest\/(aras\/v1\/(ingest|connectors|sources\/[\w/]+)|teras\/v1\/(vehicle|licence|summons|health-check)|saphub\/v1\/(products|salesorders))(\?|$)/;
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const RUNTIMES = {
  onprem: { id: 'onprem', label: 'On-prem runtime', name: 'guru-mac-mcp', kind: 'Boomi Atom (Docker) - customer data centre', base: ONPREM_BASE, auth: ONPREM_AUTH,
            network: 'Inside the firewall: reads the IBM i over the internal network; only outbound HTTPS to the Boomi platform',
            ingest: '/ws/simple/createArasIngest', connectors: '/ws/simple/getArasConnectors', tool: (t) => `/ws/simple/executeTeras${cap(t)}` },
  cloud: { id: 'cloud', label: 'Boomi Cloud runtime', name: 'Boomi test cloud (US East)', kind: 'Boomi-managed cloud runtime', base: BOOMI_BASE, auth: AUTH,
           network: 'Public cloud: reaches the IBM i through the IBM i HTTP gateway over the internet',
           ingest: `${API_BASE}/ingest`, connectors: `${API_BASE}/connectors`, tool: (t) => `/ws/rest/teras/v1/${t}` },
};
const rtOf = (req, t) => { const h = String(req.headers['x-teras-runtime'] || '').toLowerCase(); return RUNTIMES[h] ? h : (t?.runtime && RUNTIMES[t.runtime] ? t.runtime : 'cloud'); };
// Boomi Agentstudio agent "JPJ Counter Assistant (Teras)" - optional second assistant engine. Its OpenAPI tools call the Boomi CLOUD runtime
// (Agentstudio runs in the Boomi cloud), with the counter-officer context fixed in each tool's request template.
// Execute API credentials = the workspace Boomi API token (laptop console only); the deployment id lives in agentstudio.json (non-secret).
const AS_CFG = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'agentstudio.json'), 'utf8')); } catch { return {}; } })();
const AGENTSTUDIO = { url: (env.AGENTSTUDIO_EXECUTE_URL || AS_CFG.execute_url || '').replace(/\/+$/, ''), account: env.BOOMI_ACCOUNT_ID || '', deployment: env.TERAS_AGENT_DEPLOYMENT_ID || AS_CFG.deployment_id || '',
  auth: env.BOOMI_USERNAME && env.BOOMI_API_TOKEN ? 'Basic ' + Buffer.from(`BOOMI_TOKEN.${env.BOOMI_USERNAME}:${env.BOOMI_API_TOKEN}`).toString('base64') : null, agent: AS_CFG.agent_name || 'JPJ Counter Assistant (Teras)', tenant: AS_CFG.tenant || 'jpj' };
AGENTSTUDIO.ready = Boolean(AGENTSTUDIO.url && AGENTSTUDIO.account && AGENTSTUDIO.deployment && AGENTSTUDIO.auth);
function agentstudioSession(message, sessionId) {
  return new Promise((resolve) => {
    const started = Date.now(), payload = Buffer.from(JSON.stringify({ deployment_id: AGENTSTUDIO.deployment, ...(sessionId ? { session_id: sessionId } : {}), message }));
    const rq = https.request(`${AGENTSTUDIO.url}/execute/api/v1/${AGENTSTUDIO.account}/session`, { method: 'POST', timeout: 150000,
      headers: { Authorization: AGENTSTUDIO.auth, 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json', 'Content-Length': payload.length, 'User-Agent': 'teras-connect-demo' } }, (r) => {
      const ch = []; r.on('data', (c) => ch.push(c));
      r.on('end', () => {
        const text = Buffer.concat(ch).toString('utf8'), events = [];
        if (r.statusCode !== 200) return resolve({ ok: false, ms: Date.now() - started, error: `Agentstudio HTTP ${r.statusCode}: ${text.slice(0, 300)}` });
        let cur = { event: 'message', data: '' };
        for (const line of text.split(/\r?\n/)) {   // SSE: "event: x" / "data: {...}" blocks separated by blank lines
          if (line.startsWith('event:')) cur.event = line.slice(6).trim();
          else if (line.startsWith('data:')) cur.data += line.slice(5).trim();
          else if (!line.trim() && cur.data) { let d = cur.data; try { d = JSON.parse(cur.data); } catch { /* text */ } events.push({ event: cur.event, data: d }); cur = { event: 'message', data: '' }; }
        }
        if (cur.data) { let d = cur.data; try { d = JSON.parse(cur.data); } catch { /* text */ } events.push({ event: cur.event, data: d }); }
        if (!events.length && text.trim().startsWith('{')) { try { events.push({ event: 'json', data: JSON.parse(text) }); } catch { /* ignore */ } }
        const sid = events.map((e) => e.data?.session_id).find(Boolean) || sessionId || null;
        const answer = events.filter((e) => e.event === 'message' || e.event === 'json').map((e) => (typeof e.data === 'string' ? e.data : e.data?.content ?? e.data?.data?.content ?? e.data?.message ?? '')).filter((x) => typeof x === 'string').join('');
        resolve({ ok: true, ms: Date.now() - started, sessionId: sid, answer: answer || '(no text in the agent reply)', events });
      });
    });
    rq.on('timeout', () => rq.destroy(new Error('Agentstudio did not answer within 150 seconds')));
    rq.on('error', (e) => resolve({ ok: false, ms: Date.now() - started, error: e.message }));
    rq.end(payload);
  });
}
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
const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '').replace(/(.)\1$/, '$1').replace(/e$/, '');   // eBike/eBikes and case/cases share a stem
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
function boomi(method, apiPath, body, rt = 'cloud', timeoutMs = 120000) {
  return new Promise((resolve) => {
    const R = RUNTIMES[rt] || RUNTIMES.cloud;
    if (!R.base) return resolve({ status: 503, ms: 0, error: rt === 'onprem' ? 'The on-prem runtime is inside the firewall and is not reachable from this public deployment - run Teras Connect inside the sovereign zone (npm start) to use it.' : 'Boomi connection not configured (SERVER_BASE_URL, SERVER_USERNAME, SERVER_TOKEN).' });
    if (rt === 'cloud' && CLOUD_RELAY) {   // relay: same request, executed by the public deployment against the Boomi cloud runtime
      const started = Date.now(), payload = Buffer.from(JSON.stringify({ method, path: apiPath, body: body || null }));
      const rq = https.request(CLOUD_RELAY + '/api/relay', { method: 'POST', timeout: timeoutMs + 5000, headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, 'X-Relay-Token': LEGACY_TOKEN } }, (r) => {
        const ch = []; r.on('data', (c) => ch.push(c));
        r.on('end', () => { try { const j = JSON.parse(Buffer.concat(ch).toString('utf8')); resolve({ ...j, ms: Date.now() - started, relayed: true }); } catch { resolve({ status: 502, ms: Date.now() - started, error: `Relay returned HTTP ${r.statusCode}` }); } });
      });
      rq.on('timeout', () => rq.destroy(new Error('Relay timed out'))); rq.on('error', (e) => resolve({ status: 502, ms: Date.now() - started, error: 'Relay: ' + e.message }));
      return rq.end(payload);
    }
    if (rt === 'cloud' && !AUTH) return resolve({ status: 503, ms: 0, error: 'Boomi cloud credentials not configured.' });
    const url = new URL(R.base + apiPath), started = Date.now(), payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = (url.protocol === 'http:' ? http : https).request(url, { method, timeout: timeoutMs,
      headers: { ...(R.auth ? { Authorization: R.auth } : {}), Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}) } }, (r) => {
      const chunks = []; r.on('data', (c) => chunks.push(c));
      r.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
        resolve({ status: r.statusCode, ms: Date.now() - started, json, text: json ? undefined : text.slice(0, 400) }); });
    });
    req.on('timeout', () => req.destroy(new Error(`Boomi did not answer within ${timeoutMs / 1000} seconds`)));
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
async function cachedGet(p, ttl = 600000, rt = 'cloud') {
  const k = rt + p, hit = cache.get(k); if (hit && Date.now() - hit.at < ttl) return hit.r;
  const r = await boomi('GET', p, null, rt); if (r.status === 200) cache.set(k, { at: Date.now(), r }); return r;
}

/* ---------------- governed agent tools (IBM P-Series via Boomi) ---------------- */
async function callTool(tool, query, context, rt) {
  const body = { query: Object.fromEntries(Object.entries(query || {}).filter(([, v]) => v)), context };
  const R = RUNTIMES[rt] || RUNTIMES.cloud, r = await boomi('POST', R.tool(tool), body, rt, 90000);
  const result = r.json && r.json.tool ? r.json : null;
  return { tool, toolName: TERAS.TOOLS[tool]?.name, runtime: rt, request: { method: 'POST', path: R.tool(tool), body }, httpStatus: r.status, ms: r.ms,
           result, error: result ? null : (r.error || r.json?.message || r.text || `Boomi returned HTTP ${r.status}`) };
}
const liveTools = (t) => [...new Set(t.connections.filter((c) => c.type === 'IBM_PSERIES' && c.published).map((c) => TERAS.FILE_TOOL[(c.config?.file || '').toUpperCase()]).filter(Boolean))];
function tenantTools(t) {
  const out = liveTools(t).map((k) => ({ kind: 'live', key: k, ...TERAS.TOOLS[k], connection: t.connections.find((c) => c.published && TERAS.FILE_TOOL[(c.config?.file || '').toUpperCase()] === k)?.name,
    endpoints: { cloud: 'POST ' + RUNTIMES.cloud.tool(k), onprem: 'POST ' + RUNTIMES.onprem.tool(k) } }));
  const chunks = (index[t.id] || []).length;
  out.push({ kind: 'knowledge', key: 'knowledge', name: 'knowledge_search', title: 'Knowledge search', description: `Semantic search over ${t.name}'s ingested, mapped and PII-masked documents (${chunks} chunks from ${new Set((index[t.id] || []).map((c) => c.connId)).size} sources).`, chunks, params: { question: 'Natural-language question' } });
  return out;
}
const KNOWLEDGE_HINT = /complain|feedback|aduan|why |how many|which (customers|students|patients|feedback)|survey|report|problem|issue|queue|payment|appointment|reminder/i;
async function tenantAgent(t, message, persona, rt) {
  const live = new Set(liveTools(t));
  const planned = live.size ? TERAS.plan(message, persona) : { clarify: true };
  const steps = (planned.steps || []).filter((st) => live.has(st.tool));
  const useKnowledge = !steps.length || (KNOWLEDGE_HINT.test(message) && !planned.entities?.plates?.length && !planned.entities?.ics?.length);
  if (useKnowledge) {
    const t0 = Date.now(), hits = retrieve(t.id, message, 6), ms = Date.now() - t0;
    const answer = hits.length ? (LLM_KEY ? await llmAnswer(message, hits, t) : extractiveAnswer(message, hits)) : { text: (index[t.id] || []).length ? 'I could not find anything about that in the knowledge index.' : `${t.name}'s knowledge index is empty - run its connections first (Run & monitor).`, mode: 'none' };
    return { answer: answer.text, planner: 'teras-slm-sim', plan: { intent: ['knowledge'] }, calls: [{ tool: 'knowledge', toolName: 'knowledge_search', kind: 'knowledge', ms, hits: hits.map(({ vec, ...h }) => ({ ...h, score: Math.round(h.score * 1000) / 1000 })), indexed: (index[t.id] || []).length }] };
  }
  const calls = [];
  calls.push(...await Promise.all(steps.filter((st) => !st.chainFromVehicle).map((st) => callTool(st.tool, st.query, persona.context, rt))));
  for (const st of steps.filter((x) => x.chainFromVehicle)) {
    const ownerIc = calls.find((c) => c.tool === 'vehicle')?.result?.records?.[0]?.owner_ic;
    if (ownerIc && !ownerIc.includes('*') && !ownerIc.startsWith('PERSON-')) calls.push(await callTool(st.tool, { ic: ownerIc }, persona.context, rt));
    else calls.push({ tool: st.tool, toolName: TERAS.TOOLS[st.tool].name, result: { decision: 'SKIP' }, skipped: ownerIc ? `Cannot link the owner's licence: this channel only receives a masked MyKad (${ownerIc}).` : 'The vehicle lookup returned no owner to link to.', ms: 0 });
  }
  const order = { vehicle: 0, licence: 1, summons: 2 }; calls.sort((a, b) => order[a.tool] - order[b.tool]);
  return { answer: TERAS.compose({ ...planned, steps }, calls, persona), planner: 'teras-slm-sim', plan: { ...planned, steps }, calls };
}
// Health check that executes NO Boomi process: ask the runtime's shared web server for a path no listener owns.
// A 404 "Unknown operation" comes from the web server itself, which proves the runtime is up (and, on cloud, that auth was accepted).
// Results are cached for 60 s, so many open tabs never multiply the calls.
const HEALTH_PATH = { onprem: '/ws/simple/terasHealthCheck', cloud: '/ws/rest/teras/v1/health-check' };
const probeCache = {};
async function probe(rt) {
  const R = RUNTIMES[rt], t0 = Date.now();
  if (!R.base) return { id: rt, reachable: false, ms: 0, detail: 'Not reachable from this deployment (inside the firewall)' };
  if (probeCache[rt] && Date.now() - probeCache[rt].at < 60000) return probeCache[rt].r;
  const r = await boomi('GET', HEALTH_PATH[rt], null, rt, 20000);
  const up = r.status === 404 || r.status === 200 || r.status === 405;
  const out = { id: rt, reachable: up, ms: r.relayed ? (r.boomiMs ?? r.ms) : r.ms, detail: up ? `Runtime web server responding at ${new URL(R.base).host} (no process executed)` : r.status === 401 ? 'HTTP 401 - credentials rejected' : (r.error || `HTTP ${r.status}`) };
  probeCache[rt] = { at: Date.now(), r: out };
  return out;
}
// mapping templates: a new connection of a type another tenant already uses starts from that tenant's mapping and PII policy
function reuseTemplate(type, config, exceptTenant) {
  for (const t of tenants) {
    if (t.id === exceptTenant) continue;
    const c = t.connections.find((x) => x.type === type && (type !== 'IBM_PSERIES' || (x.config?.file || '') === (config?.file || '')) && x.mapping?.title);
    if (c) return { mapping: JSON.parse(JSON.stringify(c.mapping)), policy: JSON.parse(JSON.stringify(c.policy || {})), reusedFrom: `${t.name} - ${c.name}` };
  }
  return null;
}
const BOOMI_COMPONENTS = {
  IBM_PSERIES: ['[SUB] AIH IBM P-Series (IBM i DB2)', 'TERAS JPJ IBM i Gateway Connection', 'TERAS JPJ IBM i Internal Connection (on-prem)'],
  SAP_S4HANA: ['[SUB] SAPHub Search Products', 'SAPHub OData Client Connection (API Key)'], SAP_SALES_ORDERS: ['[SUB] AIH SAP S4HANA Sales Orders', 'SAPHub OData Client Connection (API Key)'],
  SALESFORCE: ['[SUB] AIH Salesforce Service Cloud Cases (Simulated)'], FILE_CSV: ['[SUB] AIH File Drop (CSV)'], OPEN_DATA: ['[SUB] AIH Malaysia Open Data (data.gov.my)', 'AIH data.gov.my Open Data Connection'] };

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
           region: t.region, runtime: t.runtime || 'cloud', tools: liveTools(t).length, connections: t.connections.length, chunks: chunks.length, documents: new Set(chunks.map((c) => c.connId + c.docId)).size,
           piiMasked: tj.filter((j) => j.ok && j.latest).reduce((s, j) => s + (j.stats?.piiMasked || 0), 0), lastRun: tj[0]?.at || null };
}

/* ---------------- routes ---------------- */
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost'), p = url.pathname, M = req.method;
  const origin = String(req.headers.origin || '');
  if (origin && ALLOWED_ORIGINS.has(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  if (p.startsWith('/legacy/ibmi/v1/')) {   // the simulated IBM i itself - only Boomi holds the token
    if (!LEGACY_TOKEN || req.headers['x-ibmi-token'] !== LEGACY_TOKEN) { res.writeHead(401, { 'Content-Type': 'text/plain' }); return res.end('CPF2204: User profile not authorised.'); }
    if (p === '/legacy/ibmi/v1/query') {
      const r = legacy.query(url.searchParams.get('file'), url.searchParams.get('by'), url.searchParams.get('key'));
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'X-IBMi-Records': String(r.lines?.length || 0) });
      return res.end(r.error || r.lines.join('\n'));
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('CPF9801: Object not found.');
  }
  if (M === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name, X-Teras-Runtime'); res.writeHead(204); return res.end(); }
  if (p.startsWith('/api/') && p !== '/api/health' && limited(req)) return send(res, 429, { error: 'Too many requests - please slow down.' });

  if (p === '/api/health') return send(res, 200, { boomiConfigured: Boolean(BOOMI_BASE && AUTH), boomiHost: BOOMI_BASE ? new URL(BOOMI_BASE).host : null, apiBase: API_BASE, llm: LLM_KEY ? LLM_MODEL : null,
    agentstudio: { ready: AGENTSTUDIO.ready, agent: AGENTSTUDIO.agent, tenant: AGENTSTUDIO.tenant, missing: [!AGENTSTUDIO.url && 'AGENTSTUDIO_EXECUTE_URL', !AGENTSTUDIO.deployment && 'deployment id', !AGENTSTUDIO.auth && 'Boomi API token'].filter(Boolean) },
    runtimes: Object.values(RUNTIMES).map((R) => ({ id: R.id, label: R.label, name: R.name, kind: R.kind, network: R.network, host: R.base ? new URL(R.base).host : null, available: Boolean(R.base), relayed: R.id === 'cloud' && Boolean(CLOUD_RELAY) })) });
  if (p === '/api/relay' && M === 'POST') {
    if (!LEGACY_TOKEN || req.headers['x-relay-token'] !== LEGACY_TOKEN || CLOUD_RELAY) return send(res, 403, { error: 'Relay not allowed' });
    const b = await readJsonBody(req);
    if (!['GET', 'POST'].includes(b.method) || !RELAY_PATHS.test(String(b.path || ''))) return send(res, 400, { error: 'Path not allowed' });
    const r = await boomi(b.method, b.path, b.body || undefined, 'cloud', 110000);
    return send(res, 200, { status: r.status, json: r.json, text: r.text, error: r.error, boomiMs: r.ms });
  }
  if (p === '/api/runtimes') return send(res, 200, await Promise.all(Object.keys(RUNTIMES).map(probe)));
  if (p === '/api/connectors') {   // catalogue served by Boomi on the SELECTED runtime only - never a silent fallback to another runtime
    const rt = rtOf(req), r = await cachedGet(RUNTIMES[rt].connectors, 600000, rt);
    return send(res, r.status === 200 ? 200 : 502, r.json || { error: `${RUNTIMES[rt].label}: ${r.error || `Boomi HTTP ${r.status}`}` });
  }
  if (p === '/api/library') {   // reusable connection library: one Boomi connector, many tenants (same cached catalogue call, selected runtime)
    const rt = rtOf(req), cat = (await cachedGet(RUNTIMES[rt].connectors, 600000, rt)).json?.connectors || [];
    return send(res, 200, cat.map((c) => ({ ...c, components: BOOMI_COMPONENTS[c.type] || [],
      usedBy: tenants.filter((t) => t.connections.some((x) => x.type === c.type)).map((t) => ({ id: t.id, name: t.name, connections: t.connections.filter((x) => x.type === c.type).map((x) => x.name) })) })));
  }
  if (p === '/api/legacy' && M === 'GET') {
    const file = url.searchParams.get('file') || 'VEHMST';
    if (!legacy.files.includes(file)) return send(res, 400, { error: 'Unknown file' });
    return send(res, 200, { layout: legacy.layout(file), lines: legacy.all(file) });
  }
  if (p === '/api/compare-runtimes' && M === 'POST') {   // the same governed tool call on both runtimes
    const b = await readJsonBody(req), tool = TERAS.TOOLS[b.tool] ? b.tool : 'vehicle', persona = TERAS.PERSONAS[b.persona] || TERAS.PERSONAS.officer;
    const results = await Promise.all(Object.keys(RUNTIMES).map((rt) => callTool(tool, b.query || { plate: 'WXY 1234' }, persona.context, rt)));
    return send(res, 200, { tool, persona: persona.id, results: results.map((r) => ({ ...r, runtimeInfo: { label: RUNTIMES[r.runtime].label, name: RUNTIMES[r.runtime].name, host: RUNTIMES[r.runtime].base ? new URL(RUNTIMES[r.runtime].base).host : null } })) });
  }
  if (p === '/openapi.json') return send(res, 200, TERAS.openapi(BOOMI_BASE + '/ws/rest/teras/v1'));
  if (p === '/api/boomi' && M === 'GET') {   // composable API "try it" - GET routes only, allow-listed
    const target = url.searchParams.get('path') || '';
    if (!/^\/ws\/(rest\/(aras\/v1\/(connectors|sources\/salesforce\/cases|sources\/opendata)|saphub\/v1\/(products|salesorders))|simple\/getArasConnectors)(\?|$)/.test(target)) return send(res, 400, { error: 'Only the read-only demo APIs can be called from here.' });
    const r = await boomi('GET', target, null, target.startsWith('/ws/simple/') ? 'onprem' : 'cloud');
    return send(res, 200, { status: r.status, ms: r.ms, path: target, body: r.json ?? r.text ?? r.error });
  }
  if (p === '/api/meta') return send(res, 200, { personas: Object.values(TERAS.PERSONAS).filter((x) => !x.hidden), tools: TERAS.TOOLS, layouts: legacy.files.map((f) => legacy.layout(f)) });
  if (p === '/api/tenants' && M === 'GET') return send(res, 200, tenants.map(tenantSummary));
  if (p === '/api/tenants' && M === 'POST') {
    const b = await readJsonBody(req); if (!b.name) return send(res, 400, { error: 'Customer name is required.' });
    let id = slug(b.name); while (tenantById(id)) id += '-2';
    const t = { id, name: String(b.name).slice(0, 80), industry: b.industry || 'Public sector', solution: b.solution || 'AI knowledge assistant', color: b.color || '#7c3aed',
                classification: b.classification || 'Internal', boomiEnvironment: `ARAS-${id.toUpperCase()}-PROD`, runtime: b.runtime === 'cloud' ? 'cloud' : 'onprem',
                region: b.runtime === 'cloud' ? 'MTAI Sovereign Cloud - Cyberjaya (Boomi cloud runtime)' : (b.region || 'Customer data centre (on-premise runtime)'),
                connections: [], questions: [], createdAt: new Date().toISOString() };
    for (const pick of (Array.isArray(b.connections) ? b.connections : []).slice(0, 8)) {   // reuse connections from the library, with their mapping templates
      if (!['SAP_S4HANA', 'SAP_SALES_ORDERS', 'SALESFORCE', 'FILE_CSV', 'OPEN_DATA', 'IBM_PSERIES'].includes(pick.type)) continue;
      const tpl = reuseTemplate(pick.type, pick.config, t.id);
      let cid = slug(pick.name || pick.type); while (t.connections.some((c) => c.id === cid)) cid += '-2';
      t.connections.push({ id: cid, name: pick.name || pick.type, type: pick.type, config: pick.config || {}, published: pick.type === 'IBM_PSERIES',
        mapping: tpl?.mapping || { id: '', title: '', content: [], metadata: [] }, policy: tpl?.policy || { maskFields: [], autoDetect: true, chunkSize: 500 }, reusedFrom: tpl?.reusedFrom || null });
    }
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
    const b = await readJsonBody(req); if (!['SAP_S4HANA', 'SAP_SALES_ORDERS', 'SALESFORCE', 'FILE_CSV', 'OPEN_DATA', 'IBM_PSERIES'].includes(b.type)) return send(res, 400, { error: 'Unknown connector type.' });
    let id = slug(b.name || b.type); while (t.connections.some((c) => c.id === id)) id += '-2';
    const tpl = reuseTemplate(b.type, b.config, t.id);
    const c = { id, name: b.name || b.type, type: b.type, config: b.config || {}, published: b.type === 'IBM_PSERIES',
                mapping: tpl?.mapping || { id: '', title: '', content: [], metadata: [] }, policy: tpl?.policy || { maskFields: [], autoDetect: true, chunkSize: 500 }, reusedFrom: tpl?.reusedFrom || null };
    t.connections.push(c); save.tenants(); return send(res, 201, c);
  }
  if ((m = sub.match(/^\/connections\/([\w-]+)(\/\w+)?$/))) {
    const c = t.connections.find((x) => x.id === m[1]); if (!c) return send(res, 404, { error: 'Connection not found' });
    const action = m[2] || '';
    if (!action && M === 'PUT') { const b = await readJsonBody(req); ['name', 'config', 'mapping', 'policy', 'published'].forEach((k) => { if (b[k] !== undefined) c[k] = b[k]; }); save.tenants(); return send(res, 200, c); }
    if (!action && M === 'DELETE') { t.connections = t.connections.filter((x) => x !== c); index[t.id] = (index[t.id] || []).filter((x) => x.connId !== c.id); save.tenants(); save.index(); return send(res, 200, { ok: true }); }
    if ((action === '/preview' || action === '/run') && M === 'POST') {
      const override = await readJsonBody(req), mode = action === '/run' ? 'ingest' : 'preview';
      const reqBody = buildRequest(t, c, mode, override);
      if (c.type === 'FILE_CSV' && !reqBody.connection.config.csv) return send(res, 400, { error: 'Choose or upload a CSV file for this connection first.' });
      const rt = rtOf(req, t), r = await boomi('POST', RUNTIMES[rt].ingest, reqBody, rt);
      const result = r.status === 200 && r.json && r.json.mode !== 'error' ? r.json : null;
      let embedMs = 0;
      if (result && mode === 'ingest') {
        const t0 = Date.now();
        index[t.id] = (index[t.id] || []).filter((x) => x.connId !== c.id).concat((result.chunks || []).map((ch) => ({ id: ch.id, connId: c.id, docId: ch.docId, text: ch.text, metadata: ch.metadata, vec: embed(ch.text) })));
        embedMs = Date.now() - t0; save.index();
      }
      const job = { id: crypto.randomUUID(), tenantId: t.id, connId: c.id, connName: c.name, type: c.type, mode, at: new Date().toISOString(), boomiMs: r.ms, embedMs,
                    ok: Boolean(result), error: result ? null : (r.json?.error || r.error || `Boomi returned HTTP ${r.status}`), stats: result?.stats || null,
                    executionId: result?.executionId || null, latest: true,
                    runtime: { id: rt, label: RUNTIMES[rt].label, name: result?.runtime?.name || RUNTIMES[rt].name, zone: result?.runtime?.zone || (rt === 'onprem' ? 'ONPREM' : 'CLOUD') } };
      if (mode === 'ingest' && job.ok) jobs.forEach((j) => { if (j.tenantId === t.id && j.connId === c.id) j.latest = false; });
      jobs.unshift({ ...job, mapping: reqBody.mapping, policy: reqBody.policy, result: result ? { ...result, chunks: undefined, chunkCount: (result.chunks || []).length } : null }); save.jobs();
      return send(res, result ? 200 : 502, { job, result: result ? { ...result, chunks: (result.chunks || []).slice(0, 5), chunkCount: (result.chunks || []).length } : null,
                                             boomi: { host: RUNTIMES[rt].base ? new URL(RUNTIMES[rt].base).host : null, path: `POST ${RUNTIMES[rt].ingest}`, ms: r.ms, runtime: job.runtime }, embedMs, indexed: (index[t.id] || []).length });
    }
  }
  if (sub === '/tools') return send(res, 200, tenantTools(t));
  if ((m = sub.match(/^\/tools\/(vehicle|licence|summons)$/)) && M === 'POST') {
    if (!liveTools(t).includes(m[1])) return send(res, 404, { error: `${TERAS.TOOLS[m[1]].name} is not published for ${t.name}.` });
    const b = await readJsonBody(req), persona = TERAS.PERSONAS[b.persona] || TERAS.PERSONAS.officer;
    return send(res, 200, await callTool(m[1], b.query || {}, persona.context, rtOf(req, t)));
  }
  if (sub === '/agentstudio' && M === 'POST') {   // the same question, answered by the Boomi Agentstudio agent
    if (!AGENTSTUDIO.ready) return send(res, 503, { error: 'The Boomi Agentstudio agent is not configured on this console.' });
    if (t.id !== AGENTSTUDIO.tenant) return send(res, 400, { error: `The Agentstudio agent is built for ${AGENTSTUDIO.tenant.toUpperCase()}.` });
    const b = await readJsonBody(req), msg = String(b.message || '').slice(0, 500);
    if (!msg.trim()) return send(res, 400, { error: 'Type a question.' });
    const r = await agentstudioSession(msg, b.sessionId || null);
    return send(res, r.ok ? 200 : 502, { engine: 'agentstudio', agent: AGENTSTUDIO.agent, runtime: 'cloud', ...r });
  }
  if (sub === '/agent' && M === 'POST') {
    const b = await readJsonBody(req), msg = String(b.message || '').slice(0, 500), persona = TERAS.PERSONAS[b.persona] || TERAS.PERSONAS.citizen;
    if (!msg.trim()) return send(res, 400, { error: 'Type a question.' });
    const rt = rtOf(req, t), t0 = Date.now(), out = await tenantAgent(t, msg, persona, rt);
    return send(res, 200, { ...out, persona: persona.id, runtime: rt, totalMs: Date.now() - t0 });
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
  const PREFIX = '/projects/teras-agent-bridge';
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
    console.log(`Teras Connect -> http://localhost:${PORT}  (on-prem runtime: ${ONPREM_BASE || 'not reachable'}, cloud runtime: ${BOOMI_BASE ? new URL(BOOMI_BASE).host : 'not configured'})`);
    console.log(BOOMI_BASE && AUTH ? `Boomi API: ${new URL(BOOMI_BASE).host}${API_BASE}` : 'WARNING: SERVER_BASE_URL / SERVER_USERNAME / SERVER_TOKEN not set.');
    console.log(LLM_KEY ? `Answers: Claude (${LLM_MODEL})` : 'Answers: built-in extractive answers (set ANTHROPIC_API_KEY to use Claude)');
  });
