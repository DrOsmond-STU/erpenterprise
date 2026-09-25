<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import Icon from '@/components/Icon.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const router = useRouter();
const { data, loading } = useLoader(() => get('/ledger/accounts'));
const cats = ['Aset', 'Liabilitas', 'Ekuitas', 'Pendapatan', 'Beban'];
const totals = computed(() => cats.map((c) => { const items = (data.value?.accounts ?? []).filter((a: any) => a.category === c && a.type === 'detail'); return { c, total: items.reduce((s: number, a: any) => s + a.balance, 0), count: items.length }; }));
</script>

<template>
  <ReportHead title="Bagan Akun (Chart of Accounts)" :sub="`Struktur akun buku besar beserta saldo per akhir periode. Klik akun detail untuk membuka kartu buku besar.`">
    <RouterLink class="btn" to="/neraca-saldo"><Icon name="scale" /> Neraca saldo</RouterLink>
  </ReportHead>
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <template v-else-if="data">
    <div class="coa-summary">
      <div v-for="t in totals" :key="t.c" class="card coa-summary-card"><span class="coa-summary-label">{{ t.c }}</span><span class="coa-summary-num" :class="{ neg: t.total < 0 }">{{ F.rpCompact(Math.abs(t.total)) }}</span><span class="muted" style="font-size:var(--fs-cap)">{{ t.count }} akun</span></div>
    </div>
    <article class="card">
      <div class="card-head"><h3 class="card-title"><Icon name="tree" /> Daftar Akun</h3></div>
      <div class="table-scroll"><table class="table">
        <thead><tr><th>Kode</th><th>Nama Akun</th><th>Tipe</th><th class="ta-r">Saldo</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="a in data.accounts" :key="a.code" :class="{ 'coa-header-row is-static': a.type === 'header', 'is-static': a.isComputed }" @click="a.type === 'detail' && !a.isComputed && router.push({ path: '/buku-besar', query: { akun: a.code } })">
            <td class="code" :style="`padding-left:${a.level * 24 + 12}px`">{{ a.code }}</td>
            <td :class="{ 'cell-strong': a.type === 'header' }" :style="`padding-left:${a.level * 24 + 12}px`">{{ a.name }}<span v-if="a.isIntercompany" class="micro"> antar kantor</span><span v-if="a.isComputed" class="micro"> dihitung</span></td>
            <td>{{ a.type === 'header' ? '' : 'Detail' }}</td><td class="ta-r num" :class="{ neg: a.balance < 0 }">{{ F.rpCompact(a.balance) }}</td><td><Pill :status="a.status" /></td>
          </tr>
        </tbody>
      </table></div>
    </article>
  </template>
</template>
