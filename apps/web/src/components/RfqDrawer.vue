<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { quoteTotals } from '@erp/domain';
import { get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { PROCUREMENT_TIMELINE } from '@/lib/procurement';
import { todayWib } from '@/lib/sales';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from './BranchTag.vue';
import Drawer from './Drawer.vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import Pill from './Pill.vue';
import ReasonModal from './ReasonModal.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: []; changed: []; openRequisition: [id: string]; openOrder: [id: string] }>();
const session = useSession();
const toast = useToast();
const q = ref<any>(null);
const busy = ref(false);
const load = async () => { try { q.value = await get(`/purchasing/rfqs/${props.id}`); } catch (e) { toast.error(e, 'RFQ tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { q.value = null; load(); }, { immediate: true });
const canManage = computed(() => session.can('purchasing.rfq.manage') && q.value?.status === 'terbuka');
const received = computed(() => (q.value?.quotes ?? []).filter((x: any) => x.status === 'masuk'));
const lines = computed(() => q.value?.requisition.lines ?? []);
const priceOf = (x: any, lineNo: number) => x.prices.find((p: any) => p.lineNo === lineNo);

/* Catat penawaran */
const quoteFor = ref<any>(null);
const qf = ref<{ quoteRef: string; quoteDate: string; leadDays: number | ''; validUntil: string; notes: string; prices: Record<number, number | ''>; disc: Record<number, number> }>({ quoteRef: '', quoteDate: todayWib(), leadDays: '', validUntil: '', notes: '', prices: {}, disc: {} });
const qErrors = ref<string[]>([]);
function openQuote(x: any) {
  qErrors.value = [];
  qf.value = {
    quoteRef: x.quoteRef ?? '', quoteDate: x.quoteDate ?? todayWib(), leadDays: x.leadDays ?? '', validUntil: x.validUntil ?? '', notes: x.notes ?? '',
    prices: Object.fromEntries(lines.value.map((l: any) => [l.lineNo, priceOf(x, l.lineNo)?.price ?? ''])), disc: Object.fromEntries(lines.value.map((l: any) => [l.lineNo, priceOf(x, l.lineNo)?.discPct ?? 0])),
  };
  quoteFor.value = x;
}
const qPreview = computed(() => quoteTotals(lines.value.map((l: any) => ({ lineNo: l.lineNo, qty: l.qty, kind: l.kind })),
  lines.value.filter((l: any) => qf.value.prices[l.lineNo] !== '').map((l: any) => ({ lineNo: l.lineNo, price: Math.round(Number(qf.value.prices[l.lineNo]) || 0), discPct: Number(qf.value.disc[l.lineNo]) || 0 }))));
async function saveQuote(declined = false) {
  qErrors.value = []; busy.value = true;
  try {
    const body: any = { supplierId: quoteFor.value.supplierId, notes: qf.value.notes || undefined };
    if (declined) body.declined = true;
    else Object.assign(body, {
      quoteRef: qf.value.quoteRef || undefined, quoteDate: qf.value.quoteDate, leadDays: qf.value.leadDays === '' ? undefined : Number(qf.value.leadDays), validUntil: qf.value.validUntil || null,
      prices: lines.value.filter((l: any) => qf.value.prices[l.lineNo] !== '').map((l: any) => ({ lineNo: l.lineNo, price: Math.round(Number(qf.value.prices[l.lineNo]) || 0), discPct: Number(qf.value.disc[l.lineNo]) || 0 })),
    });
    await post(`/purchasing/rfqs/${props.id}/quotes`, body);
    toast.push(declined ? 'Pemasok tidak menawar' : 'Penawaran dicatat', quoteFor.value.supplierName, 'ok');
    quoteFor.value = null; await load(); emit('changed');
  } catch (e) { qErrors.value = errorList(e); } finally { busy.value = false; }
}

/* Undang pemasok tambahan */
const suppliers = ref<any[]>([]);
const inviteId = ref('');
const showInvite = ref(false);
async function openInvite() {
  inviteId.value = '';
  if (!suppliers.value.length) suppliers.value = (await get('/purchasing/suppliers')).filter((s: any) => !['diblokir', 'nonaktif'].includes(s.status));
  showInvite.value = true;
}
const invitable = computed(() => suppliers.value.filter((s) => !q.value?.quotes.some((x: any) => x.supplierId === s.id)));
async function saveInvite() {
  busy.value = true;
  try { await post(`/purchasing/rfqs/${props.id}/invite`, { supplierId: inviteId.value }); toast.push('Pemasok diundang', q.value.docNo, 'ok'); showInvite.value = false; await load(); emit('changed'); }
  catch (e) { toast.error(e, 'Gagal mengundang'); } finally { busy.value = false; }
}

/* Pemenang */
const awardFor = ref<any>(null);
const awardReason = ref('');
const awardDate = ref(todayWib());
const awardErrors = ref<string[]>([]);
const needReason = computed(() => awardFor.value && (awardFor.value.id !== q.value.bestQuoteId || received.value.length < q.value.minVendors));
function openAward(x: any) { awardErrors.value = []; awardReason.value = ''; awardDate.value = todayWib() < q.value.date ? q.value.date : todayWib(); awardFor.value = x; }
async function saveAward() {
  awardErrors.value = []; busy.value = true;
  try {
    const r = await post(`/purchasing/rfqs/${props.id}/award`, { quoteId: awardFor.value.id, reason: awardReason.value || undefined, orderDate: awardDate.value });
    toast.push('Pemenang dipilih — PO dibuat', `${awardFor.value.supplierName} · ${r.orderNo}`, 'ok');
    awardFor.value = null; await load(); emit('changed');
  } catch (e) { awardErrors.value = errorList(e); } finally { busy.value = false; }
}

const cancelling = ref(false);
const cancelError = ref('');
async function confirmCancel(reason: string) {
  busy.value = true; cancelError.value = '';
  try { await post(`/purchasing/rfqs/${props.id}/cancel`, { reason }); toast.push('RFQ dibatalkan', q.value.docNo, 'ok'); cancelling.value = false; await load(); emit('changed'); }
  catch (e) { cancelError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
</script>

<template>
  <Drawer :title="q?.title ?? 'Memuat…'" :subtitle="q ? `${q.requisition.department} · ${q.requisition.requesterName} · batas penawaran ${F.date(q.deadline)}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="q"><span class="code">{{ q.docNo }}</span><Pill :status="q.status" /><BranchTag :code="q.branch" /></template></template>
    <template v-if="q">
      <div v-if="q.status === 'terbuka'" class="section" :style="q.overdue ? 'background:var(--warn-soft)' : 'background:var(--info-soft, var(--surface-2))'" data-rfq-state>
        <span class="setting-name">{{ received.length }} dari {{ q.quotes.length }} pemasok sudah menawar{{ q.overdue ? ' — batas penawaran terlewati' : '' }}</span>
        <span class="setting-note">Harga terbaik = total terendah. Kurang dari {{ q.minVendors }} penawaran atau memilih selain harga terbaik wajib diberi alasan (tercatat di jejak audit).</span>
      </div>
      <div v-if="q.status === 'dipesan'" class="section" style="background:var(--ok-soft, var(--surface-2))">
        <span class="setting-name">Pemenang: {{ q.quotes.find((x: any) => x.awarded)?.supplierName }} — <a href="#" class="code" data-link="po" @click.prevent="emit('openOrder', q.orderId)">{{ q.orderNo }}</a></span>
        <span class="setting-note">Dipilih {{ q.awardedByName }} · {{ F.datetime(q.awardedAt) }}<template v-if="q.awardReason"> — “{{ q.awardReason }}”</template></span>
      </div>
      <div v-if="q.status === 'batal'" class="section" style="background:var(--danger-soft)"><span class="setting-name">RFQ dibatalkan</span><span class="setting-note">{{ q.cancelReason }}</span></div>
      <div class="section">
        <span class="section-title">Perbandingan penawaran</span>
        <div class="table-scroll"><table class="table" data-table="rfq-quotes">
          <thead><tr><th>Pemasok</th><th>Status</th><th class="ta-r">Total (incl. PPN)</th><th class="ta-r">Kirim</th><th>Berlaku s.d.</th><th></th></tr></thead>
          <tbody><tr v-for="x in q.quotes" :key="x.id" class="is-static" :data-quote="x.supplierCode">
            <td><span class="cell-strong">{{ x.supplierName }}</span><span class="cell-sub">{{ x.supplierCode }}<template v-if="x.quoteRef"> · {{ x.quoteRef }}</template><template v-if="x.notes"> · {{ x.notes }}</template></span></td>
            <td><Pill :status="x.status" /> <Pill v-if="x.best" label="Terbaik" tone="ok" /> <Pill v-if="x.awarded" label="Pemenang" tone="info" /></td>
            <td class="ta-r num">{{ x.total === null ? '—' : F.rp(x.total) }}</td>
            <td class="ta-r num">{{ x.leadDays === null ? '—' : `${x.leadDays} hari` }}</td>
            <td class="num">{{ F.date(x.validUntil) }}</td>
            <td class="ta-r" style="white-space:nowrap">
              <template v-if="canManage">
                <button class="btn btn-sm" data-action="record-quote" @click="openQuote(x)">{{ x.status === 'masuk' ? 'Ubah' : 'Catat' }}</button>
                <button v-if="x.status === 'masuk'" class="btn btn-sm btn-primary" data-action="award" @click="openAward(x)">Pilih</button>
              </template>
            </td>
          </tr></tbody>
        </table></div>
      </div>
      <div class="section">
        <span class="section-title">Harga per baris — <a href="#" class="code" @click.prevent="emit('openRequisition', q.requisitionId)">{{ q.requisitionNo }}</a></span>
        <div class="table-scroll"><table class="table" data-table="rfq-lines">
          <thead><tr><th>Barang / jasa</th><th class="ta-r">Qty</th><th class="ta-r">Perkiraan</th><th v-for="x in received" :key="x.id" class="ta-r">{{ x.supplierCode }}</th></tr></thead>
          <tbody><tr v-for="l in lines" :key="l.id" class="is-static">
            <td><span class="cell-strong">{{ l.description }}</span><span class="cell-sub code">{{ l.sku ?? l.expenseAccount }}</span></td>
            <td class="ta-r num">{{ F.int(l.qty) }} {{ l.unit }}</td><td class="ta-r num">{{ F.rp(l.estPrice) }}</td>
            <td v-for="x in received" :key="x.id" class="ta-r num">{{ F.rp(priceOf(x, l.lineNo)?.price ?? 0) }}<span v-if="priceOf(x, l.lineNo)?.discPct" class="cell-sub">disk. {{ priceOf(x, l.lineNo).discPct }}%</span></td>
          </tr></tbody>
        </table></div>
      </div>
      <div v-if="q.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline">
          <div v-for="(t, i) in q.timeline" :key="i" class="tl-item">
            <span class="tl-rail"><i class="tl-node" :data-tone="PROCUREMENT_TIMELINE[t.action]?.tone || undefined"></i><i class="tl-line"></i></span>
            <span class="tl-body"><span class="tl-title"><b>{{ t.actor }}</b> {{ PROCUREMENT_TIMELINE[t.action]?.label ?? t.action }}<template v-if="t.detail?.supplier"> — {{ t.detail.supplier }}</template><template v-if="t.detail?.total"> ({{ F.rp(t.detail.total) }})</template><template v-if="t.detail?.reason"> — “{{ t.detail.reason }}”</template></span><span class="tl-meta">{{ F.datetime(t.at) }}</span></span>
          </div>
        </div>
      </div>
    </template>
    <template #foot>
      <template v-if="q">
        <button v-if="canManage" class="btn" data-action="invite" :disabled="busy" @click="openInvite"><Icon name="plus" /> Undang pemasok</button>
        <div class="toolbar-spacer"></div>
        <button v-if="canManage" class="btn btn-ghost neg" data-action="cancel-rfq" @click="cancelling = true; cancelError = ''">Batalkan RFQ</button>
        <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <Modal v-if="quoteFor && q" :title="`Penawaran ${quoteFor.supplierName}`" :subtitle="`${q.docNo} · isi harga satuan per baris sesuai dokumen penawaran pemasok.`" width="760px" @close="quoteFor = null">
    <div class="form-grid">
      <div class="field"><label for="qt-ref">No. penawaran</label><input id="qt-ref" v-model="qf.quoteRef" class="input code" maxlength="60"></div>
      <div class="field"><label for="qt-date">Tanggal</label><input id="qt-date" v-model="qf.quoteDate" class="input" type="date"></div>
      <div class="field"><label for="qt-lead">Waktu kirim (hari)</label><input id="qt-lead" v-model.number="qf.leadDays" class="input num" type="number" min="0" max="365" data-field="lead"></div>
      <div class="field"><label for="qt-valid">Berlaku s.d.</label><input id="qt-valid" v-model="qf.validUntil" class="input" type="date" :min="qf.quoteDate"></div>
      <div class="field form-grid-full">
        <div class="table-scroll"><table class="table" data-table="quote-prices">
          <thead><tr><th>Barang / jasa</th><th class="ta-r">Qty</th><th class="ta-r">Harga satuan</th><th class="ta-r">Disk. %</th><th class="ta-r">Jumlah</th></tr></thead>
          <tbody><tr v-for="(l, i) in (lines as any[])" :key="l.id" class="is-static">
            <td><span class="cell-strong">{{ l.description }}</span><span class="cell-sub">perkiraan {{ F.rp(l.estPrice) }}</span></td><td class="ta-r num">{{ F.int(l.qty) }} {{ l.unit }}</td>
            <td class="ta-r"><input v-model.number="qf.prices[l.lineNo]" class="input num" type="number" min="0" step="500" style="width:130px;text-align:right" :aria-label="`Harga ${l.description}`" data-field="quote-price"></td>
            <td class="ta-r"><input v-model.number="qf.disc[l.lineNo]" class="input num" type="number" min="0" max="100" step="0.5" style="width:70px;text-align:right" aria-label="Diskon"></td>
            <td class="ta-r num">{{ F.rp(qPreview.lines[Number(i)] ?? 0) }}</td>
          </tr></tbody>
        </table></div>
        <div class="totals">
          <div class="totals-row"><span>DPP</span><b>{{ F.rp(qPreview.net) }}</b></div><div class="totals-row"><span>PPN 11%</span><b>{{ F.rp(qPreview.ppn) }}</b></div>
          <div class="totals-row totals-grand"><span>Total penawaran</span><b data-quote-total>{{ F.rp(qPreview.total) }}</b></div>
        </div>
      </div>
      <div class="field form-grid-full"><label for="qt-notes">Catatan</label><input id="qt-notes" v-model="qf.notes" class="input" maxlength="300" placeholder="Opsional — garansi, syarat bayar, alasan tidak menawar"></div>
      <div v-if="qErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in qErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-quote" :disabled="busy" @click="saveQuote(false)"><Icon name="check" /> Simpan penawaran</button>
      <button class="btn btn-ghost neg" data-action="decline-quote" :disabled="busy" @click="saveQuote(true)">Pemasok tidak menawar</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="quoteFor = null">Batal</button>
    </template>
  </Modal>
  <Modal v-if="showInvite && q" :title="`Undang pemasok ke ${q.docNo}`" width="480px" @close="showInvite = false">
    <div class="field"><label for="inv-sup">Pemasok</label>
      <select id="inv-sup" v-model="inviteId" class="select"><option value="" disabled>— Pilih pemasok —</option><option v-for="s in invitable" :key="s.id" :value="s.id">{{ s.code }} · {{ s.name }}</option></select></div>
    <template #foot>
      <button class="btn btn-primary" :disabled="busy || !inviteId" data-action="save-invite" @click="saveInvite"><Icon name="send" /> Undang</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showInvite = false">Batal</button>
    </template>
  </Modal>
  <Modal v-if="awardFor && q" :title="`Pilih ${awardFor.supplierName}?`" :subtitle="`PO ${F.rp(awardFor.total)} dibuat dengan harga & waktu kirim penawaran ini, lalu mengikuti alur persetujuan PO. ${q.requisitionNo} menjadi selesai.`" width="560px" @close="awardFor = null">
    <div class="form-grid">
      <div class="field"><label for="aw-date">Tanggal PO</label><input id="aw-date" v-model="awardDate" class="input" type="date" :min="q.date"></div>
      <div class="field form-grid-full"><label for="aw-reason">Alasan pemilihan{{ needReason ? ' (wajib)' : ' (opsional)' }}</label>
        <textarea id="aw-reason" v-model="awardReason" class="textarea" rows="3" maxlength="300" data-field="award-reason" :placeholder="needReason ? 'Bukan harga terbaik / penawaran kurang dari dua — jelaskan (min. 10 karakter)' : 'mis. harga terbaik'"></textarea></div>
      <div v-if="awardErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in awardErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="confirm-award" :disabled="busy" @click="saveAward"><Icon name="cart" /> Pilih & buat PO</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="awardFor = null">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="cancelling" :title="`Batalkan ${q?.docNo}?`" message="Permintaan pembelian kembali siap diproses (RFQ baru atau PO langsung)." confirm-label="Batalkan RFQ" danger :busy="busy" :error="cancelError" @close="cancelling = false" @confirm="confirmCancel" />
</template>
