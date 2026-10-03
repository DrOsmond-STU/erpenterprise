import { describe, expect, it } from 'vitest';
import { awardProblems, bestQuote, quoteTotals, slaDue } from '../src/procurement.js';

describe('Pengadaan', () => {
  it('SLA prioritas tinggi 24 jam, rendah 5 hari', () => {
    const t = new Date('2026-10-01T02:00:00Z');
    expect(slaDue(t, 'tinggi').toISOString()).toBe('2026-10-02T02:00:00.000Z');
    expect(slaDue(t, 'rendah').toISOString()).toBe('2026-10-06T02:00:00.000Z');
  });
  it('total penawaran memakai aturan PPN PO dan menolak baris kosong', () => {
    const lines = [{ lineNo: 1, qty: 10, kind: 'barang' as const }, { lineNo: 2, qty: 1, kind: 'jasa' as const }];
    const ok = quoteTotals(lines, [{ lineNo: 1, price: 100_000, discPct: 10 }, { lineNo: 2, price: 500_000 }]);
    expect(ok.problems).toEqual([]);
    expect(ok.net).toBe(1_400_000);
    expect(ok.total).toBe(1_400_000 + 154_000);
    const miss = quoteTotals(lines, [{ lineNo: 1, price: 100_000 }, { lineNo: 9, price: 1 }]);
    expect(miss.problems).toHaveLength(2);
  });
  it('pemenang: harga terbaik, sumber tunggal & selain terendah wajib beralasan', () => {
    const q = [
      { id: 'a', status: 'masuk' as const, total: 1_000, supplierName: 'A' },
      { id: 'b', status: 'masuk' as const, total: 900, supplierName: 'B' },
      { id: 'c', status: 'diundang' as const, total: null },
    ];
    expect(bestQuote(q)?.id).toBe('b');
    expect(awardProblems(q, 'b')).toEqual([]);
    expect(awardProblems(q, 'a')[0]).toMatch(/terendah adalah B/);
    expect(awardProblems(q, 'a', 'kualitas lebih baik & garansi')).toEqual([]);
    expect(awardProblems(q, 'c')[0]).toMatch(/sudah masuk/);
    expect(awardProblems([q[0], q[2]], 'a')[0]).toMatch(/sumber tunggal/);
  });
});
