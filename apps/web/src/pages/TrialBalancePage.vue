<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import Icon from '@/components/Icon.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const router = useRouter();
const view = ref<'ringkas' | 'cabang'>('ringkas');
const { data: tb, loading } = useLoader(() => get(`/reports/trial-balance${view.value === 'cabang' ? '?by_branch=true' : ''}`), [view]);
const cats = ['Aset', 'Liabilitas', 'Ekuitas', 'Pendapatan', 'Beban'];
const byCat = computed(() => cats.map((c) => ({ c, rows: (tb.value?.rows ?? []).filter((r: any) => r.category === c) })).filter((g) => g.rows.length));
const perBranch = computed(() => Boolean(tb.value?.columns));
/* Paginasi per akun; judul kategori disisipkan ulang di setiap halaman. Total tetap untuk seluruh akun. */
const ordered = computed(() => byCat.value.flatMap((g) => g.rows));
const pg = usePaged<any>(ordered, 25);
watch(view, pg.reset);
const pageGroups = computed(() => {
  const out: { c: string; rows: any[] }[] = [];
  for (const r of pg.pageRows.value) { const last = out[out.length - 1]; if (last && last.c === r.category) last.rows.push(r); else out.push({ c: r.category, rows: [r] }); }
  return out;
});
const goCard = (code: string) => router.push({ path: '/buku-besar', query: { akun: code } });
const sumCol = (i: number, side: 1 | -1) => (tb.value?.rows ?? []).reduce((s: number, r: any) => s + Math.max(side * r.values[i], 0), 0);
const elimD = computed(() => (tb.value?.rows ?? []).filter((r: any) => r.interco).reduce((s: number, r: any) => s + Math.max(-r.elimination, 0), 0));
const elimK = computed(() => (tb.value?.rows ?? []).filter((r: any) => r.interco).reduce((s: number, r: any) => s + Math.max(r.elimination, 0), 0));
</script>

<template>
  <ReportHead title="Neraca Saldo" sub="Saldo awal, mutasi periode, dan saldo akhir seluruh akun detail — dasar penyusunan laba rugi dan neraca.">
    <RouterLink class="btn" to="/buku-besar"><Icon name="book" /> Kartu buku besar</RouterLink>
  </ReportHead>
  <article class="card">
    <div class="toolbar">
      <div v-if="ctx.branch === 'ALL'" class="segmented" role="group" aria-label="Tampilan neraca saldo">
        <button :aria-pressed="view === 'ringkas'" @click="view = 'ringkas'">Gabungan</button><button :aria-pressed="view === 'cabang'" data-tb-view="cabang" @click="view = 'cabang'">Per cabang</button>
      </div>
      <div class="toolbar-spacer"></div>
      <Pill v-if="tb" :label="tb.balanced ? 'Seimbang — Σ debit = Σ kredit' : `Tidak seimbang — selisih ${F.rp(Math.abs(tb.totals.endD - tb.totals.endK))}`" :tone="tb.balanced ? 'ok' : 'danger'" />
      <span class="pager-info">{{ tb?.rows?.length ?? 0 }} akun · {{ ctx.branchName }} · {{ ctx.periodLabel }}</span>
    </div>
    <div v-if="loading && !tb" class="loading">Memuat…</div>
    <div v-else-if="tb && !perBranch" class="table-scroll"><table class="table report" data-table="tb">
      <thead>
        <tr><th rowspan="2">Kode</th><th rowspan="2">Nama akun</th><th colspan="2" class="ta-c">Saldo awal</th><th colspan="2" class="ta-c">Mutasi periode</th><th colspan="2" class="ta-c">Saldo akhir</th></tr>
        <tr><th class="ta-r">Debit</th><th class="ta-r">Kredit</th><th class="ta-r">Debit</th><th class="ta-r">Kredit</th><th class="ta-r">Debit</th><th class="ta-r">Kredit</th></tr>
      </thead>
      <tbody>
        <template v-for="g in pageGroups" :key="g.c">
          <tr class="report-section is-static"><td colspan="8">{{ g.c }}</td></tr>
          <tr v-for="r in g.rows" :key="r.code" @click="goCard(r.code)">
            <td class="code">{{ r.code }}</td><td>{{ r.name }}<span v-if="r.interco" class="micro"> (antar kantor)</span></td>
            <td class="ta-r">{{ F.amt(r.open.d) }}</td><td class="ta-r">{{ F.amt(r.open.k) }}</td><td class="ta-r">{{ F.amt(r.debit) }}</td><td class="ta-r">{{ F.amt(r.credit) }}</td><td class="ta-r">{{ F.amt(r.end.d) }}</td><td class="ta-r">{{ F.amt(r.end.k) }}</td>
          </tr>
        </template>
      </tbody>
      <tfoot><tr class="report-total"><td colspan="2">Total</td><td class="ta-r">{{ F.amt(tb.totals.openD, true) }}</td><td class="ta-r">{{ F.amt(tb.totals.openK, true) }}</td><td class="ta-r">{{ F.amt(tb.totals.debit, true) }}</td><td class="ta-r">{{ F.amt(tb.totals.credit, true) }}</td><td class="ta-r">{{ F.amt(tb.totals.endD, true) }}</td><td class="ta-r">{{ F.amt(tb.totals.endK, true) }}</td></tr></tfoot>
    </table></div>
    <div v-else-if="tb" class="table-scroll"><table class="table report" data-table="tb-branch">
      <thead><tr><th>Kode</th><th>Nama akun</th><th v-for="c in tb.columns" :key="c.branch" class="ta-r">{{ c.label }}</th><th class="ta-r">Eliminasi</th><th class="ta-r">Konsolidasi</th></tr></thead>
      <tbody>
        <template v-for="g in pageGroups" :key="g.c">
          <tr class="report-section is-static"><td :colspan="tb.columns.length + 4">{{ g.c }}</td></tr>
          <tr v-for="r in g.rows" :key="r.code" @click="goCard(r.code)">
            <td class="code">{{ r.code }}</td><td>{{ r.name }}<span v-if="r.interco" class="micro"> (dieliminasi)</span></td>
            <td v-for="(v, i) in r.values" :key="i" class="ta-r">{{ F.amt(v) }}</td><td class="ta-r">{{ F.amt(r.elimination) }}</td><td class="ta-r">{{ F.amt(r.consolidated) }}</td>
          </tr>
        </template>
      </tbody>
      <tfoot>
        <tr class="report-total"><td colspan="2">Total debit</td><td v-for="(c, i) in tb.columns" :key="c.branch" class="ta-r">{{ F.amt(sumCol(Number(i), 1), true) }}</td><td class="ta-r">{{ F.amt(-elimD) }}</td><td class="ta-r">{{ F.amt(tb.totals.endD - elimD, true) }}</td></tr>
        <tr class="report-total"><td colspan="2">Total kredit</td><td v-for="(c, i) in tb.columns" :key="c.branch" class="ta-r">{{ F.amt(sumCol(Number(i), -1), true) }}</td><td class="ta-r">{{ F.amt(-elimK) }}</td><td class="ta-r">{{ F.amt(tb.totals.endK - elimK, true) }}</td></tr>
      </tfoot>
    </table>
    <p class="card-note" style="padding:var(--sp-3)">Nilai positif = saldo debit, nilai dalam kurung = saldo kredit. RK Cabang (kantor pusat) dan RK Kantor Pusat (cabang) saling dieliminasi.</p></div>
    <Pager v-if="tb" v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="akun" />
  </article>
</template>
