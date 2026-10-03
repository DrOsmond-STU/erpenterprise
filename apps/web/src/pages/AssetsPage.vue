<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { ASSET_CATEGORIES, monthOf } from '@/lib/assets';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { todayWib } from '@/lib/sales';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import AssetDrawer from '@/components/AssetDrawer.vue';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any>(() => get('/assets'));
const assets = computed<any[]>(() => data.value?.assets ?? []);
const q = ref('');
const showDisposed = ref(false);
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return assets.value.filter((a) => (showDisposed.value || a.status === 'aktif') && (!s || [a.code, a.name, a.category, a.location ?? ''].some((x) => String(x).toLowerCase().includes(s))));
});
const pg = usePaged<any>(filtered, 10);
watch([q, showDisposed], pg.reset);
const kpi = computed(() => {
  const act = assets.value.filter((a) => a.status === 'aktif');
  return { cost: act.reduce((t, a) => t + a.cost, 0), accum: act.reduce((t, a) => t + a.accumulated, 0), nbv: act.reduce((t, a) => t + a.bookValue, 0), monthly: act.reduce((t, a) => t + a.monthly, 0), count: act.length };
});
const openId = ref<string | null>(null);

/* Penyusutan */
const period = ref(monthOf(ctx.period) ?? todayWib().slice(0, 7));
watch(() => ctx.period, (p) => { if (monthOf(p)) period.value = monthOf(p)!; });
const preview = ref<any>(null);
const runs = useLoader<any[]>(() => get('/assets/depreciation/runs'));
async function loadPreview() { try { preview.value = await get(`/assets/depreciation/preview?period=${period.value}`); } catch (e) { preview.value = null; toast.error(e, 'Pratinjau penyusutan gagal'); } }
watch([period, () => ctx.branch], loadPreview, { immediate: true });
const runnable = computed(() => preview.value?.branches?.some((b: any) => !b.done && b.total > 0 && !b.lagging.length));
const busy = ref(false);
async function runDepreciation() {
  busy.value = true;
  try {
    const r = await post('/assets/depreciation/run', { period: period.value });
    toast.push('Penyusutan diposting', r.posted.map((p: any) => `${p.branch} ${F.rpCompact(p.total)}`).join(' · '), 'ok');
    await Promise.all([reload(), runs.reload(), loadPreview()]);
  } catch (e) { toast.error(e, 'Penyusutan tidak dapat dijalankan'); } finally { busy.value = false; }
}

/* Perolehan */
const show = ref(false);
const banks = ref<any[]>([]);
const form = ref({ name: '', category: ASSET_CATEGORIES[0], glAccount: '', branch: '', location: '', acquisitionDate: todayWib(), cost: 0, usefulLifeMonths: 48, salvage: 0, bank: '' });
const errors = ref<string[]>([]);
const branchOptions = computed(() => session.branches.filter((b) => session.user?.branches === '*' || (session.user?.branches ?? []).includes(b.code)));
const bankOptions = computed(() => banks.value.filter((b) => b.status === 'aktif' && b.currency === 'IDR' && b.branchCode === form.value.branch));
const monthly = computed(() => (form.value.usefulLifeMonths > 0 ? Math.round((Number(form.value.cost) - Number(form.value.salvage || 0)) / form.value.usefulLifeMonths) : 0));
async function openNew() {
  errors.value = [];
  try { banks.value = (await get('/ledger/bank-accounts', { scoped: false })).accounts ?? []; } catch (e) { toast.error(e, 'Rekening tidak dapat dimuat'); return; }
  const br = ctx.branch === 'ALL' ? branchOptions.value[0]?.code ?? '' : ctx.branch;
  form.value = { name: '', category: ASSET_CATEGORIES[0], glAccount: data.value?.glOptions?.[0]?.code ?? '', branch: br, location: '', acquisitionDate: todayWib(), cost: 0, usefulLifeMonths: 48, salvage: 0, bank: '' };
  show.value = true;
}
watch(() => form.value.branch, () => { form.value.bank = bankOptions.value.find((b) => b.bankName !== 'Kas')?.code ?? bankOptions.value[0]?.code ?? ''; });
async function save() {
  errors.value = []; busy.value = true;
  try {
    const f = form.value;
    const r = await post('/assets', { ...f, location: f.location || undefined, cost: Math.round(Number(f.cost)), salvage: Math.round(Number(f.salvage || 0)), usefulLifeMonths: Number(f.usefulLifeMonths) });
    toast.push('Aset dicatat', `${r.code} · ${F.rp(r.cost)} — jurnal perolehan diposting`, 'ok'); show.value = false; await Promise.all([reload(), loadPreview()]); openId.value = r.id;
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Aset Tetap & Penyusutan" sub="Register aset tetap per cabang. Perolehan dijurnal Dr aset / Cr bank; penyusutan garis lurus bulanan per cabang Dr beban penyusutan / Cr akumulasi; pelepasan mencatat laba/rugi. Register selalu direkonsiliasi dengan buku besar.">
    <button v-if="session.can('asset.manage')" class="btn btn-primary" data-action="new-asset" @click="openNew"><Icon name="plus" /> Aset baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Harga perolehan" :value="F.rpCompact(kpi.cost)" :foot="`${kpi.count} aset aktif`" />
    <KpiTile label="Akumulasi penyusutan" :value="F.rpCompact(kpi.accum)" foot="1-2901" />
    <KpiTile label="Nilai buku" :value="F.rpCompact(kpi.nbv)" :foot="ctx.branchShort" />
    <KpiTile label="Penyusutan per bulan" :value="F.rpCompact(kpi.monthly)" foot="Garis lurus" />
  </div>

  <article class="card" style="margin-bottom:var(--sp-4)" data-depreciation>
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">Penyusutan bulanan</h2><span class="card-note">Satu jurnal per cabang per bulan; bulan tidak boleh dilompati.</span></div>
      <input v-model="period" class="input" type="month" style="max-width:170px" aria-label="Periode penyusutan" data-field="depr-period">
      <button v-if="session.can('asset.depreciate')" class="btn btn-primary" data-action="run-depreciation" :disabled="busy || !runnable" @click="runDepreciation"><Icon name="check" /> Posting penyusutan</button></div>
    <div v-if="preview" class="table-scroll"><table class="table" data-table="depr-preview">
      <thead><tr><th>Cabang</th><th class="ta-r">Aset</th><th class="ta-r">Penyusutan</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="b in preview.branches" :key="b.branch" class="is-static" :data-depr-branch="b.branch">
          <td><BranchTag :code="b.branch" /></td><td class="ta-r num">{{ b.count }}</td><td class="ta-r num">{{ F.rp(b.total) }}</td>
          <td><Pill v-if="b.done" status="diposting" /><Pill v-else-if="b.lagging.length" tone="danger" :label="`Tertinggal: ${b.lagging.join(', ')}`" /><Pill v-else-if="b.total" tone="warn" label="Siap diposting" /><span v-else class="muted">—</span></td>
        </tr>
        <tr v-if="!preview.branches.length" class="is-static"><td colspan="4"><span class="muted">Tidak ada aset aktif.</span></td></tr>
      </tbody>
    </table></div>
    <details v-if="runs.data.value?.length" style="padding:var(--sp-3) var(--sp-4)"><summary>Riwayat penyusutan ({{ runs.data.value.length }})</summary>
      <div class="table-scroll"><table class="table"><tbody>
        <tr v-for="r in runs.data.value" :key="r.id" class="is-static"><td class="code">{{ r.docNo }}</td><td>{{ r.period }}</td><td><BranchTag :code="r.branch" /></td><td class="ta-r num">{{ F.rp(r.total) }}</td><td>{{ r.byName }}</td></tr>
      </tbody></table></div></details>
  </article>

  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari kode, nama, kategori, lokasi…" aria-label="Cari aset"></div>
      <label class="chip" :aria-pressed="showDisposed" style="cursor:pointer"><input v-model="showDisposed" type="checkbox" style="margin-right:6px">Tampilkan aset dilepas</label>
    </div>
    <div class="table-scroll"><table class="table" data-table="assets">
      <thead><tr><th>Aset</th><th>Lokasi</th><th>Diperoleh</th><th class="ta-r">Harga perolehan</th><th class="ta-r">Akumulasi</th><th class="ta-r">Nilai buku</th><th>Disusutkan s.d.</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="8"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="a in pg.pageRows.value" :key="a.id" data-row :data-asset="a.code" @click="openId = a.id">
          <td><span class="cell-strong">{{ a.name }}</span><span class="cell-sub"><span class="code">{{ a.code }}</span> · {{ a.category }} · {{ a.glAccount }}</span></td>
          <td>{{ a.location || '—' }}<span class="cell-sub"><BranchTag :code="a.branch" /></span></td>
          <td class="num">{{ F.date(a.acquisitionDate) }}</td><td class="ta-r num">{{ F.rpCompact(a.cost) }}</td><td class="ta-r num">{{ F.rpCompact(a.accumulated) }}</td>
          <td class="ta-r num cell-strong">{{ F.rpCompact(a.bookValue) }}</td><td class="num">{{ a.depreciatedThrough ? F.date(a.depreciatedThrough) : '—' }}</td><td><Pill :status="a.status" /></td>
        </tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="aset" />
  </article>

  <AssetDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload(); loadPreview()" />
  <Modal v-if="show" title="Perolehan aset tetap" subtitle="Dibayar dari rekening cabang aset; penyusutan dimulai pada bulan perolehan." width="640px" @close="show = false">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="as-name">Nama aset</label><input id="as-name" v-model="form.name" class="input" maxlength="120"></div>
      <div class="field"><label for="as-cat">Kategori</label><input id="as-cat" v-model="form.category" class="input" list="as-cats" maxlength="60"><datalist id="as-cats"><option v-for="c in ASSET_CATEGORIES" :key="c" :value="c" /></datalist></div>
      <div class="field"><label for="as-gl">Akun aset</label><select id="as-gl" v-model="form.glAccount" class="select"><option v-for="g in data?.glOptions ?? []" :key="g.code" :value="g.code">{{ g.code }} · {{ g.name }}</option></select></div>
      <div class="field"><label for="as-branch">Cabang</label><select id="as-branch" v-model="form.branch" class="select"><option v-for="b in branchOptions" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name }}</option></select></div>
      <div class="field"><label for="as-loc">Lokasi</label><input id="as-loc" v-model="form.location" class="input" maxlength="120"></div>
      <div class="field"><label for="as-date">Tanggal perolehan</label><input id="as-date" v-model="form.acquisitionDate" class="input" type="date"></div>
      <div class="field"><label for="as-cost">Harga perolehan (Rp)</label><input id="as-cost" v-model.number="form.cost" class="input num" type="number" min="0" step="1000" style="text-align:right"></div>
      <div class="field"><label for="as-life">Umur manfaat (bulan)</label><input id="as-life" v-model.number="form.usefulLifeMonths" class="input num" type="number" min="1" style="text-align:right"></div>
      <div class="field"><label for="as-salvage">Nilai residu (Rp)</label><input id="as-salvage" v-model.number="form.salvage" class="input num" type="number" min="0" step="1000" style="text-align:right">
        <span class="field-hint">Penyusutan per bulan <b data-monthly>{{ F.rp(monthly) }}</b></span></div>
      <div class="field"><label for="as-bank">Dibayar dari</label><select id="as-bank" v-model="form.bank" class="select"><option v-for="b in bankOptions" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }}</option></select></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-asset" :disabled="busy || !form.name || !form.glAccount || !form.bank || !(form.cost > 0)" @click="save"><Icon name="check" /> Catat & posting</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="show = false">Batal</button>
    </template>
  </Modal>
</template>
