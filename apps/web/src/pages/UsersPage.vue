<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { passwordProblems, sodViolations } from '@erp/domain';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const session = useSession();
const toast = useToast();
const { data: users, loading, reload } = useLoader<any[]>(() => get('/admin/users', { scoped: false }));
const { data: roles } = useLoader<any[]>(() => get('/admin/roles', { scoped: false }));
const roleMap = computed(() => new Map((roles.value ?? []).map((r: any) => [r.code, r])));
const branchOptions = computed(() => session.branches);

/* Ringkasan */
const all = computed(() => users.value ?? []);
const kpi = computed(() => ({
  active: all.value.filter((u) => u.status === 'aktif').length,
  locked: all.value.filter((u) => u.locked).length,
  mustChange: all.value.filter((u) => u.mustChangePassword && u.status === 'aktif').length,
  sessions: all.value.reduce((s, u) => s + (u.activeSessions ?? 0), 0),
}));

/* Saringan + paginasi */
const q = ref('');
const status = ref<'' | 'aktif' | 'nonaktif' | 'terkunci'>('');
const roleFilter = ref('');
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((u) => (!status.value || (status.value === 'terkunci' ? u.locked : u.status === status.value))
    && (!roleFilter.value || u.roles.some((r: any) => r.role === roleFilter.value))
    && (!s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)));
});
const pg = usePaged<any>(filtered, 25);
watch([q, status, roleFilter], pg.reset);

/* Tambah & ubah */
type Assign = { role: string; branch: string };
const form = ref<{ email: string; name: string; roles: Assign[]; pwMode: 'auto' | 'manual'; password: string }>({ email: '', name: '', roles: [], pwMode: 'auto', password: '' });
const editing = ref<any | null>(null);
const showForm = ref(false);
const errors = ref<string[]>([]);
const busy = ref(false);
function openNew() {
  editing.value = null; errors.value = [];
  form.value = { email: '', name: '', roles: [{ role: roles.value?.find((r: any) => r.code === 'staf_keuangan')?.code ?? roles.value?.[0]?.code ?? '', branch: 'ALL' }], pwMode: 'auto', password: '' };
  showForm.value = true;
}
function openEdit(u: any) {
  editing.value = u; errors.value = [];
  form.value = { email: u.email, name: u.name, roles: u.roles.map((r: any) => ({ role: r.role, branch: r.branch })), pwMode: 'auto', password: '' };
  showForm.value = true;
}
const formPerms = computed(() => form.value.roles.flatMap((a) => roleMap.value.get(a.role)?.permissions ?? []));
const formSod = computed(() => sodViolations(formPerms.value));
const pwHints = computed(() => (form.value.pwMode === 'manual' && form.value.password ? passwordProblems(form.value.password, form.value.email) : []));
const editReason = ref('');
const shown = ref<{ title: string; email: string; password: string } | null>(null);
async function save() {
  errors.value = [];
  const rolesClean = form.value.roles.filter((a) => a.role);
  if (!rolesClean.length) { errors.value = ['Pilih minimal satu peran.']; return; }
  if (formSod.value.length) { errors.value = formSod.value; return; }
  if (pwHints.value.length) { errors.value = pwHints.value; return; }
  busy.value = true;
  try {
    if (editing.value) {
      const body: any = { reason: editReason.value.trim() || 'Ubah data pengguna' };
      if (form.value.name !== editing.value.name) body.name = form.value.name;
      if (form.value.email !== editing.value.email) body.email = form.value.email;
      const before = JSON.stringify(editing.value.roles.map((r: any) => `${r.role}@${r.branch}`).sort());
      if (JSON.stringify(rolesClean.map((r) => `${r.role}@${r.branch}`).sort()) !== before) body.roles = rolesClean;
      await patch(`/admin/users/${editing.value.id}`, body);
      toast.push('Pengguna diperbarui', `${form.value.name} · ${form.value.email}`, 'ok');
    } else {
      const r = await post('/admin/users', { email: form.value.email, name: form.value.name, roles: rolesClean, password: form.value.pwMode === 'manual' ? form.value.password : undefined }, { scoped: false });
      toast.push('Pengguna ditambahkan', `${r.name} · ${r.email}`, 'ok');
      if (r.temporaryPassword) shown.value = { title: 'Pengguna baru dibuat', email: r.email, password: r.temporaryPassword };
    }
    showForm.value = false; editReason.value = ''; await reload();
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}

/* Tindakan beralasan: aktif/nonaktif, reset kata sandi, buka kunci */
const pending = ref<{ kind: 'toggle' | 'reset' | 'unlock'; u: any } | null>(null);
const pendingError = ref('');
const isSelf = (u: any) => u.id === session.user?.id;
async function confirm(reason: string) {
  const p = pending.value!; busy.value = true; pendingError.value = '';
  try {
    if (p.kind === 'reset') {
      const r = await post(`/admin/users/${p.u.id}/reset-password`, { reason }, { scoped: false });
      toast.push('Kata sandi direset', `${p.u.email} · ${r.sessionsRevoked} sesi dikeluarkan`, 'ok');
      shown.value = { title: 'Kata sandi sementara', email: p.u.email, password: r.temporaryPassword };
    } else if (p.kind === 'unlock') {
      await post(`/admin/users/${p.u.id}/unlock`, { reason }, { scoped: false });
      toast.push('Akun dibuka', p.u.email, 'ok');
    } else {
      const st = p.u.status === 'aktif' ? 'nonaktif' : 'aktif';
      await patch(`/admin/users/${p.u.id}`, { status: st, reason });
      toast.push(st === 'aktif' ? 'Pengguna diaktifkan' : 'Pengguna dinonaktifkan', p.u.email, 'ok');
    }
    pending.value = null; await reload();
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const pendingText = computed(() => {
  const p = pending.value; if (!p) return { title: '', message: '', label: '' };
  if (p.kind === 'reset') return { title: `Reset kata sandi ${p.u.name}?`, message: 'Kata sandi sementara akan dibuat dan ditampilkan sekali. Pengguna wajib menggantinya saat masuk; semua sesinya dikeluarkan.', label: 'Reset kata sandi' };
  if (p.kind === 'unlock') return { title: `Buka kunci ${p.u.name}?`, message: `Akun terkunci setelah ${p.u.failedLogins} kali gagal masuk. Pastikan percobaan tersebut memang dari pengguna ini.`, label: 'Buka kunci' };
  return p.u.status === 'aktif'
    ? { title: `Nonaktifkan ${p.u.name}?`, message: 'Pengguna tidak dapat masuk lagi dan semua sesinya dikeluarkan. Riwayat transaksinya tetap tersimpan.', label: 'Nonaktifkan' }
    : { title: `Aktifkan ${p.u.name}?`, message: 'Pengguna dapat masuk kembali dengan kata sandinya.', label: 'Aktifkan' };
});
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast.push('Disalin', 'Kata sandi sementara ada di papan klip.', 'ok'); }
  catch { toast.push('Tidak dapat menyalin', 'Salin secara manual.', 'warn'); }
}
const branchLabel = (b: string) => (b === 'ALL' ? 'Semua cabang' : b);
</script>

<template>
  <ReportHead title="Pengguna" sub="Akun yang dapat masuk ke sistem, peran dan cabangnya. Setiap perubahan tercatat di jejak audit.">
    <button class="btn btn-primary" data-action="new-user" @click="openNew"><Icon name="plus" /> Pengguna baru</button>
  </ReportHead>
  <div v-if="loading && !users" class="loading">Memuat…</div>
  <template v-else-if="users">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Pengguna aktif" :value="String(kpi.active)" :foot="`${all.length} akun terdaftar`" />
      <KpiTile label="Terkunci" :value="String(kpi.locked)" foot="Gagal masuk berulang" :tone="kpi.locked ? 'neg' : ''" />
      <KpiTile label="Wajib ganti kata sandi" :value="String(kpi.mustChange)" foot="Masih memakai kata sandi sementara" />
      <KpiTile label="Sesi aktif" :value="String(kpi.sessions)" foot="Semua perangkat" />
    </div>
    <article class="card">
      <div class="table-filter">
        <input v-model="q" class="input" type="search" placeholder="Cari nama atau email…" aria-label="Cari pengguna" data-filter="user">
        <select v-model="roleFilter" class="select" style="width:auto" aria-label="Saring peran"><option value="">Semua peran</option><option v-for="r in roles ?? []" :key="r.code" :value="r.code">{{ r.name }}</option></select>
        <select v-model="status" class="select" style="width:auto" aria-label="Saring status"><option value="">Semua status</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option><option value="terkunci">Terkunci</option></select>
      </div>
      <div class="table-scroll"><table class="table" data-table="users">
        <thead><tr><th>Pengguna</th><th>Peran · cabang</th><th>Status</th><th>Terakhir masuk</th><th class="ta-r">Aksi</th></tr></thead>
        <tbody>
          <tr v-for="u in pg.pageRows.value" :key="u.id" class="is-static" :data-user="u.email">
            <td><span class="cell-strong">{{ u.name }}</span> <span v-if="isSelf(u)" class="muted">(Anda)</span><span class="cell-sub">{{ u.email }}</span></td>
            <td><span v-for="r in u.roles" :key="r.role + r.branch" class="cell-sub" style="display:block">{{ r.roleName }} · {{ branchLabel(r.branch) }}</span></td>
            <td>
              <Pill :status="u.status" />
              <Pill v-if="u.locked" label="Terkunci" tone="danger" />
              <Pill v-if="u.mustChangePassword && u.status === 'aktif'" label="Kata sandi sementara" tone="warn" />
            </td>
            <td class="num">{{ u.lastLoginAt ? F.datetime(u.lastLoginAt) : 'Belum pernah' }}<span class="cell-sub">{{ u.activeSessions }} sesi aktif</span></td>
            <td>
              <div class="row-actions">
                <button class="btn btn-sm btn-ghost" data-action="edit-user" @click="openEdit(u)">Ubah</button>
                <button v-if="u.locked" class="btn btn-sm btn-ghost" data-action="unlock-user" @click="pending = { kind: 'unlock', u }; pendingError = ''">Buka kunci</button>
                <button v-if="!isSelf(u) && u.status === 'aktif'" class="btn btn-sm btn-ghost" data-action="reset-user" @click="pending = { kind: 'reset', u }; pendingError = ''">Reset kata sandi</button>
                <button v-if="!isSelf(u)" class="btn btn-sm btn-ghost" :class="{ neg: u.status === 'aktif' }" data-action="toggle-user" @click="pending = { kind: 'toggle', u }; pendingError = ''">{{ u.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan' }}</button>
              </div>
            </td>
          </tr>
          <tr v-if="!pg.total.value" class="is-static"><td colspan="5" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada pengguna yang cocok.</td></tr>
        </tbody>
      </table></div>
      <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="pengguna" />
    </article>
  </template>

  <Modal v-if="showForm" :title="editing ? `Ubah pengguna ${editing.name}` : 'Pengguna baru'" :subtitle="editing ? 'Perubahan peran atau email mengeluarkan semua sesi pengguna ini.' : 'Pengguna wajib mengganti kata sandi sementara saat pertama masuk.'" width="640px" @close="showForm = false">
    <div class="form-grid">
      <div class="field"><label for="user-name">Nama lengkap</label><input id="user-name" v-model="form.name" class="input" maxlength="120" placeholder="Nama pengguna"></div>
      <div class="field"><label for="user-email">Email</label><input id="user-email" v-model="form.email" class="input" type="email" maxlength="200" placeholder="nama@perusahaan.co.id" autocomplete="off"></div>
      <div class="field form-grid-full">
        <label>Peran dan cabang</label>
        <div v-for="(a, i) in form.roles" :key="i" style="display:flex;gap:var(--sp-2);margin-bottom:var(--sp-2)" data-assignment>
          <select v-model="a.role" class="select" aria-label="Peran" data-field="role"><option v-for="r in roles ?? []" :key="r.code" :value="r.code">{{ r.name }}</option></select>
          <select v-model="a.branch" class="select" aria-label="Cabang" data-field="branch"><option value="ALL">Semua cabang</option><option v-for="b in branchOptions" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }}</option></select>
          <button class="btn btn-icon btn-ghost" type="button" aria-label="Hapus peran" :disabled="form.roles.length < 2" @click="form.roles.splice(i, 1)"><Icon name="minus" /></button>
        </div>
        <div><button class="btn btn-sm btn-ghost" type="button" data-action="add-assignment" @click="form.roles.push({ role: roles?.[0]?.code ?? '', branch: 'ALL' })"><Icon name="plus" /> Tambah peran</button></div>
        <span class="field-hint">Gabungan izin: {{ new Set(formPerms).size }} izin. Peran berlaku untuk cabang yang dipilih.</span>
        <span v-for="v in formSod" :key="v" class="field-hint neg">• Pemisahan tugas: {{ v }}</span>
      </div>
      <template v-if="!editing">
        <div class="field form-grid-full">
          <label>Kata sandi awal</label>
          <div class="segmented" role="radiogroup">
            <button type="button" :aria-pressed="form.pwMode === 'auto'" data-pw-mode="auto" @click="form.pwMode = 'auto'">Buat otomatis</button>
            <button type="button" :aria-pressed="form.pwMode === 'manual'" data-pw-mode="manual" @click="form.pwMode = 'manual'">Tentukan sendiri</button>
          </div>
        </div>
        <div v-if="form.pwMode === 'manual'" class="field form-grid-full"><label for="user-password">Kata sandi sementara</label><input id="user-password" v-model="form.password" class="input" type="text" autocomplete="off" maxlength="200">
          <span v-for="h in pwHints" :key="h" class="field-hint neg">• {{ h }}</span></div>
      </template>
      <div v-else class="field form-grid-full"><label for="user-reason">Alasan perubahan (jejak audit)</label><input id="user-reason" v-model="editReason" class="input" maxlength="300" placeholder="Mis. pindah ke tim keuangan Surabaya"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-user" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showForm = false">Batal</button>
    </template>
  </Modal>

  <ReasonModal v-if="pending" :title="pendingText.title" :message="pendingText.message" :confirm-label="pendingText.label"
    :danger="pending.kind === 'toggle' && pending.u.status === 'aktif'" :busy="busy" :error="pendingError" @close="pending = null" @confirm="confirm" />

  <Modal v-if="shown" :title="shown.title" subtitle="Kata sandi ini hanya ditampilkan sekali. Sampaikan kepada pengguna lewat saluran yang aman; ia wajib menggantinya saat masuk." width="480px" @close="shown = null">
    <div class="field"><label>Email</label><div class="code">{{ shown.email }}</div></div>
    <div class="field"><label>Kata sandi sementara</label>
      <div style="display:flex;gap:var(--sp-2);align-items:center"><code class="code" data-temp-password style="font-size:var(--fs-lead);padding:var(--sp-2) var(--sp-3);background:var(--surface-2);border-radius:var(--r-sm)">{{ shown.password }}</code>
        <button class="btn btn-sm btn-ghost" data-action="copy-password" @click="copy(shown.password)"><Icon name="copy" /> Salin</button></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="close-temp" @click="shown = null">Selesai</button></template>
  </Modal>
</template>
