<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { STOCK_TRANSFER_CHIPS } from '@/lib/inventory';
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
import StockTransferDrawer from '@/components/StockTransferDrawer.vue';

const route = useRoute();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/inventory/transfers'));
const all = computed(() => data.value ?? []);
const status = ref(String(route.query.status ?? ''));
const q = ref('');
const counts = computed(() => all.value.reduce((m: Record<string, number>, t) => { m[t.status] = (m[t.status] ?? 0) + 1; return m; }, {}));
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((t) => (!status.value || t.status === status.value) && (!s || [t.docNo, t.fromWarehouse, t.toWarehouse, t.notes ?? '', t.createdByName].some((x) => String(x).toLowerCase().includes(s))));
});
const pg = usePaged<any>(filtered, 10);
watch([q, status], pg.reset);
const kpi = computed(() => {
  const transit = all.value.filter((t) => t.status === 'dikirim');
  const incoming = transit.filter((t) => ctx.branch === 'ALL' || t.toBranch === ctx.branch);
  return { drafts: counts.value.draf ?? 0, transit: transit.length, transitValue: transit.reduce((s, t) => s + t.totalValue, 0), incoming: incoming.length };
});
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);

/* Formulir */
const show = ref(false);
const warehouses = ref<any[]>([]);
const stock = ref<any[]>([]);
const form = ref({ fromWarehouse: '', toWarehouse: '', date: todayWib(), notes: '', lines: [] as { sku: string; qty: number | null }[] });
const errors = ref<string[]>([]);
const busy = ref(false);
const mine = (b: string) => session.user?.branches === '*' || (session.user?.branches ?? []).includes(b);
const fromOptions = computed(() => warehouses.value.filter((w) => w.status === 'aktif' && mine(w.branch) && (ctx.branch === 'ALL' || w.branch === ctx.branch)));
const toOptions = computed(() => warehouses.value.filter((w) => w.status === 'aktif' && w.code !== form.value.fromWarehouse));
const fromW = computed(() => warehouses.value.find((w) => w.code === form.value.fromWarehouse));
const toW = computed(() => warehouses.value.find((w) => w.code === form.value.toWarehouse));
const srcItems = computed(() => stock.value.filter((i) => i.warehouse === form.value.fromWarehouse && i.onHand > 0));
const itemOf = (sku: string) => srcItems.value.find((i) => i.sku === sku);
const estimate = computed(() => form.value.lines.reduce((t, l) => t + (itemOf(l.sku) ? Math.round(Number(l.qty || 0) * itemOf(l.sku).avgCost) : 0), 0));
async function openNew() {
  errors.value = [];
  try { [warehouses.value, stock.value] = await Promise.all([get('/inventory/warehouses?all=1'), get('/inventory/stock').then((r) => r.items)]); }
  catch (e) { toast.error(e, 'Data gudang tidak dapat dimuat'); return; }
  form.value = { fromWarehouse: fromOptions.value[0]?.code ?? '', toWarehouse: '', date: todayWib(), notes: '', lines: [{ sku: '', qty: null }] };
  show.value = true;
}
watch(() => form.value.fromWarehouse, () => { form.value.lines = [{ sku: '', qty: null }]; });
async function save() {
  errors.value = []; busy.value = true;
  try {
    const r = await post('/inventory/transfers', { fromWarehouse: form.value.fromWarehouse, toWarehouse: form.value.toWarehouse, date: form.value.date, notes: form.value.notes || undefined,
      lines: form.value.lines.filter((l) => l.sku).map((l) => ({ sku: l.sku, qty: Number(l.qty) })) });
    toast.push('Draf transfer dibuat', `${r.docNo} — kirim untuk memindahkan stok`, 'ok');
    show.value = false; await reload(); openId.value = r.id;
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Transfer Stok" sub="Pemindahan barang antar gudang. Dalam satu cabang stok langsung pindah; antar cabang barang tercatat “dalam perjalanan” (1-1504) di cabang tujuan sampai diterima, dan kedua cabang dijurnal lewat rekening koran antar kantor (RK) sehingga tereliminasi pada konsolidasi.">
    <button v-if="session.can('inventory.transfer')" class="btn btn-primary" data-action="new-stock-transfer" @click="openNew"><Icon name="plus" /> Transfer baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Draf" :value="String(kpi.drafts)" foot="Belum dikirim" />
    <KpiTile label="Dalam perjalanan" :value="String(kpi.transit)" :foot="F.rpCompact(kpi.transitValue)" :tone="kpi.transit ? 'neg' : ''" />
    <KpiTile label="Menunggu diterima" :value="String(kpi.incoming)" :foot="ctx.branchShort" />
    <KpiTile label="Total dokumen" :value="String(all.length)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, gudang, catatan…" aria-label="Cari transfer stok" data-filter="stock-transfer"></div>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in STOCK_TRANSFER_CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-chip="k || 'all'" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : all.length }}</span></button>
      </div>
    </div>
    <div class="table-scroll"><table class="table" data-table="stock-transfers">
      <thead><tr><th>Nomor</th><th>Tanggal</th><th>Dari</th><th>Ke</th><th class="ta-r">Barang</th><th class="ta-r">Nilai</th><th>Dibuat</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="8"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="t in pg.pageRows.value" :key="t.id" data-row :data-stock-transfer="t.docNo" @click="openId = t.id">
          <td class="code cell-strong">{{ t.docNo }}</td><td class="num">{{ F.date(t.date) }}</td>
          <td>{{ t.fromWarehouse }}<span class="cell-sub"><BranchTag :code="t.branch" /></span></td>
          <td>{{ t.toWarehouse }}<span class="cell-sub"><BranchTag :code="t.toBranch" /><template v-if="t.interBranch"> · RK</template></span></td>
          <td class="ta-r num">{{ t.lineCount }}</td><td class="ta-r num">{{ t.status === 'draf' || t.status === 'batal' ? '—' : F.rpCompact(t.totalValue) }}</td>
          <td>{{ t.createdByName }}</td><td><Pill :status="t.status" :label="t.statusLabel" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="8"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada transfer stok</span><span class="empty-note">Ubah kata kunci, status, atau cabang.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="transfer" />
  </article>
  <StockTransferDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload" />
  <Modal v-if="show" title="Transfer stok baru" subtitle="Buat draf, lalu kirim. Stok gudang asal berkurang saat dikirim dengan harga pokok rata-rata saat itu." width="760px" @close="show = false">
    <div class="form-grid">
      <div class="field"><label for="st-from">Dari gudang</label>
        <select id="st-from" v-model="form.fromWarehouse" class="select"><option value="" disabled>— Pilih gudang asal —</option><option v-for="w in fromOptions" :key="w.code" :value="w.code">{{ w.name }} ({{ w.branch }})</option></select></div>
      <div class="field"><label for="st-to">Ke gudang</label>
        <select id="st-to" v-model="form.toWarehouse" class="select"><option value="" disabled>— Pilih gudang tujuan —</option><option v-for="w in toOptions" :key="w.code" :value="w.code">{{ w.name }} ({{ w.branch }})</option></select>
        <span v-if="fromW && toW" class="field-hint" data-stock-transfer-hint>{{ fromW.branch === toW.branch ? 'Satu cabang: stok langsung pindah saat dikirim.' : `Antar cabang ${fromW.branch} → ${toW.branch}: barang dalam perjalanan sampai diterima gudang tujuan.` }}</span></div>
      <div class="field"><label for="st-date">Tanggal kirim</label><input id="st-date" v-model="form.date" class="input" type="date"></div>
      <div class="field"><label for="st-notes">Catatan</label><input id="st-notes" v-model="form.notes" class="input" maxlength="300"></div>
      <div class="field form-grid-full">
        <div class="table-scroll"><table class="table" data-table="stock-transfer-lines" style="min-width:600px">
          <thead><tr><th style="width:50%">Barang</th><th class="ta-r">Tersedia</th><th class="ta-r">Qty</th><th class="ta-r">Nilai</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in form.lines" :key="i" class="is-static" data-line>
              <td><select v-model="l.sku" class="select" aria-label="Barang" data-field="sku"><option value="" disabled>— Pilih barang —</option>
                <option v-for="it in srcItems" :key="it.sku" :value="it.sku" :disabled="form.lines.some((x, j) => j !== i && x.sku === it.sku)">{{ it.sku }} · {{ it.name }}</option></select></td>
              <td class="ta-r num">{{ itemOf(l.sku) ? `${F.int(itemOf(l.sku).onHand)} ${itemOf(l.sku).uom}` : '—' }}</td>
              <td><input v-model.number="l.qty" class="input num" type="number" min="0" step="any" style="width:110px;text-align:right" aria-label="Kuantitas" data-field="qty"></td>
              <td class="ta-r num">{{ itemOf(l.sku) ? F.rp(Math.round(Number(l.qty || 0) * itemOf(l.sku).avgCost)) : '—' }}</td>
              <td><button class="btn btn-icon btn-ghost" type="button" aria-label="Hapus baris" :disabled="form.lines.length < 2" @click="form.lines.splice(i, 1)"><Icon name="minus" /></button></td>
            </tr>
          </tbody>
        </table></div>
        <div style="display:flex;gap:var(--sp-4);align-items:center;margin-top:var(--sp-2)">
          <button class="btn btn-sm btn-ghost" type="button" data-action="add-line" @click="form.lines.push({ sku: '', qty: null })"><Icon name="plus" /> Tambah barang</button>
          <div class="toolbar-spacer"></div><span>Estimasi nilai: <b class="num" data-estimate>{{ F.rp(estimate) }}</b></span>
        </div>
      </div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-stock-transfer" :disabled="busy || !form.fromWarehouse || !form.toWarehouse || !form.lines.some((l) => l.sku && Number(l.qty) > 0)" @click="save"><Icon name="check" /> Simpan draf</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="show = false">Batal</button>
    </template>
  </Modal>
</template>
