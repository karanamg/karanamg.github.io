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

All inputs auto-save to the browser (localStorage).
