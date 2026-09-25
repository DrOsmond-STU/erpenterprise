/** Pemformat id-ID — port dari prototype/assets/charts.js (FMT). */
const nf = (min: number, max: number) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: min, maximumFractionDigits: max });
const n0 = nf(0, 0), n1 = nf(1, 1), n2 = nf(2, 2);
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export const int = (v: number) => n0.format(Math.round(v || 0));
export const dec = (v: number, d = 1) => (d === 2 ? n2 : n1).format(v || 0);
export const rp = (v: number) => 'Rp ' + n0.format(Math.round(v || 0));
export const rpCompact = (v: number) => {
  const s = v < 0 ? '-' : '';
  const a = Math.abs(v || 0);
  if (a >= 1e12) return `${s}Rp ${n2.format(a / 1e12)} T`;
  if (a >= 1e9) return `${s}Rp ${n2.format(a / 1e9)} M`;
  if (a >= 1e6) return `${s}Rp ${n1.format(a / 1e6)} jt`;
  if (a >= 1e3) return `${s}Rp ${n0.format(a / 1e3)} rb`;
  return `${s}Rp ${n0.format(a)}`;
};
export const pct = (v: number, d = 1) => dec(v, d) + '%';
export const signedPct = (v: number, d = 1) => (v > 0 ? '+' : '') + dec(v, d) + '%';
export const date = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${d} ${BULAN[m - 1]} ${y}`;
};
export const datetime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const dt = new Date(iso);
  return `${date(dt.toISOString())} · ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
};
/** Angka laporan: rupiah penuh; negatif dalam kurung; nol sebagai tanda hubung (kecuali diminta). */
export const amt = (v: number, zero = false) => {
  const n = Math.round(v || 0);
  if (!n && !zero) return '—';
  return n < 0 ? `(${n0.format(-n)})` : n0.format(n);
};
export const monthLabels = BULAN;
