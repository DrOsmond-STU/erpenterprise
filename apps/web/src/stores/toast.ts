import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Toast { id: number; title: string; note?: string; tone: 'ok' | 'danger' | 'warn' | 'accent' }

export const useToast = defineStore('toast', () => {
  const items = ref<Toast[]>([]);
  let seq = 0;
  function push(title: string, note?: string, tone: Toast['tone'] = 'ok') {
    const id = ++seq;
    items.value.push({ id, title, note, tone });
    setTimeout(() => dismiss(id), 5000);
  }
  function dismiss(id: number) { items.value = items.value.filter((t) => t.id !== id); }
  function error(e: unknown, fallback = 'Terjadi kesalahan') {
    const msg = (e as { message?: string })?.message ?? fallback;
    const rid = (e as { requestId?: string })?.requestId;
    push(fallback, rid ? `${msg} (ref ${rid.slice(0, 8)})` : msg, 'danger');
  }
  return { items, push, dismiss, error };
});
