/**
 * Memuat data & mesin buku besar purwarupa (skrip peramban) di Node sebagai
 * golden dataset untuk uji regresi paket domain.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccountIndex } from '../src/accounts.js';
import { bankGlCodes, bankParentOf, LEGACY_ACCOUNT_MAP, LEGACY_CASH_ACCOUNT, makeAccount, STANDARD_COA } from '../src/coa.js';
import type { Account, PostedLine, Period, BankAccount } from '../src/types.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../prototype/assets');

export interface PrototypeWorld {
  DATA: any;
  Ledger: any;
  accounts: AccountIndex;
  periods: Period[];
  bankAccounts: BankAccount[];
  lines: PostedLine[];
  bankGl: Map<string, string>;
}

export function loadPrototype(): PrototypeWorld {
  const src = ['data.js', 'charts.js', 'ledger.js'].map((f) => readFileSync(resolve(root, f), 'utf8')).join('\n') + '\nreturn { DATA, Ledger };';
  const g: any = globalThis;
  g.document ||= { documentElement: {} };
  g.getComputedStyle ||= () => ({ getPropertyValue: () => '' });
  g.window ||= {};
  const { DATA, Ledger } = new Function(src)();
  /* Golden dataset dikonversi ke COA bertingkat: tiap rekening menjadi akun detail di bawah Bank/Kas. */
  const gl = bankGlCodes(DATA.bankAccounts.map((b: any) => ({ code: b.id, bankName: b.bank })));
  const bankAccts = DATA.bankAccounts.map((b: any) => ({ ...makeAccount(gl.get(b.id)!, b.name, 'detail', { cash: true }), parentCode: bankParentOf(b.bank) }));
  const accounts = new AccountIndex([...STANDARD_COA, ...bankAccts] as Account[]);
  const mapAccount = (l: any) => (l.account === LEGACY_CASH_ACCOUNT ? gl.get(l.bank)! : LEGACY_ACCOUNT_MAP[l.account] ?? l.account);
  const periods: Period[] = DATA.periods.map((p: any) => ({ id: p.id, label: p.label, from: p.from, to: p.to, status: p.closed ? 'closed' : 'open', group: p.group }));
  const bankAccounts: BankAccount[] = DATA.bankAccounts.map((b: any) => ({ id: b.id, code: b.id, name: b.name, branchCode: b.branch, currency: b.currency, openingBalance: b.opening, glAccountCode: gl.get(b.id) }));
  const lines: PostedLine[] = [];
  for (const j of Ledger.all()) {
    if (j.status !== 'diposting') continue;
    for (const l of j.lines) lines.push({ ...l, account: mapAccount(l), bankAccountId: l.bank ?? null, date: j.date, branch: j.branch, journalId: j.id, journalNo: j.id, description: j.desc, ref: j.ref, source: j.source });
  }
  return { DATA, Ledger, accounts, periods, bankAccounts, lines, bankGl: gl };
}
