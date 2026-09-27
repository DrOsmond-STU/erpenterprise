import type { BalanceSheet, IncomeStatement } from '@erp/domain';
import * as F from '@/lib/format';
import type { StmtRow } from '@/components/StatementTable.vue';

/** Menyusun baris laba rugi dari satu atau beberapa laporan (kolom per cabang + konsolidasi). */
export function plRows(reports: IncomeStatement[], withPct: boolean): StmtRow[] {
  const last = reports[reports.length - 1];
  const pct = (v: number) => (withPct && last.revenue ? F.pct((v / last.revenue) * 100) : undefined);
  const rows: StmtRow[] = [];
  const line = (label: string, f: (r: IncomeStatement) => number, kind: StmtRow['kind'] = 'line', code?: string) =>
    rows.push({ kind, label, code, values: reports.map(f), pct: pct(f(last)) });
  const codes = (gid: string) => [...new Set(reports.flatMap((r) => r.groups.find((g) => g.id === gid)?.rows.map((x) => `${x.code}|${x.name}`) ?? []))].sort();
  const amount = (gid: string, code: string) => (r: IncomeStatement) => r.groups.find((g) => g.id === gid)?.rows.find((x) => x.code === code)?.amount ?? 0;
  const groupRows = (gid: string) => codes(gid).forEach((k) => { const [code, name] = k.split('|'); line(name, amount(gid, code), 'line', code); });

  rows.push({ kind: 'section', label: 'Pendapatan', values: [] }); groupRows('pendapatan'); line('Total pendapatan', (r) => r.revenue, 'subtotal');
  rows.push({ kind: 'section', label: 'Harga pokok penjualan', values: [] }); groupRows('hpp'); line('Laba kotor', (r) => r.gross, 'subtotal');
  rows.push({ kind: 'section', label: 'Beban operasional', values: [] }); groupRows('opex'); line('Total beban operasional', (r) => r.opex, 'subtotal');
  rows.push({ kind: 'section', label: 'Beban umum & administrasi', values: [] }); groupRows('ga'); line('Total beban umum & administrasi', (r) => r.ga, 'subtotal');
  line('Laba operasional', (r) => r.operating, 'subtotal');
  rows.push({ kind: 'section', label: 'Pendapatan (beban) lain-lain', values: [] }); groupRows('lain');
  line('Laba (rugi) bersih', (r) => r.net, 'total');
  return rows;
}

/**
 * Baris neraca dari header level 2 (seksi) dan level 3 (baris); detail level 4–5
 * sudah dijumlahkan oleh domain. Bila `combined` diberikan, kolom eliminasi &
 * konsolidasi ditambahkan.
 */
export function bsRows(reports: BalanceSheet[], combined?: BalanceSheet, eliminations?: { code: string; amount: number; lineCode?: string }[]): StmtRow[] {
  const multi = Boolean(combined);
  const all = multi ? [...reports, combined!] : reports;
  const rows: StmtRow[] = [];
  const elimOf = (code?: string) => (code ? (eliminations ?? []).filter((e) => (e.lineCode ?? e.code) === code).reduce((s, e) => s + e.amount, 0) : 0);
  const push = (kind: StmtRow['kind'], label: string, f: (r: BalanceSheet) => number, code?: string, interco = false, elimTotal?: number) => {
    const vals: (number | null)[] = reports.map(f);
    if (multi) {
      const comb = f(combined!);
      const e = elimTotal !== undefined ? elimTotal : (interco ? -elimOf(code) : (code ? 0 : null));
      vals.push(e, comb + (e ?? 0));
    }
    rows.push({ kind, label, code, interco, values: vals });
  };
  type List = 'assets' | 'liabilities' | 'equity';
  const find = (r: BalanceSheet, list: List, code: string) => r[list].find((a) => a.code === code)?.amount ?? 0;
  const codes = (list: List, parent: string) => {
    const m = new Map<string, { name: string; interco: boolean }>();
    for (const r of all) for (const a of r[list]) if (a.parentCode === parent) m.set(a.code, { name: a.name, interco: Boolean(a.interco) });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  };
  const sections = new Map<string, string>();
  for (const r of all) for (const sct of r.sections ?? []) sections.set(sct.code, sct.name);
  const group = (list: List, parent: string, label: string) => {
    const cs = codes(list, parent); if (!cs.length) return;
    rows.push({ kind: 'section', label, values: [] });
    for (const [code, meta] of cs) push('line', meta.name, (r) => find(r, list, code), code, meta.interco);
    const elim = -cs.reduce((s, [code]) => s + elimOf(code), 0);
    push('subtotal', `Total ${label.toLowerCase()}`, (r) => cs.reduce((s, [code]) => s + find(r, list, code), 0), undefined, false, multi ? elim : undefined);
  };
  const bySection = (prefix: string, list: List) => [...sections.entries()].filter(([c]) => c.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).forEach(([c, n]) => group(list, c, n));
  const elimAssets = -(eliminations ?? []).filter((e) => e.code.startsWith('1')).reduce((s, e) => s + e.amount, 0);
  const elimEquity = -(eliminations ?? []).filter((e) => e.code.startsWith('3')).reduce((s, e) => s + e.amount, 0);
  bySection('1', 'assets');
  push('total', 'TOTAL ASET', (r) => r.totalAssets, undefined, false, multi ? elimAssets : undefined);
  bySection('2', 'liabilities');
  push('total', 'TOTAL LIABILITAS', (r) => r.totalLiab, undefined, false, multi ? 0 : undefined);
  bySection('3', 'equity');
  push('total', 'TOTAL EKUITAS', (r) => r.totalEquity, undefined, false, multi ? elimEquity : undefined);
  push('total', 'TOTAL LIABILITAS & EKUITAS', (r) => r.totalLiabEquity, undefined, false, multi ? elimEquity : undefined);
  return rows;
}
