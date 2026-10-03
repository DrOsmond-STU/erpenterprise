/** Label linimasa & kolom papan produksi. */
export const PRODUCTION_TIMELINE: Record<string, { label: string; tone: string }> = {
  'work_order.created': { label: 'membuat perintah kerja', tone: 'accent' },
  'work_order.updated': { label: 'memperbarui kemajuan', tone: '' },
  'work_order.issued': { label: 'mengeluarkan bahan — WIP dijurnal', tone: 'ok' },
  'work_order.qc_submitted': { label: 'melaporkan hasil ke pemeriksaan mutu', tone: 'warn' },
  'work_order.qc_rejected': { label: 'mengembalikan dari QC (pengerjaan ulang)', tone: 'warn' },
  'work_order.completed': { label: 'meloloskan QC — barang jadi & jurnal diposting', tone: 'ok' },
  'work_order.cancelled': { label: 'membatalkan perintah kerja', tone: '' },
  'bom.created': { label: 'membuat BOM', tone: 'accent' },
  'bom.updated': { label: 'mengubah BOM', tone: '' },
};
export const BOARD_COLUMNS: [string, string][] = [['antre', 'Antre'], ['berjalan', 'Berjalan'], ['qc', 'Pemeriksaan mutu'], ['selesai', 'Selesai']];
export const PRODUCTION_LINES = ['Lini 1 — Potong', 'Lini 2 — Pres', 'Lini 3 — Bubut', 'Lini 4 — Rakit'];
