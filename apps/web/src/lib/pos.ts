/** Label linimasa shift kasir. */
export const POS_TIMELINE: Record<string, { label: string; tone: string }> = {
  'pos_shift.opened': { label: 'membuka shift', tone: 'accent' },
  'pos_shift.trx_voided': { label: 'membatalkan transaksi', tone: 'warn' },
  'pos_shift.closed': { label: 'menutup shift & menghitung kas', tone: 'warn' },
  'pos_shift.posted': { label: 'memposting shift — jurnal penjualan & stok', tone: 'ok' },
};
