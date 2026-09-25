import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AccountIndex, BalanceMap, balancesFromAggregates, type Account, type BankAccount, type Period } from '@erp/domain';
import { notFound } from '../common/errors.js';

export interface PeriodRow extends Period { }

export const mapAccount = (a: any): Account => ({
  code: a.code, name: a.name, type: a.type, category: a.category, parentCode: a.parent_code, level: a.level, normalSide: a.normal_side,
  isIntercompany: a.is_intercompany, isContra: a.is_contra, isCash: a.is_cash, isComputed: a.is_computed, status: a.status,
});

export const mapPeriod = (p: any): Period => ({ id: p.code, label: p.label, from: p.date_from, to: p.date_to, status: p.status, group: p.period_group });

/** Pemuat referensi yang dipakai lintas modul buku besar (bagan akun, periode, rekening, cabang). */
@Injectable()
export class LedgerRefs {
  async accounts(c: PoolClient, companyId: string): Promise<AccountIndex> {
    const { rows } = await c.query('SELECT * FROM chart_of_accounts WHERE company_id = $1 ORDER BY code', [companyId]);
    return new AccountIndex(rows.map(mapAccount));
  }

  async periods(c: PoolClient, companyId: string): Promise<Period[]> {
    const { rows } = await c.query('SELECT * FROM fiscal_periods WHERE company_id = $1 ORDER BY date_from, date_to', [companyId]);
    return rows.map(mapPeriod);
  }

  /** Periode dari header; bila kosong, bulan yang memuat hari ini atau bulan terakhir yang terdaftar. */
  async resolvePeriod(c: PoolClient, companyId: string, code: string | null): Promise<Period> {
    const all = await this.periods(c, companyId);
    if (code) {
      const p = all.find((x) => x.id === code);
      if (!p) throw notFound(`Periode ${code}`);
      return p;
    }
    const today = new Date().toISOString().slice(0, 10);
    const months = all.filter((p) => p.group === 'Bulan');
    return months.find((p) => today >= p.from && today <= p.to) ?? months[months.length - 1] ?? all[all.length - 1];
  }

  async periodForDate(c: PoolClient, companyId: string, date: string): Promise<Period | undefined> {
    const all = await this.periods(c, companyId);
    return all.find((p) => p.group === 'Bulan' && date >= p.from && date <= p.to);
  }

  async bankAccounts(c: PoolClient, companyId: string): Promise<(BankAccount & { bankName: string; branch: string; status: string; accountNoMasked: string | null })[]> {
    const { rows } = await c.query('SELECT * FROM bank_accounts WHERE company_id = $1 ORDER BY branch_code, code', [companyId]);
    return rows.map((b: any) => ({ id: b.code, code: b.code, name: b.name, bankName: b.bank_name, branchCode: String(b.branch_code).trim(), branch: String(b.branch_code).trim(), currency: b.currency, openingBalance: b.opening_balance, status: b.status, accountNoMasked: b.account_no_masked }));
  }

  async branches(c: PoolClient, companyId: string): Promise<{ code: string; name: string; short: string; status: string; isHeadOffice: boolean; targetMonthly: number }[]> {
    const { rows } = await c.query('SELECT code, name, short_name, status, is_head_office, target_monthly FROM branches WHERE company_id = $1 ORDER BY is_head_office DESC, code', [companyId]);
    return rows.map((b: any) => ({ code: String(b.code).trim(), name: b.name, short: b.short_name, status: b.status, isHeadOffice: b.is_head_office, targetMonthly: b.target_monthly }));
  }

  /** Saldo per akun untuk cakupan cabang (null = semua yang diizinkan RLS) dan rentang periode. */
  async balances(c: PoolClient, companyId: string, branch: string | null, from: string, to: string): Promise<BalanceMap> {
    const { rows } = await c.query(
      `SELECT jl.account_code AS code,
              sum(CASE WHEN jl.journal_date < $3 THEN jl.debit ELSE 0 END)::bigint AS opening_debit,
              sum(CASE WHEN jl.journal_date < $3 THEN jl.credit ELSE 0 END)::bigint AS opening_credit,
              sum(CASE WHEN jl.journal_date >= $3 THEN jl.debit ELSE 0 END)::bigint AS debit,
              sum(CASE WHEN jl.journal_date >= $3 THEN jl.credit ELSE 0 END)::bigint AS credit
         FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
        WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.journal_date <= $4
          AND ($2::text IS NULL OR jl.branch_code = $2)
        GROUP BY jl.account_code`, [companyId, branch, from, to]);
    return balancesFromAggregates(rows.map((r: any) => ({ code: r.code, openingDebit: r.opening_debit, openingCredit: r.opening_credit, debit: r.debit, credit: r.credit })));
  }

  /** Saldo per cabang sekaligus (untuk konsolidasi). */
  async balancesByBranch(c: PoolClient, companyId: string, from: string, to: string): Promise<Record<string, BalanceMap>> {
    const { rows } = await c.query(
      `SELECT jl.branch_code, jl.account_code AS code,
              sum(CASE WHEN jl.journal_date < $2 THEN jl.debit ELSE 0 END)::bigint AS opening_debit,
              sum(CASE WHEN jl.journal_date < $2 THEN jl.credit ELSE 0 END)::bigint AS opening_credit,
              sum(CASE WHEN jl.journal_date >= $2 THEN jl.debit ELSE 0 END)::bigint AS debit,
              sum(CASE WHEN jl.journal_date >= $2 THEN jl.credit ELSE 0 END)::bigint AS credit
         FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
        WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.journal_date <= $3
        GROUP BY jl.branch_code, jl.account_code`, [companyId, from, to]);
    const by: Record<string, any[]> = {};
    for (const r of rows) (by[String(r.branch_code).trim()] ||= []).push({ code: r.code, openingDebit: r.opening_debit, openingCredit: r.opening_credit, debit: r.debit, credit: r.credit });
    const out: Record<string, BalanceMap> = {};
    for (const [b, list] of Object.entries(by)) out[b] = balancesFromAggregates(list);
    return out;
  }

  /** Pendapatan bulanan (akun 4-xxxx) untuk grafik tren. */
  async monthlyRevenue(c: PoolClient, companyId: string, branch: string | null, year: number): Promise<{ month: number; amount: number }[]> {
    const { rows } = await c.query(
      `SELECT extract(month FROM jl.journal_date)::int AS month, sum(jl.credit - jl.debit)::bigint AS amount
         FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
        WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.account_code LIKE '4-%'
          AND extract(year FROM jl.journal_date) = $3 AND ($2::text IS NULL OR jl.branch_code = $2)
        GROUP BY 1 ORDER BY 1`, [companyId, branch, year]);
    return rows.map((r: any) => ({ month: r.month, amount: r.amount }));
  }
}
