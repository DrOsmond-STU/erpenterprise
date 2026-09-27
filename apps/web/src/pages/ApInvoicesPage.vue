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
import ApInvoiceDrawer from '@/components/ApInvoiceDrawer.vue';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import PurchaseDocForm from '@/components/PurchaseDocForm.vue';
import ReportHead from '@/components/ReportHead.vue';

const route = useRoute();
const router = useRouter();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/purchasing/invoices'));
const all = computed(() => data.value ?? []);

const CHIPS: [string, string][] = [['', 'Semua'], ['draf', 'Draf'], ['belum-dibayar', 'Belum dibayar'], ['sebagian', 'Sebagian'], ['jatuh-tempo', 'Jatuh tempo'], ['lunas', 'Lunas'], ['batal', 'Batal']];
const status = ref(String(route.query.status ?? ''));
const q = ref('');
const match = (i: any, k: string) => (k === 'jatuh-tempo' ? i.isOverdue : i.status === k);
const counts = computed(() => Object.fromEntries(CHIPS.filter(([k]) => k).map(([k]) => [k, all.value.filter((i) => match(i, k)).length])));
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((i) => (!status.value || match(i, status.value)) && (!s || i.docNo.toLowerCase().includes(s) || i.supplierName.toLowerCase().includes(s) || (i.orderNo ?? '').toLowerCase().includes(s) || (i.supplierInvoiceNo ?? '').toLowerCase().includes(s)));
});
const pg = usePaged<any>(filtered, 10);
watch([q, status], pg.reset);
const kpi = computed(() => {
  const open = all.value.filter((i) => i.open > 0);
  return { open: open.reduce((t, i) => t + i.open, 0), overdue: open.filter((i) => i.isOverdue).reduce((t, i) => t + i.open, 0), overdueCount: open.filter((i) => i.isOverdue).length,
    drafts: all.value.filter((i) => i.status === 'draf').length, openCount: open.length };
});
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);
watch(() => route.query.id, (v) => { if (v) openId.value = String(v); });
const form = ref<{ doc?: any } | null>(null);
function saved(doc: any) { form.value = null; toast.push('Draf tagihan disimpan', `${doc.docNo} · ${F.rp(doc.total)}`, 'ok'); reload(); openId.value = doc.id; }
const openOrder = (id: string) => router.push({ path: '/pesanan-pembelian', query: { id } });
const openPayment = (id: string) => router.push({ path: '/pembayaran', query: { id } });
</script>

<template>
  <ReportHead title="Tagihan Pemasok" sub="Tagihan dari PO dicocokkan tiga arah (PO × barang diterima × tagihan). Posting oleh orang lain memindahkan saldo barang diterima belum ditagih ke utang usaha.">
    <button v-if="session.can('purchasing.invoice.create')" class="btn btn-primary" data-action="new-ap-invoice" @click="form = {}"><Icon name="plus" /> Tagihan jasa/biaya</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Sisa hutang" :value="F.rpCompact(kpi.open)" :foot="`${kpi.openCount} tagihan terbuka`" />
    <KpiTile label="Jatuh tempo" :value="F.rpCompact(kpi.overdue)" :foot="`${kpi.overdueCount} tagihan lewat jatuh tempo`" :tone="kpi.overdue ? 'neg' : ''" />
    <KpiTile label="Draf" :value="String(kpi.drafts)" foot="Menunggu posting" />
    <KpiTile label="Total tagihan" :value="String(all.length)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, pemasok, PO, no. tagihan pemasok…" aria-label="Cari tagihan" data-filter="ap-invoice"></div>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-chip="k || 'all'" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : all.length }}</span></button>
      </div>
    </div>
    <div class="table-scroll"><table class="table" data-table="ap-invoices">
      <thead><tr><th>Nomor</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Tanggal</th><th>Pemasok</th><th class="ta-r">Total</th><th class="ta-r">Dibayar</th><th class="ta-r">Sisa</th><th>Jatuh tempo</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="9"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="i in pg.pageRows.value" :key="i.id" data-row :data-ap-invoice="i.docNo" @click="openId = i.id">
          <td class="code cell-strong">{{ i.docNo }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="i.branch" /></td>
          <td class="num">{{ F.date(i.date) }}</td>
          <td><span class="cell-strong">{{ i.supplierName }}</span><span class="cell-sub">{{ i.supplierCode ?? '' }}<template v-if="i.orderNo"> · <span class="code">{{ i.orderNo }}</span></template><template v-if="i.pendingPayments"> · bayar diproses {{ F.rpCompact(i.pendingPayments) }}</template></span></td>
          <td class="ta-r num">{{ F.rpCompact(i.total) }}</td><td class="ta-r num">{{ i.paid ? F.rpCompact(i.paid) : '—' }}</td><td class="ta-r num" :class="{ neg: i.isOverdue }">{{ i.open ? F.rpCompact(i.open) : '—' }}</td>
          <td class="num">{{ F.date(i.dueDate) }}<span v-if="i.isOverdue" class="cell-sub neg">{{ i.overdueDays }} hari lewat</span></td>
          <td><Pill :status="i.isOverdue ? 'jatuh-tempo' : i.status" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="9"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada tagihan</span><span class="empty-note">Ubah kata kunci, status, atau cabang.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="tagihan" />
  </article>
  <ApInvoiceDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload" @edit="(d) => (form = { doc: d })" @open-order="openOrder" @open-payment="openPayment" />
  <PurchaseDocForm v-if="form" kind="invoice" :doc="form.doc" @close="form = null" @saved="saved" />
</template>
