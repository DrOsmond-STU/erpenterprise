/* Uji deposit pelanggan: saldo prabayar (dipakai melunasi faktur dari deposit maupun dari faktur,
   dikembalikan) dan uang jaminan (dikompensasikan, dicairkan sebagai ganti rugi), register
   terekonsiliasi dengan akun 2-1620 / 2-1630, serta pembatalan yang aman; dan deposit di pemasok
   (dibayar dengan persetujuan SoD, dipakai membayar tagihan, diterima kembali, jaminan hangus)
   terekonsiliasi dengan akun 1-1530 / 1-1540. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db } from './helpers.mjs';

let admin, osmond, sari;
const id = (table, code, field = 'code') => db.get(`SELECT id FROM ${table} WHERE ${field} = ?`, code).id;
const JKT = () => id('branches', 'JKT');
const BCA = () => id('bank_accounts', 'BCA-JKT');
const gl = (code) => db.get("SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id WHERE j.status = 'diposting' AND a.code = ? AND jl.company_id = 1", code).v;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg}: ${a} ≠ ${b}`);
const ok = (r, msg = '') => { assert.equal(r.status, 200, `${msg} ${JSON.stringify(r.body)}`); return r.body; };
const balanced = () => assert.deepEqual(db.all(`SELECT j.number FROM journals j JOIN journal_lines l ON l.parent_id = j.id WHERE j.status = 'diposting' GROUP BY j.id, l.branch_id HAVING ABS(SUM(l.debit - l.credit)) > 0.005`), [], 'jurnal seimbang per cabang');
async function reconciled() {
  const d = (await admin.get('/api/reports/deposit')).body;
  assert.ok(d.reconciled, `register deposit: 2-1620 ${d.glSaldo}, 2-1630 ${d.glJaminan}`);
  const x = (await admin.get('/api/reports/umur-piutang?to=2026-12-31')).body;
  assert.ok(x.reconciled, `umur piutang ${x.totals.total} = buku besar ${x.glBalance}`);
}

before(async () => {
  await start();
  admin = await as('admin');
  osmond = await as('osmond');
  sari = await as('sari.sales');
  await admin.put('/api/settings/security_policy', { apiRateLimitPerMinute: 100000, loginRateLimitPerMinute: 1000 });
});
after(stop);

async function invoice(cust, qty) {
  const r = ok(await admin.post('/api/e/sales_invoices', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', cust), warehouse_id: id('warehouses', 'WH-JKT'), tax_rate: 11, lines: [{ product_id: id('products', 'SV-301'), qty, price: 1_000_000 }] }));
  ok(await osmond.post(`/api/e/sales_invoices/${r.id}/actions/post`));
  return (await admin.get(`/api/e/sales_invoices/${r.id}`)).body;
}
async function deposit(cust, kind, amount, extra = {}) {
  const d = ok(await admin.post('/api/e/customer_deposits', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', cust), kind, bank_account_id: BCA(), amount, ...extra }), 'deposit');
  ok(await osmond.post(`/api/e/customer_deposits/${d.id}/actions/post`), 'posting deposit');
  return (await admin.get(`/api/e/customer_deposits/${d.id}`)).body;
}

test('deposit saldo: diterima → dipakai melunasi faktur (dari deposit & dari faktur) → dikembalikan → habis', async () => {
  const bank0 = gl('1-1130'), dep0 = gl('2-1620'), ar0 = gl('1-1200');
  const d = await deposit('C002', 'saldo', 10_000_000, { reference: 'Top-up uji' });
  assert.equal(d.status, 'diterima'); assert.equal(d.remaining, 10_000_000);
  near(gl('1-1130') - bank0, 10_000_000, 'kas masuk');
  near(gl('2-1620') - dep0, -10_000_000, 'liabilitas deposit');
  assert.equal((await admin.get(`/api/e/customers/${id('customers', 'C002')}`)).body.deposit_balance >= 10_000_000, true, 'saldo deposit pada pelanggan');
  await reconciled();

  // Pakai dari deposit: faktur 3.330.000 dilunasi penuh.
  const inv1 = await invoice('C002', 3);
  const a = ok(await osmond.post(`/api/e/customer_deposits/${d.id}/actions/apply`, { date: '2026-10-07', invoice_id: inv1.id, amount: 3_330_000 }), 'pakai deposit');
  assert.match(a.message, /Faktur lunas/);
  assert.equal(a.record.status, 'terpakai'); assert.equal(a.record.used, 3_330_000);
  assert.equal((await admin.get(`/api/e/sales_invoices/${inv1.id}`)).body.status, 'lunas');
  near(gl('1-1200') - ar0, 0, 'piutang faktur lunas lewat deposit');
  near(gl('1-1130') - bank0, 10_000_000, 'kas tidak berubah saat deposit dipakai');
  // Faktur pelanggan lain ditolak; melebihi saldo ditolak.
  const other = await invoice('C001', 1);
  assert.equal((await osmond.post(`/api/e/customer_deposits/${d.id}/actions/apply`, { date: '2026-10-07', invoice_id: other.id, amount: 1_000 })).status, 400);
  const inv2 = await invoice('C002', 8); // 8.880.000 > sisa deposit 6.670.000
  assert.equal((await osmond.post(`/api/e/customer_deposits/${d.id}/actions/apply`, { date: '2026-10-07', invoice_id: inv2.id, amount: 8_880_000 })).status, 400, 'melebihi saldo deposit');

  // Pakai dari faktur: sumber dana "Deposit pelanggan" (deposit tertua otomatis), sebagian.
  const rc = ok(await osmond.post(`/api/e/sales_invoices/${inv2.id}/actions/receive`, { date: '2026-10-07', source: 'deposit', amount: 5_000_000, discount: 0, pph23: 0, bank_charge: 0 }), 'terima dari deposit');
  assert.equal(rc.record.status, 'sebagian');
  const rcp = db.get("SELECT id, mode, deposit_id, bank_account_id FROM customer_receipts WHERE deposit_id = ? ORDER BY id DESC LIMIT 1", d.id);
  assert.equal(rcp.mode, 'pakai_deposit'); assert.equal(rcp.bank_account_id, null);
  let dd = (await admin.get(`/api/e/customer_deposits/${d.id}`)).body;
  assert.equal(dd.remaining, 1_670_000);
  const hist = (await admin.get(`/api/deposit-history/customer_deposits/${d.id}`)).body;
  assert.equal(hist.receipts.length, 2);
  assert.ok(hist.receipts.some((x) => x.docs === inv2.number));
  // Deposit yang sudah dipakai tidak dapat dibatalkan; batal penerimaan mengembalikan saldo.
  assert.equal((await osmond.post(`/api/e/customer_deposits/${d.id}/actions/void`)).status, 409);
  ok(await osmond.post(`/api/e/customer_receipts/${rcp.id}/actions/void`), 'batal pemakaian');
  dd = (await admin.get(`/api/e/customer_deposits/${d.id}`)).body;
  assert.equal(dd.remaining, 6_670_000); assert.equal(dd.status, 'terpakai');
  await reconciled();

  // Kembalikan seluruh sisa + biaya transfer → habis.
  const bank1 = gl('1-1130');
  ok(await osmond.post(`/api/e/customer_deposits/${d.id}/actions/refund`, { date: '2026-10-07', bank_account_id: BCA(), amount: 6_670_000, bank_charge: 6_500 }), 'pengembalian');
  near(gl('1-1130') - bank1, -6_676_500, 'kas keluar termasuk biaya transfer');
  dd = (await admin.get(`/api/e/customer_deposits/${d.id}`)).body;
  assert.equal(dd.status, 'habis'); assert.equal(dd.remaining, 0);
  assert.equal((await osmond.post(`/api/e/customer_deposits/${d.id}/actions/refund`, { date: '2026-10-07', bank_account_id: BCA(), amount: 1 })).status, 409, 'tidak ada aksi pada deposit habis');
  near(gl('2-1620') - dep0, 0, 'deposit habis');
  assert.equal((await admin.get(`/api/deposit-history/customer_deposits/${d.id}`)).body.journals.length, 1);
  await reconciled();
  balanced();
});

test('uang jaminan: dikompensasikan ke faktur, dicairkan sebagai ganti rugi (hanya jaminan), register & jatuh tempo', async () => {
  const comp0 = gl('7-1400'), jam0 = gl('2-1630');
  const d = await deposit('C008', 'jaminan', 5_000_000, { reference: 'Pinjam palet', return_date: '2026-10-20' });
  assert.equal((await admin.post('/api/e/customer_deposits', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C008'), kind: 'jaminan', bank_account_id: BCA(), amount: 1, return_date: '2026-01-01' })).status, 400, 'jatuh tempo sebelum tanggal');
  near(gl('2-1630') - jam0, -5_000_000, 'uang jaminan (liabilitas)');
  let reg = (await admin.get('/api/reports/deposit?to=2026-10-07')).body;
  assert.ok(reg.rows.some((x) => x.id === d.id && x.daysToReturn === 13));
  assert.ok(reg.totals.dueSoonCount >= 1, 'jaminan jatuh tempo ≤ 30 hari');
  // Cairkan 1.500.000 sebagai ganti rugi.
  ok(await osmond.post(`/api/e/customer_deposits/${d.id}/actions/forfeit`, { date: '2026-10-07', amount: 1_500_000, reason: 'Palet rusak' }), 'cairkan');
  near(gl('7-1400') - comp0, -1_500_000, 'pendapatan kompensasi');
  // Kompensasikan sisa ke faktur terbuka.
  const inv = await invoice('C008', 2); // 2.220.000
  ok(await osmond.post(`/api/e/customer_deposits/${d.id}/actions/apply`, { date: '2026-10-07', invoice_id: inv.id, amount: 2_220_000 }), 'kompensasi faktur');
  const dd = (await admin.get(`/api/e/customer_deposits/${d.id}`)).body;
  assert.equal(dd.remaining, 1_280_000); assert.equal(dd.forfeited, 1_500_000); assert.equal(dd.used, 2_220_000);
  near(gl('2-1630') - jam0, -1_280_000, 'sisa jaminan');
  await reconciled();
  // Deposit saldo tidak punya aksi pencairan.
  const s = await deposit('C008', 'saldo', 1_000_000);
  assert.ok(!s.__actions.some((a) => a.name === 'forfeit'));
  assert.equal((await osmond.post(`/api/e/customer_deposits/${s.id}/actions/forfeit`, { date: '2026-10-07', amount: 1, reason: 'x' })).status, 409);
  // Deposit belum dipakai dapat dibatalkan.
  ok(await osmond.post(`/api/e/customer_deposits/${s.id}/actions/void`), 'batal deposit');
  reg = (await admin.get('/api/reports/deposit')).body;
  assert.ok(!reg.rows.some((x) => x.id === s.id));
  await reconciled();
  balanced();
});

test('register deposit dapat dibaca bagian penjualan; data contoh terekonsiliasi', async () => {
  const r = await sari.get('/api/reports/deposit');
  assert.equal(r.status, 200);
  assert.ok(r.body.rows.length >= 4 && r.body.reconciled);
  assert.ok(r.body.totals.saldo > 0 && r.body.totals.jaminan > 0);
});

/* --- Deposit di pemasok (aset) -------------------------------------------------------- */
async function supplierDeposit(rina, sup, kind, amount, extra = {}) {
  const d = ok(await rina.post('/api/e/supplier_deposits', { branch_id: JKT(), date: '2026-10-07', supplier_id: id('suppliers', sup), kind, bank_account_id: BCA(), amount, ...extra }), 'deposit pemasok');
  ok(await rina.post(`/api/e/supplier_deposits/${d.id}/actions/submit`), 'ajukan');
  assert.equal((await rina.post(`/api/e/supplier_deposits/${d.id}/actions/approve`)).status, 403, 'pembuat tidak boleh menyetujui');
  ok(await osmond.post(`/api/e/supplier_deposits/${d.id}/actions/approve`), 'setujui & bayar');
  return (await admin.get(`/api/e/supplier_deposits/${d.id}`)).body;
}
async function bill(rina, sup, amount) {
  const b = ok(await rina.post('/api/e/purchase_bills', { branch_id: JKT(), date: '2026-10-07', supplier_id: id('suppliers', sup), supplier_invoice_no: `UJI-DEP-${amount}`, tax_rate: 11, lines: [{ account_id: id('accounts', '6-2900'), qty: 1, price: amount }] }));
  ok(await osmond.post(`/api/e/purchase_bills/${b.id}/actions/post`));
  return (await admin.get(`/api/e/purchase_bills/${b.id}`)).body;
}
async function reconciledAp() {
  const d = (await admin.get('/api/reports/deposit?side=ap')).body;
  assert.ok(d.reconciled, `register deposit pemasok: 1-1530 ${d.glSaldo}, 1-1540 ${d.glJaminan}`);
  const x = (await admin.get('/api/reports/umur-hutang?to=2026-12-31')).body;
  assert.ok(x.reconciled, `umur hutang ${x.totals.total} = buku besar ${x.glBalance}`);
}

test('deposit di pemasok: dibayar dengan SoD → dipakai membayar tagihan (persetujuan) → diterima kembali → habis', async () => {
  const rina = await as('rina.akuntan');
  const bank0 = gl('1-1130'), dep0 = gl('1-1530'), ap0 = gl('2-1100');
  const d = await supplierDeposit(rina, 'S002', 'saldo', 6_000_000, { reference: 'Top-up uji' });
  assert.equal(d.status, 'dibayar'); assert.match(d.approval_note, /Disetujui/);
  near(gl('1-1130') - bank0, -6_000_000, 'kas keluar');
  near(gl('1-1530') - dep0, 6_000_000, 'aset deposit');
  assert.ok((await admin.get(`/api/e/suppliers/${id('suppliers', 'S002')}`)).body.deposit_balance >= 6_000_000);
  await reconciledAp();

  // Pakai dari deposit → pembayaran diajukan (SoD) → diposting penyetuju.
  const b1 = await bill(rina, 'S002', 2_000_000); // 2.220.000
  const a = ok(await rina.post(`/api/e/supplier_deposits/${d.id}/actions/apply`, { date: '2026-10-07', bill_id: b1.id, amount: 2_220_000 }), 'pakai deposit');
  assert.equal(a.redirect.entity, 'supplier_payments');
  assert.equal((await admin.get(`/api/e/supplier_deposits/${d.id}`)).body.used, 0, 'belum terpakai sebelum disetujui');
  assert.equal((await rina.post(`/api/e/supplier_payments/${a.redirect.id}/actions/post`)).status, 403);
  ok(await osmond.post(`/api/e/supplier_payments/${a.redirect.id}/actions/post`), 'posting pembayaran');
  assert.equal((await admin.get(`/api/e/purchase_bills/${b1.id}`)).body.status, 'lunas');
  let dd = (await admin.get(`/api/e/supplier_deposits/${d.id}`)).body;
  assert.equal(dd.status, 'terpakai'); assert.equal(dd.used, 2_220_000);
  near(gl('2-1100') - ap0, 0, 'hutang tagihan lunas lewat deposit');
  near(gl('1-1130') - bank0, -6_000_000, 'kas tidak berubah saat deposit dipakai');

  // Dari tagihan: sumber dana "Deposit di pemasok" (deposit tertua otomatis).
  const b2 = await bill(rina, 'S002', 1_000_000); // 1.110.000
  const p2 = ok(await rina.post(`/api/e/purchase_bills/${b2.id}/actions/pay`, { date: '2026-10-07', source: 'deposit', amount: 1_110_000, discount: 0, pph23: 0, bank_charge: 0 }));
  ok(await osmond.post(`/api/e/supplier_payments/${p2.redirect.id}/actions/post`));
  const pay = db.get('SELECT mode, deposit_id, bank_account_id FROM supplier_payments WHERE id = ?', p2.redirect.id);
  assert.equal(pay.mode, 'pakai_deposit'); assert.ok(pay.deposit_id); assert.equal(pay.bank_account_id, null);
  const hist = (await admin.get(`/api/deposit-history/supplier_deposits/${pay.deposit_id}`)).body;
  assert.ok(hist.receipts.length >= 1);
  // Melebihi saldo ditolak saat pengajuan.
  const b3 = await bill(rina, 'S002', 9_000_000);
  assert.equal((await rina.post(`/api/e/supplier_deposits/${d.id}/actions/apply`, { date: '2026-10-07', bill_id: b3.id, amount: 9_990_000 })).status, 400);
  // Batal pembayaran mengembalikan saldo deposit.
  ok(await osmond.post(`/api/e/supplier_payments/${a.redirect.id}/actions/void`), 'batal pemakaian');
  dd = (await admin.get(`/api/e/supplier_deposits/${d.id}`)).body;
  const rem = dd.remaining;
  assert.equal(dd.used, pay.deposit_id === d.id ? 1_110_000 : 0);
  await reconciledAp();

  // Pemasok mengembalikan sisa (dipotong biaya bank) → habis.
  const bank1 = gl('1-1130');
  ok(await osmond.post(`/api/e/supplier_deposits/${d.id}/actions/refund`, { date: '2026-10-07', bank_account_id: BCA(), amount: rem, bank_charge: 5_000 }), 'terima kembali');
  near(gl('1-1130') - bank1, rem - 5_000, 'kas masuk neto biaya bank');
  dd = (await admin.get(`/api/e/supplier_deposits/${d.id}`)).body;
  assert.equal(dd.status, 'habis'); assert.equal(dd.remaining, 0);
  assert.equal((await admin.get(`/api/deposit-history/supplier_deposits/${d.id}`)).body.journals.length, 1);
  await reconciledAp();
  balanced();
});

test('uang jaminan di pemasok: ditolak lalu diajukan ulang, dihanguskan sebagian sebagai beban, tidak dapat dibatalkan setelah dipakai', async () => {
  const rina = await as('rina.akuntan');
  const d0 = ok(await rina.post('/api/e/supplier_deposits', { branch_id: JKT(), date: '2026-10-07', supplier_id: id('suppliers', 'S004'), kind: 'jaminan', bank_account_id: BCA(), amount: 4_000_000, return_date: '2026-11-01' }));
  ok(await rina.post(`/api/e/supplier_deposits/${d0.id}/actions/submit`));
  ok(await osmond.post(`/api/e/supplier_deposits/${d0.id}/actions/reject`, { reason: 'Lampirkan kontrak sewa' }));
  assert.equal((await admin.get(`/api/e/supplier_deposits/${d0.id}`)).body.status, 'ditolak');
  const exp0 = gl('7-2400'), jam0 = gl('1-1540');
  ok(await rina.post(`/api/e/supplier_deposits/${d0.id}/actions/submit`), 'ajukan ulang');
  ok(await osmond.post(`/api/e/supplier_deposits/${d0.id}/actions/approve`));
  near(gl('1-1540') - jam0, 4_000_000, 'uang jaminan dibayar (aset)');
  const reg = (await admin.get('/api/reports/deposit?side=ap&to=2026-10-07')).body;
  assert.ok(reg.rows.some((x) => x.id === d0.id && x.daysToReturn === 25) && reg.totals.dueSoonCount >= 1);
  ok(await osmond.post(`/api/e/supplier_deposits/${d0.id}/actions/forfeit`, { date: '2026-10-07', amount: 1_000_000, reason: 'Kontainer rusak' }), 'hangus');
  near(gl('7-2400') - exp0, 1_000_000, 'beban jaminan hangus');
  near(gl('1-1540') - jam0, 3_000_000, 'sisa jaminan');
  assert.equal((await osmond.post(`/api/e/supplier_deposits/${d0.id}/actions/void`)).status, 409, 'tidak dapat dibatalkan setelah hangus sebagian');
  const s = await supplierDeposit(rina, 'S004', 'saldo', 500_000);
  assert.ok(!s.__actions.some((a) => a.name === 'forfeit'), 'deposit saldo tidak dapat dihanguskan');
  ok(await osmond.post(`/api/e/supplier_deposits/${s.id}/actions/void`), 'batal deposit saldo');
  await reconciledAp();
  balanced();
  const sari = await as('sari.sales');
  assert.equal((await sari.get('/api/reports/deposit?side=ap')).status, 403, 'register pemasok mengikuti hak pembelian');
});
