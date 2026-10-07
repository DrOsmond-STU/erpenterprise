/* Uji pembayaran bertahap: termin & jadwal angsuran, pelunasan sebagian per angsuran,
   potongan (diskon, PPh 23, biaya bank), uang muka pelanggan/pemasok & pemakaiannya,
   aksi cepat dari faktur/tagihan, umur piutang/hutang per angsuran, dan rekonsiliasi. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db } from './helpers.mjs';

let admin, osmond, rina;
const id = (table, code, field = 'code') => db.get(`SELECT id FROM ${table} WHERE ${field} = ?`, code).id;
const prod = (code) => id('products', code);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg}: ${a} ≠ ${b}`);
const gl = (code) => db.get("SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id WHERE j.status = 'diposting' AND a.code = ? AND jl.company_id = 1", code).v;
const balanced = () => assert.deepEqual(db.all(`SELECT j.number FROM journals j JOIN journal_lines l ON l.parent_id = j.id WHERE j.status = 'diposting' GROUP BY j.id, l.branch_id HAVING ABS(SUM(l.debit - l.credit)) > 0.005`), [], 'jurnal seimbang');

before(async () => {
  await start();
  admin = await as('admin');
  osmond = await as('osmond');
  rina = await as('rina.akuntan');
  await admin.put('/api/settings/security_policy', { apiRateLimitPerMinute: 100000, loginRateLimitPerMinute: 1000 });
});
after(stop);

/** Faktur jasa (tanpa stok) langsung — pelanggan antar perusahaan tidak dipakai. */
async function invoice(cust, qty, extra = {}) {
  const r = await admin.post('/api/e/sales_invoices', { branch_id: id('branches', 'JKT'), date: '2026-10-07', customer_id: id('customers', cust), warehouse_id: id('warehouses', 'WH-JKT'), tax_rate: 11, lines: [{ product_id: prod('SV-301'), qty, price: 1_000_000 }], ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await osmond.post(`/api/e/sales_invoices/${r.body.id}/actions/post`)).status, 200);
  return (await admin.get(`/api/e/sales_invoices/${r.body.id}`)).body;
}
const settlement = async (entity, docId) => (await admin.get(`/api/settlement/${entity}/${docId}`)).body;

test('termin bertahap: total persentase harus 100%; jatuh tempo dokumen = tahap terakhir', async () => {
  const bad = await admin.post('/api/e/payment_terms', { code: 'X1', name: 'Salah', lines: [{ label: 'A', pct: 50, days: 0 }, { label: 'B', pct: 40, days: 30 }] });
  assert.equal(bad.status, 400);
  const ok = await admin.post('/api/e/payment_terms', { code: 'UJI4', name: 'Uji 25×4', lines: [1, 2, 3, 4].map((n) => ({ label: `Tahap ${n}`, pct: 25, days: n * 15 })) });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const inv = await invoice('C002', 10, { payment_term_id: ok.body.id });
  assert.equal(inv.due_date, '2026-12-06', 'jatuh tempo = tahap terakhir (60 hari)');
  const s = await settlement('sales_invoices', inv.id);
  assert.equal(s.installments.length, 4);
  assert.deepEqual(s.installments.map((i) => i.due_date), ['2026-10-22', '2026-11-06', '2026-11-21', '2026-12-06']);
  near(s.installments.reduce((t, i) => t + i.amount, 0), inv.total, 'jumlah angsuran = total faktur');
});

test('pelanggan dengan termin DP 30%: pelunasan sebagian dialokasikan ke angsuran tertua; umur piutang per angsuran', async () => {
  const inv = await invoice('C004', 100); // termin bawaan pelanggan: DP 30% + pelunasan 30 hari
  assert.equal(inv.payment_term_id, id('payment_terms', 'DP30'));
  let s = await settlement('sales_invoices', inv.id);
  assert.equal(s.installments.length, 2);
  near(s.installments[0].amount, inv.total * 0.3, 'DP 30%');
  assert.equal(s.installments[0].due_date, '2026-10-07');
  // Bayar 40% dari total → DP lunas, 10% masuk angsuran kedua.
  const r = await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/receive`, { date: '2026-10-07', source: 'bank', bank_account_id: id('bank_accounts', 'BCA-JKT'), amount: Math.round(inv.total * 0.4), discount: 0, pph23: 0, bank_charge: 0 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.record.status, 'sebagian');
  assert.match(r.body.message, /Sisa faktur/);
  s = await settlement('sales_invoices', inv.id);
  assert.equal(s.installments[0].status, 'lunas');
  assert.equal(s.installments[1].status, 'sebagian');
  assert.equal(s.payments.length, 1);
  // Umur piutang menampilkan sisa angsuran ke-2 dan tetap cocok dengan buku besar.
  const aging = (await admin.get('/api/reports/umur-piutang?to=2026-10-07')).body;
  assert.ok(aging.reconciled, 'sub-buku piutang = buku besar');
  assert.ok(aging.docs.some((d) => d.number === `${inv.number} · Pelunasan`), 'baris per angsuran');
  // Melebihi sisa ditolak.
  assert.equal((await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/receive`, { date: '2026-10-07', source: 'bank', bank_account_id: id('bank_accounts', 'BCA-JKT'), amount: inv.total, discount: 0, pph23: 0, bank_charge: 0 })).status, 400);
  // Batalkan penerimaan → angsuran kembali terbuka.
  const rc = s.payments[0];
  assert.equal((await osmond.post(`/api/e/customer_receipts/${rc.id}/actions/void`)).status, 200);
  s = await settlement('sales_invoices', inv.id);
  assert.ok(s.installments.every((i) => i.paid === 0));
  assert.equal((await admin.get(`/api/e/sales_invoices/${inv.id}`)).body.status, 'terbit');
  balanced();
});

test('pelunasan dengan PPh 23 dipotong pelanggan, potongan, dan biaya bank melunasi faktur penuh', async () => {
  const inv = await invoice('C001', 10); // total 11.100.000
  const pph0 = gl('1-1410'), disc0 = gl('4-1900'), fee0 = gl('7-2100');
  const rc = await rina.post('/api/e/customer_receipts', {
    branch_id: id('branches', 'JKT'), date: '2026-10-07', customer_id: id('customers', 'C001'), mode: 'pelunasan', bank_account_id: id('bank_accounts', 'BCA-JKT'), bank_charge: 6_500,
    lines: [{ invoice_id: inv.id, amount: 10_680_000, discount: 220_000, pph23: 200_000 }],
  });
  assert.equal(rc.status, 200, JSON.stringify(rc.body));
  assert.equal(rc.body.total, 10_680_000); assert.equal(rc.body.settled, 11_100_000);
  assert.equal((await osmond.post(`/api/e/customer_receipts/${rc.body.id}/actions/post`)).status, 200);
  assert.equal((await admin.get(`/api/e/sales_invoices/${inv.id}`)).body.status, 'lunas');
  near(gl('1-1410') - pph0, 200_000, 'PPh 23 dibayar di muka');
  near(gl('4-1900') - disc0, 220_000, 'potongan penjualan');
  near(gl('7-2100') - fee0, 6_500, 'biaya bank');
  const bankLine = db.get("SELECT l.debit FROM journal_lines l JOIN journals j ON j.id = l.parent_id JOIN accounts a ON a.id = l.account_id WHERE j.source_type = 'customer_receipts' AND j.source_id = ? AND a.code = '1-1130'", rc.body.id);
  assert.equal(bankLine.debit, 10_673_500, 'bank menerima neto setelah biaya');
  balanced();
});

test('uang muka pelanggan: DP tanpa faktur → dipakai melunasi; tidak boleh melebihi saldo; pembatalan berurutan', async () => {
  const cust = id('customers', 'C008');
  const adv0 = (await admin.get(`/api/advance/customer/${cust}`)).body.balance;
  const dp = await rina.post('/api/e/customer_receipts', { branch_id: id('branches', 'JKT'), date: '2026-10-07', customer_id: cust, mode: 'uang_muka', bank_account_id: id('bank_accounts', 'BCA-JKT'), advance: 5_000_000 });
  assert.equal(dp.status, 200, JSON.stringify(dp.body));
  assert.equal((await rina.post('/api/e/customer_receipts', { branch_id: id('branches', 'JKT'), date: '2026-10-07', customer_id: cust, mode: 'uang_muka', bank_account_id: id('bank_accounts', 'BCA-JKT'), advance: 1, lines: [{ invoice_id: 1, amount: 1 }] })).status, 400, 'DP tanpa baris faktur');
  await osmond.post(`/api/e/customer_receipts/${dp.body.id}/actions/post`);
  assert.equal((await admin.get(`/api/advance/customer/${cust}`)).body.balance, adv0 + 5_000_000);
  const inv = await invoice('C008', 4); // 4.440.000
  const over = await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/receive`, { date: '2026-10-07', source: 'uang_muka', amount: 4_440_000 + adv0 + 5_000_000 - 4_440_000 + 1, discount: 0, pph23: 0, bank_charge: 0 });
  assert.equal(over.status, 400, 'melebihi saldo uang muka / sisa faktur');
  const use = await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/receive`, { date: '2026-10-07', source: 'uang_muka', amount: 3_000_000, discount: 0, pph23: 0, bank_charge: 0 });
  assert.equal(use.status, 200, JSON.stringify(use.body));
  assert.equal(use.body.record.status, 'sebagian');
  assert.equal((await admin.get(`/api/advance/customer/${cust}`)).body.balance, adv0 + 2_000_000);
  // DP yang sudah dipakai tidak dapat dibatalkan sebelum pemakaiannya dibatalkan.
  assert.equal((await osmond.post(`/api/e/customer_receipts/${dp.body.id}/actions/void`)).status, 409);
  const usage = (await settlement('sales_invoices', inv.id)).payments.find((p) => p.mode === 'pakai_uang_muka');
  assert.equal((await osmond.post(`/api/e/customer_receipts/${usage.id}/actions/void`)).status, 200);
  assert.equal((await osmond.post(`/api/e/customer_receipts/${dp.body.id}/actions/void`)).status, 200);
  assert.equal((await admin.get(`/api/advance/customer/${cust}`)).body.balance, adv0);
  balanced();
});

test('hutang pemasok: cicilan 3×, pembayaran sebagian lewat persetujuan (SoD) dengan PPh 23 & potongan; uang muka pembelian', async () => {
  const sup = id('suppliers', 'S001'); // termin bawaan: cicilan 3× bulanan
  const bill = await rina.post('/api/e/purchase_bills', { branch_id: id('branches', 'CKR'), date: '2026-10-07', supplier_id: sup, supplier_invoice_no: 'UJI-CICIL', tax_rate: 11, lines: [{ account_id: id('accounts', '6-2900'), qty: 1, price: 30_000_000 }] });
  assert.equal(bill.status, 200, JSON.stringify(bill.body));
  await osmond.post(`/api/e/purchase_bills/${bill.body.id}/actions/post`);
  let s = await settlement('purchase_bills', bill.body.id);
  assert.deepEqual(s.installments.map((i) => i.label), ['Cicilan 1', 'Cicilan 2', 'Cicilan 3']);
  near(s.installments[0].amount, 33_300_000 * 0.34, 'cicilan 1 = 34%');
  const pph0 = gl('2-1330'), disc0 = gl('7-1300');
  const pay = await rina.post(`/api/e/purchase_bills/${bill.body.id}/actions/pay`, { date: '2026-10-07', source: 'bank', bank_account_id: id('bank_accounts', 'BCA-CKR'), amount: 10_000_000, discount: 322_000, pph23: 600_000, bank_charge: 6_500 });
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  const payId = pay.body.redirect.id;
  assert.equal((await admin.get(`/api/e/supplier_payments/${payId}`)).body.status, 'menunggu');
  assert.equal((await rina.post(`/api/e/supplier_payments/${payId}/actions/post`)).status, 403, 'pembuat tidak boleh menyetujui (SoD)');
  assert.equal((await osmond.post(`/api/e/supplier_payments/${payId}/actions/post`)).status, 200);
  s = await settlement('purchase_bills', bill.body.id);
  assert.equal(s.installments[0].paid, 10_922_000, 'kas + potongan + PPh 23 dialokasikan ke cicilan 1');
  assert.equal(s.installments[0].status, 'sebagian', 'cicilan 1 (11.322.000) belum lunas');
  near(gl('2-1330') - pph0, -600_000, 'hutang PPh 23 (kredit)');
  near(gl('7-1300') - disc0, -322_000, 'potongan pembelian (kredit)');
  const aging = (await admin.get('/api/reports/umur-hutang?to=2026-10-07')).body;
  assert.ok(aging.reconciled, 'sub-buku hutang = buku besar');
  // Uang muka pembelian lalu dipakai.
  const adv = await rina.post('/api/e/supplier_payments', { branch_id: id('branches', 'CKR'), date: '2026-10-07', supplier_id: sup, mode: 'uang_muka', bank_account_id: id('bank_accounts', 'BCA-CKR'), advance: 4_000_000 });
  assert.equal(adv.status, 200, JSON.stringify(adv.body));
  await rina.post(`/api/e/supplier_payments/${adv.body.id}/actions/submit`);
  await osmond.post(`/api/e/supplier_payments/${adv.body.id}/actions/post`);
  assert.equal((await admin.get(`/api/advance/supplier/${sup}`)).body.balance >= 4_000_000, true);
  const use = await rina.post(`/api/e/purchase_bills/${bill.body.id}/actions/pay`, { date: '2026-10-07', source: 'uang_muka', amount: 4_000_000, discount: 0, pph23: 0, bank_charge: 0 });
  assert.equal((await osmond.post(`/api/e/supplier_payments/${use.body.redirect.id}/actions/post`)).status, 200);
  assert.equal((await settlement('purchase_bills', bill.body.id)).payments.length, 2);
  balanced();
});

test('jadwal angsuran & hak akses: piutang untuk penjualan, hutang untuk pembelian; anti-IDOR rincian pelunasan', async () => {
  const ar = await admin.get('/api/reports/angsuran?side=ar&days=90&to=2026-10-07');
  assert.equal(ar.status, 200);
  assert.ok(ar.body.rows.length > 0 && ar.body.totals.staged >= 1 && ar.body.advances.some((a) => a.balance > 0));
  const ap = await admin.get('/api/reports/angsuran?side=ap&days=90&to=2026-10-07');
  assert.ok(ap.body.rows.some((r) => /Cicilan/.test(r.label)));
  const sales = await as('sari.sales');
  assert.equal((await sales.get('/api/reports/angsuran?side=ar')).status, 200);
  assert.equal((await sales.get('/api/reports/angsuran?side=ap')).status, 403);
  const inv = db.get("SELECT id FROM sales_invoices WHERE company_id = 1 AND status = 'terbit' LIMIT 1").id;
  const other = await admin.get(`/api/settlement/sales_invoices/${inv}?company=${id('companies', 'NLP')}`);
  assert.ok([403, 404].includes(other.status), `status ${other.status}`);
});
