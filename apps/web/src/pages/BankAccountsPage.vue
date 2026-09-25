<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import BranchTag from '@/components/BranchTag.vue';
import KpiTile from '@/components/KpiTile.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const router = useRouter();
const ctx = useContext();
const { data, loading } = useLoader(() => get('/ledger/bank-accounts'));
const { data: bs } = useLoader(() => get('/reports/balance-sheet'));
const idr = computed(() => (data.value?.accounts ?? []).filter((a: any) => a.currency === 'IDR'));
const totalIDR = computed(() => idr.value.reduce((s: number, a: any) => s + a.balance, 0));
const petty = computed(() => idr.value.filter((a: any) => a.bankName === 'Kas'));
const gl = computed(() => bs.value?.assets.find((a: any) => a.code === '1-1100')?.amount ?? 0);
</script>

<template>
  <ReportHead title="Kas & Bank" :sub="`Saldo rekening dihitung dari jurnal kas per akhir periode. Klik rekening untuk melihat mutasinya di kartu buku besar.`" />
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <template v-else-if="data">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Total saldo IDR" :value="F.rpCompact(totalIDR)" :foot="`${idr.length} rekening`" />
      <KpiTile label="Kas kecil" :value="F.rpCompact(petty.reduce((s: number, a: any) => s + a.balance, 0))" :foot="`${petty.length} lokasi`" />
      <KpiTile label="Buku besar 1-1100" :value="F.rpCompact(gl)" :foot="Math.abs(gl - totalIDR) < 1 ? 'Cocok dengan sub-buku bank' : `Selisih ${F.rpCompact(gl - totalIDR)}`" :tone="Math.abs(gl - totalIDR) < 1 ? '' : 'neg'" />
      <KpiTile label="Per tanggal" :value="F.date(data.period.to)" :foot="ctx.periodLabel" />
    </div>
    <article class="card">
      <div class="table-scroll"><table class="table">
        <thead><tr><th>Kode</th><th>Nama rekening</th><th>Cabang</th><th>Mata uang</th><th class="ta-r">Saldo</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="a in data.accounts" :key="a.code" @click="router.push({ path: '/buku-besar', query: { akun: '1-1100', rekening: a.code } })">
            <td class="code">{{ a.code }}</td><td><span class="cell-strong">{{ a.name }}</span><span class="cell-sub">{{ a.bankName }} · {{ a.accountNoMasked ?? '—' }}</span></td><td><BranchTag :code="a.branchCode" /></td><td>{{ a.currency }}</td>
            <td class="ta-r num">{{ a.currency === 'IDR' ? F.rpCompact(a.balance) : `${a.currency} ${F.int(a.balance)}` }}</td><td><Pill :status="a.status" /></td>
          </tr>
        </tbody>
      </table></div>
    </article>
  </template>
</template>
