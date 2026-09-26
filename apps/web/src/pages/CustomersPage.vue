<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Drawer from '@/components/Drawer.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const router = useRouter();
const session = useSession();
const toast = useToast();
const canManage = computed(() => session.can('sales.customer.manage'));
const { data, loading, reload } = useLoader<any[]>(() => get('/sales/customers'));
const all = computed(() => data.value ?? []);
const usage = (c: any) => (c.creditLimit > 0 ? (c.exposure.total / c.creditLimit) * 100 : 0);

const q = ref(''); const status = ref(''); const segment = ref('');
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((c) => (!status.value || c.status === status.value) && (!segment.value || c.segment === segment.value)
    && (!s || c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s) || (c.city ?? '').toLowerCase().includes(s) || (c.pic ?? '').toLowerCase().includes(s)));
});
const pg = usePaged<any>(filtered, 10);
watch([q, status, segment], pg.reset);
const kpi = computed(() => ({
  active: all.value.filter((c) => c.status === 'aktif').length, held: all.value.filter((c) => c.status === 'ditahan').length,
  limit: all.value.reduce((t, c) => t + c.creditLimit, 0), exposure: all.value.reduce((t, c) => t + c.exposure.total, 0),
  overdue: all.value.reduce((t, c) => t + c.exposure.overdue, 0), near: all.value.filter((c) => c.status === 'aktif' && usage(c) >= 90).length,
}));

/* Formulir */
const blank = () => ({ name: '', segment: 'Langsung', pic: '', phone: '', email: '', address: '', city: '', npwp: '', branch: '', creditLimit: 100_000_000, termsDays: 30, status: 'aktif', reason: '' });
const form = ref(blank());
const editing = ref<any | null>(null);
const showForm = ref(false);
const errors = ref<string[]>([]);
const busy = ref(false);
function openNew() { editing.value = null; errors.value = []; form.value = blank(); showForm.value = true; }
function openEdit(c: any) {
  editing.value = c; errors.value = [];
  form.value = { name: c.name, segment: c.segment, pic: c.pic ?? '', phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', city: c.city ?? '', npwp: c.npwp ?? '', branch: c.branch ?? '', creditLimit: c.creditLimit, termsDays: c.termsDays, status: c.status, reason: '' };
  showForm.value = true;
}
const sensitive = computed(() => editing.value && (form.value.creditLimit !== editing.value.creditLimit || form.value.status !== editing.value.status || form.value.termsDays !== editing.value.termsDays));
async function save() {
  errors.value = []; busy.value = true;
  const f = form.value;
  const body: any = { name: f.name, segment: f.segment, pic: f.pic, phone: f.phone, email: f.email, address: f.address, city: f.city, npwp: f.npwp, branch: f.branch || null, creditLimit: Math.round(Number(f.creditLimit) || 0), termsDays: Number(f.termsDays) || 0, status: f.status };
  try {
    if (editing.value) {
      if (sensitive.value) body.reason = f.reason;
      const r = await patch(`/sales/customers/${editing.value.id}`, body);
      toast.push('Pelanggan diperbarui', `${r.code} · ${r.name}`, 'ok');
    } else {
      const r = await post('/sales/customers', body);
      toast.push('Pelanggan ditambahkan', `${r.code} · ${r.name}`, 'ok');
    }
    showForm.value = false; await reload(); if (detail.value) openDetail(detail.value);
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}

/* Rincian */
const detail = ref<any | null>(null);
async function openDetail(c: any) { try { detail.value = await get(`/sales/customers/${c.id}`); } catch (e) { toast.error(e, 'Pelanggan tidak dapat dimuat'); } }
const goInvoice = (id: string) => router.push({ path: '/faktur', query: { id } });
const goOrder = (id: string) => router.push({ path: '/pesanan-penjualan', query: { id } });
</script>

<template>
  <ReportHead title="Pelanggan" sub="Plafon kredit dipakai oleh piutang terbuka, faktur draf, dan pesanan yang belum difakturkan — di seluruh cabang. Pelanggan ditahan tidak dapat memesan tanpa persetujuan manajer.">
    <button v-if="canManage" class="btn btn-primary" data-action="new-customer" @click="openNew"><Icon name="plus" /> Pelanggan baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Pelanggan aktif" :value="String(kpi.active)" :foot="`${kpi.held} ditahan · ${all.length} terdaftar`" />
    <KpiTile label="Total plafon" :value="F.rpCompact(kpi.limit)" :foot="`Terpakai ${F.rpCompact(kpi.exposure)}`" />
    <KpiTile label="Piutang jatuh tempo" :value="F.rpCompact(kpi.overdue)" foot="Seluruh cabang" :tone="kpi.overdue ? 'neg' : ''" />
    <KpiTile label="Plafon hampir habis" :value="String(kpi.near)" foot="Pemakaian ≥ 90%" :tone="kpi.near ? 'neg' : ''" />
  </div>
  <article class="card">
    <div class="table-filter">
      <input v-model="q" class="input" type="search" placeholder="Cari nama, kode, kota, PIC…" aria-label="Cari pelanggan" data-filter="customer">
      <select v-model="segment" class="select" style="width:auto" aria-label="Saring segmen"><option value="">Semua segmen</option><option>Langsung</option><option>Distributor</option><option>Kontrak</option><option>Ritel</option></select>
      <select v-model="status" class="select" style="width:auto" aria-label="Saring status"><option value="">Semua status</option><option value="aktif">Aktif</option><option value="ditahan">Ditahan</option><option value="nonaktif">Nonaktif</option></select>
    </div>
    <div class="table-scroll"><table class="table" data-table="customers">
      <thead><tr><th>Pelanggan</th><th>Segmen</th><th>Cabang</th><th class="ta-r">Plafon</th><th>Pemakaian plafon</th><th class="ta-r">Jatuh tempo</th><th>Termin</th><th>Status</th><th v-if="canManage" class="ta-r">Aksi</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="9"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="c in pg.pageRows.value" :key="c.id" data-row :data-customer="c.code" @click="openDetail(c)">
          <td><span class="cell-strong">{{ c.name }}</span><span class="cell-sub"><span class="code">{{ c.code }}</span> · {{ c.city ?? '—' }}<template v-if="c.pic"> · {{ c.pic }}</template></span></td>
          <td>{{ c.segment }}</td><td><BranchTag v-if="c.branch" :code="c.branch" /><span v-else class="muted">—</span></td>
          <td class="ta-r num">{{ F.rpCompact(c.creditLimit) }}</td>
          <td><div class="meter"><span class="meter-track"><span class="meter-fill" :data-tone="usage(c) >= 95 ? 'danger' : usage(c) >= 80 ? 'warn' : undefined" :style="{ width: Math.min(100, usage(c)) + '%' }"></span></span><span class="meter-val">{{ F.pct(usage(c), 0) }}</span></div>
            <span class="cell-sub">sisa {{ F.rpCompact(c.available) }}</span></td>
          <td class="ta-r num" :class="{ neg: c.exposure.overdue }">{{ c.exposure.overdue ? F.rpCompact(c.exposure.overdue) : '—' }}</td>
          <td>{{ c.termsDays ? `Net ${c.termsDays}` : 'Tunai' }}</td><td><Pill :status="c.status" /></td>
          <td v-if="canManage" @click.stop><div class="row-actions"><button class="btn btn-sm btn-ghost" data-action="edit-customer" @click="openEdit(c)">Ubah</button></div></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="9" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada pelanggan yang cocok.</td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="pelanggan" />
  </article>

  <Drawer v-if="detail" :title="detail.name" :subtitle="`${detail.segment} · ${detail.city ?? '—'} · termin ${detail.termsDays ? 'Net ' + detail.termsDays : 'tunai'}`" @close="detail = null">
    <template #eyebrow><span class="code">{{ detail.code }}</span><Pill :status="detail.status" /><BranchTag v-if="detail.branch" :code="detail.branch" /></template>
    <div class="section">
      <span class="section-title">Posisi kredit (seluruh cabang)</span>
      <div class="totals">
        <div class="totals-row"><span>Plafon kredit</span><b>{{ F.rp(detail.creditLimit) }}</b></div>
        <div class="totals-row"><span>Piutang terbuka</span><b>{{ F.rp(detail.exposure.openAr) }}</b></div>
        <div class="totals-row"><span>… jatuh tempo</span><b :class="{ neg: detail.exposure.overdue }">{{ F.rp(detail.exposure.overdue) }}</b></div>
        <div class="totals-row"><span>Faktur draf</span><b>{{ F.rp(detail.exposure.drafts) }}</b></div>
        <div class="totals-row"><span>Pesanan belum difakturkan</span><b>{{ F.rp(detail.exposure.openOrders) }}</b></div>
        <div class="totals-row totals-grand"><span>Sisa plafon</span><b :class="{ neg: detail.available < 0 }">{{ F.rp(detail.available) }}</b></div>
      </div>
    </div>
    <div class="section">
      <span class="section-title">Kontak</span>
      <dl class="deflist"><dt>PIC</dt><dd>{{ detail.pic ?? '—' }}</dd><dt>Telepon</dt><dd>{{ detail.phone ?? '—' }}</dd><dt>Email</dt><dd>{{ detail.email ?? '—' }}</dd><dt>Alamat</dt><dd>{{ detail.address ?? '—' }}</dd><dt>NPWP</dt><dd class="code">{{ detail.npwp ?? '—' }}</dd></dl>
    </div>
    <div class="section">
      <span class="section-title">Faktur ({{ detail.invoices.length }})</span>
      <div class="table-scroll"><table class="table"><tbody>
        <tr v-for="i in detail.invoices.slice(0, 20)" :key="i.id" data-row @click="goInvoice(i.id)"><td class="code">{{ i.docNo }}</td><td class="num">{{ F.date(i.date) }}</td><td class="ta-r num">{{ F.rpCompact(i.total) }}</td><td class="ta-r num">{{ i.open ? F.rpCompact(i.open) : '—' }}</td><td><Pill :status="i.status" /></td></tr>
        <tr v-if="!detail.invoices.length" class="is-static"><td class="muted">Belum ada faktur di cabang yang dapat Anda lihat.</td></tr>
      </tbody></table></div>
    </div>
    <div class="section">
      <span class="section-title">Pesanan ({{ detail.orders.length }})</span>
      <div class="table-scroll"><table class="table"><tbody>
        <tr v-for="o in detail.orders.slice(0, 20)" :key="o.id" data-row @click="goOrder(o.id)"><td class="code">{{ o.docNo }}</td><td class="num">{{ F.date(o.date) }}</td><td class="ta-r num">{{ F.rpCompact(o.total) }}</td><td><Pill :status="o.status" /></td></tr>
        <tr v-if="!detail.orders.length" class="is-static"><td class="muted">Belum ada pesanan.</td></tr>
      </tbody></table></div>
    </div>
    <template #foot><button v-if="canManage" class="btn" @click="openEdit(detail)"><Icon name="edit" /> Ubah</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="detail = null">Tutup</button></template>
  </Drawer>

  <Modal v-if="showForm" :title="editing ? `Ubah pelanggan ${editing.code}` : 'Pelanggan baru'" subtitle="Perubahan plafon, termin, atau status wajib beralasan dan tercatat di jejak audit." width="720px" @close="showForm = false">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="cu-name">Nama pelanggan</label><input id="cu-name" v-model="form.name" class="input" maxlength="160" placeholder="PT …"></div>
      <div class="field"><label for="cu-segment">Segmen</label><select id="cu-segment" v-model="form.segment" class="select"><option>Langsung</option><option>Distributor</option><option>Kontrak</option><option>Ritel</option></select></div>
      <div class="field"><label for="cu-branch">Cabang pengelola</label><select id="cu-branch" v-model="form.branch" class="select"><option value="">— Tidak ditentukan —</option><option v-for="b in session.branches" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name || b.name }}</option></select></div>
      <div class="field"><label for="cu-limit">Plafon kredit (Rp)</label><input id="cu-limit" v-model.number="form.creditLimit" class="input num" type="number" min="0" step="1000000" style="text-align:right"></div>
      <div class="field"><label for="cu-terms">Termin (hari)</label><input id="cu-terms" v-model.number="form.termsDays" class="input num" type="number" min="0" max="365"><span class="field-hint">0 = tunai</span></div>
      <div class="field"><label for="cu-status">Status</label><select id="cu-status" v-model="form.status" class="select"><option value="aktif">Aktif</option><option value="ditahan">Ditahan</option><option value="nonaktif">Nonaktif</option></select></div>
      <div class="field"><label for="cu-pic">PIC</label><input id="cu-pic" v-model="form.pic" class="input" maxlength="120"></div>
      <div class="field"><label for="cu-phone">Telepon</label><input id="cu-phone" v-model="form.phone" class="input" maxlength="40"></div>
      <div class="field"><label for="cu-email">Email</label><input id="cu-email" v-model="form.email" class="input" type="email" maxlength="200"></div>
      <div class="field"><label for="cu-city">Kota</label><input id="cu-city" v-model="form.city" class="input" maxlength="80"></div>
      <div class="field"><label for="cu-npwp">NPWP</label><input id="cu-npwp" v-model="form.npwp" class="input code" maxlength="25"></div>
      <div class="field form-grid-full"><label for="cu-address">Alamat</label><input id="cu-address" v-model="form.address" class="input" maxlength="400"></div>
      <div v-if="sensitive" class="field form-grid-full"><label for="cu-reason">Alasan perubahan plafon/termin/status</label><input id="cu-reason" v-model="form.reason" class="input" maxlength="300" placeholder="Mis. hasil evaluasi kredit Q3"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-customer" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showForm = false">Batal</button>
    </template>
  </Modal>
</template>
