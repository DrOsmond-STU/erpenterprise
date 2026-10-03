<script setup lang="ts">
import { computed, ref } from 'vue';
import { get, patch, post } from '@/lib/api';
import { SOURCES, STAGE_COLUMNS } from '@/lib/crm';
import { errorList } from '@/lib/errors';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import Icon from './Icon.vue';
import Modal from './Modal.vue';

const props = defineProps<{ doc?: any }>();
const emit = defineEmits<{ close: []; saved: [doc: any] }>();
const ctx = useContext();
const session = useSession();
const d = props.doc;
const customers = ref<any[]>([]);
if (session.can('sales.invoice.read')) get('/sales/customers').then((r) => { customers.value = r; }).catch(() => {});
const branches = computed(() => session.branches.filter((b) => b.status === 'aktif' && (ctx.branch === 'ALL' || b.code === ctx.branch)));
const form = ref({
  branch: d?.branch ?? (ctx.branch !== 'ALL' ? ctx.branch : branches.value[0]?.code ?? ''), name: d?.name ?? '', customerId: d?.customerId ?? '', companyName: d?.customerId ? '' : d?.companyName ?? '',
  contactName: d?.contactName ?? '', contactPhone: d?.contactPhone ?? '', contactEmail: d?.contactEmail ?? '', value: d?.value ?? 0, stage: d?.stage ?? 'prospek', source: d?.source ?? 'Langsung',
  ownerName: d?.ownerName ?? session.user?.name ?? '', expectedClose: d?.expectedClose ?? '', nextAction: d?.nextAction ?? '', nextActionDate: d?.nextActionDate ?? '',
});
const errors = ref<string[]>([]);
const busy = ref(false);
async function save() {
  errors.value = []; busy.value = true;
  const f = form.value;
  const body: any = { name: f.name, customerId: f.customerId || null, companyName: f.customerId ? undefined : f.companyName, contactName: f.contactName || undefined, contactPhone: f.contactPhone || undefined,
    contactEmail: f.contactEmail || undefined, value: Math.round(Number(f.value) || 0), source: f.source, ownerName: f.ownerName || undefined, expectedClose: f.expectedClose || null,
    nextAction: f.nextAction || null, nextActionDate: f.nextActionDate || null };
  if (!d) Object.assign(body, { branch: f.branch, stage: f.stage });
  try { emit('saved', d ? await patch(`/crm/opportunities/${d.id}`, body) : await post('/crm/opportunities', body)); }
  catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <Modal :title="d ? `Ubah ${d.code}` : 'Peluang baru'" subtitle="Nilai pipeline = nilai × probabilitas tahap. Peluang menjadi menang saat penawarannya diterima dan dikonversi menjadi pesanan penjualan." width="760px" @close="emit('close')">
    <div class="form-grid">
      <div class="field"><label for="op-branch">Cabang</label><select id="op-branch" v-model="form.branch" class="select" :disabled="!!d"><option v-for="b in branches" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name || b.name }}</option></select></div>
      <div class="field"><label for="op-stage">Tahap awal</label><select id="op-stage" v-model="form.stage" class="select" :disabled="!!d"><option v-for="[k, l] in STAGE_COLUMNS.slice(0, 4)" :key="k" :value="k">{{ l }}</option></select></div>
      <div class="field form-grid-full"><label for="op-name">Nama peluang</label><input id="op-name" v-model="form.name" class="input" maxlength="200" data-field="opp-name"></div>
      <div class="field"><label for="op-cust">Pelanggan</label>
        <select id="op-cust" v-model="form.customerId" class="select" data-field="opp-customer"><option value="">— Prospek baru —</option><option v-for="c in customers.filter((x) => x.status !== 'nonaktif')" :key="c.id" :value="c.id">{{ c.code }} · {{ c.name }}</option></select></div>
      <div v-if="!form.customerId" class="field"><label for="op-company">Nama perusahaan prospek</label><input id="op-company" v-model="form.companyName" class="input" maxlength="200" data-field="opp-company"></div>
      <div class="field"><label for="op-contact">Kontak</label><input id="op-contact" v-model="form.contactName" class="input" maxlength="120"></div>
      <div class="field"><label for="op-phone">Telepon</label><input id="op-phone" v-model="form.contactPhone" class="input" maxlength="40"></div>
      <div class="field"><label for="op-value">Perkiraan nilai (Rp)</label><input id="op-value" v-model.number="form.value" class="input num" type="number" min="0" step="1000000" style="text-align:right" data-field="opp-value"></div>
      <div class="field"><label for="op-source">Sumber</label><select id="op-source" v-model="form.source" class="select"><option v-for="s in SOURCES" :key="s" :value="s">{{ s }}</option></select></div>
      <div class="field"><label for="op-owner">PIC penjualan</label><input id="op-owner" v-model="form.ownerName" class="input" maxlength="120"></div>
      <div class="field"><label for="op-close">Perkiraan closing</label><input id="op-close" v-model="form.expectedClose" class="input" type="date"></div>
      <div class="field"><label for="op-next">Tindak lanjut</label><input id="op-next" v-model="form.nextAction" class="input" maxlength="300"></div>
      <div class="field"><label for="op-nextd">Tanggal tindak lanjut</label><input id="op-nextd" v-model="form.nextActionDate" class="input" type="date"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-opp" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="emit('close')">Batal</button>
    </template>
  </Modal>
</template>
