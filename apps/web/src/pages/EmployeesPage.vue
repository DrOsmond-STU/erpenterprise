<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PTKP } from '@erp/domain';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Drawer from '@/components/Drawer.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/hr/employees'));
const all = computed(() => data.value ?? []);
const q = ref('');
const showOut = ref(false);
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((e) => (showOut.value || e.status === 'aktif') && (!s || [e.code, e.name, e.dept, e.title ?? ''].some((x) => String(x).toLowerCase().includes(s))));
});
const pg = usePaged<any>(filtered, 25);
watch([q, showOut], pg.reset);
const kpi = computed(() => {
  const act = all.value.filter((e) => e.status === 'aktif');
  return { count: act.length, payroll: act.reduce((t, e) => t + (e.basicSalary ?? 0) + (e.fixedAllowance ?? 0), 0), contract: act.filter((e) => e.employment !== 'tetap').length, depts: new Set(act.map((e) => e.dept)).size };
});
const canManage = computed(() => session.can('hr.manage'));
const canReveal = computed(() => session.can('hr.restricted.read'));
const DEPTS = ['Produksi', 'Gudang', 'Penjualan', 'Pengadaan', 'Keuangan', 'Operasional', 'SDM', 'Teknologi Informasi'];

/* Laci */
const openId = ref<string | null>(null);
const e = ref<any>(null);
const secret = ref<any>(null);
watch(openId, async (id) => { e.value = null; secret.value = null; if (id) { try { e.value = await get(`/hr/employees/${id}`); } catch (err) { toast.error(err, 'Karyawan tidak dapat dimuat'); openId.value = null; } } });
async function reveal() { try { secret.value = await post(`/hr/employees/${openId.value}/reveal`); toast.push('Data rahasia dibuka', 'Pembukaan dicatat di jejak audit.', 'warn'); } catch (err) { toast.error(err, 'Tidak dapat membuka data'); } }

/* Form */
const show = ref(false);
const editing = ref<any>(null);
const blank = () => ({ name: '', branch: ctx.branch === 'ALL' ? session.branches[0]?.code ?? '' : ctx.branch, dept: 'Produksi', title: '', joinDate: '', employment: 'tetap', ptkp: 'TK/0', basicSalary: 0, fixedAllowance: 0, email: '', nik: '', npwp: '', bankName: '', bankAccount: '', status: 'aktif' });
const form = ref<any>(blank());
const errors = ref<string[]>([]);
const busy = ref(false);
const branchOptions = computed(() => session.branches.filter((b) => session.user?.branches === '*' || (session.user?.branches ?? []).includes(b.code)));
function openForm(x?: any) {
  errors.value = []; editing.value = x ?? null;
  form.value = x ? { ...blank(), ...x, title: x.title ?? '', joinDate: x.joinDate ?? '', email: x.email ?? '', nik: '', npwp: '', bankName: x.bankName ?? '', bankAccount: '' } : blank();
  show.value = true;
}
async function save() {
  errors.value = []; busy.value = true;
  try {
    const f = form.value;
    const body: any = { name: f.name, branch: f.branch, dept: f.dept, title: f.title || undefined, joinDate: f.joinDate || undefined, employment: f.employment, ptkp: f.ptkp,
      basicSalary: Math.round(Number(f.basicSalary)), fixedAllowance: Math.round(Number(f.fixedAllowance || 0)), email: f.email || undefined, bankName: f.bankName || undefined };
    for (const k of ['nik', 'npwp', 'bankAccount']) if (f[k]) body[k] = f[k];
    if (editing.value) body.status = f.status;
    const r = editing.value ? await patch(`/hr/employees/${editing.value.id}`, body) : await post('/hr/employees', body);
    toast.push(editing.value ? 'Karyawan diperbarui' : 'Karyawan ditambahkan', `${r.code} · ${r.name}`, 'ok'); show.value = false; await reload();
    if (openId.value) { const id = openId.value; openId.value = null; openId.value = id; }
  } catch (err) { errors.value = errorList(err); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Karyawan" sub="Data induk karyawan per cabang. NIK, NPWP, dan nomor rekening disimpan terenkripsi (AES-256-GCM) dan ditampilkan tersamar; membukanya memerlukan izin khusus dan dicatat di jejak audit.">
    <button v-if="canManage" class="btn btn-primary" data-action="new-employee" @click="openForm()"><Icon name="plus" /> Karyawan baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Karyawan aktif" :value="String(kpi.count)" :foot="ctx.branchShort" />
    <KpiTile label="Gaji pokok + tunjangan" :value="kpi.payroll ? F.rpCompact(kpi.payroll) : '—'" foot="Per bulan" />
    <KpiTile label="Kontrak & magang" :value="String(kpi.contract)" foot="Bukan karyawan tetap" />
    <KpiTile label="Departemen" :value="String(kpi.depts)" foot="Aktif" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari kode, nama, departemen…" aria-label="Cari karyawan"></div>
      <label class="chip" style="cursor:pointer"><input v-model="showOut" type="checkbox" style="margin-right:6px">Tampilkan yang keluar</label>
    </div>
    <div class="table-scroll"><table class="table" data-table="employees">
      <thead><tr><th>Karyawan</th><th>Departemen</th><th>Status kerja</th><th>NIK</th><th>Rekening</th><th class="ta-r">Gaji pokok</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="7"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="x in pg.pageRows.value" :key="x.id" data-row :data-employee="x.code" @click="openId = x.id">
          <td><span class="cell-strong">{{ x.name }}</span><span class="cell-sub"><span class="code">{{ x.code }}</span> · <BranchTag :code="x.branch" /></span></td>
          <td>{{ x.dept }}<span class="cell-sub">{{ x.title }}</span></td><td>{{ x.employment }} · {{ x.ptkp }}</td>
          <td class="code">{{ x.nik ?? '—' }}</td><td class="code">{{ x.bankAccount ? `${x.bankName ?? ''} ${x.bankAccount}` : '—' }}</td>
          <td class="ta-r num">{{ x.basicSalary === null ? '•••' : F.rp(x.basicSalary) }}</td><td><Pill :status="x.status" /></td>
        </tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="karyawan" />
  </article>

  <Drawer v-if="openId" :title="e ? e.name : 'Memuat…'" :subtitle="e ? `${e.dept}${e.title ? ' · ' + e.title : ''}` : ''" @close="openId = null">
    <template #eyebrow><template v-if="e"><span class="code">{{ e.code }}</span><Pill :status="e.status" /><BranchTag :code="e.branch" /></template></template>
    <template v-if="e">
      <div class="section"><dl class="deflist">
        <dt>Mulai bekerja</dt><dd>{{ e.joinDate ? F.date(e.joinDate) : '—' }} · {{ e.employment }}</dd>
        <dt>PTKP</dt><dd>{{ e.ptkp }}</dd>
        <dt v-if="e.basicSalary !== null">Gaji pokok</dt><dd v-if="e.basicSalary !== null" class="num">{{ F.rp(e.basicSalary) }}</dd>
        <dt v-if="e.fixedAllowance !== null">Tunjangan tetap</dt><dd v-if="e.fixedAllowance !== null" class="num">{{ F.rp(e.fixedAllowance) }}</dd>
        <dt>NIK</dt><dd class="code" data-nik>{{ secret ? secret.nik ?? '—' : e.nik ?? '—' }}</dd>
        <dt>NPWP</dt><dd class="code">{{ secret ? secret.npwp ?? '—' : e.npwp ?? '—' }}</dd>
        <dt>Rekening</dt><dd class="code">{{ e.bankName ?? '' }} {{ secret ? secret.bankAccount ?? '—' : e.bankAccount ?? '—' }}</dd>
        <dt v-if="e.email">Email</dt><dd v-if="e.email">{{ e.email }}</dd>
      </dl>
        <button v-if="canReveal && !secret && (e.nik || e.npwp || e.bankAccount)" class="btn btn-sm" style="margin-top:var(--sp-2)" data-action="reveal" @click="reveal"><Icon name="eye" /> Buka data rahasia</button>
      </div>
      <div v-if="e.payslips.length" class="section"><span class="section-title">Slip gaji</span>
        <div class="table-scroll"><table class="table"><tbody><tr v-for="p in e.payslips" :key="p.docNo" class="is-static"><td>{{ p.period }}</td><td class="code">{{ p.docNo }}</td><td class="ta-r num">{{ F.rp(p.net) }}</td><td><Pill :status="p.status" /></td></tr></tbody></table></div></div>
    </template>
    <template #foot><button v-if="canManage && e" class="btn" data-action="edit-employee" @click="openForm(e)"><Icon name="edit" /> Ubah</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="openId = null">Tutup</button></template>
  </Drawer>

  <Modal v-if="show" :title="editing ? `Ubah ${editing.code}` : 'Karyawan baru'" subtitle="Kosongkan NIK/NPWP/rekening saat mengubah bila tidak ingin menggantinya." width="680px" @close="show = false">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="em-name">Nama</label><input id="em-name" v-model="form.name" class="input" maxlength="120"></div>
      <div class="field"><label for="em-branch">Cabang</label><select id="em-branch" v-model="form.branch" class="select"><option v-for="b in branchOptions" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name }}</option></select></div>
      <div class="field"><label for="em-dept">Departemen</label><input id="em-dept" v-model="form.dept" class="input" list="em-depts" maxlength="60"><datalist id="em-depts"><option v-for="d in DEPTS" :key="d" :value="d" /></datalist></div>
      <div class="field"><label for="em-title">Jabatan</label><input id="em-title" v-model="form.title" class="input" maxlength="80"></div>
      <div class="field"><label for="em-join">Mulai bekerja</label><input id="em-join" v-model="form.joinDate" class="input" type="date"></div>
      <div class="field"><label for="em-emp">Status kerja</label><select id="em-emp" v-model="form.employment" class="select"><option value="tetap">Tetap</option><option value="kontrak">Kontrak</option><option value="magang">Magang</option></select></div>
      <div class="field"><label for="em-ptkp">PTKP</label><select id="em-ptkp" v-model="form.ptkp" class="select"><option v-for="k in Object.keys(PTKP)" :key="k" :value="k">{{ k }}</option></select></div>
      <div class="field"><label for="em-basic">Gaji pokok (Rp)</label><input id="em-basic" v-model.number="form.basicSalary" class="input num" type="number" min="0" step="100000" style="text-align:right"></div>
      <div class="field"><label for="em-allow">Tunjangan tetap (Rp)</label><input id="em-allow" v-model.number="form.fixedAllowance" class="input num" type="number" min="0" step="100000" style="text-align:right"></div>
      <div class="field"><label for="em-nik">NIK (16 digit)</label><input id="em-nik" v-model="form.nik" class="input" maxlength="20" autocomplete="off" :placeholder="editing?.nik ?? ''"></div>
      <div class="field"><label for="em-npwp">NPWP</label><input id="em-npwp" v-model="form.npwp" class="input" maxlength="24" autocomplete="off" :placeholder="editing?.npwp ?? ''"></div>
      <div class="field"><label for="em-bank">Bank</label><input id="em-bank" v-model="form.bankName" class="input" maxlength="60"></div>
      <div class="field"><label for="em-acct">Nomor rekening</label><input id="em-acct" v-model="form.bankAccount" class="input" maxlength="24" autocomplete="off" :placeholder="editing?.bankAccount ?? ''"></div>
      <div v-if="editing" class="field"><label for="em-status">Status</label><select id="em-status" v-model="form.status" class="select"><option value="aktif">Aktif</option><option value="keluar">Keluar</option></select></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="x in errors" :key="x">• {{ x }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-employee" :disabled="busy || form.name.trim().length < 3 || !form.branch" @click="save"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="show = false">Batal</button>
    </template>
  </Modal>
</template>
