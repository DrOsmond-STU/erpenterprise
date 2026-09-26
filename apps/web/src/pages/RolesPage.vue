<script setup lang="ts">
import { computed, ref } from 'vue';
import { PERMISSION_CATALOG, sodViolations } from '@erp/domain';
import { del, get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useToast } from '@/stores/toast';
import Icon from '@/components/Icon.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const toast = useToast();
const { data: roles, loading, reload } = useLoader<any[]>(() => get('/admin/roles', { scoped: false }));
const PROTECTED = ['admin.user.manage', 'admin.role.manage'];

/* Draf perubahan matriks: kode peran → himpunan izin baru */
const draft = ref<Record<string, Set<string>>>({});
const permsOf = (r: any): Set<string> => draft.value[r.code] ?? new Set(r.permissions);
const has = (r: any, p: string) => permsOf(r).has(p);
const changedCell = (r: any, p: string) => Boolean(draft.value[r.code]) && draft.value[r.code].has(p) !== r.permissions.includes(p);
function toggle(r: any, p: string) {
  const s = new Set(permsOf(r));
  if (s.has(p)) s.delete(p); else s.add(p);
  const same = s.size === r.permissions.length && r.permissions.every((x: string) => s.has(x));
  const next = { ...draft.value };
  if (same) delete next[r.code]; else next[r.code] = s;
  draft.value = next;
}
const changedRoles = computed(() => (roles.value ?? []).filter((r) => draft.value[r.code]));
const changeCount = computed(() => changedRoles.value.reduce((n, r) => n + [...new Set([...r.permissions, ...draft.value[r.code]])].filter((p) => changedCell(r, p)).length, 0));
const sodOf = (r: any) => sodViolations(permsOf(r));
const adminLosesProtected = (r: any) => r.code === 'admin' && PROTECTED.some((p) => !permsOf(r).has(p));
const blocked = computed(() => changedRoles.value.some((r) => sodOf(r).length || adminLosesProtected(r)));

const saving = ref(false);
const askReason = ref(false);
const saveError = ref('');
async function saveMatrix(reason: string) {
  saving.value = true; saveError.value = '';
  const done: string[] = [];
  try {
    for (const r of changedRoles.value) {
      await patch(`/admin/roles/${r.code}`, { permissions: [...draft.value[r.code]], reason });
      done.push(r.code);
    }
    toast.push('Izin peran disimpan', `${done.length} peran diperbarui; izin baru langsung berlaku di server.`, 'ok');
    draft.value = {}; askReason.value = false; await reload();
  } catch (e) {
    const next = { ...draft.value }; for (const c of done) delete next[c]; draft.value = next;
    saveError.value = (done.length ? `Tersimpan: ${done.join(', ')}. ` : '') + errorList(e).join(' ');
    await reload();
  } finally { saving.value = false; }
}

/* Peran baru / ubah nama */
const form = ref({ code: '', name: '', copyFrom: '' });
const editing = ref<any | null>(null);
const showForm = ref(false);
const errors = ref<string[]>([]);
const busy = ref(false);
function openNew() { editing.value = null; errors.value = []; form.value = { code: '', name: '', copyFrom: '' }; showForm.value = true; }
function openEdit(r: any) { editing.value = r; errors.value = []; form.value = { code: r.code, name: r.name, copyFrom: '' }; showForm.value = true; }
async function save() {
  errors.value = []; busy.value = true;
  try {
    if (editing.value) {
      await patch(`/admin/roles/${editing.value.code}`, { name: form.value.name, reason: 'Ubah nama peran' });
      toast.push('Peran diperbarui', `${editing.value.code} · ${form.value.name}`, 'ok');
    } else {
      const base = roles.value?.find((r) => r.code === form.value.copyFrom);
      const r = await post('/admin/roles', { code: form.value.code, name: form.value.name, permissions: base ? base.permissions : [] }, { scoped: false });
      toast.push('Peran dibuat', `${r.code} · ${r.name}${base ? ` (salinan ${base.name})` : ''}`, 'ok');
    }
    showForm.value = false; await reload();
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
const deleting = ref<any | null>(null);
const deleteError = ref('');
async function confirmDelete(reason: string) {
  busy.value = true; deleteError.value = '';
  try { await del(`/admin/roles/${deleting.value.code}`, { reason }); toast.push('Peran dihapus', deleting.value.name, 'ok'); deleting.value = null; await reload(); }
  catch (e) { deleteError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const pg = usePaged<any>(() => roles.value ?? [], 10);
</script>

<template>
  <ReportHead title="Peran & Izin" sub="Klik sel untuk memberi atau mencabut izin. Perubahan baru berlaku setelah disimpan dengan alasan, dan pemisahan tugas diperiksa otomatis.">
    <button class="btn btn-ghost" data-action="new-role" @click="openNew"><Icon name="plus" /> Peran baru</button>
    <button class="btn btn-primary" data-action="save-matrix" :disabled="!changeCount || blocked" @click="askReason = true; saveError = ''"><Icon name="check" /> Simpan perubahan<span v-if="changeCount"> ({{ changeCount }})</span></button>
  </ReportHead>
  <div v-if="loading && !roles" class="loading">Memuat…</div>
  <template v-else-if="roles">
    <article class="card">
      <div class="card-head">
        <div class="card-head-text"><h2 class="card-title"><Icon name="shield" /> Matriks izin</h2><span class="card-note">{{ roles.length }} peran · {{ PERMISSION_CATALOG.reduce((n, g) => n + g.items.length, 0) }} izin</span></div>
        <div class="chart-legend">
          <span><span class="perm" data-level="full" style="display:inline-grid;width:16px;height:16px;vertical-align:middle"><Icon name="check" /></span> Diberikan</span>
          <span><span class="perm" data-level="none" style="display:inline-grid;width:16px;height:16px;vertical-align:middle"></span> Tidak</span>
          <span><span class="perm" data-level="read" style="display:inline-grid;width:16px;height:16px;vertical-align:middle"></span> Belum disimpan</span>
          <button v-if="changeCount" class="btn btn-sm btn-ghost" data-action="discard-matrix" @click="draft = {}">Batalkan perubahan</button>
        </div>
      </div>
      <div class="table-scroll" style="max-height:70vh"><table class="matrix" data-table="matrix">
        <thead><tr><th>Izin</th><th v-for="r in roles" :key="r.code" :data-role="r.code" :title="r.code">{{ r.name }}<br><span style="font-weight:400;text-transform:none">{{ r.users }} pengguna</span></th></tr></thead>
        <tbody>
          <template v-for="g in PERMISSION_CATALOG" :key="g.group">
            <tr class="matrix-row-group"><th :colspan="roles.length + 1">{{ g.group }}</th></tr>
            <tr v-for="it in g.items" :key="it.code" :data-perm="it.code">
              <th :title="it.code">{{ it.label }}<span class="cell-sub code" style="font-weight:400">{{ it.code }}</span></th>
              <td v-for="r in roles" :key="r.code">
                <button class="perm" type="button" :data-level="changedCell(r, it.code) ? 'read' : has(r, it.code) ? 'full' : 'none'" :data-cell="`${r.code}:${it.code}`"
                  :aria-pressed="has(r, it.code)" :aria-label="`${r.name}: ${it.label}`" @click="toggle(r, it.code)">
                  <Icon v-if="has(r, it.code)" name="check" /><Icon v-else-if="changedCell(r, it.code)" name="minus" />
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table></div>
      <div v-for="r in changedRoles.filter((x) => sodOf(x).length || adminLosesProtected(x))" :key="r.code" class="card-body field-hint neg" role="alert" data-sod-warning>
        <div v-for="v in sodOf(r)" :key="v">• {{ r.name }} — pemisahan tugas: {{ v }}</div>
        <div v-if="adminLosesProtected(r)">• {{ r.name }} harus tetap memegang izin kelola pengguna dan kelola peran.</div>
      </div>
    </article>

    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Daftar peran</h2><span class="card-note">Peran yang masih dipegang pengguna tidak dapat dihapus. Peran Admin Sistem dilindungi.</span></div></div>
      <div class="table-scroll"><table class="table" data-table="roles">
        <thead><tr><th>Kode</th><th>Nama</th><th class="ta-r">Izin</th><th class="ta-r">Pengguna</th><th class="ta-r">Aksi</th></tr></thead>
        <tbody>
          <tr v-for="r in pg.pageRows.value" :key="r.code" class="is-static" :data-role-row="r.code">
            <td class="code">{{ r.code }}</td><td class="cell-strong">{{ r.name }}</td><td class="ta-r num">{{ r.permissions.length }}</td><td class="ta-r num">{{ r.users }}</td>
            <td><div class="row-actions">
              <button class="btn btn-sm btn-ghost" data-action="edit-role" @click="openEdit(r)">Ubah nama</button>
              <button v-if="r.code !== 'admin'" class="btn btn-sm btn-ghost neg" data-action="delete-role" @click="deleting = r; deleteError = ''">Hapus</button>
            </div></td>
          </tr>
        </tbody>
      </table></div>
      <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="peran" />
    </article>
  </template>

  <Modal v-if="showForm" :title="editing ? `Ubah nama peran ${editing.code}` : 'Peran baru'" :subtitle="editing ? 'Kode peran tidak dapat diubah.' : 'Izin dapat disalin dari peran lain lalu disesuaikan di matriks.'" width="520px" @close="showForm = false">
    <div class="form-grid">
      <div class="field"><label for="role-code">Kode</label><input id="role-code" v-model="form.code" class="input code" maxlength="40" placeholder="kasir_cabang" :disabled="!!editing"><span class="field-hint">Huruf kecil, angka, garis bawah.</span></div>
      <div class="field"><label for="role-name">Nama</label><input id="role-name" v-model="form.name" class="input" maxlength="80" placeholder="Kasir Cabang"></div>
      <div v-if="!editing" class="field form-grid-full"><label for="role-copy">Salin izin dari</label>
        <select id="role-copy" v-model="form.copyFrom" class="select"><option value="">— Mulai kosong —</option><option v-for="r in roles ?? []" :key="r.code" :value="r.code">{{ r.name }} ({{ r.permissions.length }} izin)</option></select></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-role" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showForm = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="askReason" :title="`Simpan ${changeCount} perubahan izin?`" :message="`Peran yang berubah: ${changedRoles.map((r) => r.name).join(', ')}. Izin baru langsung berlaku untuk semua pemegang peran.`"
    confirm-label="Simpan perubahan" :busy="saving" :error="saveError" @close="askReason = false" @confirm="saveMatrix" />
  <ReasonModal v-if="deleting" :title="`Hapus peran ${deleting.name}?`" message="Hanya peran yang tidak dipegang pengguna mana pun yang dapat dihapus." confirm-label="Hapus peran" danger
    :busy="busy" :error="deleteError" @close="deleting = null" @confirm="confirmDelete" />
</template>
