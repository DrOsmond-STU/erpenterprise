<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { PURCHASE_TIMELINE } from '@/lib/purchasing';
import { todayWib } from '@/lib/sales';
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
const emit = defineEmits<{ close: []; changed: []; openInvoice: [id: string] }>();
const session = useSession();
const toast = useToast();
const p = ref<any>(null);
const busy = ref(false);
const load = async () => { try { p.value = await get(`/purchasing/payments/${props.id}`); } catch (e) { toast.error(e, 'Pembayaran tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { p.value = null; load(); }, { immediate: true });
const isOwn = computed(() => p.value?.createdBy === session.user?.id);
const approvedByMe = computed(() => (p.value?.approvals ?? []).some((a: any) => a.userId === session.user?.id));
const canApprove = computed(() => p.value?.status === 'menunggu' && session.can('purchasing.payment.approve') && !isOwn.value && !approvedByMe.value);
const bankBlocked = computed(() => p.value?.method === 'transfer' ? p.value?.supplierBank?.readyProblem ?? (p.value?.supplierBank ? null : 'Tagihan tanpa data pemasok.') : null);

async function approve() {
  busy.value = true;
  try { const r = await post(`/purchasing/payments/${props.id}/approve`, {}); toast.push(r.status === 'disetujui' ? 'Pembayaran disetujui — siap dibayar' : `Persetujuan ${r.approvals.length}/${r.requiredApprovals} tercatat`, p.value.docNo, 'ok'); await load(); emit('changed'); }
  catch (e) { toast.error(e, 'Persetujuan gagal'); } finally { busy.value = false; }
}
const showPay = ref(false);
const payForm = ref({ date: todayWib(), reference: '' });
const payErrors = ref<string[]>([]);
function openPay() { payErrors.value = []; payForm.value = { date: todayWib() < p.value.invoice.date ? p.value.invoice.date : todayWib(), reference: p.value.reference ?? '' }; showPay.value = true; }
async function execute() {
  payErrors.value = []; busy.value = true;
  try { await post(`/purchasing/payments/${props.id}/pay`, { date: payForm.value.date, reference: payForm.value.reference || undefined }); toast.push('Pembayaran dieksekusi', `${p.value.docNo} · jurnal utang ↔ bank diposting`, 'ok'); showPay.value = false; await load(); emit('changed'); }
  catch (e) { payErrors.value = errorList(e); } finally { busy.value = false; }
}
const pending = ref<'reject' | 'cancel' | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  busy.value = true; pendingError.value = '';
  try {
    await post(`/purchasing/payments/${props.id}/${pending.value}`, pending.value === 'reject' ? { note: reason } : { reason });
    toast.push(pending.value === 'reject' ? 'Pembayaran ditolak' : 'Pembayaran dibatalkan', p.value.docNo, 'ok');
    pending.value = null; await load(); emit('changed');
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const journalId = ref<string | null>(null);
</script>

<template>
  <Drawer :title="p?.supplierName ?? 'Memuat…'" :subtitle="p ? `${F.rp(p.amount)} · ${p.invoiceNo} · diajukan ${p.createdByName}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="p"><span class="code">{{ p.docNo }}</span><Pill :status="p.status" :label="p.statusLabel" /><BranchTag :code="p.branch" /></template></template>
    <template v-if="p">
      <div v-if="p.status === 'menunggu'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)" data-decision>
        <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" data-tone="warn"><Icon name="shield" /></span>
          <div class="setting-text"><span class="setting-name">{{ p.approvals.length }} dari {{ p.requiredApprovals }} persetujuan</span>
            <span class="setting-note">{{ p.requiredApprovals === 2 ? 'Di atas ambang pembayaran: dua penyetuju berbeda wajib menyetujui (K-26).' : 'Satu penyetuju selain pengaju.' }}</span>
            <span v-if="isOwn" class="setting-note">Anda pengaju pembayaran ini; persetujuan harus oleh orang lain.</span>
            <span v-else-if="approvedByMe" class="setting-note">Anda sudah menyetujui; persetujuan berikutnya harus oleh orang lain.</span></div></div>
      </div>
      <div v-if="p.status === 'disetujui' && bankBlocked" class="section" style="background:var(--danger-soft)" data-bank-block><span class="setting-name neg">Transfer ditahan</span><span class="setting-note">{{ bankBlocked }}</span></div>
      <div class="section">
        <span class="section-title">Rincian pembayaran</span>
        <dl class="deflist">
          <dt>Tagihan</dt><dd><a href="#" class="code" data-action="open-ap-invoice" @click.prevent="emit('openInvoice', p.invoiceId)">{{ p.invoiceNo }}</a> · sisa {{ F.rp(p.invoice.open) }}</dd>
          <dt>Pemasok</dt><dd>{{ p.supplierName }}</dd>
          <dt>Rekening pemasok</dt><dd><template v-if="p.supplierBank?.name">{{ p.supplierBank.name }} ••{{ p.supplierBank.last4 }} a.n. {{ p.supplierBank.holder }}</template><span v-else class="muted">—</span>
            <span v-if="p.supplierBank" class="cell-sub" :class="{ neg: p.supplierBank.readyProblem }">{{ p.supplierBank.readyProblem ?? `Terverifikasi ${F.date(String(p.supplierBank.verifiedAt).slice(0, 10))}` }}</span></dd>
          <dt>Rekening sumber</dt><dd>{{ p.bankAccount }} · {{ p.bankName }}</dd>
          <dt>Metode</dt><dd>{{ p.method }}{{ p.reference ? ` · ${p.reference}` : '' }}</dd>
          <dt>Tanggal</dt><dd class="num">{{ F.date(p.date) }}</dd>
          <dt v-if="p.paidByName">Dieksekusi</dt><dd v-if="p.paidByName">{{ p.paidByName }}<template v-if="p.paidAt"> · {{ F.datetime(p.paidAt) }}</template></dd>
          <dt v-if="p.decisionNote">Catatan</dt><dd v-if="p.decisionNote">{{ p.decisionNote }}</dd>
        </dl>
      </div>
      <div class="section" data-approvals>
        <span class="section-title">Persetujuan ({{ p.approvals.length }}/{{ p.requiredApprovals }})</span>
        <div v-if="!p.approvals.length" class="muted" style="font-size:var(--fs-sm)">{{ p.legacy ? 'Pembayaran data awal (sistem lama).' : 'Belum ada persetujuan.' }}</div>
        <div v-for="(a, i) in p.approvals" :key="i" class="setting-row" style="padding:var(--sp-2) 0"><div class="setting-text"><span class="setting-name"><Icon name="check" /> {{ a.name }}</span><span class="setting-note">{{ F.datetime(a.at) }}{{ a.note ? ` — “${a.note}”` : '' }}</span></div></div>
      </div>
      <div v-if="p.journalNo && session.can('ledger.journal.read')" class="section">
        <span class="section-title">Jurnal</span>
        <div class="table-scroll"><table class="table"><tbody><tr data-row @click="journalId = p.journalId"><td class="code cell-strong">{{ p.journalNo }}</td><td>Dr utang usaha / Cr bank</td><td class="ta-r num">{{ F.rp(p.amount) }}</td></tr></tbody></table></div>
      </div>
      <div v-if="p.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(t, i) in p.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="PURCHASE_TIMELINE[t.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ t.actor }}</b> {{ PURCHASE_TIMELINE[t.action]?.label ?? t.action }}<template v-if="t.detail?.reason || t.detail?.note"> — “{{ t.detail.reason ?? t.detail.note }}”</template></span><span class="tl-meta">{{ F.datetime(t.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="p">
        <button v-if="canApprove" class="btn btn-primary" data-action="approve-payment" :disabled="busy" @click="approve"><Icon name="check" /> Setujui ({{ p.approvals.length + 1 }}/{{ p.requiredApprovals }})</button>
        <button v-if="['menunggu', 'disetujui'].includes(p.status) && session.can('purchasing.payment.approve') && !isOwn" class="btn btn-danger" data-action="reject-payment" :disabled="busy" @click="pending = 'reject'; pendingError = ''"><Icon name="x" /> Tolak</button>
        <button v-if="p.status === 'disetujui' && session.can('purchasing.payment.create')" class="btn btn-primary" data-action="execute-payment" :disabled="busy || !!bankBlocked" @click="openPay"><Icon name="send" /> Bayar</button>
        <div class="toolbar-spacer"></div>
        <button v-if="['menunggu', 'disetujui'].includes(p.status) && (isOwn || session.can('purchasing.payment.approve'))" class="btn btn-ghost neg" data-action="cancel-payment" @click="pending = 'cancel'; pendingError = ''">Batalkan</button>
        <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <Modal v-if="showPay && p" :title="`Eksekusi ${p.docNo}`" :subtitle="`${F.rp(p.amount)} dari ${p.bankName} ke ${p.supplierName}. Jurnal Dr utang usaha / Cr bank diposting pada tanggal ini.`" width="480px" @close="showPay = false">
    <div class="form-grid">
      <div class="field"><label for="ex-date">Tanggal bayar</label><input id="ex-date" v-model="payForm.date" class="input" type="date" :min="p.invoice.date"></div>
      <div class="field"><label for="ex-ref">Referensi bank</label><input id="ex-ref" v-model="payForm.reference" class="input" maxlength="80" placeholder="No. bukti transfer"></div>
      <div v-if="payErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in payErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="confirm-execute" :disabled="busy" @click="execute"><Icon name="check" /> Posting pembayaran</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showPay = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="pending" :title="pending === 'reject' ? `Tolak pembayaran ${p?.docNo}?` : `Batalkan pembayaran ${p?.docNo}?`" message="Tagihan tetap terbuka dan dapat diajukan pembayaran baru."
    :confirm-label="pending === 'reject' ? 'Tolak pembayaran' : 'Batalkan pembayaran'" danger :busy="busy" :error="pendingError" @close="pending = null" @confirm="confirm" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" />
</template>
