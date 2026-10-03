<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { MONTHS, PLANNING_TIMELINE } from '@/lib/planning';
import { todayWib } from '@/lib/sales';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pill from '@/components/Pill.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data: list, reload: reloadList } = useLoader<any[]>(() => get('/budgets'));
const selected = ref('');
const asOf = ref(todayWib());
watch(list, (l) => { if (l?.length && !l.some((b) => b.id === selected.value)) selected.value = l[0].id; });
const b = ref<any>(null);
const loading = ref(false);
async function load() {
  if (!selected.value) { b.value = null; return; }
  loading.value = true;
  try { b.value = await get(`/budgets/${selected.value}?asOf=${asOf.value}`); } catch (e) { toast.error(e, 'Anggaran tidak dapat dimuat'); } finally { loading.value = false; }
}
watch([selected, asOf], load);
const tab = ref<'akun' | 'kelompok'>('akun');
const isOwn = computed(() => b.value && (b.value.createdBy === session.user?.id || b.value.submittedBy === session.user?.id));
const canManage = computed(() => session.can('budget.manage'));
const canApprove = computed(() => session.can('budget.approve') && !isOwn.value);

const busy = ref(false);
async function act(fn: () => Promise<any>, msg: string) {
  busy.value = true;
  try { b.value = await fn(); toast.push(msg, b.value.name, 'ok'); await reloadList(); } catch (e) { toast.error(e, 'Tindakan gagal'); } finally { busy.value = false; }
}
const submit = () => act(() => post(`/budgets/${selected.value}/submit`), 'Anggaran diajukan');
const approve = () => act(() => post(`/budgets/${selected.value}/approve`, {}), 'Anggaran disetujui');
const pending = ref<'return' | 'revise' | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  busy.value = true; pendingError.value = '';
  try {
    b.value = await post(`/budgets/${selected.value}/${pending.value}`, pending.value === 'return' ? { note: reason } : { reason });
    toast.push(pending.value === 'return' ? 'Anggaran dikembalikan ke draf' : 'Anggaran direvisi — kembali draf', b.value.name, 'ok');
    pending.value = null; await reloadList();
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}

/* Anggaran baru */
const showNew = ref(false);
const nf = ref({ branch: '', fiscalYear: new Date().getFullYear(), name: '', source: 'actual', fromActualYear: new Date().getFullYear(), growthPct: 5 });
const newErrors = ref<string[]>([]);
const branches = computed(() => session.branches.filter((x) => x.status === 'aktif' && (ctx.branch === 'ALL' || x.code === ctx.branch)));
function openNew() { newErrors.value = []; nf.value = { branch: ctx.branch !== 'ALL' ? ctx.branch : branches.value[0]?.code ?? '', fiscalYear: Number(todayWib().slice(0, 4)) + 1, name: '', source: 'actual', fromActualYear: Number(todayWib().slice(0, 4)), growthPct: 5 }; showNew.value = true; }
async function saveNew() {
  newErrors.value = []; busy.value = true;
  try {
    const body: any = { branch: nf.value.branch, fiscalYear: Number(nf.value.fiscalYear), name: nf.value.name || undefined };
    if (nf.value.source === 'actual') Object.assign(body, { fromActualYear: Number(nf.value.fromActualYear), growthPct: Number(nf.value.growthPct) || 0 });
    const r = await post('/budgets', body);
    toast.push('Draf anggaran dibuat', `${r.name} · ${r.lines.length} akun`, 'ok');
    showNew.value = false; await reloadList(); selected.value = r.id;
  } catch (e) { newErrors.value = errorList(e); } finally { busy.value = false; }
}

/* Penyunting baris (draf) */
const accounts = ref<any[]>([]);
const showEdit = ref(false);
const rows = ref<{ account: string; annual: number; monthly: boolean; amounts: number[] }[]>([]);
const editErrors = ref<string[]>([]);
async function openEdit() {
  editErrors.value = [];
  if (!accounts.value.length) accounts.value = ((await get('/ledger/accounts')).accounts ?? []).filter((a: any) => a.type === 'detail' && a.status === 'aktif' && ['Beban', 'Pendapatan', 'Aset'].includes(a.category) && !a.isCash && !a.isIntercompany && !a.isComputed);
  rows.value = b.value.lines.map((l: any) => ({ account: l.account, annual: l.budget, monthly: new Set(l.months).size > 2, amounts: [...l.months] }));
  showEdit.value = true;
}
const addRow = () => rows.value.push({ account: '', annual: 0, monthly: false, amounts: Array(12).fill(0) });
const rowTotal = (r: any) => (r.monthly ? r.amounts.reduce((t: number, v: number) => t + (Number(v) || 0), 0) : Number(r.annual) || 0);
async function saveEdit() {
  editErrors.value = []; busy.value = true;
  try {
    const lines = rows.value.filter((r) => r.account).map((r) => (r.monthly ? { account: r.account, amounts: r.amounts.map((v) => Math.round(Number(v) || 0)) } : { account: r.account, annual: Math.round(Number(r.annual) || 0) }));
    b.value = await patch(`/budgets/${selected.value}`, { lines });
    toast.push('Anggaran disimpan', `${lines.length} akun`, 'ok'); showEdit.value = false; await reloadList();
  } catch (e) { editErrors.value = errorList(e); } finally { busy.value = false; }
}

const detail = ref<any>(null);
const tone = (v: number) => (v > 0 ? 'neg' : v < 0 ? 'pos' : '');
</script>

<template>
  <ReportHead title="Anggaran" sub="Anggaran per cabang & tahun per akun detail, dibandingkan realisasi buku besar dan komitmen pengadaan (PO jasa belum ditagih, draf tagihan, PR disetujui). Serapan = (realisasi + komitmen) ÷ anggaran; prakiraan = realisasi + komitmen + anggaran bulan yang belum berjalan.">
    <select v-model="selected" class="select" style="max-width:280px" aria-label="Pilih anggaran" data-field="budget">
      <option v-for="x in list ?? []" :key="x.id" :value="x.id">{{ x.branch }} · {{ x.fiscalYear }} — {{ x.name }} ({{ x.statusLabel }})</option>
    </select>
    <input v-model="asOf" class="input" type="date" style="max-width:170px" aria-label="Per tanggal" data-field="as-of">
    <button v-if="canManage" class="btn btn-primary" data-action="new-budget" @click="openNew"><Icon name="plus" /> Anggaran baru</button>
  </ReportHead>
  <div v-if="list && !list.length" class="card"><div class="empty"><div class="empty-card"><span class="empty-title">Belum ada anggaran</span><span class="empty-note">Susun anggaran cabang — dapat diisi awal dari realisasi tahun sebelumnya.</span></div></div></div>
  <template v-if="b">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Anggaran setahun" :value="F.rpCompact(b.totals.budget)" :foot="`${b.lines.length} akun · ${b.branch} ${b.fiscalYear}`" />
      <KpiTile label="Realisasi" :value="F.rpCompact(b.totals.actual)" :foot="`anggaran s.d. ${MONTHS[Math.max(b.elapsedMonths - 1, 0)]}: ${F.rpCompact(b.totals.ytdBudget)}`" />
      <KpiTile label="Serapan" :value="F.pct(b.totals.absorption)" :foot="`komitmen ${F.rpCompact(b.totals.commitment)}`" :tone="b.totals.absorption > 100 ? 'neg' : ''" />
      <KpiTile label="Prakiraan" :value="F.rpCompact(b.totals.forecast)" :foot="`${b.totals.variance > 0 ? 'melampaui' : 'di bawah'} ${F.rpCompact(Math.abs(b.totals.variance))}`" :tone="b.totals.variance > 0 ? 'neg' : 'pos'" />
    </div>
    <div v-if="b.status !== 'disetujui'" class="card" style="margin-bottom:var(--sp-4);padding:var(--sp-3) var(--sp-4);display:flex;gap:var(--sp-3);align-items:center;flex-wrap:wrap" data-budget-state>
      <Pill :status="b.status" /><span class="muted">{{ b.status === 'draf' ? 'Draf belum berlaku untuk cek anggaran PR. Ajukan untuk disetujui.' : isOwn ? 'Menunggu persetujuan orang lain.' : 'Menunggu keputusan Anda.' }}</span>
    </div>
    <article class="card">
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Tampilan">
          <button class="chip" :aria-pressed="tab === 'akun'" data-tab="akun" @click="tab = 'akun'">Per akun</button>
          <button class="chip" :aria-pressed="tab === 'kelompok'" data-tab="kelompok" @click="tab = 'kelompok'">Per kelompok akun</button>
        </div>
        <div class="toolbar-spacer"></div>
        <BranchTag :code="b.branch" /><Pill :status="b.status" /><span v-if="b.revision" class="muted">revisi {{ b.revision }}</span>
        <template v-if="b.status === 'draf' && canManage">
          <button class="btn btn-sm" data-action="edit-budget" :disabled="busy" @click="openEdit"><Icon name="edit" /> Ubah baris</button>
          <button class="btn btn-sm btn-primary" data-action="submit-budget" :disabled="busy" @click="submit"><Icon name="send" /> Ajukan</button>
        </template>
        <template v-if="b.status === 'menunggu' && canApprove">
          <button class="btn btn-sm btn-primary" data-action="approve-budget" :disabled="busy" @click="approve"><Icon name="check" /> Setujui</button>
          <button class="btn btn-sm btn-danger" data-action="return-budget" :disabled="busy" @click="pending = 'return'; pendingError = ''">Kembalikan</button>
        </template>
        <button v-if="b.status === 'disetujui' && canManage" class="btn btn-sm" data-action="revise-budget" :disabled="busy" @click="pending = 'revise'; pendingError = ''">Revisi</button>
      </div>
      <div class="table-scroll"><table v-if="tab === 'akun'" class="table" data-table="budget-lines">
        <thead><tr><th>Akun</th><th class="ta-r">Anggaran</th><th class="ta-r">s.d. {{ MONTHS[Math.max(b.elapsedMonths - 1, 0)] }}</th><th class="ta-r">Realisasi</th><th class="ta-r">Komitmen</th><th class="ta-r">Prakiraan</th><th class="ta-r">Selisih</th><th>Serapan</th></tr></thead>
        <tbody>
          <tr v-for="l in b.lines" :key="l.account" data-row :data-budget-account="l.account" @click="detail = l">
            <td><span class="cell-strong"><span class="code">{{ l.account }}</span> {{ l.accountName }}</span><span class="cell-sub">{{ l.category }} · {{ l.groupName }}</span></td>
            <td class="ta-r num">{{ F.rp(l.budget) }}</td><td class="ta-r num">{{ F.rp(l.ytdBudget) }}</td><td class="ta-r num">{{ F.rp(l.actual) }}</td>
            <td class="ta-r num">{{ l.commitment ? F.rp(l.commitment) : '—' }}</td><td class="ta-r num">{{ F.rp(l.forecast) }}</td>
            <td class="ta-r num" :class="l.category === 'Pendapatan' ? tone(-l.variance) : tone(l.variance)">{{ F.rp(l.variance) }}</td>
            <td><div class="meter"><span class="meter-track"><span class="meter-fill" :style="{ width: Math.min(l.absorption, 100) + '%' }" :data-tone="l.absorption > 100 ? 'danger' : undefined"></span></span><span class="meter-val">{{ F.pct(l.absorption) }}</span></div></td>
          </tr>
          <tr v-if="!b.lines.length" class="is-static"><td colspan="8"><span class="muted">Belum ada baris akun.</span></td></tr>
        </tbody>
        <tfoot><tr class="is-static"><td class="cell-strong">Total</td><td class="ta-r num">{{ F.rp(b.totals.budget) }}</td><td class="ta-r num">{{ F.rp(b.totals.ytdBudget) }}</td><td class="ta-r num">{{ F.rp(b.totals.actual) }}</td><td class="ta-r num">{{ F.rp(b.totals.commitment) }}</td><td class="ta-r num">{{ F.rp(b.totals.forecast) }}</td><td class="ta-r num">{{ F.rp(b.totals.variance) }}</td><td>{{ F.pct(b.totals.absorption) }}</td></tr></tfoot>
      </table>
      <table v-else class="table" data-table="budget-groups">
        <thead><tr><th>Kelompok akun</th><th class="ta-r">Akun</th><th class="ta-r">Anggaran</th><th class="ta-r">Realisasi</th><th class="ta-r">Komitmen</th><th class="ta-r">Prakiraan</th><th class="ta-r">Selisih</th><th>Serapan</th></tr></thead>
        <tbody><tr v-for="g in b.groups" :key="g.group" class="is-static">
          <td><span class="code">{{ g.group }}</span> {{ g.groupName }}</td><td class="ta-r num">{{ g.accounts }}</td><td class="ta-r num">{{ F.rp(g.budget) }}</td><td class="ta-r num">{{ F.rp(g.actual) }}</td>
          <td class="ta-r num">{{ F.rp(g.commitment) }}</td><td class="ta-r num">{{ F.rp(g.forecast) }}</td><td class="ta-r num" :class="tone(g.variance)">{{ F.rp(g.variance) }}</td><td>{{ F.pct(g.absorption) }}</td>
        </tr></tbody>
      </table></div>
    </article>
    <article v-if="b.timeline.length" class="card" style="margin-top:var(--sp-4)">
      <div class="section"><span class="section-title">Linimasa</span>
        <div class="timeline"><div v-for="(t, i) in b.timeline" :key="i" class="tl-item">
          <span class="tl-rail"><i class="tl-node" :data-tone="PLANNING_TIMELINE[t.action]?.tone || undefined"></i><i class="tl-line"></i></span>
          <span class="tl-body"><span class="tl-title"><b>{{ t.actor }}</b> {{ PLANNING_TIMELINE[t.action]?.label ?? t.action }}<template v-if="t.detail?.reason || t.detail?.note"> — “{{ t.detail.reason ?? t.detail.note }}”</template></span><span class="tl-meta">{{ F.datetime(t.at) }}</span></span>
        </div></div></div>
    </article>
  </template>
  <div v-else-if="loading" class="loading">Memuat…</div>

  <Modal v-if="detail" :title="`${detail.account} ${detail.accountName}`" :subtitle="`Anggaran vs realisasi per bulan · ${b.branch} ${b.fiscalYear}`" width="640px" @close="detail = null">
    <div class="table-scroll"><table class="table" data-table="budget-months">
      <thead><tr><th>Bulan</th><th class="ta-r">Anggaran</th><th class="ta-r">Realisasi</th><th class="ta-r">Selisih</th></tr></thead>
      <tbody><tr v-for="(m, i) in MONTHS" :key="m" class="is-static" :class="{ muted: i >= b.elapsedMonths }">
        <td>{{ m }} {{ b.fiscalYear }}</td><td class="ta-r num">{{ F.rp(detail.months[i]) }}</td><td class="ta-r num">{{ F.rp(detail.actualMonths[i]) }}</td>
        <td class="ta-r num" :class="i < b.elapsedMonths ? tone(detail.category === 'Pendapatan' ? detail.months[i] - detail.actualMonths[i] : detail.actualMonths[i] - detail.months[i]) : ''">{{ i < b.elapsedMonths ? F.rp(detail.actualMonths[i] - detail.months[i]) : '—' }}</td>
      </tr></tbody>
    </table></div>
    <template #foot><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="detail = null">Tutup</button></template>
  </Modal>

  <Modal v-if="showNew" title="Anggaran baru" subtitle="Satu anggaran per cabang & tahun. Isi awal dari realisasi beban & pendapatan tahun acuan (dengan pertumbuhan), atau kosong lalu isi per akun." width="560px" @close="showNew = false">
    <div class="form-grid">
      <div class="field"><label for="bg-branch">Cabang</label><select id="bg-branch" v-model="nf.branch" class="select"><option v-for="x in branches" :key="x.code" :value="x.code">{{ x.code }} · {{ x.short_name || x.name }}</option></select></div>
      <div class="field"><label for="bg-year">Tahun anggaran</label><input id="bg-year" v-model.number="nf.fiscalYear" class="input num" type="number" min="2000" max="2100" data-field="fiscal-year"></div>
      <div class="field form-grid-full"><label for="bg-name">Nama</label><input id="bg-name" v-model="nf.name" class="input" maxlength="120" :placeholder="`Anggaran ${nf.branch} ${nf.fiscalYear}`"></div>
      <div class="field"><label for="bg-src">Isi awal</label><select id="bg-src" v-model="nf.source" class="select" data-field="source"><option value="actual">Dari realisasi tahun acuan</option><option value="empty">Kosong</option></select></div>
      <template v-if="nf.source === 'actual'">
        <div class="field"><label for="bg-from">Tahun acuan</label><input id="bg-from" v-model.number="nf.fromActualYear" class="input num" type="number" min="2000" max="2100"></div>
        <div class="field"><label for="bg-growth">Pertumbuhan (%)</label><input id="bg-growth" v-model.number="nf.growthPct" class="input num" type="number" min="-90" max="500" step="0.5" data-field="growth"></div>
      </template>
      <div v-if="newErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in newErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-new-budget" :disabled="busy" @click="saveNew"><Icon name="check" /> Buat draf</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showNew = false">Batal</button>
    </template>
  </Modal>

  <Modal v-if="showEdit && b" :title="`Ubah baris ${b.name}`" subtitle="Nilai tahunan dibagi rata ke 12 bulan (sisa pembulatan di Desember), atau isi per bulan." width="1100px" @close="showEdit = false">
    <div class="table-scroll"><table class="table" data-table="budget-edit" style="min-width:900px">
      <thead><tr><th style="width:34%">Akun</th><th>Per bulan</th><th class="ta-r">Tahunan</th><th></th></tr></thead>
      <tbody>
        <template v-for="(r, i) in rows" :key="i">
          <tr class="is-static" data-budget-row>
            <td><select v-model="r.account" class="select" aria-label="Akun" data-field="budget-account"><option value="" disabled>— pilih akun detail —</option><option v-for="a in accounts" :key="a.code" :value="a.code">{{ a.code }} · {{ a.name }} ({{ a.category }})</option></select></td>
            <td><label style="display:flex;gap:6px;align-items:center"><input v-model="r.monthly" type="checkbox" @change="r.monthly && r.amounts.every((v) => !v) && (r.amounts = Array.from({ length: 12 }, (_, k) => k < 11 ? Math.floor(r.annual / 12) : r.annual - Math.floor(r.annual / 12) * 11))"> isi per bulan</label></td>
            <td class="ta-r"><input v-if="!r.monthly" v-model.number="r.annual" class="input num" type="number" min="0" step="1000000" style="width:170px;text-align:right" aria-label="Anggaran tahunan" data-field="budget-annual"><b v-else class="num">{{ F.rp(rowTotal(r)) }}</b></td>
            <td><button class="btn btn-icon btn-ghost" aria-label="Hapus baris" @click="rows.splice(i, 1)"><Icon name="minus" /></button></td>
          </tr>
          <tr v-if="r.monthly" class="is-static"><td colspan="4"><div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px">
            <label v-for="(m, k) in MONTHS" :key="m" class="field" style="gap:2px"><span class="field-hint">{{ m }}</span><input v-model.number="r.amounts[k]" class="input num" type="number" min="0" style="text-align:right" :aria-label="`${m}`"></label>
          </div></td></tr>
        </template>
      </tbody>
    </table></div>
    <button class="btn btn-sm btn-ghost" data-action="add-budget-row" @click="addRow"><Icon name="plus" /> Tambah akun</button>
    <div class="totals"><div class="totals-row totals-grand"><span>Total anggaran</span><b>{{ F.rp(rows.reduce((t, r) => t + rowTotal(r), 0)) }}</b></div></div>
    <div v-if="editErrors.length" class="field-hint neg" role="alert"><div v-for="e in editErrors" :key="e">• {{ e }}</div></div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-budget" :disabled="busy" @click="saveEdit"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showEdit = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="pending" :title="pending === 'return' ? 'Kembalikan anggaran ke draf?' : 'Revisi anggaran?'"
    :message="pending === 'return' ? 'Penyusun memperbaiki lalu mengajukan kembali.' : 'Anggaran kembali menjadi draf dan memerlukan persetujuan ulang; selama itu cek anggaran PR tidak memakai anggaran ini.'"
    :confirm-label="pending === 'return' ? 'Kembalikan' : 'Revisi'" :danger="pending === 'return'" :busy="busy" :error="pendingError" @close="pending = null" @confirm="confirm" />
</template>
