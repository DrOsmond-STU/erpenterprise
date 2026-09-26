<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { del, get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Icon from '@/components/Icon.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const session = useSession();
const toast = useToast();
const canManage = computed(() => session.can('sales.customer.manage'));
const { data, loading, reload } = useLoader<any[]>(() => get('/sales/products'));
const q = ref(''); const kind = ref('');
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return (data.value ?? []).filter((p) => (!kind.value || p.kind === kind.value) && (!s || p.sku.toLowerCase().includes(s) || p.name.toLowerCase().includes(s)));
});
const pg = usePaged<any>(filtered, 25);
watch([q, kind], pg.reset);
const onHand = (p: any) => (p.stock ?? []).reduce((t: number, s: any) => t + Number(s.onHand), 0);
const avgCost = (p: any) => { const q2 = onHand(p); return q2 ? (p.stock ?? []).reduce((t: number, s: any) => t + Number(s.onHand) * s.avgCost, 0) / q2 : (p.stock?.[0]?.avgCost ?? 0); };
const margin = (p: any) => (p.kind === 'barang' && p.price > 0 && avgCost(p) ? ((p.price - avgCost(p)) / p.price) * 100 : null);

const form = ref({ sku: '', name: '', kind: 'barang', unit: 'pcs', price: 0 });
const editing = ref<any | null>(null);
const showForm = ref(false);
const errors = ref<string[]>([]);
const busy = ref(false);
function openNew() { editing.value = null; errors.value = []; form.value = { sku: '', name: '', kind: 'barang', unit: 'pcs', price: 0 }; showForm.value = true; }
function openEdit(p: any) { editing.value = p; errors.value = []; form.value = { sku: p.sku, name: p.name, kind: p.kind, unit: p.unit, price: p.price }; showForm.value = true; }
async function save() {
  errors.value = []; busy.value = true;
  try {
    const body = { name: form.value.name, kind: form.value.kind, unit: form.value.unit, price: Math.round(Number(form.value.price) || 0) };
    if (editing.value) { await patch(`/sales/products/${editing.value.sku}`, body); toast.push('Produk diperbarui', `${editing.value.sku} · ${form.value.name}`, 'ok'); }
    else { const r = await post('/sales/products', { ...body, sku: form.value.sku }); toast.push('Produk ditambahkan', `${r.sku} · ${r.name}`, 'ok'); }
    showForm.value = false; await reload();
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
const pending = ref<{ kind: 'toggle' | 'delete'; p: any } | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  const x = pending.value!; busy.value = true; pendingError.value = '';
  try {
    if (x.kind === 'delete') { await del(`/sales/products/${x.p.sku}`, { reason }); toast.push('Produk dihapus', x.p.sku, 'ok'); }
    else { const st = x.p.status === 'aktif' ? 'nonaktif' : 'aktif'; await patch(`/sales/products/${x.p.sku}`, { status: st, reason }); toast.push(st === 'aktif' ? 'Produk diaktifkan' : 'Produk dinonaktifkan', x.p.sku, 'ok'); }
    pending.value = null; await reload();
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Produk & Jasa" sub="Katalog yang dapat dijual. Barang terhubung ke kartu stok per cabang — HPP faktur memakai harga pokok rata-rata gudang cabang penjual.">
    <button v-if="canManage" class="btn btn-primary" data-action="new-product" @click="openNew"><Icon name="plus" /> Produk baru</button>
  </ReportHead>
  <article class="card">
    <div class="table-filter">
      <input v-model="q" class="input" type="search" placeholder="Cari SKU atau nama…" aria-label="Cari produk" data-filter="product">
      <select v-model="kind" class="select" style="width:auto" aria-label="Saring jenis"><option value="">Semua jenis</option><option value="barang">Barang</option><option value="jasa">Jasa</option></select>
    </div>
    <div class="table-scroll"><table class="table" data-table="products">
      <thead><tr><th>SKU</th><th>Nama</th><th>Jenis</th><th>Satuan</th><th class="ta-r">Harga jual</th><th class="ta-r">HPP rata-rata</th><th class="ta-r">Margin</th><th>Stok per cabang</th><th>Status</th><th v-if="canManage" class="ta-r">Aksi</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="10"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="p in pg.pageRows.value" :key="p.id" class="is-static" :data-product="p.sku">
          <td class="code cell-strong">{{ p.sku }}</td><td>{{ p.name }}</td><td>{{ p.kind === 'barang' ? 'Barang' : 'Jasa' }}</td><td>{{ p.unit }}</td>
          <td class="ta-r num">{{ F.rp(p.price) }}</td><td class="ta-r num">{{ p.kind === 'barang' && avgCost(p) ? F.rp(avgCost(p)) : '—' }}</td>
          <td class="ta-r num" :class="{ neg: (margin(p) ?? 1) < 0 }">{{ margin(p) === null ? '—' : F.pct(margin(p)!, 0) }}</td>
          <td><span v-if="p.kind === 'jasa'" class="muted">—</span><span v-else-if="!p.stock.length" class="muted">Tidak ada</span>
            <span v-for="s in p.stock" v-else :key="s.branch + s.warehouse" class="cell-sub" style="display:block">{{ s.branch }} · {{ F.int(s.onHand) }} {{ p.unit }}</span></td>
          <td><Pill :status="p.status" /></td>
          <td v-if="canManage"><div class="row-actions">
            <button class="btn btn-sm btn-ghost" data-action="edit-product" @click="openEdit(p)">Ubah</button>
            <button class="btn btn-sm btn-ghost" data-action="toggle-product" @click="pending = { kind: 'toggle', p }; pendingError = ''">{{ p.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan' }}</button>
            <button class="btn btn-sm btn-ghost neg" data-action="delete-product" @click="pending = { kind: 'delete', p }; pendingError = ''">Hapus</button>
          </div></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="10" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada produk yang cocok.</td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="produk" />
  </article>
  <Modal v-if="showForm" :title="editing ? `Ubah ${editing.sku}` : 'Produk / jasa baru'" :subtitle="editing ? 'SKU tidak dapat diubah.' : 'Barang dapat dijual bila ada stoknya di gudang cabang penjual.'" width="560px" @close="showForm = false">
    <div class="form-grid">
      <div class="field"><label for="pr-sku">SKU</label><input id="pr-sku" v-model="form.sku" class="input code" maxlength="30" style="text-transform:uppercase" :disabled="!!editing" placeholder="BRG-0000"></div>
      <div class="field"><label for="pr-kind">Jenis</label><select id="pr-kind" v-model="form.kind" class="select"><option value="barang">Barang</option><option value="jasa">Jasa</option></select></div>
      <div class="field form-grid-full"><label for="pr-name">Nama</label><input id="pr-name" v-model="form.name" class="input" maxlength="160"></div>
      <div class="field"><label for="pr-unit">Satuan</label><input id="pr-unit" v-model="form.unit" class="input" maxlength="20"></div>
      <div class="field"><label for="pr-price">Harga jual (Rp, sebelum PPN)</label><input id="pr-price" v-model.number="form.price" class="input num" type="number" min="0" step="500" style="text-align:right"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="save-product" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showForm = false">Batal</button></template>
  </Modal>
  <ReasonModal v-if="pending" :title="pending.kind === 'delete' ? `Hapus ${pending.p.sku}?` : `${pending.p.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'} ${pending.p.sku}?`"
    :message="pending.kind === 'delete' ? 'Hanya produk yang belum pernah dipakai pesanan atau faktur yang dapat dihapus.' : 'Produk nonaktif tidak dapat dipilih di pesanan/faktur baru.'"
    :confirm-label="pending.kind === 'delete' ? 'Hapus produk' : pending.p.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'" :danger="pending.kind === 'delete'" :busy="busy" :error="pendingError" @close="pending = null" @confirm="confirm" />
</template>
