# 7 — Spesifikasi fungsional per modul

Dokumen ini mendaftarkan fitur, aturan bisnis, dan validasi setiap modul
ERP Enterprise sebagaimana dibangun di purwarupa. Modul disusun sesuai
urutan navigasi.

> **Catatan:** Purwarupa menggunakan data di memori. Semua fitur di bawah
> berjalan penuh di sisi klien kecuali dinyatakan sebaliknya.

---

## 1. Dasbor & ikhtisar

### 1.1 Dasbor utama (`#/dasbor`)

**Fitur:**
- 4 ubin KPI dengan nilai, delta (%), sparkline, dan catatan kaki
- Grafik garis pendapatan vs target 12 bulan (SVG, crosshair + tooltip)
- Grafik bilah komposisi pendapatan per lini produk
- Grafik bilah ember umur piutang (ramp sekuensial)
- Grafik bilah komposisi persediaan
- Antrean persetujuan 5 dokumen teratas (klik → laci rekaman)
- Peringatan stok kritis 4 item
- Riwayat aktivitas 6 entri terakhir
- Sakelar Grafik / Tabel pada dua grafik
- AI Copilot panel dengan riwayat percakapan demo

**Aturan bisnis:**
- Delta positif + arah `up` = hijau; delta negatif + arah `down` = merah
- Piutang jatuh tempo arah `down` → delta positif = merah (semakin besar semakin buruk)
- Sparkline menampilkan 12 titik data (1 tahun)

### 1.2 Kotak Persetujuan (`#/persetujuan`)

**Fitur:**
- Register dokumen menunggu persetujuan dari semua modul
- Laci rekaman dengan panel keputusan, rincian, posisi kredit
- Aksi Setujui / Tolak yang mengubah data nyata
- Linimasa audit per dokumen

**Aturan bisnis:**
- Pesanan penjualan di atas plafon kredit → memerlukan persetujuan manajer
- Diskon di atas wewenang → eskalasi
- Jurnal penyesuaian → persetujuan akuntan senior
- PO di atas Rp 150 jt → persetujuan manajer

---

## 2. Data master

### 2.1 Produk & layanan (`#/data-master`)

**Fitur:**
- Register 10 produk/jasa dengan pencarian, saringan kategori, chip status
- Kolom: ID, nama, kategori, satuan, harga jual, harga pokok, berat, SKU, pajak
- Aksi: tombol Tambah Produk, Ekspor

**Validasi:**
- Harga jual ≥ 0 (0 untuk bahan baku yang tidak dijual langsung)
- SKU unik

---

## 3. CRM

### 3.1 Lead & peluang (`#/lead`)

**Fitur:**
- Papan Kanban 6 kolom (prospek → kualifikasi → penawaran → negosiasi → menang → kalah)
- Kartu peluang menampilkan: nama, perusahaan, nilai, probabilitas, PIC
- 4 ubin KPI: Pipeline aktif, Rata-rata deal, Menang, Kalah
- Pencarian dan saringan sumber
- Page-head dengan tombol Peluang Baru

**Aturan bisnis:**
- Pipeline value = Σ (value × prob%) untuk stage ≠ menang/kalah
- Peluang `menang` → prob 100%, otomatis proses SO
- Peluang `kalah` → prob 0%, evaluasi penyebab

---

## 4. Penjualan

### 4.1 Penawaran (`#/penawaran`)

**Fitur:**
- Register penawaran: ID, tanggal, pelanggan, nilai, validitas, status, PIC
- Chip status: draf, terkirim, diterima, ditolak
- Relasi ke peluang CRM (bidang `opp`)

**Aturan bisnis:**
- Penawaran diterima → dapat dikonversi ke pesanan penjualan
- Validitas lewat → peringatan

### 4.2 Pesanan penjualan (`#/pesanan-penjualan`)

**Fitur:**
- Register 18 pesanan dengan pencarian teks bebas
- Chip status (6 status) dengan cacah per status
- Pengurutan per kolom apa pun
- Seleksi baris + bilah aksi massal (Setujui, Cetak, Batalkan)
- Paginasi 10 baris per halaman
- Laci rekaman: panel keputusan, rincian pelanggan, posisi kredit, baris
  barang, subtotal/PPN/total, linimasa

**Aturan bisnis:**
- Jika `amount > sisa plafon kredit pelanggan` → status `menunggu` + masuk antrean persetujuan
- Aksi Setujui/Tolak: mengubah status, memperbarui linimasa, menampilkan toast
- PPN 11% dari subtotal setelah diskon

### 4.3 Faktur (`#/faktur`)

**Fitur:**
- Register 10 faktur: ID, tanggal, pelanggan, nilai, terbayar, jatuh tempo, status
- Chip status: belum-dibayar, sebagian, lunas, jatuh-tempo
- Hitung otomatis hari lewat jatuh tempo

**Aturan bisnis:**
- `paid = 0 && today > dueDate` → status `jatuh-tempo`
- `paid > 0 && paid < amount` → status `sebagian`
- Faktur jatuh tempo > 30 hari → peringatan di dasbor

### 4.4 Pelanggan (`#/pelanggan`)

**Fitur:**
- Register 9 pelanggan: ID, nama, segmen, PIC, kota, limit, terpakai, termin, status
- Indikator pemakaian kredit visual
- Chip status: aktif, ditahan, nonaktif

**Validasi:**
- Plafon kredit > 0 untuk pelanggan aktif
- Status `ditahan` → blokir pesanan baru tanpa override manajer

---

## 5. POS / Kasir

### 5.1 Kasir (`#/kasir`)

**Fitur:**
- 3 ubin KPI: Penjualan hari ini (vs target), Rata-rata keranjang, Refund rate
- Tabel shift aktif (2 kasir): kasir, toko, waktu, kas, transaksi, penjualan
- Tabel transaksi terkini: ID, waktu, kasir, items, total, pembayaran, status
- Page-head dengan tombol Shift Baru

**Aturan bisnis:**
- Penjualan hari ini = Σ shift.totalSales
- Metode pembayaran: Tunai, QRIS, Debit, Kredit, Transfer
- Transaksi void tidak dihitung dalam total penjualan

---

## 6. Pembelian

### 6.1 Permintaan pembelian (`#/permintaan-pembelian`)

**Fitur:**
- Register 6 permintaan: ID, tanggal, peminta, departemen, deskripsi, nilai, status, prioritas
- Chip status + chip prioritas
- Alur: menunggu → disetujui → selesai (atau ditolak)

**Aturan bisnis:**
- Prioritas `tinggi` → SLA persetujuan 24 jam
- PR disetujui → dapat dikonversi ke RFQ

### 6.2 RFQ & vendor (`#/rfq`)

**Fitur:**
- Register 4 RFQ: ID, tanggal, judul, peminta, vendor, deadline, harga terbaik, status
- Relasi ke permintaan pembelian (bidang `prRef`)

**Aturan bisnis:**
- Minimal 2 vendor untuk RFQ
- Harga terbaik = terendah dari seluruh penawaran vendor

### 6.3 Pesanan pembelian (`#/pesanan-pembelian`)

**Fitur:**
- Register 10 PO: ID, tanggal, pemasok, nilai, ETA, status, buyer
- Chip status: draf, menunggu, dikirim-pemasok, diterima-sebagian, selesai

**Aturan bisnis:**
- PO > Rp 150 jt → memerlukan persetujuan manajer
- Penerimaan sebagian → update status + mutasi stok

### 6.4 Pemasok (`#/pemasok`)

**Fitur:**
- Register 7 pemasok: ID, nama, kategori, kota, termin, lead time, OTD, status
- Metrik kinerja: on-time delivery (%), waktu tunggu rata-rata

---

## 7. Inventaris & rantai pasok

### 7.1 Stok barang (`#/stok`)

**Fitur:**
- Register 12 item: SKU, nama, kategori, satuan, stok, min, max, biaya, gudang
- Lencana 9 item bermasalah di navigasi
- Pengurutan menurut tingkat masalah (kritis dahulu)
- Indikator visual stok: kritis (merah), rendah (kuning), aman (hijau)

**Aturan bisnis:**
- `onHand ≤ min` → peringatan stok kritis
- `onHand = 0` → status habis
- Nilai stok = `onHand × cost`

### 7.2 Mutasi stok (`#/mutasi`)

**Fitur:**
- Register 10 mutasi: ID, tanggal, SKU, nama, jenis, kuantitas, referensi, gudang
- Jenis mutasi: Masuk (Penerimaan, Hasil produksi), Keluar (Pengiriman, Produksi, Pemeliharaan), Transfer, Penyesuaian

**Aturan bisnis:**
- Kuantitas positif = masuk, negatif = keluar
- Setiap mutasi harus punya referensi dokumen sumber (DO, GR, WO, ADJ, TRF, MNT)

### 7.3 Rantai pasok (`#/rantai-pasok`)

**Fitur:**
- Register 6 pengiriman: ID, tanggal, asal, tujuan, ekspedisi, referensi, berat, ETA, status
- Page-head dengan tombol Pengiriman Baru, Ekspor
- Chip status: transit, diterima

---

## 8. Produksi

### 8.1 Perintah kerja (`#/perintah-kerja`)

**Fitur:**
- Papan Kanban 4 kolom: Antre → Berjalan → Pemeriksaan mutu → Selesai
- 11 kartu perintah kerja: ID, produk, qty, lini, jatuh tempo, kemajuan, PIC
- Saringan per lini produksi
- Penanda masalah (flag) pada kartu bermasalah
- Laci rekaman dengan bilah kemajuan dan detail

**Aturan bisnis:**
- Progress 100% → pindah ke QC
- QC lolos → Selesai + mutasi stok masuk
- Flag "Bahan baku menipis" → peringatan di dasbor

---

## 9. Proyek

### 9.1 Daftar proyek (`#/proyek`)

**Fitur:**
- Register 5 proyek: ID, nama, pelanggan, PM, anggaran, realisasi, tanggal, status, kesehatan, kemajuan
- Page-head dengan tombol Proyek Baru
- Indikator kesehatan: hijau, kuning, merah
- Gantt chart (untuk proyek Jababeka): 5 tugas dengan bilah waktu dan kemajuan

**Aturan bisnis:**
- `actual / budget > 85%` pada `progress < 80%` → kesehatan `kuning` (risiko overrun)
- `actual > budget` → kesehatan `merah`

---

## 10. Keuangan

### 10.1 Bagan akun (`#/bagan-akun`)

**Fitur:**
- Pohon akun 57 entri hierarkis (3 level kedalaman); saldo dihitung dari buku
  besar untuk cabang & periode aktif; klik akun detail → kartu buku besar
- 5 kategori: Aset, Liabilitas, Ekuitas, Pendapatan, Beban
- Kolom: kode, nama, tipe (Header/Detail), saldo
- Akun Header dapat diciutkan/dikembangkan
- Indentasi menurut level

**Aturan bisnis:**
- Hanya akun `Detail` yang menerima jurnal
- Saldo akun Header = Σ saldo akun anak

### 10.2 Piutang usaha (`#/piutang`)

**Fitur:**
- 4 ubin KPI piutang: total piutang, jatuh tempo, rata-rata DSO, kolektibilitas
- Grafik ember umur piutang (bilah horizontal, ramp sekuensial)
- Register faktur terbuka
- Relasi ke dasbor (peringatan piutang jatuh tempo)

### 10.3 Hutang usaha (`#/hutang`)

**Fitur:**
- Register 8 voucher hutang: ID, tanggal, pemasok, ref PO, nilai, terbayar, jatuh tempo, status
- Ember umur hutang (5 bucket)
- Chip status: belum-dibayar, sebagian, lunas
- Indikator kecocokan (matched) dengan PO

### 10.4 Kas & bank (`#/kas-bank`)

**Fitur:**
- Register 11 rekening bercap cabang: saldo dihitung dari saldo awal + jurnal
  kas per akhir periode; ubin pembanding saldo buku besar 1-1100; klik
  rekening → kartu buku besar tersaring rekening
- Page-head dengan tombol Rekening Baru, Ekspor
- Indikator transaksi belum direkonsiliasi

**Aturan bisnis:**
- Rekening dengan `unrecon > 0` → perlu tindakan rekonsiliasi
- Mendukung multi-mata uang (IDR + USD)

### 10.5 Jurnal umum (`#/jurnal`)

**Fitur:**
- Register ±550 jurnal berpasangan: nomor, cabang, tanggal, keterangan
  (sumber · referensi · jumlah baris), debit, kredit, oleh, status; tersaring
  cabang & periode aktif; pencarian mencakup kode/nama akun
- Laci jurnal: rincian, tabel baris debit/kredit dengan tautan ke kartu buku
  besar, pil keseimbangan, tautan dokumen sumber, aksi Posting / Tolak
- Modal jurnal memorial: tanggal, cabang, keterangan, referensi, baris dinamis
  (akun detail, debit, kredit, rekening untuk 1-1100), total & selisih hidup,
  simpan & posting atau kirim untuk persetujuan

**Validasi (`Ledger.validate`):**
- Σ debit = Σ kredit; minimal dua baris; satu sisi per baris
- Hanya akun `Detail` (bukan header, bukan akun dihitung)
- Periode tertutup menolak jurnal; cabang harus dikenal
- Baris `1-1100` wajib menyebut rekening milik cabang yang sama

**Aturan bisnis:**
- Posting otomatis oleh Sistem dari faktur, hutang, penggajian, aset,
  pemeliharaan, POS, mutasi stok, beban rutin, angsuran, dan pajak
- Jurnal manual berstatus `menunggu` tidak memengaruhi laporan sampai diposting

### 10.7 Kartu buku besar (`#/buku-besar`)

- Pilih akun (dikelompokkan per kategori) dan, untuk 1-1100, rekening bank
- Ubin: saldo awal, mutasi debit, mutasi kredit, saldo akhir (sisi normal)
- Tabel: tanggal, jurnal, keterangan, cabang (saat konsolidasi), debit, kredit,
  saldo berjalan; baris saldo awal & total; klik baris → laci jurnal

### 10.8 Neraca saldo (`#/neraca-saldo`)

- Saldo awal D/K, mutasi D/K, saldo akhir D/K per akun detail, dikelompokkan
  kategori; total & pil keseimbangan
- Mode *Per cabang* (konteks semua cabang): kolom tiap cabang, eliminasi
  akun antar kantor, konsolidasi

### 10.9 Laba rugi (`#/laba-rugi`)

- Pendapatan → HPP → laba kotor → beban operasional → beban umum &
  administrasi → laba operasional → lain-lain → laba bersih
- Satu cabang: kolom nilai + % pendapatan; semua cabang: kolom per cabang +
  konsolidasi
- Ubin: pendapatan, laba kotor (margin), laba operasional, laba bersih (margin)

### 10.10 Neraca (`#/neraca`)

- Aset lancar, aset tetap (neto akumulasi penyusutan), RK antar kantor,
  liabilitas jangka pendek/panjang, ekuitas + laba periode berjalan
  (dihitung sejak awal tahun buku)
- Pil "Aset = Liabilitas + Ekuitas"; mode konsolidasi dengan kolom eliminasi

### 10.11 Laporan konsolidasi (`#/konsolidasi`)

- Ubin konsolidasi, tabel kontribusi per cabang (pendapatan, laba, kas, aset)
- Tab: laba rugi konsolidasi, neraca konsolidasi, neraca saldo per cabang
- Eliminasi: `1-3100 RK Cabang` (pusat) terhadap `3-1500 RK Kantor Pusat`
  (cabang); pemeriksaan keduanya sama besar ada di halaman Integrasi

### 10.12 Integrasi & rekonsiliasi (`#/integrasi`)

- 11 pemeriksaan sub-buku vs buku besar: piutang, hutang, kas & bank,
  persediaan, aset (perolehan & nilai buku), utang gaji, neraca saldo, neraca,
  RK antar kantor, keseimbangan jurnal — nilai sub-buku, nilai buku besar,
  selisih, status, tombol buka modul
- Ringkasan posting per modul sumber untuk periode aktif
- Alur dokumen → jurnal → buku besar → laporan, dan peta aturan posting

### 10.6 Anggaran (`#/anggaran`)

**Fitur:**
- 2 tab: **Pusat Biaya** dan **Per Akun**

**Tab Pusat Biaya:**
- 3 ubin KPI: total anggaran, serapan, jumlah pusat biaya
- Register 8 pusat biaya: ID, kode, departemen, tipe (OPEX/CAPEX), anggaran, komitmen, realisasi, prakiraan
- Indikator over/under budget

**Tab Per Akun:**
- 3 ubin KPI: total anggaran, variance, prakiraan
- Register 15 akun: kode akun, nama, periode, anggaran, realisasi, prakiraan, selisih, catatan
- Indikator selisih positif (merah) / negatif (hijau)

**Aturan bisnis:**
- Serapan = (actual + commitment) / budget × 100%
- Prakiraan > anggaran → over budget (peringatan)
- Variance negatif = di bawah anggaran (baik untuk beban, buruk untuk pendapatan)

---

## 11. SDM

### 11.1 Karyawan (`#/karyawan`)

**Fitur:**
- Register 12 karyawan: ID, nama, departemen, jabatan, tanggal bergabung, lokasi, status
- Chip status: tetap, kontrak, magang
- Pencarian teks bebas

### 11.2 Kehadiran & cuti (`#/kehadiran`)

**Fitur:**
- Register 10 rekaman: ID, karyawan, tanggal, shift, masuk, keluar, lembur, status, jenis
- Chip status: hadir, cuti, sakit, terlambat
- Dukungan shift: Reguler, Shift 1, Shift 2

**Aturan bisnis:**
- Terlambat = clockIn > 08:15 untuk shift Reguler
- Cuti/sakit = clockIn dan clockOut null

### 11.3 Penggajian (`#/penggajian`)

**Fitur:**
- Register 8 slip gaji: ID, karyawan, departemen, gaji pokok, tunjangan, potongan, lembur, gaji bersih, status
- Chip status: draf, diproses, dibayar
- Lencana 12 slip menunggu di navigasi

**Aturan bisnis:**
- `netPay = basic + allowance - deduction + overtime`
- Alur: draf → diproses → dibayar

---

## 12. Aset & pemeliharaan

### 12.1 Daftar aset (`#/aset`)

**Fitur:**
- Register 8 aset: ID, nama, kategori, lokasi, tanggal perolehan, harga perolehan, nilai buku, penyusutan bulanan, status
- Chip status: aktif, dihapuskan

**Aturan bisnis:**
- Penyusutan metode garis lurus
- `bookValue = 0` + `monthlyDepr = 0` → aset telah dihapuskan

### 12.2 Pemeliharaan (`#/pemeliharaan`)

**Fitur:**
- Register 6 perintah pemeliharaan: ID, aset, jenis, prioritas, PIC, jadwal, status, biaya, deskripsi
- Chip status: dijadwalkan, berjalan, selesai
- Relasi ke aset (bidang `assetId`)
- Lencana 6 di navigasi

**Aturan bisnis:**
- Preventif = terjadwal berkala
- Korektif = perbaikan atas kerusakan
- Biaya pemeliharaan → jurnal otomatis ke akun 5-3400

---

## 13. Dokumen

### 13.1 Repositori dokumen (`#/dokumen`)

**Fitur:**
- Register 8 dokumen: ID, nama, tipe, folder, pemilik, ukuran, diubah, versi, status, kedaluwarsa
- Struktur folder hierarkis
- Chip status: berlaku, draf, kedaluwarsa
- Lencana 156 dokumen di navigasi

**Aturan bisnis:**
- Dokumen dengan `expiry < today` → status `kedaluwarsa`
- Versi naik setiap kali dokumen diperbarui

---

## 14. Alur kerja

### 14.1 Desainer alur kerja (`#/alur-kerja`)

**Fitur:**
- Register 7 template alur kerja: ID, nama, pemicu, langkah, SLA, instance aktif, status
- Chip status: aktif, nonaktif

**Template standar:**
1. Persetujuan pesanan penjualan (3 langkah, SLA 4 jam)
2. Persetujuan pesanan pembelian (2 langkah, SLA 8 jam)
3. Persetujuan permintaan pembelian (2 langkah, SLA 24 jam)
4. Tutup buku periode (5 langkah, SLA 3 hari)
5. Onboarding karyawan baru (8 langkah, SLA 7 hari)
6. Persetujuan jurnal penyesuaian (2 langkah, SLA 4 jam)
7. Klaim reimbursement (3 langkah, SLA 48 jam)

---

## 15. Analitik

### 15.1 BI & laporan (`#/analitik`)

**Fitur:**
- 8 ubin KPI ringkasan lintas modul
- Register 10 laporan tersedia: ID, nama, modul, tipe, terakhir dijalankan, frekuensi, format
- Widget grafik analitik (pendapatan, margin, pipeline, OEE)
- Tipe laporan: Standar (keuangan), Analitik (insight)
- Format: PDF, Excel, Dasbor

### 15.2 Balanced Scorecard (`#/bsc`)

**Fitur:**
- 4 perspektif Kaplan & Norton: Keuangan, Pelanggan, Proses Internal, Pertumbuhan & Pembelajaran
- 16 metrik (4 per perspektif): target, aktual, satuan, tren 6 bulan
- Indikator visual: hijau (on target), kuning (dekat target), merah (jauh dari target)
- Grafik tren per metrik (sparkline 6 titik)

**Metrik utama:**
- Keuangan: Pertumbuhan pendapatan, Margin laba kotor, ROI, Arus kas
- Pelanggan: Kepuasan, Retensi, Pengiriman tepat waktu, Keluhan
- Internal: OEE, Tingkat cacat, Waktu siklus, Perputaran persediaan
- Pertumbuhan: Jam pelatihan, Kepuasan karyawan, Turnover, Adopsi digital

---

## 16. Sistem

### 16.1 Kepatuhan & GRC (`#/kepatuhan`)

**Fitur:**
- Register 8 item kepatuhan: ID, judul, kategori, penanggung jawab, batas waktu, tinjauan terakhir, risiko, status
- Chip risiko: rendah, sedang, tinggi
- Chip status: patuh, peninjauan, dijadwalkan
- Kategori: Sertifikasi, Regulasi, Pajak, Tata Kelola, Lingkungan, Audit

### 16.2 Peran & izin (`#/peran`)

**Fitur:**
- 5 peran: Admin Sistem, Manajer Operasional, Staf Penjualan, Staf Gudang, Staf Keuangan
- Matriks izin interaktif (klik untuk mengubah level)
- 3 level: ubah & setujui → lihat saja → tanpa akses
- 4 grup fitur: Penjualan, Inventaris, Keuangan, Sistem

### 16.3 Jejak audit (`#/jejak-audit`)

**Fitur:**
- Register 10 entri: ID, waktu, pengguna, aksi, modul, entitas, detail, IP
- Pencarian dan saringan per modul
- Aksi: Buat, Ubah, Setujui, Tolak, Posting, Terima, Periksa

### 16.4 Pengaturan (`#/pengaturan`)

**Fitur:**
- Pengaturan umum perusahaan
- Pengaturan modul
- Tema (terang/gelap/sistem)
- Preferensi notifikasi

### 16.5 Sistem desain (`#/sistem-desain`)

**Fitur:**
- Dokumentasi token desain (warna, tipografi, spasi, radius)
- Galeri komponen (tombol, badge, tabel, kartu, dll.)
- Panduan gaya

---

## 17. Cabang

### 17.1 Manajemen cabang (`#/cabang`)

- Kartu per cabang: pendapatan, laba bersih, kas, piutang, persediaan,
  karyawan, pencapaian target; tombol Pilih (jadikan konteks), Laba rugi, Neraca
- Laci cabang: profil, kinerja periode, rekening (klik → buku besar), sumber
  daya; aksi jadikan aktif / nonaktifkan
- Modal cabang baru: kode 3 huruf unik, nama, kota, tipe, kepala cabang,
  target, bank; otomatis membuat giro & kas kecil bersaldo nol dan buku besar
  cabang (saldo awal kosong)
- Cabang nonaktif tidak masuk kolom konsolidasi

---

## Matriks integrasi antar modul

Setiap baris "Jurnal" di bawah dijalankan otomatis oleh `ledger.js`; hasilnya
dapat diaudit di `#/integrasi` dan `#/jurnal`.

| Dari | Ke | Pemicu | Aksi |
|------|----|--------|------|
| Faktur → Terbit | Jurnal | Otomatis | Dr Piutang; Kr Pendapatan, PPN keluaran; Dr HPP, Kr Persediaan barang jadi |
| Hutang → Dicatat | Jurnal | Otomatis | Dr Persediaan (atau beban jasa), PPN masukan; Kr Utang usaha |
| POS → Shift / rekap | Jurnal | Otomatis | Dr Kas; Kr Pendapatan, PPN keluaran; Dr HPP, Kr Persediaan |
| Mutasi stok → Produksi / opname / pemakaian | Jurnal | Otomatis | Bahan baku → WIP → barang jadi; selisih opname; beban pemeliharaan |
| Mutasi stok → Transfer antar cabang | Jurnal | Otomatis | Cabang asal Dr RK, Kr Persediaan; cabang tujuan Dr Persediaan, Kr RK |
| Penggajian → Diproses | Jurnal | Otomatis | Dr Beban gaji / TKL; Kr Utang pajak, Utang gaji |
| Penggajian → Dibayar | Jurnal | Otomatis | Cabang Dr Utang gaji, Kr RK Pusat; pusat Dr RK Cabang, Kr Bank |
| Pajak → Setoran masa | Jurnal | Otomatis | PPN keluaran − masukan + PPh disetor pusat lewat RK |
| Cabang → Setoran kas | Jurnal | Otomatis | Cabang Dr RK Pusat, Kr Bank; pusat Dr Bank, Kr RK Cabang |
| CRM Lead → Menang | Penawaran | Otomatis | Buat penawaran dari peluang |
| Penawaran → Diterima | Pesanan Penjualan | Manual | Konversi ke SO |
| Pesanan Penjualan | Persetujuan | Otomatis | Jika melebihi plafon kredit |
| Pesanan Penjualan → Disetujui | Faktur | Manual | Buat faktur |
| Pesanan Penjualan → Dikirim | Mutasi Stok | Otomatis | Kurangi stok |
| Pesanan Penjualan → Dikirim | Pengiriman | Otomatis | Buat catatan pengiriman |
| Permintaan Pembelian → Disetujui | RFQ | Manual | Buat request for quotation |
| RFQ → Selesai | Pesanan Pembelian | Manual | Buat PO dari vendor terpilih |
| Pesanan Pembelian → Diterima | Mutasi Stok | Otomatis | Tambah stok |
| Pesanan Pembelian → Diterima | Hutang Usaha | Otomatis | Buat voucher hutang |
| Faktur → Dibayar | Jurnal | Otomatis | Posting jurnal penerimaan kas |
| Hutang → Dibayar | Jurnal | Otomatis | Posting jurnal pengeluaran kas |
| Perintah Kerja → Selesai | Mutasi Stok | Otomatis | Masuk stok barang jadi |
| Perintah Kerja → Berjalan | Mutasi Stok | Otomatis | Keluar stok bahan baku |
| Pemeliharaan → Selesai | Jurnal | Otomatis | Posting beban pemeliharaan |
| Pemeliharaan | Mutasi Stok | Otomatis | Keluar stok suku cadang |
| Penggajian → Dibayar | Jurnal | Otomatis | Posting beban gaji |
| Aset → Bulanan | Jurnal | Otomatis | Posting beban penyusutan |

---

## Kerangka aplikasi (cross-cutting)

### Navigasi
- Rail navigasi 44 butir, 18 kelompok, dapat diciutkan
- Lencana pekerjaan menunggu pada 11 butir
- Responsif: collapse ke ikon pada layar sempit

### Strip kepala dokumen
- Perusahaan · Cabang · Periode · Mata uang
- Cabang: popover *Semua cabang (konsolidasi)* + cabang aktif; menyaring
  register bercap cabang, dasbor, kas & bank, piutang, dan laporan
- Periode: bulan Jan–Agu, kuartal, TA 2026; periode tertutup ditandai dan
  menolak jurnal baru; berlaku untuk jurnal, laporan, dan ubin dasbor
- Pilihan tersimpan di `localStorage` (`erp-ctx`)

### Tema
- 3 mode: terang, gelap, ikut sistem
- Tersimpan di `localStorage`
- Semua grafik dan tabel digambar ulang saat tema berubah

### Palet perintah
- `Ctrl/Cmd + K` atau `/`
- Pencarian lintas jenis: halaman, pesanan, pelanggan, stok, jurnal, akun
  (→ kartu buku besar), cabang (→ ganti konteks)
- Navigasi keyboard (↑ ↓ Enter)

### Perutean
- Berbasis URL hash (`#/view-id`)
- Setiap layar dapat ditandai dan dibagikan
- Deep-link dari notifikasi

### Notifikasi & toast
- 4 notifikasi demo (panel dropdown)
- Toast konfirmasi aksi (setujui, tolak, simpan)

### Format angka
- Mata uang: format id-ID (titik ribuan, koma desimal)
- Persentase: 1 desimal
- Tanggal: format Indonesia (DD MMM YYYY)
- Monospace untuk kode dokumen, SKU, nomor akun
