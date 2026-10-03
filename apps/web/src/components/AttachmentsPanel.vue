<script setup lang="ts">
import { ref, watch } from 'vue';
import { download, fileToBase64, get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Icon from './Icon.vue';

/** Lampiran dokumen untuk satu transaksi (mis. faktur, transfer, jurnal). */
const props = defineProps<{ entityType: string; entityRef: string; branch?: string }>();
const session = useSession();
const toast = useToast();
const docs = ref<any[]>([]);
const busy = ref(false);
const error = ref('');
const load = async () => { if (!session.can('doc.read')) return; try { docs.value = await get(`/documents?entityType=${encodeURIComponent(props.entityType)}&entityRef=${encodeURIComponent(props.entityRef)}`, { scoped: false }); } catch { docs.value = []; } };
watch(() => props.entityRef, load, { immediate: true });
async function upload(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  error.value = ''; busy.value = true;
  try {
    if (f.size > 1_048_576) throw new Error('Ukuran berkas maksimal 1 MB.');
    await post('/documents', { name: f.name.replace(/\.[^.]+$/, ''), docType: 'Lampiran', folder: `Lampiran / ${props.entityType}`, branch: props.branch, entityType: props.entityType, entityRef: props.entityRef,
      file: { name: f.name, mime: f.type || 'application/octet-stream', base64: await fileToBase64(f) } });
    toast.push('Lampiran diunggah', f.name, 'ok'); await load();
  } catch (e) { error.value = e instanceof Error && !(e as any).status ? e.message : errorList(e).join(' '); } finally { busy.value = false; (ev.target as HTMLInputElement).value = ''; }
}
</script>

<template>
  <div v-if="session.can('doc.read')" class="section" data-attachments>
    <span class="section-title">Lampiran ({{ docs.length }})</span>
    <div v-for="d in docs" :key="d.id" style="display:flex;align-items:center;gap:var(--sp-2);padding:4px 0">
      <Icon name="book" /><span style="flex:1 1 auto;min-width:0">{{ d.fileName ?? d.name }} <span class="muted">· v{{ d.version }} · {{ F.int((d.size ?? 0) / 1024) }} KB</span></span>
      <button class="btn btn-sm btn-ghost" :aria-label="`Unduh ${d.name}`" @click="download(`/documents/${d.id}/download`, d.fileName)"><Icon name="download" /></button>
    </div>
    <label v-if="session.can('doc.manage')" class="btn btn-sm" style="margin-top:var(--sp-2);cursor:pointer" :aria-disabled="busy"><Icon name="plus" /> Lampirkan berkas
      <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip" data-field="attachment" @change="upload"></label>
    <div v-if="error" class="field-hint neg" role="alert">{{ error }}</div>
  </div>
</template>
