<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { CASH_TIMELINE } from '@/lib/cash';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { todayWib } from '@/lib/sales';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Drawer from '@/components/Drawer.vue';
import Icon from '@/components/Icon.vue';
import JournalDrawer from '@/components/JournalDrawer.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pill from '@/components/Pill.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const session = useSession();
const toast = useToast();
const months = computed(() => session.periods.filter((p: any) => (p.group ?? p.period_group) === 'Bulan' || /^\d{4}-\d{2}$/.test(p.id ?? p.code)).map((p: any) => ({ id: p.id ?? p.code, label: p.label, status: p.status })));
const period = ref(/^\d{4}-\d{2}$/.test(ctx.period ?? '') ? ctx.period : todayWib().slice(0, 7));
const preview = ref<any>(null);
const list = ref<any[]>([]);
const loading = ref(false);
const denied = ref('');
async function load() {
  loading.value = true; denied.value = '';
  try { [preview.value, list.value] = await Promise.all([get(`/cash/tax/ppn?period=${period.value}`), get('/cash/tax/settlements')]); }
  catch (e: any) { denied.value = errorList(e).join(' '); preview.value = null; } finally { loading.value = false; }
}
watch(period, load, { immediate: true });

const busy = ref(false);
async function createDraft() {
  busy.value = true;
  try { const r = await post('/cash/tax/settlements', { period: period.value }); toast.push('Draf setoran dibuat', `${r.docNo} · ${F.rp(r.net)}`, 'ok'); await load(); openId.value = r.id; }
  catch (e) { toast.error(e, 'Draf tidak dapat dibuat'); } finally { busy.value = false; }
}

/* Laci setoran */
const openId = ref<string | null>(null);
const doc = ref<any>(null);
watch(openId, async (v) => { doc.value = null; if (v) { try { doc.value = await get(`/cash/tax/settlements/${v}`); } catch (e) { toast.error(e, 'Setoran tidak dapat dimuat'); openId.value = null; } } });
const isOwn = computed(() => doc.value?.createdBy === session.user?.id);
async function act(fn: () => Promise<any>, msg: string) {
  busy.value = true;
  try { doc.value = await fn(); toast.push(msg, doc.value.docNo, 'ok'); await load(); }
  catch (e) { toast.error(e, 'Tindakan gagal'); } finally { busy.value = false; }
}
const postDoc = () => act(() => post(`/cash/tax/settlements/${openId.value}/post`), 'Setoran diposting');
const paying = ref(false);
const banks = ref<any[]>([]);
const payForm = ref({ bankAccount: '', date: todayWib(), ntpn: '' });
const payErrors = ref<string[]>([]);
async function openPay() {
  payErrors.value = [];
  try { banks.value = ((await get('/ledger/bank-accounts', { scoped: false })).accounts ?? []).filter((b: any) => b.branchCode === doc.value.branch && b.status === 'aktif' && b.currency === 'IDR' && b.bankName !== 'Kas'); }
  catch (e) { toast.error(e, 'Rekening tidak dapat dimuat'); return; }
  payForm.value = { bankAccount: banks.value[0]?.code ?? '', date: todayWib() < doc.value.settleDate ? doc.value.settleDate : todayWib(), ntpn: '' };
  paying.value = true;
}
async function savePay() {
  payErrors.value = []; busy.value = true;
  try { doc.value = await post(`/cash/tax/settlements/${openId.value}/pay`, payForm.value); paying.value = false; toast.push('Pembayaran PPN dicatat', `NTPN ${doc.value.ntpn}`, 'ok'); await load(); }
  catch (e) { payErrors.value = errorList(e); } finally { busy.value = false; }
}
const cancelling = ref(false);
const cancelError = ref('');
async function cancel(reason: string) {
  cancelError.value = ''; busy.value = true;
  try { doc.value = await post(`/cash/tax/settlements/${openId.value}/cancel`, { reason }); cancelling.value = false; toast.push('Setoran dibatalkan', doc.value.docNo, 'ok'); await load(); }
  catch (e) { cancelError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const journalId = ref<string | null>(null);
</script>

<template>
  <ReportHead title="Setoran Pajak — PPN Masa" sub="PPN dipusatkan di kantor pusat: tiap cabang menutup saldo PPN keluaran & masukannya ke kantor pusat lewat RK; kantor pusat mencatat kurang bayar sebagai utang pajak lalu menyetorkannya dengan NTPN. Lebih bayar dikompensasikan ke masa berikutnya.">
    <select v-model="period" class="select" style="width:auto" aria-label="Masa pajak" data-field="tax-period">
      <option v-for="m in months" :key="m.id" :value="m.id">{{ m.label }}{{ m.status !== 'open' ? ' (ditutup)' : '' }}</option>
    </select>
  </ReportHead>
  <div v-if="denied" class="card" style="padding:var(--sp-4)"><span class="neg">{{ denied }}</span></div>
  <div v-else-if="loading && !preview" class="loading">Memuat…</div>
  <template v-else-if="preview">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="PPN keluaran (saldo)" :value="F.rpCompact(preview.output)" :foot="`Mutasi masa ini ${F.rpCompact(preview.activity.output)}`" />
      <KpiTile label="PPN masukan (saldo)" :value="F.rpCompact(preview.input)" :foot="`Mutasi masa ini ${F.rpCompact(preview.activity.input)}`" />
      <KpiTile :label="preview.net >= 0 ? 'Kurang bayar' : 'Lebih bayar'" :value="F.rpCompact(Math.abs(preview.net))" :foot="`Per ${F.date(preview.period.to)}`" :tone="preview.net > 0 ? 'neg' : 'pos'" />
      <KpiTile label="Status masa" :value="preview.existing ? preview.existing.docNo : 'Belum disetor'" :foot="preview.existing ? preview.existing.statusLabel : preview.period.label" />
    </div>
    <section class="grid grid-1-2">
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Saldo PPN per cabang</h2><span class="card-note">Per akhir masa {{ preview.period.label }} · akun {{ preview.accounts.ppnOut }} / {{ preview.accounts.ppnIn }}.</span></div></div>
        <div class="table-scroll"><table class="table" data-table="ppn-branches">
          <thead><tr><th>Cabang</th><th class="ta-r">Keluaran</th><th class="ta-r">Masukan</th><th class="ta-r">Selisih</th></tr></thead>
          <tbody>
            <tr v-for="b in preview.branches" :key="b.branch" class="is-static"><td><BranchTag :code="b.branch" /><span v-if="b.branch === preview.headOffice" class="cell-sub">kantor pusat</span></td>
              <td class="ta-r num">{{ F.rp(b.output) }}</td><td class="ta-r num">{{ F.rp(b.input) }}</td><td class="ta-r num" :class="{ neg: b.net > 0 }">{{ F.rp(b.net) }}</td></tr>
            <tr v-if="!preview.branches.length" class="is-static"><td colspan="4" class="muted" style="text-align:center">Tidak ada saldo PPN per akhir masa.</td></tr>
          </tbody>
          <tfoot v-if="preview.branches.length"><tr><td><b>Total</b></td><td class="ta-r num"><b>{{ F.rp(preview.output) }}</b></td><td class="ta-r num"><b>{{ F.rp(preview.input) }}</b></td><td class="ta-r num"><b>{{ F.rp(preview.net) }}</b></td></tr></tfoot>
        </table></div>
        <div class="card-body" style="display:flex;gap:var(--sp-2);align-items:center;flex-wrap:wrap">
          <button v-if="!preview.existing && preview.branches.length && session.can('tax.settlement.create')" class="btn btn-primary" data-action="create-tax" :disabled="busy || preview.period.status !== 'open'" @click="createDraft"><Icon name="plus" /> Buat draf setoran masa ini</button>
          <button v-else-if="preview.existing" class="btn" data-action="open-existing-tax" @click="openId = preview.existing.id">Buka {{ preview.existing.docNo }}</button>
          <span v-if="preview.period.status !== 'open'" class="muted">Masa sudah ditutup.</span>
        </div>
      </article>
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Riwayat setoran</h2><span class="card-note">Seluruh masa.</span></div></div>
        <div class="table-scroll"><table class="table" data-table="tax-settlements"><tbody>
          <tr v-for="t in list" :key="t.id" data-row :data-tax="t.docNo" @click="openId = t.id">
            <td class="code cell-strong">{{ t.docNo }}</td><td>{{ t.period }}</td><td class="ta-r num">{{ F.rp(t.net) }}</td><td><Pill :status="t.status" :label="t.statusLabel" /></td></tr>
          <tr v-if="!list.length" class="is-static"><td class="muted" style="text-align:center">Belum ada setoran.</td></tr>
        </tbody></table></div>
      </article>
    </section>
  </template>

  <Drawer v-if="openId" :title="doc ? `PPN masa ${doc.period}` : 'Memuat…'" :subtitle="doc ? `${doc.net >= 0 ? 'Kurang bayar' : 'Lebih bayar'} ${F.rp(Math.abs(doc.net))} · dibuat ${doc.createdByName}` : ''" @close="openId = null">
    <template #eyebrow><template v-if="doc"><span class="code">{{ doc.docNo }}</span><Pill :status="doc.status" :label="doc.statusLabel" /><BranchTag :code="doc.branch" /></template></template>
    <template v-if="doc">
      <div v-if="doc.status === 'draf'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)"><span class="setting-name">Draf — belum memengaruhi buku besar</span>
        <span class="setting-note">{{ isOwn ? 'Anda pembuat draf; posting harus oleh orang lain.' : 'Posting menutup saldo PPN setiap cabang per akhir masa.' }}</span></div>
      <div class="section">
        <span class="section-title">Rincian</span>
        <dl class="deflist">
          <dt>Masa</dt><dd>{{ doc.period }} (akhir {{ F.date(doc.settleDate) }})</dd>
          <dt>PPN keluaran</dt><dd class="num">{{ F.rp(doc.output) }}</dd>
          <dt>PPN masukan</dt><dd class="num">{{ F.rp(doc.input) }}</dd>
          <dt>{{ doc.net >= 0 ? 'Kurang bayar' : 'Lebih bayar' }}</dt><dd class="num"><b>{{ F.rp(Math.abs(doc.net)) }}</b></dd>
          <dt v-if="doc.postedByName">Diposting</dt><dd v-if="doc.postedByName">{{ doc.postedByName }} · {{ F.datetime(doc.postedAt) }}</dd>
          <dt v-if="doc.ntpn">Dibayar</dt><dd v-if="doc.ntpn">{{ F.date(doc.paymentDate) }} · {{ doc.bankAccount }} · NTPN <span class="code">{{ doc.ntpn }}</span></dd>
          <dt v-if="doc.cancelReason">Dibatalkan</dt><dd v-if="doc.cancelReason">{{ doc.cancelReason }}</dd>
        </dl>
      </div>
      <div class="section">
        <span class="section-title">Per cabang</span>
        <div class="table-scroll"><table class="table"><tbody>
          <tr v-for="b in doc.details" :key="b.branch" class="is-static"><td><BranchTag :code="b.branch" /></td><td class="ta-r num">{{ F.rp(b.output) }}</td><td class="ta-r num">{{ F.rp(b.input) }}</td><td class="ta-r num">{{ F.rp(b.output - b.input) }}</td></tr>
        </tbody></table></div>
      </div>
      <div v-if="doc.journals.length" class="section">
        <span class="section-title">Jurnal ({{ doc.journals.length }})</span>
        <div class="table-scroll"><table class="table" data-table="tax-journals"><tbody>
          <tr v-for="j in doc.journals" :key="j.id" :data-row="session.can('ledger.journal.read') ? '' : undefined" :class="{ 'is-static': !session.can('ledger.journal.read') }" @click="session.can('ledger.journal.read') && (journalId = j.id)">
            <td class="code cell-strong">{{ j.journalNo }}</td><td><BranchTag :code="j.branch" /></td><td>{{ j.rule }}<span class="cell-sub">{{ F.date(j.date) }}</span></td><td class="ta-r num">{{ F.rp(j.total) }}</td><td><Pill :status="j.status" /></td></tr>
        </tbody></table></div>
      </div>
      <div v-if="doc.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(x, i) in doc.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="CASH_TIMELINE[x.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ x.actor }}</b> {{ CASH_TIMELINE[x.action]?.label ?? x.action }}<template v-if="x.detail?.reason"> — “{{ x.detail.reason }}”</template></span><span class="tl-meta">{{ F.datetime(x.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="doc">
        <button v-if="doc.status === 'draf' && session.can('tax.settlement.post') && !isOwn" class="btn btn-primary" data-action="post-tax" :disabled="busy" @click="postDoc"><Icon name="check" /> Posting setoran</button>
        <button v-if="doc.status === 'diposting' && doc.net > 0 && session.can('tax.settlement.create')" class="btn btn-primary" data-action="pay-tax" :disabled="busy" @click="openPay"><Icon name="send" /> Catat pembayaran</button>
        <div class="toolbar-spacer"></div>
        <button v-if="(doc.status === 'draf' && (isOwn || session.can('tax.settlement.post'))) || (doc.status === 'diposting' && session.can('tax.settlement.post'))" class="btn btn-ghost neg" data-action="cancel-tax" @click="cancelling = true; cancelError = ''">Batalkan</button>
        <button class="btn btn-ghost" @click="openId = null">Tutup</button>
      </template>
    </template>
  </Drawer>
  <Modal v-if="paying && doc" :title="`Bayar PPN masa ${doc.period}`" :subtitle="`${F.rp(doc.net)} dari rekening kantor pusat. Jurnal Dr utang pajak / Cr bank diposting.`" width="520px" @close="paying = false">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="tx-bank">Rekening ({{ doc.branch }})</label><select id="tx-bank" v-model="payForm.bankAccount" class="select"><option v-for="b in banks" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }}</option></select></div>
      <div class="field"><label for="tx-date">Tanggal setor</label><input id="tx-date" v-model="payForm.date" class="input" type="date" :min="doc.settleDate"></div>
      <div class="field"><label for="tx-ntpn">NTPN</label><input id="tx-ntpn" v-model="payForm.ntpn" class="input code" maxlength="16" placeholder="16 karakter"></div>
      <div v-if="payErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in payErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-tax-pay" :disabled="busy || !payForm.bankAccount || payForm.ntpn.length !== 16" @click="savePay"><Icon name="check" /> Simpan pembayaran</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="paying = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="cancelling && doc" :title="`Batalkan ${doc.docNo}?`" :message="doc.status === 'diposting' ? 'Jurnal setoran di semua cabang dibalik.' : 'Draf dibatalkan.'" confirm-label="Batalkan setoran" danger :busy="busy" :error="cancelError" @close="cancelling = false" @confirm="cancel" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" />
</template>
