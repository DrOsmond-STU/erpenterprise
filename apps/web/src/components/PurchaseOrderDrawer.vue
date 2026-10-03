<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { PURCHASE_TIMELINE } from '@/lib/purchasing';
import { todayWib } from '@/lib/sales';
import { useContext } from '@/stores/context';
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
const emit = defineEmits<{ close: []; changed: []; edit: [doc: any]; openInvoice: [id: string] }>();
const session = useSession();
const ctx = useContext();
const toast = useToast();
const o = ref<any>(null);
const busy = ref(false);
const load = async () => { try { o.value = await get(`/purchasing/orders/${props.id}`); } catch (e) { toast.error(e, 'PO tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { o.value = null; load(); }, { immediate: true });

const isOwn = computed(() => o.value?.createdBy === session.user?.id);
const canApprove = computed(() => session.can('purchasing.order.approve') && !isOwn.value);
const receivable = computed(() => ['disetujui', 'diterima-sebagian'].includes(o.value?.status) && o.value.lines.some((l: any) => l.kind === 'barang' && l.qtyReceived < l.qty));

async function act(fn: () => Promise<any>, msg: string) {
  busy.value = true;
  try { const r = await fn(); toast.push(msg, o.value.docNo, 'ok'); await load(); emit('changed'); return r; }
  catch (e) { toast.error(e, 'Tindakan gagal'); } finally { busy.value = false; }
}
const submit = () => act(() => post(`/purchasing/orders/${props.id}/submit`), 'PO diajukan');
const approve = () => act(() => post(`/purchasing/orders/${props.id}/approve`, {}), 'PO disetujui');

const pending = ref<'reject' | 'cancel' | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  busy.value = true; pendingError.value = '';
  try {
    await post(`/purchasing/orders/${props.id}/${pending.value}`, pending.value === 'reject' ? { note: reason } : { reason });
    toast.push(pending.value === 'reject' ? 'PO ditolak' : 'PO dibatalkan', o.value.docNo, 'ok');
    pending.value = null; await load(); emit('changed');
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}

/* Penerimaan barang */
const showReceive = ref(false);
const rcv = ref<{ date: string; deliveryNote: string; qty: Record<number, number> }>({ date: todayWib(), deliveryNote: '', qty: {} });
const rcvErrors = ref<string[]>([]);
function openReceive() {
  rcvErrors.value = [];
  rcv.value = { date: todayWib() < o.value.date ? o.value.date : todayWib(), deliveryNote: '', qty: Object.fromEntries(o.value.lines.filter((l: any) => l.kind === 'barang').map((l: any) => [l.id, Math.max(0, l.qty - l.qtyReceived)])) };
  showReceive.value = true;
}
const rcvValue = computed(() => o.value ? o.value.lines.filter((l: any) => l.kind === 'barang').reduce((t: number, l: any) => t + Math.round((l.net * (Number(rcv.value.qty[l.id]) || 0)) / l.qty), 0) : 0);
async function saveReceive() {
  rcvErrors.value = []; busy.value = true;
  try {
    const lines = Object.entries(rcv.value.qty).map(([id, q]) => ({ orderLineId: Number(id), qty: Number(q) || 0 })).filter((l) => l.qty > 0);
    await post(`/purchasing/orders/${props.id}/receive`, { date: rcv.value.date, deliveryNote: rcv.value.deliveryNote || undefined, lines });
    toast.push('Penerimaan barang dicatat', `${o.value.docNo} · stok bertambah, jurnal persediaan diposting`, 'ok');
    showReceive.value = false; await load(); emit('changed');
  } catch (e) { rcvErrors.value = errorList(e); } finally { busy.value = false; }
}

/* Tagihan dari PO */
const showInvoice = ref(false);
const invForm = ref({ invoiceDate: todayWib(), supplierInvoiceNo: '', supplierTotal: '' as string | number });
const invErrors = ref<string[]>([]);
function openInvoiceForm() { invErrors.value = []; invForm.value = { invoiceDate: todayWib(), supplierInvoiceNo: '', supplierTotal: '' }; showInvoice.value = true; }
async function saveInvoice() {
  invErrors.value = []; busy.value = true;
  try {
    const body: any = { orderId: props.id, invoiceDate: invForm.value.invoiceDate };
    if (invForm.value.supplierInvoiceNo) body.supplierInvoiceNo = invForm.value.supplierInvoiceNo;
    if (invForm.value.supplierTotal !== '') body.supplierTotal = Math.round(Number(invForm.value.supplierTotal));
    const r = await post('/purchasing/invoices', body);
    toast.push('Draf tagihan dibuat', `${r.docNo} · ${F.rp(r.total)} — cocok tiga arah`, 'ok');
    showInvoice.value = false; emit('changed'); emit('openInvoice', r.id);
  } catch (e) { invErrors.value = errorList(e); } finally { busy.value = false; }
}
const journalId = ref<string | null>(null);
</script>

<template>
  <Drawer :title="o?.supplierName ?? 'Memuat…'" :subtitle="o ? `${F.rp(o.total)} · ${F.date(o.date)} · dibuat oleh ${o.createdByName}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="o"><span class="code">{{ o.docNo }}</span><Pill :status="o.status" /><BranchTag :code="o.branch" /></template></template>
    <template v-if="o">
      <div v-if="o.status === 'menunggu'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)" data-decision>
        <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" data-tone="warn"><Icon name="alert" /></span>
          <div class="setting-text"><span class="setting-name">{{ canApprove ? 'Perlu keputusan Anda' : 'Menunggu persetujuan manajer' }}</span>
            <span v-for="r in o.approvalReasons" :key="r" class="setting-note">• {{ r }}</span>
            <span v-if="isOwn" class="setting-note">Anda pembuat PO ini; persetujuan harus oleh orang lain.</span></div></div>
      </div>
      <div v-if="o.status === 'ditolak'" class="section" style="background:var(--danger-soft)"><span class="setting-name">Ditolak oleh {{ o.decidedByName }}</span><span class="setting-note">{{ o.decisionNote }} — ubah PO lalu ajukan kembali, atau batalkan.</span></div>
      <div v-if="o.uninvoicedReceipts > 0" class="section" style="background:var(--info-soft, var(--surface-2))" data-uninvoiced>
        <span class="setting-name">Barang diterima belum ditagih {{ F.rp(o.uninvoicedReceipts) }}</span><span class="setting-note">Nilai ini tercatat di akun utang barang diterima belum ditagih sampai tagihan pemasok diposting.</span>
      </div>
      <div class="section">
        <span class="section-title">Rincian PO</span>
        <dl class="deflist">
          <dt>Pemasok</dt><dd>{{ o.supplierCode }} · {{ o.supplierName }} <Pill v-if="o.supplier.status !== 'aktif'" :status="o.supplier.status" /></dd>
          <dt>Cabang</dt><dd>{{ ctx.nameOf(o.branch) }}</dd>
          <dt v-if="o.requisitionNo">Asal</dt><dd v-if="o.requisitionNo" data-po-source><RouterLink class="code" :to="{ path: '/permintaan-pembelian', query: { id: o.requisitionId } }">{{ o.requisitionNo }}</RouterLink><template v-if="o.rfqNo"> · <RouterLink class="code" :to="{ path: '/rfq', query: { id: o.rfqId } }">{{ o.rfqNo }}</RouterLink></template></dd>
          <dt>Tanggal PO</dt><dd class="num">{{ F.date(o.date) }}</dd>
          <dt>Perkiraan tiba</dt><dd class="num">{{ F.date(o.expectedDate) }}</dd>
          <dt>Termin</dt><dd>{{ o.supplier.termsDays ? `Net ${o.supplier.termsDays}` : 'Tunai' }}</dd>
          <dt v-if="o.decidedByName">Diputus</dt><dd v-if="o.decidedByName">{{ o.decidedByName }}<template v-if="o.decidedAt"> · {{ F.datetime(o.decidedAt) }}</template></dd>
          <dt v-if="o.notes">Catatan</dt><dd v-if="o.notes">{{ o.notes }}</dd>
        </dl>
      </div>
      <div class="section">
        <span class="section-title">Baris ({{ o.lines.length }})</span>
        <div class="table-scroll"><table class="table" data-table="po-lines">
          <thead><tr><th>Barang / jasa</th><th class="ta-r">Qty</th><th class="ta-r">Harga</th><th class="ta-r">Jumlah</th><th class="ta-r">Diterima</th><th class="ta-r">Ditagih</th></tr></thead>
          <tbody><tr v-for="l in o.lines" :key="l.id" class="is-static">
            <td><span class="cell-strong">{{ l.description }}</span><span class="cell-sub"><span class="code">{{ l.sku ?? l.expenseAccount }}</span> · {{ l.kind }}<template v-if="l.discPct"> · diskon {{ l.discPct }}%</template></span></td>
            <td class="ta-r num">{{ F.int(l.qty) }} {{ l.unit }}</td><td class="ta-r num">{{ F.rp(l.price) }}</td><td class="ta-r num">{{ F.rp(l.net) }}</td>
            <td class="ta-r num">{{ l.kind === 'barang' ? F.int(l.qtyReceived) : '—' }}</td><td class="ta-r num">{{ F.int(l.qtyInvoiced) }}</td>
          </tr></tbody>
        </table></div>
        <div class="totals">
          <div class="totals-row"><span>DPP</span><b>{{ F.rp(o.net) }}</b></div>
          <div class="totals-row"><span>PPN masukan 11%</span><b>{{ F.rp(o.ppn) }}</b></div>
          <div class="totals-row totals-grand"><span>Total</span><b>{{ F.rp(o.total) }}</b></div>
        </div>
      </div>
      <div v-if="o.receipts.length" class="section">
        <span class="section-title">Penerimaan barang ({{ o.receipts.length }})</span>
        <div class="table-scroll"><table class="table" data-table="po-receipts"><tbody>
          <tr v-for="g in o.receipts" :key="g.id" :data-row="g.journalId ? '' : undefined" :class="{ 'is-static': !g.journalId }" @click="g.journalId && session.can('ledger.journal.read') && (journalId = g.journalId)">
            <td class="code cell-strong">{{ g.docNo }}</td><td class="num">{{ F.date(g.date) }}</td><td>{{ g.warehouse }}<span class="cell-sub">{{ g.createdByName }}{{ g.deliveryNote ? ` · SJ ${g.deliveryNote}` : '' }}</span></td>
            <td class="ta-r num">{{ F.rp(g.value) }}</td><td class="code">{{ g.journalNo ?? '' }}</td></tr>
        </tbody></table></div>
      </div>
      <div v-if="o.invoices.length" class="section">
        <span class="section-title">Tagihan pemasok ({{ o.invoices.length }})</span>
        <div class="table-scroll"><table class="table"><tbody>
          <tr v-for="i in o.invoices" :key="i.id" data-row @click="emit('openInvoice', i.id)"><td class="code cell-strong">{{ i.docNo }}</td><td class="num">{{ F.date(i.date) }}</td><td class="ta-r num">{{ F.rp(i.total) }}</td><td><Pill :status="i.status" /></td></tr>
        </tbody></table></div>
      </div>
      <div v-if="o.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(t, i) in o.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="PURCHASE_TIMELINE[t.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ t.actor }}</b> {{ PURCHASE_TIMELINE[t.action]?.label ?? t.action }}<template v-if="t.detail?.receipt"> {{ t.detail.receipt }} ({{ F.rp(t.detail.value) }})</template><template v-if="t.detail?.reason || t.detail?.note"> — “{{ t.detail.reason ?? t.detail.note }}”</template></span><span class="tl-meta">{{ F.datetime(t.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="o">
        <template v-if="o.status === 'menunggu' && canApprove">
          <button class="btn btn-primary" data-action="approve-po" :disabled="busy" @click="approve"><Icon name="check" /> Setujui PO</button>
          <button class="btn btn-danger" data-action="reject-po" :disabled="busy" @click="pending = 'reject'; pendingError = ''"><Icon name="x" /> Tolak</button>
        </template>
        <template v-if="['draf', 'ditolak'].includes(o.status) && session.can('purchasing.order.create')">
          <button v-if="o.status === 'draf'" class="btn btn-primary" data-action="submit-po" :disabled="busy" @click="submit"><Icon name="send" /> Ajukan</button>
          <button class="btn" data-action="edit-po" @click="emit('edit', o)"><Icon name="edit" /> Ubah</button>
        </template>
        <button v-if="receivable && session.can('purchasing.receipt.create')" class="btn btn-primary" data-action="receive-po" :disabled="busy" @click="openReceive"><Icon name="truck" /> Terima barang</button>
        <button v-if="o.canInvoice && session.can('purchasing.invoice.create')" class="btn" :class="receivable ? '' : 'btn-primary'" data-action="po-to-invoice" :disabled="busy" @click="openInvoiceForm"><Icon name="invoice" /> Buat tagihan</button>
        <div class="toolbar-spacer"></div>
        <button v-if="['draf', 'menunggu', 'disetujui', 'ditolak'].includes(o.status) && !o.receipts.length && !o.invoices.length && ((isOwn && session.can('purchasing.order.create')) || session.can('purchasing.order.approve'))" class="btn btn-ghost neg" data-action="cancel-po" @click="pending = 'cancel'; pendingError = ''">Batalkan</button>
        <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <Modal v-if="showReceive && o" :title="`Terima barang ${o.docNo}`" :subtitle="`${o.supplierName} · stok cabang ${o.branch} bertambah dengan harga PO; jurnal persediaan / barang diterima belum ditagih diposting otomatis.`" width="720px" @close="showReceive = false">
    <div class="form-grid">
      <div class="field"><label for="gr-date">Tanggal terima</label><input id="gr-date" v-model="rcv.date" class="input" type="date" :min="o.date"></div>
      <div class="field"><label for="gr-sj">No. surat jalan</label><input id="gr-sj" v-model="rcv.deliveryNote" class="input code" maxlength="80" placeholder="Opsional"></div>
      <div class="field form-grid-full">
        <div class="table-scroll"><table class="table" data-table="receive-lines">
          <thead><tr><th>Barang</th><th class="ta-r">Dipesan</th><th class="ta-r">Sudah diterima</th><th class="ta-r">Diterima sekarang</th></tr></thead>
          <tbody><tr v-for="l in o.lines.filter((x: any) => x.kind === 'barang')" :key="l.id" class="is-static" :data-line="l.sku">
            <td><span class="cell-strong">{{ l.description }}</span><span class="cell-sub code">{{ l.sku }}</span></td>
            <td class="ta-r num">{{ F.int(l.qty) }} {{ l.unit }}</td><td class="ta-r num">{{ F.int(l.qtyReceived) }}</td>
            <td class="ta-r"><input v-model.number="rcv.qty[l.id]" class="input num" type="number" min="0" :max="l.qty - l.qtyReceived" step="any" style="width:110px;text-align:right" :aria-label="`Diterima ${l.sku}`" data-field="receive-qty"></td>
          </tr></tbody>
        </table></div>
        <div class="totals"><div class="totals-row totals-grand"><span>Nilai penerimaan (harga PO)</span><b data-receive-value>{{ F.rp(rcvValue) }}</b></div></div>
      </div>
      <div v-if="rcvErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in rcvErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-receipt" :disabled="busy || rcvValue <= 0" @click="saveReceive"><Icon name="check" /> Simpan penerimaan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showReceive = false">Batal</button>
    </template>
  </Modal>
  <Modal v-if="showInvoice && o" :title="`Tagihan dari ${o.docNo}`" subtitle="Baris tagihan = barang diterima yang belum ditagih + jasa yang belum ditagih, dengan harga PO. Isi nilai yang tertera di tagihan pemasok untuk pencocokan tiga arah." width="560px" @close="showInvoice = false">
    <div class="form-grid">
      <div class="field"><label for="ai-date">Tanggal tagihan</label><input id="ai-date" v-model="invForm.invoiceDate" class="input" type="date" :min="o.date"></div>
      <div class="field"><label for="ai-no">No. tagihan pemasok</label><input id="ai-no" v-model="invForm.supplierInvoiceNo" class="input code" maxlength="60"></div>
      <div class="field form-grid-full"><label for="ai-total">Nilai tertera di tagihan pemasok (Rp, termasuk PPN)</label><input id="ai-total" v-model="invForm.supplierTotal" class="input num" type="number" min="0" style="text-align:right" placeholder="Opsional — bila diisi harus sama dengan PO × barang diterima">
        <span class="field-hint">Barang diterima belum ditagih: {{ F.rp(o.uninvoicedReceipts) }} (sebelum PPN)</span></div>
      <div v-if="invErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in invErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-po-invoice" :disabled="busy" @click="saveInvoice"><Icon name="check" /> Buat draf tagihan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showInvoice = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="pending" :title="pending === 'reject' ? `Tolak PO ${o?.docNo}?` : `Batalkan PO ${o?.docNo}?`"
    :message="pending === 'reject' ? 'Pembuat dapat mengubah lalu mengajukan kembali PO yang ditolak.' : 'PO batal tidak dapat diaktifkan kembali.'"
    :confirm-label="pending === 'reject' ? 'Tolak PO' : 'Batalkan PO'" danger :busy="busy" :error="pendingError" @close="pending = null" @confirm="confirm" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" @changed="journalId = null; load()" />
</template>
