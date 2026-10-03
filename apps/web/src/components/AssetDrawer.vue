<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, post } from '@/lib/api';
import { ASSET_TIMELINE } from '@/lib/assets';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { todayWib } from '@/lib/sales';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from './BranchTag.vue';
import Drawer from './Drawer.vue';
import Icon from './Icon.vue';
import JournalDrawer from './JournalDrawer.vue';
import Modal from './Modal.vue';
import Pill from './Pill.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const session = useSession();
const toast = useToast();
const a = ref<any>(null);
const load = async () => { try { a.value = await get(`/assets/${props.id}`); } catch (e) { toast.error(e, 'Aset tidak dapat dimuat'); emit('close'); } };
watch(() => props.id, () => { a.value = null; load(); }, { immediate: true });
const journalId = ref<string | null>(null);

const disposing = ref(false);
const banks = ref<any[]>([]);
const form = ref({ date: todayWib(), proceeds: 0, bank: '', note: '' });
const errors = ref<string[]>([]);
const busy = ref(false);
const gain = computed(() => Number(form.value.proceeds || 0) - (a.value?.bookValue ?? 0));
async function openDispose() {
  errors.value = [];
  try { banks.value = ((await get('/ledger/bank-accounts', { scoped: false })).accounts ?? []).filter((b: any) => b.status === 'aktif' && b.currency === 'IDR' && b.branchCode === a.value.branch); } catch { banks.value = []; }
  form.value = { date: todayWib(), proceeds: 0, bank: banks.value.find((b) => b.bankName !== 'Kas')?.code ?? '', note: '' };
  disposing.value = true;
}
async function dispose() {
  errors.value = []; busy.value = true;
  try {
    const r = await post(`/assets/${props.id}/dispose`, { date: form.value.date, proceeds: Math.round(Number(form.value.proceeds || 0)), bank: Number(form.value.proceeds) > 0 ? form.value.bank : undefined, note: form.value.note });
    toast.push('Aset dilepas', `${r.code} · ${r.gain >= 0 ? 'laba' : 'rugi'} ${F.rp(Math.abs(r.gain))}`, 'ok'); disposing.value = false; await load(); emit('changed');
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <Drawer :title="a ? a.name : 'Memuat…'" :subtitle="a ? `${a.category} · ${a.location || 'tanpa lokasi'} · akun ${a.glAccount}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="a"><span class="code">{{ a.code }}</span><Pill :status="a.status" /><BranchTag :code="a.branch" /></template></template>
    <template v-if="a">
      <div class="section">
        <dl class="deflist">
          <dt>Diperoleh</dt><dd class="num">{{ F.date(a.acquisitionDate) }}</dd>
          <dt>Harga perolehan</dt><dd class="num">{{ F.rp(a.cost) }}</dd>
          <dt>Akumulasi penyusutan</dt><dd class="num">{{ F.rp(a.accumulated) }}</dd>
          <dt>Nilai buku</dt><dd class="num cell-strong" data-nbv>{{ F.rp(a.bookValue) }}</dd>
          <dt>Penyusutan / bulan</dt><dd class="num">{{ F.rp(a.monthly) }}<template v-if="a.usefulLifeMonths"> · umur {{ a.usefulLifeMonths }} bulan</template><template v-if="a.salvage"> · residu {{ F.rp(a.salvage) }}</template></dd>
          <dt>Disusutkan s.d.</dt><dd class="num">{{ a.depreciatedThrough ? F.date(a.depreciatedThrough) : '—' }}</dd>
          <template v-if="a.disposedDate"><dt>Dilepas</dt><dd>{{ F.date(a.disposedDate) }} · hasil {{ F.rp(a.disposalProceeds ?? 0) }} — {{ a.disposalNote }}</dd></template>
        </dl>
      </div>
      <div v-if="a.depreciation.length" class="section">
        <span class="section-title">Riwayat penyusutan</span>
        <div class="table-scroll"><table class="table" data-table="asset-depr"><tbody>
          <tr v-for="d in a.depreciation" :key="d.docNo" class="is-static"><td>{{ d.period }}</td><td class="code">{{ d.docNo }}</td><td class="ta-r num">{{ F.rp(d.amount) }}</td><td class="ta-r num muted">NB {{ F.rp(d.bookValueAfter) }}</td></tr>
        </tbody></table></div>
      </div>
      <div v-if="a.maintenance.length" class="section">
        <span class="section-title">Pemeliharaan</span>
        <div class="table-scroll"><table class="table"><tbody>
          <tr v-for="m in a.maintenance" :key="m.id" class="is-static"><td class="code">{{ m.docNo }}</td><td>{{ m.kind }}<span class="cell-sub">{{ F.date(m.date) }}</span></td><td class="ta-r num">{{ F.rp(m.cost) }}</td><td><Pill :status="m.status" /></td></tr>
        </tbody></table></div>
      </div>
      <div v-if="a.journals.length" class="section">
        <span class="section-title">Jurnal</span>
        <div class="table-scroll"><table class="table" data-table="asset-journals"><tbody>
          <tr v-for="j in a.journals" :key="j.id" :data-row="session.can('ledger.journal.read') ? '' : undefined" :class="{ 'is-static': !session.can('ledger.journal.read') }" @click="session.can('ledger.journal.read') && (journalId = j.id)">
            <td class="code cell-strong">{{ j.journalNo }}</td><td>{{ j.rule }}<span class="cell-sub">{{ F.date(j.date) }}</span></td><td class="ta-r num">{{ F.rp(j.total) }}</td><td><Pill :status="j.status" /></td></tr>
        </tbody></table></div>
      </div>
      <div v-if="a.timeline.length" class="section">
        <span class="section-title">Linimasa</span>
        <div class="timeline"><div v-for="(x, i) in a.timeline" :key="i" class="tl-item">
          <span class="tl-rail"><i class="tl-node" :data-tone="ASSET_TIMELINE[x.action]?.tone || undefined"></i><i class="tl-line"></i></span>
          <span class="tl-body"><span class="tl-title"><b>{{ x.actor }}</b> {{ ASSET_TIMELINE[x.action]?.label ?? x.action }}</span><span class="tl-meta">{{ F.datetime(x.at) }}</span></span>
        </div></div>
      </div>
    </template>
    <template #foot>
      <template v-if="a">
        <button v-if="a.status === 'aktif' && session.can('asset.depreciate')" class="btn btn-danger" data-action="dispose-asset" @click="openDispose">Lepas / jual aset</button>
        <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="emit('close')">Tutup</button>
      </template>
    </template>
  </Drawer>
  <Modal v-if="disposing && a" :title="`Lepas ${a.code}`" :subtitle="`Nilai buku ${F.rp(a.bookValue)}. Jalankan penyusutan bulan berjalan lebih dulu bila perlu.`" width="520px" @close="disposing = false">
    <div class="form-grid">
      <div class="field"><label for="dp-date">Tanggal</label><input id="dp-date" v-model="form.date" class="input" type="date"></div>
      <div class="field"><label for="dp-proceeds">Hasil penjualan (Rp)</label><input id="dp-proceeds" v-model.number="form.proceeds" class="input num" type="number" min="0" step="1000" style="text-align:right">
        <span class="field-hint" :class="{ neg: gain < 0 }">{{ gain >= 0 ? 'Laba' : 'Rugi' }} pelepasan {{ F.rp(Math.abs(gain)) }}</span></div>
      <div v-if="form.proceeds > 0" class="field"><label for="dp-bank">Diterima di</label><select id="dp-bank" v-model="form.bank" class="select"><option v-for="b in banks" :key="b.code" :value="b.code">{{ b.code }} · {{ b.name }}</option></select></div>
      <div class="field form-grid-full"><label for="dp-note">Alasan</label><input id="dp-note" v-model="form.note" class="input" maxlength="300" placeholder="Mis. dijual / rusak berat"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot>
      <button class="btn btn-danger" data-action="confirm-dispose" :disabled="busy || form.note.trim().length < 3" @click="dispose"><Icon name="check" /> Lepas & posting</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="disposing = false">Batal</button>
    </template>
  </Modal>
  <JournalDrawer v-if="journalId" :id="journalId" @close="journalId = null" />
</template>
