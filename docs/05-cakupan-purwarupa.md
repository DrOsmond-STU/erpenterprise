# 5 — Cakupan & batas purwarupa

Dokumen ini memisahkan apa yang **benar-benar berjalan** dari apa yang
**dirancang tetapi belum dibuat**, supaya tidak ada yang salah menduga saat
mencoba.

## Berjalan penuh

### Kerangka
- Rail navigasi 15 layar, dapat diciutkan, dengan lencana pekerjaan menunggu
- Strip kepala dokumen (perusahaan · cabang · periode · mata uang)
- Perutean berbasis URL — setiap layar dapat ditandai dan dibagikan
- Tema terang / gelap / ikut sistem, tersimpan di `localStorage`
- Palet perintah lintas jenis (`Ctrl/Cmd + K`, `/`)
- Notifikasi, menu pengguna, toast

### Data & tabel
- Pencarian teks bebas per register
- Saringan status berupa chip yang membawa cacahnya sendiri
- Pengurutan setiap kolom, termasuk pengurutan menurut tingkat masalah pada stok
- Seleksi baris, seleksi seluruh halaman, dan bilah aksi massal
- Paginasi 10 baris per halaman
- Keadaan kosong dengan jalan keluar

### Rekaman
- Laci pesanan penjualan: panel keputusan, rincian, posisi kredit pelanggan,
  baris barang, subtotal/PPN/total, linimasa
- **Setujui / Tolak benar-benar mengubah data** — status berubah, linimasa
  bertambah, daftar tergambar ulang, toast muncul
- Laci umum untuk register lain, dibangun dari definisi kolomnya
- Laci perintah kerja dengan kemajuan dan penanda masalah

### Grafik
- Garis pendapatan vs target, dengan crosshair dan tooltip
- Bilah komposisi bertumpuk dengan legenda dan porsi
- Kolom umur piutang memakai ramp sekuensial
- Sparkline pada setiap ubin KPI
- Sakelar Grafik / Tabel pada dua grafik dasbor
- Semua digambar ulang saat lebar wadah atau tema berubah

### Lain-lain
- Modal pesanan baru dengan petunjuk plafon kredit langsung, dan penyimpanan
  yang menambahkan baris nyata ke daftar
- Matriks izin yang dapat diklik: ubah & setujui → lihat saja → tanpa akses
- Papan produksi dengan saringan lini
- Halaman pengaturan dan halaman sistem desain

## Dirancang, belum dibuat layarnya

Butir-butir ini ada di arsitektur informasi dan alur, tetapi belum punya layar
di purwarupa:

- Laporan keuangan (neraca, laba rugi, arus kas)
- Bill of Materials dan perencanaan kebutuhan bahan
- Kehadiran dan penggajian
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

- 15 layar × 2 tema dibuka; galat konsol dan galat halaman ditangkap
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
   dapat diturunkan dari ketiga arketipe yang ada.
