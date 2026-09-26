import { computed, ref, watch, type Ref } from 'vue';

export const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Paginasi sisi klien untuk tabel yang datanya sudah dimuat utuh.
 * Halaman otomatis dikembalikan ke 1 saat isi atau saringan berubah, dan
 * dijepit ke halaman terakhir bila jumlah baris berkurang.
 */
export function usePaged<T>(rows: Ref<T[]> | (() => T[]), initialSize = 25) {
  const source = typeof rows === 'function' ? computed(rows) : rows;
  const page = ref(1);
  const size = ref(initialSize);
  const total = computed(() => source.value.length);
  const pages = computed(() => Math.max(1, Math.ceil(total.value / size.value)));
  const pageRows = computed(() => source.value.slice((page.value - 1) * size.value, page.value * size.value));
  watch(size, () => { page.value = 1; });
  watch(total, () => { if (page.value > pages.value) page.value = pages.value; });
  const reset = () => { page.value = 1; };
  return { page, size, total, pages, pageRows, reset };
}
