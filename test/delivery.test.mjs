/* Uji surat jalan (delivery order) & pengakuan piutang saat faktur:
   (1) SO penuh → DO sebagian berkali-kali → satu faktur dari beberapa DO;
   (2) SO penuh → DO penuh → faktur dari satu DO;
   (3) beberapa SO dikirim penuh → satu faktur gabungan dari beberapa DO. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db, soViaQuotation } from './helpers.mjs';

let admin, osmond;
const id = (table, code, field = 'code') => db.get(`SELECT id FROM ${table} WHERE ${field} = ?`, code).id;
const prod = (code) => id('products', code);
const WH = () => id('warehouses', 'WH-JKT');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg}: ${a} ≠ ${b}`);

before(async () => {
  await start();
  admin = await as('admin');
  osmond = await as('osmond');
  await admin.put('/api/settings/security_policy', { apiRateLimitPerMinute: 100000, loginRateLimitPerMinute: 1000 });
});
after(stop);

const stock = (code) => db.get('SELECT qty FROM stock_balances WHERE product_id = ? AND warehouse_id = ?', prod(code), WH()).qty;
const glOf = (code) => db.get("SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id WHERE j.status = 'diposting' AND a.code = ? AND jl.company_id = 1", code).v;
const arOf = (custCode) => db.get("SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status = 'diposting' AND jl.partner_type = 'customer' AND jl.partner_id = ?", id('customers', custCode)).v;
const balanced = () => assert.deepEqual(db.all(`SELECT j.number FROM journals j JOIN journal_lines l ON l.parent_id = j.id WHERE j.status = 'diposting' GROUP BY j.id, l.branch_id HAVING ABS(SUM(l.debit - l.credit)) > 0.005`), [], 'jurnal seimbang per cabang');

async function approvedSo(cust, lines) {
  const so = await soViaQuotation(admin, osmond, { branch_id: id('branches', 'JKT'), date: '2026-10-07', customer_id: id('customers', cust), warehouse_id: WH(), tax_rate: 11, lines });
  const s = await admin.post(`/api/e/sales_orders/${so.id}/actions/submit`);
  if (s.body.record.status === 'menunggu') await osmond.post(`/api/e/sales_orders/${so.id}/actions/approve`);
  return (await admin.get(`/api/e/sales_orders/${so.id}`)).body;
}
const toDelivery = async (soId, mode = 'sisa') => (await admin.post(`/api/e/sales_orders/${soId}/actions/to_delivery`, { date: '2026-10-07', mode })).body;
const ship = (doId) => admin.post(`/api/e/delivery_orders/${doId}/actions/ship`);

test('skenario 1: SO penuh → DO sebagian (2×) → satu faktur dari beberapa DO; piutang hanya saat faktur', async () => {
  const so = await approvedSo('C004', [{ product_id: prod('FG-102'), qty: 10, price: 2_250_000 }]);
  const st0 = stock('FG-102'), ar0 = arOf('C004'), unb0 = glOf('1-1350');

  // DO-1: kirim 4 dari 10.
  const r1 = await toDelivery(so.id, 'kosong');
  const do1 = (await admin.get(`/api/e/delivery_orders/${r1.redirect.id}`)).body;
  assert.equal(do1.lines[0].qty, 0, 'mode isi manual');
  const upd = await admin.put(`/api/e/delivery_orders/${do1.id}`, { row_version: do1.row_version, lines: [{ product_id: prod('FG-102'), qty: 4 }] });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(upd.body.value, 9_000_000, 'nilai jual DO dari harga SO');
  const s1 = await ship(do1.id);
  assert.equal(s1.status, 200, JSON.stringify(s1.body));
  assert.equal(s1.body.record.status, 'dikirim');
  assert.equal(stock('FG-102'), st0 - 4, 'stok keluar saat DO dikirim');
  assert.equal(arOf('C004'), ar0, 'piutang BELUM diakui saat pengiriman');
  const cost1 = s1.body.record.cost;
  near(glOf('1-1350') - unb0, cost1, 'persediaan terkirim belum difakturkan');
  assert.equal((await admin.get(`/api/e/sales_orders/${so.id}`)).body.status, 'dikirim_sebagian');

  // Tidak boleh mengirim melebihi sisa.
  const over = await toDelivery(so.id, 'kosong');
  const o = (await admin.get(`/api/e/delivery_orders/${over.redirect.id}`)).body;
  assert.equal((await admin.put(`/api/e/delivery_orders/${o.id}`, { row_version: o.row_version, lines: [{ product_id: prod('FG-102'), qty: 7 }] })).status, 400, 'qty > sisa ditolak');
  await admin.del(`/api/e/delivery_orders/${o.id}`);

  // DO-2: sisa 6.
  const r2 = await toDelivery(so.id, 'sisa');
  const do2 = (await admin.get(`/api/e/delivery_orders/${r2.redirect.id}`)).body;
  assert.equal(do2.lines[0].qty, 6);
  const s2 = await ship(do2.id);
  assert.equal((await admin.get(`/api/e/sales_orders/${so.id}`)).body.status, 'terkirim', 'terkirim penuh, belum difakturkan');
  assert.equal((await admin.get(`/api/e/sales_orders/${so.id}`)).body.delivered_pct, 100);
  assert.equal((await admin.post(`/api/e/sales_orders/${so.id}/actions/to_delivery`, { date: '2026-10-07', mode: 'sisa' })).status, 409, 'tidak ada sisa');

  // Daftar DO belum difakturkan untuk pelanggan → faktur gabungan.
  const un = (await admin.get(`/api/deliveries/uninvoiced?customer=${id('customers', 'C004')}`)).body;
  assert.ok(un.some((d) => d.id === do1.id) && un.some((d) => d.id === do2.id));
  const inv = await admin.post('/api/deliveries/invoice', { delivery_ids: [do1.id, do2.id], date: '2026-10-07' });
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  const iv = (await admin.get(`/api/e/sales_invoices/${inv.body.id}`)).body;
  assert.equal(iv.lines.length, 2); assert.equal(iv.subtotal, 22_500_000); assert.equal(iv.total, 24_975_000);
  assert.equal(iv.sales_order_id, so.id);
  assert.equal((await admin.post('/api/deliveries/invoice', { delivery_ids: [do1.id] })).status, 409, 'DO tidak dapat difakturkan dua kali');
  assert.equal((await admin.put(`/api/e/sales_invoices/${iv.id}`, { row_version: iv.row_version, lines: [{ product_id: prod('FG-102'), qty: 1, price: 1 }] })).status, 400, 'baris faktur dari DO terkunci');
  assert.equal(arOf('C004'), ar0, 'faktur draf belum mengakui piutang');

  // Terbitkan → piutang, pendapatan, PPN, HPP diakui; persediaan terkirim dikosongkan; stok tidak keluar lagi.
  const post = await osmond.post(`/api/e/sales_invoices/${iv.id}/actions/post`);
  assert.equal(post.status, 200, JSON.stringify(post.body));
  assert.equal(arOf('C004') - ar0, 24_975_000, 'piutang = total faktur');
  near(glOf('1-1350'), unb0, 'persediaan terkirim kembali ke saldo awal');
  assert.equal(stock('FG-102'), st0 - 10, 'stok tidak dikurangi dua kali');
  const jl = db.all("SELECT a.code, l.debit, l.credit FROM journal_lines l JOIN accounts a ON a.id = l.account_id JOIN journals j ON j.id = l.parent_id WHERE j.source_type = 'sales_invoices' AND j.source_id = ?", iv.id);
  near(jl.filter((l) => l.code === '5-1100').reduce((s, l) => s + l.debit, 0), cost1 + s2.body.record.cost, 'HPP = nilai pokok kedua DO');
  assert.equal((await admin.get(`/api/e/delivery_orders/${do1.id}`)).body.status, 'difakturkan');
  assert.equal((await admin.get(`/api/e/sales_orders/${so.id}`)).body.status, 'selesai');
  balanced();
});

test('skenario 2: SO penuh → DO penuh → faktur dari satu DO; batal faktur mengembalikan DO, batal DO mengembalikan stok', async () => {
  const so = await approvedSo('C001', [{ product_id: prod('FG-101'), qty: 3, price: 4_850_000 }, { product_id: prod('SV-301'), qty: 8, price: 350_000 }]);
  const st0 = stock('FG-101'), ar0 = arOf('C001'), unb0 = glOf('1-1350');
  const r = await toDelivery(so.id);
  const s = await ship(r.redirect.id);
  assert.equal(s.body.record.status, 'dikirim');
  assert.equal(stock('FG-101'), st0 - 3);
  assert.equal((await admin.get(`/api/e/sales_orders/${so.id}`)).body.status, 'terkirim');
  assert.equal((await admin.post(`/api/e/sales_orders/${so.id}/actions/to_invoice`)).status, 409, 'faktur langsung tidak boleh bila sudah ada DO');
  const inv = await admin.post(`/api/e/delivery_orders/${r.redirect.id}/actions/to_invoice`);
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  const invId = inv.body.redirect.id;
  await osmond.post(`/api/e/sales_invoices/${invId}/actions/post`);
  near(arOf('C001') - ar0, (3 * 4_850_000 + 8 * 350_000) * 1.11, 'piutang faktur DO');
  // Batal faktur: piutang & HPP dibalik, barang tetap di pelanggan (DO kembali "dikirim").
  const v = await osmond.post(`/api/e/sales_invoices/${invId}/actions/void`);
  assert.equal(v.status, 200, JSON.stringify(v.body));
  assert.equal(arOf('C001'), ar0);
  assert.equal(stock('FG-101'), st0 - 3, 'stok tidak kembali saat faktur DO dibatalkan');
  const d = (await admin.get(`/api/e/delivery_orders/${r.redirect.id}`)).body;
  assert.equal(d.status, 'dikirim'); assert.equal(d.invoice_id, null);
  near(glOf('1-1350') - unb0, d.cost, 'nilai kembali ke persediaan terkirim');
  // Batal DO: stok kembali, jurnal dibalik, SO kembali disetujui.
  const vd = await osmond.post(`/api/e/delivery_orders/${d.id}/actions/void`);
  assert.equal(vd.status, 200, JSON.stringify(vd.body));
  assert.equal(stock('FG-101'), st0);
  near(glOf('1-1350'), unb0, 'persediaan terkirim kembali');
  assert.equal((await admin.get(`/api/e/sales_orders/${so.id}`)).body.status, 'disetujui');
  balanced();
});

test('skenario 3: beberapa SO dikirim penuh → satu faktur gabungan; aturan penggabungan', async () => {
  const soA = await approvedSo('C002', [{ product_id: prod('FG-102'), qty: 2, price: 2_250_000 }]);
  const soB = await approvedSo('C002', [{ product_id: prod('FG-103'), qty: 50, price: 180_000 }]);
  const dA = (await toDelivery(soA.id)).redirect.id, dB = (await toDelivery(soB.id)).redirect.id;
  // Faktur hanya dari DO yang sudah dikirim.
  assert.equal((await admin.post('/api/deliveries/invoice', { delivery_ids: [dA] })).status, 409);
  await ship(dA); await ship(dB);
  // Pelanggan lain tidak boleh digabung.
  const soX = await approvedSo('C008', [{ product_id: prod('FG-102'), qty: 1, price: 2_250_000 }]);
  const dX = (await toDelivery(soX.id)).redirect.id;
  await ship(dX);
  assert.equal((await admin.post('/api/deliveries/invoice', { delivery_ids: [dA, dX] })).status, 400, 'pelanggan berbeda ditolak');
  const ar0 = arOf('C002');
  const inv = await admin.post('/api/deliveries/invoice', { delivery_ids: [dA, dB], date: '2026-10-07' });
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  const iv = (await admin.get(`/api/e/sales_invoices/${inv.body.id}`)).body;
  assert.equal(iv.sales_order_id, null, 'lebih dari satu SO');
  assert.match(iv.notes, new RegExp(`${soA.number}.*${soB.number}`));
  assert.equal(iv.subtotal, 4_500_000 + 9_000_000);
  // Hapus draf faktur → DO bebas difakturkan lagi.
  assert.equal((await admin.del(`/api/e/sales_invoices/${iv.id}`)).status, 200);
  assert.equal((await admin.get(`/api/e/delivery_orders/${dA}`)).body.invoice_id, null);
  const inv2 = await admin.post('/api/deliveries/invoice', { delivery_ids: [dA, dB], date: '2026-10-07' });
  await osmond.post(`/api/e/sales_invoices/${inv2.body.id}/actions/post`);
  near(arOf('C002') - ar0, 13_500_000 * 1.11, 'piutang faktur gabungan');
  for (const so of [soA, soB]) assert.equal((await admin.get(`/api/e/sales_orders/${so.id}`)).body.status, 'selesai');
  // Retur penjualan dari faktur DO memakai biaya pokok DO.
  const ret = await admin.post('/api/e/sales_returns', { branch_id: id('branches', 'JKT'), date: '2026-10-07', sales_invoice_id: inv2.body.id, warehouse_id: WH(), reason: 'Barang rusak saat pengiriman', lines: [{ product_id: prod('FG-103'), qty: 5 }] });
  assert.equal(ret.status, 200, JSON.stringify(ret.body));
  assert.equal((await osmond.post(`/api/e/sales_returns/${ret.body.id}/actions/post`)).status, 200);
  balanced();
});

test('laporan pemenuhan: pesanan terbuka & DO belum difakturkan cocok dengan buku besar; hak akses & cakupan', async () => {
  const r = await admin.get('/api/reports/pemenuhan?to=2026-10-07');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.reconciled, `DO belum difakturkan (${r.body.totals.unbilledCost}) = saldo 1-1350 (${r.body.glBalance})`);
  assert.ok(r.body.unbilled.length >= 1 && r.body.orders.length >= 1);
  assert.equal((await (await as('dewi.hr')).get('/api/reports/pemenuhan')).status, 403);
  // Neraca saldo & persediaan tetap seimbang/terekonsiliasi.
  for (const rep of ['neraca', 'persediaan', 'umur-piutang']) {
    const x = (await admin.get(`/api/reports/${rep}?to=2026-12-31`)).body;
    assert.ok(x.balanced !== false && x.reconciled !== false, rep);
  }
  // Anti-IDOR: DO perusahaan lain tidak dapat difakturkan dari konteks NLP.
  const d = db.get("SELECT id FROM delivery_orders WHERE company_id = 1 AND status = 'dikirim' AND invoice_id IS NULL LIMIT 1");
  const res = await admin.post(`/api/deliveries/invoice?company=${id('companies', 'NLP')}`, { delivery_ids: [d.id] });
  assert.ok([403, 404].includes(res.status), `status ${res.status}`);
});
