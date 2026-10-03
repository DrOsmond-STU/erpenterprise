/** Label & saringan modul pengadaan (permintaan pembelian, RFQ). */
export const PR_CHIPS: [string, string][] = [['', 'Semua'], ['draf', 'Draf'], ['menunggu', 'Menunggu'], ['disetujui', 'Disetujui'], ['selesai', 'Selesai'], ['ditolak', 'Ditolak'], ['batal', 'Batal']];
export const PRIORITY_CHIPS: [string, string][] = [['', 'Semua prioritas'], ['tinggi', 'Tinggi'], ['sedang', 'Sedang'], ['rendah', 'Rendah']];
export const RFQ_CHIPS: [string, string][] = [['', 'Semua'], ['terbuka', 'Terbuka'], ['dipesan', 'Dipesan'], ['batal', 'Batal']];
export const SLA_HOURS: Record<string, number> = { tinggi: 24, sedang: 72, rendah: 120 };

export const PROCUREMENT_TIMELINE: Record<string, { label: string; tone: string }> = {
  'purchase_requisition.created': { label: 'membuat permintaan', tone: 'accent' },
  'purchase_requisition.updated': { label: 'mengubah permintaan', tone: '' },
  'purchase_requisition.submitted': { label: 'mengajukan permintaan — menunggu persetujuan', tone: 'warn' },
  'purchase_requisition.approved': { label: 'menyetujui permintaan', tone: 'ok' },
  'purchase_requisition.rejected': { label: 'menolak permintaan', tone: 'warn' },
  'purchase_requisition.cancelled': { label: 'membatalkan permintaan', tone: '' },
  'purchase_requisition.rfq_created': { label: 'membuat RFQ', tone: 'accent' },
  'purchase_requisition.ordered': { label: 'membuat PO dari permintaan', tone: 'ok' },
  'rfq.created': { label: 'mengirim RFQ', tone: 'accent' },
  'rfq.invited': { label: 'mengundang pemasok', tone: '' },
  'rfq.quoted': { label: 'mencatat penawaran', tone: '' },
  'rfq.declined': { label: 'mencatat pemasok tidak menawar', tone: '' },
  'rfq.awarded': { label: 'memilih pemenang — PO dibuat', tone: 'ok' },
  'rfq.cancelled': { label: 'membatalkan RFQ', tone: 'warn' },
};

/** Sisa waktu SLA dalam teks singkat ("4 jam lagi" / "lewat 3 jam"). */
export function slaText(due: string | null | undefined): string {
  if (!due) return '—';
  const h = Math.round((new Date(due).getTime() - Date.now()) / 3_600_000);
  if (h >= 0) return h >= 48 ? `${Math.round(h / 24)} hari lagi` : `${h} jam lagi`;
  return -h >= 48 ? `lewat ${Math.round(-h / 24)} hari` : `lewat ${-h} jam`;
}
