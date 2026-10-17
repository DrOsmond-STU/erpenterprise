<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import DataTools from '@/components/DataTools.vue';
import Icon from '@/components/Icon.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const ENTITIES: [string, string][] = [['', 'Semua entitas'], ['journal', 'Jurnal'], ['account', 'Akun'], ['bank_account', 'Rekening'], ['branch', 'Cabang'], ['period', 'Periode'], ['user', 'Pengguna'], ['session', 'Sesi'], ['assistant', 'Asisten AI'], ['export', 'Ekspor data'], ['cost_center', 'Pusat biaya'], ['budget', 'Anggaran'], ['project', 'Proyek'], ['invoice', 'Faktur'], ['ap_invoice', 'Tagihan pemasok'], ['employee', 'Karyawan']];
const page = ref(1);
const size = ref(25);
const entity = ref('');
/* Cari & rentang tanggal disaring di peladen (berlaku untuk seluruh catatan, bukan hanya halaman tampil). */
const q = ref('');
const from = ref('');
const to = ref('');
const qs = (p: number, n: number) => `/admin/audit-log?page=${p}&size=${n}${entity.value ? `&entity=${entity.value}` : ''}${q.value.trim() ? `&q=${encodeURIComponent(q.value.trim())}` : ''}${from.value ? `&from=${from.value}` : ''}${to.value ? `&to=${to.value}` : ''}`;
const debouncedQ = ref('');
let t: ReturnType<typeof setTimeout>;
watch(q, () => { clearTimeout(t); t = setTimeout(() => { debouncedQ.value = q.value; }, 300); });
const { data, loading } = useLoader(() => get(qs(page.value, size.value), { scoped: false }), [page, size, entity, debouncedQ, from, to]);
watch([size, entity, debouncedQ, from, to], () => { page.value = 1; });
/* Ekspor: muat seluruh catatan tersaring (per 200) lalu kembalikan tampilan halaman. */
const exportRows = ref<any[] | null>(null);
const rows = computed(() => exportRows.value ?? data.value?.data ?? []);
async function loadAll() {
  const all: any[] = [];
  for (let p = 1; p <= 100; p++) {
    const r = await get(qs(p, 200), { scoped: false });
    all.push(...r.data);
    if (all.length >= r.meta.total || !r.data.length) break;
  }
  exportRows.value = all;
  return () => { exportRows.value = null; };
}
</script>

<template>
  <ReportHead title="Jejak Audit" sub="Catatan append-only setiap tindakan bermakna; setiap baris terikat ke baris sebelumnya lewat rantai hash SHA-256 (K-70, K-71)." />
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari tindakan, entitas, pengguna, rincian…" aria-label="Cari jejak audit" data-filter="audit"></div>
      <select v-model="entity" class="select" style="width:auto" aria-label="Saring entitas"><option v-for="[k, l] in ENTITIES" :key="k" :value="k">{{ l }}</option></select>
      <input v-model="from" class="input" type="date" style="width:auto" aria-label="Dari tanggal" data-filter="audit-from">
      <input v-model="to" class="input" type="date" style="width:auto" aria-label="Sampai tanggal" data-filter="audit-to">
      <div class="toolbar-spacer"></div>
      <Pill v-if="data" :label="data.meta.chain.brokenAt === null ? `Rantai hash utuh (${data.meta.chain.checked} baris diperiksa)` : `Rantai rusak pada baris ${data.meta.chain.brokenAt}`" :tone="data.meta.chain.brokenAt === null ? 'ok' : 'danger'" />
      <DataTools :search="false" :filter="false" :prepare="loadAll" />
    </div>
    <div v-if="loading && !data" class="loading">Memuat…</div>
    <div v-else class="table-scroll"><table class="table" data-table="audit">
      <thead><tr><th>Waktu</th><th>Pengguna</th><th>Tindakan</th><th>Entitas</th><th>Rincian</th><th>IP</th></tr></thead>
      <tbody>
        <tr v-for="a in rows" :key="a.id" class="is-static">
          <td class="num" style="font-size:var(--fs-cap)">{{ F.datetime(a.at) }}</td><td class="cell-strong">{{ a.user_name ?? 'Sistem' }}</td><td><span class="code">{{ a.action }}</span></td><td><span class="code">{{ a.entity_type }}</span> {{ a.entity_id ?? '' }}</td>
          <td style="max-width:420px;font-size:var(--fs-cap);color:var(--ink-3);word-break:break-word">{{ a.after ? (exportRows ? JSON.stringify(a.after) : JSON.stringify(a.after).slice(0, 160)) : '' }}</td><td class="code">{{ a.ip ?? '—' }}</td>
        </tr>
        <tr v-if="data && !data.data.length" class="is-static"><td colspan="6" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada catatan.</td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="page" v-model:size="size" :total="data?.meta.total ?? 0" label="catatan" />
  </article>
</template>
