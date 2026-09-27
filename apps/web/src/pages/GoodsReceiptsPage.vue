<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import JournalDrawer from '@/components/JournalDrawer.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import PurchaseOrderDrawer from '@/components/PurchaseOrderDrawer.vue';
import ReportHead from '@/components/ReportHead.vue';

const router = useRouter();
const ctx = useContext();
const session = useSession();
const { data, loading, reload } = useLoader<any>(async () => {
  const [receipts, orders] = await Promise.all([get('/purchasing/receipts'), get('/purchasing/orders')]);
  return { receipts, orders };
});
const incoming = computed(() => (data.value?.orders ?? []).filter((o: any) => ['disetujui', 'diterima-sebagian'].includes(o.status) && o.receivedPct !== undefined && o.receivedPct < 100)
  .sort((a: any, b: any) => String(a.expectedDate).localeCompare(String(b.expectedDate))));
const q = ref('');
const receipts = computed(() => {
  const s = q.value.trim().toLowerCase();
  return (data.value?.receipts ?? []).filter((g: any) => !s || g.docNo.toLowerCase().includes(s) || g.orderNo.toLowerCase().includes(s) || g.supplierName.toLowerCase().includes(s));
});
const pg = usePaged<any>(receipts, 10);
const pgIn = usePaged<any>(incoming, 5);
watch(q, pg.reset);
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const kpi = computed(() => {
  const r = data.value?.receipts ?? [];
  const month = today.slice(0, 7);
  return { incoming: incoming.value.length, late: incoming.value.filter((o: any) => o.expectedDate && o.expectedDate < today).length,
    monthValue: r.filter((g: any) => String(g.date).startsWith(month)).reduce((t: number, g: any) => t + g.value, 0),
    uninvoiced: r.filter((g: any) => !g.invoiced).reduce((t: number, g: any) => t + g.value, 0) };
});
const openId = ref<string | null>(null);
const journalId = ref<string | null>(null);
const openInvoice = (id: string) => router.push({ path: '/tagihan-pemasok', query: { id } });
</script>

<template>
  <ReportHead title="Penerimaan Barang" sub="Gudang mencatat barang yang tiba terhadap PO yang disetujui. Stok cabang bertambah dengan harga PO (harga pokok rata-rata) dan jurnal persediaan ↔ barang diterima belum ditagih diposting otomatis." />
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="PO menunggu barang" :value="String(kpi.incoming)" :foot="`${kpi.late} lewat perkiraan tiba`" :tone="kpi.late ? 'neg' : ''" />
    <KpiTile label="Diterima bulan ini" :value="F.rpCompact(kpi.monthValue)" foot="Nilai harga PO" />
    <KpiTile label="Belum ditagih pemasok" :value="F.rpCompact(kpi.uninvoiced)" foot="Saldo barang diterima belum ditagih" />
    <KpiTile label="Dokumen penerimaan" :value="String(data?.receipts.length ?? 0)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">PO menunggu barang</h2><span class="card-note">{{ session.can('purchasing.receipt.create') ? 'Klik PO untuk mencatat barang yang tiba.' : 'Penerimaan dicatat oleh bagian gudang.' }}</span></div></div>
    <div class="table-scroll"><table class="table" data-table="incoming">
      <thead><tr><th>PO</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Pemasok</th><th>Perkiraan tiba</th><th>Diterima</th><th class="ta-r">Total</th><th></th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="7"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="o in pgIn.pageRows.value" :key="o.id" data-row :data-po="o.docNo" @click="openId = o.id">
          <td class="code cell-strong">{{ o.docNo }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="o.branch" /></td><td>{{ o.supplierName }}</td>
          <td class="num" :class="{ neg: o.expectedDate && o.expectedDate < today }">{{ F.date(o.expectedDate) }}</td>
          <td><div class="meter"><span class="meter-track"><span class="meter-fill" :style="{ width: o.receivedPct + '%' }"></span></span><span class="meter-val">{{ o.receivedPct }}%</span></div></td>
          <td class="ta-r num">{{ F.rpCompact(o.total) }}</td>
          <td class="ta-r"><span v-if="session.can('purchasing.receipt.create')" class="btn btn-sm"><Icon name="truck" /> Terima</span></td>
        </tr>
        <tr v-if="data && !pgIn.total.value" class="is-static"><td colspan="7" class="muted" style="text-align:center">Tidak ada PO yang menunggu barang.</td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pgIn.page.value" v-model:size="pgIn.size.value" :total="pgIn.total.value" label="PO" />
  </article>
  <article class="card">
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">Riwayat penerimaan</h2><span class="card-note">Klik untuk melihat jurnal persediaan.</span></div>
      <div class="search-wrap" style="max-width:280px"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, PO, pemasok…" aria-label="Cari penerimaan" data-filter="receipt"></div></div>
    <div class="table-scroll"><table class="table" data-table="receipts">
      <thead><tr><th>Nomor</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Tanggal</th><th>PO / pemasok</th><th>Gudang</th><th class="ta-r">Nilai</th><th>Jurnal</th><th>Tagihan</th></tr></thead>
      <tbody>
        <tr v-for="g in pg.pageRows.value" :key="g.id" data-row :data-receipt="g.docNo" @click="session.can('ledger.journal.read') && g.journalId ? (journalId = g.journalId) : (openId = g.orderId)">
          <td class="code cell-strong">{{ g.docNo }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="g.branch" /></td><td class="num">{{ F.date(g.date) }}</td>
          <td><span class="cell-strong code">{{ g.orderNo }}</span><span class="cell-sub">{{ g.supplierName }} · {{ g.lineCount }} baris · {{ g.createdByName }}</span></td>
          <td>{{ g.warehouse }}</td><td class="ta-r num">{{ F.rp(g.value) }}</td><td class="code">{{ g.journalNo ?? '—' }}</td>
          <td><Pill :status="g.invoiced ? 'selesai' : 'menunggu'" :label="g.invoiced ? 'Sudah ditagih' : 'Belum ditagih'" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="8" class="muted" style="text-align:center">Belum ada penerimaan barang.</td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="penerimaan" />
  </article>
  <PurchaseOrderDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload" @open-invoice="openInvoice" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" />
</template>
