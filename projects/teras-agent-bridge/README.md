# Teras Connect — Aras Integrasi × MTAI OEM workshop (24 Nov 2026)

A multi-tenant integration console, forked from the Integrasi Connect AI Data Hub and focused on the brief's **Part 1 (end to end)** and **Part 3 (sovereign scaffolding)**:
- **Part 1:** onboard a customer → reuse connections from the library → map fields and mask PII → Boomi pulls and cleanses the IBM P-Series (simulated) → publish as governed agent tools → a virtual assistant uses them.
- **Part 3:** a runtime switch: the same Boomi processes run on the **on-prem runtime** (Docker Atom `guru-mac-mcp`, inside the firewall, reading the IBM i over the internal network) or on the **Boomi cloud runtime** (through the IBM i gateway).

## Where to present from
| Console | Runtimes | Use |
|---|---|---|
| **Laptop: `npm start` → http://localhost:8096** | On-prem (direct) + cloud (relayed through Railway, because Zscaler blocks direct Boomi cloud TLS) | **Workshop demo.** The runtime switch works both ways |
| https://teras-agent-bridge.up.railway.app | Cloud only (the on-prem runtime is unreachable from the public cloud, by design) | Backup, and for sharing |

### Before the workshop
1. **Start the on-prem runtime:** start Docker Desktop, then `docker start guru-mac-mcp`. Wait until `curl localhost:9090/ws/simple/getArasConnectors` returns 200.
2. **Start the console:** `cd sites/karanamg.github.io/projects/teras-agent-bridge && npm start`.
3. **Warm up both runtimes:** open Runtimes & security and click "Run on both". The first cloud call after idle takes about 60 s. After that, on-prem takes about 0.2–1.5 s and cloud about 5 s.
4. **Load the knowledge index:** on JPJ, Overview → "Run all sources" (fills the knowledge_search tool). Reset demo clears this.

## Demo script (~15 min)
**Part 1: end to end, tenant JPJ, runtime 🏠 On-prem**
1. **Overview:** the flow bar (Connect → Map → Run → Publish tools → Ask → Runtime) and the customer's on-prem placement.
2. **Connections:** three IBM P-Series files plus a CSV. Click **Green screen** on VEHMST to show the raw fixed-width DB2 records.
3. **Mapping studio:** VEHMST fields cleansed by Boomi. Owner MyKad, name and chassis are masked. Preview through Boomi.
4. **Run & monitor:** run Vehicle registry. The live Boomi steps show `POST /ws/simple/createArasIngest`, running on guru-mac-mcp inside the firewall, then route IBM_PSERIES, cleanse, map, mask PII and chunk.
5. **Agent tools:** three live governed tools plus knowledge_search. Show the endpoints on both runtimes and the channel policy table. Try a tool.
6. **Virtual assistant:**
   - as Ahmad (citizen), ask "Can I renew my road tax?": two Boomi tool calls, the answer, and the trace (internal-network read, cleanse, govern, audit)
   - "Show me the summons for 780115-08-5011": refused
   - "What do customers complain about at JPJ counters?": knowledge_search answers from the CSV
7. **Onboard a new customer:** e.g. JPN, with on-prem placement. Pick VEHMST + Salesforce: the connectors **and mappings are reused** from JPJ and UNUS, and the tool is published automatically.

**Part 3: sovereign scaffolding**

8. **Runtimes & security:**
   - both runtime cards are Online
   - **Run on both** for BKT 5521: on-prem about 0.2 s over the internal network, cloud about 5 s through the IBM i gateway, with identical governed output
   - the architecture diagram and the six security patterns
9. **Flip the header switch to ☁ Cloud** and repeat a question: every call moves, and the trace shows the cloud runtime.

## Boomi Agentstudio engine (optional, laptop console only)
On Virtual assistant (JPJ), switch **Assistant engine** to **◆ Boomi Agentstudio**.
- **Agent:** **JPJ Counter Assistant (Teras)** (`ea7e0ff0…`, deployment `24bc7738…`, in `agentstudio.json`).
- **Tools:** three Agentstudio API tools, **TERAS jpj_vehicle_lookup / jpj_licence_status / jpj_summons_check**. They call the Boomi cloud API with Basic auth, which is set in the console. The counter-officer context is fixed in each tool's request template.
- **Where it runs:** Agentstudio runs in the Boomi cloud, so this engine always uses the **cloud** runtime.
- **Speed:** about 20–40 s per answer. The conversation carries across turns until you click "New conversation".
- **Guardrails:** no custom guardrail. A "bypass policy" denied-topic blocked normal licence answers, so it was removed. Boomi's built-in guardrails still apply.
- **Script idea:** "Licence status for the owner of WTT 1", then "And does he have any outstanding summons?" (tool chaining plus memory).

## Boomi components
**Folder Companion / ArasIntegrasi-TerasLegacyTools:**
- TERAS JPJ Legacy Tools API (API Service `/ws/rest/teras/v1`)
- TERAS API Vehicle / Licence / Summons Tool (listeners; on the on-prem Atom these are `/ws/simple/executeTeras{Vehicle|Licence|Summons}`)
- [SUB] TERAS Legacy Tool Pipeline
- [SUB] AIH IBM P-Series (IBM i DB2)
- TERAS JPJ IBM i Gateway Connection (cloud path)
- TERAS JPJ IBM i Internal Connection (on-prem, `host.docker.internal:8096`)
- TERAS IBM i DB2 Keyed Read
- j.TERAS.ToolRequest / j.TERAS.ToolResponse

Both pipelines have a **"Running on-prem?"** decision: the runtime is detected via `BOOMI_ATOMNAME`, and the decision picks the internal or the gateway connection.

**Updated in Companion / ArasIntegrasi-AIDataHub:**
- [SUB] AIH Ingest Pipeline v6: new route `IBM_PSERIES`, and ai_prep now reports which runtime ran it
- AIH API Connectors v3: catalogue entry for IBM P-Series

Generators: `boomi/build.py` (Teras components), `boomi/patch_aih.py` (AIH changes). After pushing a subprocess, redeploy its listener processes. Deployments go to the Test environment, which contains **both** runtimes.

## Files
- `server.js`: tenants, connections, mapping, runs (from Integrasi Connect), plus runtime routing (`X-Teras-Runtime`), the cloud relay, tools, the assistant and the runtime comparison
- `teras.js`: tools, personas and the rule-based planner
- `legacy.js`: the simulated IBM i
- `public/teras.js`, `public/teras.css`: the new UI pages
- `_v1/`: the previous single-source version (not deployed)
