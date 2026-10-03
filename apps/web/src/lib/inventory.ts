/** Label linimasa & saringan dokumen persediaan. */
export const INVENTORY_TIMELINE: Record<string, { label: string; tone: string }> = {
  'stock_adjustment.created': { label: 'mencatat penyesuaian — menunggu persetujuan', tone: 'warn' },
  'stock_adjustment.posted': { label: 'menyetujui — stok & jurnal diposting', tone: 'ok' },
  'stock_adjustment.rejected': { label: 'menolak penyesuaian', tone: 'warn' },
  'stock_adjustment.cancelled': { label: 'membatalkan penyesuaian', tone: '' },
  'stock_transfer.created': { label: 'membuat draf transfer', tone: 'accent' },
  'stock_transfer.shipped': { label: 'mengirim barang — stok asal berkurang & jurnal diposting', tone: 'ok' },
  'stock_transfer.received': { label: 'menerima barang — stok tujuan bertambah', tone: 'ok' },
  'stock_transfer.cancelled': { label: 'membatalkan transfer', tone: '' },
};
export const ADJ_CHIPS: [string, string][] = [['', 'Semua'], ['menunggu', 'Menunggu'], ['diposting', 'Diposting'], ['ditolak', 'Ditolak'], ['batal', 'Batal']];
export const STOCK_TRANSFER_CHIPS: [string, string][] = [['', 'Semua'], ['draf', 'Draf'], ['dikirim', 'Dalam perjalanan'], ['diterima', 'Diterima'], ['batal', 'Batal']];
export const STOCK_CHIPS: [string, string][] = [['', 'Semua'], ['di-bawah-minimum', 'Di bawah minimum'], ['habis', 'Habis'], ['di-atas-maksimum', 'Di atas maksimum'], ['normal', 'Normal']];
export const ADJ_REASONS: [string, string, string][] = [
  ['opname', 'Stok opname', 'Hasil hitung fisik — selisih bisa plus atau minus.'],
  ['rusak', 'Barang rusak', 'Hanya mengurangi stok; isi jumlah yang tersisa layak pakai.'],
  ['hilang', 'Barang hilang', 'Hanya mengurangi stok; isi jumlah yang masih ada.'],
  ['koreksi', 'Koreksi', 'Koreksi kesalahan pencatatan.'],
];
