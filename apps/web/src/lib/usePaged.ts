import { computed, ref, watch, type Ref } from 'vue';
import { applyTools, deriveDateKeys, deriveFacets, newToolsState } from './table-tools';

export const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Paginasi sisi klien untuk tabel yang datanya sudah dimuat utuh.
 * Halaman otomatis dikembalikan ke 1 saat isi atau saringan berubah, dan
 * dijepit ke halaman terakhir bila jumlah baris berkurang.
 *
 * Alat tabel (`tools`: cari semua kolom, faset, rentang tanggal — diisi lewat
 * komponen DataTools) diterapkan pada seluruh baris sebelum dipotong per halaman.
 */
export function usePaged<T>(rows: Ref<T[]> | (() => T[]), initialSize = 25) {
  const source = typeof rows === 'function' ? computed(rows) : rows;
  const tools = newToolsState();
  const facets = computed(() => deriveFacets(source.value as any[]));
  const dateKeys = computed(() => deriveDateKeys(source.value as any[]));
  const filtered = computed(() => applyTools(source.value, tools));
  const page = ref(1);
  const size = ref(initialSize);
  const total = computed(() => filtered.value.length);
  const pages = computed(() => Math.max(1, Math.ceil(total.value / size.value)));
  const pageRows = computed(() => filtered.value.slice((page.value - 1) * size.value, page.value * size.value));
  watch(size, () => { page.value = 1; });
  watch(total, () => { if (page.value > pages.value) page.value = pages.value; });
  watch(() => [tools.q, tools.from, tools.to, tools.dateKey, JSON.stringify(tools.facets)], () => { page.value = 1; });
  const reset = () => { page.value = 1; };
  return { page, size, total, pages, pageRows, reset, tools, facets, dateKeys, source, filtered };
}

export type Paged = ReturnType<typeof usePaged<any>>;
