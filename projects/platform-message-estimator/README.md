# Boomi Platform Message Estimator (presales)

A static web app with no build step and no backend. Open `index.html` in a browser, or host the folder on any static host.

## Workflow
1. **Opportunity:** enter the customer and context.
2. **Sizing assumptions:** active days per month, non-prod %, growth, headroom and contract term.
3. **Workloads per service:** Integration processes, B2B/EDI, API Management, Event Streams, Flow, Data Hub, Data Integration and AI agents.
4. **Platform fit:** tick the required capabilities to get the minimum Integration edition and the services in scope.
5. The right-hand summary shows messages per month and per year, the term projection, the breakdown, and the volume band. The tool shows message volumes only, with no pricing.
6. Save or open scenarios as `.json`, export a CSV, or Print / PDF for the AE.

## Message math (defaults are editable under "Message conversion rates")
| Service | Rule |
|---|---|
| Integration | docs/mo = ceil(records ÷ records-per-doc) × runs/mo. Messages per doc = reads + writes × (2 if req/resp) + lookups × 2, plus retry % |
| B2B / EDI | partners × transactions/mo × docs per transaction (e.g. 850 + 997 + ERP write = 3) |
| API Management | 1 call = 1 message |
| Event Streams | (published × (1 + subscribers)) ÷ 100 |
| Flow | launches ÷ 100 |
| Data Hub | golden records × 12 per year (shown monthly) |
| Data Integration | BDUs × 50 |
| AI agents | prompts × 100 |

Sources: Boomi defines a Message as one document flowing through any platform service, including response documents from request/response calls. Calls between components in the same account are excluded. The non-Integration equivalents follow Boomi's published service equivalents. **These are estimates, not an official Boomi document. Confirm them with your Boomi contact.** The volume bands are examples and should be replaced with real tiers. Edition mapping is in `FIT_RULES` in `app.js`.

## Connection-based sizing (Sizing model → Connections)
The header switch toggles between **Platform messages** (usage-based) and **Connections** (connector-based licensing). Both data sets are kept, so you can switch back and forth.

In Connections mode you list each endpoint (system + credentials) with its connector, class, unique connection count, production and test runtimes, and go-live year. Counting rules come from Boomi Help › Platform › Licensing:
- 1 licence = 1 unique connection (component ID) per runtime. A basic runtime, a runtime cluster (whatever its node count) or a cloud attachment each count once.
- Reusing a connection in more processes or operations adds nothing. A copied connection (new component ID) counts again.
- Classes: Standard (most), Enterprise (SAP, Oracle EBS), Small Business (QuickBooks, Sage 50), Trading Partner (1 per trading partner component).
- Test and production licences are separate. The first edition is production only.
- Unlimited / not licensed: AS2 Shared Server, AtomSphere and Partner API, Atom Queue, Boomi for SAP, Data Hub, Master Data Hub (+ Listener), Boomi MFT, Event Streams, Flow Services Server, MLLP Server, OFTP2 Server, Web Services Server.

The recommendation is the smallest edition whose included Standard prod/test connections cover the end-of-term need (Integration editions page: 2/–, 5/5, 7/7, 10/20 + 1/2 Enterprise, 15/30 + 2/4 Enterprise). It is also raised by the Platform fit ticks, and it lists the additional licences required. Inclusions are editable under "Edition inclusions". Classes for connectors not named in Boomi's docs default to Standard and should be verified.

All inputs auto-save to the browser (localStorage).
