# 5 — Cakupan & batas purwarupa

Dokumen ini memisahkan apa yang **benar-benar berjalan** dari apa yang
**dirancang tetapi belum dibuat**, supaya tidak ada yang salah menduga saat
mencoba.

## Berjalan penuh

### Kerangka
- Rail navigasi **37 butir dalam 16 kelompok**, dapat diciutkan, dengan lencana
  pekerjaan menunggu `[n]`
- Strip kepala dokumen (perusahaan · cabang · periode · mata uang)
- Perutean berbasis URL — setiap layar dapat ditandai dan dibagikan
- Tema terang / gelap / ikut sistem, tersimpan di `localStorage`
- Palet perintah lintas jenis (`Ctrl/Cmd + K`, `/`) — mencari halaman, pesanan,
  pelanggan, stok, lead CRM, proyek, aset, dan dokumen
- Notifikasi, menu pengguna, toast
- Pintasan papan ketik: `Ctrl/Cmd + N` (pesanan baru), `Esc` (tutup laci/modal)

### Data & tabel
- Pencarian teks bebas per register (22 register)
- Saringan status berupa chip yang membawa cacahnya sendiri
- Pengurutan setiap kolom, termasuk pengurutan menurut tingkat masalah pada stok
- Seleksi baris, seleksi seluruh halaman, dan bilah aksi massal
- Paginasi 10 baris per halaman
- Keadaan kosong dengan jalan keluar
- Tabel terpadu — kelas `.tbl` dan `.table` teraliaskan ke tampilan seragam

### Rekaman (laci)
- Laci pesanan penjualan: panel keputusan, rincian, posisi kredit pelanggan,
  baris barang, subtotal/PPN/total, linimasa
- **Setujui / Tolak benar-benar mengubah data** — status berubah, linimasa
  bertambah, daftar tergambar ulang, toast muncul
- Laci umum untuk register lain, dibangun dari definisi kolomnya
- Laci perintah kerja dengan kemajuan dan penanda masalah

### Dasbor & KPI
- 8 widget dasbor dapat dikustomisasi (seret, tambah, hapus, reset)
- Garis pendapatan vs target, dengan crosshair dan tooltip
- Bilah komposisi bertumpuk dengan legenda dan porsi
- Kolom umur piutang memakai ramp sekuensial
- Sparkline pada setiap ubin KPI dasbor
- Sakelar Grafik / Tabel pada dua grafik dasbor
- Semua digambar ulang saat lebar wadah atau tema berubah
- Ubin KPI seragam — kelas `.kpi-tile` dengan `.kpi-value` dan `.kpi-label`
  di seluruh modul, kecuali dasbor memakai `.kpi-metric` di dalam `.card.kpi`

### AI Copilot (dasbor)
- Panel percakapan AI di dasbor dengan 3 pesan contoh
- Tombol kirim dan bidang masukan

### Kotak Persetujuan
- Antrean lintas modul: kartu per dokumen menunggu (SO, PO, PR, WO)
- Tombol Setujui/Tolak per kartu, benar-benar mengubah data

### CRM — Lead & Peluang
- Papan Kanban 6 tahap (Prospek → Kualifikasi → Penawaran → Negosiasi →
  Menang → Kalah) dengan seret-dan-lepas
- KPI pipeline: total deal, rata-rata nilai, konversi
- Saringan dan pencarian lead

### Data Master — Produk & Layanan
- Register 10 produk dengan SKU, kategori, harga, stok
- Laci rekaman dengan rincian produk

### Penjualan
- **Penawaran**: register 6 penawaran, chip status, laci rekaman
- **Pesanan Penjualan**: register 18 pesanan, laci rekaman dengan panel
  keputusan dan posisi kredit
- **Faktur**: register 10 faktur, pencarian, saringan
- **Pelanggan**: register 9 pelanggan, laci rekaman
- **Modal pesanan baru** dengan petunjuk plafon kredit langsung, dan
  penyimpanan yang menambahkan baris nyata ke daftar

### POS / Kasir
- KPI tiles harian (pendapatan, transaksi, rata-rata, metode bayar)
- Tabel shift kasir (2 shift) dengan status
- Tabel transaksi (6 transaksi) dengan saringan

### Pembelian
- **Permintaan Pembelian**: register 6 permintaan, chip status
- **RFQ & Vendor**: register 4 RFQ, saringan status
- **Pesanan Pembelian**: register 10 PO, saringan status, laci rekaman
- **Pemasok**: register 7 pemasok, laci rekaman

### Inventaris & Rantai Pasok
- **Stok Barang**: register 12 barang, pengurutan menurut masalah, peringatan
  stok kritis/rendah
- **Mutasi Stok**: register 10 mutasi, saringan jenis
- **Rantai Pasok**: KPI tiles + register 6 pengiriman, status pelacakan

### Produksi — Perintah Kerja
- Papan Kanban 4 kolom (Antre → Berjalan → QC → Selesai)
- Saringan lini produksi
- Laci perintah kerja dengan kemajuan dan penanda masalah

### Proyek
- Register 5 proyek dengan kartu ringkasan
- Gantt chart inline per proyek (bilah tugas, persentase kemajuan)

### Keuangan
- **Bagan Akun (COA)**: pohon hierarkis 57 akun dalam 5 kategori; saldo
  dihitung dari buku besar per cabang/periode; klik akun → kartu buku besar
- **Piutang Usaha**: ember umur piutang dihitung dari sub-buku faktur,
  dicocokkan dengan saldo 1-1200
- **Hutang Usaha**: register 11 tagihan bercap cabang; tagihan jasa diposting
  ke akun beban, tagihan barang ke persediaan + PPN masukan
- **Kas & Bank**: 11 rekening bercap cabang; saldo = saldo awal + jurnal kas;
  klik rekening → kartu buku besar tersaring rekening
- **Jurnal Umum**: ±550 jurnal berpasangan (otomatis + manual) dengan laci
  baris debit/kredit, dokumen sumber, aksi posting/tolak, dan modal jurnal
  memorial dengan validasi
- **Anggaran**: realisasi per akun diambil dari buku besar TA 2026; anggaran
  cabang = porsi anggaran perusahaan

### Laporan keuangan
- **Kartu Buku Besar**: pilih akun (dan rekening untuk 1-1100), saldo awal,
  mutasi dengan saldo berjalan, klik baris → jurnal asal
- **Neraca Saldo**: saldo awal / mutasi / saldo akhir D–K; mode per cabang
  dengan kolom eliminasi & konsolidasi
- **Laba Rugi** dan **Neraca**: per cabang (dengan % pendapatan) atau
  konsolidasi (kolom per cabang · eliminasi · konsolidasi)
- **Laporan Konsolidasi**: kontribusi per cabang + tiga laporan konsolidasi
- **Integrasi & Rekonsiliasi**: 11 pemeriksaan sub-buku vs buku besar,
  ringkasan posting per modul, peta aturan posting

### Cabang
- **Manajemen Cabang**: kartu KPI 4 cabang (pusat, pabrik, gudang, cabang
  penjualan), laci profil & rekening, tambah cabang baru, nonaktifkan cabang

### SDM
- **Karyawan**: register 12 karyawan, saringan departemen/status
- **Kehadiran & Cuti**: register 10 catatan kehadiran, saringan status
- **Penggajian**: register 8 slip gaji, saringan periode/status

### Aset
- **Daftar Aset**: register 8 aset, saringan status/kategori
- **Pemeliharaan**: register 6 perintah pemeliharaan, relasi aset

### Dokumen — Repositori
- Register 8 dokumen, folder, versi, tanggal kedaluwarsa
- Saringan status dan kategori

### Alur Kerja
- Register 7 template alur kerja
- Deskripsi langkah dan pemicu

### Analitik
- **BI & Laporan**: dasbor 7 widget (grafik, tabel, metrik)
- 10 laporan tersedia (penjualan, keuangan, operasional)
- **Balanced Scorecard**: 4 perspektif Kaplan & Norton × 4 metrik per perspektif
  (16 metrik total), gauge pencapaian

### Sistem
- **Kepatuhan & GRC**: register 8 item kepatuhan, status ketaatan
- **Peran & Izin**: matriks interaktif 5 peran × 11 fitur, klik untuk siklus
  (ubah & setujui → lihat saja → tanpa akses)
- **Jejak Audit**: register 10 entri, pelacakan perubahan
- **Pengaturan**: formulir konfigurasi perusahaan & tampilan
- **Sistem Desain**: galeri token warna, tipografi, spasi, dan komponen

## Dirancang, belum dibuat layarnya

Butir-butir ini ada di arsitektur informasi dan alur, tetapi belum punya layar
di purwarupa:

- Laporan arus kas (metode tidak langsung)
- Bill of Materials dan perencanaan kebutuhan bahan
- Manajemen gudang tingkat lokasi rak
- Multi-mata uang dan penjabaran kurs
- Portal pelanggan dan pemasok

## Batas yang disengaja

| Batas | Alasan |
| --- | --- |
| **Data di memori** | Menyegarkan halaman mengembalikan keadaan awal. Purwarupa menguji desain, bukan ketahanan data. |
| **Tanpa peladen & tanpa autentikasi** | Layar masuk tidak memengaruhi keputusan desain yang sedang diuji. |
| **Pemilih perusahaan belum aktif** | Cabang dan periode dapat diganti dan memengaruhi seluruh angka; pemilih perusahaan tetap informatif karena purwarupa memuat data satu entitas hukum. |
| **Saldo awal hasil migrasi** | Saldo awal 1 Jan 2026 per cabang diturunkan dari sub-buku (bank, kartu stok, register aset) dan pos eksplisit; ekuitas cabang menjadi penyeimbang (RK Kantor Pusat). Ini meniru migrasi data, bukan pembukuan tahun sebelumnya. |
| **Rekening valas tidak dikonsolidasi** | Giro USD ditampilkan apa adanya; penjabaran kurs berada di luar cakupan. |
| **Baris barang di modal tidak dapat diubah** | Tabel baris sudah menunjukkan bentuk dan perhitungannya; penyuntingan sel adalah pekerjaan implementasi, bukan pekerjaan desain. |
| **Ekspor, cetak, dan aksi massal** | Menjawab lewat toast "belum tersedia di purwarupa" — jujur, bukan diam atau tampak rusak. |
| **Tanpa webfont** | Tumpukan muka sistem menghilangkan risiko kegagalan pemuatan; peran mono/sans yang dipasangkan sudah membawa kepribadian tipografinya. |

## Verifikasi

`tools/smoke.mjs` menjalankan pemeriksaan berikut pada setiap build:

- **36 layar** × 2 tema dibuka; galat konsol dan galat halaman ditangkap
- badan halaman tidak meluap menyamping pada 1440 px maupun 390 px
- setiap layar menghasilkan konten (bukan kanvas kosong)
- laci rekaman, palet perintah, modal, dan toast terbuka serta berfungsi
- pemilih cabang mengubah konteks; neraca cabang seimbang; laci jurnal
  menautkan ke kartu buku besar; jurnal memorial baru terposting; seluruh
  rekonsiliasi sub-buku tetap cocok sesudahnya
- tangkapan layar disimpan ke `dist/shots/` untuk ditinjau mata

Palet kategorikal diverifikasi terpisah dengan validator palet — pita
lightness, lantai chroma, pemisahan CVD, lantai penglihatan normal, dan kontras
terhadap permukaan — untuk kedua tema.

## Langkah berikutnya yang disarankan

1. Uji ketergunaan alur persetujuan bersama 3–5 manajer operasional sungguhan;
   yang diukur adalah waktu sampai keputusan, bukan pendapat tentang tampilan.
2. Uji register stok di perangkat gudang yang sebenarnya, sambil berdiri.
3. Terjemahkan token ke dalam kerangka kerja yang dipilih tim rekayasa;
   `tokens.css` sengaja dibuat agar dapat diekspor apa adanya.
4. Tambahkan laporan arus kas dan tutup buku periode (penutupan akun nominal
   ke laba ditahan) di atas mesin buku besar yang sudah ada.
