<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { get, post } from '@/lib/api';
import { CSV_TEMPLATE } from '@/lib/cash';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const router = useRouter();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading } = useLoader<any[]>(() => get('/cash/statements'));
const { data: bankData } = useLoader<any>(() => get('/ledger/bank-accounts'));
const all = computed(() => data.value ?? []);
const pg = usePaged<any>(all, 10);
/* Rekonsiliasi terakhir per rekening (hanya IDR). */
const perBank = computed(() => (bankData.value?.accounts ?? []).filter((b: any) => b.currency === 'IDR' && b.status === 'aktif').map((b: any) => {
  const done = all.value.filter((s) => s.bankAccount === b.code && s.status === 'selesai').sort((x, y) => String(y.to).localeCompare(String(x.to)))[0];
  const open = all.value.find((s) => s.bankAccount === b.code && s.status === 'proses');
  return { ...b, lastTo: done?.to ?? null, open };
}));
const kpi = computed(() => ({
  open: all.value.filter((s) => s.status === 'proses').length, lines: all.value.filter((s) => s.status === 'proses').reduce((t, s) => t + s.openCount, 0),
  never: perBank.value.filter((b: any) => !b.lastTo).length, done: all.value.filter((s) => s.status === 'selesai').length,
}));

/* Impor */
const show = ref(false);
const form = ref({ bankAccount: '', fileName: '', content: '', opening: '' as string | number });
const errors = ref<string[]>([]);
const busy = ref(false);
function openImport(code = '') {
  errors.value = [];
  form.value = { bankAccount: code || perBank.value.find((b: any) => b.bankName !== 'Kas')?.code || '', fileName: '', content: '', opening: '' };
  show.value = true;
}
async function pick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  if (f.size > 1_500_000) { errors.value = ['Berkas terlalu besar (maks. 1,5 MB).']; return; }
  form.value.fileName = f.name; form.value.content = await f.text();
}
function template() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
  a.download = 'contoh-mutasi-rekening.csv'; a.click(); URL.revokeObjectURL(a.href);
}
async function save() {
  errors.value = []; busy.value = true;
  try {
    const body: any = { bankAccount: form.value.bankAccount, fileName: form.value.fileName || undefined, content: form.value.content };
    if (form.value.opening !== '') body.opening = Math.round(Number(form.value.opening));
    const r = await post('/cash/statements', body);
    toast.push('Mutasi diimpor', `${r.docNo} · ${r.reconciliation.counts.matched}/${r.reconciliation.counts.total} baris cocok otomatis`, 'ok');
    show.value = false; router.push(`/rekonsiliasi-bank/${r.id}`);
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
const go = (id: string) => router.push(`/rekonsiliasi-bank/${id}`);
</script>

<template>
  <ReportHead title="Rekonsiliasi Bank" sub="Impor mutasi rekening koran (CSV internet banking atau MT940). Sistem mencocokkan otomatis dengan mutasi buku (jumlah sama, tanggal ±3 hari); biaya & bunga bank dibuatkan jurnal, lalu rekonsiliasi difinalisasi oleh orang lain.">
    <button class="btn" data-action="csv-template" @click="template"><Icon name="download" /> Contoh CSV</button>
    <button v-if="session.can('cash.reconcile')" class="btn btn-primary" data-action="import-statement" @click="openImport()"><Icon name="plus" /> Impor mutasi</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Rekonsiliasi berjalan" :value="String(kpi.open)" :foot="`${kpi.lines} baris mutasi belum cocok`" :tone="kpi.lines ? 'neg' : ''" />
    <KpiTile label="Selesai" :value="String(kpi.done)" foot="Rekening koran difinalisasi" />
    <KpiTile label="Rekening belum pernah direkonsiliasi" :value="String(kpi.never)" :foot="ctx.branchShort" :tone="kpi.never ? 'neg' : ''" />
    <KpiTile label="Rekening IDR aktif" :value="String(perBank.length)" :foot="ctx.branchShort" />
  </div>
  <section class="grid grid-1-2">
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Status per rekening</h2><span class="card-note">Rekonsiliasi terakhir yang difinalisasi.</span></div></div>
      <div class="table-scroll"><table class="table" data-table="recon-banks"><tbody>
        <tr v-for="b in perBank" :key="b.code" class="is-static" :data-bank="b.code">
          <td><span class="cell-strong">{{ b.name }}</span><span class="cell-sub"><span class="code">{{ b.code }}</span> · {{ b.branchCode }}</span></td>
          <td class="ta-r num">{{ F.rpCompact(b.balance) }}</td>
          <td><template v-if="b.open"><a href="#" class="code" @click.prevent="go(b.open.id)">{{ b.open.docNo }}</a><span class="cell-sub">berjalan</span></template>
            <template v-else-if="b.lastTo">s.d. {{ F.date(b.lastTo) }}</template><span v-else class="muted">belum pernah</span></td>
          <td class="ta-r"><button v-if="session.can('cash.reconcile') && !b.open" class="btn btn-sm btn-ghost" @click="openImport(b.code)">Impor</button></td>
        </tr>
      </tbody></table></div>
    </article>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Rekening koran</h2><span class="card-note">Klik untuk mencocokkan & memfinalisasi.</span></div></div>
      <div class="table-scroll"><table class="table" data-table="statements">
        <thead><tr><th>Nomor</th><th>Rekening</th><th>Periode</th><th class="ta-r">Saldo akhir</th><th>Baris</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-if="loading && !data"><td colspan="6"><div class="loading">Memuat…</div></td></tr>
          <tr v-for="s in pg.pageRows.value" :key="s.id" data-row :data-statement="s.docNo" @click="go(s.id)">
            <td class="code cell-strong">{{ s.docNo }}</td>
            <td>{{ s.bankName }}<span class="cell-sub"><span class="code">{{ s.bankAccount }}</span> · <BranchTag :code="s.branch" /> · {{ s.source.toUpperCase() }}</span></td>
            <td class="num">{{ F.date(s.from) }} – {{ F.date(s.to) }}</td><td class="ta-r num">{{ F.rpCompact(s.closing) }}</td>
            <td class="num">{{ s.lineCount - s.openCount }}/{{ s.lineCount }}<span v-if="s.openCount" class="cell-sub neg">{{ s.openCount }} terbuka</span></td>
            <td><Pill :status="s.status" /></td>
          </tr>
          <tr v-if="data && !pg.total.value" class="is-static"><td colspan="6" class="muted" style="text-align:center">Belum ada rekening koran diimpor.</td></tr>
        </tbody>
      </table></div>
      <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="rekening koran" />
    </article>
  </section>
  <Modal v-if="show" title="Impor mutasi rekening koran" subtitle="CSV: kolom Tanggal, Keterangan, Referensi (opsional), Debit & Kredit atau Jumlah bertanda, Saldo (opsional). MT940: berkas .sta/.940 dari bank." width="620px" @close="show = false">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="st-bank">Rekening</label>
        <select id="st-bank" v-model="form.bankAccount" class="select"><option v-for="b in perBank.filter((x: any) => !x.open)" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }} ({{ b.branchCode }})</option></select></div>
      <div class="field form-grid-full"><label for="st-file">Berkas mutasi</label><input id="st-file" class="input" type="file" accept=".csv,.txt,.sta,.940,.mt940" data-field="statement-file" @change="pick">
        <span v-if="form.fileName" class="field-hint">{{ form.fileName }} · {{ form.content.split('\n').length }} baris</span></div>
      <div class="field"><label for="st-open">Saldo awal (bila tidak ada di berkas)</label><input id="st-open" v-model="form.opening" class="input num" type="number" style="text-align:right" placeholder="Opsional"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-import" :disabled="busy || !form.bankAccount || !form.content" @click="save"><Icon name="check" /> Impor & cocokkan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="show = false">Batal</button>
    </template>
  </Modal>
</template>
