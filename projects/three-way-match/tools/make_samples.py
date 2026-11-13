"""Generate the sample vendor-invoice PDFs from data/mock_data.json (HTML -> PDF with headless Chrome).

Usage:  python3 tools/make_samples.py
Output: public/samples/*.pdf
"""
import html, json, os, shutil, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / 'data' / 'mock_data.json').read_text())
OUT = ROOT / 'public' / 'samples'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
ACCENTS = {'V-1001': '#9a5b13', 'V-1002': '#24577a', 'V-1003': '#0f6e74', 'V-1004': '#5b4a9b', 'V-1005': '#8a3b2e', 'V-1006': '#3f6b2a'}
E = html.escape
money = lambda v: f'{v:,.2f}'


def page(inv):
    v, buyer = inv['vendor'], DATA['buyer']
    accent = ACCENTS.get(v['id'], '#333')
    po = next((p for p in DATA['purchaseOrders'] if p['poNumber'] == inv['poNumber']), None)
    plant = po['plant'] if po else 'PDX1'
    initials = ''.join(w[0] for w in v['name'].replace('.', '').split()[:2]).upper()
    rows, subtotal = '', 0.0
    for l in inv['lines']:
        amt = round(l['qty'] * l['unitPrice'], 2); subtotal += amt
        rows += (f'<tr><td class="c">{l["line"]}</td><td>{E(l["sku"])}</td><td>{E(l["description"])}</td>'
                 f'<td class="r">{l["qty"]:g}</td><td class="c">{E(l["uom"])}</td><td class="r">{money(l["unitPrice"])}</td><td class="r">{money(amt)}</td></tr>')
    tax = round(subtotal * inv['taxRate'] / 100, 2); total = subtotal + tax
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: Letter; margin: 0.55in 0.6in; }}
* {{ box-sizing: border-box; }}
body {{ font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1d2329; font-size: 10pt; margin: 0; }}
.top {{ display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid {accent}; padding-bottom: 14px; }}
.brand {{ display: flex; gap: 12px; align-items: center; }}
.logo {{ width: 52px; height: 52px; border-radius: 10px; background: {accent}; color: #fff; font-weight: 700; font-size: 19pt; display: flex; align-items: center; justify-content: center; }}
.vname {{ font-size: 17pt; font-weight: 700; color: {accent}; }}
.muted {{ color: #5d6670; font-size: 8.8pt; line-height: 1.45; }}
h1 {{ margin: 0 0 6px; font-size: 24pt; letter-spacing: 3px; color: #1d2329; text-align: right; }}
table.meta {{ border-collapse: collapse; font-size: 9.4pt; margin-left: auto; }}
table.meta td {{ padding: 2px 0 2px 14px; }} table.meta td:first-child {{ color: #5d6670; }} table.meta td:last-child {{ font-weight: 700; text-align: right; }}
.parties {{ display: flex; gap: 28px; margin: 18px 0 16px; }}
.party {{ flex: 1; background: #f5f6f7; border-radius: 6px; padding: 10px 12px; }}
.party b.lbl {{ display: block; font-size: 8pt; letter-spacing: 1px; color: {accent}; margin-bottom: 4px; }}
table.lines {{ width: 100%; border-collapse: collapse; font-size: 9.4pt; }}
table.lines th {{ background: {accent}; color: #fff; text-align: left; padding: 7px 8px; font-weight: 600; white-space: nowrap; }}
table.lines td {{ padding: 7px 8px; border-bottom: 1px solid #e1e4e8; white-space: nowrap; }}
.r {{ text-align: right !important; }} .c {{ text-align: center !important; }}
.totals {{ width: 42%; margin: 12px 0 0 auto; border-collapse: collapse; font-size: 10pt; }}
.totals td {{ padding: 4px 8px; }} .totals td:last-child {{ text-align: right; }}
.totals tr.grand td {{ border-top: 2px solid {accent}; font-weight: 700; font-size: 12pt; padding-top: 7px; }}
.foot {{ margin-top: 26px; display: flex; gap: 28px; font-size: 8.8pt; }}
.foot div {{ flex: 1; }}
.demo {{ position: fixed; bottom: 0; left: 0; right: 0; text-align: center; color: #8a939c; font-size: 7.5pt; }}
</style></head><body>
<div class="top">
  <div class="brand"><div class="logo">{E(initials)}</div>
    <div><div class="vname">{E(v["name"])}</div><div class="muted">{E(v["address"])}<br>Tax ID {E(v["taxId"])} &middot; {E(v["email"])}</div></div></div>
  <div><h1>INVOICE</h1>
    <table class="meta">
      <tr><td>Invoice Number</td><td>{E(inv["invoiceNumber"])}</td></tr>
      <tr><td>Invoice Date</td><td>{E(inv["invoiceDate"])}</td></tr>
      <tr><td>Due Date</td><td>{E(inv["dueDate"])}</td></tr>
      <tr><td>PO Number</td><td>{E(inv["poNumber"])}</td></tr>
      <tr><td>Vendor ID</td><td>{E(v["id"])}</td></tr>
      <tr><td>Currency</td><td>USD</td></tr>
    </table></div>
</div>
<div class="parties">
  <div class="party"><b class="lbl">BILL TO</b><b>{E(buyer["name"])}</b><br><span class="muted">Accounts Payable<br>{E(buyer["address"])}<br>{E(buyer["apEmail"])}</span></div>
  <div class="party"><b class="lbl">SHIP TO</b><b>{E(buyer["name"])} - Plant {E(plant)}</b><br><span class="muted">Receiving dock<br>{E(buyer["address"])}</span></div>
</div>
<table class="lines">
  <tr><th class="c">Line</th><th>Item</th><th>Description</th><th class="r">Qty</th><th class="c">UoM</th><th class="r">Unit Price</th><th class="r">Amount</th></tr>
  {rows}
</table>
<table class="totals">
  <tr><td>Subtotal</td><td>{money(subtotal)}</td></tr>
  <tr><td>Tax ({inv["taxRate"]:.2f}%)</td><td>{money(tax)}</td></tr>
  <tr class="grand"><td>Total Due (USD)</td><td>{money(total)}</td></tr>
</table>
<div class="foot">
  <div><b>Payment terms</b><br><span class="muted">Net 30 days from invoice date. Please quote the invoice and PO number with your remittance.</span></div>
  <div><b>Remit to: {E(v["name"])}</b><br><span class="muted">Pacific Commerce Bank &middot; Routing 000000000 &middot; Account 00000000</span></div>
</div>
<div class="demo">Sample invoice for demonstration purposes only &middot; fictitious companies and bank details</div>
</body></html>'''


def main():
    if OUT.exists(): shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    with tempfile.TemporaryDirectory() as tmp:
        for inv in DATA['sampleInvoices']:
            src = Path(tmp) / (inv['file'] + '.html'); src.write_text(page(inv))
            subprocess.run([CHROME, '--headless=new', '--disable-gpu', f'--user-data-dir={tmp}/chrome', '--no-pdf-header-footer',
                            f'--print-to-pdf={OUT / inv["file"]}', src.as_uri()], check=True, capture_output=True, timeout=120)
            print('wrote', inv['file'])


if __name__ == '__main__':
    main()
