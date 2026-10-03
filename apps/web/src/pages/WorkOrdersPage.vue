<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { bomRequirement } from '@erp/domain';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { BOARD_COLUMNS, PRODUCTION_LINES } from '@/lib/production';
import { todayWib } from '@/lib/sales';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import ReportHead from '@/components/ReportHead.vue';
import WorkOrderDrawer from '@/components/WorkOrderDrawer.vue';

const route = useRoute();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/production/work-orders'));
const all = computed(() => (data.value ?? []).filter((w) => w.status !== 'batal' && w.status !== 'draf'));
const line = ref('');
const lines = computed(() => [...new Set(all.value.map((w) => w.line).filter(Boolean))] as string[]);
const visible = computed(() => all.value.filter((w) => !line.value || w.line === line.value));
const SHOW_DONE = 8;
const column = (k: string) => {
  const items = visible.value.filter((w) => w.status === k);
  return k === 'selesai' ? [...items].sort((a, b) => String(b.completedDate).localeCompare(String(a.completedDate))).slice(0, SHOW_DONE) : items;
};
const today = todayWib();
const kpi = computed(() => {
  const open = all.value.filter((w) => ['antre', 'berjalan', 'qc'].includes(w.status));
  const month = today.slice(0, 7);
  const done = all.value.filter((w) => w.status === 'selesai' && String(w.completedDate).startsWith(month));
  return { open: open.length, wip: open.reduce((t, w) => t + w.wip, 0), late: open.filter((w) => w.dueDate && w.dueDate < today).length, done: done.reduce((t, w) => t + w.outputValue, 0) };
});
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);

/* Formulir */
const show = ref(false);
const boms = ref<any[]>([]);
const warehouses = ref<any[]>([]);
const stock = ref<any[]>([]);
const form = ref({ bomId: '', warehouse: '', plannedQty: 0, date: todayWib(), dueDate: '', line: '', pic: '', notes: '' });
const errors = ref<string[]>([]);
const busy = ref(false);
const whOptions = computed(() => warehouses.value.filter((w) => w.status === 'aktif' && (session.user?.branches === '*' || (session.user?.branches ?? []).includes(w.branch)) && (ctx.branch === 'ALL' || w.branch === ctx.branch)));
const bom = computed(() => boms.value.find((b) => b.id === form.value.bomId));
const preview = computed(() => {
  if (!bom.value || !(form.value.plannedQty > 0)) return [];
  return bomRequirement(bom.value.lines, bom.value.batchQty, Number(form.value.plannedQty)).map((r) => {
    const l = bom.value.lines.find((x: any) => x.sku === r.sku);
    const have = stock.value.find((i) => i.sku === r.sku && i.warehouse === form.value.warehouse)?.onHand ?? 0;
    return { ...r, name: l?.name, uom: l?.uom, available: have, short: have < r.qty, cost: Math.round(r.qty * (l?.unitCost ?? 0)) };
  });
});
async function openNew() {
  errors.value = [];
  try { [boms.value, warehouses.value, stock.value] = await Promise.all([get('/production/boms'), get('/inventory/warehouses'), get('/inventory/stock').then((r) => r.items)]); }
  catch (e) { toast.error(e, 'Data produksi tidak dapat dimuat'); return; }
  form.value = { bomId: boms.value.find((b) => b.status === 'aktif')?.id ?? '', warehouse: whOptions.value[0]?.code ?? '', plannedQty: 0, date: todayWib(), dueDate: '', line: '', pic: '', notes: '' };
  show.value = true;
}
async function save() {
  errors.value = []; busy.value = true;
  try {
    const f = form.value;
    const r = await post('/production/work-orders', { bomId: f.bomId, warehouse: f.warehouse, plannedQty: Number(f.plannedQty), date: f.date, dueDate: f.dueDate || undefined, line: f.line || undefined, pic: f.pic || undefined, notes: f.notes || undefined });
    toast.push('Perintah kerja dibuat', `${r.docNo} · ${F.int(r.plannedQty)} ${r.uom} ${r.productName}`, 'ok');
    show.value = false; await reload(); openId.value = r.id;
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
watch(() => ctx.branch, () => { line.value = ''; });
</script>

<template>
  <ReportHead title="Perintah Kerja" sub="Papan produksi dari antrean hingga selesai. Bahan yang dikeluarkan dijurnal ke barang dalam proses (1-1502); hasil yang lolos pemeriksaan mutu masuk gudang sebagai barang jadi senilai seluruh WIP perintah kerja — diloloskan orang lain dari pelapor.">
    <RouterLink class="btn" to="/bom" style="text-decoration:none"><Icon name="layers" /> Bill of Materials</RouterLink>
    <button v-if="session.can('production.manage')" class="btn btn-primary" data-action="new-wo" @click="openNew"><Icon name="plus" /> Perintah kerja baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Perintah kerja terbuka" :value="String(kpi.open)" :foot="ctx.branchShort" />
    <KpiTile label="Barang dalam proses" :value="F.rpCompact(kpi.wip)" foot="Saldo WIP (1-1502)" />
    <KpiTile label="Lewat tenggat" :value="String(kpi.late)" foot="Belum selesai" :tone="kpi.late ? 'neg' : ''" />
    <KpiTile label="Hasil produksi bulan ini" :value="F.rpCompact(kpi.done)" foot="Masuk barang jadi" />
  </div>
  <div class="chips" role="group" aria-label="Saring lini produksi" style="margin-bottom:var(--sp-3)">
    <button class="chip" :aria-pressed="!line" data-line-filter="all" @click="line = ''">Semua lini <span class="chip-count">{{ all.length }}</span></button>
    <button v-for="l in lines" :key="l" class="chip" :aria-pressed="line === l" :data-line-filter="l" @click="line = l">{{ l }} <span class="chip-count">{{ all.filter((w) => w.line === l).length }}</span></button>
  </div>
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <div v-else class="board" data-board>
    <section v-for="[k, label] in BOARD_COLUMNS" :key="k" class="board-col" :aria-label="label" :data-col="k">
      <div class="board-col-head"><h2 class="card-title">{{ label }}</h2><span class="rail-link-count">{{ visible.filter((w) => w.status === k).length }}</span></div>
      <div class="board-col-body">
        <button v-for="w in column(k)" :key="w.id" class="board-card" :data-wo="w.docNo" @click="openId = w.id">
          <span class="board-card-top"><span class="code muted">{{ w.docNo }}</span><BranchTag v-if="ctx.branch === 'ALL'" :code="w.branch" /></span>
          <span v-if="w.flag" class="pill" data-tone="warn" style="align-self:flex-start"><i class="pill-dot"></i>{{ w.flag }}</span>
          <span class="board-card-title">{{ w.productName }}</span>
          <span class="board-card-meta"><span class="num">{{ F.int(w.plannedQty) }} {{ w.uom }}</span><span>{{ w.line || '—' }}</span></span>
          <span v-if="k === 'berjalan'" class="meter"><span class="meter-track"><span class="meter-fill" :style="{ width: w.progress + '%' }"></span></span><span class="meter-val">{{ w.progress }}%</span></span>
          <span v-if="w.wip" class="board-card-meta"><span>WIP</span><span class="num">{{ F.rpCompact(w.wip) }}</span></span>
          <span v-if="k === 'selesai'" class="board-card-meta"><span class="num">{{ F.int(w.goodQty ?? 0) }} lolos</span><span>{{ F.date(w.completedDate) }}</span></span>
          <span v-else class="board-card-meta" :class="{ neg: w.dueDate && w.dueDate < today }"><Icon name="clock" /><span>{{ w.dueDate ? `Tenggat ${F.date(w.dueDate)}` : 'Tanpa tenggat' }}</span><span class="toolbar-spacer"></span><span>{{ w.pic }}</span></span>
        </button>
        <div v-if="!column(k).length" class="empty-note" style="padding:var(--sp-3);text-align:center">Kosong</div>
      </div>
    </section>
  </div>
  <WorkOrderDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload" />
  <Modal v-if="show" title="Perintah kerja baru" subtitle="Kebutuhan bahan dihitung dari BOM × jumlah rencana dan disalin ke perintah kerja." width="760px" @close="show = false">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="wo-bom">BOM</label>
        <select id="wo-bom" v-model="form.bomId" class="select"><option value="" disabled>— Pilih BOM —</option><option v-for="b in boms.filter((x) => x.status === 'aktif')" :key="b.id" :value="b.id">{{ b.code }} · {{ b.productName }} (per {{ F.int(b.batchQty) }} {{ b.uom }})</option></select></div>
      <div class="field"><label for="wo-wh">Gudang bahan & hasil</label>
        <select id="wo-wh" v-model="form.warehouse" class="select"><option v-for="w in whOptions" :key="w.code" :value="w.code">{{ w.name }} ({{ w.branch }})</option></select></div>
      <div class="field"><label for="wo-qty">Jumlah rencana{{ bom ? ` (${bom.uom})` : '' }}</label><input id="wo-qty" v-model.number="form.plannedQty" class="input num" type="number" min="1" step="any" style="text-align:right"></div>
      <div class="field"><label for="wo-date">Tanggal</label><input id="wo-date" v-model="form.date" class="input" type="date"></div>
      <div class="field"><label for="wo-due">Tenggat</label><input id="wo-due" v-model="form.dueDate" class="input" type="date"></div>
      <div class="field"><label for="wo-line">Lini produksi</label><input id="wo-line" v-model="form.line" class="input" list="wo-lines" maxlength="60"><datalist id="wo-lines"><option v-for="l in PRODUCTION_LINES" :key="l" :value="l" /></datalist></div>
      <div class="field"><label for="wo-pic">Penanggung jawab</label><input id="wo-pic" v-model="form.pic" class="input" maxlength="80"></div>
      <div v-if="preview.length" class="field form-grid-full">
        <div class="table-scroll"><table class="table" data-table="wo-preview">
          <thead><tr><th>Bahan</th><th class="ta-r">Kebutuhan</th><th class="ta-r">Tersedia</th><th class="ta-r">Estimasi biaya</th></tr></thead>
          <tbody><tr v-for="r in preview" :key="r.sku" class="is-static">
            <td><span class="cell-strong">{{ r.name }}</span><span class="cell-sub code">{{ r.sku }}</span></td>
            <td class="ta-r num">{{ F.dec(r.qty, 2) }} {{ r.uom }}</td><td class="ta-r num" :class="{ neg: r.short }">{{ F.int(r.available) }}<template v-if="r.short"> · kurang</template></td><td class="ta-r num">{{ F.rp(r.cost) }}</td>
          </tr></tbody>
        </table></div>
      </div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-wo" :disabled="busy || !form.bomId || !form.warehouse || !(form.plannedQty > 0)" @click="save"><Icon name="check" /> Buat perintah kerja</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="show = false">Batal</button>
    </template>
  </Modal>
</template>
