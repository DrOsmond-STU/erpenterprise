<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get } from '@/lib/api';
import * as F from '@/lib/format';
import { HEALTH_LABEL, PLANNING_TIMELINE } from '@/lib/planning';
import { SOURCE_LABEL } from '@/lib/sources';
import { todayWib } from '@/lib/sales';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from './BranchTag.vue';
import Drawer from './Drawer.vue';
import Icon from './Icon.vue';
import JournalDrawer from './JournalDrawer.vue';
import Pill from './Pill.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: []; edit: [doc: any] }>();
const session = useSession();
const toast = useToast();
const p = ref<any>(null);
const load = async () => { try { p.value = await get(`/projects/${props.id}`); } catch (e) { toast.error(e, 'Proyek tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { p.value = null; load(); }, { immediate: true });
defineExpose({ load });

/* Gantt sederhana: posisi bilah relatif terhadap rentang proyek. */
const span = computed(() => {
  if (!p.value) return { from: 0, days: 1 };
  const from = new Date(p.value.startDate).getTime();
  return { from, days: Math.max(1, (new Date(p.value.endDate).getTime() - from) / 86_400_000 + 1) };
});
const bar = (t: any) => {
  const s = (new Date(t.startDate).getTime() - span.value.from) / 86_400_000;
  const len = (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / 86_400_000 + 1;
  return { left: `${(s / span.value.days) * 100}%`, width: `${Math.max((len / span.value.days) * 100, 1.5)}%` };
};
const todayPos = computed(() => {
  const d = (new Date(todayWib()).getTime() - span.value.from) / 86_400_000;
  return d < 0 || d > span.value.days ? null : `${(d / span.value.days) * 100}%`;
});
const journalId = ref<string | null>(null);
</script>

<template>
  <Drawer :title="p?.name ?? 'Memuat…'" :subtitle="p ? `${p.customerName} · PM ${p.pmName} · ${F.date(p.startDate)} – ${F.date(p.endDate)}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="p"><span class="code">{{ p.code }}</span><Pill :status="p.status" /><Pill :status="p.health" /><BranchTag :code="p.branch" /></template></template>
    <template v-if="p">
      <div v-if="p.health !== 'hijau'" class="section" :style="p.health === 'merah' ? 'background:var(--danger-soft)' : 'background:var(--warn-soft)'" data-health>
        <span class="setting-name">{{ HEALTH_LABEL[p.health] }}</span>
        <span class="setting-note">{{ p.health === 'merah' ? `Biaya aktual ${F.rp(p.actual)} melampaui anggaran ${F.rp(p.budget)}.` : `Serapan ${F.pct(p.absorption)} sementara kemajuan baru ${p.progress}% — risiko melampaui anggaran.` }}</span>
      </div>
      <div class="section">
        <div class="kpi-row">
          <div class="kpi-tile"><span class="kpi-label">Anggaran biaya</span><span class="kpi-value">{{ F.rpCompact(p.budget) }}</span></div>
          <div class="kpi-tile" data-project-actual><span class="kpi-label">Biaya aktual (buku besar)</span><span class="kpi-value">{{ F.rpCompact(p.actual) }}</span><span class="kpi-foot">serapan {{ F.pct(p.absorption) }}</span></div>
          <div class="kpi-tile"><span class="kpi-label">Kemajuan</span><span class="kpi-value">{{ p.progress }}%</span><span class="kpi-foot">{{ p.taskCount }} tugas</span></div>
          <div class="kpi-tile"><span class="kpi-label">Pendapatan / margin</span><span class="kpi-value">{{ F.rpCompact(p.revenue) }}</span><span class="kpi-foot" :class="p.margin < 0 ? 'neg' : ''">margin {{ F.rpCompact(p.margin) }} · kontrak {{ F.rpCompact(p.contractValue) }}</span></div>
        </div>
        <span v-if="p.pendingJournalLines" class="setting-note">{{ p.pendingJournalLines }} baris jurnal proyek masih menunggu posting (belum dihitung).</span>
      </div>
      <div v-if="p.tasks.length" class="section">
        <span class="section-title">Jadwal & kemajuan tugas</span>
        <div class="gantt" data-gantt style="display:flex;flex-direction:column;gap:6px">
          <div v-for="t in p.tasks" :key="t.id" style="display:grid;grid-template-columns:minmax(120px,32%) 1fr;gap:var(--sp-3);align-items:center" :data-task="t.name">
            <span><span class="cell-strong">{{ t.name }}</span><span class="cell-sub">{{ F.date(t.startDate) }} – {{ F.date(t.endDate) }}<template v-if="t.assignee"> · {{ t.assignee }}</template></span></span>
            <span style="position:relative;height:18px;background:var(--surface-2);border-radius:4px">
              <span :style="{ position: 'absolute', top: '2px', bottom: '2px', ...bar(t), background: 'var(--accent-soft, var(--info-soft))', borderRadius: '3px', overflow: 'hidden' }">
                <span :style="{ display: 'block', height: '100%', width: t.progress + '%', background: 'var(--accent)' }"></span>
              </span>
              <span v-if="todayPos" :style="{ position: 'absolute', top: 0, bottom: 0, left: todayPos, width: '2px', background: 'var(--danger)' }" title="Hari ini"></span>
              <span style="position:absolute;right:4px;top:0;font-size:11px" class="num">{{ t.progress }}%</span>
            </span>
          </div>
        </div>
      </div>
      <div class="section">
        <span class="section-title">Biaya & pendapatan per akun</span>
        <div v-if="!p.byAccount.length" class="muted">Belum ada baris jurnal bertanda proyek. Tandai proyek pada jurnal memorial, permintaan pembelian, PO, atau tagihan jasa.</div>
        <div v-else class="table-scroll"><table class="table" data-table="project-accounts"><tbody>
          <tr v-for="a in p.byAccount" :key="a.account" class="is-static"><td><span class="code">{{ a.account }}</span> {{ a.name }}<span class="cell-sub">{{ a.category }}</span></td><td class="ta-r num">{{ F.rp(a.amount) }}</td></tr>
        </tbody></table></div>
      </div>
      <div v-if="p.entries.length" class="section">
        <span class="section-title">Baris jurnal proyek ({{ p.entries.length }})</span>
        <div class="table-scroll"><table class="table" data-table="project-entries"><tbody>
          <tr v-for="(e, i) in p.entries" :key="i" :data-row="session.can('ledger.journal.read') ? '' : undefined" :class="{ 'is-static': !session.can('ledger.journal.read') }" @click="session.can('ledger.journal.read') && (journalId = e.journalId)">
            <td class="code cell-strong">{{ e.journalNo }}</td><td class="num">{{ F.date(e.date) }}</td>
            <td>{{ e.description }}<span class="cell-sub">{{ SOURCE_LABEL[e.source] ?? e.source }} · <span class="code">{{ e.account }}</span></span></td>
            <td class="ta-r num">{{ e.debit ? F.rp(e.debit) : '' }}</td><td class="ta-r num">{{ e.credit ? F.rp(e.credit) : '' }}</td>
          </tr>
        </tbody></table></div>
      </div>
      <div v-if="p.orders.length" class="section">
        <span class="section-title">Pesanan pembelian proyek</span>
        <div class="table-scroll"><table class="table"><tbody>
          <tr v-for="o in p.orders" :key="o.id" class="is-static"><td><RouterLink class="code" :to="{ path: '/pesanan-pembelian', query: { id: o.id } }">{{ o.docNo }}</RouterLink></td><td class="num">{{ F.date(o.date) }}</td><td class="ta-r num">{{ F.rp(o.total) }}</td><td><Pill :status="o.status" /></td></tr>
        </tbody></table></div>
      </div>
      <div v-if="p.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline"><div v-for="(t, i) in p.timeline" :key="i" class="tl-item">
          <span class="tl-rail"><i class="tl-node" :data-tone="PLANNING_TIMELINE[t.action]?.tone || undefined"></i><i class="tl-line"></i></span>
          <span class="tl-body"><span class="tl-title"><b>{{ t.actor }}</b> {{ PLANNING_TIMELINE[t.action]?.label ?? t.action }}<template v-if="t.detail?.status"> → {{ t.detail.status }}</template></span><span class="tl-meta">{{ F.datetime(t.at) }}</span></span>
        </div></div>
      </div>
    </template>
    <template #foot>
      <button v-if="p && session.can('project.manage')" class="btn btn-primary" data-action="edit-project" @click="emit('edit', p)"><Icon name="edit" /> Ubah proyek & tugas</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="emit('close')">Tutup</button>
    </template>
  </Drawer>
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" @changed="journalId = null; load()" />
</template>
