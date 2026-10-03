<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { STOCK_CHIPS } from '@/lib/inventory';
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
import StockCardDrawer from '@/components/StockCardDrawer.vue';

const route = useRoute();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any>(() => get('/inventory/stock'));
const wh = useLoader<any[]>(() => get('/inventory/warehouses'));
const items = computed<any[]>(() => data.value?.items ?? []);
const status = ref(String(route.query.status ?? ''));
const warehouse = ref('');
const q = ref('');
const counts = computed(() => items.value.reduce((m: Record<string, number>, i) => { m[i.status] = (m[i.status] ?? 0) + 1; return m; }, {}));
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return items.value.filter((i) => (!status.value || i.status === status.value) && (!warehouse.value || i.warehouse === warehouse.value)
    && (!s || [i.sku, i.name, i.category, i.warehouse].some((x) => String(x).toLowerCase().includes(s))));
});
const pg = usePaged<any>(filtered, 25);
watch([q, status, warehouse], pg.reset);
const kpi = computed(() => ({
  total: data.value?.total ?? 0, raw: data.value?.byAccount?.[data.value?.accounts?.raw] ?? 0, finished: data.value?.byAccount?.[data.value?.accounts?.finished] ?? 0,
  low: (counts.value['di-bawah-minimum'] ?? 0) + (counts.value.habis ?? 0),
}));
const card = ref<{ sku: string; warehouse: string } | null>(null);

/* Gudang */
const canManage = computed(() => session.can('inventory.warehouse.manage'));
const showWh = ref(false);
const whForm = ref({ code: '', name: '', branch: '' });
const whErrors = ref<string[]>([]);
const busy = ref(false);
const branchOptions = computed(() => session.branches.filter((b) => session.user?.branches === '*' || (session.user?.branches ?? []).includes(b.code)));
function openWh() { whErrors.value = []; whForm.value = { code: '', name: '', branch: ctx.branch === 'ALL' ? branchOptions.value[0]?.code ?? '' : ctx.branch }; showWh.value = true; }
async function saveWh() {
  whErrors.value = []; busy.value = true;
  try { const r = await post('/inventory/warehouses', whForm.value); toast.push('Gudang ditambahkan', `${r.code} · ${r.name}`, 'ok'); showWh.value = false; await wh.reload(); }
  catch (e) { whErrors.value = errorList(e); } finally { busy.value = false; }
}
async function toggleWh(w: any) {
  try { await patch(`/inventory/warehouses/${encodeURIComponent(w.code)}`, { status: w.status === 'aktif' ? 'nonaktif' : 'aktif' }); toast.push('Gudang diperbarui', w.code, 'ok'); await wh.reload(); }
  catch (e) { toast.error(e, 'Gudang tidak dapat diubah'); }
}
</script>

<template>
  <ReportHead title="Stok & Kartu Stok" sub="Saldo stok bernilai per gudang dengan harga pokok rata-rata bergerak. Setiap mutasi (penerimaan, penjualan, opname, transfer, produksi) tercatat di kartu stok dan dijurnal otomatis, sehingga nilai stok = saldo akun persediaan di buku besar." />
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Nilai persediaan" :value="F.rpCompact(kpi.total)" :foot="ctx.branchShort" />
    <KpiTile label="Bahan & suku cadang" :value="F.rpCompact(kpi.raw)" :foot="data?.accounts?.raw" />
    <KpiTile label="Barang jadi" :value="F.rpCompact(kpi.finished)" :foot="data?.accounts?.finished" />
    <KpiTile label="Perlu diisi ulang" :value="String(kpi.low)" foot="Di bawah minimum / habis" :tone="kpi.low ? 'neg' : ''" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari SKU, nama, kategori…" aria-label="Cari stok" data-filter="stock"></div>
      <select v-model="warehouse" class="select" style="max-width:220px" aria-label="Gudang" data-filter="warehouse">
        <option value="">Semua gudang</option><option v-for="w in wh.data.value ?? []" :key="w.code" :value="w.code">{{ w.name }} ({{ w.branch }})</option>
      </select>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in STOCK_CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-chip="k || 'all'" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : items.length }}</span></button>
      </div>
    </div>
    <div class="table-scroll"><table class="table" data-table="stock">
      <thead><tr><th>Barang</th><th>Gudang</th><th class="ta-r">Stok</th><th class="ta-r">Min / maks</th><th class="ta-r">HPP rata-rata</th><th class="ta-r">Nilai</th><th>Mutasi terakhir</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="8"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="i in pg.pageRows.value" :key="i.id" data-row :data-sku="i.sku" :data-warehouse="i.warehouse" @click="card = { sku: i.sku, warehouse: i.warehouse }">
          <td><span class="cell-strong">{{ i.name }}</span><span class="cell-sub"><span class="code">{{ i.sku }}</span> · {{ i.category }}</span></td>
          <td>{{ i.warehouse }}<span class="cell-sub"><BranchTag :code="i.branch" /></span></td>
          <td class="ta-r num cell-strong">{{ F.int(i.onHand) }} <span class="muted">{{ i.uom }}</span></td>
          <td class="ta-r num muted">{{ F.int(i.min) }} / {{ i.max === null ? '—' : F.int(i.max) }}</td>
          <td class="ta-r num">{{ F.rp(i.avgCost) }}</td><td class="ta-r num">{{ F.rpCompact(i.value) }}</td>
          <td class="num">{{ i.lastMove ? F.date(i.lastMove) : '—' }}</td><td><Pill :status="i.status" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="8"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada barang</span><span class="empty-note">Ubah kata kunci, gudang, status, atau cabang.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="barang" />
  </article>

  <article class="card" style="margin-top:var(--sp-4)">
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">Gudang</h2><span class="card-note">Lokasi penyimpanan per cabang. Gudang yang masih berisi stok atau punya transfer terbuka tidak dapat dinonaktifkan.</span></div>
      <button v-if="canManage" class="btn" data-action="new-warehouse" @click="openWh"><Icon name="plus" /> Tambah gudang</button></div>
    <div class="table-scroll"><table class="table" data-table="warehouses">
      <thead><tr><th>Kode</th><th>Nama</th><th>Cabang</th><th class="ta-r">Jenis barang</th><th>Status</th><th v-if="canManage"></th></tr></thead>
      <tbody>
        <tr v-for="w in wh.data.value ?? []" :key="w.code" class="is-static" :data-warehouse-row="w.code">
          <td class="code cell-strong">{{ w.code }}</td><td>{{ w.name }}</td><td><BranchTag :code="w.branch" /></td><td class="ta-r num">{{ F.int(w.items) }}</td><td><Pill :status="w.status" /></td>
          <td v-if="canManage" class="ta-r"><button class="btn btn-sm btn-ghost" @click="toggleWh(w)">{{ w.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan' }}</button></td>
        </tr>
      </tbody>
    </table></div>
  </article>

  <StockCardDrawer v-if="card" :sku="card.sku" :warehouse="card.warehouse" @close="card = null" />
  <Modal v-if="showWh" title="Tambah gudang" subtitle="Kode gudang dipakai di kartu stok dan tidak dapat diubah." width="520px" @close="showWh = false">
    <div class="form-grid">
      <div class="field"><label for="wh-code">Kode</label><input id="wh-code" v-model="whForm.code" class="input" maxlength="30" placeholder="Mis. CKR-BJ"></div>
      <div class="field"><label for="wh-branch">Cabang</label><select id="wh-branch" v-model="whForm.branch" class="select"><option v-for="b in branchOptions" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name }}</option></select></div>
      <div class="field form-grid-full"><label for="wh-name">Nama</label><input id="wh-name" v-model="whForm.name" class="input" maxlength="80" placeholder="Mis. Gudang Barang Jadi Cikarang"></div>
      <div v-if="whErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in whErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-warehouse" :disabled="busy || !whForm.code || !whForm.name || !whForm.branch" @click="saveWh"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showWh = false">Batal</button>
    </template>
  </Modal>
</template>
