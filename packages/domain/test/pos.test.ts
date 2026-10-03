import { describe, expect, it } from 'vitest';
import { shiftJournalLines, shiftSummary } from '../src/pos.js';

const balanced = (lines: { debit: number; credit: number }[]) => lines.reduce((t, l) => t + l.debit, 0) === lines.reduce((t, l) => t + l.credit, 0);
const acc = { cashAccount: '1-1201', cashBank: 'KAS-CKR', settlementAccount: '1-1105', settlementBank: 'BNK-008', salesGoods: '4-1101', ppnOut: '2-1401', cogs: '5-1101', overShort: '5-4101' };

describe('POS', () => {
  const trx = [
    { net: 100_000, ppn: 11_000, total: 111_000, method: 'tunai' as const, status: 'selesai' as const },
    { net: 200_000, ppn: 22_000, total: 222_000, method: 'qris' as const, status: 'selesai' as const },
    { net: 50_000, ppn: 5_500, total: 55_500, method: 'tunai' as const, status: 'void' as const },
  ];
  it('ringkasan shift mengabaikan transaksi void', () => {
    const s = shiftSummary(trx, 500_000);
    expect(s).toMatchObject({ count: 2, voids: 1, net: 300_000, ppn: 33_000, gross: 333_000, cash: 111_000, nonCash: 222_000, expectedCash: 611_000, avgBasket: 166_500 });
  });
  it('jurnal posting seimbang; kekurangan kas dibebankan', () => {
    const s = shiftSummary(trx, 500_000);
    const j = shiftJournalLines({ ...acc, summary: s, countedCash: 610_000, cogsByAccount: { '1-1503': 180_000 } });
    expect(j.diff).toBe(-1_000);
    expect(balanced(j.lines)).toBe(true);
    expect(j.lines.find((l) => l.account === '1-1201')?.debit).toBe(110_000);
    expect(j.lines.find((l) => l.account === '5-4101')?.debit).toBe(1_000);
    expect(j.lines.find((l) => l.account === '1-1503')?.credit).toBe(180_000);
  });
  it('kelebihan kas mengkredit selisih kas; tanpa non-tunai tidak perlu rekening penampung', () => {
    const s = shiftSummary([trx[0]], 0);
    const j = shiftJournalLines({ ...acc, settlementAccount: null, summary: s, countedCash: 112_000, cogsByAccount: {} });
    expect(balanced(j.lines)).toBe(true);
    expect(j.lines.find((l) => l.account === '5-4101')?.credit).toBe(1_000);
    expect(() => shiftJournalLines({ ...acc, settlementAccount: null, summary: shiftSummary(trx, 0), countedCash: 111_000, cogsByAccount: {} })).toThrow();
  });
});
