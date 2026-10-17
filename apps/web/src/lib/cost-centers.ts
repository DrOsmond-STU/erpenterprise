/** Pusat biaya: pilihan (dimuat sekali per sesi halaman) dan label modul. */
import { ref } from 'vue';
import { get } from '@/lib/api';

export interface CostCenterOption { id: string; code: string; name: string; kind: 'biaya' | 'laba'; parentId: string | null }
export const KIND_LABEL: Record<string, string> = { biaya: 'Pusat biaya', laba: 'Pusat laba' };

const options = ref<CostCenterOption[]>([]);
let loading: Promise<CostCenterOption[]> | null = null;
/** Pusat biaya aktif untuk pilihan dimensi; gagal (tanpa izin) → daftar kosong sehingga pilihan disembunyikan. */
export function costCenterOptions(force = false) {
  if (force || !loading) loading = get('/cost-centers/options', { scoped: false }).then((r: CostCenterOption[]) => (options.value = r)).catch(() => (options.value = []));
  return { options, ready: loading };
}

export const COST_CENTER_TIMELINE: Record<string, { label: string; tone: string }> = {
  'cost_center.created': { label: 'membuat pusat biaya', tone: 'accent' },
  'cost_center.updated': { label: 'mengubah pusat biaya', tone: '' },
  'cost_center.deactivated': { label: 'menonaktifkan pusat biaya', tone: 'warn' },
  'cost_center.activated': { label: 'mengaktifkan pusat biaya', tone: 'ok' },
};
