/* ==========================================================================
   Mesin posting buku besar (double-entry).
   - Setiap jurnal wajib seimbang (Σ debit = Σ kredit).
   - Hanya akun detail yang aktif yang menerima posting.
   - Periode tertutup menolak posting.
   - Jurnal lintas cabang otomatis diseimbangkan per cabang melalui akun
     Rekening Antar Cabang (RAK), sehingga neraca setiap cabang tetap seimbang.
   - Jurnal terposting tidak dapat diubah/dihapus (trigger DB); koreksi
     dilakukan dengan jurnal pembalik.
   ========================================================================== */
import * as db from '../db.js';
import { accountMap } from '../lib/settings.js';
import { bad, round2, nowIso, isDate, monthEnd } from '../lib/util.js';

const EPS = 0.005;
const acctCache = new Map();
export const clearAccountCache = () => acctCache.clear();

export function accountByCode(code) {
  if (acctCache.has(code)) return acctCache.get(code);
  const a = db.get('SELECT * FROM accounts WHERE code = ?', code);
  if (!a) throw bad(`Akun ${code} belum ada di bagan akun. Periksa Pengaturan → Pemetaan akun.`);
  acctCache.set(code, a);
  return a;
}

/** id akun dari kunci pemetaan (mis. 'ar', 'vat_out'). */
export const acct = (key) => accountByCode(accountMap()[key]).id;

/* --- Penomoran dokumen ------------------------------------------------------ */
export function nextNumber(prefix, companyId, date) {
  const year = String(date || new Date().toISOString()).slice(0, 4);
  const key = `${prefix}:${companyId}:${year}`;
  db.run('INSERT INTO sequences(key, last) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET last = last + 1', key);
  const { last } = db.get('SELECT last FROM sequences WHERE key = ?', key);
  return `${prefix}-${year}-${String(last).padStart(5, '0')}`;
}

/* --- Periode ------------------------------------------------------------------ */
export function assertPeriodOpen(companyId, date) {
  if (!isDate(date)) throw bad('Tanggal jurnal tidak valid.');
  let p = db.get('SELECT * FROM fiscal_periods WHERE company_id = ? AND start_date <= ? AND end_date >= ?', companyId, date, date);
  if (!p) {
    const [y, m] = date.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    db.insert('fiscal_periods', { company_id: companyId, name: `${y}-${String(m).padStart(2, '0')}`, start_date: start, end_date: monthEnd(y, m), status: 'terbuka', created_at: nowIso() });
    return;
  }
  if (p.status !== 'terbuka') throw bad(`Periode ${p.name} sudah ditutup; posting tidak diizinkan.`);
}

/* --- Validasi & penyeimbangan ----------------------------------------------- */
function prepareLines(companyId, headerBranchId, lines) {
  const out = [];
  for (const l of lines) {
    const debit = round2(l.debit || 0), credit = round2(l.credit || 0);
    if (debit < 0 || credit < 0) throw bad('Nilai debit/kredit tidak boleh negatif.');
    if (debit > 0 && credit > 0) throw bad('Satu baris jurnal tidak boleh berisi debit dan kredit sekaligus.');
    if (debit === 0 && credit === 0) continue;
    const a = db.get('SELECT id, code, is_header, status FROM accounts WHERE id = ?', l.account_id);
    if (!a) throw bad('Akun jurnal tidak ditemukan.');
    if (a.is_header) throw bad(`Akun ${a.code} adalah akun induk; gunakan akun detail.`);
    if (a.status !== 'aktif') throw bad(`Akun ${a.code} nonaktif.`);
    const branchId = l.branch_id || headerBranchId;
    const b = db.get('SELECT company_id FROM branches WHERE id = ?', branchId);
    if (!b || b.company_id !== companyId) throw bad('Cabang pada baris jurnal tidak berada di perusahaan yang sama.');
    out.push({ ...l, debit, credit, branch_id: branchId });
  }
  if (out.length < 2) throw bad('Jurnal minimal memiliki dua baris bernilai.');
  const td = round2(out.reduce((s, l) => s + l.debit, 0));
  const tc = round2(out.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(td - tc) > EPS) throw bad(`Jurnal tidak seimbang: debit ${td.toLocaleString('id-ID')} ≠ kredit ${tc.toLocaleString('id-ID')}.`);

  // Penyeimbang antar cabang (RAK).
  const per = new Map();
  for (const l of out) per.set(l.branch_id, round2((per.get(l.branch_id) || 0) + l.debit - l.credit));
  const rak = acct('inter_branch');
  for (const [branchId, net] of per) {
    if (Math.abs(net) > EPS) {
      out.push({ account_id: rak, branch_id: branchId, debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0, memo: 'Rekening antar cabang (otomatis)', is_system: 1 });
    }
  }
  return { lines: out, total: td };
}

function insertLines(journalId, companyId, lines) {
  lines.forEach((l, i) => db.insert('journal_lines', {
    parent_id: journalId, line_no: i + 1, account_id: l.account_id, branch_id: l.branch_id, company_id: companyId,
    debit: l.debit, credit: l.credit, memo: l.memo ? String(l.memo).slice(0, 300) : null,
    cost_center_id: l.cost_center_id || null, project_id: l.project_id || null,
    partner_type: l.partner_type || null, partner_id: l.partner_id || null, is_system: l.is_system ? 1 : 0,
  }));
}

/** Membuat dan langsung memposting jurnal otomatis dari dokumen sumber. */
export function postJournal(ctx, j) {
  return db.tx(() => {
    assertPeriodOpen(j.companyId, j.date);
    const { lines, total } = prepareLines(j.companyId, j.branchId, j.lines);
    const id = db.insert('journals', {
      company_id: j.companyId, branch_id: j.branchId, number: nextNumber('JU', j.companyId, j.date), date: j.date,
      description: String(j.description || '').slice(0, 300), reference: j.reference || null,
      source_type: j.sourceType || 'manual', source_id: j.sourceId || null, source_no: j.sourceNo || null,
      total, reversal_of: j.reversalOf || null, status: 'draf',
      created_at: nowIso(), created_by: ctx.user?.id ?? null,
    });
    insertLines(id, j.companyId, lines);
    db.run("UPDATE journals SET status = 'diposting', posted_at = ?, posted_by = ?, approved_by = ? WHERE id = ?", nowIso(), ctx.user?.id ?? null, ctx.user?.id ?? null, id);
    return id;
  });
}

/** Memposting jurnal manual (draf/diajukan) yang sudah ada. */
export function postExistingJournal(ctx, journalId) {
  return db.tx(() => {
    const j = db.get('SELECT * FROM journals WHERE id = ?', journalId);
    assertPeriodOpen(j.company_id, j.date);
    const raw = db.all('SELECT * FROM journal_lines WHERE parent_id = ? ORDER BY line_no', journalId);
    const { lines, total } = prepareLines(j.company_id, j.branch_id, raw);
    db.run('DELETE FROM journal_lines WHERE parent_id = ?', journalId);
    insertLines(journalId, j.company_id, lines);
    db.run("UPDATE journals SET status = 'diposting', total = ?, posted_at = ?, posted_by = ?, approved_by = ?, source_type = COALESCE(source_type, 'manual') WHERE id = ?", total, nowIso(), ctx.user.id, ctx.user.id, journalId);
  });
}

/** Validasi tanpa posting (untuk pengajuan jurnal manual). */
export function validateJournalLines(companyId, branchId, lines) {
  return prepareLines(companyId, branchId, lines);
}

export function reverseJournal(ctx, journalId, date, description) {
  const j = db.get('SELECT * FROM journals WHERE id = ?', journalId);
  if (!j || j.status !== 'diposting') throw bad('Hanya jurnal terposting yang dapat dibalik.');
  if (db.get('SELECT id FROM journals WHERE reversal_of = ? AND status = ?', journalId, 'diposting')) throw bad(`Jurnal ${j.number} sudah pernah dibalik.`);
  const lines = db.all('SELECT * FROM journal_lines WHERE parent_id = ? AND is_system = 0', journalId).map((l) => ({
    account_id: l.account_id, branch_id: l.branch_id, debit: l.credit, credit: l.debit, memo: l.memo,
    cost_center_id: l.cost_center_id, project_id: l.project_id, partner_type: l.partner_type, partner_id: l.partner_id,
  }));
  return postJournal(ctx, {
    companyId: j.company_id, branchId: j.branch_id, date: date || j.date,
    description: description || `Pembalikan ${j.number}: ${j.description}`,
    sourceType: j.source_type, sourceId: j.source_id, sourceNo: j.source_no, reversalOf: j.id, lines,
  });
}

/** Membalik seluruh jurnal yang berasal dari satu dokumen sumber. */
export function reverseDocumentJournals(ctx, sourceType, sourceId, date, description) {
  const js = db.all(`SELECT id FROM journals j WHERE source_type = ? AND source_id = ? AND status = 'diposting' AND reversal_of IS NULL
    AND NOT EXISTS (SELECT 1 FROM journals r WHERE r.reversal_of = j.id AND r.status = 'diposting')`, sourceType, sourceId);
  return js.map((j) => reverseJournal(ctx, j.id, date, description));
}
