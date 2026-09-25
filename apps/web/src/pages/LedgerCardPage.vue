<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import BranchTag from '@/components/BranchTag.vue';
import KpiTile from '@/components/KpiTile.vue';
import ReportHead from '@/components/ReportHead.vue';
import JournalDrawer from '@/components/JournalDrawer.vue';

const route = useRoute();
const router = useRouter();
const ctx = useContext();
const account = ref(String(route.query.akun ?? '1-1100'));
const bank = ref(String(route.query.rekening ?? ''));
const openId = ref<string | null>(null);
const { data: coa } = useLoader(() => get('/ledger/accounts'));
const { data: banks } = useLoader(() => get('/ledger/bank-accounts'));
const { data: card, loading, reload } = useLoader(() => get(`/ledger/accounts/${account.value}/card${account.value === '1-1100' && bank.value ? `?bank=${bank.value}` : ''}`), [account, bank]);
watch([account, bank], () => router.replace({ query: { akun: account.value, ...(bank.value ? { rekening: bank.value } : {}) } }));
const details = computed(() => (coa.value?.accounts ?? []).filter((a: any) => a.type === 'detail' && !a.isComputed));
const cats = computed(() => [...new Set(details.value.map((a: any) => a.category))]);
</script>

<template>
  <ReportHead title="Kartu Buku Besar" sub="Mutasi setiap akun dengan saldo berjalan. Klik baris untuk membuka jurnal asalnya." />
  <article class="card">
    <div class="toolbar" style="flex-wrap:wrap">
      <div class="field" style="min-width:320px;flex:1 1 320px"><label for="gl-account">Akun</label>
        <select id="gl-account" v-model="account" class="select" data-gl-select>
          <optgroup v-for="c in cats" :key="String(c)" :label="String(c)"><option v-for="a in details.filter((x: any) => x.category === c)" :key="a.code" :value="a.code">{{ a.code }} · {{ a.name }}</option></optgroup>
        </select></div>
      <div v-if="account === '1-1100'" class="field" style="min-width:240px"><label for="gl-bank">Rekening</label>
        <select id="gl-bank" v-model="bank" class="select"><option value="">Semua rekening</option><option v-for="b in banks?.accounts ?? []" :key="b.code" :value="b.code">{{ b.name }}</option></select></div>
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
          <tr class="report-subtotal is-static"><td class="num">{{ F.date(card.period.from) }}</td><td></td><td>Saldo awal {{ card.account.name }}</td><td v-if="ctx.branch === 'ALL'"></td><td></td><td></td><td class="ta-r">{{ F.amt(card.opening, true) }}</td></tr>
          <tr v-for="(l, i) in card.lines" :key="i" @click="openId = l.journal_id">
            <td class="num">{{ F.date(l.date) }}</td><td class="code">{{ l.journal_no }}</td>
            <td><span class="cell-strong">{{ l.description }}</span><span class="cell-sub">{{ l.source }}<template v-if="l.ref"> · {{ l.ref }}</template></span></td>
            <td v-if="ctx.branch === 'ALL'"><BranchTag :code="l.branch" /></td>
            <td class="ta-r">{{ l.debit ? F.amt(l.debit) : '—' }}</td><td class="ta-r">{{ l.credit ? F.amt(l.credit) : '—' }}</td><td class="ta-r">{{ F.amt(l.balance, true) }}</td>
          </tr>
          <tr v-if="!card.lines.length" class="is-static"><td :colspan="ctx.branch === 'ALL' ? 7 : 6"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada mutasi</span><span class="empty-note">Akun ini tidak bergerak pada {{ ctx.branchName }} · {{ ctx.periodLabel }}.</span></div></div></td></tr>
        </tbody>
        <tfoot><tr class="report-total"><td :colspan="ctx.branch === 'ALL' ? 4 : 3">Total mutasi &amp; saldo akhir</td><td class="ta-r">{{ F.amt(card.debit, true) }}</td><td class="ta-r">{{ F.amt(card.credit, true) }}</td><td class="ta-r">{{ F.amt(card.ending, true) }}</td></tr></tfoot>
      </table></div>
    </template>
    <div v-else-if="loading" class="loading">Memuat…</div>
  </article>
  <JournalDrawer v-if="openId" :id="openId" @close="openId = null" @changed="openId = null; reload()" />
</template>
