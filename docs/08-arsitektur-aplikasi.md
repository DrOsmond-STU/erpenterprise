# 8 — Arsitektur aplikasi & integrasi buku besar

Dokumen ini menjelaskan aplikasi yang **benar-benar berjalan** (folder `server/`
dan `web/`). Purwarupa di `prototype/` tetap disimpan sebagai acuan desain.

## Gambaran umum

```
Peramban (web/)                      Server Node.js (server/)                 SQLite (node:sqlite)
┌───────────────────────┐  HTTPS   ┌──────────────────────────────────┐     ┌──────────────────────┐
│ SPA tanpa framework   │ ───────▶ │ http.js   header keamanan, CSRF, │     │ tabel entitas (46)   │
│ erp-core   API+CSRF   │  cookie  │           pembatas laju, statis  │     │ journals / lines     │
│ erp-forms  formulir   │ HttpOnly │ routes.js REST API               │ ──▶ │ stock_balances/moves │
│ erp-records register  │          │ modules/  entitas + CRUD generik │     │ audit_log (berantai) │
│ erp-views  laporan    │          │ ledger/   posting, stok, laporan │     │ sessions, settings   │
│ erp-app    kerangka   │          │ security/ auth, RBAC, audit, MFA │     └──────────────────────┘
└───────────────────────┘          └──────────────────────────────────┘
```

* **Tanpa dependensi runtime pihak ketiga.** Server hanya memakai modul bawaan
  Node.js ≥ 22.5 (`node:http`, `node:crypto`, `node:sqlite`). Ini memperkecil
  permukaan serangan rantai pasok (ISO 27001 A.5.21, A.8.28).
* **Satu sumber kebenaran metadata.** `server/modules/entities.js` mendefinisikan
  setiap entitas: bidang, tipe, validasi, cakupan (global/perusahaan/cabang),
  modul izin, baris dokumen, dan aksi alur kerja. Dari definisi ini dibentuk
  skema tabel (`schema.js`), validasi server (`crud.js`), dan formulir/daftar di
  klien (`/api/meta`).

## Model multi-perusahaan & multi-cabang

| Cakupan | Contoh entitas | Aturan |
| --- | --- | --- |
| Global (grup) | Bagan akun, produk, BOM, peran, pengguna, alur kerja | Satu bagan akun seragam untuk seluruh grup — prasyarat konsolidasi. |
| Perusahaan | Pelanggan, pemasok, pusat biaya, periode fiskal, dokumen, risiko | Diakses dalam konteks perusahaan aktif. |
| Cabang | Seluruh dokumen transaksi, gudang, rekening bank, karyawan, aset | Setiap dokumen & baris jurnal membawa `branch_id`. |

Pengguna dapat dibatasi ke satu perusahaan dan/atau satu cabang. Server
memvalidasi konteks `X-Company`/`X-Branch` pada setiap permintaan dan menolak
akses ke baris di luar cakupan (pencegahan IDOR).

## Mesin posting buku besar (`server/ledger/posting.js`)

1. **Double-entry wajib** — Σ debit = Σ kredit; baris tidak boleh bernilai
   negatif atau berisi debit & kredit sekaligus.
2. **Hanya akun detail aktif** yang menerima jurnal; akun induk menjumlah anak.
3. **Periode fiskal** — periode tertutup menolak posting; periode yang belum ada
   dibuat otomatis berstatus terbuka.
4. **Penyeimbang antar cabang (RAK)** — bila satu jurnal menyentuh beberapa
   cabang (mis. transfer stok Cikarang → Medan), mesin menambahkan baris akun
   `1-1700 Rekening Antar Cabang` sehingga **neraca setiap cabang tetap
   seimbang**. Di tingkat perusahaan RAK saling hapus.
5. **Imutabilitas** — trigger basis data menolak perubahan/penghapusan jurnal
   terposting. Koreksi selalu melalui **jurnal pembalik** yang menautkan
   `reversal_of`.
6. **Penomoran** berurutan per prefiks, perusahaan, dan tahun
   (`JU-2026-00001`, `INV-2026-00012`, …).

### Matriks posting otomatis

| Dokumen / aksi | Debit | Kredit | Efek lain |
| --- | --- | --- | --- |
| Faktur penjualan — *Terbitkan* | Piutang usaha (atau Piutang antar perusahaan) | Pendapatan per produk (atau Pendapatan antar perusahaan), PPN keluaran | Stok keluar; Dr HPP / Cr Persediaan pada biaya rata-rata |
| Penerimaan pelanggan | Kas/Bank | Piutang | Status faktur → sebagian/lunas |
| Transaksi kasir (POS) | Kas toko | Pendapatan, PPN keluaran | Stok keluar; HPP |
| Tagihan pemasok — *Posting* | Persediaan (barang) / akun beban (jasa), PPN masukan | Hutang usaha (atau Hutang antar perusahaan) | Stok masuk, biaya rata-rata diperbarui; PO → diterima |
| Pembayaran pemasok | Hutang | Kas/Bank | Status tagihan → sebagian/lunas |
| Kas masuk/keluar | Akun lawan / Kas | Kas / akun lawan | Dimensi pusat biaya & proyek |
| Transfer rekening | Bank tujuan | Bank asal | RAK bila beda cabang |
| Penyesuaian stok | Persediaan / akun lawan | akun lawan / Persediaan | Stok ± |
| Transfer stok antar cabang | Persediaan (cabang tujuan) | Persediaan (cabang asal) | RAK otomatis |
| Perintah kerja — *Lolos QC* | Persediaan barang jadi | Persediaan bahan baku (sesuai BOM) | Biaya produksi = nilai bahan terpakai |
| Penggajian — *Posting* | Beban gaji (bruto) | Hutang PPh 21, Hutang BPJS, Hutang gaji | — |
| Penggajian — *Bayar* | Hutang gaji | Bank | — |
| Aset — *Aktifkan* | Aset tetap | Akun pembayaran (bank/hutang/modal) | — |
| Penyusutan bulanan | Beban penyusutan | Akumulasi penyusutan | Nilai buku aset diperbarui; dobel per periode ditolak |
| Aset — *Lepas* | Akumulasi, Kas, Rugi pelepasan | Aset, Laba pelepasan | — |
| Pemeliharaan — *Selesai* | Beban pemeliharaan | Bank | — |
| Jurnal manual — *Setujui* | sesuai baris | sesuai baris | Maker–checker (pembuat ≠ penyetuju) |
| Pembatalan (void) dokumen | — jurnal pembalik — | | Stok & status pelunasan dikembalikan |

Akun yang dipakai dapat diubah di **Pengaturan → Pemetaan akun posting
otomatis**; akun per produk (persediaan, pendapatan, HPP) diatur di data produk.

## Laporan (`server/ledger/reports.js`)

Seluruh laporan dihitung langsung dari baris jurnal terposting — tidak ada
angka yang disimpan terpisah, sehingga laporan **selalu konsisten** dengan
transaksi modul operasional.

| Laporan | Cakupan | Pemeriksaan otomatis |
| --- | --- | --- |
| Neraca | perusahaan · cabang tertentu · per cabang (berkolom) · konsolidasi | Aset = Liabilitas + Ekuitas |
| Laba Rugi | sama | Σ laba cabang = laba perusahaan |
| Arus Kas (metode langsung) | perusahaan / cabang | Kas awal + arus bersih = kas akhir |
| Neraca Saldo | perusahaan / cabang | Σ debit = Σ kredit |
| Buku Besar | per akun, saldo berjalan, telusur ke jurnal | — |
| Umur Piutang / Hutang | 5 ember umur | Sub-buku = saldo buku besar |
| Valuasi Persediaan | per gudang, status stok | Nilai stok = akun persediaan |
| Anggaran vs Realisasi | per akun, prakiraan setahun | — |
| Dasbor | KPI dari buku besar | — |

**Laba tahun berjalan** dan **saldo laba tahun lalu** dihitung dinamis dari akun
laba rugi sehingga neraca selalu seimbang tanpa jurnal penutup.

### Konsolidasi grup

Kolom: setiap entitas (induk + anak, rekursif) → **Eliminasi** → **Konsolidasi**.

1. **Eliminasi antar perusahaan** — saldo seluruh akun bertanda *antar
   perusahaan* (piutang/hutang, pendapatan/beban IC) dinihilkan. Selisih
   rekonsiliasi (bila satu sisi belum mencatat) disajikan sebagai baris
   tersendiri sehingga neraca tetap seimbang dan selisihnya terlihat.
2. **Eliminasi investasi** — akun *Investasi pada entitas anak* dieliminasi
   terhadap modal disetor entitas anak; selisih positif disajikan sebagai
   **goodwill**.
3. **Kepentingan non-pengendali (NCI)** — porsi (1 − kepemilikan efektif) atas
   ekuitas entitas anak (modal, saldo laba, laba berjalan) disajikan di ekuitas;
   laba rugi menampilkan atribusi ke pemilik induk dan NCI.

Laporan konsolidasi hanya tersedia bagi pengguna tanpa batas perusahaan/cabang
dengan izin *Laporan Keuangan* tingkat setujui.

## Persediaan

Metode **rata-rata tertimbang bergerak** per produk per gudang. Mutasi stok
(`stock_moves`) bersifat append-only dan selalu berpasangan dengan jurnal,
sehingga laporan valuasi persediaan selalu cocok dengan akun persediaan.
Stok keluar melebihi saldo ditolak.

## Alur kerja & persetujuan

* SO di atas plafon kredit / pelanggan ditahan → *menunggu* persetujuan.
* PO di atas ambang (bawaan Rp 150 jt) → *menunggu* persetujuan.
* PR, jurnal manual, pembayaran pemasok, penggajian, cuti → persetujuan.
* **Pemisahan tugas**: aksi bertanda SoD menolak penyetuju yang sama dengan
  pembuat dokumen (diuji otomatis).
* Kotak Persetujuan menghimpun seluruh dokumen menunggu lintas modul.

## API

| Metode & jalur | Fungsi |
| --- | --- |
| `POST /api/auth/login`, `/mfa`, `/logout`, `/password`; `GET /api/auth/me`, `/sessions` | Autentikasi & sesi |
| `GET /api/meta` | Metadata entitas, izin, konteks perusahaan/cabang |
| `GET/POST /api/e/:entitas`, `GET/PUT/DELETE /api/e/:entitas/:id` | CRUD generik (cari, saring, urut, paginasi, penguncian optimistis `row_version`) |
| `POST /api/e/:entitas/:id/actions/:aksi` | Aksi alur kerja & posting |
| `GET /api/lookup/:entitas` | Pilihan rujukan |
| `GET /api/export/:entitas` | Ekspor CSV (teraudit, aman dari injeksi formula) |
| `GET /api/reports/:nama?mode=single|branch|consolidated` | Laporan keuangan |
| `GET /api/dashboard`, `/api/approvals` | Dasbor & kotak persetujuan |
| `GET/PUT /api/roles/:id/permissions`, `/api/settings/:kunci` | Administrasi |
| `GET /api/audit`, `/api/audit/verify`, `/api/security/overview` | Audit & pemantauan |
| `POST /api/admin/backup`, `GET /api/admin/backups` | Cadangan terenkripsi |
