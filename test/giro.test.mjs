/* Uji pelunasan dengan giro mundur (bilyet giro / cek mundur):
   giro masuk dari pelanggan & giro keluar ke pemasok — diterima/diserahkan, cair,
   ditolak/dibatalkan — beserta jurnal, status faktur/tagihan, register & rekonsiliasi. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db } from './helpers.mjs';

let admin, osmond, rina;
const id = (table, code, field = 'code') => db.get(`SELECT id FROM ${table} WHERE ${field} = ?`, code).id;
const gl = (code) => db.get("SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id WHERE j.status = 'diposting' AND a.code = ? AND jl.company_id = 1", code).v;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg}: ${a} ≠ ${b}`);
const balanced = () => assert.deepEqual(db.all(`SELECT j.number FROM journals j JOIN journal_lines l ON l.parent_id = j.id WHERE j.status = 'diposting' GROUP BY j.id, l.branch_id HAVING ABS(SUM(l.debit - l.credit)) > 0.005`), [], 'jurnal seimbang');

before(async () => {
  await start();
  admin = await as('admin');
  osmond = await as('osmond');
  rina = await as('rina.akuntan');
  await admin.put('/api/settings/security_policy', { apiRateLimitPerMinute: 100000, loginRateLimitPerMinute: 1000 });
});
after(stop);

async function invoice(cust, qty) {
  const r = await admin.post('/api/e/sales_invoices', { branch_id: id('branches', 'JKT'), date: '2026-10-07', customer_id: id('customers', cust), warehouse_id: id('warehouses', 'WH-JKT'), tax_rate: 11, lines: [{ product_id: id('products', 'SV-301'), qty, price: 1_000_000 }] });
  await osmond.post(`/api/e/sales_invoices/${r.body.id}/actions/post`);
  return (await admin.get(`/api/e/sales_invoices/${r.body.id}`)).body;
}
const bca = () => id('bank_accounts', 'BCA-JKT');

test('giro masuk: faktur lunas saat giro diterima; kas bertambah saat giro cair (tidak sebelum tanggal efektif)', async () => {
  const inv = await invoice('C002', 10); // 11.100.000
  const giro0 = gl('1-1250'), bank0 = gl('1-1130');
  const rc = await rina.post('/api/e/customer_receipts', {
    branch_id: id('branches', 'JKT'), date: '2026-10-07', customer_id: id('customers', 'C002'), mode: 'pelunasan', method: 'giro', bank_account_id: bca(),
    giro_no: 'BG-UJI-001', giro_bank: 'BRI', giro_due: '2026-10-07', lines: [{ invoice_id: inv.id, amount: 11_100_000 }],
  });
  assert.equal(rc.status, 200, JSON.stringify(rc.body));
  assert.equal((await rina.post('/api/e/customer_receipts', { branch_id: id('branches', 'JKT'), date: '2026-10-07', customer_id: id('customers', 'C002'), method: 'giro', bank_account_id: bca(), giro_due: '2026-10-07', lines: [{ invoice_id: inv.id, amount: 1 }] })).status, 400, 'nomor giro wajib');
  assert.equal((await rina.post('/api/e/customer_receipts', { branch_id: id('branches', 'JKT'), date: '2026-10-07', customer_id: id('customers', 'C002'), method: 'giro', bank_account_id: bca(), giro_no: 'X', giro_due: '2026-10-01', lines: [{ invoice_id: inv.id, amount: 1 }] })).status, 400, 'tanggal efektif sebelum tanggal terima ditolak');
  const post = await osmond.post(`/api/e/customer_receipts/${rc.body.id}/actions/post`);
  assert.equal(post.status, 200, JSON.stringify(post.body));
  assert.equal(post.body.record.giro_status, 'beredar');
  assert.equal((await admin.get(`/api/e/sales_invoices/${inv.id}`)).body.status, 'lunas', 'piutang lunas saat giro diterima');
  near(gl('1-1250') - giro0, 11_100_000, 'giro diterima belum cair');
  near(gl('1-1130'), bank0, 'kas belum bertambah');
  const actions = post.body.record.__actions.map((a) => a.name);
  assert.ok(actions.includes('giro_clear') && actions.includes('giro_bounce'));
  // Penerimaan transfer biasa tidak menampilkan aksi giro.
  const tr = db.get("SELECT id FROM customer_receipts WHERE method = 'transfer' AND status = 'diposting' LIMIT 1").id;
  assert.ok(!(await admin.get(`/api/e/customer_receipts/${tr}`)).body.__actions.some((a) => a.name.startsWith('giro_')));
  assert.equal((await osmond.post(`/api/e/customer_receipts/${tr}/actions/giro_clear`, { date: '2026-10-07' })).status, 409);

  // Giro dengan tanggal efektif di masa depan belum dapat dicairkan.
  const inv2 = await invoice('C002', 2);
  const rc2 = await osmond.post(`/api/e/sales_invoices/${inv2.id}/actions/receive`, { date: '2026-10-07', source: 'giro', bank_account_id: bca(), giro_no: 'BG-UJI-002', giro_bank: 'BNI', giro_due: '2026-10-30', amount: 2_220_000, discount: 0, pph23: 0, bank_charge: 0 });
  assert.equal(rc2.status, 200, JSON.stringify(rc2.body));
  const g2 = db.get("SELECT id FROM customer_receipts WHERE giro_no = 'BG-UJI-002'").id;
  assert.equal((await osmond.post(`/api/e/customer_receipts/${g2}/actions/giro_clear`, { date: '2026-10-07' })).status, 400, 'belum efektif');

  const clear = await osmond.post(`/api/e/customer_receipts/${rc.body.id}/actions/giro_clear`, { date: '2026-10-07', bank_charge: 5_000 });
  assert.equal(clear.status, 200, JSON.stringify(clear.body));
  assert.equal(clear.body.record.giro_status, 'cair');
  near(gl('1-1130') - bank0, 11_095_000, 'kas masuk neto biaya kliring');
  near(gl('1-1250') - giro0, 2_220_000, 'hanya giro kedua yang belum cair');
  // Giro yang sudah cair tidak dapat dibatalkan/ditolak lagi.
  assert.equal((await osmond.post(`/api/e/customer_receipts/${rc.body.id}/actions/void`)).status, 409);
  assert.equal((await osmond.post(`/api/e/customer_receipts/${rc.body.id}/actions/giro_bounce`, { date: '2026-10-07', reason: 'x' })).status, 409);
  balanced();
});

test('giro masuk ditolak bank: pelunasan dibalik, faktur terbuka lagi, pelanggan dapat ditahan', async () => {
  const inv = await invoice('C001', 5); // 5.550.000
  const giro0 = gl('1-1250'), ar0 = gl('1-1200');
  await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/receive`, { date: '2026-10-07', source: 'giro', bank_account_id: bca(), giro_no: 'BG-UJI-TOLAK', giro_bank: 'Danamon', giro_due: '2026-10-07', amount: 5_550_000, discount: 0, pph23: 0, bank_charge: 0 });
  const g = db.get("SELECT id FROM customer_receipts WHERE giro_no = 'BG-UJI-TOLAK'").id;
  assert.equal((await admin.get(`/api/e/sales_invoices/${inv.id}`)).body.status, 'lunas');
  const b = await osmond.post(`/api/e/customer_receipts/${g}/actions/giro_bounce`, { date: '2026-10-07', reason: 'Saldo tidak cukup', hold: 1 });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(b.body.record.giro_status, 'tolak');
  assert.equal(b.body.record.status, 'batal');
  assert.equal((await admin.get(`/api/e/sales_invoices/${inv.id}`)).body.status, 'terbit', 'faktur kembali terbuka');
  near(gl('1-1250'), giro0, 'giro belum cair kembali');
  near(gl('1-1200'), ar0, 'piutang kembali ke saldo sebelum giro diterima');
  assert.equal(db.get("SELECT status FROM customers WHERE code = 'C001'").status, 'ditahan');
  const st = (await admin.get(`/api/settlement/sales_invoices/${inv.id}`)).body;
  assert.ok(st.installments.every((i) => i.paid === 0), 'angsuran dibuka kembali');
  db.run("UPDATE customers SET status = 'aktif' WHERE code = 'C001'");
  balanced();
});

test('giro keluar ke pemasok: diajukan & disetujui (SoD), hutang lunas, kas berkurang saat cair; pembatalan membuka tagihan', async () => {
  const bill = await rina.post('/api/e/purchase_bills', { branch_id: id('branches', 'JKT'), date: '2026-10-07', supplier_id: id('suppliers', 'S003'), supplier_invoice_no: 'UJI-GIRO', tax_rate: 11, lines: [{ account_id: id('accounts', '6-2900'), qty: 1, price: 9_000_000 }] });
  await osmond.post(`/api/e/purchase_bills/${bill.body.id}/actions/post`);
  const out0 = gl('2-1150'), bank0 = gl('1-1130');
  const pay = await rina.post(`/api/e/purchase_bills/${bill.body.id}/actions/pay`, { date: '2026-10-07', source: 'giro', bank_account_id: bca(), giro_no: 'BG-OUT-UJI', giro_bank: 'BCA', giro_due: '2026-10-07', amount: 9_990_000, discount: 0, pph23: 0, bank_charge: 0 });
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  const pid = pay.body.redirect.id;
  assert.equal((await rina.post(`/api/e/supplier_payments/${pid}/actions/post`)).status, 403, 'SoD');
  assert.equal((await osmond.post(`/api/e/supplier_payments/${pid}/actions/post`)).status, 200);
  assert.equal((await admin.get(`/api/e/purchase_bills/${bill.body.id}`)).body.status, 'lunas');
  near(gl('2-1150') - out0, -9_990_000, 'giro diberikan belum cair (liabilitas)');
  near(gl('1-1130'), bank0, 'kas belum berkurang');
  const reg = (await admin.get('/api/reports/giro?side=out&to=2026-10-07')).body;
  assert.ok(reg.reconciled, `register keluar = buku besar (${reg.totals.open} vs ${reg.glBalance})`);
  assert.ok(reg.rows.some((r) => r.giro_no === 'BG-OUT-UJI' && r.giro_status === 'beredar'));
  assert.equal((await osmond.post(`/api/e/supplier_payments/${pid}/actions/giro_clear`, { date: '2026-10-07' })).status, 200);
  near(gl('1-1130') - bank0, -9_990_000, 'kas berkurang saat giro cair');
  near(gl('2-1150'), out0, 'liabilitas giro hilang');

  // Giro keluar dibatalkan sebelum cair → tagihan terbuka lagi.
  const bill2 = await rina.post('/api/e/purchase_bills', { branch_id: id('branches', 'JKT'), date: '2026-10-07', supplier_id: id('suppliers', 'S003'), supplier_invoice_no: 'UJI-GIRO-2', tax_rate: 11, lines: [{ account_id: id('accounts', '6-2900'), qty: 1, price: 1_000_000 }] });
  await osmond.post(`/api/e/purchase_bills/${bill2.body.id}/actions/post`);
  const p2 = await rina.post(`/api/e/purchase_bills/${bill2.body.id}/actions/pay`, { date: '2026-10-07', source: 'giro', bank_account_id: bca(), giro_no: 'BG-OUT-BATAL', giro_due: '2026-10-20', amount: 1_110_000, discount: 0, pph23: 0, bank_charge: 0 });
  await osmond.post(`/api/e/supplier_payments/${p2.body.redirect.id}/actions/post`);
  const bb = await osmond.post(`/api/e/supplier_payments/${p2.body.redirect.id}/actions/giro_bounce`, { date: '2026-10-07', reason: 'Giro hilang — diganti transfer' });
  assert.equal(bb.status, 200, JSON.stringify(bb.body));
  assert.equal((await admin.get(`/api/e/purchase_bills/${bill2.body.id}`)).body.status, 'terbit');
  balanced();
});

test('register giro masuk: rekonsiliasi buku besar, status jatuh tempo, hak akses', async () => {
  const r = await admin.get('/api/reports/giro?side=in&to=2026-10-07');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.reconciled, `giro belum cair (${r.body.totals.open}) = saldo 1-1250 (${r.body.glBalance})`);
  assert.ok(r.body.rows.some((x) => x.giro_status === 'cair') && r.body.rows.some((x) => x.giro_status === 'tolak') && r.body.rows.some((x) => x.giro_status === 'beredar'));
  const sales = await as('sari.sales');
  assert.equal((await sales.get('/api/reports/giro?side=in')).status, 200);
  assert.equal((await sales.get('/api/reports/giro?side=out')).status, 403);
  // Giro valas tidak diizinkan.
  const usdInv = db.get("SELECT id FROM sales_invoices WHERE exchange_rate > 1 AND status IN ('terbit','sebagian') LIMIT 1");
  if (usdInv) assert.equal((await osmond.post(`/api/e/sales_invoices/${usdInv.id}/actions/receive`, { date: '2026-10-07', source: 'giro', bank_account_id: bca(), giro_no: 'BG-USD', giro_due: '2026-10-10', amount: 1, discount: 0, pph23: 0, bank_charge: 0 })).status, 400);
});
