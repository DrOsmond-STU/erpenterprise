<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get, post } from '@/lib/api';
import { DUNNING_COLOR, DUNNING_TONE, KIND_LABEL, PROMISE, todayWib } from '@/lib/crm';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import ActivityPanel from '@/components/ActivityPanel.vue';
import BranchTag from '@/components/BranchTag.vue';
import Drawer from '@/components/Drawer.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const route = useRoute();
const router = useRouter();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any>(() => get('/crm/collections'));
const level = ref<number | null>(null);
const promiseFilter = ref('');
const q = ref('');
const rows = computed<any[]>(() => {
  const s = q.value.trim().toLowerCase();
  return (data.value?.items ?? []).filter((i: any) => (level.value === null || i.dunning.level === level.value) && (!promiseFilter.value || (promiseFilter.value === 'none' ? !i.promise : i.promise?.status === promiseFilter.value))
    && (!s || [i.invoiceNo, i.customerName, i.customerCode].some((x) => String(x ?? '').toLowerCase().includes(s))))
    .sort((a: any, b: any) => b.overdueDays - a.overdueDays || b.open - a.open);
});
const pg = usePaged(rows);
const maxLevel = computed(() => Math.max(1, ...(data.value?.byLevel ?? []).map((b: any) => b.value)));
const canAct = computed(() => session.can('crm.collection'));

/* Detail penagihan per faktur */
const sel = ref<any>(null);
const panel = ref<any>(null);
watch(() => [route.query.invoice, data.value] as const, ([id]) => { if (id && data.value) sel.value = data.value.items.find((i: any) => i.invoiceId === id) ?? null; }, { immediate: true });
function refreshSel() { reload().then(() => { if (sel.value) sel.value = data.value?.items.find((i: any) => i.invoiceId === sel.value.invoiceId) ?? null; }); }

const busy = ref(false);
const log = ref<any>(null);
const logErr = ref<string[]>([]);
async function saveLog() {
  busy.value = true; logErr.value = [];
  try { await post('/crm/collections/log', { invoiceId: sel.value.invoiceId, kind: log.value.kind, note: log.value.note, nextDate: log.value.nextDate || null }); log.value = null; toast.push('Kontak penagihan dicatat', sel.value.invoiceNo, 'ok'); panel.value?.load(); refreshSel(); }
  catch (e) { logErr.value = errorList(e); } finally { busy.value = false; }
}
const prom = ref<any>(null);
const promErr = ref<string[]>([]);
async function savePromise() {
  busy.value = true; promErr.value = [];
  try { await post('/crm/collections/promises', { invoiceId: sel.value.invoiceId, promiseDate: prom.value.date, amount: Math.round(Number(prom.value.amount) || 0), note: prom.value.note || null }); prom.value = null; toast.push('Janji bayar dicatat', sel.value.invoiceNo, 'ok'); panel.value?.load(); refreshSel(); }
  catch (e) { promErr.value = errorList(e); } finally { busy.value = false; }
}
async function cancelPromise() {
  try { await post(`/crm/collections/promises/${sel.value.promise.id}/cancel`); toast.push('Janji bayar dibatalkan', sel.value.invoiceNo, 'ok'); refreshSel(); } catch (e) { toast.error(e, 'Janji tidak dapat dibatalkan'); }
}
const hold = ref<any>(null);
async function saveHold() {
  busy.value = true;
  try { await post(`/crm/collections/customers/${hold.value.customerId}/hold`, { reason: hold.value.reason }); toast.push('Kredit pelanggan ditahan', `${hold.value.customerName} — pesanan baru memerlukan persetujuan manajer`, 'ok'); hold.value = null; refreshSel(); }
  catch (e) { toast.error(e, 'Pelanggan tidak dapat ditahan'); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Penagihan Piutang" sub="Faktur jatuh tempo dan akan jatuh tempo (7 hari) per tingkat penagihan. Kontak, janji bayar, dan tahan kredit tercatat per faktur; janji otomatis “ditepati” saat penerimaan piutang (dijurnal ke kas/bank & piutang usaha) mencapai nilainya.">
    <button class="btn" @click="router.push('/piutang')"><Icon name="wallet" /> Umur piutang</button>
  </ReportHead>
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <template v-else-if="data">
    <div class="kpi-row" style="margin-bottom:var(--sp-4)">
      <KpiTile label="Piutang jatuh tempo" :value="F.rpCompact(data.summary.overdue)" :foot="`${data.summary.overdueCount} faktur`" :tone="data.summary.overdue ? 'neg' : ''" />
      <KpiTile label="Jatuh tempo ≤ 7 hari" :value="F.rpCompact(data.summary.dueSoon)" foot="Kirim pengingat" />
      <KpiTile label="Janji bayar menunggu" :value="String(data.summary.promisesWaiting)" :foot="`${data.summary.promisesBroken} janji diingkari`" :tone="data.summary.promisesBroken ? 'neg' : ''" />
      <KpiTile label="Belum dihubungi" :value="String(data.summary.notContacted)" foot="Faktur lewat tempo tanpa kontak" :tone="data.summary.notContacted ? 'neg' : ''" />
    </div>
    <section class="grid grid-1-2">
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Tingkat penagihan</h2><span class="card-note">Klik untuk menyaring.</span></div></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:var(--sp-2)" data-dunning>
          <button v-for="b in data.byLevel" :key="b.level" type="button" :data-level="b.level" :aria-pressed="level === b.level"
            style="all:unset;cursor:pointer;display:grid;grid-template-columns:130px 1fr auto;gap:var(--sp-2);align-items:center;padding:4px 6px;border-radius:var(--r-sm)"
            :style="level === b.level ? 'background:var(--surface-2)' : ''" @click="level = level === b.level ? null : b.level">
            <span style="font-size:var(--fs-sm)">{{ b.label }}<span class="cell-sub">{{ b.count }} faktur</span></span>
            <span style="height:12px;background:var(--surface-2);border-radius:6px;overflow:hidden"><span :style="{ display: 'block', height: '100%', width: (b.value / maxLevel) * 100 + '%', background: DUNNING_COLOR[b.level], borderRadius: '6px' }"></span></span>
            <span class="num" style="font-size:var(--fs-sm);min-width:90px;text-align:right">{{ F.rpCompact(b.value) }}</span>
          </button>
        </div>
      </article>
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Usulan tahan kredit</h2><span class="card-note">Pelanggan aktif dengan faktur di tingkat eskalasi (&gt; 90 hari).</span></div></div>
        <div class="card-body">
          <div v-if="!data.holdSuggestions.length" class="muted">Tidak ada usulan.</div>
          <div v-for="h in data.holdSuggestions" :key="h.customerId" style="display:flex;align-items:center;gap:var(--sp-2);padding:6px 0;border-bottom:1px solid var(--line-faint)" :data-hold="h.customerName">
            <a href="#" class="link-btn cell-strong" @click.prevent="router.push(`/pelanggan/${h.customerId}`)">{{ h.customerName }}</a><div class="toolbar-spacer"></div>
            <button v-if="canAct && session.can('sales.customer.manage')" class="btn btn-sm btn-danger" data-action="hold-customer" @click="hold = { ...h, reason: 'Eskalasi penagihan: faktur lewat 90 hari' }">Tahan kredit</button>
          </div>
        </div>
      </article>
    </section>
    <article class="card">
      <div class="card-head" style="flex-wrap:wrap;gap:var(--sp-2)">
        <div class="card-head-text"><h2 class="card-title">Daftar tagih</h2></div><div class="toolbar-spacer"></div>
        <select v-model="promiseFilter" class="select" style="max-width:200px" aria-label="Saring janji"><option value="">Semua janji</option><option value="none">Tanpa janji</option><option v-for="(p, k) in PROMISE" :key="k" :value="k">{{ p.label }}</option></select>
        <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari faktur / pelanggan…" aria-label="Cari"></div>
      </div>
      <div class="table-scroll"><table class="table" data-table="collections">
        <thead><tr><th>Faktur</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Pelanggan</th><th>Jatuh tempo</th><th class="ta-r">Sisa</th><th>Tingkat</th><th>Kontak terakhir</th><th>Janji bayar</th></tr></thead>
        <tbody>
          <tr v-for="i in pg.pageRows.value" :key="i.invoiceId" data-row :data-invoice="i.invoiceNo" @click="sel = i">
            <td class="code cell-strong">{{ i.invoiceNo }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="i.branch" /></td>
            <td><span class="cell-strong">{{ i.customerName }}</span><span class="cell-sub">{{ i.customerPic ?? '' }} {{ i.customerPhone ?? '' }}</span><Pill v-if="i.customerStatus === 'ditahan'" status="ditahan" /></td>
            <td class="num">{{ F.date(i.dueDate) }}<span class="cell-sub" :class="{ neg: i.overdueDays }">{{ i.overdueDays ? `${i.overdueDays} hari lewat` : 'belum jatuh tempo' }}</span></td>
            <td class="ta-r num">{{ F.rpCompact(i.open) }}</td>
            <td><Pill :label="i.dunning.label" :tone="DUNNING_TONE[i.dunning.level]" /></td>
            <td class="num">{{ i.lastContact ? F.date(i.lastContact) : '—' }}<span class="cell-sub">{{ i.contacts }} kontak</span></td>
            <td><template v-if="i.promise"><Pill :label="PROMISE[i.promise.status]?.label" :tone="PROMISE[i.promise.status]?.tone" /><span class="cell-sub num">{{ F.date(i.promise.date) }} · {{ F.rpCompact(i.promise.amount) }}</span></template><span v-else class="muted">—</span></td>
          </tr>
          <tr v-if="!pg.total.value" class="is-static"><td colspan="8" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada faktur untuk ditagih.</td></tr>
        </tbody>
      </table></div>
      <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="faktur" />
    </article>
  </template>

  <Drawer v-if="sel" :title="`Penagihan ${sel.invoiceNo}`" :subtitle="`${sel.customerName} · sisa ${F.rp(sel.open)} · jatuh tempo ${F.date(sel.dueDate)}`" @close="sel = null; router.replace({ query: {} })">
    <template #eyebrow><Pill :label="sel.dunning.label" :tone="DUNNING_TONE[sel.dunning.level]" /><BranchTag :code="sel.branch" /><Pill v-if="sel.customerStatus === 'ditahan'" status="ditahan" /></template>
    <div class="section" style="background:var(--surface-2)"><span class="setting-name">Langkah disarankan</span><span class="setting-note">{{ sel.dunning.action }}</span></div>
    <div class="section">
      <span class="section-title">Tagihan</span>
      <div class="totals">
        <div class="totals-row"><span>Total faktur</span><b>{{ F.rp(sel.total) }}</b></div>
        <div class="totals-row"><span>Sudah diterima</span><b>{{ F.rp(sel.paid) }}</b></div>
        <div class="totals-row totals-grand"><span>Sisa</span><b>{{ F.rp(sel.open) }}</b></div>
      </div>
      <div style="display:flex;gap:var(--sp-2);margin-top:var(--sp-2)">
        <button class="btn btn-sm" @click="router.push({ path: '/faktur', query: { id: sel.invoiceId } })"><Icon name="invoice" /> Buka faktur & catat penerimaan</button>
        <button v-if="sel.customerId" class="btn btn-sm" @click="router.push(`/pelanggan/${sel.customerId}`)"><Icon name="users" /> Profil 360</button>
      </div>
    </div>
    <div class="section" data-promise>
      <span class="section-title">Janji bayar</span>
      <div v-if="sel.promise" style="display:flex;align-items:center;gap:var(--sp-2)"><Pill :label="PROMISE[sel.promise.status]?.label" :tone="PROMISE[sel.promise.status]?.tone" /><span class="num">{{ F.date(sel.promise.date) }} · {{ F.rp(sel.promise.amount) }}</span><span class="muted">{{ sel.promise.note }}</span>
        <div class="toolbar-spacer"></div><button v-if="canAct && sel.promise.status !== 'ditepati'" class="btn btn-sm btn-ghost" @click="cancelPromise">Batalkan</button></div>
      <div v-else class="muted">Belum ada janji bayar aktif.</div>
    </div>
    <div class="section"><span class="section-title">Riwayat penagihan</span><ActivityPanel ref="panel" :link="{ invoiceId: sel.invoiceId }" /></div>
    <template #foot>
      <template v-if="canAct">
        <button class="btn btn-primary" data-action="log-collection" @click="log = { kind: 'telepon', note: '', nextDate: '' }; logErr = []"><Icon name="bell" /> Catat kontak</button>
        <button class="btn" data-action="new-promise" @click="prom = { date: todayWib(), amount: sel.open, note: '' }; promErr = []"><Icon name="calendar" /> Janji bayar</button>
        <button v-if="sel.customerId && sel.customerStatus === 'aktif' && session.can('sales.customer.manage')" class="btn btn-danger" data-action="hold-customer" @click="hold = { customerId: sel.customerId, customerName: sel.customerName, reason: '' }">Tahan kredit</button>
      </template>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="sel = null">Tutup</button>
    </template>
  </Drawer>

  <Modal v-if="log && sel" :title="`Catat kontak — ${sel.invoiceNo}`" subtitle="Tercatat di riwayat faktur & profil pelanggan. Tanggal tindak lanjut membuat tugas penagihan." width="520px" @close="log = null">
    <div class="form-grid">
      <div class="field"><label for="cl-kind">Cara</label><select id="cl-kind" v-model="log.kind" class="select"><option v-for="k in ['telepon', 'email', 'kunjungan', 'penagihan']" :key="k" :value="k">{{ KIND_LABEL[k] }}</option></select></div>
      <div class="field"><label for="cl-next">Tindak lanjut</label><input id="cl-next" v-model="log.nextDate" class="input" type="date" data-field="coll-next"></div>
      <div class="field form-grid-full"><label for="cl-note">Hasil</label><textarea id="cl-note" v-model="log.note" class="textarea" rows="3" maxlength="1000" data-field="coll-note"></textarea></div>
      <div v-if="logErr.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in logErr" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="save-collection" :disabled="busy" @click="saveLog"><Icon name="check" /> Simpan</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="log = null">Batal</button></template>
  </Modal>
  <Modal v-if="prom && sel" :title="`Janji bayar — ${sel.invoiceNo}`" subtitle="Menggantikan janji aktif sebelumnya. Status dihitung dari penerimaan faktur sejak janji dibuat." width="520px" @close="prom = null">
    <div class="form-grid">
      <div class="field"><label for="pr-date">Tanggal janji</label><input id="pr-date" v-model="prom.date" class="input" type="date" :min="todayWib()" data-field="promise-date"></div>
      <div class="field"><label for="pr-amt">Nilai (Rp)</label><input id="pr-amt" v-model.number="prom.amount" class="input num" type="number" min="1" :max="sel.open" style="text-align:right" data-field="promise-amount"><span class="field-hint">Maks. sisa {{ F.rp(sel.open) }}</span></div>
      <div class="field form-grid-full"><label for="pr-note">Catatan</label><input id="pr-note" v-model="prom.note" class="input" maxlength="500"></div>
      <div v-if="promErr.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in promErr" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="save-promise" :disabled="busy" @click="savePromise"><Icon name="check" /> Simpan</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="prom = null">Batal</button></template>
  </Modal>
  <Modal v-if="hold" :title="`Tahan kredit ${hold.customerName}?`" subtitle="Status pelanggan menjadi “ditahan”: setiap pesanan penjualan baru otomatis menunggu persetujuan manajer. Dapat dibuka kembali dari data pelanggan." width="480px" @close="hold = null">
    <div class="field"><label for="hd-reason">Alasan</label><textarea id="hd-reason" v-model="hold.reason" class="textarea" rows="3" maxlength="300" data-field="hold-reason"></textarea></div>
    <template #foot><button class="btn btn-danger" data-action="confirm-hold" :disabled="busy || hold.reason.trim().length < 3" @click="saveHold">Tahan kredit</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="hold = null">Batal</button></template>
  </Modal>
</template>
