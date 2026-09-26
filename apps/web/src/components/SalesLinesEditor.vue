<script setup lang="ts">
/** Editor baris pesanan/faktur: pilih produk → uraian, satuan, harga bawaan; neto & PPN dihitung dengan aturan yang sama dengan server. */
import { computed } from 'vue';
import { salesTotals } from '@erp/domain';
import * as F from '@/lib/format';
import Icon from './Icon.vue';

export interface EditLine { productId: string | null; description: string; kind: 'barang' | 'jasa'; unit: string; qty: number; price: number; discPct: number }
const props = defineProps<{ products: any[]; branch: string }>();
const lines = defineModel<EditLine[]>({ required: true });
const byId = computed(() => new Map(props.products.map((p) => [p.id, p])));
const active = computed(() => props.products.filter((p) => p.status === 'aktif'));
const totals = computed(() => salesTotals(lines.value.map((l) => ({ qty: Number(l.qty) || 0, price: Number(l.price) || 0, discPct: Number(l.discPct) || 0, kind: l.kind }))));
const stockOf = (id: string | null) => {
  const p = id ? byId.value.get(id) : null;
  if (!p || p.kind !== 'barang') return null;
  return (p.stock ?? []).filter((s: any) => s.branch === props.branch).reduce((t: number, s: any) => t + Number(s.onHand), 0);
};
function pick(l: EditLine, id: string) {
  if (id === '__free') { l.productId = null; l.kind = 'jasa'; l.description = ''; l.unit = 'paket'; return; }
  const p = byId.value.get(id); if (!p) return;
  l.productId = p.id; l.kind = p.kind; l.description = p.name; l.unit = p.unit; l.price = p.price;
}
const add = () => lines.value.push({ productId: null, description: '', kind: 'jasa', unit: 'paket', qty: 1, price: 0, discPct: 0 });
</script>

<template>
  <div class="table-scroll"><table class="table" data-table="lines" style="min-width:720px">
    <thead><tr><th style="width:34%">Produk / jasa</th><th class="ta-r">Qty</th><th>Satuan</th><th class="ta-r">Harga</th><th class="ta-r">Disk. %</th><th class="ta-r">Jumlah</th><th></th></tr></thead>
    <tbody>
      <tr v-for="(l, i) in lines" :key="i" class="is-static" data-line>
        <td>
          <select class="select" :value="l.productId ?? '__free'" aria-label="Produk" data-field="product" @change="pick(l, ($event.target as HTMLSelectElement).value)">
            <option value="__free">— Jasa lain (uraian bebas) —</option>
            <optgroup label="Barang"><option v-for="p in active.filter((x) => x.kind === 'barang')" :key="p.id" :value="p.id">{{ p.sku }} · {{ p.name }}</option></optgroup>
            <optgroup label="Jasa"><option v-for="p in active.filter((x) => x.kind === 'jasa')" :key="p.id" :value="p.id">{{ p.sku }} · {{ p.name }}</option></optgroup>
          </select>
          <input v-if="!l.productId" v-model="l.description" class="input" style="margin-top:4px" placeholder="Uraian jasa" maxlength="200" aria-label="Uraian" data-field="description">
          <span v-else-if="stockOf(l.productId) !== null" class="cell-sub" :class="{ neg: (stockOf(l.productId) ?? 0) < l.qty }">Stok {{ branch }}: {{ F.int(stockOf(l.productId) ?? 0) }} {{ l.unit }}</span>
        </td>
        <td><input v-model.number="l.qty" class="input num" type="number" min="0" step="any" style="width:90px;text-align:right" aria-label="Kuantitas" data-field="qty"></td>
        <td><input v-model="l.unit" class="input" style="width:80px" maxlength="20" :disabled="!!l.productId" aria-label="Satuan"></td>
        <td><input v-model.number="l.price" class="input num" type="number" min="0" step="1000" style="width:140px;text-align:right" aria-label="Harga" data-field="price"></td>
        <td><input v-model.number="l.discPct" class="input num" type="number" min="0" max="100" step="0.5" style="width:70px;text-align:right" aria-label="Diskon"></td>
        <td class="ta-r num">{{ F.rp(totals.lines[i] ?? 0) }}</td>
        <td><button class="btn btn-icon btn-ghost" type="button" aria-label="Hapus baris" :disabled="lines.length < 2" @click="lines.splice(i, 1)"><Icon name="minus" /></button></td>
      </tr>
    </tbody>
  </table></div>
  <div style="display:flex;gap:var(--sp-4);align-items:flex-start;flex-wrap:wrap;margin-top:var(--sp-2)">
    <button class="btn btn-sm btn-ghost" type="button" data-action="add-line" @click="add"><Icon name="plus" /> Tambah baris</button>
    <div class="toolbar-spacer"></div>
    <div class="totals" style="min-width:280px" data-totals>
      <div class="totals-row"><span>Subtotal</span><b>{{ F.rp(totals.subtotal) }}</b></div>
      <div v-if="totals.discount" class="totals-row"><span>Diskon</span><b>− {{ F.rp(totals.discount) }}</b></div>
      <div class="totals-row"><span>DPP (barang {{ F.rpCompact(totals.netGoods) }} · jasa {{ F.rpCompact(totals.netService) }})</span><b>{{ F.rp(totals.net) }}</b></div>
      <div class="totals-row"><span>PPN 11%</span><b>{{ F.rp(totals.ppn) }}</b></div>
      <div class="totals-row totals-grand"><span>Total</span><b data-total>{{ F.rp(totals.total) }}</b></div>
    </div>
  </div>
</template>
