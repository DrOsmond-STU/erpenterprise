<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get } from '@/lib/api';
import { DUNNING_TONE, PRIORITY, PROMISE, STAGE_LABEL, TICKET_STATUS } from '@/lib/crm';
import * as F from '@/lib/format';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import ActivityPanel from '@/components/ActivityPanel.vue';
import BranchTag from '@/components/BranchTag.vue';
import ContactsPanel from '@/components/ContactsPanel.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const route = useRoute();
const router = useRouter();
const session = useSession();
const toast = useToast();
const p = ref<any>(null);
const tab = ref(String(route.query.tab ?? 'ringkasan'));
const load = async () => { try { p.value = await get(`/crm/customers/${route.params.id}/profile`); } catch (e) { toast.error(e, 'Profil pelanggan tidak dapat dimuat'); } };
watch(() => route.params.id, () => { p.value = null; load(); }, { immediate: true });
const maxMonth = computed(() => Math.max(1, ...(p.value?.monthly ?? []).map((m: any) => m.revenue)));
const maxAging = computed(() => Math.max(1, ...(p.value?.aging ?? []).map((b: any) => b.value)));
const openInvoices = computed(() => (p.value?.invoices ?? []).filter((i: any) => i.open > 0));
const TABS: [string, string, string][] = [['ringkasan', 'Ringkasan', 'grid'], ['penjualan', 'Penjualan', 'trending'], ['piutang', 'Piutang & penagihan', 'wallet'], ['layanan', 'Tiket layanan', 'alert'], ['aktivitas', 'Aktivitas', 'clipboard'], ['kontak', 'Kontak', 'users']];
const canContacts = computed(() => session.can('crm.manage|sales.customer.manage'));
const AGING_TONE = ['var(--cat-1)', 'var(--cat-2)', 'var(--warn)', 'var(--danger)', 'var(--danger)'];
</script>

<template>
  <div v-if="!p" class="loading">Memuat…</div>
  <template v-else>
    <ReportHead :title="p.customer.name" :sub="`${p.customer.code} · ${p.customer.segment} · ${p.customer.city ?? '—'} · termin ${p.customer.termsDays ? 'Net ' + p.customer.termsDays : 'tunai'} · account manager ${p.customer.accountManager ?? '—'}`">
      <Pill :status="p.customer.status" />
      <button class="btn" @click="router.push({ path: '/pelanggan', query: { id: p.customer.id } })"><Icon name="handshake" /> Data induk</button>
      <button v-if="session.can('crm.ticket')" class="btn" data-action="customer-ticket" @click="router.push({ path: '/tiket', query: { new: '1', party: 'customer', customerId: p.customer.id } })"><Icon name="alert" /> Tiket</button>
    </ReportHead>
    <div class="kpi-row" style="margin-bottom:var(--sp-4)" data-profile-kpi>
      <KpiTile label="Pendapatan tahun ini" :value="F.rpCompact(p.kpi.revenueYtd)" :foot="`Tahun lalu ${F.rpCompact(p.kpi.revenuePrevYear)} · ${p.kpi.invoicesYtd} faktur`" />
      <KpiTile label="Piutang terbuka" :value="F.rpCompact(p.kpi.openAr)" :foot="`Jatuh tempo ${F.rpCompact(p.kpi.overdue)}${p.kpi.worstDunning ? ' · ' + p.kpi.worstDunning.label : ''}`" :tone="p.kpi.overdue ? 'neg' : ''" />
      <KpiTile label="Sisa plafon" :value="F.rpCompact(p.kpi.creditAvailable)" :foot="p.kpi.creditUsedPct === null ? 'Tanpa plafon kredit' : `Terpakai ${F.pct(p.kpi.creditUsedPct)} dari ${F.rpCompact(p.kpi.creditLimit)}`" :tone="p.kpi.creditAvailable < 0 ? 'neg' : ''" />
      <KpiTile label="Rata-rata bayar" :value="p.kpi.avgDaysToPay === null ? '—' : `${p.kpi.avgDaysToPay} hari`" :foot="`Pipeline ${F.rpCompact(p.kpi.pipeline)} · ${p.kpi.openTickets} tiket terbuka`" />
    </div>
    <div class="tab-bar" style="margin-bottom:var(--sp-3)">
      <button v-for="[k, l, ic] in TABS" :key="k" class="tab-btn" :class="{ active: tab === k }" :data-profile-tab="k" @click="tab = k"><Icon :name="ic" /> {{ l }}</button>
    </div>

    <template v-if="tab === 'ringkasan'">
      <section class="grid grid-1-1">
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Pendapatan 12 bulan</h2><span class="card-note">Faktur terbit (nilai sebelum PPN).</span></div></div>
          <div class="card-body"><div class="mini-bars" role="img" aria-label="Pendapatan bulanan">
            <div v-for="m in p.monthly" :key="m.month" class="mini-bar" :title="`${m.month}: ${F.rp(m.revenue)}`"><i :style="{ height: (m.revenue / maxMonth) * 110 + 'px' }"></i><span>{{ F.monthLabels[Number(m.month.slice(5, 7)) - 1] }}</span></div>
          </div></div>
        </article>
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Umur piutang</h2><span class="card-note">Σ = piutang terbuka {{ F.rp(p.kpi.openAr) }}</span></div></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:var(--sp-2)">
            <div v-for="(b, i) in p.aging" :key="b.key" style="display:grid;grid-template-columns:120px 1fr auto;gap:var(--sp-2);align-items:center">
              <span style="font-size:var(--fs-sm)">{{ b.label }}<span class="cell-sub">{{ b.count }} faktur</span></span>
              <span style="height:10px;background:var(--surface-2);border-radius:5px;overflow:hidden"><span :style="{ display: 'block', height: '100%', width: (b.value / maxAging) * 100 + '%', background: AGING_TONE[Number(i)] }"></span></span>
              <span class="num" style="font-size:var(--fs-sm);min-width:80px;text-align:right">{{ F.rpCompact(b.value) }}</span>
            </div>
          </div>
        </article>
      </section>
      <section class="grid grid-1-1" style="margin-top:var(--sp-4)">
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Posisi kredit</h2></div></div>
          <div class="card-body"><div class="totals">
            <div class="totals-row"><span>Plafon kredit</span><b>{{ F.rp(p.customer.creditLimit) }}</b></div>
            <div class="totals-row"><span>Piutang terbuka</span><b>{{ F.rp(p.customer.exposure.openAr) }}</b></div>
            <div class="totals-row"><span>Faktur draf</span><b>{{ F.rp(p.customer.exposure.drafts) }}</b></div>
            <div class="totals-row"><span>Pesanan belum difakturkan</span><b>{{ F.rp(p.customer.exposure.openOrders) }}</b></div>
            <div class="totals-row totals-grand"><span>Sisa plafon</span><b :class="{ neg: p.customer.available < 0 }">{{ F.rp(p.customer.available) }}</b></div>
          </div></div>
        </article>
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Aktivitas terbaru</h2></div><button class="btn btn-sm btn-ghost" @click="tab = 'aktivitas'">Semua <Icon name="chevron-right" /></button></div>
          <div class="card-body"><div class="timeline">
            <div v-for="a in p.activities.slice(0, 6)" :key="a.id" class="tl-item"><span class="tl-rail"><i class="tl-node" :data-tone="a.status === 'terbuka' ? 'warn' : 'ok'"></i><i class="tl-line"></i></span>
              <span class="tl-body"><span class="tl-title">{{ a.subject }}</span><span class="tl-meta">{{ a.status === 'terbuka' ? 'Tenggat ' + F.datetime(a.dueAt) : F.datetime(a.doneAt ?? a.createdAt) }} · {{ a.assigneeName ?? a.createdByName }}</span></span></div>
            <div v-if="!p.activities.length" class="muted">Belum ada aktivitas.</div>
          </div></div>
        </article>
      </section>
      <article v-if="p.projects.length" class="card" style="margin-top:var(--sp-4)">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Proyek</h2></div></div>
        <div class="table-scroll"><table class="table"><tbody>
          <tr v-for="x in p.projects" :key="x.id" data-row @click="router.push({ path: '/proyek', query: { id: x.id } })"><td class="code">{{ x.code }}</td><td>{{ x.name }}</td><td><Pill :status="x.status" /></td></tr>
        </tbody></table></div>
      </article>
    </template>

    <template v-else-if="tab === 'penjualan'">
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Peluang ({{ p.opportunities.length }})</h2><span class="card-note">Pipeline {{ F.rp(p.kpi.pipeline) }} · menang {{ F.rp(p.kpi.wonValue) }}</span></div></div>
        <div class="table-scroll"><table class="table" data-table="profile-opps"><tbody>
          <tr v-for="o in p.opportunities" :key="o.id" data-row @click="router.push({ path: '/lead', query: { id: o.id } })"><td class="code cell-strong">{{ o.code }}</td><td>{{ o.name }}<span class="cell-sub">{{ o.ownerName }}</span></td><td class="ta-r num">{{ F.rpCompact(o.value) }}</td><td>{{ STAGE_LABEL[o.stage] }} · {{ o.probability }}%</td></tr>
          <tr v-if="!p.opportunities.length" class="is-static"><td class="muted">Belum ada peluang.</td></tr>
        </tbody></table></div>
      </article>
      <section class="grid grid-1-1" style="margin-top:var(--sp-4)">
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Penawaran</h2></div></div>
          <div class="table-scroll"><table class="table"><tbody>
            <tr v-for="q in p.quotations" :key="q.id" data-row @click="router.push({ path: '/penawaran', query: { id: q.id } })"><td class="code">{{ q.docNo }}</td><td class="num">{{ F.date(q.date) }}</td><td class="ta-r num">{{ F.rpCompact(q.total) }}</td><td><Pill :status="q.status" /><span v-if="q.expired" class="cell-sub neg">kedaluwarsa</span></td></tr>
            <tr v-if="!p.quotations.length" class="is-static"><td class="muted">Belum ada penawaran.</td></tr>
          </tbody></table></div>
        </article>
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Pesanan penjualan</h2></div></div>
          <div class="table-scroll"><table class="table" data-table="profile-orders"><tbody>
            <tr v-for="o in p.orders" :key="o.id" data-row @click="router.push({ path: '/pesanan-penjualan', query: { id: o.id } })"><td class="code">{{ o.docNo }}</td><td><BranchTag :code="o.branch" /></td><td class="num">{{ F.date(o.date) }}</td><td class="ta-r num">{{ F.rpCompact(o.total) }}</td><td><Pill :status="o.status" /></td></tr>
            <tr v-if="!p.orders.length" class="is-static"><td class="muted">Belum ada pesanan.</td></tr>
          </tbody></table></div>
        </article>
      </section>
    </template>

    <template v-else-if="tab === 'piutang'">
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Faktur terbuka ({{ openInvoices.length }})</h2><span class="card-note">Klik untuk penagihan: catat kontak, janji bayar, tahan kredit.</span></div></div>
        <div class="table-scroll"><table class="table" data-table="profile-invoices">
          <thead><tr><th>Faktur</th><th>Cabang</th><th>Jatuh tempo</th><th class="ta-r">Total</th><th class="ta-r">Sisa</th><th>Tingkat</th></tr></thead>
          <tbody>
            <tr v-for="i in openInvoices" :key="i.id" data-row @click="router.push({ path: '/penagihan', query: { invoice: i.id } })"><td class="code cell-strong">{{ i.docNo }}</td><td><BranchTag :code="i.branch" /></td><td class="num">{{ F.date(i.dueDate) }}<span v-if="i.overdueDays" class="cell-sub neg">{{ i.overdueDays }} hari lewat</span></td>
              <td class="ta-r num">{{ F.rpCompact(i.total) }}</td><td class="ta-r num">{{ F.rpCompact(i.open) }}</td><td><Pill :label="i.dunning.label" :tone="DUNNING_TONE[i.dunning.level]" /></td></tr>
            <tr v-if="!openInvoices.length" class="is-static"><td colspan="6" class="muted">Tidak ada piutang terbuka.</td></tr>
          </tbody>
        </table></div>
      </article>
      <section class="grid grid-1-1" style="margin-top:var(--sp-4)">
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Janji bayar</h2></div></div>
          <div class="table-scroll"><table class="table" data-table="profile-promises"><tbody>
            <tr v-for="x in p.promises" :key="x.id" class="is-static"><td class="code">{{ x.invoiceNo }}</td><td class="num">{{ F.date(x.promiseDate) }}</td><td class="ta-r num">{{ F.rpCompact(x.amount) }}</td><td><Pill :label="PROMISE[x.status]?.label" :tone="PROMISE[x.status]?.tone" /></td></tr>
            <tr v-if="!p.promises.length" class="is-static"><td class="muted">Belum ada janji bayar.</td></tr>
          </tbody></table></div>
        </article>
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Penerimaan</h2><span class="card-note">Setiap penerimaan dijurnal ke kas/bank & piutang usaha.</span></div></div>
          <div class="table-scroll"><table class="table"><tbody>
            <tr v-for="x in p.receipts" :key="x.id" :class="x.journalId ? '' : 'is-static'" data-row @click="x.journalId && router.push({ path: '/jurnal', query: { id: x.journalId } })"><td class="code">{{ x.docNo }}</td><td class="num">{{ F.date(x.date) }}</td><td class="code muted">{{ x.invoiceNo }}</td><td class="ta-r num">{{ F.rpCompact(x.amount) }}</td></tr>
            <tr v-if="!p.receipts.length" class="is-static"><td class="muted">Belum ada penerimaan.</td></tr>
          </tbody></table></div>
        </article>
      </section>
      <article class="card" style="margin-top:var(--sp-4)">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Riwayat faktur</h2></div></div>
        <div class="table-scroll"><table class="table"><tbody>
          <tr v-for="i in p.invoices" :key="i.id" data-row @click="router.push({ path: '/faktur', query: { id: i.id } })"><td class="code">{{ i.docNo }}</td><td class="num">{{ F.date(i.date) }}</td><td class="ta-r num">{{ F.rpCompact(i.total) }}</td><td><Pill :status="i.status" /></td></tr>
        </tbody></table></div>
      </article>
    </template>

    <article v-else-if="tab === 'layanan'" class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Tiket layanan ({{ p.tickets.length }})</h2></div></div>
      <div class="table-scroll"><table class="table" data-table="profile-tickets"><tbody>
        <tr v-for="x in p.tickets" :key="x.id" data-row @click="router.push({ path: '/tiket', query: { id: x.id } })"><td class="code cell-strong">{{ x.code }}</td><td>{{ x.subject }}</td><td><Pill :label="PRIORITY[x.priority].label" :tone="PRIORITY[x.priority].tone" /></td><td><Pill :label="TICKET_STATUS[x.status].label" :tone="TICKET_STATUS[x.status].tone" /><span v-if="x.breached" class="cell-sub neg">lewat SLA</span></td></tr>
        <tr v-if="!p.tickets.length" class="is-static"><td class="muted">Belum ada tiket.</td></tr>
      </tbody></table></div>
    </article>

    <article v-else-if="tab === 'aktivitas'" class="card"><div class="card-body"><ActivityPanel :link="{ customerId: p.customer.id }" :initial="p.activities" can-add @changed="load" /></div></article>
    <article v-else-if="tab === 'kontak'" class="card"><div class="card-body"><ContactsPanel party-type="customer" :party-id="p.customer.id" :initial="p.contacts" :can-manage="canContacts" @changed="load" /></div></article>
  </template>
</template>
