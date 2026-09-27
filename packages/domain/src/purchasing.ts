/**
 * Pembelian & hutang (dok. 07 §6, §10.3; dok. 11 K-24…K-26): harga pokok
 * rata-rata bergerak, kecocokan tiga arah, persetujuan pembayaran, dan masa
 * tunggu perubahan rekening pemasok. Murni — dipakai API dan web.
 */
import type { Account, Rupiah } from './types.js';

/** Harga pokok rata-rata setelah penerimaan (dibulatkan ke rupiah). */
export function movingAverage(onHand: number, avgCost: Rupiah, qty: number, unitCost: Rupiah): Rupiah {
  const total = onHand + qty;
  if (total <= 0) return unitCost;
  return Math.round((Math.max(0, onHand) * avgCost + qty * unitCost) / total);
}

/** K-26: pembayaran di atas ambang memerlukan dua penyetuju berbeda; selainnya satu (≠ pembuat). */
export const paymentApprovalsRequired = (amount: Rupiah, dualThreshold: Rupiah): 1 | 2 => (amount > dualThreshold ? 2 : 1);

/** K-25: rekening pemasok baru/ubah baru boleh dipakai transfer setelah disetujui dan melewati masa tunggu. */
export const SUPPLIER_BANK_COOLING_HOURS = 24;
export function bankCoolingProblem(verifiedAt: string | Date | null | undefined, now: Date = new Date(), hours = SUPPLIER_BANK_COOLING_HOURS): string | null {
  if (!verifiedAt) return 'Rekening bank pemasok belum terverifikasi (perlu persetujuan orang kedua).';
  const ready = new Date(new Date(verifiedAt).getTime() + hours * 3_600_000);
  if (ready > now) return `Rekening bank pemasok baru disetujui; transfer dapat dilakukan setelah ${ready.toISOString().slice(0, 16).replace('T', ' ')} UTC (masa tunggu ${hours} jam).`;
  return null;
}

/** Akun debit baris jasa/biaya tagihan pemasok: detail aktif kategori Beban/Aset, bukan kas, antar kantor, atau dihitung. */
export function expenseAccountProblem(a: Account | undefined): string | null {
  if (!a) return 'Akun biaya tidak ada di bagan akun.';
  if (a.type !== 'detail') return `${a.code} ${a.name} adalah header — pilih akun detail.`;
  if (a.status !== 'aktif') return `Akun ${a.code} nonaktif.`;
  if (a.category !== 'Beban' && a.category !== 'Aset') return `Akun ${a.code} berkategori ${a.category}; pilih akun beban atau aset.`;
  if (a.isCash || a.isIntercompany || a.isComputed) return `Akun ${a.code} tidak dapat dipakai untuk biaya pembelian.`;
  return null;
}

/** Kecocokan tiga arah per baris barang: kuantitas ditagih ≤ diterima − sudah ditagih, harga = harga PO. */
export function threeWayProblems(lines: { sku: string | null; qty: number; price: Rupiah; received: number; invoiced: number; poPrice: Rupiah }[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const open = l.received - l.invoiced;
    if (l.qty > open + 1e-9) out.push(`${l.sku ?? 'Baris'}: ditagih ${l.qty} melebihi barang diterima yang belum ditagih (${open}).`);
    if (l.price !== l.poPrice) out.push(`${l.sku ?? 'Baris'}: harga tagihan ${l.price.toLocaleString('id-ID')} berbeda dengan harga PO ${l.poPrice.toLocaleString('id-ID')}.`);
  }
  return out;
}
