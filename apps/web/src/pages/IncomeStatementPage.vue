<script setup lang="ts">
import { computed } from 'vue';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { plRows } from '@/lib/statements';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import ReportHead from '@/components/ReportHead.vue';
import StatementTable from '@/components/StatementTable.vue';

const ctx = useContext();
const session = useSession();
const wantMulti = computed(() => ctx.branch === 'ALL' && session.can('report.consolidated'));
const { data: pl, loading } = useLoader(() => (wantMulti.value ? get('/reports/consolidation') : get('/reports/income-statement')));
/* Mode tampilan mengikuti bentuk data yang benar-benar dimuat, bukan konteks yang mungkin sudah berubah. */
const multi = computed(() => Boolean(pl.value && 'incomeStatement' in pl.value));
const reports = computed(() => (multi.value ? [...pl.value.incomeStatement.columns.map((c: any) => c.report), pl.value.incomeStatement.combined] : [pl.value]));
const columns = computed(() => (multi.value ? [...pl.value.incomeStatement.columns.map((c: any) => c.label), 'Konsolidasi'] : [ctx.branchShort]));
const summary = computed(() => (multi.value ? pl.value.incomeStatement.combined : pl.value));
</script>

<template>
  <ReportHead title="Laporan Laba Rugi" sub="Pendapatan, harga pokok, beban operasional, dan laba bersih periode berjalan — disusun dari neraca saldo.">
    <RouterLink class="btn" to="/neraca"><Icon name="columns" /> Neraca</RouterLink>
  </ReportHead>
  <div v-if="loading && !pl" class="loading">Memuat…</div>
  <template v-else-if="pl">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Pendapatan" :value="F.rpCompact(summary.revenue)" />
      <KpiTile label="Laba kotor" :value="F.rpCompact(summary.gross)" :foot="`Margin ${F.pct(summary.grossMargin)}`" />
      <KpiTile label="Laba operasional" :value="F.rpCompact(summary.operating)" :tone="summary.operating < 0 ? 'neg' : ''" />
      <KpiTile label="Laba bersih" :value="F.rpCompact(summary.net)" :tone="summary.net < 0 ? 'neg' : 'pos'" :foot="`Margin bersih ${F.pct(summary.netMargin)}`" />
    </div>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">{{ session.company?.name }} — {{ ctx.branchName }}</h2><span class="card-note">Periode {{ pl.period.label }} ({{ F.date(pl.period.from) }} s.d. {{ F.date(pl.period.to) }}) · dalam rupiah</span></div></div>
      <div class="table-scroll"><StatementTable :columns="columns" :rows="plRows(reports, !multi)" :pct-header="multi ? undefined : '% pendapatan'" /></div>
      <p v-if="multi" class="card-note" style="padding:var(--sp-3)">Transfer barang antar cabang dicatat pada harga pokok melalui rekening koran antar kantor sehingga tidak menimbulkan pendapatan antar cabang; laba rugi konsolidasi adalah penjumlahan seluruh cabang.</p>
    </article>
  </template>
</template>
