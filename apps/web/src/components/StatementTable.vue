<script setup lang="ts">
/**
 * Tabel laporan (laba rugi / neraca) satu kolom atau multi-kolom
 * (per cabang + eliminasi + konsolidasi). Baris disusun oleh halaman.
 */
import { useRouter } from 'vue-router';
import * as F from '@/lib/format';

export interface StmtRow { kind: 'section' | 'line' | 'subtotal' | 'total'; label: string; code?: string; values: (number | null)[]; pct?: string; interco?: boolean }
defineProps<{ columns: string[]; rows: StmtRow[]; pctHeader?: string }>();
const router = useRouter();
const go = (r: StmtRow) => { if (r.code) router.push({ path: '/buku-besar', query: { akun: r.code } }); };
</script>

<template>
  <table class="table report report-stmt">
    <thead><tr><th>Keterangan</th><th v-for="c in columns" :key="c" class="ta-r">{{ c }}</th><th v-if="pctHeader" class="ta-r">{{ pctHeader }}</th></tr></thead>
    <tbody>
      <tr v-for="(r, i) in rows" :key="i" :class="[r.kind === 'section' ? 'report-section is-static' : r.kind === 'subtotal' ? 'report-subtotal is-static' : r.kind === 'total' ? 'report-total is-static' : r.code ? '' : 'is-static']" @click="go(r)">
        <template v-if="r.kind === 'section'"><td :colspan="columns.length + (pctHeader ? 2 : 1)">{{ r.label }}</td></template>
        <template v-else>
          <td :class="{ 'report-indent': r.code }"><span v-if="r.code" class="code">{{ r.code }} </span>{{ r.label }}<span v-if="r.interco" class="micro"> (dieliminasi)</span></td>
          <td v-for="(v, j) in r.values" :key="j" class="ta-r">{{ v === null ? '' : F.amt(v, r.kind !== 'line') }}</td>
          <td v-if="pctHeader" class="ta-r"><span class="num muted">{{ r.pct ?? '' }}</span></td>
        </template>
      </tr>
    </tbody>
  </table>
</template>
