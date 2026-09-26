/**
 * Katalog izin (dok. 11 §14). Kode stabil dan granular per aksi.
 */
export const PERMISSIONS = [
  'org.branch.read', 'org.branch.manage', 'org.period.read',
  'ledger.period.close', 'ledger.period.reopen',
  'ledger.account.read', 'ledger.account.manage',
  'ledger.journal.read', 'ledger.journal.create', 'ledger.journal.post', 'ledger.journal.reverse',
  'ledger.rules.manage', 'ledger.report.read',
  'report.consolidated', 'report.export',
  'sales.invoice.read', 'sales.invoice.create', 'sales.invoice.issue', 'sales.receipt.create',
  'purchasing.invoice.read', 'purchasing.payment.create',
  'inventory.read', 'inventory.adjust', 'inventory.transfer',
  'admin.user.manage', 'admin.role.manage', 'admin.settings.manage', 'admin.audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Pasangan izin yang tidak boleh dipegang satu pengguna (pemisahan tugas, dok. 11 §3). */
export const SOD_CONFLICTS: [Permission, Permission, string][] = [
  ['ledger.journal.create', 'ledger.journal.post', 'Pembuat jurnal tidak boleh memposting jurnal (kontrol empat mata); ditegakkan per jurnal.'],
  ['admin.role.manage', 'ledger.journal.post', 'Admin peran tidak boleh memposting jurnal.'],
  ['ledger.period.close', 'ledger.period.reopen', 'Penutup periode tidak boleh membuka kembali periode.'],
  ['purchasing.payment.create', 'admin.user.manage', 'Pembuat pembayaran tidak boleh mengelola pengguna.'],
];

export const ROLE_TEMPLATES: Record<string, { name: string; permissions: Permission[] }> = {
  admin: {
    name: 'Admin Sistem',
    permissions: ['org.branch.read', 'org.branch.manage', 'org.period.read', 'ledger.period.reopen', 'ledger.account.read', 'ledger.account.manage', 'ledger.journal.read', 'ledger.report.read', 'report.consolidated', 'admin.user.manage', 'admin.role.manage', 'admin.settings.manage', 'admin.audit.read'],
  },
  akuntan_senior: {
    name: 'Akuntan Senior',
    permissions: ['org.branch.read', 'org.period.read', 'ledger.period.close', 'ledger.account.read', 'ledger.journal.read', 'ledger.journal.post', 'ledger.journal.reverse', 'ledger.rules.manage', 'ledger.report.read', 'report.consolidated', 'report.export', 'sales.invoice.read', 'purchasing.invoice.read', 'inventory.read', 'admin.audit.read'],
  },
  staf_keuangan: {
    name: 'Staf Keuangan',
    permissions: ['org.branch.read', 'org.period.read', 'ledger.account.read', 'ledger.journal.read', 'ledger.journal.create', 'ledger.report.read', 'sales.invoice.read', 'sales.invoice.create', 'sales.receipt.create', 'purchasing.invoice.read', 'inventory.read'],
  },
  manajer: {
    name: 'Manajer Operasional',
    permissions: ['org.branch.read', 'org.period.read', 'ledger.account.read', 'ledger.journal.read', 'ledger.report.read', 'report.consolidated', 'sales.invoice.read', 'purchasing.invoice.read', 'inventory.read'],
  },
  gudang: {
    name: 'Staf Gudang',
    permissions: ['org.branch.read', 'inventory.read', 'inventory.adjust', 'inventory.transfer'],
  },
};

/** Katalog berlabel untuk matriks Peran & Izin, dikelompokkan per modul. */
export const PERMISSION_CATALOG: { group: string; items: { code: Permission; label: string }[] }[] = [
  { group: 'Organisasi', items: [
    { code: 'org.branch.read', label: 'Lihat cabang' }, { code: 'org.branch.manage', label: 'Kelola cabang' }, { code: 'org.period.read', label: 'Lihat periode fiskal' },
  ] },
  { group: 'Buku besar', items: [
    { code: 'ledger.account.read', label: 'Lihat bagan akun' }, { code: 'ledger.account.manage', label: 'Kelola bagan akun & rekening' },
    { code: 'ledger.journal.read', label: 'Lihat jurnal' }, { code: 'ledger.journal.create', label: 'Buat jurnal memorial' },
    { code: 'ledger.journal.post', label: 'Posting / tolak jurnal' }, { code: 'ledger.journal.reverse', label: 'Buat jurnal balik' },
    { code: 'ledger.period.close', label: 'Tutup periode' }, { code: 'ledger.period.reopen', label: 'Buka kembali periode' },
    { code: 'ledger.rules.manage', label: 'Kelola aturan posting' }, { code: 'ledger.report.read', label: 'Lihat laporan keuangan & asisten AI' },
  ] },
  { group: 'Laporan', items: [{ code: 'report.consolidated', label: 'Laporan konsolidasi' }, { code: 'report.export', label: 'Ekspor laporan' }] },
  { group: 'Penjualan', items: [
    { code: 'sales.invoice.read', label: 'Lihat faktur' }, { code: 'sales.invoice.create', label: 'Buat faktur' },
    { code: 'sales.invoice.issue', label: 'Terbitkan faktur' }, { code: 'sales.receipt.create', label: 'Catat penerimaan' },
  ] },
  { group: 'Pembelian', items: [{ code: 'purchasing.invoice.read', label: 'Lihat tagihan pemasok' }, { code: 'purchasing.payment.create', label: 'Buat pembayaran pemasok' }] },
  { group: 'Inventaris', items: [{ code: 'inventory.read', label: 'Lihat stok' }, { code: 'inventory.adjust', label: 'Penyesuaian stok' }, { code: 'inventory.transfer', label: 'Transfer antar gudang' }] },
  { group: 'Sistem', items: [
    { code: 'admin.user.manage', label: 'Kelola pengguna' }, { code: 'admin.role.manage', label: 'Kelola peran & izin' },
    { code: 'admin.settings.manage', label: 'Kelola pengaturan' }, { code: 'admin.audit.read', label: 'Lihat jejak audit' },
  ] },
];

/**
 * Pelanggaran pemisahan tugas pada sekumpulan izin (satu peran, atau gabungan
 * peran seorang pengguna). Pasangan buat↔posting jurnal ditegakkan per jurnal,
 * bukan per pengguna, sehingga tidak dihitung di sini.
 */
export function sodViolations(perms: Iterable<string>): string[] {
  const set = new Set(perms);
  return SOD_CONFLICTS
    .filter(([a, b]) => !(a === 'ledger.journal.create' && b === 'ledger.journal.post'))
    .filter(([a, b]) => set.has(a) && set.has(b))
    .map(([, , why]) => why);
}

export const PASSWORD_MIN = 12;
/** Kebijakan kata sandi (dok. 11 K-02): panjang, huruf + angka, tidak memuat email. */
export function passwordProblems(pw: string, email?: string): string[] {
  const out: string[] = [];
  if (pw.length < PASSWORD_MIN) out.push(`Minimal ${PASSWORD_MIN} karakter.`);
  if (pw.length > 200) out.push('Maksimal 200 karakter.');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) out.push('Harus memuat huruf dan angka.');
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && pw.toLowerCase().includes(local)) out.push('Tidak boleh memuat nama pengguna/email.');
  if (/^(.)\1+$/.test(pw) || /^(password|katasandi|rahasia)/i.test(pw)) out.push('Terlalu mudah ditebak.');
  return out;
}
