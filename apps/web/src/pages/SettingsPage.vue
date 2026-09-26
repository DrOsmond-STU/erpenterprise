<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { get, patch } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Icon from '@/components/Icon.vue';
import ReportHead from '@/components/ReportHead.vue';

const ctx = useContext();
const session = useSession();
const toast = useToast();
const canManage = computed(() => session.can('admin.settings.manage'));
const { data, loading, reload } = useLoader<any>(() => get('/settings', { scoped: false }));
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const blank = () => ({ name: '', npwp: '', address: '', phone: '', email: '', website: '', fiscalYearStartMonth: 1,
  policies: { salesApprovalThreshold: 0, blockOverCreditLimit: true, allowPartialShipment: false, autoDocumentNumbering: true } });
const form = ref(blank());
function fill() {
  const d = data.value; if (!d) return;
  form.value = { name: d.name ?? '', npwp: d.npwp ?? '', address: d.address ?? '', phone: d.phone ?? '', email: d.email ?? '', website: d.website ?? '',
    fiscalYearStartMonth: d.fiscalYearStartMonth ?? 1, policies: { ...d.policies } };
}
watch(data, fill, { immediate: true });
const dirty = computed(() => {
  const d = data.value; if (!d) return false;
  const f = form.value;
  return ['name', 'npwp', 'address', 'phone', 'email', 'website'].some((k) => (f as any)[k] !== ((d as any)[k] ?? ''))
    || f.fiscalYearStartMonth !== d.fiscalYearStartMonth || JSON.stringify(f.policies) !== JSON.stringify(d.policies);
});
const threshold = computed({
  get: () => F.int(form.value.policies.salesApprovalThreshold),
  set: (v: string) => { form.value.policies.salesApprovalThreshold = Number(String(v).replace(/\D/g, '').slice(0, 13)) || 0; },
});
const errors = ref<string[]>([]);
const busy = ref(false);
async function save() {
  errors.value = []; busy.value = true;
  try {
    await patch('/settings', form.value);
    toast.push('Pengaturan disimpan', 'Profil perusahaan dan kebijakan dokumen diperbarui.', 'ok');
    await Promise.all([reload(), session.loadMe()]);
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Pengaturan" :sub="canManage ? 'Profil perusahaan, kebijakan dokumen, tampilan, dan ringkasan kebijakan keamanan.' : 'Anda hanya dapat melihat pengaturan perusahaan. Tampilan dapat diubah untuk diri sendiri.'">
    <template v-if="canManage">
      <button class="btn btn-ghost" data-action="reset-settings" :disabled="!dirty || busy" @click="fill(); errors = []">Batalkan</button>
      <button class="btn btn-primary" data-action="save-settings" :disabled="!dirty || busy" @click="save"><Icon name="check" /> Simpan pengaturan</button>
    </template>
  </ReportHead>
  <div v-if="loading && !data" class="loading">Memuat…</div>
  <template v-else-if="data">
    <div v-if="errors.length" class="card field-hint neg" role="alert" style="padding:var(--sp-3) var(--sp-4)"><div v-for="e in errors" :key="e">• {{ e }}</div></div>
    <section class="grid grid-1-2">
      <div style="display:grid;gap:var(--sp-4)">
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Tampilan</h2><span class="card-note">Berlaku di peramban ini saja.</span></div></div>
          <div class="card-body">
            <div class="setting-row"><div class="setting-text"><span class="setting-name">Tema</span><span class="setting-note">Ikuti sistem operasi atau pilih terang/gelap.</span></div>
              <div class="setting-control"><div class="segmented" role="radiogroup" aria-label="Tema">
                <button v-for="t in [['system', 'Sistem'], ['light', 'Terang'], ['dark', 'Gelap']]" :key="t[0]" type="button" :aria-pressed="ctx.theme === t[0]" :data-theme-option="t[0]" @click="ctx.theme = t[0] as any">{{ t[1] }}</button>
              </div></div></div>
            <div class="setting-row"><div class="setting-text"><span class="setting-name">Format angka</span><span class="setting-note">Rupiah, pemisah ribuan titik — contoh {{ F.rp(1234567) }}.</span></div></div>
          </div>
        </article>
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title"><Icon name="shield" /> Keamanan</h2><span class="card-note">Ditetapkan di server (dok. 11); tidak dapat diubah dari sini.</span></div></div>
          <div class="card-body" data-security>
            <div class="setting-row"><div class="setting-text"><span class="setting-name">Panjang minimal kata sandi</span><span class="setting-note">{{ data.security.passwordMinLength }} karakter, huruf dan angka</span></div></div>
            <div class="setting-row"><div class="setting-text"><span class="setting-name">Penguncian akun</span><span class="setting-note">Setelah {{ data.security.lockAfterFailedLogins }} kali gagal, terkunci {{ data.security.lockMinutes }} menit</span></div></div>
            <div class="setting-row"><div class="setting-text"><span class="setting-name">Sesi menganggur</span><span class="setting-note">Keluar otomatis setelah {{ data.security.idleMinutes }} menit tanpa aktivitas</span></div></div>
            <div class="setting-row"><div class="setting-text"><span class="setting-name">Token akses</span><span class="setting-note">Berlaku {{ data.security.accessTokenMinutes }} menit, diperbarui otomatis</span></div></div>
          </div>
        </article>
      </div>
      <div style="display:grid;gap:var(--sp-4)">
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title"><Icon name="building" /> Profil perusahaan</h2><span class="card-note">Kode {{ data.code }}<span v-if="data.updatedAt"> · diubah {{ F.datetime(data.updatedAt) }}</span></span></div></div>
          <fieldset class="card-body form-grid" :disabled="!canManage" style="border:0;margin:0">
            <div class="field form-grid-full"><label for="set-name">Nama perusahaan</label><input id="set-name" v-model="form.name" class="input" maxlength="160"></div>
            <div class="field"><label for="set-npwp">NPWP</label><input id="set-npwp" v-model="form.npwp" class="input code" maxlength="25" placeholder="01.234.567.8-901.000"></div>
            <div class="field"><label for="set-phone">Telepon</label><input id="set-phone" v-model="form.phone" class="input" maxlength="40"></div>
            <div class="field form-grid-full"><label for="set-address">Alamat</label><textarea id="set-address" v-model="form.address" class="textarea" rows="2" maxlength="400"></textarea></div>
            <div class="field"><label for="set-email">Email</label><input id="set-email" v-model="form.email" class="input" type="email" maxlength="200"></div>
            <div class="field"><label for="set-website">Situs web</label><input id="set-website" v-model="form.website" class="input" maxlength="200"></div>
            <div class="field"><label for="set-currency">Mata uang dasar</label><input id="set-currency" class="input" :value="data.baseCurrency" disabled><span class="field-hint">Tetap; semua buku besar dalam {{ data.baseCurrency }}.</span></div>
            <div class="field"><label for="set-fy">Awal tahun buku</label><select id="set-fy" v-model.number="form.fiscalYearStartMonth" class="select"><option v-for="(m, i) in MONTHS" :key="m" :value="i + 1">{{ m }}</option></select>
              <span class="field-hint">Berlaku untuk tahun buku berikutnya yang dibuat.</span></div>
          </fieldset>
        </article>
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Kebijakan dokumen</h2><span class="card-note">Dipakai modul penjualan dan persediaan.</span></div></div>
          <fieldset class="card-body" :disabled="!canManage" style="border:0;margin:0">
            <div class="setting-row"><div class="setting-text"><span class="setting-name">Batas persetujuan pesanan penjualan</span><span class="setting-note">Pesanan di atas nilai ini memerlukan persetujuan manajer.</span></div>
              <div class="setting-control"><input id="set-threshold" v-model="threshold" class="input num" inputmode="numeric" style="width:180px;text-align:right" aria-label="Batas persetujuan (Rp)"></div></div>
            <div class="setting-row"><div class="setting-text"><span class="setting-name">Blokir pesanan melebihi plafon kredit</span><span class="setting-note">Pesanan pelanggan yang melebihi plafon ditahan.</span></div>
              <div class="setting-control"><label class="switch"><input v-model="form.policies.blockOverCreditLimit" type="checkbox" data-policy="blockOverCreditLimit" aria-label="Blokir melebihi plafon"><span class="switch-track"></span><span class="switch-thumb"></span></label></div></div>
            <div class="setting-row"><div class="setting-text"><span class="setting-name">Izinkan pengiriman sebagian</span><span class="setting-note">Pesanan dapat dikirim bertahap.</span></div>
              <div class="setting-control"><label class="switch"><input v-model="form.policies.allowPartialShipment" type="checkbox" data-policy="allowPartialShipment" aria-label="Izinkan pengiriman sebagian"><span class="switch-track"></span><span class="switch-thumb"></span></label></div></div>
            <div class="setting-row"><div class="setting-text"><span class="setting-name">Penomoran dokumen otomatis</span><span class="setting-note">Nomor faktur/pesanan dibuat berurutan per cabang dan tahun.</span></div>
              <div class="setting-control"><label class="switch"><input v-model="form.policies.autoDocumentNumbering" type="checkbox" data-policy="autoDocumentNumbering" aria-label="Penomoran otomatis"><span class="switch-track"></span><span class="switch-thumb"></span></label></div></div>
          </fieldset>
        </article>
      </div>
    </section>
  </template>
</template>
