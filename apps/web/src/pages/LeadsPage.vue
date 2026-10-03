<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get } from '@/lib/api';
import { SOURCES, STAGE_COLUMNS } from '@/lib/crm';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import OpportunityDrawer from '@/components/OpportunityDrawer.vue';
import OpportunityForm from '@/components/OpportunityForm.vue';
import QuotationForm from '@/components/QuotationForm.vue';
import ReportHead from '@/components/ReportHead.vue';

const route = useRoute();
const router = useRouter();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any>(() => get('/crm/opportunities'));
const q = ref('');
const source = ref('');
const visible = computed(() => {
  const s = q.value.trim().toLowerCase();
  return (data.value?.rows ?? []).filter((o: any) => (!source.value || o.source === source.value) && (!s || [o.code, o.name, o.companyName, o.ownerName].some((x) => String(x ?? '').toLowerCase().includes(s))));
});
const column = (k: string) => visible.value.filter((o: any) => o.stage === k);
const colValue = (k: string) => column(k).reduce((t: number, o: any) => t + o.value, 0);
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);
watch(() => route.query.id, (v) => { if (v) openId.value = String(v); });
const form = ref<{ doc?: any } | null>(null);
const quoteFor = ref<any>(null);
const drawer = ref<any>(null);
function saved(doc: any) { form.value = null; toast.push('Peluang disimpan', `${doc.code} · ${doc.name}`, 'ok'); reload(); openId.value = doc.id; drawer.value?.load?.(); }
function quoteSaved(qt: any) { quoteFor.value = null; toast.push('Draf penawaran dibuat', `${qt.docNo} · ${F.rp(qt.total)}`, 'ok'); router.push({ path: '/penawaran', query: { id: qt.id } }); }
</script>

<template>
  <ReportHead title="Lead & Peluang" sub="Pipeline penjualan per tahap. Nilai pipeline = nilai × probabilitas untuk peluang terbuka. Peluang menang saat penawarannya diterima dan menjadi pesanan penjualan — pendapatan tercatat di buku besar saat faktur pesanan diterbitkan.">
    <button v-if="session.can('crm.manage')" class="btn btn-primary" data-action="new-opp" @click="form = {}"><Icon name="plus" /> Peluang baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Pipeline aktif (tertimbang)" :value="F.rpCompact(data?.summary.pipeline ?? 0)" :foot="`${data?.summary.openCount ?? 0} peluang · nilai ${F.rpCompact(data?.summary.openValue ?? 0)}`" />
    <KpiTile label="Rata-rata deal" :value="F.rpCompact(data?.summary.avgDeal ?? 0)" foot="Peluang menang" />
    <KpiTile label="Menang" :value="String(data?.summary.won ?? 0)" :foot="`${F.rpCompact(data?.summary.wonValue ?? 0)} · rasio ${F.pct(data?.summary.winRate ?? 0)}`" />
    <KpiTile label="Kalah" :value="String(data?.summary.lost ?? 0)" :foot="ctx.branchShort" />
  </div>
  <div class="toolbar" style="margin-bottom:var(--sp-3)">
    <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari kode, peluang, perusahaan, PIC…" aria-label="Cari peluang"></div>
    <select v-model="source" class="select" style="max-width:180px" aria-label="Saring sumber" data-field="source-filter"><option value="">Semua sumber</option><option v-for="s in SOURCES" :key="s" :value="s">{{ s }}</option></select>
  </div>
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <div v-else class="board" data-board>
    <section v-for="[k, label] in STAGE_COLUMNS" :key="k" class="board-col" :aria-label="label" :data-col="k">
      <div class="board-col-head"><h2 class="card-title">{{ label }}</h2><span class="rail-link-count">{{ column(k).length }}</span></div>
      <div class="board-col-body">
        <span class="muted num" style="padding:0 var(--sp-2);font-size:12px">{{ F.rpCompact(colValue(k)) }}</span>
        <button v-for="o in column(k)" :key="o.id" class="board-card" :data-opp="o.code" @click="openId = o.id">
          <span class="board-card-top"><span class="code muted">{{ o.code }}</span><BranchTag v-if="ctx.branch === 'ALL'" :code="o.branch" /></span>
          <span class="board-card-title">{{ o.name }}</span>
          <span class="board-card-meta"><span>{{ o.companyName }}</span></span>
          <span class="board-card-meta"><span class="num">{{ F.rpCompact(o.value) }}</span><span>{{ o.probability }}%</span></span>
          <span class="board-card-meta" :class="{ neg: o.overdueAction }"><Icon name="clock" /><span>{{ o.nextActionDate ? F.date(o.nextActionDate) : '—' }}</span><span class="toolbar-spacer"></span><span>{{ o.ownerName }}</span></span>
        </button>
        <div v-if="!column(k).length" class="empty-note" style="padding:var(--sp-3);text-align:center">Kosong</div>
      </div>
    </section>
  </div>
  <OpportunityDrawer v-if="openId" :id="openId" ref="drawer" @close="openId = null" @changed="reload" @edit="(d) => (form = { doc: d })" @new-quote="(o) => (quoteFor = o)" @open-quote="(id) => router.push({ path: '/penawaran', query: { id } })" />
  <OpportunityForm v-if="form" :doc="form.doc" @close="form = null" @saved="saved" />
  <QuotationForm v-if="quoteFor" :opportunity="quoteFor" @close="quoteFor = null" @saved="quoteSaved" />
</template>
