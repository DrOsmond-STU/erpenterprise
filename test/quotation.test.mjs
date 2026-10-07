/* Uji penawaran ke pelanggan sebelum pesanan penjualan: kebijakan harga & persetujuan,
   kirim, tanggapan pelanggan (internal & portal), revisi, kedaluwarsa, konversi ke SO,
   kebijakan "SO wajib dari penawaran", dan analisis penawaran. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db } from './helpers.mjs';

let admin, osmond, sari, portal;
const id = (table, code, field = 'code') => db.get(`SELECT id FROM ${table} WHERE ${field} = ?`, code).id;
const prod = (code) => id('products', code);

before(async () => {
  await start();
  admin = await as('admin');
  osmond = await as('osmond');
  sari = await as('sari.sales');
  portal = await as('portal.astra');
  await admin.put('/api/settings/security_policy', { apiRateLimitPerMinute: 100000, loginRateLimitPerMinute: 1000 });
});
after(stop);

const newQuote = (who, body = {}) => who.post('/api/e/quotations', { date: '2026-10-07', customer_id: id('customers', 'C001'), tax_rate: 11, lines: [{ product_id: prod('FG-102'), qty: 10, price: 2_250_000 }], ...body });
const act = (who, qid, a, p = {}) => who.post(`/api/e/quotations/${qid}/actions/${a}`, p);

test('penawaran baru: masa berlaku, termin, UP dari pelanggan; estimasi margin & diskon dihitung', async () => {
  const q = await newQuote(sari, { lines: [{ product_id: prod('FG-102'), qty: 10, price: 2_250_000, discount_pct: 5 }] });
  assert.equal(q.status, 200, JSON.stringify(q.body));
  assert.equal(q.body.status, 'draf');
  assert.equal(q.body.valid_until, '2026-11-06', 'berlaku 30 hari');
  assert.equal(q.body.terms_days, db.get("SELECT terms_days FROM customers WHERE code = 'C001'").terms_days);
  assert.equal(q.body.max_discount, 5);
  const cost = db.get("SELECT standard_cost FROM products WHERE code = 'FG-102'").standard_cost * 10;
  assert.equal(q.body.est_cost, cost);
  assert.ok(Math.abs(q.body.est_margin - ((q.body.subtotal - cost) / q.body.subtotal * 100)) < 0.01);
  assert.equal((await newQuote(sari, { valid_until: '2026-10-01' })).status, 400, 'berlaku sebelum tanggal penawaran ditolak');
});

test('kebijakan harga: diskon di atas batas menunggu persetujuan; pembuat tidak dapat menyetujui; draf tidak tampil di portal', async () => {
  const q = await newQuote(sari, { lines: [{ product_id: prod('FG-102'), qty: 10, price: 2_250_000, discount_pct: 20 }] });
  const s = await act(sari, q.body.id, 'submit');
  assert.equal(s.body.record.status, 'menunggu');
  assert.match(s.body.record.approval_note, /diskon 20% > batas 10%/);
  assert.equal((await act(sari, q.body.id, 'send')).status, 409, 'belum disetujui → belum dapat dikirim');
  const inbox = (await osmond.get('/api/approvals')).body;
  assert.ok(inbox.some((x) => x.entity === 'quotations' && x.id === q.body.id), 'muncul di Kotak Persetujuan');
  assert.equal((await portal.get(`/api/portal/docs/quotations/${q.body.id}`)).status, 404, 'portal tidak melihat penawaran internal');
  assert.equal((await act(sari, q.body.id, 'approve')).status, 403);
  const ap = await act(osmond, q.body.id, 'approve');
  assert.equal(ap.body.record.status, 'disetujui');
  // Dikembalikan ke draf oleh penyetuju.
  const q2 = await newQuote(sari, { lines: [{ product_id: prod('FG-102'), qty: 10, price: 2_250_000, discount_pct: 25 }] });
  await act(sari, q2.body.id, 'submit');
  const back = await act(osmond, q2.body.id, 'return_draft', { reason: 'Diskon maksimal 15%' });
  assert.equal(back.body.record.status, 'draf');
  // Penawaran sesuai kebijakan disetujui otomatis.
  const q3 = await newQuote(sari);
  assert.equal((await act(sari, q3.body.id, 'submit')).body.record.status, 'disetujui');
});

test('kirim → pelanggan menerima via portal (nama & PO) → buat pesanan penjualan membawa data penawaran', async () => {
  const q = await newQuote(sari, { project_id: id('projects', 'PRJ-01'), lead_time_days: 10, delivery_terms: 'Franco Sunter' });
  await act(sari, q.body.id, 'submit');
  const sent = await act(sari, q.body.id, 'send', { sent_to: 'pengadaan@astra.example.co.id' });
  assert.equal(sent.body.record.status, 'terkirim');
  assert.equal(sent.body.record.sent_at, '2026-10-07');
  // Portal: rincian tanpa data internal.
  const doc = await portal.get(`/api/portal/docs/quotations/${q.body.id}`);
  assert.equal(doc.status, 200);
  assert.equal(doc.body.canRespond, true);
  assert.equal(doc.body.delivery_terms, 'Franco Sunter');
  for (const k of ['est_margin', 'est_cost', 'approval_note', 'max_discount', 'sent_to']) assert.equal(doc.body[k], undefined, `${k} tidak boleh bocor ke portal`);
  assert.equal((await portal.post(`/api/portal/quotations/${q.body.id}/respond`, { decision: 'accept' })).status, 400, 'nama wajib');
  const ok = await portal.post(`/api/portal/quotations/${q.body.id}/respond`, { decision: 'accept', name: 'Budi Hartono', customer_po: 'PO-AKI-7781' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await portal.post(`/api/portal/quotations/${q.body.id}/respond`, { decision: 'reject', name: 'X' })).status, 409, 'tidak dapat ditanggapi dua kali');
  const rec = (await sari.get(`/api/e/quotations/${q.body.id}`)).body;
  assert.equal(rec.status, 'diterima');
  assert.match(rec.accepted_by, /Budi Hartono/);
  assert.equal(rec.customer_po, 'PO-AKI-7781');
  assert.ok(db.get("SELECT id FROM audit_log WHERE action = 'portal.quotation.accept' AND entity_id = ?", q.body.id), 'tanggapan portal teraudit');

  const so = await act(sari, q.body.id, 'to_order', {});
  assert.equal(so.status, 200, JSON.stringify(so.body));
  const s = (await sari.get(`/api/e/sales_orders/${so.body.redirect.id}`)).body;
  assert.equal(s.quotation_id, q.body.id);
  assert.equal(s.customer_po, 'PO-AKI-7781');
  assert.equal(s.project_id, id('projects', 'PRJ-01'));
  assert.equal(s.total, q.body.total);
  assert.equal(s.delivery_date, '2026-10-17', 'tanggal kirim = hari ini + waktu penyerahan');
  const after = (await sari.get(`/api/e/quotations/${q.body.id}`)).body;
  assert.equal(after.status, 'selesai');
  assert.equal(after.sales_order_id, s.id);
  // Pesanan draf dihapus → penawaran kembali dapat dikonversi.
  assert.equal((await sari.del(`/api/e/sales_orders/${s.id}`)).status, 200);
  assert.equal((await sari.get(`/api/e/quotations/${q.body.id}`)).body.status, 'diterima');
});

test('pelanggan menolak via portal dengan alasan; portal pelanggan lain tidak dapat menanggapi', async () => {
  const q = await newQuote(sari);
  await act(sari, q.body.id, 'submit');
  await act(sari, q.body.id, 'send');
  const r = await portal.post(`/api/portal/quotations/${q.body.id}/respond`, { decision: 'reject', name: 'Budi Hartono', lost_reason: 'harga', note: 'Anggaran kami 10% lebih rendah' });
  assert.equal(r.status, 200);
  const rec = (await sari.get(`/api/e/quotations/${q.body.id}`)).body;
  assert.equal(rec.status, 'ditolak'); assert.equal(rec.lost_reason, 'harga');
  const other = await newQuote(sari, { customer_id: id('customers', 'C002') });
  await act(sari, other.body.id, 'submit');
  await act(sari, other.body.id, 'send');
  assert.equal((await portal.post(`/api/portal/quotations/${other.body.id}/respond`, { decision: 'accept', name: 'Penyusup' })).status, 404, 'anti-IDOR');
  const supplier = await as('portal.krakatau');
  assert.equal((await supplier.post(`/api/portal/quotations/${q.body.id}/respond`, { decision: 'accept', name: 'X' })).status, 403);
  // Penolakan internal (dicatat tenaga penjual).
  const q2 = await newQuote(sari);
  await act(sari, q2.body.id, 'submit'); await act(sari, q2.body.id, 'send');
  const rj = await act(sari, q2.body.id, 'reject', { lost_reason: 'pesaing', note: 'Kalah harga' });
  assert.equal(rj.body.record.status, 'ditolak');
});

test('revisi penawaran: nomor -R1/-R2, tautan ke versi sebelumnya, versi lama ditandai direvisi', async () => {
  const q = await newQuote(sari);
  await act(sari, q.body.id, 'submit'); await act(sari, q.body.id, 'send');
  const r1 = await act(sari, q.body.id, 'revise');
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const v1 = (await sari.get(`/api/e/quotations/${r1.body.redirect.id}`)).body;
  assert.equal(v1.number, `${q.body.number}-R1`); assert.equal(v1.revision, 1); assert.equal(v1.revised_from, q.body.id);
  assert.equal(v1.status, 'draf'); assert.equal(v1.lines.length, 1);
  assert.equal((await sari.get(`/api/e/quotations/${q.body.id}`)).body.status, 'direvisi');
  await act(sari, v1.id, 'submit');
  const r2 = await act(sari, v1.id, 'revise');
  assert.equal((await sari.get(`/api/e/quotations/${r2.body.redirect.id}`)).body.number, `${q.body.number}-R2`);
});

test('penawaran lewat masa berlaku otomatis kedaluwarsa dan tidak dapat diterima', async () => {
  const q = await newQuote(sari);
  await act(sari, q.body.id, 'submit'); await act(sari, q.body.id, 'send');
  db.run("UPDATE quotations SET valid_until = '2026-10-01' WHERE id = ?", q.body.id);
  assert.equal((await sari.get(`/api/e/quotations/${q.body.id}`)).body.status, 'kedaluwarsa');
  assert.equal((await act(sari, q.body.id, 'accept', { accepted_by: 'X' })).status, 409);
  assert.equal((await portal.post(`/api/portal/quotations/${q.body.id}/respond`, { decision: 'accept', name: 'X' })).status, 409);
  const rv = await act(sari, q.body.id, 'revise');
  assert.equal(rv.status, 200, 'kedaluwarsa dapat direvisi');
});

test('kebijakan: pesanan penjualan tanpa penawaran ditolak (kecuali antar perusahaan); penyimpangan harga perlu persetujuan', async () => {
  const wh = id('warehouses', 'WH-JKT');
  const so = await sari.post('/api/e/sales_orders', { date: '2026-10-07', customer_id: id('customers', 'C001'), warehouse_id: wh, lines: [{ product_id: prod('FG-102'), qty: 1, price: 2_250_000 }] });
  const sub = await sari.post(`/api/e/sales_orders/${so.body.id}/actions/submit`);
  assert.equal(sub.status, 400);
  assert.match(sub.body.error, /harus dibuat dari penawaran/);
  const ic = db.get('SELECT id FROM customers WHERE related_company_id IS NOT NULL AND company_id = 1 LIMIT 1');
  if (ic) {
    const so2 = await admin.post('/api/e/sales_orders', { branch_id: id('branches', 'JKT'), date: '2026-10-07', customer_id: ic.id, warehouse_id: wh, lines: [{ product_id: prod('FG-102'), qty: 1, price: 2_250_000 }] });
    assert.equal((await admin.post(`/api/e/sales_orders/${so2.body.id}/actions/submit`)).status, 200, 'antar perusahaan dikecualikan');
  }
  // Pesanan dari penawaran, lalu harga diturunkan → menunggu persetujuan.
  const q = await newQuote(sari);
  await act(sari, q.body.id, 'submit'); await act(sari, q.body.id, 'send');
  await act(sari, q.body.id, 'accept', { accepted_by: 'Budi' });
  const conv = await act(sari, q.body.id, 'to_order', {});
  const s = (await sari.get(`/api/e/sales_orders/${conv.body.redirect.id}`)).body;
  await sari.put(`/api/e/sales_orders/${s.id}`, { row_version: s.row_version, lines: [{ product_id: prod('FG-102'), qty: 10, price: 2_000_000 }] });
  const sub2 = await sari.post(`/api/e/sales_orders/${s.id}/actions/submit`);
  assert.equal(sub2.body.record.status, 'menunggu');
  assert.match(sub2.body.record.approval_note, /Berbeda dari penawaran .*harga FG-102 di bawah penawaran/);
  // Kebijakan dapat dimatikan administrator.
  await admin.put('/api/settings/approval_policy', { soRequiresQuotation: false });
  assert.equal((await sari.post(`/api/e/sales_orders/${so.body.id}/actions/submit`)).status, 200);
  await admin.put('/api/settings/approval_policy', { soRequiresQuotation: true });
});

test('analisis penawaran: corong, tingkat menang, alasan kalah, hak akses', async () => {
  const r = await sari.get('/api/reports/penawaran?from=2026-01-01&to=2026-12-31');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const k = r.body.kpis;
  const n = r.body.funnel.filter((f) => !['direvisi', 'batal'].includes(f.status)).reduce((s, f) => s + f.n, 0);
  assert.equal(k.count, n, 'jumlah corong = KPI');
  assert.ok(k.won >= 10 && k.winRate > 0 && k.winRate < 100);
  assert.ok(k.avgResponseDays > 0, 'rata-rata waktu tanggapan pelanggan');
  assert.ok(r.body.reasons.some((x) => x.reason === 'harga'));
  assert.ok(r.body.funnel.find((f) => f.status === 'kedaluwarsa').n >= 1, 'penawaran demo yang lewat masa berlaku kedaluwarsa');
  assert.ok(r.body.people.length >= 1);
  const hr = await as('dewi.hr');
  assert.equal((await hr.get('/api/reports/penawaran')).status, 403);
});

test('konversi lead CRM menghasilkan penawaran berisi kontak & masa berlaku', async () => {
  const lead = db.get("SELECT id FROM leads WHERE stage = 'negosiasi' LIMIT 1");
  const r = await admin.post(`/api/e/leads/${lead.id}/actions/convert`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const q = (await admin.get(`/api/e/quotations/${r.body.redirect.id}`)).body;
  assert.ok(q.valid_until > q.date); assert.ok(q.salesperson); assert.equal(q.revision, 0);
});
