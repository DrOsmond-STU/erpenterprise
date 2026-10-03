<script setup lang="ts">
/** Formulir proyek: data utama, anggaran biaya, nilai kontrak, dan tugas (Gantt). */
import { computed, ref } from 'vue';
import { projectProgress } from '@erp/domain';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import { todayWib } from '@/lib/sales';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import Icon from './Icon.vue';
import Modal from './Modal.vue';

const props = defineProps<{ doc?: any }>();
const emit = defineEmits<{ close: []; saved: [doc: any] }>();
const ctx = useContext();
const session = useSession();
const d = props.doc;
const branches = computed(() => session.branches.filter((b) => b.status === 'aktif' && (ctx.branch === 'ALL' || b.code === ctx.branch)));
const customers = ref<any[]>([]);
if (session.can('sales.invoice.read')) get('/sales/customers').then((r) => { customers.value = Array.isArray(r) ? r : r.data ?? []; }).catch(() => {});
const form = ref({
  branch: d?.branch ?? (ctx.branch !== 'ALL' ? ctx.branch : branches.value[0]?.code ?? ''), name: d?.name ?? '', customerId: d?.customerId ?? '', customerName: d?.customerId ? '' : d?.customerName ?? 'Internal',
  pmName: d?.pmName ?? session.user?.name ?? '', budget: d?.budget ?? 0, contractValue: d?.contractValue ?? 0, startDate: d?.startDate ?? todayWib(), endDate: d?.endDate ?? '',
  status: d?.status ?? 'perencanaan', manualProgress: d?.manualProgress ?? 0, notes: d?.notes ?? '',
});
const tasks = ref<any[]>((d?.tasks ?? []).map((t: any) => ({ ...t })));
const addTask = () => tasks.value.push({ name: '', startDate: form.value.startDate, endDate: form.value.endDate || form.value.startDate, progress: 0, weight: 1, assignee: '' });
const progress = computed(() => projectProgress(tasks.value.map((t) => ({ progress: Number(t.progress) || 0, weight: Number(t.weight) || 1 })), Number(form.value.manualProgress) || 0));
const errors = ref<string[]>([]);
const busy = ref(false);
async function save() {
  errors.value = []; busy.value = true;
  const body: any = {
    name: form.value.name, customerId: form.value.customerId || null, customerName: form.value.customerId ? undefined : form.value.customerName || 'Internal', pmName: form.value.pmName,
    budget: Math.round(Number(form.value.budget) || 0), contractValue: Math.round(Number(form.value.contractValue) || 0), startDate: form.value.startDate, endDate: form.value.endDate,
    status: form.value.status, manualProgress: tasks.value.length ? null : Number(form.value.manualProgress) || 0, notes: form.value.notes || undefined,
    tasks: tasks.value.filter((t) => t.name).map((t) => ({ name: t.name, startDate: t.startDate, endDate: t.endDate, progress: Math.round(Number(t.progress) || 0), weight: Number(t.weight) || 1, assignee: t.assignee || null })),
  };
  if (!d) body.branch = form.value.branch;
  try { emit('saved', d ? await patch(`/projects/${d.id}`, body) : await post('/projects', body)); }
  catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <Modal :title="d ? `Ubah ${d.code}` : 'Proyek baru'" subtitle="Biaya aktual proyek berasal dari baris jurnal bertanda proyek (jurnal memorial, tagihan pemasok atas PO/PR proyek). Kemajuan = rata-rata tertimbang tugas." width="1000px" @close="emit('close')">
    <div class="form-grid doc-grid">
      <div class="field"><label for="pj-branch">Cabang</label><select id="pj-branch" v-model="form.branch" class="select" :disabled="!!d"><option v-for="b in branches" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name || b.name }}</option></select></div>
      <div class="field span-3"><label for="pj-name">Nama proyek</label><input id="pj-name" v-model="form.name" class="input" maxlength="200" data-field="project-name"></div>
      <div class="field span-2"><label for="pj-cust">Pelanggan</label>
        <select v-if="customers.length" id="pj-cust" v-model="form.customerId" class="select"><option value="">— Internal / lainnya —</option><option v-for="c in customers" :key="c.id" :value="c.id">{{ c.code }} · {{ c.name }}</option></select>
        <input v-if="!form.customerId" v-model="form.customerName" class="input" :style="customers.length ? 'margin-top:4px' : ''" maxlength="200" placeholder="Internal" aria-label="Nama pelanggan"></div>
      <div class="field"><label for="pj-pm">Manajer proyek</label><input id="pj-pm" v-model="form.pmName" class="input" maxlength="120"></div>
      <div class="field"><label for="pj-status">Status</label><select id="pj-status" v-model="form.status" class="select" data-field="project-status"><option value="perencanaan">Perencanaan</option><option value="berjalan">Berjalan</option><option value="ditunda">Ditunda</option><option value="selesai">Selesai</option><option value="batal">Batal</option></select></div>
      <div class="field"><label for="pj-start">Mulai</label><input id="pj-start" v-model="form.startDate" class="input" type="date" data-field="project-start"></div>
      <div class="field"><label for="pj-end">Selesai</label><input id="pj-end" v-model="form.endDate" class="input" type="date" :min="form.startDate" data-field="project-end"></div>
      <div class="field"><label for="pj-budget">Anggaran biaya (Rp)</label><input id="pj-budget" v-model.number="form.budget" class="input num" type="number" min="0" step="1000000" style="text-align:right" data-field="project-budget"></div>
      <div class="field"><label for="pj-contract">Nilai kontrak (Rp)</label><input id="pj-contract" v-model.number="form.contractValue" class="input num" type="number" min="0" step="1000000" style="text-align:right"></div>
      <div v-if="!tasks.length" class="field"><label for="pj-prog">Kemajuan (%)</label><input id="pj-prog" v-model.number="form.manualProgress" class="input num" type="number" min="0" max="100"></div>
      <div class="field form-grid-full"><label for="pj-notes">Catatan</label><input id="pj-notes" v-model="form.notes" class="input" maxlength="1000"></div>
      <div class="field form-grid-full"><label>Tugas — kemajuan proyek {{ progress }}%</label>
        <div class="table-scroll"><table class="table" data-table="task-edit" style="min-width:820px">
          <thead><tr><th>Tugas</th><th>Mulai</th><th>Selesai</th><th class="ta-r">Kemajuan %</th><th class="ta-r">Bobot</th><th>PIC</th><th></th></tr></thead>
          <tbody><tr v-for="(t, i) in tasks" :key="i" class="is-static" data-task-row>
            <td><input v-model="t.name" class="input" maxlength="160" aria-label="Nama tugas" data-field="task-name"></td>
            <td><input v-model="t.startDate" class="input" type="date" :min="form.startDate" :max="form.endDate" aria-label="Mulai tugas"></td>
            <td><input v-model="t.endDate" class="input" type="date" :min="t.startDate" :max="form.endDate" aria-label="Selesai tugas"></td>
            <td class="ta-r"><input v-model.number="t.progress" class="input num" type="number" min="0" max="100" step="5" style="width:80px;text-align:right" aria-label="Kemajuan" data-field="task-progress"></td>
            <td class="ta-r"><input v-model.number="t.weight" class="input num" type="number" min="0.1" step="0.5" style="width:70px;text-align:right" aria-label="Bobot"></td>
            <td><input v-model="t.assignee" class="input" maxlength="120" aria-label="PIC"></td>
            <td><button class="btn btn-icon btn-ghost" aria-label="Hapus tugas" @click="tasks.splice(i, 1)"><Icon name="minus" /></button></td>
          </tr></tbody>
        </table></div>
        <button class="btn btn-sm btn-ghost" style="align-self:flex-start" data-action="add-task" @click="addTask"><Icon name="plus" /> Tambah tugas</button>
      </div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-project" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="emit('close')">Batal</button>
    </template>
  </Modal>
</template>
