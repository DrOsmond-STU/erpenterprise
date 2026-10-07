/* Uji nota debet & nota kredit (penyesuaian non-barang):
   pelanggan — nota kredit mengurangi piutang (diterapkan ke faktur atau menjadi saldo kredit),
   nota debet menambah piutang (dokumen terbuka yang dapat dibayar);
   pemasok — nota debet mengurangi hutang, nota kredit menambah hutang. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db } from './helpers.mjs';

let admin, osmond, rina;
const id = (table, code, field = 'code') => db.get(`SELECT id FROM ${table} WHERE ${field} = ?`, code).id;
const acc = (code) => id('accounts', code);
const gl = (code) => db.get("SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id WHERE j.status = 'diposting' AND a.code = ? AND jl.company_id = 1", code).v;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg}: ${a} ≠ ${b}`);
const JKT = () => id('branches', 'JKT');
const balanced = () => assert.deepEqual(db.all(`SELECT j.number FROM journals j JOIN journal_lines l ON l.parent_id = j.id WHERE j.status = 'diposting' GROUP BY j.id, l.branch_id HAVING ABS(SUM(l.debit - l.credit)) > 0.005`), [], 'jurnal seimbang');
async function reconciled() {
  for (const r of ['umur-piutang', 'umur-hutang']) {
    const x = (await admin.get(`/api/reports/${r}?to=2026-12-31`)).body;
    assert.ok(x.reconciled, `${r}: sub-buku ${x.totals.total} = buku besar ${x.glBalance}`);
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

async function invoice(cust, qty) {
  const r = await admin.post('/api/e/sales_invoices', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', cust), warehouse_id: id('warehouses', 'WH-JKT'), tax_rate: 11, lines: [{ product_id: id('products', 'SV-301'), qty, price: 1_000_000 }] });
  await osmond.post(`/api/e/sales_invoices/${r.body.id}/actions/post`);
  return (await admin.get(`/api/e/sales_invoices/${r.body.id}`)).body;
}
async function bill(sup, amount) {
  const r = await rina.post('/api/e/purchase_bills', { branch_id: JKT(), date: '2026-10-07', supplier_id: id('suppliers', sup), supplier_invoice_no: `UJI-${sup}-${amount}`, tax_rate: 11, lines: [{ account_id: acc('6-2900'), qty: 1, price: amount }] });
  await osmond.post(`/api/e/purchase_bills/${r.body.id}/actions/post`);
  return (await admin.get(`/api/e/purchase_bills/${r.body.id}`)).body;
}

test('nota kredit pelanggan diterapkan ke faktur: persetujuan SoD, piutang & PPN keluaran berkurang, faktur terbuka berkurang', async () => {
  const inv = await invoice('C002', 10); // 11.100.000
  const disc0 = gl('4-1900'), vat0 = gl('2-1200'), ar0 = gl('1-1200');
  const nk = await rina.post('/api/e/customer_credit_notes', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C002'), invoice_id: inv.id, reason: 'harga', description: 'Koreksi harga jasa instalasi', tax_rate: 11, lines: [{ account_id: acc('4-1900'), amount: 1_000_000 }] });
  assert.equal(nk.status, 200, JSON.stringify(nk.body));
  assert.equal(nk.body.total, 1_110_000);
  assert.equal((await rina.post('/api/e/customer_credit_notes', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C002'), invoice_id: inv.id, reason: 'harga', description: 'x', lines: [{ account_id: acc('4-1900'), amount: 20_000_000 }] })).status, 400, 'melebihi sisa faktur');
  assert.equal((await rina.post(`/api/e/customer_credit_notes/${nk.body.id}/actions/submit`)).status, 200);
  assert.equal((await rina.post(`/api/e/customer_credit_notes/${nk.body.id}/actions/approve`)).status, 403, 'pembuat tidak boleh menyetujui');
  const ap = await osmond.post(`/api/e/customer_credit_notes/${nk.body.id}/actions/approve`);
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  assert.equal(ap.body.record.status, 'diposting');
  const after = (await admin.get(`/api/e/sales_invoices/${inv.id}`)).body;
  assert.equal(after.paid, 1_110_000); assert.equal(after.status, 'sebagian');
  near(gl('4-1900') - disc0, 1_000_000, 'potongan penjualan (debit)');
  near(gl('2-1200') - vat0, 1_110_000 - 1_000_000, 'PPN keluaran berkurang (debit)');
  near(gl('1-1200') - ar0, -1_110_000, 'piutang berkurang');
  const st = (await admin.get(`/api/settlement/sales_invoices/${inv.id}`)).body;
  assert.ok(st.credits.some((c) => c.entity === 'customer_credit_notes'), 'tampil di rincian pelunasan faktur');
  // Batal → faktur kembali.
  assert.equal((await osmond.post(`/api/e/customer_credit_notes/${nk.body.id}/actions/void`)).status, 200);
  assert.equal((await admin.get(`/api/e/sales_invoices/${inv.id}`)).body.paid, 0);
  await reconciled();
  balanced();
});

test('nota kredit pelanggan tanpa faktur → saldo kredit, dipakai melunasi faktur lain; tidak bisa dibatalkan setelah dipakai', async () => {
  const cust = id('customers', 'C008');
  const bal0 = (await admin.get(`/api/advance/customer/${cust}`)).body.balance;
  const nk = await rina.post('/api/e/customer_credit_notes', { branch_id: JKT(), date: '2026-10-07', customer_id: cust, reason: 'potongan', description: 'Rabat volume Q3', lines: [{ account_id: acc('4-1900'), amount: 3_000_000 }] });
  await rina.post(`/api/e/customer_credit_notes/${nk.body.id}/actions/submit`);
  const ap = await osmond.post(`/api/e/customer_credit_notes/${nk.body.id}/actions/approve`);
  assert.match(ap.body.message, /saldo kredit/);
  assert.equal((await admin.get(`/api/advance/customer/${cust}`)).body.balance, bal0 + 3_000_000);
  const inv = await invoice('C008', 5);
  const use = await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/receive`, { date: '2026-10-07', source: 'uang_muka', amount: bal0 + 3_000_000 > 5_550_000 ? 5_550_000 : bal0 + 3_000_000, discount: 0, pph23: 0, bank_charge: 0 });
  assert.equal(use.status, 200, JSON.stringify(use.body));
  assert.equal((await osmond.post(`/api/e/customer_credit_notes/${nk.body.id}/actions/void`)).status, 409);
  balanced();
});

test('nota debet pelanggan: piutang bertambah, masuk umur piutang & jadwal, dibayar sebagian; batal ditolak bila sudah dibayar', async () => {
  const ar0 = gl('1-1200'), rev0 = gl('4-1300');
  const nd = await rina.post('/api/e/customer_debit_notes', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C003'), reason: 'ongkos', description: 'Penggantian ongkos kirim ekspres', lines: [{ account_id: acc('4-1300'), amount: 2_500_000 }], tax_rate: 11 });
  assert.equal(nd.status, 200, JSON.stringify(nd.body));
  assert.ok(nd.body.due_date > '2026-10-07', 'jatuh tempo dari termin pelanggan');
  const post = await osmond.post(`/api/e/customer_debit_notes/${nd.body.id}/actions/post`);
  assert.equal(post.status, 200, JSON.stringify(post.body));
  assert.equal(post.body.record.status, 'terbit');
  near(gl('1-1200') - ar0, 2_775_000, 'piutang bertambah');
  near(gl('4-1300') - rev0, -2_500_000, 'pendapatan (kredit)');
  const aging = (await admin.get('/api/reports/umur-piutang?to=2026-10-07')).body;
  assert.ok(aging.docs.some((d) => d.entity === 'customer_debit_notes' && d.id === nd.body.id), 'nota debet di umur piutang');
  const sched = (await admin.get('/api/reports/angsuran?side=ar&days=90&to=2026-10-07')).body;
  assert.ok(sched.rows.some((r) => r.entity === 'customer_debit_notes'), 'nota debet di jadwal angsuran');
  // Penerimaan sebagian dari nota debet (aksi cepat) dan lewat formulir penerimaan.
  const r1 = await osmond.post(`/api/e/customer_debit_notes/${nd.body.id}/actions/receive`, { date: '2026-10-07', source: 'bank', bank_account_id: id('bank_accounts', 'BCA-JKT'), amount: 1_000_000, discount: 0, pph23: 0, bank_charge: 0 });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.record.status, 'sebagian');
  const rc = await rina.post('/api/e/customer_receipts', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C003'), bank_account_id: id('bank_accounts', 'BCA-JKT'), lines: [{ debit_note_id: nd.body.id, amount: 1_775_000 }] });
  assert.equal(rc.status, 200, JSON.stringify(rc.body));
  await osmond.post(`/api/e/customer_receipts/${rc.body.id}/actions/post`);
  assert.equal((await admin.get(`/api/e/customer_debit_notes/${nd.body.id}`)).body.status, 'lunas');
  assert.equal((await admin.get(`/api/settlement/customer_debit_notes/${nd.body.id}`)).body.payments.length, 2);
  assert.equal((await osmond.post(`/api/e/customer_debit_notes/${nd.body.id}/actions/void`)).status, 409);
  // Baris penerimaan harus memilih tepat satu dokumen.
  const both = await rina.post('/api/e/customer_receipts', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C003'), bank_account_id: id('bank_accounts', 'BCA-JKT'), lines: [{ amount: 1 }] });
  assert.equal(both.status, 400);
  await reconciled();
  balanced();
});

test('pemasok: nota debet mengurangi hutang (diterapkan ke tagihan), nota kredit menambah hutang & dibayar lewat persetujuan', async () => {
  const b = await bill('S004', 10_000_000); // 11.100.000
  const ap0 = gl('2-1100'), pdisc0 = gl('7-1300'), vin0 = gl('1-1400');
  const ndb = await rina.post('/api/e/supplier_debit_notes', { branch_id: JKT(), date: '2026-10-07', supplier_id: id('suppliers', 'S004'), bill_id: b.id, reason: 'klaim', description: 'Klaim cat cacat 5%', tax_rate: 11, lines: [{ account_id: acc('7-1300'), amount: 500_000 }] });
  assert.equal(ndb.status, 200, JSON.stringify(ndb.body));
  await rina.post(`/api/e/supplier_debit_notes/${ndb.body.id}/actions/submit`);
  assert.equal((await rina.post(`/api/e/supplier_debit_notes/${ndb.body.id}/actions/approve`)).status, 403);
  assert.equal((await osmond.post(`/api/e/supplier_debit_notes/${ndb.body.id}/actions/approve`)).status, 200);
  near(gl('2-1100') - ap0, 555_000, 'hutang berkurang (debit)');
  near(gl('7-1300') - pdisc0, -500_000, 'potongan pembelian (kredit)');
  near(gl('1-1400') - vin0, -55_000, 'PPN masukan berkurang');
  assert.equal((await admin.get(`/api/e/purchase_bills/${b.id}`)).body.paid, 555_000);

  const nkb = await rina.post('/api/e/supplier_credit_notes', { branch_id: JKT(), date: '2026-10-07', supplier_id: id('suppliers', 'S004'), reason: 'ongkos', description: 'Biaya angkut tambahan', lines: [{ account_id: acc('6-2300'), amount: 750_000 }] });
  await osmond.post(`/api/e/supplier_credit_notes/${nkb.body.id}/actions/post`);
  const apAfter = gl('2-1100');
  const pay = await rina.post(`/api/e/supplier_credit_notes/${nkb.body.id}/actions/pay`, { date: '2026-10-07', source: 'bank', bank_account_id: id('bank_accounts', 'BCA-JKT'), amount: 750_000, discount: 0, pph23: 0, bank_charge: 0 });
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  assert.equal((await rina.post(`/api/e/supplier_payments/${pay.body.redirect.id}/actions/post`)).status, 403, 'SoD');
  await osmond.post(`/api/e/supplier_payments/${pay.body.redirect.id}/actions/post`);
  assert.equal((await admin.get(`/api/e/supplier_credit_notes/${nkb.body.id}`)).body.status, 'lunas');
  near(gl('2-1100') - apAfter, 750_000, 'hutang nota kredit dilunasi');
  await reconciled();
  balanced();
});
