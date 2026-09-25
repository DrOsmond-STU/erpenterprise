import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useSession } from './session';

const KEY = 'erp-ctx';

/** Konteks cabang & periode aktif — preferensi tampilan; server memvalidasi ulang setiap permintaan. */
export const useContext = defineStore('context', () => {
  const session = useSession();
  const branch = ref<string>('ALL');
  const period = ref<string | null>(null);
  const railCollapsed = ref(false);
  const theme = ref<'light' | 'dark' | 'system'>('system');

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved?.branch) branch.value = saved.branch;
    if (saved?.period) period.value = saved.period;
    if (saved?.theme) theme.value = saved.theme;
  } catch { /* sandbox */ }

  watch([branch, period, theme], () => {
    try { localStorage.setItem(KEY, JSON.stringify({ branch: branch.value, period: period.value, theme: theme.value })); } catch { /* sandbox */ }
    document.documentElement.toggleAttribute('data-theme', theme.value !== 'system');
    if (theme.value !== 'system') document.documentElement.setAttribute('data-theme', theme.value);
  }, { immediate: true });

  /** Menyelaraskan pilihan dengan hak pengguna setelah login. */
  function reconcile() {
    const codes = session.branches.map((b) => b.code);
    if (branch.value === 'ALL' && !session.allBranches) branch.value = codes[0] ?? 'ALL';
    if (branch.value !== 'ALL' && !codes.includes(branch.value)) branch.value = session.allBranches ? 'ALL' : (codes[0] ?? 'ALL');
    if (period.value && !session.periods.some((p) => p.id === period.value)) period.value = null;
    if (!period.value) {
      const months = session.periods.filter((p) => p.group === 'Bulan');
      const open = months.filter((p) => p.status === 'open');
      period.value = (open[0] ?? months[months.length - 1])?.id ?? null;
    }
  }

  const branchInfo = computed(() => session.branches.find((b) => b.code === branch.value) ?? null);
  const branchName = computed(() => (branch.value === 'ALL' ? 'Semua cabang (konsolidasi)' : branchInfo.value?.name ?? branch.value));
  const branchShort = computed(() => (branch.value === 'ALL' ? 'Konsolidasi' : branchInfo.value?.short_name ?? branch.value));
  const periodInfo = computed(() => session.periods.find((p) => p.id === period.value) ?? null);
  const periodLabel = computed(() => periodInfo.value?.label ?? '—');
  const nameOf = (code: string) => (code === 'ALL' ? 'Semua cabang' : session.branches.find((b) => b.code === code)?.name ?? code);
  const shortOf = (code: string) => (code === 'ALL' ? 'Konsolidasi' : session.branches.find((b) => b.code === code)?.short_name ?? code);

  return { branch, period, railCollapsed, theme, reconcile, branchInfo, branchName, branchShort, periodInfo, periodLabel, nameOf, shortOf };
});
