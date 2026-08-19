# 1 — Ringkasan produk & persona

## Masalah yang dilayani

Perusahaan manufaktur dan distribusi kelas menengah menjalankan operasinya di
atas potongan-potongan sistem: pesanan di spreadsheet, stok di kartu gudang,
pembukuan di aplikasi akuntansi terpisah. Akibatnya tiga hal berulang:

1. **Keputusan terlambat.** Persetujuan pesanan menunggu seseorang membuka
   berkas yang benar.
2. **Angka tidak sepakat.** Nilai persediaan menurut gudang berbeda dari
   menurut keuangan karena keduanya memotret pada waktu yang berbeda.
3. **Jejak hilang.** Ketika ada selisih, tidak ada satu tempat pun yang bisa
   menjawab siapa mengubah apa dan kapan.

ERP Enterprise menyatukan alur dokumen — pesanan, penerimaan, perintah kerja,
faktur, jurnal — di satu basis data, dengan konteks yang sama (perusahaan,
cabang, periode) mengikat setiap angka di layar.

## Tenant peraga

Seluruh purwarupa memakai satu tenant fiktif agar angkanya konsisten dan dapat
diperiksa silang antar layar:

**PT Karya Nusantara Mandiri** — manufaktur komponen otomotif & distribusi.
Empat lokasi (Jakarta pusat, Cikarang pabrik, Surabaya gudang, Medan cabang),
sekitar 180 karyawan, pendapatan Rp 4,8 M per bulan.

## Persona

### Osmond — Manajer Operasional (persona utama purwarupa)
Membuka aplikasi 6–10 kali sehari, jarang lebih dari lima menit sekali buka.
Pekerjaannya adalah **memutuskan**: menyetujui pesanan yang melewati plafon
kredit, memilih perintah kerja mana yang didahulukan, memutuskan apakah stok
kritis dibeli sekarang atau menunggu PO yang sudah jalan.

> Kebutuhan desain: apa yang perlu diputuskan harus terbaca sekali pandang,
> lengkap dengan alasan mengapa dokumen itu berhenti di mejanya.

### Rina — Account Executive, Penjualan
Membuat 10–20 pesanan per hari, sebagian besar dari pelanggan berulang.
Kecepatan pengisian jauh lebih penting daripada keindahan.

> Kebutuhan desain: formulir yang mengingat konteks, dan peringatan plafon
> kredit **sebelum** menekan kirim, bukan setelahnya.

### Fitri — Kepala Gudang
Bekerja dari terminal di lantai gudang, kadang dari ponsel. Yang dilihat hanya
dua hal: apa yang harus disiapkan hari ini, dan barang apa yang menipis.

> Kebutuhan desain: tabel padat harus tetap terbaca di layar kecil; status stok
> harus terbaca tanpa mengandalkan warna saja.

### Andi — Akuntan Senior
Memakai aplikasi paling lama per sesi. Bekerja dengan jurnal, rekonsiliasi, dan
tutup buku. Toleransinya terhadap kesalahan angka nol.

> Kebutuhan desain: angka rata kanan, lebar digit seragam, dan format
> id-ID yang konsisten di setiap layar.

## Prinsip desain

1. **Ringkasan sebelum rincian.** Setiap layar menjawab "apa yang perlu saya
   lakukan?" sebelum menampilkan tabel.
2. **Konteks selalu terlihat.** Perusahaan, cabang, periode, dan mata uang
   menempel di strip kepala dokumen — sehingga tidak pernah ada keraguan angka
   yang sedang dilihat itu milik siapa.
3. **Keadaan punya bentuk, bukan hanya warna.** Setiap status membawa ikon dan
   teks; warna hanya memperkuat.
4. **Angka adalah tipografi.** Seluruh nilai, kode dokumen, SKU, dan nomor akun
   memakai muka monospace dengan lebar digit seragam, supaya kolom dapat
   dipindai secara vertikal.
5. **Tidak ada jalan buntu.** Keadaan kosong, kegagalan saringan, dan larangan
   akses selalu menawarkan langkah berikutnya.

## Cakupan versi purwarupa

| Modul | Status di purwarupa |
| --- | --- |
| Dasbor (termasuk AI Copilot) | Lengkap — 8 widget dapat dikustomisasi, sparkline, grafik SVG |
| Kotak Persetujuan | Lengkap — antrean lintas modul, setujui/tolak mengubah data |
| Data Master — produk & layanan | Register lengkap |
| CRM — lead & peluang | Papan Kanban 6 tahap, KPI pipeline |
| Penjualan — penawaran, pesanan, faktur, pelanggan | Lengkap, termasuk laci rekaman, persetujuan plafon kredit, modal pesanan baru |
| POS / Kasir | Lengkap — shift kasir, transaksi, KPI harian |
| Pembelian — permintaan, RFQ, pesanan, pemasok | Register lengkap, alur PR → RFQ → PO |
| Inventaris — stok, mutasi | Register lengkap, pengurutan menurut masalah |
| Rantai Pasok — pengiriman | Register lengkap |
| Produksi — perintah kerja | Papan lengkap, saringan lini, penanda masalah |
| Proyek — daftar & Gantt | Register + kartu proyek + Gantt chart |
| Keuangan — bagan akun (COA) | Pohon hierarkis 47 akun, 5 kategori |
| Keuangan — piutang usaha | KPI + ember umur + register faktur terbuka |
| Keuangan — hutang usaha | Register + ember umur + kecocokan PO |
| Keuangan — kas & bank | Register rekening, multi-mata uang |
| Keuangan — jurnal umum | Register lengkap, posting otomatis & manual |
| Keuangan — anggaran | 2 tab: per pusat biaya (8 CC) + per akun manajemen (15 akun) |
| SDM — karyawan, kehadiran, penggajian | Register lengkap per sub-modul |
| Aset — daftar aset, pemeliharaan | Register lengkap, relasi aset-perintah pemeliharaan |
| Dokumen — repositori | Register dengan folder, versi, kedaluwarsa |
| Alur Kerja — desainer | Register 7 template alur kerja |
| Analitik — BI & laporan | Dasbor widget 7 widget, 10 laporan tersedia |
| Analitik — Balanced Scorecard | Dasbor 4 perspektif Kaplan & Norton, 16 metrik |
| Sistem — kepatuhan & GRC | Register 8 item kepatuhan |
| Sistem — peran & izin | Matriks interaktif, 5 peran × 11 fitur |
| Sistem — jejak audit | Register 10 entri |
| Sistem — pengaturan | Halaman pengaturan perusahaan & tampilan |
| Sistem — sistem desain | Referensi token & komponen |
| Laporan keuangan (neraca, laba rugi) | Dirancang di IA, belum dibuat layarnya |
| BOM & perencanaan kebutuhan bahan | Dirancang di IA, belum dibuat layarnya |
| Gudang tingkat rak | Dirancang di IA, belum dibuat layarnya |
| Multi-mata uang & kurs | Dirancang di IA, belum dibuat layarnya |
| Portal pelanggan & pemasok | Dirancang di IA, belum dibuat layarnya |
