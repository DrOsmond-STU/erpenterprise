/**
 * Laporan pusat biaya:
 *  - Laba rugi per pusat biaya: mutasi akun pendapatan & beban periode terpilih dipecah
 *    menurut dimensi journal_lines.cost_center_id (opsional digabung ke induk teratas).
 *    Kolom "Tanpa pusat biaya" memuat baris yang belum ditandai, sehingga kolom Total
 *    selalu sama dengan laporan laba rugi cakupan yang sama.
 *  - Anggaran per pusat biaya: anggaran pusat biaya yang disetujui untuk tahun & cakupan
 *    cabang, dibandingkan realisasi bertanda dan komitmen pengadaan bertanda.
 */
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { balancesFromAggregates, budgetSummary, costCenterRoot, incomeStatement, type IncomeStatement } from '@erp/domain';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from '../ledger/ledger.shared.js';
import { todayWib, trimBranch, UUID } from '../sales/sales.shared.js';
import { BudgetsService } from './budgets.service.js';

const NONE = '';
const pctOf = (v: number, total: number) => (total ? Math.round((v / total) * 1000) / 10 : 0);
const sum12 = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] ?? 0));

@Injectable()
export class CostCenterReportsService {
  constructor(private readonly db: DbService, private readonly refs: LedgerRefs, private readonly budgets: BudgetsService) {}

  private async centers(c: PoolClient, companyId: string) {
    return (await c.query('SELECT id, code, name, kind, status, parent_id AS "parentId" FROM cost_centers WHERE company_id = $1 ORDER BY code', [companyId])).rows as
      { id: string; code: string; name: string; kind: string; status: string; parentId: string | null }[];
  }

  /** Pusat biaya terpilih beserta seluruh turunannya. */
  private subtree(list: { id: string; parentId: string | null }[], id: string) {
    const out = new Set([id]);
    let grew = true;
    while (grew) { grew = false; for (const x of list) if (x.parentId && out.has(x.parentId) && !out.has(x.id)) { out.add(x.id); grew = true; } }
    return out;
  }

  async incomeStatement(u: RequestUser, s: ScopeContext, q: { costCenter?: string; rollup?: boolean }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
      const accounts = await this.refs.accounts(c, u.companyId);
      const list = await this.centers(c, u.companyId);
      const byId = new Map(list.map((x) => [x.id, x]));
      if (q.costCenter && (!UUID.test(q.costCenter) || !byId.has(q.costCenter))) throw notFound('Pusat biaya');
      const rows = (await c.query(
        `SELECT jl.cost_center_id AS cc, jl.account_code AS code, sum(jl.debit)::bigint AS d, sum(jl.credit)::bigint AS k
           FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
          WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.journal_date BETWEEN $2 AND $3 AND jl.account_code ~ '^[45]'
            AND ($4::text IS NULL OR jl.branch_code = $4)
          GROUP BY 1, 2`, [u.companyId, period.from, period.to, s.branch === 'ALL' ? null : s.branch])).rows;

      const selected = q.costCenter ? this.subtree(list, q.costCenter) : null;
      const keyOf = (cc: string | null) => {
        if (!cc) return NONE;
        if (selected) return selected.has(cc) ? q.costCenter! : null;
        return q.rollup ? costCenterRoot(list, cc) : cc;
      };
      const agg = new Map<string, Map<string, { d: number; k: number }>>();
      for (const r of rows) {
        const key = keyOf(r.cc);
        if (key === null || (selected && key === NONE)) continue;
        const m = agg.get(key) ?? agg.set(key, new Map()).get(key)!;
        const e = m.get(r.code) ?? { d: 0, k: 0 };
        e.d += Number(r.d); e.k += Number(r.k);
        m.set(r.code, e);
      }
      const report = (m: Map<string, { d: number; k: number }> | undefined): IncomeStatement =>
        incomeStatement(accounts, balancesFromAggregates([...(m ?? new Map()).entries()].map(([code, v]) => ({ code, openingDebit: 0, openingCredit: 0, debit: v.d, credit: v.k }))));
      const all = new Map<string, { d: number; k: number }>();
      for (const m of agg.values()) for (const [code, v] of m) { const e = all.get(code) ?? { d: 0, k: 0 }; e.d += v.d; e.k += v.k; all.set(code, e); }

      const keys = [...agg.keys()].filter((k) => k !== NONE).sort((a, b) => byId.get(a)!.code.localeCompare(byId.get(b)!.code));
      if (selected && !keys.length) keys.push(q.costCenter!);
      const columns = keys.map((k) => {
        const x = byId.get(k)!;
        return { id: x.id, code: x.code, name: x.name, kind: x.kind, status: x.status, parentCode: x.parentId ? byId.get(x.parentId)?.code ?? null : null };
      });
      const reports = keys.map((k) => report(agg.get(k)));
      const unassigned = !selected && agg.has(NONE) ? report(agg.get(NONE)) : null;
      const total = report(all);
      const expenseOf = (r: IncomeStatement) => r.cogs + r.opex + r.ga + Math.max(-r.other, 0);
      const summary = [...columns.map((col, i) => ({ ...col, report: reports[i] })), ...(unassigned ? [{ id: null, code: null, name: 'Tanpa pusat biaya', kind: null, status: null, parentCode: null, report: unassigned }] : [])]
        .map(({ report: r, ...col }) => ({
          ...col, revenue: r.revenue, cogs: r.cogs, gross: r.gross, opex: r.opex, ga: r.ga, operating: r.operating, other: r.other, net: r.net, expense: expenseOf(r),
          grossMargin: r.grossMargin, netMargin: r.netMargin, revenueShare: pctOf(r.revenue, total.revenue), expenseShare: pctOf(expenseOf(r), expenseOf(total)),
        }));
      const tagged = reports.reduce((t, r) => t + expenseOf(r), 0);
      return {
        period, scope: s.branch, rollup: Boolean(q.rollup) && !selected, costCenter: q.costCenter ?? null, columns, reports, unassigned, total, summary,
        coverage: { expenseTagged: tagged, expenseTotal: expenseOf(total), expensePct: pctOf(tagged, expenseOf(total)), revenueTagged: reports.reduce((t, r) => t + r.revenue, 0), revenuePct: pctOf(reports.reduce((t, r) => t + r.revenue, 0), total.revenue) },
      };
    });
  }

  async budgetReport(u: RequestUser, s: ScopeContext, q: { year?: number; asOf?: string }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const asOf = q.asOf ?? todayWib();
      const year = q.year ?? Number(asOf.slice(0, 4));
      const branch = s.branch === 'ALL' ? null : s.branch;
      const list = await this.centers(c, u.companyId);
      const byId = new Map(list.map((x) => [x.id, x]));
      const budgets = (await c.query(
        `SELECT b.id, b.status, b.name, trim(b.branch_code) AS branch, b.cost_center_id FROM budgets b
          WHERE b.company_id = $1 AND b.fiscal_year = $2 AND b.cost_center_id IS NOT NULL AND ($3::text IS NULL OR b.branch_code = $3) ORDER BY b.branch_code`,
        [u.companyId, year, branch])).rows;
      const approved = budgets.filter((b: any) => b.status === 'disetujui');
      const pending = budgets.filter((b: any) => b.status !== 'disetujui').map((b: any) => ({ id: b.id, name: b.name, branch: b.branch, status: b.status, costCenterCode: byId.get(b.cost_center_id)?.code ?? null }));

      type Line = { account: string; accountName: string; category: string; months: number[]; actualMonths: number[]; commitment: number };
      const per = new Map<string, { budgets: { id: string; branch: string; name: string }[]; lines: Map<string, Line> }>();
      let elapsed = 0;
      for (const b of approved) {
        const d: any = await this.budgets.load(c, u.companyId, b.id, asOf);
        elapsed = d.elapsedMonths;
        const e = per.get(b.cost_center_id) ?? per.set(b.cost_center_id, { budgets: [], lines: new Map() }).get(b.cost_center_id)!;
        e.budgets.push({ id: b.id, branch: b.branch, name: b.name });
        for (const l of d.lines) {
          const x = e.lines.get(l.account);
          if (x) { x.months = sum12(x.months, l.months); x.actualMonths = sum12(x.actualMonths, l.actualMonths); x.commitment += l.commitment; }
          else e.lines.set(l.account, { account: l.account, accountName: l.accountName, category: l.category, months: [...l.months], actualMonths: [...l.actualMonths], commitment: l.commitment });
        }
      }
      if (!approved.length) elapsed = (() => { const y = Number(asOf.slice(0, 4)); return y < year ? 0 : y > year ? 12 : Number(asOf.slice(5, 7)); })();

      /* Realisasi beban bertanda pada akun yang tidak dianggarkan pusat biaya itu (informasi). */
      const tagged = (await c.query(
        `SELECT l.cost_center_id AS cc, l.account_code, sum(l.debit - l.credit)::bigint AS v FROM journal_lines l JOIN journals j ON j.id = l.journal_id
          WHERE l.company_id = $1 AND l.cost_center_id IS NOT NULL AND j.status IN ('posted','reversed') AND l.account_code LIKE '5-%'
            AND l.journal_date BETWEEN make_date($2, 1, 1) AND make_date($2, 12, 31) AND ($3::text IS NULL OR l.branch_code = $3) GROUP BY 1, 2`, [u.companyId, year, branch])).rows;

      const figures = (ls: Line[]) => {
        const budget = ls.reduce((t, l) => t + l.months.reduce((a, v) => a + v, 0), 0);
        const ytdBudget = ls.reduce((t, l) => t + l.months.slice(0, elapsed).reduce((a, v) => a + v, 0), 0);
        const actual = ls.reduce((t, l) => t + l.actualMonths.reduce((a, v) => a + v, 0), 0);
        const commitment = ls.reduce((t, l) => t + l.commitment, 0);
        const remainingBudget = budget - ytdBudget;
        return { budget, ytdBudget, actual, commitment, ytdVariance: actual - ytdBudget, ...budgetSummary({ budget, actual, commitment, remainingBudget }) };
      };
      const isRevenue = (l: Line) => l.category === 'Pendapatan';
      const rows = [...per.entries()].map(([id, e]) => {
        const cc = byId.get(id)!;
        const lines = [...e.lines.values()].sort((a, b) => a.account.localeCompare(b.account)).map((l) => ({
          ...l, budget: l.months.reduce((a, v) => a + v, 0), actual: l.actualMonths.reduce((a, v) => a + v, 0),
          ytdBudget: l.months.slice(0, elapsed).reduce((a, v) => a + v, 0),
          ...budgetSummary({ budget: l.months.reduce((a, v) => a + v, 0), actual: l.actualMonths.reduce((a, v) => a + v, 0), commitment: l.commitment, remainingBudget: l.months.slice(elapsed).reduce((a, v) => a + v, 0) }),
        }));
        const expense = figures([...e.lines.values()].filter((l) => !isRevenue(l)));
        const revenue = figures([...e.lines.values()].filter(isRevenue));
        const budgeted = new Set(e.lines.keys());
        const unbudgetedExpense = tagged.filter((t: any) => t.cc === id && !budgeted.has(t.account_code)).reduce((t: number, r: any) => t + Number(r.v), 0);
        return {
          costCenterId: id, code: cc.code, name: cc.name, kind: cc.kind, parentCode: cc.parentId ? byId.get(cc.parentId)?.code ?? null : null,
          budgets: e.budgets, expense, revenue, unbudgetedExpense,
          profit: { budget: revenue.budget - expense.budget, ytdBudget: revenue.ytdBudget - expense.ytdBudget, actual: revenue.actual - expense.actual },
          monthly: {
            expenseBudget: [...e.lines.values()].filter((l) => !isRevenue(l)).reduce((t, l) => sum12(t, l.months), Array(12).fill(0)),
            expenseActual: [...e.lines.values()].filter((l) => !isRevenue(l)).reduce((t, l) => sum12(t, l.actualMonths), Array(12).fill(0)),
          },
          lines,
        };
      }).sort((a, b) => a.code.localeCompare(b.code));
      const tot = (k: 'expense' | 'revenue') => {
        const f = (p: string) => rows.reduce((t, r: any) => t + r[k][p], 0);
        const budget = f('budget'), actual = f('actual'), commitment = f('commitment');
        return { budget, ytdBudget: f('ytdBudget'), actual, commitment, forecast: f('forecast'), variance: f('forecast') - budget, available: budget - actual - commitment, absorption: pctOf(actual + commitment, budget) };
      };
      return {
        year, asOf, elapsedMonths: elapsed, scope: s.branch, rows, pending,
        totals: { expense: tot('expense'), revenue: tot('revenue'), unbudgetedExpense: rows.reduce((t, r) => t + r.unbudgetedExpense, 0) },
        branches: [...new Set(approved.map((b: any) => trimBranch(b.branch)))],
      };
    });
  }
}
