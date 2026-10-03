<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Icon from '@/components/Icon.vue';
import Modal from '@/components/Modal.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/production/boms'));
const q = ref('');
const rows = computed(() => {
  const s = q.value.trim().toLowerCase();
  return (data.value ?? []).filter((b) => !s || [b.code, b.sku, b.productName, b.name].some((x) => String(x).toLowerCase().includes(s)));
});
const canManage = computed(() => session.can('production.manage'));

/* Formulir buat / ubah */
const show = ref(false);
const editing = ref<any>(null);
const items = ref<any[]>([]);
const form = ref({ code: '', sku: '', name: '', batchQty: 1, notes: '', status: 'aktif', lines: [] as { sku: string; qty: number | null }[] });
const errors = ref<string[]>([]);
const busy = ref(false);
const skus = computed(() => {
  const m = new Map<string, any>();
  for (const i of items.value) if (!m.has(i.sku)) m.set(i.sku, i);
  return [...m.values()].sort((a, b) => a.sku.localeCompare(b.sku));
});
const itemOf = (sku: string) => skus.value.find((i) => i.sku === sku);
const avgOf = (sku: string) => {
  const rs = items.value.filter((i) => i.sku === sku);
  const qty = rs.reduce((t, i) => t + i.onHand, 0);
  return qty ? rs.reduce((t, i) => t + i.value, 0) / qty : rs[0]?.avgCost ?? 0;
};
const batchCost = computed(() => form.value.lines.reduce((t, l) => t + (l.sku && l.qty ? Math.round(Number(l.qty) * avgOf(l.sku)) : 0), 0));
async function openForm(b?: any) {
  errors.value = [];
  try { items.value = (await get('/inventory/stock', { scoped: false })).items; } catch (e) { toast.error(e, 'Daftar barang tidak dapat dimuat'); return; }
  editing.value = b ?? null;
  form.value = b
    ? { code: b.code, sku: b.sku, name: b.name, batchQty: b.batchQty, notes: b.notes ?? '', status: b.status, lines: b.lines.map((l: any) => ({ sku: l.sku, qty: l.qty })) }
    : { code: '', sku: '', name: '', batchQty: 1, notes: '', status: 'aktif', lines: [{ sku: '', qty: null }] };
  show.value = true;
}
watch(() => form.value.sku, (sku) => { if (!editing.value && sku && !form.value.name) form.value.name = `BOM ${itemOf(sku)?.name ?? sku}`; });
async function save() {
  errors.value = []; busy.value = true;
  try {
    const f = form.value;
    const lines = f.lines.filter((l) => l.sku && Number(l.qty) > 0).map((l) => ({ sku: l.sku, qty: Number(l.qty) }));
    const r = editing.value
      ? await patch(`/production/boms/${editing.value.id}`, { name: f.name || undefined, batchQty: Number(f.batchQty), notes: f.notes || undefined, status: f.status, lines })
      : await post('/production/boms', { code: f.code, sku: f.sku, name: f.name || undefined, batchQty: Number(f.batchQty), notes: f.notes || undefined, lines });
    toast.push(editing.value ? 'BOM diperbarui' : 'BOM dibuat', `${r.code} · ${r.productName}`, 'ok');
    show.value = false; await reload();
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Bill of Materials" sub="Resep bahan per barang hasil produksi, berlaku untuk semua cabang. Estimasi HPP memakai harga pokok rata-rata persediaan saat ini; perintah kerja menyalin kebutuhan bahan saat dibuat.">
    <RouterLink class="btn" to="/perintah-kerja" style="text-decoration:none"><Icon name="gear" /> Perintah kerja</RouterLink>
    <button v-if="canManage" class="btn btn-primary" data-action="new-bom" @click="openForm()"><Icon name="plus" /> BOM baru</button>
  </ReportHead>
  <article class="card">
    <div class="toolbar"><div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari kode, barang…" aria-label="Cari BOM"></div></div>
    <div class="table-scroll"><table class="table" data-table="boms">
      <thead><tr><th>Kode</th><th>Barang hasil</th><th class="ta-r">Per batch</th><th>Bahan</th><th class="ta-r">Biaya bahan / unit</th><th class="ta-r">Perintah kerja</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="7"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="b in rows" :key="b.id" :data-row="canManage ? '' : undefined" :class="{ 'is-static': !canManage }" :data-bom="b.code" @click="canManage && openForm(b)">
          <td class="code cell-strong">{{ b.code }}</td>
          <td><span class="cell-strong">{{ b.productName }}</span><span class="cell-sub"><span class="code">{{ b.sku }}</span> · {{ b.name }}</span></td>
          <td class="ta-r num">{{ F.int(b.batchQty) }} {{ b.uom }}</td>
          <td><span v-for="l in b.lines" :key="l.sku" class="cell-sub" style="display:block">{{ F.dec(l.qty, 2) }} {{ l.uom }} {{ l.name }}</span></td>
          <td class="ta-r num">{{ F.rp(b.unitCost) }}</td><td class="ta-r num">{{ b.workOrders }}</td><td><Pill :status="b.status" /></td>
        </tr>
        <tr v-if="data && !rows.length" class="is-static"><td colspan="7"><div class="empty"><div class="empty-card"><span class="empty-title">Belum ada BOM</span><span class="empty-note">Buat BOM untuk barang yang diproduksi.</span></div></div></td></tr>
      </tbody>
    </table></div>
  </article>
  <Modal v-if="show" :title="editing ? `Ubah ${editing.code}` : 'BOM baru'" subtitle="Jumlah bahan per ukuran batch. Perubahan tidak memengaruhi perintah kerja yang sudah dibuat." width="720px" @close="show = false">
    <div class="form-grid">
      <div class="field"><label for="bom-code">Kode</label><input id="bom-code" v-model="form.code" class="input" maxlength="30" :disabled="!!editing" placeholder="Mis. BOM-BRK-A"></div>
      <div class="field"><label for="bom-sku">Barang hasil</label>
        <select id="bom-sku" v-model="form.sku" class="select" :disabled="!!editing"><option value="" disabled>— Pilih barang —</option><option v-for="i in skus" :key="i.sku" :value="i.sku">{{ i.sku }} · {{ i.name }}</option></select></div>
      <div class="field form-grid-full"><label for="bom-name">Nama</label><input id="bom-name" v-model="form.name" class="input" maxlength="120"></div>
      <div class="field"><label for="bom-batch">Ukuran batch{{ itemOf(form.sku) ? ` (${itemOf(form.sku).uom})` : '' }}</label><input id="bom-batch" v-model.number="form.batchQty" class="input num" type="number" min="0" step="any" style="text-align:right"></div>
      <div v-if="editing" class="field"><label for="bom-status">Status</label><select id="bom-status" v-model="form.status" class="select"><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option></select></div>
      <div class="field form-grid-full">
        <div class="table-scroll"><table class="table" data-table="bom-lines" style="min-width:520px">
          <thead><tr><th style="width:60%">Bahan</th><th class="ta-r">Jumlah per batch</th><th></th></tr></thead>
          <tbody><tr v-for="(l, i) in form.lines" :key="i" class="is-static" data-line>
            <td><select v-model="l.sku" class="select" aria-label="Bahan" data-field="sku"><option value="" disabled>— Pilih bahan —</option>
              <option v-for="it in skus" :key="it.sku" :value="it.sku" :disabled="it.sku === form.sku || form.lines.some((x, j) => j !== i && x.sku === it.sku)">{{ it.sku }} · {{ it.name }}</option></select></td>
            <td><input v-model.number="l.qty" class="input num" type="number" min="0" step="any" style="width:120px;text-align:right" aria-label="Jumlah" data-field="qty"> <span class="muted">{{ itemOf(l.sku)?.uom }}</span></td>
            <td><button class="btn btn-icon btn-ghost" type="button" aria-label="Hapus baris" :disabled="form.lines.length < 2" @click="form.lines.splice(i, 1)"><Icon name="minus" /></button></td>
          </tr></tbody>
        </table></div>
        <div style="display:flex;gap:var(--sp-4);align-items:center;margin-top:var(--sp-2)">
          <button class="btn btn-sm btn-ghost" type="button" data-action="add-line" @click="form.lines.push({ sku: '', qty: null })"><Icon name="plus" /> Tambah bahan</button>
          <div class="toolbar-spacer"></div><span>Estimasi biaya bahan per batch: <b class="num" data-bom-cost>{{ F.rp(batchCost) }}</b></span>
        </div>
      </div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-bom" :disabled="busy || !form.code || !form.sku || !(form.batchQty > 0) || !form.lines.some((l) => l.sku && Number(l.qty) > 0)" @click="save"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="show = false">Batal</button>
    </template>
  </Modal>
</template>
