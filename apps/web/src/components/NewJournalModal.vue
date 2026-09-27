<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { get, post } from '@/lib/api';
import * as F from '@/lib/format';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import Icon from './Icon.vue';
import Modal from './Modal.vue';

const emit = defineEmits<{ close: []; created: [journal: any] }>();
const ctx = useContext();
const session = useSession();
const accounts = ref<any[]>([]);
const allAccounts = ref<any[]>([]);
const banks = ref<any[]>([]);
const openMonths = session.periods.filter((p) => p.group === 'Bulan' && p.status === 'open');
const today = new Date().toISOString().slice(0, 10);
/* Tanggal bawaan mengikuti periode yang dipilih bila terbuka (hari ini jika di dalamnya, selain itu batas periode);
   jika periode terpilih tertutup, pakai hari ini bila berada di periode terbuka, atau periode terbuka terdekat. */
function defaultDate(): string {
  const sel = ctx.periodInfo;
  if (sel && sel.group === 'Bulan' && sel.status === 'open') return today >= sel.from && today <= sel.to ? today : today > sel.to ? sel.to : sel.from;
  if (openMonths.some((p) => today >= p.from && today <= p.to)) return today;
  return openMonths.filter((p) => p.to < today).at(-1)?.to ?? openMonths[0]?.from ?? today;
}
const date = ref(defaultDate());
const branch = ref(ctx.branch === 'ALL' ? (session.branches[0]?.code ?? '') : ctx.branch);
const description = ref('');
const refNo = ref('');
interface Line { account: string; debit: number | null; credit: number | null }
const lines = ref<Line[]>(Array.from({ length: 4 }, () => ({ account: '', debit: null, credit: null })));
const errors = ref<string[]>([]);
const busy = ref(false);

onMounted(async () => {
  const [a, b] = await Promise.all([get('/ledger/accounts'), get('/ledger/bank-accounts', { scoped: false })]);
  allAccounts.value = a.accounts;
  accounts.value = a.accounts.filter((x: any) => x.type === 'detail' && !x.isComputed && x.status === 'aktif');
  banks.value = b.accounts;
});
/* Hanya akun detail (level 4–5). Akun kas/bank = rekening; hanya rekening cabang terpilih yang ditawarkan. */
const bankOfGl = computed(() => new Map(banks.value.map((b) => [b.glAccountCode, b])));
const usable = computed(() => accounts.value.filter((a) => !a.isCash || (bankOfGl.value.get(a.code)?.branchCode === branch.value && bankOfGl.value.get(a.code)?.currency === 'IDR')));
const headerName = computed(() => new Map(allAccounts.value.map((a) => [a.code, a.name])));
const groups = computed(() => {
  const m = new Map<string, any[]>();
  for (const a of usable.value) { const k = a.parentCode ?? a.code; (m.get(k) ?? m.set(k, []).get(k)!).push(a); }
  return [...m.entries()].map(([code, items]) => ({ label: `${code} ${headerName.value.get(code) ?? ''}`, items }));
});
const totalD = computed(() => lines.value.reduce((s, l) => s + (Number(l.debit) || 0), 0));
const totalK = computed(() => lines.value.reduce((s, l) => s + (Number(l.credit) || 0), 0));
const diff = computed(() => Math.abs(totalD.value - totalK.value));
const openPeriods = computed(() => openMonths);

async function submit() {
  errors.value = []; busy.value = true;
  try {
    const body = {
      date: date.value, branch: branch.value, description: description.value, ref: refNo.value || null,
      lines: lines.value.filter((l) => l.account || l.debit || l.credit).map((l) => ({ account: l.account, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
    };
    const j = await post('/ledger/journals', body);
    emit('created', j);
  } catch (e: any) {
    errors.value = Array.isArray(e.details) ? e.details.map((d: any) => (typeof d === 'string' ? d : `${d.path}: ${d.message}`)) : [e.message];
  } finally { busy.value = false; }
}
</script>

<template>
  <Modal title="Jurnal memorial baru" subtitle="Hanya akun detail (level 4–5) yang dapat dipakai; akun kas/bank mewakili rekeningnya. Total debit harus sama dengan kredit. Tersimpan sebagai menunggu persetujuan." @close="emit('close')">
    <div class="form-grid">
      <div class="field"><label for="jv-date">Tanggal</label><input id="jv-date" v-model="date" class="input num" type="date" :min="openPeriods[0]?.from" :max="openPeriods.at(-1)?.to"><span class="field-hint">Periode terbuka: {{ openPeriods.map((p) => p.label).join(', ') || '—' }}</span></div>
      <div class="field"><label for="jv-branch">Cabang</label><select id="jv-branch" v-model="branch" class="select"><option v-for="b in session.branches.filter((x) => x.status === 'aktif')" :key="b.code" :value="b.code">{{ b.name }}</option></select></div>
      <div class="field form-grid-full"><label for="jv-desc">Keterangan</label><input id="jv-desc" v-model="description" class="input" placeholder="Mis. Reklasifikasi beban sewa Agu 2026" maxlength="300"></div>
      <div class="field"><label for="jv-ref">Referensi dokumen</label><input id="jv-ref" v-model="refNo" class="input code" placeholder="Opsional" maxlength="60"></div>
      <div class="field form-grid-full">
        <label>Baris jurnal</label>
        <div class="table-scroll"><table class="table jv-lines">
          <thead><tr><th>Akun</th><th class="ta-r" style="width:160px">Debit</th><th class="ta-r" style="width:160px">Kredit</th></tr></thead>
          <tbody id="jv-body">
            <tr v-for="(l, i) in lines" :key="i" class="is-static">
              <td>
                <select v-model="l.account" class="select" data-jv-acc :aria-label="`Akun baris ${i + 1}`">
                  <option value="">— pilih akun —</option>
                  <optgroup v-for="g in groups" :key="g.label" :label="g.label"><option v-for="a in g.items" :key="a.code" :value="a.code">{{ a.code }} · {{ a.name }}</option></optgroup>
                </select>
              </td>
              <td><input v-model.number="l.debit" class="input input-num" data-jv-debit type="number" min="0" step="1000" placeholder="0" :aria-label="`Debit baris ${i + 1}`"></td>
              <td><input v-model.number="l.credit" class="input input-num" data-jv-credit type="number" min="0" step="1000" placeholder="0" :aria-label="`Kredit baris ${i + 1}`"></td>
            </tr>
          </tbody>
        </table></div>
        <button class="btn btn-sm" style="align-self:flex-start" @click="lines.push({ account: '', debit: null, credit: null })"><Icon name="plus" /> Tambah baris</button>
      </div>
      <div class="field form-grid-full">
        <div class="totals">
          <div class="totals-row"><span>Total debit</span><b class="num">{{ F.rp(totalD) }}</b></div>
          <div class="totals-row"><span>Total kredit</span><b class="num">{{ F.rp(totalK) }}</b></div>
          <div class="totals-row totals-grand"><span>Selisih</span><b class="num" :class="diff < 1 ? 'pos' : 'neg'">{{ F.rp(diff) }}</b></div>
        </div>
        <div v-if="errors.length" class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div>
      </div>
    </div>
    <template #foot>
      <button class="btn btn-primary" data-action="submit-journal" :disabled="busy || diff >= 1 || !description" @click="submit"><Icon name="check" /> Kirim untuk persetujuan</button>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-ghost" @click="emit('close')">Batal</button>
    </template>
  </Modal>
</template>
