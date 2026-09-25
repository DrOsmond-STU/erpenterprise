<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { get, post } from '@/lib/api';
import * as F from '@/lib/format';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from './BranchTag.vue';
import Drawer from './Drawer.vue';
import Icon from './Icon.vue';
import Pill from './Pill.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: []; changed: [msg: string] }>();
const session = useSession();
const ctx = useContext();
const toast = useToast();
const router = useRouter();
const j = ref<any>(null);
const busy = ref(false);
const reason = ref('');
watch(() => props.id, async (id) => { j.value = null; j.value = await get(`/ledger/journals/${id}`); }, { immediate: true });

async function act(action: 'post' | 'reject' | 'reverse') {
  busy.value = true;
  try {
    if (action === 'post') { await post(`/ledger/journals/${props.id}/post`); emit('changed', `Jurnal ${j.value.journalNo} diposting`); }
    else if (action === 'reject') { await post(`/ledger/journals/${props.id}/reject`, { reason: reason.value || 'Ditolak' }); emit('changed', `Jurnal ${j.value.journalNo} ditolak`); }
    else { const r = await post(`/ledger/journals/${props.id}/reverse`, { reason: reason.value || 'Koreksi' }); emit('changed', `Jurnal balik ${r.journalNo} diposting`); }
  } catch (e) { toast.error(e, action === 'post' ? 'Posting ditolak' : 'Tindakan gagal'); }
  finally { busy.value = false; }
}
function openCard(code: string) { emit('close'); router.push({ path: '/buku-besar', query: { akun: code } }); }
const isOwn = () => j.value?.createdBy === session.user?.id;
</script>

<template>
  <Drawer :title="j?.description ?? 'Memuat…'" :subtitle="j ? `${F.date(j.date)} · ${j.source} · dibuat oleh ${j.createdByName}` : ''" @close="emit('close')">
    <template #eyebrow><template v-if="j"><span class="code">{{ j.journalNo }}</span><Pill :status="j.status" /><BranchTag :code="j.branch" /></template></template>
    <template v-if="j">
      <div v-if="j.status === 'pending'" class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)">
        <div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="wl-icon" data-tone="warn"><Icon name="alert" /></span>
          <div class="setting-text"><span class="setting-name">Menunggu persetujuan</span><span class="setting-note">{{ isOwn() ? 'Anda pembuat jurnal ini; posting harus dilakukan orang lain (kontrol empat mata).' : 'Belum memengaruhi buku besar sampai diposting oleh akuntan berwenang.' }}</span></div></div>
      </div>
      <div class="section">
        <span class="section-title">Rincian jurnal</span>
        <dl class="deflist">
          <dt>Tanggal</dt><dd class="num">{{ F.date(j.date) }}</dd>
          <dt>Cabang</dt><dd>{{ ctx.nameOf(j.branch) }}</dd>
          <dt>Periode</dt><dd class="code">{{ j.period }}</dd>
          <dt>Referensi</dt><dd class="code">{{ j.ref || '—' }}</dd>
          <dt>Nilai</dt><dd class="num">{{ F.rp(j.total) }}</dd>
          <dt v-if="j.postedAt">Diposting</dt><dd v-if="j.postedAt" class="num">{{ F.datetime(j.postedAt) }}</dd>
          <dt v-if="j.reversedByJournalId">Dibalik oleh</dt><dd v-if="j.reversedByJournalId" class="code">{{ j.reversedByJournalId.slice(0, 8) }}…</dd>
        </dl>
      </div>
      <div class="section">
        <span class="section-title">Baris jurnal ({{ j.lines.length }})</span>
        <div class="table-scroll"><table class="table">
          <thead><tr><th>Akun</th><th class="ta-r">Debit</th><th class="ta-r">Kredit</th></tr></thead>
          <tbody>
            <tr v-for="l in j.lines" :key="l.lineNo" class="is-static">
              <td :style="l.credit ? 'padding-left:var(--sp-6)' : ''"><button class="link-btn" :data-gl="l.account" @click="openCard(l.account)"><span class="code">{{ l.account }}</span> {{ l.accountName }}</button><span v-if="l.bankName" class="cell-sub">{{ l.bankName }}</span><span v-if="l.party" class="cell-sub">{{ l.party }}</span></td>
              <td class="ta-r num">{{ l.debit ? F.int(l.debit) : '—' }}</td><td class="ta-r num">{{ l.credit ? F.int(l.credit) : '—' }}</td>
            </tr>
          </tbody>
          <tfoot><tr class="report-total"><td>Total</td><td class="ta-r num">{{ F.int(j.total) }}</td><td class="ta-r num">{{ F.int(j.total) }}</td></tr></tfoot>
        </table></div>
        <div style="margin-top:var(--sp-2)"><Pill label="Seimbang — debit = kredit" tone="ok" /></div>
      </div>
      <div v-if="(j.status === 'pending' && session.can('ledger.journal.post')) || (j.status === 'posted' && session.can('ledger.journal.reverse'))" class="section">
        <div class="field"><label for="jv-reason">Alasan (untuk penolakan / pembalikan)</label><input id="jv-reason" v-model="reason" class="input" placeholder="Wajib diisi untuk menolak atau membalik"></div>
      </div>
    </template>
    <template #foot>
      <template v-if="j?.status === 'pending' && session.can('ledger.journal.post')">
        <button class="btn btn-primary" :disabled="busy || isOwn()" data-action="post-journal" @click="act('post')"><Icon name="check" /> Posting</button>
        <button class="btn btn-danger" :disabled="busy || reason.length < 3" @click="act('reject')"><Icon name="x" /> Tolak</button>
      </template>
      <button v-else-if="j?.status === 'posted' && session.can('ledger.journal.reverse')" class="btn" :disabled="busy || reason.length < 3" @click="act('reverse')">Buat jurnal balik</button>
      <button v-if="j" class="btn" @click="openCard(j.lines[0]?.account ?? '1-1100')"><Icon name="book" /> Kartu buku besar</button>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-ghost" @click="emit('close')">Tutup</button>
    </template>
  </Drawer>
</template>
