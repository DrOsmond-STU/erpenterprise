<script setup lang="ts">
import { computed } from 'vue';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { bsRows } from '@/lib/statements';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';
import StatementTable from '@/components/StatementTable.vue';

const ctx = useContext();
const session = useSession();
const wantMulti = computed(() => ctx.branch === 'ALL' && session.can('report.consolidated'));
const { data, loading } = useLoader(() => (wantMulti.value ? get('/reports/consolidation') : get('/reports/balance-sheet')));
const multi = computed(() => Boolean(data.value && 'balanceSheet' in data.value));
const bs = computed(() => (multi.value ? data.value.balanceSheet.combined : data.value));
const rows = computed(() => (multi.value ? bsRows(data.value.balanceSheet.columns.map((c: any) => c.report), data.value.balanceSheet.combined, data.value.balanceSheet.eliminations) : bsRows([data.value])));
const columns = computed(() => (multi.value ? [...data.value.balanceSheet.columns.map((c: any) => c.label), 'Eliminasi', 'Konsolidasi'] : [ctx.branchShort]));
const elim = computed(() => (multi.value ? data.value.balanceSheet.eliminations.filter((e: any) => e.code.startsWith('1')).reduce((s: number, e: any) => s + e.amount, 0) : 0));
</script>

<template>
  <ReportHead title="Neraca" sub="Posisi keuangan pada akhir periode: aset, liabilitas, dan ekuitas termasuk laba periode berjalan.">
    <RouterLink class="btn" to="/laba-rugi"><Icon name="trending" /> Laba rugi</RouterLink>
  </ReportHead>
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <template v-else-if="data">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Total aset" :value="F.rpCompact(bs.totalAssets - elim)" :foot="`Lancar ${F.rpCompact(bs.currentAssets)} · tetap ${F.rpCompact(bs.fixedAssets)}`" />
      <KpiTile label="Total liabilitas" :value="F.rpCompact(bs.totalLiab)" />
      <KpiTile label="Total ekuitas" :value="F.rpCompact(bs.totalEquity - elim)" :foot="`Termasuk laba berjalan ${F.rpCompact(bs.profit)}`" />
      <div class="kpi-tile"><span class="kpi-label">Keseimbangan</span><span class="kpi-value"><Pill :label="bs.balanced ? 'Aset = Liabilitas + Ekuitas' : `Selisih ${F.rpCompact(bs.totalAssets - bs.totalLiabEquity)}`" :tone="bs.balanced ? 'ok' : 'danger'" /></span><span class="kpi-foot">per {{ F.date(bs.asOf) }}</span></div>
    </div>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">{{ session.company?.name }} — {{ ctx.branchName }}</h2><span class="card-note">Per {{ F.date(bs.asOf) }} · dalam rupiah · laba periode berjalan dihitung sejak awal tahun buku</span></div></div>
      <div class="table-scroll"><StatementTable :columns="columns" :rows="rows" /></div>
      <p v-if="multi" class="card-note" style="padding:var(--sp-3)">Eliminasi: RK Cabang pada buku kantor pusat dihapus terhadap RK Kantor Pusat pada buku tiap cabang. Setelah eliminasi, total aset konsolidasi sama dengan total liabilitas &amp; ekuitas konsolidasi.</p>
    </article>
  </template>
</template>
