import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';

export interface NavItem { path: string; label: string; icon: string; permission?: string }
export interface NavGroup { label: string; items: NavItem[] }

/** Navigasi Fase 1 — hanya halaman yang benar-benar terhubung ke API. */
export const NAV: NavGroup[] = [
  { label: 'Ikhtisar', items: [{ path: '/dasbor', label: 'Dasbor', icon: 'grid', permission: 'ledger.report.read' }, { path: '/asisten', label: 'Asisten AI', icon: 'sparkles', permission: 'ledger.report.read' }] },
  {
    label: 'Keuangan',
    items: [
      { path: '/bagan-akun', label: 'Bagan Akun', icon: 'tree', permission: 'ledger.account.read' },
      { path: '/kas-bank', label: 'Kas & Bank', icon: 'vault', permission: 'ledger.report.read' },
      { path: '/jurnal', label: 'Jurnal Umum', icon: 'ledger', permission: 'ledger.journal.read' },
      { path: '/periode', label: 'Periode Fiskal', icon: 'calendar', permission: 'org.period.read' },
    ],
  },
  {
    label: 'Laporan Keuangan',
    items: [
      { path: '/buku-besar', label: 'Kartu Buku Besar', icon: 'book', permission: 'ledger.report.read' },
      { path: '/neraca-saldo', label: 'Neraca Saldo', icon: 'scale', permission: 'ledger.report.read' },
      { path: '/laba-rugi', label: 'Laba Rugi', icon: 'trending', permission: 'ledger.report.read' },
      { path: '/neraca', label: 'Neraca', icon: 'columns', permission: 'ledger.report.read' },
      { path: '/konsolidasi', label: 'Laporan Konsolidasi', icon: 'layers', permission: 'report.consolidated' },
      { path: '/integrasi', label: 'Integrasi & Rekonsiliasi', icon: 'link', permission: 'ledger.report.read' },
    ],
  },
  { label: 'Cabang', items: [{ path: '/cabang', label: 'Manajemen Cabang', icon: 'map-pin', permission: 'org.branch.read' }] },
  {
    label: 'Sistem',
    items: [
      { path: '/pengguna', label: 'Pengguna', icon: 'users', permission: 'admin.user.manage' },
      { path: '/peran', label: 'Peran & Izin', icon: 'shield', permission: 'admin.role.manage' },
      { path: '/pengaturan', label: 'Pengaturan', icon: 'gear' },
      { path: '/jejak-audit', label: 'Jejak Audit', icon: 'scroll', permission: 'admin.audit.read' },
    ],
  },
];

/** Halaman pertama yang boleh dibuka pengguna; '/tanpa-akses' bila tidak ada. */
export function landingFor(session: ReturnType<typeof useSession>): string {
  for (const g of NAV) for (const i of g.items) if (!i.permission || session.can(i.permission)) return i.path;
  return '/tanpa-akses';
}

const routes: RouteRecordRaw[] = [
  { path: '/masuk', name: 'login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },
  { path: '/', redirect: () => landingFor(useSession()) },
  { path: '/tanpa-akses', component: () => import('@/pages/NoAccessPage.vue'), meta: { title: 'Tanpa akses' } },
  { path: '/dasbor', component: () => import('@/pages/DashboardPage.vue'), meta: { title: 'Dasbor', permission: 'ledger.report.read' } },
  { path: '/asisten', component: () => import('@/pages/AssistantPage.vue'), meta: { title: 'Asisten AI', permission: 'ledger.report.read' } },
  { path: '/periode', component: () => import('@/pages/PeriodsPage.vue'), meta: { title: 'Periode Fiskal', permission: 'org.period.read' } },
  { path: '/bagan-akun', component: () => import('@/pages/ChartOfAccountsPage.vue'), meta: { title: 'Bagan Akun', permission: 'ledger.account.read' } },
  { path: '/kas-bank', component: () => import('@/pages/BankAccountsPage.vue'), meta: { title: 'Kas & Bank', permission: 'ledger.report.read' } },
  { path: '/jurnal', component: () => import('@/pages/JournalsPage.vue'), meta: { title: 'Jurnal Umum', permission: 'ledger.journal.read' } },
  { path: '/buku-besar', component: () => import('@/pages/LedgerCardPage.vue'), meta: { title: 'Kartu Buku Besar', permission: 'ledger.report.read' } },
  { path: '/neraca-saldo', component: () => import('@/pages/TrialBalancePage.vue'), meta: { title: 'Neraca Saldo', permission: 'ledger.report.read' } },
  { path: '/laba-rugi', component: () => import('@/pages/IncomeStatementPage.vue'), meta: { title: 'Laba Rugi', permission: 'ledger.report.read' } },
  { path: '/neraca', component: () => import('@/pages/BalanceSheetPage.vue'), meta: { title: 'Neraca', permission: 'ledger.report.read' } },
  { path: '/konsolidasi', component: () => import('@/pages/ConsolidationPage.vue'), meta: { title: 'Laporan Konsolidasi', permission: 'report.consolidated' } },
  { path: '/integrasi', component: () => import('@/pages/IntegrationPage.vue'), meta: { title: 'Integrasi & Rekonsiliasi', permission: 'ledger.report.read' } },
  { path: '/cabang', component: () => import('@/pages/BranchesPage.vue'), meta: { title: 'Manajemen Cabang', permission: 'org.branch.read' } },
  { path: '/pengguna', component: () => import('@/pages/UsersPage.vue'), meta: { title: 'Pengguna', permission: 'admin.user.manage' } },
  { path: '/peran', component: () => import('@/pages/RolesPage.vue'), meta: { title: 'Peran & Izin', permission: 'admin.role.manage' } },
  { path: '/pengaturan', component: () => import('@/pages/SettingsPage.vue'), meta: { title: 'Pengaturan' } },
  { path: '/profil', component: () => import('@/pages/ProfilePage.vue'), meta: { title: 'Profil & Kata Sandi' } },
  { path: '/jejak-audit', component: () => import('@/pages/AuditLogPage.vue'), meta: { title: 'Jejak Audit', permission: 'admin.audit.read' } },
  { path: '/:pathMatch(.*)*', redirect: () => landingFor(useSession()) },
];

export const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: () => ({ top: 0 }) });

router.beforeEach(async (to) => {
  const session = useSession();
  if (!session.ready) await session.restore();
  if (to.meta.public) return session.isAuthenticated ? landingFor(session) : true;
  if (!session.isAuthenticated) return { path: '/masuk', query: { next: to.fullPath } };
  /* K-02: kata sandi sementara harus diganti sebelum membuka halaman lain (juga ditegakkan API). */
  if (session.user?.mustChangePassword && to.path !== '/profil') return { path: '/profil', query: { wajib: '1' } };
  const perm = to.meta.permission as string | undefined;
  if (perm && !session.can(perm)) {
    useToast().push('Akses ditolak', `Halaman ${String(to.meta.title)} memerlukan izin ${perm}.`, 'warn');
    const land = landingFor(session);
    return land === to.path ? '/tanpa-akses' : land;
  }
  return true;
});

router.afterEach((to) => { document.title = to.meta.title ? `${String(to.meta.title)} · ERP Enterprise` : 'ERP Enterprise'; });
