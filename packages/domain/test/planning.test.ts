import { describe, expect, it } from 'vitest';
import { budgetSummary, elapsedMonths, naturalAmount, projectHealth, projectProgress } from '../src/planning.js';

describe('Anggaran & proyek', () => {
  it('tanda alami akun', () => {
    expect(naturalAmount('Beban', 100, 30)).toBe(70);
    expect(naturalAmount('Pendapatan', 10, 500)).toBe(490);
  });
  it('serapan, prakiraan & selisih anggaran', () => {
    const s = budgetSummary({ budget: 1200, actual: 700, commitment: 100, remainingBudget: 500 });
    expect(s.absorption).toBe(66.7);
    expect(s.forecast).toBe(1300);
    expect(s.variance).toBe(100);
    expect(s.over).toBe(true);
    expect(s.available).toBe(400);
  });
  it('kesehatan proyek: merah bila melampaui, kuning bila serapan > 85% saat kemajuan < 80%', () => {
    expect(projectHealth(1000, 1001, 99)).toBe('merah');
    expect(projectHealth(1000, 900, 70)).toBe('kuning');
    expect(projectHealth(1000, 900, 85)).toBe('hijau');
    expect(projectHealth(0, 0, 0)).toBe('hijau');
  });
  it('kemajuan tertimbang & bulan berjalan', () => {
    expect(projectProgress([{ progress: 100, weight: 1 }, { progress: 0, weight: 3 }])).toBe(25);
    expect(projectProgress([], 40)).toBe(40);
    expect(elapsedMonths(2026, '2026-10-03')).toBe(10);
    expect(elapsedMonths(2027, '2026-10-03')).toBe(0);
    expect(elapsedMonths(2025, '2026-10-03')).toBe(12);
  });
});
