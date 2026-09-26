<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { passwordProblems, PERMISSION_CATALOG } from '@erp/domain';
import { del, get, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { landingFor } from '@/router';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Icon from '@/components/Icon.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const route = useRoute();
const router = useRouter();
const session = useSession();
const toast = useToast();
const forced = computed(() => Boolean(session.user?.mustChangePassword));
const LABEL = new Map(PERMISSION_CATALOG.flatMap((g) => g.items.map((i) => [i.code, `${g.group}: ${i.label}`] as const)));

/* Ganti kata sandi */
const form = ref({ current: '', next: '', confirm: '' });
const show = ref(false);
const busy = ref(false);
const errors = ref<string[]>([]);
const hints = computed(() => (form.value.next ? passwordProblems(form.value.next, session.user?.email) : []));
const mismatch = computed(() => form.value.confirm.length > 0 && form.value.confirm !== form.value.next);
async function change() {
  errors.value = [];
  if (hints.value.length || mismatch.value || !form.value.current) { errors.value = mismatch.value ? ['Konfirmasi kata sandi tidak sama.'] : hints.value.length ? hints.value : ['Isi kata sandi saat ini.']; return; }
  busy.value = true;
  try {
    const r = await post('/me/password', { currentPassword: form.value.current, newPassword: form.value.next }, { scoped: false });
    toast.push('Kata sandi diganti', r.otherSessionsRevoked ? `${r.otherSessionsRevoked} sesi lain dikeluarkan.` : 'Sesi ini tetap aktif.', 'ok');
    form.value = { current: '', next: '', confirm: '' };
    const wasForced = forced.value;
    await session.loadMe(); await reloadSessions();
    if (wasForced) router.replace(String(route.query.next || landingFor(session)));
  } catch (e) { errors.value = errorList(e); } finally { busy.value = false; }
}

/* Sesi aktif */
const { data: sessions, reload: reloadSessions } = useLoader(() => get('/me/sessions', { scoped: false }));
const pg = usePaged<any>(() => sessions.value ?? [], 10);
async function revoke(s: any) {
  try { await del(`/me/sessions/${s.id}`); toast.push('Sesi dicabut', s.user_agent?.slice(0, 60) ?? s.ip ?? '', 'ok'); await reloadSessions(); }
  catch (e) { toast.error(e, 'Gagal mencabut sesi'); }
}
const device = (ua: string | null) => {
  if (!ua) return 'Perangkat tidak dikenal';
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Peramban';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} · ${os}` : b;
};
const branchesLabel = computed(() => (session.user?.branches === '*' ? 'Semua cabang' : (session.user?.branches ?? []).join(', ')));
</script>

<template>
  <ReportHead title="Profil & Kata Sandi" sub="Data akun Anda, penggantian kata sandi, dan perangkat yang sedang masuk." />
  <div v-if="forced" class="card" role="alert" data-forced-change style="border-left:4px solid var(--warn);padding:var(--sp-4);display:flex;flex-direction:row;gap:var(--sp-3);align-items:flex-start;margin-bottom:var(--sp-4)">
    <Icon name="alert" />
    <div><b>Ganti kata sandi sementara Anda terlebih dahulu.</b><div class="card-note">Kata sandi ini dibuat oleh administrator. Menu lain terbuka setelah Anda menetapkan kata sandi pribadi.</div></div>
  </div>
  <section class="grid grid-1-2">
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title">Akun</h2></div></div>
      <div class="card-body">
        <div class="setting-row"><div class="setting-text"><span class="setting-name">Nama</span><span class="setting-note">{{ session.user?.name }}</span></div></div>
        <div class="setting-row"><div class="setting-text"><span class="setting-name">Email</span><span class="setting-note">{{ session.user?.email }}</span></div></div>
        <div class="setting-row"><div class="setting-text"><span class="setting-name">Cabang</span><span class="setting-note">{{ branchesLabel }}</span></div></div>
        <div class="setting-row"><div class="setting-text"><span class="setting-name">Kewenangan ({{ session.user?.permissions.length ?? 0 }})</span>
          <span class="setting-note" style="max-width:none">{{ (session.user?.permissions ?? []).map((p) => LABEL.get(p as any) ?? p).join(' · ') }}</span></div></div>
      </div>
    </article>
    <article class="card">
      <div class="card-head"><div class="card-head-text"><h2 class="card-title"><Icon name="key" /> Ganti kata sandi</h2><span class="card-note">Minimal 12 karakter, memuat huruf dan angka, tidak memuat nama email. Sesi di perangkat lain akan dikeluarkan.</span></div></div>
      <form class="card-body" @submit.prevent="change">
        <div class="field"><label for="pw-current">Kata sandi saat ini</label><input id="pw-current" v-model="form.current" class="input" :type="show ? 'text' : 'password'" autocomplete="current-password"></div>
        <div class="field"><label for="pw-new">Kata sandi baru</label><input id="pw-new" v-model="form.next" class="input" :type="show ? 'text' : 'password'" autocomplete="new-password">
          <span v-for="h in hints" :key="h" class="field-hint neg">• {{ h }}</span>
          <span v-if="form.next && !hints.length" class="field-hint pos">✓ Memenuhi kebijakan</span></div>
        <div class="field"><label for="pw-confirm">Ulangi kata sandi baru</label><input id="pw-confirm" v-model="form.confirm" class="input" :type="show ? 'text' : 'password'" autocomplete="new-password">
          <span v-if="mismatch" class="field-hint neg">• Tidak sama dengan kata sandi baru.</span></div>
        <label style="display:flex;gap:var(--sp-2);align-items:center;font-size:var(--fs-sm)"><input v-model="show" type="checkbox"> Tampilkan kata sandi</label>
        <div v-if="errors.length" class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div>
        <div><button class="btn btn-primary" type="submit" data-action="change-password" :disabled="busy"><Icon name="check" /> Simpan kata sandi</button></div>
      </form>
    </article>
  </section>
  <article class="card">
    <div class="card-head"><div class="card-head-text"><h2 class="card-title">Sesi aktif</h2><span class="card-note">Perangkat yang sedang masuk dengan akun Anda. Cabut sesi yang tidak Anda kenali.</span></div></div>
    <div class="table-scroll"><table class="table" data-table="sessions">
      <thead><tr><th>Perangkat</th><th>Alamat IP</th><th>Masuk</th><th>Terakhir aktif</th><th class="ta-r">Aksi</th></tr></thead>
      <tbody>
        <tr v-for="s in pg.pageRows.value" :key="s.id" class="is-static">
          <td><span class="cell-strong">{{ device(s.user_agent) }}</span> <Pill v-if="s.current" label="Sesi ini" tone="accent" /></td>
          <td class="code">{{ s.ip ?? '—' }}</td><td class="num">{{ F.datetime(s.created_at) }}</td><td class="num">{{ F.datetime(s.last_used_at) }}</td>
          <td><div class="row-actions"><button v-if="!s.current" class="btn btn-sm btn-ghost neg" data-action="revoke-session" @click="revoke(s)">Cabut</button></div></td>
        </tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="sesi" />
  </article>
</template>
