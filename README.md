# ERP Enterprise

Aplikasi ERP multi-perusahaan & multi-cabang: penjualan, POS, pembelian,
persediaan, produksi, proyek, keuangan, SDM & penggajian, aset tetap, CRM,
dokumen, serta kepatuhan & keamanan informasi. **Seluruh transaksi memposting
jurnal ke satu buku besar**, sehingga Neraca, Laba Rugi, dan Arus Kas — per
perusahaan, per cabang, maupun **konsolidasi grup** — selalu konsisten dengan
modul operasional. Kontrol keamanan diselaraskan dengan **ISO/IEC 27001:2022**.

## Menjalankan

```bash
npm start          # Node.js ≥ 22.5, tanpa npm install — http://127.0.0.1:8080
```

Basis data demo dibuat otomatis di `data/` (3 perusahaan, 7 cabang, transaksi
Jan–Okt 2026). Masuk dengan `admin` / `Erp#Demo2026!` — daftar akun demo per
peran ada di [dokumen 9](docs/09-keamanan-iso27001.md#akun-demo).
Untuk produksi lihat [panduan operasional](docs/10-operasional.md).

## Fitur utama

| Area | Isi |
| --- | --- |
| CRUD | 55 entitas dengan cari, saring status, urut, paginasi server, formulir & editor baris, penguncian optimistis, ekspor CSV, jejak audit per rekaman |
| Integrasi buku besar | Faktur, penerimaan, POS, tagihan, pembayaran, kas/bank, transfer, stok (penyesuaian/transfer), produksi (BOM), penggajian, aset (perolehan, penyusutan, pelepasan), pemeliharaan, jurnal manual — semuanya diposting otomatis, pembatalan memakai jurnal pembalik |
| Laporan | Neraca, Laba Rugi, Arus Kas, Neraca Saldo, Buku Besar, Umur Piutang/Hutang, Valuasi Persediaan, Anggaran vs Realisasi, Laporan Proyek, Dasbor |
| Penganggaran | Anggaran per akun COA × cabang × pusat biaya dengan pola bulanan (merata / pola tahun lalu / manual), persetujuan maker–checker, salin dari tahun lalu, kolom anggaran di Bagan Akun; laporan realisasi & variance YTD, bulanan, per pusat biaya; kontrol anggaran (peringatan/blokir) |
| Anggaran proyek | Nilai kontrak & RAB per akun, dimensi proyek pada PR/PO/tagihan/SO/faktur/kas/jurnal, komitmen PO, laporan proyek (realisasi, variance, sisa anggaran, EV/CPI/SPI/EAC, margin, kurva-S) |
| Cabang & konsolidasi | Laporan berkolom per cabang (RAK otomatis menjaga neraca tiap cabang seimbang) dan konsolidasi grup dengan eliminasi antar perusahaan, eliminasi investasi, goodwill, dan kepentingan non-pengendali |
| Fitur lanjutan | Multi-mata uang & selisih kurs, retur penjualan/pembelian, rekonsiliasi bank, shift kasir, lokasi rak, tutup buku tahunan, MRP, analitik & Balanced Scorecard, asisten data, notifikasi, pencarian global, lampiran terenkripsi, impor CSV, cetak dokumen (terbilang), aksi massal, widget dasbor, portal pelanggan & pemasok |
| Penawaran → SO | Penawaran ke pelanggan dengan kebijakan harga (diskon/margin/nilai) & persetujuan, kirim, terima/tolak langsung di portal pelanggan, revisi (-R1, -R2), kedaluwarsa otomatis, konversi ke SO; SO wajib dari penawaran diterima; Analisis Penawaran (corong, tingkat menang, alasan kalah) |
| Alur kerja | Plafon kredit, ambang PO, maker–checker jurnal & pembayaran, Kotak Persetujuan lintas modul, pemisahan tugas |
| Keamanan | scrypt + kebijakan sandi, penguncian akun, MFA TOTP, sesi HttpOnly/SameSite + CSRF, RBAC 18 modul × 5 tingkat, cakupan data per perusahaan/cabang, penyamaran PII, jejak audit berantai hash, cadangan AES-256-GCM, header keamanan & CSP, pembatas laju |

## Struktur repositori

| Jalur | Isi |
| --- | --- |
| `server/` | Server HTTP, API, mesin posting, laporan, keamanan (tanpa dependensi runtime) |
| `server/modules/entities.js` | Definisi seluruh entitas — sumber skema, validasi, dan formulir |
| `server/ledger/` | Posting jurnal, persediaan rata-rata bergerak, aksi dokumen, laporan |
| `server/security/` | Autentikasi, sesi, MFA, RBAC, jejak audit, kriptografi |
| `web/` | Aplikasi peramban (SPA) — memakai token & komponen sistem desain purwarupa |
| `test/` | Uji integrasi API (`npm test`) |
| `tools/e2e.mjs` | Uji end-to-end peramban (`npm run test:e2e`) |
| `deploy/`, `Dockerfile`, `.env.example` | Unit systemd terkeras, konfigurasi nginx TLS, citra kontainer |
| `prototype/`, `dist/` | Purwarupa UI/UX awal (acuan desain) |
| `docs/` | Dokumen produk, desain, arsitektur, keamanan, operasional |

## Dokumen

1. [Ringkasan produk & persona](docs/01-ringkasan-produk.md)
2. [Arsitektur informasi](docs/02-arsitektur-informasi.md)
3. [Alur pengguna utama](docs/03-alur-pengguna.md)
4. [Sistem desain](docs/04-sistem-desain.md)
5. [Cakupan & batas purwarupa](docs/05-cakupan-purwarupa.md)
6. [Model data](docs/06-model-data.md)
7. [Spesifikasi fungsional](docs/07-spesifikasi-fungsional.md)
8. [Arsitektur aplikasi & integrasi buku besar](docs/08-arsitektur-aplikasi.md)
9. [Keamanan informasi & pemetaan ISO 27001](docs/09-keamanan-iso27001.md)
10. [Operasional & deployment](docs/10-operasional.md)

## Pengujian

```bash
npm test           # 128 uji: keamanan, RBAC, SoD, posting, valas, retur, rekonsiliasi, portal, laporan, konsolidasi, anggaran & proyek, penawaran, CRUD 55 entitas
npm install && npm run test:e2e   # Playwright: menu × tema terang/gelap, alur transaksi, fitur lanjutan, anggaran & laporan proyek, portal, peran terbatas, layar 390 px
```
