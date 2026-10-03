/**
 * POS / kasir (rencana Fase 3 sprint 9): ringkasan shift dan jurnal tutup shift.
 * Harga produk adalah DPP; PPN 11% dihitung per transaksi (seperti faktur).
 * Kas laci awal (float) sudah bagian dari saldo akun kas toko sehingga tidak
 * dijurnal; yang dijurnal saat posting hanyalah perubahan karena shift:
 *   Dr kas toko (penjualan tunai ± selisih hitung) · Dr bank penampung (non-tunai)
 *   Cr penjualan barang (DPP) · Cr PPN keluaran · Dr/Cr selisih kas
 *   Dr HPP / Cr persediaan (per akun persediaan)
 */
import type { Rupiah } from './types.js';

export const PAY_METHODS = ['tunai', 'qris', 'debit', 'kredit', 'transfer'] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export const PAY_LABEL: Record<PayMethod, string> = { tunai: 'Tunai', qris: 'QRIS', debit: 'Kartu debit', kredit: 'Kartu kredit', transfer: 'Transfer' };

export interface PosTrx { net: Rupiah; ppn: Rupiah; total: Rupiah; method: PayMethod; status: 'selesai' | 'void' }

export function shiftSummary(trx: PosTrx[], openingCash: Rupiah) {
  const ok = trx.filter((t) => t.status === 'selesai');
  const byMethod = Object.fromEntries(PAY_METHODS.map((m) => [m, ok.filter((t) => t.method === m).reduce((s, t) => s + t.total, 0)])) as Record<PayMethod, Rupiah>;
  const cash = byMethod.tunai;
  const gross = ok.reduce((s, t) => s + t.total, 0);
  return {
    count: ok.length, voids: trx.length - ok.length, net: ok.reduce((s, t) => s + t.net, 0), ppn: ok.reduce((s, t) => s + t.ppn, 0), gross,
    cash, nonCash: gross - cash, byMethod, expectedCash: openingCash + cash, avgBasket: ok.length ? Math.round(gross / ok.length) : 0,
  };
}

export interface ShiftJournalInput {
  summary: { net: Rupiah; ppn: Rupiah; cash: Rupiah; nonCash: Rupiah; expectedCash: Rupiah };
  countedCash: Rupiah;
  cashAccount: string; cashBank: string;
  settlementAccount?: string | null; settlementBank?: string | null;
  salesGoods: string; ppnOut: string; cogs: string; overShort: string;
  cogsByAccount: Record<string, Rupiah>;
}

/** Baris jurnal posting shift; selalu seimbang. */
export function shiftJournalLines(x: ShiftJournalInput) {
  const diff = x.countedCash - x.summary.expectedCash;
  const lines: { account: string; debit: Rupiah; credit: Rupiah; bank?: string; memo?: string | null }[] = [];
  const cashDelta = x.summary.cash + diff;
  if (cashDelta) lines.push({ account: x.cashAccount, debit: Math.max(cashDelta, 0), credit: Math.max(-cashDelta, 0), bank: x.cashBank, memo: 'Penjualan tunai' + (diff ? ' ± selisih hitung kas' : '') });
  if (x.summary.nonCash) {
    if (!x.settlementAccount) throw new Error('Rekening penampung non-tunai belum ditetapkan.');
    lines.push({ account: x.settlementAccount, debit: x.summary.nonCash, credit: 0, bank: x.settlementBank ?? undefined, memo: 'Penjualan non-tunai (QRIS/kartu/transfer)' });
  }
  if (diff) lines.push({ account: x.overShort, debit: Math.max(-diff, 0), credit: Math.max(diff, 0), memo: diff < 0 ? 'Kekurangan kas kasir' : 'Kelebihan kas kasir' });
  if (x.summary.net) lines.push({ account: x.salesGoods, debit: 0, credit: x.summary.net, memo: null });
  if (x.summary.ppn) lines.push({ account: x.ppnOut, debit: 0, credit: x.summary.ppn, memo: null });
  const cogs = Object.values(x.cogsByAccount).reduce((s, v) => s + v, 0);
  if (cogs) {
    lines.push({ account: x.cogs, debit: cogs, credit: 0, memo: null });
    for (const [acc, v] of Object.entries(x.cogsByAccount)) if (v) lines.push({ account: acc, debit: 0, credit: v, memo: null });
  }
  return { lines, diff };
}
