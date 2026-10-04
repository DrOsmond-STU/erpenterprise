<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get, patch, post } from '@/lib/api';
import { CATEGORY, CRM_TIMELINE_FULL, PRIORITY, SLA_HOURS, TICKET_FLOW, TICKET_STATUS } from '@/lib/crm';
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
const { data, loading, reload } = useLoader<any>(() => get('/crm/tickets'));
const party = ref(String(route.query.party ?? ''));
const statusF = ref('open');
const q = ref('');
const rows = computed<any[]>(() => {
  const s = q.value.trim().toLowerCase();
  return (data.value?.rows ?? []).filter((t: any) => (!party.value || t.partyType === party.value)
    && (statusF.value === 'all' || (statusF.value === 'open' ? !['selesai', 'ditutup'].includes(t.status) : t.status === statusF.value))
    && (!s || [t.code, t.subject, t.partyName, t.invoiceNo, t.purchaseOrderNo].some((x) => String(x ?? '').toLowerCase().includes(s))));
});
const pg = usePaged(rows);
const canManage = computed(() => session.can('crm.ticket'));

/* Detail */
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);
watch(() => route.query.id, (v) => { if (v) openId.value = String(v); });
const t = ref<any>(null);
const load = async () => { if (!openId.value) { t.value = null; return; } try { t.value = await get(`/crm/tickets/${openId.value}`); } catch (e) { toast.error(e, 'Tiket tidak dapat dimuat'); openId.value = null; } };
watch(openId, load, { immediate: true });
const busy = ref(false);
const st = ref<any>(null);
const stErr = ref<string[]>([]);
function openStatus(s: string) { stErr.value = []; st.value = { status: s, resolution: t.value.resolution ?? '', satisfaction: 0, note: '' }; }
async function saveStatus() {
  busy.value = true; stErr.value = [];
  const s = st.value;
  try {
    t.value = await post(`/crm/tickets/${t.value.id}/status`, { status: s.status, resolution: s.status === 'selesai' ? s.resolution : null, satisfaction: s.status === 'ditutup' && s.satisfaction ? s.satisfaction : null, note: s.note || null });
    st.value = null; toast.push(`Tiket ${TICKET_STATUS[t.value.status].label.toLowerCase()}`, t.value.code, 'ok'); reload();
  } catch (e) { stErr.value = errorList(e); } finally { busy.value = false; }
}
async function setPriority(p: string) {
  try { t.value = { ...t.value, ...(await patch(`/crm/tickets/${t.value.id}`, { priority: p })) }; toast.push('Prioritas diubah — SLA dihitung ulang', t.value.code, 'ok'); reload(); load(); } catch (e) { toast.error(e, 'Prioritas tidak dapat diubah'); }
}

/* Tiket baru */
const nf = ref<any>(null);
const nfErr = ref<string[]>([]);
const lists = ref<{ customers: any[]; suppliers: any[]; invoices: any[]; orders: any[]; pos: any[] }>({ customers: [], suppliers: [], invoices: [], orders: [], pos: [] });
async function openNew(preset: any = {}) {
  nfErr.value = [];
  const can = (p: string) => session.can(p);
  const [customers, suppliers, invoices, orders, pos] = await Promise.all([
    can('sales.invoice.read') ? get('/sales/customers').catch(() => []) : [], can('purchasing.invoice.read|purchasing.receipt.create') ? get('/purchasing/suppliers').catch(() => []) : [],
    can('sales.invoice.read') ? get('/sales/invoices').then((r: any) => r.rows ?? r).catch(() => []) : [], can('sales.invoice.read') ? get('/sales/orders').then((r: any) => r.rows ?? r).catch(() => []) : [],
    can('purchasing.invoice.read|purchasing.receipt.create') ? get('/purchasing/orders').then((r: any) => r.rows ?? r).catch(() => []) : [],
  ]);
  lists.value = { customers, suppliers, invoices, orders, pos };
  nf.value = { partyType: 'customer', customerId: '', supplierId: '', invoiceId: '', salesOrderId: '', purchaseOrderId: '', subject: '', description: '', category: 'produk', priority: 'sedang', assigneeName: '', ...preset };
}
const invFor = computed(() => lists.value.invoices.filter((i: any) => i.customerId === nf.value?.customerId && !['draf', 'batal'].includes(i.status)));
const soFor = computed(() => lists.value.orders.filter((o: any) => o.customerId === nf.value?.customerId));
const poFor = computed(() => lists.value.pos.filter((o: any) => o.supplierId === nf.value?.supplierId && !['draf', 'batal'].includes(o.status)));
async function saveNew() {
  busy.value = true; nfErr.value = [];
  const f = nf.value;
  const cust = f.partyType === 'customer';
  const body: any = { partyType: f.partyType, subject: f.subject, description: f.description || null, category: f.category, priority: f.priority, assigneeName: f.assigneeName || null,
    customerId: cust ? f.customerId || null : null, supplierId: cust ? null : f.supplierId || null, invoiceId: cust ? f.invoiceId || null : null, salesOrderId: cust ? f.salesOrderId || null : null, purchaseOrderId: cust ? null : f.purchaseOrderId || null };
  if (ctx.branch !== 'ALL') body.branch = ctx.branch;
  try { const r = await post('/crm/tickets', body); nf.value = null; toast.push('Tiket dibuat', `${r.code} · SLA ${F.datetime(r.slaDueAt)}`, 'ok'); reload(); openId.value = r.id; }
  catch (e) { nfErr.value = errorList(e); } finally { busy.value = false; }
}
watch(() => route.query.new, (v) => { if (v && canManage.value) openNew({ partyType: String(route.query.party ?? 'customer'), customerId: String(route.query.customerId ?? ''), supplierId: String(route.query.supplierId ?? ''), invoiceId: String(route.query.invoiceId ?? ''), purchaseOrderId: String(route.query.poId ?? '') }); }, { immediate: true });
const slaLeft = (x: any) => {
  const h = Math.round((new Date(x.slaDueAt).getTime() - Date.now()) / 3_600_000);
  return h < 0 ? `lewat ${Math.abs(h)} jam` : h < 48 ? `${h} jam lagi` : `${Math.round(h / 24)} hari lagi`;
};
</script>

<template>
  <ReportHead title="Tiket Layanan" sub="Keluhan pelanggan (tertaut faktur / pesanan penjualan) dan klaim ke pemasok (tertaut pesanan pembelian). SLA ditentukan prioritas: kritis 4 jam, tinggi 24 jam, sedang 3 hari, rendah 5 hari.">
    <button v-if="canManage" class="btn btn-primary" data-action="new-ticket" @click="openNew()"><Icon name="plus" /> Tiket baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Tiket terbuka" :value="String(data?.summary.open ?? 0)" :foot="`${data?.summary.supplierClaims ?? 0} klaim ke pemasok`" />
    <KpiTile label="Melewati SLA" :value="String(data?.summary.breached ?? 0)" foot="Masih terbuka" :tone="data?.summary.breached ? 'neg' : ''" />
    <KpiTile label="Selesai sesuai SLA" :value="data?.summary.slaMet === null || data?.summary.slaMet === undefined ? '—' : F.pct(data.summary.slaMet)" foot="Tiket terselesaikan" />
    <KpiTile label="Kepuasan rata-rata" :value="data?.summary.avgSatisfaction ? `${F.dec(data.summary.avgSatisfaction)} / 5` : '—'" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="card-head" style="flex-wrap:wrap;gap:var(--sp-2)">
      <div class="segmented" role="group" aria-label="Pihak">
        <button :aria-pressed="party === ''" @click="party = ''">Semua</button><button :aria-pressed="party === 'customer'" data-ticket-party="customer" @click="party = 'customer'">Keluhan pelanggan</button><button :aria-pressed="party === 'supplier'" data-ticket-party="supplier" @click="party = 'supplier'">Klaim pemasok</button>
      </div>
      <div class="toolbar-spacer"></div>
      <select v-model="statusF" class="select" style="max-width:180px" aria-label="Saring status"><option value="open">Terbuka</option><option value="all">Semua status</option><option v-for="(s, k) in TICKET_STATUS" :key="k" :value="k">{{ s.label }}</option></select>
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari kode, judul, pihak, dokumen…" aria-label="Cari tiket"></div>
    </div>
    <div v-if="loading && !data" class="loading">Memuat…</div>
    <div v-else class="table-scroll"><table class="table" data-table="tickets">
      <thead><tr><th>Kode</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Judul</th><th>Pihak</th><th>Dokumen</th><th>Prioritas</th><th>SLA</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="x in pg.pageRows.value" :key="x.id" data-row :data-ticket="x.code" @click="openId = x.id">
          <td class="code cell-strong">{{ x.code }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="x.branch" /></td>
          <td><span class="cell-strong">{{ x.subject }}</span><span class="cell-sub">{{ CATEGORY[x.category] }}</span></td>
          <td>{{ x.partyName }}<span class="cell-sub">{{ x.partyType === 'customer' ? 'Pelanggan' : 'Pemasok' }}</span></td>
          <td class="code">{{ x.invoiceNo ?? x.salesOrderNo ?? x.purchaseOrderNo ?? '—' }}</td>
          <td><Pill :label="PRIORITY[x.priority].label" :tone="PRIORITY[x.priority].tone" /></td>
          <td class="num" :class="{ neg: x.breached }">{{ ['selesai', 'ditutup'].includes(x.status) ? (x.breached ? 'Terlambat' : 'Tepat') : slaLeft(x) }}</td>
          <td><Pill :label="TICKET_STATUS[x.status].label" :tone="TICKET_STATUS[x.status].tone" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="8" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada tiket.</td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="tiket" />
  </article>

  <Drawer v-if="openId && t" :title="t.subject" :subtitle="`${t.partyType === 'customer' ? 'Pelanggan' : 'Pemasok'} ${t.partyName} · ${CATEGORY[t.category]} · SLA ${F.datetime(t.slaDueAt)}`" @close="openId = null; router.replace({ query: {} })">
    <template #eyebrow><span class="code">{{ t.code }}</span><Pill :label="TICKET_STATUS[t.status].label" :tone="TICKET_STATUS[t.status].tone" /><Pill :label="PRIORITY[t.priority].label" :tone="PRIORITY[t.priority].tone" /><BranchTag :code="t.branch" /><Pill v-if="t.breached" label="Melewati SLA" tone="danger" /></template>
    <div v-if="t.resolution" class="section" style="background:var(--surface-2)"><span class="setting-name">Resolusi</span><span class="setting-note" style="white-space:pre-line">{{ t.resolution }}</span><span v-if="t.satisfaction" class="setting-note">Kepuasan {{ '★'.repeat(t.satisfaction) }}{{ '☆'.repeat(5 - t.satisfaction) }}</span></div>
    <div class="section">
      <span class="section-title">Rincian</span>
      <dl class="deflist">
        <dt>{{ t.partyType === 'customer' ? 'Pelanggan' : 'Pemasok' }}</dt><dd><a href="#" class="link-btn" @click.prevent="router.push(t.partyType === 'customer' ? `/pelanggan/${t.customerId}` : `/pemasok/${t.supplierId}`)">{{ t.partyName }}</a></dd>
        <template v-if="t.invoiceNo"><dt>Faktur</dt><dd><a href="#" class="link-btn code" @click.prevent="router.push({ path: '/faktur', query: { id: t.invoiceId } })">{{ t.invoiceNo }}</a></dd></template>
        <template v-if="t.salesOrderNo"><dt>Pesanan penjualan</dt><dd><a href="#" class="link-btn code" @click.prevent="router.push({ path: '/pesanan-penjualan', query: { id: t.salesOrderId } })">{{ t.salesOrderNo }}</a></dd></template>
        <template v-if="t.purchaseOrderNo"><dt>Pesanan pembelian</dt><dd><a href="#" class="link-btn code" @click.prevent="router.push({ path: '/pesanan-pembelian', query: { id: t.purchaseOrderId } })">{{ t.purchaseOrderNo }}</a></dd></template>
        <dt>Penanggung jawab</dt><dd>{{ t.assigneeName ?? '—' }}</dd><dt>Dibuka</dt><dd>{{ t.createdByName }} · {{ F.datetime(t.createdAt) }}</dd>
        <dt v-if="t.description">Uraian</dt><dd v-if="t.description" style="white-space:pre-line">{{ t.description }}</dd>
      </dl>
      <div v-if="canManage && !['selesai', 'ditutup'].includes(t.status)" class="chips" role="group" aria-label="Prioritas" style="margin-top:var(--sp-2)">
        <button v-for="(p, k) in PRIORITY" :key="k" class="chip" :aria-pressed="t.priority === k" :disabled="t.priority === k" :data-priority="k" @click="setPriority(String(k))">{{ p.label }} · {{ SLA_HOURS[k] }} jam</button>
      </div>
    </div>
    <div class="section"><span class="section-title">Aktivitas</span><ActivityPanel :link="{ ticketId: t.id }" :initial="t.activities" :can-add="canManage && t.status !== 'ditutup'" @changed="load" /></div>
    <div class="section">
      <span class="section-title">Riwayat</span>
      <div class="timeline"><div v-for="(e, i) in t.timeline" :key="i" class="tl-item"><span class="tl-rail"><i class="tl-node" :data-tone="CRM_TIMELINE_FULL[e.action]?.tone || undefined"></i><i class="tl-line"></i></span>
        <span class="tl-body"><span class="tl-title"><b>{{ e.actor }}</b> {{ CRM_TIMELINE_FULL[e.action]?.label ?? e.action }}<template v-if="e.detail?.status"> → {{ TICKET_STATUS[e.detail.status]?.label ?? e.detail.status }}</template></span><span class="tl-meta">{{ F.datetime(e.at) }}</span></span></div></div>
    </div>
    <template #foot>
      <template v-if="canManage">
        <button v-for="s in TICKET_FLOW[t.status]" :key="s" class="btn" :class="{ 'btn-primary': s === 'selesai' || s === 'ditutup' }" :data-ticket-to="s" @click="openStatus(s)">{{ s === 'diproses' && t.status === 'selesai' ? 'Buka kembali' : TICKET_STATUS[s].label }}</button>
      </template>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="openId = null">Tutup</button>
    </template>
  </Drawer>

  <Modal v-if="st && t" :title="`${t.code} → ${TICKET_STATUS[st.status].label}`" :subtitle="st.status === 'selesai' ? 'Resolusi wajib diisi dan dikirim ke pihak terkait.' : st.status === 'ditutup' ? 'Tutup tiket setelah pihak terkait mengonfirmasi; catat kepuasan.' : 'Catatan perubahan status (opsional).'" width="520px" @close="st = null">
    <div class="form-grid">
      <div v-if="st.status === 'selesai'" class="field form-grid-full"><label for="ts-res">Resolusi</label><textarea id="ts-res" v-model="st.resolution" class="textarea" rows="3" maxlength="2000" data-field="ticket-resolution"></textarea></div>
      <div v-if="st.status === 'ditutup'" class="field form-grid-full"><label>Kepuasan</label>
        <div class="chips" role="group" aria-label="Kepuasan"><button v-for="n in 5" :key="n" class="chip" :aria-pressed="st.satisfaction === n" :data-satisfaction="n" @click="st.satisfaction = n">{{ '★'.repeat(n) }}</button></div></div>
      <div v-if="st.status !== 'selesai'" class="field form-grid-full"><label for="ts-note">Catatan</label><input id="ts-note" v-model="st.note" class="input" maxlength="1000"></div>
      <div v-if="stErr.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in stErr" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="confirm-ticket-status" :disabled="busy" @click="saveStatus"><Icon name="check" /> Simpan</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="st = null">Batal</button></template>
  </Modal>

  <Modal v-if="nf" title="Tiket baru" subtitle="Tautkan ke dokumen agar dapat ditelusuri dari faktur, pesanan, dan profil 360 pihak terkait." width="760px" @close="nf = null">
    <div class="form-grid">
      <div class="field form-grid-full"><div class="segmented" role="group" aria-label="Jenis tiket">
        <button :aria-pressed="nf.partyType === 'customer'" data-new-ticket="customer" @click="nf.partyType = 'customer'">Keluhan pelanggan</button><button :aria-pressed="nf.partyType === 'supplier'" data-new-ticket="supplier" @click="nf.partyType = 'supplier'; nf.category = 'mutu'">Klaim ke pemasok</button>
      </div></div>
      <template v-if="nf.partyType === 'customer'">
        <div class="field"><label for="tk-cust">Pelanggan</label><select id="tk-cust" v-model="nf.customerId" class="select" data-field="ticket-customer" @change="nf.invoiceId = ''; nf.salesOrderId = ''"><option value="">— Pilih —</option><option v-for="c in lists.customers" :key="c.id" :value="c.id">{{ c.code }} · {{ c.name }}</option></select></div>
        <div class="field"><label for="tk-inv">Faktur</label><select id="tk-inv" v-model="nf.invoiceId" class="select" data-field="ticket-invoice"><option value="">— Tidak ada —</option><option v-for="i in invFor" :key="i.id" :value="i.id">{{ i.docNo }} · {{ F.rpCompact(i.total ?? i.totalGross ?? 0) }}</option></select></div>
        <div class="field"><label for="tk-so">Pesanan penjualan</label><select id="tk-so" v-model="nf.salesOrderId" class="select"><option value="">— Tidak ada —</option><option v-for="o in soFor" :key="o.id" :value="o.id">{{ o.docNo }}</option></select></div>
      </template>
      <template v-else>
        <div class="field"><label for="tk-sup">Pemasok</label><select id="tk-sup" v-model="nf.supplierId" class="select" data-field="ticket-supplier" @change="nf.purchaseOrderId = ''"><option value="">— Pilih —</option><option v-for="s in lists.suppliers" :key="s.id" :value="s.id">{{ s.code }} · {{ s.name }}</option></select></div>
        <div class="field"><label for="tk-po">Pesanan pembelian</label><select id="tk-po" v-model="nf.purchaseOrderId" class="select" data-field="ticket-po"><option value="">— Tidak ada —</option><option v-for="o in poFor" :key="o.id" :value="o.id">{{ o.docNo }}</option></select></div>
      </template>
      <div class="field"><label for="tk-cat">Kategori</label><select id="tk-cat" v-model="nf.category" class="select"><option v-for="(l, k) in CATEGORY" :key="k" :value="k">{{ l }}</option></select></div>
      <div class="field"><label for="tk-pri">Prioritas</label><select id="tk-pri" v-model="nf.priority" class="select" data-field="ticket-priority"><option v-for="(p, k) in PRIORITY" :key="k" :value="k">{{ p.label }} — SLA {{ SLA_HOURS[k] }} jam</option></select></div>
      <div class="field form-grid-full"><label for="tk-subj">Judul</label><input id="tk-subj" v-model="nf.subject" class="input" maxlength="200" data-field="ticket-subject"></div>
      <div class="field form-grid-full"><label for="tk-desc">Uraian</label><textarea id="tk-desc" v-model="nf.description" class="textarea" rows="3" maxlength="4000"></textarea></div>
      <div class="field"><label for="tk-ass">Penanggung jawab</label><input id="tk-ass" v-model="nf.assigneeName" class="input" maxlength="120" :placeholder="session.user?.name"></div>
      <div v-if="nfErr.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in nfErr" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="save-ticket" :disabled="busy" @click="saveNew"><Icon name="check" /> Buat tiket</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="nf = null">Batal</button></template>
  </Modal>
</template>
