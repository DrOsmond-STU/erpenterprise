import { describe, expect, it } from 'vitest';
import { costCenterAllowed, costCenterCycle, costCenterRoot, payrollLinesByCostCenter } from '../src/cost-centers.js';
import { journalLineSchema } from '../src/journal.js';

describe('Pusat biaya', () => {
  it('hanya akun laba rugi yang menerima dimensi pusat biaya', () => {
    expect(costCenterAllowed('5-2100')).toBe(true);
    expect(costCenterAllowed('4-1100.01')).toBe(true);
    expect(costCenterAllowed('1-1100')).toBe(false);
    expect(costCenterAllowed('2-1100')).toBe(false);
  });
  it('induk teratas & deteksi siklus hierarki', () => {
    const list = [{ id: 'a' }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' }];
    expect(costCenterRoot(list, 'c')).toBe('a');
    expect(costCenterRoot(list, 'a')).toBe('a');
    expect(costCenterCycle(list, 'a', 'c')).toBe(true);
    expect(costCenterCycle(list, 'b', 'b')).toBe(true);
    expect(costCenterCycle(list, 'c', 'a')).toBe(false);
    expect(costCenterCycle(list, 'c', null)).toBe(false);
  });
  it('baris jurnal menerima costCenterId uuid', () => {
    expect(journalLineSchema.safeParse({ account: '5-2100', debit: 1, costCenterId: 'bukan-uuid' }).success).toBe(false);
    expect(journalLineSchema.safeParse({ account: '5-2100', debit: 1, costCenterId: '3f1c7e2a-1b2c-4d5e-8f90-1234567890ab' }).success).toBe(true);
  });
  it('jurnal gaji: beban dipecah per pusat biaya, utang digabung, tetap seimbang', () => {
    const acc = { directLabor: '5-1300', salaryExpense: '5-2100', salaryPayable: '2-1300', taxPayable: '2-1400', bpjsPayable: '2-1500' };
    const slip = (dept: string, gross: number, cc: string | null) => ({ dept, gross, bpjsEmployee: 10, bpjsEmployer: 20, pph21: 5, otherDeduction: 0, net: gross - 15, costCenterId: cc });
    const lines = payrollLinesByCostCenter([slip('Produksi', 1000, 'P'), slip('Penjualan', 800, 'S'), slip('Penjualan', 700, 'S'), slip('Umum', 500, null)], acc);
    const dr = lines.reduce((t, l) => t + l.debit, 0), cr = lines.reduce((t, l) => t + l.credit, 0);
    expect(dr).toBe(cr);
    expect(lines.find((l) => l.account === '5-1300' && l.costCenter === 'P')?.debit).toBe(1000);
    expect(lines.find((l) => l.account === '5-2100' && l.costCenter === 'S')?.debit).toBe(1540);
    expect(lines.find((l) => l.account === '5-2100' && l.costCenter === 'P')?.debit).toBe(20);
    expect(lines.find((l) => l.account === '5-2100' && !l.costCenter)?.debit).toBe(520);
    expect(lines.filter((l) => l.account === '2-1300')).toHaveLength(1);
    expect(lines.filter((l) => l.credit > 0).every((l) => !l.costCenter)).toBe(true);
  });
});
