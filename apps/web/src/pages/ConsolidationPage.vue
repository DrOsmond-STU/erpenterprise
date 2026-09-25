<script setup lang="ts">
import { computed, ref } from 'vue';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { bsRows, plRows } from '@/lib/statements';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import ReportHead from '@/components/ReportHead.vue';
import StatementTable from '@/components/StatementTable.vue';

const ctx = useContext();
const session = useSession();
const tab = ref<'pl' | 'bs'>('pl');
const { data, loading } = useLoader(() => get('/reports/consolidation'));
const elim = computed(() => data.value.balanceSheet.eliminations.filter((e: any) => e.code.startsWith('1')).reduce((s: number, e: any) => s + e.amount, 0));
const totals = computed(() => data.value.kpis.reduce((t: any, k: any) => ({ revenue: t.revenue + k.revenue, gross: t.gross + k.gross, net: t.net + k.net, cash: t.cash + k.cash, totalAssets: t.totalAssets + k.totalAssets }), { revenue: 0, gross: 0, net: 0, cash: 0, totalAssets: 0 }));
</script>

<template>
  <ReportHead title="Laporan Konsolidasi" :sub="`Gabungan seluruh cabang aktif ${session.company?.name} dengan eliminasi rekening koran antar kantor.`" />
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <template v-else-if="data">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Pendapatan konsolidasi" :value="F.rpCompact(data.incomeStatement.combined.revenue)" />
      <KpiTile label="Laba bersih konsolidasi" :value="F.rpCompact(data.incomeStatement.combined.net)" :tone="data.incomeStatement.combined.net < 0 ? 'neg' : 'pos'" :foot="`Margin ${F.pct(data.incomeStatement.combined.netMargin)}`" />
      <KpiTile label="Total aset konsolidasi" :value="F.rpCompact(data.balanceSheet.combined.totalAssets - elim)" :foot="`per ${F.date(data.period.to)}`" />
      <KpiTile label="Eliminasi RK antar kantor" :value="F.rpCompact(elim)" :foot="data.intercompanyMismatch === 0 ? 'RK Cabang = Σ RK Kantor Pusat' : `Selisih ${F.rpCompact(data.intercompanyMismatch)}`" :tone="data.intercompanyMismatch === 0 ? '' : 'neg'" />
    </div>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Kontribusi per cabang</h2><span class="card-note">Periode {{ data.period.label }} · klik cabang untuk membatasi seluruh aplikasi ke cabang tersebut</span></div></div>
      <div class="table-scroll"><table class="table">
        <thead><tr><th>Cabang</th><th class="ta-r">Pendapatan</th><th class="ta-r">Laba kotor</th><th class="ta-r">Laba bersih</th><th class="ta-r">Margin</th><th class="ta-r">Kas</th><th class="ta-r">Total aset</th></tr></thead>
        <tbody>
          <tr v-for="k in data.kpis" :key="k.branch" @click="ctx.branch = k.branch">
            <td><span class="cell-strong">{{ k.name }}</span></td><td class="ta-r num">{{ F.amt(k.revenue) }}</td><td class="ta-r num">{{ F.amt(k.gross) }}</td><td class="ta-r num" :class="{ neg: k.net < 0 }">{{ F.amt(k.net) }}</td><td class="ta-r num">{{ F.pct(k.netMargin) }}</td><td class="ta-r num">{{ F.amt(k.cash) }}</td><td class="ta-r num">{{ F.amt(k.totalAssets) }}</td>
          </tr>
        </tbody>
        <tfoot><tr class="report-total"><td>Konsolidasi (setelah eliminasi)</td><td class="ta-r num">{{ F.amt(totals.revenue, true) }}</td><td class="ta-r num">{{ F.amt(totals.gross, true) }}</td><td class="ta-r num">{{ F.amt(totals.net, true) }}</td><td class="ta-r num">{{ F.pct(data.incomeStatement.combined.netMargin) }}</td><td class="ta-r num">{{ F.amt(totals.cash, true) }}</td><td class="ta-r num">{{ F.amt(totals.totalAssets - elim, true) }}</td></tr></tfoot>
      </table></div>
    </article>
    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: tab === 'pl' }" @click="tab = 'pl'"><Icon name="trending" /> Laba rugi konsolidasi</button>
      <button class="tab-btn" :class="{ active: tab === 'bs' }" data-cons-tab="neraca" @click="tab = 'bs'"><Icon name="columns" /> Neraca konsolidasi</button>
    </div>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">{{ tab === 'pl' ? `Laba rugi konsolidasi — ${data.period.label}` : `Neraca konsolidasi — per ${F.date(data.period.to)}` }}</h2><span class="card-note">Kolom per cabang{{ tab === 'bs' ? ', eliminasi RK antar kantor,' : '' }} dan hasil konsolidasi · dalam rupiah</span></div></div>
      <div class="table-scroll">
        <StatementTable v-if="tab === 'pl'" :columns="[...data.incomeStatement.columns.map((c: any) => c.label), 'Konsolidasi']" :rows="plRows([...data.incomeStatement.columns.map((c: any) => c.report), data.incomeStatement.combined], false)" />
        <StatementTable v-else :columns="[...data.balanceSheet.columns.map((c: any) => c.label), 'Eliminasi', 'Konsolidasi']" :rows="bsRows(data.balanceSheet.columns.map((c: any) => c.report), data.balanceSheet.combined, data.balanceSheet.eliminations)" />
      </div>
    </article>
  </template>
</template>
