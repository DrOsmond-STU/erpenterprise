<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { PAYMENT_CHIPS } from '@/lib/purchasing';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pager from '@/components/Pager.vue';
import PaymentDrawer from '@/components/PaymentDrawer.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const route = useRoute();
const router = useRouter();
const ctx = useContext();
const session = useSession();
const { data, loading, reload } = useLoader<any[]>(() => get('/purchasing/payments'));
const all = computed(() => data.value ?? []);
const status = ref(String(route.query.status ?? ''));
const q = ref('');
const mine = (p: any) => p.status === 'menunggu' && p.createdBy !== session.user?.id && !p.approvals.some((a: any) => a.userId === session.user?.id);
const counts = computed(() => all.value.reduce((m: Record<string, number>, p) => { m[p.status] = (m[p.status] ?? 0) + 1; return m; }, {}));
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((p) => (!status.value || p.status === status.value) && (!s || p.docNo.toLowerCase().includes(s) || (p.supplierName ?? '').toLowerCase().includes(s) || (p.invoiceNo ?? '').toLowerCase().includes(s)));
});
const pg = usePaged<any>(filtered, 10);
watch([q, status], pg.reset);
const kpi = computed(() => ({
  waiting: all.value.filter((p) => p.status === 'menunggu'), ready: all.value.filter((p) => p.status === 'disetujui'),
  forMe: session.can('purchasing.payment.approve') ? all.value.filter(mine).length : 0,
  paidMonth: all.value.filter((p) => p.status === 'dibayar' && String(p.date).startsWith(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7))).reduce((t, p) => t + p.amount, 0),
}));
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);
watch(() => route.query.id, (v) => { if (v) openId.value = String(v); });
const openInvoice = (id: string) => router.push({ path: '/tagihan-pemasok', query: { id } });
</script>

<template>
  <ReportHead title="Pembayaran Pemasok" sub="Setiap pembayaran diajukan dari tagihan, disetujui orang lain (dua penyetuju berbeda di atas ambang), lalu dieksekusi. Transfer ditahan bila rekening pemasok belum terverifikasi atau masih dalam masa tunggu." />
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Menunggu persetujuan" :value="String(kpi.waiting.length)" :foot="F.rpCompact(kpi.waiting.reduce((t, p) => t + p.amount, 0))" :tone="kpi.waiting.length ? 'neg' : ''" />
    <KpiTile v-if="session.can('purchasing.payment.approve')" label="Perlu keputusan Anda" :value="String(kpi.forMe)" foot="Bukan pengajuan Anda" />
    <KpiTile label="Siap dibayar" :value="String(kpi.ready.length)" :foot="F.rpCompact(kpi.ready.reduce((t, p) => t + p.amount, 0))" />
    <KpiTile label="Dibayar bulan ini" :value="F.rpCompact(kpi.paidMonth)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, pemasok, tagihan…" aria-label="Cari pembayaran" data-filter="payment"></div>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in PAYMENT_CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-chip="k || 'all'" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : all.length }}</span></button>
      </div>
    </div>
    <div class="table-scroll"><table class="table" data-table="payments">
      <thead><tr><th>Nomor</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Tanggal</th><th>Pemasok / tagihan</th><th class="ta-r">Nilai</th><th>Rekening</th><th>Persetujuan</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="8"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="p in pg.pageRows.value" :key="p.id" data-row :data-payment="p.docNo" @click="openId = p.id">
          <td class="code cell-strong">{{ p.docNo }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="p.branch" /></td><td class="num">{{ F.date(p.date) }}</td>
          <td><span class="cell-strong">{{ p.supplierName }}</span><span class="cell-sub"><span class="code">{{ p.invoiceNo }}</span></span></td>
          <td class="ta-r num">{{ F.rpCompact(p.amount) }}</td><td>{{ p.bankName ?? p.bankAccount }}<span class="cell-sub">{{ p.method }}</span></td>
          <td><span v-if="p.legacy" class="muted">data awal</span><span v-else :class="{ neg: p.status === 'menunggu' }">{{ p.approvals.length }}/{{ p.requiredApprovals }}</span><span v-if="!p.legacy && p.approvals.length" class="cell-sub">{{ p.approvals.map((a: any) => a.name).join(', ') }}</span></td>
          <td><Pill :status="p.status" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="8"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada pembayaran</span><span class="empty-note">Ajukan pembayaran dari halaman Tagihan Pemasok.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="pembayaran" />
  </article>
  <PaymentDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload" @open-invoice="openInvoice" />
</template>
