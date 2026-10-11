/* Uji deposit pelanggan: saldo prabayar (dipakai melunasi faktur dari deposit maupun dari faktur,
   dikembalikan) dan uang jaminan (dikompensasikan, dicairkan sebagai ganti rugi), register
   terekonsiliasi dengan akun 2-1620 / 2-1630, serta pembatalan yang aman. */
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
  const hist = (await admin.get(`/api/deposit-history/${d.id}`)).body;
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
  assert.equal((await admin.get(`/api/deposit-history/${d.id}`)).body.journals.length, 1);
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
