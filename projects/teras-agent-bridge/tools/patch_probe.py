#!/usr/bin/env python3
"""Runtime health check without executing any Boomi process (it used to call AIH API Connectors every 45 s per open tab)."""
import os, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def patch(rel, pairs):
    p = os.path.join(root, rel); s = open(p).read()
    for a, b in pairs:
        if a not in s:
            sys.exit(f'{rel}: anchor not found: {a[:80]}')
        s = s.replace(a, b, 1)
    open(p, 'w').write(s); print('patched', rel)


patch('server.js', [
    ("""async function probe(rt) {
  const R = RUNTIMES[rt], t0 = Date.now();
  if (!R.base) return { id: rt, reachable: false, ms: 0, detail: 'Not reachable from this deployment (inside the firewall)' };
  const r = await boomi('GET', R.connectors, null, rt, 20000);
  return { id: rt, reachable: r.status === 200, ms: Date.now() - t0, detail: r.status === 200 ? `HTTP 200 from ${new URL(R.base).host}` : (r.error || `HTTP ${r.status}`) };
}""",
     """// Health check that executes NO Boomi process: ask the runtime's shared web server for a path no listener owns.
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
}"""),
    ("""const RELAY_PATHS = /^\\/ws\\/rest\\/(aras\\/v1\\/(ingest|connectors|sources\\/[\\w/]+)|teras\\/v1\\/(vehicle|licence|summons)|""",
     """const RELAY_PATHS = /^\\/ws\\/rest\\/(aras\\/v1\\/(ingest|connectors|sources\\/[\\w/]+)|teras\\/v1\\/(vehicle|licence|summons|health-check)|"""),
])
patch('public/teras.js', [
    ("drawSwitch(); probeRuntimes(); setInterval(probeRuntimes, 45000);",
     "drawSwitch(); probeRuntimes();   // on load, on runtime switch and on the Runtimes page only - no background polling"),
    ("""    window.RT = b.dataset.rt; localStorage.setItem('teras-rt', window.RT); drawSwitch();""",
     """    window.RT = b.dataset.rt; localStorage.setItem('teras-rt', window.RT); drawSwitch(); probeRuntimes();"""),
])
