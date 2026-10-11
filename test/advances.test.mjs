/* Uji uang muka penjualan & pembelian (faktur uang muka atas SO/PO):
   PPN terutang saat uang muka ditagih, uang muka dilunasi seperti faktur/tagihan,
   DPP uang muka dipotongkan pada faktur/tagihan akhir (proporsional, sisa penuh pada
   penagihan terakhir), register uang muka terekonsiliasi dengan buku besar. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db, soViaQuotation } from './helpers.mjs';

let admin, osmond, rina;
const id = (table, code, field = 'code') => db.get(`SELECT id FROM ${table} WHERE ${field} = ?`, code).id;
const prod = (code) => id('products', code);
const WH = () => id('warehouses', 'WH-JKT');
const JKT = () => id('branches', 'JKT');
const gl = (code) => db.get("SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id WHERE j.status = 'diposting' AND a.code = ? AND jl.company_id = 1", code).v;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg}: ${a} ≠ ${b}`);
const ok = (r, msg = '') => assert.equal(r.status, 200, `${msg} ${JSON.stringify(r.body)}`);
const balanced = () => assert.deepEqual(db.all(`SELECT j.number FROM journals j JOIN journal_lines l ON l.parent_id = j.id WHERE j.status = 'diposting' GROUP BY j.id, l.branch_id HAVING ABS(SUM(l.debit - l.credit)) > 0.005`), [], 'jurnal seimbang per cabang');
async function reconciled() {
  for (const r of ['umur-piutang', 'umur-hutang']) {
    const x = (await admin.get(`/api/reports/${r}?to=2026-12-31`)).body;
    assert.ok(x.reconciled, `${r}: sub-buku ${x.totals.total} = buku besar ${x.glBalance}`);
  }
  for (const side of ['ar', 'ap']) {
    const x = (await admin.get(`/api/reports/uang-muka?side=${side}`)).body;
    assert.ok(x.reconciled, `register uang muka ${side}: ${x.totals.remaining} = buku besar ${x.glBalance}`);
  }
}

before(async () => {
  await start();
  admin = await as('admin');
  osmond = await as('osmond');
  rina = await as('rina.akuntan');
  await admin.put('/api/settings/security_policy', { apiRateLimitPerMinute: 100000, loginRateLimitPerMinute: 1000 });
});
after(stop);

async function approvedSo(cust, lines) {
  const so = await soViaQuotation(admin, osmond, { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', cust), warehouse_id: WH(), tax_rate: 11, lines });
  const s = await admin.post(`/api/e/sales_orders/${so.id}/actions/submit`);
  if (s.body.record.status === 'menunggu') await osmond.post(`/api/e/sales_orders/${so.id}/actions/approve`);
  return (await admin.get(`/api/e/sales_orders/${so.id}`)).body;
}
async function deliverAndInvoice(soId, qty) {
  const r = (await admin.post(`/api/e/sales_orders/${soId}/actions/to_delivery`, { date: '2026-10-07', mode: qty ? 'kosong' : 'sisa' })).body;
  let d = (await admin.get(`/api/e/delivery_orders/${r.redirect.id}`)).body;
  if (qty) d = (await admin.put(`/api/e/delivery_orders/${d.id}`, { row_version: d.row_version, lines: [{ product_id: d.lines[0].product_id, qty }] })).body;
  ok(await admin.post(`/api/e/delivery_orders/${d.id}/actions/ship`), 'kirim');
  const inv = await admin.post(`/api/e/delivery_orders/${d.id}/actions/to_invoice`);
  ok(inv, 'faktur dari DO');
  return (await admin.get(`/api/e/sales_invoices/${inv.body.redirect.id}`)).body;
}

test('uang muka penjualan: DP 30% atas SO → PPN saat ditagih → lunas → dipotong proporsional & sisa penuh pada faktur terakhir', async () => {
  const so = await approvedSo('C001', [{ product_id: prod('SV-301'), qty: 10, price: 1_000_000 }]); // DPP 10.000.000
  const ar0 = gl('1-1200'), dp0 = gl('2-1610'), vat0 = gl('2-1200'), rev0 = gl('4-1300');

  const mk = await admin.post(`/api/e/sales_orders/${so.id}/actions/to_advance`, { date: '2026-10-07', percent: 30 });
  ok(mk, 'buat uang muka dari SO');
  const advId = mk.body.redirect.id;
  let adv = (await admin.get(`/api/e/sales_advances/${advId}`)).body;
  assert.equal(adv.amount, 3_000_000); assert.equal(adv.tax, 330_000); assert.equal(adv.total, 3_330_000);
  assert.equal(adv.status, 'draf');
  // Total uang muka per SO tidak boleh melebihi DPP pesanan.
  assert.equal((await admin.post(`/api/e/sales_orders/${so.id}/actions/to_advance`, { date: '2026-10-07', percent: 80 })).status, 400);
  assert.equal((await admin.post('/api/e/sales_advances', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C002'), sales_order_id: so.id, amount: 1_000_000 })).status, 400, 'SO milik pelanggan lain');

  ok(await osmond.post(`/api/e/sales_advances/${advId}/actions/post`), 'terbitkan');
  near(gl('1-1200') - ar0, 3_330_000, 'piutang uang muka');
  near(gl('2-1610') - dp0, -3_000_000, 'uang muka penjualan (DPP)');
  near(gl('2-1200') - vat0, -330_000, 'PPN keluaran atas uang muka');
  near(gl('4-1300') - rev0, 0, 'belum ada pendapatan');
  let reg = (await admin.get('/api/reports/uang-muka?side=ar')).body;
  assert.ok(reg.rows.some((r) => r.id === advId && r.status === 'terbit'));
  const aging = (await admin.get('/api/reports/umur-piutang?to=2026-12-31')).body;
  assert.ok(aging.docs.some((x) => x.entity === 'sales_advances' && x.id === advId), 'uang muka belum dibayar tampil di umur piutang');
  await reconciled();

  // Uang muka belum lunas tidak dapat dipotong.
  const inv0 = await admin.post('/api/e/sales_invoices', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C001'), warehouse_id: WH(), tax_rate: 11, advance_id: advId, lines: [{ product_id: prod('SV-301'), qty: 1, price: 1_000_000 }] });
  assert.equal(inv0.status, 400, 'uang muka belum lunas');

  // Pelunasan sebagian lalu penuh (lewat penerimaan biasa dengan baris uang muka).
  ok(await osmond.post(`/api/e/sales_advances/${advId}/actions/receive`, { date: '2026-10-07', source: 'bank', bank_account_id: id('bank_accounts', 'BCA-JKT'), amount: 1_330_000, discount: 0, pph23: 0, bank_charge: 0 }), 'terima sebagian');
  assert.equal((await admin.get(`/api/e/sales_advances/${advId}`)).body.status, 'sebagian');
  const rc = await admin.post('/api/e/customer_receipts', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C001'), mode: 'pelunasan', bank_account_id: id('bank_accounts', 'BCA-JKT'), lines: [{ advance_id: advId, amount: 2_000_000 }] });
  ok(rc, 'penerimaan dengan baris uang muka');
  ok(await osmond.post(`/api/e/customer_receipts/${rc.body.id}/actions/post`), 'posting penerimaan');
  adv = (await admin.get(`/api/e/sales_advances/${advId}`)).body;
  assert.equal(adv.status, 'lunas'); assert.equal(adv.paid, 3_330_000);
  assert.equal((await admin.get(`/api/e/sales_orders/${so.id}`)).body.advance_dpp, 3_000_000, 'uang muka tampil di SO');

  // Kirim 4 dari 10 → faktur memotong 30% × 4.000.000 = 1.200.000; PPN atas 2.800.000.
  const f1 = await deliverAndInvoice(so.id, 4);
  assert.equal(f1.advance_id, advId); assert.equal(f1.advance_amount, 1_200_000);
  assert.equal(f1.tax, 308_000); assert.equal(f1.total, 3_108_000);
  const vat1 = gl('2-1200'), ar1 = gl('1-1200');
  ok(await osmond.post(`/api/e/sales_invoices/${f1.id}/actions/post`), 'terbitkan faktur 1');
  near(gl('2-1610') - dp0, -1_800_000, 'sisa uang muka');
  near(gl('2-1200') - vat1, -308_000, 'PPN faktur hanya atas sisa DPP');
  near(gl('1-1200') - ar1, 3_108_000, 'piutang faktur neto uang muka');
  adv = (await admin.get(`/api/e/sales_advances/${advId}`)).body;
  assert.equal(adv.applied, 1_200_000); assert.equal(adv.status, 'lunas'); assert.equal(adv.remaining, 1_800_000);
  // Penerimaan uang muka tidak dapat dibatalkan setelah dipotong.
  assert.equal((await osmond.post(`/api/e/customer_receipts/${rc.body.id}/actions/void`)).status, 409);

  // Kirim sisa 6 → faktur terakhir memotong seluruh sisa uang muka.
  const f2 = await deliverAndInvoice(so.id, 0);
  assert.equal(f2.advance_amount, 1_800_000, 'sisa penuh pada faktur terakhir');
  ok(await osmond.post(`/api/e/sales_invoices/${f2.id}/actions/post`), 'terbitkan faktur 2');
  adv = (await admin.get(`/api/e/sales_advances/${advId}`)).body;
  assert.equal(adv.status, 'diterapkan'); assert.equal(adv.remaining, 0);
  near(gl('2-1610') - dp0, 0, 'uang muka habis dipotong');
  near(gl('4-1300') - rev0, -10_000_000, 'pendapatan penuh DPP pesanan (kredit)');
  near(gl('2-1200') - vat0, -1_100_000, 'total PPN = 11% × DPP pesanan');
  reg = (await admin.get('/api/reports/uang-muka?side=ar')).body;
  assert.ok(reg.rows.some((r) => r.id === advId && r.status === 'diterapkan'));
  await reconciled();

  // Batal faktur terakhir → sisa uang muka kembali dapat dipotong.
  ok(await osmond.post(`/api/e/sales_invoices/${f2.id}/actions/void`), 'batal faktur 2');
  adv = (await admin.get(`/api/e/sales_advances/${advId}`)).body;
  assert.equal(adv.status, 'lunas'); assert.equal(adv.applied, 1_200_000);
  // SO dengan uang muka tidak dapat dibatalkan; uang muka yang sudah dibayar tidak dapat dibatalkan.
  assert.equal((await osmond.post(`/api/e/sales_advances/${advId}/actions/void`)).status, 409);
  await reconciled();
  balanced();
});

test('uang muka penjualan belum dibayar dapat dibatalkan; SO dengan uang muka tidak dapat dibatalkan', async () => {
  const so = await approvedSo('C002', [{ product_id: prod('SV-301'), qty: 2, price: 1_000_000 }]);
  const a = (await admin.post('/api/e/sales_advances', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C002'), sales_order_id: so.id, amount: 500_000 })).body;
  assert.equal(a.tax, 55_000, 'PPN mengikuti SO');
  assert.equal(a.due_date, '2026-10-07');
  ok(await osmond.post(`/api/e/sales_advances/${a.id}/actions/post`));
  assert.equal((await osmond.post(`/api/e/sales_orders/${so.id}/actions/cancel`)).status, 409);
  const sched = (await admin.get('/api/reports/angsuran?side=ar&days=60')).body;
  assert.ok(sched.rows.some((r) => r.entity === 'sales_advances' && r.doc_id === a.id), 'tampil di jadwal angsuran');
  ok(await osmond.post(`/api/e/sales_advances/${a.id}/actions/void`), 'batal uang muka');
  ok(await osmond.post(`/api/e/sales_orders/${so.id}/actions/cancel`), 'SO dapat dibatalkan');
  await reconciled();
  balanced();
});

test('uang muka pembelian: DP atas PO → pembayaran dengan SoD → tagihan memotong DP (PPN masukan atas sisa DPP)', async () => {
  const po = await rina.post('/api/e/purchase_orders', { branch_id: JKT(), date: '2026-10-07', supplier_id: id('suppliers', 'S002'), warehouse_id: WH(), tax_rate: 11, lines: [{ product_id: prod('RM-002'), qty: 100, price: 38_000 }] });
  ok(po, 'PO');
  await rina.post(`/api/e/purchase_orders/${po.body.id}/actions/submit`);
  if ((await admin.get(`/api/e/purchase_orders/${po.body.id}`)).body.status === 'menunggu') await osmond.post(`/api/e/purchase_orders/${po.body.id}/actions/approve`);
  const dp0 = gl('1-1520'), vin0 = gl('1-1400'), ap0 = gl('2-1100');
  const mk = await rina.post(`/api/e/purchase_orders/${po.body.id}/actions/to_advance`, { date: '2026-10-07', amount: 1_000_000 });
  ok(mk, 'uang muka dari PO');
  const advId = mk.body.redirect.id;
  ok(await rina.put(`/api/e/purchase_advances/${advId}`, { supplier_invoice_no: 'FUM-UJI-01' }), 'no faktur uang muka');
  ok(await osmond.post(`/api/e/purchase_advances/${advId}/actions/post`), 'posting');
  near(gl('1-1520') - dp0, 1_000_000, 'uang muka pembelian (DPP)');
  near(gl('1-1400') - vin0, 110_000, 'PPN masukan uang muka');
  near(gl('2-1100') - ap0, -1_110_000, 'hutang uang muka');
  await reconciled();

  const pay = await rina.post(`/api/e/purchase_advances/${advId}/actions/pay`, { date: '2026-10-07', source: 'bank', bank_account_id: id('bank_accounts', 'BCA-JKT'), amount: 1_110_000, discount: 0, pph23: 0, bank_charge: 0 });
  ok(pay, 'ajukan pembayaran');
  assert.equal((await rina.post(`/api/e/supplier_payments/${pay.body.redirect.id}/actions/post`)).status, 403, 'pembuat tidak boleh memposting');
  ok(await osmond.post(`/api/e/supplier_payments/${pay.body.redirect.id}/actions/post`), 'posting pembayaran');
  assert.equal((await admin.get(`/api/e/purchase_advances/${advId}`)).body.status, 'lunas');

  const tb = await rina.post(`/api/e/purchase_orders/${po.body.id}/actions/to_bill`, { supplier_invoice_no: 'F-UJI-02' });
  ok(tb, 'terima barang & tagihan');
  const bill = (await admin.get(`/api/e/purchase_bills/${tb.body.redirect.id}`)).body;
  assert.equal(bill.advance_id, advId); assert.equal(bill.advance_amount, 1_000_000);
  assert.equal(bill.tax, 308_000); assert.equal(bill.total, 3_108_000);
  const inv0 = gl('1-1340') + gl('1-1310'), vin1 = gl('1-1400'), ap1 = gl('2-1100');
  ok(await osmond.post(`/api/e/purchase_bills/${bill.id}/actions/post`), 'posting tagihan');
  near(gl('1-1340') + gl('1-1310') - inv0, 3_800_000, 'persediaan = DPP penuh');
  near(gl('1-1400') - vin1, 308_000, 'PPN masukan atas sisa DPP');
  near(gl('2-1100') - ap1, -3_108_000, 'hutang neto uang muka');
  near(gl('1-1520') - dp0, 0, 'uang muka habis dipotong');
  assert.equal((await admin.get(`/api/e/purchase_advances/${advId}`)).body.status, 'diterapkan');
  await reconciled();
  balanced();
});

test('register uang muka per sisi mengikuti hak modul', async () => {
  const sari = await as('sari.sales');
  assert.equal((await sari.get('/api/reports/uang-muka?side=ar')).status, 200);
  assert.equal((await sari.get('/api/reports/uang-muka?side=ap')).status, 403);
  const x = (await admin.get('/api/reports/uang-muka?side=ar')).body;
  assert.ok(x.rows.length > 0 && x.reconciled, 'data contoh terekonsiliasi');
});
