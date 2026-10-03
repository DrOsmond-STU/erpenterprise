import { describe, expect, it } from 'vitest';
import { computePayslip, overtimePay, payrollJournalLines, payrollPaymentLegs, pph17 } from '../src/payroll.js';
import { depreciationFor, disposalLines, monthEndOf, monthlyStraightLine, nextMonth } from '../src/fixed-assets.js';

const balanced = (lines: { debit: number; credit: number }[]) => lines.reduce((t, l) => t + l.debit, 0) === lines.reduce((t, l) => t + l.credit, 0);

describe('penggajian', () => {
  it('lembur: jam pertama ×1,5, berikutnya ×2 dari upah sejam 1/173', () => {
    expect(overtimePay(17_300_000, [1])).toBe(150_000);
    expect(overtimePay(17_300_000, [3, 0])).toBe(150_000 + 400_000);
  });
  it('PPh 21 progresif pasal 17', () => {
    expect(pph17(60_000_000)).toBe(3_000_000);
    expect(pph17(100_000_000)).toBe(3_000_000 + 6_000_000);
    expect(pph17(-5)).toBe(0);
  });
  it('slip gaji: bruto, BPJS, PPh 21, neto', () => {
    const s = computePayslip({ basic: 10_000_000, allowance: 2_000_000, overtime: 500_000, ptkp: 'TK/0' });
    expect(s.gross).toBe(12_500_000);
    expect(s.bpjsEmployee).toBe(480_000);
    expect(s.bpjsEmployer).toBe(1_228_800);
    expect(s.pph21).toBeGreaterThan(0);
    expect(s.net).toBe(s.gross - s.bpjsEmployee - s.pph21);
    expect(computePayslip({ basic: 3_000_000, allowance: 0, overtime: 0 }).pph21).toBe(0);
  });
  it('jurnal penggajian seimbang; produksi ke tenaga kerja langsung', () => {
    const a = computePayslip({ basic: 10_000_000, allowance: 0, overtime: 0 }), b = computePayslip({ basic: 8_000_000, allowance: 1_000_000, overtime: 0 });
    const lines = payrollJournalLines([{ dept: 'Produksi', ...a }, { dept: 'Keuangan', ...b }], { directLabor: '5-2101', salaryExpense: '5-2201', salaryPayable: '2-1201', taxPayable: '2-1301', bpjsPayable: '2-1601' });
    expect(balanced(lines)).toBe(true);
    expect(lines.find((l) => l.account === '5-2101')?.debit).toBe(10_000_000);
    expect(lines.find((l) => l.account === '2-1201')?.credit).toBe(a.net + b.net);
  });
});

describe('pembayaran gaji lintas cabang', () => {
  it('kantor pusat membayar gaji cabang lewat RK', () => {
    const legs = payrollPaymentLegs([{ branch: 'JKT', amount: 100 }, { branch: 'CKR', amount: 60 }], { bankBranch: 'JKT', bankGl: '1-1102', bank: 'BNK-002', salaryPayable: '2-1201', headOffice: 'JKT', rkBranch: '1-3101', rkHeadOffice: '3-1501' });
    expect(legs.map((l) => l.branch)).toEqual(['JKT', 'CKR']);
    for (const l of legs) expect(balanced(l.lines)).toBe(true);
    expect(legs[0].lines.find((l) => l.account === '1-3101')).toMatchObject({ debit: 60, counterBranch: 'CKR' });
    expect(legs[1].lines.find((l) => l.account === '3-1501')).toMatchObject({ credit: 60, counterBranch: 'JKT' });
  });
});

describe('aset tetap', () => {
  it('garis lurus & batas nilai residu', () => {
    expect(monthlyStraightLine(120_000_000, 0, 60)).toBe(2_000_000);
    expect(depreciationFor(1_500_000, 0, 2_000_000)).toBe(1_500_000);
    expect(depreciationFor(10_000, 10_000, 2_000)).toBe(0);
  });
  it('pelepasan: laba/rugi, jurnal seimbang', () => {
    const base = { cost: 100, bookValue: 40, assetAccount: '1-2401', accumAccount: '1-2901', bankAccount: '1-1101', bank: 'BNK-001', gainAccount: '4-2101', lossAccount: '5-4101' };
    const g = disposalLines({ ...base, proceeds: 55 });
    expect(g.gain).toBe(15); expect(balanced(g.lines)).toBe(true);
    const l = disposalLines({ ...base, proceeds: 0 });
    expect(l.gain).toBe(-40); expect(balanced(l.lines)).toBe(true);
  });
  it('periode', () => { expect(nextMonth('2026-12')).toBe('2027-01'); expect(monthEndOf('2026-02')).toBe('2026-02-28'); });
});
