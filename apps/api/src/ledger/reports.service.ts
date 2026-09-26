import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  AccountIndex, balanceSheet, consolidate, incomeStatement, intercompanyMismatch, isDebitNormal, sumBalances, trialBalance, ytdProfit,
  type BalanceMap, type Period,
} from '@erp/domain';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from './ledger.shared.js';

@Injectable()
export class ReportsService {
  constructor(private readonly db: DbService, private readonly refs: LedgerRefs) {}

  private scopeBranch(s: ScopeContext): string | null { return s.branch === 'ALL' ? null : s.branch; }

  private async base(c: PoolClient, u: RequestUser, s: ScopeContext) {
    const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
    const accounts = await this.refs.accounts(c, u.companyId);
    const bal = await this.refs.balances(c, u.companyId, this.scopeBranch(s), period.from, period.to);
    return { period, accounts, bal };
  }

  async trialBalance(u: RequestUser, s: ScopeContext, byBranch: boolean, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const { period, accounts, bal } = await this.base(c, u, s);
      const tb = trialBalance(accounts, bal);
      if (!byBranch || s.branch !== 'ALL') return { period, scope: s.branch, ...tb };
      const per = await this.refs.balancesByBranch(c, u.companyId, period.from, period.to);
      const branches = (await this.refs.branches(c, u.companyId)).filter((b) => b.status === 'aktif');
      const signed = (code: string, v: number) => (isDebitNormal(code) ? v : -v);
      const rows = tb.rows.map((r) => {
        const values = branches.map((b) => signed(r.code, per[b.code]?.[r.code]?.ending ?? 0));
        const combined = values.reduce((x, y) => x + y, 0);
        const elimination = r.interco ? -combined : 0;
        return { code: r.code, name: r.name, category: r.category, interco: r.interco, values, elimination, consolidated: combined + elimination };
      });
      return { period, scope: s.branch, columns: branches.map((b) => ({ branch: b.code, label: b.short })), rows, totals: tb.totals, balanced: tb.balanced };
    });
  }

  async incomeStatement(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const { period, accounts, bal } = await this.base(c, u, s);
      return { period, scope: s.branch, ...incomeStatement(accounts, bal) };
    });
  }

  async balanceSheet(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const { period, accounts, bal } = await this.base(c, u, s);
      return { period, scope: s.branch, ...balanceSheet(accounts, bal, period.to) };
    });
  }

  /** Konsolidasi seluruh cabang aktif dengan eliminasi RK antar kantor. */
  async consolidation(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, { ...s, branch: 'ALL', rlsBranches: '*' }, requestId), async (c) => {
      const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
      const accounts = await this.refs.accounts(c, u.companyId);
      const per = await this.refs.balancesByBranch(c, u.companyId, period.from, period.to);
      const branches = (await this.refs.branches(c, u.companyId)).filter((b) => b.status === 'aktif');
      const perBranch = branches.map((b) => ({ branch: b.code, label: b.short, balances: per[b.code] ?? {} }));
      const pl = consolidate(accounts, perBranch, (m) => incomeStatement(accounts, m));
      const bs = consolidate(accounts, perBranch, (m) => balanceSheet(accounts, m, period.to));
      const combined = sumBalances(perBranch.map((p) => p.balances));
      const kpis = branches.map((b, i) => {
        const p = pl.columns[i].report, q = bs.columns[i].report;
        const g = (rows: { code: string; amount: number }[], code: string) => rows.find((r) => r.code === code)?.amount ?? 0;
        return { branch: b.code, name: b.name, short: b.short, type: '', revenue: p.revenue, gross: p.gross, net: p.net, netMargin: p.netMargin, cash: g(q.assets, '1-1100'), ar: g(q.assets, '1-1200'), ap: g(q.liabilities, '2-1100'), totalAssets: q.totalAssets };
      });
      return { period, branches: branches.map((b) => ({ code: b.code, label: b.short, name: b.name })), incomeStatement: pl, balanceSheet: bs, kpis, intercompanyMismatch: intercompanyMismatch(accounts, combined) };
    });
  }

  /** Ubin KPI dasbor dari buku besar & sub-buku. */
  async kpis(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const { period, accounts, bal } = await this.base(c, u, s);
      const pl = incomeStatement(accounts, bal);
      const bs = balanceSheet(accounts, bal, period.to);
      const branch = this.scopeBranch(s);
      const year = Number(period.to.slice(0, 4));
      const monthly = await this.refs.monthlyRevenue(c, u.companyId, branch, year);
      const branches = (await this.refs.branches(c, u.companyId)).filter((b) => b.status === 'aktif' && (!branch || b.code === branch));
      const months = Math.max(1, Math.round((daysBetween(period.from, period.to) + 1) / 30));
      const target = branches.reduce((t, b) => t + b.targetMonthly, 0) * months;
      const today = new Date().toISOString().slice(0, 10);
      const overdue = (await c.query(
        `SELECT count(*)::int AS n, coalesce(sum(total_gross - paid_amount),0)::bigint AS amount FROM invoices
          WHERE company_id = $1 AND status IN ('belum-dibayar','sebagian') AND total_gross > paid_amount AND due_date < $2 AND ($3::text IS NULL OR branch_code = $3)`, [u.companyId, today, branch])).rows[0];
      const pending = (await c.query(`SELECT count(*)::int AS n FROM journals WHERE company_id = $1 AND status = 'pending' AND ($2::text IS NULL OR branch_code = $2)`, [u.companyId, branch])).rows[0].n;
      return {
        period, scope: s.branch,
        revenue: pl.revenue, gross: pl.gross, net: pl.net, grossMargin: pl.grossMargin, netMargin: pl.netMargin, target,
        cash: bs.assets.find((a) => a.code === '1-1100')?.amount ?? 0,
        ar: bs.assets.find((a) => a.code === '1-1200')?.amount ?? 0,
        ap: bs.liabilities.find((a) => a.code === '2-1100')?.amount ?? 0,
        overdueInvoices: overdue.n, overdueAmount: overdue.amount, pendingJournals: pending,
        monthlyRevenue: Array.from({ length: 12 }, (_, i) => monthly.find((m) => m.month === i + 1)?.amount ?? 0),
        monthlyTarget: branches.reduce((t, b) => t + b.targetMonthly, 0),
        profit: bs.profit, totalAssets: bs.totalAssets,
      };
    });
  }

  /** Bagan akun beserta saldo akhir (header = Σ anak). */
  async chartOfAccounts(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const { period, accounts, bal } = await this.base(c, u, s);
      const profit = ytdProfit(accounts, bal);
      const balanceOf = (code: string): number => {
        const a = accounts.get(code)!;
        if (a.isComputed) return profit;
        if (a.type === 'detail') return bal[code]?.ending ?? 0;
        return accounts.children(code).reduce((t, x) => t + balanceOf(x.code), 0);
      };
      return { period, scope: s.branch, accounts: accounts.list.map((a) => ({ ...a, balance: balanceOf(a.code) })) };
    });
  }

  /** Kartu buku besar satu akun (opsional tersaring rekening bank). */
  async ledgerCard(u: RequestUser, s: ScopeContext, code: string, bank: string | null, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
      const accounts = await this.refs.accounts(c, u.companyId);
      const acc = accounts.get(code);
      if (!acc || acc.type !== 'detail') throw notFound(`Akun detail ${code}`);
      const branch = this.scopeBranch(s);
      const dn = isDebitNormal(code);
      const open = (await c.query(
        `SELECT coalesce(sum(jl.debit),0)::bigint AS d, coalesce(sum(jl.credit),0)::bigint AS k FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
          WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.account_code = $2 AND jl.journal_date < $3
            AND ($4::text IS NULL OR jl.branch_code = $4) AND ($5::text IS NULL OR jl.bank_account_code = $5)`, [u.companyId, code, period.from, branch, bank])).rows[0];
      const opening = dn ? open.d - open.k : open.k - open.d;
      const rows = (await c.query(
        `SELECT jl.journal_date AS date, j.id AS journal_id, j.journal_no, j.description, j.ref, j.source_type AS source, jl.branch_code, jl.debit, jl.credit, jl.bank_account_code, jl.party
           FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
          WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.account_code = $2 AND jl.journal_date BETWEEN $3 AND $4
            AND ($5::text IS NULL OR jl.branch_code = $5) AND ($6::text IS NULL OR jl.bank_account_code = $6)
          ORDER BY jl.journal_date, j.journal_no, jl.line_no`, [u.companyId, code, period.from, period.to, branch, bank])).rows;
      let running = opening;
      const lines = rows.map((r: any) => { running += dn ? r.debit - r.credit : r.credit - r.debit; return { ...r, branch: String(r.branch_code).trim(), balance: running }; });
      return {
        period, scope: s.branch, account: { code: acc.code, name: acc.name, normalSide: acc.normalSide }, bank, opening, ending: running,
        debit: lines.reduce((t: number, l: any) => t + l.debit, 0), credit: lines.reduce((t: number, l: any) => t + l.credit, 0), lines,
      };
    });
  }

  async bankBalances(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
      const banks = (await this.refs.bankAccounts(c, u.companyId)).filter((b) => s.branch === 'ALL' || b.branchCode === s.branch);
      const sums = (await c.query(
        `SELECT jl.bank_account_code AS code, coalesce(sum(jl.debit - jl.credit),0)::bigint AS net FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
          WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.bank_account_code IS NOT NULL AND jl.journal_date <= $2 GROUP BY 1`, [u.companyId, period.to])).rows;
      const net = Object.fromEntries(sums.map((r: any) => [r.code, r.net]));
      return { period, scope: s.branch, accounts: banks.map((b) => ({ ...b, balance: b.currency === 'IDR' ? (net[b.code] ?? 0) : b.openingBalance })) };
    });
  }
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
}

export type { AccountIndex, BalanceMap, Period };
