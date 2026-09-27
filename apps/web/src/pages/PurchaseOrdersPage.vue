<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { PO_CHIPS } from '@/lib/purchasing';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import PurchaseDocForm from '@/components/PurchaseDocForm.vue';
import PurchaseOrderDrawer from '@/components/PurchaseOrderDrawer.vue';
import ReportHead from '@/components/ReportHead.vue';

const route = useRoute();
const router = useRouter();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/purchasing/orders'));
const all = computed(() => data.value ?? []);

const status = ref(String(route.query.status ?? ''));
const q = ref('');
const counts = computed(() => all.value.reduce((m: Record<string, number>, o) => { m[o.status] = (m[o.status] ?? 0) + 1; return m; }, {}));
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((o) => (!status.value || o.status === status.value) && (!s || o.docNo.toLowerCase().includes(s) || o.supplierName.toLowerCase().includes(s) || (o.createdByName ?? '').toLowerCase().includes(s)));
});
const pg = usePaged<any>(filtered, 10);
watch([q, status], pg.reset);
const kpi = computed(() => {
  const open = all.value.filter((o) => ['menunggu', 'disetujui', 'diterima-sebagian'].includes(o.status));
  return { open: open.reduce((t, o) => t + o.total, 0), openCount: open.length, pending: counts.value.menunggu ?? 0,
    pendingValue: all.value.filter((o) => o.status === 'menunggu').reduce((t, o) => t + o.total, 0),
    toReceive: all.value.filter((o) => ['disetujui', 'diterima-sebagian'].includes(o.status) && (o.receivedPct ?? 100) < 100).length };
});

const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);
watch(() => route.query.id, (v) => { if (v) openId.value = String(v); });
const form = ref<{ doc?: any } | null>(null);
function saved(doc: any, submitted: boolean) {
  form.value = null;
  toast.push(submitted ? (doc.status === 'menunggu' ? 'PO diajukan — menunggu persetujuan' : 'PO disetujui otomatis') : 'Draf PO disimpan', `${doc.docNo} · ${F.rp(doc.total)}`, doc.status === 'menunggu' ? 'warn' : 'ok');
  reload(); openId.value = doc.id;
}
const openInvoice = (id: string) => router.push({ path: '/tagihan-pemasok', query: { id } });
</script>

<template>
  <ReportHead title="Pesanan Pembelian" sub="PO di atas batas persetujuan atau ke pemasok yang dipantau menunggu keputusan manajer. Barang diterima gudang menambah stok; tagihan pemasok dicocokkan dengan PO dan penerimaan (tiga arah).">
    <button v-if="session.can('purchasing.order.create')" class="btn btn-primary" data-action="new-po" @click="form = {}"><Icon name="plus" /> PO baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="PO terbuka" :value="F.rpCompact(kpi.open)" :foot="`${kpi.openCount} PO belum selesai`" />
    <KpiTile label="Menunggu persetujuan" :value="String(kpi.pending)" :foot="F.rpCompact(kpi.pendingValue)" :tone="kpi.pending ? 'neg' : ''" />
    <KpiTile label="Menunggu barang" :value="String(kpi.toReceive)" foot="Disetujui, belum diterima penuh" />
    <KpiTile label="Total PO" :value="String(all.length)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, pemasok, pembuat…" aria-label="Cari PO" data-filter="po"></div>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in PO_CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-chip="k || 'all'" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : all.length }}</span></button>
      </div>
    </div>
    <div class="table-scroll"><table class="table" data-table="purchase-orders">
      <thead><tr><th>Nomor</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Tanggal</th><th>Pemasok</th><th class="ta-r">Total</th><th>Tiba</th><th>Diterima</th><th>Dibuat</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="9"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="o in pg.pageRows.value" :key="o.id" data-row :data-po="o.docNo" @click="openId = o.id">
          <td class="code cell-strong">{{ o.docNo }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="o.branch" /></td>
          <td class="num">{{ F.date(o.date) }}</td>
          <td><span class="cell-strong">{{ o.supplierName }}</span><span class="cell-sub">{{ o.supplierCode }} · {{ o.lineCount }} baris</span></td>
          <td class="ta-r num">{{ F.rpCompact(o.total) }}</td><td class="num">{{ F.date(o.expectedDate) }}</td>
          <td><div v-if="o.receivedPct !== undefined" class="meter"><span class="meter-track"><span class="meter-fill" :style="{ width: o.receivedPct + '%' }"></span></span><span class="meter-val">{{ o.receivedPct }}%</span></div><span v-else class="muted">jasa</span></td>
          <td>{{ o.createdByName }}</td><td><Pill :status="o.status" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="9"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada PO</span><span class="empty-note">Ubah kata kunci, status, atau cabang.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="PO" />
  </article>
  <PurchaseOrderDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload" @edit="(d) => (form = { doc: d })" @open-invoice="openInvoice" />
  <PurchaseDocForm v-if="form" kind="order" :doc="form.doc" @close="form = null" @saved="saved" />
</template>
