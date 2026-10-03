<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { PR_CHIPS, PRIORITY_CHIPS, slaText } from '@/lib/procurement';
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
import ReportHead from '@/components/ReportHead.vue';
import RequisitionDrawer from '@/components/RequisitionDrawer.vue';
import RequisitionForm from '@/components/RequisitionForm.vue';

const route = useRoute();
const router = useRouter();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/purchasing/requisitions'));
const all = computed(() => data.value ?? []);

const status = ref(String(route.query.status ?? ''));
const priority = ref('');
const q = ref('');
const counts = computed(() => all.value.reduce((m: Record<string, number>, o) => { m[o.status] = (m[o.status] ?? 0) + 1; return m; }, {}));
const pcounts = computed(() => all.value.reduce((m: Record<string, number>, o) => { m[o.priority] = (m[o.priority] ?? 0) + 1; return m; }, {}));
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((o) => (!status.value || o.status === status.value) && (!priority.value || o.priority === priority.value)
    && (!s || [o.docNo, o.requesterName, o.department, o.description].some((x) => String(x ?? '').toLowerCase().includes(s))));
});
const pg = usePaged<any>(filtered, 10);
watch([q, status, priority], pg.reset);
const kpi = computed(() => {
  const wait = all.value.filter((o) => o.status === 'menunggu');
  const ready = all.value.filter((o) => o.status === 'disetujui');
  return { wait: wait.length, waitValue: wait.reduce((t, o) => t + o.estimatedTotal, 0), overdue: wait.filter((o) => o.slaOverdue).length,
    ready: ready.length, readyValue: ready.reduce((t, o) => t + o.estimatedTotal, 0), inRfq: ready.filter((o) => o.rfqStatus === 'terbuka').length,
    done: counts.value.selesai ?? 0 };
});

const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);
watch(() => route.query.id, (v) => { if (v) openId.value = String(v); });
const form = ref<{ doc?: any } | null>(null);
function saved(doc: any, submitted: boolean) {
  form.value = null;
  toast.push(submitted ? 'Permintaan diajukan — menunggu persetujuan' : 'Draf permintaan disimpan', `${doc.docNo} · ${F.rp(doc.estimatedTotal)}`, submitted ? 'warn' : 'ok');
  reload(); openId.value = doc.id;
}
const openRfq = (id: string) => router.push({ path: '/rfq', query: { id } });
const openOrder = (id: string) => router.push({ path: '/pesanan-pembelian', query: { id } });
</script>

<template>
  <ReportHead title="Permintaan Pembelian" sub="Permintaan pengadaan dari unit kerja. Disetujui orang selain pemohon (prioritas tinggi wajib diputus dalam 24 jam), lalu diproses menjadi RFQ atau PO. Nilai tercatat di buku besar saat barang PO diterima dan ditagih.">
    <button v-if="session.can('purchasing.requisition.create')" class="btn btn-primary" data-action="new-pr" @click="form = {}"><Icon name="plus" /> Permintaan baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Menunggu persetujuan" :value="String(kpi.wait)" :foot="F.rpCompact(kpi.waitValue)" :tone="kpi.wait ? 'neg' : ''" />
    <KpiTile label="Lewat SLA" :value="String(kpi.overdue)" foot="Belum diputus melewati batas" :tone="kpi.overdue ? 'neg' : ''" />
    <KpiTile label="Siap diproses" :value="String(kpi.ready)" :foot="`${F.rpCompact(kpi.readyValue)} · ${kpi.inRfq} dalam RFQ`" />
    <KpiTile label="Menjadi PO" :value="String(kpi.done)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, pemohon, departemen, keperluan…" aria-label="Cari permintaan" data-filter="pr"></div>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in PR_CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-chip="k || 'all'" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : all.length }}</span></button>
      </div>
      <div class="chips" role="group" aria-label="Saring prioritas">
        <button v-for="[k, label] in PRIORITY_CHIPS" :key="k" class="chip" :aria-pressed="priority === k" :data-priority="k || 'all'" @click="priority = k">{{ label }}<span v-if="k" class="chip-count">{{ pcounts[k] ?? 0 }}</span></button>
      </div>
    </div>
    <div class="table-scroll"><table class="table" data-table="requisitions">
      <thead><tr><th>Nomor</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Tanggal</th><th>Pemohon</th><th>Keperluan</th><th class="ta-r">Perkiraan nilai</th><th>Prioritas</th><th>Status</th><th>SLA / tindak lanjut</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="9"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="o in pg.pageRows.value" :key="o.id" data-row :data-pr="o.docNo" @click="openId = o.id">
          <td class="code cell-strong">{{ o.docNo }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="o.branch" /></td>
          <td class="num">{{ F.date(o.date) }}</td>
          <td><span class="cell-strong">{{ o.requesterName }}</span><span class="cell-sub">{{ o.department }}</span></td>
          <td>{{ o.description }}<span class="cell-sub">{{ o.lineCount }} baris</span></td>
          <td class="ta-r num">{{ F.rpCompact(o.estimatedTotal) }}</td>
          <td><Pill :status="o.priority" /></td><td><Pill :status="o.status" /></td>
          <td>
            <span v-if="o.status === 'menunggu'" :class="o.slaOverdue ? 'neg' : 'muted'">{{ slaText(o.slaDueAt) }}</span>
            <span v-else-if="o.orderNo" class="code">{{ o.orderNo }}</span>
            <span v-else-if="o.rfqNo && o.rfqStatus === 'terbuka'" class="code">{{ o.rfqNo }}</span>
            <span v-else-if="o.status === 'disetujui'" class="muted">siap RFQ / PO</span>
            <span v-else class="muted">—</span>
          </td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="9"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada permintaan</span><span class="empty-note">Ubah kata kunci, status, prioritas, atau cabang.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="permintaan" />
  </article>
  <RequisitionDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload" @edit="(d) => (form = { doc: d })" @open-rfq="openRfq" @open-order="openOrder" />
  <RequisitionForm v-if="form" :doc="form.doc" @close="form = null" @saved="saved" />
</template>
