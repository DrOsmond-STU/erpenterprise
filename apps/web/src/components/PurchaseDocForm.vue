<script setup lang="ts">
/** Formulir PO (buat & ubah draf/ditolak) dan tagihan pemasok langsung (jasa/biaya tanpa PO). */
import { computed, ref } from 'vue';
import { salesTotals } from '@erp/domain';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import PurchaseLinesEditor, { type PurchaseLine } from './PurchaseLinesEditor.vue';

const props = defineProps<{ kind: 'order' | 'invoice'; doc?: any }>();
const emit = defineEmits<{ close: []; saved: [doc: any, submitted: boolean] }>();
const ctx = useContext();
const session = useSession();
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

const suppliers = ref<any[]>([]);
const products = ref<any[]>([]);
const accounts = ref<any[]>([]);
const policies = ref<any>({});
const errors = ref<string[]>([]);
Promise.all([
  get('/purchasing/suppliers'),
  session.can('sales.invoice.read') ? get('/sales/products') : Promise.resolve([]),
  get('/ledger/accounts'),
  get('/settings').catch(() => ({ policies: {} })),
]).then(([s, p, a, st]) => {
  suppliers.value = s; products.value = p; policies.value = st.policies ?? {};
  accounts.value = (a.accounts ?? []).filter((x: any) => x.type === 'detail' && x.status === 'aktif' && ['Beban', 'Aset'].includes(x.category) && !x.isCash && !x.isIntercompany && !x.isComputed);
}).catch((e) => { errors.value = errorList(e); });

const branches = computed(() => session.branches.filter((b) => b.status === 'aktif' && (ctx.branch === 'ALL' || b.code === ctx.branch)));
const d = props.doc;
const form = ref({
  branch: d?.branch ?? (ctx.branch !== 'ALL' ? ctx.branch : branches.value[0]?.code ?? ''),
  supplierId: d?.supplierId ?? '',
  date: d?.date ?? today,
  second: (props.kind === 'order' ? d?.expectedDate : d?.dueDate) ?? '',
  supplierInvoiceNo: d?.supplierInvoiceNo ?? '',
  supplierTotal: '' as string | number,
  notes: d?.notes ?? '',
});
const lines = ref<PurchaseLine[]>(d?.lines?.length
  ? d.lines.map((l: any) => ({ productId: l.productId ?? null, description: l.description, kind: l.kind, unit: l.unit, qty: l.qty, price: l.price, discPct: l.discPct ?? 0, expenseAccount: l.expenseAccount ?? l.account ?? null }))
  : [{ productId: null, description: '', kind: 'jasa', unit: 'paket', qty: 1, price: 0, discPct: 0, expenseAccount: null }]);
const sup = computed(() => suppliers.value.find((s) => s.id === form.value.supplierId));
const total = computed(() => salesTotals(lines.value.map((l) => ({ qty: Number(l.qty) || 0, price: Number(l.price) || 0, discPct: Number(l.discPct) || 0, kind: l.kind }))).total);
const needsApproval = computed(() => props.kind === 'order' && ((policies.value.purchaseApprovalThreshold > 0 && total.value > policies.value.purchaseApprovalThreshold) || sup.value?.status === 'pantau'));

const busy = ref(false);
async function save(submit: boolean) {
  errors.value = []; busy.value = true;
  const body: any = {
    branch: form.value.branch, supplierId: form.value.supplierId || undefined, notes: form.value.notes || undefined,
    lines: lines.value.map((l) => ({ productId: l.productId, description: l.description || undefined, kind: l.kind, unit: l.unit, qty: Number(l.qty), price: Math.round(Number(l.price) || 0), discPct: Number(l.discPct) || 0, expenseAccount: l.productId ? null : l.expenseAccount })),
  };
  if (props.kind === 'order') { body.orderDate = form.value.date; if (form.value.second) body.expectedDate = form.value.second; body.submit = submit; }
  else {
    body.invoiceDate = form.value.date; if (form.value.second) body.dueDate = form.value.second;
    if (form.value.supplierInvoiceNo) body.supplierInvoiceNo = form.value.supplierInvoiceNo;
    if (form.value.supplierTotal !== '' && !d) body.supplierTotal = Math.round(Number(form.value.supplierTotal));
    body.lines = body.lines.map((l: any) => ({ ...l, productId: null, kind: 'jasa' }));
  }
  try {
    const base = props.kind === 'order' ? '/purchasing/orders' : '/purchasing/invoices';
    const r = d ? await patch(`${base}/${d.id}`, body) : await post(base, body);
    emit('saved', r, submit);
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
const title = computed(() => (d ? `Ubah ${props.kind === 'order' ? 'PO' : 'tagihan'} ${d.docNo}` : props.kind === 'order' ? 'Pesanan pembelian baru' : 'Tagihan jasa/biaya (tanpa PO)'));
</script>

<template>
  <Modal :title="title" :subtitle="kind === 'order' ? 'PO di atas batas persetujuan atau ke pemasok yang dipantau menunggu keputusan manajer. Barang berstok diterima gudang lewat penerimaan barang.' : 'Barang berstok wajib melalui PO & penerimaan barang. Tagihan tersimpan sebagai draf; posting dilakukan orang lain.'" width="1000px" @close="emit('close')">
    <div class="form-grid doc-grid">
      <div class="field"><label for="pd-branch">Cabang</label>
        <select id="pd-branch" v-model="form.branch" class="select" :disabled="!!d"><option v-for="b in branches" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name || b.name }}</option></select></div>
      <div class="field span-3"><label for="pd-supplier">Pemasok</label>
        <select id="pd-supplier" v-model="form.supplierId" class="select">
          <option value="" disabled>— Pilih pemasok —</option>
          <option v-for="s in suppliers.filter((x) => !['nonaktif', ...(kind === 'order' ? ['diblokir'] : [])].includes(x.status))" :key="s.id" :value="s.id">{{ s.code }} · {{ s.name }}{{ s.status === 'pantau' ? ' (dipantau)' : s.status === 'diblokir' ? ' (diblokir)' : '' }}</option>
        </select>
        <span v-if="sup" class="field-hint" data-supplier-hint>{{ sup.category ?? '—' }} · termin {{ sup.termsDays ? `Net ${sup.termsDays}` : 'tunai' }} · waktu kirim {{ sup.leadDays }} hari · hutang terbuka {{ F.rpCompact(sup.payable.open) }}
          <template v-if="needsApproval"> — <span class="neg">PO akan menunggu persetujuan manajer</span></template></span>
      </div>
      <div class="field"><label for="pd-date">{{ kind === 'order' ? 'Tanggal PO' : 'Tanggal tagihan' }}</label><input id="pd-date" v-model="form.date" class="input" type="date"></div>
      <div class="field"><label for="pd-second">{{ kind === 'order' ? 'Perkiraan tiba' : 'Jatuh tempo' }}</label><input id="pd-second" v-model="form.second" class="input" type="date">
        <span class="field-hint">{{ kind === 'order' ? 'Kosong = sesuai waktu kirim pemasok' : 'Kosong = sesuai termin pemasok' }}</span></div>
      <template v-if="kind === 'invoice'">
        <div class="field"><label for="pd-supno">No. tagihan pemasok</label><input id="pd-supno" v-model="form.supplierInvoiceNo" class="input code" maxlength="60"></div>
        <div v-if="!d" class="field"><label for="pd-suptotal">Nilai tertera (Rp)</label><input id="pd-suptotal" v-model="form.supplierTotal" class="input num" type="number" min="0" style="text-align:right" placeholder="Opsional"><span class="field-hint">Dicocokkan dengan total baris</span></div>
      </template>
      <div class="field" :class="kind === 'order' ? 'span-2' : 'form-grid-full'"><label for="pd-notes">Catatan</label><input id="pd-notes" v-model="form.notes" class="input" maxlength="500" placeholder="Opsional"></div>
      <div class="field form-grid-full"><label>Baris</label><PurchaseLinesEditor v-model="lines" :products="products" :accounts="accounts" :branch="form.branch" :services-only="kind === 'invoice'" /></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <template v-if="kind === 'order'">
        <button class="btn btn-primary" data-action="submit-po" :disabled="busy" @click="save(true)"><Icon name="send" /> Simpan & ajukan</button>
        <button class="btn" data-action="save-po-draft" :disabled="busy" @click="save(false)">Simpan draf</button>
      </template>
      <button v-else class="btn btn-primary" data-action="save-ap-invoice" :disabled="busy" @click="save(false)"><Icon name="check" /> Simpan draf tagihan</button>
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
