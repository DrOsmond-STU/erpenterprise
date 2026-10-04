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
const canManage = computed(() => session.can('purchasing.supplier.manage'));
const canPropose = computed(() => session.can('purchasing.supplier.manage|purchasing.payment.create'));
const { data, loading, reload } = useLoader<any[]>(() => get('/purchasing/suppliers'));
const all = computed(() => data.value ?? []);
const bankState = (s: any) => (s.bankPending ? 'pending' : !s.bank ? 'none' : s.bankReadyProblem ? 'cooling' : 'ok');

const q = ref(''); const status = ref('');
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((c) => (!status.value || (status.value === 'rekening' ? bankState(c) === 'pending' : c.status === status.value))
    && (!s || c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s) || (c.city ?? '').toLowerCase().includes(s) || (c.category ?? '').toLowerCase().includes(s)));
});
const pg = usePaged<any>(filtered, 10);
watch([q, status], pg.reset);
const kpi = computed(() => ({
  active: all.value.filter((c) => c.status === 'aktif').length, watch: all.value.filter((c) => ['pantau', 'diblokir'].includes(c.status)).length,
  open: all.value.reduce((t, c) => t + c.payable.open, 0), overdue: all.value.reduce((t, c) => t + c.payable.overdue, 0),
  pendingBank: all.value.filter((c) => c.bankPending).length,
}));

/* Formulir pemasok */
const blank = () => ({ name: '', category: '', pic: '', phone: '', email: '', address: '', city: '', npwp: '', branch: '', termsDays: 30, leadDays: 7, status: 'aktif', reason: '', bankName: '', bankAccountLast4: '', bankHolder: '' });
const form = ref(blank());
const editing = ref<any | null>(null);
const showForm = ref(false);
const errors = ref<string[]>([]);
const busy = ref(false);
function openNew() { editing.value = null; errors.value = []; form.value = blank(); showForm.value = true; }
function openEdit(c: any) {
  editing.value = c; errors.value = [];
  form.value = { ...blank(), name: c.name, category: c.category ?? '', pic: c.pic ?? '', phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', city: c.city ?? '', npwp: c.npwp ?? '', branch: c.branch ?? '', termsDays: c.termsDays, leadDays: c.leadDays, status: c.status };
  showForm.value = true;
}
const sensitive = computed(() => editing.value && (form.value.status !== editing.value.status || Number(form.value.termsDays) !== editing.value.termsDays));
async function save() {
  errors.value = []; busy.value = true;
  const f = form.value;
  const body: any = { name: f.name, category: f.category || undefined, pic: f.pic, phone: f.phone, email: f.email, address: f.address, city: f.city, npwp: f.npwp, branch: f.branch || null, termsDays: Number(f.termsDays) || 0, leadDays: Number(f.leadDays) || 0, status: f.status };
  try {
    if (editing.value) {
      if (sensitive.value) body.reason = f.reason;
      const r = await patch(`/purchasing/suppliers/${editing.value.id}`, body);
      toast.push('Pemasok diperbarui', `${r.code} · ${r.name}`, 'ok');
    } else {
      if (f.bankName || f.bankAccountLast4) Object.assign(body, { bankName: f.bankName, bankAccountLast4: f.bankAccountLast4, bankHolder: f.bankHolder || f.name });
      const r = await post('/purchasing/suppliers', body);
      toast.push('Pemasok ditambahkan', `${r.code} · ${r.name}${r.bankPending ? ' — rekening menunggu persetujuan orang lain' : ''}`, 'ok');
    }
    showForm.value = false; await reload(); if (detail.value) openDetail(detail.value);
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}

/* Rincian & rekening */
const detail = ref<any | null>(null);
async function openDetail(c: any) { try { detail.value = await get(`/purchasing/suppliers/${c.id}`); } catch (e) { toast.error(e, 'Pemasok tidak dapat dimuat'); } }
const showBank = ref(false);
const bank = ref({ bankName: '', bankAccountLast4: '', bankHolder: '', reason: '' });
const bankErrors = ref<string[]>([]);
function openBank() { bankErrors.value = []; bank.value = { bankName: detail.value.bank?.name ?? '', bankAccountLast4: '', bankHolder: detail.value.bank?.holder ?? detail.value.name, reason: '' }; showBank.value = true; }
async function saveBank() {
  bankErrors.value = []; busy.value = true;
  try {
    detail.value = { ...detail.value, ...(await post(`/purchasing/suppliers/${detail.value.id}/bank`, bank.value)) };
    toast.push('Usulan rekening dicatat', 'Berlaku setelah disetujui orang lain, lalu melewati masa tunggu 24 jam.', 'ok');
    showBank.value = false; reload();
  } catch (e) { bankErrors.value = errorList(e); } finally { busy.value = false; }
}
async function decide(approve: boolean) {
  busy.value = true;
  try {
    detail.value = { ...detail.value, ...(await post(`/purchasing/suppliers/${detail.value.id}/bank/decision`, { approve })) };
    toast.push(approve ? 'Rekening disetujui' : 'Usulan rekening ditolak', approve ? 'Transfer dapat dilakukan setelah masa tunggu 24 jam.' : detail.value.name, 'ok'); reload();
  } catch (e) { toast.error(e, 'Keputusan gagal'); } finally { busy.value = false; }
}
const ownProposal = computed(() => detail.value?.bankPending?.requestedBy === session.user?.id);
const goInvoice = (id: string) => router.push({ path: '/tagihan-pemasok', query: { id } });
const goOrder = (id: string) => router.push({ path: '/pesanan-pembelian', query: { id } });
</script>

<template>
  <ReportHead title="Pemasok" sub="Rekening pemasok hanya berlaku setelah disetujui orang kedua, dan transfer baru boleh dilakukan setelah masa tunggu 24 jam (kontrol pencegahan penipuan rekening). Pemasok dipantau selalu memerlukan persetujuan PO; pemasok diblokir tidak dapat menerima PO maupun pembayaran.">
    <button v-if="canManage" class="btn btn-primary" data-action="new-supplier" @click="openNew"><Icon name="plus" /> Pemasok baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Pemasok aktif" :value="String(kpi.active)" :foot="`${kpi.watch} dipantau/diblokir · ${all.length} terdaftar`" />
    <KpiTile label="Hutang terbuka" :value="F.rpCompact(kpi.open)" foot="Seluruh cabang" />
    <KpiTile label="Hutang jatuh tempo" :value="F.rpCompact(kpi.overdue)" foot="Seluruh cabang" :tone="kpi.overdue ? 'neg' : ''" />
    <KpiTile label="Usulan rekening" :value="String(kpi.pendingBank)" foot="Menunggu persetujuan" :tone="kpi.pendingBank ? 'neg' : ''" />
  </div>
  <article class="card">
    <div class="table-filter">
      <input v-model="q" class="input" type="search" placeholder="Cari nama, kode, kota, kategori…" aria-label="Cari pemasok" data-filter="supplier">
      <select v-model="status" class="select" style="width:auto" aria-label="Saring status"><option value="">Semua status</option><option value="aktif">Aktif</option><option value="pantau">Dipantau</option><option value="diblokir">Diblokir</option><option value="nonaktif">Nonaktif</option><option value="rekening">Usulan rekening</option></select>
    </div>
    <div class="table-scroll"><table class="table" data-table="suppliers">
      <thead><tr><th>Pemasok</th><th>Kategori</th><th>Cabang</th><th>Termin</th><th>Rekening</th><th class="ta-r">Hutang</th><th class="ta-r">PO terbuka</th><th>Status</th><th v-if="canManage" class="ta-r">Aksi</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="9"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="c in pg.pageRows.value" :key="c.id" data-row :data-supplier="c.code" @click="openDetail(c)">
          <td><span class="cell-strong">{{ c.name }}</span><span class="cell-sub"><span class="code">{{ c.code }}</span> · {{ c.city ?? '—' }}</span></td>
          <td>{{ c.category ?? '—' }}</td><td><BranchTag v-if="c.branch" :code="c.branch" /><span v-else class="muted">—</span></td>
          <td>{{ c.termsDays ? `Net ${c.termsDays}` : 'Tunai' }}</td>
          <td><template v-if="c.bank">{{ c.bank.name }} ••{{ c.bank.last4 }}</template><span v-else class="muted">—</span>
            <span class="cell-sub"><Pill v-if="bankState(c) === 'pending'" tone="warn" label="Usulan menunggu" /><Pill v-else-if="bankState(c) === 'cooling'" tone="info" label="Masa tunggu" /><Pill v-else-if="bankState(c) === 'ok'" tone="ok" label="Terverifikasi" /></span></td>
          <td class="ta-r num" :class="{ neg: c.payable.overdue }">{{ c.payable.open ? F.rpCompact(c.payable.open) : '—' }}</td>
          <td class="ta-r num">{{ c.payable.openOrders ? F.rpCompact(c.payable.openOrders) : '—' }}</td>
          <td><Pill :status="c.status" /></td>
          <td v-if="canManage" @click.stop><div class="row-actions"><button class="btn btn-sm btn-ghost" data-action="edit-supplier" @click="openEdit(c)">Ubah</button></div></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="9" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada pemasok yang cocok.</td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="pemasok" />
  </article>

  <Drawer v-if="detail" :title="detail.name" :subtitle="`${detail.category ?? '—'} · ${detail.city ?? '—'} · termin ${detail.termsDays ? 'Net ' + detail.termsDays : 'tunai'} · kirim ${detail.leadDays} hari`" @close="detail = null">
    <template #eyebrow><span class="code">{{ detail.code }}</span><Pill :status="detail.status" /><BranchTag v-if="detail.branch" :code="detail.branch" /></template>
    <div v-if="detail.bankPending" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)" data-bank-pending>
      <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" data-tone="warn"><Icon name="shield" /></span>
        <div class="setting-text"><span class="setting-name">Usulan rekening: {{ detail.bankPending.bankName }} ••{{ detail.bankPending.last4 }} a.n. {{ detail.bankPending.holder }}</span>
          <span class="setting-note">Diusulkan {{ detail.bankPending.requestedByName }} · {{ F.datetime(detail.bankPending.requestedAt) }} — “{{ detail.bankPending.reason }}”</span>
          <span class="setting-note">{{ ownProposal ? 'Anda pengusulnya; persetujuan harus oleh orang lain.' : 'Verifikasi melalui kontak resmi pemasok (bukan dari surel/permintaan yang sama) sebelum menyetujui.' }}</span></div></div>
    </div>
    <div class="section">
      <span class="section-title">Rekening pembayaran</span>
      <dl class="deflist">
        <dt>Bank</dt><dd>{{ detail.bank ? `${detail.bank.name} ••${detail.bank.last4}` : '—' }}</dd>
        <dt>Pemilik</dt><dd>{{ detail.bank?.holder ?? '—' }}</dd>
        <dt>Status</dt><dd :class="{ neg: detail.bankReadyProblem }">{{ detail.bankReadyProblem ?? `Terverifikasi ${F.datetime(detail.bank.verifiedAt)}` }}</dd>
      </dl>
    </div>
    <div class="section">
      <span class="section-title">Posisi hutang (seluruh cabang)</span>
      <div class="totals">
        <div class="totals-row"><span>Hutang terbuka</span><b>{{ F.rp(detail.payable.open) }}</b></div>
        <div class="totals-row"><span>… jatuh tempo</span><b :class="{ neg: detail.payable.overdue }">{{ F.rp(detail.payable.overdue) }}</b></div>
        <div class="totals-row"><span>PO terbuka</span><b>{{ F.rp(detail.payable.openOrders) }}</b></div>
      </div>
    </div>
    <div class="section">
      <span class="section-title">Kontak</span>
      <dl class="deflist"><dt>PIC</dt><dd>{{ detail.pic ?? '—' }}</dd><dt>Telepon</dt><dd>{{ detail.phone ?? '—' }}</dd><dt>Email</dt><dd>{{ detail.email ?? '—' }}</dd><dt>Alamat</dt><dd>{{ detail.address ?? '—' }}</dd><dt>NPWP</dt><dd class="code">{{ detail.npwp ?? '—' }}</dd></dl>
    </div>
    <div v-if="detail.invoices" class="section">
      <span class="section-title">Tagihan ({{ detail.invoices.length }})</span>
      <div class="table-scroll"><table class="table"><tbody>
        <tr v-for="i in detail.invoices.slice(0, 20)" :key="i.id" data-row @click="goInvoice(i.id)"><td class="code">{{ i.docNo }}</td><td class="num">{{ F.date(i.date) }}</td><td class="ta-r num">{{ F.rpCompact(i.total) }}</td><td class="ta-r num">{{ i.open ? F.rpCompact(i.open) : '—' }}</td><td><Pill :status="i.status" /></td></tr>
        <tr v-if="!detail.invoices.length" class="is-static"><td class="muted">Belum ada tagihan di cabang yang dapat Anda lihat.</td></tr>
      </tbody></table></div>
    </div>
    <div v-if="detail.orders" class="section">
      <span class="section-title">PO ({{ detail.orders.length }})</span>
      <div class="table-scroll"><table class="table"><tbody>
        <tr v-for="o in detail.orders.slice(0, 20)" :key="o.id" data-row @click="goOrder(o.id)"><td class="code">{{ o.docNo }}</td><td class="num">{{ F.date(o.date) }}</td><td class="ta-r num">{{ F.rpCompact(o.total) }}</td><td><Pill :status="o.status" /></td></tr>
        <tr v-if="!detail.orders.length" class="is-static"><td class="muted">Belum ada PO.</td></tr>
      </tbody></table></div>
    </div>
    <template #foot>
      <template v-if="detail.bankPending && canManage && !ownProposal">
        <button class="btn btn-primary" data-action="approve-bank" :disabled="busy" @click="decide(true)"><Icon name="check" /> Setujui rekening</button>
        <button class="btn btn-danger" data-action="reject-bank" :disabled="busy" @click="decide(false)"><Icon name="x" /> Tolak</button>
      </template>
      <button v-if="canPropose" class="btn" data-action="propose-bank" @click="openBank"><Icon name="vault" /> {{ detail.bank ? 'Ubah rekening' : 'Tetapkan rekening' }}</button>
      <button v-if="canManage" class="btn" @click="openEdit(detail)"><Icon name="edit" /> Ubah</button>
      <button v-if="session.can('crm.read|purchasing.invoice.read')" class="btn" data-action="supplier-360" @click="router.push(`/pemasok/${detail.id}`)"><Icon name="trending" /> Profil 360</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="detail = null">Tutup</button>
    </template>
  </Drawer>

  <Modal v-if="showBank && detail" :title="`Rekening ${detail.name}`" subtitle="Hanya 4 digit terakhir yang disimpan. Usulan berlaku setelah disetujui orang lain; transfer baru dapat dieksekusi setelah masa tunggu 24 jam." width="520px" @close="showBank = false">
    <div class="form-grid">
      <div class="field"><label for="bk-name">Bank</label><input id="bk-name" v-model="bank.bankName" class="input" maxlength="80" placeholder="Mis. BCA"></div>
      <div class="field"><label for="bk-last4">4 digit terakhir</label><input id="bk-last4" v-model="bank.bankAccountLast4" class="input code" maxlength="4" inputmode="numeric"></div>
      <div class="field form-grid-full"><label for="bk-holder">Nama pemilik rekening</label><input id="bk-holder" v-model="bank.bankHolder" class="input" maxlength="160"></div>
      <div class="field form-grid-full"><label for="bk-reason">Dasar perubahan (dicatat di jejak audit)</label><input id="bk-reason" v-model="bank.reason" class="input" maxlength="300" placeholder="Mis. surat resmi pemasok no. …, dikonfirmasi via telepon"></div>
      <div v-if="bankErrors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in bankErrors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-bank" :disabled="busy" @click="saveBank"><Icon name="send" /> Ajukan usulan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showBank = false">Batal</button>
    </template>
  </Modal>

  <Modal v-if="showForm" :title="editing ? `Ubah pemasok ${editing.code}` : 'Pemasok baru'" subtitle="Perubahan termin atau status wajib beralasan dan tercatat di jejak audit." width="720px" @close="showForm = false">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="sp-name">Nama pemasok</label><input id="sp-name" v-model="form.name" class="input" maxlength="160" placeholder="PT …"></div>
      <div class="field"><label for="sp-category">Kategori</label><input id="sp-category" v-model="form.category" class="input" maxlength="80" placeholder="Mis. Bahan baku logam"></div>
      <div class="field"><label for="sp-branch">Cabang pengelola</label><select id="sp-branch" v-model="form.branch" class="select"><option value="">— Tidak ditentukan —</option><option v-for="b in session.branches" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name || b.name }}</option></select></div>
      <div class="field"><label for="sp-terms">Termin (hari)</label><input id="sp-terms" v-model.number="form.termsDays" class="input num" type="number" min="0" max="365"><span class="field-hint">0 = tunai</span></div>
      <div class="field"><label for="sp-lead">Waktu kirim (hari)</label><input id="sp-lead" v-model.number="form.leadDays" class="input num" type="number" min="0" max="365"></div>
      <div class="field"><label for="sp-status">Status</label><select id="sp-status" v-model="form.status" class="select"><option value="aktif">Aktif</option><option value="pantau">Dipantau</option><option value="diblokir">Diblokir</option><option value="nonaktif">Nonaktif</option></select></div>
      <div class="field"><label for="sp-pic">PIC</label><input id="sp-pic" v-model="form.pic" class="input" maxlength="120"></div>
      <div class="field"><label for="sp-phone">Telepon</label><input id="sp-phone" v-model="form.phone" class="input" maxlength="40"></div>
      <div class="field"><label for="sp-email">Email</label><input id="sp-email" v-model="form.email" class="input" type="email" maxlength="200"></div>
      <div class="field"><label for="sp-city">Kota</label><input id="sp-city" v-model="form.city" class="input" maxlength="80"></div>
      <div class="field"><label for="sp-npwp">NPWP</label><input id="sp-npwp" v-model="form.npwp" class="input code" maxlength="25"></div>
      <div class="field form-grid-full"><label for="sp-address">Alamat</label><input id="sp-address" v-model="form.address" class="input" maxlength="400"></div>
      <template v-if="!editing">
        <div class="field"><label for="sp-bank">Bank (opsional)</label><input id="sp-bank" v-model="form.bankName" class="input" maxlength="80"></div>
        <div class="field"><label for="sp-last4">4 digit terakhir rekening</label><input id="sp-last4" v-model="form.bankAccountLast4" class="input code" maxlength="4" inputmode="numeric"></div>
        <div class="field form-grid-full"><label for="sp-holder">Pemilik rekening</label><input id="sp-holder" v-model="form.bankHolder" class="input" maxlength="160" placeholder="Kosong = nama pemasok"><span class="field-hint">Rekening awal dicatat sebagai usulan dan harus disetujui orang lain.</span></div>
      </template>
      <div v-if="sensitive" class="field form-grid-full"><label for="sp-reason">Alasan perubahan termin/status</label><input id="sp-reason" v-model="form.reason" class="input" maxlength="300" placeholder="Mis. keterlambatan kirim berulang"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="save-supplier" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="showForm = false">Batal</button>
    </template>
  </Modal>
</template>
