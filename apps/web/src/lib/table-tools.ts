/**
 * Alat tabel generik: pencarian di seluruh kolom data, saringan (faset) yang
 * diturunkan otomatis dari data, dan rentang tanggal. Dipakai `usePaged` (mode
 * data — berlaku untuk seluruh baris, bukan hanya halaman yang tampil) dan
 * `DataTools` (mode DOM untuk tabel tanpa paginasi).
 *
 * Data yang disaring adalah data yang sudah dikirim API untuk pengguna ini —
 * izin, cakupan cabang (RLS), dan penyamaran kolom rahasia sudah diterapkan di
 * peladen, sehingga pencarian/saringan/ekspor tidak pernah memperluas akses.
 */
import { reactive } from 'vue';

export interface FacetOption { value: string; label: string; count: number }
export interface Facet { key: string; label: string; options: FacetOption[] }
export interface ToolsState { q: string; facets: Record<string, string>; dateKey: string; from: string; to: string }

export const newToolsState = (): ToolsState => reactive({ q: '', facets: {}, dateKey: '', from: '', to: '' });
export const activeCount = (s: ToolsState) => Object.values(s.facets).filter(Boolean).length + (s.from || s.to ? 1 : 0);
export const clearTools = (s: ToolsState, keepQ = false) => { if (!keepQ) s.q = ''; s.facets = {}; s.from = ''; s.to = ''; };

/** Label kolom yang dikenal (kunci data API → bahasa pengguna). */
const LABELS: Record<string, string> = {
  status: 'Status', branch: 'Cabang', category: 'Kategori', kind: 'Jenis', type: 'Tipe', dept: 'Departemen', department: 'Departemen', priority: 'Prioritas',
  method: 'Metode', employment: 'Status kerja', ptkp: 'PTKP', source: 'Sumber', group: 'Kelompok', currency: 'Mata uang', unit: 'Satuan', stage: 'Tahap',
  channel: 'Kanal', segment: 'Segmen', industry: 'Industri', city: 'Kota', health: 'Kesehatan', warehouse: 'Gudang', bankName: 'Bank', role: 'Peran',
  customerName: 'Pelanggan', supplierName: 'Pemasok', createdByName: 'Dibuat oleh', ownerName: 'Pemilik', assigneeName: 'Penanggung jawab', pmName: 'Manajer proyek',
  managerName: 'Manajer', requesterName: 'Pemohon', decidedByName: 'Diputus oleh', postedByName: 'Diposting oleh', approvedByName: 'Disetujui oleh', actor: 'Pengguna',
  action: 'Aksi', entityType: 'Entitas', normalSide: 'Saldo normal', level: 'Level', statusLabel: 'Status', kindLabel: 'Jenis', costCenterCode: 'Pusat biaya',
  projectCode: 'Proyek', campaignName: 'Kampanye', isOverdue: 'Lewat jatuh tempo', threeWayMatched: 'Cocok 3 arah', slaOverdue: 'Lewat SLA', overdue: 'Terlambat',
  issuedByName: 'Diterbitkan oleh', paidByName: 'Dibayar oleh', sentByName: 'Dikirim oleh', receivedByName: 'Diterima oleh', assignee: 'Penanggung jawab',
  toBranch: 'Cabang tujuan', fromBranch: 'Cabang asal', toBank: 'Rekening tujuan', fromBank: 'Rekening asal', toBankName: 'Bank tujuan', fromBankName: 'Bank asal',
  toWarehouse: 'Gudang tujuan', fromWarehouse: 'Gudang asal', uom: 'Satuan', orderStatus: 'Status pesanan', customerStatus: 'Status pelanggan',
  account: 'Akun', glAccount: 'Akun buku besar', bankAccount: 'Rekening', accountCode: 'Akun',
  isHeadOffice: 'Kantor pusat', isCash: 'Kas/bank', interco: 'Antar kantor', active: 'Aktif', mustChangePassword: 'Wajib ganti sandi',
  date: 'Tanggal', orderDate: 'Tanggal pesanan', invoiceDate: 'Tanggal faktur', dueDate: 'Jatuh tempo', requestDate: 'Tanggal permintaan', neededDate: 'Dibutuhkan',
  expectedDate: 'Perkiraan tiba', deliveryDate: 'Tanggal kirim', startDate: 'Mulai', endDate: 'Selesai', joinDate: 'Mulai bekerja', paidDate: 'Tanggal bayar',
  createdAt: 'Dibuat', updatedAt: 'Diubah', submittedAt: 'Diajukan', decidedAt: 'Diputus', postedAt: 'Diposting', at: 'Waktu', acquisitionDate: 'Tanggal perolehan',
  dueAt: 'Tenggat', closeDate: 'Perkiraan tutup', validUntil: 'Berlaku s.d.', receiptDate: 'Tanggal terima', shiftDate: 'Tanggal shift', lastActivityAt: 'Aktivitas terakhir',
};
/** Kunci yang tidak pernah dijadikan faset (identitas, teks bebas, label turunan). */
const NO_FACET = /(^id$|Id$|^docNo$|No$|^code$|Code$|^name$|^email$|phone|notes?$|Note$|description|memo|reason|Reason$|address|^ref$|^reference$|^title$|^label$|Label$|^journalNo$|hash|^sku$|token|^ip$|^costCenterName$|^projectName$)/;
const ISO = /^\d{4}-\d{2}-\d{2}/;
const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
/** Urutan preferensi kolom tanggal untuk saringan rentang. */
const DATE_PREF = ['date', 'invoiceDate', 'orderDate', 'requestDate', 'receiptDate', 'shiftDate', 'acquisitionDate', 'startDate', 'dueDate', 'at', 'createdAt'];

export const humanize = (k: string) => LABELS[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase());
const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' ');

/** Faset dari kolom kategorikal: string pendek dengan 2–15 nilai berbeda, atau boolean yang dikenal. */
export function deriveFacets(rows: any[]): Facet[] {
  if (rows.length < 2) return [];
  const sample = rows.slice(0, 2000);
  const keys = new Set<string>();
  for (const r of sample.slice(0, 50)) if (r && typeof r === 'object') Object.keys(r).forEach((k) => keys.add(k));
  const out: Facet[] = [];
  for (const k of keys) {
    if (NO_FACET.test(k) && !LABELS[k]) continue;
    if (k.endsWith('Label') || k === 'statusLabel') continue;
    const vals = sample.map((r) => r?.[k]);
    const present = vals.filter((v) => v !== null && v !== undefined && v !== '');
    if (!present.length) continue;
    if (present.every((v) => typeof v === 'boolean')) {
      if (!LABELS[k]) continue;
      const yes = present.filter(Boolean).length;
      if (!yes || yes === present.length) continue;
      out.push({ key: k, label: LABELS[k], options: [{ value: 'true', label: 'Ya', count: yes }, { value: 'false', label: 'Tidak', count: present.length - yes }] });
      continue;
    }
    if (!present.every((v) => typeof v === 'string') || present.some((v) => ISO.test(v) || UUIDISH.test(v) || v.length > 48)) continue;
    const counts = new Map<string, number>();
    for (const v of present) counts.set(v, (counts.get(v) ?? 0) + 1);
    if (counts.size < 2 || counts.size > 15) continue;
    if (!LABELS[k] && counts.size > present.length / 2) continue;
    const labelOf = new Map<string, string>();
    for (const r of sample) if (r?.[k] && typeof r[`${k}Label`] === 'string') labelOf.set(r[k], r[`${k}Label`]);
    out.push({ key: k, label: humanize(k), options: [...counts].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: labelOf.get(value) ?? cap(value), count })) });
  }
  const order = ['status', 'branch', 'kind', 'category', 'type', 'dept'];
  return out.sort((a, b) => (order.indexOf(a.key) + 1 || 99) - (order.indexOf(b.key) + 1 || 99)).slice(0, 8);
}

export function deriveDateKeys(rows: any[]): { key: string; label: string }[] {
  const r0 = rows.find((r) => r && typeof r === 'object');
  if (!r0) return [];
  const keys = Object.keys(r0).filter((k) => rows.slice(0, 50).some((r) => typeof r?.[k] === 'string' && ISO.test(r[k])));
  return keys.sort((a, b) => (DATE_PREF.indexOf(a) + 1 || 99) - (DATE_PREF.indexOf(b) + 1 || 99)).map((k) => ({ key: k, label: humanize(k) }));
}

/** Teks pencarian satu baris: seluruh nilai primitif (dan satu tingkat objek/array bersarang). */
const cache = new WeakMap<object, string>();
export function haystack(row: any): string {
  if (!row || typeof row !== 'object') return String(row ?? '').toLowerCase();
  let h = cache.get(row);
  if (h !== undefined) return h;
  const parts: string[] = [];
  const add = (v: unknown, depth: number) => {
    if (v === null || v === undefined) return;
    if (typeof v === 'string' || typeof v === 'number') { parts.push(String(v)); if (typeof v === 'number') parts.push(new Intl.NumberFormat('id-ID').format(v)); return; }
    if (depth > 0 && typeof v === 'object') for (const x of Array.isArray(v) ? v.slice(0, 50) : Object.values(v)) add(x, depth - 1);
  };
  for (const v of Object.values(row)) add(v, 1);
  h = parts.join(' ').toLowerCase();
  cache.set(row, h);
  return h;
}

export const matchesQuery = (text: string, q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean).every((t) => text.includes(t));

export function applyTools<T>(rows: T[], s: ToolsState): T[] {
  const q = s.q.trim();
  const facets = Object.entries(s.facets).filter(([, v]) => v);
  const dk = s.dateKey;
  if (!q && !facets.length && !(dk && (s.from || s.to))) return rows;
  return rows.filter((r: any) => {
    for (const [k, v] of facets) if (String(r?.[k]) !== v) return false;
    if (dk && (s.from || s.to)) {
      const d = typeof r?.[dk] === 'string' ? r[dk].slice(0, 10) : '';
      if (!d || (s.from && d < s.from) || (s.to && d > s.to)) return false;
    }
    return !q || matchesQuery(haystack(r), q);
  });
}

/** Ringkasan saringan aktif untuk kepala berkas ekspor & jejak audit. */
export function describeTools(s: ToolsState, facets: Facet[], dateKeys: { key: string; label: string }[]): string {
  const parts: string[] = [];
  if (s.q.trim()) parts.push(`cari "${s.q.trim()}"`);
  for (const [k, v] of Object.entries(s.facets)) if (v) { const f = facets.find((x) => x.key === k); parts.push(`${f?.label ?? k}: ${f?.options.find((o) => o.value === v)?.label ?? v}`); }
  if (s.from || s.to) parts.push(`${dateKeys.find((d) => d.key === s.dateKey)?.label ?? 'Tanggal'} ${s.from || '…'} s.d. ${s.to || '…'}`);
  return parts.join('; ');
}
