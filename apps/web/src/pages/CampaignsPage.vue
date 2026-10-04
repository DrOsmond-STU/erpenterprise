<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { get, patch, post } from '@/lib/api';
import { CAMPAIGN_STATUS, CHANNELS, CRM_TIMELINE_FULL, LEAD_STATUS, STAGE_LABEL, todayWib } from '@/lib/crm';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Drawer from '@/components/Drawer.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const route = useRoute();
const router = useRouter();
const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/crm/campaigns'));
const tot = computed(() => (data.value ?? []).reduce((t: any, k: any) => ({ budget: t.budget + k.budget, spend: t.spend + k.spend, leads: t.leads + k.leads, won: t.won + k.wonValue, active: t.active + (k.status === 'berjalan' ? 1 : 0) }), { budget: 0, spend: 0, leads: 0, won: 0, active: 0 }));
const canManage = computed(() => session.can('crm.campaign'));
const openId = ref<string | null>(route.query.id ? String(route.query.id) : null);
const k = ref<any>(null);
const load = async () => { if (!openId.value) { k.value = null; return; } try { k.value = await get(`/crm/campaigns/${openId.value}`); } catch (e) { toast.error(e, 'Kampanye tidak dapat dimuat'); openId.value = null; } };
watch(openId, load, { immediate: true });
const form = ref<any>(null);
const errs = ref<string[]>([]);
const busy = ref(false);
function openForm(x?: any) { errs.value = []; form.value = x ? { ...x, notes: x.notes ?? '' } : { name: '', channel: 'Digital', startDate: todayWib(), endDate: todayWib(), budget: 0, status: 'rencana', notes: '' }; }
async function save() {
  busy.value = true; errs.value = [];
  const f = form.value;
  const body = { name: f.name, channel: f.channel, startDate: f.startDate, endDate: f.endDate, budget: Math.round(Number(f.budget) || 0), status: f.status, notes: f.notes || null };
  try { const r = f.id ? await patch(`/crm/campaigns/${f.id}`, body) : await post('/crm/campaigns', body); form.value = null; toast.push('Kampanye disimpan', `${r.code} · ${r.name}`, 'ok'); reload(); openId.value = r.id; load(); }
  catch (e) { errs.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Kampanye" sub="Efektivitas pemasaran: lead, konversi, pipeline, dan nilai menang per kampanye. Biaya aktual = tagihan pemasok bertanda kampanye yang sudah diposting ke buku besar (beban pemasaran), sehingga ROI cocok dengan laba rugi.">
    <button v-if="canManage" class="btn btn-primary" data-action="new-campaign" @click="openForm()"><Icon name="plus" /> Kampanye baru</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Kampanye berjalan" :value="String(tot.active)" :foot="`${data?.length ?? 0} kampanye`" />
    <KpiTile label="Biaya aktual" :value="F.rpCompact(tot.spend)" :foot="`Anggaran ${F.rpCompact(tot.budget)}`" />
    <KpiTile label="Lead dihasilkan" :value="String(tot.leads)" :foot="tot.leads ? `Biaya per lead ${F.rpCompact(tot.spend / tot.leads)}` : '—'" />
    <KpiTile label="Nilai menang" :value="F.rpCompact(tot.won)" :foot="tot.spend ? `ROI ${F.pct(((tot.won - tot.spend) / tot.spend) * 100)}` : 'Belum ada biaya'" :tone="tot.spend && tot.won < tot.spend ? 'neg' : ''" />
  </div>
  <article class="card">
    <div v-if="loading && !data" class="loading">Memuat…</div>
    <div v-else class="table-scroll"><table class="table" data-table="campaigns">
      <thead><tr><th>Kampanye</th><th>Kanal</th><th>Periode</th><th class="ta-r">Lead</th><th class="ta-r">Dikonversi</th><th class="ta-r">Pipeline</th><th class="ta-r">Menang</th><th>Biaya vs anggaran</th><th class="ta-r">ROI</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="x in data ?? []" :key="x.id" data-row :data-campaign="x.code" @click="openId = x.id">
          <td><span class="cell-strong">{{ x.name }}</span><span class="cell-sub code">{{ x.code }}</span></td><td>{{ x.channel }}</td>
          <td class="num">{{ F.date(x.startDate) }}<span class="cell-sub">s.d. {{ F.date(x.endDate) }}</span></td>
          <td class="ta-r num">{{ x.leads }}</td><td class="ta-r num">{{ x.converted }}</td><td class="ta-r num">{{ F.rpCompact(x.pipeline) }}</td><td class="ta-r num">{{ F.rpCompact(x.wonValue) }}</td>
          <td style="min-width:160px"><div class="meter"><span class="meter-track"><span class="meter-fill" :style="{ width: Math.min(x.budgetUsed, 100) + '%' }" :data-tone="x.budgetUsed > 100 ? 'danger' : undefined"></span></span><span class="meter-val">{{ F.rpCompact(x.spend) }}</span></div></td>
          <td class="ta-r num" :class="{ neg: x.roi !== null && x.roi < 0, pos: x.roi > 0 }">{{ x.roi === null ? '—' : F.pct(x.roi) }}</td>
          <td><Pill :label="CAMPAIGN_STATUS[x.status]?.label" :tone="CAMPAIGN_STATUS[x.status]?.tone" /></td>
        </tr>
        <tr v-if="data && !data.length" class="is-static"><td colspan="10" class="muted" style="text-align:center;padding:var(--sp-6)">Belum ada kampanye.</td></tr>
      </tbody>
    </table></div>
  </article>

  <Drawer v-if="openId && k" :title="k.name" :subtitle="`${k.channel} · ${F.date(k.startDate)} – ${F.date(k.endDate)} · anggaran ${F.rp(k.budget)}`" @close="openId = null">
    <template #eyebrow><span class="code">{{ k.code }}</span><Pill :label="CAMPAIGN_STATUS[k.status]?.label" :tone="CAMPAIGN_STATUS[k.status]?.tone" /></template>
    <div class="section">
      <span class="section-title">Hasil</span>
      <div class="totals">
        <div class="totals-row"><span>Lead / dikonversi</span><b>{{ k.leads }} / {{ k.converted }}</b></div>
        <div class="totals-row"><span>Peluang · pipeline tertimbang</span><b>{{ k.opportunities }} · {{ F.rp(k.pipeline) }}</b></div>
        <div class="totals-row"><span>Nilai menang</span><b>{{ F.rp(k.wonValue) }}</b></div>
        <div class="totals-row"><span>Biaya aktual ({{ F.pct(k.budgetUsed) }} anggaran)</span><b>{{ F.rp(k.spend) }}</b></div>
        <div class="totals-row"><span>Biaya per lead</span><b>{{ F.rp(k.costPerLead) }}</b></div>
        <div class="totals-row totals-grand"><span>ROI</span><b :class="{ neg: k.roi !== null && k.roi < 0 }">{{ k.roi === null ? '—' : F.pct(k.roi) }}</b></div>
      </div>
    </div>
    <div class="section">
      <span class="section-title">Biaya — tagihan pemasok ({{ k.invoices.length }})</span>
      <div v-if="!k.invoices.length" class="muted">Belum ada. Tandai kampanye saat mencatat tagihan pemasok langsung (mis. biaya iklan, sewa stan).</div>
      <div v-else class="table-scroll"><table class="table" data-table="campaign-invoices"><tbody>
        <tr v-for="i in k.invoices" :key="i.id" data-row @click="router.push({ path: '/tagihan-pemasok', query: { id: i.id } })"><td class="code cell-strong">{{ i.docNo }}</td><td>{{ i.supplierName }}</td><td class="num">{{ F.date(i.date) }}</td><td class="ta-r num">{{ F.rp(i.net) }}</td><td><Pill :status="i.status" /></td></tr>
      </tbody></table></div>
    </div>
    <div class="section">
      <span class="section-title">Lead ({{ k.leadList.length }})</span>
      <div class="table-scroll"><table class="table"><tbody>
        <tr v-for="l in k.leadList" :key="l.id" data-row @click="router.push({ path: '/prospek', query: { id: l.id } })"><td class="code">{{ l.code }}</td><td>{{ l.name }}<span class="cell-sub">{{ l.companyName }}</span></td><td><Pill :label="LEAD_STATUS[l.status]?.label" :tone="LEAD_STATUS[l.status]?.tone" /></td></tr>
        <tr v-if="!k.leadList.length" class="is-static"><td class="muted">Belum ada lead.</td></tr>
      </tbody></table></div>
    </div>
    <div v-if="k.opportunityList.length" class="section">
      <span class="section-title">Peluang</span>
      <div class="table-scroll"><table class="table"><tbody>
        <tr v-for="o in k.opportunityList" :key="o.id" data-row @click="router.push({ path: '/lead', query: { id: o.id } })"><td class="code">{{ o.code }}</td><td>{{ o.name }}<span class="cell-sub">{{ o.companyName }}</span></td><td class="ta-r num">{{ F.rpCompact(o.value) }}</td><td>{{ STAGE_LABEL[o.stage] }}</td></tr>
      </tbody></table></div>
    </div>
    <div class="section">
      <span class="section-title">Riwayat</span>
      <div class="timeline"><div v-for="(e, i) in k.timeline" :key="i" class="tl-item"><span class="tl-rail"><i class="tl-node" :data-tone="CRM_TIMELINE_FULL[e.action]?.tone || undefined"></i><i class="tl-line"></i></span>
        <span class="tl-body"><span class="tl-title"><b>{{ e.actor }}</b> {{ CRM_TIMELINE_FULL[e.action]?.label ?? e.action }}</span><span class="tl-meta">{{ F.datetime(e.at) }}</span></span></div></div>
    </div>
    <template #foot>
      <button v-if="session.can('crm.manage')" class="btn" @click="router.push({ path: '/prospek', query: { campaign: k.id } })"><Icon name="users" /> Lead kampanye</button>
      <button v-if="canManage" class="btn" data-action="edit-campaign" @click="openForm(k)"><Icon name="edit" /> Ubah</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="openId = null">Tutup</button>
    </template>
  </Drawer>

  <Modal v-if="form" :title="form.id ? `Ubah ${form.code}` : 'Kampanye baru'" subtitle="Biaya aktual tidak diinput di sini — dicatat lewat tagihan pemasok bertanda kampanye agar masuk buku besar." width="640px" @close="form = null">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="cp-name">Nama</label><input id="cp-name" v-model="form.name" class="input" maxlength="160" data-field="campaign-name"></div>
      <div class="field"><label for="cp-ch">Kanal</label><select id="cp-ch" v-model="form.channel" class="select"><option v-for="c in CHANNELS" :key="c">{{ c }}</option></select></div>
      <div class="field"><label for="cp-st">Status</label><select id="cp-st" v-model="form.status" class="select"><option v-for="(s, key) in CAMPAIGN_STATUS" :key="key" :value="key">{{ s.label }}</option></select></div>
      <div class="field"><label for="cp-start">Mulai</label><input id="cp-start" v-model="form.startDate" class="input" type="date"></div>
      <div class="field"><label for="cp-end">Selesai</label><input id="cp-end" v-model="form.endDate" class="input" type="date" data-field="campaign-end"></div>
      <div class="field"><label for="cp-budget">Anggaran (Rp)</label><input id="cp-budget" v-model.number="form.budget" class="input num" type="number" min="0" step="1000000" style="text-align:right" data-field="campaign-budget"></div>
      <div class="field form-grid-full"><label for="cp-notes">Catatan</label><textarea id="cp-notes" v-model="form.notes" class="textarea" rows="2" maxlength="1000"></textarea></div>
      <div v-if="errs.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errs" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="save-campaign" :disabled="busy" @click="save"><Icon name="check" /> Simpan</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="form = null">Batal</button></template>
  </Modal>
</template>
