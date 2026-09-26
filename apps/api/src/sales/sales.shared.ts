/** Helper bersama modul penjualan: penomoran, eksposur kredit, kebijakan, dan jurnal otomatis. */
import { HttpStatus } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { DomainError, forbidden } from '../common/errors.js';
import { DEFAULT_POLICIES, type CompanyPolicies } from '../iam/settings.service.js';

export const trimBranch = (b: unknown) => String(b ?? '').trim();
export const invalid = (code: string, msg: string, details?: unknown) => new DomainError(code, msg, HttpStatus.UNPROCESSABLE_ENTITY, details);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tanggal hari ini menurut WIB — tanggal dokumen bawaan. */
export const todayWib = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

export async function nextDocNo(c: PoolClient, companyId: string, type: string, year: number, pad = 4): Promise<string> {
  const n = (await c.query('SELECT next_doc_no($1, $2, $3) AS n', [companyId, type, year])).rows[0].n;
  return `${type}-${year}-${String(n).padStart(pad, '0')}`;
}

/** Dokumen hanya untuk cabang yang dimiliki pengguna dan sesuai konteks cabang aktif. */
export function assertBranch(u: RequestUser, s: ScopeContext, branch: string) {
  if (s.branch !== 'ALL' && branch !== s.branch) throw forbidden(`Dokumen cabang ${branch} tidak dapat dibuat dari konteks cabang ${s.branch}.`);
  if (u.branches !== '*' && !u.branches.includes(branch)) throw forbidden(`Anda tidak memiliki akses ke cabang ${branch}.`);
}

/**
 * Plafon kredit berlaku untuk seluruh perusahaan, sedangkan RLS membatasi baris
 * ke cabang pengguna. Hanya angka agregat yang dihitung lintas cabang di sini;
 * konteks RLS dipulihkan setelahnya.
 */
export async function acrossBranches<T>(c: PoolClient, fn: () => Promise<T>): Promise<T> {
  const prev = (await c.query(`SELECT current_setting('app.branch_codes', true) AS v`)).rows[0].v ?? '';
  await c.query(`SELECT set_config('app.branch_codes', '*', true)`);
  try { return await fn(); } finally { await c.query(`SELECT set_config('app.branch_codes', $1, true)`, [prev]); }
}

/** Eksposur per pelanggan: piutang terbuka + faktur draf + pesanan yang belum difakturkan. */
export async function exposures(c: PoolClient, companyId: string, customerId?: string, excludeOrderId?: string): Promise<Map<string, { openAr: number; overdue: number; drafts: number; openOrders: number; total: number }>> {
  return acrossBranches(c, async () => {
    const today = todayWib();
    const inv = (await c.query(
      `SELECT customer_id,
              coalesce(sum(total_gross - paid_amount) FILTER (WHERE status IN ('belum-dibayar','sebagian')),0)::bigint AS open_ar,
              coalesce(sum(total_gross - paid_amount) FILTER (WHERE status IN ('belum-dibayar','sebagian') AND due_date < $3),0)::bigint AS overdue,
              coalesce(sum(total_gross) FILTER (WHERE status = 'draf'),0)::bigint AS drafts
         FROM invoices WHERE company_id = $1 AND customer_id IS NOT NULL AND ($2::uuid IS NULL OR customer_id = $2) GROUP BY 1`, [companyId, customerId ?? null, today])).rows;
    const so = (await c.query(
      `SELECT customer_id, coalesce(sum(total),0)::bigint AS open_orders FROM sales_orders
        WHERE company_id = $1 AND status IN ('menunggu','disetujui','dikirim') AND ($2::uuid IS NULL OR customer_id = $2) AND ($3::uuid IS NULL OR id <> $3) GROUP BY 1`,
      [companyId, customerId ?? null, excludeOrderId ?? null])).rows;
    const out = new Map<string, { openAr: number; overdue: number; drafts: number; openOrders: number; total: number }>();
    const get = (id: string) => { let e = out.get(id); if (!e) { e = { openAr: 0, overdue: 0, drafts: 0, openOrders: 0, total: 0 }; out.set(id, e); } return e; };
    for (const r of inv) { const e = get(r.customer_id); e.openAr = r.open_ar; e.overdue = r.overdue; e.drafts = r.drafts; }
    for (const r of so) get(r.customer_id).openOrders = r.open_orders;
    for (const e of out.values()) e.total = e.openAr + e.drafts + e.openOrders;
    return out;
  });
}

export async function companyPolicies(c: PoolClient, companyId: string): Promise<CompanyPolicies> {
  const r = (await c.query('SELECT settings FROM companies WHERE id = $1', [companyId])).rows[0];
  return { ...DEFAULT_POLICIES, ...(r?.settings?.policies ?? {}) };
}

export interface AutoLine { account: string; debit: number; credit: number; bank?: string | null; party?: string | null; memo?: string | null }

/**
 * Jurnal otomatis dari dokumen (K-22): langsung terposting, idempoten per
 * (sumber, id, aturan). Trigger basis data tetap menjaga periode terbuka,
 * keseimbangan, akun detail, dan rekening kas cabang.
 */
export async function postAutoJournal(c: PoolClient, u: RequestUser, j: { branch: string; date: string; source: string; sourceId: string; rule: string; ref: string; description: string; lines: AutoLine[] }) {
  const lines = j.lines.filter((l) => l.debit > 0 || l.credit > 0);
  const total = lines.reduce((s, l) => s + l.debit, 0);
  if (total !== lines.reduce((s, l) => s + l.credit, 0)) throw invalid('LEDGER_UNBALANCED', `Jurnal otomatis ${j.rule} tidak seimbang.`);
  const period = (await c.query(`SELECT code, label, status FROM fiscal_periods WHERE company_id = $1 AND period_group = 'Bulan' AND $2::date BETWEEN date_from AND date_to`, [u.companyId, j.date])).rows[0];
  if (!period) throw invalid('LEDGER_UNKNOWN_PERIOD', `Tanggal ${j.date} tidak berada dalam periode fiskal terdaftar.`);
  if (period.status !== 'open') throw invalid('LEDGER_PERIOD_CLOSED', `Periode ${period.label} sudah ditutup; dokumen tidak dapat diposting ke periode terkunci.`);
  const journalNo = await nextDocNo(c, u.companyId, 'JV', Number(j.date.slice(0, 4)), 6);
  const ins = (await c.query(
    `INSERT INTO journals (company_id, branch_code, period_code, journal_no, journal_date, source_type, source_id, rule_code, ref, description, status, total_debit, total_credit, created_by, created_by_name, posted_by, posted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'posted',$11,$11,$12,$13,$12,now()) RETURNING id, journal_no`,
    [u.companyId, j.branch, period.code, journalNo, j.date, j.source, j.sourceId, j.rule, j.ref, j.description, total, u.id, u.name])).rows[0];
  let n = 0;
  for (const l of lines) {
    n += 1;
    await c.query(
      `INSERT INTO journal_lines (journal_id, company_id, branch_code, journal_date, line_no, account_code, debit, credit, bank_account_code, party, memo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [ins.id, u.companyId, j.branch, j.date, n, l.account, l.debit, l.credit, l.bank ?? null, l.party ?? null, l.memo ?? null]);
  }
  return { id: ins.id as string, journalNo: ins.journal_no as string };
}

/** Membalik jurnal otomatis dokumen (pembatalan): jurnal balik terposting di tanggal pembatalan. */
export async function reverseAutoJournals(c: PoolClient, u: RequestUser, source: string, sourceId: string, date: string, reason: string) {
  const js = (await c.query(`SELECT * FROM journals WHERE company_id = $1 AND source_type = $2 AND source_id = $3 AND status = 'posted' ORDER BY journal_no`, [u.companyId, source, sourceId])).rows;
  const out: string[] = [];
  for (const j of js) {
    const lines = (await c.query('SELECT * FROM journal_lines WHERE journal_id = $1 ORDER BY line_no', [j.id])).rows;
    const rev = await postAutoJournal(c, u, {
      branch: trimBranch(j.branch_code), date, source: 'reversal', sourceId: j.id, rule: 'REVERSAL', ref: j.ref ?? j.journal_no,
      description: `Pembalikan ${j.journal_no}: ${reason}`,
      lines: lines.map((l: any) => ({ account: l.account_code, debit: l.credit, credit: l.debit, bank: l.bank_account_code, party: l.party, memo: l.memo })),
    });
    await c.query(`UPDATE journals SET reverses_journal_id = $2 WHERE id = $1`, [rev.id, j.id]);
    await c.query(`UPDATE journals SET status = 'reversed', reversed_by_journal_id = $2 WHERE id = $1`, [j.id, rev.id]);
    out.push(rev.journalNo);
  }
  return out;
}

export async function auditTrail(c: PoolClient, companyId: string, entityType: string, entityId: string) {
  const rows = (await c.query(
    `SELECT a.at, a.action, a.after, coalesce(u.display_name, 'Sistem') AS actor FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.company_id = $1 AND a.entity_type = $2 AND a.entity_id = $3 ORDER BY a.id`, [companyId, entityType, entityId])).rows;
  return rows.map((r: any) => ({ at: r.at, action: r.action, actor: r.actor, detail: r.after }));
}
