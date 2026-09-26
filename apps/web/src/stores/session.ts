import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Period } from '@erp/domain';
import { api, get, post } from '@/lib/api';

export interface SessionUser { id: string; email: string; name: string; permissions: string[]; branches: '*' | string[]; mustChangePassword?: boolean }
export interface BranchInfo { code: string; name: string; short_name: string; type: string; city: string; is_head_office: boolean; status: string; target_monthly: number }

export const useSession = defineStore('session', () => {
  const token = ref<string | null>(null);
  const user = ref<SessionUser | null>(null);
  const company = ref<{ code: string; name: string } | null>(null);
  const branches = ref<BranchInfo[]>([]);
  const periods = ref<Period[]>([]);
  const allBranches = ref(false);
  const ready = ref(false);

  const isAuthenticated = computed(() => Boolean(token.value && user.value));
  const can = (perm: string) => Boolean(user.value?.permissions.includes(perm));

  async function loadMe() {
    const me = await get('/me', { scoped: false });
    user.value = me.user; company.value = me.company; branches.value = me.branches; periods.value = me.periods; allBranches.value = me.allBranches;
  }

  async function login(email: string, password: string) {
    const r = await post('/auth/login', { email, password }, { scoped: false });
    token.value = r.access_token;
    await loadMe();
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST', retry: false, scoped: false }); } catch { /* sesi mungkin sudah berakhir */ }
    token.value = null; user.value = null;
  }

  /** Saat muat ulang halaman: coba pulihkan sesi dari cookie refresh. */
  async function restore() {
    if (ready.value) return;
    try {
      const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' });
      if (r.ok) { const b = await r.json(); token.value = b.access_token; await loadMe(); }
    } catch { /* offline */ } finally { ready.value = true; }
  }

  function setToken(t: string) { token.value = t; }
  function clear() { token.value = null; user.value = null; }

  return { token, user, company, branches, periods, allBranches, ready, isAuthenticated, can, login, logout, restore, loadMe, setToken, clear };
});
