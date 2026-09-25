<script setup lang="ts">
import { computed } from 'vue';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import ReportHead from '@/components/ReportHead.vue';
import Icon from '@/components/Icon.vue';

const ctx = useContext();
const session = useSession();
const { data: k, loading } = useLoader(() => get('/reports/kpis'));
const { data: cons } = useLoader(() => (session.can('report.consolidated') && session.allBranches ? get('/reports/consolidation') : Promise.resolve(null)));
const maxBar = computed(() => Math.max(1, ...(k.value?.monthlyRevenue ?? [0]), k.value?.monthlyTarget ?? 0));
const firstName = computed(() => (session.user?.name ?? '').split(' ')[0]);
</script>

<template>
  <ReportHead :title="`Selamat datang, ${firstName}`" :sub="`Ikhtisar ${session.company?.name} — angka dihitung langsung dari buku besar untuk konteks yang dipilih.`" />
  <div v-if="loading" class="loading">Memuat…</div>
  <template v-else-if="k">
    <div class="kpi-row">
      <div class="kpi-tile"><span class="kpi-label">Pendapatan ({{ k.period.label }})</span><span class="kpi-value">{{ F.rpCompact(k.revenue) }}</span><span class="kpi-foot">Target {{ F.rpCompact(k.target) }} · tercapai {{ F.pct(k.target ? (k.revenue / k.target) * 100 : 0, 0) }}</span></div>
      <div class="kpi-tile"><span class="kpi-label">Laba kotor</span><span class="kpi-value">{{ F.rpCompact(k.gross) }}</span><span class="kpi-foot">Margin kotor {{ F.pct(k.grossMargin) }} · laba bersih {{ F.rpCompact(k.net) }} ({{ F.pct(k.netMargin) }})</span></div>
      <div class="kpi-tile"><span class="kpi-label">Kas &amp; bank</span><span class="kpi-value">{{ F.rpCompact(k.cash) }}</span><span class="kpi-foot">Saldo buku besar 1-1100 per {{ F.date(k.period.to) }}</span></div>
      <div class="kpi-tile"><span class="kpi-label">Piutang jatuh tempo</span><span class="kpi-value" :class="{ neg: k.overdueAmount > 0 }">{{ F.rpCompact(k.overdueAmount) }}</span><span class="kpi-foot">{{ k.overdueInvoices }} faktur lewat tempo · piutang {{ F.rpCompact(k.ar) }}</span></div>
    </div>

    <div class="grid grid-2-1">
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Pendapatan bulanan terhadap target</h2><span class="card-note">{{ k.period.to.slice(0, 4) }} · {{ ctx.branchShort }} · dari akun pendapatan buku besar</span></div></div>
        <div class="card-body">
          <div class="mini-bars" role="img" :aria-label="`Pendapatan bulanan: ${k.monthlyRevenue.map((v: number, i: number) => F.monthLabels[i] + ' ' + F.rpCompact(v)).join(', ')}`">
            <div v-for="(v, i) in (k.monthlyRevenue as number[])" :key="i" class="mini-bar" :title="`${F.monthLabels[Number(i)]}: ${F.rp(v)}`">
              <i :style="{ height: `${Math.round((v / maxBar) * 120)}px` }"></i><span>{{ F.monthLabels[Number(i)] }}</span>
            </div>
          </div>
          <div class="chart-legend"><span class="chart-legend-item"><i class="chart-swatch" style="background:var(--cat-1)"></i>Pendapatan aktual</span><span class="chart-legend-item">Target bulanan {{ F.rpCompact(k.monthlyTarget) }}</span></div>
        </div>
      </article>
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Perlu perhatian</h2><span class="card-note">Dari buku besar &amp; sub-buku</span></div></div>
        <div class="worklist">
          <RouterLink to="/jurnal?status=pending" class="worklist-item" custom v-slot="{ navigate }">
            <button class="worklist-item" @click="navigate"><span class="wl-icon" :data-tone="k.pendingJournals ? 'warn' : 'ok'"><Icon name="ledger" /></span><span class="worklist-body"><span class="worklist-title">{{ k.pendingJournals }} jurnal menunggu posting</span><span class="worklist-meta">Belum memengaruhi laporan keuangan</span></span><span class="worklist-side"><Icon name="chevron-right" /></span></button>
          </RouterLink>
          <RouterLink to="/integrasi" custom v-slot="{ navigate }">
            <button class="worklist-item" @click="navigate"><span class="wl-icon" data-tone="info"><Icon name="link" /></span><span class="worklist-body"><span class="worklist-title">Rekonsiliasi sub-buku</span><span class="worklist-meta">Piutang, hutang, bank, persediaan, aset, gaji vs buku besar</span></span><span class="worklist-side"><Icon name="chevron-right" /></span></button>
          </RouterLink>
          <RouterLink to="/neraca" custom v-slot="{ navigate }">
            <button class="worklist-item" @click="navigate"><span class="wl-icon" data-tone="ok"><Icon name="columns" /></span><span class="worklist-body"><span class="worklist-title">Total aset {{ F.rpCompact(k.totalAssets) }}</span><span class="worklist-meta">Laba periode berjalan {{ F.rpCompact(k.profit) }} · hutang usaha {{ F.rpCompact(k.ap) }}</span></span><span class="worklist-side"><Icon name="chevron-right" /></span></button>
          </RouterLink>
        </div>
      </article>
    </div>

    <article v-if="cons" class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Laba rugi per cabang</h2><span class="card-note">{{ cons.period.label }} · konsolidasi {{ F.rpCompact(cons.incomeStatement.combined.net) }}</span></div><div class="card-tools"><RouterLink class="btn btn-sm" to="/konsolidasi">Konsolidasi</RouterLink></div></div>
      <div class="table-scroll"><table class="table">
        <thead><tr><th>Cabang</th><th class="ta-r">Pendapatan</th><th class="ta-r">Laba kotor</th><th class="ta-r">Laba bersih</th><th class="ta-r">Margin</th><th class="ta-r">Kas</th></tr></thead>
        <tbody>
          <tr v-for="b in cons.kpis" :key="b.branch" @click="ctx.branch = b.branch">
            <td><span class="cell-strong">{{ b.name }}</span></td><td class="ta-r num">{{ F.rpCompact(b.revenue) }}</td><td class="ta-r num">{{ F.rpCompact(b.gross) }}</td>
            <td class="ta-r num" :class="{ neg: b.net < 0 }">{{ F.rpCompact(b.net) }}</td><td class="ta-r num">{{ F.pct(b.netMargin) }}</td><td class="ta-r num">{{ F.rpCompact(b.cash) }}</td>
          </tr>
        </tbody>
      </table></div>
    </article>
  </template>
</template>
