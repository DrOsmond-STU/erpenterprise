/**
 * Pusat biaya (cost center): dimensi analitis pada baris jurnal untuk akun
 * pendapatan & beban. Laba rugi per pusat biaya = laba rugi biasa yang dipecah
 * menurut dimensi ini; baris tanpa pusat biaya tampil sebagai "tidak teralokasi"
 * sehingga jumlah seluruh kolom selalu sama dengan laba rugi cabang/perusahaan.
 */
import { payrollJournalLines, type SlipForJournal } from './payroll.js';
import type { Rupiah } from './types.js';

export type CostCenterKind = 'biaya' | 'laba';
export const COST_CENTER_KIND_LABEL: Record<CostCenterKind, string> = { biaya: 'Pusat biaya', laba: 'Pusat laba' };

/** Dimensi pusat biaya hanya bermakna untuk akun laba rugi (4-xxxx pendapatan, 5-xxxx beban). */
export const costCenterAllowed = (accountCode: string) => /^[45]-/.test(accountCode);

export interface CostCenterNode { id: string; parentId?: string | null }

/** Induk teratas pusat biaya (untuk laporan yang digabung ke induk). */
export function costCenterRoot(list: CostCenterNode[], id: string): string {
  const by = new Map(list.map((c) => [c.id, c]));
  let cur = by.get(id);
  const seen = new Set<string>();
  while (cur?.parentId && by.has(cur.parentId) && !seen.has(cur.id)) { seen.add(cur.id); cur = by.get(cur.parentId); }
  return cur?.id ?? id;
}

/** true bila menjadikan `parentId` induk dari `id` membentuk siklus (termasuk induk = diri sendiri). */
export function costCenterCycle(list: CostCenterNode[], id: string, parentId: string | null | undefined): boolean {
  if (!parentId) return false;
  const by = new Map(list.map((c) => [c.id, c]));
  let cur: string | null | undefined = parentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === id) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = by.get(cur)?.parentId ?? null;
  }
  return false;
}

export interface CostCenterSlip extends SlipForJournal { costCenterId?: string | null }
type PayrollAccounts = Parameters<typeof payrollJournalLines>[1];
export interface TaggedLine { account: string; debit: Rupiah; credit: Rupiah; memo?: string | null; costCenter?: string | null }

/**
 * Jurnal gaji dengan beban dipecah per pusat biaya karyawan: baris beban (debit)
 * ditandai pusat biaya slip; baris utang (kredit) digabung per akun tanpa dimensi.
 */
export function payrollLinesByCostCenter(slips: CostCenterSlip[], a: PayrollAccounts): TaggedLine[] {
  const groups = new Map<string, CostCenterSlip[]>();
  for (const s of slips) { const k = s.costCenterId ?? ''; (groups.get(k) ?? groups.set(k, []).get(k)!).push(s); }
  const debit = new Map<string, TaggedLine>();
  const credit = new Map<string, TaggedLine>();
  for (const [cc, list] of groups) {
    for (const l of payrollJournalLines(list, a)) {
      if (l.debit > 0) {
        const k = `${l.account}|${cc}`;
        const e = debit.get(k);
        if (e) e.debit += l.debit; else debit.set(k, { account: l.account, debit: l.debit, credit: 0, memo: l.memo ?? null, costCenter: cc || null });
      } else {
        const e = credit.get(l.account);
        if (e) e.credit += l.credit; else credit.set(l.account, { account: l.account, debit: 0, credit: l.credit, memo: l.memo ?? null });
      }
    }
  }
  return [...debit.values(), ...credit.values()];
}
