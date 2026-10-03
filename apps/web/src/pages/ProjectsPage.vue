<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { PROJECT_CHIPS } from '@/lib/planning';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pill from '@/components/Pill.vue';
import ProjectDrawer from '@/components/ProjectDrawer.vue';
import ProjectForm from '@/components/ProjectForm.vue';
import ReportHead from '@/components/ReportHead.vue';

const route = useRoute();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/projects'));
const all = computed(() => data.value ?? []);
const status = ref('');
const q = ref('');
const counts = computed(() => all.value.reduce((m: Record<string, number>, o) => { m[o.status] = (m[o.status] ?? 0) + 1; return m; }, {}));
const rows = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((p) => (!status.value || p.status === status.value) && (!s || [p.code, p.name, p.customerName, p.pmName].some((x) => String(x ?? '').toLowerCase().includes(s))));
});
const kpi = computed(() => {
  const act = all.value.filter((p) => ['perencanaan', 'berjalan', 'ditunda'].includes(p.status));
  return { active: act.length, budget: act.reduce((t, p) => t + p.budget, 0), actual: act.reduce((t, p) => t + p.actual, 0), risk: act.filter((p) => p.health !== 'hijau').length, overdue: act.filter((p) => p.overdue).length };
});
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);
const form = ref<{ doc?: any } | null>(null);
const drawer = ref<any>(null);
function saved(doc: any) {
  form.value = null; toast.push('Proyek disimpan', `${doc.code} · ${doc.name}`, 'ok'); reload(); openId.value = doc.id; drawer.value?.load?.();
}
watch(() => route.query.id, (v) => { if (v) openId.value = String(v); });
</script>

<template>
  <ReportHead title="Daftar Proyek" sub="Anggaran biaya vs biaya aktual dari buku besar (baris jurnal bertanda proyek). Kesehatan: merah bila biaya melampaui anggaran, kuning bila serapan > 85% saat kemajuan < 80%.">
    <button v-if="session.can('project.manage')" class="btn btn-primary" data-action="new-project" @click="form = {}"><Icon name="plus" /> Proyek baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Proyek aktif" :value="String(kpi.active)" :foot="`${kpi.overdue} lewat tenggat`" />
    <KpiTile label="Anggaran aktif" :value="F.rpCompact(kpi.budget)" :foot="ctx.branchShort" />
    <KpiTile label="Biaya aktual" :value="F.rpCompact(kpi.actual)" :foot="kpi.budget ? `serapan ${F.pct((kpi.actual / kpi.budget) * 100)}` : '—'" />
    <KpiTile label="Berisiko" :value="String(kpi.risk)" foot="Kesehatan kuning / merah" :tone="kpi.risk ? 'neg' : ''" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari kode, nama, pelanggan, PM…" aria-label="Cari proyek"></div>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in PROJECT_CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-chip="k || 'all'" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : all.length }}</span></button>
      </div>
    </div>
    <div class="table-scroll"><table class="table" data-table="projects">
      <thead><tr><th>Kode</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Proyek</th><th>Periode</th><th class="ta-r">Anggaran</th><th class="ta-r">Aktual</th><th>Kemajuan</th><th>Kesehatan</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="9"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="p in rows" :key="p.id" data-row :data-project="p.code" @click="openId = p.id">
          <td class="code cell-strong">{{ p.code }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="p.branch" /></td>
          <td><span class="cell-strong">{{ p.name }}</span><span class="cell-sub">{{ p.customerName }} · PM {{ p.pmName }}</span></td>
          <td class="num" :class="p.overdue ? 'neg' : ''">{{ F.date(p.startDate) }} – {{ F.date(p.endDate) }}</td>
          <td class="ta-r num">{{ F.rpCompact(p.budget) }}</td><td class="ta-r num">{{ F.rpCompact(p.actual) }}<span class="cell-sub">{{ F.pct(p.absorption) }}</span></td>
          <td><div class="meter"><span class="meter-track"><span class="meter-fill" :style="{ width: p.progress + '%' }"></span></span><span class="meter-val">{{ p.progress }}%</span></div></td>
          <td><Pill :status="p.health" /></td><td><Pill :status="p.status" /></td>
        </tr>
        <tr v-if="data && !rows.length" class="is-static"><td colspan="9"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada proyek</span><span class="empty-note">Ubah kata kunci, status, atau cabang.</span></div></div></td></tr>
      </tbody>
    </table></div>
  </article>
  <ProjectDrawer v-if="openId" :id="openId" ref="drawer" @close="openId = null" @edit="(d) => (form = { doc: d })" />
  <ProjectForm v-if="form" :doc="form.doc" @close="form = null" @saved="saved" />
</template>
