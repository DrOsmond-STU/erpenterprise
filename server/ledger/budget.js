/* ==========================================================================
   Penganggaran: pembagian anggaran COA ke 12 bulan, kontrol anggaran saat
   transaksi (COA & proyek), dan penyalinan anggaran dari tahun sebelumnya.
   Realisasi selalu dihitung dari buku besar terposting.
   ========================================================================== */
import * as db from '../db.js';
import { BUDGET_MONTHS } from '../modules/entities.js';
import { approvalPolicy } from '../lib/settings.js';
import { bad, round2, nowIso, fmtRp } from '../lib/util.js';

export const COST_TYPES = ['cogs', 'expense', 'other_expense'];
const DEBIT_NORMAL = new Set(['asset', 'cogs', 'expense', 'other_expense', 'tax']);
const sign = (type) => (DEBIT_NORMAL.has(type) ? 1 : -1);

/** Realisasi bulanan (saldo normal) satu akun di satu cabang & tahun; jurnal penutup dikecualikan. */
export function monthlyActual({ companyId, branchId, accountId, year, costCenterId = null }) {
  const a = db.get('SELECT type FROM accounts WHERE id = ?', accountId);
  const where = ['jl.company_id = ?', 'jl.account_id = ?', "j.status = 'diposting'", "j.source_type IS NOT 'year_closing'", 'j.date BETWEEN ? AND ?'];
  const params = [companyId, accountId, `${year}-01-01`, `${year}-12-31`];
  if (branchId) { where.push('jl.branch_id = ?'); params.push(branchId); }
  if (costCenterId) { where.push('jl.cost_center_id = ?'); params.push(costCenterId); }
  const rows = db.all(`SELECT CAST(substr(j.date, 6, 2) AS INTEGER) m, ROUND(SUM(jl.debit - jl.credit), 2) net FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE ${where.join(' AND ')} GROUP BY m`, ...params);
  const out = Array(12).fill(0);
  for (const r of rows) out[r.m - 1] = round2(sign(a?.type) * r.net);
  return out;
}

/** Bagi angka setahun ke 12 bulan menurut bobot; sisa pembulatan masuk ke bulan terakhir. */
export function spread(amount, weights = null) {
  const w = weights && weights.some((x) => x > 0) ? weights.map((x) => Math.max(0, x)) : Array(12).fill(1);
  const tw = w.reduce((s, x) => s + x, 0);
  const out = w.map((x) => round2(amount * x / tw));
  const diff = round2(amount - out.reduce((s, x) => s + x, 0));
  out[11] = round2(out[11] + diff);
  return out;
}

/** Kait compute anggaran: pembagian bulanan, total, dan validasi duplikat. */
export function phaseBudget(row) {
  const acc = db.get('SELECT id, type, is_header, code FROM accounts WHERE id = ?', row.account_id);
  if (!acc || acc.is_header) throw bad('Anggaran hanya dapat disusun untuk akun detail (bukan akun induk).');
  if (row.phasing === 'manual') {
    row.amount = round2(BUDGET_MONTHS.reduce((s, k) => s + (Number(row[k]) || 0), 0));
    if (!(row.amount > 0)) throw bad('Pola manual: isi anggaran minimal satu bulan.');
  } else {
    if (!(Number(row.amount) > 0)) throw bad('Anggaran setahun wajib diisi dan lebih dari nol.');
    const weights = row.phasing === 'tahun_lalu'
      ? monthlyActual({ companyId: row.company_id, branchId: row.branch_id, accountId: row.account_id, year: Number(row.year) - 1, costCenterId: row.cost_center_id || null })
      : null;
    spread(Number(row.amount), weights).forEach((v, i) => { row[BUDGET_MONTHS[i]] = v; });
  }
  const dup = db.get(`SELECT id FROM budgets WHERE company_id = ? AND branch_id = ? AND year = ? AND account_id = ? AND COALESCE(cost_center_id, 0) = COALESCE(?, 0) AND id <> ?`,
    row.company_id, row.branch_id, row.year, row.account_id, row.cost_center_id || null, row.id || 0);
  if (dup) throw bad(`Anggaran ${acc.code} tahun ${row.year} untuk cabang & pusat biaya ini sudah ada — ubah anggaran yang ada.`);
}

/* --- Kontrol anggaran ------------------------------------------------------ */
/**
 * Periksa baris pengeluaran terhadap anggaran COA (disetujui) dan anggaran proyek.
 * lines: [{ account_id, amount, branch_id?, project_id? }] — amount positif = pengeluaran (IDR).
 * extraProjectCommit: { projectId, amount } komitmen PO yang sedang diajukan; excludePoId: PO yang sedang ditagih/diajukan.
 * Mode kebijakan: none = tanpa kontrol, warn = peringatan, block = transaksi ditolak.
 */
export function budgetCheck({ companyId, branchId, date, lines, extraProjectCommit = null, excludePoId = null }) {
  const mode = approvalPolicy().budgetControl || 'warn';
  if (mode === 'none' || (!lines?.length && !extraProjectCommit)) return [];
  const year = Number(String(date).slice(0, 4));
  const types = new Map(db.all(`SELECT id, type, code, name FROM accounts`).map((a) => [a.id, a]));
  const cost = lines.filter((l) => COST_TYPES.includes(types.get(l.account_id)?.type) && Number(l.amount) > 0);
  const warnings = [];

  // Anggaran COA per akun & cabang (seluruh pusat biaya).
  const byAcct = new Map();
  for (const l of cost) {
    const k = `${l.account_id}:${l.branch_id || branchId}`;
    byAcct.set(k, round2((byAcct.get(k) || 0) + Number(l.amount)));
  }
  for (const [k, amt] of byAcct) {
    const [accountId, br] = k.split(':').map(Number);
    const b = db.get(`SELECT ROUND(SUM(amount), 2) budget FROM budgets WHERE company_id = ? AND branch_id = ? AND year = ? AND account_id = ? AND status = 'disetujui'`, companyId, br, year, accountId);
    if (!b?.budget) continue;
    const actual = monthlyActual({ companyId, branchId: br, accountId, year }).reduce((s, x) => s + x, 0);
    const after = round2(actual + amt);
    if (after > b.budget + 0.005) {
      const a = types.get(accountId);
      warnings.push(`Anggaran ${a.code} ${a.name} ${year} terlampaui ${fmtRp(after - b.budget)} (anggaran ${fmtRp(b.budget)}, realisasi setelah transaksi ${fmtRp(after)}).`);
    }
  }

  // Anggaran proyek (RAB): realisasi biaya + komitmen PO + transaksi ini.
  const byProject = new Map();
  for (const l of cost) if (l.project_id) byProject.set(l.project_id, round2((byProject.get(l.project_id) || 0) + Number(l.amount)));
  if (extraProjectCommit) byProject.set(extraProjectCommit.projectId, round2((byProject.get(extraProjectCommit.projectId) || 0) + extraProjectCommit.amount));
  for (const [pid, amt] of byProject) {
    const p = db.get('SELECT id, code, name, budget FROM projects WHERE id = ?', pid);
    if (!p?.budget) continue;
    const used = round2(projectCost(pid) + projectCommitment(pid, excludePoId));
    const after = round2(used + amt);
    if (after > p.budget + 0.005) warnings.push(`Anggaran proyek ${p.code} ${p.name} terlampaui ${fmtRp(after - p.budget)} (RAB ${fmtRp(p.budget)}, realisasi + komitmen setelah transaksi ${fmtRp(after)}).`);
  }

  if (warnings.length && mode === 'block') throw bad(`Kontrol anggaran: ${warnings.join(' ')} Ajukan revisi anggaran atau minta pengecualian ke pemilik anggaran.`);
  return warnings;
}

/** Realisasi biaya proyek (akun beban pokok & beban) dari buku besar. */
export function projectCost(projectId, to = null) {
  const params = [projectId];
  let extra = '';
  if (to) { extra = ' AND j.date <= ?'; params.push(to); }
  return db.get(`SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit), 0), 2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id
    WHERE jl.project_id = ? AND j.status = 'diposting' AND j.source_type IS NOT 'year_closing' AND a.type IN ('cogs','expense','other_expense')${extra}`, ...params).v;
}

/** Komitmen proyek: PO berstatus menunggu/disetujui yang belum ditagih (nilai sebelum PPN, IDR). */
export function projectCommitment(projectId, excludePoId = null) {
  return db.get(`SELECT ROUND(COALESCE(SUM(subtotal * COALESCE(exchange_rate, 1)), 0), 2) v FROM purchase_orders WHERE project_id = ? AND status IN ('menunggu','disetujui') AND id <> ?`, projectId, excludePoId || 0).v;
}

/** Ringkas peringatan menjadi pesan aksi. */
export const warnMessage = (warnings, okMessage = null) => (warnings.length ? `Peringatan anggaran: ${warnings.join(' ')}` : okMessage);

/* --- Salin anggaran -------------------------------------------------------- */
/**
 * Salin anggaran tahun sumber ke tahun tujuan sebagai draf, dengan penyesuaian %.
 * basis 'anggaran' = anggaran disetujui tahun sumber; 'realisasi' = realisasi tahun sumber per akun laba rugi.
 */
export function copyBudgets(ctx, { companyId, branchIds, fromYear, toYear, adjustPct = 0, basis = 'anggaran' }) {
  if (!(toYear > fromYear - 50 && toYear < 2101 && fromYear > 1999)) throw bad('Tahun tidak valid.');
  if (fromYear === toYear) throw bad('Tahun sumber dan tujuan tidak boleh sama.');
  const factor = 1 + (Number(adjustPct) || 0) / 100;
  if (!(factor > 0) || Math.abs(adjustPct) > 500) throw bad('Penyesuaian harus antara −99% dan +500%.');
  let created = 0, skipped = 0;
  const now = nowIso();
  const exists = (br, acc, cc) => db.get('SELECT id FROM budgets WHERE company_id = ? AND branch_id = ? AND year = ? AND account_id = ? AND COALESCE(cost_center_id,0) = COALESCE(?,0)', companyId, br, toYear, acc, cc || null);
  const insert = (br, acc, cc, months, notes) => {
    const m = months.map((v) => round2(Math.max(0, v) * factor));
    const amount = round2(m.reduce((s, x) => s + x, 0));
    if (!(amount > 0)) return;
    if (exists(br, acc, cc)) { skipped++; return; }
    db.insert('budgets', {
      company_id: companyId, branch_id: br, year: toYear, account_id: acc, cost_center_id: cc || null, phasing: 'manual', amount,
      ...Object.fromEntries(BUDGET_MONTHS.map((k, i) => [k, m[i]])), notes, status: 'draf',
      created_at: now, created_by: ctx.user.id, updated_at: now, updated_by: ctx.user.id,
    });
    created++;
  };
  return db.tx(() => {
    const pct = adjustPct ? ` ${adjustPct > 0 ? '+' : ''}${adjustPct}%` : '';
    if (basis === 'realisasi') {
      for (const br of branchIds) {
        const accs = db.all(`SELECT DISTINCT jl.account_id id FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id
          WHERE jl.company_id = ? AND jl.branch_id = ? AND j.status = 'diposting' AND j.date BETWEEN ? AND ? AND a.type IN ('revenue','cogs','expense','other_income','other_expense')`, companyId, br, `${fromYear}-01-01`, `${fromYear}-12-31`);
        for (const a of accs) insert(br, a.id, null, monthlyActual({ companyId, branchId: br, accountId: a.id, year: fromYear }), `Dari realisasi ${fromYear}${pct}`);
      }
    } else {
      const src = db.all(`SELECT * FROM budgets WHERE company_id = ? AND year = ? AND status = 'disetujui' AND branch_id IN (${branchIds.map(() => '?').join(',')})`, companyId, fromYear, ...branchIds);
      for (const b of src) insert(b.branch_id, b.account_id, b.cost_center_id, BUDGET_MONTHS.map((k) => Number(b[k]) || 0), `Salinan anggaran ${fromYear}${pct}`);
    }
    return { created, skipped };
  });
}
