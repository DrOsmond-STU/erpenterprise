/**
 * Penggajian (rencana Fase 4 sprint 10): lembur, BPJS, PPh 21, dan jurnal.
 * Perhitungan disederhanakan namun konsisten & dapat diaudit:
 *  - Lembur: upah sejam = gaji pokok / 173; jam pertama per hari ×1,5, berikutnya ×2.
 *  - BPJS dasar = gaji pokok + tunjangan tetap. Pekerja 4% (Kesehatan 1%, JHT 2%,
 *    JP 1%); pemberi kerja 10,24% (Kesehatan 4%, JHT 3,7%, JP 2%, JKK 0,24%, JKM 0,3%).
 *  - PPh 21 metode setahun: (bruto − JHT/JP pekerja) × 12 − biaya jabatan 5% (maks.
 *    6 jt/thn) − PTKP → tarif progresif Pasal 17 → dibagi 12.
 * Jurnal posting: Dr beban gaji (produksi → tenaga kerja langsung, lainnya → gaji &
 * tunjangan) + Dr beban BPJS pemberi kerja / Cr utang gaji (neto), Cr utang PPh 21,
 * Cr utang BPJS (pekerja + pemberi kerja).
 */
import type { Rupiah } from './types.js';

export const PTKP: Record<string, number> = { 'TK/0': 54_000_000, 'TK/1': 58_500_000, 'TK/2': 63_000_000, 'TK/3': 67_500_000, 'K/0': 58_500_000, 'K/1': 63_000_000, 'K/2': 67_500_000, 'K/3': 72_000_000 };
const BRACKETS: [number, number][] = [[60_000_000, 0.05], [250_000_000, 0.15], [500_000_000, 0.25], [5_000_000_000, 0.3], [Infinity, 0.35]];

/** Upah lembur dari jam lembur harian. */
export function overtimePay(basic: Rupiah, dailyHours: number[]): Rupiah {
  const hourly = basic / 173;
  return Math.round(dailyHours.reduce((t, h) => t + (h <= 0 ? 0 : Math.min(h, 1) * 1.5 + Math.max(h - 1, 0) * 2), 0) * hourly);
}

export function pph17(annualTaxable: number): Rupiah {
  let rest = Math.max(0, Math.floor(annualTaxable / 1000) * 1000), lower = 0, tax = 0;
  for (const [upper, rate] of BRACKETS) {
    if (rest <= 0) break;
    const slice = Math.min(rest, upper - lower);
    tax += slice * rate; rest -= slice; lower = upper;
  }
  return Math.round(tax);
}

export interface PayslipInput { basic: Rupiah; allowance: Rupiah; overtime: Rupiah; otherDeduction?: Rupiah; ptkp?: string }

export function computePayslip(x: PayslipInput) {
  const gross = x.basic + x.allowance + x.overtime;
  const base = x.basic + x.allowance;
  const r = (v: number) => Math.round(v);
  const bpjsEmployee = r(base * 0.01) + r(base * 0.02) + r(base * 0.01);
  const jhtJp = r(base * 0.02) + r(base * 0.01);
  const bpjsEmployer = r(base * 0.04) + r(base * 0.037) + r(base * 0.02) + r(base * 0.0024) + r(base * 0.003);
  const annualGross = (gross - jhtJp) * 12;
  const occupational = Math.min(annualGross * 0.05, 6_000_000);
  const pph21 = Math.round(pph17(annualGross - occupational - (PTKP[x.ptkp ?? 'TK/0'] ?? PTKP['TK/0'])) / 12);
  const other = x.otherDeduction ?? 0;
  const deduction = bpjsEmployee + pph21 + other;
  return { gross, bpjsEmployee, bpjsEmployer, pph21, otherDeduction: other, deduction, net: gross - deduction };
}

export interface SlipForJournal { dept: string; gross: Rupiah; bpjsEmployee: Rupiah; bpjsEmployer: Rupiah; pph21: Rupiah; otherDeduction: Rupiah; net: Rupiah }

/** Jurnal posting penggajian satu cabang; selalu seimbang. */
export function payrollJournalLines(slips: SlipForJournal[], a: { directLabor: string; salaryExpense: string; salaryPayable: string; taxPayable: string; bpjsPayable: string; otherPayable?: string }) {
  const sum = (f: (s: SlipForJournal) => number, filter = (_: SlipForJournal) => true) => slips.filter(filter).reduce((t, s) => t + f(s), 0);
  const direct = sum((s) => s.gross, (s) => s.dept === 'Produksi');
  const indirect = sum((s) => s.gross, (s) => s.dept !== 'Produksi');
  const employer = sum((s) => s.bpjsEmployer);
  const lines: { account: string; debit: Rupiah; credit: Rupiah; memo?: string | null }[] = [];
  if (direct) lines.push({ account: a.directLabor, debit: direct, credit: 0, memo: 'Gaji bagian produksi' });
  if (indirect + employer) lines.push({ account: a.salaryExpense, debit: indirect + employer, credit: 0, memo: employer ? 'Gaji & tunjangan + BPJS pemberi kerja' : 'Gaji & tunjangan' });
  lines.push({ account: a.salaryPayable, debit: 0, credit: sum((s) => s.net), memo: 'Gaji neto' });
  const pph = sum((s) => s.pph21);
  if (pph) lines.push({ account: a.taxPayable, debit: 0, credit: pph, memo: 'PPh 21' });
  const bpjs = sum((s) => s.bpjsEmployee) + employer;
  if (bpjs) lines.push({ account: a.bpjsPayable, debit: 0, credit: bpjs, memo: 'BPJS pekerja + pemberi kerja' });
  const other = sum((s) => s.otherDeduction);
  if (other) lines.push({ account: a.otherPayable ?? a.salaryPayable, debit: 0, credit: other, memo: 'Potongan lain' });
  return lines;
}

/** Samarkan nilai rahasia (NIK, NPWP, rekening): hanya 4 karakter terakhir. */
export const maskTail = (v: string | null | undefined) => (v ? `****${String(v).replace(/\s+/g, '').slice(-4)}` : null);
