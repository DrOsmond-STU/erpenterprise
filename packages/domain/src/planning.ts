/**
 * Anggaran & proyek (dok. 07 §9.1, §10.6): realisasi dari buku besar dengan tanda
 * alami akun, serapan & prakiraan anggaran, serta kesehatan & kemajuan proyek.
 */
import type { AccountCategory } from './types.js';

/** Nilai bertanda alami: beban/aset = debit − kredit; pendapatan/liabilitas/ekuitas = kredit − debit. */
export function naturalAmount(category: AccountCategory, debit: number, credit: number): number {
  return category === 'Beban' || category === 'Aset' ? debit - credit : credit - debit;
}

export interface BudgetFigures { budget: number; actual: number; commitment: number; remainingBudget: number }
/**
 * Serapan = (realisasi + komitmen) / anggaran. Prakiraan = realisasi + komitmen + anggaran
 * bulan-bulan yang belum berjalan. Selisih = prakiraan − anggaran (positif = melampaui).
 */
export function budgetSummary(f: BudgetFigures) {
  const used = f.actual + f.commitment;
  const absorption = f.budget > 0 ? Math.round((used / f.budget) * 1000) / 10 : used > 0 ? 100 : 0;
  const forecast = used + f.remainingBudget;
  return { absorption, forecast, variance: forecast - f.budget, available: f.budget - used, over: forecast > f.budget };
}

export type ProjectHealth = 'hijau' | 'kuning' | 'merah';
/** actual > anggaran → merah; serapan > 85% saat kemajuan < 80% → kuning (risiko melampaui). */
export function projectHealth(budget: number, actual: number, progress: number): ProjectHealth {
  if (budget > 0 && actual > budget) return 'merah';
  if (budget > 0 && actual / budget > 0.85 && progress < 80) return 'kuning';
  return 'hijau';
}

/** Kemajuan proyek = rata-rata tertimbang kemajuan tugas (bobot bawaan 1). */
export function projectProgress(tasks: { progress: number; weight?: number }[], manual?: number | null): number {
  if (!tasks.length) return manual ?? 0;
  const w = tasks.reduce((t, x) => t + (x.weight ?? 1), 0);
  return Math.round(tasks.reduce((t, x) => t + x.progress * (x.weight ?? 1), 0) / w);
}

/** Bulan (1–12) yang sudah berjalan per tanggal acuan untuk tahun anggaran tertentu. */
export function elapsedMonths(fiscalYear: number, asOf: string): number {
  const y = Number(asOf.slice(0, 4)), m = Number(asOf.slice(5, 7));
  if (y < fiscalYear) return 0;
  if (y > fiscalYear) return 12;
  return m;
}
