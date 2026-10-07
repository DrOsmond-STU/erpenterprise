# 10 — Panduan operasional & deployment

## Prasyarat

* Node.js **22.5 atau lebih baru** (memakai `node:sqlite` bawaan). Tidak ada
  `npm install` yang diperlukan untuk menjalankan server.
* Reverse proxy TLS (nginx/Caddy) untuk produksi.

## Menjalankan untuk demo / pengembangan

```bash
npm start                      # http://127.0.0.1:8080 — basis data demo dibuat otomatis di data/
# masuk: admin / Erp#Demo2026!
```

Data demo: 3 perusahaan (PT KNM induk, PT NLP 100 %, PT KNM Trading 80 %),
7 cabang, ±900 jurnal Jan–Okt 2026 dari seluruh modul. Hapus folder `data/`
untuk mengulang dari awal.

## Produksi

1. Siapkan pengguna sistem & direktori (lihat komentar `deploy/erp.service`).
2. Salin kode ke `/opt/erp`, buat `/etc/erp/erp.env` dari `.env.example`
   (izin `0600`, pemilik root):
   * `NODE_ENV=production`, `COOKIE_SECURE=1`, `TRUST_PROXY=1`,
     `PUBLIC_ORIGIN=https://erp.domain-anda`
   * `DATA_KEY` — 64 karakter heksadesimal; **simpan salinannya di brankas**.
   * `ADMIN_INITIAL_PASSWORD` — sandi kuat sementara; hapus dari berkas setelah
     masuk pertama.
3. `sudo systemctl enable --now erp`, pasang `deploy/nginx.conf`.
4. Masuk sebagai `admin`, ganti sandi (wajib), aktifkan MFA, lalu:
   * Administrasi → Perusahaan & Cabang: lengkapi data entitas.
   * Keuangan → Bagan Akun: sesuaikan bila perlu; Pengaturan → Pemetaan akun.
   * Data Master: gudang, rekening kas/bank, produk, pelanggan, pemasok.
   * Administrasi → Peran & Izin, lalu Pengguna (prinsip hak minimum).
   * Saldo awal: jurnal manual (maker–checker) + penyesuaian stok awal.

### Docker

```bash
docker build -t erp-enterprise .
docker run -d --name erp -p 127.0.0.1:8080:8080 -v erp-data:/data \
  -e DATA_KEY=... -e ADMIN_INITIAL_PASSWORD=... -e PUBLIC_ORIGIN=https://erp.domain \
  -e TRUST_PROXY=1 erp-enterprise
```

## Cadangan & pemulihan (A.8.13)

* Dari UI: **Pusat Keamanan → Buat cadangan terenkripsi**.
* Terjadwal: `node tools/backup.mjs` lewat cron/systemd timer (mis. tiap malam),
  lalu salin `BACKUP_DIR` ke lokasi luar (objek storage terenkripsi).
* Pemulihan: hentikan layanan, lalu
  `node tools/restore.mjs erp-YYYYMMDD-HHMMSS.sqlite.enc /var/lib/erp/pulih.sqlite`
  (checksum diverifikasi), arahkan `DB_FILE` ke berkas tersebut, jalankan.
* **Uji pemulihan minimal tiap kuartal** dan catat di register Kepatuhan.

## Tutup buku bulanan

1. Pastikan Kotak Persetujuan kosong untuk periode tersebut.
2. Jalankan **Aset → Penyusutan Bulanan** untuk periode.
3. Periksa **Neraca Saldo** (seimbang), **Umur Piutang/Hutang** dan **Valuasi
   Persediaan** (cocok dengan buku besar — indikator hijau).
4. Rekonsiliasi bank terhadap **Buku Besar** akun kas/bank.
5. **Keuangan → Rekonsiliasi Bank**: buat rekonsiliasi per rekening dengan saldo
   rekening koran, centang mutasi, lalu *Selesaikan* (oleh penyetuju lain).
6. **Keuangan → Periode Fiskal → Tutup periode**. Periode tertutup menolak
   posting baru; membuka kembali memerlukan hak admin penuh dan tercatat di
   jejak audit.

## Tutup buku tahunan

1. Pastikan seluruh periode Januari–Desember sudah direkonsiliasi dan disetujui.
2. Buat/buka periode fiskal Desember (masih terbuka), jalankan aksi
   **Tutup buku tahunan** — saldo akun laba rugi setiap cabang dipindahkan ke
   *Saldo Laba* dengan jurnal penutup tertanggal 31 Desember.
3. Tutup periode Desember. Tutup buku tidak dapat dijalankan dua kali untuk
   tahun yang sama; koreksi dilakukan dengan membalik jurnal penutup.

## Penawaran ke pelanggan

1. **Pengaturan → Kebijakan persetujuan**: atur diskon maksimum, margin minimum,
   ambang nilai penawaran, masa berlaku bawaan, dan *Pesanan penjualan wajib dari
   penawaran* (bawaan aktif).
2. Tenaga penjual membuat **Penjualan → Penawaran** (atau dari Lead CRM), lalu
   *Ajukan*. Penawaran di luar kebijakan disetujui atasan di Kotak Persetujuan.
3. *Kirim ke pelanggan* — cetak/PDF dari tombol Cetak; pelanggan dengan akun portal
   dapat menerima (nama + no. PO) atau menolak langsung di portal.
4. Penawaran *diterima* → *Buat pesanan penjualan* → ajukan SO (cek plafon kredit
   & kesesuaian dengan penawaran) → kirim & faktur.
5. Pantau **Penjualan → Analisis Penawaran** mingguan: penawaran yang segera
   berakhir, tingkat menang, dan alasan kalah. Penawaran kedaluwarsa dapat direvisi.

## Pengiriman & penagihan (surat jalan)

1. Dari pesanan penjualan disetujui pilih **Buat surat jalan (DO)** — "seluruh sisa"
   untuk kirim penuh atau "isi manual" untuk kirim sebagian — lalu **Kirim & posting
   stok** (cetak surat jalan untuk pengemudi & tanda terima pelanggan).
2. Tagih dengan **Faktur dari surat jalan** (menu Surat Jalan, Faktur Penjualan, atau
   Pemenuhan Pesanan): pilih pelanggan, centang satu atau beberapa surat jalan
   (dapat dari beberapa pesanan), lalu terbitkan faktur — piutang diakui saat itu.
3. Akhir bulan, buka **Penjualan → Pemenuhan Pesanan**: pastikan indikator hijau
   (DO belum difakturkan = saldo akun 1-1350) dan tindak lanjuti DO berumur > 30 hari
   serta pesanan yang terlambat dikirim.

## Siklus anggaran tahunan

1. **Keuangan → Realisasi & Variance → Salin anggaran**: salin anggaran tahun
   berjalan (atau realisasinya) ke tahun berikutnya dengan penyesuaian %,
   hasilnya draf per cabang.
2. Pemilik anggaran menyesuaikan di **Keuangan → Anggaran (COA)** (pola merata,
   pola tahun lalu, atau manual per bulan), lalu *Ajukan*.
3. Direksi/penyetuju lain *Setujui* dari Kotak Persetujuan (pemisahan tugas).
4. Pantau bulanan di **Realisasi & Variance** (YTD, bulanan, per pusat biaya)
   dan kolom anggaran **Bagan Akun**; revisi anggaran memakai aksi *Revisi*
   lalu persetujuan ulang (tercatat di jejak audit).
5. Atur **Pengaturan → Kebijakan persetujuan → Kontrol anggaran**: peringatan
   (bawaan) atau blokir transaksi yang melampaui anggaran COA/RAB proyek.
6. Proyek: isi nilai kontrak & RAB per akun, beri dimensi proyek pada PR/PO,
   tagihan, kas, faktur; pantau **Proyek → Laporan Proyek** (CPI/SPI, EAC,
   komitmen, margin).

## Mata uang asing

* Perbarui **Keuangan → Kurs Valuta** (mis. kurs tengah BI) secara berkala, atau
  impor lewat CSV. Dokumen valas memakai kurs terakhir ≤ tanggal dokumen.
* Rekening valas tetap dicatat dalam IDR di buku besar; laba/rugi selisih kurs
  terbentuk otomatis saat pelunasan.

## Portal pelanggan & pemasok

Buat pengguna dengan peran *Portal Pelanggan* / *Portal Pemasok*, batasi ke
perusahaan terkait, dan isi *Akun portal pelanggan/pemasok*. Pengguna portal
hanya melihat dokumen terbit milik mitra tersebut. Wajibkan MFA bila memungkinkan
dan nonaktifkan akun saat hubungan bisnis berakhir (ISO 27001 A.5.20).

## Pemantauan & respons insiden

* Log akses JSON ke stdout (journald) — kirim ke SIEM; jangan mencatat badan
  permintaan.
* Tinjau **Pusat Keamanan** mingguan: gagal masuk, akun terkunci, sesi aktif,
  akun dorman, akun tanpa MFA.
* Jalankan **Verifikasi jejak audit** bulanan; hasil verifikasi juga tercatat.
* Insiden: catat di **Insiden Keamanan**, cabut sesi pengguna terdampak
  (Pengguna → *Cabut seluruh sesi*), reset sandi/MFA, simpan cadangan sebagai
  bukti.

## Pengujian

```bash
npm test            # 133 uji integrasi API (keamanan, RBAC, posting, valas, retur, rekonsiliasi, portal, laporan, anggaran & proyek, penawaran, surat jalan, CRUD 55 entitas)
npm run test:e2e    # uji peramban: 78 menu × 2 tema, alur transaksi, cetak, lampiran, asisten, rekonsiliasi, portal, peran terbatas
```
