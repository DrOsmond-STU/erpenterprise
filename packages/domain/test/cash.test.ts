import { describe, expect, it } from 'vitest';
import { autoMatch, bankRecSummary, parseAmount, parseBankCsv, parseDate, parseMt940, parseStatement, ppnSettlementLegs, statementProblems, transferLegs } from '../src/cash.js';

const balanced = (lines: { debit: number; credit: number }[]) => lines.reduce((t, l) => t + l.debit, 0) === lines.reduce((t, l) => t + l.credit, 0);

describe('kas & bank', () => {
  it('membaca angka & tanggal format Indonesia dan internasional', () => {
    expect(parseAmount('1.234.567,50')).toBe(1_234_568);
    expect(parseAmount('1,234,567.00')).toBe(1_234_567);
    expect(parseAmount('(2.500)')).toBe(-2500);
    expect(parseAmount('-15000')).toBe(-15000);
    expect(parseAmount('150,000.00 DB')).toBe(-150000);
    expect(parseAmount('abc')).toBeNull();
    expect(parseDate('05/09/2026')).toBe('2026-09-05');
    expect(parseDate('2026-09-05')).toBe('2026-09-05');
    expect(parseDate('5 Sep 2026')).toBe('2026-09-05');
    expect(parseDate('31/02/2026')).toBeNull();
  });

  it('CSV debit/kredit berpemisah titik koma dengan baris saldo', () => {
    const p = parseBankCsv([
      'Rekening;012-410-2277',
      'Tanggal;Keterangan;Referensi;Debit;Kredit;Saldo',
      '01/09/2026;SALDO AWAL;;;;"10.000.000,00"',
      '02/09/2026;TRF MASUK INV-2026-0101;INV-2026-0101;;"5.000.000,00";"15.000.000,00"',
      '03/09/2026;BIAYA ADM;;"15.000,00";;"14.985.000,00"',
    ].join('\n'));
    expect(p.errors).toEqual([]);
    expect(p.opening).toBe(10_000_000);
    expect(p.closing).toBe(14_985_000);
    expect(p.lines.map((l) => l.amount)).toEqual([5_000_000, -15_000]);
    expect(p.lines[0].reference).toBe('INV-2026-0101');
    expect(statementProblems({ opening: p.opening!, closing: p.closing!, lines: p.lines })).toEqual([]);
  });

  it('CSV jumlah bertanda berpemisah koma; saldo awal diturunkan dari kolom saldo', () => {
    const p = parseStatement('Date,Description,Amount,Balance\n2026-09-02,Setoran,1000000,6000000\n2026-09-03,Transfer keluar,-250000,5750000\n');
    expect(p.format).toBe('csv');
    expect(p.opening).toBe(5_000_000);
    expect(p.closing).toBe(5_750_000);
  });

  it('MT940: saldo awal/akhir, mutasi kredit/debit, keterangan :86:', () => {
    const p = parseMt940([':20:STMT', ':25:0124102277', ':28C:1/1', ':60F:C260901IDR10000000,00',
      ':61:2609020902C5000000,00NTRFINV-2026-0101//B1', ':86:TRF DARI PT GLOBAL', ':61:2609030903D15000,00NCHG//B2', ':86:BIAYA ADM', ':62F:C260930IDR14985000,00', '-'].join('\n'));
    expect(p.errors).toEqual([]);
    expect(p.account).toBe('0124102277');
    expect(p.opening).toBe(10_000_000);
    expect(p.closing).toBe(14_985_000);
    expect(p.lines).toHaveLength(2);
    expect(p.lines[0]).toMatchObject({ date: '2026-09-02', amount: 5_000_000, description: 'TRF DARI PT GLOBAL' });
    expect(p.lines[1].amount).toBe(-15_000);
    expect(parseStatement([':20:X', ':60F:C260901IDR0,', ':61:260902C1,NTRF', ':62F:C260902IDR1,'].join('\n')).format).toBe('mt940');
  });

  it('pencocokan otomatis: jumlah sama, tanggal ≤ 3 hari, referensi diutamakan, satu-satu', () => {
    const m = autoMatch(
      [{ id: 1, date: '2026-09-02', amount: 500, reference: 'INV-2026-0101', description: '' }, { id: 2, date: '2026-09-02', amount: 500, reference: null, description: '' }, { id: 3, date: '2026-09-20', amount: 700, reference: null, description: '' }],
      [{ id: 10, date: '2026-09-01', amount: 500, text: 'penerimaan INV-2026-0099' }, { id: 11, date: '2026-09-03', amount: 500, text: 'INV-2026-0101' }, { id: 12, date: '2026-09-10', amount: 700, text: '' }],
    );
    expect(m).toEqual([{ statementLineId: 1, bookLineId: 11 }, { statementLineId: 2, bookLineId: 10 }]);
  });

  it('ringkasan rekonsiliasi: saldo buku disesuaikan = saldo rekening koran', () => {
    const r = bankRecSummary({ statementOpening: 1000, statementClosing: 1900, bookOpening: 1000, bookClosing: 2400, bookOnly: [700, -300], unmatched: [-15], ignored: [15] });
    expect(r).toMatchObject({ inTransit: 700, outstanding: 300, adjustedBook: 2000 - 0, difference: -100 });
    const ok = bankRecSummary({ statementOpening: 1000, statementClosing: 1985, bookOpening: 1000, bookClosing: 2000, bookOnly: [], unmatched: [-15], ignored: [] });
    expect(ok.balanced).toBe(true);
  });

  it('transfer satu cabang = satu jurnal; antar cabang lewat RK dengan cabang lawan', () => {
    const base = { fromGl: '1-1105', toGl: '1-1101', fromBank: 'BNK-008', toBank: 'BNK-001', amount: 50_000_000, headOffice: 'JKT', rkBranch: '1-3101', rkHeadOffice: '3-1501' };
    const same = transferLegs({ ...base, fromBranch: 'CKR', toBranch: 'CKR' });
    expect(same).toHaveLength(1);
    const toHo = transferLegs({ ...base, fromBranch: 'CKR', toBranch: 'JKT' });
    expect(toHo.map((l) => l.branch)).toEqual(['CKR', 'JKT']);
    expect(toHo[0].lines[0]).toMatchObject({ account: '3-1501', debit: 50_000_000, counterBranch: 'JKT' });
    expect(toHo[1].lines[1]).toMatchObject({ account: '1-3101', credit: 50_000_000, counterBranch: 'CKR' });
    const b2b = transferLegs({ ...base, fromBranch: 'CKR', toBranch: 'SBY' });
    expect(b2b.flatMap((l) => l.lines).filter((x) => x.account === '3-1501').reduce((t, x) => t + x.debit - x.credit, 0)).toBe(0);
    for (const leg of [...same, ...toHo, ...b2b]) expect(balanced(leg.lines)).toBe(true);
  });

  it('setoran PPN terpusat: cabang menutup PPN ke RK, pusat mencatat utang pajak', () => {
    const acc = { headOffice: 'JKT', ppnOut: '2-1401', ppnIn: '1-1701', taxPayable: '2-1301', rkBranch: '1-3101', rkHeadOffice: '3-1501' };
    const r = ppnSettlementLegs([{ branch: 'JKT', output: 10_000, input: 4_000 }, { branch: 'CKR', output: 3_000, input: 5_000 }, { branch: 'SBY', output: 2_000, input: 0 }], acc);
    expect(r.total).toBe(6_000 - 2_000 + 2_000);
    for (const leg of r.legs) expect(balanced(leg.lines)).toBe(true);
    const ho = r.legs.find((l) => l.branch === 'JKT')!;
    expect(ho.lines.find((l) => l.account === '2-1301')?.credit).toBe(6_000);
    const rk = r.legs.flatMap((l) => l.lines).filter((l) => l.account === '1-3101' || l.account === '3-1501');
    expect(rk.filter((l) => l.account === '1-3101').reduce((t, l) => t + l.debit - l.credit, 0)).toBe(rk.filter((l) => l.account === '3-1501').reduce((t, l) => t + l.credit - l.debit, 0));
    const over = ppnSettlementLegs([{ branch: 'JKT', output: 1_000, input: 3_000 }], acc);
    expect(over.total).toBe(-2_000);
    expect(over.legs[0].lines.find((l) => l.account === '1-1701' && l.debit)?.debit).toBe(2_000);
    for (const leg of over.legs) expect(balanced(leg.lines)).toBe(true);
  });
});
