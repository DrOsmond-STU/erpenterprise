<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { CASH_TIMELINE } from '@/lib/cash';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from './BranchTag.vue';
import Drawer from './Drawer.vue';
import Icon from './Icon.vue';
import JournalDrawer from './JournalDrawer.vue';
import Pill from './Pill.vue';
import ReasonModal from './ReasonModal.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const session = useSession();
const ctx = useContext();
const toast = useToast();
const t = ref<any>(null);
const busy = ref(false);
const load = async () => { try { t.value = await get(`/cash/transfers/${props.id}`); } catch (e) { toast.error(e, 'Transfer tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { t.value = null; load(); }, { immediate: true });
const isOwn = computed(() => t.value?.createdBy === session.user?.id);
const canDecide = computed(() => t.value?.status === 'menunggu' && session.can('cash.transfer.approve') && !isOwn.value);

async function approve() {
  busy.value = true;
  try { await post(`/cash/transfers/${props.id}/approve`, {}); toast.push('Transfer disetujui', `${t.value.docNo} · jurnal diposting`, 'ok'); await load(); emit('changed'); }
  catch (e) { toast.error(e, 'Transfer tidak dapat diposting'); } finally { busy.value = false; }
}
const pending = ref<'reject' | 'cancel' | 'reverse' | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  busy.value = true; pendingError.value = '';
  try {
    await post(`/cash/transfers/${props.id}/${pending.value}`, pending.value === 'reject' ? { note: reason } : { reason });
    toast.push(pending.value === 'reject' ? 'Transfer ditolak' : pending.value === 'reverse' ? 'Transfer dibalik' : 'Transfer dibatalkan', t.value.docNo, 'ok');
    pending.value = null; await load(); emit('changed');
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const journalId = ref<string | null>(null);
const TITLES = { reject: 'Tolak transfer', cancel: 'Batalkan transfer', reverse: 'Balik transfer' } as const;
</script>

<template>
  <Drawer :title="t ? `${t.fromBank} → ${t.toBank}` : 'Memuat…'" :subtitle="t ? `${F.rp(t.amount)} · ${F.date(t.date)} · diajukan ${t.createdByName}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="t"><span class="code">{{ t.docNo }}</span><Pill :status="t.status" /><BranchTag :code="t.branch" /><template v-if="t.interBranch"><Icon name="swap" /><BranchTag :code="t.toBranch" /></template></template></template>
    <template v-if="t">
      <div v-if="t.status === 'menunggu'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)" data-decision>
        <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" data-tone="warn"><Icon name="shield" /></span>
          <div class="setting-text"><span class="setting-name">{{ canDecide ? 'Perlu keputusan Anda' : 'Menunggu persetujuan' }}</span>
            <span class="setting-note">{{ t.interBranch ? 'Antar cabang: jurnal diposting di kedua cabang dan diseimbangkan dengan rekening koran antar kantor (RK).' : 'Satu cabang: satu jurnal pemindahbukuan.' }}</span>
            <span v-if="isOwn" class="setting-note">Anda pengaju transfer ini; persetujuan harus oleh orang lain.</span></div></div>
      </div>
      <div class="section">
        <span class="section-title">Rincian transfer</span>
        <dl class="deflist">
          <dt>Dari</dt><dd>{{ t.fromBank }} · {{ t.fromBankName }} <span class="muted">({{ ctx.nameOf(t.branch) }})</span></dd>
          <dt>Ke</dt><dd>{{ t.toBank }} · {{ t.toBankName }} <span class="muted">({{ ctx.nameOf(t.toBranch) }})</span></dd>
          <dt>Nilai</dt><dd class="num">{{ F.rp(t.amount) }}</dd>
          <dt>Tanggal</dt><dd class="num">{{ F.date(t.date) }}</dd>
          <dt v-if="t.reference">Referensi</dt><dd v-if="t.reference">{{ t.reference }}</dd>
          <dt v-if="t.notes">Catatan</dt><dd v-if="t.notes">{{ t.notes }}</dd>
          <dt v-if="t.decidedByName">Diputus</dt><dd v-if="t.decidedByName">{{ t.decidedByName }}<template v-if="t.decidedAt"> · {{ F.datetime(t.decidedAt) }}</template></dd>
          <dt v-if="t.decisionNote">Catatan keputusan</dt><dd v-if="t.decisionNote">{{ t.decisionNote }}</dd>
        </dl>
      </div>
      <div v-if="t.journals.length" class="section">
        <span class="section-title">Jurnal ({{ t.journals.length }})</span>
        <div class="table-scroll"><table class="table" data-table="transfer-journals"><tbody>
          <tr v-for="j in t.journals" :key="j.id" :data-row="session.can('ledger.journal.read') ? '' : undefined" :class="{ 'is-static': !session.can('ledger.journal.read') }" @click="session.can('ledger.journal.read') && (journalId = j.id)">
            <td class="code cell-strong">{{ j.journalNo }}</td><td><BranchTag :code="j.branch" /></td><td>{{ j.rule }}<span class="cell-sub">{{ F.date(j.date) }}</span></td><td class="ta-r num">{{ F.rp(j.total) }}</td><td><Pill :status="j.status" /></td></tr>
        </tbody></table></div>
      </div>
      <div v-if="t.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(x, i) in t.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="CASH_TIMELINE[x.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ x.actor }}</b> {{ CASH_TIMELINE[x.action]?.label ?? x.action }}<template v-if="x.detail?.reason || x.detail?.note"> — “{{ x.detail.reason ?? x.detail.note }}”</template></span><span class="tl-meta">{{ F.datetime(x.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="t">
        <template v-if="canDecide">
          <button class="btn btn-primary" data-action="approve-transfer" :disabled="busy" @click="approve"><Icon name="check" /> Setujui & posting</button>
          <button class="btn btn-danger" data-action="reject-transfer" :disabled="busy" @click="pending = 'reject'; pendingError = ''"><Icon name="x" /> Tolak</button>
        </template>
        <button v-if="t.status === 'diposting' && session.can('cash.transfer.approve')" class="btn" data-action="reverse-transfer" @click="pending = 'reverse'; pendingError = ''">Balik transfer</button>
        <div class="toolbar-spacer"></div>
        <button v-if="t.status === 'menunggu' && (isOwn || session.can('cash.transfer.approve'))" class="btn btn-ghost neg" data-action="cancel-transfer" @click="pending = 'cancel'; pendingError = ''">Batalkan</button>
        <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <ReasonModal v-if="pending && t" :title="`${TITLES[pending]} ${t.docNo}?`"
    :message="pending === 'reverse' ? 'Jurnal transfer dibalik per hari ini di semua cabang yang terlibat.' : pending === 'reject' ? 'Pengaju dapat mengajukan transfer baru.' : 'Transfer batal tidak dapat diaktifkan kembali.'"
    :confirm-label="TITLES[pending]" danger :busy="busy" :error="pendingError" @close="pending = null" @confirm="confirm" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" />
</template>
