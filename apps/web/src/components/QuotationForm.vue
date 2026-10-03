<script setup lang="ts">
/** Formulir penawaran harga (buat & ubah draf; penawaran terkirim hanya perpanjang masa berlaku). */
import { computed, ref } from 'vue';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import { todayWib } from '@/lib/sales';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import SalesLinesEditor, { type EditLine } from './SalesLinesEditor.vue';

const props = defineProps<{ doc?: any; opportunity?: any }>();
const emit = defineEmits<{ close: []; saved: [doc: any] }>();
const ctx = useContext();
const session = useSession();
const d = props.doc;
const opp = props.opportunity;
const customers = ref<any[]>([]);
const products = ref<any[]>([]);
const errors = ref<string[]>([]);
Promise.all([get('/sales/customers'), get('/sales/products')]).then(([c, p]) => { customers.value = c; products.value = p; }).catch((e) => { errors.value = errorList(e); });
const branches = computed(() => session.branches.filter((b) => b.status === 'aktif' && (ctx.branch === 'ALL' || b.code === ctx.branch)));
const plus30 = (iso: string) => new Date(new Date(iso).getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
const form = ref({
  branch: d?.branch ?? opp?.branch ?? (ctx.branch !== 'ALL' ? ctx.branch : branches.value[0]?.code ?? ''), customerId: d?.customerId ?? opp?.customerId ?? '',
  quoteDate: d?.date ?? todayWib(), validUntil: d?.validUntil ?? plus30(todayWib()), terms: d?.terms ?? 'Pembayaran 30 hari setelah faktur', notes: d?.notes ?? '',
});
const sentOnly = d?.status === 'terkirim';
const lines = ref<EditLine[]>(d?.lines?.length
  ? d.lines.map((l: any) => ({ productId: l.productId, description: l.description, kind: l.kind, unit: l.unit, qty: l.qty, price: l.price, discPct: l.discPct }))
  : [{ productId: null, description: opp?.name ?? '', kind: 'jasa', unit: 'paket', qty: 1, price: opp?.value ?? 0, discPct: 0 }]);
const busy = ref(false);
async function save() {
  errors.value = []; busy.value = true;
  const body: any = sentOnly ? { validUntil: form.value.validUntil } : {
    customerId: form.value.customerId || undefined, quoteDate: form.value.quoteDate, validUntil: form.value.validUntil, terms: form.value.terms || undefined, notes: form.value.notes || undefined,
    lines: lines.value.map((l) => ({ productId: l.productId, description: l.description || undefined, kind: l.kind, unit: l.unit, qty: Number(l.qty), price: Math.round(Number(l.price) || 0), discPct: Number(l.discPct) || 0 })),
  };
  if (!d) { body.branch = form.value.branch; if (opp) body.opportunityId = opp.id; }
  try { emit('saved', d ? await patch(`/crm/quotations/${d.id}`, body) : await post('/crm/quotations', body)); }
  catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <Modal :title="d ? (sentOnly ? `Perpanjang ${d.docNo}` : `Ubah ${d.docNo}`) : opp ? `Penawaran untuk ${opp.code}` : 'Penawaran baru'" subtitle="Harga & PPN dihitung dengan aturan faktur. Penawaran diterima menjadi pesanan penjualan (plafon kredit diperiksa saat itu)." width="980px" @close="emit('close')">
    <div class="form-grid doc-grid">
      <div class="field"><label for="qt-branch">Cabang</label><select id="qt-branch" v-model="form.branch" class="select" :disabled="!!d || !!opp"><option v-for="b in branches" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name || b.name }}</option></select></div>
      <div class="field span-3"><label for="qt-customer">Pelanggan</label>
        <select id="qt-customer" v-model="form.customerId" class="select" :disabled="sentOnly" data-field="quote-customer"><option value="" disabled>— Pilih pelanggan —</option>
          <option v-for="c in customers.filter((x) => x.status !== 'nonaktif')" :key="c.id" :value="c.id">{{ c.code }} · {{ c.name }}</option></select>
        <span v-if="opp && !opp.customerId" class="field-hint">Prospek {{ opp.companyName }} — pilih / daftarkan pelanggan dahulu di menu Pelanggan.</span></div>
      <div class="field"><label for="qt-date">Tanggal</label><input id="qt-date" v-model="form.quoteDate" class="input" type="date" :disabled="sentOnly"></div>
      <div class="field"><label for="qt-valid">Berlaku s.d.</label><input id="qt-valid" v-model="form.validUntil" class="input" type="date" :min="form.quoteDate" data-field="quote-valid"></div>
      <div class="field span-2"><label for="qt-terms">Syarat</label><input id="qt-terms" v-model="form.terms" class="input" maxlength="500" :disabled="sentOnly"></div>
      <div v-if="!sentOnly" class="field form-grid-full"><label>Baris</label><SalesLinesEditor v-model="lines" :products="products" :branch="form.branch" /></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-quote" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="emit('close')">Batal</button>
    </template>
  </Modal>
</template>
