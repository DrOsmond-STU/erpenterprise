/** Label modul anggaran & proyek. */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const PROJECT_CHIPS: [string, string][] = [['', 'Semua'], ['perencanaan', 'Perencanaan'], ['berjalan', 'Berjalan'], ['ditunda', 'Ditunda'], ['selesai', 'Selesai'], ['batal', 'Batal']];
export const HEALTH_LABEL: Record<string, string> = { hijau: 'Sehat', kuning: 'Risiko melampaui', merah: 'Melampaui anggaran' };
export const PLANNING_TIMELINE: Record<string, { label: string; tone: string }> = {
  'budget.created': { label: 'menyusun anggaran', tone: 'accent' },
  'budget.updated': { label: 'mengubah anggaran', tone: '' },
  'budget.submitted': { label: 'mengajukan anggaran', tone: 'warn' },
  'budget.approved': { label: 'menyetujui anggaran', tone: 'ok' },
  'budget.returned': { label: 'mengembalikan anggaran ke draf', tone: 'warn' },
  'budget.revised': { label: 'merevisi anggaran', tone: 'warn' },
  'project.created': { label: 'membuat proyek', tone: 'accent' },
  'project.updated': { label: 'mengubah proyek', tone: '' },
  'project.status_changed': { label: 'mengubah status proyek', tone: 'warn' },
};
