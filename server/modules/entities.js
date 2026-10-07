/* ==========================================================================
   Definisi entitas — satu sumber kebenaran untuk skema tabel, validasi,
   tampilan daftar/formulir di klien, izin modul, dan aksi alur kerja.
   ========================================================================== */

/* --- Pembangun bidang ---------------------------------------------------- */
const F = {
  code: (o = {}) => ({ name: 'code', label: 'Kode', type: 'text', max: 30, list: true, search: true, required: true, unique: true, ...o }),
  number: (o = {}) => ({ name: 'number', label: 'Nomor', type: 'text', max: 30, list: true, search: true, readonly: true, ...o }),
  name: (o = {}) => ({ name: 'name', label: 'Nama', type: 'text', max: 160, list: true, search: true, required: true, ...o }),
  text: (name, label, o = {}) => ({ name, label, type: 'text', max: 200, ...o }),
  area: (name, label, o = {}) => ({ name, label, type: 'textarea', max: 2000, ...o }),
  date: (name, label, o = {}) => ({ name, label, type: 'date', ...o }),
  money: (name, label, o = {}) => ({ name, label, type: 'money', min: 0, ...o }),
  num: (name, label, o = {}) => ({ name, label, type: 'number', ...o }),
  int: (name, label, o = {}) => ({ name, label, type: 'int', ...o }),
  pct: (name, label, o = {}) => ({ name, label, type: 'pct', min: 0, max: 100, ...o }),
  bool: (name, label, o = {}) => ({ name, label, type: 'bool', default: 0, ...o }),
  sel: (name, label, options, o = {}) => ({ name, label, type: 'select', options, ...o }),
  ref: (name, label, ref, o = {}) => ({ name, label, type: 'ref', ref, ...o }),
  status: (options, def, o = {}) => ({ name: 'status', label: 'Status', type: 'select', options, default: def, list: true, ...o }),
  email: (o = {}) => ({ name: 'email', label: 'Surel', type: 'email', max: 160, ...o }),
};

const docTotals = () => [
  F.money('subtotal', 'Subtotal', { readonly: true }),
  F.pct('tax_rate', 'PPN (%)', { default: 11 }),
  F.money('tax', 'PPN', { readonly: true }),
  F.money('total', 'Total', { readonly: true, list: true }),
];

const tradeLines = (table, extra = []) => ({
  table,
  fields: [
    F.ref('product_id', 'Barang/Jasa', 'products', { required: true }),
    F.text('description', 'Keterangan', { max: 300 }),
    F.num('qty', 'Qty', { required: true, min: 0.0001, default: 1 }),
    F.money('price', 'Harga', { required: true }),
    F.pct('discount_pct', 'Diskon %', { default: 0 }),
    ...extra,
    F.money('amount', 'Jumlah', { readonly: true }),
  ],
});

/* Status dokumen: label + nada warna untuk pil di klien. */
export const STATUS = {
  draf: ['Draf', 'neutral'], menunggu: ['Menunggu', 'warn'], diajukan: ['Diajukan', 'warn'],
  disetujui: ['Disetujui', 'accent'], ditolak: ['Ditolak', 'danger'], batal: ['Batal', 'neutral'],
  selesai: ['Selesai', 'ok'], terbit: ['Terbit', 'accent'], sebagian: ['Dibayar sebagian', 'warn'],
  lunas: ['Lunas', 'ok'], diposting: ['Diposting', 'ok'], dibayar: ['Dibayar', 'ok'],
  terkirim: ['Terkirim', 'accent'], diterima: ['Diterima', 'ok'], aktif: ['Aktif', 'ok'],
  nonaktif: ['Nonaktif', 'neutral'], ditahan: ['Ditahan', 'danger'], terkunci: ['Terkunci', 'danger'],
  pantau: ['Dipantau', 'warn'], terbuka: ['Terbuka', 'accent'], tutup: ['Ditutup', 'neutral'],
  antre: ['Antre', 'neutral'], berjalan: ['Berjalan', 'accent'], qc: ['Pemeriksaan mutu', 'warn'],
  dijadwalkan: ['Dijadwalkan', 'neutral'], dilepas: ['Dilepas', 'neutral'], void: ['Void', 'danger'],
  perencanaan: ['Perencanaan', 'neutral'], ditunda: ['Ditunda', 'warn'],
  prospek: ['Prospek', 'neutral'], kualifikasi: ['Kualifikasi', 'accent'], penawaran: ['Penawaran', 'accent'],
  negosiasi: ['Negosiasi', 'warn'], menang: ['Menang', 'ok'], kalah: ['Kalah', 'danger'],
  disiapkan: ['Disiapkan', 'neutral'], transit: ['Dalam perjalanan', 'accent'],
  hadir: ['Hadir', 'ok'], terlambat: ['Terlambat', 'warn'], cuti: ['Cuti', 'accent'], sakit: ['Sakit', 'warn'],
  izin: ['Izin', 'neutral'], alpa: ['Alpa', 'danger'], berlaku: ['Berlaku', 'ok'], kedaluwarsa: ['Kedaluwarsa', 'danger'],
  patuh: ['Patuh', 'ok'], peninjauan: ['Peninjauan', 'warn'], 'tidak-patuh': ['Tidak patuh', 'danger'],
  dilaporkan: ['Dilaporkan', 'warn'], investigasi: ['Investigasi', 'accent'], ditangani: ['Ditangani', 'ok'],
  diterapkan: ['Diterapkan', 'ok'], direncanakan: ['Direncanakan', 'warn'], diterima_risiko: ['Risiko diterima', 'neutral'],
};

/* Modul izin. Tingkat: 0 tanpa akses, 1 lihat, 2 ubah, 3 setujui/posting. */
export const MODULES = [
  ['dashboard', 'Dasbor'], ['master', 'Data Master'], ['crm', 'CRM'], ['sales', 'Penjualan'],
  ['pos', 'POS / Kasir'], ['purchasing', 'Pembelian'], ['inventory', 'Inventaris'],
  ['production', 'Produksi'], ['projects', 'Proyek'], ['finance', 'Keuangan'],
  ['reports', 'Laporan Keuangan'], ['hr', 'SDM'], ['assets', 'Aset'], ['documents', 'Dokumen'],
  ['compliance', 'Kepatuhan & Keamanan'], ['pii', 'Data Pribadi (tanpa samaran)'], ['admin', 'Administrasi Sistem'],
];

const act = (name, label, o = {}) => ({ name, label, level: 3, ...o });

export const ENTITIES = {
  /* ---------------------------------------------------------------- Admin */
  companies: {
    label: 'Perusahaan', one: 'perusahaan', module: 'admin', scope: 'global', title: 'name', sort: 'code',
    fields: [
      F.code(), F.name(),
      F.text('legal_name', 'Nama badan hukum'),
      F.text('npwp', 'NPWP', { max: 30, sensitive: true }),
      F.area('address', 'Alamat'),
      F.text('currency', 'Mata uang', { max: 3, default: 'IDR' }),
      F.ref('parent_id', 'Induk perusahaan', 'companies', { list: true }),
      F.pct('ownership_pct', 'Kepemilikan induk (%)', { default: 100, list: true }),
      F.status(['aktif', 'nonaktif'], 'aktif'),
    ],
  },
  branches: {
    label: 'Cabang', one: 'cabang', module: 'admin', scope: 'company', title: 'name', sort: 'code',
    fields: [
      F.code(), F.name(),
      F.text('city', 'Kota', { list: true }),
      F.area('address', 'Alamat'),
      F.bool('is_head_office', 'Kantor pusat', { list: true }),
      F.status(['aktif', 'nonaktif'], 'aktif'),
    ],
  },
  users: {
    label: 'Pengguna', one: 'pengguna', module: 'admin', scope: 'global', title: 'full_name', sort: 'username',
    fields: [
      F.text('username', 'Nama pengguna', { max: 40, required: true, unique: true, list: true, search: true, pattern: '^[a-z0-9._-]{3,40}$' }),
      F.text('full_name', 'Nama lengkap', { max: 120, required: true, list: true, search: true }),
      F.email({ list: true, search: true }),
      F.ref('role_id', 'Peran', 'roles', { required: true, list: true }),
      F.ref('company_id', 'Batas perusahaan', 'companies', { list: true, help: 'Kosongkan untuk seluruh perusahaan grup.' }),
      F.ref('branch_id', 'Batas cabang', 'branches', { list: true, help: 'Kosongkan untuk seluruh cabang.' }),
      { name: 'password', label: 'Kata sandi awal', type: 'password', virtual: true, createOnly: true, required: true },
      F.bool('mfa_enabled', 'MFA aktif', { readonly: true, list: true }),
      F.text('last_login_at', 'Masuk terakhir', { readonly: true, list: true }),
      F.text('password_changed_at', 'Sandi diubah', { readonly: true }),
      F.int('failed_attempts', 'Gagal masuk', { readonly: true }),
      F.status(['aktif', 'nonaktif', 'terkunci'], 'aktif'),
    ],
    actions: [
      act('reset_password', 'Atur ulang sandi', { level: 3, params: [{ name: 'password', label: 'Sandi sementara', type: 'password', required: true }] }),
      act('unlock', 'Buka kunci akun'),
      act('reset_mfa', 'Reset MFA'),
      act('revoke_sessions', 'Cabut seluruh sesi'),
    ],
  },
  roles: {
    label: 'Peran', one: 'peran', module: 'admin', scope: 'global', title: 'name', sort: 'code',
    fields: [F.code(), F.name(), F.area('description', 'Deskripsi', { list: true })],
  },

  /* ------------------------------------------------------------ Keuangan */
  accounts: {
    label: 'Bagan Akun', one: 'akun', module: 'finance', scope: 'global', title: 'name', sort: 'code', pageSize: 200,
    fields: [
      F.code({ max: 20 }), F.name(),
      F.sel('type', 'Golongan', [['asset', 'Aset'], ['liability', 'Liabilitas'], ['equity', 'Ekuitas'], ['revenue', 'Pendapatan'], ['cogs', 'Beban pokok'], ['expense', 'Beban operasional'], ['other_income', 'Pendapatan lain'], ['other_expense', 'Beban lain'], ['tax', 'Pajak penghasilan']], { required: true, list: true }),
      F.ref('parent_id', 'Akun induk', 'accounts', { refFilter: { is_header: 1 } }),
      F.bool('is_header', 'Akun induk (header)', { list: true }),
      F.sel('subtype', 'Subgolongan', [['', '—'], ['cash', 'Kas & bank'], ['ar', 'Piutang'], ['inventory', 'Persediaan'], ['current_asset', 'Aset lancar lain'], ['fixed_asset', 'Aset tetap'], ['accum_depr', 'Akumulasi penyusutan'], ['investment', 'Investasi'], ['ap', 'Hutang usaha'], ['current_liability', 'Liabilitas jangka pendek'], ['long_term_liability', 'Liabilitas jangka panjang'], ['capital', 'Modal'], ['retained_earnings', 'Saldo laba']]),
      F.sel('cash_flow', 'Kategori arus kas', [['operating', 'Operasi'], ['investing', 'Investasi'], ['financing', 'Pendanaan']], { default: 'operating' }),
      F.bool('is_intercompany', 'Akun antar perusahaan', { list: true }),
      F.status(['aktif', 'nonaktif'], 'aktif'),
    ],
    computed: {
      balance: { label: 'Saldo', type: 'money', list: true, sql: `(SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE jl.account_id = t.id AND j.status = 'diposting' {{scope:j}})` },
    },
  },
  fiscal_periods: {
    label: 'Periode Fiskal', one: 'periode', module: 'finance', scope: 'company', title: 'name', sort: 'start_date', sortDir: 'desc',
    fields: [
      F.text('name', 'Nama', { required: true, list: true, max: 40 }),
      F.date('start_date', 'Mulai', { required: true, list: true }),
      F.date('end_date', 'Selesai', { required: true, list: true }),
      F.status(['terbuka', 'tutup'], 'terbuka'),
    ],
    actions: [act('close', 'Tutup periode', { from: ['terbuka'], confirm: 'Periode yang ditutup tidak dapat menerima jurnal.' }), act('reopen', 'Buka kembali', { from: ['tutup'], level: 4 })],
  },
  cost_centers: {
    label: 'Pusat Biaya', one: 'pusat biaya', module: 'finance', scope: 'company', title: 'name', sort: 'code',
    fields: [F.code(), F.name(), F.text('department', 'Departemen', { list: true }), F.sel('kind', 'Tipe', ['OPEX', 'CAPEX'], { default: 'OPEX', list: true }), F.status(['aktif', 'nonaktif'], 'aktif')],
  },
  bank_accounts: {
    label: 'Kas & Bank', one: 'rekening', module: 'finance', scope: 'branch', title: 'name', sort: 'code',
    fields: [
      F.code(), F.name(),
      F.text('bank_name', 'Bank', { list: true }),
      F.text('account_no', 'Nomor rekening', { max: 40, sensitive: true, list: true }),
      F.ref('account_id', 'Akun buku besar', 'accounts', { required: true, refFilter: { subtype: 'cash', is_header: 0 } }),
      F.text('currency', 'Mata uang', { max: 3, default: 'IDR' }),
      F.status(['aktif', 'nonaktif'], 'aktif'),
    ],
    computed: {
      balance: { label: 'Saldo buku besar', type: 'money', list: true, sql: `(SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE jl.account_id = t.account_id AND jl.branch_id = t.branch_id AND j.status = 'diposting')` },
    },
  },
  journals: {
    label: 'Jurnal Umum', one: 'jurnal', module: 'finance', scope: 'branch', title: 'description', number: 'JU', sort: 'date', sortDir: 'desc',
    editable: ['draf', 'ditolak'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }),
      F.text('description', 'Uraian', { required: true, list: true, search: true, max: 300 }),
      F.text('reference', 'Referensi', { max: 60, search: true }),
      F.text('source_type', 'Sumber', { readonly: true, list: true }),
      F.int('source_id', 'ID sumber', { readonly: true, hidden: true }),
      F.text('source_no', 'Dokumen sumber', { readonly: true, list: true, search: true }),
      F.money('total', 'Total', { readonly: true, list: true }),
      F.ref('reversal_of', 'Membalik jurnal', 'journals', { readonly: true }),
      F.ref('approved_by', 'Disetujui oleh', 'users', { readonly: true }),
      F.status(['draf', 'diajukan', 'diposting', 'ditolak', 'batal'], 'draf'),
    ],
    lines: {
      table: 'journal_lines',
      fields: [
        F.ref('account_id', 'Akun', 'accounts', { required: true, refFilter: { is_header: 0 } }),
        F.ref('branch_id', 'Cabang', 'branches', { help: 'Kosong = cabang dokumen' }),
        F.money('debit', 'Debit', { default: 0 }),
        F.money('credit', 'Kredit', { default: 0 }),
        F.text('memo', 'Memo', { max: 300 }),
        F.ref('cost_center_id', 'Pusat biaya', 'cost_centers'),
        F.ref('project_id', 'Proyek', 'projects'),
      ],
    },
    actions: [
      act('submit', 'Ajukan', { from: ['draf', 'ditolak'], level: 2 }),
      act('approve', 'Setujui & posting', { from: ['diajukan'], sod: true }),
      act('reject', 'Tolak', { from: ['diajukan'], params: [{ name: 'reason', label: 'Alasan', type: 'text', required: true }] }),
      act('reverse', 'Balik jurnal', { from: ['diposting'], params: [{ name: 'date', label: 'Tanggal pembalikan', type: 'date', required: true }], confirm: 'Jurnal pembalik akan diposting.' }),
    ],
  },
  cash_transactions: {
    label: 'Kas Masuk/Keluar', one: 'transaksi kas', module: 'finance', scope: 'branch', title: 'description', number: 'KB', sort: 'date', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }),
      F.sel('direction', 'Arah', [['keluar', 'Kas keluar'], ['masuk', 'Kas masuk']], { required: true, default: 'keluar', list: true }),
      F.ref('bank_account_id', 'Kas/bank', 'bank_accounts', { required: true, list: true }),
      F.text('description', 'Uraian', { required: true, list: true, search: true, max: 300 }),
      F.text('payee', 'Penerima/pemberi', { search: true }),
      F.money('total', 'Total', { readonly: true, list: true }),
      F.status(['draf', 'diposting', 'batal'], 'draf'),
    ],
    lines: {
      table: 'cash_transaction_lines',
      fields: [
        F.ref('account_id', 'Akun lawan', 'accounts', { required: true, refFilter: { is_header: 0 } }),
        F.money('amount', 'Jumlah', { required: true }),
        F.text('memo', 'Memo'),
        F.ref('cost_center_id', 'Pusat biaya', 'cost_centers'),
        F.ref('project_id', 'Proyek', 'projects'),
      ],
    },
    actions: [act('post', 'Posting', { from: ['draf'] }), act('void', 'Batalkan (jurnal balik)', { from: ['diposting'], confirm: 'Jurnal pembalik akan diposting.' })],
  },
  bank_transfers: {
    label: 'Transfer Antar Rekening', one: 'transfer', module: 'finance', scope: 'branch', title: 'description', number: 'TRF', sort: 'date', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }),
      F.ref('from_bank_id', 'Dari rekening', 'bank_accounts', { required: true, list: true }),
      F.ref('to_bank_id', 'Ke rekening', 'bank_accounts', { required: true, list: true, refScope: 'company' }),
      F.money('amount', 'Jumlah', { required: true, list: true }),
      F.text('description', 'Uraian', { required: true, search: true }),
      F.status(['draf', 'diposting', 'batal'], 'draf'),
    ],
    actions: [act('post', 'Posting', { from: ['draf'] }), act('void', 'Batalkan', { from: ['diposting'] })],
  },
  budgets: {
    label: 'Anggaran', one: 'anggaran', module: 'finance', scope: 'branch', title: 'notes', sort: 'year', sortDir: 'desc',
    fields: [
      F.int('year', 'Tahun', { required: true, list: true, min: 2000, max: 2100 }),
      F.ref('account_id', 'Akun', 'accounts', { required: true, list: true, refFilter: { is_header: 0 } }),
      F.ref('cost_center_id', 'Pusat biaya', 'cost_centers', { list: true }),
      F.money('amount', 'Anggaran setahun', { required: true, list: true }),
      F.text('notes', 'Catatan', { search: true }),
    ],
  },

  /* ------------------------------------------------------------ Aset */
  fixed_assets: {
    label: 'Aset Tetap', one: 'aset', module: 'assets', scope: 'branch', title: 'name', sort: 'code',
    editable: ['draf'],
    fields: [
      F.code(), F.name(),
      F.sel('category', 'Kategori', ['Bangunan', 'Mesin & Peralatan', 'Kendaraan', 'Peralatan Kantor & TI'], { required: true, list: true }),
      F.date('acquisition_date', 'Tanggal perolehan', { required: true, list: true }),
      F.money('cost', 'Harga perolehan', { required: true, list: true }),
      F.money('salvage_value', 'Nilai sisa', { default: 0 }),
      F.int('useful_life_months', 'Umur manfaat (bulan)', { required: true, min: 1, max: 600 }),
      F.ref('asset_account_id', 'Akun aset', 'accounts', { required: true, refFilter: { subtype: 'fixed_asset' } }),
      F.ref('accum_account_id', 'Akun akumulasi', 'accounts', { required: true, refFilter: { subtype: 'accum_depr' } }),
      F.ref('expense_account_id', 'Akun beban penyusutan', 'accounts', { required: true, refFilter: { type: 'expense', is_header: 0 } }),
      F.ref('credit_account_id', 'Akun pembayaran perolehan', 'accounts', { required: true, refFilter: { is_header: 0 }, help: 'Kas/bank, hutang, atau modal (setoran inbreng).' }),
      F.text('location', 'Lokasi'),
      F.money('accumulated', 'Akumulasi penyusutan', { readonly: true }),
      F.money('book_value', 'Nilai buku', { readonly: true, list: true }),
      F.status(['draf', 'aktif', 'dilepas'], 'draf'),
    ],
    actions: [
      act('activate', 'Aktifkan & posting perolehan', { from: ['draf'] }),
      act('dispose', 'Lepas / jual aset', { from: ['aktif'], params: [
        { name: 'date', label: 'Tanggal pelepasan', type: 'date', required: true },
        { name: 'proceeds', label: 'Hasil penjualan', type: 'money', default: 0 },
        { name: 'bank_account_id', label: 'Diterima di rekening', type: 'ref', ref: 'bank_accounts' },
      ] }),
    ],
  },
  depreciation_runs: {
    label: 'Penyusutan Bulanan', one: 'penyusutan', module: 'assets', scope: 'company', title: 'number', number: 'DEP', sort: 'period', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.text('period', 'Periode (YYYY-MM)', { required: true, list: true, pattern: '^\\d{4}-(0[1-9]|1[0-2])$', max: 7 }),
      F.money('total', 'Total penyusutan', { readonly: true, list: true }),
      F.int('asset_count', 'Jumlah aset', { readonly: true, list: true }),
      F.status(['draf', 'diposting', 'batal'], 'draf'),
    ],
    actions: [act('post', 'Hitung & posting', { from: ['draf'] }), act('void', 'Batalkan', { from: ['diposting'] })],
  },
  maintenance_orders: {
    label: 'Pemeliharaan', one: 'perintah pemeliharaan', module: 'assets', scope: 'branch', title: 'description', number: 'MNT', sort: 'scheduled_date', sortDir: 'desc',
    editable: ['dijadwalkan', 'berjalan'],
    fields: [
      F.number(), F.ref('asset_id', 'Aset', 'fixed_assets', { required: true, list: true }),
      F.sel('kind', 'Jenis', ['Preventif', 'Korektif'], { default: 'Preventif', list: true }),
      F.sel('priority', 'Prioritas', ['rendah', 'sedang', 'tinggi'], { default: 'sedang' }),
      F.text('pic', 'Teknisi', { list: true }),
      F.date('scheduled_date', 'Jadwal', { required: true, list: true }),
      F.money('cost', 'Biaya', { list: true }),
      F.ref('bank_account_id', 'Dibayar dari', 'bank_accounts'),
      F.area('description', 'Uraian pekerjaan', { required: true, search: true }),
      F.status(['dijadwalkan', 'berjalan', 'selesai', 'batal'], 'dijadwalkan'),
    ],
    actions: [act('start', 'Mulai', { from: ['dijadwalkan'], level: 2 }), act('complete', 'Selesai & posting biaya', { from: ['dijadwalkan', 'berjalan'] }), act('cancel', 'Batal', { from: ['dijadwalkan', 'berjalan'], level: 2 })],
  },

  /* ------------------------------------------------------------ Data master */
  products: {
    label: 'Produk & Layanan', one: 'produk', module: 'master', scope: 'global', title: 'name', sort: 'code',
    fields: [
      F.code({ label: 'SKU' }), F.name(),
      F.sel('kind', 'Jenis', [['barang_dagang', 'Barang dagang'], ['bahan_baku', 'Bahan baku'], ['barang_jadi', 'Barang jadi'], ['jasa', 'Jasa']], { required: true, list: true }),
      F.text('category', 'Kategori', { list: true, search: true }),
      F.text('uom', 'Satuan', { max: 10, default: 'pcs' }),
      F.money('price', 'Harga jual', { list: true }),
      F.money('standard_cost', 'Biaya standar'),
      F.num('min_stock', 'Stok minimum', { default: 0 }),
      F.num('max_stock', 'Stok maksimum', { default: 0 }),
      F.ref('inventory_account_id', 'Akun persediaan', 'accounts', { refFilter: { subtype: 'inventory' } }),
      F.ref('revenue_account_id', 'Akun pendapatan', 'accounts', { refFilter: { type: 'revenue', is_header: 0 } }),
      F.ref('cogs_account_id', 'Akun HPP', 'accounts', { refFilter: { type: 'cogs', is_header: 0 } }),
      F.status(['aktif', 'nonaktif'], 'aktif'),
    ],
    computed: {
      on_hand: { label: 'Stok', type: 'number', list: true, sql: `(SELECT COALESCE(SUM(sb.qty),0) FROM stock_balances sb JOIN warehouses w ON w.id = sb.warehouse_id WHERE sb.product_id = t.id {{scope:w}})` },
    },
  },
  warehouses: {
    label: 'Gudang', one: 'gudang', module: 'master', scope: 'branch', title: 'name', sort: 'code',
    fields: [F.code(), F.name(), F.area('address', 'Alamat'), F.status(['aktif', 'nonaktif'], 'aktif')],
  },

  /* ------------------------------------------------------------ CRM */
  leads: {
    label: 'Lead & Peluang', one: 'peluang', module: 'crm', scope: 'branch', title: 'title', number: 'LD', sort: 'expected_close',
    statusField: 'stage',
    fields: [
      F.number(), F.text('title', 'Judul peluang', { required: true, list: true, search: true }),
      F.text('company_name', 'Perusahaan prospek', { required: true, list: true, search: true }),
      F.text('contact', 'Kontak'), F.email(), F.text('phone', 'Telepon', { max: 30 }),
      F.sel('source', 'Sumber', ['Referensi', 'Pameran', 'Situs web', 'Telemarketing', 'Mitra'], { list: true }),
      F.money('value', 'Nilai', { list: true }), F.pct('probability', 'Probabilitas', { default: 20, list: true }),
      F.text('owner', 'Pemilik'), F.date('expected_close', 'Perkiraan closing', { list: true }),
      F.ref('customer_id', 'Pelanggan terkait', 'customers'),
      F.area('notes', 'Catatan'),
      F.sel('stage', 'Tahap', ['prospek', 'kualifikasi', 'penawaran', 'negosiasi', 'menang', 'kalah'], { default: 'prospek', list: true }),
    ],
    actions: [act('convert', 'Buat pelanggan & penawaran', { from: ['penawaran', 'negosiasi', 'menang'], level: 2 })],
  },

  /* ------------------------------------------------------------ Penjualan */
  customers: {
    label: 'Pelanggan', one: 'pelanggan', module: 'sales', scope: 'company', title: 'name', sort: 'name',
    fields: [
      F.code(), F.name(),
      F.sel('segment', 'Segmen', ['Korporasi', 'Distributor', 'Ritel', 'Pemerintah', 'Antar perusahaan'], { list: true }),
      F.text('pic', 'PIC'), F.email(), F.text('phone', 'Telepon', { max: 30 }),
      F.text('city', 'Kota', { list: true, search: true }), F.area('address', 'Alamat'),
      F.text('npwp', 'NPWP', { max: 30, sensitive: true }),
      F.money('credit_limit', 'Plafon kredit', { list: true }),
      F.int('terms_days', 'Termin (hari)', { default: 30, min: 0, max: 365 }),
      F.ref('related_company_id', 'Perusahaan grup (antar perusahaan)', 'companies'),
      F.status(['aktif', 'ditahan', 'nonaktif'], 'aktif'),
    ],
    computed: {
      outstanding: { label: 'Piutang terbuka', type: 'money', list: true, sql: `(SELECT ROUND(COALESCE(SUM(i.total - i.paid),0),2) FROM sales_invoices i WHERE i.customer_id = t.id AND i.status IN ('terbit','sebagian'))` },
    },
  },
  quotations: {
    label: 'Penawaran', one: 'penawaran', module: 'sales', scope: 'branch', title: 'number', number: 'QT', sort: 'date', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }), F.date('valid_until', 'Berlaku sampai', { list: true }),
      F.ref('customer_id', 'Pelanggan', 'customers', { required: true, list: true, search: true }),
      F.ref('lead_id', 'Peluang CRM', 'leads'), F.area('notes', 'Catatan'),
      ...docTotals(),
      F.status(['draf', 'terkirim', 'diterima', 'ditolak'], 'draf'),
    ],
    lines: tradeLines('quotation_lines'),
    actions: [
      act('send', 'Kirim ke pelanggan', { from: ['draf'], level: 2 }),
      act('accept', 'Diterima pelanggan', { from: ['terkirim'], level: 2 }),
      act('reject', 'Ditolak pelanggan', { from: ['terkirim'], level: 2 }),
      act('to_order', 'Buat pesanan penjualan', { from: ['diterima'], level: 2 }),
    ],
  },
  sales_orders: {
    label: 'Pesanan Penjualan', one: 'pesanan penjualan', module: 'sales', scope: 'branch', title: 'number', number: 'SO', sort: 'date', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }), F.date('delivery_date', 'Tanggal kirim', { list: true }),
      F.ref('customer_id', 'Pelanggan', 'customers', { required: true, list: true, search: true }),
      F.ref('warehouse_id', 'Gudang kirim', 'warehouses', { required: true }),
      F.ref('quotation_id', 'Penawaran', 'quotations', { readonly: true }),
      F.text('customer_po', 'No. PO pelanggan', { max: 40, search: true }), F.area('notes', 'Catatan'),
      ...docTotals(),
      F.text('approval_note', 'Catatan persetujuan', { readonly: true }),
      F.status(['draf', 'menunggu', 'disetujui', 'selesai', 'batal'], 'draf'),
    ],
    lines: tradeLines('sales_order_lines'),
    actions: [
      act('submit', 'Ajukan (cek plafon kredit)', { from: ['draf'], level: 2 }),
      act('approve', 'Setujui', { from: ['menunggu'], sod: true }),
      act('reject', 'Tolak', { from: ['menunggu'], params: [{ name: 'reason', label: 'Alasan', type: 'text', required: true }] }),
      act('to_invoice', 'Kirim & buat faktur', { from: ['disetujui'], level: 2 }),
      act('cancel', 'Batalkan', { from: ['draf', 'disetujui'], level: 2 }),
    ],
  },
  sales_invoices: {
    label: 'Faktur Penjualan', one: 'faktur', module: 'sales', scope: 'branch', title: 'number', number: 'INV', sort: 'date', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }), F.date('due_date', 'Jatuh tempo', { list: true }),
      F.ref('customer_id', 'Pelanggan', 'customers', { required: true, list: true, search: true }),
      F.ref('warehouse_id', 'Gudang', 'warehouses', { required: true }),
      F.ref('sales_order_id', 'Pesanan penjualan', 'sales_orders', { readonly: true }),
      F.area('notes', 'Catatan'),
      ...docTotals(),
      F.money('paid', 'Terbayar', { readonly: true, list: true }),
      F.status(['draf', 'terbit', 'sebagian', 'lunas', 'batal'], 'draf'),
    ],
    lines: tradeLines('sales_invoice_lines'),
    actions: [
      act('post', 'Terbitkan & posting', { from: ['draf'] }),
      act('void', 'Batalkan (jurnal balik)', { from: ['terbit'], confirm: 'Faktur dibatalkan, jurnal & stok dibalik.' }),
    ],
  },
  customer_receipts: {
    label: 'Penerimaan Pelanggan', one: 'penerimaan', module: 'sales', scope: 'branch', title: 'number', number: 'RCV', sort: 'date', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }),
      F.ref('customer_id', 'Pelanggan', 'customers', { required: true, list: true, search: true }),
      F.ref('bank_account_id', 'Diterima di', 'bank_accounts', { required: true, list: true }),
      F.text('reference', 'Referensi', { max: 60 }),
      F.money('total', 'Total', { readonly: true, list: true }),
      F.status(['draf', 'diposting', 'batal'], 'draf'),
    ],
    lines: {
      table: 'customer_receipt_lines',
      fields: [F.ref('invoice_id', 'Faktur', 'sales_invoices', { required: true, refFilter: { status: ['terbit', 'sebagian'] }, refParent: 'customer_id' }), F.money('amount', 'Dibayar', { required: true })],
    },
    actions: [act('post', 'Posting', { from: ['draf'] }), act('void', 'Batalkan', { from: ['diposting'] })],
  },
  pos_sales: {
    label: 'Transaksi Kasir', one: 'transaksi kasir', module: 'pos', scope: 'branch', title: 'number', number: 'POS', sort: 'date', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }),
      F.ref('warehouse_id', 'Gudang toko', 'warehouses', { required: true }),
      F.ref('bank_account_id', 'Laci kas / rekening', 'bank_accounts', { required: true }),
      F.sel('payment_method', 'Metode bayar', ['Tunai', 'QRIS', 'Debit', 'Kartu kredit', 'Transfer'], { default: 'Tunai', list: true }),
      F.text('customer_name', 'Nama pembeli', { default: 'Umum', search: true }),
      F.text('cashier', 'Kasir', { readonly: true, list: true }),
      ...docTotals(),
      F.status(['draf', 'lunas', 'void'], 'draf'),
    ],
    lines: tradeLines('pos_sale_lines'),
    actions: [act('pay', 'Bayar & posting', { from: ['draf'], level: 2 }), act('void', 'Void', { from: ['lunas'] })],
  },

  /* ------------------------------------------------------------ Pembelian */
  suppliers: {
    label: 'Pemasok', one: 'pemasok', module: 'purchasing', scope: 'company', title: 'name', sort: 'name',
    fields: [
      F.code(), F.name(),
      F.text('category', 'Kategori', { list: true, search: true }),
      F.text('pic', 'PIC'), F.email(), F.text('phone', 'Telepon', { max: 30 }),
      F.text('city', 'Kota', { list: true }), F.area('address', 'Alamat'),
      F.text('npwp', 'NPWP', { max: 30, sensitive: true }),
      F.text('bank_account_no', 'Rekening bank', { max: 60, sensitive: true }),
      F.int('terms_days', 'Termin (hari)', { default: 30 }), F.int('lead_time_days', 'Waktu tunggu (hari)', { default: 7, list: true }),
      F.ref('related_company_id', 'Perusahaan grup (antar perusahaan)', 'companies'),
      F.status(['aktif', 'pantau', 'nonaktif'], 'aktif'),
    ],
    computed: {
      outstanding: { label: 'Hutang terbuka', type: 'money', list: true, sql: `(SELECT ROUND(COALESCE(SUM(b.total - b.paid),0),2) FROM purchase_bills b WHERE b.supplier_id = t.id AND b.status IN ('terbit','sebagian'))` },
    },
  },
  purchase_requests: {
    label: 'Permintaan Pembelian', one: 'permintaan', module: 'purchasing', scope: 'branch', title: 'number', number: 'PR', sort: 'date', sortDir: 'desc',
    editable: ['draf', 'ditolak'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }),
      F.text('requester', 'Peminta', { required: true, list: true, search: true }),
      F.ref('cost_center_id', 'Pusat biaya', 'cost_centers', { list: true }),
      F.sel('priority', 'Prioritas', ['rendah', 'sedang', 'tinggi'], { default: 'sedang', list: true }),
      F.date('needed_by', 'Dibutuhkan'), F.area('notes', 'Keperluan', { search: true }),
      F.money('total', 'Estimasi', { readonly: true, list: true }),
      F.status(['draf', 'menunggu', 'disetujui', 'ditolak', 'selesai'], 'draf'),
    ],
    lines: {
      table: 'purchase_request_lines',
      fields: [F.ref('product_id', 'Barang', 'products', { required: true }), F.text('description', 'Spesifikasi'), F.num('qty', 'Qty', { required: true, min: 0.0001, default: 1 }), F.money('price', 'Estimasi harga'), F.money('amount', 'Jumlah', { readonly: true })],
    },
    actions: [
      act('submit', 'Ajukan', { from: ['draf', 'ditolak'], level: 2 }),
      act('approve', 'Setujui', { from: ['menunggu'], sod: true }),
      act('reject', 'Tolak', { from: ['menunggu'], params: [{ name: 'reason', label: 'Alasan', type: 'text', required: true }] }),
      act('to_po', 'Buat pesanan pembelian', { from: ['disetujui'], level: 2, params: [{ name: 'supplier_id', label: 'Pemasok', type: 'ref', ref: 'suppliers', required: true }, { name: 'warehouse_id', label: 'Gudang tujuan', type: 'ref', ref: 'warehouses', required: true }] }),
    ],
  },
  rfqs: {
    label: 'RFQ & Vendor', one: 'RFQ', module: 'purchasing', scope: 'branch', title: 'title', number: 'RFQ', sort: 'date', sortDir: 'desc',
    editable: ['draf', 'terbuka'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }),
      F.text('title', 'Judul', { required: true, list: true, search: true }),
      F.ref('purchase_request_id', 'Permintaan pembelian', 'purchase_requests', { list: true }),
      F.date('deadline', 'Batas penawaran', { list: true }),
      F.money('best_price', 'Harga terbaik', { readonly: true, list: true }),
      F.ref('awarded_supplier_id', 'Pemenang', 'suppliers', { readonly: true, list: true }),
      F.status(['draf', 'terbuka', 'selesai', 'batal'], 'draf'),
    ],
    lines: {
      table: 'rfq_lines',
      fields: [F.ref('supplier_id', 'Pemasok', 'suppliers', { required: true }), F.money('amount', 'Nilai penawaran', { required: true }), F.int('lead_time_days', 'Waktu kirim (hari)'), F.text('notes', 'Catatan')],
    },
    actions: [act('open', 'Buka penawaran', { from: ['draf'], level: 2 }), act('award', 'Tetapkan pemenang termurah', { from: ['terbuka'] }), act('cancel', 'Batal', { from: ['draf', 'terbuka'], level: 2 })],
  },
  purchase_orders: {
    label: 'Pesanan Pembelian', one: 'pesanan pembelian', module: 'purchasing', scope: 'branch', title: 'number', number: 'PO', sort: 'date', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }), F.date('eta', 'Perkiraan tiba', { list: true }),
      F.ref('supplier_id', 'Pemasok', 'suppliers', { required: true, list: true, search: true }),
      F.ref('warehouse_id', 'Gudang tujuan', 'warehouses', { required: true }),
      F.ref('purchase_request_id', 'Permintaan', 'purchase_requests', { readonly: true }),
      F.text('buyer', 'Pembeli', { list: true }), F.area('notes', 'Catatan'),
      ...docTotals(),
      F.status(['draf', 'menunggu', 'disetujui', 'diterima', 'batal'], 'draf'),
    ],
    lines: tradeLines('purchase_order_lines'),
    actions: [
      act('submit', 'Ajukan', { from: ['draf'], level: 2 }),
      act('approve', 'Setujui', { from: ['menunggu'], sod: true }),
      act('reject', 'Tolak', { from: ['menunggu'], params: [{ name: 'reason', label: 'Alasan', type: 'text', required: true }] }),
      act('to_bill', 'Terima barang & buat tagihan', { from: ['disetujui'], level: 2, params: [{ name: 'supplier_invoice_no', label: 'No. faktur pemasok', type: 'text', required: true }] }),
      act('cancel', 'Batalkan', { from: ['draf', 'disetujui'], level: 2 }),
    ],
  },
  purchase_bills: {
    label: 'Tagihan Pemasok', one: 'tagihan', module: 'purchasing', scope: 'branch', title: 'number', number: 'BILL', sort: 'date', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.text('supplier_invoice_no', 'No. faktur pemasok', { max: 60, search: true, list: true }),
      F.date('date', 'Tanggal', { required: true, list: true }), F.date('due_date', 'Jatuh tempo', { list: true }),
      F.ref('supplier_id', 'Pemasok', 'suppliers', { required: true, list: true, search: true }),
      F.ref('warehouse_id', 'Gudang penerima', 'warehouses'),
      F.ref('purchase_order_id', 'Pesanan pembelian', 'purchase_orders', { readonly: true }),
      F.area('notes', 'Catatan'),
      ...docTotals(),
      F.money('paid', 'Terbayar', { readonly: true, list: true }),
      F.status(['draf', 'terbit', 'sebagian', 'lunas', 'batal'], 'draf'),
    ],
    lines: {
      table: 'purchase_bill_lines',
      fields: [
        F.ref('product_id', 'Barang (persediaan)', 'products'),
        F.ref('account_id', 'atau Akun beban/aset', 'accounts', { refFilter: { is_header: 0 } }),
        F.text('description', 'Keterangan'),
        F.num('qty', 'Qty', { required: true, min: 0.0001, default: 1 }),
        F.money('price', 'Harga', { required: true }),
        F.pct('discount_pct', 'Diskon %', { default: 0 }),
        F.ref('cost_center_id', 'Pusat biaya', 'cost_centers'),
        F.ref('project_id', 'Proyek', 'projects'),
        F.money('amount', 'Jumlah', { readonly: true }),
      ],
    },
    actions: [act('post', 'Posting tagihan', { from: ['draf'] }), act('void', 'Batalkan (jurnal balik)', { from: ['terbit'] })],
  },
  supplier_payments: {
    label: 'Pembayaran Pemasok', one: 'pembayaran', module: 'purchasing', scope: 'branch', title: 'number', number: 'PAY', sort: 'date', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }),
      F.ref('supplier_id', 'Pemasok', 'suppliers', { required: true, list: true, search: true }),
      F.ref('bank_account_id', 'Dibayar dari', 'bank_accounts', { required: true, list: true }),
      F.text('reference', 'Referensi', { max: 60 }),
      F.money('total', 'Total', { readonly: true, list: true }),
      F.status(['draf', 'menunggu', 'diposting', 'batal'], 'draf'),
    ],
    lines: {
      table: 'supplier_payment_lines',
      fields: [F.ref('bill_id', 'Tagihan', 'purchase_bills', { required: true, refFilter: { status: ['terbit', 'sebagian'] }, refParent: 'supplier_id' }), F.money('amount', 'Dibayar', { required: true })],
    },
    actions: [act('submit', 'Ajukan pembayaran', { from: ['draf'], level: 2 }), act('post', 'Setujui & posting', { from: ['menunggu'], sod: true }), act('void', 'Batalkan', { from: ['diposting'] })],
  },

  /* ------------------------------------------------------------ Inventaris */
  stock_moves: {
    label: 'Mutasi Stok', one: 'mutasi', module: 'inventory', scope: 'branch', title: 'source_no', sort: 'date', sortDir: 'desc', readonlyEntity: true,
    fields: [
      F.date('date', 'Tanggal', { list: true }),
      F.ref('warehouse_id', 'Gudang', 'warehouses', { list: true }),
      F.ref('product_id', 'Barang', 'products', { list: true, search: true }),
      F.num('qty', 'Qty', { list: true }), F.money('unit_cost', 'Biaya satuan', { list: true }),
      F.money('value', 'Nilai', { list: true, min: undefined }),
      F.text('source_type', 'Jenis sumber', { list: true }), F.text('source_no', 'Dokumen', { list: true, search: true }),
    ],
  },
  stock_adjustments: {
    label: 'Penyesuaian Stok', one: 'penyesuaian', module: 'inventory', scope: 'branch', title: 'number', number: 'ADJ', sort: 'date', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }),
      F.ref('warehouse_id', 'Gudang', 'warehouses', { required: true, list: true }),
      F.ref('account_id', 'Akun lawan', 'accounts', { required: true, refFilter: { is_header: 0 }, help: 'Biasanya Beban Selisih Persediaan; gunakan ekuitas untuk saldo awal.' }),
      F.text('reason', 'Alasan', { required: true, list: true, search: true }),
      F.money('total', 'Nilai', { readonly: true, list: true, min: undefined }),
      F.status(['draf', 'diposting'], 'draf'),
    ],
    lines: {
      table: 'stock_adjustment_lines',
      fields: [F.ref('product_id', 'Barang', 'products', { required: true }), F.num('qty', 'Qty (+/−)', { required: true }), F.money('unit_cost', 'Biaya satuan (untuk +)', { help: 'Kosong = biaya rata-rata' })],
    },
    actions: [act('post', 'Posting', { from: ['draf'] })],
  },
  stock_transfers: {
    label: 'Transfer Stok', one: 'transfer stok', module: 'inventory', scope: 'branch', title: 'number', number: 'TRS', sort: 'date', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }),
      F.ref('from_warehouse_id', 'Dari gudang', 'warehouses', { required: true, list: true }),
      F.ref('to_warehouse_id', 'Ke gudang', 'warehouses', { required: true, list: true, refScope: 'company' }),
      F.text('notes', 'Catatan'),
      F.money('total', 'Nilai', { readonly: true, list: true }),
      F.status(['draf', 'diposting'], 'draf'),
    ],
    lines: { table: 'stock_transfer_lines', fields: [F.ref('product_id', 'Barang', 'products', { required: true }), F.num('qty', 'Qty', { required: true, min: 0.0001 })] },
    actions: [act('post', 'Posting', { from: ['draf'] })],
  },
  shipments: {
    label: 'Rantai Pasok', one: 'pengiriman', module: 'inventory', scope: 'branch', title: 'number', number: 'SHP', sort: 'date', sortDir: 'desc',
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }),
      F.text('origin', 'Asal', { required: true, list: true }), F.text('destination', 'Tujuan', { required: true, list: true }),
      F.text('carrier', 'Ekspedisi', { list: true, search: true }), F.text('reference', 'Referensi dokumen', { search: true }),
      F.num('weight_kg', 'Berat (kg)'), F.date('eta', 'Perkiraan tiba', { list: true }),
      F.status(['disiapkan', 'transit', 'diterima', 'batal'], 'disiapkan'),
    ],
  },

  /* ------------------------------------------------------------ Produksi */
  boms: {
    label: 'Bill of Materials', one: 'BOM', module: 'production', scope: 'global', title: 'name', sort: 'code',
    fields: [F.code(), F.name(), F.ref('product_id', 'Produk jadi', 'products', { required: true, list: true, refFilter: { kind: 'barang_jadi' } }), F.num('output_qty', 'Hasil per batch', { default: 1, min: 0.0001 }), F.status(['aktif', 'nonaktif'], 'aktif')],
    lines: { table: 'bom_lines', fields: [F.ref('component_id', 'Komponen', 'products', { required: true }), F.num('qty', 'Qty per batch', { required: true, min: 0.0001 })] },
  },
  work_orders: {
    label: 'Perintah Kerja', one: 'perintah kerja', module: 'production', scope: 'branch', title: 'number', number: 'WO', sort: 'due_date',
    editable: ['antre'],
    fields: [
      F.number(), F.date('date', 'Tanggal', { required: true, list: true }),
      F.ref('bom_id', 'BOM', 'boms', { required: true, list: true }),
      F.num('qty', 'Jumlah batch', { required: true, min: 0.0001, list: true }),
      F.ref('warehouse_id', 'Gudang', 'warehouses', { required: true }),
      F.sel('line', 'Lini produksi', ['Lini A', 'Lini B', 'Lini C'], { default: 'Lini A', list: true }),
      F.date('due_date', 'Jatuh tempo', { list: true }), F.text('pic', 'Penanggung jawab', { list: true }),
      F.pct('progress', 'Kemajuan', { default: 0, list: true }),
      F.money('total', 'Biaya produksi', { readonly: true }),
      F.status(['antre', 'berjalan', 'qc', 'selesai', 'batal'], 'antre'),
    ],
    actions: [
      act('start', 'Mulai produksi', { from: ['antre'], level: 2 }),
      act('to_qc', 'Kirim ke QC', { from: ['berjalan'], level: 2 }),
      act('complete', 'Lolos QC & posting hasil', { from: ['qc'] }),
      act('cancel', 'Batal', { from: ['antre', 'berjalan'], level: 2 }),
    ],
  },

  /* ------------------------------------------------------------ Proyek */
  projects: {
    label: 'Proyek', one: 'proyek', module: 'projects', scope: 'branch', title: 'name', sort: 'code',
    fields: [
      F.code(), F.name(), F.ref('customer_id', 'Pelanggan', 'customers', { list: true }),
      F.text('manager', 'Manajer proyek', { list: true }), F.money('budget', 'Anggaran', { list: true }),
      F.date('start_date', 'Mulai'), F.date('end_date', 'Selesai', { list: true }), F.pct('progress', 'Kemajuan', { list: true }),
      F.status(['perencanaan', 'berjalan', 'ditunda', 'selesai'], 'perencanaan'),
    ],
    computed: {
      actual: { label: 'Realisasi biaya', type: 'money', list: true, sql: `(SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id WHERE jl.project_id = t.id AND j.status = 'diposting' AND a.type IN ('cogs','expense','other_expense'))` },
    },
  },
  project_tasks: {
    label: 'Tugas Proyek', one: 'tugas', module: 'projects', scope: 'branch', title: 'name', sort: 'start_date',
    fields: [F.ref('project_id', 'Proyek', 'projects', { required: true, list: true }), F.name(), F.date('start_date', 'Mulai', { required: true, list: true }), F.date('end_date', 'Selesai', { required: true, list: true }), F.pct('progress', 'Kemajuan', { list: true }), F.text('assignee', 'Pelaksana', { list: true })],
  },

  /* ------------------------------------------------------------ SDM */
  employees: {
    label: 'Karyawan', one: 'karyawan', module: 'hr', scope: 'branch', title: 'name', sort: 'code',
    fields: [
      F.code({ label: 'No. induk' }), F.name(),
      F.text('nik', 'NIK KTP', { max: 20, sensitive: true }), F.text('npwp', 'NPWP', { max: 30, sensitive: true }),
      F.text('department', 'Departemen', { list: true, search: true }), F.text('position', 'Jabatan', { list: true, search: true }),
      F.date('join_date', 'Tanggal bergabung', { list: true }),
      F.sel('employment_type', 'Status kerja', ['tetap', 'kontrak', 'magang'], { default: 'tetap', list: true }),
      F.email(), F.text('phone', 'Telepon', { max: 30, sensitive: true }),
      F.text('bank_account_no', 'Rekening gaji', { max: 40, sensitive: true }),
      F.money('basic_salary', 'Gaji pokok', { sensitive: true }), F.money('allowance', 'Tunjangan tetap', { sensitive: true }),
      F.ref('cost_center_id', 'Pusat biaya', 'cost_centers'),
      F.status(['aktif', 'nonaktif'], 'aktif'),
    ],
  },
  attendance: {
    label: 'Kehadiran', one: 'kehadiran', module: 'hr', scope: 'branch', title: 'date', sort: 'date', sortDir: 'desc',
    fields: [
      F.ref('employee_id', 'Karyawan', 'employees', { required: true, list: true, search: true }),
      F.date('date', 'Tanggal', { required: true, list: true }),
      F.sel('shift', 'Shift', ['Reguler', 'Shift 1', 'Shift 2'], { default: 'Reguler', list: true }),
      F.text('clock_in', 'Masuk', { max: 5, pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', list: true }),
      F.text('clock_out', 'Keluar', { max: 5, pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', list: true }),
      F.num('overtime_hours', 'Lembur (jam)', { default: 0, min: 0, max: 24 }),
      F.status(['hadir', 'terlambat', 'izin', 'sakit', 'cuti', 'alpa'], 'hadir'),
    ],
  },
  leave_requests: {
    label: 'Cuti & Izin', one: 'pengajuan cuti', module: 'hr', scope: 'branch', title: 'reason', sort: 'start_date', sortDir: 'desc',
    editable: ['menunggu'],
    fields: [
      F.ref('employee_id', 'Karyawan', 'employees', { required: true, list: true, search: true }),
      F.sel('kind', 'Jenis', ['Cuti tahunan', 'Sakit', 'Izin', 'Cuti melahirkan', 'Dinas luar'], { required: true, list: true }),
      F.date('start_date', 'Mulai', { required: true, list: true }), F.date('end_date', 'Selesai', { required: true, list: true }),
      F.text('reason', 'Alasan', { search: true }),
      F.status(['menunggu', 'disetujui', 'ditolak'], 'menunggu'),
    ],
    actions: [act('approve', 'Setujui', { from: ['menunggu'], sod: true }), act('reject', 'Tolak', { from: ['menunggu'] })],
  },
  payroll_runs: {
    label: 'Penggajian', one: 'proses gaji', module: 'hr', scope: 'branch', title: 'period', number: 'PYR', sort: 'period', sortDir: 'desc',
    editable: ['draf'],
    fields: [
      F.number(), F.text('period', 'Periode (YYYY-MM)', { required: true, list: true, pattern: '^\\d{4}-(0[1-9]|1[0-2])$', max: 7 }),
      F.date('pay_date', 'Tanggal bayar', { required: true, list: true }),
      F.ref('bank_account_id', 'Dibayar dari', 'bank_accounts', { required: true }),
      F.money('gross', 'Bruto', { readonly: true, list: true, sensitive: true }),
      F.money('total', 'Neto dibayar', { readonly: true, list: true, sensitive: true }),
      F.status(['draf', 'disetujui', 'diposting', 'dibayar'], 'draf'),
    ],
    lines: {
      table: 'payroll_lines',
      fields: [
        F.ref('employee_id', 'Karyawan', 'employees', { required: true }),
        F.money('basic', 'Gaji pokok', { sensitive: true }), F.money('allowance', 'Tunjangan', { sensitive: true }),
        F.money('overtime', 'Lembur', { sensitive: true }), F.money('bpjs', 'Potongan BPJS', { sensitive: true }),
        F.money('pph21', 'PPh 21', { sensitive: true }), F.money('net', 'Neto', { readonly: true, sensitive: true }),
      ],
    },
    actions: [
      act('generate', 'Isi dari data karyawan', { from: ['draf'], level: 2 }),
      act('approve', 'Setujui', { from: ['draf'], sod: true }),
      act('post', 'Posting beban gaji', { from: ['disetujui'] }),
      act('pay', 'Bayar gaji', { from: ['diposting'] }),
    ],
  },

  /* ------------------------------------------------------------ Dokumen & alur kerja */
  documents: {
    label: 'Repositori Dokumen', one: 'dokumen', module: 'documents', scope: 'company', title: 'name', sort: 'updated_at', sortDir: 'desc',
    fields: [
      F.name(), F.sel('doc_type', 'Tipe', ['Kebijakan', 'Prosedur', 'Kontrak', 'Formulir', 'Sertifikat', 'Laporan', 'Lainnya'], { list: true }),
      F.text('folder', 'Folder', { list: true, search: true }), F.text('owner', 'Pemilik', { list: true }),
      F.sel('classification', 'Klasifikasi', ['Publik', 'Internal', 'Rahasia', 'Sangat rahasia'], { default: 'Internal', list: true }),
      F.text('version', 'Versi', { max: 10, default: '1.0', list: true }), F.date('expiry_date', 'Kedaluwarsa', { list: true }),
      F.text('location', 'Lokasi berkas / tautan', { max: 400 }), F.area('notes', 'Catatan'),
      F.status(['draf', 'berlaku', 'kedaluwarsa'], 'berlaku'),
    ],
  },
  workflows: {
    label: 'Alur Kerja', one: 'alur kerja', module: 'admin', scope: 'global', title: 'name', sort: 'name',
    fields: [F.name(), F.text('trigger_event', 'Pemicu', { list: true }), F.area('steps', 'Langkah', { list: true }), F.int('sla_hours', 'SLA (jam)', { list: true }), F.money('threshold', 'Ambang nilai'), F.status(['aktif', 'nonaktif'], 'aktif')],
  },

  /* ------------------------------------------------------------ Kepatuhan & keamanan informasi */
  compliance_items: {
    label: 'Kepatuhan & GRC', one: 'butir kepatuhan', module: 'compliance', scope: 'company', title: 'title', sort: 'due_date',
    fields: [
      F.code(), F.text('title', 'Judul', { required: true, list: true, search: true }),
      F.sel('category', 'Kategori', ['ISO 27001', 'Regulasi', 'Pajak', 'Tata kelola', 'Lingkungan', 'Audit', 'Pelindungan data'], { list: true }),
      F.text('owner', 'Penanggung jawab', { list: true }), F.date('due_date', 'Batas waktu', { list: true }), F.date('last_review', 'Tinjauan terakhir'),
      F.sel('risk', 'Risiko', ['rendah', 'sedang', 'tinggi'], { default: 'sedang', list: true }), F.area('notes', 'Catatan'),
      F.status(['patuh', 'peninjauan', 'dijadwalkan', 'tidak-patuh'], 'dijadwalkan'),
    ],
  },
  risks: {
    label: 'Register Risiko SI', one: 'risiko', module: 'compliance', scope: 'company', title: 'title', sort: 'code',
    fields: [
      F.code(), F.text('title', 'Risiko', { required: true, list: true, search: true }),
      F.text('asset', 'Aset informasi', { list: true }), F.text('threat', 'Ancaman'), F.text('vulnerability', 'Kerentanan'),
      F.int('likelihood', 'Kemungkinan (1-5)', { min: 1, max: 5, default: 3, list: true }), F.int('impact', 'Dampak (1-5)', { min: 1, max: 5, default: 3, list: true }),
      F.sel('treatment', 'Perlakuan', ['Mitigasi', 'Transfer', 'Hindari', 'Terima'], { default: 'Mitigasi' }),
      F.text('controls', 'Kontrol Annex A', { max: 300 }), F.text('owner', 'Pemilik risiko'), F.date('review_date', 'Tinjauan berikutnya'),
      F.status(['direncanakan', 'diterapkan', 'diterima_risiko'], 'direncanakan'),
    ],
    computed: { score: { label: 'Skor', type: 'int', list: true, sql: '(t.likelihood * t.impact)' } },
  },
  security_incidents: {
    label: 'Insiden Keamanan', one: 'insiden', module: 'compliance', scope: 'company', title: 'title', number: 'INC', sort: 'reported_at', sortDir: 'desc',
    fields: [
      F.number(), F.date('reported_at', 'Tanggal lapor', { required: true, list: true }),
      F.text('title', 'Judul', { required: true, list: true, search: true }),
      F.sel('severity', 'Tingkat', ['rendah', 'sedang', 'tinggi', 'kritis'], { default: 'sedang', list: true }),
      F.sel('category', 'Kategori', ['Akses tidak sah', 'Malware', 'Kebocoran data', 'Phishing', 'Gangguan layanan', 'Kehilangan perangkat', 'Lainnya'], { list: true }),
      F.text('reporter', 'Pelapor'), F.area('description', 'Kronologi', { required: true }), F.area('actions_taken', 'Tindakan'), F.area('lessons', 'Pelajaran'),
      F.status(['dilaporkan', 'investigasi', 'ditangani', 'tutup'], 'dilaporkan'),
    ],
  },
};

/* Lengkapi default: key, nama tabel, field status. */
for (const [key, e] of Object.entries(ENTITIES)) {
  e.key = key;
  e.table = e.table || key;
  e.statusField = e.statusField || (e.fields.some((f) => f.name === 'status') ? 'status' : null);
  e.actions = e.actions || [];
  e.computed = e.computed || {};
}

export function entity(key) {
  return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : null;
}
