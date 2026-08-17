/* ==========================================================================
   ERP Enterprise — Data contoh purwarupa
   Seluruh isi bersifat fiktif dan hanya untuk keperluan peragaan desain.
   Tenant peraga: PT Karya Nusantara Mandiri (manufaktur komponen & distribusi).
   ========================================================================== */

const DATA = (() => {
  /* --- Konteks tenant ---------------------------------------------------- */
  const org = {
    company: 'PT Karya Nusantara Mandiri',
    companies: ['PT Karya Nusantara Mandiri', 'PT Nusantara Logistik Prima', 'PT KNM Trading'],
    branch: 'Cikarang — Pabrik',
    branches: ['Jakarta — Pusat', 'Cikarang — Pabrik', 'Surabaya — Gudang', 'Medan — Cabang'],
    period: 'Agu 2026',
    periods: ['Jun 2026', 'Jul 2026', 'Agu 2026', 'Kuartal III 2026', 'TA 2026'],
    currency: 'IDR',
    user: { name: 'Osmond Pratama', initials: 'OP', role: 'Manajer Operasional', email: 'osmond@knm.co.id' },
  };

  /* --- Struktur navigasi (diperluas sesuai blueprint) -------------------- */
  const nav = [
    {
      label: 'Ikhtisar',
      items: [
        { id: 'dasbor', label: 'Dasbor', icon: 'grid' },
        { id: 'persetujuan', label: 'Kotak Persetujuan', icon: 'inbox', count: 5 },
      ],
    },
    {
      label: 'Data Master',
      items: [
        { id: 'data-master', label: 'Produk & Layanan', icon: 'database' },
      ],
    },
    {
      label: 'CRM',
      items: [
        { id: 'lead', label: 'Lead & Peluang', icon: 'target', count: 24 },
      ],
    },
    {
      label: 'Penjualan',
      items: [
        { id: 'penawaran', label: 'Penawaran', icon: 'quote', count: 12 },
        { id: 'pesanan-penjualan', label: 'Pesanan Penjualan', icon: 'cart', count: 148 },
        { id: 'faktur', label: 'Faktur', icon: 'invoice', count: 62 },
        { id: 'pelanggan', label: 'Pelanggan', icon: 'building' },
      ],
    },
    {
      label: 'POS / Kasir',
      items: [
        { id: 'kasir', label: 'Kasir', icon: 'barcode' },
      ],
    },
    {
      label: 'Pembelian',
      items: [
        { id: 'permintaan-pembelian', label: 'Permintaan Pembelian', icon: 'clipboard', count: 8 },
        { id: 'rfq', label: 'RFQ & Vendor', icon: 'scale', count: 4 },
        { id: 'pesanan-pembelian', label: 'Pesanan Pembelian', icon: 'truck', count: 34 },
        { id: 'pemasok', label: 'Pemasok', icon: 'handshake' },
      ],
    },
    {
      label: 'Inventaris & Rantai Pasok',
      items: [
        { id: 'stok', label: 'Stok Barang', icon: 'boxes', count: 9 },
        { id: 'mutasi', label: 'Mutasi Stok', icon: 'transfer' },
        { id: 'rantai-pasok', label: 'Rantai Pasok', icon: 'link' },
      ],
    },
    {
      label: 'Produksi',
      items: [{ id: 'perintah-kerja', label: 'Perintah Kerja', icon: 'factory', count: 17 }],
    },
    {
      label: 'Proyek',
      items: [
        { id: 'proyek', label: 'Daftar Proyek', icon: 'gantt', count: 5 },
      ],
    },
    {
      label: 'Keuangan',
      items: [
        { id: 'bagan-akun', label: 'Bagan Akun', icon: 'tree' },
        { id: 'piutang', label: 'Piutang Usaha', icon: 'wallet' },
        { id: 'hutang', label: 'Hutang Usaha', icon: 'credit-card' },
        { id: 'kas-bank', label: 'Kas & Bank', icon: 'vault' },
        { id: 'jurnal', label: 'Jurnal Umum', icon: 'ledger' },
        { id: 'anggaran', label: 'Anggaran', icon: 'piechart' },
      ],
    },
    {
      label: 'SDM',
      items: [
        { id: 'karyawan', label: 'Karyawan', icon: 'users' },
        { id: 'kehadiran', label: 'Kehadiran & Cuti', icon: 'calendar' },
        { id: 'penggajian', label: 'Penggajian', icon: 'banknote', count: 12 },
      ],
    },
    {
      label: 'Aset',
      items: [
        { id: 'aset', label: 'Daftar Aset', icon: 'landmark' },
        { id: 'pemeliharaan', label: 'Pemeliharaan', icon: 'wrench', count: 6 },
      ],
    },
    {
      label: 'Dokumen',
      items: [
        { id: 'dokumen', label: 'Repositori', icon: 'folder', count: 156 },
      ],
    },
    {
      label: 'Alur Kerja',
      items: [
        { id: 'alur-kerja', label: 'Desainer Alur Kerja', icon: 'workflow' },
      ],
    },
    {
      label: 'Analitik',
      items: [
        { id: 'analitik', label: 'BI & Laporan', icon: 'bar-chart' },
        { id: 'bsc', label: 'Balanced Scorecard', icon: 'target' },
      ],
    },
    {
      label: 'Sistem',
      items: [
        { id: 'kepatuhan', label: 'Kepatuhan & GRC', icon: 'file-check' },
        { id: 'peran', label: 'Peran & Izin', icon: 'shield' },
        { id: 'jejak-audit', label: 'Jejak Audit', icon: 'scroll' },
        { id: 'pengaturan', label: 'Pengaturan', icon: 'gear' },
        { id: 'sistem-desain', label: 'Sistem Desain', icon: 'palette' },
      ],
    },
  ];

  /* --- Ubin KPI dasbor --------------------------------------------------- */
  const kpis = [
    {
      id: 'pendapatan', label: 'Pendapatan (bulan berjalan)', value: 4_823_400_000,
      format: 'rp-compact', delta: 12.4, dir: 'up', foot: 'Target bulan ini Rp 5,10 M',
      spark: [3.1, 3.4, 3.2, 3.9, 4.1, 3.8, 4.4, 4.2, 4.6, 4.5, 4.7, 4.82],
    },
    {
      id: 'laba-kotor', label: 'Laba kotor', value: 1_687_200_000,
      format: 'rp-compact', delta: 8.2, dir: 'up', foot: 'Margin 35,0% — target 36%',
      spark: [1.1, 1.2, 1.15, 1.32, 1.38, 1.29, 1.48, 1.42, 1.55, 1.51, 1.6, 1.69],
    },
    {
      id: 'arus-kas', label: 'Arus kas operasional', value: 892_500_000,
      format: 'rp-compact', delta: -5.3, dir: 'up', foot: 'DSO 38 hari · DPO 42 hari',
      spark: [1.02, 0.98, 1.05, 0.91, 0.88, 0.95, 1.01, 0.94, 0.87, 0.92, 0.96, 0.89],
    },
    {
      id: 'piutang', label: 'Piutang jatuh tempo', value: 1_942_800_000,
      format: 'rp-compact', delta: 18.6, dir: 'down', foot: '14 faktur lewat 30 hari',
      spark: [1.35, 1.28, 1.41, 1.39, 1.52, 1.48, 1.55, 1.61, 1.58, 1.72, 1.64, 1.94],
    },
  ];

  /* --- Tren pendapatan vs target (12 bulan, miliar rupiah) ---------------- */
  const revenueTrend = {
    labels: ['Sep', 'Okt', 'Nov', 'Des', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu'],
    actual: [3.12, 3.44, 3.21, 3.92, 4.08, 3.77, 4.41, 4.19, 4.63, 4.52, 4.71, 4.82],
    target: [3.30, 3.40, 3.50, 3.60, 3.80, 3.90, 4.10, 4.30, 4.40, 4.60, 4.80, 5.10],
  };

  const revenueByLine = [
    { label: 'Komponen otomotif', value: 1_842_000_000 },
    { label: 'Suku cadang mesin', value: 1_216_500_000 },
    { label: 'Perakitan elektronik', value: 864_300_000 },
    { label: 'Perkakas industri', value: 573_100_000 },
    { label: 'Jasa purna jual', value: 327_500_000 },
  ];

  const inventoryMix = [
    { label: 'Bahan baku', value: 4_712_000_000 },
    { label: 'Barang dalam proses', value: 3_128_000_000 },
    { label: 'Barang jadi', value: 2_845_000_000 },
    { label: 'Suku cadang', value: 1_364_000_000 },
    { label: 'Kemasan', value: 691_000_000 },
  ];

  const arAging = [
    { label: 'Belum jatuh tempo', short: 'Lancar', value: 3_284_000_000, count: 41 },
    { label: '1–30 hari', short: '1–30', value: 1_128_400_000, count: 19 },
    { label: '31–60 hari', short: '31–60', value: 512_900_000, count: 9 },
    { label: '61–90 hari', short: '61–90', value: 214_600_000, count: 4 },
    { label: 'Lebih dari 90 hari', short: '>90', value: 86_900_000, count: 2 },
  ];

  /* --- Antrean persetujuan ------------------------------------------------ */
  const approvals = [
    { id: 'SO-2026-0418', kind: 'Pesanan Penjualan', title: 'PT Sentosa Baja Perkasa', amount: 428_500_000, by: 'Rina Kusuma', ago: '18 menit lalu', tone: 'accent', icon: 'cart', reason: 'Melebihi plafon kredit pelanggan' },
    { id: 'PO-2026-0233', kind: 'Pesanan Pembelian', title: 'CV Logam Jaya Abadi', amount: 186_200_000, by: 'Bagus Hartono', ago: '52 menit lalu', tone: 'info', icon: 'truck', reason: 'Nilai di atas Rp 150 jt' },
    { id: 'PR-2026-0091', kind: 'Permintaan Pembelian', title: 'Suku cadang mesin CNC', amount: 74_900_000, by: 'Dewi Anggraini', ago: '2 jam lalu', tone: 'info', icon: 'truck', reason: 'Pengadaan non-anggaran' },
    { id: 'JV-2026-0774', kind: 'Jurnal Penyesuaian', title: 'Koreksi penyusutan Jul 2026', amount: 42_300_000, by: 'Andi Firmansyah', ago: '3 jam lalu', tone: 'warn', icon: 'ledger', reason: 'Periode akan ditutup' },
    { id: 'SO-2026-0416', kind: 'Pesanan Penjualan', title: 'PT Mitra Teknik Utama', amount: 96_750_000, by: 'Rina Kusuma', ago: '5 jam lalu', tone: 'accent', icon: 'cart', reason: 'Diskon 12% di atas wewenang' },
  ];

  const stockAlerts = [
    { sku: 'BRG-1042', name: 'Pelat baja SPHC 3mm', onHand: 42, min: 250, unit: 'lbr', tone: 'danger', note: 'Habis dalam ±2 hari' },
    { sku: 'BRG-2217', name: 'Bearing 6204-2RS', onHand: 310, min: 500, unit: 'pcs', tone: 'warn', note: 'PO tiba 18 Agu' },
    { sku: 'BRG-0885', name: 'Oli hidrolik ISO VG 46', onHand: 18, min: 60, unit: 'drum', tone: 'danger', note: 'Belum ada PO' },
    { sku: 'BRG-3390', name: 'Kabel NYY 4×10mm', onHand: 640, min: 800, unit: 'm', tone: 'warn', note: 'PO tiba 21 Agu' },
  ];

  const activity = [
    { who: 'Rina Kusuma', what: 'membuat pesanan', ref: 'SO-2026-0421', when: '09:42', tone: 'accent' },
    { who: 'Sistem', what: 'memposting faktur', ref: 'INV-2026-1188', when: '09:31', tone: 'ok' },
    { who: 'Bagus Hartono', what: 'menerima barang', ref: 'GR-2026-0512', when: '08:57', tone: 'ok' },
    { who: 'Dewi Anggraini', what: 'menutup perintah kerja', ref: 'WO-2026-0177', when: '08:24', tone: 'ok' },
    { who: 'Andi Firmansyah', what: 'menolak jurnal', ref: 'JV-2026-0771', when: '07:58', tone: 'warn' },
    { who: 'Sistem', what: 'menjalankan penilaian ulang stok', ref: 'BATCH-0088', when: '06:00', tone: 'info' },
  ];

  const notifications = [
    { title: '5 dokumen menunggu persetujuan Anda', note: 'Nilai total Rp 828,6 jt', when: '18 menit lalu', tone: 'accent', unread: true },
    { title: 'Stok Pelat baja SPHC 3mm kritis', note: 'Sisa 42 lbr dari minimum 250 lbr', when: '1 jam lalu', tone: 'danger', unread: true },
    { title: 'Faktur INV-2026-1102 lewat 47 hari', note: 'PT Bangun Sarana Teknik — Rp 96,4 jt', when: '3 jam lalu', tone: 'warn', unread: true },
    { title: 'Tutup buku Juli 2026 selesai', note: 'Dikunci oleh Andi Firmansyah', when: 'Kemarin', tone: 'ok', unread: false },
  ];

  /* --- AI Copilot: rangkaian pesan demo --------------------------------- */
  const aiBriefing = `Selamat pagi, Osmond. Ringkasan hari ini:

• **Pendapatan** bulan berjalan Rp 4,82 M (+12,4%), namun masih 5,5% di bawah target Rp 5,10 M. Perlu tambahan Rp 278 jt dalam 17 hari kerja tersisa.
• **Piutang jatuh tempo** naik 18,6% — 3 faktur PT Bangun Sarana Teknik (total Rp 137,7 jt) sudah lewat 47–94 hari. Saya sarankan prioritaskan penagihan hari ini.
• **Stok kritis**: Pelat baja SPHC 3mm tersisa 42 lbr (min 250), belum ada PO. Produksi lini 2 akan terganggu dalam 2 hari.
• **Proyek** Jababeka Fase 2 menyerap 87% anggaran pada progres 72% — risiko *overrun* meningkat.
• 5 dokumen menunggu persetujuan Anda senilai total Rp 828,6 jt.`;

  const aiMessages = [
    { role: 'assistant', text: aiBriefing },
    { role: 'user', text: 'Supplier mana yang paling konsisten untuk pelat baja?' },
    { role: 'assistant', text: `Berdasarkan data 12 bulan terakhir, **CV Logam Jaya Abadi** memiliki kinerja terbaik untuk kategori bahan baku logam:

| Metrik | CV Logam Jaya | PT Baja Sentral |
|--------|--------------|-----------------|
| Tepat waktu | 96,2% | 88,7% |
| Waktu tunggu | 8 hari | 14 hari |
| Penolakan QC | 0,3% | 1,8% |
| Harga rata-rata | Rp 486.000/lbr | Rp 478.000/lbr |

CV Logam Jaya 1,7% lebih mahal, tetapi waktu tunggu 43% lebih cepat dan tingkat penolakan jauh lebih rendah. Untuk kebutuhan mendesak stok saat ini, saya **rekomendasikan PO ke CV Logam Jaya** dengan kuantitas minimal 250 lbr.

Ingin saya buatkan draft permintaan pembelian?` },
  ];

  /* --- Pesanan penjualan ------------------------------------------------- */
  const salesOrders = [
    { id: 'SO-2026-0421', date: '2026-08-14', customer: 'PT Sinar Mas Otomotif', pic: 'Rina Kusuma', amount: 312_400_000, status: 'draf', due: '2026-08-28', channel: 'Distributor' },
    { id: 'SO-2026-0420', date: '2026-08-14', customer: 'PT Mitra Teknik Utama', pic: 'Rina Kusuma', amount: 148_900_000, status: 'menunggu', due: '2026-08-30', channel: 'Langsung' },
    { id: 'SO-2026-0419', date: '2026-08-13', customer: 'CV Karya Presisi', pic: 'Hendra Wijaya', amount: 87_650_000, status: 'disetujui', due: '2026-08-27', channel: 'Distributor' },
    { id: 'SO-2026-0418', date: '2026-08-13', customer: 'PT Sentosa Baja Perkasa', pic: 'Rina Kusuma', amount: 428_500_000, status: 'menunggu', due: '2026-09-05', channel: 'Kontrak' },
    { id: 'SO-2026-0417', date: '2026-08-12', customer: 'PT Anugerah Mesin Jaya', pic: 'Hendra Wijaya', amount: 205_300_000, status: 'dikirim', due: '2026-08-26', channel: 'Langsung' },
    { id: 'SO-2026-0416', date: '2026-08-12', customer: 'PT Mitra Teknik Utama', pic: 'Rina Kusuma', amount: 96_750_000, status: 'menunggu', due: '2026-08-25', channel: 'Langsung' },
    { id: 'SO-2026-0415', date: '2026-08-11', customer: 'PT Bangun Sarana Teknik', pic: 'Sari Melati', amount: 63_200_000, status: 'selesai', due: '2026-08-20', channel: 'Distributor' },
    { id: 'SO-2026-0414', date: '2026-08-11', customer: 'PT Global Komponen Indo', pic: 'Hendra Wijaya', amount: 519_800_000, status: 'dikirim', due: '2026-09-02', channel: 'Kontrak' },
    { id: 'SO-2026-0413', date: '2026-08-10', customer: 'CV Sumber Logam', pic: 'Sari Melati', amount: 41_500_000, status: 'batal', due: '2026-08-24', channel: 'Langsung' },
    { id: 'SO-2026-0412', date: '2026-08-10', customer: 'PT Sinar Mas Otomotif', pic: 'Rina Kusuma', amount: 276_900_000, status: 'selesai', due: '2026-08-22', channel: 'Distributor' },
    { id: 'SO-2026-0411', date: '2026-08-09', customer: 'PT Cipta Mandiri Perkasa', pic: 'Sari Melati', amount: 132_450_000, status: 'disetujui', due: '2026-08-23', channel: 'Langsung' },
    { id: 'SO-2026-0410', date: '2026-08-08', customer: 'PT Anugerah Mesin Jaya', pic: 'Hendra Wijaya', amount: 88_300_000, status: 'selesai', due: '2026-08-21', channel: 'Langsung' },
    { id: 'SO-2026-0409', date: '2026-08-08', customer: 'PT Global Komponen Indo', pic: 'Rina Kusuma', amount: 367_100_000, status: 'dikirim', due: '2026-08-29', channel: 'Kontrak' },
    { id: 'SO-2026-0408', date: '2026-08-07', customer: 'CV Karya Presisi', pic: 'Sari Melati', amount: 54_700_000, status: 'selesai', due: '2026-08-19', channel: 'Distributor' },
    { id: 'SO-2026-0407', date: '2026-08-07', customer: 'PT Bangun Sarana Teknik', pic: 'Hendra Wijaya', amount: 194_600_000, status: 'draf', due: '2026-08-31', channel: 'Langsung' },
    { id: 'SO-2026-0406', date: '2026-08-06', customer: 'PT Sentosa Baja Perkasa', pic: 'Rina Kusuma', amount: 611_250_000, status: 'selesai', due: '2026-08-18', channel: 'Kontrak' },
    { id: 'SO-2026-0405', date: '2026-08-06', customer: 'PT Cipta Mandiri Perkasa', pic: 'Sari Melati', amount: 77_900_000, status: 'disetujui', due: '2026-08-20', channel: 'Langsung' },
    { id: 'SO-2026-0404', date: '2026-08-05', customer: 'CV Sumber Logam', pic: 'Hendra Wijaya', amount: 29_850_000, status: 'selesai', due: '2026-08-17', channel: 'Distributor' },
  ];

  const salesOrderLines = {
    'SO-2026-0418': [
      { sku: 'BRG-1042', name: 'Pelat baja SPHC 3mm', qty: 480, unit: 'lbr', price: 512_000, disc: 5 },
      { sku: 'BRG-1108', name: 'Braket dudukan mesin tipe B', qty: 240, unit: 'pcs', price: 385_000, disc: 0 },
      { sku: 'BRG-2217', name: 'Bearing 6204-2RS', qty: 600, unit: 'pcs', price: 96_500, disc: 8 },
      { sku: 'JAS-0031', name: 'Jasa pemasangan di lokasi', qty: 1, unit: 'paket', price: 24_500_000, disc: 0 },
    ],
    'SO-2026-0420': [
      { sku: 'BRG-3390', name: 'Kabel NYY 4×10mm', qty: 2400, unit: 'm', price: 42_800, disc: 0 },
      { sku: 'BRG-0885', name: 'Oli hidrolik ISO VG 46', qty: 24, unit: 'drum', price: 1_850_000, disc: 3 },
    ],
    'SO-2026-0421': [
      { sku: 'BRG-1108', name: 'Braket dudukan mesin tipe B', qty: 540, unit: 'pcs', price: 385_000, disc: 2 },
      { sku: 'BRG-4501', name: 'Baut hex M12×60 galvanis', qty: 8000, unit: 'pcs', price: 4_250, disc: 0 },
      { sku: 'BRG-2217', name: 'Bearing 6204-2RS', qty: 850, unit: 'pcs', price: 96_500, disc: 5 },
    ],
  };

  const defaultLines = [
    { sku: 'BRG-1108', name: 'Braket dudukan mesin tipe B', qty: 120, unit: 'pcs', price: 385_000, disc: 0 },
    { sku: 'BRG-4501', name: 'Baut hex M12×60 galvanis', qty: 3200, unit: 'pcs', price: 4_250, disc: 0 },
  ];

  const orderTimeline = {
    'SO-2026-0418': [
      { title: '<b>Rina Kusuma</b> membuat pesanan', meta: '13 Agu 2026 · 14:22', tone: 'accent' },
      { title: 'Pemeriksaan plafon kredit <b>gagal otomatis</b>', meta: '13 Agu 2026 · 14:22 · Sisa plafon Rp 120,0 jt', tone: 'warn' },
      { title: 'Diteruskan ke <b>Osmond Pratama</b> untuk persetujuan', meta: '13 Agu 2026 · 14:23', tone: 'warn' },
    ],
  };

  const defaultTimeline = [
    { title: '<b>Rina Kusuma</b> membuat pesanan', meta: '12 Agu 2026 · 10:15', tone: 'accent' },
    { title: 'Pemeriksaan plafon kredit <b>lolos</b>', meta: '12 Agu 2026 · 10:15', tone: 'ok' },
    { title: 'Disetujui oleh <b>Osmond Pratama</b>', meta: '12 Agu 2026 · 11:02', tone: 'ok' },
  ];

  /* --- Pelanggan --------------------------------------------------------- */
  const customers = [
    { id: 'CUST-0012', name: 'PT Sentosa Baja Perkasa', segment: 'Kontrak', pic: 'Yusuf Maulana', city: 'Bekasi', limit: 1_500_000_000, used: 1_380_000_000, terms: 'Net 45', status: 'aktif' },
    { id: 'CUST-0004', name: 'PT Sinar Mas Otomotif', segment: 'Distributor', pic: 'Lina Marlina', city: 'Karawang', limit: 2_000_000_000, used: 842_000_000, terms: 'Net 30', status: 'aktif' },
    { id: 'CUST-0021', name: 'PT Global Komponen Indo', segment: 'Kontrak', pic: 'Rudi Setiawan', city: 'Surabaya', limit: 3_000_000_000, used: 1_965_000_000, terms: 'Net 60', status: 'aktif' },
    { id: 'CUST-0009', name: 'PT Mitra Teknik Utama', segment: 'Langsung', pic: 'Agus Salim', city: 'Jakarta Timur', limit: 750_000_000, used: 318_000_000, terms: 'Net 30', status: 'aktif' },
    { id: 'CUST-0033', name: 'PT Bangun Sarana Teknik', segment: 'Distributor', pic: 'Tuti Handayani', city: 'Semarang', limit: 500_000_000, used: 496_400_000, terms: 'Net 30', status: 'ditahan' },
    { id: 'CUST-0017', name: 'PT Anugerah Mesin Jaya', segment: 'Langsung', pic: 'Bambang Sutrisno', city: 'Sidoarjo', limit: 900_000_000, used: 293_600_000, terms: 'Net 45', status: 'aktif' },
    { id: 'CUST-0028', name: 'PT Cipta Mandiri Perkasa', segment: 'Langsung', pic: 'Nurul Hidayah', city: 'Tangerang', limit: 600_000_000, used: 210_350_000, terms: 'Net 30', status: 'aktif' },
    { id: 'CUST-0041', name: 'CV Karya Presisi', segment: 'Distributor', pic: 'Joko Susilo', city: 'Cikarang', limit: 300_000_000, used: 142_350_000, terms: 'Net 14', status: 'aktif' },
    { id: 'CUST-0046', name: 'CV Sumber Logam', segment: 'Langsung', pic: 'Siti Rahayu', city: 'Bandung', limit: 200_000_000, used: 29_850_000, terms: 'Tunai', status: 'nonaktif' },
  ];

  /* --- Faktur ------------------------------------------------------------- */
  const invoices = [
    { id: 'INV-2026-1188', date: '2026-08-14', customer: 'PT Global Komponen Indo', amount: 519_800_000, paid: 0, dueDate: '2026-10-13', status: 'belum-dibayar', overdue: 0 },
    { id: 'INV-2026-1181', date: '2026-08-11', customer: 'PT Sinar Mas Otomotif', amount: 276_900_000, paid: 276_900_000, dueDate: '2026-09-10', status: 'lunas', overdue: 0 },
    { id: 'INV-2026-1176', date: '2026-08-08', customer: 'PT Anugerah Mesin Jaya', amount: 88_300_000, paid: 40_000_000, dueDate: '2026-09-22', status: 'sebagian', overdue: 0 },
    { id: 'INV-2026-1160', date: '2026-08-01', customer: 'CV Karya Presisi', amount: 54_700_000, paid: 0, dueDate: '2026-08-15', status: 'belum-dibayar', overdue: 0 },
    { id: 'INV-2026-1142', date: '2026-07-22', customer: 'PT Sentosa Baja Perkasa', amount: 611_250_000, paid: 300_000_000, dueDate: '2026-09-05', status: 'sebagian', overdue: 0 },
    { id: 'INV-2026-1128', date: '2026-07-14', customer: 'PT Mitra Teknik Utama', amount: 132_450_000, paid: 0, dueDate: '2026-08-13', status: 'jatuh-tempo', overdue: 1 },
    { id: 'INV-2026-1119', date: '2026-07-06', customer: 'PT Cipta Mandiri Perkasa', amount: 77_900_000, paid: 0, dueDate: '2026-08-05', status: 'jatuh-tempo', overdue: 9 },
    { id: 'INV-2026-1102', date: '2026-06-18', customer: 'PT Bangun Sarana Teknik', amount: 96_400_000, paid: 0, dueDate: '2026-06-28', status: 'jatuh-tempo', overdue: 47 },
    { id: 'INV-2026-1094', date: '2026-06-11', customer: 'CV Sumber Logam', amount: 29_850_000, paid: 29_850_000, dueDate: '2026-06-25', status: 'lunas', overdue: 0 },
    { id: 'INV-2026-1077', date: '2026-05-28', customer: 'PT Bangun Sarana Teknik', amount: 41_300_000, paid: 0, dueDate: '2026-05-12', status: 'jatuh-tempo', overdue: 94 },
  ];

  /* --- Pesanan pembelian ------------------------------------------------- */
  const purchaseOrders = [
    { id: 'PO-2026-0233', date: '2026-08-14', supplier: 'CV Logam Jaya Abadi', amount: 186_200_000, eta: '2026-08-22', status: 'menunggu', buyer: 'Bagus Hartono' },
    { id: 'PO-2026-0232', date: '2026-08-13', supplier: 'PT Bearing Nusantara', amount: 94_600_000, eta: '2026-08-18', status: 'dikirim-pemasok', buyer: 'Bagus Hartono' },
    { id: 'PO-2026-0231', date: '2026-08-12', supplier: 'PT Pelumas Andalan', amount: 48_100_000, eta: '2026-08-19', status: 'diterima-sebagian', buyer: 'Dewi Anggraini' },
    { id: 'PO-2026-0230', date: '2026-08-11', supplier: 'PT Kabel Cipta Sarana', amount: 132_800_000, eta: '2026-08-21', status: 'dikirim-pemasok', buyer: 'Bagus Hartono' },
    { id: 'PO-2026-0229', date: '2026-08-08', supplier: 'CV Logam Jaya Abadi', amount: 217_400_000, eta: '2026-08-16', status: 'selesai', buyer: 'Dewi Anggraini' },
    { id: 'PO-2026-0228', date: '2026-08-07', supplier: 'PT Mesin Presisi Tama', amount: 76_950_000, eta: '2026-08-15', status: 'selesai', buyer: 'Bagus Hartono' },
    { id: 'PO-2026-0227', date: '2026-08-05', supplier: 'PT Kemasan Prima', amount: 33_200_000, eta: '2026-08-12', status: 'selesai', buyer: 'Dewi Anggraini' },
    { id: 'PO-2026-0226', date: '2026-08-04', supplier: 'PT Bearing Nusantara', amount: 61_450_000, eta: '2026-08-11', status: 'selesai', buyer: 'Bagus Hartono' },
    { id: 'PO-2026-0225', date: '2026-08-01', supplier: 'PT Baja Sentral Indo', amount: 402_700_000, eta: '2026-08-14', status: 'diterima-sebagian', buyer: 'Dewi Anggraini' },
    { id: 'PO-2026-0224', date: '2026-07-30', supplier: 'PT Pelumas Andalan', amount: 27_600_000, eta: '2026-08-06', status: 'draf', buyer: 'Bagus Hartono' },
  ];

  const suppliers = [
    { id: 'SUP-0007', name: 'CV Logam Jaya Abadi', category: 'Bahan baku logam', city: 'Bekasi', terms: 'Net 30', lead: 8, otd: 96.2, status: 'aktif' },
    { id: 'SUP-0012', name: 'PT Bearing Nusantara', category: 'Komponen mekanis', city: 'Jakarta Utara', terms: 'Net 45', lead: 5, otd: 91.4, status: 'aktif' },
    { id: 'SUP-0018', name: 'PT Baja Sentral Indo', category: 'Bahan baku logam', city: 'Cilegon', terms: 'Net 60', lead: 14, otd: 88.7, status: 'aktif' },
    { id: 'SUP-0023', name: 'PT Kabel Cipta Sarana', category: 'Kelistrikan', city: 'Tangerang', terms: 'Net 30', lead: 7, otd: 94.9, status: 'aktif' },
    { id: 'SUP-0029', name: 'PT Pelumas Andalan', category: 'Bahan penolong', city: 'Surabaya', terms: 'Net 30', lead: 6, otd: 82.3, status: 'pantau' },
    { id: 'SUP-0034', name: 'PT Mesin Presisi Tama', category: 'Perkakas', city: 'Semarang', terms: 'Net 45', lead: 21, otd: 97.5, status: 'aktif' },
    { id: 'SUP-0041', name: 'PT Kemasan Prima', category: 'Kemasan', city: 'Bogor', terms: 'Net 14', lead: 4, otd: 99.1, status: 'aktif' },
  ];

  /* --- Stok --------------------------------------------------------------- */
  const stockItems = [
    { sku: 'BRG-1042', name: 'Pelat baja SPHC 3mm', category: 'Bahan baku', unit: 'lbr', onHand: 42, min: 250, max: 900, cost: 486_000, wh: 'Cikarang' },
    { sku: 'BRG-0885', name: 'Oli hidrolik ISO VG 46', category: 'Bahan penolong', unit: 'drum', onHand: 18, min: 60, max: 180, cost: 1_720_000, wh: 'Cikarang' },
    { sku: 'BRG-2217', name: 'Bearing 6204-2RS', category: 'Suku cadang', unit: 'pcs', onHand: 310, min: 500, max: 2000, cost: 78_400, wh: 'Cikarang' },
    { sku: 'BRG-3390', name: 'Kabel NYY 4×10mm', category: 'Kelistrikan', unit: 'm', onHand: 640, min: 800, max: 4000, cost: 34_600, wh: 'Surabaya' },
    { sku: 'BRG-1108', name: 'Braket dudukan mesin tipe B', category: 'Barang jadi', unit: 'pcs', onHand: 1240, min: 400, max: 2500, cost: 264_000, wh: 'Cikarang' },
    { sku: 'BRG-4501', name: 'Baut hex M12×60 galvanis', category: 'Suku cadang', unit: 'pcs', onHand: 18400, min: 6000, max: 40000, cost: 2_850, wh: 'Cikarang' },
    { sku: 'BRG-5023', name: 'Cat epoksi abu-abu', category: 'Bahan penolong', unit: 'kg', onHand: 386, min: 200, max: 800, cost: 92_500, wh: 'Cikarang' },
    { sku: 'BRG-6110', name: 'Peti kayu ekspor 120×80', category: 'Kemasan', unit: 'pcs', onHand: 214, min: 100, max: 500, cost: 418_000, wh: 'Surabaya' },
    { sku: 'BRG-7204', name: 'Motor induksi 3 fasa 5,5 kW', category: 'Barang jadi', unit: 'unit', onHand: 36, min: 20, max: 90, cost: 8_640_000, wh: 'Cikarang' },
    { sku: 'BRG-7811', name: 'Selang hidrolik R2 1/2"', category: 'Suku cadang', unit: 'm', onHand: 0, min: 150, max: 600, cost: 118_000, wh: 'Surabaya' },
    { sku: 'BRG-8302', name: 'Rantai transmisi 08B-1', category: 'Suku cadang', unit: 'm', onHand: 512, min: 200, max: 1200, cost: 96_700, wh: 'Cikarang' },
    { sku: 'BRG-9014', name: 'Panel kendali IP65', category: 'Barang jadi', unit: 'unit', onHand: 74, min: 30, max: 150, cost: 5_240_000, wh: 'Cikarang' },
  ];

  const stockMoves = [
    { id: 'MOV-2026-3312', date: '2026-08-14', sku: 'BRG-1108', name: 'Braket dudukan mesin tipe B', type: 'Keluar — Pengiriman', qty: -240, ref: 'DO-2026-0908', wh: 'Cikarang' },
    { id: 'MOV-2026-3311', date: '2026-08-14', sku: 'BRG-4501', name: 'Baut hex M12×60 galvanis', type: 'Masuk — Penerimaan', qty: 8000, ref: 'GR-2026-0512', wh: 'Cikarang' },
    { id: 'MOV-2026-3308', date: '2026-08-13', sku: 'BRG-2217', name: 'Bearing 6204-2RS', type: 'Keluar — Produksi', qty: -420, ref: 'WO-2026-0181', wh: 'Cikarang' },
    { id: 'MOV-2026-3305', date: '2026-08-13', sku: 'BRG-5023', name: 'Cat epoksi abu-abu', type: 'Penyesuaian — Opname', qty: -12, ref: 'ADJ-2026-0044', wh: 'Cikarang' },
    { id: 'MOV-2026-3301', date: '2026-08-12', sku: 'BRG-6110', name: 'Peti kayu ekspor 120×80', type: 'Transfer — Antar gudang', qty: -60, ref: 'TRF-2026-0121', wh: 'Cikarang' },
    { id: 'MOV-2026-3300', date: '2026-08-12', sku: 'BRG-6110', name: 'Peti kayu ekspor 120×80', type: 'Transfer — Antar gudang', qty: 60, ref: 'TRF-2026-0121', wh: 'Surabaya' },
    { id: 'MOV-2026-3294', date: '2026-08-11', sku: 'BRG-1042', name: 'Pelat baja SPHC 3mm', type: 'Keluar — Produksi', qty: -180, ref: 'WO-2026-0179', wh: 'Cikarang' },
    { id: 'MOV-2026-3288', date: '2026-08-11', sku: 'BRG-9014', name: 'Panel kendali IP65', type: 'Masuk — Hasil produksi', qty: 24, ref: 'WO-2026-0177', wh: 'Cikarang' },
    { id: 'MOV-2026-3282', date: '2026-08-10', sku: 'BRG-0885', name: 'Oli hidrolik ISO VG 46', type: 'Keluar — Pemeliharaan', qty: -6, ref: 'MNT-2026-0203', wh: 'Cikarang' },
    { id: 'MOV-2026-3277', date: '2026-08-09', sku: 'BRG-8302', name: 'Rantai transmisi 08B-1', type: 'Masuk — Penerimaan', qty: 300, ref: 'GR-2026-0508', wh: 'Cikarang' },
  ];

  /* --- Perintah kerja (papan) --------------------------------------------- */
  const workOrderColumns = [
    { id: 'antre', label: 'Antre' },
    { id: 'berjalan', label: 'Berjalan' },
    { id: 'qc', label: 'Pemeriksaan mutu' },
    { id: 'selesai', label: 'Selesai' },
  ];

  const workOrders = [
    { id: 'WO-2026-0186', product: 'Braket dudukan tipe B', qty: 800, unit: 'pcs', line: 'Lini 2 — Pres', due: '19 Agu', progress: 0, col: 'antre', pic: 'Dedi Kurnia' },
    { id: 'WO-2026-0185', product: 'Panel kendali IP65', qty: 40, unit: 'unit', line: 'Lini 4 — Rakit', due: '21 Agu', progress: 0, col: 'antre', pic: 'Yuni Astuti' },
    { id: 'WO-2026-0184', product: 'Motor induksi 5,5 kW', qty: 25, unit: 'unit', line: 'Lini 4 — Rakit', due: '24 Agu', progress: 0, col: 'antre', pic: 'Yuni Astuti' },
    { id: 'WO-2026-0183', product: 'Braket dudukan tipe A', qty: 1200, unit: 'pcs', line: 'Lini 2 — Pres', due: '17 Agu', progress: 64, col: 'berjalan', pic: 'Dedi Kurnia', flag: 'Bahan baku menipis' },
    { id: 'WO-2026-0181', product: 'Rakitan poros transmisi', qty: 420, unit: 'pcs', line: 'Lini 3 — Bubut', due: '16 Agu', progress: 88, col: 'berjalan', pic: 'Slamet Riyadi' },
    { id: 'WO-2026-0180', product: 'Panel kendali IP65', qty: 30, unit: 'unit', line: 'Lini 4 — Rakit', due: '15 Agu', progress: 41, col: 'berjalan', pic: 'Yuni Astuti' },
    { id: 'WO-2026-0179', product: 'Pelat potong SPHC', qty: 180, unit: 'lbr', line: 'Lini 1 — Potong', due: '15 Agu', progress: 100, col: 'qc', pic: 'Slamet Riyadi' },
    { id: 'WO-2026-0178', product: 'Braket dudukan tipe B', qty: 640, unit: 'pcs', line: 'Lini 2 — Pres', due: '14 Agu', progress: 100, col: 'qc', pic: 'Dedi Kurnia', flag: '3 unit ditolak QC' },
    { id: 'WO-2026-0177', product: 'Panel kendali IP65', qty: 24, unit: 'unit', line: 'Lini 4 — Rakit', due: '13 Agu', progress: 100, col: 'selesai', pic: 'Yuni Astuti' },
    { id: 'WO-2026-0176', product: 'Rakitan poros transmisi', qty: 360, unit: 'pcs', line: 'Lini 3 — Bubut', due: '12 Agu', progress: 100, col: 'selesai', pic: 'Slamet Riyadi' },
    { id: 'WO-2026-0175', product: 'Pelat potong SPHC', qty: 240, unit: 'lbr', line: 'Lini 1 — Potong', due: '11 Agu', progress: 100, col: 'selesai', pic: 'Slamet Riyadi' },
  ];

  /* --- Jurnal umum ------------------------------------------------------- */
  const journals = [
    { id: 'JV-2026-0778', date: '2026-08-14', desc: 'Pengakuan pendapatan penjualan Agu', account: '4-1000 Pendapatan Penjualan', debit: 0, credit: 519_800_000, status: 'diposting', by: 'Sistem' },
    { id: 'JV-2026-0777', date: '2026-08-14', desc: 'Harga pokok penjualan Agu', account: '5-1000 Harga Pokok Penjualan', debit: 341_600_000, credit: 0, status: 'diposting', by: 'Sistem' },
    { id: 'JV-2026-0776', date: '2026-08-13', desc: 'Penerimaan barang PO-2026-0229', account: '1-1400 Persediaan Bahan Baku', debit: 217_400_000, credit: 0, status: 'diposting', by: 'Sistem' },
    { id: 'JV-2026-0775', date: '2026-08-13', desc: 'Beban gaji produksi minggu 2', account: '5-2100 Beban Tenaga Kerja Langsung', debit: 184_200_000, credit: 0, status: 'diposting', by: 'Andi Firmansyah' },
    { id: 'JV-2026-0774', date: '2026-08-12', desc: 'Koreksi penyusutan Jul 2026', account: '5-3200 Beban Penyusutan', debit: 42_300_000, credit: 0, status: 'menunggu', by: 'Andi Firmansyah' },
    { id: 'JV-2026-0773', date: '2026-08-12', desc: 'Pembayaran utang PT Bearing Nusantara', account: '2-1100 Utang Usaha', debit: 61_450_000, credit: 0, status: 'diposting', by: 'Sari Melati' },
    { id: 'JV-2026-0772', date: '2026-08-11', desc: 'Penyesuaian selisih opname stok', account: '5-1900 Selisih Persediaan', debit: 1_110_000, credit: 0, status: 'diposting', by: 'Andi Firmansyah' },
    { id: 'JV-2026-0771', date: '2026-08-10', desc: 'Reklasifikasi biaya angkut', account: '5-2400 Beban Angkut', debit: 8_640_000, credit: 0, status: 'ditolak', by: 'Sari Melati' },
    { id: 'JV-2026-0770', date: '2026-08-08', desc: 'Penerimaan pelanggan PT Sinar Mas', account: '1-1200 Piutang Usaha', debit: 0, credit: 276_900_000, status: 'diposting', by: 'Sistem' },
    { id: 'JV-2026-0769', date: '2026-08-07', desc: 'Beban listrik pabrik Jul 2026', account: '5-3100 Beban Utilitas', debit: 96_400_000, credit: 0, status: 'diposting', by: 'Andi Firmansyah' },
  ];

  /* --- Karyawan ---------------------------------------------------------- */
  const employees = [
    { id: 'EMP-0102', name: 'Rina Kusuma', dept: 'Penjualan', title: 'Account Executive', join: '2021-03-15', location: 'Jakarta', status: 'tetap' },
    { id: 'EMP-0118', name: 'Hendra Wijaya', dept: 'Penjualan', title: 'Account Executive', join: '2022-07-01', location: 'Surabaya', status: 'tetap' },
    { id: 'EMP-0087', name: 'Bagus Hartono', dept: 'Pengadaan', title: 'Buyer Senior', join: '2019-11-04', location: 'Cikarang', status: 'tetap' },
    { id: 'EMP-0131', name: 'Dewi Anggraini', dept: 'Pengadaan', title: 'Buyer', join: '2023-02-20', location: 'Cikarang', status: 'tetap' },
    { id: 'EMP-0064', name: 'Andi Firmansyah', dept: 'Keuangan', title: 'Akuntan Senior', join: '2018-05-08', location: 'Jakarta', status: 'tetap' },
    { id: 'EMP-0145', name: 'Sari Melati', dept: 'Keuangan', title: 'Staf Akuntansi', join: '2024-01-15', location: 'Jakarta', status: 'kontrak' },
    { id: 'EMP-0093', name: 'Slamet Riyadi', dept: 'Produksi', title: 'Supervisor Lini', join: '2017-08-21', location: 'Cikarang', status: 'tetap' },
    { id: 'EMP-0110', name: 'Dedi Kurnia', dept: 'Produksi', title: 'Supervisor Lini', join: '2021-06-14', location: 'Cikarang', status: 'tetap' },
    { id: 'EMP-0152', name: 'Yuni Astuti', dept: 'Produksi', title: 'Supervisor Lini', join: '2024-09-02', location: 'Cikarang', status: 'kontrak' },
    { id: 'EMP-0071', name: 'Osmond Pratama', dept: 'Operasional', title: 'Manajer Operasional', join: '2018-01-22', location: 'Jakarta', status: 'tetap' },
    { id: 'EMP-0138', name: 'Fitri Ramadhani', dept: 'Gudang', title: 'Kepala Gudang', join: '2023-04-10', location: 'Surabaya', status: 'tetap' },
    { id: 'EMP-0159', name: 'Reza Alfarizi', dept: 'Gudang', title: 'Staf Gudang', join: '2025-02-03', location: 'Cikarang', status: 'magang' },
  ];

  /* --- Peran & izin ------------------------------------------------------ */
  const roles = [
    { id: 'admin', label: 'Admin Sistem', users: 2 },
    { id: 'manajer', label: 'Manajer Operasional', users: 4 },
    { id: 'penjualan', label: 'Staf Penjualan', users: 11 },
    { id: 'gudang', label: 'Staf Gudang', users: 8 },
    { id: 'keuangan', label: 'Staf Keuangan', users: 6 },
  ];

  const permissions = [
    {
      group: 'Penjualan',
      rows: [
        { label: 'Pesanan penjualan', by: { admin: 'full', manajer: 'full', penjualan: 'full', gudang: 'read', keuangan: 'read' } },
        { label: 'Faktur penjualan', by: { admin: 'full', manajer: 'full', penjualan: 'read', gudang: 'none', keuangan: 'full' } },
        { label: 'Plafon kredit pelanggan', by: { admin: 'full', manajer: 'full', penjualan: 'read', gudang: 'none', keuangan: 'full' } },
      ],
    },
    {
      group: 'Inventaris',
      rows: [
        { label: 'Kartu stok', by: { admin: 'full', manajer: 'read', penjualan: 'read', gudang: 'full', keuangan: 'read' } },
        { label: 'Penyesuaian stok', by: { admin: 'full', manajer: 'full', penjualan: 'none', gudang: 'full', keuangan: 'read' } },
        { label: 'Transfer antar gudang', by: { admin: 'full', manajer: 'full', penjualan: 'none', gudang: 'full', keuangan: 'none' } },
      ],
    },
    {
      group: 'Keuangan',
      rows: [
        { label: 'Jurnal umum', by: { admin: 'full', manajer: 'read', penjualan: 'none', gudang: 'none', keuangan: 'full' } },
        { label: 'Tutup buku periode', by: { admin: 'full', manajer: 'read', penjualan: 'none', gudang: 'none', keuangan: 'full' } },
        { label: 'Laporan keuangan', by: { admin: 'full', manajer: 'read', penjualan: 'none', gudang: 'none', keuangan: 'full' } },
      ],
    },
    {
      group: 'Sistem',
      rows: [
        { label: 'Pengguna & peran', by: { admin: 'full', manajer: 'read', penjualan: 'none', gudang: 'none', keuangan: 'none' } },
        { label: 'Jejak audit', by: { admin: 'full', manajer: 'read', penjualan: 'none', gudang: 'none', keuangan: 'read' } },
      ],
    },
  ];

  /* ====================================================================== */
  /* Modul baru dari blueprint                                               */
  /* ====================================================================== */

  /* --- CRM: Lead & Peluang ----------------------------------------------- */
  const crmStages = [
    { id: 'prospek', label: 'Prospek' },
    { id: 'kualifikasi', label: 'Kualifikasi' },
    { id: 'penawaran', label: 'Penawaran' },
    { id: 'negosiasi', label: 'Negosiasi' },
    { id: 'menang', label: 'Menang' },
    { id: 'kalah', label: 'Kalah' },
  ];

  const leads = [
    { id: 'OPP-2026-0041', name: 'Kontrak tahunan komponen hidrolik', company: 'PT Astra Daihatsu Motor', value: 2_800_000_000, stage: 'negosiasi', prob: 75, source: 'Tender', assignee: 'Rina Kusuma', lastActivity: '2026-08-14', nextAction: 'Presentasi harga revisi' },
    { id: 'OPP-2026-0039', name: 'Retrofit lini perakitan Karawang', company: 'PT Toyota Motor Mfg', value: 1_650_000_000, stage: 'penawaran', prob: 50, source: 'Referensi', assignee: 'Hendra Wijaya', lastActivity: '2026-08-13', nextAction: 'Kirim revisi quotation' },
    { id: 'OPP-2026-0037', name: 'Spare part mesin stamping', company: 'PT Suzuki Indomobil Motor', value: 420_000_000, stage: 'kualifikasi', prob: 30, source: 'Website', assignee: 'Rina Kusuma', lastActivity: '2026-08-12', nextAction: 'Site visit 18 Agu' },
    { id: 'OPP-2026-0035', name: 'Panel kendali gudang otomatis', company: 'PT Unilever Indonesia', value: 890_000_000, stage: 'penawaran', prob: 60, source: 'Langsung', assignee: 'Hendra Wijaya', lastActivity: '2026-08-11', nextAction: 'Menunggu keputusan klien' },
    { id: 'OPP-2026-0033', name: 'Komponen braket motor listrik', company: 'PT Hyundai Motor Mfg', value: 3_200_000_000, stage: 'prospek', prob: 15, source: 'Pameran', assignee: 'Rina Kusuma', lastActivity: '2026-08-10', nextAction: 'Kirim company profile' },
    { id: 'OPP-2026-0031', name: 'Jasa machining presisi batch', company: 'CV Teknik Mandiri', value: 185_000_000, stage: 'menang', prob: 100, source: 'Langsung', assignee: 'Hendra Wijaya', lastActivity: '2026-08-08', nextAction: 'Proses SO' },
    { id: 'OPP-2026-0029', name: 'Supply rantai conveyor', company: 'PT Indofood CBP Sukses', value: 540_000_000, stage: 'negosiasi', prob: 65, source: 'Tender', assignee: 'Rina Kusuma', lastActivity: '2026-08-07', nextAction: 'Negosiasi termin bayar' },
    { id: 'OPP-2026-0027', name: 'Overhaul mesin CNC', company: 'PT Komatsu Indonesia', value: 720_000_000, stage: 'kalah', prob: 0, source: 'Tender', assignee: 'Hendra Wijaya', lastActivity: '2026-08-05', nextAction: 'Evaluasi mengapa kalah' },
  ];

  /* --- Penawaran (Quotation) --------------------------------------------- */
  const quotations = [
    { id: 'QT-2026-0088', date: '2026-08-14', customer: 'PT Astra Daihatsu Motor', amount: 2_800_000_000, validity: '2026-09-14', status: 'draf', pic: 'Rina Kusuma', opp: 'OPP-2026-0041' },
    { id: 'QT-2026-0087', date: '2026-08-12', customer: 'PT Toyota Motor Mfg', amount: 1_650_000_000, validity: '2026-09-12', status: 'terkirim', pic: 'Hendra Wijaya', opp: 'OPP-2026-0039' },
    { id: 'QT-2026-0086', date: '2026-08-11', customer: 'PT Unilever Indonesia', amount: 890_000_000, validity: '2026-09-11', status: 'terkirim', pic: 'Hendra Wijaya', opp: 'OPP-2026-0035' },
    { id: 'QT-2026-0085', date: '2026-08-08', customer: 'CV Teknik Mandiri', amount: 185_000_000, validity: '2026-09-08', status: 'diterima', pic: 'Hendra Wijaya', opp: 'OPP-2026-0031' },
    { id: 'QT-2026-0084', date: '2026-08-07', customer: 'PT Indofood CBP Sukses', amount: 540_000_000, validity: '2026-09-07', status: 'terkirim', pic: 'Rina Kusuma', opp: 'OPP-2026-0029' },
    { id: 'QT-2026-0083', date: '2026-08-05', customer: 'PT Komatsu Indonesia', amount: 720_000_000, validity: '2026-09-05', status: 'ditolak', pic: 'Hendra Wijaya', opp: 'OPP-2026-0027' },
  ];

  /* --- Permintaan Pembelian ---------------------------------------------- */
  const purchaseRequests = [
    { id: 'PR-2026-0093', date: '2026-08-14', requestor: 'Slamet Riyadi', dept: 'Produksi', desc: 'Pelat baja SPHC 3mm — stok kritis', amount: 121_500_000, status: 'menunggu', priority: 'tinggi' },
    { id: 'PR-2026-0092', date: '2026-08-13', requestor: 'Yuni Astuti', dept: 'Produksi', desc: 'Komponen elektronik PCB batch #42', amount: 38_400_000, status: 'disetujui', priority: 'sedang' },
    { id: 'PR-2026-0091', date: '2026-08-12', requestor: 'Dewi Anggraini', dept: 'Pengadaan', desc: 'Suku cadang mesin CNC untuk preventive maintenance', amount: 74_900_000, status: 'menunggu', priority: 'tinggi' },
    { id: 'PR-2026-0090', date: '2026-08-11', requestor: 'Fitri Ramadhani', dept: 'Gudang', desc: 'Perlengkapan rak baru zona B3', amount: 26_800_000, status: 'disetujui', priority: 'rendah' },
    { id: 'PR-2026-0089', date: '2026-08-10', requestor: 'Dedi Kurnia', dept: 'Produksi', desc: 'Oli mesin dan pelumas lini 2', amount: 15_200_000, status: 'selesai', priority: 'sedang' },
    { id: 'PR-2026-0088', date: '2026-08-08', requestor: 'Reza Alfarizi', dept: 'Gudang', desc: 'Peti kayu ekspor tambahan Q3', amount: 52_250_000, status: 'ditolak', priority: 'rendah' },
  ];

  /* --- Proyek ------------------------------------------------------------ */
  const projects = [
    { id: 'PRJ-2026-005', name: 'Jababeka Industrial Park Fase 2', customer: 'PT Jababeka Tbk', pm: 'Osmond Pratama', budget: 4_200_000_000, actual: 3_654_000_000, startDate: '2026-03-01', endDate: '2026-11-30', status: 'berjalan', health: 'kuning', progress: 72 },
    { id: 'PRJ-2026-004', name: 'Retrofit Lini Perakitan ADM', customer: 'PT Astra Daihatsu Motor', pm: 'Slamet Riyadi', budget: 1_850_000_000, actual: 824_000_000, startDate: '2026-06-15', endDate: '2026-12-31', status: 'berjalan', health: 'hijau', progress: 45 },
    { id: 'PRJ-2026-003', name: 'Automation Panel Unilever', customer: 'PT Unilever Indonesia', pm: 'Yuni Astuti', budget: 890_000_000, actual: 0, startDate: '2026-09-01', endDate: '2027-02-28', status: 'perencanaan', health: 'hijau', progress: 0 },
    { id: 'PRJ-2026-002', name: 'Conveyor System Indofood', customer: 'PT Indofood CBP Sukses', pm: 'Dedi Kurnia', budget: 540_000_000, actual: 162_000_000, startDate: '2026-07-01', endDate: '2026-10-31', status: 'berjalan', health: 'hijau', progress: 30 },
    { id: 'PRJ-2026-001', name: 'Overhaul CNC Cikarang', customer: 'Internal', pm: 'Slamet Riyadi', budget: 320_000_000, actual: 310_000_000, startDate: '2026-01-15', endDate: '2026-06-30', status: 'selesai', health: 'hijau', progress: 100 },
  ];

  const projectTasks = {
    'PRJ-2026-005': [
      { id: 'T-001', name: 'Survey & design', start: '2026-03-01', end: '2026-04-15', progress: 100, assignee: 'Osmond Pratama' },
      { id: 'T-002', name: 'Procurement material', start: '2026-04-01', end: '2026-06-30', progress: 100, assignee: 'Bagus Hartono' },
      { id: 'T-003', name: 'Fabrikasi komponen', start: '2026-05-01', end: '2026-08-31', progress: 78, assignee: 'Slamet Riyadi' },
      { id: 'T-004', name: 'Instalasi di lokasi', start: '2026-07-15', end: '2026-10-31', progress: 35, assignee: 'Dedi Kurnia' },
      { id: 'T-005', name: 'Commissioning & testing', start: '2026-10-01', end: '2026-11-30', progress: 0, assignee: 'Yuni Astuti' },
    ],
  };

  /* --- Bagan Akun (Chart of Accounts) ----------------------------------- */
  const chartOfAccounts = [
    /* Aset */
    { code: '1-0000', name: 'Aset', type: 'Header', category: 'Aset', level: 0, balance: 0, parent: null, status: 'aktif' },
    { code: '1-1000', name: 'Aset Lancar', type: 'Header', category: 'Aset', level: 1, balance: 0, parent: '1-0000', status: 'aktif' },
    { code: '1-1100', name: 'Kas & Setara Kas', type: 'Detail', category: 'Aset', level: 2, balance: 4_841_400_000, parent: '1-1000', status: 'aktif' },
    { code: '1-1200', name: 'Piutang Usaha', type: 'Detail', category: 'Aset', level: 2, balance: 1_627_400_000, parent: '1-1000', status: 'aktif' },
    { code: '1-1300', name: 'Piutang Lain-lain', type: 'Detail', category: 'Aset', level: 2, balance: 84_600_000, parent: '1-1000', status: 'aktif' },
    { code: '1-1400', name: 'Persediaan Bahan Baku', type: 'Detail', category: 'Aset', level: 2, balance: 2_184_200_000, parent: '1-1000', status: 'aktif' },
    { code: '1-1500', name: 'Persediaan Barang Jadi', type: 'Detail', category: 'Aset', level: 2, balance: 1_342_000_000, parent: '1-1000', status: 'aktif' },
    { code: '1-1600', name: 'Biaya Dibayar di Muka', type: 'Detail', category: 'Aset', level: 2, balance: 196_800_000, parent: '1-1000', status: 'aktif' },
    { code: '1-1700', name: 'PPN Masukan', type: 'Detail', category: 'Aset', level: 2, balance: 312_400_000, parent: '1-1000', status: 'aktif' },
    { code: '1-2000', name: 'Aset Tetap', type: 'Header', category: 'Aset', level: 1, balance: 0, parent: '1-0000', status: 'aktif' },
    { code: '1-2100', name: 'Tanah', type: 'Detail', category: 'Aset', level: 2, balance: 3_200_000_000, parent: '1-2000', status: 'aktif' },
    { code: '1-2200', name: 'Bangunan', type: 'Detail', category: 'Aset', level: 2, balance: 4_800_000_000, parent: '1-2000', status: 'aktif' },
    { code: '1-2300', name: 'Mesin & Peralatan', type: 'Detail', category: 'Aset', level: 2, balance: 6_420_000_000, parent: '1-2000', status: 'aktif' },
    { code: '1-2400', name: 'Kendaraan', type: 'Detail', category: 'Aset', level: 2, balance: 1_640_000_000, parent: '1-2000', status: 'aktif' },
    { code: '1-2500', name: 'Peralatan Kantor', type: 'Detail', category: 'Aset', level: 2, balance: 486_000_000, parent: '1-2000', status: 'aktif' },
    { code: '1-2900', name: 'Akumulasi Penyusutan', type: 'Detail', category: 'Aset', level: 2, balance: -4_218_000_000, parent: '1-2000', status: 'aktif' },
    /* Liabilitas */
    { code: '2-0000', name: 'Liabilitas', type: 'Header', category: 'Liabilitas', level: 0, balance: 0, parent: null, status: 'aktif' },
    { code: '2-1000', name: 'Liabilitas Jangka Pendek', type: 'Header', category: 'Liabilitas', level: 1, balance: 0, parent: '2-0000', status: 'aktif' },
    { code: '2-1100', name: 'Utang Usaha', type: 'Detail', category: 'Liabilitas', level: 2, balance: 1_842_600_000, parent: '2-1000', status: 'aktif' },
    { code: '2-1200', name: 'Utang Gaji', type: 'Detail', category: 'Liabilitas', level: 2, balance: 486_200_000, parent: '2-1000', status: 'aktif' },
    { code: '2-1300', name: 'Utang Pajak', type: 'Detail', category: 'Liabilitas', level: 2, balance: 324_800_000, parent: '2-1000', status: 'aktif' },
    { code: '2-1400', name: 'PPN Keluaran', type: 'Detail', category: 'Liabilitas', level: 2, balance: 418_600_000, parent: '2-1000', status: 'aktif' },
    { code: '2-1500', name: 'Pendapatan Diterima di Muka', type: 'Detail', category: 'Liabilitas', level: 2, balance: 264_000_000, parent: '2-1000', status: 'aktif' },
    { code: '2-2000', name: 'Liabilitas Jangka Panjang', type: 'Header', category: 'Liabilitas', level: 1, balance: 0, parent: '2-0000', status: 'aktif' },
    { code: '2-2100', name: 'Utang Bank', type: 'Detail', category: 'Liabilitas', level: 2, balance: 4_600_000_000, parent: '2-2000', status: 'aktif' },
    { code: '2-2200', name: 'Utang Sewa Guna', type: 'Detail', category: 'Liabilitas', level: 2, balance: 840_000_000, parent: '2-2000', status: 'aktif' },
    /* Ekuitas */
    { code: '3-0000', name: 'Ekuitas', type: 'Header', category: 'Ekuitas', level: 0, balance: 0, parent: null, status: 'aktif' },
    { code: '3-1000', name: 'Modal Disetor', type: 'Detail', category: 'Ekuitas', level: 1, balance: 10_000_000_000, parent: '3-0000', status: 'aktif' },
    { code: '3-2000', name: 'Laba Ditahan', type: 'Detail', category: 'Ekuitas', level: 1, balance: 3_842_600_000, parent: '3-0000', status: 'aktif' },
    { code: '3-3000', name: 'Laba Periode Berjalan', type: 'Detail', category: 'Ekuitas', level: 1, balance: 1_687_200_000, parent: '3-0000', status: 'aktif' },
    /* Pendapatan */
    { code: '4-0000', name: 'Pendapatan', type: 'Header', category: 'Pendapatan', level: 0, balance: 0, parent: null, status: 'aktif' },
    { code: '4-1000', name: 'Pendapatan Penjualan', type: 'Detail', category: 'Pendapatan', level: 1, balance: 4_823_400_000, parent: '4-0000', status: 'aktif' },
    { code: '4-2000', name: 'Pendapatan Jasa', type: 'Detail', category: 'Pendapatan', level: 1, balance: 682_000_000, parent: '4-0000', status: 'aktif' },
    { code: '4-3000', name: 'Pendapatan Lain-lain', type: 'Detail', category: 'Pendapatan', level: 1, balance: 124_600_000, parent: '4-0000', status: 'aktif' },
    { code: '4-9000', name: 'Retur & Potongan Penjualan', type: 'Detail', category: 'Pendapatan', level: 1, balance: -186_400_000, parent: '4-0000', status: 'aktif' },
    /* Beban */
    { code: '5-0000', name: 'Beban', type: 'Header', category: 'Beban', level: 0, balance: 0, parent: null, status: 'aktif' },
    { code: '5-1000', name: 'Harga Pokok Penjualan', type: 'Detail', category: 'Beban', level: 1, balance: 3_136_200_000, parent: '5-0000', status: 'aktif' },
    { code: '5-1900', name: 'Selisih Persediaan', type: 'Detail', category: 'Beban', level: 1, balance: 14_200_000, parent: '5-0000', status: 'aktif' },
    { code: '5-2000', name: 'Beban Operasional', type: 'Header', category: 'Beban', level: 1, balance: 0, parent: '5-0000', status: 'aktif' },
    { code: '5-2100', name: 'Beban Tenaga Kerja Langsung', type: 'Detail', category: 'Beban', level: 2, balance: 1_246_800_000, parent: '5-2000', status: 'aktif' },
    { code: '5-2200', name: 'Beban Gaji & Tunjangan', type: 'Detail', category: 'Beban', level: 2, balance: 2_184_000_000, parent: '5-2000', status: 'aktif' },
    { code: '5-2300', name: 'Beban Pemasaran', type: 'Detail', category: 'Beban', level: 2, balance: 412_600_000, parent: '5-2000', status: 'aktif' },
    { code: '5-2400', name: 'Beban Angkut', type: 'Detail', category: 'Beban', level: 2, balance: 186_400_000, parent: '5-2000', status: 'aktif' },
    { code: '5-3000', name: 'Beban Umum & Administrasi', type: 'Header', category: 'Beban', level: 1, balance: 0, parent: '5-0000', status: 'aktif' },
    { code: '5-3100', name: 'Beban Utilitas', type: 'Detail', category: 'Beban', level: 2, balance: 624_800_000, parent: '5-3000', status: 'aktif' },
    { code: '5-3200', name: 'Beban Penyusutan', type: 'Detail', category: 'Beban', level: 2, balance: 842_400_000, parent: '5-3000', status: 'aktif' },
    { code: '5-3300', name: 'Beban Sewa', type: 'Detail', category: 'Beban', level: 2, balance: 264_000_000, parent: '5-3000', status: 'aktif' },
    { code: '5-3400', name: 'Beban Pemeliharaan', type: 'Detail', category: 'Beban', level: 2, balance: 312_600_000, parent: '5-3000', status: 'aktif' },
    { code: '5-3500', name: 'Beban Asuransi', type: 'Detail', category: 'Beban', level: 2, balance: 148_200_000, parent: '5-3000', status: 'aktif' },
    { code: '5-3600', name: 'Beban Perjalanan Dinas', type: 'Detail', category: 'Beban', level: 2, balance: 96_400_000, parent: '5-3000', status: 'aktif' },
    { code: '5-3700', name: 'Beban Perlengkapan Kantor', type: 'Detail', category: 'Beban', level: 2, balance: 42_600_000, parent: '5-3000', status: 'aktif' },
    { code: '5-4000', name: 'Beban Lain-lain', type: 'Detail', category: 'Beban', level: 1, balance: 36_800_000, parent: '5-0000', status: 'aktif' },
  ];

  /* --- Anggaran per Akun (Management Budget) ------------------------------ */
  const accountBudgets = [
    { accountCode: '5-1000', accountName: 'Harga Pokok Penjualan', period: '2026', budget: 3_400_000_000, actual: 3_136_200_000, forecast: 3_380_000_000, variance: -20_000_000, notes: 'Efisiensi bahan baku' },
    { accountCode: '5-2100', accountName: 'Beban Tenaga Kerja Langsung', period: '2026', budget: 1_320_000_000, actual: 1_246_800_000, forecast: 1_340_000_000, variance: 20_000_000, notes: 'Lembur proyek besar' },
    { accountCode: '5-2200', accountName: 'Beban Gaji & Tunjangan', period: '2026', budget: 2_280_000_000, actual: 2_184_000_000, forecast: 2_260_000_000, variance: -20_000_000, notes: 'Sesuai target' },
    { accountCode: '5-2300', accountName: 'Beban Pemasaran', period: '2026', budget: 480_000_000, actual: 412_600_000, forecast: 520_000_000, variance: 40_000_000, notes: 'Kampanye Q4 dipercepat' },
    { accountCode: '5-2400', accountName: 'Beban Angkut', period: '2026', budget: 200_000_000, actual: 186_400_000, forecast: 210_000_000, variance: 10_000_000, notes: 'Kenaikan tarif ekspedisi' },
    { accountCode: '5-3100', accountName: 'Beban Utilitas', period: '2026', budget: 660_000_000, actual: 624_800_000, forecast: 680_000_000, variance: 20_000_000, notes: 'Tarif PLN naik' },
    { accountCode: '5-3200', accountName: 'Beban Penyusutan', period: '2026', budget: 860_000_000, actual: 842_400_000, forecast: 855_000_000, variance: -5_000_000, notes: 'Sesuai rencana' },
    { accountCode: '5-3300', accountName: 'Beban Sewa', period: '2026', budget: 264_000_000, actual: 264_000_000, forecast: 264_000_000, variance: 0, notes: 'Kontrak tetap' },
    { accountCode: '5-3400', accountName: 'Beban Pemeliharaan', period: '2026', budget: 300_000_000, actual: 312_600_000, forecast: 340_000_000, variance: 40_000_000, notes: 'Perbaikan mesin tak terduga' },
    { accountCode: '5-3500', accountName: 'Beban Asuransi', period: '2026', budget: 150_000_000, actual: 148_200_000, forecast: 150_000_000, variance: 0, notes: 'Sesuai polis' },
    { accountCode: '5-3600', accountName: 'Beban Perjalanan Dinas', period: '2026', budget: 120_000_000, actual: 96_400_000, forecast: 115_000_000, variance: -5_000_000, notes: 'Penghematan video call' },
    { accountCode: '5-3700', accountName: 'Beban Perlengkapan Kantor', period: '2026', budget: 48_000_000, actual: 42_600_000, forecast: 46_000_000, variance: -2_000_000, notes: 'Efisiensi pengadaan' },
    { accountCode: '5-4000', accountName: 'Beban Lain-lain', period: '2026', budget: 60_000_000, actual: 36_800_000, forecast: 55_000_000, variance: -5_000_000, notes: 'Di bawah anggaran' },
    { accountCode: '4-1000', accountName: 'Pendapatan Penjualan', period: '2026', budget: 5_100_000_000, actual: 4_823_400_000, forecast: 5_050_000_000, variance: -50_000_000, notes: 'Sedikit di bawah target' },
    { accountCode: '4-2000', accountName: 'Pendapatan Jasa', period: '2026', budget: 720_000_000, actual: 682_000_000, forecast: 710_000_000, variance: -10_000_000, notes: 'Kontrak baru tertunda' },
  ];

  /* --- Anggaran per Pusat Biaya (Cost Center Budget) ---------------------- */
  const budgets = [
    { id: 'BDG-001', costCenter: 'CC-PRD', dept: 'Produksi', type: 'OPEX', budget: 2_400_000_000, commitment: 312_000_000, actual: 1_824_000_000, forecast: 2_520_000_000 },
    { id: 'BDG-002', costCenter: 'CC-SCM', dept: 'Pengadaan & Gudang', type: 'OPEX', budget: 860_000_000, commitment: 186_200_000, actual: 512_400_000, forecast: 840_000_000 },
    { id: 'BDG-003', costCenter: 'CC-SAL', dept: 'Penjualan & CRM', type: 'OPEX', budget: 720_000_000, commitment: 48_000_000, actual: 486_200_000, forecast: 695_000_000 },
    { id: 'BDG-004', costCenter: 'CC-FIN', dept: 'Keuangan & Akuntansi', type: 'OPEX', budget: 340_000_000, commitment: 12_000_000, actual: 218_600_000, forecast: 330_000_000 },
    { id: 'BDG-005', costCenter: 'CC-HRD', dept: 'SDM & Umum', type: 'OPEX', budget: 480_000_000, commitment: 24_000_000, actual: 312_400_000, forecast: 465_000_000 },
    { id: 'BDG-006', costCenter: 'CC-MNT', dept: 'Pemeliharaan', type: 'OPEX', budget: 360_000_000, commitment: 74_900_000, actual: 264_800_000, forecast: 385_000_000 },
    { id: 'BDG-007', costCenter: 'CC-PRJ', dept: 'Proyek (CAPEX)', type: 'CAPEX', budget: 4_200_000_000, commitment: 546_000_000, actual: 3_654_000_000, forecast: 4_400_000_000 },
    { id: 'BDG-008', costCenter: 'CC-IT', dept: 'Teknologi Informasi', type: 'OPEX', budget: 280_000_000, commitment: 35_000_000, actual: 168_400_000, forecast: 272_000_000 },
  ];

  /* --- Penggajian (Payroll) ---------------------------------------------- */
  const payroll = [
    { id: 'PAY-2026-08-001', employeeId: 'EMP-0071', name: 'Osmond Pratama', dept: 'Operasional', basic: 28_000_000, allowance: 8_500_000, deduction: 2_940_000, overtime: 0, netPay: 33_560_000, status: 'dibayar', period: 'Agu 2026' },
    { id: 'PAY-2026-08-002', employeeId: 'EMP-0064', name: 'Andi Firmansyah', dept: 'Keuangan', basic: 22_000_000, allowance: 6_200_000, deduction: 2_352_000, overtime: 1_200_000, netPay: 27_048_000, status: 'dibayar', period: 'Agu 2026' },
    { id: 'PAY-2026-08-003', employeeId: 'EMP-0102', name: 'Rina Kusuma', dept: 'Penjualan', basic: 18_000_000, allowance: 5_800_000, deduction: 1_892_000, overtime: 0, netPay: 21_908_000, status: 'dibayar', period: 'Agu 2026' },
    { id: 'PAY-2026-08-004', employeeId: 'EMP-0087', name: 'Bagus Hartono', dept: 'Pengadaan', basic: 20_000_000, allowance: 5_400_000, deduction: 2_144_000, overtime: 800_000, netPay: 24_056_000, status: 'dibayar', period: 'Agu 2026' },
    { id: 'PAY-2026-08-005', employeeId: 'EMP-0093', name: 'Slamet Riyadi', dept: 'Produksi', basic: 19_000_000, allowance: 5_600_000, deduction: 2_036_000, overtime: 2_400_000, netPay: 24_964_000, status: 'dibayar', period: 'Agu 2026' },
    { id: 'PAY-2026-08-006', employeeId: 'EMP-0145', name: 'Sari Melati', dept: 'Keuangan', basic: 12_000_000, allowance: 3_200_000, deduction: 1_264_000, overtime: 600_000, netPay: 14_536_000, status: 'diproses', period: 'Agu 2026' },
    { id: 'PAY-2026-08-007', employeeId: 'EMP-0152', name: 'Yuni Astuti', dept: 'Produksi', basic: 11_000_000, allowance: 3_600_000, deduction: 1_164_000, overtime: 1_800_000, netPay: 15_236_000, status: 'diproses', period: 'Agu 2026' },
    { id: 'PAY-2026-08-008', employeeId: 'EMP-0159', name: 'Reza Alfarizi', dept: 'Gudang', basic: 5_500_000, allowance: 1_800_000, deduction: 384_000, overtime: 0, netPay: 6_916_000, status: 'draf', period: 'Agu 2026' },
  ];

  /* --- Daftar Aset ------------------------------------------------------- */
  const assets = [
    { id: 'AST-0014', name: 'Mesin CNC Milling Haas VF-2', category: 'Mesin produksi', location: 'Cikarang — Lini 3', acquisitionDate: '2022-04-18', acquisitionCost: 1_280_000_000, bookValue: 896_000_000, monthlyDepr: 21_333_333, status: 'aktif' },
    { id: 'AST-0022', name: 'Hydraulic Press 200T Aida', category: 'Mesin produksi', location: 'Cikarang — Lini 2', acquisitionDate: '2020-08-05', acquisitionCost: 2_400_000_000, bookValue: 1_200_000_000, monthlyDepr: 40_000_000, status: 'aktif' },
    { id: 'AST-0031', name: 'Forklift Toyota 8FD30', category: 'Kendaraan operasional', location: 'Cikarang — Gudang', acquisitionDate: '2023-11-20', acquisitionCost: 480_000_000, bookValue: 384_000_000, monthlyDepr: 8_000_000, status: 'aktif' },
    { id: 'AST-0038', name: 'Genset Cummins 500 kVA', category: 'Instalasi listrik', location: 'Cikarang — Utilitas', acquisitionDate: '2021-02-14', acquisitionCost: 850_000_000, bookValue: 425_000_000, monthlyDepr: 14_166_667, status: 'aktif' },
    { id: 'AST-0045', name: 'Mobil operasional Toyota Hilux', category: 'Kendaraan operasional', location: 'Jakarta — Pusat', acquisitionDate: '2024-06-10', acquisitionCost: 520_000_000, bookValue: 442_000_000, monthlyDepr: 6_500_000, status: 'aktif' },
    { id: 'AST-0051', name: 'Server Dell PowerEdge R750', category: 'Perangkat TI', location: 'Jakarta — Pusat', acquisitionDate: '2025-01-08', acquisitionCost: 320_000_000, bookValue: 266_667_000, monthlyDepr: 8_888_889, status: 'aktif' },
    { id: 'AST-0009', name: 'Mesin bubut konvensional Pinacho', category: 'Mesin produksi', location: 'Cikarang — Lini 1', acquisitionDate: '2016-03-12', acquisitionCost: 380_000_000, bookValue: 0, monthlyDepr: 0, status: 'dihapuskan' },
    { id: 'AST-0056', name: 'Crane overhead 5T Konecranes', category: 'Peralatan material handling', location: 'Surabaya — Gudang', acquisitionDate: '2023-07-22', acquisitionCost: 680_000_000, bookValue: 510_000_000, monthlyDepr: 11_333_333, status: 'aktif' },
  ];

  /* --- Pemeliharaan ------------------------------------------------------ */
  const maintenanceOrders = [
    { id: 'MNT-2026-0212', asset: 'Hydraulic Press 200T Aida', assetId: 'AST-0022', type: 'Preventif', priority: 'tinggi', assignee: 'Dedi Kurnia', scheduledDate: '2026-08-18', status: 'dijadwalkan', cost: 12_400_000, desc: 'Penggantian oli hidrolik dan filter' },
    { id: 'MNT-2026-0210', asset: 'Mesin CNC Milling Haas VF-2', assetId: 'AST-0014', type: 'Korektif', priority: 'tinggi', assignee: 'Slamet Riyadi', scheduledDate: '2026-08-15', status: 'berjalan', cost: 28_600_000, desc: 'Perbaikan spindle — getaran abnormal' },
    { id: 'MNT-2026-0208', asset: 'Forklift Toyota 8FD30', assetId: 'AST-0031', type: 'Preventif', priority: 'sedang', assignee: 'Fitri Ramadhani', scheduledDate: '2026-08-20', status: 'dijadwalkan', cost: 4_800_000, desc: 'Servis berkala 2000 jam' },
    { id: 'MNT-2026-0206', asset: 'Genset Cummins 500 kVA', assetId: 'AST-0038', type: 'Preventif', priority: 'sedang', assignee: 'Dedi Kurnia', scheduledDate: '2026-08-14', status: 'selesai', cost: 8_200_000, desc: 'Load test dan ganti bahan bakar' },
    { id: 'MNT-2026-0203', asset: 'Hydraulic Press 200T Aida', assetId: 'AST-0022', type: 'Korektif', priority: 'tinggi', assignee: 'Slamet Riyadi', scheduledDate: '2026-08-10', status: 'selesai', cost: 18_400_000, desc: 'Kebocoran seal silinder — darurat' },
    { id: 'MNT-2026-0201', asset: 'Crane overhead 5T Konecranes', assetId: 'AST-0056', type: 'Preventif', priority: 'rendah', assignee: 'Fitri Ramadhani', scheduledDate: '2026-08-25', status: 'dijadwalkan', cost: 6_100_000, desc: 'Inspeksi wire rope dan rem' },
  ];

  /* --- Repositori Dokumen ------------------------------------------------ */
  const documents = [
    { id: 'DOC-0421', name: 'Kontrak PT Astra Daihatsu Motor 2026', type: 'Kontrak', folder: 'Penjualan / Kontrak', owner: 'Rina Kusuma', size: '2,4 MB', modified: '2026-08-12', version: 3, status: 'berlaku', expiry: '2027-03-31' },
    { id: 'DOC-0418', name: 'SOP Penerimaan Barang v4.1', type: 'SOP', folder: 'Operasional / SOP', owner: 'Fitri Ramadhani', size: '840 KB', modified: '2026-07-28', version: 4, status: 'berlaku', expiry: null },
    { id: 'DOC-0415', name: 'Laporan Audit Internal Q2 2026', type: 'Laporan', folder: 'Kepatuhan / Audit', owner: 'Andi Firmansyah', size: '5,1 MB', modified: '2026-07-15', version: 1, status: 'berlaku', expiry: null },
    { id: 'DOC-0412', name: 'Sertifikat ISO 9001:2015', type: 'Sertifikat', folder: 'Kepatuhan / Sertifikasi', owner: 'Osmond Pratama', size: '1,2 MB', modified: '2026-01-10', version: 1, status: 'berlaku', expiry: '2027-01-09' },
    { id: 'DOC-0408', name: 'Kebijakan K3 Pabrik Cikarang', type: 'Kebijakan', folder: 'SDM / Kebijakan', owner: 'Osmond Pratama', size: '620 KB', modified: '2026-06-01', version: 2, status: 'berlaku', expiry: null },
    { id: 'DOC-0394', name: 'Gambar teknis braket tipe B rev.C', type: 'Teknis', folder: 'Produksi / Gambar Teknis', owner: 'Slamet Riyadi', size: '14,8 MB', modified: '2026-05-22', version: 6, status: 'berlaku', expiry: null },
    { id: 'DOC-0388', name: 'Perjanjian supplier CV Logam Jaya', type: 'Kontrak', folder: 'Pembelian / Kontrak', owner: 'Bagus Hartono', size: '1,8 MB', modified: '2025-12-15', version: 2, status: 'kedaluwarsa', expiry: '2026-06-30' },
    { id: 'DOC-0401', name: 'Draft kebijakan WFH 2027', type: 'Kebijakan', folder: 'SDM / Kebijakan', owner: 'Osmond Pratama', size: '340 KB', modified: '2026-08-10', version: 1, status: 'draf', expiry: null },
  ];

  /* --- POS / Kasir: ikhtisar toko --------------------------------------- */
  const posShifts = [
    { id: 'SHF-0842', cashier: 'Anita Permata', store: 'Toko Cikarang', startTime: '08:00', endTime: '16:00', status: 'aktif', openingCash: 500_000, currentCash: 2_840_000, transactions: 28, totalSales: 18_420_000 },
    { id: 'SHF-0841', cashier: 'Budi Santoso', store: 'Toko Cikarang', startTime: '08:00', endTime: '16:00', status: 'aktif', openingCash: 500_000, currentCash: 1_960_000, transactions: 22, totalSales: 14_680_000 },
  ];

  const posTransactions = [
    { id: 'TRX-2026-14921', time: '14:32', cashier: 'Anita Permata', items: 4, total: 1_284_000, payment: 'QRIS', status: 'selesai' },
    { id: 'TRX-2026-14920', time: '14:18', cashier: 'Budi Santoso', items: 2, total: 486_000, payment: 'Tunai', status: 'selesai' },
    { id: 'TRX-2026-14919', time: '13:55', cashier: 'Anita Permata', items: 1, total: 96_500, payment: 'Debit', status: 'selesai' },
    { id: 'TRX-2026-14918', time: '13:41', cashier: 'Budi Santoso', items: 6, total: 2_148_000, payment: 'Transfer', status: 'selesai' },
    { id: 'TRX-2026-14917', time: '13:22', cashier: 'Anita Permata', items: 3, total: 764_500, payment: 'Tunai', status: 'void' },
    { id: 'TRX-2026-14916', time: '12:58', cashier: 'Budi Santoso', items: 2, total: 385_000, payment: 'Kredit', status: 'selesai' },
  ];

  const posKpis = {
    todaySales: 33_100_000, todayTarget: 40_000_000,
    transactions: 50, avgBasket: 662_000,
    topProduct: 'Braket dudukan mesin tipe B',
    refundRate: 2.0,
  };

  /* --- Jejak Audit ------------------------------------------------------- */
  const auditTrail = [
    { id: 'AUD-9842', timestamp: '2026-08-14 14:23:01', user: 'Rina Kusuma', action: 'Buat', module: 'Pesanan Penjualan', entity: 'SO-2026-0421', detail: 'Pesanan baru untuk PT Sinar Mas Otomotif', ip: '10.10.2.45' },
    { id: 'AUD-9841', timestamp: '2026-08-14 14:22:58', user: 'Sistem', action: 'Periksa', module: 'Kredit', entity: 'CUST-0004', detail: 'Pemeriksaan plafon kredit otomatis — lolos', ip: '—' },
    { id: 'AUD-9839', timestamp: '2026-08-14 09:31:00', user: 'Sistem', action: 'Posting', module: 'Keuangan', entity: 'JV-2026-0778', detail: 'Pengakuan pendapatan otomatis dari INV-2026-1188', ip: '—' },
    { id: 'AUD-9835', timestamp: '2026-08-13 14:23:15', user: 'Rina Kusuma', action: 'Buat', module: 'Pesanan Penjualan', entity: 'SO-2026-0418', detail: 'Pesanan untuk PT Sentosa Baja Perkasa — diteruskan ke approval', ip: '10.10.2.45' },
    { id: 'AUD-9832', timestamp: '2026-08-13 08:57:22', user: 'Bagus Hartono', action: 'Terima', module: 'Penerimaan Barang', entity: 'GR-2026-0512', detail: 'Penerimaan PO-2026-0229 — 8000 pcs baut hex M12×60', ip: '10.10.3.12' },
    { id: 'AUD-9828', timestamp: '2026-08-12 11:02:00', user: 'Osmond Pratama', action: 'Setujui', module: 'Pesanan Penjualan', entity: 'SO-2026-0419', detail: 'Persetujuan pesanan CV Karya Presisi', ip: '10.10.1.8' },
    { id: 'AUD-9824', timestamp: '2026-08-11 16:45:30', user: 'Andi Firmansyah', action: 'Ubah', module: 'Jurnal', entity: 'JV-2026-0774', detail: 'Revisi nominal koreksi penyusutan Jul 2026: Rp 38,1 jt → Rp 42,3 jt', ip: '10.10.1.22' },
    { id: 'AUD-9820', timestamp: '2026-08-10 07:58:44', user: 'Andi Firmansyah', action: 'Tolak', module: 'Jurnal', entity: 'JV-2026-0771', detail: 'Reklasifikasi biaya angkut ditolak — akun tujuan salah', ip: '10.10.1.22' },
    { id: 'AUD-9815', timestamp: '2026-08-09 09:12:00', user: 'Osmond Pratama', action: 'Ubah', module: 'Peran', entity: 'ROLE-gudang', detail: 'Izin transfer antar gudang: lihat saja → ubah & setujui', ip: '10.10.1.8' },
    { id: 'AUD-9810', timestamp: '2026-08-08 14:30:00', user: 'Dewi Anggraini', action: 'Buat', module: 'Permintaan Pembelian', entity: 'PR-2026-0088', detail: 'Peti kayu ekspor tambahan Q3 — Rp 52,3 jt', ip: '10.10.3.18' },
  ];

  /* --- Data Master: Produk & Layanan ------------------------------------- */
  const masterProducts = [
    { id: 'PRD-0001', name: 'Braket Dudukan Mesin Tipe A', category: 'Barang Jadi', uom: 'pcs', salePrice: 425_000, costPrice: 264_000, weight: 2.4, sku: 'BRG-1107', taxCode: 'PPN 11%', status: 'aktif' },
    { id: 'PRD-0002', name: 'Braket Dudukan Mesin Tipe B', category: 'Barang Jadi', uom: 'pcs', salePrice: 480_000, costPrice: 264_000, weight: 2.8, sku: 'BRG-1108', taxCode: 'PPN 11%', status: 'aktif' },
    { id: 'PRD-0003', name: 'Rakitan Poros Transmisi', category: 'Barang Jadi', uom: 'pcs', salePrice: 1_250_000, costPrice: 780_000, weight: 5.6, sku: 'BRG-2100', taxCode: 'PPN 11%', status: 'aktif' },
    { id: 'PRD-0004', name: 'Panel Kendali IP65', category: 'Barang Jadi', uom: 'unit', salePrice: 8_400_000, costPrice: 5_240_000, weight: 18.0, sku: 'BRG-9014', taxCode: 'PPN 11%', status: 'aktif' },
    { id: 'PRD-0005', name: 'Motor Induksi 3 Fasa 5,5 kW', category: 'Barang Jadi', uom: 'unit', salePrice: 12_800_000, costPrice: 8_640_000, weight: 42.0, sku: 'BRG-7204', taxCode: 'PPN 11%', status: 'aktif' },
    { id: 'PRD-0006', name: 'Pelat Baja SPHC 3mm', category: 'Bahan Baku', uom: 'lbr', salePrice: 0, costPrice: 486_000, weight: 35.0, sku: 'BRG-1042', taxCode: 'PPN 11%', status: 'aktif' },
    { id: 'PRD-0007', name: 'Bearing 6204-2RS', category: 'Suku Cadang', uom: 'pcs', salePrice: 0, costPrice: 78_400, weight: 0.12, sku: 'BRG-2217', taxCode: 'PPN 11%', status: 'aktif' },
    { id: 'PRD-0008', name: 'Jasa Pemasangan di Lokasi', category: 'Jasa', uom: 'paket', salePrice: 28_000_000, costPrice: 18_000_000, weight: 0, sku: 'JAS-0031', taxCode: 'PPN 11%', status: 'aktif' },
    { id: 'PRD-0009', name: 'Jasa Machining Presisi', category: 'Jasa', uom: 'jam', salePrice: 650_000, costPrice: 420_000, weight: 0, sku: 'JAS-0045', taxCode: 'PPN 11%', status: 'aktif' },
    { id: 'PRD-0010', name: 'Mesin Bubut Bekas Pinacho', category: 'Barang Jadi', uom: 'unit', salePrice: 120_000_000, costPrice: 0, weight: 2800, sku: 'BRG-0009', taxCode: 'PPN 11%', status: 'nonaktif' },
  ];

  /* --- RFQ / Perbandingan Vendor ----------------------------------------- */
  const rfqs = [
    { id: 'RFQ-2026-0041', date: '2026-08-14', title: 'Pelat baja SPHC 3mm (250 lbr)', requestor: 'Bagus Hartono', vendors: 3, deadline: '2026-08-18', bestPrice: 472_500_000, status: 'terbuka', prRef: 'PR-2026-0093' },
    { id: 'RFQ-2026-0040', date: '2026-08-12', title: 'Suku cadang mesin CNC Haas', requestor: 'Dewi Anggraini', vendors: 2, deadline: '2026-08-16', bestPrice: 68_400_000, status: 'evaluasi', prRef: 'PR-2026-0091' },
    { id: 'RFQ-2026-0039', date: '2026-08-10', title: 'Oli hidrolik ISO VG 46 (60 drum)', requestor: 'Bagus Hartono', vendors: 3, deadline: '2026-08-14', bestPrice: 98_400_000, status: 'selesai', prRef: 'PR-2026-0089' },
    { id: 'RFQ-2026-0038', date: '2026-08-08', title: 'Kabel NYY 4×10mm (3000 m)', requestor: 'Dewi Anggraini', vendors: 4, deadline: '2026-08-12', bestPrice: 126_600_000, status: 'selesai', prRef: null },
  ];

  /* --- Hutang Usaha (Accounts Payable) ----------------------------------- */
  const payables = [
    { id: 'APV-2026-0412', date: '2026-08-14', supplier: 'CV Logam Jaya Abadi', poRef: 'PO-2026-0233', amount: 186_200_000, paid: 0, dueDate: '2026-09-13', status: 'belum-dibayar', matched: true },
    { id: 'APV-2026-0408', date: '2026-08-11', supplier: 'PT Kabel Cipta Sarana', poRef: 'PO-2026-0230', amount: 132_800_000, paid: 0, dueDate: '2026-09-10', status: 'belum-dibayar', matched: true },
    { id: 'APV-2026-0405', date: '2026-08-08', supplier: 'PT Bearing Nusantara', poRef: 'PO-2026-0226', amount: 61_450_000, paid: 61_450_000, dueDate: '2026-09-22', status: 'lunas', matched: true },
    { id: 'APV-2026-0401', date: '2026-08-05', supplier: 'PT Kemasan Prima', poRef: 'PO-2026-0227', amount: 33_200_000, paid: 33_200_000, dueDate: '2026-08-19', status: 'lunas', matched: true },
    { id: 'APV-2026-0398', date: '2026-08-01', supplier: 'PT Baja Sentral Indo', poRef: 'PO-2026-0225', amount: 402_700_000, paid: 200_000_000, dueDate: '2026-09-30', status: 'sebagian', matched: false },
    { id: 'APV-2026-0392', date: '2026-07-28', supplier: 'PT Pelumas Andalan', poRef: 'PO-2026-0224', amount: 27_600_000, paid: 0, dueDate: '2026-08-27', status: 'belum-dibayar', matched: true },
    { id: 'APV-2026-0385', date: '2026-07-22', supplier: 'PT Mesin Presisi Tama', poRef: 'PO-2026-0228', amount: 76_950_000, paid: 0, dueDate: '2026-09-05', status: 'belum-dibayar', matched: true },
    { id: 'APV-2026-0378', date: '2026-07-14', supplier: 'CV Logam Jaya Abadi', poRef: 'PO-2026-0229', amount: 217_400_000, paid: 217_400_000, dueDate: '2026-08-13', status: 'lunas', matched: true },
  ];

  const apAging = [
    { label: 'Belum jatuh tempo', short: 'Lancar', value: 921_650_000, count: 5 },
    { label: '1–30 hari', short: '1–30', value: 27_600_000, count: 1 },
    { label: '31–60 hari', short: '31–60', value: 0, count: 0 },
    { label: '61–90 hari', short: '61–90', value: 0, count: 0 },
    { label: 'Lebih dari 90 hari', short: '>90', value: 0, count: 0 },
  ];

  /* --- Kas & Bank -------------------------------------------------------- */
  const bankAccounts = [
    { id: 'BNK-001', name: 'BCA — Giro Operasional', bank: 'BCA', accountNo: '012-345-6789', currency: 'IDR', balance: 2_842_600_000, lastRecon: '2026-08-13', unrecon: 3, status: 'aktif' },
    { id: 'BNK-002', name: 'Mandiri — Giro Gaji', bank: 'Mandiri', accountNo: '123-00-4567890', currency: 'IDR', balance: 486_200_000, lastRecon: '2026-08-14', unrecon: 0, status: 'aktif' },
    { id: 'BNK-003', name: 'BCA — Deposito 3 bln', bank: 'BCA', accountNo: '012-888-9012', currency: 'IDR', balance: 1_500_000_000, lastRecon: '2026-08-01', unrecon: 0, status: 'aktif' },
    { id: 'BNK-004', name: 'BNI — Giro USD', bank: 'BNI', accountNo: '789-012-3456', currency: 'USD', balance: 124_800, lastRecon: '2026-08-10', unrecon: 1, status: 'aktif' },
    { id: 'BNK-005', name: 'Kas Kecil — Cikarang', bank: 'Kas', accountNo: '—', currency: 'IDR', balance: 8_400_000, lastRecon: '2026-08-14', unrecon: 0, status: 'aktif' },
    { id: 'BNK-006', name: 'Kas Kecil — Surabaya', bank: 'Kas', accountNo: '—', currency: 'IDR', balance: 4_200_000, lastRecon: '2026-08-12', unrecon: 0, status: 'aktif' },
  ];

  /* --- Kehadiran & Cuti -------------------------------------------------- */
  const attendanceRecords = [
    { id: 'ATT-2026-08-001', employeeId: 'EMP-0102', name: 'Rina Kusuma', date: '2026-08-14', shift: 'Reguler', clockIn: '07:58', clockOut: '17:05', overtime: 0, status: 'hadir', type: 'Kehadiran' },
    { id: 'ATT-2026-08-002', employeeId: 'EMP-0118', name: 'Hendra Wijaya', date: '2026-08-14', shift: 'Reguler', clockIn: '08:12', clockOut: '17:30', overtime: 0.5, status: 'hadir', type: 'Kehadiran' },
    { id: 'ATT-2026-08-003', employeeId: 'EMP-0087', name: 'Bagus Hartono', date: '2026-08-14', shift: 'Reguler', clockIn: '07:45', clockOut: '18:00', overtime: 1, status: 'hadir', type: 'Kehadiran' },
    { id: 'ATT-2026-08-004', employeeId: 'EMP-0131', name: 'Dewi Anggraini', date: '2026-08-14', shift: 'Reguler', clockIn: null, clockOut: null, overtime: 0, status: 'cuti', type: 'Cuti Tahunan' },
    { id: 'ATT-2026-08-005', employeeId: 'EMP-0064', name: 'Andi Firmansyah', date: '2026-08-14', shift: 'Reguler', clockIn: '08:01', clockOut: '17:10', overtime: 0, status: 'hadir', type: 'Kehadiran' },
    { id: 'ATT-2026-08-006', employeeId: 'EMP-0093', name: 'Slamet Riyadi', date: '2026-08-14', shift: 'Shift 1', clockIn: '06:00', clockOut: '14:15', overtime: 0, status: 'hadir', type: 'Kehadiran' },
    { id: 'ATT-2026-08-007', employeeId: 'EMP-0110', name: 'Dedi Kurnia', date: '2026-08-14', shift: 'Shift 2', clockIn: '14:00', clockOut: null, overtime: 0, status: 'hadir', type: 'Kehadiran' },
    { id: 'ATT-2026-08-008', employeeId: 'EMP-0145', name: 'Sari Melati', date: '2026-08-14', shift: 'Reguler', clockIn: null, clockOut: null, overtime: 0, status: 'sakit', type: 'Sakit' },
    { id: 'ATT-2026-08-009', employeeId: 'EMP-0152', name: 'Yuni Astuti', date: '2026-08-14', shift: 'Shift 1', clockIn: '06:05', clockOut: '15:30', overtime: 1.5, status: 'hadir', type: 'Kehadiran' },
    { id: 'ATT-2026-08-010', employeeId: 'EMP-0159', name: 'Reza Alfarizi', date: '2026-08-14', shift: 'Reguler', clockIn: '08:30', clockOut: null, overtime: 0, status: 'terlambat', type: 'Kehadiran' },
  ];

  /* --- Alur Kerja (Workflow Templates) ----------------------------------- */
  const workflows = [
    { id: 'WFL-001', name: 'Persetujuan Pesanan Penjualan', trigger: 'SO dibuat', steps: 3, sla: '4 jam', activeInstances: 2, lastModified: '2026-07-15', status: 'aktif', owner: 'Admin Sistem' },
    { id: 'WFL-002', name: 'Persetujuan Pesanan Pembelian', trigger: 'PO dibuat', steps: 2, sla: '8 jam', activeInstances: 1, lastModified: '2026-07-15', status: 'aktif', owner: 'Admin Sistem' },
    { id: 'WFL-003', name: 'Persetujuan Permintaan Pembelian', trigger: 'PR dibuat', steps: 2, sla: '24 jam', activeInstances: 2, lastModified: '2026-06-20', status: 'aktif', owner: 'Admin Sistem' },
    { id: 'WFL-004', name: 'Tutup Buku Periode', trigger: 'Manual', steps: 5, sla: '3 hari', activeInstances: 0, lastModified: '2026-06-01', status: 'aktif', owner: 'Andi Firmansyah' },
    { id: 'WFL-005', name: 'Onboarding Karyawan Baru', trigger: 'Karyawan dibuat', steps: 8, sla: '7 hari', activeInstances: 1, lastModified: '2026-05-10', status: 'aktif', owner: 'Admin Sistem' },
    { id: 'WFL-006', name: 'Persetujuan Jurnal Penyesuaian', trigger: 'JV manual dibuat', steps: 2, sla: '4 jam', activeInstances: 1, lastModified: '2026-08-01', status: 'aktif', owner: 'Andi Firmansyah' },
    { id: 'WFL-007', name: 'Klaim Reimbursement', trigger: 'Klaim diajukan', steps: 3, sla: '48 jam', activeInstances: 0, lastModified: '2026-04-18', status: 'nonaktif', owner: 'Admin Sistem' },
  ];

  /* --- Analitik: Laporan tersedia ---------------------------------------- */
  const reports = [
    { id: 'RPT-001', name: 'Laporan Laba Rugi', module: 'Keuangan', type: 'Standar', lastRun: '2026-08-14', frequency: 'Bulanan', format: 'PDF', status: 'aktif' },
    { id: 'RPT-002', name: 'Neraca', module: 'Keuangan', type: 'Standar', lastRun: '2026-08-01', frequency: 'Bulanan', format: 'PDF', status: 'aktif' },
    { id: 'RPT-003', name: 'Arus Kas', module: 'Keuangan', type: 'Standar', lastRun: '2026-08-01', frequency: 'Bulanan', format: 'PDF', status: 'aktif' },
    { id: 'RPT-004', name: 'Analisis Penjualan per Segmen', module: 'Penjualan', type: 'Analitik', lastRun: '2026-08-12', frequency: 'Mingguan', format: 'Excel', status: 'aktif' },
    { id: 'RPT-005', name: 'Aging Piutang', module: 'Keuangan', type: 'Standar', lastRun: '2026-08-14', frequency: 'Harian', format: 'PDF', status: 'aktif' },
    { id: 'RPT-006', name: 'Kinerja Pemasok', module: 'Pembelian', type: 'Analitik', lastRun: '2026-08-10', frequency: 'Bulanan', format: 'Excel', status: 'aktif' },
    { id: 'RPT-007', name: 'Utilisasi Aset Produksi', module: 'Aset', type: 'Analitik', lastRun: '2026-08-08', frequency: 'Mingguan', format: 'Dasbor', status: 'aktif' },
    { id: 'RPT-008', name: 'Laporan Kehadiran Bulanan', module: 'SDM', type: 'Standar', lastRun: '2026-08-01', frequency: 'Bulanan', format: 'Excel', status: 'aktif' },
    { id: 'RPT-009', name: 'Pipeline CRM Forecast', module: 'CRM', type: 'Analitik', lastRun: '2026-08-13', frequency: 'Mingguan', format: 'Dasbor', status: 'aktif' },
    { id: 'RPT-010', name: 'Variance Anggaran vs Aktual', module: 'Keuangan', type: 'Analitik', lastRun: '2026-08-05', frequency: 'Bulanan', format: 'Excel', status: 'nonaktif' },
  ];

  /* --- Kepatuhan & GRC --------------------------------------------------- */
  const complianceItems = [
    { id: 'CMP-001', title: 'ISO 9001:2015 — Quality Management', category: 'Sertifikasi', owner: 'Osmond Pratama', dueDate: '2027-01-09', lastReview: '2026-06-15', risk: 'rendah', status: 'patuh' },
    { id: 'CMP-002', title: 'K3 — Keselamatan Kerja Pabrik', category: 'Regulasi', owner: 'Osmond Pratama', dueDate: null, lastReview: '2026-07-20', risk: 'sedang', status: 'patuh' },
    { id: 'CMP-003', title: 'Pajak PPh 21 — Bulanan', category: 'Pajak', owner: 'Andi Firmansyah', dueDate: '2026-09-10', lastReview: '2026-08-10', risk: 'rendah', status: 'patuh' },
    { id: 'CMP-004', title: 'PPN — Laporan Bulanan', category: 'Pajak', owner: 'Andi Firmansyah', dueDate: '2026-09-15', lastReview: '2026-08-14', risk: 'rendah', status: 'patuh' },
    { id: 'CMP-005', title: 'Segregation of Duties — Keuangan', category: 'Tata Kelola', owner: 'Admin Sistem', dueDate: null, lastReview: '2026-05-22', risk: 'tinggi', status: 'peninjauan' },
    { id: 'CMP-006', title: 'AMDAL — Limbah Industri Cikarang', category: 'Lingkungan', owner: 'Osmond Pratama', dueDate: '2027-03-31', lastReview: '2026-04-10', risk: 'sedang', status: 'patuh' },
    { id: 'CMP-007', title: 'Audit Internal — Q3 2026', category: 'Audit', owner: 'Andi Firmansyah', dueDate: '2026-09-30', lastReview: null, risk: 'sedang', status: 'dijadwalkan' },
    { id: 'CMP-008', title: 'Perlindungan Data Karyawan', category: 'Tata Kelola', owner: 'Admin Sistem', dueDate: null, lastReview: '2026-03-15', risk: 'tinggi', status: 'peninjauan' },
  ];

  /* --- Balanced Scorecard ------------------------------------------------ */
  const bscData = {
    period: 'Agu 2026',
    financial: [
      { metric: 'Pertumbuhan Pendapatan', target: 15, actual: 12.4, unit: '%', trend: [8.2, 9.1, 10.3, 11.0, 11.8, 12.4] },
      { metric: 'Margin Laba Kotor', target: 36, actual: 35.0, unit: '%', trend: [33.2, 33.8, 34.1, 34.5, 34.8, 35.0] },
      { metric: 'Return on Investment', target: 18, actual: 16.2, unit: '%', trend: [14.1, 14.8, 15.2, 15.6, 15.9, 16.2] },
      { metric: 'Arus Kas Operasional', target: 1.0, actual: 0.89, unit: 'M', trend: [0.72, 0.78, 0.82, 0.85, 0.87, 0.89] },
    ],
    customer: [
      { metric: 'Indeks Kepuasan Pelanggan', target: 90, actual: 87, unit: '%', trend: [82, 83, 85, 85, 86, 87] },
      { metric: 'Retensi Pelanggan', target: 95, actual: 93.2, unit: '%', trend: [91.0, 91.5, 92.0, 92.4, 92.8, 93.2] },
      { metric: 'Pengiriman Tepat Waktu', target: 98, actual: 96.1, unit: '%', trend: [94.2, 94.8, 95.1, 95.5, 95.8, 96.1] },
      { metric: 'Keluhan per 1000 Transaksi', target: 2, actual: 3.1, unit: '', trend: [4.2, 3.8, 3.6, 3.4, 3.2, 3.1] },
    ],
    internal: [
      { metric: 'OEE (Overall Equipment Effectiveness)', target: 85, actual: 81.4, unit: '%', trend: [78.0, 79.2, 79.8, 80.2, 80.8, 81.4] },
      { metric: 'Tingkat Cacat Produksi', target: 1.0, actual: 0.8, unit: '%', trend: [1.4, 1.2, 1.1, 1.0, 0.9, 0.8] },
      { metric: 'Waktu Siklus Rata-rata', target: 4.0, actual: 4.2, unit: 'hari', trend: [5.0, 4.8, 4.6, 4.5, 4.3, 4.2] },
      { metric: 'Perputaran Persediaan', target: 8, actual: 7.2, unit: 'x/thn', trend: [6.1, 6.4, 6.7, 6.9, 7.0, 7.2] },
    ],
    growth: [
      { metric: 'Jam Pelatihan per Karyawan', target: 40, actual: 32, unit: 'jam', trend: [18, 22, 24, 26, 28, 32] },
      { metric: 'Indeks Kepuasan Karyawan', target: 80, actual: 76, unit: '%', trend: [70, 72, 73, 74, 75, 76] },
      { metric: 'Turnover Karyawan', target: 5, actual: 3.8, unit: '%', trend: [6.2, 5.8, 5.1, 4.6, 4.2, 3.8] },
      { metric: 'Adopsi Sistem Digital', target: 90, actual: 82, unit: '%', trend: [62, 68, 72, 76, 79, 82] },
    ],
  };

  /* --- Analitik: Ringkasan KPI ------------------------------------------- */
  const analyticsKpis = [
    { id: 'ax-revenue', label: 'Total Penjualan MTD', value: 4_823_400_000, delta: 12.4, format: 'rp', icon: 'cart' },
    { id: 'ax-margin', label: 'Margin Laba Kotor', value: 35.0, delta: -1.0, format: 'pct', icon: 'piechart' },
    { id: 'ax-pipeline', label: 'Pipeline CRM', value: 9_685_000_000, delta: 18.2, format: 'rp', icon: 'target' },
    { id: 'ax-conversion', label: 'Konversi Pipeline', value: 32.5, delta: -2.1, format: 'pct', icon: 'check' },
    { id: 'ax-oee', label: 'OEE Produksi', value: 81.4, delta: 1.8, format: 'pct', icon: 'factory' },
    { id: 'ax-dso', label: 'DSO', value: 38, delta: 3, format: 'hari', icon: 'clock' },
    { id: 'ax-stock', label: 'Stok Kritis', value: 4, delta: 1, format: 'item', icon: 'alert' },
    { id: 'ax-satisfaction', label: 'Kepuasan Pelanggan', value: 87, delta: 2, format: 'pct', icon: 'users' },
  ];

  /* --- Rantai Pasok (Supply Chain) --------------------------------------- */
  const shipments = [
    { id: 'SHP-2026-0188', date: '2026-08-14', origin: 'Cikarang — Pabrik', destination: 'PT Global Komponen Indo, Surabaya', carrier: 'JNE Trucking', ref: 'DO-2026-0908', weight: 2400, eta: '2026-08-17', status: 'transit' },
    { id: 'SHP-2026-0186', date: '2026-08-13', origin: 'Cikarang — Pabrik', destination: 'PT Anugerah Mesin Jaya, Sidoarjo', carrier: 'SiCepat Cargo', ref: 'DO-2026-0905', weight: 860, eta: '2026-08-16', status: 'transit' },
    { id: 'SHP-2026-0184', date: '2026-08-12', origin: 'CV Logam Jaya Abadi, Bekasi', destination: 'Cikarang — Pabrik', carrier: 'Self-pickup', ref: 'GR-2026-0512', weight: 3200, eta: '2026-08-12', status: 'diterima' },
    { id: 'SHP-2026-0182', date: '2026-08-11', origin: 'Cikarang — Pabrik', destination: 'Surabaya — Gudang', carrier: 'Internal', ref: 'TRF-2026-0121', weight: 1800, eta: '2026-08-13', status: 'diterima' },
    { id: 'SHP-2026-0180', date: '2026-08-10', origin: 'PT Bearing Nusantara, Jakarta', destination: 'Cikarang — Pabrik', carrier: 'Gosend Instant', ref: 'GR-2026-0508', weight: 48, eta: '2026-08-10', status: 'diterima' },
    { id: 'SHP-2026-0178', date: '2026-08-08', origin: 'Cikarang — Pabrik', destination: 'CV Karya Presisi, Cikarang', carrier: 'Self-delivery', ref: 'DO-2026-0898', weight: 340, eta: '2026-08-08', status: 'diterima' },
  ];

  return {
    org, nav, kpis, revenueTrend, revenueByLine, inventoryMix, arAging,
    approvals, stockAlerts, activity, notifications,
    salesOrders, salesOrderLines, defaultLines, orderTimeline, defaultTimeline,
    customers, invoices, purchaseOrders, suppliers,
    stockItems, stockMoves, workOrderColumns, workOrders,
    journals, employees, roles, permissions,
    /* Modul baru */
    aiBriefing, aiMessages,
    crmStages, leads, quotations, purchaseRequests,
    projects, projectTasks,
    budgets, accountBudgets, chartOfAccounts, payroll, assets, maintenanceOrders,
    documents, posShifts, posTransactions, posKpis,
    auditTrail,
    /* Modul tambahan */
    masterProducts, rfqs, payables, apAging, bankAccounts,
    attendanceRecords, workflows, reports, complianceItems, shipments,
    /* Dashboard */
    bscData, analyticsKpis,
  };
})();
