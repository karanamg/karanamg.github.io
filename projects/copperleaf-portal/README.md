# Copperleaf Provisions — Operations Portal

**Live demo:** https://karanamg.github.io/projects/copperleaf-portal/

Copperleaf Provisions is a made-up fine-food wholesaler. This sales and master-data portal is backed by **Boomi real-time APIs**, which call the public **Northwind OData V2** service.

Pages: **Dashboard** (KPIs and charts) · **Orders & Invoices** (printable invoices) · **Order Insight** (every order line for a product) · **Products** · **Customers** · **Suppliers** · **Employees**.

## Architecture

```
Browser (index.html · app.js · app.css)
   │  api/*            ── live mode ──▶  gateway/server.js (holds Boomi credentials in gateway/.env)
   │                                         │  Basic auth
   │                                         ▼
   │                              Boomi API Service "NWPortal Order Lookup API"  (/ws/rest/nwportal/v1)
   │                                         │  listener process → [SUB] process → REST connector
   │                                         ▼
   │                              Northwind OData V2 (services.odata.org)
   │
   └─ data/*.json      ── snapshot mode (GitHub Pages) ── responses captured from the same Boomi APIs
```

When the page loads it checks `api/health`. If the gateway answers, every request is a live Boomi call. Otherwise, for example on GitHub Pages, the portal uses `data/`: a snapshot captured from the live Boomi APIs (see `data/meta.json` for the capture time and the number of calls). In snapshot mode the client re-applies each route's search, filter and paging rules. The **Boomi activity** drawer shows which mode answered each request.

| Route | Boomi listener → subprocess | Northwind source |
|---|---|---|
| `GET v1/dashboard` | NWPortal API Get Dashboard → [SUB] NWPortal Get Dashboard | Branch fan-out: 9× `$count`, `Category_Sales_for_1997`, `Product_Sales_for_1997` |
| `GET v1/orders?search=&customerId=&skip=` | NWPortal API Get Orders | `/Orders` + Customer, Employee, Shipper, Order_Details |
| `GET v1/invoices/{orderId}` | NWPortal API Get Invoice by Order | `/Invoices` view |
| `GET v1/orderlines/{productId}` | NWPortal API Get Order Lines by Product | `/Order_Details` + Order/Customer, Product |
| `GET v1/products?search=&category=&supplier=&skip=` | NWPortal API Search Products | `/Products` + Category, Supplier |
| `GET v1/customers?search=&skip=` | NWPortal API Get Customers | `/Customers` |
| `GET v1/suppliers?search=` | NWPortal API Get Suppliers | `/Suppliers` |
| `GET v1/employees` | NWPortal API Get Employees | `/Employees` + manager |

The Boomi build follows a pattern of thin listener wrappers around testable `[SUB]` processes. It uses JSON profiles and maps to turn OData responses into clean API JSON, and `$filter` expressions built in Set Properties steps, so no Decision branching is needed.

## Run it live

You need access to a Boomi runtime where these APIs are deployed.

```bash
cd projects/copperleaf-portal/gateway
cp .env.example .env        # fill in the runtime's shared web server user + token
npm start                   # node --use-system-ca server.js  →  http://localhost:8080
```

Refresh the snapshot (with the gateway running): `npm run capture`.

## Snapshot notes

- 132 Boomi API calls captured 91 customers, 77 products, 29 suppliers, 9 employees, 830 orders and 2,155 order lines.
- Invoices in the snapshot are composed from the captured orders, order lines and customers. Ship-to street addresses are not part of those payloads, so snapshot invoices show the ship-to name, city and country.
