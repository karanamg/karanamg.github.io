# Copperleaf Provisions - AP Invoice 3-Way Match

Demo of an accounts-payable **3-way match** (purchase order / goods receipt / vendor invoice) built on Boomi. Purchase orders come from **SAP S/4HANA** (ERP) and goods receipts from **Manhattan Active Warehouse Management** (WMS). Approved invoices are then posted to **Coupa** (`POST /api/invoices`). SAP, Manhattan and Coupa are all simulated in this demo.

- **Upload** a vendor invoice PDF (or run one of the 7 samples).
- **Watch** each step run: PDF extraction in the gateway, then the Boomi steps replayed from the execution's real timestamps.
- **Review** the line-by-line comparison of quantity, unit price and line value, with tolerances.
- **Dashboard** of outcomes, exceptions by type, and every run with its PDF.

## Boomi (folder `Companion/ThreeWayMatch`)

| Component | Purpose |
|---|---|
| `3WM Invoice Match API` (API Service, base `/ws/rest/threeway/v1`) | `POST /match`, `GET /purchaseorders`, `GET /goodsreceipts` |
| `3WM API Match Invoice` | Listener with Try/Catch around the match subprocess |
| `[SUB] 3WM Three-Way Match` | Captures the invoice, branches to get the PO and receipts, runs the match engine, then a Decision posts approved invoices to Coupa or routes the rest to the AP exception queue |
| `[SUB] 3WM Coupa Post Invoice (Simulated)` + `3WM Map Match Result to Coupa Invoice` | Real Boomi map from the match result to a Coupa invoice (header, supplier, currency, PO-backed lines with `order-header-num` / `order-line-num`); the `POST https://{instance}.coupahost.com/api/invoices` call is simulated and returns a draft Coupa invoice. Check the field names against your Coupa tenant before going live |
| `[SUB] 3WM Get Purchase Order` / `[SUB] 3WM Get Goods Receipts` | Split the dataset and keep the records for the invoice's PO (receipts are combined) |
| `[SUB] 3WM SAP S4HANA Purchase Orders (Simulated)` / `[SUB] 3WM Manhattan WMS Goods Receipts (Simulated)` | Simulated systems of record (Message steps). For production, use the Boomi SAP S/4HANA OData connector (`API_PURCHASEORDER_PROCESS_SRV`) and a REST connection to Manhattan Active WM |

Tolerances: unit price ±1%, line value ±1%, quantity exact (invoiced ≤ received and ≤ ordered).

## Run locally

```bash
npm install
npm start            # http://localhost:8090
```

Boomi credentials come from environment variables, `./.env`, or the workspace `.env`:
`SERVER_BASE_URL`, `SERVER_USERNAME`, `SERVER_TOKEN` (shared web server user and token).

## Sample invoices

`public/samples/*.pdf` is generated from `data/mock_data.json` with `npm run samples` (needs Google Chrome).

| File | Expected outcome |
|---|---|
| 01 Harbor Grain Mills | Matched, approved for payment |
| 02 Northline Packaging | Price variance (+6.82% on line 20), on hold |
| 03 Bluewater Seafood | Quantity variance (60 invoiced, 48 received), on hold |
| 04 Summit Beverage | Two partial receipts and +0.56% price, matched within tolerance, approved |
| 05 Redwood Kitchen | No goods receipt yet, on hold |
| 06 Meadowbrook Dairy | Surcharge line not on the PO, on hold |
| 07 Harbor Grain Mills | Unknown PO 4500019999, rejected |

All companies, people and bank details are fictitious.
