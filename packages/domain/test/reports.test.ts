import { describe, expect, it } from 'vitest';
import { balancesFromLines, balanceSheet, consolidate, incomeStatement, intercompanyMismatch, trialBalance, ytdProfit } from '../src/reports.js';
import { validateJournal, normalizeLines, reverseLines } from '../src/journal.js';
import { splitPPN, allocate } from '../src/money.js';
import { loadPrototype } from './prototype';

const world = loadPrototype();
const { DATA, Ledger, accounts, lines } = world;
const period = (id: string) => DATA.periods.find((p: any) => p.id === id);
const scoped = (branch: string) => (branch === 'ALL' ? lines : lines.filter((l) => l.branch === branch));

describe('golden dataset purwarupa', () => {
  const cases: [string, string][] = [['ALL', '2026-08'], ['JKT', '2026-08'], ['CKR', '2026'], ['SBY', '2026-Q3'], ['MDN', '2026-06']];
  for (const [branch, pid] of cases) {
    it(`neraca saldo ${branch} ${pid} sama dengan purwarupa`, () => {
      const p = period(pid);
      const bal = balancesFromLines(scoped(branch), p.from, p.to);
      const tb = trialBalance(accounts, bal);
      const ref = Ledger.trialBalance({ branch, period: pid });
      expect(tb.balanced).toBe(true);
      expect(tb.totals).toEqual(ref.totals);
      expect(tb.rows.map((r) => r.code)).toEqual(ref.rows.map((r: any) => r.code));
    });
    it(`laba rugi & neraca ${branch} ${pid} sama dengan purwarupa`, () => {
      const p = period(pid);
      const bal = balancesFromLines(scoped(branch), p.from, p.to);
      const pl = incomeStatement(accounts, bal);
      const refPl = Ledger.incomeStatement({ branch, period: pid });
      expect(pl.revenue).toBe(refPl.revenue);
      expect(pl.net).toBe(refPl.net);
      expect(pl.gross).toBe(refPl.gross);
      const bs = balanceSheet(accounts, bal, p.to);
      const refBs = Ledger.balanceSheet({ branch, period: pid });
      expect(bs.balanced).toBe(true);
      expect(bs.totalAssets).toBe(refBs.totalAssets);
      expect(bs.profit).toBe(refBs.profit);
      expect(ytdProfit(accounts, bal)).toBe(Ledger.ytdProfit(branch, p.to));
    });
  }

  it('konsolidasi: RK Cabang = Σ RK Kantor Pusat dan tereliminasi', () => {
    const p = period('2026-08');
    const perBranch = DATA.branches.map((b: any) => ({ branch: b.id, label: b.short, balances: balancesFromLines(scoped(b.id), p.from, p.to) }));
    const cons = consolidate(accounts, perBranch, (bal) => balanceSheet(accounts, bal, p.to));
    expect(cons.eliminations.map((e) => e.code).sort()).toEqual(['1-3100', '3-1500']);
    const combined = balancesFromLines(lines, p.from, p.to);
    expect(intercompanyMismatch(accounts, combined)).toBe(0);
    const elim = cons.eliminations.find((e) => e.code === '1-3100')!.amount;
    expect(cons.combined.totalAssets - elim).toBe(cons.combined.totalLiabEquity - elim);
    expect(cons.columns).toHaveLength(4);
  });
});

describe('validasi jurnal', () => {
  const ctx = { accounts, periods: world.periods, branches: DATA.branches.map((b: any) => ({ code: b.id, status: b.status })), bankAccounts: world.bankAccounts };
  it('menerima jurnal seimbang dengan rekening pada baris kas', () => {
    const errs = validateJournal({ date: '2026-08-14', branch: 'JKT', description: 'Uji', lines: [
      { account: '5-3700', debit: 100000, credit: 0 }, { account: '1-1100', debit: 0, credit: 100000, bankAccountId: 'BNK-007' },
    ] }, ctx);
    expect(errs).toEqual([]);
  });
  it('menolak periode tertutup, akun header, tidak seimbang, dan rekening cabang lain', () => {
    const errs = validateJournal({ date: '2026-07-05', branch: 'CKR', description: 'Uji', lines: [
      { account: '1-0000', debit: 5, credit: 0 }, { account: '1-1100', debit: 0, credit: 4, bankAccountId: 'BNK-007' },
    ] }, ctx);
    expect(errs.join('\n')).toMatch(/ditutup/);
    expect(errs.join('\n')).toMatch(/akun header/);
    expect(errs.join('\n')).toMatch(/Tidak seimbang/);
    expect(errs.join('\n')).toMatch(/milik cabang JKT/);
  });
  it('normalisasi menyerap selisih pembulatan kecil dan jurnal balik menukar sisi', () => {
    const n = normalizeLines([{ account: 'a', debit: 1001, credit: 0 }, { account: 'b', debit: 0, credit: 1000 }, { account: 'c', debit: 0, credit: 0 }]);
    expect(n).toHaveLength(2);
    expect(n[1].credit).toBe(1001);
    expect(reverseLines(n)[0]).toMatchObject({ debit: 0, credit: 1001 });
  });
});

describe('uang', () => {
  it('memecah PPN tanpa kehilangan rupiah', () => {
    const { net, ppn } = splitPPN(519_800_000);
    expect(net + ppn).toBe(519_800_000);
    expect(ppn).toBe(51_511_712);
  });
  it('mengalokasikan sisa pembulatan', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });
});
