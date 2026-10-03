<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get } from '@/lib/api';
import { QUOTE_CHIPS } from '@/lib/crm';
import * as F from '@/lib/format';
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
import QuotationDrawer from '@/components/QuotationDrawer.vue';
import QuotationForm from '@/components/QuotationForm.vue';
import ReportHead from '@/components/ReportHead.vue';

const route = useRoute();
const router = useRouter();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/crm/quotations'));
const all = computed(() => data.value ?? []);
const status = ref(String(route.query.status ?? ''));
const q = ref('');
const counts = computed(() => all.value.reduce((m: Record<string, number>, o) => { m[o.status] = (m[o.status] ?? 0) + 1; return m; }, {}));
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((o) => (!status.value || o.status === status.value) && (!s || [o.docNo, o.customerName, o.opportunityCode, o.createdByName].some((x) => String(x ?? '').toLowerCase().includes(s))));
});
const pg = usePaged<any>(filtered, 10);
watch([q, status], pg.reset);
const kpi = computed(() => {
  const sent = all.value.filter((o) => o.status === 'terkirim');
  const decided = all.value.filter((o) => ['diterima', 'ditolak'].includes(o.status));
  return { sent: sent.length, sentValue: sent.reduce((t, o) => t + o.total, 0), expired: all.value.filter((o) => o.expired).length,
    accepted: counts.value.diterima ?? 0, acceptedValue: all.value.filter((o) => o.status === 'diterima').reduce((t, o) => t + o.total, 0),
    rate: decided.length ? ((counts.value.diterima ?? 0) / decided.length) * 100 : 0 };
});
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);
watch(() => route.query.id, (v) => { if (v) openId.value = String(v); });
const form = ref<{ doc?: any } | null>(null);
const drawer = ref<any>(null);
function saved(doc: any) { form.value = null; toast.push('Penawaran disimpan', `${doc.docNo} · ${F.rp(doc.total)}`, 'ok'); reload(); openId.value = doc.id; drawer.value?.load?.(); }
</script>

<template>
  <ReportHead title="Penawaran" sub="Penawaran harga ke pelanggan dengan masa berlaku. Penawaran diterima dikonversi menjadi pesanan penjualan (plafon kredit diperiksa), lalu faktur memposting pendapatan, PPN, dan HPP ke buku besar.">
    <button v-if="session.can('sales.quote.create')" class="btn btn-primary" data-action="new-quote" @click="form = {}"><Icon name="plus" /> Penawaran baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Terkirim — menunggu jawaban" :value="String(kpi.sent)" :foot="F.rpCompact(kpi.sentValue)" />
    <KpiTile label="Kedaluwarsa" :value="String(kpi.expired)" foot="Lewat masa berlaku" :tone="kpi.expired ? 'neg' : ''" />
    <KpiTile label="Diterima" :value="String(kpi.accepted)" :foot="F.rpCompact(kpi.acceptedValue)" />
    <KpiTile label="Rasio diterima" :value="F.pct(kpi.rate)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, pelanggan, peluang…" aria-label="Cari penawaran"></div>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in QUOTE_CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-chip="k || 'all'" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : all.length }}</span></button>
      </div>
    </div>
    <div class="table-scroll"><table class="table" data-table="quotations">
      <thead><tr><th>Nomor</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Tanggal</th><th>Pelanggan</th><th class="ta-r">Total</th><th>Berlaku s.d.</th><th>PIC</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="8"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="o in pg.pageRows.value" :key="o.id" data-row :data-quote-no="o.docNo" @click="openId = o.id">
          <td class="code cell-strong">{{ o.docNo }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="o.branch" /></td>
          <td class="num">{{ F.date(o.date) }}</td>
          <td><span class="cell-strong">{{ o.customerName }}</span><span v-if="o.opportunityCode" class="cell-sub code">{{ o.opportunityCode }}</span></td>
          <td class="ta-r num">{{ F.rpCompact(o.total) }}</td>
          <td class="num" :class="o.expired ? 'neg' : ''">{{ F.date(o.validUntil) }}<span v-if="o.expired" class="cell-sub neg">kedaluwarsa</span></td>
          <td>{{ o.createdByName }}</td>
          <td><Pill :status="o.status" /><span v-if="o.salesOrderNo" class="cell-sub code">{{ o.salesOrderNo }}</span></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="8"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada penawaran</span><span class="empty-note">Ubah kata kunci, status, atau cabang.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="penawaran" />
  </article>
  <QuotationDrawer v-if="openId" :id="openId" ref="drawer" @close="openId = null" @changed="reload" @edit="(d) => (form = { doc: d })"
    @open-order="(id) => router.push({ path: '/pesanan-penjualan', query: { id } })" @open-opportunity="(id) => router.push({ path: '/lead', query: { id } })" />
  <QuotationForm v-if="form" :doc="form.doc" @close="form = null" @saved="saved" />
</template>
