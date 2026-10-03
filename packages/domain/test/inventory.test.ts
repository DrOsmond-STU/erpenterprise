import { describe, expect, it } from 'vitest';
import { countDifference, issueValue, receiveInto, signedLine, transferShipLegs } from '../src/inventory.js';

const balanced = (lines: { debit: number; credit: number }[]) => lines.reduce((t, l) => t + l.debit, 0) === lines.reduce((t, l) => t + l.credit, 0);

describe('persediaan', () => {
  it('nilai keluar = qty × harga pokok rata-rata (dibulatkan)', () => {
    expect(issueValue(3, 1000.4)).toBe(3001);
    expect(issueValue(0, 5000)).toBe(0);
  });

  it('rata-rata bergerak saat masuk; selisih pembulatan dilaporkan', () => {
    const r = receiveInto(10, 1000, 5, 6000);
    expect(r.newAvg).toBeGreaterThan(1000);
    expect(r.delta + r.variance).toBe(6000);
    const fresh = receiveInto(0, 0, 3, 1000);
    expect(fresh.delta + fresh.variance).toBe(1000);
  });

  it('selisih opname dinilai dengan harga pokok', () => {
    expect(countDifference(640, 630, 34_600)).toEqual({ diff: -10, value: -346_000 });
    expect(countDifference(214, 216, 418_000)).toEqual({ diff: 2, value: 836_000 });
  });

  it('pengiriman antar cabang: asal Dr RK / Cr persediaan, tujuan Dr transit / Cr RK', () => {
    const legs = transferShipLegs({ fromBranch: 'CKR', toBranch: 'SBY', headOffice: 'JKT', rkBranch: '1-3101', rkHeadOffice: '3-1501', transit: '1-1504', byAccount: { '1-1501': 700, '1-1503': 300 } });
    expect(legs.map((l) => l.branch)).toEqual(['CKR', 'SBY']);
    for (const l of legs) expect(balanced(l.lines)).toBe(true);
    expect(legs[0].lines[0]).toMatchObject({ account: '3-1501', debit: 1000, counterBranch: 'SBY' });
    expect(legs[1].lines[0]).toMatchObject({ account: '1-1504', debit: 1000 });
    const fromHo = transferShipLegs({ fromBranch: 'JKT', toBranch: 'SBY', headOffice: 'JKT', rkBranch: '1-3101', rkHeadOffice: '3-1501', transit: '1-1504', byAccount: { '1-1501': 50 } });
    expect(fromHo[0].lines[0].account).toBe('1-3101');
    expect(fromHo[1].lines[1]).toMatchObject({ account: '3-1501', credit: 50, counterBranch: 'JKT' });
  });

  it('baris bertanda: negatif menjadi kredit', () => {
    expect(signedLine('5-1901', -500)).toMatchObject({ debit: 0, credit: 500 });
    expect(signedLine('1-1501', 200)).toMatchObject({ debit: 200, credit: 0 });
  });
});
