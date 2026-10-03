<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { INVENTORY_TIMELINE } from '@/lib/inventory';
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
const toast = useToast();
const a = ref<any>(null);
const busy = ref(false);
const load = async () => { try { a.value = await get(`/inventory/adjustments/${props.id}`); } catch (e) { toast.error(e, 'Penyesuaian tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { a.value = null; load(); }, { immediate: true });
const isOwn = computed(() => a.value?.createdBy === session.user?.id);
const canDecide = computed(() => a.value?.status === 'menunggu' && session.can('inventory.adjust.approve') && !isOwn.value);

async function approve() {
  busy.value = true;
  try { await post(`/inventory/adjustments/${props.id}/approve`, {}); toast.push('Penyesuaian diposting', `${a.value.docNo} · stok & jurnal diperbarui`, 'ok'); await load(); emit('changed'); }
  catch (e) { toast.error(e, 'Penyesuaian tidak dapat diposting'); } finally { busy.value = false; }
}
const pending = ref<'reject' | 'cancel' | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  busy.value = true; pendingError.value = '';
  try {
    await post(`/inventory/adjustments/${props.id}/${pending.value}`, pending.value === 'reject' ? { note: reason } : { reason });
    toast.push(pending.value === 'reject' ? 'Penyesuaian ditolak' : 'Penyesuaian dibatalkan', a.value.docNo, 'ok');
    pending.value = null; await load(); emit('changed');
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const journalId = ref<string | null>(null);
</script>

<template>
  <Drawer :title="a ? `${a.reasonLabel} · ${a.warehouse}` : 'Memuat…'" :subtitle="a ? `${F.date(a.date)} · dicatat ${a.createdByName}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="a"><span class="code">{{ a.docNo }}</span><Pill :status="a.status" /><BranchTag :code="a.branch" /></template></template>
    <template v-if="a">
      <div v-if="a.status === 'menunggu'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)" data-decision>
        <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" data-tone="warn"><Icon name="shield" /></span>
          <div class="setting-text"><span class="setting-name">{{ canDecide ? 'Perlu keputusan Anda' : 'Menunggu persetujuan' }}</span>
            <span class="setting-note">Selisih di bawah ini estimasi terhadap stok sistem saat ini; dihitung ulang saat disetujui.</span>
            <span v-if="isOwn" class="setting-note">Anda pencatat penyesuaian ini; persetujuan harus oleh orang lain.</span></div></div>
      </div>
      <div class="section">
        <span class="section-title">Barang ({{ a.lines.length }})</span>
        <div class="table-scroll"><table class="table" data-table="adjustment-detail">
          <thead><tr><th>Barang</th><th class="ta-r">Sistem</th><th class="ta-r">Fisik</th><th class="ta-r">Selisih</th><th class="ta-r">Nilai</th></tr></thead>
          <tbody>
            <tr v-for="l in a.lines" :key="l.id" class="is-static">
              <td><span class="cell-strong">{{ l.name }}</span><span class="cell-sub"><span class="code">{{ l.sku }}</span> · HPP {{ F.rp(l.unitCost) }}</span></td>
              <td class="ta-r num">{{ F.int(l.systemQty) }}</td><td class="ta-r num">{{ F.int(l.countedQty) }}</td>
              <td class="ta-r num" :class="{ neg: l.diffQty < 0, pos: l.diffQty > 0 }">{{ l.diffQty > 0 ? '+' : '' }}{{ F.int(l.diffQty) }} {{ l.uom }}</td>
              <td class="ta-r num" :class="{ neg: l.value < 0 }">{{ F.rp(l.value) }}</td>
            </tr>
            <tr class="is-static"><td colspan="4" class="cell-strong">{{ a.status === 'diposting' ? 'Total selisih diposting' : 'Estimasi total selisih' }}</td>
              <td class="ta-r num cell-strong" data-adj-total>{{ F.rp(a.status === 'diposting' ? a.totalValue : a.estimatedValue) }}</td></tr>
          </tbody>
        </table></div>
      </div>
      <div class="section">
        <dl class="deflist">
          <dt v-if="a.notes">Catatan</dt><dd v-if="a.notes">{{ a.notes }}</dd>
          <dt v-if="a.decidedByName">Diputus</dt><dd v-if="a.decidedByName">{{ a.decidedByName }}<template v-if="a.decidedAt"> · {{ F.datetime(a.decidedAt) }}</template></dd>
          <dt v-if="a.decisionNote">Catatan keputusan</dt><dd v-if="a.decisionNote">{{ a.decisionNote }}</dd>
        </dl>
      </div>
      <div v-if="a.journals.length" class="section">
        <span class="section-title">Jurnal</span>
        <div class="table-scroll"><table class="table" data-table="adjustment-journals"><tbody>
          <tr v-for="j in a.journals" :key="j.id" :data-row="session.can('ledger.journal.read') ? '' : undefined" :class="{ 'is-static': !session.can('ledger.journal.read') }" @click="session.can('ledger.journal.read') && (journalId = j.id)">
            <td class="code cell-strong">{{ j.journalNo }}</td><td class="num">{{ F.date(j.date) }}</td><td class="ta-r num">{{ F.rp(j.total) }}</td><td><Pill :status="j.status" /></td></tr>
        </tbody></table></div>
      </div>
      <div v-if="a.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(x, i) in a.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="INVENTORY_TIMELINE[x.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ x.actor }}</b> {{ INVENTORY_TIMELINE[x.action]?.label ?? x.action }}<template v-if="x.detail?.reason || x.detail?.note"> — “{{ x.detail.reason ?? x.detail.note }}”</template></span><span class="tl-meta">{{ F.datetime(x.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="a">
        <template v-if="canDecide">
          <button class="btn btn-primary" data-action="approve-adjustment" :disabled="busy" @click="approve"><Icon name="check" /> Setujui & posting</button>
          <button class="btn btn-danger" data-action="reject-adjustment" :disabled="busy" @click="pending = 'reject'; pendingError = ''"><Icon name="x" /> Tolak</button>
        </template>
        <div class="toolbar-spacer"></div>
        <button v-if="a.status === 'menunggu' && (isOwn || session.can('inventory.adjust.approve'))" class="btn btn-ghost neg" data-action="cancel-adjustment" @click="pending = 'cancel'; pendingError = ''">Batalkan</button>
        <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <ReasonModal v-if="pending && a" :title="`${pending === 'reject' ? 'Tolak' : 'Batalkan'} ${a.docNo}?`"
    :message="pending === 'reject' ? 'Gudang dapat mencatat penyesuaian baru.' : 'Penyesuaian batal tidak dapat diaktifkan kembali.'"
    :confirm-label="pending === 'reject' ? 'Tolak' : 'Batalkan'" danger :busy="busy" :error="pendingError" @close="pending = null" @confirm="confirm" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" />
</template>
