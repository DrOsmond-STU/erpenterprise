<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ACCOUNT_LINK_DEFS, levelOfCode, parentOfCode, typeProblems } from '@erp/domain';
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

const router = useRouter();
const session = useSession();
const toast = useToast();
const canManage = computed(() => session.can('ledger.account.manage'));
const { data, loading, reload } = useLoader(() => get('/ledger/accounts'));
const cats = ['Aset', 'Liabilitas', 'Ekuitas', 'Pendapatan', 'Beban'];
const totals = computed(() => cats.map((c) => { const items = (data.value?.accounts ?? []).filter((a: any) => a.category === c && a.type === 'detail'); return { c, total: items.reduce((s: number, a: any) => s + a.balance, 0), count: items.length }; }));
/* Akun yang ditautkan ke fitur lain tidak dapat dinonaktifkan/dihapus (pemetaan akun, rekening kas/bank). */
const { data: settings } = useLoader(() => get('/settings', { scoped: false }));
const { data: banks } = useLoader(() => get('/ledger/bank-accounts'));
const linkOf = computed(() => {
  const m = new Map<string, string>();
  const links = settings.value?.accountLinks ?? {};
  for (const d of ACCOUNT_LINK_DEFS) if (links[d.key]) m.set(links[d.key], d.label);
  return m;
});
const bankOf = computed(() => new Map<string, any>((banks.value?.accounts ?? []).map((b: any) => [b.glAccountCode, b])));
const parents = computed(() => new Set((data.value?.accounts ?? []).map((a: any) => a.parentCode).filter(Boolean)));
/* Header yang masih punya anak tidak dapat dinonaktifkan/dihapus; tombolnya disembunyikan. */
const isSystem = (a: any) => linkOf.value.has(a.code) || a.isComputed || a.isIntercompany || a.isCash || a.level === 1 || parents.value.has(a.code);
const LEVEL_NOTE = (l: number) => (l <= 3 ? 'Neraca & laba rugi' : 'Transaksi, neraca saldo, kartu buku besar');

/* Saringan + paginasi */
const q = ref('');
const status = ref<'' | 'aktif' | 'nonaktif'>('');
const lvl = ref<'' | 'header' | 'detail'>('');
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return (data.value?.accounts ?? []).filter((a: any) => (!status.value || a.status === status.value) && (!lvl.value || a.type === lvl.value)
    && (!s || a.code.includes(s) || a.name.toLowerCase().includes(s)));
});
const pg = usePaged<any>(filtered, 50);
watch([q, status, lvl], pg.reset);

/* Tambah & ubah — induk & level diturunkan dari pola kode */
const byCode = computed(() => new Map((data.value?.accounts ?? []).map((a: any) => [a.code, a])));
const form = ref({ parentCode: '', code: '', name: '', type: 'detail' as 'detail' | 'header', isContra: false });
const codeInfo = computed(() => {
  const code = form.value.code.trim();
  const level = levelOfCode(code);
  if (!code) return { level: null, parent: null, note: 'Pola: 9-9000 (level 2), 9-9900 (level 3), 9-9999 (level 4), 9-9999.99 (level 5).', bad: false };
  if (!level || level === 1) return { level: null, parent: null, note: 'Kode tidak sah untuk akun baru.', bad: true };
  const pc = parentOfCode(code)!;
  const parent: any = byCode.value.get(pc);
  const typeErr = typeProblems(level, form.value.type);
  const note = !parent ? `Induk ${pc} belum ada — buat header level ${level - 1} dahulu.`
    : parent.type !== 'header' ? `Induk ${pc} adalah akun detail.`
    : parent.isCash ? `Akun di bawah ${pc} ${parent.name} dibuat otomatis lewat menu Kas & Bank.`
    : typeErr ?? `Level ${level} · induk ${pc} ${parent.name} (${parent.category}) · ${LEVEL_NOTE(level)}`;
  return { level, parent, note, bad: !parent || parent.type !== 'header' || parent.isCash || Boolean(typeErr) };
});
watch(() => codeInfo.value.level, (l) => { if (!editing.value && l) { if (l <= 3) form.value.type = 'header'; else if (l === 5) form.value.type = 'detail'; } });
const editing = ref<any | null>(null);
const showForm = ref(false);
const errors = ref<string[]>([]);
const busy = ref(false);
function openNew() {
  editing.value = null; errors.value = [];
  form.value = { parentCode: '', code: '', name: '', type: 'detail', isContra: false };
  showForm.value = true;
}
function openEdit(a: any) {
  editing.value = a; errors.value = [];
  form.value = { parentCode: a.parentCode ?? '', code: a.code, name: a.name, type: a.type, isContra: a.isContra };
  showForm.value = true;
}
async function save() {
  errors.value = []; busy.value = true;
  try {
    if (editing.value) {
      await patch(`/ledger/accounts/${editing.value.code}`, { name: form.value.name, reason: 'Ubah nama akun' });
      toast.push('Akun diperbarui', `${editing.value.code} · ${form.value.name}`, 'ok');
    } else {
      const a = await post('/ledger/accounts', { code: form.value.code.trim(), name: form.value.name, type: form.value.type, isContra: form.value.isContra });
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
  <ReportHead title="Bagan Akun (Chart of Accounts)" sub="Header level 1–3 menyusun neraca & laba rugi; akun detail level 4–5 menerima transaksi dan tampil di neraca saldo & kartu buku besar. Klik akun detail untuk membuka kartu buku besarnya.">
    <RouterLink class="btn" to="/neraca-saldo"><Icon name="scale" /> Neraca saldo</RouterLink>
    <button v-if="canManage" class="btn btn-primary" data-action="new-account" @click="openNew"><Icon name="plus" /> Akun baru</button>
  </ReportHead>
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <template v-else-if="data">
    <div class="coa-summary">
      <div v-for="t in totals" :key="t.c" class="card coa-summary-card"><span class="coa-summary-label">{{ t.c }}</span><span class="coa-summary-num" :class="{ neg: t.total < 0 }">{{ F.rpCompact(Math.abs(t.total)) }}</span><span class="muted" style="font-size:var(--fs-cap)">{{ t.count }} akun</span></div>
    </div>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h3 class="card-title"><Icon name="tree" /> Daftar Akun</h3>
        <span class="card-note">Level 1 <span class="code">1-0000</span> · Level 2 <span class="code">1-1000</span> · Level 3 <span class="code">1-1100</span> (header) → Level 4 <span class="code">1-1101</span> · Level 5 <span class="code">1-1101.01</span> (detail)</span></div></div>
      <div class="table-filter">
        <input v-model="q" class="input" type="search" placeholder="Cari kode atau nama akun…" aria-label="Cari akun" data-filter="account">
        <select v-model="lvl" class="select" style="width:auto" aria-label="Saring tipe" data-filter="type"><option value="">Header & detail</option><option value="header">Header (level 1–3)</option><option value="detail">Detail (level 4–5)</option></select>
        <select v-model="status" class="select" style="width:auto" aria-label="Saring status"><option value="">Semua status</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option></select>
      </div>
      <div class="table-scroll"><table class="table" data-table="accounts">
        <thead><tr><th>Kode</th><th>Nama Akun</th><th>Level</th><th>Tipe</th><th class="ta-r">Saldo</th><th>Status</th><th v-if="canManage" class="ta-r">Aksi</th></tr></thead>
        <tbody>
          <tr v-for="a in pg.pageRows.value" :key="a.code" :data-account="a.code" :class="{ 'coa-header-row': a.type === 'header', 'is-static': a.type === 'header' || a.isComputed }" @click="openCard(a)">
            <td class="code" :style="`padding-left:${(a.level - 1) * 18 + 12}px`">{{ a.code }}</td>
            <td :class="{ 'cell-strong': a.type === 'header' }" :style="`padding-left:${(a.level - 1) * 18 + 12}px`">{{ a.name }}
              <span v-if="bankOf.get(a.code)" class="cell-sub">Rekening {{ bankOf.get(a.code).code }} · cabang {{ bankOf.get(a.code).branchCode }}</span>
              <span v-else-if="linkOf.get(a.code)" class="cell-sub">Pemetaan: {{ linkOf.get(a.code) }}</span>
              <span v-if="a.isIntercompany" class="micro"> antar kantor</span><span v-if="a.isComputed" class="micro"> dihitung</span></td>
            <td class="num">{{ a.level }}</td>
            <td><Pill :label="a.type === 'header' ? 'Header' : 'Detail'" :tone="a.type === 'header' ? 'info' : 'ok'" /></td><td class="ta-r num" :class="{ neg: a.balance < 0 }">{{ F.rpCompact(a.balance) }}</td><td><Pill :status="a.status" /></td>
            <td v-if="canManage" @click.stop>
              <div class="row-actions">
                <button v-if="!(a.isCash && a.type === 'detail')" class="btn btn-sm btn-ghost" data-action="edit-account" @click="openEdit(a)">Ubah</button>
                <RouterLink v-else class="btn btn-sm btn-ghost" to="/kas-bank">Kas & Bank</RouterLink>
                <template v-if="!isSystem(a)">
                  <button class="btn btn-sm btn-ghost" data-action="toggle-account" @click="pending = { kind: 'toggle', a }; pendingError = ''">{{ a.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan' }}</button>
                  <button class="btn btn-sm btn-ghost neg" data-action="delete-account" @click="pending = { kind: 'delete', a }; pendingError = ''">Hapus</button>
                </template>
              </div>
            </td>
          </tr>
          <tr v-if="!pg.total.value" class="is-static"><td :colspan="canManage ? 7 : 6" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada akun yang cocok.</td></tr>
        </tbody>
      </table></div>
      <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="akun" />
    </article>
  </template>

  <Modal v-if="showForm" :title="editing ? `Ubah akun ${editing.code}` : 'Akun baru'" :subtitle="editing ? 'Kode, induk, dan kategori tidak dapat diubah agar riwayat buku besar tetap utuh.' : 'Induk ditentukan oleh pola kode; kategori & sisi normal mewarisi induk. Level 1–3 selalu header, level 5 selalu detail.'" width="560px" @close="showForm = false">
    <div class="form-grid">
      <div class="field"><label for="acc-code">Kode</label><input id="acc-code" v-model="form.code" class="input code" placeholder="5-3701" maxlength="9" :disabled="!!editing"></div>
      <div class="field"><label for="acc-type">Tipe</label><select id="acc-type" v-model="form.type" class="select" :disabled="!!editing || (codeInfo.level !== null && codeInfo.level !== 4)"><option value="detail">Detail (menerima transaksi)</option><option value="header">Header (pengelompokan)</option></select></div>
      <div v-if="!editing" class="field form-grid-full"><span class="field-hint" :class="{ neg: codeInfo.bad }" data-code-info>{{ codeInfo.note }}</span></div>
      <div class="field form-grid-full"><label for="acc-name">Nama akun</label><input id="acc-name" v-model="form.name" class="input" maxlength="120" placeholder="Beban Langganan Perangkat Lunak"></div>
      <label v-if="!editing" class="form-grid-full" style="display:flex;gap:var(--sp-2);align-items:center;font-size:var(--fs-sm)"><input v-model="form.isContra" type="checkbox"> Akun kontra (sisi normal berlawanan dengan induk, mis. akumulasi penyusutan)</label>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-account" :disabled="busy || (!editing && codeInfo.bad)" @click="save"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showForm = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="pending" :title="pending.kind === 'delete' ? `Hapus akun ${pending.a.code}?` : `${pending.a.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'} akun ${pending.a.code}?`"
    :message="pending.kind === 'delete' ? 'Hanya akun yang belum pernah dipakai jurnal dan tidak memiliki akun anak yang dapat dihapus.' : pending.a.status === 'aktif' ? 'Akun nonaktif tidak dapat menerima jurnal baru. Saldo harus nol.' : 'Akun akan kembali dapat menerima jurnal.'"
    :confirm-label="pending.kind === 'delete' ? 'Hapus akun' : pending.a.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'" :danger="pending.kind === 'delete'" :busy="busy" :error="pendingError"
    @close="pending = null" @confirm="confirm" />
</template>
