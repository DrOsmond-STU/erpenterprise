<script setup lang="ts">
/** Formulir pesanan penjualan / faktur langsung (buat & ubah draf). */
import { computed, ref, watch } from 'vue';
import { salesTotals } from '@erp/domain';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import SalesLinesEditor, { type EditLine } from './SalesLinesEditor.vue';

const props = defineProps<{ kind: 'order' | 'invoice'; doc?: any }>();
const emit = defineEmits<{ close: []; saved: [doc: any, submitted: boolean] }>();
const ctx = useContext();
const session = useSession();
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

const customers = ref<any[]>([]);
const products = ref<any[]>([]);
Promise.all([get('/sales/customers'), get('/sales/products')]).then(([c, p]) => { customers.value = c; products.value = p; }).catch((e) => { errors.value = errorList(e); });

const branches = computed(() => session.branches.filter((b) => b.status === 'aktif' && (ctx.branch === 'ALL' || b.code === ctx.branch)));
const d = props.doc;
const form = ref({
  branch: d?.branch ?? (ctx.branch !== 'ALL' ? ctx.branch : branches.value[0]?.code ?? ''),
  customerId: d?.customerId ?? '',
  date: d?.date ?? today,
  second: (props.kind === 'order' ? d?.deliveryDate : d?.dueDate) ?? '',
  notes: d?.notes ?? '',
});
const lines = ref<EditLine[]>(d?.lines?.length
  ? d.lines.map((l: any) => ({ productId: l.productId, description: l.description, kind: l.kind, unit: l.unit, qty: l.qty, price: l.price, discPct: l.discPct }))
  : [{ productId: null, description: '', kind: 'jasa', unit: 'paket', qty: 1, price: 0, discPct: 0 }]);
const cust = computed(() => customers.value.find((c) => c.id === form.value.customerId));
const total = computed(() => salesTotals(lines.value.map((l) => ({ qty: Number(l.qty) || 0, price: Number(l.price) || 0, discPct: Number(l.discPct) || 0, kind: l.kind }))).total);
/* Eksposur pelanggan sudah termasuk pesanan ini bila sedang diubah; kurangi agar pratinjau tidak ganda. */
const available = computed(() => (cust.value ? cust.value.available + (d && ['menunggu', 'disetujui'].includes(d.status) ? d.total : 0) : 0));
watch(() => form.value.customerId, () => { if (props.kind === 'invoice' && !d) form.value.second = ''; });

const errors = ref<string[]>([]);
const busy = ref(false);
async function save(submit: boolean) {
  errors.value = []; busy.value = true;
  const body: any = {
    branch: form.value.branch, customerId: form.value.customerId || undefined, notes: form.value.notes || undefined,
    lines: lines.value.map((l) => ({ productId: l.productId, description: l.description || undefined, kind: l.kind, unit: l.unit, qty: Number(l.qty), price: Math.round(Number(l.price) || 0), discPct: Number(l.discPct) || 0 })),
  };
  if (props.kind === 'order') { body.orderDate = form.value.date; if (form.value.second) body.deliveryDate = form.value.second; body.submit = submit; }
  else { body.invoiceDate = form.value.date; if (form.value.second) body.dueDate = form.value.second; }
  try {
    const base = props.kind === 'order' ? '/sales/orders' : '/sales/invoices';
    const r = d ? await patch(`${base}/${d.id}`, body) : await post(base, body);
    emit('saved', r, submit);
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
const title = computed(() => (d ? `Ubah ${props.kind === 'order' ? 'pesanan' : 'faktur'} ${d.docNo}` : props.kind === 'order' ? 'Pesanan penjualan baru' : 'Faktur baru (tanpa pesanan)'));
</script>

<template>
  <Modal :title="title" :subtitle="kind === 'order' ? 'Saat diajukan, sistem memeriksa plafon kredit pelanggan dan batas persetujuan perusahaan.' : 'Faktur tersimpan sebagai draf; penerbitan (posting ke buku besar) dilakukan oleh orang lain.'" width="980px" @close="emit('close')">
    <div class="form-grid doc-grid">
      <div class="field"><label for="doc-branch">Cabang</label>
        <select id="doc-branch" v-model="form.branch" class="select" :disabled="!!d"><option v-for="b in branches" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name || b.name }}</option></select></div>
      <div class="field span-3"><label for="doc-customer">Pelanggan</label>
        <select id="doc-customer" v-model="form.customerId" class="select">
          <option value="" disabled>— Pilih pelanggan —</option>
          <option v-for="c in customers.filter((x) => x.status !== 'nonaktif')" :key="c.id" :value="c.id">{{ c.code }} · {{ c.name }}{{ c.status === 'ditahan' ? ' (ditahan)' : '' }}</option>
        </select>
        <span v-if="cust" class="field-hint" data-credit-hint>
          Plafon {{ F.rpCompact(cust.creditLimit) }} · terpakai {{ F.rpCompact(cust.exposure.total) }} · sisa <b :class="{ neg: available < total }">{{ F.rpCompact(available) }}</b> · termin {{ cust.termsDays }} hari
          <template v-if="kind === 'order' && (available < total || cust.status === 'ditahan')"> — <span class="neg">pesanan akan menunggu persetujuan manajer</span></template>
        </span>
      </div>
      <div class="field"><label for="doc-date">{{ kind === 'order' ? 'Tanggal pesanan' : 'Tanggal faktur' }}</label><input id="doc-date" v-model="form.date" class="input" type="date"></div>
      <div class="field"><label for="doc-second">{{ kind === 'order' ? 'Tanggal kirim' : 'Jatuh tempo' }}</label><input id="doc-second" v-model="form.second" class="input" type="date">
        <span class="field-hint">{{ kind === 'order' ? 'Kosong = 14 hari' : 'Kosong = sesuai termin pelanggan' }}</span></div>
      <div class="field span-2"><label for="doc-notes">Catatan</label><input id="doc-notes" v-model="form.notes" class="input" maxlength="500" placeholder="Opsional"></div>
      <div class="field form-grid-full"><label>Baris</label><SalesLinesEditor v-model="lines" :products="products" :branch="form.branch" /></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <template v-if="kind === 'order'">
        <button class="btn btn-primary" data-action="submit-order" :disabled="busy" @click="save(true)"><Icon name="send" /> Simpan & ajukan</button>
        <button class="btn" data-action="save-draft" :disabled="busy" @click="save(false)">Simpan draf</button>
      </template>
      <button v-else class="btn btn-primary" data-action="save-invoice" :disabled="busy" @click="save(false)"><Icon name="check" /> Simpan draf faktur</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="emit('close')">Batal</button>
    </template>
  </Modal>
</template>

<style scoped>
.doc-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.span-3 { grid-column: span 3; }
.span-2 { grid-column: span 2; }
@media (max-width: 760px) {
  .doc-grid { grid-template-columns: minmax(0, 1fr); }
  .span-3, .span-2 { grid-column: auto; }
}
</style>
