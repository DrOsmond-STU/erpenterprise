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
const emit = defineEmits<{ close: []; changed: []; edit: [doc: any]; openOrder: [id: string]; openPayment: [id: string] }>();
const session = useSession();
const ctx = useContext();
const toast = useToast();
const inv = ref<any>(null);
const busy = ref(false);
const load = async () => { try { inv.value = await get(`/purchasing/invoices/${props.id}`); } catch (e) { toast.error(e, 'Tagihan tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { inv.value = null; load(); }, { immediate: true });
const isOwn = computed(() => inv.value?.createdBy === session.user?.id);
const payable = computed(() => inv.value && ['belum-dibayar', 'sebagian'].includes(inv.value.status) && inv.value.open - (inv.value.pendingPayments ?? 0) > 0);

async function postInvoice() {
  busy.value = true;
  try { await post(`/purchasing/invoices/${props.id}/post`); toast.push('Tagihan diposting', `${inv.value.docNo} · jurnal utang usaha diposting`, 'ok'); await load(); emit('changed'); }
  catch (e) { toast.error(e, 'Tagihan tidak dapat diposting'); } finally { busy.value = false; }
}

/* Pengajuan pembayaran */
const showPay = ref(false);
const banks = ref<any[]>([]);
const threshold = ref(0);
const pay = ref({ date: todayWib(), amount: 0, bankAccount: '', method: 'transfer', reference: '' });
const payErrors = ref<string[]>([]);
async function openPay() {
  payErrors.value = [];
  try {
    const [b, st] = await Promise.all([get('/ledger/bank-accounts'), get('/settings').catch(() => ({ policies: {} }))]);
    banks.value = (b.accounts ?? []).filter((x: any) => x.branchCode === inv.value.branch && x.status === 'aktif' && x.currency === 'IDR');
    threshold.value = st.policies?.paymentDualApprovalThreshold ?? 0;
  } catch (e) { toast.error(e, 'Rekening tidak dapat dimuat'); return; }
  pay.value = { date: todayWib() < inv.value.date ? inv.value.date : todayWib(), amount: inv.value.open - (inv.value.pendingPayments ?? 0), bankAccount: banks.value.find((b: any) => b.bankName !== 'Kas')?.code ?? banks.value[0]?.code ?? '', method: 'transfer', reference: '' };
  showPay.value = true;
}
const approvalsNeeded = computed(() => (threshold.value > 0 && Number(pay.value.amount) > threshold.value ? 2 : 1));
async function savePay() {
  payErrors.value = []; busy.value = true;
  try {
    const r = await post('/purchasing/payments', { invoiceId: props.id, ...pay.value, amount: Math.round(Number(pay.value.amount)), reference: pay.value.reference || undefined });
    toast.push('Pembayaran diajukan', `${r.docNo} · ${F.rp(r.amount)} — perlu ${r.requiredApprovals} penyetuju`, 'ok');
    showPay.value = false; await load(); emit('changed');
  } catch (e) { payErrors.value = errorList(e); } finally { busy.value = false; }
}

const cancelling = ref(false);
const cancelError = ref('');
async function cancel(reason: string) {
  busy.value = true; cancelError.value = '';
  try { await post(`/purchasing/invoices/${props.id}/cancel`, { reason }); toast.push('Tagihan dibatalkan', inv.value.docNo, 'ok'); cancelling.value = false; await load(); emit('changed'); }
  catch (e) { cancelError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const canCancel = computed(() => inv.value && inv.value.status !== 'batal' && (inv.value.status === 'draf' ? ((isOwn.value && session.can('purchasing.invoice.create')) || session.can('purchasing.invoice.post')) : session.can('purchasing.invoice.post') && inv.value.paid === 0));
const journalId = ref<string | null>(null);
</script>

<template>
  <Drawer :title="inv?.supplierName ?? 'Memuat…'" :subtitle="inv ? `${F.rp(inv.total)} · ${F.date(inv.date)} · jatuh tempo ${F.date(inv.dueDate)}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="inv"><span class="code">{{ inv.docNo }}</span><Pill :status="inv.isOverdue ? 'jatuh-tempo' : inv.status" /><BranchTag :code="inv.branch" /><Pill v-if="inv.orderId" :tone="inv.threeWayMatched ? 'ok' : 'warn'" :label="inv.threeWayMatched ? 'Cocok 3 arah' : 'Belum cocok 3 arah'" /></template></template>
    <template v-if="inv">
      <div v-if="inv.status === 'draf'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)">
        <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" data-tone="warn"><Icon name="alert" /></span>
          <div class="setting-text"><span class="setting-name">Draf — belum memengaruhi buku besar</span>
            <span class="setting-note">{{ isOwn ? 'Anda pembuat tagihan ini; posting harus oleh orang lain (kontrol empat mata).' : 'Posting mendebit barang diterima belum ditagih / akun biaya dan PPN masukan, serta mengkredit utang usaha.' }}</span></div></div>
      </div>
      <div v-if="inv.isOverdue" class="section" style="background:var(--danger-soft)"><span class="setting-name neg">Lewat jatuh tempo {{ inv.overdueDays }} hari</span><span class="setting-note">Sisa hutang {{ F.rp(inv.open) }}.</span></div>
      <div class="section">
        <span class="section-title">Rincian tagihan</span>
        <dl class="deflist">
          <dt>Pemasok</dt><dd>{{ inv.supplierCode ?? '' }} {{ inv.supplierName }}</dd>
          <dt>No. tagihan pemasok</dt><dd class="code">{{ inv.supplierInvoiceNo ?? '—' }}</dd>
          <dt>Cabang</dt><dd>{{ ctx.nameOf(inv.branch) }}</dd>
          <dt>Tanggal</dt><dd class="num">{{ F.date(inv.date) }}</dd>
          <dt>Jatuh tempo</dt><dd class="num">{{ F.date(inv.dueDate) }}</dd>
          <dt v-if="inv.orderNo">PO</dt><dd v-if="inv.orderNo"><a v-if="inv.orderId" href="#" class="code" data-action="open-po" @click.prevent="emit('openOrder', inv.orderId)">{{ inv.orderNo }}</a><span v-else class="code">{{ inv.orderNo }}</span></dd>
          <dt>Dibuat</dt><dd>{{ inv.createdByName }}</dd>
          <dt v-if="inv.postedByName">Diposting</dt><dd v-if="inv.postedByName">{{ inv.postedByName }}<template v-if="inv.postedAt"> · {{ F.datetime(inv.postedAt) }}</template></dd>
          <dt v-if="inv.cancelReason">Dibatalkan</dt><dd v-if="inv.cancelReason">{{ inv.cancelDate ? F.date(inv.cancelDate) + ' — ' : '' }}{{ inv.cancelReason }}</dd>
          <dt v-if="inv.notes">Catatan</dt><dd v-if="inv.notes">{{ inv.notes }}</dd>
        </dl>
      </div>
      <div class="section">
        <span class="section-title">Baris ({{ inv.lines.length }})</span>
        <div class="table-scroll"><table class="table" data-table="ap-lines">
          <thead><tr><th>Uraian</th><th>Akun didebit</th><th class="ta-r">Qty</th><th class="ta-r">Harga</th><th class="ta-r">Jumlah</th></tr></thead>
          <tbody><tr v-for="l in inv.lines" :key="l.lineNo" class="is-static">
            <td><span class="cell-strong">{{ l.description }}</span><span class="cell-sub"><span class="code">{{ l.sku ?? l.kind }}</span></span></td><td class="code">{{ l.account }}</td>
            <td class="ta-r num">{{ F.int(l.qty) }} {{ l.unit }}</td><td class="ta-r num">{{ F.rp(l.price) }}</td><td class="ta-r num">{{ F.rp(l.net) }}</td>
          </tr></tbody>
        </table></div>
        <div class="totals">
          <div class="totals-row"><span>DPP</span><b>{{ F.rp(inv.net) }}</b></div>
          <div class="totals-row"><span>PPN masukan 11%</span><b>{{ F.rp(inv.ppn) }}</b></div>
          <div class="totals-row totals-grand"><span>Total</span><b>{{ F.rp(inv.total) }}</b></div>
          <div class="totals-row"><span>Dibayar</span><b>{{ F.rp(inv.paid) }}</b></div>
          <div v-if="inv.pendingPayments" class="totals-row"><span>Pembayaran dalam proses</span><b>{{ F.rp(inv.pendingPayments) }}</b></div>
          <div class="totals-row"><span>Sisa hutang</span><b :class="{ neg: inv.isOverdue }" data-open>{{ F.rp(inv.open) }}</b></div>
        </div>
      </div>
      <div v-if="inv.receipts.length" class="section">
        <span class="section-title">Penerimaan barang yang ditagih ({{ inv.receipts.length }})</span>
        <div class="table-scroll"><table class="table"><tbody>
          <tr v-for="g in inv.receipts" :key="g.id" class="is-static"><td class="code">{{ g.docNo }}</td><td class="num">{{ F.date(g.date) }}</td><td class="ta-r num">{{ F.rp(g.value) }}</td></tr>
        </tbody></table></div>
      </div>
      <div v-if="inv.payments.length" class="section">
        <span class="section-title">Pembayaran ({{ inv.payments.length }})</span>
        <div class="table-scroll"><table class="table" data-table="ap-payments"><tbody>
          <tr v-for="p in inv.payments" :key="p.id" data-row @click="emit('openPayment', p.id)"><td class="code cell-strong">{{ p.docNo }}</td><td class="num">{{ F.date(p.date) }}</td>
            <td>{{ p.bankName ?? p.bankAccount }}<span class="cell-sub">{{ p.approvals.length }}/{{ p.requiredApprovals }} persetujuan</span></td><td class="ta-r num">{{ F.rp(p.amount) }}</td><td><Pill :status="p.status" /></td></tr>
        </tbody></table></div>
      </div>
      <div v-if="inv.journals.length && session.can('ledger.journal.read')" class="section">
        <span class="section-title">Jurnal terkait ({{ inv.journals.length }})</span>
        <div class="table-scroll"><table class="table" data-table="ap-journals">
          <tbody><tr v-for="j in inv.journals" :key="j.id" data-row @click="journalId = j.id"><td class="code cell-strong">{{ j.journalNo }}</td><td>{{ j.description }}<span class="cell-sub">{{ F.date(j.date) }} · {{ j.rule }}</span></td><td class="ta-r num">{{ F.rp(j.total) }}</td><td><Pill :status="j.status" /></td></tr></tbody>
        </table></div>
      </div>
      <div v-if="inv.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(t, i) in inv.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="PURCHASE_TIMELINE[t.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ t.actor }}</b> {{ PURCHASE_TIMELINE[t.action]?.label ?? t.action }}<template v-if="t.detail?.reason"> — “{{ t.detail.reason }}”</template></span><span class="tl-meta">{{ F.datetime(t.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="inv">
        <button v-if="inv.status === 'draf' && session.can('purchasing.invoice.post') && !isOwn" class="btn btn-primary" data-action="post-ap-invoice" :disabled="busy" @click="postInvoice"><Icon name="check" /> Posting tagihan</button>
        <button v-if="inv.status === 'draf' && !inv.orderId && session.can('purchasing.invoice.create')" class="btn" data-action="edit-ap-invoice" @click="emit('edit', inv)"><Icon name="edit" /> Ubah</button>
        <button v-if="payable && session.can('purchasing.payment.create')" class="btn btn-primary" data-action="new-payment" :disabled="busy" @click="openPay"><Icon name="send" /> Ajukan pembayaran</button>
        <div class="toolbar-spacer"></div>
        <button v-if="canCancel" class="btn btn-ghost neg" data-action="cancel-ap-invoice" @click="cancelling = true; cancelError = ''">Batalkan</button>
        <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <Modal v-if="showPay && inv" :title="`Ajukan pembayaran ${inv.docNo}`" :subtitle="`${inv.supplierName} · sisa ${F.rp(inv.open - (inv.pendingPayments ?? 0))}. Pembayaran dieksekusi setelah disetujui; jurnal utang ↔ bank diposting saat dibayar.`" width="540px" @close="showPay = false">
    <div class="form-grid">
      <div class="field"><label for="pay-date">Rencana tanggal bayar</label><input id="pay-date" v-model="pay.date" class="input" type="date" :min="inv.date"></div>
      <div class="field"><label for="pay-amount">Nilai (Rp)</label><input id="pay-amount" v-model.number="pay.amount" class="input num" type="number" min="1" step="1" style="text-align:right"></div>
      <div class="field form-grid-full"><label for="pay-bank">Rekening sumber ({{ inv.branch }})</label>
        <select id="pay-bank" v-model="pay.bankAccount" class="select"><option v-for="b in banks" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }}</option></select></div>
      <div class="field"><label for="pay-method">Metode</label><select id="pay-method" v-model="pay.method" class="select"><option value="transfer">Transfer</option><option value="tunai">Tunai</option><option value="giro">Giro</option></select></div>
      <div class="field"><label for="pay-ref">Referensi</label><input id="pay-ref" v-model="pay.reference" class="input" maxlength="80" placeholder="Opsional"></div>
      <div class="field form-grid-full"><span class="field-hint" data-approvals-hint><Icon name="shield" /> Memerlukan <b>{{ approvalsNeeded }} penyetuju</b> berbeda (bukan pengaju){{ threshold ? ` — pembayaran di atas ${F.rp(threshold)} wajib dua penyetuju` : '' }}.
        <template v-if="pay.method === 'transfer' && inv.supplier?.bankReadyProblem"><br><span class="neg">{{ inv.supplier.bankReadyProblem }}</span></template></span></div>
      <div v-if="payErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in payErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-payment" :disabled="busy || !pay.bankAccount" @click="savePay"><Icon name="send" /> Ajukan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showPay = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="cancelling && inv" :title="`Batalkan tagihan ${inv.docNo}?`"
    :message="inv.status === 'draf' ? 'Penerimaan barang dilepas dan dapat ditagih ulang.' : 'Jurnal tagihan dibalik per hari ini; penerimaan barang dilepas agar dapat ditagih ulang; pembayaran yang belum dieksekusi ikut batal.'"
    confirm-label="Batalkan tagihan" danger :busy="busy" :error="cancelError" @close="cancelling = false" @confirm="cancel" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" @changed="journalId = null; load()" />
</template>
