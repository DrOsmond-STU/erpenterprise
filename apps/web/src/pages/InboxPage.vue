<script setup lang="ts">
import { computed } from 'vue';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import ReportHead from '@/components/ReportHead.vue';

const { data, loading, reload } = useLoader<any>(() => get('/inbox'));
const groups = computed(() => {
  const m = new Map<string, any[]>();
  for (const i of data.value?.items ?? []) { if (!m.has(i.label)) m.set(i.label, []); m.get(i.label)!.push(i); }
  return [...m.entries()].map(([label, items]) => ({ label, items, link: items[0].link, action: items[0].action, total: items.reduce((t, x) => t + x.amount, 0) }));
});
const oldest = computed(() => (data.value?.items ?? []).map((i: any) => i.at).filter(Boolean).sort()[0]);
</script>

<template>
  <ReportHead title="Kotak Persetujuan" sub="Semua dokumen yang menunggu keputusan Anda di seluruh modul — sesuai izin dan cabang Anda. Dokumen buatan Anda sendiri tidak tampil karena harus diputus orang lain (kontrol empat mata).">
    <button class="btn" data-action="refresh-inbox" @click="reload"><Icon name="reconcile" /> Muat ulang</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Menunggu keputusan" :value="String(data?.count ?? 0)" foot="Semua modul" :tone="data?.count ? 'neg' : ''" />
    <KpiTile label="Jenis dokumen" :value="String(groups.length)" foot="Kelompok" />
    <KpiTile label="Paling lama" :value="oldest ? F.date(oldest) : '—'" foot="Tanggal diajukan" />
    <KpiTile label="Nilai terkait" :value="F.rpCompact(groups.reduce((t, g) => t + g.total, 0))" foot="Jumlah nominal" />
  </div>
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <article v-for="g in groups" :key="g.label" class="card" style="margin-bottom:var(--sp-4)" :data-inbox-group="g.items[0].kind">
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">{{ g.label }} <span class="chip-count">{{ g.items.length }}</span></h2><span class="card-note">Tindakan: {{ g.action }}</span></div>
      <RouterLink class="btn btn-sm" :to="g.link" style="text-decoration:none">Buka halaman <Icon name="external" /></RouterLink></div>
    <div class="table-scroll"><table class="table"><tbody>
      <tr v-for="i in g.items" :key="i.id" class="is-static" :data-inbox-item="i.docNo">
        <td class="code cell-strong">{{ i.docNo }}</td><td>{{ i.title }}<span class="cell-sub">oleh {{ i.by }}<template v-if="i.at"> · {{ F.datetime(i.at) }}</template></span></td>
        <td><BranchTag :code="i.branch" /></td><td class="ta-r num">{{ i.amount ? F.rp(i.amount) : '—' }}</td>
        <td class="ta-r"><RouterLink class="btn btn-sm btn-primary" :to="`${i.link}${i.link.includes('rekonsiliasi-bank') ? '/' + i.id : ''}`" style="text-decoration:none">{{ i.action }}</RouterLink></td>
      </tr>
    </tbody></table></div>
  </article>
  <article v-if="data && !data.count" class="card"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada yang menunggu keputusan Anda</span><span class="empty-note">Dokumen baru yang perlu Anda setujui akan muncul di sini dan pada lonceng di bilah atas.</span></div></div></article>
</template>
