<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import BranchTag from '@/components/BranchTag.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const router = useRouter();
const ctx = useContext();
const { data, loading } = useLoader<any>(() => get('/sales/receivables'));
const maxBucket = computed(() => Math.max(1, ...(data.value?.aging ?? []).map((b: any) => b.value)));
const TONES = ['var(--ok)', 'var(--accent)', 'var(--warn)', '#e07a3a', 'var(--danger)'];
const bucket = ref('');
const invoices = computed(() => (data.value?.invoices ?? []).filter((i: any) => !bucket.value || keyOf(i) === bucket.value));
const keyOf = (i: any) => { const d = i.overdueDays; return d <= 0 ? 'current' : d <= 30 ? 'd30' : d <= 60 ? 'd60' : d <= 90 ? 'd90' : 'over90'; };
const pgInv = usePaged<any>(invoices, 10);
const pgCust = usePaged<any>(() => data.value?.customers ?? [], 10);
watch(bucket, pgInv.reset);
const goInvoice = (id: string) => router.push({ path: '/faktur', query: { id } });
</script>

<template>
  <ReportHead title="Piutang Usaha" :sub="data ? `Posisi per ${F.date(data.asOf)} — sisa tagihan dari faktur terbit dikurangi penerimaan sampai tanggal tersebut, sama dengan saldo akun 1-1200.` : 'Memuat…'" />
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <template v-else-if="data">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Total piutang" :value="F.rpCompact(data.kpi.total)" :foot="`${data.kpi.count} faktur terbuka`" />
      <KpiTile label="Jatuh tempo" :value="F.rpCompact(data.kpi.overdue)" :foot="`${F.pct(data.kpi.overduePct * 100, 0)} dari piutang`" :tone="data.kpi.overdue ? 'neg' : ''" />
      <KpiTile label="DSO" :value="`${data.kpi.dso} hari`" foot="Piutang ÷ penjualan 90 hari × 90" />
      <KpiTile label="Tertagih periode ini" :value="F.rpCompact(data.kpi.collected)" :foot="data.period.label" />
    </div>
    <section class="grid grid-1-2">
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Umur piutang</h2><span class="card-note">Klik ember untuk menyaring daftar faktur.</span></div></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:var(--sp-3)" data-aging>
          <button v-for="(b, i) in data.aging" :key="b.key" type="button" :data-bucket="b.key" :aria-pressed="bucket === b.key"
            style="all:unset;cursor:pointer;display:grid;grid-template-columns:130px 1fr auto;gap:var(--sp-2);align-items:center;padding:4px 6px;border-radius:var(--r-sm)"
            :style="bucket === b.key ? 'background:var(--surface-2)' : ''" @click="bucket = bucket === b.key ? '' : b.key">
            <span style="font-size:var(--fs-sm)">{{ b.label }}<span class="cell-sub">{{ b.count }} faktur</span></span>
            <span style="height:12px;background:var(--surface-2);border-radius:6px;overflow:hidden"><span :style="{ display: 'block', height: '100%', width: (b.value / maxBucket) * 100 + '%', background: TONES[Number(i)], borderRadius: '6px' }"></span></span>
            <span class="num" style="font-size:var(--fs-sm);min-width:90px;text-align:right">{{ F.rpCompact(b.value) }}</span>
          </button>
          <div class="totals" style="margin-top:var(--sp-2)">
            <div class="totals-row"><span>Sub-buku piutang</span><b>{{ F.rp(data.kpi.total) }}</b></div>
            <div class="totals-row"><span>Buku besar 1-1200</span><b>{{ F.rp(data.kpi.ledger) }}</b></div>
            <div class="totals-row"><span>Rekonsiliasi</span><b><Pill :status="data.kpi.reconciled ? 'ok' : 'diff'" /></b></div>
          </div>
        </div>
      </article>
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Per pelanggan</h2><span class="card-note">Diurutkan dari sisa tagihan terbesar.</span></div></div>
        <div class="table-scroll"><table class="table" data-table="ar-customers">
          <thead><tr><th>Pelanggan</th><th class="ta-r">Faktur</th><th class="ta-r">Sisa</th><th class="ta-r">Jatuh tempo</th><th class="ta-r">Tertua</th></tr></thead>
          <tbody>
            <tr v-for="c in pgCust.pageRows.value" :key="c.customerId ?? c.customerName" class="is-static"><td><span class="cell-strong">{{ c.customerName }}</span><span class="cell-sub"><span class="code">{{ c.customerCode ?? '' }}</span></span></td>
              <td class="ta-r num">{{ c.count }}</td><td class="ta-r num">{{ F.rpCompact(c.open) }}</td><td class="ta-r num" :class="{ neg: c.overdue }">{{ c.overdue ? F.rpCompact(c.overdue) : '—' }}</td><td class="ta-r num">{{ c.oldestDays ? `${c.oldestDays} hari` : '—' }}</td></tr>
            <tr v-if="!pgCust.total.value" class="is-static"><td colspan="5" class="muted" style="text-align:center">Tidak ada piutang terbuka.</td></tr>
          </tbody>
        </table></div>
        <Pager v-model:page="pgCust.page.value" v-model:size="pgCust.size.value" :total="pgCust.total.value" label="pelanggan" />
      </article>
    </section>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Faktur terbuka{{ bucket ? ` — ${data.aging.find((b: any) => b.key === bucket)?.label}` : '' }}</h2><span class="card-note">Klik faktur untuk mencatat penerimaan.</span></div></div>
      <div class="table-scroll"><table class="table" data-table="ar-invoices">
        <thead><tr><th>Faktur</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Pelanggan</th><th>Tanggal</th><th>Jatuh tempo</th><th class="ta-r">Total</th><th class="ta-r">Sisa</th><th>Umur</th></tr></thead>
        <tbody>
          <tr v-for="i in pgInv.pageRows.value" :key="i.id" data-row @click="goInvoice(i.id)">
            <td class="code cell-strong">{{ i.docNo }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="i.branch" /></td><td>{{ i.customerName }}</td>
            <td class="num">{{ F.date(i.date) }}</td><td class="num">{{ F.date(i.dueDate) }}</td><td class="ta-r num">{{ F.rpCompact(i.total) }}</td><td class="ta-r num">{{ F.rpCompact(i.open) }}</td>
            <td><Pill :status="i.isOverdue ? 'jatuh-tempo' : 'belum-dibayar'" :label="i.isOverdue ? `${i.overdueDays} hari lewat` : 'Belum jatuh tempo'" /></td>
          </tr>
          <tr v-if="!pgInv.total.value" class="is-static"><td colspan="8" class="muted" style="text-align:center">Tidak ada faktur pada ember ini.</td></tr>
        </tbody>
      </table></div>
      <Pager v-model:page="pgInv.page.value" v-model:size="pgInv.size.value" :total="pgInv.total.value" label="faktur" />
    </article>
  </template>
</template>
