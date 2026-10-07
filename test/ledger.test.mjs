/* Uji integrasi buku besar: setiap modul memposting jurnal seimbang, sub-buku
   cocok dengan buku besar, dan laporan (neraca, laba rugi, arus kas, cabang,
   konsolidasi) selalu konsisten. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db, soViaQuotation } from './helpers.mjs';

let admin, osmond;
const id = (table, code, field = 'code') => db.get(`SELECT id FROM ${table} WHERE ${field} = ?`, code).id;
const acc = (code) => id('accounts', code);
const company = (code) => id('companies', code);

before(async () => {
  await start();
  admin = await as('admin');
  osmond = await as('osmond');
  await admin.put('/api/settings/security_policy', { apiRateLimitPerMinute: 100000, loginRateLimitPerMinute: 1000 });
});
after(stop);

function assertAllJournalsBalanced() {
  const bad = db.all(`SELECT j.number, ROUND(SUM(l.debit),2) d, ROUND(SUM(l.credit),2) c FROM journals j JOIN journal_lines l ON l.parent_id = j.id
    WHERE j.status = 'diposting' GROUP BY j.id HAVING ABS(d - c) > 0.005`);
  assert.deepEqual(bad, [], 'setiap jurnal harus seimbang');
  const perBranch = db.all(`SELECT j.number, l.branch_id, ROUND(SUM(l.debit - l.credit),2) net FROM journals j JOIN journal_lines l ON l.parent_id = j.id
    WHERE j.status = 'diposting' GROUP BY j.id, l.branch_id HAVING ABS(net) > 0.005`);
  assert.deepEqual(perBranch, [], 'setiap jurnal harus seimbang per cabang (RAK otomatis)');
}

test('seluruh jurnal data demo seimbang, juga per cabang', () => {
  assert.ok(db.get("SELECT COUNT(*) n FROM journals WHERE status = 'diposting'").n > 500);
  assertAllJournalsBalanced();
});

for (const co of ['KNM', 'NLP', 'KNMT']) {
  test(`laporan ${co}: neraca seimbang (perusahaan & per cabang), neraca saldo, arus kas, sub-buku cocok`, async () => {
    const c = company(co);
    const q = `company=${c}&from=2026-01-01&to=2026-10-07`;
    const bs = await admin.get(`/api/reports/neraca?${q}`);
    assert.equal(bs.status, 200);
    assert.equal(bs.body.balanced, true, JSON.stringify(bs.body.diff));
    const bsBranch = await admin.get(`/api/reports/neraca?${q}&mode=branch`);
    assert.equal(bsBranch.body.balanced, true, JSON.stringify(bsBranch.body.diff));
    const pl = await admin.get(`/api/reports/laba-rugi?${q}&mode=branch`);
    const cols = pl.body.columns.filter((x) => x.key !== 'total').map((x) => x.key);
    const sumBranches = cols.reduce((s, k) => s + pl.body.netIncome[k], 0);
    assert.ok(Math.abs(sumBranches - pl.body.netIncome.total) < 1, 'laba seluruh cabang = laba perusahaan');
    const tb = await admin.get(`/api/reports/neraca-saldo?${q}`);
    assert.equal(tb.body.balanced, true);
    const cf = await admin.get(`/api/reports/arus-kas?${q}`);
    assert.equal(cf.body.balanced, true);
    for (const r of ['umur-piutang', 'umur-hutang', 'persediaan']) {
      const x = await admin.get(`/api/reports/${r}?${q}`);
      assert.equal(x.body.reconciled, true, `${r}: sub-buku ${x.body.totals?.total ?? x.body.total} vs GL ${x.body.glBalance}`);
    }
  });
}

test('laporan konsolidasi seimbang, eliminasi antar perusahaan & investasi, NCI', async () => {
  const q = `company=${company('KNM')}&from=2026-01-01&to=2026-10-07&mode=consolidated`;
  const bs = await osmond.get(`/api/reports/neraca?${q}`);
  assert.equal(bs.status, 200);
  assert.equal(bs.body.balanced, true, JSON.stringify(bs.body.diff));
  const rows = bs.body.blocks.flatMap((b) => b.section ? b.section.rows : []);
  const icAr = rows.find((r) => r.code === '1-1600');
  if (icAr) assert.ok(Math.abs(icAr.values.cons) < 0.01, 'piutang antar perusahaan tereliminasi');
  const inv = rows.find((r) => r.code === '1-2900');
  assert.ok(Math.abs(inv.values.cons) < 0.01, 'investasi pada entitas anak tereliminasi');
  const extras = bs.body.blocks.flatMap((b) => b.extra || []);
  assert.ok(extras.some((x) => /non-pengendali/.test(x.name)), 'NCI disajikan');
  assert.equal(extras.find((x) => /Goodwill/.test(x.name)).values.cons, 100_000_000);
  const pl = await osmond.get(`/api/reports/laba-rugi?${q}`);
  const plRows = pl.body.blocks.flatMap((b) => b.section ? b.section.rows : []);
  const icRev = plRows.find((r) => r.code === '4-1400');
  assert.ok(icRev && icRev.values.elim < 0 && Math.abs(icRev.values.cons) < 0.01, 'pendapatan antar perusahaan tereliminasi');
  const sumEntities = pl.body.columns.filter((c) => c.kind === 'entity').reduce((s, c) => s + pl.body.netIncome[c.key], 0);
  assert.ok(Math.abs(sumEntities + pl.body.netIncome.elim - pl.body.netIncome.cons) < 1);
  const ops = await as('budi.ops');
  assert.equal((await ops.get(`/api/reports/neraca?${q}`)).status, 403, 'konsolidasi hanya untuk pengguna lintas perusahaan');
});

test('siklus penjualan: SO → faktur → posting (stok & HPP) → penerimaan → pembatalan', async () => {
  const jkt = id('branches', 'JKT');
  const stockBefore = db.get('SELECT qty FROM stock_balances WHERE product_id = ? AND warehouse_id = ?', id('products', 'FG-102'), id('warehouses', 'WH-JKT')).qty;
  const so = { body: await soViaQuotation(admin, osmond, {
    branch_id: jkt, date: '2026-10-07', customer_id: id('customers', 'C004'), warehouse_id: id('warehouses', 'WH-JKT'), tax_rate: 11,
    lines: [{ product_id: id('products', 'FG-102'), qty: 2, price: 2_250_000 }],
  }) };
  assert.equal(so.body.total, 4_995_000);
  const sub = await admin.post(`/api/e/sales_orders/${so.body.id}/actions/submit`);
  assert.equal(sub.body.record.status, 'disetujui');
  const toInv = await admin.post(`/api/e/sales_orders/${so.body.id}/actions/to_invoice`);
  const invId = toInv.body.redirect.id;
  const post = await admin.post(`/api/e/sales_invoices/${invId}/actions/post`);
  assert.equal(post.status, 200);
  assert.equal(post.body.record.status, 'terbit');
  const j = post.body.record.__journals[0];
  const lines = db.all('SELECT a.code, l.debit, l.credit FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.parent_id = ?', j.id);
  const by = (code, side) => lines.filter((l) => l.code === code).reduce((s, l) => s + l[side], 0);
  assert.equal(by('1-1200', 'debit'), 4_995_000);
  assert.equal(by('4-1100', 'credit'), 4_500_000);
  assert.equal(by('2-1200', 'credit'), 495_000);
  assert.ok(by('5-1100', 'debit') > 0 && Math.abs(by('5-1100', 'debit') - by('1-1330', 'credit')) < 0.01, 'HPP = persediaan keluar');
  const stockAfter = db.get('SELECT qty FROM stock_balances WHERE product_id = ? AND warehouse_id = ?', id('products', 'FG-102'), id('warehouses', 'WH-JKT')).qty;
  assert.equal(stockBefore - stockAfter, 2);
  // Penerimaan sebagian lalu pelunasan.
  const rc = await admin.post('/api/e/customer_receipts', { branch_id: jkt, date: '2026-10-07', customer_id: id('customers', 'C004'), bank_account_id: id('bank_accounts', 'BCA-JKT'), lines: [{ invoice_id: invId, amount: 2_000_000 }] });
  await osmond.post(`/api/e/customer_receipts/${rc.body.id}/actions/post`);
  assert.equal(db.get('SELECT status, paid FROM sales_invoices WHERE id = ?', invId).status, 'sebagian');
  const over = await admin.post('/api/e/customer_receipts', { branch_id: jkt, date: '2026-10-07', customer_id: id('customers', 'C004'), bank_account_id: id('bank_accounts', 'BCA-JKT'), lines: [{ invoice_id: invId, amount: 9_999_999 }] });
  assert.equal((await osmond.post(`/api/e/customer_receipts/${over.body.id}/actions/post`)).status, 400, 'pembayaran melebihi sisa ditolak');
  // Faktur yang sudah dibayar tidak boleh dibatalkan; batalkan penerimaan dulu.
  assert.equal((await osmond.post(`/api/e/sales_invoices/${invId}/actions/void`)).status, 409);
  assert.equal((await osmond.post(`/api/e/customer_receipts/${rc.body.id}/actions/void`)).status, 200);
  const v = await osmond.post(`/api/e/sales_invoices/${invId}/actions/void`);
  assert.equal(v.status, 200);
  assert.equal(v.body.record.status, 'batal');
  assert.equal(db.get('SELECT qty FROM stock_balances WHERE product_id = ? AND warehouse_id = ?', id('products', 'FG-102'), id('warehouses', 'WH-JKT')).qty, stockBefore, 'stok dikembalikan');
  assertAllJournalsBalanced();
});

test('plafon kredit: SO melebihi plafon menunggu persetujuan; pembuat tidak boleh menyetujui', async () => {
  const sales = await as('sari.sales');
  const so = { body: await soViaQuotation(sales, await as('budi.ops'), { date: '2026-10-07', customer_id: id('customers', 'C008'), warehouse_id: id('warehouses', 'WH-JKT'), lines: [{ product_id: id('products', 'FG-101'), qty: 200, price: 4_850_000 }] }) };
  const s = await sales.post(`/api/e/sales_orders/${so.body.id}/actions/submit`);
  assert.equal(s.body.record.status, 'menunggu');
  assert.match(s.body.record.approval_note, /plafon/);
  assert.equal((await sales.post(`/api/e/sales_orders/${so.body.id}/actions/approve`)).status, 403);
  const ops = await as('budi.ops');
  assert.equal((await ops.post(`/api/e/sales_orders/${so.body.id}/actions/approve`)).body.record.status, 'disetujui');
});

test('siklus pembelian: PO > ambang butuh persetujuan → tagihan → stok masuk → pembayaran', async () => {
  const ckr = id('branches', 'CKR');
  const po = await admin.post('/api/e/purchase_orders', { branch_id: ckr, date: '2026-10-07', supplier_id: id('suppliers', 'S004'), warehouse_id: id('warehouses', 'WH-CKR'), lines: [{ product_id: id('products', 'RM-004'), qty: 2000, price: 92_000 }] });
  assert.equal((await admin.post(`/api/e/purchase_orders/${po.body.id}/actions/submit`)).body.record.status, 'menunggu');
  await osmond.post(`/api/e/purchase_orders/${po.body.id}/actions/approve`);
  const b = await admin.post(`/api/e/purchase_orders/${po.body.id}/actions/to_bill`, { supplier_invoice_no: 'JTN-001' });
  const before = db.get('SELECT qty FROM stock_balances WHERE product_id = ? AND warehouse_id = ?', id('products', 'RM-004'), id('warehouses', 'WH-CKR')).qty;
  const p = await osmond.post(`/api/e/purchase_bills/${b.body.redirect.id}/actions/post`);
  assert.equal(p.body.record.status, 'terbit');
  assert.equal(db.get('SELECT qty FROM stock_balances WHERE product_id = ? AND warehouse_id = ?', id('products', 'RM-004'), id('warehouses', 'WH-CKR')).qty - before, 2000);
  assert.equal(db.get('SELECT status FROM purchase_orders WHERE id = ?', po.body.id).status, 'diterima');
  const pay = await admin.post('/api/e/supplier_payments', { branch_id: ckr, date: '2026-10-07', supplier_id: id('suppliers', 'S004'), bank_account_id: id('bank_accounts', 'BCA-CKR'), lines: [{ bill_id: b.body.redirect.id, amount: p.body.record.total }] });
  await admin.post(`/api/e/supplier_payments/${pay.body.id}/actions/submit`);
  assert.equal((await admin.post(`/api/e/supplier_payments/${pay.body.id}/actions/post`)).status, 403, 'SoD pembayaran');
  assert.equal((await osmond.post(`/api/e/supplier_payments/${pay.body.id}/actions/post`)).status, 200);
  assert.equal(db.get('SELECT status FROM purchase_bills WHERE id = ?', b.body.redirect.id).status, 'lunas');
  assertAllJournalsBalanced();
});

test('transfer stok antar cabang memposting RAK dan menjaga neraca cabang seimbang', async () => {
  const t = await admin.post('/api/e/stock_transfers', { branch_id: id('branches', 'CKR'), date: '2026-10-07', from_warehouse_id: id('warehouses', 'WH-CKR'), to_warehouse_id: id('warehouses', 'WH-MDN'), lines: [{ product_id: id('products', 'FG-103'), qty: 50 }] });
  const r = await admin.post(`/api/e/stock_transfers/${t.body.id}/actions/post`);
  assert.equal(r.status, 200);
  const j = r.body.record.__journals[0];
  const rak = db.all('SELECT branch_id, debit, credit FROM journal_lines WHERE parent_id = ? AND account_id = ?', j.id, acc('1-1700'));
  assert.equal(rak.length, 2, 'dua baris RAK (cabang asal & tujuan)');
  const bs = await admin.get(`/api/reports/neraca?company=${company('KNM')}&mode=branch&to=2026-10-07`);
  assert.equal(bs.body.balanced, true);
});

test('produksi: penyelesaian perintah kerja memakai BOM dan memindahkan nilai ke barang jadi', async () => {
  const wo = await admin.post('/api/e/work_orders', { branch_id: id('branches', 'CKR'), date: '2026-10-07', bom_id: id('boms', 'BOM-103'), qty: 10, warehouse_id: id('warehouses', 'WH-CKR') });
  for (const a of ['start', 'to_qc']) assert.equal((await admin.post(`/api/e/work_orders/${wo.body.id}/actions/${a}`)).status, 200);
  const done = await osmond.post(`/api/e/work_orders/${wo.body.id}/actions/complete`);
  assert.equal(done.body.record.status, 'selesai');
  assert.ok(done.body.record.total > 0);
  const inv = await admin.get(`/api/reports/persediaan?company=${company('KNM')}`);
  assert.equal(inv.body.reconciled, true);
});

test('penggajian, penyusutan, pemeliharaan, kas & pelepasan aset terintegrasi ke laba rugi', async () => {
  const jkt = id('branches', 'JKT');
  const run = await admin.post('/api/e/payroll_runs', { branch_id: jkt, period: '2026-11', pay_date: '2026-11-25', bank_account_id: id('bank_accounts', 'MDR-PAY') });
  await admin.post(`/api/e/payroll_runs/${run.body.id}/actions/generate`);
  await osmond.post(`/api/e/payroll_runs/${run.body.id}/actions/approve`);
  await osmond.post(`/api/e/payroll_runs/${run.body.id}/actions/post`);
  const paid = await osmond.post(`/api/e/payroll_runs/${run.body.id}/actions/pay`);
  assert.equal(paid.body.record.status, 'dibayar');
  const dep = await admin.post('/api/e/depreciation_runs', { period: '2026-10' });
  const dp = await osmond.post(`/api/e/depreciation_runs/${dep.body.id}/actions/post`);
  assert.equal(dp.body.record.status, 'diposting');
  const dup = await admin.post('/api/e/depreciation_runs', { period: '2026-10' });
  assert.equal((await osmond.post(`/api/e/depreciation_runs/${dup.body.id}/actions/post`)).status, 409, 'penyusutan ganda ditolak');
  const asset = db.get("SELECT id, book_value FROM fixed_assets WHERE code = 'AST-005'");
  const disp = await osmond.post(`/api/e/fixed_assets/${asset.id}/actions/dispose`, { date: '2026-11-30', proceeds: 300_000_000, bank_account_id: id('bank_accounts', 'BRI-MDN') });
  assert.equal(disp.status, 200);
  const pl = await admin.get(`/api/reports/laba-rugi?company=${company('KNM')}&from=2026-11-01&to=2026-11-30`);
  const rows = pl.body.blocks.flatMap((b) => b.section ? b.section.rows : []);
  assert.ok(rows.find((r) => r.code === '6-1000')?.values.v > 0, 'beban gaji masuk laba rugi');
  assert.ok(rows.some((r) => r.code === '7-1100' || r.code === '7-2200'), 'laba/rugi pelepasan aset tercatat');
  assertAllJournalsBalanced();
});

test('periode tertutup menolak posting', async () => {
  const p = await admin.post('/api/e/fiscal_periods', { name: '2025-12', start_date: '2025-12-01', end_date: '2025-12-31' });
  assert.equal((await osmond.post(`/api/e/fiscal_periods/${p.body.id}/actions/close`)).status, 200);
  const jkt = id('branches', 'JKT');
  const c = await admin.post('/api/e/cash_transactions', { branch_id: jkt, date: '2025-12-15', direction: 'keluar', bank_account_id: id('bank_accounts', 'KAS-JKT'), description: 'Uji periode tutup', lines: [{ account_id: acc('6-2600'), amount: 10000 }] });
  const r = await osmond.post(`/api/e/cash_transactions/${c.body.id}/actions/post`);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /ditutup/);
});

test('jurnal tidak seimbang dan akun induk ditolak; pembalikan jurnal bekerja', async () => {
  const jkt = id('branches', 'JKT');
  const j = await admin.post('/api/e/journals', { branch_id: jkt, date: '2026-10-07', description: 'Tidak seimbang', lines: [{ account_id: acc('6-2600'), debit: 100 }, { account_id: acc('1-1110'), credit: 90 }] });
  assert.equal((await admin.post(`/api/e/journals/${j.body.id}/actions/submit`)).status, 400);
  const h = await admin.post('/api/e/journals', { branch_id: jkt, date: '2026-10-07', description: 'Akun induk', lines: [{ account_id: acc('1-1100'), debit: 100 }, { account_id: acc('1-1110'), credit: 100 }] });
  assert.equal(h.status, 400);
  const posted = db.get("SELECT id FROM journals WHERE source_type = 'cash_transactions' AND status = 'diposting' AND reversal_of IS NULL LIMIT 1");
  const rv = await osmond.post(`/api/e/journals/${posted.id}/actions/reverse`, { date: '2026-10-07' });
  assert.equal(rv.status, 200);
  assert.equal((await osmond.post(`/api/e/journals/${posted.id}/actions/reverse`, { date: '2026-10-07' })).status, 400, 'tidak dapat dibalik dua kali');
  assertAllJournalsBalanced();
});

test('dasbor dihitung dari buku besar', async () => {
  const d = await admin.get(`/api/dashboard?company=${company('KNM')}`);
  assert.equal(d.status, 200);
  assert.ok(d.body.kpis.revenueYtd > 0);
  assert.equal(d.body.trend.length, 12);
  assert.ok(d.body.pending.length > 0);
});
