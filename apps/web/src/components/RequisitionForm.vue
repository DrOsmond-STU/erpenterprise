<script setup lang="ts">
/** Formulir permintaan pembelian (buat & ubah draf/ditolak). Nilai perkiraan sebelum PPN. */
import { computed, ref } from 'vue';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import { todayWib } from '@/lib/sales';
import { SLA_HOURS } from '@/lib/procurement';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import PurchaseLinesEditor, { type PurchaseLine } from './PurchaseLinesEditor.vue';

const props = defineProps<{ doc?: any }>();
const emit = defineEmits<{ close: []; saved: [doc: any, submitted: boolean] }>();
const ctx = useContext();
const session = useSession();
const products = ref<any[]>([]);
const accounts = ref<any[]>([]);
const departments = ref<string[]>([]);
const errors = ref<string[]>([]);
get('/purchasing/procurement/catalog').then((r) => { products.value = r.products; accounts.value = r.accounts; departments.value = r.departments; }).catch((e) => { errors.value = errorList(e); });

const branches = computed(() => session.branches.filter((b) => b.status === 'aktif' && (ctx.branch === 'ALL' || b.code === ctx.branch)));
const d = props.doc;
const form = ref({
  branch: d?.branch ?? (ctx.branch !== 'ALL' ? ctx.branch : branches.value[0]?.code ?? ''),
  requestDate: d?.date ?? todayWib(), neededDate: d?.neededDate ?? '', department: d?.department ?? '', requesterName: d?.requesterName ?? session.user?.name ?? '',
  description: d?.description ?? '', priority: d?.priority ?? 'sedang', notes: d?.notes ?? '',
});
const lines = ref<PurchaseLine[]>(d?.lines?.length
  ? d.lines.map((l: any) => ({ productId: l.productId ?? null, description: l.description, kind: l.kind, unit: l.unit, qty: l.qty, price: l.estPrice, discPct: 0, expenseAccount: l.expenseAccount ?? null }))
  : [{ productId: null, description: '', kind: 'jasa', unit: 'paket', qty: 1, price: 0, discPct: 0, expenseAccount: null }]);

const busy = ref(false);
async function save(submit: boolean) {
  errors.value = []; busy.value = true;
  const body: any = {
    branch: form.value.branch, requestDate: form.value.requestDate, neededDate: form.value.neededDate || null, department: form.value.department, requesterName: form.value.requesterName || undefined,
    description: form.value.description, priority: form.value.priority, notes: form.value.notes || undefined, submit,
    lines: lines.value.map((l) => ({ productId: l.productId, description: l.description || undefined, kind: l.kind, unit: l.unit, qty: Number(l.qty), price: Math.round(Number(l.price) || 0), expenseAccount: l.productId ? null : l.expenseAccount })),
  };
  try {
    const r = d ? await patch(`/purchasing/requisitions/${d.id}`, body) : await post('/purchasing/requisitions', body);
    emit('saved', r, submit);
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <Modal :title="d ? `Ubah ${d.docNo}` : 'Permintaan pembelian baru'" subtitle="Permintaan diputus penyetuju selain pemohon. Setelah disetujui, bagian pembelian membuat PO langsung atau RFQ ke minimal dua pemasok." width="1000px" @close="emit('close')">
    <div class="form-grid doc-grid">
      <div class="field"><label for="pr-branch">Cabang</label>
        <select id="pr-branch" v-model="form.branch" class="select" :disabled="!!d"><option v-for="b in branches" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name || b.name }}</option></select></div>
      <div class="field"><label for="pr-dept">Departemen</label><input id="pr-dept" v-model="form.department" class="input" list="pr-depts" maxlength="80" placeholder="mis. Produksi" data-field="department">
        <datalist id="pr-depts"><option v-for="x in departments" :key="x" :value="x" /></datalist></div>
      <div class="field"><label for="pr-req">Pemohon</label><input id="pr-req" v-model="form.requesterName" class="input" maxlength="120"></div>
      <div class="field"><label for="pr-prio">Prioritas</label>
        <select id="pr-prio" v-model="form.priority" class="select" data-field="priority"><option value="tinggi">Tinggi — SLA {{ SLA_HOURS.tinggi }} jam</option><option value="sedang">Sedang — SLA {{ SLA_HOURS.sedang / 24 }} hari</option><option value="rendah">Rendah — SLA {{ SLA_HOURS.rendah / 24 }} hari</option></select></div>
      <div class="field span-2"><label for="pr-desc">Keperluan</label><input id="pr-desc" v-model="form.description" class="input" maxlength="300" placeholder="mis. Pelat baja SPHC 3mm — stok kritis" data-field="description"></div>
      <div class="field"><label for="pr-date">Tanggal permintaan</label><input id="pr-date" v-model="form.requestDate" class="input" type="date"></div>
      <div class="field"><label for="pr-need">Dibutuhkan tanggal</label><input id="pr-need" v-model="form.neededDate" class="input" type="date" :min="form.requestDate"></div>
      <div class="field form-grid-full"><label for="pr-notes">Catatan</label><input id="pr-notes" v-model="form.notes" class="input" maxlength="500" placeholder="Opsional — spesifikasi, merek, pemasok yang disarankan"></div>
      <div class="field form-grid-full"><label>Barang / jasa yang diminta</label><PurchaseLinesEditor v-model="lines" :products="products" :accounts="accounts" :branch="form.branch" estimate /></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="submit-pr" :disabled="busy" @click="save(true)"><Icon name="send" /> Simpan & ajukan</button>
      <button class="btn" data-action="save-pr-draft" :disabled="busy" @click="save(false)">Simpan draf</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="emit('close')">Batal</button>
    </template>
  </Modal>
</template>
