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

/* ---------------- CRM lengkap ---------------- */
type Tone = { label: string; tone: string };
export const LEAD_STATUS: Record<string, Tone> = {
  baru: { label: 'Baru', tone: 'info' }, dihubungi: { label: 'Dihubungi', tone: 'accent' }, kualifikasi: { label: 'Kualifikasi', tone: 'warn' },
  dikonversi: { label: 'Dikonversi', tone: 'ok' }, diskualifikasi: { label: 'Diskualifikasi', tone: 'danger' },
};
export const LEAD_CHIPS: [string, string][] = [['', 'Semua'], ['baru', 'Baru'], ['dihubungi', 'Dihubungi'], ['kualifikasi', 'Kualifikasi'], ['dikonversi', 'Dikonversi'], ['diskualifikasi', 'Diskualifikasi']];
export const CAMPAIGN_STATUS: Record<string, Tone> = { rencana: { label: 'Rencana', tone: 'info' }, berjalan: { label: 'Berjalan', tone: 'accent' }, selesai: { label: 'Selesai', tone: 'ok' }, batal: { label: 'Batal', tone: '' } };
export const CHANNELS = ['Pameran', 'Digital', 'Email', 'Telemarketing', 'Referensi', 'Event', 'Lainnya'];
export const KIND_LABEL: Record<string, string> = { ...ACTIVITY_LABEL, tugas: 'Tugas', penagihan: 'Penagihan' };
export const KIND_ICON: Record<string, string> = { telepon: 'bell', rapat: 'users', email: 'send', kunjungan: 'map-pin', tugas: 'clipboard', penagihan: 'wallet', catatan: 'edit' };
export const ACT_STATUS: Record<string, Tone> = { terbuka: { label: 'Terbuka', tone: 'info' }, selesai: { label: 'Selesai', tone: 'ok' }, batal: { label: 'Batal', tone: '' } };
export const TICKET_STATUS: Record<string, Tone> = {
  baru: { label: 'Baru', tone: 'info' }, diproses: { label: 'Diproses', tone: 'accent' }, menunggu: { label: 'Menunggu pihak lain', tone: 'warn' }, selesai: { label: 'Selesai', tone: 'ok' }, ditutup: { label: 'Ditutup', tone: '' },
};
export const TICKET_FLOW: Record<string, string[]> = { baru: ['diproses', 'menunggu', 'selesai'], diproses: ['menunggu', 'selesai'], menunggu: ['diproses', 'selesai'], selesai: ['ditutup', 'diproses'], ditutup: [] };
export const PRIORITY: Record<string, Tone> = { kritis: { label: 'Kritis', tone: 'danger' }, tinggi: { label: 'Tinggi', tone: 'warn' }, sedang: { label: 'Sedang', tone: 'info' }, rendah: { label: 'Rendah', tone: '' } };
export const SLA_HOURS: Record<string, number> = { kritis: 4, tinggi: 24, sedang: 72, rendah: 120 };
export const CATEGORY: Record<string, string> = { produk: 'Produk', pengiriman: 'Pengiriman', tagihan: 'Tagihan', layanan: 'Layanan', mutu: 'Mutu / klaim', lainnya: 'Lainnya' };
export const PROMISE: Record<string, Tone> = { menunggu: { label: 'Janji — menunggu', tone: 'info' }, ditepati: { label: 'Janji ditepati', tone: 'ok' }, ingkar: { label: 'Janji diingkari', tone: 'danger' }, batal: { label: 'Janji batal', tone: '' } };
export const DUNNING_TONE = ['', 'info', 'warn', 'danger', 'danger'];
export const DUNNING_COLOR = ['var(--cat-1)', 'var(--cat-2)', 'var(--warn)', 'var(--danger)', 'var(--danger)'];
export const CRM_TIMELINE_FULL: Record<string, { label: string; tone: string }> = {
  ...CRM_TIMELINE,
  'lead.created': { label: 'membuat lead', tone: 'accent' }, 'lead.updated': { label: 'mengubah lead', tone: '' }, 'lead.status_changed': { label: 'mengubah status lead', tone: '' },
  'lead.converted': { label: 'mengonversi lead menjadi pelanggan & peluang', tone: 'ok' }, 'campaign.created': { label: 'membuat kampanye', tone: 'accent' }, 'campaign.updated': { label: 'mengubah kampanye', tone: '' },
  'ticket.created': { label: 'membuka tiket', tone: 'accent' }, 'ticket.updated': { label: 'mengubah tiket', tone: '' }, 'ticket.status_changed': { label: 'mengubah status tiket', tone: '' }, 'collection.promised': { label: 'mencatat janji bayar', tone: 'accent' }, 'collection.contacted': { label: 'mencatat kontak penagihan', tone: '' },
};
/** Nilai input datetime-local → ISO WIB. */
export const wibIso = (local: string) => (local ? `${local.length === 16 ? local + ':00' : local}+07:00` : null);
/** Tanggal + n hari (WIB) untuk nilai bawaan input. */
export const wibPlus = (days: number, time = '09:00') => `${new Date(Date.now() + 7 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10)}T${time}`;
export const todayWib = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
