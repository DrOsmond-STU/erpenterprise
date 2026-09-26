<script setup lang="ts">
import { computed, ref } from 'vue';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { usePaged } from '@/lib/usePaged';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data: branches, reload } = useLoader(() => get('/branches', { scoped: false }));
const { data: cons } = useLoader(() => (session.can('report.consolidated') ? get('/reports/consolidation') : Promise.resolve(null)));
const TYPES = ['Cabang penjualan', 'Gudang distribusi', 'Pabrik & gudang utama', 'Toko ritel'];
const showNew = ref(false);
const editing = ref<any | null>(null);
const blank = () => ({ code: '', name: '', shortName: '', city: '', type: 'Cabang penjualan', managerName: '', phone: '', bankName: 'BCA', targetMonthly: 150000000, address: '' });
const form = ref(blank());
const errors = ref<string[]>([]);
const busy = ref(false);
const kpi = (code: string) => cons.value?.kpis.find((k: any) => k.branch === code);
const pg = usePaged<any>(computed(() => branches.value ?? []), 12);

function openNew() { editing.value = null; errors.value = []; form.value = blank(); showNew.value = true; }
function openEdit(b: any) {
  editing.value = b; errors.value = [];
  form.value = { code: b.code, name: b.name, shortName: b.short ?? '', city: b.city ?? '', type: b.type ?? '', managerName: b.manager ?? '', phone: b.phone ?? '', bankName: '', targetMonthly: b.targetMonthly ?? 0, address: b.address ?? '' };
  showNew.value = true;
}
async function submit() {
  errors.value = []; busy.value = true;
  try {
    if (editing.value) {
      const f = form.value;
      await patch(`/branches/${editing.value.code}`, { name: f.name, shortName: f.shortName || undefined, city: f.city, type: f.type, managerName: f.managerName, phone: f.phone, address: f.address, targetMonthly: Number(f.targetMonthly) || 0, reason: 'Ubah data cabang' });
      toast.push('Cabang diperbarui', `${editing.value.code} · ${f.name}`, 'ok');
    } else {
      const { shortName, phone, ...rest } = form.value;
      const b = await post('/branches', { ...rest, ...(shortName ? { shortName } : {}), ...(phone ? { phone } : {}), targetMonthly: Number(rest.targetMonthly) || 0 }, { scoped: false });
      toast.push('Cabang ditambahkan', `${b.code} · ${b.name} · giro & kas kecil dibuat.`, 'ok');
    }
    showNew.value = false; await session.loadMe(); await reload();
  } catch (e) { errors.value = errorList(e); }
  finally { busy.value = false; }
}
const toggling = ref<any | null>(null);
const toggleError = ref('');
async function confirmToggle(reason: string) {
  const b = toggling.value; const status = b.status === 'aktif' ? 'nonaktif' : 'aktif';
  busy.value = true; toggleError.value = '';
  try { await patch(`/branches/${b.code}`, { status, reason }); toast.push(status === 'nonaktif' ? 'Cabang dinonaktifkan' : 'Cabang diaktifkan', b.name, 'ok'); toggling.value = null; await session.loadMe(); await reload(); }
  catch (e) { toggleError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Manajemen Cabang" sub="Setiap cabang berbuku sendiri dan dikonsolidasikan melalui rekening koran antar kantor. Setiap perubahan dicatat di jejak audit.">
    <RouterLink v-if="session.can('report.consolidated')" class="btn" to="/konsolidasi"><Icon name="layers" /> Laporan konsolidasi</RouterLink>
    <button v-if="session.can('org.branch.manage')" class="btn btn-primary" data-action="new-branch" @click="openNew"><Icon name="plus" /> Tambah cabang</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Cabang aktif" :value="String((branches ?? []).filter((b: any) => b.status === 'aktif').length)" :foot="`${(branches ?? []).filter((b: any) => b.status !== 'aktif').length} nonaktif`" />
    <KpiTile v-if="cons" label="Pendapatan konsolidasi" :value="F.rpCompact(cons.incomeStatement.combined.revenue)" :foot="cons.period.label" />
    <KpiTile v-if="cons" label="Laba bersih konsolidasi" :value="F.rpCompact(cons.incomeStatement.combined.net)" :tone="cons.incomeStatement.combined.net < 0 ? 'neg' : 'pos'" />
    <KpiTile label="Cabang aktif di aplikasi" :value="ctx.branchShort" foot="ubah lewat strip konteks di atas" />
  </div>
  <div class="branch-grid">
    <article v-for="b in pg.pageRows.value" :key="b.code" :data-branch-card="b.code" class="card branch-card" :data-current="ctx.branch === b.code">
      <div style="display:flex;gap:var(--sp-2);align-items:flex-start">
        <span class="wl-icon" :data-tone="b.status === 'aktif' ? 'accent' : undefined"><Icon :name="b.isHeadOffice ? 'building' : 'map-pin'" /></span>
        <div style="flex:1;min-width:0"><div class="cell-strong">{{ b.name }}</div><div class="card-note">{{ b.type }} · {{ b.city }} · {{ b.manager || '—' }}</div></div>
        <Pill :status="b.status" />
      </div>
      <div v-if="kpi(b.code)" class="branch-kpis">
        <div class="branch-kpi"><span class="micro">Pendapatan</span><b class="num">{{ F.rpCompact(kpi(b.code).revenue) }}</b></div>
        <div class="branch-kpi"><span class="micro">Laba bersih</span><b class="num" :class="{ neg: kpi(b.code).net < 0 }">{{ F.rpCompact(kpi(b.code).net) }}</b></div>
        <div class="branch-kpi"><span class="micro">Kas &amp; bank</span><b class="num">{{ F.rpCompact(kpi(b.code).cash) }}</b></div>
        <div class="branch-kpi"><span class="micro">Piutang</span><b class="num">{{ F.rpCompact(kpi(b.code).ar) }}</b></div>
        <div class="branch-kpi"><span class="micro">Hutang</span><b class="num">{{ F.rpCompact(kpi(b.code).ap) }}</b></div>
        <div class="branch-kpi"><span class="micro">Total aset</span><b class="num">{{ F.rpCompact(kpi(b.code).totalAssets) }}</b></div>
      </div>
      <div class="card-note" v-else>Target bulanan {{ F.rpCompact(b.targetMonthly) }}</div>
      <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap">
        <button v-if="b.status === 'aktif' && (session.allBranches || session.branches.some((x) => x.code === b.code))" class="btn btn-sm" :class="{ 'btn-primary': ctx.branch === b.code }" :data-set-branch="b.code" @click="ctx.branch = b.code">{{ ctx.branch === b.code ? '✓ Aktif' : 'Pilih' }}</button>
        <button v-if="session.can('org.branch.manage')" class="btn btn-sm btn-ghost" data-action="edit-branch" @click="openEdit(b)">Ubah</button>
        <button v-if="session.can('org.branch.manage') && !b.isHeadOffice" class="btn btn-sm btn-ghost" data-action="toggle-branch" @click="toggling = b; toggleError = ''">{{ b.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan' }}</button>
      </div>
    </article>
  </div>
  <article class="card" style="margin-top:var(--sp-3)"><Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" :sizes="[6, 12, 24, 48]" label="cabang" /></article>
  <Modal v-if="showNew" :title="editing ? `Ubah cabang ${editing.code}` : 'Cabang baru'" :subtitle="editing ? 'Kode cabang tidak dapat diubah karena menjadi acuan buku besar dan RLS.' : 'Cabang baru langsung mendapat buku besar sendiri, rekening giro, dan kas kecil dengan saldo awal nol.'" @close="showNew = false">
    <div class="form-grid">
      <div class="field"><label for="br-id">Kode (3 huruf)</label><input id="br-id" v-model="form.code" class="input code" maxlength="3" placeholder="BDG" style="text-transform:uppercase" :disabled="!!editing"></div>
      <div class="field"><label for="br-city">Kota</label><input id="br-city" v-model="form.city" class="input" placeholder="Bandung"></div>
      <div class="field form-grid-full"><label for="br-name">Nama cabang</label><input id="br-name" v-model="form.name" class="input" placeholder="Bandung — Cabang"></div>
      <div class="field"><label for="br-type">Tipe</label><select id="br-type" v-model="form.type" class="select"><option v-for="t in TYPES" :key="t">{{ t }}</option><option v-if="form.type && !TYPES.includes(form.type)">{{ form.type }}</option></select></div>
      <div class="field"><label for="br-manager">Kepala cabang</label><input id="br-manager" v-model="form.managerName" class="input"></div>
      <div class="field"><label for="br-target">Target bulanan (Rp)</label><input id="br-target" v-model.number="form.targetMonthly" class="input input-num" type="number" step="1000000"></div>
      <div class="field"><label for="br-short">Nama singkat</label><input id="br-short" v-model="form.shortName" class="input" maxlength="40" placeholder="Bandung"></div>
      <div class="field"><label for="br-phone">Telepon</label><input id="br-phone" v-model="form.phone" class="input" maxlength="40"></div>
      <div v-if="!editing" class="field"><label for="br-bank">Bank rekening utama</label><input id="br-bank" v-model="form.bankName" class="input"></div>
      <div class="field form-grid-full"><label for="br-address">Alamat</label><input id="br-address" v-model="form.address" class="input"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="submit-branch" :disabled="busy" @click="submit"><Icon name="check" /> Simpan cabang</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showNew = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="toggling" :title="`${toggling.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'} ${toggling.name}?`"
    :message="toggling.status === 'aktif' ? 'Cabang nonaktif tidak dapat menerima jurnal baru dan hilang dari pilihan konteks.' : 'Cabang akan kembali dapat dipilih dan menerima jurnal.'"
    :confirm-label="toggling.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'" :danger="toggling.status === 'aktif'" :busy="busy" :error="toggleError"
    @close="toggling = null" @confirm="confirmToggle" />
</template>
