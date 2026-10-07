/* Uji CRUD generik untuk SELURUH entitas: daftar, cari, baca, buat, ubah
   (dengan penguncian optimistis), dan hapus — dibangkitkan dari metadata. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db } from './helpers.mjs';

let admin, meta;
before(async () => {
  await start();
  admin = await as('admin');
  await admin.put('/api/settings/security_policy', { apiRateLimitPerMinute: 100000 });
  const jkt = (await admin.get('/api/meta')).body.branches.find((b) => b.name.startsWith('Jakarta')).id;
  admin.headers['X-Branch'] = String(jkt);
  meta = (await admin.get('/api/meta')).body;
});
after(stop);

let seq = 0;
async function valueFor(f) {
  seq++;
  switch (f.type) {
    case 'text': return f.pattern ? (f.name === 'period' ? `2027-${String((seq % 12) + 1).padStart(2, '0')}` : /clock/.test(f.name) ? '08:00' : `uji${seq}`) : `Uji ${f.name} ${seq}`.slice(0, f.max || 200);
    case 'textarea': return `Catatan uji ${seq}`;
    case 'email': return `uji${seq}@contoh.co.id`;
    case 'date': return '2026-10-07';
    case 'int': return Math.max(f.min ?? 1, 1);
    case 'number': return Math.max(f.min ?? 1, 1);
    case 'money': return 1000 + seq;
    case 'pct': return 10;
    case 'bool': return 0;
    case 'select': { const o = f.options.find((x) => (Array.isArray(x) ? x[0] : x) !== ''); return Array.isArray(o) ? o[0] : o; }
    case 'password': return 'SandiUji#2026xyz';
    case 'ref': {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(f.refFilter || {})) q.set(`f_${k}`, Array.isArray(v) ? v.join(',') : v);
      const items = (await admin.get(`/api/lookup/${f.ref}?${q}`)).body;
      return items[0]?.id ?? null;
    }
    default: return null;
  }
}

const SKIP_CREATE = new Set(['stock_moves']);
const CUSTOM = {
  // Bidang yang harus konsisten satu sama lain.
  bank_transfers: async (b) => { const items = (await admin.get('/api/lookup/bank_accounts')).body; b.from_bank_id = items[0].id; b.to_bank_id = items[1].id; },
  stock_transfers: async (b) => { const items = (await admin.get('/api/lookup/warehouses?scope=company')).body; b.from_warehouse_id = items[0].id; b.to_warehouse_id = items[1].id; },
  users: async (b) => { b.username = `uji.${seq}`; b.company_id = null; b.branch_id = null; b.role_id = (await admin.get('/api/lookup/roles')).body.find((r) => /Auditor/.test(r.label)).id; },
  fixed_assets: async (b) => { b.salvage_value = 0; b.cost = 10_000_000; },
  leave_requests: async (b) => { b.end_date = b.start_date; },
  project_tasks: async (b) => { b.end_date = b.start_date; },
  fiscal_periods: async (b) => { b.start_date = '2030-01-01'; b.end_date = '2030-01-31'; },
  companies: async (b) => { b.parent_id = null; },
  currencies: async (b) => { b.code = `Q${String.fromCharCode(65 + (seq % 26))}${String.fromCharCode(65 + ((seq * 7) % 26))}`; },
  sales_returns: async (b) => {
    const inv = db.get("SELECT i.id, l.product_id FROM sales_invoices i JOIN sales_invoice_lines l ON l.parent_id = i.id JOIN products p ON p.id = l.product_id WHERE i.status = 'terbit' AND p.kind != 'jasa' AND i.company_id = 1 LIMIT 1");
    b.sales_invoice_id = inv.id; b.lines = [{ product_id: inv.product_id, qty: 1 }];
  },
  purchase_returns: async (b) => {
    const bill = db.get("SELECT b.id, l.product_id FROM purchase_bills b JOIN purchase_bill_lines l ON l.parent_id = b.id WHERE b.status = 'terbit' AND l.product_id IS NOT NULL AND b.company_id = 1 LIMIT 1");
    b.purchase_bill_id = bill.id; b.lines = [{ product_id: bill.product_id, qty: 1 }];
  },
  product_locations: async (b) => {
    const bin = db.get("SELECT id, warehouse_id FROM warehouse_bins WHERE company_id = 1 LIMIT 1");
    b.bin_id = bin.id; b.warehouse_id = bin.warehouse_id;
    b.product_id = db.get('SELECT id FROM products WHERE id NOT IN (SELECT product_id FROM product_locations WHERE warehouse_id = ?) LIMIT 1', bin.warehouse_id).id;
  },
  budgets: async (b) => { b.amount = 12_000_000; },
  // Rekening wajib untuk penerimaan/pembayaran jenis pelunasan (tidak wajib untuk pemakaian uang muka).
  customer_receipts: async (b) => { b.bank_account_id = (await admin.get('/api/lookup/bank_accounts')).body[0].id; },
  supplier_payments: async (b) => { b.bank_account_id = (await admin.get('/api/lookup/bank_accounts')).body[0].id; },
  // Surat jalan dari SO yang masih punya sisa kirim; baris kosong = seluruh sisa.
  delivery_orders: async (b) => {
    const so = db.get("SELECT id FROM sales_orders WHERE company_id = 1 AND branch_id = (SELECT id FROM branches WHERE code = 'JKT') AND status IN ('disetujui','dikirim_sebagian') ORDER BY id DESC LIMIT 1");
    b.sales_order_id = so.id; b.lines = [];
  },
  purchase_bills: async (b) => { b.lines = [{ account_id: (await admin.get('/api/lookup/accounts?f_is_header=0')).body[0].id, qty: 1, price: 1000 }]; },
};

async function buildBody(e) {
  const body = {};
  for (const f of e.fields) {
    if (f.readonly || f.hidden) continue;
    if (!f.required && !['code', 'name'].includes(f.name) && f.type !== 'password') continue;
    body[f.name] = await valueFor(f);
  }
  if (e.lines) {
    const line = {};
    for (const f of e.lines.fields) if (!f.readonly && (f.required || ['qty', 'price', 'amount', 'debit'].includes(f.name))) line[f.name] = await valueFor(f);
    body.lines = [line];
  }
  if (CUSTOM[e.key]) await CUSTOM[e.key](body);
  return body;
}

test('metadata memuat seluruh entitas untuk administrator', () => {
  assert.ok(Object.keys(meta.entities).length >= 45, `entitas: ${Object.keys(meta.entities).length}`);
});

test('daftar, cari, urut, dan saring status berfungsi untuk setiap entitas', async () => {
  for (const key of Object.keys(meta.entities)) {
    const e = meta.entities[key];
    const r = await admin.get(`/api/e/${key}?size=5&q=a&sort=${e.fields[0].name}&dir=desc`);
    assert.equal(r.status, 200, `${key}: ${JSON.stringify(r.body)}`);
    assert.ok(Array.isArray(r.body.rows));
    if (e.statusField) {
      const st = (e.fields.find((f) => f.name === e.statusField).options[0]);
      assert.equal((await admin.get(`/api/e/${key}?status=${Array.isArray(st) ? st[0] : st}`)).status, 200);
    }
  }
});

for (const key of [
  'companies', 'branches', 'users', 'roles', 'accounts', 'fiscal_periods', 'cost_centers', 'bank_accounts', 'journals', 'cash_transactions',
  'bank_transfers', 'budgets', 'fixed_assets', 'depreciation_runs', 'maintenance_orders', 'products', 'warehouses', 'leads', 'customers',
  'quotations', 'sales_orders', 'sales_invoices', 'customer_receipts', 'pos_sales', 'suppliers', 'purchase_requests', 'rfqs',
  'purchase_orders', 'purchase_bills', 'supplier_payments', 'stock_adjustments', 'stock_transfers', 'shipments', 'boms', 'work_orders',
  'projects', 'project_tasks', 'employees', 'attendance', 'leave_requests', 'payroll_runs', 'documents', 'workflows', 'compliance_items',
  'risks', 'security_incidents', 'currencies', 'exchange_rates', 'sales_returns', 'purchase_returns', 'bank_reconciliations', 'pos_shifts',
  'warehouse_bins', 'product_locations', 'bsc_metrics', 'delivery_orders',
]) {
  test(`CRUD ${key}: buat → baca → ubah → konflik versi → hapus`, async () => {
    const e = meta.entities[key];
    assert.ok(e, `metadata ${key}`);
    if (SKIP_CREATE.has(key)) return;
    const body = await buildBody(e);
    const c = await admin.post(`/api/e/${key}`, body);
    assert.equal(c.status, 200, `${key} create: ${JSON.stringify(c.body)} body=${JSON.stringify(body)}`);
    const id = c.body.id;
    const r = await admin.get(`/api/e/${key}/${id}`);
    assert.equal(r.status, 200);
    const textField = e.fields.find((f) => ['text', 'textarea'].includes(f.type) && !f.readonly && !f.pattern && !f.unique && !f.createOnly && f.name !== 'username');
    const upd = { row_version: r.body.row_version };
    if (textField) upd[textField.name] = `Diubah ${seq}`;
    const u = await admin.put(`/api/e/${key}/${id}`, upd);
    assert.equal(u.status, 200, `${key} update: ${JSON.stringify(u.body)}`);
    if (textField) assert.equal(u.body[textField.name], `Diubah ${seq}`);
    const stale = await admin.put(`/api/e/${key}/${id}`, { row_version: r.body.row_version });
    assert.equal(stale.status, 409, `${key} harus menolak versi usang`);
    const d = await admin.del(`/api/e/${key}/${id}`);
    assert.equal(d.status, 200, `${key} delete: ${JSON.stringify(d.body)}`);
    assert.equal((await admin.get(`/api/e/${key}/${id}`)).status, 404);
  });
}

test('data induk yang masih dirujuk tidak dapat dihapus (integritas referensial)', async () => {
  const cust = (await admin.get('/api/e/customers?q=Astra')).body.rows[0];
  const r = await admin.del(`/api/e/customers/${cust.id}`);
  assert.equal(r.status, 409);
});

test('dokumen terposting tidak dapat diubah atau dihapus', async () => {
  const inv = (await admin.get('/api/e/sales_invoices?status=lunas&size=1')).body.rows[0];
  assert.equal((await admin.put(`/api/e/sales_invoices/${inv.id}`, { notes: 'x' })).status, 409);
  assert.equal((await admin.del(`/api/e/sales_invoices/${inv.id}`)).status, 409);
});

test('kode unik per perusahaan ditegakkan', async () => {
  const r = await admin.post('/api/e/customers', { code: 'C001', name: 'Duplikat' });
  assert.equal(r.status, 409);
});
