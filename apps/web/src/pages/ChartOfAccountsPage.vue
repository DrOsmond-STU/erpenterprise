<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { AP_ACCOUNT, AR_ACCOUNT, CASH_ACCOUNT, CURRENT_EARNINGS, INVENTORY_ACCOUNTS, RK_CABANG, RK_PUSAT } from '@erp/domain';
import { del, get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Icon from '@/components/Icon.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const SYSTEM = new Set([RK_CABANG, RK_PUSAT, CASH_ACCOUNT, AR_ACCOUNT, AP_ACCOUNT, CURRENT_EARNINGS, ...INVENTORY_ACCOUNTS]);
const router = useRouter();
const session = useSession();
const toast = useToast();
const canManage = computed(() => session.can('ledger.account.manage'));
const { data, loading, reload } = useLoader(() => get('/ledger/accounts'));
const cats = ['Aset', 'Liabilitas', 'Ekuitas', 'Pendapatan', 'Beban'];
const totals = computed(() => cats.map((c) => { const items = (data.value?.accounts ?? []).filter((a: any) => a.category === c && a.type === 'detail'); return { c, total: items.reduce((s: number, a: any) => s + a.balance, 0), count: items.length }; }));
const isSystem = (a: any) => SYSTEM.has(a.code) || a.isComputed || a.isIntercompany || a.isCash;

/* Saringan + paginasi */
const q = ref('');
const status = ref<'' | 'aktif' | 'nonaktif'>('');
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return (data.value?.accounts ?? []).filter((a: any) => (!status.value || a.status === status.value) && (!s || a.code.includes(s) || a.name.toLowerCase().includes(s)));
});
const pg = usePaged<any>(filtered, 25);
watch([q, status], pg.reset);

/* Tambah & ubah */
const headers = computed(() => (data.value?.accounts ?? []).filter((a: any) => a.type === 'header' && a.status === 'aktif' && !a.isComputed));
const form = ref({ parentCode: '', code: '', name: '', type: 'detail' as 'detail' | 'header', isContra: false });
const editing = ref<any | null>(null);
const showForm = ref(false);
const errors = ref<string[]>([]);
const busy = ref(false);
function openNew() {
  editing.value = null; errors.value = [];
  form.value = { parentCode: headers.value[0]?.code ?? '', code: '', name: '', type: 'detail', isContra: false };
  showForm.value = true;
}
function openEdit(a: any) {
  editing.value = a; errors.value = [];
  form.value = { parentCode: a.parentCode ?? '', code: a.code, name: a.name, type: a.type, isContra: a.isContra };
  showForm.value = true;
}
watch(() => form.value.parentCode, (p) => { if (!editing.value && p && !form.value.code) form.value.code = `${p[0]}-`; });
async function save() {
  errors.value = []; busy.value = true;
  try {
    if (editing.value) {
      await patch(`/ledger/accounts/${editing.value.code}`, { name: form.value.name, reason: 'Ubah nama akun' });
      toast.push('Akun diperbarui', `${editing.value.code} · ${form.value.name}`, 'ok');
    } else {
      const a = await post('/ledger/accounts', form.value);
      toast.push('Akun ditambahkan', `${a.code} · ${a.name} (${a.category})`, 'ok');
    }
    showForm.value = false; await reload();
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}

/* Aktif/nonaktif & hapus — wajib alasan */
const pending = ref<{ kind: 'toggle' | 'delete'; a: any } | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  const p = pending.value!; busy.value = true; pendingError.value = '';
  try {
    if (p.kind === 'delete') { await del(`/ledger/accounts/${p.a.code}`, { reason }); toast.push('Akun dihapus', `${p.a.code} · ${p.a.name}`, 'ok'); }
    else { const st = p.a.status === 'aktif' ? 'nonaktif' : 'aktif'; await patch(`/ledger/accounts/${p.a.code}`, { status: st, reason }); toast.push(st === 'aktif' ? 'Akun diaktifkan' : 'Akun dinonaktifkan', `${p.a.code} · ${p.a.name}`, 'ok'); }
    pending.value = null; await reload();
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const openCard = (a: any) => { if (a.type === 'detail' && !a.isComputed) router.push({ path: '/buku-besar', query: { akun: a.code } }); };
</script>

<template>
  <ReportHead title="Bagan Akun (Chart of Accounts)" :sub="`Struktur akun buku besar beserta saldo per akhir periode. Klik akun detail untuk membuka kartu buku besar.`">
    <RouterLink class="btn" to="/neraca-saldo"><Icon name="scale" /> Neraca saldo</RouterLink>
    <button v-if="canManage" class="btn btn-primary" data-action="new-account" @click="openNew"><Icon name="plus" /> Akun baru</button>
  </ReportHead>
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <template v-else-if="data">
    <div class="coa-summary">
      <div v-for="t in totals" :key="t.c" class="card coa-summary-card"><span class="coa-summary-label">{{ t.c }}</span><span class="coa-summary-num" :class="{ neg: t.total < 0 }">{{ F.rpCompact(Math.abs(t.total)) }}</span><span class="muted" style="font-size:var(--fs-cap)">{{ t.count }} akun</span></div>
    </div>
    <article class="card">
      <div class="card-head"><h3 class="card-title"><Icon name="tree" /> Daftar Akun</h3></div>
      <div class="table-filter">
        <input v-model="q" class="input" type="search" placeholder="Cari kode atau nama akun…" aria-label="Cari akun" data-filter="account">
        <select v-model="status" class="select" style="width:auto" aria-label="Saring status"><option value="">Semua status</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option></select>
      </div>
      <div class="table-scroll"><table class="table" data-table="accounts">
        <thead><tr><th>Kode</th><th>Nama Akun</th><th>Tipe</th><th class="ta-r">Saldo</th><th>Status</th><th v-if="canManage" class="ta-r">Aksi</th></tr></thead>
        <tbody>
          <tr v-for="a in pg.pageRows.value" :key="a.code" :data-account="a.code" :class="{ 'coa-header-row': a.type === 'header', 'is-static': a.type === 'header' || a.isComputed }" @click="openCard(a)">
            <td class="code" :style="`padding-left:${a.level * 24 + 12}px`">{{ a.code }}</td>
            <td :class="{ 'cell-strong': a.type === 'header' }" :style="`padding-left:${a.level * 24 + 12}px`">{{ a.name }}<span v-if="a.isIntercompany" class="micro"> antar kantor</span><span v-if="a.isComputed" class="micro"> dihitung</span><span v-if="isSystem(a) && !a.isComputed && !a.isIntercompany" class="micro"> sistem</span></td>
            <td>{{ a.type === 'header' ? 'Header' : 'Detail' }}</td><td class="ta-r num" :class="{ neg: a.balance < 0 }">{{ F.rpCompact(a.balance) }}</td><td><Pill :status="a.status" /></td>
            <td v-if="canManage" @click.stop>
              <div class="row-actions">
                <button class="btn btn-sm btn-ghost" data-action="edit-account" @click="openEdit(a)">Ubah</button>
                <template v-if="!isSystem(a)">
                  <button class="btn btn-sm btn-ghost" data-action="toggle-account" @click="pending = { kind: 'toggle', a }; pendingError = ''">{{ a.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan' }}</button>
                  <button class="btn btn-sm btn-ghost neg" data-action="delete-account" @click="pending = { kind: 'delete', a }; pendingError = ''">Hapus</button>
                </template>
              </div>
            </td>
          </tr>
          <tr v-if="!pg.total.value" class="is-static"><td :colspan="canManage ? 6 : 5" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada akun yang cocok.</td></tr>
        </tbody>
      </table></div>
      <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="akun" />
    </article>
  </template>

  <Modal v-if="showForm" :title="editing ? `Ubah akun ${editing.code}` : 'Akun baru'" :subtitle="editing ? 'Kode, induk, dan kategori tidak dapat diubah agar riwayat buku besar tetap utuh.' : 'Kategori dan sisi normal mewarisi akun induk. Hanya akun detail yang menerima jurnal.'" width="560px" @close="showForm = false">
    <div class="form-grid">
      <div v-if="!editing" class="field form-grid-full"><label for="acc-parent">Akun induk (header)</label>
        <select id="acc-parent" v-model="form.parentCode" class="select"><option v-for="h in headers" :key="h.code" :value="h.code">{{ h.code }} · {{ h.name }} ({{ h.category }})</option></select></div>
      <div class="field"><label for="acc-code">Kode</label><input id="acc-code" v-model="form.code" class="input code" placeholder="5-3990" maxlength="6" :disabled="!!editing"></div>
      <div class="field"><label for="acc-type">Tipe</label><select id="acc-type" v-model="form.type" class="select" :disabled="!!editing"><option value="detail">Detail (menerima jurnal)</option><option value="header">Header (pengelompokan)</option></select></div>
      <div class="field form-grid-full"><label for="acc-name">Nama akun</label><input id="acc-name" v-model="form.name" class="input" maxlength="120" placeholder="Beban Langganan Perangkat Lunak"></div>
      <label v-if="!editing" class="form-grid-full" style="display:flex;gap:var(--sp-2);align-items:center;font-size:var(--fs-sm)"><input v-model="form.isContra" type="checkbox"> Akun kontra (sisi normal berlawanan dengan induk, mis. akumulasi penyusutan)</label>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-account" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showForm = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="pending" :title="pending.kind === 'delete' ? `Hapus akun ${pending.a.code}?` : `${pending.a.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'} akun ${pending.a.code}?`"
    :message="pending.kind === 'delete' ? 'Hanya akun yang belum pernah dipakai jurnal dan tidak memiliki akun anak yang dapat dihapus.' : pending.a.status === 'aktif' ? 'Akun nonaktif tidak dapat menerima jurnal baru. Saldo harus nol.' : 'Akun akan kembali dapat menerima jurnal.'"
    :confirm-label="pending.kind === 'delete' ? 'Hapus akun' : pending.a.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'" :danger="pending.kind === 'delete'" :busy="busy" :error="pendingError"
    @close="pending = null" @confirm="confirm" />
</template>
