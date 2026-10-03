<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PAY_LABEL, PAY_METHODS, salesTotals, type PayMethod } from '@erp/domain';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
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
import PosShiftDrawer from '@/components/PosShiftDrawer.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/pos/shifts'));
const shifts = computed(() => data.value ?? []);
const pg = usePaged<any>(shifts, 10);
const canOperate = computed(() => session.can('pos.operate'));
const mine = computed(() => shifts.value.find((s) => s.status === 'buka' && s.cashierId === session.user?.id) ?? null);
const kpi = computed(() => {
  const today = todayWib();
  const t = shifts.value.filter((s) => s.date === today);
  const gross = t.reduce((a, s) => a + (s.summary?.gross ?? 0), 0), count = t.reduce((a, s) => a + (s.summary?.count ?? 0), 0);
  return { gross, count, avg: count ? Math.round(gross / count) : 0, waiting: shifts.value.filter((s) => s.status === 'ditutup').length, open: shifts.value.filter((s) => s.status === 'buka').length };
});
const openId = ref<string | null>(null);

/* Buka shift */
const showOpen = ref(false);
const warehouses = ref<any[]>([]);
const banks = ref<any[]>([]);
const openForm = ref({ warehouse: '', cashAccount: '', settlementAccount: '', openingCash: 500000, date: todayWib() });
const openErrors = ref<string[]>([]);
const busy = ref(false);
const myBranch = (b: string) => session.user?.branches === '*' || (session.user?.branches ?? []).includes(b);
const whOptions = computed(() => warehouses.value.filter((w) => w.status === 'aktif' && myBranch(w.branch) && (ctx.branch === 'ALL' || w.branch === ctx.branch)));
const whBranch = computed(() => warehouses.value.find((w) => w.code === openForm.value.warehouse)?.branch);
const cashOptions = computed(() => banks.value.filter((b) => b.status === 'aktif' && b.currency === 'IDR' && b.branchCode === whBranch.value));
async function startOpen() {
  openErrors.value = [];
  try { [warehouses.value, banks.value] = await Promise.all([get('/inventory/warehouses'), get('/ledger/bank-accounts', { scoped: false }).then((r) => r.accounts ?? [])]); }
  catch (e) { toast.error(e, 'Data toko tidak dapat dimuat'); return; }
  openForm.value = { warehouse: whOptions.value[0]?.code ?? '', cashAccount: '', settlementAccount: '', openingCash: 500000, date: todayWib() };
  showOpen.value = true;
}
watch(() => openForm.value.warehouse, () => {
  openForm.value.cashAccount = cashOptions.value.find((b) => b.bankName === 'Kas')?.code ?? '';
  openForm.value.settlementAccount = cashOptions.value.find((b) => b.bankName !== 'Kas')?.code ?? '';
});
async function saveOpen() {
  openErrors.value = []; busy.value = true;
  try {
    const f = openForm.value;
    const r = await post('/pos/shifts', { warehouse: f.warehouse, cashAccount: f.cashAccount, settlementAccount: f.settlementAccount || undefined, openingCash: Math.round(Number(f.openingCash)), date: f.date });
    toast.push('Shift dibuka', `${r.docNo} · kas awal ${F.rp(r.openingCash)}`, 'ok'); showOpen.value = false; await reload();
  } catch (e) { openErrors.value = errorList(e); } finally { busy.value = false; }
}

/* Kasir */
const catalog = ref<any[]>([]);
const q = ref('');
const cart = ref<{ sku: string; name: string; uom: string; price: number; qty: number; available: number }[]>([]);
const method = ref<PayMethod>('tunai');
const tendered = ref<number | null>(null);
const reference = ref('');
const saleErrors = ref<string[]>([]);
async function loadCatalog() { if (mine.value) { try { catalog.value = await get(`/pos/catalog?warehouse=${encodeURIComponent(mine.value.warehouse)}`); } catch (e) { toast.error(e, 'Katalog tidak dapat dimuat'); } } }
watch(() => mine.value?.id, () => { cart.value = []; loadCatalog(); }, { immediate: true });
const results = computed(() => {
  const s = q.value.trim().toLowerCase();
  return catalog.value.filter((p) => !s || p.sku.toLowerCase().includes(s) || p.name.toLowerCase().includes(s)).slice(0, 12);
});
function add(p: any) {
  const l = cart.value.find((x) => x.sku === p.sku);
  if (l) l.qty += 1; else cart.value.push({ sku: p.sku, name: p.name, uom: p.uom, price: p.price, qty: 1, available: p.available });
}
const totals = computed(() => salesTotals(cart.value.map((l) => ({ qty: Number(l.qty) || 0, price: l.price, kind: 'barang' as const }))));
const change = computed(() => (method.value === 'tunai' && tendered.value ? Math.max(0, Number(tendered.value) - totals.value.total) : 0));
async function pay() {
  saleErrors.value = []; busy.value = true;
  try {
    const r = await post(`/pos/shifts/${mine.value.id}/transactions`, { method: method.value, tendered: method.value === 'tunai' && tendered.value ? Math.round(Number(tendered.value)) : undefined, reference: reference.value || undefined,
      lines: cart.value.filter((l) => Number(l.qty) > 0).map((l) => ({ sku: l.sku, qty: Number(l.qty) })) });
    toast.push('Transaksi selesai', `${r.trxNo} · ${F.rp(r.total)}${r.change ? ` · kembali ${F.rp(r.change)}` : ''}`, 'ok');
    cart.value = []; tendered.value = null; reference.value = ''; await Promise.all([reload(), loadCatalog()]);
  } catch (e) { saleErrors.value = errorList(e); } finally { busy.value = false; }
}

/* Tutup shift */
const showClose = ref(false);
const counted = ref(0);
const closeNote = ref('');
const closeErrors = ref<string[]>([]);
function startClose() { closeErrors.value = []; counted.value = mine.value?.summary?.expectedCash ?? 0; closeNote.value = ''; showClose.value = true; }
async function saveClose() {
  closeErrors.value = []; busy.value = true;
  try { const r = await post(`/pos/shifts/${mine.value.id}/close`, { countedCash: Math.round(Number(counted.value)), note: closeNote.value || undefined }); toast.push('Shift ditutup', `${r.docNo} — menunggu posting supervisor`, 'ok'); showClose.value = false; await reload(); openId.value = r.id; }
  catch (e) { closeErrors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Kasir" sub="Penjualan eceran per shift. Stok toko dicadangkan saat transaksi; setelah kasir menutup shift dan menghitung kas, supervisor (orang lain) memposting satu jurnal: kas/bank, penjualan, PPN keluaran, HPP, dan selisih kas.">
    <button v-if="canOperate && !mine" class="btn btn-primary" data-action="open-shift" @click="startOpen"><Icon name="plus" /> Buka shift</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Penjualan hari ini" :value="F.rpCompact(kpi.gross)" :foot="`${kpi.count} transaksi`" />
    <KpiTile label="Rata-rata keranjang" :value="F.rpCompact(kpi.avg)" foot="Termasuk PPN" />
    <KpiTile label="Shift buka" :value="String(kpi.open)" :foot="ctx.branchShort" />
    <KpiTile label="Menunggu posting" :value="String(kpi.waiting)" foot="Sudah ditutup kasir" :tone="kpi.waiting ? 'neg' : ''" />
  </div>

  <article v-if="mine" class="card" style="margin-bottom:var(--sp-4)" data-register>
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">Shift {{ mine.docNo }} · toko {{ mine.warehouse }}</h2>
      <span class="card-note">Kas awal {{ F.rp(mine.openingCash) }} · {{ mine.summary.count }} transaksi · tunai {{ F.rp(mine.summary.cash) }} · non-tunai {{ F.rp(mine.summary.nonCash) }}</span></div>
      <button class="btn" data-action="close-shift" @click="startClose"><Icon name="check" /> Tutup shift</button></div>
    <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:var(--sp-4)">
      <div>
        <div class="search-wrap"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari SKU / nama barang…" aria-label="Cari barang" data-filter="pos-catalog"></div>
        <div class="table-scroll" style="margin-top:var(--sp-2)"><table class="table" data-table="pos-catalog"><tbody>
          <tr v-for="p in results" :key="p.sku" data-row :data-product="p.sku" @click="add(p)">
            <td><span class="cell-strong">{{ p.name }}</span><span class="cell-sub"><span class="code">{{ p.sku }}</span> · stok {{ F.int(p.available) }} {{ p.uom }}</span></td>
            <td class="ta-r num">{{ F.rp(p.price) }}</td><td class="ta-r"><Icon name="plus" /></td>
          </tr>
          <tr v-if="!results.length" class="is-static"><td><span class="muted">Tidak ada barang.</span></td></tr>
        </tbody></table></div>
      </div>
      <div>
        <div class="table-scroll"><table class="table" data-table="pos-cart">
          <thead><tr><th>Keranjang</th><th class="ta-r">Qty</th><th class="ta-r">Jumlah</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in cart" :key="l.sku" class="is-static" :data-cart="l.sku">
              <td><span class="cell-strong">{{ l.name }}</span><span class="cell-sub">{{ F.rp(l.price) }} / {{ l.uom }}</span></td>
              <td><input v-model.number="l.qty" class="input num" type="number" min="0" :max="l.available" step="any" style="width:80px;text-align:right" :aria-label="`Qty ${l.sku}`"></td>
              <td class="ta-r num">{{ F.rp(totals.lines[i] ?? 0) }}</td>
              <td><button class="btn btn-icon btn-ghost" aria-label="Hapus" @click="cart.splice(i, 1)"><Icon name="x" /></button></td>
            </tr>
            <tr v-if="!cart.length" class="is-static"><td colspan="4"><span class="muted">Klik barang untuk menambahkan.</span></td></tr>
          </tbody>
        </table></div>
        <div class="totals" style="margin-top:var(--sp-2)" data-pos-totals>
          <div class="totals-row"><span>DPP</span><b>{{ F.rp(totals.net) }}</b></div>
          <div class="totals-row"><span>PPN 11%</span><b>{{ F.rp(totals.ppn) }}</b></div>
          <div class="totals-row totals-grand"><span>Total</span><b data-pos-total>{{ F.rp(totals.total) }}</b></div>
        </div>
        <div class="form-grid" style="margin-top:var(--sp-3)">
          <div class="field"><label for="pos-method">Pembayaran</label>
            <select id="pos-method" v-model="method" class="select"><option v-for="m in PAY_METHODS" :key="m" :value="m" :disabled="m !== 'tunai' && !mine.settlementAccount">{{ PAY_LABEL[m] }}</option></select></div>
          <div v-if="method === 'tunai'" class="field"><label for="pos-tendered">Uang diterima</label><input id="pos-tendered" v-model.number="tendered" class="input num" type="number" min="0" step="1000" style="text-align:right" :placeholder="String(totals.total)">
            <span v-if="change" class="field-hint">Kembalian <b data-change>{{ F.rp(change) }}</b></span></div>
          <div v-else class="field"><label for="pos-ref">Referensi</label><input id="pos-ref" v-model="reference" class="input" maxlength="80" placeholder="No. approval / QR"></div>
          <div v-if="saleErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in saleErrors" :key="e">• {{ e }}</div></div></div>
        </div>
        <button class="btn btn-primary" style="margin-top:var(--sp-3);width:100%;justify-content:center" data-action="pay" :disabled="busy || !cart.length || totals.total <= 0" @click="pay"><Icon name="check" /> Bayar {{ F.rp(totals.total) }}</button>
      </div>
    </div>
  </article>

  <article class="card">
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">Shift kasir</h2><span class="card-note">Klik shift untuk rincian transaksi, pembatalan, dan posting.</span></div></div>
    <div class="table-scroll"><table class="table" data-table="pos-shifts">
      <thead><tr><th>Shift</th><th>Tanggal</th><th>Kasir</th><th>Toko</th><th class="ta-r">Transaksi</th><th class="ta-r">Penjualan</th><th class="ta-r">Selisih kas</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="8"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="s in pg.pageRows.value" :key="s.id" data-row :data-shift="s.docNo" @click="openId = s.id">
          <td class="code cell-strong">{{ s.docNo }}</td><td class="num">{{ F.date(s.date) }}</td><td>{{ s.cashierName }}</td>
          <td>{{ s.warehouse }}<span class="cell-sub"><BranchTag :code="s.branch" /></span></td>
          <td class="ta-r num">{{ s.summary?.count ?? 0 }}<span v-if="s.summary?.voids" class="cell-sub">{{ s.summary.voids }} void</span></td>
          <td class="ta-r num">{{ F.rpCompact(s.summary?.gross ?? 0) }}</td>
          <td class="ta-r num" :class="{ neg: (s.cashDiff ?? 0) < 0 }">{{ s.cashDiff === null ? '—' : F.rp(s.cashDiff) }}</td>
          <td><Pill :status="s.status" /></td>
        </tr>
        <tr v-if="data && !shifts.length" class="is-static"><td colspan="8"><div class="empty"><div class="empty-card"><span class="empty-title">Belum ada shift</span><span class="empty-note">Kasir membuka shift untuk mulai berjualan.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="shift" />
  </article>

  <PosShiftDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload" />
  <Modal v-if="showOpen" title="Buka shift" subtitle="Kas awal di laci sudah termasuk saldo rekening kas toko; tidak dijurnal." width="560px" @close="showOpen = false">
    <div class="form-grid">
      <div class="field"><label for="sh-wh">Toko (gudang)</label><select id="sh-wh" v-model="openForm.warehouse" class="select"><option v-for="w in whOptions" :key="w.code" :value="w.code">{{ w.name }} ({{ w.branch }})</option></select></div>
      <div class="field"><label for="sh-date">Tanggal</label><input id="sh-date" v-model="openForm.date" class="input" type="date"></div>
      <div class="field"><label for="sh-cash">Kas laci</label><select id="sh-cash" v-model="openForm.cashAccount" class="select"><option v-for="b in cashOptions" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }}</option></select></div>
      <div class="field"><label for="sh-settle">Penampung non-tunai</label><select id="sh-settle" v-model="openForm.settlementAccount" class="select"><option value="">— Hanya tunai —</option><option v-for="b in cashOptions.filter((x) => x.code !== openForm.cashAccount)" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }}</option></select></div>
      <div class="field"><label for="sh-opening">Kas awal (Rp)</label><input id="sh-opening" v-model.number="openForm.openingCash" class="input num" type="number" min="0" step="1000" style="text-align:right"></div>
      <div v-if="openErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in openErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-open-shift" :disabled="busy || !openForm.warehouse || !openForm.cashAccount" @click="saveOpen"><Icon name="check" /> Buka shift</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showOpen = false">Batal</button>
    </template>
  </Modal>
  <Modal v-if="showClose && mine" title="Tutup shift" :subtitle="`Hitung uang di laci. Kas seharusnya ${F.rp(mine.summary.expectedCash)} (kas awal + penjualan tunai).`" width="520px" @close="showClose = false">
    <div class="form-grid">
      <div class="field"><label for="cl-counted">Kas dihitung (Rp)</label><input id="cl-counted" v-model.number="counted" class="input num" type="number" min="0" step="500" style="text-align:right">
        <span class="field-hint" :class="{ neg: counted - mine.summary.expectedCash < 0 }" data-close-diff>Selisih {{ F.rp(counted - mine.summary.expectedCash) }}</span></div>
      <div class="field"><label for="cl-note">Catatan</label><input id="cl-note" v-model="closeNote" class="input" maxlength="300"></div>
      <div v-if="closeErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in closeErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-close-shift" :disabled="busy" @click="saveClose"><Icon name="check" /> Tutup shift</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showClose = false">Batal</button>
    </template>
  </Modal>
</template>
