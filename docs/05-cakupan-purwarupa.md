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
- **Bagan Akun (COA)**: pohon hierarkis 47 akun dalam 5 kategori (Aset,
  Liabilitas, Ekuitas, Pendapatan, Beban), kartu ringkasan per kategori
- **Piutang Usaha**: KPI tiles + grafik ember umur piutang (4 ember) +
  register faktur terbuka
- **Hutang Usaha**: register 8 tagihan + ember umur + kecocokan PO
- **Kas & Bank**: KPI tiles + register 6 rekening, multi-mata uang
- **Jurnal Umum**: register 10 jurnal, saringan posting otomatis/manual
- **Anggaran**: 2 tab — per pusat biaya (8 CC) dan per akun manajemen
  (15 akun), masing-masing dengan KPI tiles + register + gauge realisasi

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

- Laporan keuangan (neraca, laba rugi, arus kas)
- Bill of Materials dan perencanaan kebutuhan bahan
- Manajemen gudang tingkat lokasi rak
- Multi-mata uang dan penjabaran kurs
- Portal pelanggan dan pemasok

## Batas yang disengaja

| Batas | Alasan |
| --- | --- |
| **Data di memori** | Menyegarkan halaman mengembalikan keadaan awal. Purwarupa menguji desain, bukan ketahanan data. |
| **Tanpa peladen & tanpa autentikasi** | Layar masuk tidak memengaruhi keputusan desain yang sedang diuji. |
| **Pemilih konteks belum aktif** | Perusahaan, cabang, dan periode tampil sebagai kendali tetapi belum dapat diganti; menggantinya memerlukan set data lengkap per kombinasi. |
| **Baris barang di modal tidak dapat diubah** | Tabel baris sudah menunjukkan bentuk dan perhitungannya; penyuntingan sel adalah pekerjaan implementasi, bukan pekerjaan desain. |
| **Ekspor, cetak, dan aksi massal** | Menjawab lewat toast "belum tersedia di purwarupa" — jujur, bukan diam atau tampak rusak. |
| **Tanpa webfont** | Tumpukan muka sistem menghilangkan risiko kegagalan pemuatan; peran mono/sans yang dipasangkan sudah membawa kepribadian tipografinya. |

## Verifikasi

`tools/smoke.mjs` menjalankan pemeriksaan berikut pada setiap build:

- **37 layar** × 2 tema dibuka; galat konsol dan galat halaman ditangkap
- badan halaman tidak meluap menyamping pada 1440 px maupun 390 px
- setiap layar menghasilkan konten (bukan kanvas kosong)
- laci rekaman, palet perintah, modal, dan toast terbuka serta berfungsi
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
4. Rancang layar laporan keuangan — satu-satunya wilayah yang bentuknya belum
   dapat diturunkan dari keempat arketipe yang ada.
