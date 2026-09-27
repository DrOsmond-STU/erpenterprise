/** Label linimasa dokumen pembelian dari aksi jejak audit. */
export const PURCHASE_TIMELINE: Record<string, { label: string; tone: string }> = {
  'purchase_order.created': { label: 'membuat PO', tone: 'accent' },
  'purchase_order.updated': { label: 'mengubah PO', tone: '' },
  'purchase_order.submitted': { label: 'mengajukan PO — perlu persetujuan', tone: 'warn' },
  'purchase_order.auto_approved': { label: 'mengajukan PO — di bawah ambang, disetujui otomatis', tone: 'ok' },
  'purchase_order.approved': { label: 'menyetujui PO', tone: 'ok' },
  'purchase_order.rejected': { label: 'menolak PO', tone: 'warn' },
  'purchase_order.cancelled': { label: 'membatalkan PO', tone: '' },
  'purchase_order.received': { label: 'mencatat penerimaan barang — stok & jurnal diposting', tone: 'ok' },
  'ap_invoice.created': { label: 'membuat draf tagihan', tone: 'accent' },
  'ap_invoice.updated': { label: 'mengubah draf tagihan', tone: '' },
  'ap_invoice.posted': { label: 'memposting tagihan — jurnal utang diposting', tone: 'ok' },
  'ap_invoice.cancelled': { label: 'membatalkan tagihan', tone: 'warn' },
  'supplier_payment.requested': { label: 'mengajukan pembayaran', tone: 'accent' },
  'supplier_payment.approval_recorded': { label: 'memberi persetujuan pertama', tone: 'ok' },
  'supplier_payment.approved': { label: 'menyetujui pembayaran — siap dibayar', tone: 'ok' },
  'supplier_payment.rejected': { label: 'menolak pembayaran', tone: 'warn' },
  'supplier_payment.cancelled': { label: 'membatalkan pembayaran', tone: '' },
  'supplier_payment.paid': { label: 'mengeksekusi pembayaran — jurnal bank diposting', tone: 'ok' },
};
export const PO_CHIPS: [string, string][] = [['', 'Semua'], ['draf', 'Draf'], ['menunggu', 'Menunggu'], ['disetujui', 'Disetujui'], ['diterima-sebagian', 'Diterima sebagian'], ['selesai', 'Selesai'], ['ditolak', 'Ditolak'], ['batal', 'Batal']];
export const PAYMENT_CHIPS: [string, string][] = [['', 'Semua'], ['menunggu', 'Menunggu'], ['disetujui', 'Siap dibayar'], ['dibayar', 'Dibayar'], ['ditolak', 'Ditolak'], ['batal', 'Batal']];
