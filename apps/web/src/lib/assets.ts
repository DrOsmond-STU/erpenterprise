/** Label linimasa aset & pemeliharaan. */
export const ASSET_TIMELINE: Record<string, { label: string; tone: string }> = {
  'asset.acquired': { label: 'mencatat perolehan — jurnal diposting', tone: 'ok' },
  'asset.disposed': { label: 'melepas aset — jurnal pelepasan diposting', tone: 'warn' },
  'maintenance.created': { label: 'menjadwalkan pemeliharaan', tone: 'accent' },
  'maintenance.started': { label: 'memulai pekerjaan', tone: '' },
  'maintenance.completed': { label: 'menyelesaikan — biaya dijurnal', tone: 'ok' },
  'maintenance.cancelled': { label: 'membatalkan', tone: '' },
};
export const ASSET_CATEGORIES = ['Mesin produksi', 'Instalasi listrik', 'Peralatan material handling', 'Kendaraan operasional', 'Perangkat TI', 'Peralatan kantor'];
export const MAINT_CHIPS: [string, string][] = [['', 'Semua'], ['dijadwalkan', 'Dijadwalkan'], ['berjalan', 'Berjalan'], ['selesai', 'Selesai'], ['batal', 'Batal']];
/** Periode YYYY-MM dari id periode konteks bila bulanan. */
export const monthOf = (period: string | null | undefined) => (period && /^\d{4}-\d{2}$/.test(period) ? period : null);
