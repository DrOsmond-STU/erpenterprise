/**
 * Persediaan (rencana Fase 3 sprint 7): nilai mutasi stok dengan harga pokok
 * rata-rata bergerak, selisih opname, dan jurnal transfer stok antar cabang
 * (dikirim → dalam perjalanan → diterima) lewat rekening koran antar kantor.
 * Murni — dipakai API dan web.
 */
import type { Rupiah } from './types.js';
import { movingAverage } from './purchasing.js';

/** Nilai keluar stok = qty × harga pokok rata-rata (dibulatkan). */
export const issueValue = (qty: number, avgCost: Rupiah): Rupiah => Math.round(qty * avgCost);

/**
 * Masuk stok bernilai `value`: harga rata-rata baru dan perubahan nilai kartu stok.
 * `delta` adalah yang dijurnal ke akun persediaan; `value − delta` adalah selisih
 * pembulatan yang dibebankan ke akun selisih persediaan (agar kartu stok = buku besar).
 */
export function receiveInto(onHand: number, avgCost: Rupiah, qty: number, value: Rupiah) {
  const newAvg = movingAverage(onHand, avgCost, qty, value / qty);
  const delta = Math.round((onHand + qty) * newAvg - onHand * avgCost);
  return { newAvg, delta, variance: value - delta };
}

/** Opname: selisih = hitung fisik − stok sistem; nilai = selisih × harga rata-rata. */
export function countDifference(systemQty: number, countedQty: number, avgCost: Rupiah) {
  const diff = Math.round((countedQty - systemQty) * 10_000) / 10_000;
  return { diff, value: issueValue(diff, avgCost) };
}

export interface StockLeg { branch: string; lines: { account: string; debit: Rupiah; credit: Rupiah; counterBranch?: string | null; memo?: string | null }[] }

/** Pengiriman antar cabang: asal mengkredit persediaan ke RK; tujuan mencatat barang dalam perjalanan. */
export function transferShipLegs(t: { fromBranch: string; toBranch: string; headOffice: string; rkBranch: string; rkHeadOffice: string; transit: string; byAccount: Record<string, Rupiah> }): StockLeg[] {
  const total = Object.values(t.byAccount).reduce((s, v) => s + v, 0);
  const rkOf = (b: string) => (b === t.headOffice ? t.rkBranch : t.rkHeadOffice);
  return [
    { branch: t.fromBranch, lines: [{ account: rkOf(t.fromBranch), debit: total, credit: 0, counterBranch: t.toBranch }, ...Object.entries(t.byAccount).map(([account, v]) => ({ account, debit: 0, credit: v }))] },
    { branch: t.toBranch, lines: [{ account: t.transit, debit: total, credit: 0 }, { account: rkOf(t.toBranch), debit: 0, credit: total, counterBranch: t.fromBranch }] },
  ];
}

/** Baris jurnal netto dengan arah otomatis (nilai negatif → kredit). */
export function signedLine(account: string, value: Rupiah, memo?: string) {
  return { account, debit: value > 0 ? value : 0, credit: value < 0 ? -value : 0, memo: memo ?? null };
}
