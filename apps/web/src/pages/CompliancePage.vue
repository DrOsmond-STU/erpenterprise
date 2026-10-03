<script setup lang="ts">
import { ref } from 'vue';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const session = useSession();
const toast = useToast();
const sod = useLoader<any>(() => (session.can('compliance.read') ? get('/compliance/sod') : Promise.resolve(null)));
const chain = ref<any>(null);
const busy = ref(false);
async function verify() {
  busy.value = true;
  try { chain.value = await get('/compliance/audit-chain'); } catch (e) { if (session.isAuthenticated) toast.error(e, 'Verifikasi jejak audit gagal'); } finally { busy.value = false; }
}
verify();
</script>

<template>
  <ReportHead title="Kepatuhan" sub="Bukti pengendalian internal: pemisahan tugas tingkat pengguna, kontrol empat mata per dokumen (dihitung ulang dari data transaksi), dan verifikasi rantai hash jejak audit (K-71) — tautan antarbaris dan hash isi setiap baris.">
    <button class="btn btn-primary" data-action="verify-chain" :disabled="busy" @click="verify"><Icon name="shield" /> Verifikasi rantai audit</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Rantai jejak audit" :value="chain ? (chain.intact ? 'Utuh' : 'RUSAK') : '…'" :foot="chain ? `${F.int(chain.checked)} baris diperiksa` : ''" :tone="chain && !chain.intact ? 'neg' : ''" />
    <KpiTile label="Pengguna dengan konflik" :value="String(sod.data.value?.summary.withConflicts ?? '—')" :foot="`dari ${sod.data.value?.summary.users ?? '—'} pengguna`" :tone="sod.data.value?.summary.withConflicts ? 'neg' : ''" />
    <KpiTile label="Pelanggaran empat mata" :value="String(sod.data.value?.summary.documentBreaches ?? '—')" foot="Dokumen diputus pembuatnya" :tone="sod.data.value?.summary.documentBreaches ? 'neg' : ''" />
    <KpiTile label="Superuser" :value="String(sod.data.value?.summary.superusers ?? '—')" foot="Admin Sistem" />
  </div>
  <article v-if="chain" class="card" style="margin-bottom:var(--sp-4)" data-chain>
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">Rantai hash jejak audit</h2><span class="card-note">Diverifikasi {{ F.datetime(chain.verifiedAt) }}</span></div><Pill :tone="chain.intact ? 'ok' : 'danger'" :label="chain.intact ? 'Utuh' : 'Rusak'" /></div>
    <div class="card-body"><dl class="deflist">
      <dt>Baris diperiksa</dt><dd class="num">{{ F.int(chain.checked) }} (perusahaan ini {{ F.int(chain.companyEntries) }})</dd>
      <dt>Tautan prev_hash</dt><dd>{{ chain.linkBrokenAt ? `putus pada baris #${chain.linkBrokenAt}` : 'semua tersambung' }}</dd>
      <dt>Hash isi</dt><dd>{{ chain.contentBrokenAt ? `tidak cocok mulai baris #${chain.contentBrokenAt}` : 'semua cocok (isi tidak diubah)' }}</dd>
      <dt>Hash kepala</dt><dd class="code" style="word-break:break-all">{{ chain.head }}</dd>
    </dl></div>
  </article>
  <template v-if="sod.data.value">
    <article class="card" style="margin-bottom:var(--sp-4)">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Kontrol empat mata per dokumen</h2><span class="card-note">Jumlah dokumen yang diputus oleh pembuatnya sendiri — seharusnya nol.</span></div></div>
      <div class="table-scroll"><table class="table" data-table="doc-checks"><tbody>
        <tr v-for="d in sod.data.value.documents" :key="d.label" class="is-static"><td>{{ d.label }}<span v-if="d.refs.length" class="cell-sub code">{{ d.refs.join(', ') }}</span></td><td class="ta-r num">{{ d.count }}</td><td><Pill :tone="d.count ? 'danger' : 'ok'" :label="d.count ? 'Temuan' : 'Patuh'" /></td></tr>
      </tbody></table></div>
    </article>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Pemisahan tugas per pengguna</h2><span class="card-note">Konflik izin tingkat pengguna (pasangan per dokumen ditegakkan saat transaksi dan hanya dicatat).</span></div></div>
      <div class="table-scroll"><table class="table" data-table="sod-users">
        <thead><tr><th>Pengguna</th><th>Peran</th><th>Konflik</th><th>Dikendalikan per dokumen</th></tr></thead>
        <tbody><tr v-for="u in sod.data.value.users" :key="u.id" class="is-static">
          <td><span class="cell-strong">{{ u.name }}</span><span class="cell-sub">{{ u.email }}</span></td>
          <td>{{ u.roles.join(', ') }}<Pill v-if="u.superuser" tone="info" label="Superuser" /></td>
          <td><span v-if="!u.conflicts.length" class="muted">—</span><span v-for="c in u.conflicts" :key="c" class="cell-sub neg" style="display:block">{{ c }}</span></td>
          <td class="cell-sub">{{ u.perDocument.length ? u.perDocument.length + ' pasangan' : '—' }}</td>
        </tr></tbody>
      </table></div>
    </article>
  </template>
</template>
