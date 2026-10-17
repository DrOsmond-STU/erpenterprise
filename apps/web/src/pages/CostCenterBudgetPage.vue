<script setup lang="ts">
import { computed, ref } from 'vue';
import { get } from '@/lib/api';
import { KIND_LABEL } from '@/lib/cost-centers';
import * as F from '@/lib/format';
import { MONTHS } from '@/lib/planning';
import { todayWib } from '@/lib/sales';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import DataTools from '@/components/DataTools.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const session = useSession();
const asOf = ref(todayWib());
const year = ref(Number(todayWib().slice(0, 4)));
const query = computed(() => `?year=${year.value}&asOf=${asOf.value}`);
const { data: r, loading } = useLoader<any>(() => get(`/reports/cost-centers/budget${query.value}`), [query]);
const upTo = computed(() => (r.value?.elapsedMonths ? MONTHS[r.value.elapsedMonths - 1] : '—'));
const hasRevenue = computed(() => (r.value?.rows ?? []).some((x: any) => x.revenue.budget > 0 || x.revenue.actual !== 0));
const ytdVariance = computed(() => (r.value ? r.value.totals.expense.actual - r.value.totals.expense.ytdBudget : 0));
const detail = ref<any>(null);
const tone = (v: number) => (v > 0 ? 'neg' : v < 0 ? 'pos' : '');
const achieve = (actual: number, budget: number) => (budget > 0 ? Math.round((actual / budget) * 1000) / 10 : 0);
const maxMonth = (d: any) => Math.max(1, ...d.monthly.expenseBudget, ...d.monthly.expenseActual);
</script>

<template>
  <ReportHead title="Laporan Anggaran per Pusat Biaya" sub="Anggaran pusat biaya yang disetujui dibandingkan realisasi buku besar bertanda pusat biaya dan komitmen pengadaan bertanda (PO jasa belum ditagih, draf tagihan, PR disetujui). Serapan = (realisasi + komitmen) ÷ anggaran; prakiraan = realisasi + komitmen + anggaran bulan yang belum berjalan.">
    <input v-model.number="year" class="input num" type="number" min="2000" max="2100" style="max-width:110px" aria-label="Tahun anggaran" data-field="cc-budget-year">
    <input v-model="asOf" class="input" type="date" style="max-width:170px" aria-label="Per tanggal" data-field="cc-budget-asof">
    <RouterLink class="btn" to="/anggaran"><Icon name="wallet" /> Anggaran</RouterLink>
    <RouterLink v-if="session.can('ledger.report.read')" class="btn" to="/laba-rugi-pusat-biaya"><Icon name="trending" /> Laba rugi per pusat biaya</RouterLink>
  </ReportHead>
  <div v-if="loading && !r" class="loading">Memuat…</div>
  <template v-else-if="r">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Anggaran beban setahun" :value="F.rpCompact(r.totals.expense.budget)" :foot="`${r.rows.length} pusat biaya · ${ctx.branchShort} ${r.year}`" />
      <KpiTile label="Realisasi beban" :value="F.rpCompact(r.totals.expense.actual)" :foot="`anggaran s.d. ${upTo}: ${F.rpCompact(r.totals.expense.ytdBudget)}`" :tone="ytdVariance > 0 ? 'neg' : ''" />
      <KpiTile label="Serapan" :value="F.pct(r.totals.expense.absorption)" :foot="`komitmen ${F.rpCompact(r.totals.expense.commitment)}`" :tone="r.totals.expense.absorption > 100 ? 'neg' : ''" />
      <KpiTile label="Prakiraan akhir tahun" :value="F.rpCompact(r.totals.expense.forecast)" :foot="`${r.totals.expense.variance > 0 ? 'melampaui' : 'di bawah'} ${F.rpCompact(Math.abs(r.totals.expense.variance))}`" :tone="r.totals.expense.variance > 0 ? 'neg' : 'pos'" />
    </div>
    <div v-if="r.pending.length" class="card" style="margin-bottom:var(--sp-4);padding:var(--sp-3) var(--sp-4);display:flex;gap:var(--sp-3);align-items:center;flex-wrap:wrap" data-cc-budget-pending>
      <Pill status="menunggu" /><span class="muted">{{ r.pending.length }} anggaran pusat biaya belum disetujui dan belum dihitung: {{ r.pending.map((p: any) => `${p.branch}·${p.costCenterCode} (${p.status})`).join(', ') }}.</span>
      <RouterLink class="btn btn-sm" to="/anggaran">Buka anggaran</RouterLink>
    </div>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Beban per pusat biaya</h2><span class="card-note">Tahun {{ r.year }} · per {{ F.date(r.asOf) }} ({{ r.elapsedMonths }} bulan berjalan) · {{ ctx.branchName }} · klik baris untuk rincian akun &amp; bulanan</span></div></div>
      <div class="toolbar"><DataTools placeholder="Cari pusat biaya…" /></div>
      <div class="table-scroll"><table class="table" data-table="cc-budget">
        <thead><tr><th style="min-width:260px">Pusat biaya</th><th class="ta-r">Anggaran</th><th class="ta-r">s.d. {{ upTo }}</th><th class="ta-r">Realisasi</th><th class="ta-r">Selisih s.d. {{ upTo }}</th><th class="ta-r">Komitmen</th><th class="ta-r">Sisa</th><th class="ta-r">Prakiraan</th><th>Serapan</th></tr></thead>
        <tbody>
          <tr v-for="x in r.rows" :key="x.costCenterId" data-row :data-cc-budget="x.code" @click="detail = x">
            <td><span class="cell-strong"><span class="code">{{ x.code }}</span> {{ x.name }}</span><span class="cell-sub">{{ KIND_LABEL[x.kind] }}<template v-if="x.parentCode"> · di bawah {{ x.parentCode }}</template> · {{ x.budgets.map((b: any) => b.branch).join(', ') }}<template v-if="x.unbudgetedExpense"> · tak dianggarkan {{ F.rpCompact(x.unbudgetedExpense) }}</template></span></td>
            <td class="ta-r num">{{ F.rp(x.expense.budget) }}</td><td class="ta-r num">{{ F.rp(x.expense.ytdBudget) }}</td><td class="ta-r num">{{ F.rp(x.expense.actual) }}</td>
            <td class="ta-r num" :class="tone(x.expense.ytdVariance)">{{ F.rp(x.expense.ytdVariance) }}</td>
            <td class="ta-r num">{{ x.expense.commitment ? F.rp(x.expense.commitment) : '—' }}</td>
            <td class="ta-r num" :class="x.expense.available < 0 ? 'neg' : ''">{{ F.rp(x.expense.available) }}</td>
            <td class="ta-r num" :class="tone(x.expense.variance)">{{ F.rp(x.expense.forecast) }}</td>
            <td><div class="meter"><span class="meter-track"><span class="meter-fill" :style="{ width: Math.min(x.expense.absorption, 100) + '%' }" :data-tone="x.expense.absorption > 100 ? 'danger' : x.expense.over ? 'warn' : undefined"></span></span><span class="meter-val">{{ F.pct(x.expense.absorption) }}</span></div></td>
          </tr>
          <tr v-if="!r.rows.length" class="is-static"><td colspan="9"><div class="empty"><div class="empty-card"><span class="empty-title">Belum ada anggaran pusat biaya disetujui</span><span class="empty-note">Buat anggaran di menu Anggaran dengan memilih pusat biaya, ajukan, lalu setujui.</span></div></div></td></tr>
        </tbody>
        <tfoot v-if="r.rows.length"><tr class="is-static"><td class="cell-strong">Total</td><td class="ta-r num">{{ F.rp(r.totals.expense.budget) }}</td><td class="ta-r num">{{ F.rp(r.totals.expense.ytdBudget) }}</td><td class="ta-r num">{{ F.rp(r.totals.expense.actual) }}</td><td class="ta-r num" :class="tone(ytdVariance)">{{ F.rp(ytdVariance) }}</td><td class="ta-r num">{{ F.rp(r.totals.expense.commitment) }}</td><td class="ta-r num">{{ F.rp(r.totals.expense.available) }}</td><td class="ta-r num">{{ F.rp(r.totals.expense.forecast) }}</td><td>{{ F.pct(r.totals.expense.absorption) }}</td></tr></tfoot>
      </table></div>
    </article>
    <article v-if="hasRevenue" class="card" style="margin-top:var(--sp-4)">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Pendapatan &amp; laba pusat laba</h2><span class="card-note">Capaian = realisasi ÷ anggaran s.d. {{ upTo }}</span></div></div>
      <div class="toolbar"><DataTools placeholder="Cari pusat laba…" /></div>
      <div class="table-scroll"><table class="table" data-table="cc-budget-revenue">
        <thead><tr><th style="min-width:260px">Pusat biaya</th><th class="ta-r">Anggaran pendapatan</th><th class="ta-r">s.d. {{ upTo }}</th><th class="ta-r">Realisasi</th><th>Capaian</th><th class="ta-r">Laba anggaran s.d. {{ upTo }}</th><th class="ta-r">Laba realisasi</th></tr></thead>
        <tbody><tr v-for="x in r.rows.filter((y: any) => y.revenue.budget > 0 || y.revenue.actual !== 0)" :key="x.costCenterId" class="is-static">
          <td><span class="code">{{ x.code }}</span> {{ x.name }}</td>
          <td class="ta-r num">{{ F.rp(x.revenue.budget) }}</td><td class="ta-r num">{{ F.rp(x.revenue.ytdBudget) }}</td><td class="ta-r num">{{ F.rp(x.revenue.actual) }}</td>
          <td><div class="meter"><span class="meter-track"><span class="meter-fill" :style="{ width: Math.min(achieve(x.revenue.actual, x.revenue.ytdBudget), 100) + '%' }" :data-tone="achieve(x.revenue.actual, x.revenue.ytdBudget) < 90 ? 'warn' : undefined"></span></span><span class="meter-val">{{ F.pct(achieve(x.revenue.actual, x.revenue.ytdBudget)) }}</span></div></td>
          <td class="ta-r num">{{ F.rp(x.profit.ytdBudget) }}</td><td class="ta-r num" :class="x.profit.actual < x.profit.ytdBudget ? 'neg' : 'pos'">{{ F.rp(x.profit.actual) }}</td>
        </tr></tbody>
      </table></div>
    </article>
  </template>

  <Modal v-if="detail" :title="`${detail.code} ${detail.name}`" :subtitle="`Anggaran vs realisasi · ${r.year} · ${detail.budgets.map((b: any) => b.name).join('; ')}`" width="860px" @close="detail = null">
    <div class="table-scroll"><table class="table" data-table="cc-budget-lines">
      <thead><tr><th style="min-width:220px">Akun</th><th class="ta-r">Anggaran</th><th class="ta-r">s.d. {{ upTo }}</th><th class="ta-r">Realisasi</th><th class="ta-r">Komitmen</th><th class="ta-r">Prakiraan</th><th>Serapan</th></tr></thead>
      <tbody><tr v-for="l in detail.lines" :key="l.account" class="is-static">
        <td><span class="code">{{ l.account }}</span> {{ l.accountName }}<span class="cell-sub">{{ l.category }}</span></td>
        <td class="ta-r num">{{ F.rp(l.budget) }}</td><td class="ta-r num">{{ F.rp(l.ytdBudget) }}</td><td class="ta-r num">{{ F.rp(l.actual) }}</td><td class="ta-r num">{{ l.commitment ? F.rp(l.commitment) : '—' }}</td>
        <td class="ta-r num" :class="l.category === 'Pendapatan' ? tone(-l.variance) : tone(l.variance)">{{ F.rp(l.forecast) }}</td><td>{{ F.pct(l.absorption) }}</td>
      </tr></tbody>
    </table></div>
    <div class="section" style="margin-top:var(--sp-3)"><span class="section-title">Beban per bulan — anggaran vs realisasi</span>
      <div class="table-scroll"><table class="table" data-table="cc-budget-months">
        <thead><tr><th>Bulan</th><th class="ta-r">Anggaran</th><th class="ta-r">Realisasi</th><th style="width:40%"></th><th class="ta-r">Selisih</th></tr></thead>
        <tbody><tr v-for="(m, i) in MONTHS" :key="m" class="is-static" :class="{ muted: i >= r.elapsedMonths }">
          <td>{{ m }}</td><td class="ta-r num">{{ F.rp(detail.monthly.expenseBudget[i]) }}</td><td class="ta-r num">{{ F.rp(detail.monthly.expenseActual[i]) }}</td>
          <td><div style="display:grid;gap:2px">
            <span class="meter-track" style="display:block"><span class="meter-fill" style="display:block;height:100%" :style="{ width: (detail.monthly.expenseBudget[i] / maxMonth(detail)) * 100 + '%' }" data-tone="warn"></span></span>
            <span class="meter-track" style="display:block"><span class="meter-fill" style="display:block;height:100%" :style="{ width: (Math.max(detail.monthly.expenseActual[i], 0) / maxMonth(detail)) * 100 + '%' }" :data-tone="detail.monthly.expenseActual[i] > detail.monthly.expenseBudget[i] ? 'danger' : undefined"></span></span>
          </div></td>
          <td class="ta-r num" :class="i < r.elapsedMonths ? tone(detail.monthly.expenseActual[i] - detail.monthly.expenseBudget[i]) : ''">{{ i < r.elapsedMonths ? F.rp(detail.monthly.expenseActual[i] - detail.monthly.expenseBudget[i]) : '—' }}</td>
        </tr></tbody>
      </table></div>
      <span class="field-hint">Batang atas = anggaran, batang bawah = realisasi.</span>
    </div>
    <template #foot><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="detail = null">Tutup</button></template>
  </Modal>
</template>
