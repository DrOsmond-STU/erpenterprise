<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get, patch, post } from '@/lib/api';
import { CRM_TIMELINE_FULL, LEAD_CHIPS, LEAD_STATUS, SOURCES } from '@/lib/crm';
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
const { data, loading, reload } = useLoader<any>(() => get('/crm/leads'));
const campaigns = ref<any[]>([]);
get('/crm/campaign-options').then((r) => { campaigns.value = r; }).catch(() => {});
const q = ref('');
const status = ref(String(route.query.status ?? ''));
const campaign = ref(String(route.query.campaign ?? ''));
const rows = computed<any[]>(() => {
  const s = q.value.trim().toLowerCase();
  return (data.value?.rows ?? []).filter((l: any) => (!status.value || l.status === status.value) && (!campaign.value || l.campaignId === campaign.value)
    && (!s || [l.code, l.name, l.companyName, l.email, l.phone, l.ownerName].some((x) => String(x ?? '').toLowerCase().includes(s))));
});
const pg = usePaged(rows);
const canManage = computed(() => session.can('crm.manage'));

/* Detail lead */
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);
watch(() => route.query.id, (v) => { if (v) openId.value = String(v); });
const lead = ref<any>(null);
const loadLead = async () => { if (!openId.value) { lead.value = null; return; } try { lead.value = await get(`/crm/leads/${openId.value}`); } catch (e) { toast.error(e, 'Lead tidak dapat dimuat'); openId.value = null; } };
watch(openId, loadLead, { immediate: true });
const isOpenLead = computed(() => lead.value && !['dikonversi', 'diskualifikasi'].includes(lead.value.status));
const busy = ref(false);
async function setStatus(st: string, reason?: string) {
  busy.value = true;
  try { lead.value = { ...(await post(`/crm/leads/${lead.value.id}/status`, { status: st, reason: reason ?? null })), timeline: lead.value.timeline }; toast.push(`Status lead: ${LEAD_STATUS[st].label}`, lead.value.code, 'ok'); reload(); loadLead(); return true; }
  catch (e) { toast.error(e, 'Status tidak dapat diubah'); return false; } finally { busy.value = false; }
}
const dq = ref<{ reason: string } | null>(null);
async function disqualify() { if (await setStatus('diskualifikasi', dq.value!.reason)) dq.value = null; }

/* Formulir lead */
const branches = computed(() => session.branches.filter((b) => b.status === 'aktif' && (ctx.branch === 'ALL' || b.code === ctx.branch)));
const form = ref<any>(null);
const formErr = ref<string[]>([]);
function openForm(l?: any) {
  formErr.value = [];
  form.value = l ? { ...l, campaignId: l.campaignId ?? '' } : { branch: ctx.branch !== 'ALL' ? ctx.branch : branches.value[0]?.code ?? '', name: '', companyName: '', title: '', phone: '', email: '', city: '', source: 'Website', campaignId: campaign.value || '', ownerName: session.user?.name ?? '', estimatedValue: 0, notes: '' };
}
async function saveForm() {
  busy.value = true; formErr.value = [];
  const f = form.value;
  const body: any = { name: f.name, companyName: f.companyName || null, title: f.title || null, phone: f.phone || null, email: f.email || null, city: f.city || null, source: f.source, campaignId: f.campaignId || null,
    ownerName: f.ownerName || undefined, estimatedValue: Math.round(Number(f.estimatedValue) || 0), notes: f.notes || null };
  try {
    const r = f.id ? await patch(`/crm/leads/${f.id}`, body) : await post('/crm/leads', { ...body, branch: f.branch });
    form.value = null; toast.push('Lead disimpan', `${r.code} · ${r.name}`, 'ok'); reload(); openId.value = r.id; loadLead();
  } catch (e) { formErr.value = errorList(e); } finally { busy.value = false; }
}

/* Konversi */
const customers = ref<any[]>([]);
const conv = ref<any>(null);
const convErr = ref<string[]>([]);
async function openConvert() {
  convErr.value = [];
  if (!customers.value.length && session.can('sales.invoice.read')) customers.value = await get('/sales/customers').catch(() => []);
  const l = lead.value;
  const match = customers.value.find((c) => l.companyName && c.name.toLowerCase() === l.companyName.toLowerCase());
  conv.value = { mode: match || !session.can('sales.customer.manage') ? 'existing' : 'new', customerId: match?.id ?? '', name: l.companyName ?? l.name, segment: 'Langsung', city: l.city ?? '', creditLimit: 0, termsDays: 30,
    opportunityName: `${l.companyName ?? l.name} — ${l.source}`.slice(0, 200), value: l.estimatedValue, expectedClose: '' };
}
async function convert() {
  busy.value = true; convErr.value = [];
  const c = conv.value;
  const body: any = { opportunityName: c.opportunityName, value: Math.round(Number(c.value) || 0), expectedClose: c.expectedClose || null };
  if (c.mode === 'existing') body.customerId = c.customerId || null;
  else body.newCustomer = { name: c.name, segment: c.segment, city: c.city || undefined, creditLimit: Math.round(Number(c.creditLimit) || 0), termsDays: Number(c.termsDays) || 0 };
  try {
    const r = await post(`/crm/leads/${lead.value.id}/convert`, body);
    conv.value = null; toast.push('Lead dikonversi', `${r.convertedCustomerName} · ${r.convertedOpportunityCode}`, 'ok'); reload(); loadLead();
  } catch (e) { convErr.value = errorList(e); } finally { busy.value = false; }
}
const scoreTone = (s: number) => (s >= 70 ? 'ok' : s >= 45 ? 'warn' : '');
</script>

<template>
  <ReportHead title="Prospek & Lead" sub="Lead masuk dari kampanye, website, referensi, atau pameran. Lead yang sudah dihubungi dan memenuhi syarat dikonversi menjadi pelanggan (data induk penjualan & piutang), kontak utama, dan peluang di pipeline.">
    <button v-if="canManage" class="btn btn-primary" data-action="new-lead" @click="openForm()"><Icon name="plus" /> Lead baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Lead aktif" :value="String(data?.summary.open ?? 0)" :foot="`${data?.summary.total ?? 0} lead tercatat`" />
    <KpiTile label="Dikonversi" :value="String(data?.summary.converted ?? 0)" :foot="`Rasio konversi ${F.pct(data?.summary.conversionRate ?? 0)}`" />
    <KpiTile label="Diskualifikasi" :value="String(data?.summary.disqualified ?? 0)" foot="Tidak memenuhi syarat" />
    <KpiTile label="Sumber teratas" :value="[...(data?.summary.bySource ?? [])].sort((a: any, b: any) => b.count - a.count)[0]?.source ?? '—'" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="card-head" style="flex-wrap:wrap;gap:var(--sp-2)">
      <div class="chips" role="group" aria-label="Saring status"><button v-for="[k, l] in LEAD_CHIPS" :key="k" class="chip" :aria-pressed="status === k" :data-lead-chip="k || 'all'" @click="status = k">{{ l }}</button></div>
      <div class="toolbar-spacer"></div>
      <select v-model="campaign" class="select" style="max-width:220px" aria-label="Saring kampanye"><option value="">Semua kampanye</option><option v-for="k in campaigns" :key="k.id" :value="k.id">{{ k.name }}</option></select>
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nama, perusahaan, email…" aria-label="Cari lead"></div>
    </div>
    <div v-if="loading && !data" class="loading">Memuat…</div>
    <div v-else class="table-scroll"><table class="table" data-table="leads">
      <thead><tr><th>Kode</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th>Nama / perusahaan</th><th>Sumber</th><th class="ta-r">Perkiraan nilai</th><th class="ta-r">Skor</th><th>PIC</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="l in pg.pageRows.value" :key="l.id" data-row :data-lead="l.code" @click="openId = l.id">
          <td class="code cell-strong">{{ l.code }}</td><td v-if="ctx.branch === 'ALL'"><BranchTag :code="l.branch" /></td>
          <td><span class="cell-strong">{{ l.name }}</span><span class="cell-sub">{{ l.companyName ?? '—' }}<template v-if="l.title"> · {{ l.title }}</template></span></td>
          <td>{{ l.source }}<span v-if="l.campaignName" class="cell-sub">{{ l.campaignName }}</span></td>
          <td class="ta-r num">{{ F.rpCompact(l.estimatedValue) }}</td>
          <td class="ta-r"><Pill :label="String(l.score)" :tone="scoreTone(l.score)" /></td>
          <td>{{ l.ownerName }}</td>
          <td><Pill :label="LEAD_STATUS[l.status]?.label" :tone="LEAD_STATUS[l.status]?.tone" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="8" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada lead yang cocok.</td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="lead" />
  </article>

  <Drawer v-if="openId && lead" :title="lead.name" :subtitle="`${lead.companyName ?? 'Perorangan'} · ${lead.source}${lead.campaignName ? ' · ' + lead.campaignName : ''} · skor ${lead.score}`" @close="openId = null">
    <template #eyebrow><span class="code">{{ lead.code }}</span><Pill :label="LEAD_STATUS[lead.status]?.label" :tone="LEAD_STATUS[lead.status]?.tone" /><BranchTag :code="lead.branch" /></template>
    <div v-if="lead.status === 'dikonversi'" class="section" style="background:var(--surface-2)" data-converted>
      <span class="setting-name">Dikonversi {{ F.date(lead.convertedAt) }}</span>
      <span class="setting-note">Pelanggan <a href="#" class="link-btn" @click.prevent="router.push(`/pelanggan/${lead.convertedCustomerId}`)">{{ lead.convertedCustomerName }}</a>
        <template v-if="lead.convertedOpportunityId"> · peluang <a href="#" class="link-btn code" @click.prevent="router.push({ path: '/lead', query: { id: lead.convertedOpportunityId } })">{{ lead.convertedOpportunityCode }}</a></template></span>
    </div>
    <div v-if="lead.status === 'diskualifikasi'" class="section" style="background:var(--danger-soft)"><span class="setting-name">Diskualifikasi</span><span class="setting-note">{{ lead.disqualifyReason }}</span></div>
    <div v-if="canManage && isOpenLead" class="section">
      <span class="section-title">Kualifikasi</span>
      <div class="chips" role="group" aria-label="Status lead">
        <button v-for="k in ['baru', 'dihubungi', 'kualifikasi']" :key="k" class="chip" :aria-pressed="lead.status === k" :disabled="busy || lead.status === k" :data-lead-status="k" @click="setStatus(k)">{{ LEAD_STATUS[k].label }}</button>
      </div>
      <span class="setting-note">Mencatat telepon/rapat/email/kunjungan yang selesai otomatis memindahkan lead baru menjadi “Dihubungi”.</span>
    </div>
    <div class="section">
      <span class="section-title">Rincian</span>
      <dl class="deflist">
        <dt>Telepon</dt><dd class="num">{{ lead.phone ?? '—' }}</dd><dt>Email</dt><dd>{{ lead.email ?? '—' }}</dd><dt>Kota</dt><dd>{{ lead.city ?? '—' }}</dd>
        <dt>Perkiraan nilai</dt><dd class="num">{{ F.rp(lead.estimatedValue) }}</dd><dt>PIC</dt><dd>{{ lead.ownerName }}</dd>
        <dt v-if="lead.notes">Catatan</dt><dd v-if="lead.notes" style="white-space:pre-line">{{ lead.notes }}</dd>
      </dl>
    </div>
    <div class="section"><span class="section-title">Aktivitas</span><ActivityPanel :link="{ leadId: lead.id }" :can-add="isOpenLead" @changed="loadLead(); reload()" /></div>
    <div class="section">
      <span class="section-title">Riwayat</span>
      <div class="timeline"><div v-for="(t, i) in lead.timeline" :key="i" class="tl-item"><span class="tl-rail"><i class="tl-node" :data-tone="CRM_TIMELINE_FULL[t.action]?.tone || undefined"></i><i class="tl-line"></i></span>
        <span class="tl-body"><span class="tl-title"><b>{{ t.actor }}</b> {{ CRM_TIMELINE_FULL[t.action]?.label ?? t.action }}</span><span class="tl-meta">{{ F.datetime(t.at) }}</span></span></div></div>
    </div>
    <template #foot>
      <template v-if="canManage && isOpenLead">
        <button class="btn btn-primary" data-action="convert-lead" :disabled="lead.status === 'baru'" :title="lead.status === 'baru' ? 'Hubungi lead terlebih dahulu' : ''" @click="openConvert"><Icon name="handshake" /> Konversi</button>
        <button class="btn" data-action="edit-lead" @click="openForm(lead)"><Icon name="edit" /> Ubah</button>
        <button class="btn btn-danger" data-action="disqualify-lead" @click="dq = { reason: '' }"><Icon name="x" /> Diskualifikasi</button>
      </template>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="openId = null">Tutup</button>
    </template>
  </Drawer>

  <Modal v-if="form" :title="form.id ? `Ubah ${form.code}` : 'Lead baru'" subtitle="Lead wajib memiliki telepon atau email. Lead dengan email/telepon sama yang masih aktif ditolak sebagai duplikat." width="760px" @close="form = null">
    <div class="form-grid">
      <div class="field"><label for="ld-branch">Cabang</label><select id="ld-branch" v-model="form.branch" class="select" :disabled="!!form.id"><option v-for="b in branches" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name || b.name }}</option></select></div>
      <div class="field"><label for="ld-name">Nama kontak</label><input id="ld-name" v-model="form.name" class="input" maxlength="120" data-field="lead-name"></div>
      <div class="field"><label for="ld-company">Perusahaan</label><input id="ld-company" v-model="form.companyName" class="input" maxlength="160" data-field="lead-company"></div>
      <div class="field"><label for="ld-title">Jabatan</label><input id="ld-title" v-model="form.title" class="input" maxlength="80"></div>
      <div class="field"><label for="ld-phone">Telepon</label><input id="ld-phone" v-model="form.phone" class="input" maxlength="40" data-field="lead-phone"></div>
      <div class="field"><label for="ld-email">Email</label><input id="ld-email" v-model="form.email" class="input" type="email" maxlength="200" data-field="lead-email"></div>
      <div class="field"><label for="ld-city">Kota</label><input id="ld-city" v-model="form.city" class="input" maxlength="80"></div>
      <div class="field"><label for="ld-source">Sumber</label><select id="ld-source" v-model="form.source" class="select"><option v-for="s in SOURCES" :key="s" :value="s">{{ s }}</option></select></div>
      <div class="field"><label for="ld-camp">Kampanye</label><select id="ld-camp" v-model="form.campaignId" class="select" data-field="lead-campaign"><option value="">— Tanpa kampanye —</option><option v-for="k in campaigns" :key="k.id" :value="k.id">{{ k.name }}</option></select></div>
      <div class="field"><label for="ld-value">Perkiraan nilai (Rp)</label><input id="ld-value" v-model.number="form.estimatedValue" class="input num" type="number" min="0" step="1000000" style="text-align:right"></div>
      <div class="field"><label for="ld-owner">PIC penjualan</label><input id="ld-owner" v-model="form.ownerName" class="input" maxlength="120"></div>
      <div class="field form-grid-full"><label for="ld-notes">Catatan</label><textarea id="ld-notes" v-model="form.notes" class="textarea" rows="2" maxlength="1000"></textarea></div>
      <div v-if="formErr.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in formErr" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="save-lead" :disabled="busy" @click="saveForm"><Icon name="check" /> Simpan</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="form = null">Batal</button></template>
  </Modal>

  <Modal v-if="conv && lead" :title="`Konversi ${lead.code}`" subtitle="Membuat/menautkan pelanggan, kontak utama dari data lead, dan peluang di tahap kualifikasi. Riwayat aktivitas lead ikut pindah ke pelanggan." width="720px" @close="conv = null">
    <div class="form-grid">
      <div class="field form-grid-full"><div class="segmented" role="group" aria-label="Pelanggan">
        <button :aria-pressed="conv.mode === 'existing'" data-conv-mode="existing" @click="conv.mode = 'existing'">Pelanggan yang ada</button>
        <button :aria-pressed="conv.mode === 'new'" data-conv-mode="new" :disabled="!session.can('sales.customer.manage')" :title="session.can('sales.customer.manage') ? '' : 'Memerlukan izin kelola pelanggan'" @click="conv.mode = 'new'">Pelanggan baru</button>
      </div></div>
      <div v-if="conv.mode === 'existing'" class="field form-grid-full"><label for="cv-cust">Pelanggan</label>
        <select id="cv-cust" v-model="conv.customerId" class="select" data-field="conv-customer"><option value="">— Pilih —</option><option v-for="c in customers.filter((x) => x.status !== 'nonaktif')" :key="c.id" :value="c.id">{{ c.code }} · {{ c.name }}</option></select></div>
      <template v-else>
        <div class="field"><label for="cv-name">Nama pelanggan</label><input id="cv-name" v-model="conv.name" class="input" maxlength="160" data-field="conv-name"></div>
        <div class="field"><label for="cv-seg">Segmen</label><select id="cv-seg" v-model="conv.segment" class="select"><option v-for="s in ['Langsung', 'Distributor', 'Kontrak', 'Ritel']" :key="s">{{ s }}</option></select></div>
        <div class="field"><label for="cv-limit">Plafon kredit (Rp)</label><input id="cv-limit" v-model.number="conv.creditLimit" class="input num" type="number" min="0" step="1000000" style="text-align:right" data-field="conv-limit"><span class="field-hint">0 = hanya tunai; pesanan melebihi plafon memerlukan persetujuan.</span></div>
        <div class="field"><label for="cv-terms">Termin (hari)</label><input id="cv-terms" v-model.number="conv.termsDays" class="input num" type="number" min="0" max="365"></div>
      </template>
      <div class="field form-grid-full"><label for="cv-opp">Nama peluang</label><input id="cv-opp" v-model="conv.opportunityName" class="input" maxlength="200" data-field="conv-opp"></div>
      <div class="field"><label for="cv-value">Nilai peluang (Rp)</label><input id="cv-value" v-model.number="conv.value" class="input num" type="number" min="0" step="1000000" style="text-align:right"></div>
      <div class="field"><label for="cv-close">Perkiraan closing</label><input id="cv-close" v-model="conv.expectedClose" class="input" type="date"></div>
      <div v-if="convErr.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in convErr" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="confirm-convert" :disabled="busy" @click="convert"><Icon name="handshake" /> Konversi</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="conv = null">Batal</button></template>
  </Modal>

  <Modal v-if="dq && lead" :title="`Diskualifikasi ${lead.code}?`" subtitle="Alasan dipakai untuk evaluasi sumber & kampanye." width="480px" @close="dq = null">
    <div class="field"><label for="dq-reason">Alasan</label><textarea id="dq-reason" v-model="dq.reason" class="textarea" rows="3" maxlength="300" data-field="dq-reason"></textarea></div>
    <template #foot><button class="btn btn-danger" data-action="confirm-disqualify" :disabled="busy || dq.reason.trim().length < 5" @click="disqualify">Diskualifikasi</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="dq = null">Batal</button></template>
  </Modal>
</template>
