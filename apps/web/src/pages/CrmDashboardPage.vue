<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { get } from '@/lib/api';
import { LEAD_STATUS, PRIORITY, STAGE_LABEL } from '@/lib/crm';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import ReportHead from '@/components/ReportHead.vue';

const router = useRouter();
const ctx = useContext();
const { data, loading } = useLoader<any>(() => get('/crm/dashboard'));
const maxStage = computed(() => Math.max(1, ...(data.value?.pipeline.stages ?? []).map((s: any) => s.value)));
const maxFc = computed(() => Math.max(1, ...(data.value?.pipeline.forecast ?? []).map((s: any) => s.weighted)));
const maxTop = computed(() => Math.max(1, ...(data.value?.sales.topCustomers ?? []).map((s: any) => s.revenue)));
const monthLabel = (m: string) => `${F.monthLabels[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const COLORS: Record<string, string> = { prospek: 'var(--cat-1)', kualifikasi: 'var(--cat-2)', penawaran: 'var(--cat-3)', negosiasi: 'var(--cat-4)', menang: 'var(--ok)', kalah: 'var(--danger)' };
</script>

<template>
  <ReportHead title="Dasbor CRM" :sub="`Ringkasan hubungan pelanggan & pemasok — ${ctx.branchShort}. Penjualan & piutang diambil dari faktur yang dijurnal, sehingga sama dengan buku besar.`" />
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <template v-else-if="data">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Pipeline tertimbang" :value="F.rpCompact(data.pipeline.weighted)" :foot="`${data.pipeline.openCount} peluang terbuka · menang 90 hari ${data.pipeline.winRate90 === null ? '—' : F.pct(data.pipeline.winRate90)}`" />
      <KpiTile label="Penjualan bulan ini" :value="F.rpCompact(data.sales.mtd)" :foot="`Tahun berjalan ${F.rpCompact(data.sales.ytd)}`" />
      <KpiTile label="Piutang jatuh tempo" :value="F.rpCompact(data.collection.overdue)" :foot="`${data.collection.overdueCount} faktur · ${data.collection.promisesWaiting} janji bayar menunggu`" :tone="data.collection.overdue ? 'neg' : ''" />
      <KpiTile label="Tiket terbuka" :value="String(data.tickets.open)" :foot="`${data.tickets.breached} melewati SLA · kepuasan ${data.tickets.avgSatisfaction ?? '—'}/5`" :tone="data.tickets.breached ? 'neg' : ''" />
    </div>
    <section class="grid grid-1-1">
      <article class="card" data-crm-pipeline>
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Pipeline per tahap</h2><span class="card-note">Nilai peluang; tertimbang = nilai × probabilitas.</span></div><button class="btn btn-sm btn-ghost" @click="router.push('/lead')">Buka <Icon name="chevron-right" /></button></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:var(--sp-2)">
          <div v-for="s in data.pipeline.stages" :key="s.stage" style="display:grid;grid-template-columns:110px 1fr auto;gap:var(--sp-2);align-items:center" :data-stage-row="s.stage">
            <span style="font-size:var(--fs-sm)">{{ STAGE_LABEL[s.stage] }}<span class="cell-sub">{{ s.count }} peluang</span></span>
            <span style="height:12px;background:var(--surface-2);border-radius:6px;overflow:hidden"><span :style="{ display: 'block', height: '100%', width: (s.value / maxStage) * 100 + '%', background: COLORS[s.stage], borderRadius: '6px' }"></span></span>
            <span class="num" style="font-size:var(--fs-sm);min-width:90px;text-align:right">{{ F.rpCompact(s.value) }}</span>
          </div>
        </div>
      </article>
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Perkiraan closing 6 bulan</h2><span class="card-note">Pipeline tertimbang menurut perkiraan closing.</span></div></div>
        <div class="card-body">
          <div class="mini-bars" role="img" :aria-label="data.pipeline.forecast.map((f: any) => monthLabel(f.month) + ' ' + F.rpCompact(f.weighted)).join(', ')">
            <div v-for="f in data.pipeline.forecast" :key="f.month" class="mini-bar" :title="`${monthLabel(f.month)}: ${F.rp(f.weighted)} (${f.count} peluang)`"><i :style="{ height: (f.weighted / maxFc) * 110 + 'px' }"></i><span>{{ monthLabel(f.month) }}</span></div>
          </div>
          <div class="table-scroll" style="margin-top:var(--sp-2)"><table class="table"><thead><tr><th>PIC penjualan</th><th class="ta-r">Peluang</th><th class="ta-r">Tertimbang</th></tr></thead><tbody>
            <tr v-for="o in data.pipeline.owners.slice(0, 5)" :key="o.owner" class="is-static"><td>{{ o.owner }}</td><td class="ta-r num">{{ o.count }}</td><td class="ta-r num">{{ F.rpCompact(o.weighted) }}</td></tr>
          </tbody></table></div>
        </div>
      </article>
    </section>
    <section class="grid grid-1-1" style="margin-top:var(--sp-4)">
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Lead</h2><span class="card-note">{{ data.leads.total }} lead · {{ data.leads.newThisMonth }} baru bulan ini</span></div><button class="btn btn-sm btn-ghost" @click="router.push('/prospek')">Buka <Icon name="chevron-right" /></button></div>
        <div class="card-body">
          <div class="chips" style="margin-bottom:var(--sp-3)"><span v-for="s in data.leads.byStatus" :key="s.status" class="chip" style="cursor:default">{{ LEAD_STATUS[s.status]?.label }} <span class="chip-count">{{ s.count }}</span></span></div>
          <div class="table-scroll"><table class="table"><thead><tr><th>Sumber</th><th class="ta-r">Lead</th></tr></thead><tbody>
            <tr v-for="s in data.leads.bySource" :key="s.source" class="is-static"><td>{{ s.source }}</td><td class="ta-r num">{{ s.count }}</td></tr>
          </tbody></table></div>
        </div>
      </article>
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Pelanggan teratas (tahun berjalan)</h2><span class="card-note">Pendapatan bersih dari faktur terbit.</span></div></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:var(--sp-2)">
          <button v-for="c in data.sales.topCustomers" :key="c.id" type="button" style="all:unset;cursor:pointer;display:grid;grid-template-columns:160px 1fr auto;gap:var(--sp-2);align-items:center" :data-top-customer="c.name" @click="router.push(`/pelanggan/${c.id}`)">
            <span class="cell-strong" style="font-size:var(--fs-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.name }}</span>
            <span style="height:10px;background:var(--surface-2);border-radius:5px;overflow:hidden"><span :style="{ display: 'block', height: '100%', width: (c.revenue / maxTop) * 100 + '%', background: 'var(--cat-1)' }"></span></span>
            <span class="num" style="font-size:var(--fs-sm);min-width:80px;text-align:right">{{ F.rpCompact(c.revenue) }}</span>
          </button>
          <div v-if="!data.sales.topCustomers.length" class="muted">Belum ada penjualan.</div>
        </div>
      </article>
    </section>
    <article class="card" style="margin-top:var(--sp-4)">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Perlu perhatian</h2></div></div>
      <div class="worklist">
        <button class="worklist-item" data-work="tasks" @click="router.push('/aktivitas')"><span class="wl-icon" :data-tone="data.activities.mineOverdue ? 'danger' : 'ok'"><Icon name="clipboard" /></span><span class="worklist-body"><span class="worklist-title">{{ data.activities.mineOpen }} tugas saya terbuka</span><span class="worklist-meta">{{ data.activities.mineOverdue }} terlambat · {{ data.activities.overdue }} tugas terlambat di tim</span></span><span class="worklist-side"><Icon name="chevron-right" /></span></button>
        <button class="worklist-item" data-work="collections" @click="router.push('/penagihan')"><span class="wl-icon" :data-tone="data.collection.promisesBroken ? 'danger' : 'warn'"><Icon name="wallet" /></span><span class="worklist-body"><span class="worklist-title">Penagihan {{ F.rpCompact(data.collection.overdue) }} jatuh tempo</span><span class="worklist-meta">{{ data.collection.promisesBroken }} janji diingkari · {{ data.collection.promisesKept }} ditepati · piutang terbuka {{ F.rpCompact(data.collection.openAr) }}</span></span><span class="worklist-side"><Icon name="chevron-right" /></span></button>
        <button class="worklist-item" data-work="quotes" @click="router.push('/penawaran')"><span class="wl-icon" :data-tone="data.quotations.expired ? 'warn' : 'ok'"><Icon name="invoice" /></span><span class="worklist-body"><span class="worklist-title">{{ data.quotations.sentCount }} penawaran terkirim ({{ F.rpCompact(data.quotations.sentValue) }})</span><span class="worklist-meta">{{ data.quotations.expiring7 }} berakhir ≤ 7 hari · {{ data.quotations.expired }} kedaluwarsa</span></span><span class="worklist-side"><Icon name="chevron-right" /></span></button>
        <button class="worklist-item" data-work="tickets" @click="router.push('/tiket')"><span class="wl-icon" :data-tone="data.tickets.breached ? 'danger' : 'ok'"><Icon name="alert" /></span><span class="worklist-body"><span class="worklist-title">{{ data.tickets.open }} tiket terbuka</span><span class="worklist-meta"><template v-for="p in data.tickets.byPriority" :key="p.priority">{{ PRIORITY[p.priority].label }} {{ p.count }} · </template>{{ data.tickets.breached }} lewat SLA</span></span><span class="worklist-side"><Icon name="chevron-right" /></span></button>
      </div>
    </article>
  </template>
</template>
