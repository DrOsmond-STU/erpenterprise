<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { KIND_LABEL, wibIso, wibPlus } from '@/lib/crm';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Icon from './Icon.vue';
import Modal from './Modal.vue';

/**
 * Riwayat aktivitas & tugas untuk satu entitas (pelanggan, pemasok, lead, peluang, faktur, tiket).
 * `link` berisi ID tautan, mis. { customerId } — dipakai untuk memuat dan mencatat aktivitas.
 */
const props = defineProps<{ link: Record<string, string>; canAdd?: boolean; kinds?: string[]; initial?: any[] }>();
const emit = defineEmits<{ changed: [] }>();
const session = useSession();
const toast = useToast();
const rows = ref<any[]>(props.initial ?? []);
const qs = computed(() => Object.entries(props.link).map(([k, v]) => `${k}=${v}`).join('&'));
const load = async () => { try { rows.value = (await get(`/crm/activities?${qs.value}&status=all`)).rows; } catch (e) { toast.error(e, 'Aktivitas tidak dapat dimuat'); } };
watch(qs, () => { if (!props.initial) load(); }, { immediate: true });
watch(() => props.initial, (v) => { if (v) rows.value = v; });
const canWork = computed(() => session.can('crm.read|crm.collection|crm.ticket'));
const kindList = computed(() => props.kinds ?? ['telepon', 'rapat', 'email', 'kunjungan', 'tugas', 'catatan']);
const blank = () => ({ kind: kindList.value[0], subject: '', notes: '', done: true, dueAt: wibPlus(1), assigneeName: '' });
const f = ref(blank());
const errors = ref<string[]>([]);
const busy = ref(false);
async function add() {
  busy.value = true; errors.value = [];
  try {
    await post('/crm/activities', { ...props.link, kind: f.value.kind, subject: f.value.subject, notes: f.value.notes || null, done: f.value.done, dueAt: f.value.done ? null : wibIso(f.value.dueAt), assigneeName: f.value.assigneeName || null });
    f.value = blank(); await load(); emit('changed');
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
const doneFor = ref<any>(null);
const doneForm = ref({ result: '', follow: false, subject: '', dueAt: wibPlus(3) });
function openDone(a: any) { doneFor.value = a; doneForm.value = { result: '', follow: false, subject: `Tindak lanjut: ${a.subject}`.slice(0, 200), dueAt: wibPlus(3) }; }
async function complete() {
  busy.value = true;
  try {
    const d = doneForm.value;
    await post(`/crm/activities/${doneFor.value.id}/complete`, { result: d.result || null, followUp: d.follow ? { subject: d.subject, dueAt: wibIso(d.dueAt) } : null });
    doneFor.value = null; toast.push('Aktivitas selesai', '', 'ok'); await load(); emit('changed');
  } catch (e) { toast.error(e, 'Aktivitas tidak dapat diselesaikan'); } finally { busy.value = false; }
}
async function cancel(a: any) {
  try { await post(`/crm/activities/${a.id}/cancel`); await load(); emit('changed'); } catch (e) { toast.error(e, 'Aktivitas tidak dapat dibatalkan'); }
}
defineExpose({ load });
</script>

<template>
  <div data-activity-panel>
    <div v-if="canAdd && canWork" class="form-grid" style="margin-bottom:var(--sp-3)" data-activity-form>
      <div class="field"><select v-model="f.kind" class="select" aria-label="Jenis aktivitas" data-field="act-kind"><option v-for="k in kindList" :key="k" :value="k">{{ KIND_LABEL[k] }}</option></select></div>
      <div class="field"><div class="segmented" role="group" aria-label="Status aktivitas">
        <button type="button" :aria-pressed="f.done" data-act-mode="done" @click="f.done = true">Sudah dilakukan</button>
        <button type="button" :aria-pressed="!f.done" data-act-mode="plan" @click="f.done = false">Jadwalkan tugas</button>
      </div></div>
      <div class="field form-grid-full"><input v-model="f.subject" class="input" maxlength="200" placeholder="Judul, mis. Telepon konfirmasi kebutuhan" aria-label="Judul aktivitas" data-field="act-subject"></div>
      <div class="field form-grid-full"><textarea v-model="f.notes" class="textarea" rows="2" maxlength="2000" placeholder="Catatan / hasil" aria-label="Catatan" data-field="act-notes"></textarea></div>
      <template v-if="!f.done">
        <div class="field"><input v-model="f.dueAt" class="input" type="datetime-local" aria-label="Tenggat" data-field="act-due"></div>
        <div class="field"><input v-model="f.assigneeName" class="input" maxlength="120" :placeholder="`Penanggung jawab (bawaan: ${session.user?.name ?? 'saya'})`" aria-label="Penanggung jawab"></div>
      </template>
      <div class="field"><button class="btn btn-sm" data-action="add-activity" :disabled="busy || f.subject.trim().length < 3" @click="add"><Icon name="plus" /> {{ f.done ? 'Catat' : 'Jadwalkan' }}</button></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <div v-if="!rows.length" class="muted">Belum ada aktivitas.</div>
    <div class="timeline" data-activities>
      <div v-for="a in rows" :key="a.id" class="tl-item" :data-activity="a.subject">
        <span class="tl-rail"><i class="tl-node" :data-tone="a.status === 'terbuka' ? (a.overdue ? 'danger' : 'warn') : a.status === 'selesai' ? 'ok' : undefined"></i><i class="tl-line"></i></span>
        <span class="tl-body">
          <span class="tl-title"><b>{{ KIND_LABEL[a.kind] ?? a.kind }}</b> — {{ a.subject }}<span v-if="a.status === 'batal'" class="muted"> (batal)</span></span>
          <span v-if="a.notes" class="tl-meta" style="white-space:pre-line">{{ a.notes }}</span>
          <span v-if="a.result" class="tl-meta">Hasil: {{ a.result }}</span>
          <span class="tl-meta">
            <template v-if="a.status === 'terbuka'"><span :class="{ neg: a.overdue }">Tenggat {{ F.datetime(a.dueAt) }}</span> · {{ a.assigneeName }}</template>
            <template v-else>{{ a.doneByName ?? a.createdByName }} · {{ F.datetime(a.doneAt ?? a.createdAt) }}</template>
            <template v-for="(l, k) in a.links" :key="k"><span v-if="l && !link[`${k}Id`]" class="code"> · {{ l.code ?? l.docNo ?? l.name }}</span></template>
          </span>
          <span v-if="a.status === 'terbuka' && canWork" style="display:flex;gap:var(--sp-2);margin-top:4px">
            <button class="btn btn-sm" data-action="complete-activity" @click="openDone(a)"><Icon name="check" /> Selesai</button>
            <button class="btn btn-sm btn-ghost" @click="cancel(a)">Batalkan</button>
          </span>
        </span>
      </div>
    </div>
  </div>
  <Modal v-if="doneFor" :title="`Selesaikan: ${doneFor.subject}`" subtitle="Catat hasilnya; tindak lanjut opsional dibuat sebagai tugas baru." width="520px" @close="doneFor = null">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="dn-res">Hasil</label><textarea id="dn-res" v-model="doneForm.result" class="textarea" rows="2" maxlength="1000" data-field="done-result"></textarea></div>
      <div class="field form-grid-full"><label class="check"><input v-model="doneForm.follow" type="checkbox" data-field="done-follow"> Buat tugas tindak lanjut</label></div>
      <template v-if="doneForm.follow">
        <div class="field form-grid-full"><input v-model="doneForm.subject" class="input" maxlength="200" aria-label="Judul tindak lanjut" data-field="done-follow-subject"></div>
        <div class="field"><input v-model="doneForm.dueAt" class="input" type="datetime-local" aria-label="Tenggat tindak lanjut"></div>
      </template>
    </div>
    <template #foot><button class="btn btn-primary" data-action="confirm-complete" :disabled="busy" @click="complete"><Icon name="check" /> Selesai</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="doneFor = null">Batal</button></template>
  </Modal>
</template>
