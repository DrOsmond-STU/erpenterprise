<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { INVENTORY_TIMELINE } from '@/lib/inventory';
import { todayWib } from '@/lib/sales';
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
const load = async () => { try { t.value = await get(`/inventory/transfers/${props.id}`); } catch (e) { toast.error(e, 'Transfer stok tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { t.value = null; load(); }, { immediate: true });
const mine = (b: string) => session.user?.branches === '*' || (session.user?.branches ?? []).includes(b);
const canShip = computed(() => t.value?.status === 'draf' && session.can('inventory.transfer') && mine(t.value.branch));
const canReceive = computed(() => t.value?.status === 'dikirim' && session.can('inventory.transfer') && mine(t.value.toBranch));
const receiveDate = ref(todayWib());

async function act(kind: 'ship' | 'receive') {
  busy.value = true;
  try {
    await post(`/inventory/transfers/${props.id}/${kind}`, kind === 'receive' ? { date: receiveDate.value } : undefined);
    toast.push(kind === 'ship' ? 'Barang dikirim' : 'Barang diterima', `${t.value.docNo} · stok & jurnal diperbarui`, 'ok');
    await load(); emit('changed');
  } catch (e) { toast.error(e, kind === 'ship' ? 'Transfer tidak dapat dikirim' : 'Transfer tidak dapat diterima'); } finally { busy.value = false; }
}
const cancelling = ref(false);
const cancelError = ref('');
async function cancel(reason: string) {
  busy.value = true; cancelError.value = '';
  try { await post(`/inventory/transfers/${props.id}/cancel`, { reason }); toast.push('Transfer dibatalkan', t.value.docNo, 'ok'); cancelling.value = false; await load(); emit('changed'); }
  catch (e) { cancelError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const journalId = ref<string | null>(null);
</script>

<template>
  <Drawer :title="t ? `${t.fromWarehouse} → ${t.toWarehouse}` : 'Memuat…'" :subtitle="t ? `${F.date(t.date)} · dibuat ${t.createdByName}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="t"><span class="code">{{ t.docNo }}</span><Pill :status="t.status" :label="t.statusLabel" /><BranchTag :code="t.branch" /><template v-if="t.interBranch"><Icon name="swap" /><BranchTag :code="t.toBranch" /></template></template></template>
    <template v-if="t">
      <div v-if="t.status === 'dikirim'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)" data-transit>
        <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" data-tone="warn"><Icon name="truck" /></span>
          <div class="setting-text"><span class="setting-name">Dalam perjalanan ke {{ ctx.nameOf(t.toBranch) }}</span>
            <span class="setting-note">Nilai {{ F.rp(t.totalValue) }} tercatat di akun persediaan dalam perjalanan cabang tujuan sampai barang diterima.</span>
            <div v-if="canReceive" class="field" style="margin-top:var(--sp-2);max-width:220px"><label for="rcv-date">Tanggal terima</label><input id="rcv-date" v-model="receiveDate" class="input" type="date"></div></div></div>
      </div>
      <div class="section">
        <span class="section-title">Barang ({{ t.lines.length }})</span>
        <div class="table-scroll"><table class="table" data-table="stock-transfer-detail">
          <thead><tr><th>Barang</th><th class="ta-r">Qty</th><th class="ta-r">HPP</th><th class="ta-r">Nilai</th></tr></thead>
          <tbody>
            <tr v-for="l in t.lines" :key="l.id" class="is-static">
              <td><span class="cell-strong">{{ l.name }}</span><span class="cell-sub"><span class="code">{{ l.sku }}</span><template v-if="t.status === 'draf'"> · tersedia {{ F.int(l.available) }} {{ l.uom }}</template></span></td>
              <td class="ta-r num">{{ F.int(l.qty) }} {{ l.uom }}</td><td class="ta-r num">{{ l.unitCost === null ? '—' : F.rp(l.unitCost) }}</td><td class="ta-r num">{{ l.value === null ? '—' : F.rp(l.value) }}</td>
            </tr>
            <tr v-if="t.status !== 'draf' && t.status !== 'batal'" class="is-static"><td colspan="3" class="cell-strong">Total</td><td class="ta-r num cell-strong" data-transfer-total>{{ F.rp(t.totalValue) }}</td></tr>
          </tbody>
        </table></div>
      </div>
      <div class="section">
        <dl class="deflist">
          <dt>Dari</dt><dd>{{ t.fromWarehouse }} <span class="muted">({{ ctx.nameOf(t.branch) }})</span></dd>
          <dt>Ke</dt><dd>{{ t.toWarehouse }} <span class="muted">({{ ctx.nameOf(t.toBranch) }})</span></dd>
          <dt v-if="t.shippedDate">Dikirim</dt><dd v-if="t.shippedDate">{{ F.date(t.shippedDate) }} · {{ t.shippedByName }}</dd>
          <dt v-if="t.receivedDate">Diterima</dt><dd v-if="t.receivedDate">{{ F.date(t.receivedDate) }} · {{ t.receivedByName }}</dd>
          <dt v-if="t.notes">Catatan</dt><dd v-if="t.notes">{{ t.notes }}</dd>
        </dl>
      </div>
      <div v-if="t.journals.length" class="section">
        <span class="section-title">Jurnal ({{ t.journals.length }})</span>
        <div class="table-scroll"><table class="table" data-table="stock-transfer-journals"><tbody>
          <tr v-for="j in t.journals" :key="j.id" :data-row="session.can('ledger.journal.read') ? '' : undefined" :class="{ 'is-static': !session.can('ledger.journal.read') }" @click="session.can('ledger.journal.read') && (journalId = j.id)">
            <td class="code cell-strong">{{ j.journalNo }}</td><td><BranchTag :code="j.branch" /></td><td>{{ j.rule }}<span class="cell-sub">{{ F.date(j.date) }}</span></td><td class="ta-r num">{{ F.rp(j.total) }}</td><td><Pill :status="j.status" /></td></tr>
        </tbody></table></div>
      </div>
      <div v-if="t.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(x, i) in t.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="INVENTORY_TIMELINE[x.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ x.actor }}</b> {{ INVENTORY_TIMELINE[x.action]?.label ?? x.action }}<template v-if="x.detail?.reason"> — “{{ x.detail.reason }}”</template></span><span class="tl-meta">{{ F.datetime(x.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="t">
        <button v-if="canShip" class="btn btn-primary" data-action="ship-transfer" :disabled="busy" @click="act('ship')"><Icon name="send" /> Kirim barang</button>
        <button v-if="canReceive" class="btn btn-primary" data-action="receive-transfer" :disabled="busy || !receiveDate" @click="act('receive')"><Icon name="check" /> Terima barang</button>
        <div class="toolbar-spacer"></div>
        <button v-if="canShip" class="btn btn-ghost neg" data-action="cancel-stock-transfer" @click="cancelling = true; cancelError = ''">Batalkan</button>
        <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <ReasonModal v-if="cancelling && t" :title="`Batalkan ${t.docNo}?`" message="Draf transfer batal tidak dapat diaktifkan kembali." confirm-label="Batalkan" danger :busy="busy" :error="cancelError" @close="cancelling = false" @confirm="cancel" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" />
</template>
