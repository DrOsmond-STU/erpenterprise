<script setup lang="ts">
import { computed, ref } from 'vue';
import { get, post } from '@/lib/api';
import * as F from '@/lib/format';
import { todayWib } from '@/lib/sales';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const session = useSession();
const toast = useToast();
const date = ref(todayWib());
const { data, loading, reload } = useLoader<any>(() => get(`/hr/attendance?date=${date.value}`), [date]);
const rows = computed<any[]>(() => data.value?.rows ?? []);
const canManage = computed(() => session.can('hr.manage'));
const STATUSES = ['hadir', 'terlambat', 'izin', 'sakit', 'cuti', 'alpa'];
const busy = ref(false);
async function saveRow(r: any) {
  if (!r.status) return;
  try {
    await post('/hr/attendance', { employeeId: r.employeeId, date: date.value, status: r.status, clockIn: r.clockIn || null, clockOut: r.clockOut || null, overtimeHours: ['hadir', 'terlambat'].includes(r.status) ? Number(r.overtimeHours || 0) : 0 });
    toast.push('Kehadiran disimpan', `${r.name} · ${r.status}`, 'ok'); await reload();
  } catch (e) { toast.error(e, 'Kehadiran tidak dapat disimpan'); await reload(); }
}
async function fill() {
  busy.value = true;
  try { const r = await post('/hr/attendance/fill', { date: date.value }); toast.push('Hadir massal', `${r.inserted} karyawan ditandai hadir`, 'ok'); await reload(); }
  catch (e) { toast.error(e, 'Gagal'); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Kehadiran & Lembur" sub="Catatan harian per karyawan. Jam lembur menjadi dasar upah lembur saat daftar gaji disusun (jam pertama ×1,5, berikutnya ×2 dari upah sejam = gaji pokok/173). Kehadiran terkunci setelah gaji periodenya diposting.">
    <input v-model="date" class="input" type="date" style="max-width:170px" aria-label="Tanggal" data-field="att-date">
    <button v-if="canManage" class="btn btn-primary" data-action="fill-present" :disabled="busy" @click="fill"><Icon name="check" /> Tandai hadir yang belum diisi</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Terisi" :value="`${data?.summary.filled ?? 0}/${data?.summary.total ?? 0}`" :foot="F.date(date)" />
    <KpiTile label="Hadir" :value="String(data?.summary.hadir ?? 0)" :foot="`${data?.summary.terlambat ?? 0} terlambat`" />
    <KpiTile label="Tidak hadir" :value="String(data?.summary.absen ?? 0)" foot="Izin, sakit, cuti, alpa" />
    <KpiTile label="Jam lembur" :value="F.dec(data?.summary.overtime ?? 0, 1)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="table-scroll"><table class="table" data-table="attendance">
      <thead><tr><th>Karyawan</th><th>Status</th><th>Masuk</th><th>Pulang</th><th class="ta-r">Lembur (jam)</th><th></th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="6"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="r in rows" :key="r.employeeId" class="is-static" :data-att="r.code">
          <td><span class="cell-strong">{{ r.name }}</span><span class="cell-sub"><span class="code">{{ r.code }}</span> · {{ r.dept }} · <BranchTag :code="r.branch" /></span></td>
          <td v-if="canManage"><select v-model="r.status" class="select" style="min-width:120px" :aria-label="`Status ${r.name}`" data-field="status"><option :value="null" disabled>—</option><option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option></select></td>
          <td v-else><Pill v-if="r.status" :status="r.status" /><span v-else class="muted">—</span></td>
          <td><input v-model="r.clockIn" class="input" type="time" style="width:110px" :disabled="!canManage || !['hadir','terlambat'].includes(r.status)" aria-label="Jam masuk"></td>
          <td><input v-model="r.clockOut" class="input" type="time" style="width:110px" :disabled="!canManage || !['hadir','terlambat'].includes(r.status)" aria-label="Jam pulang"></td>
          <td class="ta-r"><input v-model.number="r.overtimeHours" class="input num" type="number" min="0" max="12" step="0.5" style="width:80px;text-align:right" :disabled="!canManage || !['hadir','terlambat'].includes(r.status)" aria-label="Jam lembur" data-field="overtime"></td>
          <td class="ta-r"><button v-if="canManage" class="btn btn-sm" :disabled="!r.status" data-action="save-att" @click="saveRow(r)">Simpan</button></td>
        </tr>
        <tr v-if="data && !rows.length" class="is-static"><td colspan="6"><span class="muted">Tidak ada karyawan aktif.</span></td></tr>
      </tbody>
    </table></div>
  </article>
</template>
