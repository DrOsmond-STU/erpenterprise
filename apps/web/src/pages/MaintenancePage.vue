<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { ASSET_TIMELINE, MAINT_CHIPS } from '@/lib/assets';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { todayWib } from '@/lib/sales';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Drawer from '@/components/Drawer.vue';
import Icon from '@/components/Icon.vue';
import JournalDrawer from '@/components/JournalDrawer.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReasonModal from '@/components/ReasonModal.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/assets/maintenance'));
const all = computed(() => data.value ?? []);
const status = ref('');
const counts = computed(() => all.value.reduce((m: Record<string, number>, x) => { m[x.status] = (m[x.status] ?? 0) + 1; return m; }, {}));
const filtered = computed(() => all.value.filter((m) => !status.value || m.status === status.value));
const pg = usePaged<any>(filtered, 10);
watch(status, pg.reset);
const today = todayWib();
const kpi = computed(() => {
  const open = all.value.filter((m) => m.status === 'dijadwalkan' || m.status === 'berjalan');
  const month = today.slice(0, 7);
  return { open: open.length, overdue: open.filter((m) => m.scheduledDate < today).length, est: open.reduce((t, m) => t + m.estimatedCost, 0),
    cost: all.value.filter((m) => m.status === 'selesai' && String(m.completedDate).startsWith(month)).reduce((t, m) => t + (m.totalCost ?? 0), 0) };
});
const canManage = computed(() => session.can('asset.manage'));

/* Laci */
const openId = ref<string | null>(null);
const m = ref<any>(null);
const loadOne = async () => { if (!openId.value) { m.value = null; return; } try { m.value = await get(`/assets/maintenance/${openId.value}`); } catch (e) { toast.error(e, 'Perintah tidak dapat dimuat'); openId.value = null; } };
watch(openId, loadOne);
const busy = ref(false);
const changed = async (t: string) => { toast.push(t, m.value?.docNo ?? '', 'ok'); await Promise.all([reload(), loadOne()]); };
async function start() { busy.value = true; try { await post(`/assets/maintenance/${openId.value}/start`); await changed('Pekerjaan dimulai'); } catch (e) { toast.error(e, 'Gagal'); } finally { busy.value = false; } }
const cancelling = ref(false);
const cancelError = ref('');
async function cancel(reason: string) {
  busy.value = true; cancelError.value = '';
  try { await post(`/assets/maintenance/${openId.value}/cancel`, { reason }); cancelling.value = false; await changed('Perintah dibatalkan'); } catch (e) { cancelError.value = errorList(e).join(' '); } finally { busy.value = false; }
}
const journalId = ref<string | null>(null);

/* Selesaikan */
const completing = ref(false);
const banks = ref<any[]>([]);
const stock = ref<any[]>([]);
const done = ref({ date: todayWib(), serviceCost: 0, bank: '', notes: '', parts: [] as { warehouse: string; sku: string; qty: number | null }[] });
const doneErrors = ref<string[]>([]);
async function openComplete() {
  doneErrors.value = [];
  try {
    [banks.value, stock.value] = await Promise.all([get('/ledger/bank-accounts', { scoped: false }).then((r) => (r.accounts ?? []).filter((b: any) => b.status === 'aktif' && b.currency === 'IDR' && b.branchCode === m.value.branch)),
      get('/inventory/stock', { scoped: false }).then((r) => r.items.filter((i: any) => i.branch === m.value.branch && i.onHand > 0))]);
  } catch (e) { toast.error(e, 'Data tidak dapat dimuat'); return; }
  done.value = { date: todayWib(), serviceCost: m.value.estimatedCost, bank: banks.value.find((b) => b.bankName === 'Kas')?.code ?? banks.value[0]?.code ?? '', notes: '', parts: [] };
  completing.value = true;
}
const itemOf = (wh: string, sku: string) => stock.value.find((i) => i.warehouse === wh && i.sku === sku);
const partsCost = computed(() => done.value.parts.reduce((t, p) => t + (itemOf(p.warehouse, p.sku) ? Math.round(Number(p.qty || 0) * itemOf(p.warehouse, p.sku).avgCost) : 0), 0));
async function saveComplete() {
  busy.value = true; doneErrors.value = [];
  try {
    const d = done.value;
    await post(`/assets/maintenance/${openId.value}/complete`, { date: d.date, serviceCost: Math.round(Number(d.serviceCost || 0)), bank: Number(d.serviceCost) > 0 ? d.bank : undefined, notes: d.notes || undefined,
      parts: d.parts.filter((p) => p.sku && Number(p.qty) > 0).map((p) => ({ warehouse: p.warehouse, sku: p.sku, qty: Number(p.qty) })) });
    completing.value = false; await changed('Pemeliharaan selesai — biaya dijurnal');
  } catch (e) { doneErrors.value = errorList(e); } finally { busy.value = false; }
}

/* Baru */
const show = ref(false);
const assets = ref<any[]>([]);
const form = ref({ assetId: '', kind: 'preventif', priority: 'sedang', assignee: '', scheduledDate: todayWib(), description: '', estimatedCost: 0 });
const errors = ref<string[]>([]);
async function openNew() {
  errors.value = [];
  try { assets.value = (await get('/assets')).assets.filter((a: any) => a.status === 'aktif'); } catch (e) { toast.error(e, 'Aset tidak dapat dimuat'); return; }
  form.value = { assetId: assets.value[0]?.id ?? '', kind: 'preventif', priority: 'sedang', assignee: '', scheduledDate: todayWib(), description: '', estimatedCost: 0 };
  show.value = true;
}
async function save() {
  busy.value = true; errors.value = [];
  try { const r = await post('/assets/maintenance', { ...form.value, assignee: form.value.assignee || undefined, estimatedCost: Math.round(Number(form.value.estimatedCost || 0)) }); toast.push('Pemeliharaan dijadwalkan', r.docNo, 'ok'); show.value = false; await reload(); openId.value = r.id; }
  catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Pemeliharaan Aset" sub="Perintah pemeliharaan preventif & korektif. Saat selesai, biaya jasa (dibayar dari kas/bank cabang) dan suku cadang yang diambil dari stok dijurnal ke beban pemeliharaan.">
    <button v-if="canManage" class="btn btn-primary" data-action="new-maintenance" @click="openNew"><Icon name="plus" /> Jadwalkan</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Terbuka" :value="String(kpi.open)" :foot="ctx.branchShort" />
    <KpiTile label="Lewat jadwal" :value="String(kpi.overdue)" foot="Belum selesai" :tone="kpi.overdue ? 'neg' : ''" />
    <KpiTile label="Estimasi biaya terbuka" :value="F.rpCompact(kpi.est)" foot="Belum dijurnal" />
    <KpiTile label="Biaya bulan ini" :value="F.rpCompact(kpi.cost)" foot="5-3401" />
  </div>
  <article class="card">
    <div class="toolbar"><div class="chips" role="group" aria-label="Saring status">
      <button v-for="[k, label] in MAINT_CHIPS" :key="k" class="chip" :aria-pressed="status === k" @click="status = k">{{ label }} <span class="chip-count">{{ k ? counts[k] ?? 0 : all.length }}</span></button>
    </div></div>
    <div class="table-scroll"><table class="table" data-table="maintenance">
      <thead><tr><th>Nomor</th><th>Aset</th><th>Jenis</th><th>Jadwal</th><th>Petugas</th><th class="ta-r">Biaya</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="7"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="x in pg.pageRows.value" :key="x.id" data-row :data-mnt="x.docNo" @click="openId = x.id">
          <td class="code cell-strong">{{ x.docNo }}</td>
          <td><span class="cell-strong">{{ x.assetName }}</span><span class="cell-sub"><span class="code">{{ x.assetCode }}</span> · <BranchTag :code="x.branch" /></span></td>
          <td>{{ x.kind === 'korektif' ? 'Korektif' : 'Preventif' }}<span class="cell-sub">{{ x.description }}</span></td>
          <td class="num" :class="{ neg: (x.status === 'dijadwalkan' || x.status === 'berjalan') && x.scheduledDate < today }">{{ F.date(x.scheduledDate) }}</td>
          <td>{{ x.assignee || '—' }}</td><td class="ta-r num">{{ F.rpCompact(x.totalCost ?? x.estimatedCost) }}<span v-if="x.totalCost === null" class="cell-sub">estimasi</span></td>
          <td><Pill :status="x.status" /></td>
        </tr>
        <tr v-if="data && !filtered.length" class="is-static"><td colspan="7"><div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada perintah</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="perintah" />
  </article>

  <Drawer v-if="openId" :title="m ? m.assetName : 'Memuat…'" :subtitle="m ? `${m.description} · ${F.date(m.scheduledDate)}` : ''" @close="openId = null">
    <template #eyebrow><template v-if="m"><span class="code">{{ m.docNo }}</span><Pill :status="m.status" /><BranchTag :code="m.branch" /></template></template>
    <template v-if="m">
      <div class="section"><dl class="deflist">
        <dt>Aset</dt><dd>{{ m.assetCode }} · {{ m.assetName }}</dd>
        <dt>Jenis / prioritas</dt><dd>{{ m.kind }} · {{ m.priority }}</dd>
        <dt>Petugas</dt><dd>{{ m.assignee || '—' }}</dd>
        <dt>Estimasi</dt><dd class="num">{{ F.rp(m.estimatedCost) }}</dd>
        <template v-if="m.status === 'selesai'"><dt>Biaya jasa</dt><dd class="num">{{ F.rp(m.serviceCost ?? 0) }}<template v-if="m.bank"> · {{ m.bank }}</template></dd><dt>Suku cadang</dt><dd class="num">{{ F.rp(m.partsCost ?? 0) }}</dd>
          <dt>Total</dt><dd class="num cell-strong" data-mnt-total>{{ F.rp(m.totalCost) }}</dd><dt>Selesai</dt><dd>{{ F.date(m.completedDate) }}<template v-if="m.completedByName"> · {{ m.completedByName }}</template><template v-if="m.legacy"> · data awal</template></dd></template>
        <dt v-if="m.notes">Catatan</dt><dd v-if="m.notes">{{ m.notes }}</dd>
      </dl></div>
      <div v-if="m.parts.length" class="section"><span class="section-title">Suku cadang</span>
        <div class="table-scroll"><table class="table"><tbody><tr v-for="p in m.parts" :key="p.sku" class="is-static"><td>{{ p.name }}<span class="cell-sub code">{{ p.sku }} · {{ p.warehouse }}</span></td><td class="ta-r num">{{ F.int(p.qty) }}</td><td class="ta-r num">{{ F.rp(p.value) }}</td></tr></tbody></table></div></div>
      <div v-if="m.journals.length" class="section"><span class="section-title">Jurnal</span>
        <div class="table-scroll"><table class="table" data-table="mnt-journals"><tbody>
          <tr v-for="j in m.journals" :key="j.id" :data-row="session.can('ledger.journal.read') ? '' : undefined" @click="session.can('ledger.journal.read') && (journalId = j.id)"><td class="code cell-strong">{{ j.journalNo }}</td><td>{{ F.date(j.date) }}</td><td class="ta-r num">{{ F.rp(j.total) }}</td><td><Pill :status="j.status" /></td></tr>
        </tbody></table></div></div>
      <div v-if="m.timeline.length" class="section"><span class="section-title">Linimasa</span>
        <div class="timeline"><div v-for="(x, i) in m.timeline" :key="i" class="tl-item"><span class="tl-rail"><i class="tl-node" :data-tone="ASSET_TIMELINE[x.action]?.tone || undefined"></i><i class="tl-line"></i></span>
          <span class="tl-body"><span class="tl-title"><b>{{ x.actor }}</b> {{ ASSET_TIMELINE[x.action]?.label ?? x.action }}</span><span class="tl-meta">{{ F.datetime(x.at) }}</span></span></div></div></div>
    </template>
    <template #foot><template v-if="m">
      <button v-if="canManage && m.status === 'dijadwalkan'" class="btn" data-action="start-maintenance" :disabled="busy" @click="start">Mulai</button>
      <button v-if="canManage && (m.status === 'dijadwalkan' || m.status === 'berjalan')" class="btn btn-primary" data-action="complete-maintenance" :disabled="busy" @click="openComplete"><Icon name="check" /> Selesaikan</button>
      <div class="toolbar-spacer"></div>
      <button v-if="canManage && (m.status === 'dijadwalkan' || m.status === 'berjalan')" class="btn btn-ghost neg" @click="cancelling = true; cancelError = ''">Batalkan</button>
      <button class="btn btn-ghost" @click="openId = null">Tutup</button>
    </template></template>
  </Drawer>

  <Modal v-if="completing && m" title="Selesaikan pemeliharaan" :subtitle="`${m.docNo} · ${m.assetName}`" width="680px" @close="completing = false">
    <div class="form-grid">
      <div class="field"><label for="mc-date">Tanggal selesai</label><input id="mc-date" v-model="done.date" class="input" type="date"></div>
      <div class="field"><label for="mc-cost">Biaya jasa (Rp)</label><input id="mc-cost" v-model.number="done.serviceCost" class="input num" type="number" min="0" step="1000" style="text-align:right"></div>
      <div v-if="done.serviceCost > 0" class="field"><label for="mc-bank">Dibayar dari</label><select id="mc-bank" v-model="done.bank" class="select"><option v-for="b in banks" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }}</option></select></div>
      <div class="field"><label for="mc-notes">Catatan</label><input id="mc-notes" v-model="done.notes" class="input" maxlength="300"></div>
      <div class="field form-grid-full">
        <div class="table-scroll"><table class="table" data-table="mc-parts"><thead><tr><th>Suku cadang dari stok</th><th class="ta-r">Qty</th><th class="ta-r">Nilai</th><th></th></tr></thead>
          <tbody><tr v-for="(p, i) in done.parts" :key="i" class="is-static" data-line>
            <td><select class="select" :value="`${p.warehouse}|${p.sku}`" aria-label="Barang" data-field="part" @change="[p.warehouse, p.sku] = ($event.target as HTMLSelectElement).value.split('|')"><option value="|" disabled>— Pilih barang —</option>
              <option v-for="it in stock" :key="it.warehouse + it.sku" :value="`${it.warehouse}|${it.sku}`">{{ it.sku }} · {{ it.name }} ({{ it.warehouse }}, {{ F.int(it.onHand) }} {{ it.uom }})</option></select></td>
            <td><input v-model.number="p.qty" class="input num" type="number" min="0" step="any" style="width:90px;text-align:right" aria-label="Qty" data-field="qty"></td>
            <td class="ta-r num">{{ itemOf(p.warehouse, p.sku) ? F.rp(Math.round(Number(p.qty || 0) * itemOf(p.warehouse, p.sku).avgCost)) : '—' }}</td>
            <td><button class="btn btn-icon btn-ghost" aria-label="Hapus" @click="done.parts.splice(i, 1)"><Icon name="minus" /></button></td></tr>
          <tr v-if="!done.parts.length" class="is-static"><td colspan="4"><span class="muted">Tidak ada suku cadang.</span></td></tr></tbody></table></div>
        <div style="display:flex;align-items:center;gap:var(--sp-3);margin-top:var(--sp-2)"><button class="btn btn-sm btn-ghost" data-action="add-part" @click="done.parts.push({ warehouse: '', sku: '', qty: null })"><Icon name="plus" /> Tambah suku cadang</button>
          <div class="toolbar-spacer"></div><span>Total biaya: <b class="num">{{ F.rp(Number(done.serviceCost || 0) + partsCost) }}</b></span></div>
      </div>
      <div v-if="doneErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in doneErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-complete-maintenance" :disabled="busy || (Number(done.serviceCost || 0) + partsCost) <= 0" @click="saveComplete"><Icon name="check" /> Selesai & posting</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="completing = false">Batal</button>
    </template>
  </Modal>

  <Modal v-if="show" title="Jadwalkan pemeliharaan" width="600px" @close="show = false">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="mn-asset">Aset</label><select id="mn-asset" v-model="form.assetId" class="select"><option v-for="a in assets" :key="a.id" :value="a.id">{{ a.code }} · {{ a.name }} ({{ a.branch }})</option></select></div>
      <div class="field"><label for="mn-kind">Jenis</label><select id="mn-kind" v-model="form.kind" class="select"><option value="preventif">Preventif</option><option value="korektif">Korektif</option></select></div>
      <div class="field"><label for="mn-prio">Prioritas</label><select id="mn-prio" v-model="form.priority" class="select"><option value="rendah">Rendah</option><option value="sedang">Sedang</option><option value="tinggi">Tinggi</option></select></div>
      <div class="field"><label for="mn-date">Jadwal</label><input id="mn-date" v-model="form.scheduledDate" class="input" type="date"></div>
      <div class="field"><label for="mn-who">Petugas</label><input id="mn-who" v-model="form.assignee" class="input" maxlength="80"></div>
      <div class="field form-grid-full"><label for="mn-desc">Uraian pekerjaan</label><input id="mn-desc" v-model="form.description" class="input" maxlength="300"></div>
      <div class="field"><label for="mn-est">Estimasi biaya (Rp)</label><input id="mn-est" v-model.number="form.estimatedCost" class="input num" type="number" min="0" step="1000" style="text-align:right"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-maintenance" :disabled="busy || !form.assetId || form.description.trim().length < 3" @click="save"><Icon name="check" /> Jadwalkan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="show = false">Batal</button>
    </template>
  </Modal>
  <ReasonModal v-if="cancelling && m" :title="`Batalkan ${m.docNo}?`" message="Perintah batal tidak dapat diaktifkan kembali." confirm-label="Batalkan" danger :busy="busy" :error="cancelError" @close="cancelling = false" @confirm="cancel" />
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" />
</template>
