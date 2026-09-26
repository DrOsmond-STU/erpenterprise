<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import OrderDrawer from '@/components/OrderDrawer.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';
import SalesDocForm from '@/components/SalesDocForm.vue';

const route = useRoute();
const router = useRouter();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/sales/orders'));
const all = computed(() => data.value ?? []);

const CHIPS: [string, string][] = [['', 'Semua'], ['draf', 'Draf'], ['menunggu', 'Menunggu'], ['disetujui', 'Disetujui'], ['ditolak', 'Ditolak'], ['dikirim', 'Dikirim'], ['selesai', 'Selesai'], ['batal', 'Batal']];
const status = ref(String(route.query.status ?? ''));
const q = ref('');
const counts = computed(() => all.value.reduce((m: Record<string, number>, o) => { m[o.status] = (m[o.status] ?? 0) + 1; return m; }, {}));
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((o) => (!status.value || o.status === status.value) && (!s || o.docNo.toLowerCase().includes(s) || o.customerName.toLowerCase().includes(s) || (o.createdByName ?? '').toLowerCase().includes(s)));
});
const pg = usePaged<any>(filtered, 10);
watch([q, status], pg.reset);
const kpi = computed(() => {
  const open = all.value.filter((o) => ['menunggu', 'disetujui', 'dikirim'].includes(o.status));
  return { open: open.reduce((t, o) => t + o.total, 0), openCount: open.length, pending: counts.value.menunggu ?? 0,
    pendingValue: all.value.filter((o) => o.status === 'menunggu').reduce((t, o) => t + o.total, 0), toInvoice: all.value.filter((o) => ['disetujui', 'dikirim'].includes(o.status)).length };
});

const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);
const form = ref<{ doc?: any } | null>(null);
function saved(doc: any, submitted: boolean) {
  form.value = null;
  toast.push(submitted ? (doc.status === 'menunggu' ? 'Pesanan diajukan — menunggu persetujuan' : 'Pesanan disetujui otomatis') : 'Draf pesanan disimpan', `${doc.docNo} · ${F.rp(doc.total)}`, doc.status === 'menunggu' ? 'warn' : 'ok');
  reload(); openId.value = doc.id;
}
const openInvoice = (id: string) => router.push({ path: '/faktur', query: { id } });
</script>

<template>
  <ReportHead title="Pesanan Penjualan" sub="Pesanan yang melebihi sisa plafon kredit, pelanggan ditahan, atau di atas batas persetujuan menunggu keputusan manajer. Pesanan disetujui menjadi faktur.">
    <button v-if="session.can('sales.order.create')" class="btn btn-primary" data-action="new-order" @click="form = {}"><Icon name="plus" /> Pesanan baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Pesanan terbuka" :value="F.rpCompact(kpi.open)" :foot="`${kpi.openCount} pesanan belum difakturkan`" />
    <KpiTile label="Menunggu persetujuan" :value="String(kpi.pending)" :foot="F.rpCompact(kpi.pendingValue)" :tone="kpi.pending ? 'neg' : ''" />
    <KpiTile label="Siap difakturkan" :value="String(kpi.toInvoice)" foot="Disetujui / dikirim" />
    <KpiTile label="Total pesanan" :value="String(all.length)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, pelanggan, pembuat…" aria-label="Cari pesanan" data-filter="order"></div>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-chip="k || 'all'" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : all.length }}</span></button>
      </div>
    </div>
    <div class="table-scroll"><table class="table" data-table="orders">
      <thead><tr><th>Nomor</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Tanggal</th><th>Pelanggan</th><th class="ta-r">Total</th><th>Kirim</th><th>Dibuat</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="8"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="o in pg.pageRows.value" :key="o.id" data-row :data-order="o.docNo" @click="openId = o.id">
          <td class="code cell-strong">{{ o.docNo }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="o.branch" /></td>
          <td class="num">{{ F.date(o.date) }}</td>
          <td><span class="cell-strong">{{ o.customerName }}</span><span class="cell-sub">{{ o.customerCode }} · {{ o.lineCount }} baris<template v-if="o.invoiceNo"> · <span class="code">{{ o.invoiceNo }}</span></template></span></td>
          <td class="ta-r num">{{ F.rpCompact(o.total) }}</td><td class="num">{{ F.date(o.deliveryDate) }}</td><td>{{ o.createdByName }}</td><td><Pill :status="o.status" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="8"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada pesanan</span><span class="empty-note">Ubah kata kunci, status, atau cabang.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="pesanan" />
  </article>
  <OrderDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload" @edit="(d) => (form = { doc: d })" @open-invoice="openInvoice" />
  <SalesDocForm v-if="form" kind="order" :doc="form.doc" @close="form = null" @saved="saved" />
</template>
