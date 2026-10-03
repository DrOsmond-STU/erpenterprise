<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { CRM_TIMELINE } from '@/lib/crm';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from './BranchTag.vue';
import Drawer from './Drawer.vue';
import Icon from './Icon.vue';
import Pill from './Pill.vue';
import ReasonModal from './ReasonModal.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: []; changed: []; edit: [doc: any]; openOrder: [id: string]; openOpportunity: [id: string] }>();
const session = useSession();
const toast = useToast();
const q = ref<any>(null);
const busy = ref(false);
const load = async () => { try { q.value = await get(`/crm/quotations/${props.id}`); } catch (e) { toast.error(e, 'Penawaran tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { q.value = null; load(); }, { immediate: true });
defineExpose({ load });
const canEdit = computed(() => session.can('sales.quote.create'));
async function act(fn: () => Promise<any>, msg: string) {
  busy.value = true;
  try { const r = await fn(); toast.push(msg, q.value.docNo, 'ok'); await load(); emit('changed'); return r; } catch (e) { toast.error(e, 'Tindakan gagal'); } finally { busy.value = false; }
}
const send = () => act(() => post(`/crm/quotations/${props.id}/send`), 'Penawaran terkirim');
const accept = () => act(() => post(`/crm/quotations/${props.id}/accept`, {}), 'Penawaran diterima pelanggan');
async function toOrder() {
  const so = await act(() => post(`/crm/quotations/${props.id}/order`, {}), 'Pesanan penjualan dibuat');
  if (so) toast.push(so.status === 'menunggu' ? 'Pesanan menunggu persetujuan (plafon kredit)' : 'Pesanan disetujui otomatis', `${so.docNo} · ${F.rp(so.total)}`, so.status === 'menunggu' ? 'warn' : 'ok');
}
const pending = ref<'reject' | 'cancel' | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  busy.value = true; pendingError.value = '';
  try {
    await post(`/crm/quotations/${props.id}/${pending.value}`, pending.value === 'reject' ? { note: reason } : { reason });
    toast.push(pending.value === 'reject' ? 'Penawaran ditolak pelanggan' : 'Penawaran dibatalkan', q.value.docNo, 'ok'); pending.value = null; await load(); emit('changed');
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
</script>

<template>
  <Drawer :title="q?.customerName ?? 'Memuat…'" :subtitle="q ? `${F.rp(q.total)} · ${F.date(q.date)} · berlaku s.d. ${F.date(q.validUntil)} · ${q.createdByName}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="q"><span class="code">{{ q.docNo }}</span><Pill :status="q.status" /><Pill v-if="q.expired" label="Kedaluwarsa" tone="danger" /><BranchTag :code="q.branch" /></template></template>
    <template v-if="q">
      <div v-if="q.expired" class="section" style="background:var(--warn-soft)" data-expired><span class="setting-name">Masa berlaku lewat</span><span class="setting-note">Perpanjang masa berlaku (dengan persetujuan pelanggan) sebelum dikirim atau dicatat diterima.</span></div>
      <div v-if="q.status === 'diterima' && !q.salesOrderNo" class="section" style="background:var(--ok-soft, var(--surface-2))" data-accepted><span class="setting-name">Diterima pelanggan</span><span class="setting-note">Konversi menjadi pesanan penjualan; plafon kredit pelanggan diperiksa saat diajukan.</span></div>
      <div v-if="q.status === 'ditolak'" class="section" style="background:var(--danger-soft)"><span class="setting-name">Ditolak pelanggan</span><span class="setting-note">{{ q.decisionNote }}</span></div>
      <div class="section">
        <span class="section-title">Rincian</span>
        <dl class="deflist">
          <dt v-if="q.opportunityCode">Peluang</dt><dd v-if="q.opportunityCode"><a href="#" class="code" @click.prevent="emit('openOpportunity', q.opportunityId)">{{ q.opportunityCode }}</a> {{ q.opportunityName }}</dd>
          <dt v-if="q.salesOrderNo">Pesanan penjualan</dt><dd v-if="q.salesOrderNo"><a href="#" class="code" data-link="so" @click.prevent="emit('openOrder', q.salesOrderId)">{{ q.salesOrderNo }}</a> <Pill :status="q.salesOrderStatus" /></dd>
          <dt v-if="q.terms">Syarat</dt><dd v-if="q.terms">{{ q.terms }}</dd>
          <dt v-if="q.sentAt">Dikirim</dt><dd v-if="q.sentAt">{{ q.sentByName }} · {{ F.datetime(q.sentAt) }}</dd>
          <dt v-if="q.decidedAt">Diputus</dt><dd v-if="q.decidedAt">{{ q.decidedByName }} · {{ F.datetime(q.decidedAt) }}</dd>
        </dl>
      </div>
      <div class="section">
        <span class="section-title">Baris ({{ q.lines.length }})</span>
        <div class="table-scroll"><table class="table" data-table="quote-lines">
          <thead><tr><th>Barang / jasa</th><th class="ta-r">Qty</th><th class="ta-r">Harga</th><th class="ta-r">Jumlah</th></tr></thead>
          <tbody><tr v-for="l in q.lines" :key="l.lineNo" class="is-static">
            <td><span class="cell-strong">{{ l.description }}</span><span class="cell-sub"><span v-if="l.sku" class="code">{{ l.sku }}</span> {{ l.kind }}<template v-if="l.discPct"> · diskon {{ l.discPct }}%</template></span></td>
            <td class="ta-r num">{{ F.int(l.qty) }} {{ l.unit }}</td><td class="ta-r num">{{ F.rp(l.price) }}</td><td class="ta-r num">{{ F.rp(l.net) }}</td>
          </tr></tbody>
        </table></div>
        <div class="totals">
          <div class="totals-row"><span>DPP</span><b>{{ F.rp(q.net) }}</b></div><div class="totals-row"><span>PPN 11%</span><b>{{ F.rp(q.ppn) }}</b></div>
          <div class="totals-row totals-grand"><span>Total</span><b>{{ F.rp(q.total) }}</b></div>
        </div>
      </div>
      <div v-if="q.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline"><div v-for="(t, i) in q.timeline" :key="i" class="tl-item">
          <span class="tl-rail"><i class="tl-node" :data-tone="CRM_TIMELINE[t.action]?.tone || undefined"></i><i class="tl-line"></i></span>
          <span class="tl-body"><span class="tl-title"><b>{{ t.actor }}</b> {{ CRM_TIMELINE[t.action]?.label ?? t.action }}<template v-if="t.detail?.order"> {{ t.detail.order }}</template><template v-if="t.detail?.reason || t.detail?.note"> — “{{ t.detail.reason ?? t.detail.note }}”</template></span><span class="tl-meta">{{ F.datetime(t.at) }}</span></span>
        </div></div>
      </div>
    </template>
    <template #foot>
      <template v-if="q && canEdit">
        <template v-if="q.status === 'draf'">
          <button class="btn btn-primary" data-action="send-quote" :disabled="busy || q.expired" @click="send"><Icon name="send" /> Kirim ke pelanggan</button>
          <button class="btn" data-action="edit-quote" @click="emit('edit', q)"><Icon name="edit" /> Ubah</button>
        </template>
        <template v-if="q.status === 'terkirim'">
          <button class="btn btn-primary" data-action="accept-quote" :disabled="busy || q.expired" @click="accept"><Icon name="check" /> Diterima</button>
          <button class="btn btn-danger" data-action="reject-quote" :disabled="busy" @click="pending = 'reject'; pendingError = ''"><Icon name="x" /> Ditolak</button>
          <button class="btn" data-action="extend-quote" @click="emit('edit', q)"><Icon name="calendar" /> Perpanjang</button>
        </template>
        <button v-if="q.status === 'diterima' && (!q.salesOrderId || q.salesOrderStatus === 'batal') && session.can('sales.order.create')" class="btn btn-primary" data-action="quote-to-so" :disabled="busy" @click="toOrder"><Icon name="cart" /> Jadikan pesanan penjualan</button>
        <div class="toolbar-spacer"></div>
        <button v-if="['draf', 'terkirim'].includes(q.status)" class="btn btn-ghost neg" data-action="cancel-quote" @click="pending = 'cancel'; pendingError = ''">Batalkan</button>
      </template>
      <div v-else class="toolbar-spacer"></div>
      <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
    </template>
  </Drawer>
  <ReasonModal v-if="pending" :title="pending === 'reject' ? `Penawaran ${q?.docNo} ditolak pelanggan?` : `Batalkan ${q?.docNo}?`" :message="pending === 'reject' ? 'Catat alasan penolakan untuk evaluasi; peluang dapat dilanjutkan dengan penawaran revisi.' : 'Penawaran batal tidak dapat dikirim lagi.'"
    :confirm-label="pending === 'reject' ? 'Catat ditolak' : 'Batalkan'" danger :busy="busy" :error="pendingError" @close="pending = null" @confirm="confirm" />
</template>
