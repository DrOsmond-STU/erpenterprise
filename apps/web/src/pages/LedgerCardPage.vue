<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import BranchTag from '@/components/BranchTag.vue';
import Pager from '@/components/Pager.vue';
import KpiTile from '@/components/KpiTile.vue';
import ReportHead from '@/components/ReportHead.vue';
import JournalDrawer from '@/components/JournalDrawer.vue';

const route = useRoute();
const router = useRouter();
const ctx = useContext();
/* Kartu buku besar hanya untuk akun detail; tiap rekening kas/bank punya akun detail sendiri. */
const account = ref(String(route.query.akun ?? ''));
const openId = ref<string | null>(null);
const { data: coa } = useLoader(() => get('/ledger/accounts'));
const { data: banks } = useLoader(() => get('/ledger/bank-accounts'));
watch([coa, banks], () => {
  const list = coa.value?.accounts ?? [];
  const cur = list.find((a: any) => a.code === account.value);
  if (route.query.rekening && banks.value) account.value = banks.value.accounts.find((b: any) => b.code === route.query.rekening)?.glAccountCode ?? account.value;
  else if (list.length && (!cur || cur.type !== 'detail')) account.value = list.find((a: any) => a.type === 'detail' && (!cur || a.code.startsWith(cur.code.replace(/0+$/, ''))))?.code ?? list.find((a: any) => a.type === 'detail')?.code ?? '';
}, { immediate: true });
const { data: card, loading, reload } = useLoader(() => (account.value ? get(`/ledger/accounts/${account.value}/card`) : Promise.resolve(null)), [account]);
const pg = usePaged<any>(() => card.value?.lines ?? [], 50);
watch(account, pg.reset);
/** Saldo pindahan di awal halaman: saldo berjalan baris terakhir halaman sebelumnya. */
const carried = computed(() => {
  const start = (pg.page.value - 1) * pg.size.value;
  return start === 0 ? card.value?.opening ?? 0 : card.value?.lines[start - 1]?.balance ?? 0;
});
watch(account, (a) => { if (a) router.replace({ query: { akun: a } }); });
const details = computed(() => (coa.value?.accounts ?? []).filter((a: any) => a.type === 'detail' && !a.isComputed));
const nameOf = computed(() => new Map((coa.value?.accounts ?? []).map((a: any) => [a.code, a.name])));
const groups = computed(() => {
  const m = new Map<string, any[]>();
  for (const a of details.value) { const k = a.parentCode ?? a.code; (m.get(k) ?? m.set(k, []).get(k)!).push(a); }
  return [...m.entries()].map(([code, items]) => ({ label: `${code} ${nameOf.value.get(code) ?? ''}`, items }));
});
const bankOf = computed(() => banks.value?.accounts?.find((b: any) => b.glAccountCode === account.value));
</script>

<template>
  <ReportHead title="Kartu Buku Besar" sub="Mutasi setiap akun dengan saldo berjalan. Klik baris untuk membuka jurnal asalnya." />
  <article class="card">
    <div class="toolbar" style="flex-wrap:wrap">
      <div class="field" style="min-width:320px;flex:1 1 320px"><label for="gl-account">Akun</label>
        <select id="gl-account" v-model="account" class="select" data-gl-select>
          <optgroup v-for="g in groups" :key="g.label" :label="g.label"><option v-for="a in g.items" :key="a.code" :value="a.code">{{ a.code }} · {{ a.name }}</option></optgroup>
        </select>
        <span v-if="bankOf" class="field-hint">Rekening {{ bankOf.code }} · cabang {{ bankOf.branchCode }} · {{ bankOf.accountNoMasked ?? '' }}</span></div>
      <div class="toolbar-spacer"></div>
      <span class="pager-info">{{ F.int(card?.lines?.length ?? 0) }} mutasi · {{ ctx.branchName }} · {{ ctx.periodLabel }}</span>
    </div>
    <template v-if="card">
      <div class="kpi-row" style="margin-bottom:var(--sp-4)">
        <KpiTile label="Saldo awal" :value="F.rpCompact(card.opening)" :foot="`per ${F.date(card.period.from)}`" />
        <KpiTile label="Mutasi debit" :value="F.rpCompact(card.debit)" />
        <KpiTile label="Mutasi kredit" :value="F.rpCompact(card.credit)" />
        <KpiTile label="Saldo akhir" :value="F.rpCompact(card.ending)" :foot="`Saldo normal ${card.account.normalSide === 'debit' ? 'debit' : 'kredit'} · per ${F.date(card.period.to)}`" />
      </div>
      <div class="table-scroll"><table class="table report">
        <thead><tr><th>Tanggal</th><th>Jurnal</th><th>Keterangan</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th class="ta-r">Debit</th><th class="ta-r">Kredit</th><th class="ta-r">Saldo</th></tr></thead>
        <tbody>
          <tr class="report-subtotal is-static"><td class="num">{{ pg.page.value === 1 ? F.date(card.period.from) : '' }}</td><td></td><td>{{ pg.page.value === 1 ? `Saldo awal ${card.account.name}` : 'Saldo pindahan dari halaman sebelumnya' }}</td><td v-if="ctx.branch === 'ALL'"></td><td></td><td></td><td class="ta-r">{{ F.amt(carried, true) }}</td></tr>
          <tr v-for="(l, i) in pg.pageRows.value" :key="i" @click="openId = l.journal_id">
            <td class="num">{{ F.date(l.date) }}</td><td class="code">{{ l.journal_no }}</td>
            <td><span class="cell-strong">{{ l.description }}</span><span class="cell-sub">{{ l.source }}<template v-if="l.ref"> · {{ l.ref }}</template></span></td>
            <td v-if="ctx.branch === 'ALL'"><BranchTag :code="l.branch" /></td>
            <td class="ta-r">{{ l.debit ? F.amt(l.debit) : '—' }}</td><td class="ta-r">{{ l.credit ? F.amt(l.credit) : '—' }}</td><td class="ta-r">{{ F.amt(l.balance, true) }}</td>
          </tr>
          <tr v-if="!card.lines.length" class="is-static"><td :colspan="ctx.branch === 'ALL' ? 7 : 6"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada mutasi</span><span class="empty-note">Akun ini tidak bergerak pada {{ ctx.branchName }} · {{ ctx.periodLabel }}.</span></div></div></td></tr>
        </tbody>
        <tfoot><tr class="report-total"><td :colspan="ctx.branch === 'ALL' ? 4 : 3">Total mutasi &amp; saldo akhir</td><td class="ta-r">{{ F.amt(card.debit, true) }}</td><td class="ta-r">{{ F.amt(card.credit, true) }}</td><td class="ta-r">{{ F.amt(card.ending, true) }}</td></tr></tfoot>
      </table></div>
      <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="mutasi" />
    </template>
    <div v-else-if="loading" class="loading">Memuat…</div>
  </article>
  <JournalDrawer v-if="openId" :id="openId" @close="openId = null" @changed="openId = null; reload()" />
</template>
