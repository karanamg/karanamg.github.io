# Boomi Platform Message Estimator (presales)

A static web app with no build step and no backend. Open `index.html` in a browser, or host the folder on any static host.

## Workflow
1. **Opportunity:** enter the customer and context.
2. **Sizing assumptions:** active days per month, non-prod %, growth, headroom and contract term.
3. **Workloads per service:** Integration processes, B2B/EDI, API Management, Event Streams, Flow, Data Hub, Data Integration and AI agents.
5. The right-hand summary shows messages per month and per year, the term projection, the breakdown, and the volume band. The tool shows message volumes only, with no pricing.
6. Save or open scenarios as `.json`, export a CSV, or Print / PDF for the AE.

## Message math (defaults are editable under "Message conversion rates")
| Service | Rule |
|---|---|
| Integration | One-time initial load records count in Year 1 only. docs/mo = ceil(records ÷ records-per-doc) × runs/mo. Messages per doc = reads + writes × (2 if req/resp) + lookups × 2, plus retry % |
| B2B / EDI | partners × transactions/mo × docs per transaction (e.g. 850 + 997 + ERP write = 3) |
| API Management | 1 call = 1 message |
| Event Streams | (published × (1 + subscribers)) ÷ 100 |
| Flow | launches ÷ 100 |
| Data Hub | golden records × 12 per year (shown monthly) |
| API Control Plane | managed APIs × 30,000 per year (gross; the edition allowance is netted off by the AE) |
| Data Integration | BDUs × 50. BDUs from the pipeline type: API 0.5 per output table per run, DB/file 1 per 100 MB, log-based CDC 2 per 100 MB, high-frequency API 1 per 100 MB, + logic uplift (default 20%), or known BDUs |
| AI agents | users × sessions/day × prompts/session × working days ÷ 12, × 100 |

Sources: Boomi defines a Message as one document flowing through any platform service, including response documents from request/response calls. Calls between components in the same account are excluded. The non-Integration equivalents follow Boomi's published service equivalents. **These are estimates, not an official Boomi document. Confirm them with your Boomi contact.** The volume bands are examples and should be replaced with real tiers. The tool doesn't recommend a platform or edition. The AE decides that from the message volume.

## Connection-based sizing (Sizing model → Connections)
The header switch toggles between **Platform messages** (usage-based) and **Connections** (connector-based licensing). Both data sets are kept, so you can switch back and forth.

In Connections mode you list each endpoint (system + credentials) with its connector, class, unique connection count, production and test runtimes, and go-live year. Counting rules come from Boomi Help › Platform › Licensing:
- 1 licence = 1 unique connection (component ID) per runtime. A basic runtime, a runtime cluster (whatever its node count) or a cloud attachment each count once.
- Reusing a connection in more processes or operations adds nothing. A copied connection (new component ID) counts again.
- Classes: Standard (most), Enterprise (SAP, Oracle EBS), Small Business (QuickBooks, Sage 50), Trading Partner (1 per trading partner component).
- Test and production licences are separate. Base Edition is production only.
- Unlimited / not licensed: AS2 Shared Server, AtomSphere and Partner API, Atom Queue, Boomi for SAP, Data Hub, Master Data Hub (+ Listener), Boomi MFT, Event Streams, Flow Services Server, MLLP Server, OFTP2 Server, Web Services Server.

Connections mode shows licence counts only (no edition inclusions or recommendation). Classes for connectors not named in Boomi's docs default to Standard and should be verified.

All inputs auto-save to the browser (localStorage).
