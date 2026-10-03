<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { PRODUCTION_TIMELINE } from '@/lib/production';
import { todayWib } from '@/lib/sales';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from './BranchTag.vue';
import Drawer from './Drawer.vue';
import Icon from './Icon.vue';
import JournalDrawer from './JournalDrawer.vue';
import Modal from './Modal.vue';
import Pill from './Pill.vue';
import ReasonModal from './ReasonModal.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const session = useSession();
const toast = useToast();
const w = ref<any>(null);
const busy = ref(false);
const load = async () => { try { w.value = await get(`/production/work-orders/${props.id}`); } catch (e) { toast.error(e, 'Perintah kerja tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { w.value = null; load(); }, { immediate: true });
const canManage = computed(() => session.can('production.manage'));
const canQc = computed(() => w.value?.status === 'qc' && session.can('production.complete'));
const ownQc = computed(() => w.value?.qcSubmittedBy === session.user?.id);
const open = computed(() => ['antre', 'berjalan'].includes(w.value?.status));
const changed = async (title: string, note: string) => { toast.push(title, note, 'ok'); await load(); emit('changed'); };

/* Kemajuan */
const progress = ref(0);
const flag = ref('');
watch(w, (v) => { if (v) { progress.value = v.progress; flag.value = v.flag ?? ''; } });
async function saveProgress() {
  busy.value = true;
  try { await patch(`/production/work-orders/${props.id}`, { progress: Number(progress.value), flag: flag.value || null }); await changed('Kemajuan diperbarui', w.value.docNo); }
  catch (e) { toast.error(e, 'Kemajuan tidak dapat disimpan'); } finally { busy.value = false; }
}

/* Pemakaian bahan */
const issuing = ref(false);
const issueDate = ref(todayWib());
const issueLines = ref<{ sku: string; name: string; uom: string; qty: number; available: number }[]>([]);
const issueErrors = ref<string[]>([]);
function openIssue() {
  issueErrors.value = []; issueDate.value = todayWib();
  issueLines.value = w.value.materials.map((m: any) => ({ sku: m.sku, name: m.name, uom: m.uom, qty: m.remaining, available: m.available }));
  issuing.value = true;
}
async function saveIssue() {
  busy.value = true; issueErrors.value = [];
  try {
    const r = await post(`/production/work-orders/${props.id}/issue`, { date: issueDate.value, lines: issueLines.value.filter((l) => Number(l.qty) > 0).map((l) => ({ sku: l.sku, qty: Number(l.qty) })) });
    issuing.value = false; await changed('Bahan dikeluarkan', `${r.docNo} · WIP ${F.rp(r.wip)}`);
  } catch (e) { issueErrors.value = errorList(e); } finally { busy.value = false; }
}

/* Pemeriksaan mutu */
const qcOpen = ref(false);
const qc = ref({ goodQty: 0, rejectQty: 0, note: '' });
const qcErrors = ref<string[]>([]);
function openQc() { qcErrors.value = []; qc.value = { goodQty: w.value.plannedQty, rejectQty: 0, note: '' }; qcOpen.value = true; }
async function saveQc() {
  busy.value = true; qcErrors.value = [];
  try { await post(`/production/work-orders/${props.id}/qc`, { goodQty: Number(qc.value.goodQty), rejectQty: Number(qc.value.rejectQty || 0), note: qc.value.note || undefined }); qcOpen.value = false; await changed('Dikirim ke pemeriksaan mutu', w.value.docNo); }
  catch (e) { qcErrors.value = errorList(e); } finally { busy.value = false; }
}
const completeDate = ref(todayWib());
async function complete() {
  busy.value = true;
  try { const r = await post(`/production/work-orders/${props.id}/complete`, { date: completeDate.value }); await changed('Lolos QC — barang jadi masuk gudang', `${r.docNo} · ${F.rp(r.outputValue)}`); }
  catch (e) { toast.error(e, 'Perintah kerja tidak dapat diselesaikan'); } finally { busy.value = false; }
}
const pending = ref<'rework' | 'cancel' | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  busy.value = true; pendingError.value = '';
  try {
    await post(`/production/work-orders/${props.id}/${pending.value}`, pending.value === 'rework' ? { note: reason } : { reason });
    const t = pending.value === 'rework' ? 'Dikembalikan untuk pengerjaan ulang' : 'Perintah kerja dibatalkan';
    pending.value = null; await changed(t, w.value.docNo);
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const journalId = ref<string | null>(null);
</script>

<template>
  <Drawer :title="w ? w.productName : 'Memuat…'" :subtitle="w ? `${F.int(w.plannedQty)} ${w.uom} · gudang ${w.warehouse}${w.line ? ' · ' + w.line : ''}${w.pic ? ' · ' + w.pic : ''}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="w"><span class="code">{{ w.docNo }}</span><Pill :status="w.status" :label="w.statusLabel" /><BranchTag :code="w.branch" /></template></template>
    <template v-if="w">
      <div v-if="w.status === 'qc'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)" data-qc>
        <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" data-tone="warn"><Icon name="shield" /></span>
          <div class="setting-text"><span class="setting-name">{{ canQc && !ownQc ? 'Perlu keputusan QC Anda' : 'Menunggu pemeriksaan mutu' }}</span>
            <span class="setting-note">Dilaporkan {{ w.qcSubmittedByName }}: {{ F.int(w.goodQty) }} {{ w.uom }} baik, {{ F.int(w.rejectQty ?? 0) }} cacat. Bila lolos, barang jadi masuk senilai WIP {{ F.rp(w.wip) }} (≈ {{ F.rp(w.goodQty ? Math.round(w.wip / w.goodQty) : 0) }}/{{ w.uom }}).</span>
            <span v-if="ownQc" class="setting-note">Anda pelapor hasil ini; QC harus diloloskan orang lain.</span>
            <div v-if="canQc && !ownQc" class="field" style="margin-top:var(--sp-2);max-width:220px"><label for="wo-done-date">Tanggal selesai</label><input id="wo-done-date" v-model="completeDate" class="input" type="date"></div></div></div>
      </div>
      <div class="section">
        <dl class="deflist">
          <dt>Tanggal</dt><dd class="num">{{ F.date(w.date) }}<template v-if="w.dueDate"> · tenggat {{ F.date(w.dueDate) }}</template></dd>
          <dt>Barang dalam proses</dt><dd class="num" data-wip>{{ F.rp(w.wip) }}</dd>
          <dt v-if="w.outputValue">Hasil produksi</dt><dd v-if="w.outputValue" class="num">{{ F.rp(w.outputValue) }} · {{ F.int(w.goodQty) }} {{ w.uom }} ({{ F.date(w.completedDate) }}, {{ w.completedByName }})</dd>
          <dt v-if="w.qcNote">Catatan QC</dt><dd v-if="w.qcNote">{{ w.qcNote }}</dd>
          <dt v-if="w.cancelReason">Alasan batal</dt><dd v-if="w.cancelReason">{{ w.cancelReason }}</dd>
        </dl>
        <div v-if="open && canManage" style="display:flex;gap:var(--sp-3);align-items:flex-end;flex-wrap:wrap;margin-top:var(--sp-3)" data-progress>
          <div class="field" style="flex:1 1 160px"><label for="wo-progress">Kemajuan {{ progress }}%</label><input id="wo-progress" v-model.number="progress" type="range" min="0" max="99" step="1"></div>
          <div class="field" style="flex:2 1 200px"><label for="wo-flag">Penanda masalah</label><input id="wo-flag" v-model="flag" class="input" maxlength="120" placeholder="Mis. bahan baku menipis"></div>
          <button class="btn btn-sm" data-action="save-progress" :disabled="busy" @click="saveProgress">Simpan</button>
        </div>
      </div>
      <div class="section">
        <span class="section-title">Bahan (standar BOM vs aktual)</span>
        <div class="table-scroll"><table class="table" data-table="wo-materials">
          <thead><tr><th>Bahan</th><th class="ta-r">Standar</th><th class="ta-r">Dikeluarkan</th><th class="ta-r">Nilai</th></tr></thead>
          <tbody>
            <tr v-for="m in w.materials" :key="m.sku" class="is-static">
              <td><span class="cell-strong">{{ m.name }}</span><span class="cell-sub"><span class="code">{{ m.sku }}</span><template v-if="open"> · tersedia {{ F.int(m.available) }} {{ m.uom }}</template></span></td>
              <td class="ta-r num">{{ F.dec(m.standard, 2) }}</td>
              <td class="ta-r num" :class="{ neg: m.diff > 0 }">{{ F.dec(m.actual, 2) }}<span v-if="m.diff" class="cell-sub">{{ m.diff > 0 ? '+' : '' }}{{ F.dec(m.diff, 2) }}</span></td>
              <td class="ta-r num">{{ F.rp(m.issuedValue) }}</td>
            </tr>
          </tbody>
        </table></div>
      </div>
      <div v-if="w.journals.length" class="section">
        <span class="section-title">Jurnal ({{ w.journals.length }})</span>
        <div class="table-scroll"><table class="table" data-table="wo-journals"><tbody>
          <tr v-for="j in w.journals" :key="j.id" :data-row="session.can('ledger.journal.read') ? '' : undefined" :class="{ 'is-static': !session.can('ledger.journal.read') }" @click="session.can('ledger.journal.read') && (journalId = j.id)">
            <td class="code cell-strong">{{ j.journalNo }}</td><td>{{ j.rule }}<span class="cell-sub">{{ F.date(j.date) }}</span></td><td class="ta-r num">{{ F.rp(j.total) }}</td><td><Pill :status="j.status" /></td></tr>
        </tbody></table></div>
      </div>
      <div v-if="w.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(x, i) in w.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="PRODUCTION_TIMELINE[x.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ x.actor }}</b> {{ PRODUCTION_TIMELINE[x.action]?.label ?? x.action }}<template v-if="x.detail?.reason || x.detail?.note"> — “{{ x.detail.reason ?? x.detail.note }}”</template></span><span class="tl-meta">{{ F.datetime(x.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="w">
        <button v-if="open && canManage" class="btn btn-primary" data-action="issue-materials" :disabled="busy" @click="openIssue"><Icon name="send" /> Keluarkan bahan</button>
        <button v-if="w.status === 'berjalan' && canManage" class="btn" data-action="submit-qc" :disabled="busy" @click="openQc"><Icon name="check" /> Kirim ke QC</button>
        <template v-if="canQc && !ownQc">
          <button class="btn btn-primary" data-action="complete-wo" :disabled="busy || !completeDate" @click="complete"><Icon name="check" /> Lolos QC & posting</button>
          <button class="btn btn-danger" data-action="rework-wo" :disabled="busy" @click="pending = 'rework'; pendingError = ''">Kerjakan ulang</button>
        </template>
        <div class="toolbar-spacer"></div>
        <button v-if="w.status === 'antre' && !w.issuedValue && canManage" class="btn btn-ghost neg" data-action="cancel-wo" @click="pending = 'cancel'; pendingError = ''">Batalkan</button>
        <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <Modal v-if="issuing && w" title="Keluarkan bahan" :subtitle="`${w.docNo} · dari gudang ${w.warehouse}. Nilai dengan HPP rata-rata saat ini; dijurnal Dr barang dalam proses / Cr persediaan.`" width="640px" @close="issuing = false">
    <div class="form-grid">
      <div class="field"><label for="iss-date">Tanggal</label><input id="iss-date" v-model="issueDate" class="input" type="date"></div>
      <div class="field form-grid-full"><div class="table-scroll"><table class="table" data-table="issue-lines">
        <thead><tr><th>Bahan</th><th class="ta-r">Tersedia</th><th class="ta-r">Dikeluarkan</th></tr></thead>
        <tbody><tr v-for="l in issueLines" :key="l.sku" class="is-static" :data-issue-line="l.sku">
          <td><span class="cell-strong">{{ l.name }}</span><span class="cell-sub code">{{ l.sku }}</span></td>
          <td class="ta-r num" :class="{ neg: l.available < Number(l.qty) }">{{ F.int(l.available) }} {{ l.uom }}</td>
          <td><input v-model.number="l.qty" class="input num" type="number" min="0" step="any" style="width:110px;text-align:right" :aria-label="`Jumlah ${l.sku}`"></td>
        </tr></tbody>
      </table></div></div>
      <div v-if="issueErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in issueErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-issue" :disabled="busy || !issueLines.some((l) => Number(l.qty) > 0)" @click="saveIssue"><Icon name="send" /> Keluarkan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="issuing = false">Batal</button>
    </template>
  </Modal>
  <Modal v-if="qcOpen && w" title="Kirim ke pemeriksaan mutu" subtitle="Laporkan jumlah baik dan cacat. Biaya produk cacat diserap barang yang lolos." width="520px" @close="qcOpen = false">
    <div class="form-grid">
      <div class="field"><label for="qc-good">Baik ({{ w.uom }})</label><input id="qc-good" v-model.number="qc.goodQty" class="input num" type="number" min="0" step="any" style="text-align:right"></div>
      <div class="field"><label for="qc-reject">Cacat ({{ w.uom }})</label><input id="qc-reject" v-model.number="qc.rejectQty" class="input num" type="number" min="0" step="any" style="text-align:right"></div>
      <div class="field form-grid-full"><label for="qc-note">Catatan</label><input id="qc-note" v-model="qc.note" class="input" maxlength="300"></div>
      <div v-if="qcErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in qcErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-qc" :disabled="busy || !(qc.goodQty > 0)" @click="saveQc"><Icon name="check" /> Kirim</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="qcOpen = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="pending && w" :title="pending === 'rework' ? `Kembalikan ${w.docNo} untuk pengerjaan ulang?` : `Batalkan ${w.docNo}?`"
    :message="pending === 'rework' ? 'Perintah kerja kembali berjalan; pelapor mengirim ulang hasil ke QC.' : 'Perintah kerja batal tidak dapat diaktifkan kembali.'"
    :confirm-label="pending === 'rework' ? 'Kerjakan ulang' : 'Batalkan'" danger :busy="busy" :error="pendingError" @close="pending = null" @confirm="confirm" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" />
</template>
