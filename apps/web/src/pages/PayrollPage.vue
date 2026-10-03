<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { todayWib } from '@/lib/sales';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Drawer from '@/components/Drawer.vue';
import Icon from '@/components/Icon.vue';
import JournalDrawer from '@/components/JournalDrawer.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pill from '@/components/Pill.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const session = useSession();
const toast = useToast();
const runs = useLoader<any[]>(() => (session.can('hr.read') ? get('/hr/payroll/runs') : Promise.resolve([])));
const payable = useLoader<any[]>(() => (session.can('payroll.pay|payroll.approve') ? get('/hr/payroll/payable') : Promise.resolve([])));
const payments = useLoader<any[]>(() => get('/hr/payroll/payments'));
const kpi = computed(() => ({
  drafts: (runs.data.value ?? []).filter((r) => r.status === 'draf').length,
  unpaid: (payable.data.value ?? []).reduce((t, p) => t + p.net, 0), unpaidCount: (payable.data.value ?? []).length,
  paidMonth: (payments.data.value ?? []).filter((p) => String(p.date).startsWith(todayWib().slice(0, 7))).reduce((t, p) => t + p.total, 0),
}));
const busy = ref(false);

/* Daftar gaji baru */
const show = ref(false);
const form = ref({ branch: '', period: todayWib().slice(0, 7) });
const errors = ref<string[]>([]);
const branchOptions = computed(() => session.branches.filter((b) => session.user?.branches === '*' || (session.user?.branches ?? []).includes(b.code)));
function openNew() { errors.value = []; form.value = { branch: ctx.branch === 'ALL' ? branchOptions.value[0]?.code ?? '' : ctx.branch, period: /^\d{4}-\d{2}$/.test(ctx.period ?? '') ? ctx.period! : todayWib().slice(0, 7) }; show.value = true; }
async function create() {
  errors.value = []; busy.value = true;
  try { const r = await post('/hr/payroll/runs', form.value); toast.push('Daftar gaji disusun', `${r.docNo} · ${r.slips.length} karyawan`, 'ok'); show.value = false; await runs.reload(); openId.value = r.id; }
  catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}

/* Laci daftar gaji */
const openId = ref<string | null>(null);
const run = ref<any>(null);
const loadRun = async () => { run.value = null; if (openId.value) { try { run.value = await get(`/hr/payroll/runs/${openId.value}`); } catch (e) { toast.error(e, 'Daftar gaji tidak dapat dimuat'); openId.value = null; } } };
watch(openId, loadRun);
const canPost = computed(() => run.value?.status === 'draf' && session.can('payroll.approve') && run.value.createdBy !== session.user?.id);
async function postRun() {
  busy.value = true;
  try { await post(`/hr/payroll/runs/${openId.value}/post`); toast.push('Daftar gaji diposting', run.value.docNo, 'ok'); await Promise.all([loadRun(), runs.reload(), payable.reload()]); }
  catch (e) { toast.error(e, 'Tidak dapat diposting'); } finally { busy.value = false; }
}
const cancelling = ref(false);
const cancelError = ref('');
async function cancelRun(reason: string) {
  busy.value = true; cancelError.value = '';
  try { await post(`/hr/payroll/runs/${openId.value}/cancel`, { reason }); cancelling.value = false; await Promise.all([loadRun(), runs.reload()]); } catch (e) { cancelError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const journalId = ref<string | null>(null);

/* Pembayaran */
const picked = ref<Set<string>>(new Set());
const toggle = (id: string) => { const s = new Set(picked.value); if (s.has(id)) s.delete(id); else s.add(id); picked.value = s; };
const pickedTotal = computed(() => (payable.data.value ?? []).filter((p) => picked.value.has(p.id)).reduce((t, p) => t + p.net, 0));
const showPay = ref(false);
const banks = ref<any[]>([]);
const payForm = ref({ bankAccount: '', date: todayWib() });
const payErrors = ref<string[]>([]);
async function openPay() {
  payErrors.value = [];
  try { banks.value = ((await get('/ledger/bank-accounts', { scoped: false })).accounts ?? []).filter((b: any) => b.status === 'aktif' && b.currency === 'IDR' && b.bankName !== 'Kas'); } catch (e) { toast.error(e, 'Rekening tidak dapat dimuat'); return; }
  payForm.value = { bankAccount: banks.value.find((b) => b.branchCode === 'JKT')?.code ?? banks.value[0]?.code ?? '', date: todayWib() };
  showPay.value = true;
}
async function pay() {
  payErrors.value = []; busy.value = true;
  try {
    const r = await post('/hr/payroll/payments', { ...payForm.value, slipIds: [...picked.value] });
    toast.push('Gaji dibayar', `${r.docNo} · ${F.rp(r.total)} · ${r.journals.length} jurnal`, 'ok'); showPay.value = false; picked.value = new Set();
    await Promise.all([payable.reload(), payments.reload()]);
  } catch (e) { payErrors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Penggajian" sub="Daftar gaji per cabang per bulan dari data karyawan & lembur kehadiran: BPJS (pekerja 4%, pemberi kerja 10,24%) dan PPh 21 metode setahun. Diposting orang lain dari penyusun ke beban gaji / utang gaji, PPh 21, BPJS; dibayar dari rekening kantor pusat untuk semua cabang lewat RK.">
    <button v-if="session.can('payroll.process')" class="btn btn-primary" data-action="new-payroll" @click="openNew"><Icon name="plus" /> Susun daftar gaji</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Draf daftar gaji" :value="String(kpi.drafts)" foot="Menunggu posting" :tone="kpi.drafts ? 'neg' : ''" />
    <KpiTile label="Utang gaji" :value="F.rpCompact(kpi.unpaid)" :foot="`${kpi.unpaidCount} slip belum dibayar`" />
    <KpiTile label="Dibayar bulan ini" :value="F.rpCompact(kpi.paidMonth)" foot="Semua cabang" />
    <KpiTile label="Konteks" :value="ctx.branchShort" foot="Cabang" />
  </div>

  <article v-if="session.can('hr.read')" class="card" style="margin-bottom:var(--sp-4)">
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">Daftar gaji</h2></div></div>
    <div class="table-scroll"><table class="table" data-table="payroll-runs">
      <thead><tr><th>Nomor</th><th>Periode</th><th>Cabang</th><th class="ta-r">Karyawan</th><th class="ta-r">Bruto</th><th class="ta-r">Neto</th><th>Disusun</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="r in runs.data.value ?? []" :key="r.id" data-row :data-run="r.docNo" @click="openId = r.id">
          <td class="code cell-strong">{{ r.docNo }}</td><td>{{ r.period }}</td><td><BranchTag :code="r.branch" /></td><td class="ta-r num">{{ r.totals?.count ?? 0 }}</td>
          <td class="ta-r num">{{ F.rpCompact(r.totals?.gross ?? 0) }}</td><td class="ta-r num">{{ F.rpCompact(r.totals?.net ?? 0) }}</td><td>{{ r.createdByName }}</td><td><Pill :status="r.status" /></td>
        </tr>
        <tr v-if="runs.data.value && !runs.data.value.length" class="is-static"><td colspan="8"><span class="muted">Belum ada daftar gaji.</span></td></tr>
      </tbody>
    </table></div>
  </article>

  <article v-if="session.can('payroll.pay|payroll.approve')" class="card" style="margin-bottom:var(--sp-4)">
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">Slip siap dibayar</h2><span class="card-note">Pilih slip lalu bayar sekaligus dari satu rekening.</span></div>
      <button v-if="session.can('payroll.pay')" class="btn btn-primary" data-action="pay-payroll" :disabled="!picked.size" @click="openPay"><Icon name="send" /> Bayar {{ picked.size ? F.rp(pickedTotal) : '' }}</button></div>
    <div class="table-scroll"><table class="table" data-table="payable">
      <thead><tr><th style="width:36px"></th><th>Karyawan</th><th>Periode</th><th>Cabang</th><th class="ta-r">Neto</th></tr></thead>
      <tbody>
        <tr v-for="p in payable.data.value ?? []" :key="p.id" class="is-static" :data-payslip="p.docNo">
          <td><input type="checkbox" :checked="picked.has(p.id)" :aria-label="`Pilih ${p.employeeName}`" @change="toggle(p.id)"></td>
          <td>{{ p.employeeName }}<span class="cell-sub code">{{ p.docNo }}</span></td><td>{{ p.period }}</td><td><BranchTag :code="p.branch" /></td><td class="ta-r num">{{ F.rp(p.net) }}</td>
        </tr>
        <tr v-if="payable.data.value && !payable.data.value.length" class="is-static"><td colspan="5"><span class="muted">Tidak ada utang gaji.</span></td></tr>
      </tbody>
    </table></div>
  </article>

  <article class="card">
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">Pembayaran gaji</h2></div></div>
    <div class="table-scroll"><table class="table" data-table="payroll-payments"><tbody>
      <tr v-for="p in payments.data.value ?? []" :key="p.id" class="is-static"><td class="code cell-strong">{{ p.docNo }}</td><td class="num">{{ F.date(p.date) }}</td><td>{{ p.bank }} · <BranchTag :code="p.branch" /></td><td>{{ p.branches.join(', ') }}</td><td class="ta-r num">{{ p.count }} slip</td><td class="ta-r num">{{ F.rp(p.total) }}</td></tr>
      <tr v-if="payments.data.value && !payments.data.value.length" class="is-static"><td><span class="muted">Belum ada pembayaran.</span></td></tr>
    </tbody></table></div>
  </article>

  <Drawer v-if="openId" :title="run ? `Daftar gaji ${run.period}` : 'Memuat…'" :subtitle="run ? `${run.totals?.count ?? 0} karyawan · disusun ${run.createdByName}` : ''" @close="openId = null">
    <template #eyebrow><template v-if="run"><span class="code">{{ run.docNo }}</span><Pill :status="run.status" /><BranchTag :code="run.branch" /></template></template>
    <template v-if="run">
      <div v-if="run.status === 'draf'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)" data-run-draft>
        <span class="setting-name">{{ canPost ? 'Perlu posting Anda' : 'Menunggu posting' }}</span>
        <span v-if="run.createdBy === session.user?.id" class="setting-note" style="display:block">Anda penyusun daftar gaji ini; posting harus oleh orang lain.</span>
      </div>
      <div class="section"><dl class="deflist">
        <dt>Bruto</dt><dd class="num">{{ F.rp(run.totals?.gross ?? 0) }}</dd><dt>BPJS pekerja</dt><dd class="num">{{ F.rp(run.totals?.bpjsEmployee ?? 0) }}</dd>
        <dt>BPJS pemberi kerja</dt><dd class="num">{{ F.rp(run.totals?.bpjsEmployer ?? 0) }}</dd><dt>PPh 21</dt><dd class="num">{{ F.rp(run.totals?.pph21 ?? 0) }}</dd>
        <dt>Neto dibayar</dt><dd class="num cell-strong" data-run-net>{{ F.rp(run.totals?.net ?? 0) }}</dd>
      </dl></div>
      <div class="section"><span class="section-title">Slip gaji</span>
        <div class="table-scroll"><table class="table" data-table="run-slips">
          <thead><tr><th>Karyawan</th><th class="ta-r">Bruto</th><th class="ta-r">Lembur</th><th class="ta-r">BPJS</th><th class="ta-r">PPh 21</th><th class="ta-r">Neto</th></tr></thead>
          <tbody><tr v-for="p in run.slips" :key="p.id" class="is-static"><td>{{ p.employeeName }}<span class="cell-sub">{{ p.dept }}</span></td><td class="ta-r num">{{ F.rp(p.gross) }}</td>
            <td class="ta-r num">{{ p.overtime ? F.rp(p.overtime) : '—' }}<span v-if="p.overtimeHours" class="cell-sub">{{ F.dec(p.overtimeHours, 1) }} jam</span></td>
            <td class="ta-r num">{{ F.rp(p.bpjsEmployee ?? 0) }}</td><td class="ta-r num">{{ F.rp(p.pph21 ?? 0) }}</td><td class="ta-r num cell-strong">{{ F.rp(p.net) }}</td></tr></tbody>
        </table></div></div>
      <div v-if="run.journals.length" class="section"><span class="section-title">Jurnal</span>
        <div class="table-scroll"><table class="table" data-table="run-journals"><tbody><tr v-for="j in run.journals" :key="j.id" :data-row="session.can('ledger.journal.read') ? '' : undefined" @click="session.can('ledger.journal.read') && (journalId = j.id)">
          <td class="code cell-strong">{{ j.journalNo }}</td><td>{{ F.date(j.date) }}</td><td class="ta-r num">{{ F.rp(j.total) }}</td><td><Pill :status="j.status" /></td></tr></tbody></table></div></div>
    </template>
    <template #foot><template v-if="run">
      <button v-if="canPost" class="btn btn-primary" data-action="post-payroll" :disabled="busy" @click="postRun"><Icon name="check" /> Posting</button>
      <div class="toolbar-spacer"></div>
      <button v-if="run.status === 'draf' && session.can('payroll.process|payroll.approve')" class="btn btn-ghost neg" @click="cancelling = true; cancelError = ''">Batalkan</button>
      <button class="btn btn-ghost" @click="openId = null">Tutup</button>
    </template></template>
  </Drawer>

  <Modal v-if="show" title="Susun daftar gaji" subtitle="Semua karyawan aktif cabang; lembur dari catatan kehadiran periode tersebut." width="480px" @close="show = false">
    <div class="form-grid">
      <div class="field"><label for="pr-branch">Cabang</label><select id="pr-branch" v-model="form.branch" class="select"><option v-for="b in branchOptions" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name }}</option></select></div>
      <div class="field"><label for="pr-period">Periode</label><input id="pr-period" v-model="form.period" class="input" type="month"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="save-payroll" :disabled="busy || !form.branch || !form.period" @click="create"><Icon name="check" /> Susun</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="show = false">Batal</button></template>
  </Modal>
  <Modal v-if="showPay" title="Bayar gaji" :subtitle="`${picked.size} slip · ${F.rp(pickedTotal)}. Slip cabang lain dibayar dari rekening kantor pusat dan dijurnal lewat RK.`" width="520px" @close="showPay = false">
    <div class="form-grid">
      <div class="field"><label for="py-bank">Rekening</label><select id="py-bank" v-model="payForm.bankAccount" class="select"><option v-for="b in banks" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }} ({{ b.branchCode }})</option></select></div>
      <div class="field"><label for="py-date">Tanggal</label><input id="py-date" v-model="payForm.date" class="input" type="date"></div>
      <div v-if="payErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in payErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="confirm-pay" :disabled="busy || !payForm.bankAccount" @click="pay"><Icon name="send" /> Bayar & posting</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showPay = false">Batal</button></template>
  </Modal>
  <ReasonModal v-if="cancelling && run" :title="`Batalkan ${run.docNo}?`" message="Slip draf dihapus; daftar gaji dapat disusun ulang." confirm-label="Batalkan" danger :busy="busy" :error="cancelError" @close="cancelling = false" @confirm="cancelRun" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" />
</template>
