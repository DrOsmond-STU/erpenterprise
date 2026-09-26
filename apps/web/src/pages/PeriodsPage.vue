<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import KpiTile from '@/components/KpiTile.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader(() => get('/periods', { scoped: false }));
const group = ref<'' | 'Bulan' | 'Kuartal' | 'Tahun'>('');
const filtered = computed(() => (data.value ?? []).filter((p: any) => !group.value || p.group === group.value));
const pg = usePaged<any>(filtered, 25);
watch(group, pg.reset);
const count = (st: string) => (data.value ?? []).filter((p: any) => p.status === st).length;

const pending = ref<{ kind: 'close' | 'reopen'; p: any } | null>(null);
const pendingError = ref('');
const busy = ref(false);
async function confirm(reason: string) {
  const x = pending.value!; busy.value = true; pendingError.value = '';
  try {
    await post(`/periods/${x.p.id}/${x.kind}`, { reason }, { scoped: false });
    toast.push(x.kind === 'close' ? 'Periode ditutup' : 'Periode dibuka kembali', `${x.p.label} — ${x.kind === 'close' ? 'jurnal tidak dapat lagi diposting ke periode ini' : 'jurnal dapat kembali diposting'}.`, 'ok');
    pending.value = null; await session.loadMe(); await reload();
  } catch (e) { pendingError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Periode Fiskal" sub="Tutup periode mengunci buku: jurnal tidak dapat lagi diposting ke periode tertutup. Penutup dan pembuka kembali periode harus orang yang berbeda (pemisahan tugas)." />
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Periode terbuka" :value="String(count('open'))" foot="menerima jurnal" />
    <KpiTile label="Periode ditutup" :value="String(count('closed'))" foot="terkunci" />
    <KpiTile label="Syarat tutup" value="0 pending" foot="dan seluruh rekonsiliasi cocok" />
  </div>
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <article v-else class="card">
    <div class="table-filter">
      <button v-for="[k, l] in [['', 'Semua'], ['Bulan', 'Bulanan'], ['Kuartal', 'Kuartalan'], ['Tahun', 'Tahunan']]" :key="k" class="chip" :aria-pressed="group === k" @click="group = k as any">{{ l }}</button>
    </div>
    <div class="table-scroll"><table class="table" data-table="periods">
      <thead><tr><th>Kode</th><th>Periode</th><th>Jenis</th><th>Rentang</th><th>Status</th><th>Ditutup</th><th class="ta-r">Aksi</th></tr></thead>
      <tbody>
        <tr v-for="p in pg.pageRows.value" :key="p.id" class="is-static" :data-period="p.id">
          <td class="code">{{ p.id }}</td><td class="cell-strong">{{ p.label }}</td><td>{{ p.group }}</td>
          <td class="num">{{ F.date(p.from) }} – {{ F.date(p.to) }}</td><td><Pill :status="p.status" /></td>
          <td class="muted">{{ p.closedAt ? F.date(String(p.closedAt).slice(0, 10)) : '—' }}</td>
          <td><div class="row-actions">
            <button v-if="p.status !== 'closed' && session.can('ledger.period.close')" class="btn btn-sm" data-action="close-period" @click="pending = { kind: 'close', p }; pendingError = ''">Tutup periode</button>
            <button v-if="p.status === 'closed' && session.can('ledger.period.reopen')" class="btn btn-sm" data-action="reopen-period" @click="pending = { kind: 'reopen', p }; pendingError = ''">Buka kembali</button>
          </div></td>
        </tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="periode" />
  </article>
  <ReasonModal v-if="pending" :title="pending.kind === 'close' ? `Tutup periode ${pending.p.label}?` : `Buka kembali ${pending.p.label}?`"
    :message="pending.kind === 'close' ? 'Sistem memeriksa: tidak ada jurnal menunggu persetujuan dan seluruh rekonsiliasi sub-buku cocok.' : 'Periode kembali menerima jurnal. Tindakan ini tidak boleh dilakukan oleh orang yang menutupnya.'"
    :confirm-label="pending.kind === 'close' ? 'Tutup periode' : 'Buka kembali'" :danger="pending.kind === 'reopen'" :busy="busy" :error="pendingError"
    @close="pending = null" @confirm="confirm" />
</template>
