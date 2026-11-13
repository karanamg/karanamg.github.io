// Extracts vendor-invoice data from a text-based PDF.
// pdf.js returns positioned text items; we rebuild visual rows (same baseline) and read
// labelled header fields, the line-item table and the totals from those rows.

let pdfjsPromise;
const pdfjs = () => (pdfjsPromise ||= import('pdfjs-dist/legacy/build/pdf.mjs'));

const num = (s) => (s == null ? null : Number(String(s).replace(/[,\s$]/g, '')));

async function pdfRows(buffer) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false, disableFontFace: true }).promise;
  const rows = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const byY = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5], size = Math.abs(it.transform[3]);
      let row = byY.find((r) => Math.abs(r.y - y) < 2.5);
      if (!row) byY.push((row = { y, items: [] }));
      row.items.push({ x, w: it.width, str: it.str.trim(), size });
    }
    byY.sort((a, b) => b.y - a.y);
    for (const r of byY) {
      r.items.sort((a, b) => a.x - b.x);
      // cells: merge items that touch; a visible gap starts a new cell
      const cells = [];
      for (const it of r.items) {
        const last = cells[cells.length - 1];
        if (last && it.x - (last.x + last.w) < 4) { last.str += (it.x - (last.x + last.w) > 1 ? ' ' : '') + it.str; last.w = it.x + it.w - last.x; }
        else cells.push({ ...it });
      }
      rows.push({ page: p, y: r.y, cells, text: cells.map((c) => c.str).join(' | '), maxSize: Math.max(...r.items.map((i) => i.size)) });
    }
  }
  await doc.destroy();
  return rows;
}

function field(rows, label) {
  const re = new RegExp(`^${label}$`, 'i');
  for (const r of rows) {
    const i = r.cells.findIndex((c) => re.test(c.str));
    if (i >= 0 && r.cells[i + 1]) return r.cells[i + 1].str;
  }
  return null;
}

async function extractInvoice(buffer) {
  const rows = await pdfRows(buffer);
  const warnings = [];
  const inv = {
    invoiceNumber: field(rows, 'Invoice (Number|No\\.?|#)'),
    invoiceDate: field(rows, 'Invoice Date'),
    dueDate: field(rows, 'Due Date'),
    poNumber: field(rows, '(PO|Purchase Order) (Number|No\\.?|#)'),
    currency: field(rows, 'Currency') || 'USD',
    vendor: { id: field(rows, 'Vendor (ID|No\\.?)'), name: null },
    lines: [], subtotal: null, tax: null, total: null
  };

  // Vendor name: "Remit to: <name>", else the largest text near the top that is not "INVOICE"
  const remit = rows.map((r) => r.text.match(/Remit to:\s*(.+?)(\s*\||$)/i)).find(Boolean);
  if (remit) inv.vendor.name = remit[1].trim();
  else {
    const top = rows.filter((r) => r.page === 1).slice(0, 6).filter((r) => !/^INVOICE$/i.test(r.cells[0].str));
    top.sort((a, b) => b.maxSize - a.maxSize);
    inv.vendor.name = top[0] ? top[0].cells[0].str : null;
  }

  // Line items: rows of 7 cells: line | item | description | qty | uom | unit price | amount
  const money = /^-?[\d,]+\.\d{2}$/;
  for (const r of rows) {
    const c = r.cells.map((x) => x.str);
    if (c.length >= 7 && /^\d{1,4}$/.test(c[0]) && money.test(c[c.length - 2]) && money.test(c[c.length - 1]) && /^[\d,.]+$/.test(c[c.length - 4])) {
      inv.lines.push({
        line: Number(c[0]), sku: c[1], description: c.slice(2, c.length - 4).join(' '),
        qty: num(c[c.length - 4]), uom: c[c.length - 3], unitPrice: num(c[c.length - 2]), amount: num(c[c.length - 1])
      });
    }
  }
  for (const r of rows) {
    const label = r.cells[0]?.str || '', val = r.cells[r.cells.length - 1]?.str || '';
    if (/^Subtotal$/i.test(label) && money.test(val)) inv.subtotal = num(val);
    else if (/^Tax\b/i.test(label) && money.test(val)) inv.tax = num(val);
    else if (/^Total( Due)?\b/i.test(label) && money.test(val)) inv.total = num(val);
  }

  if (!inv.invoiceNumber) warnings.push('Invoice number not found');
  if (!inv.poNumber) warnings.push('PO number not found');
  if (!inv.lines.length) warnings.push('No line items found');
  const sum = Math.round(inv.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  if (inv.subtotal != null && Math.abs(sum - inv.subtotal) > 0.005) warnings.push(`Line amounts add up to ${sum.toFixed(2)} but the subtotal says ${inv.subtotal.toFixed(2)}`);
  if (inv.subtotal == null) inv.subtotal = sum;
  if (inv.tax == null) inv.tax = 0;
  if (inv.total == null) inv.total = Math.round((inv.subtotal + inv.tax) * 100) / 100;
  return { invoice: inv, warnings, rowCount: rows.length };
}

module.exports = { extractInvoice };
