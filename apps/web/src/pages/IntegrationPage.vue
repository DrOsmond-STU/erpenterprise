<script setup lang="ts">
import { computed } from 'vue';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import KpiTile from '@/components/KpiTile.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const SOURCE_LABEL: Record<string, string> = { invoice: 'Penjualan', ap_invoice: 'Pembelian', stock_move: 'Persediaan', work_order: 'Produksi', payslip: 'Penggajian', depreciation: 'Aset tetap', maintenance: 'Pemeliharaan', pos_shift: 'POS / Kasir', cash: 'Kas & Bank', tax: 'Pajak', opening: 'Saldo awal', manual: 'Manual' };
const MODULE_ROUTE: Record<string, string> = { faktur: '/jurnal', hutang: '/jurnal', 'kas-bank': '/kas-bank', stok: '/jurnal', aset: '/jurnal', penggajian: '/jurnal', 'neraca-saldo': '/neraca-saldo', neraca: '/neraca', cabang: '/cabang', jurnal: '/jurnal' };
const ctx = useContext();
const { data, loading } = useLoader(() => get('/reports/reconciliation'));
const okCount = computed(() => data.value?.checks.filter((c: any) => c.ok).length ?? 0);
const auto = computed(() => data.value?.postingSummary.filter((s: any) => s.source !== 'manual').reduce((t: number, s: any) => t + s.count, 0) ?? 0);
const manual = computed(() => data.value?.postingSummary.filter((s: any) => s.source === 'manual').reduce((t: number, s: any) => t + s.count, 0) ?? 0);
const pending = computed(() => data.value?.postingSummary.reduce((t: number, s: any) => t + s.pending, 0) ?? 0);
const fmt = (c: any, v: number) => (c.count ? F.int(v) : F.rp(v));
</script>

<template>
  <ReportHead title="Integrasi Antar Modul & Rekonsiliasi" sub="Setiap dokumen operasional diposting otomatis ke buku besar; sub-buku tiap modul dicocokkan dengan saldo akun kontrolnya." />
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <template v-else-if="data">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Rekonsiliasi" :value="`${okCount} / ${data.checks.length}`" :tone="okCount === data.checks.length ? 'pos' : 'neg'" :foot="okCount === data.checks.length ? 'Seluruh sub-buku cocok dengan buku besar' : 'Ada selisih yang perlu ditindaklanjuti'" />
      <KpiTile label="Jurnal otomatis" :value="F.int(auto)" :foot="`${data.postingSummary.filter((s: any) => s.source !== 'manual').length} modul sumber · ${data.period.label}`" />
      <KpiTile label="Jurnal manual" :value="F.int(manual)" foot="memorial melalui alur persetujuan" />
      <KpiTile label="Menunggu posting" :value="F.int(pending)" :tone="pending ? 'neg' : ''" :foot="pending ? 'Belum memengaruhi laporan keuangan' : 'Tidak ada antrean'" />
    </div>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Rekonsiliasi sub-buku terhadap buku besar</h2><span class="card-note">{{ ctx.branchName }} · {{ data.period.label }} · per {{ F.date(data.period.to) }} · hasil tersimpan di reconciliation_runs</span></div></div>
      <div class="table-scroll"><table class="table">
        <thead><tr><th>Pemeriksaan</th><th>Sumber sub-buku</th><th class="ta-r">Nilai sub-buku</th><th class="ta-r">Nilai buku besar</th><th class="ta-r">Selisih</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr v-for="c in data.checks" :key="c.id" class="is-static">
            <td><span class="cell-strong">{{ c.label }}</span><span class="cell-sub">{{ c.note }}</span></td><td>{{ c.source }}</td>
            <td class="ta-r num">{{ fmt(c, c.subledger) }}</td><td class="ta-r num">{{ fmt(c, c.ledger) }}</td><td class="ta-r"><span class="num" :class="c.ok ? 'muted' : 'neg'">{{ c.ok ? '—' : fmt(c, c.diff) }}</span></td>
            <td><Pill :status="c.ok ? 'ok' : 'diff'" /></td><td class="ta-r"><RouterLink class="btn btn-sm btn-ghost" :to="MODULE_ROUTE[c.module] ?? '/jurnal'">Buka</RouterLink></td>
          </tr>
        </tbody>
      </table></div>
    </article>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Ringkasan posting per modul</h2><span class="card-note">Jurnal yang terbentuk pada {{ data.period.label }}</span></div></div>
      <div class="table-scroll"><table class="table">
        <thead><tr><th>Modul sumber</th><th class="ta-r">Jurnal</th><th class="ta-r">Diposting</th><th class="ta-r">Menunggu</th><th class="ta-r">Nilai</th></tr></thead>
        <tbody><tr v-for="s in data.postingSummary" :key="s.source" class="is-static"><td class="cell-strong">{{ SOURCE_LABEL[s.source] ?? s.source }}</td><td class="ta-r num">{{ F.int(s.count) }}</td><td class="ta-r num">{{ F.int(s.posted) }}</td><td class="ta-r"><span class="num" :class="s.pending ? 'neg' : 'muted'">{{ s.pending ? F.int(s.pending) : '—' }}</span></td><td class="ta-r num">{{ F.rpCompact(s.amount) }}</td></tr></tbody>
      </table></div>
    </article>
  </template>
</template>
