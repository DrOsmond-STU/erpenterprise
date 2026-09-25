/**
 * Tipe domain bersama antara API dan aplikasi web.
 * Uang selalu integer rupiah; tanggal string `YYYY-MM-DD`.
 */

export type Rupiah = number;
export type ISODate = string;

export type AccountCategory = 'Aset' | 'Liabilitas' | 'Ekuitas' | 'Pendapatan' | 'Beban';
export type AccountType = 'header' | 'detail';
export type NormalSide = 'debit' | 'credit';

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
  parentCode: string | null;
  level: number;
  normalSide: NormalSide;
  isIntercompany: boolean;
  isContra: boolean;
  isCash: boolean;
  isComputed: boolean;
  status: 'aktif' | 'nonaktif';
}

export interface Period {
  id: string;
  label: string;
  from: ISODate;
  to: ISODate;
  status: 'open' | 'closing' | 'closed';
  group?: 'Bulan' | 'Kuartal' | 'Tahun';
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  short: string;
  type: string;
  city: string;
  isHeadOffice: boolean;
  status: 'aktif' | 'nonaktif';
  mainBankAccountId?: string | null;
  pettyCashAccountId?: string | null;
  targetMonthly: Rupiah;
}

export interface BankAccount {
  id: string;
  code: string;
  name: string;
  branchCode: string;
  currency: string;
  openingBalance: Rupiah;
}

export type JournalStatus = 'draft' | 'pending' | 'posted' | 'rejected' | 'reversed';

export interface JournalLineInput {
  account: string;
  debit: Rupiah;
  credit: Rupiah;
  bankAccountId?: string | null;
  party?: string | null;
  counterBranch?: string | null;
  memo?: string | null;
}

export interface JournalInput {
  date: ISODate;
  branch: string;
  description: string;
  ref?: string | null;
  lines: JournalLineInput[];
}

export interface Journal extends JournalInput {
  id: string;
  journalNo: string;
  source: string;
  ruleCode: string;
  status: JournalStatus;
  total: Rupiah;
  createdBy: string;
  postedBy?: string | null;
  postedAt?: string | null;
}

/** Baris jurnal terposting yang sudah dilengkapi konteks jurnalnya. */
export interface PostedLine extends JournalLineInput {
  date: ISODate;
  branch: string;
  journalId: string;
  journalNo: string;
  description: string;
  ref?: string | null;
  source: string;
}

/** Saldo satu akun untuk satu cakupan (cabang/gabungan) dan satu periode. Nilai bertanda sisi normal. */
export interface AccountBalance {
  code: string;
  opening: Rupiah;
  debit: Rupiah;
  credit: Rupiah;
  ending: Rupiah;
}

export type BalanceMap = Record<string, AccountBalance>;

export interface SideAmount { d: Rupiah; k: Rupiah }

export interface TrialBalanceRow {
  code: string;
  name: string;
  category: AccountCategory;
  interco: boolean;
  open: SideAmount;
  debit: Rupiah;
  credit: Rupiah;
  end: SideAmount;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totals: { openD: Rupiah; openK: Rupiah; debit: Rupiah; credit: Rupiah; endD: Rupiah; endK: Rupiah };
  balanced: boolean;
}

export interface ReportLine { code: string; name: string; amount: Rupiah; parentCode?: string | null; interco?: boolean }

export interface IncomeStatement {
  groups: { id: string; label: string; rows: ReportLine[] }[];
  amounts: Record<string, Rupiah>;
  revenue: Rupiah; cogs: Rupiah; gross: Rupiah; opex: Rupiah; ga: Rupiah; operating: Rupiah; other: Rupiah; net: Rupiah;
  grossMargin: number; netMargin: number;
}

export interface BalanceSheet {
  asOf: ISODate;
  assets: ReportLine[];
  liabilities: ReportLine[];
  equity: ReportLine[];
  profit: Rupiah;
  totalAssets: Rupiah; totalLiab: Rupiah; totalEquity: Rupiah; totalLiabEquity: Rupiah;
  currentAssets: Rupiah; fixedAssets: Rupiah;
  balanced: boolean;
}

export interface ConsolidationColumn<T> { branch: string; label: string; report: T }
export interface Consolidation<T> {
  columns: ConsolidationColumn<T>[];
  combined: T;
  eliminations: { code: string; name: string; amount: Rupiah }[];
}

export interface ReconciliationCheck {
  id: string;
  label: string;
  module: string;
  source: string;
  subledger: number;
  ledger: number;
  diff: number;
  ok: boolean;
  note: string;
  count?: boolean;
}
