/** Helper bersama modul kas & bank. */
import type { PoolClient } from 'pg';
import type { RequestUser } from '../common/context.js';
import { forbidden } from '../common/errors.js';
import { invalid, trimBranch } from '../sales/sales.shared.js';

/** Rekening aktif berdenominasi IDR dengan akun buku besar detail. */
export async function usableBank(c: PoolClient, companyId: string, code: string, label = 'Rekening') {
  const b = (await c.query('SELECT * FROM bank_accounts WHERE company_id = $1 AND code = $2', [companyId, String(code ?? '').toUpperCase()])).rows[0];
  if (!b) throw invalid('BANK_UNKNOWN', `${label} ${code} tidak dikenal.`);
  if (b.status !== 'aktif' || b.currency !== 'IDR') throw invalid('BANK_INACTIVE', `${label} ${b.code} nonaktif atau berdenominasi valas.`);
  if (!b.gl_account_code) throw invalid('BANK_NO_ACCOUNT', `${label} ${b.code} belum memiliki akun buku besar.`);
  return { ...b, branch_code: trimBranch(b.branch_code) };
}

/** Saldo buku rekening per tanggal (jurnal terposting/dibalik). */
export async function bankBookBalance(c: PoolClient, companyId: string, bank: string, asOf: string, before = false): Promise<number> {
  return Number((await c.query(
    `SELECT coalesce(sum(jl.debit - jl.credit),0)::bigint AS v FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
      WHERE jl.company_id = $1 AND jl.bank_account_code = $2 AND j.status IN ('posted','reversed') AND jl.journal_date ${before ? '<' : '<='} $3`, [companyId, bank, asOf])).rows[0].v);
}

export async function headOffice(c: PoolClient, companyId: string): Promise<string> {
  const r = (await c.query('SELECT code FROM branches WHERE company_id = $1 AND is_head_office ORDER BY code LIMIT 1', [companyId])).rows[0];
  if (!r) throw invalid('NO_HEAD_OFFICE', 'Kantor pusat belum ditetapkan pada data cabang.');
  return trimBranch(r.code);
}

/** Pengguna harus berhak atas semua cabang yang dijurnal. */
export function assertBranches(u: RequestUser, branches: string[]) {
  const missing = branches.filter((b) => u.branches !== '*' && !u.branches.includes(b));
  if (missing.length) throw forbidden(`Memerlukan akses ke cabang ${missing.join(', ')} untuk memposting dokumen ini.`);
}
