<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PAY_LABEL, PAY_METHODS } from '@erp/domain';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { POS_TIMELINE } from '@/lib/pos';
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
const s = ref<any>(null);
const busy = ref(false);
const load = async () => { try { s.value = await get(`/pos/shifts/${props.id}`); } catch (e) { toast.error(e, 'Shift tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { s.value = null; load(); }, { immediate: true });
const isCashier = computed(() => s.value?.cashierId === session.user?.id);
const canPost = computed(() => s.value?.status === 'ditutup' && session.can('pos.shift.post') && !isCashier.value);
const canVoid = computed(() => s.value?.status === 'buka' && session.can('pos.shift.post'));
async function postShift() {
  busy.value = true;
  try { await post(`/pos/shifts/${props.id}/post`); toast.push('Shift diposting', `${s.value.docNo} · jurnal penjualan & stok`, 'ok'); await load(); emit('changed'); }
  catch (e) { toast.error(e, 'Shift tidak dapat diposting'); } finally { busy.value = false; }
}
const voiding = ref<any>(null);
const voidError = ref('');
async function confirmVoid(reason: string) {
  busy.value = true; voidError.value = '';
  try { await post(`/pos/transactions/${voiding.value.id}/void`, { reason }); toast.push('Transaksi dibatalkan', voiding.value.trxNo, 'ok'); voiding.value = null; await load(); emit('changed'); }
  catch (e) { voidError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const journalId = ref<string | null>(null);
</script>

<template>
  <Drawer :title="s ? `Shift ${s.cashierName}` : 'Memuat…'" :subtitle="s ? `${F.date(s.date)} · toko ${s.warehouse} · kas ${s.cashAccount}${s.settlementAccount ? ' · penampung ' + s.settlementAccount : ''}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="s"><span class="code">{{ s.docNo }}</span><Pill :status="s.status" /><BranchTag :code="s.branch" /></template></template>
    <template v-if="s">
      <div v-if="s.status === 'ditutup'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)" data-post-panel>
        <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" data-tone="warn"><Icon name="shield" /></span>
          <div class="setting-text"><span class="setting-name">{{ canPost ? 'Perlu posting Anda' : 'Menunggu posting supervisor' }}</span>
            <span class="setting-note">Kas dihitung {{ F.rp(s.countedCash) }} vs seharusnya {{ F.rp(s.expectedCash) }} — selisih <b :class="{ neg: s.cashDiff < 0 }">{{ F.rp(s.cashDiff) }}</b>.</span>
            <span v-if="isCashier" class="setting-note">Anda kasir shift ini; posting harus oleh orang lain.</span></div></div>
      </div>
      <div class="section">
        <dl class="deflist">
          <dt>Transaksi</dt><dd class="num">{{ s.summary.count }}<template v-if="s.summary.voids"> (+{{ s.summary.voids }} void)</template></dd>
          <dt>DPP / PPN</dt><dd class="num">{{ F.rp(s.summary.net) }} / {{ F.rp(s.summary.ppn) }}</dd>
          <dt>Total penjualan</dt><dd class="num cell-strong" data-shift-gross>{{ F.rp(s.summary.gross) }}</dd>
          <template v-for="m in PAY_METHODS" :key="m"><template v-if="s.summary.byMethod[m]"><dt>{{ PAY_LABEL[m] }}</dt><dd class="num">{{ F.rp(s.summary.byMethod[m]) }}</dd></template></template>
          <dt>Kas awal</dt><dd class="num">{{ F.rp(s.openingCash) }}</dd>
          <dt v-if="s.cogs !== null">HPP</dt><dd v-if="s.cogs !== null" class="num">{{ F.rp(s.cogs) }}</dd>
          <dt v-if="s.closeNote">Catatan tutup</dt><dd v-if="s.closeNote">{{ s.closeNote }}</dd>
          <dt v-if="s.postedByName">Diposting</dt><dd v-if="s.postedByName">{{ s.postedByName }} · {{ F.datetime(s.postedAt) }}</dd>
        </dl>
      </div>
      <div class="section">
        <span class="section-title">Transaksi ({{ s.transactions.length }})</span>
        <div class="table-scroll"><table class="table" data-table="pos-trx"><tbody>
          <tr v-for="t in s.transactions" :key="t.id" class="is-static" :data-trx="t.trxNo">
            <td><span class="code cell-strong">{{ t.trxNo }}</span><span class="cell-sub">{{ t.lines.map((l: any) => `${F.int(l.qty)}× ${l.name}`).join(', ') }}</span></td>
            <td>{{ PAY_LABEL[t.method as keyof typeof PAY_LABEL] }}<span v-if="t.voidReason" class="cell-sub">{{ t.voidReason }}</span></td>
            <td class="ta-r num">{{ F.rp(t.total) }}</td>
            <td><Pill :status="t.status" /></td>
            <td v-if="canVoid" class="ta-r"><button v-if="t.status === 'selesai'" class="btn btn-sm btn-ghost neg" data-action="void-trx" @click="voiding = t; voidError = ''">Void</button></td>
          </tr>
          <tr v-if="!s.transactions.length" class="is-static"><td><span class="muted">Belum ada transaksi.</span></td></tr>
        </tbody></table></div>
      </div>
      <div v-if="s.journals.length" class="section">
        <span class="section-title">Jurnal</span>
        <div class="table-scroll"><table class="table" data-table="pos-journals"><tbody>
          <tr v-for="j in s.journals" :key="j.id" :data-row="session.can('ledger.journal.read') ? '' : undefined" :class="{ 'is-static': !session.can('ledger.journal.read') }" @click="session.can('ledger.journal.read') && (journalId = j.id)">
            <td class="code cell-strong">{{ j.journalNo }}</td><td>{{ j.rule }}<span class="cell-sub">{{ F.date(j.date) }}</span></td><td class="ta-r num">{{ F.rp(j.total) }}</td><td><Pill :status="j.status" /></td></tr>
        </tbody></table></div>
      </div>
      <div v-if="s.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(x, i) in s.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="POS_TIMELINE[x.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ x.actor }}</b> {{ POS_TIMELINE[x.action]?.label ?? x.action }}<template v-if="x.detail?.reason || x.detail?.note"> — “{{ x.detail.reason ?? x.detail.note }}”</template></span><span class="tl-meta">{{ F.datetime(x.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="s">
        <button v-if="canPost" class="btn btn-primary" data-action="post-shift" :disabled="busy" @click="postShift"><Icon name="check" /> Posting shift</button>
        <div class="toolbar-spacer"></div>
        <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <ReasonModal v-if="voiding" :title="`Batalkan ${voiding.trxNo}?`" :message="`Transaksi ${F.rp(voiding.total)} tidak dihitung dalam penjualan shift; stok cadangan dilepas.`" confirm-label="Void transaksi" danger :busy="busy" :error="voidError" @close="voiding = null" @confirm="confirmVoid" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" />
</template>
