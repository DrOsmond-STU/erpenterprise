/**
 * Data contoh karyawan (idempoten): dari purwarupa + gaji pokok/tunjangan slip
 * Agustus. NIK & rekening contoh (fiktif) disimpan terenkripsi seperti data asli.
 */
import type pg from 'pg';
import { maskTail } from '@erp/domain';
import { encryptField } from '../common/crypto.js';

export async function seedHr(c: pg.Client, company: string, DATA: any) {
  if ((await c.query('SELECT 1 FROM employees WHERE company_id = $1 LIMIT 1', [company])).rowCount) {
    await c.query(`UPDATE payslips p SET employee_id = e.id FROM employees e WHERE e.company_id = $1 AND p.company_id = $1 AND e.code = p.employee_code AND p.employee_id IS NULL`, [company]);
    return { skipped: true, employees: 0 };
  }
  let n = 0;
  for (const [i, e] of (DATA.employees as any[]).entries()) {
    const slip = (DATA.payroll as any[]).find((p) => p.employeeId === e.id);
    const nik = `3175${String(1_000_000_000_000 + i * 7_919_311).slice(-12)}`;
    const acct = `${String(8_000_000_000 + i * 13_579).slice(0, 10)}`;
    await c.query(`INSERT INTO employees (company_id, branch_code, code, name, dept, title, join_date, employment, ptkp, basic_salary, fixed_allowance, nik_enc, nik_masked, bank_name, bank_account_enc, bank_account_masked, created_by_name)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'Seed')`,
      [company, e.branch, e.id, e.name, e.dept, e.title, e.join, e.status === 'magang' ? 'magang' : e.status === 'kontrak' ? 'kontrak' : 'tetap', i % 3 === 0 ? 'K/1' : 'TK/0',
        slip?.basic ?? 5_500_000, slip?.allowance ?? 1_000_000, encryptField(nik), maskTail(nik), 'BCA', encryptField(acct), maskTail(acct)]);
    n += 1;
  }
  await c.query(`UPDATE payslips p SET employee_id = e.id FROM employees e WHERE e.company_id = $1 AND p.company_id = $1 AND e.code = p.employee_code AND p.employee_id IS NULL`, [company]);
  return { skipped: false, employees: n };
}
