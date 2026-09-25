<script setup lang="ts">
import { ref } from 'vue';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const page = ref(1);
const { data, loading } = useLoader(() => get(`/admin/audit-log?page=${page.value}&size=50`, { scoped: false }), [page]);
</script>

<template>
  <ReportHead title="Jejak Audit" sub="Catatan append-only setiap tindakan bermakna; setiap baris terikat ke baris sebelumnya lewat rantai hash SHA-256 (K-70, K-71)." />
  <article class="card">
    <div class="toolbar">
      <Pill v-if="data" :label="data.meta.chain.brokenAt === null ? `Rantai hash utuh (${data.meta.chain.checked} baris diperiksa)` : `Rantai rusak pada baris ${data.meta.chain.brokenAt}`" :tone="data.meta.chain.brokenAt === null ? 'ok' : 'danger'" />
      <div class="toolbar-spacer"></div>
      <div class="pager"><button class="btn btn-sm" :disabled="page <= 1" @click="page--">Sebelumnya</button><button class="btn btn-sm" :disabled="!data || data.data.length < 50" @click="page++">Berikutnya</button></div>
    </div>
    <div v-if="loading && !data" class="loading">Memuat…</div>
    <div v-else class="table-scroll"><table class="table">
      <thead><tr><th>Waktu</th><th>Pengguna</th><th>Tindakan</th><th>Entitas</th><th>Rincian</th><th>IP</th></tr></thead>
      <tbody>
        <tr v-for="a in data?.data ?? []" :key="a.id" class="is-static">
          <td class="num" style="font-size:var(--fs-cap)">{{ F.datetime(a.at) }}</td><td class="cell-strong">{{ a.user_name ?? 'Sistem' }}</td><td><span class="code">{{ a.action }}</span></td><td><span class="code">{{ a.entity_type }}</span> {{ a.entity_id ?? '' }}</td>
          <td style="max-width:420px;font-size:var(--fs-cap);color:var(--ink-3);word-break:break-word">{{ a.after ? JSON.stringify(a.after).slice(0, 160) : '' }}</td><td class="code">{{ a.ip ?? '—' }}</td>
        </tr>
      </tbody>
    </table></div>
  </article>
</template>
