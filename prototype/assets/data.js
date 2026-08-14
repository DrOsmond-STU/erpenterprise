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

  /* --- Struktur navigasi -------------------------------------------------- */
  const nav = [
    {
      label: 'Ikhtisar',
      items: [{ id: 'dasbor', label: 'Dasbor', icon: 'grid' }],
    },
    {
      label: 'Penjualan',
      items: [
        { id: 'pesanan-penjualan', label: 'Pesanan Penjualan', icon: 'cart', count: 148 },
        { id: 'faktur', label: 'Faktur', icon: 'invoice', count: 62 },
        { id: 'pelanggan', label: 'Pelanggan', icon: 'building' },
      ],
    },
    {
      label: 'Pembelian',
      items: [
        { id: 'pesanan-pembelian', label: 'Pesanan Pembelian', icon: 'truck', count: 34 },
        { id: 'pemasok', label: 'Pemasok', icon: 'handshake' },
      ],
    },
    {
      label: 'Inventaris',
      items: [
        { id: 'stok', label: 'Stok Barang', icon: 'boxes', count: 9 },
        { id: 'mutasi', label: 'Mutasi Stok', icon: 'transfer' },
      ],
    },
    {
      label: 'Produksi',
      items: [{ id: 'perintah-kerja', label: 'Perintah Kerja', icon: 'factory', count: 17 }],
    },
    {
      label: 'Keuangan',
      items: [
        { id: 'piutang', label: 'Piutang Usaha', icon: 'wallet' },
        { id: 'jurnal', label: 'Jurnal Umum', icon: 'ledger' },
      ],
    },
    {
      label: 'SDM',
      items: [{ id: 'karyawan', label: 'Karyawan', icon: 'users' }],
    },
    {
      label: 'Sistem',
      items: [
        { id: 'peran', label: 'Peran & Izin', icon: 'shield' },
        { id: 'pengaturan', label: 'Pengaturan', icon: 'gear' },
        { id: 'sistem-desain', label: 'Sistem Desain', icon: 'palette' },
      ],
    },
  ];

  /* --- Ubin KPI dasbor ----------------------------------------------------
     `dir` menyatakan arah yang BAIK, sehingga naik-turun dapat diberi nada
     yang benar (piutang jatuh tempo naik = buruk). */
  const kpis = [
    {
      id: 'pendapatan', label: 'Pendapatan (bulan berjalan)', value: 4_823_400_000,
      format: 'rp-compact', delta: 12.4, dir: 'up', foot: 'Target bulan ini Rp 5,10 M',
      spark: [3.1, 3.4, 3.2, 3.9, 4.1, 3.8, 4.4, 4.2, 4.6, 4.5, 4.7, 4.82],
    },
    {
      id: 'pesanan', label: 'Pesanan terbuka', value: 148,
      format: 'int', unit: 'pesanan', delta: 5.7, dir: 'up', foot: '23 menunggu persetujuan',
      spark: [121, 128, 126, 133, 130, 137, 139, 136, 142, 140, 145, 148],
    },
    {
      id: 'persediaan', label: 'Nilai persediaan', value: 12_740_000_000,
      format: 'rp-compact', delta: -3.1, dir: 'down', foot: 'Perputaran 5,8× per tahun',
      spark: [14.2, 14.0, 13.8, 13.9, 13.5, 13.4, 13.1, 13.2, 12.9, 13.0, 12.9, 12.74],
    },
    {
      id: 'piutang', label: 'Piutang jatuh tempo', value: 1_942_800_000,
      format: 'rp-compact', delta: 18.6, dir: 'down', foot: '14 faktur lewat 30 hari',
      spark: [1.35, 1.28, 1.41, 1.39, 1.52, 1.48, 1.55, 1.61, 1.58, 1.72, 1.64, 1.94],
    },
  ];

  /* --- Tren pendapatan vs target (12 bulan, miliar rupiah) ----------------- */
  const revenueTrend = {
    labels: ['Sep', 'Okt', 'Nov', 'Des', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu'],
    actual: [3.12, 3.44, 3.21, 3.92, 4.08, 3.77, 4.41, 4.19, 4.63, 4.52, 4.71, 4.82],
    target: [3.30, 3.40, 3.50, 3.60, 3.80, 3.90, 4.10, 4.30, 4.40, 4.60, 4.80, 5.10],
  };

  /* --- Pendapatan per lini produk (magnitudo satu ukuran -> satu rona) ----- */
  const revenueByLine = [
    { label: 'Komponen otomotif', value: 1_842_000_000 },
    { label: 'Suku cadang mesin', value: 1_216_500_000 },
    { label: 'Perakitan elektronik', value: 864_300_000 },
    { label: 'Perkakas industri', value: 573_100_000 },
    { label: 'Jasa purna jual', value: 327_500_000 },
  ];

  /* --- Komposisi nilai persediaan (identitas -> palet kategorikal) --------- */
  const inventoryMix = [
    { label: 'Bahan baku', value: 4_712_000_000 },
    { label: 'Barang dalam proses', value: 3_128_000_000 },
    { label: 'Barang jadi', value: 2_845_000_000 },
    { label: 'Suku cadang', value: 1_364_000_000 },
    { label: 'Kemasan', value: 691_000_000 },
  ];

  /* --- Umur piutang (ember ordinal -> ramp sekuensial satu rona) ---------- */
  const arAging = [
    { label: 'Belum jatuh tempo', short: 'Lancar', value: 3_284_000_000, count: 41 },
    { label: '1–30 hari', short: '1–30', value: 1_128_400_000, count: 19 },
    { label: '31–60 hari', short: '31–60', value: 512_900_000, count: 9 },
    { label: '61–90 hari', short: '61–90', value: 214_600_000, count: 4 },
    { label: 'Lebih dari 90 hari', short: '>90', value: 86_900_000, count: 2 },
  ];

  /* --- Antrean persetujuan ------------------------------------------------- */
  const approvals = [
    { id: 'SO-2026-0418', kind: 'Pesanan Penjualan', title: 'PT Sentosa Baja Perkasa', amount: 428_500_000, by: 'Rina Kusuma', ago: '18 menit lalu', tone: 'accent', icon: 'cart', reason: 'Melebihi plafon kredit pelanggan' },
    { id: 'PO-2026-0233', kind: 'Pesanan Pembelian', title: 'CV Logam Jaya Abadi', amount: 186_200_000, by: 'Bagus Hartono', ago: '52 menit lalu', tone: 'info', icon: 'truck', reason: 'Nilai di atas Rp 150 jt' },
    { id: 'PR-2026-0091', kind: 'Permintaan Pembelian', title: 'Suku cadang mesin CNC', amount: 74_900_000, by: 'Dewi Anggraini', ago: '2 jam lalu', tone: 'info', icon: 'truck', reason: 'Pengadaan non-anggaran' },
    { id: 'JV-2026-0774', kind: 'Jurnal Penyesuaian', title: 'Koreksi penyusutan Jul 2026', amount: 42_300_000, by: 'Andi Firmansyah', ago: '3 jam lalu', tone: 'warn', icon: 'ledger', reason: 'Periode akan ditutup' },
    { id: 'SO-2026-0416', kind: 'Pesanan Penjualan', title: 'PT Mitra Teknik Utama', amount: 96_750_000, by: 'Rina Kusuma', ago: '5 jam lalu', tone: 'accent', icon: 'cart', reason: 'Diskon 12% di atas wewenang' },
  ];

  /* --- Peringatan stok ------------------------------------------------------ */
  const stockAlerts = [
    { sku: 'BRG-1042', name: 'Pelat baja SPHC 3mm', onHand: 42, min: 250, unit: 'lbr', tone: 'danger', note: 'Habis dalam ±2 hari' },
    { sku: 'BRG-2217', name: 'Bearing 6204-2RS', onHand: 310, min: 500, unit: 'pcs', tone: 'warn', note: 'PO tiba 18 Agu' },
    { sku: 'BRG-0885', name: 'Oli hidrolik ISO VG 46', onHand: 18, min: 60, unit: 'drum', tone: 'danger', note: 'Belum ada PO' },
    { sku: 'BRG-3390', name: 'Kabel NYY 4×10mm', onHand: 640, min: 800, unit: 'm', tone: 'warn', note: 'PO tiba 21 Agu' },
  ];

  /* --- Aktivitas terbaru ----------------------------------------------------- */
  const activity = [
    { who: 'Rina Kusuma', what: 'membuat pesanan', ref: 'SO-2026-0421', when: '09:42', tone: 'accent' },
    { who: 'Sistem', what: 'memposting faktur', ref: 'INV-2026-1188', when: '09:31', tone: 'ok' },
    { who: 'Bagus Hartono', what: 'menerima barang', ref: 'GR-2026-0512', when: '08:57', tone: 'ok' },
    { who: 'Dewi Anggraini', what: 'menutup perintah kerja', ref: 'WO-2026-0177', when: '08:24', tone: 'ok' },
    { who: 'Andi Firmansyah', what: 'menolak jurnal', ref: 'JV-2026-0771', when: '07:58', tone: 'warn' },
    { who: 'Sistem', what: 'menjalankan penilaian ulang stok', ref: 'BATCH-0088', when: '06:00', tone: 'info' },
  ];

  /* --- Notifikasi ------------------------------------------------------------- */
  const notifications = [
    { title: '5 dokumen menunggu persetujuan Anda', note: 'Nilai total Rp 828,6 jt', when: '18 menit lalu', tone: 'accent', unread: true },
    { title: 'Stok Pelat baja SPHC 3mm kritis', note: 'Sisa 42 lbr dari minimum 250 lbr', when: '1 jam lalu', tone: 'danger', unread: true },
    { title: 'Faktur INV-2026-1102 lewat 47 hari', note: 'PT Bangun Sarana Teknik — Rp 96,4 jt', when: '3 jam lalu', tone: 'warn', unread: true },
    { title: 'Tutup buku Juli 2026 selesai', note: 'Dikunci oleh Andi Firmansyah', when: 'Kemarin', tone: 'ok', unread: false },
  ];

  /* --- Pesanan penjualan ------------------------------------------------------- */
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

  /* Baris rincian per pesanan; pesanan tanpa entri memakai baris umum. */
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

  /* --- Linimasa per pesanan --------------------------------------------------- */
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

  /* --- Pelanggan ---------------------------------------------------------------- */
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

  /* --- Faktur --------------------------------------------------------------------- */
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

  /* --- Pesanan pembelian ------------------------------------------------------------ */
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

  /* --- Stok barang ------------------------------------------------------------------- */
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

  /* --- Perintah kerja (papan) ---------------------------------------------------------- */
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

  /* --- Jurnal umum -------------------------------------------------------------------- */
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

  /* --- Karyawan ---------------------------------------------------------------------- */
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

  /* --- Peran & izin ------------------------------------------------------------------ */
  const roles = [
    { id: 'admin', label: 'Admin Sistem', users: 2 },
    { id: 'manajer', label: 'Manajer Operasional', users: 4 },
    { id: 'penjualan', label: 'Staf Penjualan', users: 11 },
    { id: 'gudang', label: 'Staf Gudang', users: 8 },
    { id: 'keuangan', label: 'Staf Keuangan', users: 6 },
  ];

  /* level: full = ubah & setujui, read = lihat saja, none = tanpa akses */
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

  return {
    org, nav, kpis, revenueTrend, revenueByLine, inventoryMix, arAging,
    approvals, stockAlerts, activity, notifications,
    salesOrders, salesOrderLines, defaultLines, orderTimeline, defaultTimeline,
    customers, invoices, purchaseOrders, suppliers,
    stockItems, stockMoves, workOrderColumns, workOrders,
    journals, employees, roles, permissions,
  };
})();
