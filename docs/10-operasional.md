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
5. **Keuangan → Periode Fiskal → Tutup periode**. Periode tertutup menolak
   posting baru; membuka kembali memerlukan hak admin penuh dan tercatat di
   jejak audit.

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
npm test            # 86 uji integrasi API (keamanan, RBAC, posting, laporan, CRUD semua entitas)
npm run test:e2e    # uji peramban: seluruh menu × 2 tema + alur transaksi (perlu Playwright)
```
