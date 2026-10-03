<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { ADJ_CHIPS, ADJ_REASONS } from '@/lib/inventory';
import { todayWib } from '@/lib/sales';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';
import StockAdjustmentDrawer from '@/components/StockAdjustmentDrawer.vue';

const route = useRoute();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/inventory/adjustments'));
const all = computed(() => data.value ?? []);
const status = ref(String(route.query.status ?? ''));
const q = ref('');
const counts = computed(() => all.value.reduce((m: Record<string, number>, a) => { m[a.status] = (m[a.status] ?? 0) + 1; return m; }, {}));
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((a) => (!status.value || a.status === status.value) && (!s || [a.docNo, a.warehouse, a.reasonLabel, a.createdByName, a.notes ?? ''].some((x) => String(x).toLowerCase().includes(s))));
});
const pg = usePaged<any>(filtered, 10);
watch([q, status], pg.reset);
const kpi = computed(() => {
  const month = todayWib().slice(0, 7);
  const posted = all.value.filter((a) => a.status === 'diposting' && String(a.date).startsWith(month));
  return { waiting: counts.value.menunggu ?? 0, minus: posted.filter((a) => a.totalValue < 0).reduce((t, a) => t + a.totalValue, 0), plus: posted.filter((a) => a.totalValue > 0).reduce((t, a) => t + a.totalValue, 0) };
});
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);

/* Formulir */
const show = ref(false);
const warehouses = ref<any[]>([]);
const stock = ref<any[]>([]);
const form = ref({ warehouse: '', reason: 'opname', date: todayWib(), notes: '', lines: [] as { sku: string; countedQty: number | null; note: string }[] });
const errors = ref<string[]>([]);
const busy = ref(false);
const whOptions = computed(() => warehouses.value.filter((w) => w.status === 'aktif' && (session.user?.branches === '*' || (session.user?.branches ?? []).includes(w.branch)) && (ctx.branch === 'ALL' || w.branch === ctx.branch)));
const whItems = computed(() => stock.value.filter((i) => i.warehouse === form.value.warehouse));
const itemOf = (sku: string) => whItems.value.find((i) => i.sku === sku);
const estimate = computed(() => form.value.lines.reduce((t, l) => {
  const it = itemOf(l.sku);
  return it && l.countedQty !== null && l.countedQty !== undefined && String(l.countedQty) !== '' ? t + Math.round((Number(l.countedQty) - it.onHand) * it.avgCost) : t;
}, 0));
async function openNew() {
  errors.value = [];
  try {
    [warehouses.value, stock.value] = await Promise.all([get('/inventory/warehouses'), get('/inventory/stock').then((r) => r.items)]);
  } catch (e) { toast.error(e, 'Data gudang tidak dapat dimuat'); return; }
  form.value = { warehouse: whOptions.value[0]?.code ?? '', reason: 'opname', date: todayWib(), notes: '', lines: [{ sku: '', countedQty: null, note: '' }] };
  show.value = true;
}
watch(() => form.value.warehouse, () => { form.value.lines = [{ sku: '', countedQty: null, note: '' }]; });
async function save() {
  errors.value = []; busy.value = true;
  try {
    const r = await post('/inventory/adjustments', { warehouse: form.value.warehouse, reason: form.value.reason, date: form.value.date, notes: form.value.notes || undefined,
      lines: form.value.lines.filter((l) => l.sku).map((l) => ({ sku: l.sku, countedQty: Number(l.countedQty), note: l.note || undefined })) });
    toast.push('Penyesuaian dicatat', `${r.docNo} — menunggu persetujuan`, 'ok');
    show.value = false; await reload(); openId.value = r.id;
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
const reasonNote = computed(() => ADJ_REASONS.find((r) => r[0] === form.value.reason)?.[2]);
</script>

<template>
  <ReportHead title="Penyesuaian & Opname Stok" sub="Hasil hitung fisik, barang rusak/hilang, dan koreksi stok. Gudang mencatat, orang lain menyetujui; saat diposting selisih dinilai dengan harga pokok rata-rata dan dijurnal ke akun selisih persediaan.">
    <button v-if="session.can('inventory.adjust')" class="btn btn-primary" data-action="new-adjustment" @click="openNew"><Icon name="plus" /> Penyesuaian baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Menunggu persetujuan" :value="String(kpi.waiting)" foot="Belum memengaruhi stok" :tone="kpi.waiting ? 'neg' : ''" />
    <KpiTile label="Susut bulan ini" :value="F.rpCompact(kpi.minus)" foot="Selisih kurang" :tone="kpi.minus ? 'neg' : ''" />
    <KpiTile label="Lebih bulan ini" :value="F.rpCompact(kpi.plus)" foot="Selisih lebih" />
    <KpiTile label="Total dokumen" :value="String(all.length)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, gudang, alasan…" aria-label="Cari penyesuaian" data-filter="adjustment"></div>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in ADJ_CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-chip="k || 'all'" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : all.length }}</span></button>
      </div>
    </div>
    <div class="table-scroll"><table class="table" data-table="adjustments">
      <thead><tr><th>Nomor</th><th>Tanggal</th><th>Gudang</th><th>Alasan</th><th class="ta-r">Barang</th><th class="ta-r">Nilai selisih</th><th>Dicatat</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="8"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="a in pg.pageRows.value" :key="a.id" data-row :data-adjustment="a.docNo" @click="openId = a.id">
          <td class="code cell-strong">{{ a.docNo }}</td><td class="num">{{ F.date(a.date) }}</td>
          <td>{{ a.warehouse }}<span class="cell-sub"><BranchTag :code="a.branch" /></span></td><td>{{ a.reasonLabel }}</td>
          <td class="ta-r num">{{ a.lineCount }}</td><td class="ta-r num" :class="{ neg: a.totalValue < 0 }">{{ a.status === 'diposting' ? F.rp(a.totalValue) : '—' }}</td>
          <td>{{ a.createdByName }}</td><td><Pill :status="a.status" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="8"><div class="empty"><div class="empty-card"><span class="empty-title">Belum ada penyesuaian</span><span class="empty-note">Catat hasil stok opname atau barang rusak/hilang.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="dokumen" />
  </article>
  <StockAdjustmentDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload" />
  <Modal v-if="show" title="Penyesuaian stok baru" subtitle="Isi jumlah hasil hitung fisik per barang. Selisih terhadap stok sistem dihitung ulang saat disetujui." width="760px" @close="show = false">
    <div class="form-grid">
      <div class="field"><label for="adj-wh">Gudang</label>
        <select id="adj-wh" v-model="form.warehouse" class="select"><option value="" disabled>— Pilih gudang —</option><option v-for="w in whOptions" :key="w.code" :value="w.code">{{ w.name }} ({{ w.branch }})</option></select></div>
      <div class="field"><label for="adj-reason">Alasan</label>
        <select id="adj-reason" v-model="form.reason" class="select"><option v-for="[k, label] in ADJ_REASONS" :key="k" :value="k">{{ label }}</option></select>
        <span class="field-hint">{{ reasonNote }}</span></div>
      <div class="field"><label for="adj-date">Tanggal</label><input id="adj-date" v-model="form.date" class="input" type="date"></div>
      <div class="field"><label for="adj-notes">Catatan</label><input id="adj-notes" v-model="form.notes" class="input" maxlength="300" placeholder="Mis. berita acara opname"></div>
      <div class="field form-grid-full">
        <div class="table-scroll"><table class="table" data-table="adjustment-lines" style="min-width:620px">
          <thead><tr><th style="width:44%">Barang</th><th class="ta-r">Stok sistem</th><th class="ta-r">Hitung fisik</th><th class="ta-r">Selisih</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in form.lines" :key="i" class="is-static" data-line>
              <td><select v-model="l.sku" class="select" aria-label="Barang" data-field="sku"><option value="" disabled>— Pilih barang —</option>
                <option v-for="it in whItems" :key="it.sku" :value="it.sku" :disabled="form.lines.some((x, j) => j !== i && x.sku === it.sku)">{{ it.sku }} · {{ it.name }}</option></select></td>
              <td class="ta-r num">{{ itemOf(l.sku) ? `${F.int(itemOf(l.sku).onHand)} ${itemOf(l.sku).uom}` : '—' }}</td>
              <td><input v-model.number="l.countedQty" class="input num" type="number" min="0" step="any" style="width:110px;text-align:right" aria-label="Jumlah hitung" data-field="counted"></td>
              <td class="ta-r num" :class="{ neg: itemOf(l.sku) && l.countedQty !== null && Number(l.countedQty) < itemOf(l.sku).onHand }">{{ itemOf(l.sku) && l.countedQty !== null && String(l.countedQty) !== '' ? F.int(Number(l.countedQty) - itemOf(l.sku).onHand) : '—' }}</td>
              <td><button class="btn btn-icon btn-ghost" type="button" aria-label="Hapus baris" :disabled="form.lines.length < 2" @click="form.lines.splice(i, 1)"><Icon name="minus" /></button></td>
            </tr>
          </tbody>
        </table></div>
        <div style="display:flex;gap:var(--sp-4);align-items:center;margin-top:var(--sp-2)">
          <button class="btn btn-sm btn-ghost" type="button" data-action="add-line" @click="form.lines.push({ sku: '', countedQty: null, note: '' })"><Icon name="plus" /> Tambah barang</button>
          <div class="toolbar-spacer"></div><span>Estimasi nilai selisih: <b class="num" :class="{ neg: estimate < 0 }" data-estimate>{{ F.rp(estimate) }}</b></span>
        </div>
      </div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-adjustment" :disabled="busy || !form.warehouse || !form.lines.some((l) => l.sku && l.countedQty !== null && String(l.countedQty) !== '')" @click="save"><Icon name="send" /> Ajukan penyesuaian</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="show = false">Batal</button>
    </template>
  </Modal>
</template>
