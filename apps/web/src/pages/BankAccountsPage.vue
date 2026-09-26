<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { del, get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const router = useRouter();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const canManage = computed(() => session.can('ledger.account.manage'));
const { data, loading, reload } = useLoader(() => get('/ledger/bank-accounts'));
const { data: bs } = useLoader(() => get('/reports/balance-sheet'));
const idr = computed(() => (data.value?.accounts ?? []).filter((a: any) => a.currency === 'IDR'));
const totalIDR = computed(() => idr.value.reduce((s: number, a: any) => s + a.balance, 0));
const petty = computed(() => idr.value.filter((a: any) => a.bankName === 'Kas'));
const gl = computed(() => bs.value?.assets.find((a: any) => a.code === '1-1100')?.amount ?? 0);

/* Saringan + paginasi */
const q = ref('');
const status = ref<'' | 'aktif' | 'nonaktif'>('');
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return (data.value?.accounts ?? []).filter((a: any) => (!status.value || a.status === status.value)
    && (!s || a.code.toLowerCase().includes(s) || a.name.toLowerCase().includes(s) || a.bankName.toLowerCase().includes(s)));
});
const pg = usePaged<any>(filtered, 25);
watch([q, status], pg.reset);

/* Tambah & ubah */
const branchOptions = computed(() => session.branches.filter((b) => b.status === 'aktif' && (ctx.branch === 'ALL' || b.code === ctx.branch)));
const form = ref({ branch: '', code: '', name: '', bankName: '', accountNoLast4: '' });
const editing = ref<any | null>(null);
const showForm = ref(false);
const errors = ref<string[]>([]);
const busy = ref(false);
function openNew() {
  editing.value = null; errors.value = [];
  const br = branchOptions.value[0]?.code ?? '';
  form.value = { branch: br, code: br ? `BNK-${br}-` : '', name: '', bankName: '', accountNoLast4: '' };
  showForm.value = true;
}
function openEdit(a: any) {
  editing.value = a; errors.value = [];
  const last4 = /(\d{4})$/.exec(a.accountNoMasked ?? '')?.[1] ?? '';
  form.value = { branch: a.branchCode, code: a.code, name: a.name, bankName: a.bankName, accountNoLast4: last4 };
  showForm.value = true;
}
watch(() => form.value.branch, (b, old) => { if (!editing.value && (!form.value.code || form.value.code === `BNK-${old}-`)) form.value.code = `BNK-${b}-`; });
async function save() {
  errors.value = []; busy.value = true;
  try {
    if (editing.value) {
      await patch(`/ledger/bank-accounts/${editing.value.code}`, { name: form.value.name, bankName: form.value.bankName, accountNoLast4: form.value.accountNoLast4, reason: 'Ubah data rekening' });
      toast.push('Rekening diperbarui', `${editing.value.code} · ${form.value.name}`, 'ok');
    } else {
      const b = await post('/ledger/bank-accounts', form.value);
      toast.push('Rekening ditambahkan', `${b.code} · ${b.name} · cabang ${b.branchCode}`, 'ok');
    }
    showForm.value = false; await reload();
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}

const pending = ref<{ kind: 'toggle' | 'delete'; a: any } | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  const p = pending.value!; busy.value = true; pendingError.value = '';
  try {
    if (p.kind === 'delete') { await del(`/ledger/bank-accounts/${p.a.code}`, { reason }); toast.push('Rekening dihapus', `${p.a.code} · ${p.a.name}`, 'ok'); }
    else { const st = p.a.status === 'aktif' ? 'nonaktif' : 'aktif'; await patch(`/ledger/bank-accounts/${p.a.code}`, { status: st, reason }); toast.push(st === 'aktif' ? 'Rekening diaktifkan' : 'Rekening dinonaktifkan', `${p.a.code} · ${p.a.name}`, 'ok'); }
    pending.value = null; await reload();
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Kas & Bank" :sub="`Saldo rekening dihitung dari jurnal kas per akhir periode. Klik rekening untuk melihat mutasinya di kartu buku besar.`">
    <button v-if="canManage" class="btn btn-primary" data-action="new-bank" @click="openNew"><Icon name="plus" /> Rekening baru</button>
  </ReportHead>
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <template v-else-if="data">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Total saldo IDR" :value="F.rpCompact(totalIDR)" :foot="`${idr.length} rekening`" />
      <KpiTile label="Kas kecil" :value="F.rpCompact(petty.reduce((s: number, a: any) => s + a.balance, 0))" :foot="`${petty.length} lokasi`" />
      <KpiTile label="Buku besar 1-1100" :value="F.rpCompact(gl)" :foot="Math.abs(gl - totalIDR) < 1 ? 'Cocok dengan sub-buku bank' : `Selisih ${F.rpCompact(gl - totalIDR)}`" :tone="Math.abs(gl - totalIDR) < 1 ? '' : 'neg'" />
      <KpiTile label="Per tanggal" :value="F.date(data.period.to)" :foot="ctx.periodLabel" />
    </div>
    <article class="card">
      <div class="table-filter">
        <input v-model="q" class="input" type="search" placeholder="Cari kode, nama, atau bank…" aria-label="Cari rekening" data-filter="bank">
        <select v-model="status" class="select" style="width:auto" aria-label="Saring status"><option value="">Semua status</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option></select>
      </div>
      <div class="table-scroll"><table class="table" data-table="banks">
        <thead><tr><th>Kode</th><th>Nama rekening</th><th>Cabang</th><th>Mata uang</th><th class="ta-r">Saldo</th><th>Status</th><th v-if="canManage" class="ta-r">Aksi</th></tr></thead>
        <tbody>
          <tr v-for="a in pg.pageRows.value" :key="a.code" :data-bank="a.code" @click="router.push({ path: '/buku-besar', query: { akun: '1-1100', rekening: a.code } })">
            <td class="code">{{ a.code }}</td><td><span class="cell-strong">{{ a.name }}</span><span class="cell-sub">{{ a.bankName }} · {{ a.accountNoMasked ?? '—' }}</span></td><td><BranchTag :code="a.branchCode" /></td><td>{{ a.currency }}</td>
            <td class="ta-r num">{{ a.currency === 'IDR' ? F.rpCompact(a.balance) : `${a.currency} ${F.int(a.balance)}` }}</td><td><Pill :status="a.status" /></td>
            <td v-if="canManage" @click.stop>
              <div class="row-actions">
                <button class="btn btn-sm btn-ghost" data-action="edit-bank" @click="openEdit(a)">Ubah</button>
                <button class="btn btn-sm btn-ghost" data-action="toggle-bank" @click="pending = { kind: 'toggle', a }; pendingError = ''">{{ a.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan' }}</button>
                <button class="btn btn-sm btn-ghost neg" data-action="delete-bank" @click="pending = { kind: 'delete', a }; pendingError = ''">Hapus</button>
              </div>
            </td>
          </tr>
          <tr v-if="!pg.total.value" class="is-static"><td :colspan="canManage ? 7 : 6" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada rekening yang cocok.</td></tr>
        </tbody>
      </table></div>
      <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="rekening" />
    </article>
  </template>

  <Modal v-if="showForm" :title="editing ? `Ubah rekening ${editing.code}` : 'Rekening kas/bank baru'" :subtitle="editing ? 'Cabang dan kode tidak dapat diubah karena menjadi acuan baris jurnal.' : 'Saldo awal dicatat lewat jurnal agar buku besar dan sub-buku bank tetap cocok.'" width="560px" @close="showForm = false">
    <div class="form-grid">
      <div class="field"><label for="bank-branch">Cabang</label><select id="bank-branch" v-model="form.branch" class="select" :disabled="!!editing"><option v-for="b in branchOptions" :key="b.code" :value="b.code">{{ b.name }}</option><option v-if="editing" :value="form.branch">{{ form.branch }}</option></select></div>
      <div class="field"><label for="bank-code">Kode rekening</label><input id="bank-code" v-model="form.code" class="input code" maxlength="30" style="text-transform:uppercase" :disabled="!!editing"></div>
      <div class="field form-grid-full"><label for="bank-name">Nama rekening</label><input id="bank-name" v-model="form.name" class="input" maxlength="120" placeholder="Mandiri — Rekening Operasional Surabaya"></div>
      <div class="field"><label for="bank-bank">Bank</label><input id="bank-bank" v-model="form.bankName" class="input" maxlength="60" placeholder="Mandiri / Kas"></div>
      <div class="field"><label for="bank-last4">4 digit terakhir no. rekening</label><input id="bank-last4" v-model="form.accountNoLast4" class="input code" maxlength="4" inputmode="numeric" placeholder="1234"><span class="field-hint">Nomor lengkap tidak disimpan di sini (K-41).</span></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-bank" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showForm = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="pending" :title="pending.kind === 'delete' ? `Hapus rekening ${pending.a.code}?` : `${pending.a.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'} rekening ${pending.a.code}?`"
    :message="pending.kind === 'delete' ? 'Hanya rekening yang belum pernah dipakai jurnal dan bukan rekening utama/kas kecil cabang yang dapat dihapus.' : pending.a.status === 'aktif' ? 'Rekening nonaktif tidak dapat dipakai jurnal baru. Saldonya harus nol.' : 'Rekening akan kembali dapat dipakai jurnal.'"
    :confirm-label="pending.kind === 'delete' ? 'Hapus rekening' : pending.a.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'" :danger="pending.kind === 'delete'" :busy="busy" :error="pendingError"
    @close="pending = null" @confirm="confirm" />
</template>
