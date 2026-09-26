<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { TIMELINE } from '@/lib/sales';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from './BranchTag.vue';
import Drawer from './Drawer.vue';
import Icon from './Icon.vue';
import Pill from './Pill.vue';
import ReasonModal from './ReasonModal.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: []; changed: []; edit: [doc: any]; openInvoice: [id: string] }>();
const session = useSession();
const ctx = useContext();
const toast = useToast();
const o = ref<any>(null);
const busy = ref(false);
const load = async () => { try { o.value = await get(`/sales/orders/${props.id}`); } catch (e) { toast.error(e, 'Pesanan tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { o.value = null; load(); }, { immediate: true });

const isOwn = computed(() => o.value?.createdBy === session.user?.id);
const canApprove = computed(() => session.can('sales.order.approve') && !isOwn.value);
const usage = computed(() => (o.value && o.value.credit.limit > 0 ? (o.value.credit.exposure / o.value.credit.limit) * 100 : 0));

async function act(fn: () => Promise<any>, msg: string) {
  busy.value = true;
  try { const r = await fn(); toast.push(msg, o.value.docNo, 'ok'); await load(); emit('changed'); return r; }
  catch (e) { toast.error(e, 'Tindakan gagal'); } finally { busy.value = false; }
}
const submit = () => act(() => post(`/sales/orders/${props.id}/submit`), 'Pesanan diajukan');
const approve = () => act(() => post(`/sales/orders/${props.id}/approve`, {}), 'Pesanan disetujui');
async function toInvoice() {
  const r = await act(() => post(`/sales/orders/${props.id}/invoice`, {}), 'Draf faktur dibuat');
  if (r?.invoiceId) emit('openInvoice', r.invoiceId);
}
const pending = ref<'reject' | 'cancel' | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  busy.value = true; pendingError.value = '';
  try {
    await post(`/sales/orders/${props.id}/${pending.value}`, { reason });
    toast.push(pending.value === 'reject' ? 'Pesanan ditolak' : 'Pesanan dibatalkan', o.value.docNo, 'ok');
    pending.value = null; await load(); emit('changed');
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
</script>

<template>
  <Drawer :title="o?.customerName ?? 'Memuat…'" :subtitle="o ? `${F.rp(o.total)} · dibuat ${F.date(o.date)} oleh ${o.createdByName}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="o"><span class="code">{{ o.docNo }}</span><Pill :status="o.status" /><BranchTag :code="o.branch" /></template></template>
    <template v-if="o">
      <div v-if="o.status === 'menunggu'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)" data-decision>
        <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" data-tone="warn"><Icon name="alert" /></span>
          <div class="setting-text"><span class="setting-name">{{ canApprove ? 'Perlu keputusan Anda' : 'Menunggu persetujuan manajer' }}</span>
            <span v-for="r in o.approvalReasons" :key="r" class="setting-note">• {{ r }}</span>
            <span v-if="isOwn" class="setting-note">Anda pembuat pesanan ini; persetujuan harus oleh orang lain.</span></div></div>
      </div>
      <div v-if="o.status === 'ditolak'" class="section" style="background:var(--danger-soft)"><span class="setting-name">Ditolak oleh {{ o.decidedByName }}</span><span class="setting-note">{{ o.decisionNote }} — ubah pesanan lalu ajukan kembali, atau batalkan.</span></div>
      <div class="section">
        <span class="section-title">Rincian pesanan</span>
        <dl class="deflist">
          <dt>Pelanggan</dt><dd>{{ o.customerCode }} · {{ o.customerName }}</dd>
          <dt>Kanal</dt><dd>{{ o.channel ?? '—' }}</dd>
          <dt>Tanggal pesan</dt><dd class="num">{{ F.date(o.date) }}</dd>
          <dt>Tanggal kirim</dt><dd class="num">{{ F.date(o.deliveryDate) }}</dd>
          <dt>Termin</dt><dd>{{ o.customer.termsDays ? `Net ${o.customer.termsDays}` : 'Tunai' }}</dd>
          <dt>Cabang / gudang</dt><dd>{{ ctx.nameOf(o.branch) }}</dd>
          <dt v-if="o.decidedByName">Diputus</dt><dd v-if="o.decidedByName">{{ o.decidedByName }} · {{ F.datetime(o.decidedAt) }}</dd>
          <dt v-if="o.invoiceNo">Faktur</dt><dd v-if="o.invoiceNo"><a href="#" class="code" data-action="open-invoice" @click.prevent="emit('openInvoice', o.invoiceId)">{{ o.invoiceNo }}</a></dd>
          <dt v-if="o.notes">Catatan</dt><dd v-if="o.notes">{{ o.notes }}</dd>
        </dl>
      </div>
      <div class="section" data-credit>
        <span class="section-title">Posisi kredit pelanggan</span>
        <div class="meter" style="min-width:0">
          <span class="meter-track" style="height:8px"><span class="meter-fill" :data-tone="usage >= 95 ? 'danger' : usage >= 80 ? 'warn' : undefined" :style="{ width: Math.min(100, usage) + '%' }"></span></span>
          <span class="meter-val">{{ F.pct(usage, 0) }}</span>
        </div>
        <div class="totals">
          <div class="totals-row"><span>Plafon kredit</span><b>{{ F.rp(o.credit.limit) }}</b></div>
          <div class="totals-row"><span>Terpakai (piutang + pesanan lain)</span><b>{{ F.rp(o.credit.exposure) }}</b></div>
          <div v-if="o.credit.overdue" class="totals-row"><span>… di antaranya jatuh tempo</span><b class="neg">{{ F.rp(o.credit.overdue) }}</b></div>
          <div class="totals-row"><span>Sisa plafon</span><b :class="{ neg: o.credit.available < o.total }">{{ F.rp(o.credit.available) }}</b></div>
          <div class="totals-row"><span>Sisa setelah pesanan ini</span><b :class="{ neg: o.credit.afterOrder < 0 }">{{ F.rp(o.credit.afterOrder) }}</b></div>
        </div>
      </div>
      <div class="section">
        <span class="section-title">Baris ({{ o.lines.length }})</span>
        <div class="table-scroll"><table class="table">
          <thead><tr><th>Barang / jasa</th><th class="ta-r">Qty</th><th class="ta-r">Harga</th><th class="ta-r">Jumlah</th></tr></thead>
          <tbody><tr v-for="l in o.lines" :key="l.lineNo" class="is-static">
            <td><span class="cell-strong">{{ l.description }}</span><span class="cell-sub"><span class="code">{{ l.sku ?? 'jasa' }}</span> · {{ l.kind }}<template v-if="l.discPct"> · diskon {{ l.discPct }}%</template></span></td>
            <td class="ta-r num">{{ F.int(l.qty) }} {{ l.unit }}</td><td class="ta-r num">{{ F.rp(l.price) }}</td><td class="ta-r num">{{ F.rp(l.net) }}</td>
          </tr></tbody>
        </table></div>
        <div class="totals">
          <div class="totals-row"><span>Subtotal</span><b>{{ F.rp(o.subtotal) }}</b></div>
          <div v-if="o.discount" class="totals-row"><span>Diskon</span><b>− {{ F.rp(o.discount) }}</b></div>
          <div class="totals-row"><span>PPN 11%</span><b>{{ F.rp(o.ppn) }}</b></div>
          <div class="totals-row totals-grand"><span>Total</span><b>{{ F.rp(o.total) }}</b></div>
        </div>
      </div>
      <div v-if="o.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(t, i) in o.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="TIMELINE[t.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ t.actor }}</b> {{ TIMELINE[t.action]?.label ?? t.action }}<template v-if="t.detail?.reason || t.detail?.note"> — “{{ t.detail.reason ?? t.detail.note }}”</template></span><span class="tl-meta">{{ F.datetime(t.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="o">
        <template v-if="o.status === 'menunggu' && canApprove">
          <button class="btn btn-primary" data-action="approve-order" :disabled="busy" @click="approve"><Icon name="check" /> Setujui pesanan</button>
          <button class="btn btn-danger" data-action="reject-order" :disabled="busy" @click="pending = 'reject'; pendingError = ''"><Icon name="x" /> Tolak</button>
        </template>
        <template v-if="['draf', 'ditolak'].includes(o.status) && session.can('sales.order.create')">
          <button v-if="o.status === 'draf'" class="btn btn-primary" data-action="submit-order" :disabled="busy" @click="submit"><Icon name="send" /> Ajukan</button>
          <button class="btn" data-action="edit-order" @click="emit('edit', o)"><Icon name="edit" /> Ubah</button>
        </template>
        <button v-if="['disetujui', 'dikirim'].includes(o.status) && session.can('sales.invoice.create')" class="btn btn-primary" data-action="order-to-invoice" :disabled="busy" @click="toInvoice"><Icon name="invoice" /> Buat faktur</button>
        <div class="toolbar-spacer"></div>
        <button v-if="['draf', 'menunggu', 'disetujui', 'ditolak'].includes(o.status) && (isOwn || session.can('sales.order.approve'))" class="btn btn-ghost neg" data-action="cancel-order" @click="pending = 'cancel'; pendingError = ''">Batalkan</button>
        <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <ReasonModal v-if="pending" :title="pending === 'reject' ? `Tolak pesanan ${o?.docNo}?` : `Batalkan pesanan ${o?.docNo}?`"
    :message="pending === 'reject' ? 'Pembuat dapat mengubah lalu mengajukan kembali pesanan yang ditolak.' : 'Pesanan batal tidak dapat diaktifkan kembali.'"
    :confirm-label="pending === 'reject' ? 'Tolak pesanan' : 'Batalkan pesanan'" danger :busy="busy" :error="pendingError" @close="pending = null" @confirm="confirm" />
</template>
