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
| Penggajian — *Posting* | Beban gaji (bruto, per akun & pusat biaya karyawan) | Hutang PPh 21, Hutang BPJS, Hutang gaji (per akun karyawan) | — |
| Penggajian — *Bayar* | Hutang gaji | Bank | — |
| Aset — *Aktifkan* | Aset tetap | Akun pembayaran (bank/hutang/modal) | — |
| Penyusutan bulanan | Beban penyusutan | Akumulasi penyusutan | Nilai buku aset diperbarui; dobel per periode ditolak |
| Aset — *Lepas* | Akumulasi, Kas, Rugi pelepasan | Aset, Laba pelepasan | — |
| Pemeliharaan — *Selesai* | Beban pemeliharaan | Bank | — |
| Jurnal manual — *Setujui* | sesuai baris | sesuai baris | Maker–checker (pembuat ≠ penyetuju) |
| Pembatalan (void) dokumen | — jurnal pembalik — | | Stok & status pelunasan dikembalikan |

### Akun buku besar per data master

Akun yang terkait mitra dan barang **disimpan di data master masing-masing**, sehingga
setiap pelanggan, pemasok, barang, dan jasa dapat memakai akun berbeda
(mis. piutang ekspor terpisah, hutang impor, persediaan per lini produk, beban per jenis jasa).
Saat data master disimpan, kolom akun yang kosong diisi akun bawaan; nilainya dapat diubah
per data (`server/ledger/accounts.js`).

| Data master | Akun (kolom) | Bawaan |
| --- | --- | --- |
| Pelanggan | Piutang usaha (`ar_account_id`) · Pendapatan penjualan (`sales_account_id`, kosong = akun barang/jasa) · Potongan penjualan · Titipan/uang muka pelanggan · Uang muka penjualan (faktur UM) · Deposit · Uang jaminan | 1-1200 (antar perusahaan 1-1600) · — (antar perusahaan 4-1400) · 4-1900 · 2-1600 · 2-1610 · 2-1620 · 2-1630 |
| Pemasok | Hutang usaha (`ap_account_id`) · Potongan pembelian · Titipan/uang muka ke pemasok · Uang muka pembelian (faktur UM) · Deposit · Uang jaminan | 2-1100 (antar perusahaan 2-1500) · 7-1300 · 1-1510 · 1-1520 · 1-1530 · 1-1540 |
| Barang persediaan | Persediaan · HPP · Persediaan terkirim belum difakturkan · Pendapatan · Retur penjualan | 1-1340 · 5-1100 · 1-1350 · 4-1100 · 4-1900 |
| Jasa | Pendapatan · Retur penjualan · Beban pembelian jasa (`expense_account_id`, dipakai tagihan tanpa akun baris) | 4-1100 · 4-1900 · 5-1100 |
| Karyawan | Beban gaji & tunjangan (gaji pokok, tunjangan, lembur) · Hutang gaji · Hutang PPh 21 · Hutang BPJS | 6-1000 (mis. 5-1400 tenaga kerja langsung produksi) · 2-1300 · 2-1310 · 2-1320 |
| Kas & bank | Kas/bank (`account_id`, wajib) · Biaya administrasi bank · Giro mundur diterima (rekening setor) · Giro mundur diberikan (rekening penerbit) · Selisih kas kasir | — · 7-2100 · 1-1250 · 2-1150 · 6-2950 |
| Aset tetap | Aset tetap · Akumulasi penyusutan · Beban penyusutan · Laba pelepasan · Rugi pelepasan · Beban pemeliharaan | aset & akumulasi menurut kategori (Bangunan 1-2200/1-2210, Mesin & Peralatan 1-2300/1-2310, Kendaraan 1-2400/1-2410, Peralatan Kantor & TI 1-2500/1-2510) · 6-2500 · 7-1100 · 7-2200 · 6-2200 |

Posting membaca akun dari data master (akun bawaan hanya cadangan bila kolom kosong).
Rekonsiliasi sub-buku (umur piutang/hutang, kartu mitra, register uang muka & deposit,
barang terkirim belum difakturkan) menjumlahkan **seluruh akun yang dipakai data master**.
Jurnal penggajian dipecah per akun karyawan (beban gaji juga per pusat biaya karyawan); akun hutang
gaji dicatat pada slip saat posting sehingga pembayaran mendebit akun yang sama walaupun data
karyawan diubah sesudahnya.
Giro mundur dicatat di akun giro rekening tempat giro disetor/diterbitkan dan dikreditkan/didebit
dari akun yang sama saat cair (walau dicairkan ke rekening lain); register giro menjumlahkan seluruh
akun giro rekening. Akun giro rekening tidak dapat diganti selama masih ada giro belum cair melaluinya.
Akun bersaldo (piutang/hutang, titipan, uang muka, deposit, jaminan) tidak dapat diganti
selama mitra masih bersaldo di akun lama, dan akun persediaan tidak dapat diganti selama
barang masih berstok — pindahkan saldonya dulu dengan jurnal umum. Pada aset tetap yang sudah
aktif, nilai perolehan dan akun aset/akumulasi terkunci; yang masih dapat diubah hanya nama,
lokasi, dan akun beban penyusutan (berlaku untuk penyusutan berikutnya), laba/rugi pelepasan,
serta beban pemeliharaan. Aset aktif tidak dapat dihapus (gunakan *Lepas / jual aset*).

**Master Pajak** (`taxes`, Keuangan → Master Pajak) menyimpan kode pajak berjenis PPN atau
PPh 23 beserta tarif, penanda bawaan per jenis, dan dua akun: *akun pajak penjualan* (PPN
keluaran / PPh 23 dibayar di muka) dan *akun pajak pembelian* (PPN masukan / hutang PPh 23).
Bawaan: PPN11 (bawaan), PPN12, PPN0, PPH23 (bawaan). Penawaran, pesanan, faktur, tagihan, POS,
nota, uang muka, dan retur menyimpan `tax_id`; tarif PPN mengikuti kode tersebut. Tanpa kode,
dipakai kode PPN bawaan pelanggan/pemasok lalu kode PPN bawaan perusahaan; tarif yang dikirim
tanpa kode (API lama) dicocokkan ke kode bertarif sama. Konversi dokumen (penawaran → pesanan
→ faktur, PO → tagihan, uang muka, retur) membawa kode pajak dokumen asal. Kode PPh 23 dipilih
pada penerimaan/pembayaran (bawaan pemasok untuk pembayaran). Posting PPN & PPh 23 memakai akun
kode pajak; rekap pajak menjumlahkan seluruh akun PPN dari master pajak dan seluruh akun PPh 21
karyawan. Kode yang sudah dipakai tidak dapat dihapus (nonaktifkan).

**Pengaturan → Akun sistem** hanya berisi akun yang tidak terkait data master: RAK, investasi
& ekuitas, selisih kurs, penyesuaian persediaan & selisih harga, barang dalam proses, serta akun
kompensasi/jaminan hangus (akun pelepasan & pemeliharaan aset kini di master aset, akun gaji/
PPh 21/BPJS di master karyawan, akun biaya bank/giro/selisih kas di master kas & bank, akun PPN
& PPh 23 di master pajak). Saat pemutakhiran, penyesuaian akun mitra/barang/pajak
yang pernah disimpan di Pengaturan dipindahkan ke data master lalu dihapus dari Pengaturan.

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
| Anggaran vs Realisasi | pohon COA YTD · matriks bulanan · per pusat biaya | Realisasi laba bersih = Laba Rugi |
| Laporan Proyek | ringkasan portofolio & rincian per proyek (RAB per akun) | Realisasi proyek = jurnal berdimensi proyek |
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

## Fitur lanjutan (fase 2)

| Fitur | Ringkasan | Lokasi kode |
| --- | --- | --- |
| **Multi-mata uang** | Master mata uang (IDR dasar) & kurs harian. Penawaran, SO, faktur, PO, tagihan, penerimaan, dan pembayaran dapat dalam valas; kurs terisi otomatis dari kurs terakhir ≤ tanggal dokumen (dapat ditimpa). Buku besar selalu IDR; pelunasan dengan kurs berbeda membukukan **laba/rugi selisih kurs terealisasi** (7-1200 / 7-2300). Sub-buku piutang/hutang dinilai pada kurs historis sehingga tetap cocok dengan buku besar. | `hooks.applyFx`, `documents.js` |
| **Retur penjualan / pembelian** | Mengacu faktur/tagihan asal; harga, PPN, dan kurs diambil dari dokumen asal; qty retur kumulatif tidak boleh melebihi qty asal. Retur penjualan: Dr Retur & PPN keluaran / Cr Piutang; stok masuk pada HPP asal (Dr Persediaan / Cr HPP). Retur pembelian: Dr Hutang / Cr Persediaan (biaya rata-rata) & PPN masukan; selisih harga ke akun selisih persediaan. Nilai retur mengurangi sisa tagihan dokumen asal. | `documents.js` |
| **Rekonsiliasi bank** | Mutasi buku besar rekening dicentang terhadap rekening koran; selisih harus nol, penyelesaian memakai pemisahan tugas, dan baris yang sudah direkonsiliasi terkunci. | `extras.reconDetail`, `documents.finalizeRecon` |
| **Shift kasir** | Modal awal → penjualan tunai shift → kas dihitung; selisih otomatis dijurnal ke *Beban Selisih Kas Kasir*. Satu laci hanya satu shift terbuka. | `documents.closeShift` |
| **Lokasi rak** | Lokasi rak per gudang dan penempatan default barang. | entitas `warehouse_bins`, `product_locations` |
| **Tutup buku tahunan** | Aksi pada periode fiskal: saldo akun laba rugi per cabang dipindahkan ke Saldo Laba (jurnal penutup 31 Des), tidak dapat diulang. | `documents.closeYear` |
| **MRP** | Kebutuhan (SO terbuka + komponen WO + stok pengaman) vs pasokan (stok + PO/PR + produksi berjalan), eksplosi BOM satu tingkat, saran beli/produksi, pembuatan PR langsung. | `extras.mrp` |
| **Analitik & BSC** | Analitik lintas modul (kategori, segmen, produk, beban, pemasok, umur piutang, persediaan, pipeline, SDM). Balanced Scorecard 4 perspektif dengan 15 sumber ukuran otomatis + input manual. | `extras.analytics`, `extras.balancedScorecard` |
| **Asisten data** | Tanya-jawab bahasa Indonesia (pendapatan, laba, kas, piutang, hutang, stok, persetujuan, status dokumen) yang dihitung dari buku besar dan menghormati izin. Tidak ada data yang dikirim ke layanan AI pihak ketiga. | `extras.assistant` |
| **Notifikasi & pencarian global** | Notifikasi kontekstual (persetujuan, jatuh tempo, stok, dokumen kedaluwarsa, kepatuhan, insiden, sandi/MFA) dan pencarian lintas dokumen di palet perintah. | `extras.notifications`, `extras.search` |
| **Lampiran** | PDF/gambar/Excel/Word/CSV/TXT ≤ 5 MB per rekaman; tipe diverifikasi dari isi (magic bytes), disimpan terenkripsi AES-256-GCM + SHA-256, unduh/hapus teraudit. | `extras.*Attachment` |
| **Impor CSV** | Data induk (produk, pelanggan, pemasok, karyawan, akun, kurs, dll.) melalui validasi yang sama dengan formulir; rujukan dapat berupa kode/nama; laporan galat per baris. | `extras.importRows` |
| **Cetak dokumen** | Pratinjau cetak A4 (faktur, PO, kuitansi, nota retur, bukti jurnal/kas, slip gaji, laporan) dengan kop perusahaan, terbilang rupiah, dan kolom tanda tangan; simpan sebagai PDF dari peramban. | `web/assets/erp-more.js` |
| **Portal pelanggan/pemasok** | Akun eksternal (peran PORTAL_*) yang terikat ke satu pelanggan/pemasok: ringkasan, dokumen (tanpa draf), cetak, kartu piutang/hutang, keamanan akun. Tidak ada akses ke API internal. | `extras.portal*` |
| **Widget dasbor** | Tata letak & visibilitas widget disimpan per pengguna di server. | `extras.getPref/setPref` |
| **Migrasi aditif** | Kolom baru ditambahkan otomatis ke tabel lama; akun, mata uang, dan peran baru disisipkan idempoten saat start. | `schema.migrate`, `upgrade.js` |

### Tambahan matriks posting

| Dokumen / aksi | Debit | Kredit |
| --- | --- | --- |
| Penerimaan / pembayaran valas | Bank (kurs bayar) · Rugi selisih kurs | Piutang/Hutang (kurs faktur) · Laba selisih kurs |
| Retur penjualan | Retur penjualan, PPN keluaran; Persediaan | Piutang; HPP |
| Retur pembelian | Hutang | Persediaan, PPN masukan, selisih harga |
| Tutup shift kasir | Selisih kas (kurang) / Kas (lebih) | Kas / Selisih kas |
| Tutup buku tahunan | Akun pendapatan (saldo) · Saldo laba (bila rugi) | Akun beban (saldo) · Saldo laba (bila laba) |

### API tambahan

`/api/notifications`, `/api/search`, `/api/analytics`, `/api/bsc`, `POST /api/assistant`,
`/api/mrp`, `POST /api/mrp/request`, `POST /api/import/:entitas`,
`/api/attachments/:entitas/:id` (GET/POST), `/api/attachment/:id` (GET/DELETE),
`/api/prefs/:kunci`, `/api/bank-recon/:id` (+ `PUT …/items`), `/api/fx-rate`,
`/api/reports/pajak`, `/api/reports/kartu-mitra`, `/api/portal/*`.

## Penganggaran (`server/ledger/budget.js`)

### Anggaran COA

* Entitas `budgets`: satu baris per **tahun × cabang × akun detail × pusat biaya**
  (kombinasi ganda ditolak). Pola bulanan `m01`…`m12`:
  * **Merata** — anggaran setahun dibagi 12 (sisa pembulatan di Desember);
  * **Mengikuti realisasi tahun lalu** — bobot bulanan dari buku besar tahun
    sebelumnya (jatuh ke merata bila belum ada data);
  * **Manual** — anggaran setahun = jumlah 12 bulan.
* Alur kerja: `draf → diajukan → disetujui` (persetujuan bertanda pemisahan tugas;
  muncul di Kotak Persetujuan), `ditolak` kembali dapat diubah, `revise`
  (tingkat setujui) mengembalikan anggaran disetujui ke draf.
* Laporan & kontrol hanya memakai anggaran **disetujui**; laporan dapat
  menampilkan versi "semua" untuk simulasi draf.
* Realisasi = saldo normal akun dari jurnal terposting tahun tersebut
  (jurnal penutup tahun dikecualikan). Anggaran s.d. periode = bulan penuh
  sebelum tanggal laporan + porsi hari bulan berjalan. Selisih = realisasi −
  anggaran s.d. periode; **menguntungkan** bila pendapatan di atas atau beban di
  bawah anggaran. Prakiraan akhir tahun = realisasi + sisa anggaran.
* `POST /api/budgets/copy` menyalin anggaran disetujui (atau realisasi) tahun
  sumber ke tahun tujuan sebagai draf dengan penyesuaian %, teraudit.
* Bagan Akun menampilkan kolom anggaran, realisasi, selisih, dan serapan yang
  dijumlahkan ke akun induk (`/api/reports/anggaran-akun`).

### Anggaran proyek

* `projects` memiliki **nilai kontrak** dan rincian **RAB** per akun biaya
  (`project_budget_lines`); anggaran proyek = jumlah rincian.
* Dimensi proyek: header PR, PO, tagihan, SO, faktur (terbawa PR → PO → tagihan
  dan SO → faktur) serta baris jurnal, kas, dan tagihan. Faktur memberi dimensi
  proyek pada pendapatan & HPP; tagihan pada baris beban/persediaan; retur
  penjualan mengikuti faktur asal.
* Komitmen = PO berstatus menunggu/disetujui yang belum ditagih (DPP × kurs).
* Indikator: EV = RAB × kemajuan fisik, PV = RAB × porsi waktu berjalan,
  CPI = EV ÷ realisasi, SPI = EV ÷ PV, EAC = RAB ÷ CPI, VAC = RAB − EAC,
  kesehatan sehat/waspada/kritis. Rincian proyek memuat kurva-S (PV vs biaya
  aktual kumulatif), RAB per akun vs realisasi & komitmen, pendapatan & margin,
  PO terbuka, tugas, dan transaksi.

### Kontrol anggaran

Kebijakan `approval_policy.budgetControl`: `none` · `warn` (bawaan) · `block`.
Diperiksa saat posting tagihan pemasok, kas keluar, serta pengajuan &
persetujuan jurnal manual (akun beban pokok/beban): realisasi tahun berjalan +
transaksi > anggaran COA disetujui (per akun & cabang), atau realisasi +
komitmen + transaksi > RAB proyek. Pengajuan PO proyek yang melampaui RAB
selalu dialihkan ke persetujuan manajer. Mode `warn` mengembalikan pesan
peringatan; `block` menolak transaksi (dibatalkan seluruhnya).

| API | Isi |
| --- | --- |
| `GET /api/reports/anggaran?year=&to=&view=ytd\|bulanan\|pusat-biaya&version=disetujui\|semua` | Anggaran vs realisasi COA |
| `GET /api/reports/anggaran-akun?year=` | Anggaran & realisasi per akun (bagan akun) |
| `GET /api/reports/proyek?to=` | Ringkasan proyek |
| `GET /api/reports/proyek-detail?project=&to=` | Rincian satu proyek |
| `POST /api/budgets/copy` | Salin anggaran (draf) |

## Penawaran ke pelanggan sebelum pesanan penjualan (`server/ledger/quotation.js`)

Alur: **draf → (menunggu persetujuan harga) → disetujui → terkirim → diterima →
selesai (menjadi SO)**; cabang lain: ditolak, kedaluwarsa, direvisi, batal.

| Langkah | Aturan |
| --- | --- |
| Buat | Masa berlaku bawaan `quoteValidityDays` (30 hari), termin & UP/surel dari pelanggan; sistem menghitung diskon tertinggi, estimasi HPP (biaya standar) dan margin kotor — **data internal**, tidak tampil di cetakan maupun portal. |
| Ajukan | Dibandingkan kebijakan `quoteDiscountLimit` (10 %), `quoteMinMargin` (15 %), `quoteApprovalThreshold` (Rp 500 jt). Sesuai kebijakan → disetujui otomatis; melanggar → *menunggu* di Kotak Persetujuan, disetujui oleh orang lain (pemisahan tugas) atau dikembalikan ke draf. |
| Kirim | Hanya penawaran disetujui & masih berlaku; tanggal kirim & penerima dicatat; penawaran muncul di portal pelanggan dan dapat dicetak/PDF dengan syarat & ketentuan. |
| Tanggapan | Pelanggan menerima (nama penanggung jawab + no. PO) atau menolak (alasan) **langsung di portal** (`POST /api/portal/quotations/:id/respond`, teraudit), atau dicatat tenaga penjual. |
| Kedaluwarsa | Penawaran disetujui/terkirim yang lewat masa berlaku otomatis *kedaluwarsa* (teraudit) dan tidak dapat diterima. |
| Revisi | Membuat draf baru `QT-…-R1`, `-R2` dst. yang menaut ke versi sebelumnya; versi lama *direvisi*. |
| Buat SO | Dari penawaran *diterima*: SO membawa pelanggan, barang, harga, diskon, valas, proyek, no. PO pelanggan, tanggal kirim (+ waktu penyerahan); penawaran menjadi *selesai*. Menghapus SO draf mengembalikan penawaran ke *diterima*. |

**Kebijakan `soRequiresQuotation`** (bawaan aktif): pesanan penjualan hanya dapat
diajukan bila berasal dari penawaran yang diterima (pelanggan antar perusahaan
dikecualikan). Bila harga lebih rendah, diskon lebih besar, qty melebihi, atau
barang tidak ada di penawaran, SO masuk *menunggu persetujuan* — di samping
pemeriksaan plafon kredit yang sudah ada.

**Analisis Penawaran** (`GET /api/reports/penawaran`): corong per status, tingkat
menang (jumlah & nilai), konversi ke SO, rata-rata waktu tanggapan pelanggan,
margin rata-rata, kinerja tenaga penjual, alasan kalah, dan penawaran yang
berakhir ≤ 7 hari. Notifikasi: penawaran diterima (perlu dibuatkan SO) dan
penawaran yang segera berakhir.

## Surat jalan (delivery order) & pengakuan piutang

Pesanan penjualan dapat dikirim dengan **surat jalan (DO)** — penuh atau beberapa
kali sebagian — lalu ditagih dengan faktur yang memuat **satu atau beberapa** surat
jalan. **Piutang selalu diakui saat faktur diterbitkan**, bukan saat barang dikirim.

| Kejadian | Debit | Kredit | Stok |
| --- | --- | --- | --- |
| Surat jalan dikirim | 1-1350 Persediaan Terkirim Belum Difakturkan (nilai pokok rata-rata) | Persediaan barang | keluar dari gudang DO |
| Faktur dari DO diterbitkan | Piutang usaha; HPP (nilai pokok DO) | Pendapatan, PPN keluaran; 1-1350 | tidak berubah |
| Faktur dari DO dibatalkan | (jurnal balik) | | tidak berubah — DO kembali *dikirim* |
| Surat jalan dibatalkan (belum difakturkan) | (jurnal balik) | | kembali ke gudang |

Skenario yang didukung:

1. **SO penuh → DO sebagian berkali-kali → satu faktur dari beberapa DO.**
   SO → *Buat surat jalan* (mode "isi manual") → isi qty kirim → *Kirim & posting
   stok*; ulangi untuk sisa. Lalu **Faktur dari surat jalan** → pilih pelanggan →
   centang DO-DO tersebut → *Buat faktur*.
2. **SO penuh → DO penuh → faktur dari satu DO.** SO → *Buat surat jalan* (mode
   "seluruh sisa") → kirim → di DO pilih *Buat faktur dari surat jalan ini*.
3. **Beberapa SO dikirim penuh → satu faktur gabungan.** Setiap SO dibuatkan DO
   penuh; faktur gabungan memilih DO dari beberapa SO pelanggan yang sama.

Aturan & kontrol:

* Qty DO ≤ sisa pesanan (memperhitungkan DO draf/terkirim lain); barang harus ada
  di SO; harga & diskon diambil dari SO.
* Faktur gabungan: pelanggan, perusahaan, mata uang, dan tarif PPN harus sama;
  hanya DO berstatus *dikirim* yang belum masuk faktur lain; setiap DO diperiksa
  cakupan perusahaan/cabang pengguna. Faktur draf mengunci DO (tidak dapat
  ditagih dua kali); baris faktur dari DO tidak dapat diubah; menghapus draf
  melepas DO.
* Status SO: *disetujui → dikirim sebagian → terkirim* (penuh, belum seluruhnya
  difakturkan) *→ selesai*. Faktur langsung dari SO (tanpa DO) tetap tersedia bila
  SO belum memiliki DO.
* Retur penjualan dari faktur DO memakai nilai pokok DO.
* **Pemenuhan Pesanan** (`GET /api/reports/pemenuhan`): pesanan terbuka per baris
  (dipesan/terkirim/difakturkan/sisa, keterlambatan) dan DO belum difakturkan
  (umur, nilai jual, nilai pokok) yang **direkonsiliasi dengan saldo akun 1-1350**.
* API: `GET /api/deliveries/uninvoiced?customer=`, `POST /api/deliveries/invoice`
  `{ delivery_ids: [...], date }`.

## Pembayaran bertahap (piutang pelanggan & hutang pemasok) (`server/ledger/payments.js`)

**Termin bertahap** (Keuangan → Termin Pembayaran): tahap berisi label, persentase
(total 100%), dan jatuh tempo (hari setelah faktur), mis. *DP 30% + pelunasan 30
hari*, *Termin proyek 30/40/30*, *Cicilan 3× bulanan*. Termin bawaan diatur per
pelanggan/pemasok dan dapat diganti per faktur/tagihan; jatuh tempo dokumen =
tahap terakhir.

* Saat faktur/tagihan diposting terbentuk **jadwal angsuran** (`installments`);
  pembulatan masuk ke tahap terakhir. Tanpa termin = satu angsuran.
* Setiap pembayaran (penuh atau **sebagian**) dialokasikan otomatis ke angsuran
  tertua (FIFO); pembatalan pembayaran/retur menghitung ulang alokasi.
* **Umur piutang/hutang dihitung per angsuran** (jatuh tempo masing-masing tahap)
  dan tetap direkonsiliasi dengan buku besar.

**Jenis penerimaan pelanggan / pembayaran pemasok**

| Jenis | Jurnal penerimaan pelanggan | Jurnal pembayaran pemasok |
| --- | --- | --- |
| Pelunasan (penuh/sebagian) | Dr Bank (neto biaya bank), Beban adm. bank, Potongan penjualan (4-1900), PPh 23 dibayar di muka (1-1410) · Cr Piutang | Dr Hutang · Cr Bank (+ biaya transfer), Potongan pembelian (7-1300), Hutang PPh 23 (2-1330); Dr Beban adm. bank |
| Titipan / uang muka tanpa faktur | Dr Bank · Cr Uang Muka Pelanggan (2-1600, per pelanggan) | Dr Uang Muka Pembelian (1-1510, per pemasok) · Cr Bank |
| Pakai saldo uang muka | Dr Uang Muka Pelanggan · Cr Piutang | Dr Hutang · Cr Uang Muka Pembelian |

Nilai yang melunasi faktur/tagihan = kas/uang muka + potongan + PPh 23 (tidak boleh
melebihi sisa). Selisih kurs dibukukan otomatis untuk dokumen valas; uang muka
dicatat dalam IDR. Pemakaian uang muka tidak boleh melebihi saldonya; uang muka
yang sudah dipakai tidak dapat dibatalkan sebelum pemakaiannya dibatalkan.
Titipan ini tanpa faktur pajak; uang muka atas pesanan dengan PPN memakai dokumen
**Uang Muka Penjualan / Pembelian** (bagian berikut).

**Aksi cepat**: *Terima pembayaran* di faktur (langsung diposting) dan *Ajukan
pembayaran* di tagihan (masuk Kotak Persetujuan — pemisahan tugas) dengan nilai
bawaan = sisa terbuka; dapat diisi sebagian, dari kas/bank atau saldo uang muka,
beserta potongan, PPh 23, dan biaya bank. Laci faktur/tagihan menampilkan jadwal
angsuran, riwayat pembayaran & retur, serta saldo uang muka mitra; portal
pelanggan/pemasok menampilkan jadwal pembayaran.

**Laporan**: Jadwal Angsuran Piutang / Hutang (`GET /api/reports/angsuran?side=ar|ap&days=`)
— angsuran terlambat, jatuh tempo 7/30 hari (perkiraan arus kas), dokumen bertahap,
dan saldo uang muka per mitra. API rincian: `GET /api/settlement/:entitas/:id`,
`GET /api/advance/customer|supplier/:id`.

## Giro mundur (bilyet giro / cek mundur)

Pelunasan faktur/tagihan dapat memakai **cara bayar "Giro / cek mundur"** (nomor,
bank penerbit, tanggal efektif). Giro hanya untuk pelunasan dokumen IDR.

| Kejadian | Giro masuk (pelanggan) | Giro keluar (pemasok) |
| --- | --- | --- |
| Giro diterima / diserahkan | Dr 1-1250 Giro Mundur Diterima · Cr Piutang — faktur lunas/sebagian, status giro *belum cair* | Dr Hutang · Cr 2-1150 Giro Mundur Diberikan — tagihan lunas/sebagian (pembayaran tetap melalui persetujuan SoD) |
| Giro cair (≥ tanggal efektif) | Dr Bank (neto biaya kliring), Beban adm. bank · Cr 1-1250 | Dr 2-1150, Beban adm. bank · Cr Bank |
| Giro ditolak / dibatalkan (sebelum cair) | Jurnal penerimaan dibalik → piutang & angsuran faktur terbuka kembali; opsi **tahan pelanggan** | Jurnal pembayaran dibalik → tagihan terbuka kembali |

Aturan: giro tidak dapat dicairkan sebelum tanggal efektif; giro yang sudah cair
tidak dapat dibatalkan/ditolak (koreksi dengan transaksi baru); aksi *Giro cair* /
*Giro ditolak* hanya muncul untuk giro yang belum cair. Pelunasan cepat dari
faktur/tagihan mendukung sumber dana giro.

**Register Giro Mundur** (`GET /api/reports/giro?side=in|out`): giro belum cair,
efektif ≤ 7 hari, lewat tanggal efektif, cair & ditolak 90 hari terakhir — saldo
giro belum cair **direkonsiliasi dengan akun 1-1250 / 2-1150**. Notifikasi: giro
masuk jatuh tempo ≤ 3 hari (setor kliring) dan giro keluar efektif ≤ 3 hari
(siapkan saldo).

## Uang muka penjualan & pembelian (faktur uang muka atas SO/PO)

Uang muka atas pesanan dicatat sebagai dokumen tersendiri — **Uang Muka Penjualan**
(`sales_advances`, nomor UMJ) dan **Uang Muka Pembelian** (`purchase_advances`, UMB) —
dibuat dari SO/PO (aksi *Buat uang muka (DP)*: persentase DPP pesanan atau nilai) atau
langsung. PPN terutang saat uang muka ditagih; DPP uang muka kemudian **dipotongkan**
pada faktur/tagihan akhir sehingga PPN akhir hanya atas sisa DPP.

| Kejadian | Penjualan | Pembelian |
| --- | --- | --- |
| Uang muka terbit/diposting | Dr Piutang · Cr 2-1610 Uang Muka Penjualan (DPP, per pelanggan), PPN Keluaran | Dr 1-1520 Uang Muka Pembelian (DPP, per pemasok), PPN Masukan · Cr Hutang |
| Uang muka dibayar (penuh/sebagian, transfer/giro) | Penerimaan: Dr Bank · Cr Piutang | Pembayaran (persetujuan SoD): Dr Hutang · Cr Bank |
| Faktur/tagihan akhir memotong uang muka | Dr Piutang (neto), Dr 2-1610 (potongan) · Cr Pendapatan (DPP penuh), PPN Keluaran (atas DPP − potongan) | Dr Persediaan/Beban (DPP penuh), PPN Masukan (atas DPP − potongan) · Cr Hutang (neto), Cr 1-1520 |

Aturan:

* Pesanan harus IDR dan berstatus disetujui (SO: disetujui/dikirim sebagian/terkirim;
  PO: disetujui); total uang muka per pesanan ≤ DPP pesanan; PPN mengikuti pesanan.
* Hanya uang muka **lunas** milik mitra yang sama yang dapat dipotong; potongan ≤ sisa
  DPP uang muka dan ≤ DPP dokumen. Faktur dari surat jalan/SO dan tagihan dari PO
  mengusulkan potongan otomatis: proporsional (DPP dokumen × uang muka ÷ DPP pesanan),
  dan **seluruh sisa** pada penagihan terakhir pesanan. Potongan dapat diubah pada draf.
* Status uang muka: draf → terbit → dibayar sebagian → lunas (*siap dipotong*) →
  diterapkan (*habis dipotong*). Uang muka belum dibayar tampil di umur piutang/hutang,
  jadwal angsuran, dan saldo mitra; dapat dilunasi lewat aksi cepat atau baris
  `advance_id` pada penerimaan/pembayaran.
* Pembatalan: uang muka hanya dapat dibatalkan bila belum dibayar; pembayaran uang
  muka yang sudah dipotongkan tidak dapat dibatalkan; membatalkan faktur/tagihan akhir
  mengembalikan sisa uang muka. SO/PO yang memiliki uang muka tidak dapat dibatalkan.

**Retur penjualan atas faktur yang memotong uang muka.** Bagian DPP retur yang dibayar
dari uang muka = DPP retur × potongan uang muka ÷ DPP faktur (dibatasi sisa potongan yang
belum diretur). Pilihan *Bagian uang muka* pada retur:

| Mode | Jurnal retur (DPP retur R, bagian uang muka U, tarif PPN t) | Efek |
| --- | --- | --- |
| Pulihkan ke uang muka (bawaan) | Dr Retur Penjualan R, PPN Keluaran (R − U)·t · Cr Piutang (R − U)(1 + t), Cr 2-1610 U | Uang muka kembali *siap dipotong* sebesar U — dipotong lagi pada faktur pengganti; PPN uang muka tetap |
| Jadikan saldo kredit | Dr Retur Penjualan R, PPN Keluaran R·t · Cr Piutang (R − U)(1 + t), Cr 2-1600 U(1 + t) | Bagian uang muka beserta PPN menjadi saldo kredit pelanggan |

Bagian piutang hanya mengurangi **sisa** faktur; kelebihannya (faktur sudah dibayar/lunas)
menjadi saldo kredit pelanggan (2-1600) atau **dikembalikan lewat rekening** bila
*Kembalikan kelebihan lewat rekening* diisi. Faktur lunas kini dapat diretur. Retur
mencatat *mengurangi piutang faktur* dan *kelebihan*; pembatalan retur ditolak bila
saldo kredit darinya sudah dipakai atau uang muka yang dipulihkan sudah dipotong lagi;
faktur yang memiliki retur terposting tidak dapat dibatalkan.

**Retur pembelian atas tagihan yang memotong uang muka** mengikuti aturan yang sama
(sisi berlawanan):

| Mode | Jurnal retur (DPP retur R, bagian uang muka U, tarif PPN t) | Efek |
| --- | --- | --- |
| Pulihkan ke uang muka (bawaan) | Dr Hutang (R − U)(1 + t), Dr 1-1520 U · Cr Persediaan/selisih harga R, PPN Masukan (R − U)·t | Uang muka pembelian kembali *siap dipotong* pada tagihan pengganti |
| Jadikan saldo uang muka | Dr Hutang (R − U)(1 + t), Dr 1-1510 U(1 + t) · Cr Persediaan/selisih harga R, PPN Masukan R·t | Bagian uang muka beserta PPN menjadi saldo uang muka ke pemasok |

Kelebihan atas sisa tagihan (tagihan sudah dibayar) menjadi saldo uang muka ke pemasok
(1-1510) atau **diterima kembali di rekening** (*Terima pengembalian dana di rekening*).
Tagihan lunas dapat diretur; tagihan dengan retur terposting tidak dapat dibatalkan.

**Register Uang Muka** (`GET /api/reports/uang-muka?side=ar|ap`): belum dibayar, siap
dipotong, sudah dipotong per dokumen & pesanan — sisa DPP belum dipotong
**direkonsiliasi dengan akun 2-1610 / 1-1520**.

## Deposit pelanggan

Dokumen **Deposit Pelanggan** (`customer_deposits`, nomor DPS) mencatat dana titipan
pelanggan yang tidak terkait pesanan tertentu — liabilitas, bukan pendapatan.

| Jenis | Akun | Penggunaan |
| --- | --- | --- |
| Deposit saldo (prabayar) | 2-1620 Deposit Pelanggan | Dipakai melunasi faktur, nota debet, atau faktur uang muka |
| Uang jaminan | 2-1630 Uang Jaminan Pelanggan | Dikembalikan saat kontrak berakhir (*jatuh tempo pengembalian*), dikompensasikan ke faktur terbuka, atau dicairkan sebagai ganti rugi |

| Kejadian | Jurnal |
| --- | --- |
| Deposit diterima | Dr Bank · Cr 2-1620 / 2-1630 (per pelanggan) |
| Dipakai melunasi faktur (aksi *Pakai untuk melunasi faktur*, atau dari faktur → *Terima pembayaran* sumber dana "Deposit pelanggan") | Penerimaan jenis *Pakai deposit pelanggan*: Dr 2-1620 / 2-1630 · Cr Piutang |
| Dikembalikan | Dr 2-1620 / 2-1630, Beban adm. bank · Cr Bank |
| Jaminan dicairkan (kompensasi) | Dr 2-1630 · Cr 7-1400 Pendapatan Kompensasi (atau akun pilihan) |

Status: draf → diterima → terpakai sebagian → habis. Pemakaian tidak boleh melebihi
saldo deposit maupun sisa faktur; deposit hanya untuk pelanggan pemiliknya dan dokumen
IDR. Membatalkan penerimaan pemakaian mengembalikan saldo deposit; deposit hanya dapat
dibatalkan sebelum dipakai/dikembalikan/dicairkan; pengembalian & pencairan bersifat final
(koreksi dengan transaksi baru). Bila sumber dana deposit dipilih tanpa nomor deposit,
dipakai deposit saldo tertua pelanggan.

**Register Deposit** (`GET /api/reports/deposit`): saldo per deposit, saldo prabayar &
jaminan, jaminan jatuh tempo ≤ 30 hari (juga notifikasi), dipakai/dikembalikan/dicairkan —
**direkonsiliasi dengan akun 2-1620 dan 2-1630**. Riwayat per deposit:
`GET /api/deposit-history/customer_deposits/:id`. Saldo deposit juga tampil pada data pelanggan.

### Deposit di pemasok

Padanannya untuk dana **kita** di pemasok (`supplier_deposits`, nomor DPB) — **aset**:

| Jenis | Akun | Penggunaan |
| --- | --- | --- |
| Deposit saldo (prabayar) | 1-1530 Deposit di Pemasok | Dipakai membayar tagihan, nota kredit pemasok, atau uang muka pembelian |
| Uang jaminan | 1-1540 Uang Jaminan Dibayar | Ditagih kembali saat kontrak (sewa gudang/kontainer, kontrak pasok) berakhir, dipakai membayar tagihan, atau dihanguskan |

| Kejadian | Jurnal |
| --- | --- |
| Deposit dibayar (*Ajukan* → *Setujui & bayar* oleh orang lain — SoD) | Dr 1-1530 / 1-1540 (per pemasok) · Cr Bank |
| Dipakai membayar tagihan (aksi *Pakai untuk membayar tagihan*, atau dari tagihan → *Ajukan pembayaran* sumber dana "Deposit di pemasok") | Pembayaran jenis *Pakai deposit di pemasok* (tetap disetujui orang lain): Dr Hutang · Cr 1-1530 / 1-1540 |
| Diterima kembali | Dr Bank (neto), Beban adm. bank · Cr 1-1530 / 1-1540 |
| Jaminan hangus | Dr 7-2400 Beban Kompensasi / Jaminan Hangus (atau akun pilihan) · Cr 1-1540 |

Status: draf → menunggu → dibayar → terpakai sebagian → habis (atau ditolak → diajukan
ulang). Saldo deposit berkurang saat pembayaran pemakaiannya **diposting**; pembatalan
pembayaran mengembalikan saldo. Register Deposit tab *Deposit di pemasok*
(`GET /api/reports/deposit?side=ap`) **direkonsiliasi dengan akun 1-1530 dan 1-1540**;
riwayat `GET /api/deposit-history/:entitas/:id`; notifikasi jaminan di pemasok yang jatuh
tempo ≤ 30 hari; saldo deposit tampil pada data pemasok.

## Nota debet & nota kredit

Penyesuaian nilai piutang/hutang tanpa retur barang (koreksi harga, potongan/rabat,
klaim, ongkos, denda, lainnya). Baris nota berisi akun lawan (pendapatan/beban/potongan)
dan nilai DPP; PPN opsional.

| Dokumen | Efek | Jurnal | Alur |
| --- | --- | --- | --- |
| Nota Kredit Pelanggan (NK) | Mengurangi piutang | Dr akun baris, PPN Keluaran · Cr Piutang (diterapkan ke faktur) **atau** Cr 2-1600 Uang Muka Pelanggan (saldo kredit pelanggan) | Ajukan → Setujui (SoD, pembuat ≠ penyetuju) / Tolak |
| Nota Debet Pelanggan (ND) | Menambah piutang | Dr Piutang · Cr akun baris, PPN Keluaran | Posting → dokumen terbuka (jatuh tempo, angsuran, umur piutang) → Terima pembayaran |
| Nota Debet Pemasok (NDB) | Mengurangi hutang | Dr Hutang (diterapkan ke tagihan) **atau** Dr 1-1510 Uang Muka Pembelian · Cr akun baris, PPN Masukan | Ajukan → Setujui (SoD) / Tolak |
| Nota Kredit Pemasok (NKB) | Menambah hutang | Dr akun baris, PPN Masukan · Cr Hutang | Posting → dokumen terbuka → Ajukan pembayaran (SoD) |

Aturan: nota pengurang yang diterapkan ke faktur/tagihan hanya untuk dokumen IDR
yang masih terbuka dan tidak boleh melebihi sisa; faktur/tagihan harus milik mitra
yang sama. Tanpa dokumen, nilainya menjadi saldo kredit mitra yang dapat dipakai
lewat pelunasan *Pakai uang muka*. Pembatalan membalik jurnal: nota terapan
membuka kembali faktur/tagihan; nota tanpa terapan hanya dapat dibatalkan bila
saldo kredit mitra masih mencukupi. Nota penambah yang sudah (sebagian) dibayar
tidak dapat dibatalkan.

Baris penerimaan/pembayaran merujuk tepat satu dokumen: `invoice_id` atau
`debit_note_id` (piutang), `bill_id` atau `credit_note_id` (hutang); pelunasan
dengan giro, uang muka, potongan, dan PPh 23 berlaku sama. Nota penambah tampil di
umur piutang/hutang, Jadwal Angsuran, kartu piutang, dan saldo mitra; nota pengurang
tampil sebagai kredit di rincian pelunasan faktur/tagihan.
