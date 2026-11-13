# Copperleaf Provisions - AP Invoice 3-Way Match

Demo of an accounts-payable **3-way match** (purchase order / goods receipt / vendor invoice) built on Boomi.

- **Upload** a vendor invoice PDF (or run one of the 7 samples).
- **Watch** each step run: PDF extraction in the gateway, then the Boomi steps replayed from the execution's real timestamps.
- **Review** the line-by-line comparison of quantity, unit price and line value, with tolerances.
- **Dashboard** of outcomes, exceptions by type, and every run with its PDF.

## Boomi (folder `Companion/ThreeWayMatch`)

| Component | Purpose |
|---|---|
| `3WM Invoice Match API` (API Service, base `/ws/rest/threeway/v1`) | `POST /match`, `GET /purchaseorders`, `GET /goodsreceipts` |
| `3WM API Match Invoice` | Listener with Try/Catch around the match subprocess |
| `[SUB] 3WM Three-Way Match` | Captures the invoice, branches to get the PO and receipts, runs the match engine, then a Decision routes to approval or the AP exception queue |
| `[SUB] 3WM Get Purchase Order` / `[SUB] 3WM Get Goods Receipts` | Split the dataset and keep the records for the invoice's PO (receipts are combined) |
| `[SUB] 3WM Mock ERP Purchase Orders` / `[SUB] 3WM Mock WMS Goods Receipts` | Mock source systems (Message steps); swap for real ERP / WMS connectors |

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
