<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { renderMarkdown } from '@/lib/markdown';
import { useAssistant } from '@/stores/assistant';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import Icon from '@/components/Icon.vue';
import ReportHead from '@/components/ReportHead.vue';

const TOOL_LABEL: Record<string, string> = {
  ringkasan_kpi: 'Ringkasan KPI', neraca_saldo: 'Neraca saldo', laba_rugi: 'Laba rugi', neraca: 'Neraca', konsolidasi: 'Konsolidasi',
  kartu_buku_besar: 'Kartu buku besar', daftar_jurnal: 'Jurnal umum', rekonsiliasi: 'Rekonsiliasi', bagan_akun: 'Bagan akun', saldo_kas_bank: 'Kas & bank',
};

const store = useAssistant();
const ctx = useContext();
const session = useSession();
const draft = ref('');
const loadingStatus = ref(true);
const statusError = ref('');
const list = ref<HTMLElement | null>(null);
const input = ref<HTMLTextAreaElement | null>(null);

const suggestions = computed(() => [
  'Bagaimana kinerja keuangan periode ini dibanding target?',
  ...(session.can('report.consolidated') ? ['Cabang mana yang margin laba bersihnya paling rendah, dan apa penyebabnya?'] : []),
  'Berapa saldo kas dan bank saat ini per rekening?',
  'Apakah ada selisih rekonsiliasi atau jurnal yang masih menunggu posting?',
  'Jelaskan lima beban operasional terbesar periode ini.',
]);

onMounted(async () => {
  try { await store.loadStatus(); } catch (e) { statusError.value = (e as Error).message; } finally { loadingStatus.value = false; }
  scrollDown();
});

async function scrollDown() { await nextTick(); if (list.value) list.value.scrollTop = list.value.scrollHeight; }
watch(() => store.messages.length, scrollDown);
watch(() => store.busy, scrollDown);

async function send(text?: string) {
  const q = (text ?? draft.value).trim();
  if (!q || store.busy) return;
  draft.value = '';
  await store.ask(q);
  input.value?.focus();
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
}
</script>

<template>
  <ReportHead title="Asisten AI" sub="Tanyakan kondisi keuangan dalam bahasa sehari-hari. Asisten membaca data buku besar sesuai hak akses Anda dan tidak dapat mengubah data.">
    <button v-if="store.messages.length" class="btn" type="button" :disabled="store.busy" @click="store.reset()"><Icon name="plus" /> Percakapan baru</button>
  </ReportHead>

  <div v-if="loadingStatus" class="loading">Memuat…</div>
  <div v-else-if="statusError" class="empty-card"><Icon name="alert" /><div class="empty-title">Status asisten tidak dapat dimuat</div><div class="empty-note">{{ statusError }}</div></div>
  <div v-else-if="!store.status?.enabled" class="empty-card">
    <Icon name="sparkles" />
    <div class="empty-title">Asisten AI belum diaktifkan</div>
    <div class="empty-note">Administrator perlu mengisi <code>ANTHROPIC_API_KEY</code> pada konfigurasi server, lalu menyalakan ulang API.</div>
  </div>

  <article v-else class="card assistant">
    <div class="card-head">
      <div class="card-head-text">
        <h2 class="card-title">Percakapan</h2>
        <span class="card-note">Konteks: {{ ctx.branchName }} · {{ ctx.periodLabel }} — sebutkan cabang atau periode lain di pertanyaan bila perlu.</span>
      </div>
    </div>

    <div ref="list" class="assistant-list" aria-live="polite">
      <div v-if="!store.messages.length" class="assistant-intro">
        <Icon name="sparkles" />
        <p>Contoh pertanyaan:</p>
        <div class="assistant-suggest">
          <button v-for="s in suggestions" :key="s" class="chip" type="button" @click="send(s)">{{ s }}</button>
        </div>
      </div>
      <div v-for="m in store.messages" :key="m.id" class="assistant-msg" :class="[`is-${m.role}`, { 'is-error': m.error }]">
        <div v-if="m.role === 'user'" class="assistant-bubble">{{ m.content }}</div>
        <div v-else class="assistant-bubble">
          <div v-if="m.error" class="assistant-err"><Icon name="alert" /> {{ m.content }}</div>
          <div v-else class="md" v-html="renderMarkdown(m.content)" />
          <div v-if="m.tools?.length" class="assistant-tools">Data dibaca: {{ m.tools.map((t) => TOOL_LABEL[t] ?? t).join(', ') }}</div>
        </div>
      </div>
      <div v-if="store.busy" class="assistant-msg is-assistant"><div class="assistant-bubble assistant-typing"><span /><span /><span /> Menganalisis data…</div></div>
    </div>

    <form class="assistant-form" @submit.prevent="send()">
      <label for="assistant-input" class="sr-only">Pertanyaan untuk asisten</label>
      <textarea id="assistant-input" ref="input" v-model="draft" class="textarea" rows="2" maxlength="4000" placeholder="Tulis pertanyaan… (Enter untuk kirim, Shift+Enter untuk baris baru)" :disabled="store.busy" @keydown="onKey" />
      <button class="btn btn-primary" type="submit" :disabled="store.busy || !draft.trim()"><Icon name="send" /> Kirim</button>
    </form>
    <p class="assistant-disclaimer">Jawaban dibuat oleh AI dan dapat keliru. Periksa kembali angka penting pada laporan terkait sebelum mengambil keputusan.</p>
  </article>
</template>
