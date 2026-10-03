/**
 * Produksi (rencana Fase 3 sprint 8): kebutuhan bahan dari BOM, alur status perintah
 * kerja, dan nilai barang dalam proses (WIP). Murni — dipakai API dan web.
 *
 * Jurnal: pemakaian bahan Dr WIP / Cr persediaan bahan; hasil produksi (lolos QC)
 * Dr persediaan barang jadi / Cr WIP sebesar seluruh saldo WIP perintah kerja
 * (biaya produk cacat normal diserap barang yang lolos).
 */
import type { Rupiah } from './types.js';

export const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export interface BomLine { sku: string; qty: number }

/** Kebutuhan bahan untuk `plannedQty` unit dari BOM berukuran `batchQty`. */
export function bomRequirement(lines: BomLine[], batchQty: number, plannedQty: number): BomLine[] {
  if (!(batchQty > 0)) return [];
  return lines.map((l) => ({ sku: l.sku, qty: round4((l.qty * plannedQty) / batchQty) }));
}

/** Status perintah kerja dan transisi yang diizinkan. */
export const WO_STATUSES = ['draf', 'antre', 'berjalan', 'qc', 'selesai', 'batal'] as const;
export type WoStatus = (typeof WO_STATUSES)[number];
const NEXT: Record<WoStatus, WoStatus[]> = {
  draf: ['antre', 'batal'], antre: ['berjalan', 'batal'], berjalan: ['qc'], qc: ['selesai', 'berjalan'], selesai: [], batal: [],
};
export const canMove = (from: WoStatus, to: WoStatus) => NEXT[from]?.includes(to) ?? false;

/** Saldo WIP perintah kerja = Σ bahan dikeluarkan − Σ nilai hasil. */
export const wipBalance = (issued: Rupiah[], output: Rupiah[]) => issued.reduce((s, v) => s + v, 0) - output.reduce((s, v) => s + v, 0);

/** Harga pokok per unit hasil (dibulatkan) dari saldo WIP dan qty lolos QC. */
export function unitCostOf(wip: Rupiah, goodQty: number): Rupiah {
  return goodQty > 0 ? Math.round(wip / goodQty) : 0;
}

/** Pemakaian aktual vs standar BOM per SKU (positif = boros). */
export function usageVariance(standard: BomLine[], actual: BomLine[]) {
  const skus = [...new Set([...standard, ...actual].map((l) => l.sku))];
  return skus.map((sku) => {
    const s = standard.filter((l) => l.sku === sku).reduce((t, l) => t + l.qty, 0);
    const a = actual.filter((l) => l.sku === sku).reduce((t, l) => t + l.qty, 0);
    return { sku, standard: round4(s), actual: round4(a), diff: round4(a - s) };
  });
}
