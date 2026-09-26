<script setup lang="ts">
import { ref, watch } from 'vue';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const ENTITIES: [string, string][] = [['', 'Semua entitas'], ['journal', 'Jurnal'], ['account', 'Akun'], ['bank_account', 'Rekening'], ['branch', 'Cabang'], ['period', 'Periode'], ['user', 'Pengguna'], ['session', 'Sesi'], ['assistant', 'Asisten AI']];
const page = ref(1);
const size = ref(25);
const entity = ref('');
const { data, loading } = useLoader(() => get(`/admin/audit-log?page=${page.value}&size=${size.value}${entity.value ? `&entity=${entity.value}` : ''}`, { scoped: false }), [page, size, entity]);
watch([size, entity], () => { page.value = 1; });
</script>

<template>
  <ReportHead title="Jejak Audit" sub="Catatan append-only setiap tindakan bermakna; setiap baris terikat ke baris sebelumnya lewat rantai hash SHA-256 (K-70, K-71)." />
  <article class="card">
    <div class="toolbar">
      <select v-model="entity" class="select" style="width:auto" aria-label="Saring entitas"><option v-for="[k, l] in ENTITIES" :key="k" :value="k">{{ l }}</option></select>
      <div class="toolbar-spacer"></div>
      <Pill v-if="data" :label="data.meta.chain.brokenAt === null ? `Rantai hash utuh (${data.meta.chain.checked} baris diperiksa)` : `Rantai rusak pada baris ${data.meta.chain.brokenAt}`" :tone="data.meta.chain.brokenAt === null ? 'ok' : 'danger'" />
    </div>
    <div v-if="loading && !data" class="loading">Memuat…</div>
    <div v-else class="table-scroll"><table class="table" data-table="audit">
      <thead><tr><th>Waktu</th><th>Pengguna</th><th>Tindakan</th><th>Entitas</th><th>Rincian</th><th>IP</th></tr></thead>
      <tbody>
        <tr v-for="a in data?.data ?? []" :key="a.id" class="is-static">
          <td class="num" style="font-size:var(--fs-cap)">{{ F.datetime(a.at) }}</td><td class="cell-strong">{{ a.user_name ?? 'Sistem' }}</td><td><span class="code">{{ a.action }}</span></td><td><span class="code">{{ a.entity_type }}</span> {{ a.entity_id ?? '' }}</td>
          <td style="max-width:420px;font-size:var(--fs-cap);color:var(--ink-3);word-break:break-word">{{ a.after ? JSON.stringify(a.after).slice(0, 160) : '' }}</td><td class="code">{{ a.ip ?? '—' }}</td>
        </tr>
        <tr v-if="data && !data.data.length" class="is-static"><td colspan="6" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada catatan.</td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="page" v-model:size="size" :total="data?.meta.total ?? 0" label="catatan" />
  </article>
</template>
