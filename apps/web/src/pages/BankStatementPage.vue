<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get, post } from '@/lib/api';
import { CASH_TIMELINE } from '@/lib/cash';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { usePaged } from '@/lib/usePaged';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import JournalDrawer from '@/components/JournalDrawer.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const route = useRoute();
const router = useRouter();
const session = useSession();
const toast = useToast();
const id = String(route.params.id);
const st = ref<any>(null);
const busy = ref(false);
const load = async () => { try { st.value = await get(`/cash/statements/${id}`); } catch (e) { toast.error(e, 'Rekening koran tidak dapat dimuat'); router.push('/rekonsiliasi-bank'); } };
onMounted(load);
const editable = computed(() => st.value?.status === 'proses' && session.can('cash.reconcile'));
const isOwn = computed(() => st.value?.createdBy === session.user?.id);
const rec = computed(() => st.value?.reconciliation);

const filter = ref<'' | 'belum' | 'cocok' | 'diabaikan'>('');
const lines = computed(() => (st.value?.lines ?? []).filter((l: any) => !filter.value || l.status === filter.value));
const pg = usePaged<any>(lines, 25);
const pgBook = usePaged<any>(() => st.value?.bookOnly ?? [], 10);

async function act(fn: () => Promise<any>, msg: string, detail = '') {
  busy.value = true;
  try { const r = await fn(); st.value = r; toast.push(msg, detail || st.value.docNo, 'ok'); return r; }
  catch (e) { toast.error(e, 'Tindakan gagal'); } finally { busy.value = false; }
}
const autoMatch = () => act(() => post(`/cash/statements/${id}/auto-match`), 'Pencocokan otomatis dijalankan').then((r) => r && toast.push(`${r.newlyMatched} baris baru cocok`, st.value.docNo, 'ok'));
const finalize = () => act(() => post(`/cash/statements/${id}/finalize`), 'Rekonsiliasi difinalisasi');
const unmatch = (l: any) => act(() => post(`/cash/statements/${id}/lines/${l.id}/unmatch`), 'Pencocokan dilepas', `Baris ${l.lineNo}`);

/* Cocokkan manual: calon = baris buku belum cocok dengan jumlah sama. */
const matching = ref<any | null>(null);
const pickBook = ref<number | null>(null);
const candidates = computed(() => matching.value ? (st.value?.candidates ?? []).filter((b: any) => b.amount === matching.value.amount) : []);
function openMatch(l: any) { matching.value = l; pickBook.value = candidates.value[0]?.id ?? null; }
async function saveMatch() {
  const l = matching.value;
  const r = await act(() => post(`/cash/statements/${id}/lines/${l.id}/match`, { journalLineId: pickBook.value }), 'Baris dicocokkan', `Baris ${l.lineNo}`);
  if (r) matching.value = null;
}

/* Abaikan / jurnal */
const ignoring = ref<any | null>(null);
const ignoreError = ref('');
async function ignore(note: string) {
  ignoreError.value = ''; busy.value = true;
  try { st.value = await post(`/cash/statements/${id}/lines/${ignoring.value.id}/ignore`, { note }); ignoring.value = null; toast.push('Baris diabaikan', st.value.docNo, 'ok'); }
  catch (e) { ignoreError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const journaling = ref<any | null>(null);
const accounts = ref<any[]>([]);
const jForm = ref({ account: '', description: '' });
const jErrors = ref<string[]>([]);
async function openJournal(l: any) {
  jErrors.value = [];
  if (!accounts.value.length) {
    try { accounts.value = ((await get('/ledger/accounts')).accounts ?? []).filter((a: any) => a.type === 'detail' && a.status === 'aktif' && !a.isCash && !a.isComputed && !a.isIntercompany); }
    catch (e) { toast.error(e, 'Bagan akun tidak dapat dimuat'); return; }
  }
  const guess = l.amount < 0 ? accounts.value.find((a) => a.code === '5-4101') : accounts.value.find((a) => a.code === '4-2101');
  jForm.value = { account: guess?.code ?? '', description: l.description };
  journaling.value = l;
}
async function saveJournal() {
  jErrors.value = []; busy.value = true;
  try {
    st.value = await post(`/cash/statements/${id}/lines/${journaling.value.id}/journal`, jForm.value);
    toast.push('Jurnal dibuat — menunggu posting', 'Setelah diposting, jalankan pencocokan otomatis lagi.', 'ok'); journaling.value = null;
  } catch (e) { jErrors.value = errorList(e); } finally { busy.value = false; }
}
const cancelling = ref(false);
const cancelError = ref('');
async function cancel(reason: string) {
  cancelError.value = ''; busy.value = true;
  try { st.value = await post(`/cash/statements/${id}/cancel`, { reason }); cancelling.value = false; toast.push('Rekonsiliasi dibatalkan', st.value.docNo, 'ok'); }
  catch (e) { cancelError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const journalId = ref<string | null>(null);
const accountsFor = computed(() => (journaling.value?.amount ?? 0) < 0 ? accounts.value.filter((a) => a.category === 'Beban' || a.category === 'Liabilitas') : accounts.value.filter((a) => a.category === 'Pendapatan' || a.category === 'Liabilitas' || a.category === 'Aset'));
</script>

<template>
  <div v-if="!st" class="loading">Memuat…</div>
  <template v-else>
    <ReportHead :title="`Rekonsiliasi ${st.bankName}`" :sub="`${st.docNo} · ${st.bankAccount} · ${F.date(st.from)} – ${F.date(st.to)} · ${st.source.toUpperCase()}${st.fileName ? ' · ' + st.fileName : ''} · diimpor ${st.createdByName}`">
      <button class="btn btn-ghost" @click="router.push('/rekonsiliasi-bank')"><Icon name="chevron-left" /> Kembali</button>
      <button v-if="editable" class="btn" data-action="auto-match" :disabled="busy" @click="autoMatch"><Icon name="reconcile" /> Cocokkan otomatis</button>
      <button v-if="st.status === 'proses' && session.can('cash.reconcile.approve') && !isOwn" class="btn btn-primary" data-action="finalize-recon" :disabled="busy || !rec.balanced || rec.counts.open > 0 || rec.openingDifference !== 0" @click="finalize"><Icon name="check" /> Finalisasi</button>
    </ReportHead>
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Saldo rekening koran" :value="F.rpCompact(st.closing)" :foot="`Awal ${F.rpCompact(st.opening)}`" />
      <KpiTile label="Saldo buku disesuaikan" :value="F.rpCompact(rec.adjustedBook)" :foot="`Buku ${F.rpCompact(rec.bookClosing)}`" />
      <KpiTile label="Selisih" :value="F.rp(rec.difference)" :foot="rec.balanced ? 'Seimbang' : 'Periksa saldo awal & pencocokan'" :tone="rec.balanced ? 'pos' : 'neg'" />
      <KpiTile label="Baris mutasi" :value="`${rec.counts.matched + rec.counts.ignored}/${rec.counts.total}`" :foot="rec.counts.open ? `${rec.counts.open} belum cocok` : 'Semua tertangani'" :tone="rec.counts.open ? 'neg' : 'pos'" />
    </div>
    <div v-if="st.status === 'selesai'" class="card" style="padding:var(--sp-3) var(--sp-4);margin-bottom:var(--sp-4);background:var(--ok-soft, var(--surface-2))" data-finalized>
      <b>Difinalisasi</b> oleh {{ st.finalizedByName }} · {{ F.datetime(st.finalizedAt) }}
    </div>
    <div v-else-if="st.status === 'proses' && isOwn && session.can('cash.reconcile.approve')" class="card" style="padding:var(--sp-3) var(--sp-4);margin-bottom:var(--sp-4)"><span class="muted">Anda pengimpor rekening koran ini; finalisasi harus oleh orang lain (kontrol empat mata).</span></div>
    <section class="grid grid-1-2">
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Rekonsiliasi</h2><span class="card-note">Saldo buku disesuaikan harus sama dengan saldo rekening koran.</span></div></div>
        <div class="card-body" data-recon-summary>
          <div class="totals">
            <div class="totals-row"><span>Saldo buku per {{ F.date(st.to) }}</span><b>{{ F.rp(rec.bookClosing) }}</b></div>
            <div class="totals-row"><span>− Setoran dalam perjalanan (buku, belum di bank)</span><b>{{ F.rp(rec.inTransit) }}</b></div>
            <div class="totals-row"><span>+ Pembayaran belum dicairkan bank</span><b>{{ F.rp(rec.outstanding) }}</b></div>
            <div class="totals-row"><span>+ Mutasi bank belum dicocokkan</span><b :class="{ neg: rec.unmatched }">{{ F.rp(rec.unmatched) }}</b></div>
            <div class="totals-row"><span>+ Mutasi bank diabaikan</span><b>{{ F.rp(rec.ignored) }}</b></div>
            <div class="totals-row totals-grand"><span>Saldo buku disesuaikan</span><b>{{ F.rp(rec.adjustedBook) }}</b></div>
            <div class="totals-row"><span>Saldo rekening koran</span><b>{{ F.rp(st.closing) }}</b></div>
            <div class="totals-row"><span>Selisih saldo awal (buku {{ F.rp(rec.bookOpening) }})</span><b :class="{ neg: rec.openingDifference }">{{ F.rp(rec.openingDifference) }}</b></div>
          </div>
        </div>
      </article>
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Mutasi buku belum ada di bank ({{ st.bookOnly.length }})</h2><span class="card-note">Setoran dalam perjalanan & pembayaran yang belum dicairkan.</span></div></div>
        <div class="table-scroll"><table class="table" data-table="book-only"><tbody>
          <tr v-for="b in pgBook.pageRows.value" :key="b.id" :data-row="session.can('ledger.journal.read') ? '' : undefined" :class="{ 'is-static': !session.can('ledger.journal.read') }" @click="session.can('ledger.journal.read') && (journalId = b.journalId)">
            <td class="num">{{ F.date(b.date) }}</td><td><span class="code">{{ b.journalNo }}</span><span class="cell-sub">{{ b.description }}</span></td><td class="ta-r num" :class="{ neg: b.amount < 0 }">{{ F.rp(b.amount) }}</td></tr>
          <tr v-if="!st.bookOnly.length" class="is-static"><td class="muted" style="text-align:center">Semua mutasi buku periode ini sudah muncul di bank.</td></tr>
        </tbody></table></div>
        <Pager v-model:page="pgBook.page.value" v-model:size="pgBook.size.value" :total="pgBook.total.value" label="mutasi" />
      </article>
    </section>
    <article class="card">
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Saring status baris">
          <button v-for="[k, label] in ([['', 'Semua'], ['belum', 'Belum cocok'], ['cocok', 'Cocok'], ['diabaikan', 'Diabaikan']] as const)" :key="k" class="chip" :aria-pressed="filter === k" :data-chip="k || 'all'" @click="filter = k; pg.reset()">{{ label }}
            <span class="chip-count">{{ k ? st.lines.filter((l: any) => l.status === k).length : st.lines.length }}</span></button>
        </div>
      </div>
      <div class="table-scroll"><table class="table" data-table="statement-lines">
        <thead><tr><th>#</th><th>Tanggal</th><th>Keterangan bank</th><th class="ta-r">Jumlah</th><th>Buku / tindakan</th><th>Status</th><th v-if="editable" class="ta-r">Aksi</th></tr></thead>
        <tbody>
          <tr v-for="l in pg.pageRows.value" :key="l.id" class="is-static" :data-line="l.lineNo" :data-line-status="l.status">
            <td class="num">{{ l.lineNo }}</td><td class="num">{{ F.date(l.date) }}</td>
            <td><span class="cell-strong">{{ l.description }}</span><span v-if="l.reference" class="cell-sub code">{{ l.reference }}</span></td>
            <td class="ta-r num" :class="{ neg: l.amount < 0 }">{{ F.rp(l.amount) }}</td>
            <td>
              <template v-if="l.book"><span class="code">{{ l.book.journalNo }}</span><span class="cell-sub">{{ F.date(l.book.date) }} · {{ l.matchKind }}{{ l.matchedByName && l.matchKind === 'manual' ? ` · ${l.matchedByName}` : '' }}</span></template>
              <template v-else-if="l.status === 'diabaikan'"><span class="muted">{{ l.note }}</span></template>
              <template v-else-if="l.createdJournal"><span class="code">{{ l.createdJournal.journalNo }}</span><span class="cell-sub">jurnal {{ l.createdJournal.status === 'pending' ? 'menunggu posting' : l.createdJournal.status }}</span></template>
              <span v-else class="muted">—</span>
            </td>
            <td><Pill :status="l.status" /></td>
            <td v-if="editable" class="ta-r"><div class="row-actions">
              <template v-if="l.status === 'belum'">
                <button class="btn btn-sm btn-ghost" data-action="match-line" @click="openMatch(l)">Cocokkan</button>
                <button v-if="!l.createdJournal || !['pending', 'posted'].includes(l.createdJournal.status)" class="btn btn-sm btn-ghost" data-action="journal-line" @click="openJournal(l)">Buat jurnal</button>
                <button class="btn btn-sm btn-ghost" data-action="ignore-line" @click="ignoring = l; ignoreError = ''">Abaikan</button>
              </template>
              <button v-else class="btn btn-sm btn-ghost" data-action="unmatch-line" :disabled="busy" @click="unmatch(l)">Lepas</button>
            </div></td>
          </tr>
        </tbody>
      </table></div>
      <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="baris" />
    </article>
    <article v-if="st.timeline.length" class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Linimasa</h2></div>
        <button v-if="st.status === 'proses' && (isOwn || session.can('cash.reconcile.approve')) && session.can('cash.reconcile')" class="btn btn-sm btn-ghost neg" data-action="cancel-recon" @click="cancelling = true; cancelError = ''">Batalkan rekonsiliasi</button></div>
      <div class="card-body"><div class="timeline">
        <div v-for="(x, i) in st.timeline" :key="i" class="tl-item">
          <span class="tl-rail"><i class="tl-node" :data-tone="CASH_TIMELINE[x.action]?.tone || undefined"></i><i class="tl-line"></i></span>
          <span class="tl-body"><span class="tl-title"><b>{{ x.actor }}</b> {{ CASH_TIMELINE[x.action]?.label ?? x.action }}<template v-if="x.detail?.matched !== undefined"> ({{ x.detail.matched }} cocok)</template><template v-if="x.detail?.note || x.detail?.reason"> — “{{ x.detail.note ?? x.detail.reason }}”</template></span><span class="tl-meta">{{ F.datetime(x.at) }}</span></span>
        </div>
      </div></div>
    </article>
    <p class="muted" style="font-size:var(--fs-sm)"><BranchTag :code="st.branch" /> Rekening koran hanya dapat diubah selama berstatus dalam proses.</p>
  </template>
  <Modal v-if="matching" :title="`Cocokkan baris ${matching.lineNo}`" :subtitle="`${matching.description} · ${F.rp(matching.amount)} · ${F.date(matching.date)}`" width="620px" @close="matching = null">
    <div class="field"><label for="m-book">Mutasi buku dengan jumlah yang sama</label>
      <select id="m-book" v-model="pickBook" class="select"><option v-for="b in candidates" :key="b.id" :value="b.id">{{ F.date(b.date) }} · {{ b.journalNo }} · {{ b.description }}</option></select>
      <span v-if="!candidates.length" class="field-hint neg">Tidak ada mutasi buku belum cocok dengan jumlah {{ F.rp(matching.amount) }}. Buat jurnal atau abaikan baris ini.</span></div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-match" :disabled="busy || !pickBook" @click="saveMatch"><Icon name="check" /> Cocokkan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="matching = null">Batal</button>
    </template>
  </Modal>
  <Modal v-if="journaling" :title="`Jurnal untuk baris ${journaling.lineNo}`" :subtitle="`${F.rp(journaling.amount)} · ${F.date(journaling.date)}. Jurnal memorial menunggu posting oleh orang lain; setelah diposting, jalankan pencocokan otomatis.`" width="560px" @close="journaling = null">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="j-acc">{{ journaling.amount < 0 ? 'Akun didebit (mis. beban administrasi bank)' : 'Akun dikredit (mis. pendapatan bunga)' }}</label>
        <select id="j-acc" v-model="jForm.account" class="select"><option value="" disabled>— Pilih akun detail —</option><option v-for="a in accountsFor" :key="a.code" :value="a.code">{{ a.code }} · {{ a.name }}</option></select></div>
      <div class="field form-grid-full"><label for="j-desc">Keterangan</label><input id="j-desc" v-model="jForm.description" class="input" maxlength="300"></div>
      <div v-if="jErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in jErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-line-journal" :disabled="busy || !jForm.account" @click="saveJournal"><Icon name="check" /> Buat jurnal</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="journaling = null">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="ignoring" :title="`Abaikan baris ${ignoring.lineNo}?`" :message="`${ignoring.description} · ${F.rp(ignoring.amount)}. Gunakan untuk kesalahan bank yang akan dikoreksi bank sendiri.`" confirm-label="Abaikan baris" :busy="busy" :error="ignoreError" @close="ignoring = null" @confirm="ignore" />
  <ReasonModal v-if="cancelling && st" :title="`Batalkan rekonsiliasi ${st.docNo}?`" message="Seluruh pencocokan dilepas; mutasi dapat diimpor ulang." confirm-label="Batalkan" danger :busy="busy" :error="cancelError" @close="cancelling = false" @confirm="cancel" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" />
</template>
