<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get } from '@/lib/api';
import { PRIORITY, TICKET_STATUS } from '@/lib/crm';
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
const tab = ref('kinerja');
const load = async () => { try { p.value = await get(`/crm/suppliers/${route.params.id}/profile`); } catch (e) { toast.error(e, 'Profil pemasok tidak dapat dimuat'); } };
watch(() => route.params.id, () => { p.value = null; load(); }, { immediate: true });
const TABS: [string, string, string][] = [['kinerja', 'Kinerja', 'trending'], ['pembelian', 'Pembelian & hutang', 'cart'], ['klaim', 'Klaim', 'alert'], ['aktivitas', 'Aktivitas', 'clipboard'], ['kontak', 'Kontak', 'users']];
const canContacts = computed(() => session.can('crm.manage|purchasing.supplier.manage'));
const scoreTone = (s: number) => (s >= 80 ? 'ok' : s >= 60 ? 'warn' : 'danger');
const metrics = computed(() => p.value ? [
  ['Ketepatan kirim', p.value.kpi.onTimeRate === null ? '—' : F.pct(p.value.kpi.onTimeRate), `${p.value.kpi.deliveries} PO diterima`, p.value.kpi.onTimeRate ?? 0],
  ['Rata-rata waktu kirim', p.value.kpi.avgLeadDays === null ? '—' : `${F.dec(p.value.kpi.avgLeadDays)} hari`, `Janji ${p.value.supplier.leadDays} hari`, null],
  ['RFQ dimenangkan', p.value.kpi.rfqWinRate === null ? '—' : F.pct(p.value.kpi.rfqWinRate), `${p.value.kpi.rfqInvited} diundang · ${p.value.kpi.rfqQuoted} menawar · ${p.value.kpi.rfqWon} menang`, p.value.kpi.rfqWinRate ?? 0],
  ['Klaim mutu / layanan', String(p.value.kpi.claims), 'Tiket klaim ke pemasok', null],
] as [string, string, string, number | null][] : []);
</script>

<template>
  <div v-if="!p" class="loading">Memuat…</div>
  <template v-else>
    <ReportHead :title="p.supplier.name" :sub="`${p.supplier.code} · ${p.supplier.category ?? '—'} · ${p.supplier.city ?? '—'} · termin ${p.supplier.termsDays ? 'Net ' + p.supplier.termsDays : 'tunai'} · waktu kirim ${p.supplier.leadDays} hari`">
      <Pill :status="p.supplier.status" />
      <button class="btn" @click="router.push({ path: '/pemasok', query: { id: p.supplier.id } })"><Icon name="building" /> Data induk</button>
      <button v-if="session.can('crm.ticket')" class="btn" data-action="supplier-claim" @click="router.push({ path: '/tiket', query: { new: '1', party: 'supplier', supplierId: p.supplier.id } })"><Icon name="alert" /> Klaim</button>
    </ReportHead>
    <div class="kpi-row" style="margin-bottom:var(--sp-4)" data-supplier-kpi>
      <KpiTile label="Skor pemasok" :value="`${p.kpi.score} / 100`" foot="Ketepatan kirim, klaim, daya saing RFQ"><Pill :label="p.kpi.score >= 80 ? 'Andal' : p.kpi.score >= 60 ? 'Cukup' : 'Perlu evaluasi'" :tone="scoreTone(p.kpi.score)" /></KpiTile>
      <KpiTile label="Pembelian tahun ini" :value="F.rpCompact(p.kpi.purchasesYtd)" foot="Tagihan diposting (sebelum PPN)" />
      <KpiTile label="Hutang terbuka" :value="F.rpCompact(p.kpi.openAp)" :foot="`Jatuh tempo ${F.rpCompact(p.kpi.overdueAp)}`" :tone="p.kpi.overdueAp ? 'neg' : ''" />
      <KpiTile label="PO berjalan" :value="F.rpCompact(p.kpi.openPo)" foot="Menunggu, disetujui, diterima sebagian" />
    </div>
    <div class="tab-bar" style="margin-bottom:var(--sp-3)">
      <button v-for="[k, l, ic] in TABS" :key="k" class="tab-btn" :class="{ active: tab === k }" :data-profile-tab="k" @click="tab = k"><Icon :name="ic" /> {{ l }}</button>
    </div>
    <article v-if="tab === 'kinerja'" class="card">
      <div class="card-body" style="display:flex;flex-direction:column;gap:var(--sp-3)">
        <div v-for="[l, v, foot, pctv] in metrics" :key="l" style="display:grid;grid-template-columns:200px 1fr 120px;gap:var(--sp-3);align-items:center">
          <span><span class="cell-strong">{{ l }}</span><span class="cell-sub">{{ foot }}</span></span>
          <div v-if="pctv !== null" class="meter"><span class="meter-track"><span class="meter-fill" :style="{ width: pctv + '%' }" :data-tone="pctv < 60 ? 'danger' : undefined"></span></span></div><span v-else></span>
          <span class="num ta-r" style="font-size:var(--fs-lg, 18px)">{{ v }}</span>
        </div>
        <span class="setting-note">Skor = 60% ketepatan kirim + 30% bebas klaim + 10% daya saing RFQ. Pakai saat memilih pemasok di RFQ.</span>
      </div>
    </article>
    <template v-else-if="tab === 'pembelian'">
      <section class="grid grid-1-1">
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Pesanan pembelian</h2></div></div>
          <div class="table-scroll"><table class="table" data-table="supplier-pos"><tbody>
            <tr v-for="o in p.orders" :key="o.id" data-row @click="router.push({ path: '/pesanan-pembelian', query: { id: o.id } })"><td class="code">{{ o.docNo }}</td><td><BranchTag :code="o.branch" /></td><td class="num">{{ F.date(o.date) }}</td><td class="ta-r num">{{ F.rpCompact(o.total) }}</td><td><Pill :status="o.status" /></td></tr>
            <tr v-if="!p.orders.length" class="is-static"><td class="muted">Belum ada PO.</td></tr>
          </tbody></table></div>
        </article>
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Tagihan & hutang</h2><span class="card-note">Hutang terbuka {{ F.rp(p.kpi.openAp) }}</span></div></div>
          <div class="table-scroll"><table class="table"><tbody>
            <tr v-for="i in p.invoices" :key="i.id" data-row @click="router.push({ path: '/tagihan-pemasok', query: { id: i.id } })"><td class="code">{{ i.docNo }}</td><td class="num">{{ F.date(i.dueDate) }}</td><td class="ta-r num">{{ F.rpCompact(i.total) }}</td><td class="ta-r num">{{ i.total - i.paid > 0 && ['belum-dibayar', 'sebagian'].includes(i.status) ? F.rpCompact(i.total - i.paid) : '—' }}</td><td><Pill :status="i.status" /></td></tr>
            <tr v-if="!p.invoices.length" class="is-static"><td class="muted">Belum ada tagihan.</td></tr>
          </tbody></table></div>
        </article>
      </section>
      <section class="grid grid-1-1" style="margin-top:var(--sp-4)">
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Pembayaran</h2></div></div>
          <div class="table-scroll"><table class="table"><tbody>
            <tr v-for="x in p.payments" :key="x.id" data-row @click="router.push({ path: '/pembayaran', query: { id: x.id } })"><td class="code">{{ x.docNo }}</td><td class="num">{{ F.date(x.date) }}</td><td class="code muted">{{ x.invoiceNo }}</td><td class="ta-r num">{{ F.rpCompact(x.amount) }}</td><td><Pill :status="x.status" /></td></tr>
            <tr v-if="!p.payments.length" class="is-static"><td class="muted">Belum ada pembayaran.</td></tr>
          </tbody></table></div>
        </article>
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Riwayat RFQ</h2></div></div>
          <div class="table-scroll"><table class="table"><tbody>
            <tr v-for="x in p.quotes" :key="x.id" class="is-static"><td class="code">{{ x.rfqNo }}</td><td>{{ x.title }}</td><td class="ta-r num">{{ x.total === null ? '—' : F.rpCompact(x.total) }}</td><td><Pill v-if="x.won" label="Menang" tone="ok" /><Pill v-else :status="x.status" /></td></tr>
            <tr v-if="!p.quotes.length" class="is-static"><td class="muted">Belum pernah diundang RFQ.</td></tr>
          </tbody></table></div>
        </article>
      </section>
    </template>
    <article v-else-if="tab === 'klaim'" class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Klaim ke pemasok ({{ p.tickets.length }})</h2></div></div>
      <div class="table-scroll"><table class="table" data-table="supplier-claims"><tbody>
        <tr v-for="x in p.tickets" :key="x.id" data-row @click="router.push({ path: '/tiket', query: { id: x.id } })"><td class="code cell-strong">{{ x.code }}</td><td>{{ x.subject }}</td><td><Pill :label="PRIORITY[x.priority].label" :tone="PRIORITY[x.priority].tone" /></td><td><Pill :label="TICKET_STATUS[x.status].label" :tone="TICKET_STATUS[x.status].tone" /></td></tr>
        <tr v-if="!p.tickets.length" class="is-static"><td class="muted">Belum ada klaim.</td></tr>
      </tbody></table></div>
    </article>
    <article v-else-if="tab === 'aktivitas'" class="card"><div class="card-body"><ActivityPanel :link="{ supplierId: p.supplier.id }" :initial="p.activities" can-add @changed="load" /></div></article>
    <article v-else-if="tab === 'kontak'" class="card"><div class="card-body"><ContactsPanel party-type="supplier" :party-id="p.supplier.id" :initial="p.contacts" :can-manage="canContacts" @changed="load" /></div></article>
  </template>
</template>
