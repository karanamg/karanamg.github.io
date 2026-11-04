# Meridian Industrial — Product Master Explorer

A product master browser for a fictitious manufacturer. It searches products and shows their details **live from the SAP S/4HANA Cloud sandbox (SAP API Business Hub, `API_PRODUCT_SRV`) through Boomi**.

```
Browser (index.html · app.js · flow.js)
   │ /api/products?search=   /api/products/{product}
   ▼
gateway/server.js  (Railway service; Boomi credentials as variables)
   │ Basic auth
   ▼
Boomi API Service "SAPHub Product API"  (/ws/rest/saphub/v1)
   ├─ GET products?search=      → SAPHub API Search Products      → [SUB] SAPHub Search Products
   └─ GET products/{product}    → SAPHub API Get Product Details  → [SUB] SAPHub Get Product Details
                                        │  OData Client connector (API-key auth, header APIKey)
                                        ▼
                     SAP API Business Hub sandbox · API_PRODUCT_SRV (OData V2)
```

## The Boomi build (folder `SAPHub-ProductLookup`)

- **Connection:** *SAPHub OData Client Connection (API Key)*: OData V2, service root `…/API_PRODUCT_SRV`, API-key auth with header `APIKey`. The SAP S/4HANA OData connector supports only Basic auth, and the sandbox requires an API key, so this build uses the generic OData Client connector.
- **Search:** a Query on `A_ProductDescription` with the custom filter `Language eq 'EN' and (substringof('…',ProductDescription) or substringof('…',Product))`, top 20. The connector returns one document per hit. The process maps each hit, combines them into one list (Combine Documents), and adds the search term and result count.
- **Details:** a Branch.
  1. Query `A_ProductDescription` with `Product eq '…' and Language eq 'EN'` and store the text in `DPP_DESCRIPTION`.
  2. GET `A_Product('…')` and map it to the portal JSON, including that description.

  The listener wraps the call in Try/Catch, so an unknown product returns `{"error": …}`.
- **Why not `$expand=to_Description`:** the OData Client connector returns navigation properties as links only for OData V2 services. Querying the description entity with `Language eq 'EN'` gets the same data, already filtered to English on the SAP side.

## Deploy on Railway

New service → **Deploy from GitHub repo** `karanamg/karanamg.github.io` → **Settings → Root Directory** `projects/sap-product-explorer`. `railway.json` supplies the start command and health check. Then add these **Variables**:

```
SERVER_BASE_URL=https://c02-usa-east.integrate-test.boomi.com
SERVER_AUTH_TYPE=basic
SERVER_USERNAME=<Boomi shared web server user>
SERVER_TOKEN=<token>
ALLOWED_ORIGINS=https://karanamg.github.io
```

Finally, **Networking → Generate Domain**.

Local run: put the same values in `gateway/.env`, then run `npm start` and open http://localhost:8090.
