/* Uji retur penjualan atas faktur yang memotong uang muka:
   (1) bagian uang muka dipulihkan ke dokumen uang muka (PPN nota retur hanya atas sisa DPP) lalu
       dipotong lagi pada faktur pengganti; (2) bagian uang muka menjadi saldo kredit pelanggan pada
       faktur yang sudah lunas; (3) kelebihan retur atas faktur lunas dikembalikan lewat rekening;
   serta padanannya untuk retur pembelian atas tagihan yang memotong uang muka pembelian. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db, soViaQuotation } from './helpers.mjs';

let admin, osmond;
const id = (table, code, field = 'code') => db.get(`SELECT id FROM ${table} WHERE ${field} = ?`, code).id;
const prod = (code) => id('products', code);
const WH = () => id('warehouses', 'WH-JKT');
const JKT = () => id('branches', 'JKT');
const BCA = () => id('bank_accounts', 'BCA-JKT');
const gl = (code) => db.get("SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id WHERE j.status = 'diposting' AND a.code = ? AND jl.company_id = 1", code).v;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg}: ${a} ≠ ${b}`);
const ok = (r, msg = '') => { assert.equal(r.status, 200, `${msg} ${JSON.stringify(r.body)}`); return r.body; };
const balanced = () => assert.deepEqual(db.all(`SELECT j.number FROM journals j JOIN journal_lines l ON l.parent_id = j.id WHERE j.status = 'diposting' GROUP BY j.id, l.branch_id HAVING ABS(SUM(l.debit - l.credit)) > 0.005`), [], 'jurnal seimbang per cabang');
async function reconciled() {
  const x = (await admin.get('/api/reports/umur-piutang?to=2026-12-31')).body;
  assert.ok(x.reconciled, `umur piutang ${x.totals.total} = buku besar ${x.glBalance}`);
  const u = (await admin.get('/api/reports/uang-muka?side=ar')).body;
  assert.ok(u.reconciled, `register uang muka ${u.totals.remaining} = buku besar ${u.glBalance}`);
}

before(async () => {
  await start();
  admin = await as('admin');
  osmond = await as('osmond');
  await admin.put('/api/settings/security_policy', { apiRateLimitPerMinute: 100000, loginRateLimitPerMinute: 1000 });
});
after(stop);

/** SO jasa 10 × 1.000.000 → uang muka 30% lunas → kirim penuh → faktur akhir memotong 3.000.000 → terbit. */
async function invoiceWithAdvance(cust) {
  const so = await soViaQuotation(admin, osmond, { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', cust), warehouse_id: WH(), tax_rate: 11, lines: [{ product_id: prod('SV-301'), qty: 10, price: 1_000_000 }] });
  const s = await admin.post(`/api/e/sales_orders/${so.id}/actions/submit`);
  if (s.body.record.status === 'menunggu') await osmond.post(`/api/e/sales_orders/${so.id}/actions/approve`);
  const advId = ok(await admin.post(`/api/e/sales_orders/${so.id}/actions/to_advance`, { date: '2026-10-07', percent: 30 })).redirect.id;
  ok(await osmond.post(`/api/e/sales_advances/${advId}/actions/post`));
  ok(await osmond.post(`/api/e/sales_advances/${advId}/actions/receive`, { date: '2026-10-07', source: 'bank', bank_account_id: BCA(), amount: 3_330_000, discount: 0, pph23: 0, bank_charge: 0 }));
  const doId = ok(await admin.post(`/api/e/sales_orders/${so.id}/actions/to_delivery`, { date: '2026-10-07', mode: 'sisa' })).redirect.id;
  ok(await admin.post(`/api/e/delivery_orders/${doId}/actions/ship`));
  const invId = ok(await admin.post(`/api/e/delivery_orders/${doId}/actions/to_invoice`)).redirect.id;
  ok(await osmond.post(`/api/e/sales_invoices/${invId}/actions/post`));
  const inv = (await admin.get(`/api/e/sales_invoices/${invId}`)).body;
  assert.equal(inv.advance_amount, 3_000_000); assert.equal(inv.total, 7_770_000);
  return { inv, advId };
}
const newReturn = (inv, qty, extra = {}) => admin.post('/api/e/sales_returns', { branch_id: JKT(), date: '2026-10-07', sales_invoice_id: inv.id, warehouse_id: WH(), reason: 'Uji retur', lines: [{ product_id: prod('SV-301'), qty }], ...extra });

test('retur atas faktur dengan uang muka: DPP uang muka dipulihkan, PPN nota retur atas sisa DPP, dipotong lagi pada faktur pengganti', async () => {
  const { inv, advId } = await invoiceWithAdvance('C003');
  assert.equal((await admin.get(`/api/e/sales_advances/${advId}`)).body.status, 'diterapkan');
  const dp0 = gl('2-1610'), vat0 = gl('2-1200'), ar0 = gl('1-1200'), ret0 = gl('4-1900');

  const r = ok(await newReturn(inv, 2), 'draf retur');
  assert.equal(r.advance_mode, 'pulihkan');
  assert.equal(r.advance_part, 600_000); assert.equal(r.advance_amount, 600_000);
  assert.equal(r.tax, 154_000, 'PPN atas DPP 1.400.000'); assert.equal(r.total, 1_554_000);
  const posted = ok(await osmond.post(`/api/e/sales_returns/${r.id}/actions/post`), 'posting retur');
  assert.match(posted.message, /dipulihkan ke uang muka/);
  assert.equal(posted.record.to_invoice, 1_554_000); assert.equal(posted.record.to_credit, 0);
  near(gl('4-1900') - ret0, 2_000_000, 'retur penjualan = DPP penuh');
  near(gl('2-1200') - vat0, 154_000, 'PPN keluaran dikoreksi atas sisa DPP');
  near(gl('2-1610') - dp0, -600_000, 'uang muka penjualan dipulihkan');
  near(gl('1-1200') - ar0, -1_554_000, 'piutang faktur berkurang');
  let adv = (await admin.get(`/api/e/sales_advances/${advId}`)).body;
  assert.equal(adv.status, 'lunas'); assert.equal(adv.remaining, 600_000);
  assert.equal((await admin.get(`/api/e/sales_invoices/${inv.id}`)).body.paid, 1_554_000);
  const st = (await admin.get(`/api/settlement/sales_advances/${advId}`)).body;
  assert.ok(st.applications.some((x) => x.entity === 'sales_returns' && x.advance_amount === -600_000), 'retur tampil di rincian uang muka');
  assert.equal((await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/void`)).status, 409, 'faktur dengan retur tidak dapat dibatalkan');
  await reconciled();

  // Faktur pengganti memotong lagi uang muka yang dipulihkan.
  const rep = ok(await admin.post('/api/e/sales_invoices', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C003'), warehouse_id: WH(), tax_rate: 11, advance_id: advId, lines: [{ product_id: prod('SV-301'), qty: 2, price: 1_000_000 }] }), 'faktur pengganti');
  assert.equal(rep.advance_amount, 600_000); assert.equal(rep.total, 1_554_000);
  ok(await osmond.post(`/api/e/sales_invoices/${rep.id}/actions/post`));
  adv = (await admin.get(`/api/e/sales_advances/${advId}`)).body;
  assert.equal(adv.status, 'diterapkan');
  near(gl('2-1610') - dp0, 0, 'uang muka habis lagi');
  // Retur tidak dapat dibatalkan selama uang muka yang dipulihkan sudah dipakai lagi.
  assert.equal((await osmond.post(`/api/e/sales_returns/${r.id}/actions/void`)).status, 409);
  ok(await osmond.post(`/api/e/sales_invoices/${rep.id}/actions/void`), 'batal faktur pengganti');
  ok(await osmond.post(`/api/e/sales_returns/${r.id}/actions/void`), 'batal retur');
  adv = (await admin.get(`/api/e/sales_advances/${advId}`)).body;
  assert.equal(adv.status, 'diterapkan'); assert.equal(adv.applied, 3_000_000);
  assert.equal((await admin.get(`/api/e/sales_invoices/${inv.id}`)).body.paid, 0);
  near(gl('2-1610') - dp0, 0, 'kembali seperti semula');
  await reconciled();
  balanced();
});

test('retur faktur lunas dengan uang muka, mode saldo: seluruh nilai + PPN menjadi saldo kredit pelanggan', async () => {
  const { inv } = await invoiceWithAdvance('C001');
  ok(await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/receive`, { date: '2026-10-07', source: 'bank', bank_account_id: BCA(), amount: inv.total, discount: 0, pph23: 0, bank_charge: 0 }));
  assert.equal((await admin.get(`/api/e/sales_invoices/${inv.id}`)).body.status, 'lunas');
  const cust = id('customers', 'C001');
  const bal0 = (await admin.get(`/api/advance/customer/${cust}`)).body.balance, vat0 = gl('2-1200'), dp0 = gl('2-1610');
  const r = ok(await newReturn(inv, 1, { advance_mode: 'saldo' }), 'draf retur saldo');
  assert.equal(r.advance_part, 300_000); assert.equal(r.advance_amount, 0);
  assert.equal(r.tax, 110_000); assert.equal(r.total, 1_110_000);
  const p = ok(await osmond.post(`/api/e/sales_returns/${r.id}/actions/post`), 'posting');
  assert.equal(p.record.to_invoice, 0, 'faktur sudah lunas'); assert.equal(p.record.to_credit, 1_110_000);
  assert.equal((await admin.get(`/api/advance/customer/${cust}`)).body.balance, bal0 + 1_110_000);
  near(gl('2-1200') - vat0, 110_000, 'PPN dikoreksi atas seluruh DPP retur');
  near(gl('2-1610') - dp0, 0, 'uang muka faktur tidak berubah');
  // Bagian uang muka faktur tidak dapat diretur melebihi potongannya.
  const r2 = ok(await newReturn(inv, 9), 'retur sisa');
  assert.equal(r2.advance_part, 2_700_000);
  ok(await osmond.post(`/api/e/sales_returns/${r.id}/actions/void`), 'batal retur saldo');
  assert.equal((await admin.get(`/api/advance/customer/${cust}`)).body.balance, bal0);
  await reconciled();
  balanced();
});

test('retur faktur lunas tanpa uang muka: kelebihan dikembalikan lewat rekening bank', async () => {
  const r0 = ok(await admin.post('/api/e/sales_invoices', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C002'), warehouse_id: WH(), tax_rate: 11, lines: [{ product_id: prod('SV-301'), qty: 3, price: 1_000_000 }] }));
  ok(await osmond.post(`/api/e/sales_invoices/${r0.id}/actions/post`));
  ok(await osmond.post(`/api/e/sales_invoices/${r0.id}/actions/receive`, { date: '2026-10-07', source: 'bank', bank_account_id: BCA(), amount: 2_000_000, discount: 0, pph23: 0, bank_charge: 0 }));
  const inv = (await admin.get(`/api/e/sales_invoices/${r0.id}`)).body; // sisa 1.330.000
  const bank0 = gl('1-1130');
  const r = ok(await newReturn(inv, 2, { refund_bank_id: BCA() }));
  assert.equal(r.total, 2_220_000); assert.equal(r.advance_part, 0);
  const p = ok(await osmond.post(`/api/e/sales_returns/${r.id}/actions/post`));
  assert.equal(p.record.to_invoice, 1_330_000, 'melunasi sisa faktur'); assert.equal(p.record.to_credit, 890_000);
  assert.match(p.message, /dikembalikan/);
  near(gl('1-1130') - bank0, -890_000, 'dana dikembalikan dari bank');
  assert.equal((await admin.get(`/api/e/sales_invoices/${inv.id}`)).body.status, 'lunas');
  ok(await osmond.post(`/api/e/sales_returns/${r.id}/actions/void`), 'batal retur');
  near(gl('1-1130') - bank0, 0, 'bank kembali');
  assert.equal((await admin.get(`/api/e/sales_invoices/${inv.id}`)).body.paid, 2_000_000);
  await reconciled();
  balanced();
});

/* --- Retur pembelian atas tagihan yang memotong uang muka ------------------------------- */
/** PO RM-002 100 × 38.000 → uang muka 1.000.000 dibayar (SoD) → tagihan memotong 1.000.000 → posting. */
async function billWithAdvance() {
  const rina = await as('rina.akuntan');
  const po = ok(await rina.post('/api/e/purchase_orders', { branch_id: JKT(), date: '2026-10-07', supplier_id: id('suppliers', 'S002'), warehouse_id: WH(), tax_rate: 11, lines: [{ product_id: prod('RM-002'), qty: 100, price: 38_000 }] }));
  await rina.post(`/api/e/purchase_orders/${po.id}/actions/submit`);
  if ((await admin.get(`/api/e/purchase_orders/${po.id}`)).body.status === 'menunggu') await osmond.post(`/api/e/purchase_orders/${po.id}/actions/approve`);
  const advId = ok(await rina.post(`/api/e/purchase_orders/${po.id}/actions/to_advance`, { date: '2026-10-07', amount: 1_000_000 })).redirect.id;
  ok(await osmond.post(`/api/e/purchase_advances/${advId}/actions/post`));
  const pay = ok(await rina.post(`/api/e/purchase_advances/${advId}/actions/pay`, { date: '2026-10-07', source: 'bank', bank_account_id: BCA(), amount: 1_110_000, discount: 0, pph23: 0, bank_charge: 0 }));
  ok(await osmond.post(`/api/e/supplier_payments/${pay.redirect.id}/actions/post`));
  const billId = ok(await rina.post(`/api/e/purchase_orders/${po.id}/actions/to_bill`, { supplier_invoice_no: `F-RET-${po.id}` })).redirect.id;
  ok(await osmond.post(`/api/e/purchase_bills/${billId}/actions/post`));
  const bill = (await admin.get(`/api/e/purchase_bills/${billId}`)).body;
  assert.equal(bill.advance_amount, 1_000_000); assert.equal(bill.total, 3_108_000);
  return { bill, advId, rina };
}
const newPurchaseReturn = (bill, qty, extra = {}) => admin.post('/api/e/purchase_returns', { branch_id: JKT(), date: '2026-10-07', purchase_bill_id: bill.id, warehouse_id: WH(), reason: 'Uji retur pembelian', lines: [{ product_id: prod('RM-002'), qty }], ...extra });
async function reconciledAp() {
  const x = (await admin.get('/api/reports/umur-hutang?to=2026-12-31')).body;
  assert.ok(x.reconciled, `umur hutang ${x.totals.total} = buku besar ${x.glBalance}`);
  const u = (await admin.get('/api/reports/uang-muka?side=ap')).body;
  assert.ok(u.reconciled, `register uang muka pembelian ${u.totals.remaining} = buku besar ${u.glBalance}`);
}

test('retur pembelian atas tagihan dengan uang muka: DPP uang muka dipulihkan, PPN masukan dikoreksi atas sisa DPP', async () => {
  const { bill, advId } = await billWithAdvance();
  assert.equal((await admin.get(`/api/e/purchase_advances/${advId}`)).body.status, 'diterapkan');
  const dp0 = gl('1-1520'), vin0 = gl('1-1400'), ap0 = gl('2-1100');
  const r = ok(await newPurchaseReturn(bill, 20), 'draf retur');
  assert.equal(r.advance_part, 200_000); assert.equal(r.advance_amount, 200_000);
  assert.equal(r.tax, 61_600); assert.equal(r.total, 621_600);
  const p = ok(await osmond.post(`/api/e/purchase_returns/${r.id}/actions/post`), 'posting');
  assert.equal(p.record.to_invoice, 621_600); assert.equal(p.record.to_credit, 0);
  assert.match(p.message, /dipulihkan ke uang muka/);
  near(gl('1-1520') - dp0, 200_000, 'uang muka pembelian dipulihkan');
  near(gl('1-1400') - vin0, -61_600, 'PPN masukan dikoreksi atas sisa DPP');
  near(gl('2-1100') - ap0, 621_600, 'hutang tagihan berkurang');
  const adv = (await admin.get(`/api/e/purchase_advances/${advId}`)).body;
  assert.equal(adv.status, 'lunas'); assert.equal(adv.remaining, 200_000);
  const st = (await admin.get(`/api/settlement/purchase_advances/${advId}`)).body;
  assert.ok(st.applications.some((x) => x.entity === 'purchase_returns' && x.advance_amount === -200_000));
  assert.equal((await osmond.post(`/api/e/purchase_bills/${bill.id}/actions/void`)).status, 409, 'tagihan dengan retur tidak dapat dibatalkan');
  await reconciledAp();
  ok(await osmond.post(`/api/e/purchase_returns/${r.id}/actions/void`), 'batal retur');
  assert.equal((await admin.get(`/api/e/purchase_advances/${advId}`)).body.status, 'diterapkan');
  near(gl('1-1520') - dp0, 0, 'kembali');
  await reconciledAp();
  balanced();
});

test('retur pembelian atas tagihan lunas, mode saldo: nilai + PPN menjadi saldo uang muka ke pemasok', async () => {
  const { bill, rina } = await billWithAdvance();
  const pay = ok(await rina.post(`/api/e/purchase_bills/${bill.id}/actions/pay`, { date: '2026-10-07', source: 'bank', bank_account_id: BCA(), amount: bill.total, discount: 0, pph23: 0, bank_charge: 0 }));
  ok(await osmond.post(`/api/e/supplier_payments/${pay.redirect.id}/actions/post`));
  const sup = id('suppliers', 'S002');
  const bal0 = (await admin.get(`/api/advance/supplier/${sup}`)).body.balance, vin0 = gl('1-1400');
  const r = ok(await newPurchaseReturn(bill, 10, { advance_mode: 'saldo' }));
  assert.equal(r.advance_part, 100_000); assert.equal(r.advance_amount, 0); assert.equal(r.total, 421_800);
  const p = ok(await osmond.post(`/api/e/purchase_returns/${r.id}/actions/post`));
  assert.equal(p.record.to_invoice, 0); assert.equal(p.record.to_credit, 421_800);
  assert.equal((await admin.get(`/api/advance/supplier/${sup}`)).body.balance, bal0 + 421_800);
  near(gl('1-1400') - vin0, -41_800, 'PPN masukan dikoreksi atas seluruh DPP retur');
  ok(await osmond.post(`/api/e/purchase_returns/${r.id}/actions/void`));
  assert.equal((await admin.get(`/api/advance/supplier/${sup}`)).body.balance, bal0);
  await reconciledAp();
  balanced();
});

test('retur pembelian melebihi sisa tagihan: kelebihan diterima kembali di rekening bank', async () => {
  const rina = await as('rina.akuntan');
  const b = ok(await rina.post('/api/e/purchase_bills', { branch_id: JKT(), date: '2026-10-07', supplier_id: id('suppliers', 'S002'), supplier_invoice_no: 'F-RET-BANK', warehouse_id: WH(), tax_rate: 11, lines: [{ product_id: prod('RM-002'), qty: 50, price: 38_000 }] }));
  ok(await osmond.post(`/api/e/purchase_bills/${b.id}/actions/post`));
  const pay = ok(await rina.post(`/api/e/purchase_bills/${b.id}/actions/pay`, { date: '2026-10-07', source: 'bank', bank_account_id: BCA(), amount: 1_500_000, discount: 0, pph23: 0, bank_charge: 0 }));
  ok(await osmond.post(`/api/e/supplier_payments/${pay.redirect.id}/actions/post`));
  const bill = (await admin.get(`/api/e/purchase_bills/${b.id}`)).body; // total 2.109.000, sisa 609.000
  const bank0 = gl('1-1130');
  const r = ok(await newPurchaseReturn(bill, 20, { refund_bank_id: BCA() })); // 843.600
  const p = ok(await osmond.post(`/api/e/purchase_returns/${r.id}/actions/post`));
  assert.equal(p.record.to_invoice, 609_000); assert.equal(p.record.to_credit, 234_600);
  assert.match(p.message, /diterima kembali/);
  near(gl('1-1130') - bank0, 234_600, 'dana diterima kembali di bank');
  assert.equal((await admin.get(`/api/e/purchase_bills/${b.id}`)).body.status, 'lunas');
  ok(await osmond.post(`/api/e/purchase_returns/${r.id}/actions/void`));
  near(gl('1-1130') - bank0, 0, 'bank kembali');
  await reconciledAp();
  balanced();
});
