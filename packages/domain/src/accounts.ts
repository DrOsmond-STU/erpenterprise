import type { Account, AccountCategory, NormalSide } from './types.js';

/* Akun detail standar (COA bertingkat, lihat coa.ts). Posting otomatis memakai
   pemetaan akun perusahaan (Pengaturan → Pemetaan akun); nilai di sini adalah bawaannya. */
export const RK_CABANG = '1-3101';   // buku kantor pusat
export const RK_PUSAT = '3-1501';    // buku cabang
export const AR_ACCOUNT = '1-1301';
export const AP_ACCOUNT = '2-1101';
export const CURRENT_EARNINGS = '3-2201';
export const INVENTORY_ACCOUNTS = ['1-1501', '1-1502', '1-1503'];
/** Header aset tetap yang dicocokkan dengan register aset (tanah & bangunan dicatat langsung). */
export const FIXED_ASSET_HEADERS = ['1-2300', '1-2400', '1-2500'];
export const ACCUM_DEPR_HEADER = '1-2900';
export const SALARY_PAYABLE = '2-1201';

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
    isCash: raw.code === '1-1100',
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
  /** Leluhur pada level tertentu (akun itu sendiri bila levelnya sama); undefined bila tidak ada. */
  ancestorAt(code: string, level: number): Account | undefined {
    let a = this.byCode.get(code);
    while (a && a.level > level) a = a.parentCode ? this.byCode.get(a.parentCode) : undefined;
    return a && a.level === level ? a : undefined;
  }
  /** Akun detail di bawah (atau sama dengan) kode ini. */
  descendantDetails(code: string): Account[] {
    return this.list.filter((a) => a.type === 'detail' && (a.code === code || this.isUnder(a.code, code)));
  }
  isUnder(code: string, ancestor: string): boolean {
    let a = this.byCode.get(code);
    while (a?.parentCode) { if (a.parentCode === ancestor) return true; a = this.byCode.get(a.parentCode); }
    return false;
  }
  name(code: string): string { return this.byCode.get(code)?.name ?? code; }
  details(): Account[] { return this.list.filter((a) => a.type === 'detail'); }
  children(parentCode: string): Account[] { return this.list.filter((a) => a.parentCode === parentCode); }
  isDetail(code: string): boolean { return this.byCode.get(code)?.type === 'detail'; }
  isIntercompany(code: string): boolean { return Boolean(this.byCode.get(code)?.isIntercompany); }
}
