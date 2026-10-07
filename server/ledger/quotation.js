/* ==========================================================================
   Penawaran ke pelanggan: kedaluwarsa otomatis, tanggapan pelanggan lewat
   portal, dan analisis penawaran (corong, tingkat menang, alasan kalah).
   ========================================================================== */
import * as db from '../db.js';
import * as audit from '../security/audit.js';
import { bad, conflict, notFound, round2, today, nowIso } from '../lib/util.js';

/** Tandai penawaran disetujui/terkirim yang lewat masa berlaku sebagai kedaluwarsa (idempoten). */
export function expireQuotations() {
  const due = db.all("SELECT id, company_id, branch_id, number, valid_until FROM quotations WHERE status IN ('disetujui','terkirim') AND valid_until IS NOT NULL AND valid_until < ?", today());
  if (!due.length) return 0;
  db.tx(() => {
    for (const q of due) {
      db.run("UPDATE quotations SET status = 'kedaluwarsa', updated_at = ?, row_version = row_version + 1 WHERE id = ?", nowIso(), q.id);
      audit.log({ username: 'sistem' }, 'action.expire', { entity: 'quotations', entityId: q.id, companyId: q.company_id, branchId: q.branch_id, detail: { number: q.number, valid_until: q.valid_until } });
    }
  });
  return due.length;
}

/**
 * Tanggapan pelanggan dari portal: terima (nama penyetuju + no. PO opsional) atau tolak (alasan).
 * Hanya penawaran milik pelanggan akun portal, berstatus terkirim, dan belum kedaluwarsa.
 */
export function portalRespond(ctx, party, id, body = {}) {
  expireQuotations();
  const q = db.get('SELECT * FROM quotations WHERE id = ? AND customer_id = ?', Number(id), party.id);
  if (!q) throw notFound();
  if (q.status === 'kedaluwarsa') throw conflict('Penawaran sudah kedaluwarsa. Hubungi tenaga penjual kami untuk revisi.');
  if (q.status !== 'terkirim') throw conflict('Penawaran ini sudah ditanggapi atau tidak lagi berlaku.');
  const decision = body.decision;
  const name = String(body.name || '').trim().slice(0, 120);
  if (!['accept', 'reject'].includes(decision)) throw bad('Keputusan harus "accept" atau "reject".');
  if (!name) throw bad('Nama penanggung jawab wajib diisi.');
  const actor = `${name} (portal: ${ctx.user.username})`;
  db.tx(() => {
    if (decision === 'accept') {
      db.run("UPDATE quotations SET status = 'diterima', responded_at = ?, accepted_by = ?, customer_po = ?, updated_at = ?, updated_by = ?, row_version = row_version + 1 WHERE id = ?",
        today(), actor.slice(0, 200), body.customer_po ? String(body.customer_po).trim().slice(0, 60) : null, nowIso(), ctx.user.id, q.id);
    } else {
      const reason = ['harga', 'waktu', 'spesifikasi', 'pesaing', 'anggaran', 'ditunda', 'lainnya'].includes(body.lost_reason) ? body.lost_reason : 'lainnya';
      const note = String(body.note || '').trim().slice(0, 500);
      db.run("UPDATE quotations SET status = 'ditolak', responded_at = ?, lost_reason = ?, notes = ?, updated_at = ?, updated_by = ?, row_version = row_version + 1 WHERE id = ?",
        today(), reason, `${q.notes ? `${q.notes}\n` : ''}Ditolak pelanggan via portal oleh ${actor}${note ? `: ${note}` : ''}`.slice(0, 2000), nowIso(), ctx.user.id, q.id);
    }
    audit.log(ctx, `portal.quotation.${decision}`, { entity: 'quotations', entityId: q.id, companyId: q.company_id, branchId: q.branch_id, detail: { number: q.number, name, customer_po: body.customer_po || null, lost_reason: body.lost_reason || null } });
  });
  return { ok: true, status: decision === 'accept' ? 'diterima' : 'ditolak' };
}

/** Analisis penawaran periode: corong status, tingkat menang, waktu tanggapan, per tenaga penjual, alasan kalah, segera kedaluwarsa. */
export function quotationReport(ctx, { companyId, branchId, from, to }) {
  expireQuotations();
  const where = ['q.company_id = ?', 'q.date BETWEEN ? AND ?'], params = [companyId, from, to];
  if (branchId) { where.push('q.branch_id = ?'); params.push(branchId); }
  const rows = db.all(`SELECT q.id, q.number, q.date, q.valid_until, q.status, q.salesperson, q.sent_at, q.responded_at, q.lost_reason, q.est_margin, q.revision,
      ROUND(q.subtotal * COALESCE(q.exchange_rate,1), 2) value, c.name customer
    FROM quotations q JOIN customers c ON c.id = q.customer_id WHERE ${where.join(' AND ')} ORDER BY q.date DESC, q.id DESC`, ...params);
  const live = rows.filter((r) => !['direvisi', 'batal'].includes(r.status));
  const won = (r) => ['diterima', 'selesai'].includes(r.status);
  const lost = (r) => ['ditolak', 'kedaluwarsa'].includes(r.status);
  const sumv = (xs) => round2(xs.reduce((s, r) => s + (r.value || 0), 0));
  const decided = live.filter((r) => won(r) || lost(r));
  const days = live.filter((r) => r.sent_at && r.responded_at).map((r) => (Date.parse(r.responded_at) - Date.parse(r.sent_at)) / 864e5);
  const funnel = [
    ['draf', 'Draf'], ['menunggu', 'Menunggu persetujuan harga'], ['disetujui', 'Siap dikirim'], ['terkirim', 'Terkirim, menunggu pelanggan'],
    ['diterima', 'Diterima (belum jadi SO)'], ['selesai', 'Menjadi pesanan penjualan'], ['ditolak', 'Ditolak pelanggan'], ['kedaluwarsa', 'Kedaluwarsa'], ['direvisi', 'Direvisi'], ['batal', 'Batal'],
  ].map(([status, label]) => ({ status, label, n: rows.filter((r) => r.status === status).length, value: sumv(rows.filter((r) => r.status === status)) }));
  const people = [...new Set(live.map((r) => r.salesperson || '—'))].map((sp) => {
    const xs = live.filter((r) => (r.salesperson || '—') === sp);
    const d = xs.filter((r) => won(r) || lost(r));
    return { salesperson: sp, n: xs.length, value: sumv(xs), won: xs.filter(won).length, wonValue: sumv(xs.filter(won)), lost: xs.filter(lost).length, open: xs.filter((r) => r.status === 'terkirim').length, winRate: d.length ? round2(xs.filter(won).length / d.length * 100) : null };
  }).sort((a, b) => b.value - a.value);
  const reasons = {};
  for (const r of live.filter((x) => x.status === 'ditolak')) reasons[r.lost_reason || 'lainnya'] = (reasons[r.lost_reason || 'lainnya'] || 0) + 1;
  const in7 = new Date(Date.parse(today() + 'T00:00:00Z') + 7 * 864e5).toISOString().slice(0, 10);
  const expiring = db.all(`SELECT q.id, q.number, q.valid_until, q.salesperson, ROUND(q.subtotal * COALESCE(q.exchange_rate,1),2) value, c.name customer FROM quotations q JOIN customers c ON c.id = q.customer_id
    WHERE q.company_id = ? AND q.status IN ('disetujui','terkirim') AND q.valid_until BETWEEN ? AND ?${branchId ? ' AND q.branch_id = ?' : ''} ORDER BY q.valid_until`, companyId, today(), in7, ...(branchId ? [branchId] : []));
  return {
    title: 'Analisis Penawaran', period: { from, to },
    kpis: {
      count: live.length, value: sumv(live), won: live.filter(won).length, wonValue: sumv(live.filter(won)),
      open: live.filter((r) => r.status === 'terkirim').length, openValue: sumv(live.filter((r) => r.status === 'terkirim')),
      winRate: decided.length ? round2(live.filter(won).length / decided.length * 100) : null,
      valueWinRate: sumv(decided) ? round2(sumv(live.filter(won)) / sumv(decided) * 100) : null,
      avgResponseDays: days.length ? round2(days.reduce((s, x) => s + x, 0) / days.length) : null,
      conversion: live.filter(won).length ? round2(live.filter((r) => r.status === 'selesai').length / live.filter(won).length * 100) : null,
      avgMargin: live.length ? round2(live.reduce((s, r) => s + (r.est_margin || 0), 0) / live.length) : null,
    },
    funnel, people, reasons: Object.entries(reasons).map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n), expiring,
    rows: rows.slice(0, 300),
  };
}

