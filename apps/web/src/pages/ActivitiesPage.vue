<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { get, post } from '@/lib/api';
import { ACT_STATUS, KIND_ICON, KIND_LABEL, wibIso, wibPlus } from '@/lib/crm';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const router = useRouter();
const ctx = useContext();
const session = useSession();
const toast = useToast();
const view = ref<'mine' | 'open' | 'done'>('mine');
const kind = ref('');
const { data, loading, reload } = useLoader<any>(() => get(`/crm/activities?${view.value === 'mine' ? 'mine=1&status=terbuka' : view.value === 'open' ? 'status=terbuka' : 'status=selesai'}`), [view]);
const rows = computed<any[]>(() => (data.value?.rows ?? []).filter((a: any) => !kind.value || a.kind === kind.value));
const pg = usePaged(rows);

/** Buka entitas tertaut: profil pelanggan/pemasok, lead, peluang, faktur, atau tiket. */
function go(a: any) {
  const l = a.links;
  if (l.ticket) return router.push({ path: '/tiket', query: { id: l.ticket.id } });
  if (l.lead) return router.push({ path: '/prospek', query: { id: l.lead.id } });
  if (l.invoice && a.kind === 'penagihan') return router.push({ path: '/penagihan', query: { invoice: l.invoice.id } });
  if (l.opportunity) return router.push({ path: '/lead', query: { id: l.opportunity.id } });
  if (l.customer) return router.push(`/pelanggan/${l.customer.id}`);
  if (l.supplier) return router.push(`/pemasok/${l.supplier.id}`);
  if (l.invoice) return router.push({ path: '/faktur', query: { id: l.invoice.id } });
}
const linkText = (a: any) => [a.links.customer?.name, a.links.supplier?.name, a.links.lead?.code, a.links.opportunity?.code, a.links.invoice?.docNo, a.links.ticket?.code].filter(Boolean).join(' · ');

const busy = ref(false);
const doneFor = ref<any>(null);
const doneForm = ref({ result: '', follow: false, subject: '', dueAt: wibPlus(3) });
function openDone(a: any) { doneFor.value = a; doneForm.value = { result: '', follow: false, subject: `Tindak lanjut: ${a.subject}`.slice(0, 200), dueAt: wibPlus(3) }; }
async function complete() {
  busy.value = true;
  try {
    const d = doneForm.value;
    await post(`/crm/activities/${doneFor.value.id}/complete`, { result: d.result || null, followUp: d.follow ? { subject: d.subject, dueAt: wibIso(d.dueAt) } : null });
    doneFor.value = null; toast.push('Tugas selesai', '', 'ok'); reload();
  } catch (e) { toast.error(e, 'Tugas tidak dapat diselesaikan'); } finally { busy.value = false; }
}

/* Tugas baru — tertaut ke pelanggan atau pemasok. */
const parties = ref<{ customers: any[]; suppliers: any[] }>({ customers: [], suppliers: [] });
const nf = ref<any>(null);
const nfErr = ref<string[]>([]);
async function openNew() {
  nfErr.value = [];
  if (!parties.value.customers.length) {
    const [c, s] = await Promise.all([session.can('sales.invoice.read') ? get('/sales/customers').catch(() => []) : [], session.can('purchasing.invoice.read|purchasing.receipt.create') ? get('/purchasing/suppliers').catch(() => []) : []]);
    parties.value = { customers: c, suppliers: s };
  }
  nf.value = { party: 'customer', partyId: '', kind: 'tugas', subject: '', notes: '', dueAt: wibPlus(1), assigneeName: '' };
}
async function saveNew() {
  busy.value = true; nfErr.value = [];
  const f = nf.value;
  try {
    await post('/crm/activities', { kind: f.kind, subject: f.subject, notes: f.notes || null, dueAt: wibIso(f.dueAt), assigneeName: f.assigneeName || null, [f.party === 'customer' ? 'customerId' : 'supplierId']: f.partyId || null });
    nf.value = null; toast.push('Tugas dijadwalkan', f.subject, 'ok'); reload();
  } catch (e) { nfErr.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Aktivitas & Tugas" sub="Agenda kerja CRM lintas modul: tugas penjualan, kunjungan pelanggan, tindak lanjut penagihan piutang, penanganan tiket, dan evaluasi pemasok — setiap aktivitas tertaut ke pelanggan, pemasok, lead, peluang, faktur, atau tiket.">
    <button v-if="session.can('crm.read|crm.collection|crm.ticket')" class="btn btn-primary" data-action="new-task" @click="openNew"><Icon name="plus" /> Tugas baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Terlambat" :value="String(data?.summary.overdue ?? 0)" foot="Tugas & tindak lanjut peluang" :tone="data?.summary.overdue ? 'neg' : ''" />
    <KpiTile label="Hari ini" :value="String(data?.summary.today ?? 0)" foot="Tenggat hari ini" />
    <KpiTile label="Mendatang" :value="String(data?.summary.upcoming ?? 0)" foot="Setelah hari ini" />
    <KpiTile label="Selesai 7 hari" :value="String(data?.summary.done7d ?? 0)" :foot="ctx.branchShort" />
  </div>
  <article class="card">
    <div class="card-head" style="flex-wrap:wrap;gap:var(--sp-2)">
      <div class="segmented" role="group" aria-label="Tampilan">
        <button :aria-pressed="view === 'mine'" data-act-view="mine" @click="view = 'mine'">Tugas saya</button>
        <button :aria-pressed="view === 'open'" data-act-view="open" @click="view = 'open'">Semua terbuka</button>
        <button :aria-pressed="view === 'done'" data-act-view="done" @click="view = 'done'">Riwayat selesai</button>
      </div>
      <div class="toolbar-spacer"></div>
      <select v-model="kind" class="select" style="max-width:180px" aria-label="Saring jenis"><option value="">Semua jenis</option><option v-for="(l, k) in KIND_LABEL" :key="k" :value="k">{{ l }}</option></select>
    </div>
    <div v-if="loading && !data" class="loading">Memuat…</div>
    <div v-else class="table-scroll"><table class="table" data-table="activities">
      <thead><tr><th>Jenis</th><th>Aktivitas</th><th>Tertaut ke</th><th>{{ view === 'done' ? 'Selesai' : 'Tenggat' }}</th><th>Penanggung jawab</th><th v-if="ctx.branch === 'ALL'">Cabang</th><th></th></tr></thead>
      <tbody>
        <tr v-for="a in pg.pageRows.value" :key="a.id" data-row :data-activity="a.subject" @click="go(a)">
          <td><span style="display:inline-flex;gap:6px;align-items:center"><Icon :name="KIND_ICON[a.kind] ?? 'edit'" />{{ KIND_LABEL[a.kind] }}</span></td>
          <td><span class="cell-strong">{{ a.subject }}</span><span v-if="a.notes || a.result" class="cell-sub">{{ a.result ?? a.notes }}</span></td>
          <td>{{ linkText(a) }}</td>
          <td class="num" :class="{ neg: a.overdue }">{{ F.datetime(view === 'done' ? a.doneAt : a.dueAt) }}<span v-if="a.overdue" class="cell-sub neg">terlambat</span></td>
          <td>{{ view === 'done' ? a.doneByName : a.assigneeName }}</td>
          <td v-if="ctx.branch === 'ALL'"><BranchTag v-if="a.branch" :code="a.branch" /></td>
          <td class="ta-r" @click.stop><button v-if="a.status === 'terbuka'" class="btn btn-sm" data-action="complete-activity" @click="openDone(a)"><Icon name="check" /> Selesai</button><Pill v-else :label="ACT_STATUS[a.status]?.label" :tone="ACT_STATUS[a.status]?.tone" /></td>
        </tr>
        <tr v-if="data && !pg.total.value" class="is-static"><td colspan="7" class="muted" style="text-align:center;padding:var(--sp-6)">Tidak ada aktivitas.</td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="aktivitas" />
  </article>
  <article v-if="view !== 'done' && data?.opportunities?.length" class="card" style="margin-top:var(--sp-4)">
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">Tindak lanjut peluang</h2><span class="card-note">Dari kolom “tindak lanjut” pada peluang terbuka.</span></div></div>
    <div class="table-scroll"><table class="table" data-table="opp-followups"><tbody>
      <tr v-for="o in data.opportunities" :key="o.id" data-row @click="router.push({ path: '/lead', query: { id: o.id } })">
        <td class="code cell-strong">{{ o.code }}</td><td>{{ o.title }}<span class="cell-sub">{{ o.companyName }}</span></td><td class="num" :class="{ neg: o.overdue }">{{ F.date(o.date) }}</td><td>{{ o.ownerName }}</td>
      </tr>
    </tbody></table></div>
  </article>

  <Modal v-if="doneFor" :title="`Selesaikan: ${doneFor.subject}`" subtitle="Catat hasilnya; tindak lanjut opsional dibuat sebagai tugas baru." width="520px" @close="doneFor = null">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="ad-res">Hasil</label><textarea id="ad-res" v-model="doneForm.result" class="textarea" rows="2" maxlength="1000" data-field="done-result"></textarea></div>
      <div class="field form-grid-full"><label class="check"><input v-model="doneForm.follow" type="checkbox" data-field="done-follow"> Buat tugas tindak lanjut</label></div>
      <template v-if="doneForm.follow">
        <div class="field form-grid-full"><input v-model="doneForm.subject" class="input" maxlength="200" aria-label="Judul tindak lanjut" data-field="done-follow-subject"></div>
        <div class="field"><input v-model="doneForm.dueAt" class="input" type="datetime-local" aria-label="Tenggat tindak lanjut"></div>
      </template>
    </div>
    <template #foot><button class="btn btn-primary" data-action="confirm-complete" :disabled="busy" @click="complete"><Icon name="check" /> Selesai</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="doneFor = null">Batal</button></template>
  </Modal>
  <Modal v-if="nf" title="Tugas baru" subtitle="Tugas terjadwal tertaut ke pelanggan atau pemasok dan tampil di profil 360-nya." width="620px" @close="nf = null">
    <div class="form-grid">
      <div class="field"><label for="nt-party">Pihak</label><select id="nt-party" v-model="nf.party" class="select" @change="nf.partyId = ''"><option value="customer">Pelanggan</option><option value="supplier">Pemasok</option></select></div>
      <div class="field"><label for="nt-pid">{{ nf.party === 'customer' ? 'Pelanggan' : 'Pemasok' }}</label>
        <select id="nt-pid" v-model="nf.partyId" class="select" data-field="task-party"><option value="">— Pilih —</option><option v-for="p in (nf.party === 'customer' ? parties.customers : parties.suppliers).filter((x: any) => x.status !== 'nonaktif')" :key="p.id" :value="p.id">{{ p.code }} · {{ p.name }}</option></select></div>
      <div class="field"><label for="nt-kind">Jenis</label><select id="nt-kind" v-model="nf.kind" class="select"><option v-for="k in ['tugas', 'telepon', 'rapat', 'kunjungan', 'email']" :key="k" :value="k">{{ KIND_LABEL[k] }}</option></select></div>
      <div class="field"><label for="nt-due">Tenggat</label><input id="nt-due" v-model="nf.dueAt" class="input" type="datetime-local" data-field="task-due"></div>
      <div class="field form-grid-full"><label for="nt-subj">Judul</label><input id="nt-subj" v-model="nf.subject" class="input" maxlength="200" data-field="task-subject"></div>
      <div class="field form-grid-full"><label for="nt-notes">Catatan</label><textarea id="nt-notes" v-model="nf.notes" class="textarea" rows="2" maxlength="2000"></textarea></div>
      <div class="field"><label for="nt-ass">Penanggung jawab</label><input id="nt-ass" v-model="nf.assigneeName" class="input" maxlength="120" :placeholder="session.user?.name"></div>
      <div v-if="nfErr.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in nfErr" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="save-task" :disabled="busy" @click="saveNew"><Icon name="check" /> Jadwalkan</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="nf = null">Batal</button></template>
  </Modal>
</template>
