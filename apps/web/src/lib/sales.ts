/** Label linimasa dokumen penjualan dari aksi jejak audit. */
export const TIMELINE: Record<string, { label: string; tone: string }> = {
  'sales_order.created': { label: 'membuat pesanan', tone: 'accent' },
  'sales_order.updated': { label: 'mengubah pesanan', tone: '' },
  'sales_order.submitted': { label: 'mengajukan pesanan — perlu persetujuan', tone: 'warn' },
  'sales_order.auto_approved': { label: 'mengajukan pesanan — lolos pemeriksaan plafon, disetujui otomatis', tone: 'ok' },
  'sales_order.approved': { label: 'menyetujui pesanan', tone: 'ok' },
  'sales_order.rejected': { label: 'menolak pesanan', tone: 'warn' },
  'sales_order.cancelled': { label: 'membatalkan pesanan', tone: '' },
  'sales_order.invoiced': { label: 'membuat faktur dari pesanan', tone: 'accent' },
  'invoice.created': { label: 'membuat draf faktur', tone: 'accent' },
  'invoice.updated': { label: 'mengubah draf faktur', tone: '' },
  'invoice.issued': { label: 'menerbitkan faktur — jurnal diposting', tone: 'ok' },
  'invoice.receipt': { label: 'mencatat penerimaan', tone: 'ok' },
  'invoice.cancelled': { label: 'membatalkan faktur', tone: 'warn' },
};
export const todayWib = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
