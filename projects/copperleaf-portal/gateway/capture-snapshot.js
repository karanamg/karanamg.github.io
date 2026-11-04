// Captures a static snapshot of the Copperleaf portal data from the LIVE Boomi APIs
// (via the local gateway, which must be running: npm start).
// Usage: node capture-snapshot.js <outputDir>
// Writes: meta.json, dashboard.json, employees.json, suppliers.json, customers.json, products.json,
//         orders.json, orderlines/<productId>.json, invoices/<orderId>.json
const fs = require('fs');
const path = require('path');

const GATEWAY = process.env.GATEWAY || 'http://localhost:8080';
const OUT = path.resolve(process.argv[2] || 'snapshot');
let calls = 0;

async function get(p) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(GATEWAY + p);
    if (r.ok) { calls++; return r.json(); }
    const t = await r.text();
    if (r.status === 502 || r.status === 503) throw new Error(`Gateway/Boomi problem on ${p}: ${r.status} ${t.slice(0, 200)}`);
    console.warn(`retry ${attempt} ${p}: HTTP ${r.status}`);
  }
  throw new Error(`Failed ${p}`);
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const write = (rel, obj) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj)); };
const range = (start, end, step) => Array.from({ length: Math.ceil((end - start) / step) }, (_, i) => start + i * step);

(async () => {
  const health = await (await fetch(GATEWAY + '/api/health')).json();
  if (!health.boomiConfigured) throw new Error('Gateway is not configured for Boomi');
  console.log('Capturing from', health.boomiHost, '→', OUT);

  const dashboard = await get('/api/dashboard'); write('dashboard.json', dashboard);
  const employees = await get('/api/employees'); write('employees.json', employees);
  const suppliers = await get('/api/suppliers?skip=0'); write('suppliers.json', suppliers);
  console.log('dashboard, employees, suppliers ✓');

  const custPages = await pool(range(0, 91, 20), 4, (s) => get(`/api/customers?skip=${s}`));
  const customers = custPages.flatMap((p) => p.customers); write('customers.json', { totalCount: customers.length, customers });
  const prodPages = await pool(range(0, 77, 20), 4, (s) => get(`/api/products?skip=${s}`));
  const products = prodPages.flatMap((p) => p.products); write('products.json', { totalCount: products.length, products });
  console.log(`customers ${customers.length}, products ${products.length} ✓`);

  const total = (await get('/api/orders?skip=0')).totalCount;
  const orderPages = await pool(range(0, total, 20), 4, (s) => get(`/api/orders?skip=${s}`));
  const orders = orderPages.flatMap((p) => p.orders); write('orders.json', { totalCount: orders.length, orders });
  console.log(`orders ${orders.length} ✓`);

  const lineSets = await pool(products.map((p) => p.productId), 4, async (id) => { const d = await get(`/api/orderlines/${id}`); write(`orderlines/${id}.json`, d); return d.lines || []; });
  const allLines = lineSets.flat();
  console.log(`order lines ${allLines.length} across ${lineSets.length} products ✓`);

  // Invoices: composed from the captured Boomi orders, order lines and customers (same shape as GET v1/invoices/{orderId}).
  const custById = new Map(customers.map((c) => [c.customerId, c]));
  const linesByOrder = new Map();
  allLines.forEach((l) => { if (!linesByOrder.has(l.orderId)) linesByOrder.set(l.orderId, []); linesByOrder.get(l.orderId).push(l); });
  let inv = 0;
  for (const o of orders) {
    const c = custById.get(o.customerId) || {};
    const lines = (linesByOrder.get(o.orderId) || []).sort((a, b) => a.productName.localeCompare(b.productName)).map((l) => ({
      orderId: o.orderId, orderDate: o.orderDate, requiredDate: o.requiredDate, shippedDate: o.shippedDate,
      customerId: o.customerId, customerName: o.customerName, address: c.address, city: c.city, region: c.region, postalCode: c.postalCode, country: c.country,
      shipName: o.shipName, shipCity: o.shipCity, shipCountry: o.shipCountry,
      salesperson: `${o.employeeFirstName} ${o.employeeLastName}`, shipperName: o.shipperName,
      productId: l.productId, productName: l.productName, unitPrice: l.unitPrice, quantity: l.quantity, discount: l.discount,
      extendedPrice: (Number(l.unitPrice) * Number(l.quantity) * (1 - Number(l.discount || 0))).toFixed(2), freight: o.freight
    }));
    write(`invoices/${o.orderId}.json`, { orderId: String(o.orderId), lineCount: lines.length, lines }); inv++;
  }
  write('meta.json', {
    capturedAt: new Date().toISOString(), boomiHost: health.boomiHost, apiBase: health.apiBase, boomiCalls: calls,
    counts: { customers: customers.length, products: products.length, suppliers: suppliers.suppliers.length, employees: employees.employees.length, orders: orders.length, orderLines: allLines.length, invoices: inv },
    note: 'All records were returned by the Boomi API Service "NWPortal Order Lookup API". Invoices are composed from the captured orders, order lines and customers.'
  });
  console.log(`invoices ${inv} ✓  ·  ${calls} Boomi API calls  ·  done`);
})().catch((e) => { console.error('CAPTURE FAILED:', e.message); process.exit(1); });
