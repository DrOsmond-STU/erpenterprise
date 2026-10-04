<script setup lang="ts">
import { ref, watch } from 'vue';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import { useToast } from '@/stores/toast';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import Pill from './Pill.vue';

/** Kontak pelanggan/pemasok. Kontak utama disinkronkan ke PIC data induk. */
const props = defineProps<{ partyType: 'customer' | 'supplier'; partyId: string; canManage: boolean; initial?: any[] }>();
const emit = defineEmits<{ changed: [] }>();
const toast = useToast();
const rows = ref<any[]>(props.initial ?? []);
const load = async () => { try { rows.value = await get(`/crm/contacts?partyType=${props.partyType}&partyId=${props.partyId}`); } catch (e) { toast.error(e, 'Kontak tidak dapat dimuat'); } };
watch(() => props.partyId, () => { if (!props.initial) load(); }, { immediate: true });
watch(() => props.initial, (v) => { if (v) rows.value = v; });
const form = ref<any>(null);
const errors = ref<string[]>([]);
const busy = ref(false);
const open = (c?: any) => { errors.value = []; form.value = c ? { ...c } : { name: '', title: '', phone: '', email: '', isPrimary: !rows.value.some((r) => r.isPrimary && r.status === 'aktif'), notes: '', status: 'aktif' }; };
async function save() {
  busy.value = true; errors.value = [];
  const f = form.value;
  const body = { name: f.name, title: f.title || null, phone: f.phone || null, email: f.email || null, isPrimary: !!f.isPrimary, notes: f.notes || null, status: f.status };
  try {
    if (f.id) await patch(`/crm/contacts/${f.id}`, body); else await post('/crm/contacts', { ...body, partyType: props.partyType, partyId: props.partyId });
    form.value = null; toast.push('Kontak disimpan', f.name, 'ok'); await load(); emit('changed');
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <div data-contacts>
    <div v-if="!rows.length" class="muted">Belum ada kontak.</div>
    <div v-else class="table-scroll"><table class="table"><tbody>
      <tr v-for="c in rows" :key="c.id" :class="canManage ? '' : 'is-static'" data-row :data-contact="c.name" @click="canManage && open(c)">
        <td><span class="cell-strong">{{ c.name }}</span><span class="cell-sub">{{ c.title ?? '—' }}</span></td>
        <td class="num">{{ c.phone ?? '—' }}<span class="cell-sub">{{ c.email ?? '' }}</span></td>
        <td><Pill v-if="c.isPrimary" label="Utama" tone="ok" /><Pill v-if="c.status === 'nonaktif'" status="nonaktif" /></td>
      </tr>
    </tbody></table></div>
    <button v-if="canManage" class="btn btn-sm" style="margin-top:var(--sp-2)" data-action="add-contact" @click="open()"><Icon name="plus" /> Tambah kontak</button>
  </div>
  <Modal v-if="form" :title="form.id ? `Ubah kontak ${form.name}` : 'Kontak baru'" subtitle="Kontak utama otomatis menjadi PIC, telepon & email pada data induk." width="560px" @close="form = null">
    <div class="form-grid">
      <div class="field"><label for="ct-name">Nama</label><input id="ct-name" v-model="form.name" class="input" maxlength="120" data-field="contact-name"></div>
      <div class="field"><label for="ct-title">Jabatan</label><input id="ct-title" v-model="form.title" class="input" maxlength="80"></div>
      <div class="field"><label for="ct-phone">Telepon</label><input id="ct-phone" v-model="form.phone" class="input" maxlength="40" data-field="contact-phone"></div>
      <div class="field"><label for="ct-email">Email</label><input id="ct-email" v-model="form.email" class="input" type="email" maxlength="200"></div>
      <div class="field"><label class="check"><input v-model="form.isPrimary" type="checkbox" data-field="contact-primary"> Kontak utama</label></div>
      <div v-if="form.id" class="field"><label for="ct-status">Status</label><select id="ct-status" v-model="form.status" class="select"><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option></select></div>
      <div class="field form-grid-full"><label for="ct-notes">Catatan</label><input id="ct-notes" v-model="form.notes" class="input" maxlength="500"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="save-contact" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="form = null">Batal</button></template>
  </Modal>
</template>
