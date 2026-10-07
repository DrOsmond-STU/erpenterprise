/* Uji fitur lanjutan: multi-mata uang & selisih kurs, retur, rekonsiliasi bank,
   shift kasir, tutup buku tahunan, portal, lampiran, impor, MRP, analitik,
   BSC, asisten, notifikasi, pencarian, dan preferensi. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db } from './helpers.mjs';

let admin, osmond;
const id = (table, code, field = 'code') => db.get(`SELECT id FROM ${table} WHERE ${field} = ?`, code).id;
const acc = (code) => id('accounts', code);

before(async () => {
  await start();
  admin = await as('admin');
  osmond = await as('osmond');
  await admin.put('/api/settings/security_policy', { apiRateLimitPerMinute: 100000, loginRateLimitPerMinute: 1000 });
});
after(stop);

function balancedEverywhere() {
  const bad = db.all(`SELECT j.number FROM journals j JOIN journal_lines l ON l.parent_id = j.id WHERE j.status = 'diposting' GROUP BY j.id, l.branch_id HAVING ABS(SUM(l.debit - l.credit)) > 0.005`);
  assert.deepEqual(bad, [], 'jurnal seimbang per cabang');
}

async function reconciled(companyCode = 'KNM') {
  const c = id('companies', companyCode);
  for (const r of ['neraca', 'neraca-saldo', 'umur-piutang', 'umur-hutang', 'persediaan', 'arus-kas']) {
    const x = await admin.get(`/api/reports/${r}?company=${c}&to=2026-12-31&from=2026-01-01`);
    assert.equal(x.status, 200);
    assert.ok(x.body.balanced !== false && x.body.reconciled !== false, `${r} harus seimbang/cocok: ${JSON.stringify(x.body.diff ?? [x.body.totals?.total, x.body.glBalance])}`);
  }
}

test('multi-mata uang: faktur USD dan penerimaan dengan kurs berbeda membukukan laba selisih kurs', async () => {
  const usd = id('currencies', 'USD');
  const jkt = id('branches', 'JKT');
  const inv = await admin.post('/api/e/sales_invoices', { branch_id: jkt, date: '2026-10-05', customer_id: id('customers', 'C009'), warehouse_id: id('warehouses', 'WH-JKT'), currency_id: usd, tax_rate: 0, lines: [{ product_id: id('products', 'FG-103'), qty: 100, price: 12 }] });
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  assert.equal(inv.body.exchange_rate, 16480, 'kurs otomatis dari tabel kurs terbaru ≤ tanggal');
  await osmond.post(`/api/e/sales_invoices/${inv.body.id}/actions/post`);
  const j = db.get("SELECT id FROM journals WHERE source_type = 'sales_invoices' AND source_id = ?", inv.body.id);
  const ar = db.get('SELECT debit FROM journal_lines WHERE parent_id = ? AND account_id = ?', j.id, acc('1-1200'));
  assert.equal(ar.debit, 1200 * 16480, 'piutang dibukukan dalam IDR');
  const rc = await admin.post('/api/e/customer_receipts', { branch_id: jkt, date: '2026-10-07', customer_id: id('customers', 'C009'), bank_account_id: id('bank_accounts', 'BCA-USD'), currency_id: usd, exchange_rate: 16600, lines: [{ invoice_id: inv.body.id, amount: 1200 }] });
  const p = await osmond.post(`/api/e/customer_receipts/${rc.body.id}/actions/post`);
  assert.equal(p.status, 200, JSON.stringify(p.body));
  const rj = db.get("SELECT id FROM journals WHERE source_type = 'customer_receipts' AND source_id = ?", rc.body.id);
  const gain = db.get('SELECT credit FROM journal_lines WHERE parent_id = ? AND account_id = ?', rj.id, acc('7-1200'));
  assert.equal(gain.credit, 1200 * (16600 - 16480), 'laba selisih kurs terealisasi');
  assert.equal(db.get('SELECT status FROM sales_invoices WHERE id = ?', inv.body.id).status, 'lunas');
  const idrRc = await admin.post('/api/e/customer_receipts', { branch_id: jkt, date: '2026-10-07', customer_id: id('customers', 'C009'), bank_account_id: id('bank_accounts', 'BCA-JKT'), currency_id: id('currencies', 'IDR'), lines: [{ invoice_id: db.get("SELECT id FROM sales_invoices WHERE currency_id = ? AND status IN ('terbit','sebagian') LIMIT 1", usd)?.id || inv.body.id, amount: 1 }] });
  if (idrRc.status === 200) assert.equal((await osmond.post(`/api/e/customer_receipts/${idrRc.body.id}/actions/post`)).status, 400, 'mata uang penerimaan harus sama dengan faktur');
  balancedEverywhere();
  await reconciled();
});

test('kurs valas yang belum tersedia ditolak dengan pesan jelas', async () => {
  const jpy = id('currencies', 'JPY');
  const r = await admin.post('/api/e/sales_invoices', { branch_id: id('branches', 'JKT'), date: '2026-10-05', customer_id: id('customers', 'C001'), warehouse_id: id('warehouses', 'WH-JKT'), currency_id: jpy, lines: [{ product_id: id('products', 'SV-301'), qty: 1, price: 1000 }] });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Kurs JPY/);
});

test('retur penjualan: batas qty, mengurangi piutang, mengembalikan stok, dapat dibatalkan', async () => {
  const jkt = id('branches', 'JKT');
  const inv = await admin.post('/api/e/sales_invoices', { branch_id: jkt, date: '2026-10-06', customer_id: id('customers', 'C002'), warehouse_id: id('warehouses', 'WH-JKT'), lines: [{ product_id: id('products', 'FG-102'), qty: 5, price: 2_250_000 }] });
  await osmond.post(`/api/e/sales_invoices/${inv.body.id}/actions/post`);
  const stock = () => db.get('SELECT qty FROM stock_balances WHERE product_id = ? AND warehouse_id = ?', id('products', 'FG-102'), id('warehouses', 'WH-JKT')).qty;
  const before = stock();
  const tooMany = await admin.post('/api/e/sales_returns', { branch_id: jkt, date: '2026-10-07', sales_invoice_id: inv.body.id, warehouse_id: id('warehouses', 'WH-JKT'), reason: 'Uji', lines: [{ product_id: id('products', 'FG-102'), qty: 6 }] });
  assert.equal((await osmond.post(`/api/e/sales_returns/${tooMany.body.id}/actions/post`)).status, 400);
  const sr = await admin.post('/api/e/sales_returns', { branch_id: jkt, date: '2026-10-07', sales_invoice_id: inv.body.id, warehouse_id: id('warehouses', 'WH-JKT'), reason: 'Cacat', lines: [{ product_id: id('products', 'FG-102'), qty: 2 }] });
  assert.equal(sr.body.customer_id, id('customers', 'C002'), 'pelanggan diambil dari faktur');
  assert.equal(sr.body.subtotal, 4_500_000, 'harga diambil dari faktur');
  const p = await osmond.post(`/api/e/sales_returns/${sr.body.id}/actions/post`);
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(stock() - before, 2);
  const invRow = db.get('SELECT paid, status FROM sales_invoices WHERE id = ?', inv.body.id);
  assert.equal(invRow.paid, sr.body.total);
  assert.equal(invRow.status, 'sebagian');
  await reconciled();
  assert.equal((await osmond.post(`/api/e/sales_returns/${sr.body.id}/actions/void`)).status, 200);
  assert.equal(stock(), before);
  assert.equal(db.get('SELECT paid FROM sales_invoices WHERE id = ?', inv.body.id).paid, 0);
  balancedEverywhere();
});

test('retur pembelian mengurangi hutang & stok, persediaan tetap cocok dengan buku besar', async () => {
  const ckr = id('branches', 'CKR');
  const bill = await admin.post('/api/e/purchase_bills', { branch_id: ckr, date: '2026-10-06', supplier_id: id('suppliers', 'S003'), warehouse_id: id('warehouses', 'WH-CKR'), supplier_invoice_no: 'UJI-RET', lines: [{ product_id: id('products', 'RM-003'), qty: 100, price: 66_000 }] });
  await osmond.post(`/api/e/purchase_bills/${bill.body.id}/actions/post`);
  const pr = await admin.post('/api/e/purchase_returns', { branch_id: ckr, date: '2026-10-07', purchase_bill_id: bill.body.id, warehouse_id: id('warehouses', 'WH-CKR'), reason: 'Ulir rusak', lines: [{ product_id: id('products', 'RM-003'), qty: 10 }] });
  const p = await osmond.post(`/api/e/purchase_returns/${pr.body.id}/actions/post`);
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(db.get('SELECT paid FROM purchase_bills WHERE id = ?', bill.body.id).paid, pr.body.total);
  balancedEverywhere();
  await reconciled();
});

test('rekonsiliasi bank: selisih harus nol, pemisahan tugas, baris terkunci setelah selesai', async () => {
  const recon = db.get("SELECT id FROM bank_reconciliations WHERE status = 'draf' LIMIT 1");
  const d = await admin.get(`/api/bank-recon/${recon.id}`);
  assert.equal(d.status, 200);
  assert.ok(d.body.lines.length > 0);
  assert.equal((await admin.put(`/api/bank-recon/${recon.id}/items`, { lineIds: d.body.lines.slice(0, 1).map((l) => l.id) })).status, 200);
  assert.equal((await osmond.post(`/api/e/bank_reconciliations/${recon.id}/actions/finalize`)).status, 400, 'selisih ≠ 0 ditolak');
  const all = d.body.lines.filter((l) => l.date <= d.body.recon.statement_date).map((l) => l.id);
  const set = await admin.put(`/api/bank-recon/${recon.id}/items`, { lineIds: all });
  assert.equal(set.body.difference, 0, JSON.stringify(set.body.difference));
  assert.equal((await admin.post(`/api/e/bank_reconciliations/${recon.id}/actions/finalize`)).status, 403, 'pembuat tidak boleh menyelesaikan sendiri');
  assert.equal((await osmond.post(`/api/e/bank_reconciliations/${recon.id}/actions/finalize`)).status, 200);
  assert.equal((await admin.put(`/api/bank-recon/${recon.id}/items`, { lineIds: [] })).status, 409, 'rekonsiliasi selesai terkunci');
  const otherLine = await admin.put(`/api/bank-recon/${recon.id}/items`, { lineIds: [999999] });
  assert.equal(otherLine.status, 409);
});

test('shift kasir: selisih kas dijurnal; satu laci hanya satu shift terbuka', async () => {
  const kasir = await as('yoga.kasir');
  const open = db.get("SELECT id, opening_cash FROM pos_shifts WHERE status = 'buka' LIMIT 1");
  const dup = await kasir.post('/api/e/pos_shifts', { date: '2026-10-07', bank_account_id: id('bank_accounts', 'KAS-MDN'), opening_cash: 1000 });
  assert.equal(dup.status, 409);
  const c = await kasir.post(`/api/e/pos_shifts/${open.id}/actions/close`, { closing_cash: open.opening_cash - 25_000 });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.record.difference, -25_000);
  const j = db.get("SELECT id FROM journals WHERE source_type = 'pos_shifts' AND source_id = ?", open.id);
  assert.equal(db.get('SELECT debit FROM journal_lines WHERE parent_id = ? AND account_id = ?', j.id, acc('6-2950')).debit, 25_000);
});

test('lokasi rak harus milik gudang yang dipilih', async () => {
  const binCkr = id('warehouse_bins', 'CKR-A-01');
  const r = await admin.post('/api/e/product_locations', { branch_id: id('branches', 'JKT'), product_id: id('products', 'TG-205'), warehouse_id: id('warehouses', 'WH-JKT'), bin_id: binCkr });
  assert.equal(r.status, 400);
});

test('portal: hanya data milik pelanggan/pemasok sendiri, tidak ada akses modul internal', async () => {
  const p = await as('portal.astra');
  assert.equal((await p.get('/api/e/customers')).status, 403);
  assert.equal((await p.get('/api/dashboard')).status, 403);
  assert.equal((await p.get('/api/reports/neraca')).status, 403);
  const docs = await p.get('/api/portal/docs/invoices');
  assert.ok(docs.body.length > 0);
  const c001 = id('customers', 'C001');
  assert.ok(docs.body.every((d) => db.get('SELECT customer_id FROM sales_invoices WHERE id = ?', d.id).customer_id === c001));
  assert.ok(docs.body.every((d) => d.status !== 'draf'), 'draf tidak tampil di portal');
  const other = db.get('SELECT id FROM sales_invoices WHERE customer_id != ? LIMIT 1', c001);
  assert.equal((await p.get(`/api/portal/docs/invoices/${other.id}`)).status, 404);
  const st = await p.get('/api/portal/statement?from=2026-01-01&to=2026-12-31');
  const open = db.get("SELECT ROUND(SUM((total - paid) * COALESCE(exchange_rate,1)),2) v FROM sales_invoices WHERE customer_id = ? AND status IN ('terbit','sebagian')", c001).v;
  assert.ok(Math.abs(st.body.closing - open) < 1, 'kartu piutang portal = saldo faktur terbuka');
  const s = await as('portal.krakatau');
  assert.equal((await s.get('/api/portal/docs/invoices')).status, 404, 'pemasok tidak memiliki dokumen faktur penjualan');
  assert.equal((await admin.get('/api/portal/summary')).status, 403, 'pengguna internal bukan akun portal');
});

test('lampiran: validasi tipe & ukuran, terenkripsi saat tersimpan, hak akses modul', async () => {
  const inv = db.get("SELECT id FROM sales_invoices WHERE company_id = 1 LIMIT 1");
  const text = 'Rahasia: nomor rekening 1234567890';
  const up = await admin.post(`/api/attachments/sales_invoices/${inv.id}`, { filename: 'catatan.txt', mime: 'text/plain', data: Buffer.from(text).toString('base64') });
  assert.equal(up.status, 200);
  const raw = db.get('SELECT data FROM attachments WHERE id = ?', up.body.id).data;
  assert.ok(!Buffer.from(raw).toString('latin1').includes('Rahasia'), 'isi lampiran terenkripsi');
  const dl = await admin.get(`/api/attachment/${up.body.id}`);
  assert.equal(dl.body, text);
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  assert.equal((await admin.post(`/api/attachments/sales_invoices/${inv.id}`, { filename: 'x.exe', mime: 'application/x-msdownload', data: 'TVo=' })).status, 400);
  assert.equal((await admin.post(`/api/attachments/sales_invoices/${inv.id}`, { filename: 'x.png', mime: 'image/png', data: Buffer.from('<script>').toString('base64') })).status, 400);
  const big = Buffer.alloc(5 * 1024 * 1024 + 10, 65).toString('base64');
  assert.equal((await admin.post(`/api/attachments/sales_invoices/${inv.id}`, { filename: 'big.txt', mime: 'text/plain', data: big })).status, 400);
  const kasir = await as('yoga.kasir');
  assert.equal((await kasir.get(`/api/attachment/${up.body.id}`)).status, 403);
  const j = db.get('SELECT id FROM journals LIMIT 1');
  const sales = await as('sari.sales');
  assert.equal((await sales.post(`/api/attachments/journals/${j.id}`, { filename: 'a.txt', mime: 'text/plain', data: 'YQ==' })).status, 403);
  assert.equal((await admin.del(`/api/attachment/${up.body.id}`)).status, 200);
  assert.ok(db.get("SELECT COUNT(*) n FROM audit_log WHERE action LIKE 'attachment.%'").n >= 3);
});

test('impor CSV: baris valid diimpor, galat per baris dilaporkan, entitas dibatasi', async () => {
  const r = await admin.post('/api/import/customers', { rows: [
    { Kode: 'IMP-C1', Nama: 'PT Impor Satu', Segmen: 'Korporasi', 'Plafon kredit': '250.000.000', 'Mata uang transaksi': 'USD' },
    { Kode: 'IMP-C2', Nama: 'PT Impor Dua', 'Mata uang transaksi': 'XYZ' },
    { Kode: 'C001', Nama: 'Duplikat' },
  ] });
  assert.equal(r.status, 200);
  assert.equal(r.body.imported, 1);
  assert.equal(r.body.failed, 2);
  const c = db.get("SELECT credit_limit, currency_id FROM customers WHERE code = 'IMP-C1'");
  assert.equal(c.credit_limit, 250_000_000);
  assert.equal(c.currency_id, id('currencies', 'USD'));
  assert.equal((await admin.post('/api/import/journals', { rows: [{}] })).status, 400);
  const sales = await as('sari.sales');
  assert.equal((await sales.post('/api/import/employees', { rows: [{ Nama: 'x' }] })).status, 403);
});

test('MRP menghasilkan saran dan dapat membuat permintaan pembelian', async () => {
  const m = await admin.get('/api/mrp');
  assert.equal(m.status, 200);
  const buy = m.body.rows.filter((r) => r.action === 'pembelian');
  assert.ok(buy.length > 0);
  for (const r of m.body.rows) assert.ok(Math.abs(r.net - Math.max(0, r.demand + r.safety - r.stock - r.incoming)) < 0.01);
  const pr = await admin.post('/api/mrp/request', { items: buy.map((b) => ({ product_id: b.product_id, qty: b.qty })), branch_id: id('branches', 'CKR') });
  assert.equal(pr.status, 200);
  assert.equal(pr.body.lines.length, buy.length);
  const after = await admin.get('/api/mrp');
  assert.ok(after.body.rows.filter((r) => r.action === 'pembelian').length < buy.length, 'PR terbuka dihitung sebagai pasokan');
});

test('analitik konsisten dengan laba rugi; BSC menghitung skor', async () => {
  const q = 'from=2026-01-01&to=2026-09-30';
  const a = await admin.get(`/api/analytics?${q}`);
  const pl = await admin.get(`/api/reports/laba-rugi?${q}`);
  assert.equal(a.status, 200);
  assert.ok(Math.abs(a.body.kpis.revenue - pl.body.blocks[0].section.total.v) < 1);
  assert.ok(Math.abs(a.body.kpis.netIncome - pl.body.netIncome.v) < 1);
  const b = await admin.get('/api/bsc?to=2026-09-30');
  assert.equal(b.status, 200);
  assert.equal(b.body.perspectives.length, 4);
  assert.ok(b.body.perspectives.every((p) => p.metrics.length >= 4));
  assert.ok(b.body.overall > 0);
  const sales = await as('sari.sales');
  assert.equal((await sales.get('/api/analytics')).status, 403);
});

test('asisten, notifikasi, dan pencarian menghormati hak akses', async () => {
  const a = await admin.post('/api/assistant', { q: 'Apakah neraca seimbang?' });
  assert.match(a.body.answer, /seimbang ✔/);
  const inv = db.get("SELECT number FROM sales_invoices WHERE company_id = 1 LIMIT 1").number;
  assert.match((await admin.post('/api/assistant', { q: `status ${inv}` })).body.answer, new RegExp(inv));
  const sales = await as('sari.sales');
  assert.equal((await sales.post('/api/assistant', { q: 'laba bersih tahun ini' })).status, 403);
  assert.equal((await sales.post('/api/assistant', { q: 'piutang' })).status, 200);
  const s = await sales.get('/api/search?q=uji');
  assert.ok(s.body.every((r) => !['journals', 'employees'].includes(r.entity)));
  const n = await admin.get('/api/notifications');
  assert.ok(n.body.some((x) => /persetujuan/.test(x.title)));
  const nk = await (await as('yoga.kasir')).get('/api/notifications');
  assert.ok(nk.body.every((x) => !/persetujuan|faktur/.test(x.title)), 'kasir tidak menerima notifikasi modul lain');
});

test('preferensi pengguna terisolasi per pengguna dan dibatasi ukurannya', async () => {
  await admin.put('/api/prefs/dashboard', { value: { hidden: ['trend'] } });
  assert.deepEqual((await admin.get('/api/prefs/dashboard')).body.value, { hidden: ['trend'] });
  assert.equal((await osmond.get('/api/prefs/dashboard')).body.value, null);
  assert.equal((await admin.put('/api/prefs/dashboard', { value: 'x'.repeat(5000) })).status, 400);
  assert.equal((await admin.put('/api/prefs/rahasia', { value: 1 })).status, 404);
});

test('tutup buku tahunan memindahkan laba ke saldo laba; neraca tetap seimbang; tidak dapat diulang', async () => {
  const knm = id('companies', 'KNM');
  const p = await admin.post('/api/e/fiscal_periods', { name: '2026-12', start_date: '2026-12-01', end_date: '2026-12-31' });
  const pl = await admin.get(`/api/reports/laba-rugi?company=${knm}&from=2026-01-01&to=2026-12-31`);
  const reBefore = db.get("SELECT COALESCE(SUM(credit - debit),0) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status = 'diposting' AND jl.company_id = ? AND jl.account_id = ?", knm, acc('3-2000')).v;
  const r = await osmond.post(`/api/e/fiscal_periods/${p.body.id}/actions/close_year`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const reAfter = db.get("SELECT COALESCE(SUM(credit - debit),0) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status = 'diposting' AND jl.company_id = ? AND jl.account_id = ?", knm, acc('3-2000')).v;
  assert.ok(Math.abs(reAfter - reBefore - pl.body.netIncome.v) < 1, 'saldo laba bertambah sebesar laba tahun berjalan');
  for (const asOf of ['2026-12-31', '2027-01-31']) {
    const bs = await admin.get(`/api/reports/neraca?company=${knm}&asOf=${asOf}&to=${asOf}`);
    assert.equal(bs.body.balanced, true, `neraca ${asOf}`);
  }
  const bs27 = await admin.get(`/api/reports/neraca?company=${knm}&to=2027-01-31`);
  const prior = bs27.body.blocks[2].extra.find((x) => /tahun-tahun lalu/.test(x.name));
  assert.ok(Math.abs(prior.values.v) < 1, 'tidak ada laba tahun lalu yang belum ditutup');
  assert.equal((await osmond.post(`/api/e/fiscal_periods/${p.body.id}/actions/close_year`)).status, 409);
  const cons = await osmond.get(`/api/reports/neraca?company=${knm}&mode=consolidated&to=2027-01-31`);
  assert.equal(cons.body.balanced, true, 'konsolidasi tetap seimbang setelah tutup buku induk');
  balancedEverywhere();
});

test('migrasi skema idempoten (aman dijalankan ulang)', async () => {
  const { migrate } = await import('../server/schema.js');
  const { upgrade } = await import('../server/upgrade.js');
  migrate();
  upgrade();
  assert.equal(db.get("SELECT value FROM meta WHERE key = 'schema_version'").value, '2');
  assert.equal(db.get("SELECT COUNT(*) n FROM currencies WHERE is_base = 1").n, 1);
});
