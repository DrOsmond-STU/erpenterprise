<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get, post } from '@/lib/api';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import JournalDrawer from '@/components/JournalDrawer.vue';
import NewJournalModal from '@/components/NewJournalModal.vue';

const SOURCE_LABEL: Record<string, string> = { invoice: 'Penjualan', ap_invoice: 'Pembelian', stock_move: 'Persediaan', work_order: 'Produksi', payslip: 'Penggajian', depreciation: 'Aset tetap', maintenance: 'Pemeliharaan', pos_shift: 'POS / Kasir', cash: 'Kas & Bank', tax: 'Pajak', opening: 'Saldo awal', manual: 'Manual' };
const route = useRoute();
const router = useRouter();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const q = ref('');
const status = ref<string>(String(route.query.status ?? ''));
const page = ref(1);
const size = ref(25);
const openId = ref<string | null>(null);
const showNew = ref(false);
const { data, loading, reload } = useLoader(() => get(`/ledger/journals?page=${page.value}&size=${size.value}${status.value ? `&status=${status.value}` : ''}${q.value ? `&q=${encodeURIComponent(q.value)}` : ''}`), [page, size, status]);
let t: ReturnType<typeof setTimeout>;
watch(q, () => { clearTimeout(t); t = setTimeout(() => { page.value = 1; reload(); }, 250); });
watch(status, () => { page.value = 1; router.replace({ query: status.value ? { status: status.value } : {} }); });
watch(size, () => { page.value = 1; });
const counts = computed(() => data.value?.meta.statusCounts ?? {});
const total = computed(() => Object.values(counts.value as Record<string, number>).reduce((a, b) => a + b, 0));
const chips = [['', 'Semua'], ['posted', 'Diposting'], ['pending', 'Menunggu persetujuan'], ['rejected', 'Ditolak'], ['reversed', 'Dibalik']];

async function onChanged(msg: string) { openId.value = null; showNew.value = false; toast.push(msg, undefined, 'ok'); await reload(); }
async function created(j: any) { showNew.value = false; toast.push('Jurnal dikirim untuk persetujuan', `${j.journalNo} · ${ctx.shortOf(j.branch)} · ${F.rpCompact(j.total)}`, 'ok'); await reload(); }
void post;
</script>

<template>
  <div class="page-head">
    <div class="page-head-text"><h1 class="page-title">Jurnal Umum</h1><p class="page-sub">Seluruh jurnal berpasangan — posting otomatis dari modul operasional dan jurnal memorial manual. Jurnal terposting tidak dapat diubah; koreksi lewat jurnal balik.</p></div>
    <div class="page-actions">
      <span class="ctx-chip"><Icon name="map-pin" /> {{ ctx.branchName }}</span><span class="ctx-chip"><Icon name="calendar" /> {{ ctx.periodLabel }}</span>
      <button v-if="session.can('ledger.journal.create')" class="btn btn-primary" data-action="new-journal" @click="showNew = true"><Icon name="plus" /> Jurnal baru</button>
    </div>
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, keterangan, referensi…" aria-label="Cari jurnal"></div>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in chips" :key="k" class="chip" :aria-pressed="status === k" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : total }}</span></button>
      </div>
      <div class="toolbar-spacer"></div>
      <span class="pager-info">{{ F.int(data?.meta.total ?? 0) }} baris · {{ ctx.branchShort }} · {{ data?.meta.period?.label ?? ctx.periodLabel }}</span>
    </div>
    <div class="table-scroll"><table class="table">
      <thead><tr><th>Nomor</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Tanggal</th><th>Keterangan</th><th class="ta-r">Debit</th><th class="ta-r">Kredit</th><th>Dibuat oleh</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="8"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="j in data?.data ?? []" :key="j.id" data-row @click="openId = j.id">
          <td class="code cell-strong">{{ j.journalNo }}</td>
          <td v-if="ctx.branch === 'ALL'"><BranchTag :code="j.branch" /></td>
          <td class="num">{{ F.date(j.date) }}</td>
          <td><span class="cell-strong">{{ j.description }}</span><span class="cell-sub">{{ SOURCE_LABEL[j.source] ?? j.source }}<template v-if="j.ref"> · <span class="code">{{ j.ref }}</span></template> · {{ j.lineCount }} baris</span></td>
          <td class="ta-r num">{{ F.rpCompact(j.total) }}</td><td class="ta-r num">{{ F.rpCompact(j.total) }}</td>
          <td>{{ j.createdByName }}</td><td><Pill :status="j.status" /></td>
        </tr>
        <tr v-if="data && !data.data.length"><td colspan="8"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada jurnal</span><span class="empty-note">Ubah kata kunci, status, cabang, atau periode.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="page" v-model:size="size" :total="data?.meta.total ?? 0" label="jurnal" />
  </article>
  <JournalDrawer v-if="openId" :id="openId" @close="openId = null" @changed="onChanged" />
  <NewJournalModal v-if="showNew" @close="showNew = false" @created="created" />
</template>
