<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { RFQ_CHIPS } from '@/lib/procurement';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';
import RfqDrawer from '@/components/RfqDrawer.vue';

const route = useRoute();
const router = useRouter();
const ctx = useContext();
const { data, loading, reload } = useLoader<any[]>(() => get('/purchasing/rfqs'));
const all = computed(() => data.value ?? []);
const status = ref(String(route.query.status ?? ''));
const q = ref('');
const counts = computed(() => all.value.reduce((m: Record<string, number>, o) => { m[o.status] = (m[o.status] ?? 0) + 1; return m; }, {}));
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((o) => (!status.value || o.status === status.value) && (!s || [o.docNo, o.title, o.requisitionNo, o.bestSupplier].some((x) => String(x ?? '').toLowerCase().includes(s))));
});
const pg = usePaged<any>(filtered, 10);
watch([q, status], pg.reset);
const kpi = computed(() => {
  const open = all.value.filter((o) => o.status === 'terbuka');
  return { open: open.length, overdue: open.filter((o) => o.overdue).length, waiting: open.reduce((t, o) => t + (o.invited - o.received), 0), awarded: counts.value.dipesan ?? 0 };
});
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);
watch(() => route.query.id, (v) => { if (v) openId.value = String(v); });
const openRequisition = (id: string) => router.push({ path: '/permintaan-pembelian', query: { id } });
const openOrder = (id: string) => router.push({ path: '/pesanan-pembelian', query: { id } });
</script>

<template>
  <ReportHead title="RFQ & Vendor" sub="Permintaan penawaran harga dari permintaan pembelian yang disetujui ke minimal dua pemasok. Harga terbaik = total terendah; pemenang menjadi PO dengan harga dan waktu kirim penawarannya.">
    <button class="btn" data-action="to-pr" @click="router.push('/permintaan-pembelian?status=disetujui')"><Icon name="clipboard" /> PR siap diproses</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="RFQ terbuka" :value="String(kpi.open)" :foot="`${kpi.waiting} penawaran belum masuk`" />
    <KpiTile label="Lewat batas" :value="String(kpi.overdue)" foot="Batas penawaran terlewati" :tone="kpi.overdue ? 'neg' : ''" />
    <KpiTile label="Pemenang dipilih" :value="String(kpi.awarded)" foot="Sudah menjadi PO" />
    <KpiTile label="Total RFQ" :value="String(all.length)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, judul, PR, pemasok…" aria-label="Cari RFQ" data-filter="rfq"></div>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in RFQ_CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-chip="k || 'all'" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : all.length }}</span></button>
      </div>
    </div>
    <div class="table-scroll"><table class="table" data-table="rfqs">
      <thead><tr><th>Nomor</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Tanggal</th><th>Judul</th><th>Batas</th><th>Penawaran</th><th class="ta-r">Harga terbaik</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="8"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="o in pg.pageRows.value" :key="o.id" data-row :data-rfq="o.docNo" @click="openId = o.id">
          <td class="code cell-strong">{{ o.docNo }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="o.branch" /></td>
          <td class="num">{{ F.date(o.date) }}</td>
          <td><span class="cell-strong">{{ o.title }}</span><span class="cell-sub code">{{ o.requisitionNo }}<template v-if="o.orderNo"> → {{ o.orderNo }}</template></span></td>
          <td class="num" :class="o.overdue ? 'neg' : ''">{{ F.date(o.deadline) }}</td>
          <td>{{ o.received }}/{{ o.invited }} masuk</td>
          <td class="ta-r num">{{ o.bestTotal === null ? '—' : F.rpCompact(o.bestTotal) }}<span v-if="o.bestSupplier" class="cell-sub">{{ o.bestSupplier }}</span></td>
          <td><Pill :status="o.status" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="8"><div class="empty"><div class="empty-card"><span class="empty-title">Belum ada RFQ</span><span class="empty-note">Buat RFQ dari permintaan pembelian yang sudah disetujui.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="RFQ" />
  </article>
  <RfqDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload" @open-requisition="openRequisition" @open-order="openOrder" />
</template>
