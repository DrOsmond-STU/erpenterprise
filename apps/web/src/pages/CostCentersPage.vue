<script setup lang="ts">
import { computed, ref } from 'vue';
import { del, get, patch, post } from '@/lib/api';
import { COST_CENTER_TIMELINE, costCenterOptions, KIND_LABEL } from '@/lib/cost-centers';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pill from '@/components/Pill.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, reload } = useLoader<any>(() => get('/cost-centers'));
const canManage = computed(() => session.can('costcenter.manage'));
const q = ref('');
const showInactive = ref(false);
const rows = computed(() => {
  const all = data.value?.data ?? [];
  const term = q.value.trim().toLowerCase();
  return all.filter((c: any) => (showInactive.value || c.status === 'aktif') && (!term || `${c.code} ${c.name} ${c.managerName ?? ''} ${c.parentCode ?? ''}`.toLowerCase().includes(term)));
});
const active = computed(() => (data.value?.data ?? []).filter((c: any) => c.status === 'aktif'));
const sum = (k: string) => (data.value?.data ?? []).reduce((t: number, c: any) => t + (c[k] ?? 0), 0);
const parents = computed(() => (data.value?.data ?? []).filter((c: any) => c.status === 'aktif' && (!editing.value || c.id !== editing.value.id)));

/* Tambah / ubah */
const show = ref(false);
const editing = ref<any | null>(null);
const blank = () => ({ code: '', name: '', kind: 'biaya', parentId: '', managerName: '', description: '' });
const form = ref(blank());
const errors = ref<string[]>([]);
const busy = ref(false);
function openNew() { editing.value = null; errors.value = []; form.value = blank(); show.value = true; }
async function openEdit(c: any) {
  errors.value = [];
  try { editing.value = await get(`/cost-centers/${c.id}`); } catch (e) { toast.error(e, 'Pusat biaya tidak dapat dimuat'); return; }
  const d = editing.value;
  form.value = { code: d.code, name: d.name, kind: d.kind, parentId: d.parentId ?? '', managerName: d.managerName ?? '', description: d.description ?? '' };
  show.value = true;
}
async function save() {
  errors.value = []; busy.value = true;
  const f = form.value;
  const body = { name: f.name, kind: f.kind, parentId: f.parentId || null, managerName: f.managerName || null, description: f.description || null };
  try {
    const r = editing.value ? await patch(`/cost-centers/${editing.value.id}`, body) : await post('/cost-centers', { ...body, code: f.code });
    toast.push(editing.value ? 'Pusat biaya diperbarui' : 'Pusat biaya ditambahkan', `${r.code} · ${r.name}`, 'ok');
    show.value = false; costCenterOptions(true); await reload();
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}

/* Nonaktif/aktif & hapus (beralasan) */
const pending = ref<{ kind: 'toggle' | 'delete'; cc: any } | null>(null);
const pendingError = ref('');
async function confirm(reason: string) {
  const p = pending.value!; busy.value = true; pendingError.value = '';
  try {
    if (p.kind === 'delete') { await del(`/cost-centers/${p.cc.id}`, { reason }); toast.push('Pusat biaya dihapus', p.cc.code, 'ok'); show.value = false; }
    else { const status = p.cc.status === 'aktif' ? 'nonaktif' : 'aktif'; await patch(`/cost-centers/${p.cc.id}`, { status, reason }); toast.push(status === 'aktif' ? 'Pusat biaya diaktifkan' : 'Pusat biaya dinonaktifkan', p.cc.code, 'ok'); }
    pending.value = null; costCenterOptions(true); await reload();
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Pusat Biaya" sub="Dimensi analitis untuk akun pendapatan & beban: tandai jurnal memorial, faktur, PR/PO/tagihan pemasok, dan karyawan (penggajian) dengan pusat biaya, lalu baca laba rugi dan anggarannya per pusat biaya. Berlaku untuk seluruh cabang.">
    <RouterLink v-if="session.can('ledger.report.read')" class="btn" to="/laba-rugi-pusat-biaya"><Icon name="trending" /> Laba rugi per pusat biaya</RouterLink>
    <RouterLink v-if="session.can('budget.read')" class="btn" to="/anggaran-pusat-biaya"><Icon name="wallet" /> Laporan anggaran</RouterLink>
    <button v-if="canManage" class="btn btn-primary" data-action="new-cost-center" @click="openNew"><Icon name="plus" /> Pusat biaya baru</button>
  </ReportHead>
  <div v-if="data" class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Pusat biaya aktif" :value="String(active.length)" :foot="`${active.filter((c: any) => c.kind === 'laba').length} pusat laba · ${(data.data.length - active.length)} nonaktif`" />
    <KpiTile label="Pendapatan bertanda" :value="F.rpCompact(sum('ytdRevenue'))" :foot="`tahun ${data.year} · ${ctx.branchShort}`" />
    <KpiTile label="Beban bertanda" :value="F.rpCompact(sum('ytdExpense'))" :foot="`tahun ${data.year} · ${ctx.branchShort}`" />
    <KpiTile label="Karyawan berpusat biaya" :value="String(sum('employees'))" foot="beban gaji dipecah otomatis" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari kode, nama, manajer…" aria-label="Cari pusat biaya" data-field="search"></div>
      <label style="display:flex;gap:6px;align-items:center" class="muted"><input v-model="showInactive" type="checkbox"> tampilkan nonaktif</label>
      <div class="toolbar-spacer"></div>
      <span class="muted">{{ rows.length }} pusat biaya</span>
    </div>
    <div class="table-scroll"><table class="table" data-table="cost-centers">
      <thead><tr><th>Pusat biaya</th><th>Jenis</th><th>Manajer</th><th class="ta-r">Karyawan</th><th class="ta-r">Pendapatan {{ data?.year }}</th><th class="ta-r">Beban {{ data?.year }}</th><th class="ta-r">Laba (rugi)</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="c in rows" :key="c.id" data-row :data-cost-center="c.code" @click="openEdit(c)">
          <td><span class="cell-strong" :style="c.parentId ? 'padding-left:18px' : ''"><span class="code">{{ c.code }}</span> {{ c.name }}</span><span class="cell-sub" :style="c.parentId ? 'padding-left:18px' : ''">{{ c.parentCode ? `di bawah ${c.parentCode} · ` : '' }}{{ c.description || '—' }}</span></td>
          <td><Pill :label="c.kindLabel" :tone="c.kind === 'laba' ? 'info' : undefined" /></td>
          <td>{{ c.managerName || '—' }}</td>
          <td class="ta-r num">{{ c.employees || '—' }}</td>
          <td class="ta-r num">{{ c.ytdRevenue ? F.rp(c.ytdRevenue) : '—' }}</td>
          <td class="ta-r num">{{ c.ytdExpense ? F.rp(c.ytdExpense) : '—' }}</td>
          <td class="ta-r num" :class="c.ytdNet < 0 ? 'neg' : c.ytdNet > 0 ? 'pos' : ''">{{ c.ytdLines ? F.rp(c.ytdNet) : '—' }}</td>
          <td><Pill :status="c.status" /></td>
        </tr>
        <tr v-if="data && !rows.length" class="is-static"><td colspan="8"><div class="empty"><div class="empty-card"><span class="empty-title">Belum ada pusat biaya</span><span class="empty-note">Buat pusat biaya per departemen/fungsi (mis. Produksi, Penjualan, Administrasi) untuk laporan laba rugi dan anggaran per pusat biaya.</span></div></div></td></tr>
      </tbody>
    </table></div>
  </article>

  <Modal v-if="show" :title="editing ? `${editing.code} · ${editing.name}` : 'Pusat biaya baru'" :subtitle="editing ? 'Kode tidak dapat diubah karena menjadi acuan baris jurnal dan anggaran.' : 'Pusat biaya berlaku di seluruh cabang. Pusat laba dipakai untuk unit yang juga memperoleh pendapatan.'" width="620px" @close="show = false">
    <div class="form-grid">
      <div class="field"><label for="cc-code">Kode</label><input id="cc-code" v-model="form.code" class="input code" maxlength="20" placeholder="PB-PRD" style="text-transform:uppercase" :disabled="!!editing || !canManage" data-field="cc-code"></div>
      <div class="field"><label for="cc-kind">Jenis</label><select id="cc-kind" v-model="form.kind" class="select" :disabled="!canManage"><option value="biaya">{{ KIND_LABEL.biaya }}</option><option value="laba">{{ KIND_LABEL.laba }}</option></select></div>
      <div class="field form-grid-full"><label for="cc-name">Nama</label><input id="cc-name" v-model="form.name" class="input" maxlength="120" placeholder="Produksi" :disabled="!canManage" data-field="cc-name"></div>
      <div class="field"><label for="cc-parent">Induk (opsional)</label><select id="cc-parent" v-model="form.parentId" class="select" :disabled="!canManage" data-field="cc-parent"><option value="">— tanpa induk —</option><option v-for="p in parents" :key="p.id" :value="p.id">{{ p.code }} · {{ p.name }}</option></select></div>
      <div class="field"><label for="cc-manager">Penanggung jawab</label><input id="cc-manager" v-model="form.managerName" class="input" maxlength="120" :disabled="!canManage"></div>
      <div class="field form-grid-full"><label for="cc-desc">Keterangan</label><input id="cc-desc" v-model="form.description" class="input" maxlength="500" placeholder="Cakupan biaya yang dicatat di pusat biaya ini" :disabled="!canManage"></div>
      <div v-if="editing" class="field form-grid-full">
        <span class="field-hint">Dipakai: {{ editing.usage.lines }} baris jurnal · {{ editing.usage.documents }} dokumen · {{ editing.usage.employees }} karyawan · {{ editing.usage.budgets }} anggaran · {{ editing.usage.children }} anak</span>
      </div>
      <div v-if="editing?.timeline?.length" class="field form-grid-full">
        <div class="timeline"><div v-for="(t, i) in editing.timeline" :key="i" class="tl-item">
          <span class="tl-rail"><i class="tl-node" :data-tone="COST_CENTER_TIMELINE[t.action]?.tone || undefined"></i><i class="tl-line"></i></span>
          <span class="tl-body"><span class="tl-title"><b>{{ t.actor }}</b> {{ COST_CENTER_TIMELINE[t.action]?.label ?? t.action }}<template v-if="t.detail?.reason"> — “{{ t.detail.reason }}”</template></span><span class="tl-meta">{{ F.datetime(t.at) }}</span></span>
        </div></div>
      </div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button v-if="canManage" class="btn btn-primary" data-action="save-cost-center" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button>
      <button v-if="canManage && editing" class="btn" data-action="toggle-cost-center" :disabled="busy" @click="pending = { kind: 'toggle', cc: editing }; pendingError = ''">{{ editing.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan' }}</button>
      <button v-if="canManage && editing?.deletable" class="btn btn-danger" data-action="delete-cost-center" :disabled="busy" @click="pending = { kind: 'delete', cc: editing }; pendingError = ''">Hapus</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="show = false">Tutup</button>
    </template>
  </Modal>
  <ReasonModal v-if="pending" :title="pending.kind === 'delete' ? `Hapus ${pending.cc.code}?` : `${pending.cc.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'} ${pending.cc.code}?`"
    :message="pending.kind === 'delete' ? 'Pusat biaya yang belum pernah dipakai dihapus permanen.' : pending.cc.status === 'aktif' ? 'Pusat biaya nonaktif tidak dapat dipilih pada jurnal & dokumen baru; data historis tetap tampil di laporan.' : 'Pusat biaya akan kembali dapat dipilih.'"
    :confirm-label="pending.kind === 'delete' ? 'Hapus' : pending.cc.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'" :danger="pending.kind === 'delete' || pending.cc.status === 'aktif'" :busy="busy" :error="pendingError"
    @close="pending = null" @confirm="confirm" />
</template>
