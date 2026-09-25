<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { landingFor } from '@/router';
import Icon from '@/components/Icon.vue';
import { useSession } from '@/stores/session';
import { useContext } from '@/stores/context';

const session = useSession();
const ctx = useContext();
const router = useRouter();
const route = useRoute();
const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = ''; busy.value = true;
  try {
    await session.login(email.value.trim(), password.value);
    ctx.reconcile();
    router.push(String(route.query.next || landingFor(session)));
  } catch (e) {
    error.value = (e as Error).message || 'Tidak dapat masuk.';
  } finally { busy.value = false; }
}
</script>

<template>
  <div class="login-wrap">
    <form class="card login-card" @submit.prevent="submit">
      <div class="login-brand">
        <span class="rail-mark" style="background:var(--grad-brand);color:#fff;border-radius:10px;display:inline-flex;align-items:center;justify-content:center"><Icon name="boxes" /></span>
        <div><h1 class="page-title" style="font-size:var(--fs-h2)">ERP Enterprise</h1><span class="card-note">Masuk ke buku besar terpadu</span></div>
      </div>
      <div class="field"><label for="email">Email</label><input id="email" v-model="email" class="input" type="email" autocomplete="username" required></div>
      <div class="field"><label for="password">Kata sandi</label><input id="password" v-model="password" class="input" type="password" autocomplete="current-password" required minlength="1"></div>
      <p v-if="error" class="field-hint neg" role="alert">{{ error }}</p>
      <button class="btn btn-primary" type="submit" :disabled="busy">{{ busy ? 'Memeriksa…' : 'Masuk' }}</button>
      <p class="login-hint">Sesi berakhir otomatis setelah 30 menit tidak aktif. Akun terkunci 15 menit setelah 5 kali gagal. Peran keuangan wajib MFA pada lingkungan produksi (dok. 11 K-03).</p>
    </form>
  </div>
</template>
