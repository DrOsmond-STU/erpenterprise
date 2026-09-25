/**
 * Memuat data & mesin buku besar purwarupa (skrip peramban) di Node sebagai
 * golden dataset untuk uji regresi paket domain.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromPrototype, AccountIndex } from '../src/accounts.js';
import type { Account, PostedLine, Period, BankAccount } from '../src/types.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../prototype/assets');

export interface PrototypeWorld {
  DATA: any;
  Ledger: any;
  accounts: AccountIndex;
  periods: Period[];
  bankAccounts: BankAccount[];
  lines: PostedLine[];
}

export function loadPrototype(): PrototypeWorld {
  const src = ['data.js', 'charts.js', 'ledger.js'].map((f) => readFileSync(resolve(root, f), 'utf8')).join('\n') + '\nreturn { DATA, Ledger };';
  const g: any = globalThis;
  g.document ||= { documentElement: {} };
  g.getComputedStyle ||= () => ({ getPropertyValue: () => '' });
  g.window ||= {};
  const { DATA, Ledger } = new Function(src)();
  const accounts = new AccountIndex((DATA.chartOfAccounts as any[]).map(fromPrototype) as Account[]);
  const periods: Period[] = DATA.periods.map((p: any) => ({ id: p.id, label: p.label, from: p.from, to: p.to, status: p.closed ? 'closed' : 'open', group: p.group }));
  const bankAccounts: BankAccount[] = DATA.bankAccounts.map((b: any) => ({ id: b.id, code: b.id, name: b.name, branchCode: b.branch, currency: b.currency, openingBalance: b.opening }));
  const lines: PostedLine[] = [];
  for (const j of Ledger.all()) {
    if (j.status !== 'diposting') continue;
    for (const l of j.lines) lines.push({ ...l, bankAccountId: l.bank ?? null, date: j.date, branch: j.branch, journalId: j.id, journalNo: j.id, description: j.desc, ref: j.ref, source: j.source });
  }
  return { DATA, Ledger, accounts, periods, bankAccounts, lines };
}
