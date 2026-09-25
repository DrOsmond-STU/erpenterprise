import { ref, watch, type Ref } from 'vue';
import { useContext } from '@/stores/context';
import { useToast } from '@/stores/toast';

/** Memuat data yang bergantung pada konteks cabang/periode; memuat ulang saat konteks berubah. */
export function useLoader<T>(fetcher: () => Promise<T>, deps: Ref<unknown>[] = []) {
  const ctx = useContext();
  const toast = useToast();
  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(true);
  const error = ref<string | null>(null);
  let seq = 0;
  async function reload() {
    const my = ++seq;
    loading.value = true; error.value = null;
    try { const r = await fetcher(); if (my === seq) data.value = r; }
    catch (e) { if (my === seq) { error.value = (e as Error).message; toast.error(e, 'Gagal memuat data'); } }
    finally { if (my === seq) loading.value = false; }
  }
  watch([() => ctx.branch, () => ctx.period, ...deps], reload, { immediate: true });
  return { data, loading, error, reload };
}
