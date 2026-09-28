<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { get, post } from '@/lib/api';
import { TRANSFER_CHIPS } from '@/lib/cash';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { todayWib } from '@/lib/sales';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import CashTransferDrawer from '@/components/CashTransferDrawer.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const route = useRoute();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/cash/transfers'));
const all = computed(() => data.value ?? []);
const status = ref(String(route.query.status ?? ''));
const q = ref('');
const counts = computed(() => all.value.reduce((m: Record<string, number>, t) => { m[t.status] = (m[t.status] ?? 0) + 1; return m; }, {}));
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((t) => (!status.value || t.status === status.value) && (!s || [t.docNo, t.fromBank, t.toBank, t.fromBankName, t.toBankName, t.reference ?? ''].some((x) => String(x).toLowerCase().includes(s))));
});
const pg = usePaged<any>(filtered, 10);
watch([q, status], pg.reset);
const kpi = computed(() => {
  const waiting = all.value.filter((t) => t.status === 'menunggu');
  const month = todayWib().slice(0, 7);
  const posted = all.value.filter((t) => t.status === 'diposting' && String(t.date).startsWith(month));
  return { waiting: waiting.length, waitingValue: waiting.reduce((s, t) => s + t.amount, 0), posted: posted.reduce((s, t) => s + t.amount, 0),
    inter: posted.filter((t) => t.interBranch).reduce((s, t) => s + t.amount, 0) };
});
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);

/* Formulir */
const banks = ref<any[]>([]);
const show = ref(false);
const form = ref({ fromBank: '', toBank: '', amount: 0, date: todayWib(), reference: '', notes: '' });
const errors = ref<string[]>([]);
const busy = ref(false);
const fromOptions = computed(() => banks.value.filter((b) => b.status === 'aktif' && b.currency === 'IDR' && (session.user?.branches === '*' || (session.user?.branches ?? []).includes(b.branchCode)) && (ctx.branch === 'ALL' || b.branchCode === ctx.branch)));
const toOptions = computed(() => banks.value.filter((b) => b.status === 'aktif' && b.currency === 'IDR' && b.code !== form.value.fromBank));
const from = computed(() => banks.value.find((b) => b.code === form.value.fromBank));
const to = computed(() => banks.value.find((b) => b.code === form.value.toBank));
async function openNew() {
  errors.value = [];
  try { banks.value = (await get('/ledger/bank-accounts', { scoped: false })).accounts ?? []; } catch (e) { toast.error(e, 'Rekening tidak dapat dimuat'); return; }
  form.value = { fromBank: fromOptions.value.find((b) => b.bankName !== 'Kas')?.code ?? '', toBank: '', amount: 0, date: todayWib(), reference: '', notes: '' };
  show.value = true;
}
async function save() {
  errors.value = []; busy.value = true;
  try {
    const r = await post('/cash/transfers', { ...form.value, amount: Math.round(Number(form.value.amount)), reference: form.value.reference || undefined, notes: form.value.notes || undefined });
    toast.push('Transfer diajukan', `${r.docNo} · ${F.rp(r.amount)} — menunggu persetujuan`, 'ok');
    show.value = false; await reload(); openId.value = r.id;
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Transfer Kas & Bank" sub="Pemindahbukuan antar rekening dan setoran kas cabang ↔ kantor pusat. Setiap transfer disetujui orang lain sebelum diposting; transfer antar cabang dijurnal di kedua cabang lewat rekening koran antar kantor (RK) sehingga tereliminasi pada konsolidasi.">
    <button v-if="session.can('cash.transfer.create')" class="btn btn-primary" data-action="new-transfer" @click="openNew"><Icon name="plus" /> Transfer baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Menunggu persetujuan" :value="String(kpi.waiting)" :foot="F.rpCompact(kpi.waitingValue)" :tone="kpi.waiting ? 'neg' : ''" />
    <KpiTile label="Diposting bulan ini" :value="F.rpCompact(kpi.posted)" foot="Semua transfer" />
    <KpiTile label="Antar cabang bulan ini" :value="F.rpCompact(kpi.inter)" foot="Lewat RK" />
    <KpiTile label="Total dokumen" :value="String(all.length)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, rekening, referensi…" aria-label="Cari transfer" data-filter="transfer"></div>
      <div class="chips" role="group" aria-label="Saring status">
        <button v-for="[k, label] in TRANSFER_CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-chip="k || 'all'" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : all.length }}</span></button>
      </div>
    </div>
    <div class="table-scroll"><table class="table" data-table="transfers">
      <thead><tr><th>Nomor</th><th>Tanggal</th><th>Dari</th><th>Ke</th><th class="ta-r">Nilai</th><th>Diajukan</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="7"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="t in pg.pageRows.value" :key="t.id" data-row :data-transfer="t.docNo" @click="openId = t.id">
          <td class="code cell-strong">{{ t.docNo }}</td><td class="num">{{ F.date(t.date) }}</td>
          <td><span class="cell-strong">{{ t.fromBankName }}</span><span class="cell-sub"><span class="code">{{ t.fromBank }}</span> · <BranchTag :code="t.branch" /></span></td>
          <td><span class="cell-strong">{{ t.toBankName }}</span><span class="cell-sub"><span class="code">{{ t.toBank }}</span> · <BranchTag :code="t.toBranch" /><template v-if="t.interBranch"> · RK</template></span></td>
          <td class="ta-r num">{{ F.rpCompact(t.amount) }}</td><td>{{ t.createdByName }}</td><td><Pill :status="t.status" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="7"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada transfer</span><span class="empty-note">Ubah kata kunci, status, atau cabang.</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="transfer" />
  </article>
  <CashTransferDrawer v-if="openId" :id="openId" @close="openId = null" @changed="reload" />
  <Modal v-if="show" title="Transfer baru" subtitle="Saldo buku rekening sumber harus cukup pada tanggal transfer. Transfer diposting setelah disetujui orang lain." width="620px" @close="show = false">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="tr-from">Dari rekening</label>
        <select id="tr-from" v-model="form.fromBank" class="select"><option value="" disabled>— Pilih rekening sumber —</option><option v-for="b in fromOptions" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }} ({{ b.branchCode }}) — saldo {{ F.rpCompact(b.balance) }}</option></select></div>
      <div class="field form-grid-full"><label for="tr-to">Ke rekening</label>
        <select id="tr-to" v-model="form.toBank" class="select"><option value="" disabled>— Pilih rekening tujuan —</option><option v-for="b in toOptions" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }} ({{ b.branchCode }})</option></select>
        <span v-if="from && to" class="field-hint" data-transfer-hint>{{ from.branchCode === to.branchCode ? 'Satu cabang: satu jurnal pemindahbukuan.' : `Antar cabang ${from.branchCode} → ${to.branchCode}: jurnal di kedua cabang lewat RK.` }}</span></div>
      <div class="field"><label for="tr-amount">Nilai (Rp)</label><input id="tr-amount" v-model.number="form.amount" class="input num" type="number" min="1" step="1" style="text-align:right"></div>
      <div class="field"><label for="tr-date">Tanggal</label><input id="tr-date" v-model="form.date" class="input" type="date"></div>
      <div class="field"><label for="tr-ref">Referensi</label><input id="tr-ref" v-model="form.reference" class="input" maxlength="80" placeholder="Mis. slip setoran"></div>
      <div class="field"><label for="tr-notes">Catatan</label><input id="tr-notes" v-model="form.notes" class="input" maxlength="300"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-transfer" :disabled="busy || !form.fromBank || !form.toBank || !(form.amount > 0)" @click="save"><Icon name="send" /> Ajukan transfer</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="show = false">Batal</button>
    </template>
  </Modal>
</template>
