/**
 * Angka anggaran per akun untuk satu cabang & tahun: anggaran bulanan (versi disetujui
 * atau draf yang diminta), realisasi bulanan dari buku besar (tanda alami akun), dan
 * komitmen pengadaan yang belum menjadi jurnal (PO jasa belum ditagih, draf tagihan jasa,
 * PR jasa disetujui yang belum menjadi PO).
 */
import type { PoolClient } from 'pg';
import { naturalAmount, type AccountCategory } from '@erp/domain';

export interface AccountFigures { account: string; months: number[]; actualMonths: number[]; commitment: number }

export async function actualByMonth(c: PoolClient, companyId: string, branch: string, year: number, accounts: string[]) {
  const out = new Map<string, number[]>();
  if (!accounts.length) return out;
  const rows = (await c.query(
    `SELECT l.account_code, extract(month FROM l.journal_date)::int AS m, sum(l.debit)::bigint AS d, sum(l.credit)::bigint AS c, a.category
       FROM journal_lines l JOIN journals j ON j.id = l.journal_id JOIN chart_of_accounts a ON a.company_id = l.company_id AND a.code = l.account_code
      WHERE l.company_id = $1 AND l.branch_code = $2 AND j.status IN ('posted','reversed') AND l.journal_date BETWEEN make_date($3, 1, 1) AND make_date($3, 12, 31)
        AND l.account_code = ANY($4::text[])
      GROUP BY l.account_code, 2, a.category`, [companyId, branch, year, accounts])).rows;
  for (const r of rows) {
    const arr = out.get(r.account_code) ?? Array(12).fill(0);
    arr[r.m - 1] += naturalAmount(r.category as AccountCategory, Number(r.d), Number(r.c));
    out.set(r.account_code, arr);
  }
  return out;
}

export async function commitments(c: PoolClient, companyId: string, branch: string, year: number, accounts: string[]) {
  const out = new Map<string, number>();
  if (!accounts.length) return out;
  const rows = (await c.query(
    `SELECT acc, sum(v)::bigint AS v FROM (
       SELECT l.expense_account_code AS acc, round(l.net * (l.qty - l.qty_invoiced) / l.qty) AS v
         FROM purchase_order_lines l JOIN purchase_orders o ON o.id = l.order_id
        WHERE o.company_id = $1 AND o.branch_code = $2 AND o.status IN ('disetujui','diterima-sebagian') AND l.kind = 'jasa' AND extract(year FROM o.order_date) = $3
       UNION ALL
       SELECT l.account_code, l.net FROM ap_invoice_lines l JOIN ap_invoices i ON i.id = l.invoice_id
        WHERE i.company_id = $1 AND i.branch_code = $2 AND i.status = 'draf' AND l.kind = 'jasa' AND extract(year FROM i.invoice_date) = $3
       UNION ALL
       SELECT l.expense_account_code, l.est_total FROM purchase_requisition_lines l JOIN purchase_requisitions r ON r.id = l.requisition_id
        WHERE r.company_id = $1 AND r.branch_code = $2 AND r.status = 'disetujui' AND r.order_id IS NULL AND l.kind = 'jasa' AND extract(year FROM r.request_date) = $3
     ) x WHERE acc = ANY($4::text[]) GROUP BY acc`, [companyId, branch, year, accounts])).rows;
  for (const r of rows) out.set(r.acc, Number(r.v));
  return out;
}

/** Sisa anggaran tahunan (disetujui) per akun: anggaran − realisasi − komitmen. Akun tanpa anggaran tidak dikembalikan. */
export async function budgetAvailability(c: PoolClient, companyId: string, branch: string, year: number, accounts: string[]) {
  const lines = (await c.query(
    `SELECT l.account_code, l.amounts FROM budget_lines l JOIN budgets b ON b.id = l.budget_id
      WHERE b.company_id = $1 AND b.branch_code = $2 AND b.fiscal_year = $3 AND b.status = 'disetujui' AND l.account_code = ANY($4::text[])`,
    [companyId, branch, year, accounts])).rows;
  if (!lines.length) return [];
  const codes = lines.map((l: any) => l.account_code);
  const act = await actualByMonth(c, companyId, branch, year, codes);
  const com = await commitments(c, companyId, branch, year, codes);
  return lines.map((l: any) => {
    const budget = (l.amounts as string[]).reduce((t, v) => t + Number(v), 0);
    const actual = (act.get(l.account_code) ?? []).reduce((t, v) => t + v, 0);
    const commitment = com.get(l.account_code) ?? 0;
    return { account: l.account_code as string, budget, actual, commitment, available: budget - actual - commitment };
  });
}
