import type { Account, AccountCategory, NormalSide } from './types.js';

export const RK_CABANG = '1-3100';   // buku kantor pusat
export const RK_PUSAT = '3-1500';    // buku cabang
export const CASH_ACCOUNT = '1-1100';
export const AR_ACCOUNT = '1-1200';
export const AP_ACCOUNT = '2-1100';
export const CURRENT_EARNINGS = '3-3000';
export const INVENTORY_ACCOUNTS = ['1-1400', '1-1450', '1-1500'];
export const FIXED_ASSET_ACCOUNTS = ['1-2300', '1-2400', '1-2500'];
export const ACCUM_DEPR = '1-2900';
export const SALARY_PAYABLE = '2-1200';

export const isDebitNormal = (code: string): boolean => /^[15]/.test(code);
export const normalSideOf = (code: string): NormalSide => (isDebitNormal(code) ? 'debit' : 'credit');

export const categoryOf = (code: string): AccountCategory =>
  (({ '1': 'Aset', '2': 'Liabilitas', '3': 'Ekuitas', '4': 'Pendapatan', '5': 'Beban' } as Record<string, AccountCategory>)[code[0]]);

/** Mengubah baris bagan akun purwarupa (`DATA.chartOfAccounts`) menjadi `Account`. */
export function fromPrototype(raw: {
  code: string; name: string; type: 'Header' | 'Detail'; category: AccountCategory; level: number;
  parent: string | null; status: 'aktif' | 'nonaktif'; interco?: boolean; contra?: boolean; computed?: boolean;
}): Account {
  return {
    code: raw.code,
    name: raw.name,
    type: raw.type === 'Header' ? 'header' : 'detail',
    category: raw.category,
    parentCode: raw.parent,
    level: raw.level,
    normalSide: normalSideOf(raw.code),
    isIntercompany: Boolean(raw.interco),
    isContra: Boolean(raw.contra),
    isCash: raw.code === CASH_ACCOUNT,
    isComputed: Boolean(raw.computed),
    status: raw.status,
  };
}

export class AccountIndex {
  private readonly byCode = new Map<string, Account>();
  readonly list: Account[];

  constructor(accounts: Account[]) {
    this.list = [...accounts].sort((a, b) => a.code.localeCompare(b.code));
    for (const a of this.list) this.byCode.set(a.code, a);
  }

  get(code: string): Account | undefined { return this.byCode.get(code); }
  name(code: string): string { return this.byCode.get(code)?.name ?? code; }
  details(): Account[] { return this.list.filter((a) => a.type === 'detail'); }
  children(parentCode: string): Account[] { return this.list.filter((a) => a.parentCode === parentCode); }
  isDetail(code: string): boolean { return this.byCode.get(code)?.type === 'detail'; }
  isIntercompany(code: string): boolean { return Boolean(this.byCode.get(code)?.isIntercompany); }
}
