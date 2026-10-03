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
  'sales.invoice.read', 'sales.customer.manage', 'sales.order.create', 'sales.order.approve',
  'sales.invoice.create', 'sales.invoice.issue', 'sales.invoice.cancel', 'sales.receipt.create',
  'purchasing.invoice.read', 'purchasing.supplier.manage', 'purchasing.order.create', 'purchasing.order.approve', 'purchasing.receipt.create',
  'purchasing.invoice.create', 'purchasing.invoice.post', 'purchasing.payment.create', 'purchasing.payment.approve',
  'purchasing.requisition.create', 'purchasing.requisition.approve', 'purchasing.rfq.manage',
  'cash.transfer.create', 'cash.transfer.approve', 'cash.reconcile', 'cash.reconcile.approve', 'tax.settlement.create', 'tax.settlement.post',
  'inventory.read', 'inventory.adjust', 'inventory.adjust.approve', 'inventory.transfer', 'inventory.warehouse.manage',
  'production.read', 'production.manage', 'production.complete',
  'pos.read', 'pos.operate', 'pos.shift.post',
  'asset.read', 'asset.manage', 'asset.depreciate',
  'hr.read', 'hr.manage', 'hr.restricted.read', 'payroll.process', 'payroll.approve', 'payroll.pay',
  'doc.read', 'doc.manage', 'compliance.read',
  'budget.read', 'budget.manage', 'budget.approve', 'project.read', 'project.manage',
  'crm.read', 'crm.manage', 'sales.quote.create',
  'admin.user.manage', 'admin.role.manage', 'admin.settings.manage', 'admin.audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Pasangan yang ditegakkan per dokumen (pembuat ≠ penyetuju), bukan per pengguna. */
export const PER_DOCUMENT_SOD = new Set(['ledger.journal.create|ledger.journal.post', 'sales.order.create|sales.order.approve', 'sales.invoice.create|sales.invoice.issue',
  'purchasing.order.create|purchasing.order.approve', 'purchasing.invoice.create|purchasing.invoice.post', 'purchasing.payment.create|purchasing.payment.approve',
  'purchasing.requisition.create|purchasing.requisition.approve', 'budget.manage|budget.approve',
  'cash.transfer.create|cash.transfer.approve', 'cash.reconcile|cash.reconcile.approve', 'tax.settlement.create|tax.settlement.post',
  'inventory.adjust|inventory.adjust.approve', 'production.manage|production.complete', 'pos.operate|pos.shift.post', 'payroll.process|payroll.approve']);

/** Pasangan izin yang tidak boleh dipegang satu pengguna (pemisahan tugas, dok. 11 §3). */
export const SOD_CONFLICTS: [Permission, Permission, string][] = [
  ['ledger.journal.create', 'ledger.journal.post', 'Pembuat jurnal tidak boleh memposting jurnal (kontrol empat mata); ditegakkan per jurnal.'],
  ['sales.order.create', 'sales.order.approve', 'Pembuat pesanan tidak boleh menyetujui pesanannya sendiri; ditegakkan per pesanan.'],
  ['sales.invoice.create', 'sales.invoice.issue', 'Pembuat faktur tidak boleh menerbitkan fakturnya sendiri; ditegakkan per faktur.'],
  ['purchasing.order.create', 'purchasing.order.approve', 'Pembuat PO tidak boleh menyetujui PO-nya sendiri; ditegakkan per PO.'],
  ['purchasing.invoice.create', 'purchasing.invoice.post', 'Pembuat tagihan pemasok tidak boleh memostingnya sendiri; ditegakkan per tagihan.'],
  ['purchasing.payment.create', 'purchasing.payment.approve', 'Pembuat pembayaran tidak boleh menyetujui pembayarannya sendiri; ditegakkan per pembayaran.'],
  ['purchasing.requisition.create', 'purchasing.requisition.approve', 'Pemohon PR tidak boleh menyetujui permintaannya sendiri; ditegakkan per PR.'],
  ['budget.manage', 'budget.approve', 'Penyusun anggaran tidak boleh menyetujui anggarannya sendiri; ditegakkan per anggaran.'],
  ['cash.transfer.create', 'cash.transfer.approve', 'Pengaju transfer kas tidak boleh menyetujuinya sendiri; ditegakkan per transfer.'],
  ['cash.reconcile', 'cash.reconcile.approve', 'Pengimpor mutasi bank tidak boleh memfinalisasi rekonsiliasinya sendiri; ditegakkan per rekening koran.'],
  ['tax.settlement.create', 'tax.settlement.post', 'Pembuat setoran pajak tidak boleh memostingnya sendiri; ditegakkan per setoran.'],
  ['inventory.adjust', 'inventory.adjust.approve', 'Pembuat penyesuaian stok tidak boleh menyetujuinya sendiri; ditegakkan per dokumen.'],
  ['payroll.process', 'payroll.approve', 'Penyusun daftar gaji tidak boleh memposting daftar gajinya sendiri; ditegakkan per proses gaji.'],
  ['pos.operate', 'pos.shift.post', 'Kasir tidak boleh memposting shift-nya sendiri (hitung kas diperiksa orang lain); ditegakkan per shift.'],
  ['production.manage', 'production.complete', 'Yang melaporkan hasil produksi tidak boleh meloloskan QC-nya sendiri; ditegakkan per perintah kerja.'],
  ['admin.role.manage', 'ledger.journal.post', 'Admin peran tidak boleh memposting jurnal.'],
  ['ledger.period.close', 'ledger.period.reopen', 'Penutup periode tidak boleh membuka kembali periode.'],
  ['purchasing.payment.create', 'admin.user.manage', 'Pembuat pembayaran tidak boleh mengelola pengguna.'],
];

export const ROLE_TEMPLATES: Record<string, { name: string; permissions: Permission[] }> = {
  admin: {
    name: 'Admin Sistem',
    /* Admin memegang seluruh izin (kontrol penuh atas data & proses). Pemisahan tugas
       per dokumen tetap berlaku: dokumen yang dibuat admin disetujui orang lain. */
    permissions: [...PERMISSIONS],
  },
  akuntan_senior: {
    name: 'Akuntan Senior',
    permissions: ['org.branch.read', 'org.period.read', 'ledger.period.close', 'ledger.account.read', 'ledger.journal.read', 'ledger.journal.post', 'ledger.journal.reverse', 'ledger.rules.manage', 'ledger.report.read', 'report.consolidated', 'report.export', 'sales.invoice.read', 'sales.invoice.issue', 'sales.invoice.cancel', 'purchasing.invoice.read', 'purchasing.invoice.post', 'purchasing.payment.approve', 'cash.transfer.approve', 'cash.reconcile', 'cash.reconcile.approve', 'tax.settlement.post', 'inventory.read', 'inventory.adjust.approve', 'production.read', 'pos.read', 'pos.shift.post', 'asset.read', 'asset.depreciate', 'hr.read', 'payroll.approve', 'doc.read', 'doc.manage', 'compliance.read', 'budget.read', 'budget.approve', 'project.read', 'crm.read', 'admin.audit.read'],
  },
  staf_keuangan: {
    name: 'Staf Keuangan',
    permissions: ['org.branch.read', 'org.period.read', 'ledger.account.read', 'ledger.journal.read', 'ledger.journal.create', 'ledger.report.read', 'sales.invoice.read', 'sales.order.create', 'sales.invoice.create', 'sales.receipt.create', 'purchasing.invoice.read', 'purchasing.order.create', 'purchasing.invoice.create', 'purchasing.payment.create', 'purchasing.requisition.create', 'purchasing.rfq.manage', 'crm.read', 'crm.manage', 'sales.quote.create', 'cash.transfer.create', 'cash.reconcile', 'tax.settlement.create', 'inventory.read', 'asset.read', 'asset.manage', 'payroll.pay', 'doc.read', 'doc.manage', 'budget.read', 'budget.manage', 'project.read'],
  },
  manajer: {
    name: 'Manajer Operasional',
    permissions: ['org.branch.read', 'org.period.read', 'ledger.account.read', 'ledger.journal.read', 'ledger.report.read', 'report.consolidated', 'sales.invoice.read', 'sales.customer.manage', 'sales.order.approve', 'purchasing.invoice.read', 'purchasing.supplier.manage', 'purchasing.order.approve', 'purchasing.payment.approve', 'purchasing.requisition.create', 'purchasing.requisition.approve', 'purchasing.rfq.manage', 'inventory.read', 'inventory.adjust.approve', 'inventory.warehouse.manage', 'production.read', 'production.complete', 'pos.read', 'pos.shift.post', 'asset.read', 'asset.manage', 'hr.read', 'doc.read', 'doc.manage', 'compliance.read', 'budget.read', 'budget.approve', 'project.read', 'project.manage', 'crm.read', 'crm.manage', 'sales.quote.create'],
  },
  gudang: {
    name: 'Staf Gudang',
    permissions: ['org.branch.read', 'inventory.read', 'inventory.adjust', 'inventory.transfer', 'purchasing.receipt.create', 'purchasing.requisition.create', 'doc.read'],
  },
  sdm: {
    name: 'Staf SDM',
    permissions: ['org.branch.read', 'hr.read', 'hr.manage', 'hr.restricted.read', 'payroll.process', 'doc.read', 'doc.manage'],
  },
  kasir: {
    name: 'Kasir',
    permissions: ['org.branch.read', 'pos.read', 'pos.operate', 'doc.read'],
  },
  produksi: {
    name: 'Staf Produksi',
    permissions: ['org.branch.read', 'inventory.read', 'production.read', 'production.manage', 'purchasing.requisition.create', 'project.read', 'doc.read'],
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
    { code: 'sales.invoice.read', label: 'Lihat penjualan & piutang' }, { code: 'sales.customer.manage', label: 'Kelola pelanggan, plafon & produk' },
    { code: 'sales.order.create', label: 'Buat pesanan penjualan' }, { code: 'sales.order.approve', label: 'Setujui / tolak pesanan' },
    { code: 'sales.invoice.create', label: 'Buat faktur' }, { code: 'sales.invoice.issue', label: 'Terbitkan faktur (posting)' },
    { code: 'sales.invoice.cancel', label: 'Batalkan faktur' }, { code: 'sales.receipt.create', label: 'Catat penerimaan pelanggan' },
    { code: 'crm.read', label: 'Lihat lead, peluang & penawaran' }, { code: 'crm.manage', label: 'Kelola peluang & aktivitas' }, { code: 'sales.quote.create', label: 'Buat, kirim & catat keputusan penawaran' },
  ] },
  { group: 'Pembelian', items: [
    { code: 'purchasing.invoice.read', label: 'Lihat pembelian & hutang' }, { code: 'purchasing.supplier.manage', label: 'Kelola pemasok & setujui rekening' },
    { code: 'purchasing.order.create', label: 'Buat pesanan pembelian' }, { code: 'purchasing.order.approve', label: 'Setujui / tolak PO' },
    { code: 'purchasing.receipt.create', label: 'Catat penerimaan barang' }, { code: 'purchasing.invoice.create', label: 'Buat tagihan pemasok' },
    { code: 'purchasing.invoice.post', label: 'Posting / batalkan tagihan' }, { code: 'purchasing.payment.create', label: 'Ajukan & bayar pembayaran' },
    { code: 'purchasing.payment.approve', label: 'Setujui pembayaran' }, { code: 'purchasing.requisition.create', label: 'Ajukan permintaan pembelian' },
    { code: 'purchasing.requisition.approve', label: 'Setujui / tolak permintaan pembelian' }, { code: 'purchasing.rfq.manage', label: 'Kelola RFQ, penawaran & pemenang' },
  ] },
  { group: 'Kas & bank', items: [
    { code: 'cash.transfer.create', label: 'Ajukan transfer kas/bank' }, { code: 'cash.transfer.approve', label: 'Setujui & posting transfer kas/bank' },
    { code: 'cash.reconcile', label: 'Impor mutasi & cocokkan rekonsiliasi bank' }, { code: 'cash.reconcile.approve', label: 'Finalisasi rekonsiliasi bank' },
  ] },
  { group: 'Pajak', items: [{ code: 'tax.settlement.create', label: 'Buat & bayar setoran pajak' }, { code: 'tax.settlement.post', label: 'Posting / batalkan setoran pajak' }] },
  { group: 'Inventaris', items: [{ code: 'inventory.read', label: 'Lihat stok' }, { code: 'inventory.adjust', label: 'Buat penyesuaian / opname stok' }, { code: 'inventory.adjust.approve', label: 'Setujui & posting penyesuaian stok' }, { code: 'inventory.transfer', label: 'Transfer antar gudang' }, { code: 'inventory.warehouse.manage', label: 'Kelola gudang' }] },
  { group: 'Produksi', items: [{ code: 'production.read', label: 'Lihat BOM & perintah kerja' }, { code: 'production.manage', label: 'Kelola BOM, perintah kerja & pemakaian bahan' }, { code: 'production.complete', label: 'Loloskan QC & posting hasil produksi' }] },
  { group: 'POS / Kasir', items: [{ code: 'pos.read', label: 'Lihat shift & transaksi kasir' }, { code: 'pos.operate', label: 'Buka shift, transaksi & tutup shift' }, { code: 'pos.shift.post', label: 'Posting shift & batalkan transaksi' }] },
  { group: 'Aset tetap', items: [{ code: 'asset.read', label: 'Lihat aset & pemeliharaan' }, { code: 'asset.manage', label: 'Perolehan aset & perintah pemeliharaan' }, { code: 'asset.depreciate', label: 'Penyusutan bulanan & pelepasan aset' }] },
  { group: 'SDM & penggajian', items: [{ code: 'hr.read', label: 'Lihat karyawan, kehadiran & gaji' }, { code: 'hr.manage', label: 'Kelola karyawan & kehadiran' }, { code: 'hr.restricted.read', label: 'Buka data rahasia (NIK, NPWP, rekening)' }, { code: 'payroll.process', label: 'Susun daftar gaji' }, { code: 'payroll.approve', label: 'Posting daftar gaji' }, { code: 'payroll.pay', label: 'Bayar gaji' }] },
  { group: 'Dokumen & kepatuhan', items: [{ code: 'doc.read', label: 'Lihat & unduh dokumen' }, { code: 'doc.manage', label: 'Unggah dokumen & versi baru' }, { code: 'compliance.read', label: 'Laporan pemisahan tugas & verifikasi jejak audit' }] },
  { group: 'Anggaran & proyek', items: [{ code: 'budget.read', label: 'Lihat anggaran vs realisasi' }, { code: 'budget.manage', label: 'Susun, ajukan & revisi anggaran' }, { code: 'budget.approve', label: 'Setujui / kembalikan anggaran' }, { code: 'project.read', label: 'Lihat proyek & biaya proyek' }, { code: 'project.manage', label: 'Kelola proyek & tugas' }] },
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
/** Peran super: memegang semua izin dan dikecualikan dari konflik izin tingkat peran/pengguna. */
export const SUPERUSER_ROLE = 'admin';
export const isSuperuserRole = (code: string | null | undefined) => code === SUPERUSER_ROLE;

export function sodViolations(perms: Iterable<string>): string[] {
  const set = new Set(perms);
  return SOD_CONFLICTS
    .filter(([a, b]) => !PER_DOCUMENT_SOD.has(`${a}|${b}`))
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
