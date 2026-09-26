import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ApiError, get, post } from '@/lib/api';
import { useSession } from '@/stores/session';

export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
  error?: boolean;
}

/**
 * Percakapan asisten hanya disimpan di memori tab (tidak di localStorage):
 * jawaban memuat angka keuangan, dan percakapan dibuang bila pengguna berganti.
 */
export const useAssistant = defineStore('assistant', () => {
  const session = useSession();
  const messages = ref<AssistantMessage[]>([]);
  const busy = ref(false);
  const status = ref<{ enabled: boolean; model: string } | null>(null);
  let owner: string | null = null;
  let seq = 0;

  function ensureOwner() {
    const id = session.user?.id ?? null;
    if (id !== owner) { messages.value = []; status.value = null; owner = id; }
  }

  async function loadStatus() {
    ensureOwner();
    if (!status.value) status.value = await get('/assistant/status');
    return status.value;
  }

  /** Riwayat untuk API: hanya pasangan tanya-jawab yang berhasil, maksimal 9 pasang terakhir. */
  function history(question: string) {
    const pairs: { role: 'user' | 'assistant'; content: string }[][] = [];
    const list = messages.value;
    for (let i = 0; i < list.length - 1; i += 1) {
      const q = list[i], a = list[i + 1];
      if (q.role === 'user' && a.role === 'assistant' && !q.error && !a.error) { pairs.push([{ role: 'user', content: q.content.slice(0, 4000) }, { role: 'assistant', content: a.content.slice(0, 4000) }]); i += 1; }
    }
    return [...pairs.slice(-9).flat(), { role: 'user' as const, content: question.slice(0, 4000) }];
  }

  async function ask(question: string) {
    ensureOwner();
    const q = question.trim();
    if (!q || busy.value) return;
    const payload = history(q);
    const userMsg: AssistantMessage = { id: ++seq, role: 'user', content: q };
    messages.value.push(userMsg);
    busy.value = true;
    try {
      const r = await post<{ reply: string; toolsUsed: { name: string; ok: boolean }[] }>('/assistant/chat', { messages: payload });
      messages.value.push({ id: ++seq, role: 'assistant', content: r.reply, tools: [...new Set(r.toolsUsed.filter((t) => t.ok).map((t) => t.name))] });
    } catch (e) {
      userMsg.error = true;
      const msg = e instanceof ApiError ? e.message : 'Tidak dapat menghubungi server.';
      messages.value.push({ id: ++seq, role: 'assistant', content: msg, error: true });
    } finally {
      busy.value = false;
    }
  }

  function reset() { messages.value = []; }

  return { messages, busy, status, loadStatus, ask, reset };
});
