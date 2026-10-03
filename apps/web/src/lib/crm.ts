/** Label modul CRM & penawaran. */
export const STAGE_COLUMNS: [string, string][] = [['prospek', 'Prospek'], ['kualifikasi', 'Kualifikasi'], ['penawaran', 'Penawaran'], ['negosiasi', 'Negosiasi'], ['menang', 'Menang'], ['kalah', 'Kalah']];
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGE_COLUMNS);
export const SOURCES = ['Website', 'Referensi', 'Tender', 'Pameran', 'Langsung', 'Lainnya'];
export const ACTIVITY_LABEL: Record<string, string> = { catatan: 'Catatan', telepon: 'Telepon', rapat: 'Rapat', email: 'Email', kunjungan: 'Kunjungan', tahap: 'Perubahan tahap' };
export const QUOTE_CHIPS: [string, string][] = [['', 'Semua'], ['draf', 'Draf'], ['terkirim', 'Terkirim'], ['diterima', 'Diterima'], ['ditolak', 'Ditolak'], ['batal', 'Batal']];
export const CRM_TIMELINE: Record<string, { label: string; tone: string }> = {
  'quotation.created': { label: 'membuat penawaran', tone: 'accent' },
  'quotation.updated': { label: 'mengubah penawaran', tone: '' },
  'quotation.sent': { label: 'mengirim penawaran ke pelanggan', tone: 'accent' },
  'quotation.accepted': { label: 'mencatat penawaran diterima', tone: 'ok' },
  'quotation.rejected': { label: 'mencatat penawaran ditolak', tone: 'warn' },
  'quotation.ordered': { label: 'mengonversi menjadi pesanan penjualan', tone: 'ok' },
  'quotation.cancelled': { label: 'membatalkan penawaran', tone: '' },
};
