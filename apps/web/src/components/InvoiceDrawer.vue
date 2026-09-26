<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { TIMELINE, todayWib } from '@/lib/sales';
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
const emit = defineEmits<{ close: []; changed: []; edit: [doc: any]; openOrder: [id: string] }>();
const session = useSession();
const ctx = useContext();
const toast = useToast();
const inv = ref<any>(null);
const busy = ref(false);
const load = async () => { try { inv.value = await get(`/sales/invoices/${props.id}`); } catch (e) { toast.error(e, 'Faktur tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { inv.value = null; load(); }, { immediate: true });
const isOwn = computed(() => inv.value?.createdBy === session.user?.id);
const open = computed(() => ['belum-dibayar', 'sebagian'].includes(inv.value?.status));

async function issue() {
  busy.value = true;
  try { await post(`/sales/invoices/${props.id}/issue`); toast.push('Faktur diterbitkan', `${inv.value.docNo} · jurnal penjualan${inv.value.lines.some((l: any) => l.kind === 'barang') ? ' & HPP' : ''} diposting`, 'ok'); await load(); emit('changed'); }
  catch (e) { toast.error(e, 'Faktur tidak dapat diterbitkan'); } finally { busy.value = false; }
}

/* Penerimaan */
const showReceipt = ref(false);
const banks = ref<any[]>([]);
const rc = ref({ date: todayWib(), amount: 0, bankAccount: '', method: 'transfer', reference: '' });
const rcErrors = ref<string[]>([]);
async function openReceipt() {
  rcErrors.value = [];
  let all: any[] = [];
  try { all = (await get('/ledger/bank-accounts')).accounts ?? []; } catch (e) { toast.error(e, 'Rekening tidak dapat dimuat'); return; }
  banks.value = all.filter((b: any) => b.branchCode === inv.value.branch && b.status === 'aktif' && b.currency === 'IDR');
  const date = todayWib() < inv.value.date ? inv.value.date : todayWib();
  rc.value = { date, amount: inv.value.open, bankAccount: banks.value.find((b: any) => b.bankName !== 'Kas')?.code ?? banks.value[0]?.code ?? '', method: 'transfer', reference: '' };
  showReceipt.value = true;
}
async function saveReceipt() {
  rcErrors.value = []; busy.value = true;
  try {
    await post(`/sales/invoices/${props.id}/receipts`, { ...rc.value, amount: Math.round(Number(rc.value.amount)), reference: rc.value.reference || undefined });
    toast.push('Penerimaan dicatat', `${inv.value.docNo} · ${F.rp(Number(rc.value.amount))}`, 'ok');
    showReceipt.value = false; await load(); emit('changed');
  } catch (e) { rcErrors.value = errorList(e); } finally { busy.value = false; }
}

const cancelling = ref(false);
const cancelError = ref('');
async function cancel(reason: string) {
  busy.value = true; cancelError.value = '';
  try { await post(`/sales/invoices/${props.id}/cancel`, { reason }); toast.push('Faktur dibatalkan', inv.value.docNo, 'ok'); cancelling.value = false; await load(); emit('changed'); }
  catch (e) { cancelError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const canCancel = computed(() => inv.value && inv.value.status !== 'batal' && (inv.value.status === 'draf' ? (isOwn.value || session.can('sales.invoice.cancel')) : session.can('sales.invoice.cancel') && inv.value.paid === 0));
const journalId = ref<string | null>(null);
</script>

<template>
  <Drawer :title="inv?.customerName ?? 'Memuat…'" :subtitle="inv ? `${F.rp(inv.total)} · ${F.date(inv.date)} · jatuh tempo ${F.date(inv.dueDate)}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="inv"><span class="code">{{ inv.docNo }}</span><Pill :status="inv.isOverdue ? 'jatuh-tempo' : inv.status" /><BranchTag :code="inv.branch" /></template></template>
    <template v-if="inv">
      <div v-if="inv.status === 'draf'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)">
        <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" data-tone="warn"><Icon name="alert" /></span>
          <div class="setting-text"><span class="setting-name">Draf — belum memengaruhi buku besar</span>
            <span class="setting-note">{{ isOwn ? 'Anda pembuat faktur ini; penerbitan harus oleh orang lain (kontrol empat mata).' : 'Penerbitan memposting jurnal piutang, pendapatan, PPN keluaran, dan HPP (stok cabang dikurangi).' }}</span></div></div>
      </div>
      <div v-if="inv.isOverdue" class="section" style="background:var(--danger-soft)"><span class="setting-name neg">Lewat jatuh tempo {{ inv.overdueDays }} hari</span><span class="setting-note">Sisa tagihan {{ F.rp(inv.open) }}.</span></div>
      <div class="section">
        <span class="section-title">Rincian faktur</span>
        <dl class="deflist">
          <dt>Pelanggan</dt><dd>{{ inv.customerCode ?? '' }} {{ inv.customerName }}</dd>
          <dt>Cabang</dt><dd>{{ ctx.nameOf(inv.branch) }}</dd>
          <dt>Tanggal</dt><dd class="num">{{ F.date(inv.date) }}</dd>
          <dt>Jatuh tempo</dt><dd class="num">{{ F.date(inv.dueDate) }}</dd>
          <dt v-if="inv.salesOrderNo">Pesanan</dt><dd v-if="inv.salesOrderNo"><a href="#" class="code" @click.prevent="emit('openOrder', inv.salesOrderId)">{{ inv.salesOrderNo }}</a></dd>
          <dt>Dibuat</dt><dd>{{ inv.createdByName }}</dd>
          <dt v-if="inv.issuedByName">Diterbitkan</dt><dd v-if="inv.issuedByName">{{ inv.issuedByName }}<template v-if="inv.issuedAt"> · {{ F.datetime(inv.issuedAt) }}</template></dd>
          <dt v-if="inv.cancelReason">Dibatalkan</dt><dd v-if="inv.cancelReason">{{ inv.cancelDate ? F.date(inv.cancelDate) + ' — ' : '' }}{{ inv.cancelReason }}</dd>
          <dt v-if="inv.notes">Catatan</dt><dd v-if="inv.notes">{{ inv.notes }}</dd>
        </dl>
      </div>
      <div class="section">
        <span class="section-title">Baris ({{ inv.lines.length }})</span>
        <div class="table-scroll"><table class="table">
          <thead><tr><th>Barang / jasa</th><th class="ta-r">Qty</th><th class="ta-r">Harga</th><th class="ta-r">Jumlah</th></tr></thead>
          <tbody><tr v-for="l in inv.lines" :key="l.lineNo" class="is-static">
            <td><span class="cell-strong">{{ l.description }}</span><span class="cell-sub"><span class="code">{{ l.sku ?? l.kind }}</span><template v-if="l.discPct"> · diskon {{ l.discPct }}%</template></span></td>
            <td class="ta-r num">{{ F.int(l.qty) }} {{ l.unit }}</td><td class="ta-r num">{{ F.rp(l.price) }}</td><td class="ta-r num">{{ F.rp(l.net) }}<span v-if="l.cost" class="cell-sub">HPP {{ F.rp(l.cost) }}</span></td>
          </tr></tbody>
        </table></div>
        <div class="totals">
          <div class="totals-row"><span>DPP</span><b>{{ F.rp(inv.net) }}</b></div>
          <div class="totals-row"><span>PPN 11%</span><b>{{ F.rp(inv.ppn) }}</b></div>
          <div class="totals-row totals-grand"><span>Total</span><b>{{ F.rp(inv.total) }}</b></div>
          <div class="totals-row"><span>Diterima</span><b>{{ F.rp(inv.paid) }}</b></div>
          <div class="totals-row"><span>Sisa tagihan</span><b :class="{ neg: inv.isOverdue }" data-open>{{ F.rp(inv.open) }}</b></div>
        </div>
      </div>
      <div v-if="inv.receipts.length" class="section">
        <span class="section-title">Penerimaan ({{ inv.receipts.length }})</span>
        <div class="table-scroll"><table class="table" data-table="receipts">
          <thead><tr><th>Nomor</th><th>Tanggal</th><th>Rekening</th><th class="ta-r">Nilai</th></tr></thead>
          <tbody><tr v-for="r in inv.receipts" :key="r.id" class="is-static"><td class="code">{{ r.docNo }}</td><td class="num">{{ F.date(r.date) }}</td><td>{{ r.bankName ?? r.bankAccount }}<span class="cell-sub">{{ r.method }}{{ r.reference ? ` · ${r.reference}` : '' }}</span></td><td class="ta-r num">{{ F.rp(r.amount) }}</td></tr></tbody>
        </table></div>
      </div>
      <div v-if="inv.journals.length && session.can('ledger.journal.read')" class="section">
        <span class="section-title">Jurnal terkait ({{ inv.journals.length }})</span>
        <div class="table-scroll"><table class="table" data-table="invoice-journals">
          <tbody><tr v-for="j in inv.journals" :key="j.id" data-row @click="journalId = j.id"><td class="code cell-strong">{{ j.journalNo }}</td><td>{{ j.description }}<span class="cell-sub">{{ F.date(j.date) }} · {{ j.rule }}</span></td><td class="ta-r num">{{ F.rp(j.total) }}</td><td><Pill :status="j.status" /></td></tr></tbody>
        </table></div>
      </div>
      <div v-if="inv.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(t, i) in inv.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="TIMELINE[t.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ t.actor }}</b> {{ TIMELINE[t.action]?.label ?? t.action }}<template v-if="t.detail?.amount"> {{ F.rp(t.detail.amount) }}</template><template v-if="t.detail?.reason"> — “{{ t.detail.reason }}”</template></span><span class="tl-meta">{{ F.datetime(t.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="inv">
        <button v-if="inv.status === 'draf' && session.can('sales.invoice.issue') && !isOwn" class="btn btn-primary" data-action="issue-invoice" :disabled="busy" @click="issue"><Icon name="check" /> Terbitkan & posting</button>
        <button v-if="inv.status === 'draf' && session.can('sales.invoice.create')" class="btn" data-action="edit-invoice" @click="emit('edit', inv)"><Icon name="edit" /> Ubah</button>
        <button v-if="open && session.can('sales.receipt.create')" class="btn btn-primary" data-action="new-receipt" :disabled="busy" @click="openReceipt"><Icon name="wallet" /> Catat penerimaan</button>
        <div class="toolbar-spacer"></div>
        <button v-if="canCancel" class="btn btn-ghost neg" data-action="cancel-invoice" @click="cancelling = true; cancelError = ''">Batalkan</button>
        <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <Modal v-if="showReceipt && inv" :title="`Penerimaan ${inv.docNo}`" :subtitle="`${inv.customerName} · sisa tagihan ${F.rp(inv.open)}. Jurnal kas/bank ↔ piutang diposting otomatis.`" width="520px" @close="showReceipt = false">
    <div class="form-grid">
      <div class="field"><label for="rc-date">Tanggal</label><input id="rc-date" v-model="rc.date" class="input" type="date" :min="inv.date"></div>
      <div class="field"><label for="rc-amount">Nilai (Rp)</label><input id="rc-amount" v-model.number="rc.amount" class="input num" type="number" min="1" :max="inv.open" step="1" style="text-align:right"></div>
      <div class="field form-grid-full"><label for="rc-bank">Rekening penerima ({{ inv.branch }})</label>
        <select id="rc-bank" v-model="rc.bankAccount" class="select"><option v-for="b in banks" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }}</option></select></div>
      <div class="field"><label for="rc-method">Metode</label><select id="rc-method" v-model="rc.method" class="select"><option value="transfer">Transfer</option><option value="tunai">Tunai</option><option value="giro">Giro</option></select></div>
      <div class="field"><label for="rc-ref">Referensi</label><input id="rc-ref" v-model="rc.reference" class="input" maxlength="80" placeholder="No. bukti transfer"></div>
      <div v-if="rcErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in rcErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-receipt" :disabled="busy || !rc.bankAccount" @click="saveReceipt"><Icon name="check" /> Simpan penerimaan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showReceipt = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="cancelling && inv" :title="`Batalkan faktur ${inv.docNo}?`"
    :message="inv.status === 'draf' ? 'Draf batal tetap tersimpan sebagai jejak penomoran.' : 'Jurnal penjualan & HPP dibalik per hari ini, stok dikembalikan, dan pesanan asal kembali berstatus disetujui.'"
    confirm-label="Batalkan faktur" danger :busy="busy" :error="cancelError" @close="cancelling = false" @confirm="cancel" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" @changed="journalId = null; load()" />
</template>
