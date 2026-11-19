# Integrasi Connect - AI Data Hub (Aras Integrasi, powered by Boomi)

A demo of **Boomi embedded (OEM) in an Aras Integrasi product**. Each Aras Integrasi customer (tenant):
- connects its own systems (SAP, Salesforce, files, government open data);
- maps their fields onto an AI knowledge document;
- has personal data masked inside the Boomi runtime;
- gets RAG-ready chunks indexed for its AI assistant.

One configuration-driven Boomi pipeline serves every tenant. Mappings and policies are data, not code.

## What runs where

| Layer | Component |
|---|---|
| Portal (white label) | `public/` - tenant switcher, connections, mapping studio, live Boomi run view, AI knowledge search, composable API catalogue, reference architecture |
| Gateway | `server.js` - tenant configuration, calls Boomi with server-side credentials, embeds chunks into a per-tenant vector index (demo embedding model, local), retrieval and answers |
| Boomi (folder `Companion/ArasIntegrasi-AIDataHub`) | API Service **AIH Integrasi Connect API** at `/ws/rest/aras/v1` |

### Boomi components
- `AIH API Ingest` → `[SUB] AIH Ingest Pipeline`: Set Properties (tenant request), then a Branch.
  - Branch 1: a **Route by source system** step to the source subprocess, then keep the records.
  - Branch 2: **AI data prep** (tenant mapping, PII masking for MyKad / phone / e-mail and configured fields, chunking), then a Decision (preview or ingest).
- Sources:
  - `[SUB] SAPHub Search Products`: the existing SAP S/4HANA sandbox, OData Client, live.
  - `[SUB] AIH SAP S/4HANA Sales Orders`: reuses `[SUB] SAPHub Get Sales Orders` (100 orders with lines, live sandbox) and turns each order into one record.
  - `[SUB] AIH Salesforce Service Cloud Cases (Simulated)`: split by tenant org, then combine.
  - `[SUB] AIH File Drop (CSV)`.
  - `[SUB] AIH Malaysia Open Data (data.gov.my)`: REST, live.
- Composable APIs:
  - `POST /ingest`
  - `GET /connectors`
  - `GET /sources/salesforce/cases?tenant=`
  - `GET /sources/opendata?dataset=&filter=&sort=&limit=`
  - reuses `GET /ws/rest/saphub/v1/products?search=`

## Demo tenants (fictitious)
| Tenant | Sources | Try asking |
|---|---|---|
| Universiti Nusantara (AISLE student wellbeing) | Salesforce cases, SIS survey CSV, data.gov.my school enrolment | "Which students asked for counselling because of exam stress?" |
| Perkasa Manufacturing Berhad | SAP S/4HANA products and sales orders (live), Salesforce complaints, CMMS maintenance CSV | "What problems have we had with chiller pumps?" |
| Klinik Sejahtera Health Group | Salesforce patient cases, feedback CSV, data.gov.my hospital beds | "What do patients complain about at the Klang clinic?" |

## Run locally
```bash
npm start          # http://localhost:8095  (no npm install needed - no dependencies)
```
- Boomi credentials are read from environment variables, `./.env` or the workspace `.env`: `SERVER_BASE_URL`, `SERVER_USERNAME`, `SERVER_TOKEN`.
- Optional: `ANTHROPIC_API_KEY` makes Claude write the answers from the retrieved chunks. Without it, answers are extractive.
- Regenerate the demo data with `npm run data`.

Deep links:
- `#perkasa/overview`
- `#unus/mapping`
- `#sejahtera/run/sf` starts a run.
- `#perkasa/run/all` runs all sources.

## 10-minute talk track
1. **Architecture**: sovereign and hybrid runtime, the Boomi control plane versus the data plane, and the OEM mapping table. *(Farul: buy vs build, hybrid.)*
2. **Overview**: switch tenants. Same product, different customers, each with its own Boomi environment.
3. **Connections**: the connector catalogue, then Test & preview, where Boomi pulls live SAP / data.gov.my records.
4. **Mapping studio**: add a content field, mask a field, preview through Boomi, save. No redeploy.
5. **Run & monitor**: run all sources. Watch the Boomi route, connector, mapping, PII masking and chunking, with the real execution ID. *(Sharven: RAG ingestion.)*
6. **AI knowledge**: ask a question and show the citations from SAP, Salesforce and CSV together, with masked MyKad, phone and e-mail.
7. **Onboard a new customer**: create a tenant, add a data.gov.my connection, map it, run it, ask. All in about 2 minutes. *(Adam: time to revenue.)*

All people, IC numbers, phone numbers and organisations in the demo data are fictitious. Salesforce data is simulated; SAP (API Business Hub sandbox) and data.gov.my are live public sources.
