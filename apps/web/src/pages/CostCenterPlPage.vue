<script setup lang="ts">
import { computed, ref } from 'vue';
import { get } from '@/lib/api';
import { costCenterOptions, KIND_LABEL } from '@/lib/cost-centers';
import * as F from '@/lib/format';
import { plRows } from '@/lib/statements';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import DataTools from '@/components/DataTools.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';
import StatementTable from '@/components/StatementTable.vue';

const ctx = useContext();
const session = useSession();
const { options } = costCenterOptions();
const costCenter = ref('');
const rollup = ref(false);
const tab = ref<'laporan' | 'ringkasan'>('laporan');
const query = computed(() => (costCenter.value ? `?costCenter=${costCenter.value}` : rollup.value ? '?rollup=true' : ''));
const { data: r, loading } = useLoader<any>(() => get(`/reports/cost-centers/income-statement${query.value}`), [query]);
const single = computed(() => Boolean(r.value?.costCenter));
const reports = computed(() => (r.value ? (single.value ? r.value.reports : [...r.value.reports, ...(r.value.unassigned ? [r.value.unassigned] : []), r.value.total]) : []));
const columns = computed(() => (r.value ? (single.value ? r.value.columns.map((c: any) => c.code) : [...r.value.columns.map((c: any) => c.code), ...(r.value.unassigned ? ['Tanpa pusat biaya'] : []), 'Total']) : []));
const top = computed(() => [...(r.value?.summary ?? [])].filter((x: any) => x.code).sort((a: any, b: any) => b.expense - a.expense)[0]);
</script>

<template>
  <ReportHead title="Laba Rugi per Pusat Biaya" sub="Laba rugi periode berjalan dipecah menurut pusat biaya pada baris jurnal. Kolom “Tanpa pusat biaya” memuat transaksi yang belum ditandai sehingga kolom Total selalu sama dengan Laporan Laba Rugi.">
    <select v-model="costCenter" class="select" style="max-width:260px" aria-label="Pusat biaya" data-field="pl-cost-center">
      <option value="">Semua pusat biaya</option>
      <option v-for="o in options" :key="o.id" :value="o.id">{{ o.code }} · {{ o.name }}</option>
    </select>
    <label v-if="!costCenter" class="btn btn-ghost" style="gap:6px"><input v-model="rollup" type="checkbox" data-field="pl-rollup"> Gabung ke induk</label>
    <RouterLink class="btn" to="/laba-rugi"><Icon name="trending" /> Laba rugi</RouterLink>
    <RouterLink v-if="session.can('costcenter.read')" class="btn" to="/pusat-biaya"><Icon name="layers" /> Pusat biaya</RouterLink>
  </ReportHead>
  <div v-if="loading && !r" class="loading">Memuat…</div>
  <template v-else-if="r">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Pendapatan" :value="F.rpCompact(r.total.revenue)" :foot="single ? r.columns[0]?.name : `${F.pct(r.coverage.revenuePct)} bertanda pusat biaya`" />
      <KpiTile label="Laba bersih" :value="F.rpCompact(r.total.net)" :tone="r.total.net < 0 ? 'neg' : 'pos'" :foot="`Margin ${F.pct(r.total.netMargin)}`" />
      <KpiTile v-if="!single" label="Beban teralokasi" :value="F.pct(r.coverage.expensePct)" :foot="`${F.rpCompact(r.coverage.expenseTagged)} dari ${F.rpCompact(r.coverage.expenseTotal)}`" :tone="r.coverage.expensePct < 80 ? 'neg' : ''" />
      <KpiTile v-if="!single && top" label="Beban terbesar" :value="top.code" :foot="`${top.name} · ${F.rpCompact(top.expense)} (${F.pct(top.expenseShare)})`" />
      <KpiTile v-if="single" label="Beban" :value="F.rpCompact(r.summary[0]?.expense ?? 0)" :foot="`HPP ${F.rpCompact(r.total.cogs)} · operasional ${F.rpCompact(r.total.opex + r.total.ga)}`" />
    </div>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">{{ session.company?.name }} — {{ ctx.branchName }}</h2><span class="card-note">Periode {{ r.period.label }} ({{ F.date(r.period.from) }} s.d. {{ F.date(r.period.to) }}) · dalam rupiah{{ r.rollup ? ' · digabung ke pusat biaya induk' : '' }}</span></div></div>
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Tampilan">
          <button class="chip" :aria-pressed="tab === 'laporan'" data-tab="laporan" @click="tab = 'laporan'">Laporan laba rugi</button>
          <button class="chip" :aria-pressed="tab === 'ringkasan'" data-tab="ringkasan" @click="tab = 'ringkasan'">Ringkasan kontribusi</button>
        </div>
        <div class="toolbar-spacer"></div>
        <DataTools />
      </div>
      <div v-if="tab === 'laporan'" class="table-scroll" data-report="cc-pl"><StatementTable :columns="columns" :rows="plRows(reports, single)" :pct-header="single ? '% pendapatan' : undefined" /></div>
      <div v-else class="table-scroll"><table class="table" data-table="cc-summary">
        <thead><tr><th>Pusat biaya</th><th class="ta-r">Pendapatan</th><th class="ta-r">HPP</th><th class="ta-r">Laba kotor</th><th class="ta-r">Beban operasional & umum</th><th class="ta-r">Laba bersih</th><th>Porsi pendapatan</th><th>Porsi beban</th></tr></thead>
        <tbody>
          <tr v-for="x in r.summary" :key="x.id ?? 'none'" class="is-static" :data-cc-row="x.code ?? 'none'">
            <td><span class="cell-strong"><span v-if="x.code" class="code">{{ x.code }}</span> {{ x.name }}</span><span class="cell-sub"><template v-if="x.kind">{{ KIND_LABEL[x.kind] }}</template><template v-if="x.parentCode"> · di bawah {{ x.parentCode }}</template><template v-if="!x.code">belum ditandai pusat biaya</template></span></td>
            <td class="ta-r num">{{ F.rp(x.revenue) }}</td><td class="ta-r num">{{ F.rp(x.cogs) }}</td><td class="ta-r num">{{ F.rp(x.gross) }}</td><td class="ta-r num">{{ F.rp(x.opex + x.ga) }}</td>
            <td class="ta-r num" :class="x.net < 0 ? 'neg' : 'pos'">{{ F.rp(x.net) }}</td>
            <td><div class="meter"><span class="meter-track"><span class="meter-fill" :style="{ width: Math.min(Math.max(x.revenueShare, 0), 100) + '%' }"></span></span><span class="meter-val">{{ F.pct(x.revenueShare) }}</span></div></td>
            <td><div class="meter"><span class="meter-track"><span class="meter-fill" data-tone="warn" :style="{ width: Math.min(Math.max(x.expenseShare, 0), 100) + '%' }"></span></span><span class="meter-val">{{ F.pct(x.expenseShare) }}</span></div></td>
          </tr>
          <tr v-if="!r.summary.length" class="is-static"><td colspan="8"><span class="muted">Belum ada transaksi laba rugi pada periode ini.</span></td></tr>
        </tbody>
        <tfoot><tr class="is-static"><td class="cell-strong">Total</td><td class="ta-r num">{{ F.rp(r.total.revenue) }}</td><td class="ta-r num">{{ F.rp(r.total.cogs) }}</td><td class="ta-r num">{{ F.rp(r.total.gross) }}</td><td class="ta-r num">{{ F.rp(r.total.opex + r.total.ga) }}</td><td class="ta-r num">{{ F.rp(r.total.net) }}</td><td></td><td></td></tr></tfoot>
      </table></div>
      <p v-if="r.columns.some((c: any) => c.status === 'nonaktif')" class="card-note" style="padding:var(--sp-3)"><Pill status="nonaktif" /> Sebagian kolom adalah pusat biaya nonaktif yang masih memiliki transaksi pada periode ini.</p>
      <p v-if="r.unassigned && !single" class="card-note" style="padding:var(--sp-3)">Tandai pusat biaya pada jurnal memorial, faktur, PR/PO/tagihan pemasok, dan data karyawan agar kolom “Tanpa pusat biaya” makin kecil. Baris neraca (kas, piutang, hutang, pajak) tidak bertanda pusat biaya.</p>
    </article>
  </template>
</template>
