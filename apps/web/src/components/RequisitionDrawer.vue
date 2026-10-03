<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { PROCUREMENT_TIMELINE, slaText } from '@/lib/procurement';
import { todayWib } from '@/lib/sales';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from './BranchTag.vue';
import Drawer from './Drawer.vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import Pill from './Pill.vue';
import ReasonModal from './ReasonModal.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: []; changed: []; edit: [doc: any]; openRfq: [id: string]; openOrder: [id: string] }>();
const session = useSession();
const ctx = useContext();
const toast = useToast();
const r = ref<any>(null);
const busy = ref(false);
const load = async () => { try { r.value = await get(`/purchasing/requisitions/${props.id}`); } catch (e) { toast.error(e, 'Permintaan tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { r.value = null; load(); }, { immediate: true });

const isOwn = computed(() => r.value?.createdBy === session.user?.id);
const canDecide = computed(() => session.can('purchasing.requisition.approve') && !isOwn.value);
const activeRfq = computed(() => r.value?.rfqs.find((q: any) => q.status === 'terbuka'));
const convertible = computed(() => r.value?.status === 'disetujui' && !r.value.orderId);

async function act(fn: () => Promise<any>, msg: string) {
  busy.value = true;
  try { await fn(); toast.push(msg, r.value.docNo, 'ok'); await load(); emit('changed'); }
  catch (e) { toast.error(e, 'Tindakan gagal'); } finally { busy.value = false; }
}
const submit = () => act(() => post(`/purchasing/requisitions/${props.id}/submit`), 'Permintaan diajukan');
const approve = () => act(() => post(`/purchasing/requisitions/${props.id}/approve`, {}), 'Permintaan disetujui');

const pending = ref<'reject' | 'cancel' | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  busy.value = true; pendingError.value = '';
  try {
    await post(`/purchasing/requisitions/${props.id}/${pending.value}`, pending.value === 'reject' ? { note: reason } : { reason });
    toast.push(pending.value === 'reject' ? 'Permintaan ditolak' : 'Permintaan dibatalkan', r.value.docNo, 'ok');
    pending.value = null; await load(); emit('changed');
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}

/* PO langsung & RFQ */
const suppliers = ref<any[]>([]);
const loadSuppliers = async () => { if (!suppliers.value.length) suppliers.value = (await get('/purchasing/suppliers')).filter((s: any) => !['diblokir', 'nonaktif'].includes(s.status)); };
const showOrder = ref(false);
const orderForm = ref<{ supplierId: string; orderDate: string; prices: Record<number, number> }>({ supplierId: '', orderDate: todayWib(), prices: {} });
const orderErrors = ref<string[]>([]);
async function openOrder() {
  orderErrors.value = []; await loadSuppliers();
  orderForm.value = { supplierId: '', orderDate: todayWib() < r.value.date ? r.value.date : todayWib(), prices: Object.fromEntries(r.value.lines.map((l: any) => [l.lineNo, l.estPrice])) };
  showOrder.value = true;
}
const orderNet = computed(() => r.value ? r.value.lines.reduce((t: number, l: any) => t + Math.round(l.qty * (Number(orderForm.value.prices[l.lineNo]) || 0)), 0) : 0);
async function saveOrder() {
  orderErrors.value = []; busy.value = true;
  try {
    const po = await post(`/purchasing/requisitions/${props.id}/order`, { supplierId: orderForm.value.supplierId || undefined, orderDate: orderForm.value.orderDate,
      prices: Object.entries(orderForm.value.prices).map(([lineNo, price]) => ({ lineNo: Number(lineNo), price: Math.round(Number(price) || 0) })) });
    toast.push(po.status === 'menunggu' ? 'PO dibuat — menunggu persetujuan' : 'PO dibuat & disetujui otomatis', `${po.docNo} · ${F.rp(po.total)}`, po.status === 'menunggu' ? 'warn' : 'ok');
    showOrder.value = false; await load(); emit('changed');
  } catch (e) { orderErrors.value = errorList(e); } finally { busy.value = false; }
}

const showRfq = ref(false);
const rfqForm = ref<{ title: string; deadline: string; supplierIds: string[] }>({ title: '', deadline: '', supplierIds: [] });
const rfqErrors = ref<string[]>([]);
async function openRfqForm() {
  rfqErrors.value = []; await loadSuppliers();
  const d = new Date(Date.now() + 7 * 3_600_000 + 5 * 86_400_000).toISOString().slice(0, 10);
  rfqForm.value = { title: r.value.description, deadline: d, supplierIds: [] };
  showRfq.value = true;
}
async function saveRfq() {
  rfqErrors.value = []; busy.value = true;
  try {
    const q = await post('/purchasing/rfqs', { requisitionId: props.id, title: rfqForm.value.title || undefined, deadline: rfqForm.value.deadline, supplierIds: rfqForm.value.supplierIds });
    toast.push('RFQ dibuat', `${q.docNo} · ${q.quotes.length} pemasok diundang`, 'ok');
    showRfq.value = false; await load(); emit('changed'); emit('openRfq', q.id);
  } catch (e) { rfqErrors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <Drawer :title="r?.description ?? 'Memuat…'" :subtitle="r ? `${r.department} · ${r.requesterName} · perkiraan ${F.rp(r.estimatedTotal)}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="r"><span class="code">{{ r.docNo }}</span><Pill :status="r.status" /><Pill :status="r.priority" /><BranchTag :code="r.branch" /></template></template>
    <template v-if="r">
      <div v-if="r.status === 'menunggu'" class="section" :style="r.slaOverdue ? 'background:var(--danger-soft)' : 'background:var(--warn-soft);border-bottom:1px solid var(--warn-line)'" data-decision>
        <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" :data-tone="r.slaOverdue ? 'danger' : 'warn'"><Icon name="clock" /></span>
          <div class="setting-text"><span class="setting-name">{{ canDecide ? 'Perlu keputusan Anda' : 'Menunggu persetujuan' }} — SLA {{ slaText(r.slaDueAt) }}</span>
            <span class="setting-note">Batas keputusan {{ F.datetime(r.slaDueAt) }} (prioritas {{ r.priority }}).</span>
            <span v-if="isOwn" class="setting-note">Anda pemohon; persetujuan harus oleh orang lain.</span></div></div>
      </div>
      <div v-if="r.status === 'ditolak'" class="section" style="background:var(--danger-soft)"><span class="setting-name">Ditolak oleh {{ r.decidedByName }}</span><span class="setting-note">{{ r.decisionNote }} — ubah lalu ajukan kembali, atau batalkan.</span></div>
      <div v-if="convertible" class="section" style="background:var(--info-soft, var(--surface-2))" data-next>
        <span class="setting-name">{{ activeRfq ? `Dalam RFQ ${activeRfq.docNo}` : 'Disetujui — siap diproses pembelian' }}</span>
        <span class="setting-note">{{ activeRfq ? `${activeRfq.received}/${activeRfq.invited} penawaran masuk · batas ${F.date(activeRfq.deadline)}. Pilih pemenang di RFQ untuk membuat PO.` : 'Buat RFQ ke minimal dua pemasok untuk membandingkan harga, atau PO langsung ke satu pemasok.' }}</span>
      </div>
      <div class="section">
        <span class="section-title">Rincian permintaan</span>
        <dl class="deflist">
          <dt>Cabang</dt><dd>{{ ctx.nameOf(r.branch) }}</dd>
          <dt>Pemohon</dt><dd>{{ r.requesterName }} · {{ r.department }}<span v-if="r.createdByName !== r.requesterName" class="muted"> (dicatat {{ r.createdByName }})</span></dd>
          <dt>Tanggal</dt><dd class="num">{{ F.date(r.date) }}<template v-if="r.neededDate"> · dibutuhkan {{ F.date(r.neededDate) }}</template></dd>
          <dt v-if="r.decidedByName">Diputus</dt><dd v-if="r.decidedByName">{{ r.decidedByName }} · {{ F.datetime(r.decidedAt) }}<template v-if="r.decisionNote && r.status !== 'ditolak'"> — “{{ r.decisionNote }}”</template></dd>
          <dt v-if="r.orderNo">Pesanan pembelian</dt><dd v-if="r.orderNo"><a href="#" class="code" data-link="po" @click.prevent="emit('openOrder', r.orderId)">{{ r.orderNo }}</a> <Pill :status="r.orderStatus" /></dd>
          <dt v-if="r.notes">Catatan</dt><dd v-if="r.notes">{{ r.notes }}</dd>
        </dl>
      </div>
      <div class="section">
        <span class="section-title">Baris ({{ r.lines.length }})</span>
        <div class="table-scroll"><table class="table" data-table="pr-lines">
          <thead><tr><th>Barang / jasa</th><th class="ta-r">Qty</th><th class="ta-r">Harga perkiraan</th><th class="ta-r">Jumlah</th></tr></thead>
          <tbody><tr v-for="l in r.lines" :key="l.id" class="is-static">
            <td><span class="cell-strong">{{ l.description }}</span><span class="cell-sub"><span class="code">{{ l.sku ?? l.expenseAccount }}</span> · {{ l.kind }}</span></td>
            <td class="ta-r num">{{ F.int(l.qty) }} {{ l.unit }}</td><td class="ta-r num">{{ F.rp(l.estPrice) }}</td><td class="ta-r num">{{ F.rp(l.estTotal) }}</td>
          </tr></tbody>
        </table></div>
        <div class="totals"><div class="totals-row totals-grand"><span>Perkiraan nilai (sebelum PPN)</span><b>{{ F.rp(r.estimatedTotal) }}</b></div></div>
      </div>
      <div v-if="r.rfqs.length" class="section">
        <span class="section-title">RFQ ({{ r.rfqs.length }})</span>
        <div class="table-scroll"><table class="table" data-table="pr-rfqs"><tbody>
          <tr v-for="q in r.rfqs" :key="q.id" data-row @click="emit('openRfq', q.id)">
            <td class="code cell-strong">{{ q.docNo }}</td><td class="num">{{ F.date(q.date) }}</td><td>{{ q.received }}/{{ q.invited }} penawaran<span v-if="q.bestSupplier" class="cell-sub">terbaik {{ q.bestSupplier }} · {{ F.rp(q.bestTotal) }}</span></td><td><Pill :status="q.status" /></td>
          </tr>
        </tbody></table></div>
      </div>
      <div v-if="r.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(t, i) in r.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="PROCUREMENT_TIMELINE[t.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ t.actor }}</b> {{ PROCUREMENT_TIMELINE[t.action]?.label ?? t.action }}<template v-if="t.detail?.order"> {{ t.detail.order }}</template><template v-if="t.detail?.rfq && !t.detail?.order"> {{ t.detail.rfq }}</template><template v-if="t.detail?.reason || t.detail?.note"> — “{{ t.detail.reason ?? t.detail.note }}”</template></span><span class="tl-meta">{{ F.datetime(t.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="r">
        <template v-if="r.status === 'menunggu' && canDecide">
          <button class="btn btn-primary" data-action="approve-pr" :disabled="busy" @click="approve"><Icon name="check" /> Setujui</button>
          <button class="btn btn-danger" data-action="reject-pr" :disabled="busy" @click="pending = 'reject'; pendingError = ''"><Icon name="x" /> Tolak</button>
        </template>
        <template v-if="['draf', 'ditolak'].includes(r.status) && isOwn">
          <button v-if="r.status === 'draf'" class="btn btn-primary" data-action="submit-pr" :disabled="busy" @click="submit"><Icon name="send" /> Ajukan</button>
          <button class="btn" data-action="edit-pr" @click="emit('edit', r)"><Icon name="edit" /> Ubah</button>
        </template>
        <template v-if="convertible && !activeRfq">
          <button v-if="session.can('purchasing.rfq.manage')" class="btn btn-primary" data-action="pr-to-rfq" :disabled="busy" @click="openRfqForm"><Icon name="users" /> Buat RFQ</button>
          <button v-if="session.can('purchasing.order.create')" class="btn" data-action="pr-to-po" :disabled="busy" @click="openOrder"><Icon name="cart" /> PO langsung</button>
        </template>
        <button v-if="activeRfq" class="btn btn-primary" data-action="open-rfq" @click="emit('openRfq', activeRfq.id)"><Icon name="users" /> Buka {{ activeRfq.docNo }}</button>
        <div class="toolbar-spacer"></div>
        <button v-if="['draf', 'menunggu', 'disetujui', 'ditolak'].includes(r.status) && !activeRfq && !r.orderId && (isOwn || session.can('purchasing.requisition.approve'))" class="btn btn-ghost neg" data-action="cancel-pr" @click="pending = 'cancel'; pendingError = ''">Batalkan</button>
        <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <Modal v-if="showOrder && r" :title="`PO langsung dari ${r.docNo}`" subtitle="Tanpa pembanding harga. PO mengikuti alur biasa: di atas batas persetujuan menunggu manajer; penerimaan barang menjurnal persediaan / barang diterima belum ditagih." width="720px" @close="showOrder = false">
    <div class="form-grid">
      <div class="field"><label for="po-sup">Pemasok</label>
        <select id="po-sup" v-model="orderForm.supplierId" class="select" data-field="supplier"><option value="" disabled>— Pilih pemasok —</option>
          <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.code }} · {{ s.name }}{{ s.status === 'pantau' ? ' (dipantau)' : '' }}</option></select></div>
      <div class="field"><label for="po-date">Tanggal PO</label><input id="po-date" v-model="orderForm.orderDate" class="input" type="date" :min="r.date"></div>
      <div class="field form-grid-full">
        <div class="table-scroll"><table class="table" data-table="po-prices">
          <thead><tr><th>Barang / jasa</th><th class="ta-r">Qty</th><th class="ta-r">Harga PO</th></tr></thead>
          <tbody><tr v-for="l in r.lines" :key="l.id" class="is-static">
            <td><span class="cell-strong">{{ l.description }}</span><span class="cell-sub code">{{ l.sku ?? l.expenseAccount }}</span></td><td class="ta-r num">{{ F.int(l.qty) }} {{ l.unit }}</td>
            <td class="ta-r"><input v-model.number="orderForm.prices[l.lineNo]" class="input num" type="number" min="0" step="1000" style="width:140px;text-align:right" :aria-label="`Harga ${l.description}`"></td>
          </tr></tbody>
        </table></div>
        <div class="totals"><div class="totals-row totals-grand"><span>DPP PO</span><b>{{ F.rp(orderNet) }}</b></div></div>
      </div>
      <div v-if="orderErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in orderErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-pr-po" :disabled="busy || !orderForm.supplierId" @click="saveOrder"><Icon name="check" /> Buat & ajukan PO</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showOrder = false">Batal</button>
    </template>
  </Modal>
  <Modal v-if="showRfq && r" :title="`RFQ untuk ${r.docNo}`" subtitle="Undang minimal dua pemasok. Penawaran dicatat per pemasok; harga terbaik = total terendah. Memilih selain harga terbaik wajib beralasan." width="640px" @close="showRfq = false">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="rfq-title">Judul</label><input id="rfq-title" v-model="rfqForm.title" class="input" maxlength="200"></div>
      <div class="field"><label for="rfq-deadline">Batas penawaran</label><input id="rfq-deadline" v-model="rfqForm.deadline" class="input" type="date" :min="todayWib()" data-field="deadline"></div>
      <div class="field"><label>Dipilih</label><span class="setting-name" data-rfq-count>{{ rfqForm.supplierIds.length }} pemasok</span></div>
      <div class="field form-grid-full"><label>Pemasok diundang</label>
        <div class="table-scroll" style="max-height:280px"><table class="table" data-table="rfq-suppliers"><tbody>
          <tr v-for="s in suppliers" :key="s.id" class="is-static">
            <td style="width:32px"><input v-model="rfqForm.supplierIds" type="checkbox" :value="s.id" :aria-label="s.name" data-field="rfq-supplier"></td>
            <td><span class="cell-strong">{{ s.name }}</span><span class="cell-sub">{{ s.code }} · {{ s.category ?? '—' }} · kirim {{ s.leadDays }} hari</span></td>
            <td><Pill v-if="s.status !== 'aktif'" :status="s.status" /></td>
          </tr>
        </tbody></table></div></div>
      <div v-if="rfqErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in rfqErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-rfq" :disabled="busy || rfqForm.supplierIds.length < 2" @click="saveRfq"><Icon name="send" /> Kirim RFQ</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showRfq = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="pending" :title="pending === 'reject' ? `Tolak ${r?.docNo}?` : `Batalkan ${r?.docNo}?`"
    :message="pending === 'reject' ? 'Pemohon dapat mengubah lalu mengajukan kembali permintaan yang ditolak.' : 'Permintaan batal tidak dapat diaktifkan kembali.'"
    :confirm-label="pending === 'reject' ? 'Tolak' : 'Batalkan permintaan'" danger :busy="busy" :error="pendingError" @close="pending = null" @confirm="confirm" />
</template>
