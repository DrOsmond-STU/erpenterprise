/**
 * Anggaran (dok. 07 §10.6): satu anggaran per cabang & tahun fiskal, baris per akun
 * detail dengan 12 nilai bulanan. Draf → diajukan → disetujui (penyusun/pengaju ≠
 * penyetuju); revisi mengembalikan ke draf. Realisasi dari buku besar, komitmen dari
 * pengadaan, prakiraan = realisasi + komitmen + anggaran bulan yang belum berjalan.
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { budgetSummary, elapsedMonths, type Account } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, DomainError, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from '../ledger/ledger.shared.js';
import { assertBranch, auditTrail, invalid, todayWib, trimBranch, UUID } from '../sales/sales.shared.js';
import { actualByMonth, commitments } from './budget.shared.js';

export interface BudgetLineInput { account: string; amounts?: number[]; annual?: number; note?: string | null }
export interface BudgetInput { branch?: string; fiscalYear: number; name?: string; notes?: string; lines?: BudgetLineInput[]; fromActualYear?: number; growthPct?: number }

const STATUS_LABEL: Record<string, string> = { draf: 'Draf', menunggu: 'Menunggu persetujuan', disetujui: 'Disetujui' };
const mapBudget = (b: any) => ({
  id: b.id, branch: trimBranch(b.branch_code), fiscalYear: b.fiscal_year, name: b.name, status: b.status, statusLabel: STATUS_LABEL[b.status] ?? b.status, notes: b.notes,
  revision: b.revision, createdBy: b.created_by, createdByName: b.created_by_name, submittedBy: b.submitted_by, submittedAt: b.submitted_at,
  approvedByName: b.approved_by_name, approvedAt: b.approved_at, total: b.total === undefined ? undefined : Number(b.total ?? 0), lineCount: b.line_count, createdAt: b.created_at,
});

/** Bagi nilai tahunan rata ke 12 bulan; sisa pembulatan masuk Desember. */
export const spread = (annual: number) => { const m = Math.floor(annual / 12); return [...Array(11).fill(m), annual - m * 11]; };

@Injectable()
export class BudgetsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly refs: LedgerRefs) {}

  private rec(c: PoolClient, u: RequestUser, branch: string, action: string, entityId: string, after: unknown, requestId: string) {
    return this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action, entityType: 'budget', entityId, after, requestId });
  }

  async list(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) =>
      (await c.query(`SELECT b.*, (SELECT sum(x)::bigint FROM budget_lines l, unnest(l.amounts) x WHERE l.budget_id = b.id) AS total,
                             (SELECT count(*)::int FROM budget_lines l WHERE l.budget_id = b.id) AS line_count
                        FROM budgets b WHERE b.company_id = $1 AND ($2::text IS NULL OR b.branch_code = $2) ORDER BY b.fiscal_year DESC, b.branch_code`,
        [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(mapBudget));
  }

  private async row(c: PoolClient, companyId: string, id: string, lock = false) {
    if (!UUID.test(id)) throw notFound('Anggaran');
    const b = (await c.query(`SELECT * FROM budgets WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id])).rows[0];
    if (!b) throw notFound('Anggaran');
    return b;
  }

  /** Detail + realisasi. asOf menentukan bulan berjalan (bawaan: hari ini). */
  async load(c: PoolClient, companyId: string, id: string, asOf = todayWib()) {
    const b = await this.row(c, companyId, id);
    const branch = trimBranch(b.branch_code);
    const idx = await this.refs.accounts(c, companyId);
    const rows = (await c.query('SELECT * FROM budget_lines WHERE budget_id = $1 ORDER BY account_code', [id])).rows;
    const codes = rows.map((r: any) => r.account_code);
    const act = await actualByMonth(c, companyId, branch, b.fiscal_year, codes);
    const com = await commitments(c, companyId, branch, b.fiscal_year, codes);
    const elapsed = elapsedMonths(b.fiscal_year, asOf);
    const lines = rows.map((r: any) => {
      const months = (r.amounts as string[]).map(Number);
      const actualMonths = act.get(r.account_code) ?? Array(12).fill(0);
      const budget = months.reduce((t, v) => t + v, 0);
      const actual = actualMonths.reduce((t, v) => t + v, 0);
      const commitment = com.get(r.account_code) ?? 0;
      const ytdBudget = months.slice(0, elapsed).reduce((t, v) => t + v, 0);
      const a = idx.get(r.account_code) as Account | undefined;
      const parent = a?.parentCode ? idx.get(a.parentCode) : undefined;
      return {
        account: r.account_code, accountName: a?.name ?? r.account_code, category: a?.category ?? 'Beban', group: parent?.code ?? r.account_code, groupName: parent?.name ?? a?.name ?? r.account_code,
        months, actualMonths, budget, actual, commitment, ytdBudget, ytdVariance: actual - ytdBudget, note: r.note,
        ...budgetSummary({ budget, actual, commitment, remainingBudget: months.slice(elapsed).reduce((t, v) => t + v, 0) }),
      };
    });
    const sum = (k: 'budget' | 'actual' | 'commitment' | 'forecast' | 'ytdBudget') => lines.reduce((t: number, l: any) => t + l[k], 0);
    const groups = [...new Set(lines.map((l: any) => l.group))].map((g) => {
      const ls = lines.filter((l: any) => l.group === g);
      const t = (k: string) => ls.reduce((s: number, l: any) => s + l[k], 0);
      return { group: g, groupName: ls[0].groupName, accounts: ls.length, budget: t('budget'), actual: t('actual'), commitment: t('commitment'), forecast: t('forecast'), variance: t('forecast') - t('budget'),
        absorption: t('budget') > 0 ? Math.round(((t('actual') + t('commitment')) / t('budget')) * 1000) / 10 : 0 };
    });
    const totals = { budget: sum('budget'), actual: sum('actual'), commitment: sum('commitment'), forecast: sum('forecast'), ytdBudget: sum('ytdBudget') };
    return {
      ...mapBudget(b), asOf, elapsedMonths: elapsed, lines, groups,
      totals: { ...totals, variance: totals.forecast - totals.budget, absorption: totals.budget > 0 ? Math.round(((totals.actual + totals.commitment) / totals.budget) * 1000) / 10 : 0 },
      timeline: await auditTrail(c, companyId, 'budget', `${branch}-${b.fiscal_year}`),
    };
  }

  async get(u: RequestUser, s: ScopeContext, id: string, asOf: string | undefined, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), (c) => this.load(c, u.companyId, id, asOf));
  }

  /** Validasi baris: akun detail aktif berkategori beban/pendapatan/aset (belanja modal), 12 nilai bulat ≥ 0. */
  private async resolveLines(c: PoolClient, companyId: string, input: BudgetLineInput[]) {
    const idx = await this.refs.accounts(c, companyId);
    const errs: string[] = [];
    const seen = new Set<string>();
    const lines = input.map((l, i) => {
      const a = idx.get(l.account);
      const n = `Baris ${i + 1}`;
      if (!a) errs.push(`${n}: akun ${l.account} tidak ada.`);
      else if (a.type !== 'detail') errs.push(`${n}: ${a.code} ${a.name} adalah header — pilih akun detail.`);
      else if (!['Beban', 'Pendapatan', 'Aset'].includes(a.category) || a.isCash || a.isIntercompany || a.isComputed) errs.push(`${n}: akun ${a.code} tidak dapat dianggarkan (pilih beban, pendapatan, atau aset tetap).`);
      if (seen.has(l.account)) errs.push(`${n}: akun ${l.account} ganda.`);
      seen.add(l.account);
      const months = l.amounts ?? (l.annual !== undefined ? spread(Math.round(l.annual)) : null);
      if (!months || months.length !== 12) errs.push(`${n}: isi 12 nilai bulanan atau nilai tahunan.`);
      else if (months.some((v) => !Number.isInteger(v) || v < 0)) errs.push(`${n}: nilai anggaran harus rupiah bulat ≥ 0.`);
      return { account: l.account, months: months ?? [], note: l.note ?? null };
    });
    if (errs.length) throw invalid('BUDGET_INVALID', errs[0], errs);
    return lines;
  }

  private async writeLines(c: PoolClient, companyId: string, b: any, lines: { account: string; months: number[]; note: string | null }[]) {
    await c.query('DELETE FROM budget_lines WHERE budget_id = $1', [b.id]);
    for (const l of lines) await c.query('INSERT INTO budget_lines (budget_id, company_id, branch_code, account_code, amounts, note) VALUES ($1,$2,$3,$4,$5,$6)', [b.id, companyId, b.branch_code, l.account, l.months, l.note]);
  }

  async create(u: RequestUser, s: ScopeContext, b: BudgetInput, requestId: string) {
    const branch = String(b.branch ?? (s.branch === 'ALL' ? '' : s.branch)).toUpperCase();
    if (!/^[A-Z]{3}$/.test(branch)) throw invalid('BRANCH_REQUIRED', 'Pilih cabang anggaran.');
    assertBranch(u, s, branch);
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      if ((await c.query('SELECT 1 FROM budgets WHERE company_id = $1 AND branch_code = $2 AND fiscal_year = $3', [u.companyId, branch, b.fiscalYear])).rowCount)
        throw conflict('BUDGET_EXISTS', `Anggaran ${branch} tahun ${b.fiscalYear} sudah ada; ubah atau revisi anggaran itu.`);
      let input = b.lines ?? [];
      if (!input.length && b.fromActualYear) {
        /* Isi awal dari realisasi beban & pendapatan tahun acuan × (1 + pertumbuhan%). */
        const g = 1 + (b.growthPct ?? 0) / 100;
        const rows = (await c.query(
          `SELECT l.account_code, extract(month FROM l.journal_date)::int AS m, sum(CASE WHEN a.category = 'Beban' THEN l.debit - l.credit ELSE l.credit - l.debit END)::bigint AS v
             FROM journal_lines l JOIN journals j ON j.id = l.journal_id JOIN chart_of_accounts a ON a.company_id = l.company_id AND a.code = l.account_code
            WHERE l.company_id = $1 AND l.branch_code = $2 AND j.status IN ('posted','reversed') AND a.type = 'detail' AND a.category IN ('Beban','Pendapatan')
              AND NOT a.is_computed AND NOT a.is_intercompany AND extract(year FROM l.journal_date) = $3 GROUP BY 1, 2`, [u.companyId, branch, b.fromActualYear])).rows;
        const by = new Map<string, number[]>();
        for (const r of rows) { const arr = by.get(r.account_code) ?? Array(12).fill(0); arr[r.m - 1] = Math.max(0, Math.round((Number(r.v) * g) / 1000) * 1000); by.set(r.account_code, arr); }
        input = [...by].filter(([, m]) => m.some((v) => v > 0)).map(([account, amounts]) => ({ account, amounts }));
      }
      const lines = await this.resolveLines(c, u.companyId, input);
      const row = (await c.query(`INSERT INTO budgets (company_id, branch_code, fiscal_year, name, notes, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [u.companyId, branch, b.fiscalYear, (b.name?.trim() || `Anggaran ${branch} ${b.fiscalYear}`).slice(0, 120), b.notes ?? null, u.id, u.name])).rows[0];
      await this.writeLines(c, u.companyId, row, lines);
      await this.rec(c, u, branch, 'budget.created', `${branch}-${b.fiscalYear}`, { lines: lines.length, fromActualYear: b.fromActualYear ?? null, growthPct: b.growthPct ?? null }, requestId);
      return this.load(c, u.companyId, row.id);
    });
  }

  async update(u: RequestUser, s: ScopeContext, id: string, b: { name?: string; notes?: string; lines?: BudgetLineInput[] }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const row = await this.row(c, u.companyId, id, true);
      if (row.status !== 'draf') throw conflict('BUDGET_LOCKED', `Anggaran berstatus ${STATUS_LABEL[row.status]}; revisi terlebih dahulu untuk mengubah.`);
      if (b.lines) await this.writeLines(c, u.companyId, row, await this.resolveLines(c, u.companyId, b.lines));
      await c.query('UPDATE budgets SET name = coalesce($2, name), notes = coalesce($3, notes), updated_at = now() WHERE id = $1', [id, b.name?.trim() || null, b.notes ?? null]);
      await this.rec(c, u, trimBranch(row.branch_code), 'budget.updated', `${trimBranch(row.branch_code)}-${row.fiscal_year}`, { lines: b.lines?.length }, requestId);
      return this.load(c, u.companyId, id);
    });
  }

  async submit(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const row = await this.row(c, u.companyId, id, true);
      if (row.status !== 'draf') throw conflict('BUDGET_NOT_DRAFT', 'Hanya anggaran draf yang dapat diajukan.');
      const n = Number((await c.query('SELECT count(*) FROM budget_lines WHERE budget_id = $1', [id])).rows[0].count);
      if (!n) throw invalid('BUDGET_EMPTY', 'Anggaran belum memiliki baris akun.');
      await c.query(`UPDATE budgets SET status = 'menunggu', submitted_by = $2, submitted_at = now(), updated_at = now() WHERE id = $1`, [id, u.id]);
      await this.rec(c, u, trimBranch(row.branch_code), 'budget.submitted', `${trimBranch(row.branch_code)}-${row.fiscal_year}`, { lines: n }, requestId);
      return this.load(c, u.companyId, id);
    });
  }

  async decide(u: RequestUser, s: ScopeContext, id: string, approve: boolean, note: string | undefined, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const row = await this.row(c, u.companyId, id, true);
      if (row.status !== 'menunggu') throw conflict('BUDGET_NOT_PENDING', 'Anggaran tidak sedang menunggu persetujuan.');
      if (row.created_by === u.id || row.submitted_by === u.id) throw new DomainError('SOD_BUDGET', 'Penyusun/pengaju anggaran tidak boleh menyetujui anggarannya sendiri (kontrol empat mata).', HttpStatus.FORBIDDEN);
      if (!approve && (!note || note.trim().length < 3)) throw invalid('REASON_REQUIRED', 'Pengembalian anggaran wajib diberi alasan.');
      if (approve) await c.query(`UPDATE budgets SET status = 'disetujui', approved_by = $2, approved_by_name = $3, approved_at = now(), updated_at = now() WHERE id = $1`, [id, u.id, u.name]);
      else await c.query(`UPDATE budgets SET status = 'draf', updated_at = now() WHERE id = $1`, [id]);
      await this.rec(c, u, trimBranch(row.branch_code), approve ? 'budget.approved' : 'budget.returned', `${trimBranch(row.branch_code)}-${row.fiscal_year}`, { note }, requestId);
      return this.load(c, u.companyId, id);
    });
  }

  /** Revisi anggaran disetujui → draf (revisi + 1); perlu persetujuan ulang. */
  async revise(u: RequestUser, s: ScopeContext, id: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const row = await this.row(c, u.companyId, id, true);
      if (row.status !== 'disetujui') throw conflict('BUDGET_NOT_APPROVED', 'Hanya anggaran disetujui yang direvisi; draf dapat langsung diubah.');
      await c.query(`UPDATE budgets SET status = 'draf', revision = revision + 1, created_by = $2, created_by_name = $3, approved_by = NULL, approved_by_name = NULL, approved_at = NULL, submitted_by = NULL, submitted_at = NULL, updated_at = now() WHERE id = $1`, [id, u.id, u.name]);
      await this.rec(c, u, trimBranch(row.branch_code), 'budget.revised', `${trimBranch(row.branch_code)}-${row.fiscal_year}`, { reason, revision: row.revision + 1 }, requestId);
      return this.load(c, u.companyId, id);
    });
  }
}
