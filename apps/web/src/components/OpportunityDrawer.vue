<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { get, post } from '@/lib/api';
import { ACTIVITY_LABEL, STAGE_COLUMNS, STAGE_LABEL } from '@/lib/crm';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from './BranchTag.vue';
import Drawer from './Drawer.vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import Pill from './Pill.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: []; changed: []; edit: [doc: any]; newQuote: [opp: any]; openQuote: [id: string] }>();
const session = useSession();
const router = useRouter();
const toast = useToast();
const o = ref<any>(null);
const busy = ref(false);
const load = async () => { try { o.value = await get(`/crm/opportunities/${props.id}`); } catch (e) { toast.error(e, 'Peluang tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { o.value = null; load(); }, { immediate: true });
defineExpose({ load });
const closed = computed(() => ['menang', 'kalah'].includes(o.value?.stage));
const canManage = computed(() => session.can('crm.manage') && !closed.value);

async function move(stage: string) {
  if (stage === 'kalah') { lostReason.value = ''; lostError.value = ''; showLost.value = true; return; }
  busy.value = true;
  try { o.value = await post(`/crm/opportunities/${props.id}/stage`, { stage }); toast.push(`Tahap: ${STAGE_LABEL[stage]}`, o.value.code, 'ok'); emit('changed'); }
  catch (e) { toast.error(e, 'Tahap tidak dapat diubah'); } finally { busy.value = false; }
}
const showLost = ref(false);
const lostReason = ref('');
const lostError = ref('');
async function saveLost() {
  busy.value = true; lostError.value = '';
  try { o.value = await post(`/crm/opportunities/${props.id}/stage`, { stage: 'kalah', lostReason: lostReason.value }); showLost.value = false; toast.push('Peluang ditandai kalah', o.value.code, 'ok'); emit('changed'); }
  catch (e) { lostError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const act = ref({ kind: 'telepon', note: '', nextAction: '', nextActionDate: '' });
async function addActivity() {
  if (act.value.note.trim().length < 3) return;
  busy.value = true;
  try {
    o.value = await post(`/crm/opportunities/${props.id}/activities`, { kind: act.value.kind, note: act.value.note, nextAction: act.value.nextAction || null, nextActionDate: act.value.nextActionDate || null });
    act.value = { kind: 'telepon', note: '', nextAction: '', nextActionDate: '' }; emit('changed');
  } catch (e) { toast.error(e, 'Aktivitas tidak tersimpan'); } finally { busy.value = false; }
}
</script>

<template>
  <Drawer :title="o?.name ?? 'Memuat…'" :subtitle="o ? `${o.companyName} · ${F.rp(o.value)} · peluang ${o.probability}% · PIC ${o.ownerName}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="o"><span class="code">{{ o.code }}</span><Pill :label="STAGE_LABEL[o.stage]" :tone="o.stage === 'menang' ? 'ok' : o.stage === 'kalah' ? 'danger' : 'info'" /><BranchTag :code="o.branch" /></template></template>
    <template v-if="o">
      <div v-if="o.stage === 'kalah'" class="section" style="background:var(--danger-soft)"><span class="setting-name">Kalah</span><span class="setting-note">{{ o.lostReason }}</span></div>
      <div v-if="o.stage === 'menang'" class="section" style="background:var(--ok-soft, var(--surface-2))"><span class="setting-name">Menang — {{ F.rp(o.value) }}</span><span class="setting-note">{{ o.nextAction }}</span></div>
      <div v-if="canManage" class="section" data-stage-bar>
        <span class="section-title">Pindah tahap</span>
        <div class="chips" role="group" aria-label="Tahap">
          <button v-for="[k, l] in STAGE_COLUMNS.filter(([s]) => s !== 'menang')" :key="k" class="chip" :aria-pressed="o.stage === k" :disabled="busy || o.stage === k" :data-stage="k" @click="move(k)">{{ l }}</button>
        </div>
        <span class="setting-note">Menang dicatat otomatis saat penawaran diterima dikonversi menjadi pesanan penjualan.</span>
      </div>
      <div class="section">
        <span class="section-title">Rincian</span>
        <dl class="deflist">
          <dt>Pelanggan</dt><dd><a v-if="o.customerId" href="#" class="link-btn" data-link="customer-profile" @click.prevent="router.push(`/pelanggan/${o.customerId}`)">{{ o.companyName }}</a><template v-else>{{ o.companyName }}</template><span v-if="!o.customerId" class="muted"> (prospek — belum terdaftar)</span></dd>
          <dt v-if="o.contactName">Kontak</dt><dd v-if="o.contactName">{{ o.contactName }}<template v-if="o.contactPhone"> · {{ o.contactPhone }}</template></dd>
          <dt>Nilai tertimbang</dt><dd class="num">{{ F.rp(o.weighted) }}</dd>
          <dt>Sumber</dt><dd>{{ o.source }}</dd>
          <dt v-if="o.expectedClose">Perkiraan closing</dt><dd v-if="o.expectedClose" class="num">{{ F.date(o.expectedClose) }}</dd>
          <dt v-if="o.nextAction">Tindak lanjut</dt><dd v-if="o.nextAction" :class="{ neg: o.overdueAction }">{{ o.nextAction }}<template v-if="o.nextActionDate"> · {{ F.date(o.nextActionDate) }}</template></dd>
        </dl>
      </div>
      <div class="section">
        <span class="section-title">Penawaran ({{ o.quotes.length }})</span>
        <div v-if="!o.quotes.length" class="muted">Belum ada penawaran.</div>
        <div v-else class="table-scroll"><table class="table" data-table="opp-quotes"><tbody>
          <tr v-for="q in o.quotes" :key="q.id" data-row @click="emit('openQuote', q.id)">
            <td class="code cell-strong">{{ q.docNo }}</td><td class="num">{{ F.date(q.date) }}</td><td class="ta-r num">{{ F.rp(q.total) }}</td>
            <td><Pill :status="q.status" /><span v-if="q.expired" class="cell-sub neg">kedaluwarsa</span><span v-if="q.salesOrderNo" class="cell-sub code">{{ q.salesOrderNo }}</span></td>
          </tr>
        </tbody></table></div>
      </div>
      <div class="section">
        <span class="section-title">Aktivitas</span>
        <div v-if="canManage" class="form-grid" style="margin-bottom:var(--sp-3)" data-activity-form>
          <div class="field"><select v-model="act.kind" class="select" aria-label="Jenis aktivitas"><option v-for="k in ['telepon', 'rapat', 'email', 'kunjungan', 'catatan']" :key="k" :value="k">{{ ACTIVITY_LABEL[k] }}</option></select></div>
          <div class="field form-grid-full"><textarea v-model="act.note" class="textarea" rows="2" maxlength="1000" placeholder="Hasil pembicaraan / catatan" aria-label="Catatan aktivitas" data-field="activity-note"></textarea></div>
          <div class="field"><input v-model="act.nextAction" class="input" maxlength="300" placeholder="Tindak lanjut berikutnya" aria-label="Tindak lanjut"></div>
          <div class="field"><input v-model="act.nextActionDate" class="input" type="date" aria-label="Tanggal tindak lanjut"></div>
          <div class="field"><button class="btn btn-sm" data-action="add-activity" :disabled="busy || act.note.trim().length < 3" @click="addActivity"><Icon name="plus" /> Catat</button></div>
        </div>
        <div class="timeline" data-activities>
          <div v-for="a in o.activities" :key="a.id" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="a.kind === 'tahap' ? 'accent' : undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ ACTIVITY_LABEL[a.kind] ?? a.kind }}</b> — {{ a.note }}</span><span class="tl-meta">{{ a.byName }} · {{ F.datetime(a.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="o && canManage">
        <button v-if="session.can('sales.quote.create')" class="btn btn-primary" data-action="opp-new-quote" @click="emit('newQuote', o)"><Icon name="invoice" /> Buat penawaran</button>
        <button class="btn" data-action="edit-opp" @click="emit('edit', o)"><Icon name="edit" /> Ubah</button>
      </template>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="emit('close')">Tutup</button>
    </template>
  </Drawer>
  <Modal v-if="showLost && o" :title="`Tandai ${o.code} kalah?`" subtitle="Alasan kalah dipakai untuk evaluasi penjualan." width="480px" @close="showLost = false">
    <div class="field"><label for="lost-reason">Alasan</label><textarea id="lost-reason" v-model="lostReason" class="textarea" rows="3" maxlength="300" data-field="lost-reason"></textarea></div>
    <p v-if="lostError" class="field-hint neg" role="alert">{{ lostError }}</p>
    <template #foot><button class="btn btn-danger" data-action="confirm-lost" :disabled="busy" @click="saveLost">Tandai kalah</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showLost = false">Batal</button></template>
  </Modal>
</template>
