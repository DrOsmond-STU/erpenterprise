<script setup lang="ts">
import { ref, watch } from 'vue';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useContext } from '@/stores/context';
import { useToast } from '@/stores/toast';
import BranchTag from './BranchTag.vue';
import Drawer from './Drawer.vue';

const props = defineProps<{ sku: string; warehouse: string }>();
const emit = defineEmits<{ close: [] }>();
const ctx = useContext();
const toast = useToast();
const c = ref<any>(null);
const load = async () => {
  try { c.value = await get(`/inventory/card?sku=${encodeURIComponent(props.sku)}&warehouse=${encodeURIComponent(props.warehouse)}`); }
  catch (e) { toast.error(e, 'Kartu stok tidak dapat dimuat'); emit('close'); }
};
watch(() => [props.sku, props.warehouse, ctx.period], () => { c.value = null; load(); }, { immediate: true });
</script>

<template>
  <Drawer :title="c ? c.item.name : 'Memuat…'" :subtitle="c ? `Kartu stok ${c.item.warehouse} · ${c.period.label ?? c.period.id}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="c"><span class="code">{{ c.item.sku }}</span><BranchTag :code="c.item.branch" /><span class="muted">{{ c.item.category }}</span></template></template>
    <template v-if="c">
      <div class="section">
        <dl class="deflist">
          <dt>Stok saat ini</dt><dd class="num">{{ F.int(c.item.onHand) }} {{ c.item.uom }}</dd>
          <dt>HPP rata-rata</dt><dd class="num">{{ F.rp(c.item.avgCost) }}</dd>
          <dt>Nilai</dt><dd class="num">{{ F.rp(c.item.value) }}</dd>
        </dl>
      </div>
      <div class="section">
        <span class="section-title">Mutasi periode</span>
        <div class="table-scroll"><table class="table" data-table="stock-card">
          <thead><tr><th>Tanggal</th><th>Referensi</th><th class="ta-r">Mutasi</th><th class="ta-r">Saldo</th></tr></thead>
          <tbody>
            <tr class="is-static"><td colspan="3" class="muted">Saldo awal periode</td><td class="ta-r num cell-strong" data-opening>{{ F.int(c.opening) }}</td></tr>
            <tr v-for="l in c.lines" :key="l.id" class="is-static" :data-move="l.refType">
              <td class="num">{{ F.date(l.date) }}</td>
              <td>{{ l.refLabel }}<span class="cell-sub"><span class="code">{{ l.refNo }}</span><template v-if="l.byName"> · {{ l.byName }}</template></span></td>
              <td class="ta-r num" :class="l.qtyIn ? 'pos' : 'neg'">{{ l.qtyIn ? `+${F.int(l.qtyIn)}` : `−${F.int(l.qtyOut)}` }}<span class="cell-sub">{{ F.rp(Math.abs(l.value)) }}</span></td>
              <td class="ta-r num">{{ F.int(l.balance) }}</td>
            </tr>
            <tr v-if="!c.lines.length" class="is-static"><td colspan="4"><span class="muted">Tidak ada mutasi pada periode ini.</span></td></tr>
            <tr class="is-static"><td colspan="3" class="cell-strong">Saldo akhir periode</td><td class="ta-r num cell-strong" data-closing>{{ F.int(c.closing) }}</td></tr>
          </tbody>
        </table></div>
      </div>
    </template>
  </Drawer>
</template>
