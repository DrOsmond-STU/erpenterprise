# ERP Enterprise

Monorepo untuk aplikasi ERP terpadu multi-cabang: **purwarupa UI/UX** (HTML/JS
tanpa build) dan **implementasi produksi** yang sedang dikembangkan dari
purwarupa tersebut — Vue 3 di sisi klien, NestJS + PostgreSQL di sisi peladen,
dengan paket domain bersama yang memuat aturan buku besar.

Seluruh modul operasional **bermuara pada buku besar**: setiap dokumen sumber
diposting sebagai jurnal berpasangan per cabang, lalu diturunkan menjadi kartu
buku besar, neraca saldo, laba rugi, dan neraca — per cabang maupun konsolidasi
dengan eliminasi rekening koran antar kantor.

## Status implementasi — modul & integrasi buku besar

Seluruh fase rencana pengembangan (dok. 13, Fase 1–5) telah diimplementasikan. Setiap
modul memposting jurnal otomatis lewat satu jalur (`postAutoJournal`, idempoten per
dokumen & aturan), sehingga langsung tampil di **kartu buku besar, neraca saldo, laba
rugi, dan neraca** — per cabang maupun konsolidasi — dan diperiksa oleh halaman
**Integrasi & Rekonsiliasi**.

| Modul | Dokumen → jurnal | Pemeriksaan rekonsiliasi |
| --- | --- | --- |
| Penjualan & piutang | faktur (pendapatan, PPN keluaran, HPP), penerimaan | piutang |
| CRM & penawaran | pra-akuntansi → pesanan penjualan; jurnal saat faktur pesanan terbit | piutang |
| Pengadaan (PR, RFQ) | komitmen pra-akuntansi → PO; jurnal saat barang PO diterima & ditagih | hutang, GRNI, persediaan |
| Pembelian & hutang | penerimaan barang (persediaan/GRNI), tagihan, pembayaran | hutang, GRNI |
| Kas & bank | transfer (RK antar cabang), jurnal dari mutasi bank, setoran PPN | kas-bank, RK |
| Persediaan | opname/penyesuaian, transfer antar gudang & cabang | persediaan, dalam perjalanan |
| Produksi | pemakaian bahan → WIP, hasil QC → barang jadi | barang dalam proses |
| POS / kasir | posting shift: kas/penampung, penjualan, PPN, HPP, selisih kas | persediaan, kas-bank |
| Aset tetap | perolehan, penyusutan bulanan, pelepasan, pemeliharaan | aset tetap, nilai buku |
| SDM & penggajian | posting gaji (beban, PPh 21, BPJS), pembayaran lintas cabang | utang gaji, RK |
| Anggaran | realisasi dari buku besar (tanda alami akun) + komitmen PO/PR/draf tagihan jasa | — (laporan) |
| Proyek | dimensi `project_id` pada baris jurnal (memorial, tagihan jasa atas PO/PR proyek) | — (laporan) |
| Jurnal memorial | dibuat & diposting orang berbeda (baris dapat bertanda proyek) | keseimbangan jurnal |

Kontrol: RLS per perusahaan/cabang di PostgreSQL, izin granular per aksi, empat mata per
dokumen (juga untuk admin), kotak persetujuan lintas modul, jejak audit berantai hash
dengan verifikasi, enkripsi kolom data pribadi karyawan, dan laporan kepatuhan.

## Struktur repositori

| Jalur | Isi |
| --- | --- |
| `packages/domain` | `@erp/domain` — tipe, validasi jurnal (zod), pembulatan rupiah, klasifikasi akun, penyusun neraca saldo / laba rugi / neraca / konsolidasi, matriks izin. Dipakai API dan web. Uji regresi vitest terhadap data purwarupa. |
| `packages/ui` | `@erp/ui` — token desain dan CSS bersama (disinkronkan dari purwarupa lewat `tools/sync-ui.mjs`). |
| `apps/api` | `@erp/api` — NestJS 11 + PostgreSQL 16: autentikasi (Argon2id, JWT + refresh cookie berotasi), izin granular, konteks cabang/periode, jurnal, buku besar, laporan, konsolidasi, rekonsiliasi, log audit berantai hash, asisten AI (Claude API, alat hanya-baca), migrasi SQL, seed, uji e2e. |
| `apps/web` | `@erp/web` — Vue 3 + Vite + Pinia + Vue Router: masuk, dasbor, asisten AI, jurnal, kartu buku besar, neraca saldo, laba rugi, neraca, konsolidasi, integrasi & rekonsiliasi, cabang, bagan akun, rekening bank, log audit. |
| `infra/` | Skrip penyiapan basis data, Dockerfile API & web, konfigurasi nginx, `hosting/` (cPanel: .htaccess, runner cron, templat env). |
| `docker-compose.yml` | Lingkungan lokal/staging: db + api + web pada satu origin (`http://localhost:8080`). |
| `prototype/` | Purwarupa UI/UX (lihat bagian bawah). |
| `docs/` | Dokumen desain (01–07) dan pra-pengembangan (08–13). |
| `tools/` | `build.mjs`, `smoke.mjs` (purwarupa), `web-e2e.mjs` (uji peramban aplikasi web), `sync-ui.mjs`. |

## Mulai cepat (pengembangan lokal)

Prasyarat: Node.js ≥ 22, PostgreSQL 16 lokal (atau Docker).

```bash
npm install

# 1. Basis data: peran pemilik skema erp_owner + basis data erp (sebagai superuser Postgres)
sudo -u postgres sh infra/db-setup.sh

# 2. Konfigurasi API
cp apps/api/.env.example apps/api/.env      # sesuaikan DATABASE_*_URL, JWT_SECRET (≥ 32 karakter), SEED_PASSWORD

# 3. Bangun, migrasi, isi data contoh (PT Karya Nusantara Mandiri, 4 cabang, ±550 jurnal)
npm run build -w @erp/domain && npm run build -w @erp/api
npm run api:migrate
npm run api:seed

# 4. Jalankan
npm run api:dev            # API di http://localhost:3000/api/v1
npm run web:dev            # Web di http://localhost:5173 (proksi /api → :3000)
```

Pengguna seed (kata sandi = `SEED_PASSWORD`):

| Surel | Peran | Cabang |
| --- | --- | --- |
| `admin@knm.co.id` | Admin sistem — memegang **seluruh izin** (semua modul & input data) | semua |
| `andi@knm.co.id` | Akuntan senior (posting & balik jurnal, tutup periode, konsolidasi, audit) | semua |
| `sari@knm.co.id` | Staf keuangan (buat jurnal, laporan — tanpa posting) | semua |
| `osmond@knm.co.id` | Manajer operasional (laporan & konsolidasi, baca saja) | semua |
| `fitri@knm.co.id` | Staf gudang (tanpa akses buku besar) | SBY |
| `taufik@knm.co.id` | Manajer operasional cabang | MDN |

### Dengan Docker Compose

```bash
cp apps/api/.env.example apps/api/.env
docker compose up --build -d
docker compose exec api npm run migrate
docker compose exec api npm run seed
# buka http://localhost:8080
```

## Pengujian

```bash
npm run check              # typecheck domain + api + web, uji unit domain (vitest)
npm run api:e2e            # uji e2e API (butuh basis data yang sudah dimigrasi & di-seed)
npm run web:e2e            # uji peramban aplikasi web (butuh API :3000 dan `npm run preview -w @erp/web` di :5173)
npm test                   # build purwarupa + uji asap purwarupa (Playwright)
```

Uji e2e API memeriksa autentikasi (kunci akun, rotasi refresh, deteksi
pemakaian ulang), pembatasan konteks cabang, pemisahan tugas pembuat ≠
pemosting, invarian basis data (jurnal seimbang, akun detail, periode
terkunci, jurnal terposting tak dapat diubah), laporan per cabang dan
konsolidasi yang seimbang, rekonsiliasi sub-buku dan rantai audit, serta
pengelolaan pengguna, peran & pengaturan (kata sandi sementara, wajib ganti,
penguncian & buka kunci, admin terakhir, pemisahan tugas pada peran), siklus
penjualan (plafon, faktur, HPP, penerimaan, pembatalan), dan siklus pembelian
(rekening pemasok & masa tunggu, persetujuan PO, penerimaan barang, kecocokan
tiga arah, pembayaran dua penyetuju, umur hutang, rekonsiliasi hutang & GRNI),
serta kas & bank (transfer antar cabang lewat RK, impor CSV/MT940, pencocokan,
finalisasi rekonsiliasi, setoran PPN terpusat dengan NTPN).

## Bagan akun bertingkat

| Level | Pola kode | Tipe | Contoh | Tampil di |
| --- | --- | --- | --- | --- |
| 1 | `9-0000` | header | 1-0000 Aset | neraca, laba rugi |
| 2 | `9-9000` | header | 1-1000 Aset Lancar | neraca, laba rugi (seksi & subtotal) |
| 3 | `9-9900` | header | 1-1100 Bank, 1-1200 Kas | neraca, laba rugi (baris) |
| 4 | `9-9999` | detail (atau header pengelompok) | 1-1101 BCA — Giro Operasional | neraca saldo, kartu buku besar |
| 5 | `9-9999.99` | detail | 1-1101.01 | neraca saldo, kartu buku besar |

- Induk ditentukan pola kode (1-1101 → 1-1100 → 1-1000 → 1-0000); basis data
  menolak detail di level 1–3 dan header di level 5.
- **Hanya akun detail** yang menerima jurnal, tampil di neraca saldo & kartu buku
  besar, dan dapat **ditautkan** ke fitur lain. Neraca & laba rugi menjumlahkan
  detail ke header level 3.
- Setiap rekening di **Kas & Bank** otomatis mendapat akun detail sendiri di
  bawah header 1-1100 Bank (atau 1-1200 Kas untuk rekening berjenis "Kas"); jurnal
  cukup memilih akun tersebut, rekening sub-bukunya diturunkan otomatis.
- **Pengaturan → Pemetaan akun** menentukan akun detail untuk posting otomatis
  (piutang, pendapatan barang/jasa, PPN, HPP, persediaan, utang, RK antar
  kantor, laba berjalan/ditahan). Header ditolak; perubahan wajib beralasan.
  Akun yang ditautkan tidak dapat dinonaktifkan atau dihapus.
- **Nomor akun tidak dapat diubah**; yang dapat diubah hanya nama, status, sifat
  kontra (bila belum bertransaksi), dan tipe header/detail untuk level 4 (bila
  tidak punya anak, transaksi, maupun tautan).
- **Hapus**: header hanya bila tidak ada lagi akun di bawahnya; detail hanya bila
  belum dipakai jurnal dan tidak terkait fitur lain (rekening kas/bank, pemetaan
  akun, tagihan pemasok, aset). Aturan ini juga dijaga trigger basis data (0006).
- Migrasi `0005_coa_levels.sql` memindahkan data lama (struktur level 0–2) ke
  struktur ini: tiap akun detail lama menjadi header level 3 + detail `…01`,
  dan baris "Kas & Setara Kas" dipecah ke akun tiap rekening. Saldo tidak berubah.

## CRUD & paginasi

| Data | Tambah | Ubah | Nonaktif/aktif | Hapus | Izin |
| --- | --- | --- | --- | --- | --- |
| Jurnal umum | memorial manual (status menunggu persetujuan) | — | posting / tolak / jurnal balik | — | `ledger.journal.*` |
| Bagan akun | di bawah akun header | nama | saldo harus nol, tanpa anak aktif | hanya bila belum pernah dipakai jurnal | `ledger.account.manage` |
| Rekening kas & bank | per cabang | nama, bank, 4 digit nomor | saldo harus nol, bukan rekening utama cabang | hanya bila belum dipakai jurnal | `ledger.account.manage` |
| Cabang | dengan giro & kas kecil otomatis | seluruh data kecuali kode | kecuali kantor pusat | — | `org.branch.manage` |
| Periode fiskal | — | — | tutup (`ledger.period.close`) / buka kembali (`ledger.period.reopen`, orang berbeda) | — | |

Jurnal yang sudah diajukan tidak dapat diubah atau dihapus: koreksi lewat tolak (sebelum
posting) atau jurnal balik (sesudah posting). Akun sistem (kas, piutang, hutang,
persediaan, RK antar kantor, laba berjalan) dilindungi. Setiap perubahan wajib beralasan
dan tercatat di jejak audit.

Semua tabel data memakai komponen `Pager` (10/25/50/100 baris per halaman): jurnal dan
jejak audit dipaginasi di server; bagan akun, rekening, kartu buku besar, neraca saldo,
periode, integrasi, konsolidasi, dasbor, dan daftar cabang dipaginasi di klien. Laporan
laba rugi dan neraca sengaja ditampilkan utuh karena subtotalnya harus terbaca bersama.

## Pengguna, peran & pengaturan

| Menu | Isi | Izin |
| --- | --- | --- |
| Sistem → Pengguna | tambah, ubah nama/email, atur peran per cabang, nonaktifkan/aktifkan, reset kata sandi, buka kunci | `admin.user.manage` |
| Sistem → Peran & Izin | matriks peran × izin (klik sel, simpan dengan alasan), peran baru (salin dari peran lain), ubah nama, hapus peran yang tidak dipakai | `admin.role.manage` |
| Sistem → Pengaturan | profil perusahaan, awal tahun buku, kebijakan dokumen, tema tampilan, ringkasan kebijakan keamanan | lihat: semua; ubah: `admin.settings.manage` |
| Profil (menu pengguna) | ganti kata sandi sendiri, daftar & cabut sesi aktif | semua pengguna |

Pengguna baru dan hasil reset mendapat **kata sandi sementara** yang ditampilkan
sekali; saat masuk mereka diarahkan ke Profil dan seluruh API lain menolak
(`PASSWORD_CHANGE_REQUIRED`) sampai kata sandi pribadi ditetapkan. Kebijakan kata
sandi: minimal 12 karakter, huruf + angka, tidak memuat nama email. Server
menolak perubahan yang melanggar pemisahan tugas (per peran maupun gabungan
peran seorang pengguna), menghapus peran yang masih dipakai, atau menyisakan
sistem tanpa admin aktif. Menonaktifkan pengguna atau mengubah perannya
mengeluarkan semua sesinya.

**Admin Sistem memegang seluruh izin** (migrasi `0008`), termasuk izin modul yang
ditambahkan kemudian (pemicu basis data memberikannya otomatis), sehingga admin dapat
membuka dan menginput di semua modul. Pemegang peran admin dikecualikan dari aturan
pasangan izin tingkat peran/pengguna, tetapi **kontrol empat mata per dokumen tetap
berlaku**: jurnal, pesanan, faktur, PO, tagihan pemasok, pembayaran, dan rekening
pemasok yang dibuat admin harus disetujui/diposting orang lain; admin dapat
menyetujui dokumen buatan orang lain.

## Penjualan & piutang

Menu **Penjualan**: Pesanan Penjualan, Faktur, Piutang Usaha, Pelanggan, Produk & Jasa.

```
Pesanan (draf) ──ajukan──► cek plafon & batas ──► disetujui ──buat faktur──► Faktur (draf)
                                   │ gagal                                      │ terbitkan (orang lain)
                                   ▼                                            ▼
                         menunggu → setujui / tolak (manajer)   Jurnal otomatis: Dr 1-1301 │ Cr 4-1101, 4-1201, 2-1401
                                                                                 Dr 5-1101 │ Cr 1-1503/1-1501 (stok cabang −)
                                                            Penerimaan ──► Dr akun detail rekening cabang (1-11xx/1-12xx) │ Cr 1-1301
```

- **Plafon kredit** dihitung lintas cabang: piutang terbuka + faktur draf + pesanan
  belum difakturkan. Pesanan menunggu persetujuan bila melebihi sisa plafon
  (kebijakan *Blokir melebihi plafon*), pelanggan berstatus *ditahan*, atau di
  atas *batas persetujuan* (Pengaturan → Kebijakan dokumen).
- **Pemisahan tugas per dokumen**: pembuat pesanan ≠ penyetuju, pembuat faktur ≠
  penerbit — berlaku walau satu peran memegang kedua izin.
- **Terbitkan** memposting jurnal penjualan & HPP dalam transaksi yang sama dengan
  pengurangan stok (harga pokok rata-rata gudang cabang); stok kurang atau periode
  tertutup menggagalkan seluruhnya.
- **Penerimaan** boleh sebagian; rekening harus milik cabang faktur.
- **Batal**: draf langsung; faktur terbit hanya bila belum ada penerimaan — jurnal
  dibalik, stok dikembalikan, pesanan asal kembali *disetujui*.
- **Piutang Usaha** = faktur terbit − penerimaan per tanggal, sama dengan sumber
  pemeriksaan rekonsiliasi piutang usaha (halaman Integrasi) sehingga selalu cocok.
- Asisten AI mendapat alat baca `piutang_usaha` untuk pemegang `sales.invoice.read`.

| Izin | Staf keuangan | Akuntan senior | Manajer |
| --- | --- | --- | --- |
| `sales.invoice.read` (lihat semua menu penjualan) | ✓ | ✓ | ✓ |
| `sales.order.create`, `sales.invoice.create`, `sales.receipt.create` | ✓ | | |
| `sales.invoice.issue`, `sales.invoice.cancel` | | ✓ | |
| `sales.order.approve`, `sales.customer.manage` | | | ✓ |

Basis data yang sudah berisi data contoh dilengkapi (pelanggan, produk, pesanan,
penautan faktur lama) dengan menjalankan seed lagi — jalur *upgrade* idempoten.

## Pembelian & hutang

Menu **Pembelian**: Pesanan Pembelian, Penerimaan Barang, Tagihan Pemasok,
Pembayaran, Hutang Usaha, Pemasok. Kode akun di bawah adalah pemetaan bawaan
(Pengaturan → Pemetaan akun).

```
PO (draf) ──ajukan──► ≤ batas & pemasok aktif ──► disetujui ──terima barang (gudang)──► Penerimaan (GR)
                │ > batas / pemasok dipantau                     Dr 1-1501/1-1503 persediaan │ Cr 2-1102 barang diterima belum ditagih
                ▼                                                (stok cabang +, harga pokok rata-rata)
      menunggu → setujui / tolak (manajer)                                     │
                                                         buat tagihan dari PO ▼  (cocok tiga arah)
                         Tagihan (draf) ──posting (orang lain)──► Dr 2-1102 / akun biaya jasa, Dr 1-1701 PPN masukan │ Cr 2-1101
                                                                               │
          Pembayaran (menunggu) ──1 atau 2 penyetuju berbeda──► disetujui ──bayar──► Dr 2-1101 │ Cr akun detail rekening cabang
```

- **Persetujuan PO** (K-24): PO di atas *Batas persetujuan pesanan pembelian*
  (bawaan Rp 150 jt termasuk PPN) atau ke pemasok berstatus *dipantau* menunggu
  keputusan manajer; pemasok *diblokir*/*nonaktif* tidak dapat menerima PO.
- **Penerimaan barang** hanya oleh gudang (`purchasing.receipt.create`), boleh
  sebagian, tidak melebihi sisa PO. Nilai = neto baris PO × qty diterima; stok
  cabang bertambah dengan harga pokok rata-rata bergerak. Jurnal persediaan sama
  persis dengan perubahan nilai kartu stok; selisih pembulatan rata-rata (rupiah)
  masuk HPP sehingga saldo 2-1102 tetap tepat sebesar nilai PO.
- **Kecocokan tiga arah**: tagihan dari PO berisi barang diterima yang belum ditagih
  (nilai = kredit 2-1102 saat penerimaan) dan sisa jasa PO. Bila *nilai tertera di
  tagihan pemasok* diisi dan berbeda, tagihan ditolak (`THREE_WAY_MISMATCH`).
  Tagihan tanpa PO hanya untuk jasa/biaya dengan akun detail beban/aset.
- **Pemisahan tugas per dokumen**: pembuat PO ≠ penyetuju, pembuat tagihan ≠
  pemosting, pengaju pembayaran ≠ penyetuju — walau satu peran memegang keduanya.
- **Pembayaran dua penyetuju** (K-26): pembayaran di atas *ambang dua penyetuju*
  (bawaan Rp 100 jt, dapat diubah di Pengaturan → Kebijakan dokumen) wajib disetujui
  dua orang berbeda selain pengaju; di bawahnya cukup satu. Penyetuju yang sama tidak
  dihitung dua kali. Pengajuan tidak boleh melebihi sisa tagihan dikurangi pembayaran
  lain yang masih berjalan. Jurnal baru diposting saat pembayaran dieksekusi.
- **Rekening pemasok** (K-25): penetapan/perubahan rekening (hanya 4 digit terakhir
  disimpan) dicatat sebagai *usulan* yang harus disetujui pengelola pemasok lain.
  Transfer ke rekening yang baru disetujui ditahan selama masa tunggu 24 jam, dan
  selama ada usulan perubahan yang belum diputus.
- **Batal**: PO tanpa penerimaan/tagihan; tagihan terposting tanpa pembayaran —
  jurnal dibalik, penerimaan dilepas agar dapat ditagih ulang, pembayaran yang belum
  dieksekusi ikut batal.
- **Hutang Usaha** = tagihan terposting − pembayaran dibayar per tanggal, sama dengan
  pemeriksaan rekonsiliasi utang usaha. Halaman Integrasi juga memeriksa *barang
  diterima belum ditagih* (Σ penerimaan belum ditagih = saldo 2-1102).
- Asisten AI mendapat alat baca `hutang_usaha` untuk pemegang `purchasing.invoice.read`.

| Izin | Staf keuangan | Akuntan senior | Manajer | Gudang |
| --- | --- | --- | --- | --- |
| `purchasing.invoice.read` (tagihan, pembayaran, hutang) | ✓ | ✓ | ✓ | |
| `purchasing.order.create`, `purchasing.invoice.create`, `purchasing.payment.create` | ✓ | | | |
| `purchasing.invoice.post`, `purchasing.payment.approve` | | ✓ | | |
| `purchasing.order.approve`, `purchasing.supplier.manage`, `purchasing.payment.approve` | | | ✓ | |
| `purchasing.receipt.create` (lihat PO & pemasok, terima barang) | | | | ✓ |

Migrasi `0007_purchasing.sql` menambah tabel pemasok, PO, penerimaan, baris tagihan,
dan pembayaran (RLS per cabang; pemasok per perusahaan), akun 2-1102, dan pembayaran
historis dari kolom tagihan lama. Seed (juga jalur *upgrade*) mengisi 10 pemasok
contoh dengan rekening terverifikasi, 11 PO, serta menautkan tagihan lama ke
pemasok & PO-nya.

### Permintaan pembelian & RFQ (`/permintaan-pembelian`, `/rfq`)

- **Permintaan pembelian (PR)** dari unit kerja: departemen, pemohon, keperluan, prioritas,
  baris barang berstok atau jasa (akun biaya detail) dengan harga perkiraan. Diajukan →
  diputus orang selain pemohon (`SOD_REQUISITION`); **SLA** keputusan menurut prioritas
  (tinggi 24 jam, sedang 3 hari, rendah 5 hari) tampil di daftar & kotak persetujuan.
- PR disetujui diproses menjadi **PO langsung** (satu pemasok, harga dapat disesuaikan) atau
  **RFQ** ke minimal dua pemasok. Penawaran dicatat per pemasok (harga per baris, diskon,
  waktu kirim, masa berlaku) atau dicatat *tidak menawar*; **harga terbaik** = total
  terendah. Memilih selain harga terbaik, atau penawaran kurang dari dua (sumber
  tunggal), wajib beralasan dan tercatat di jejak audit.
- Pemenang → PO dengan harga & waktu kirim penawarannya, lalu alur PO biasa (ambang
  persetujuan, penerimaan barang → persediaan/GRNI, tagihan → utang usaha). PO yang
  dibatalkan mengembalikan PR ke *disetujui* dan RFQ ke *terbuka*.
- Izin: `purchasing.requisition.create` (staf keuangan, gudang, produksi, manajer),
  `purchasing.requisition.approve` (manajer), `purchasing.rfq.manage` (staf keuangan,
  manajer). Migrasi `0017_procurement.sql` (RLS per cabang) mengisi tiga PR contoh dan
  satu RFQ terbuka.

## Lead & peluang, penawaran (`/lead`, `/penawaran`)

- **Peluang** di papan kanban prospek → kualifikasi → penawaran → negosiasi → menang/kalah,
  dengan probabilitas bawaan per tahap (10/30/50/75/100/0, tahap terbuka dapat disesuaikan),
  sumber, PIC, kontak, tindak lanjut (terlambat ditandai), dan log aktivitas (telepon, rapat,
  email, kunjungan, catatan; perpindahan tahap tercatat otomatis). Pipeline = Σ nilai ×
  probabilitas peluang terbuka; KPI rata-rata deal, menang/kalah & rasio menang.
- Kalah wajib beralasan; **menang hanya lewat penawaran diterima yang dikonversi menjadi
  pesanan penjualan** — nilai peluang menjadi DPP penawaran.
- **Penawaran** berbaris (barang/jasa, diskon, PPN 11% dengan aturan faktur), masa berlaku
  (kedaluwarsa ditandai; tidak dapat dikirim/diterima sebelum diperpanjang): draf → terkirim
  (isi terkunci, hanya perpanjang) → diterima/ditolak (beralasan). Penawaran dari peluang
  menaikkan peluang ke tahap penawaran dan menjadikan prospek pelanggan.
- Diterima → **pesanan penjualan** (plafon kredit & persetujuan seperti biasa) → faktur →
  jurnal pendapatan, PPN keluaran, HPP. Pesanan dibatalkan mengembalikan penawaran agar dapat
  dikonversi lagi dan peluang ke negosiasi.
- Izin: `crm.read`, `crm.manage`, `sales.quote.create` (konversi ke pesanan memerlukan
  `sales.order.create`). Migrasi `0019_crm.sql` mengisi peluang contoh di semua tahap dan
  penawaran terkirim.

## Anggaran & proyek (`/anggaran`, `/proyek`)

- **Anggaran** satu per cabang & tahun: baris per akun detail (beban, pendapatan, atau aset
  untuk belanja modal) dengan 12 nilai bulanan — isi tahunan dibagi rata (sisa pembulatan di
  Desember) atau per bulan; dapat diisi awal dari realisasi tahun acuan × (1 + pertumbuhan).
  Draf → diajukan → disetujui oleh orang selain penyusun/pengaju (`SOD_BUDGET`, juga untuk
  admin); revisi mengembalikan ke draf dan memerlukan persetujuan ulang.
- **Realisasi** langsung dari buku besar (jurnal terposting cabang itu, tanda alami akun).
  **Komitmen** = PO jasa disetujui yang belum ditagih + draf tagihan jasa + PR jasa disetujui
  yang belum menjadi PO. Serapan = (realisasi + komitmen) ÷ anggaran; prakiraan =
  realisasi + komitmen + anggaran bulan yang belum berjalan; selisih = prakiraan − anggaran.
  Tampilan per akun (dengan rincian 12 bulan) dan per kelompok akun.
- **Cek anggaran PR**: laci permintaan pembelian menampilkan sisa anggaran disetujui per akun
  biaya baris jasa, termasuk permintaan itu sendiri, dan menandai bila melampaui.
- **Proyek**: register dengan pelanggan, PM, anggaran biaya, nilai kontrak, tugas berbobot
  (Gantt di laci). Biaya & pendapatan aktual = baris jurnal bertanda proyek — jurnal memorial
  (pilih proyek per baris), PR/PO/tagihan jasa bertanda proyek (baris jasa ditandai saat
  tagihan diposting); jurnal balik ikut bertanda. Kesehatan: biaya > anggaran → merah;
  serapan > 85% saat kemajuan < 80% → kuning.
- Izin: `budget.read|manage|approve`, `project.read|manage`. Migrasi `0018_budget_projects.sql`
  (dimensi `journal_lines.project_id`, RLS per cabang) mengisi anggaran CKR tahun berjalan
  dan dua proyek contoh.

## Kas & bank, rekonsiliasi, setoran pajak

Menu **Keuangan**: Kas & Bank, **Transfer Kas & Bank**, **Rekonsiliasi Bank**,
**Setoran Pajak**.

- **Transfer kas & bank** (setoran kas cabang ↔ pusat, pemindahbukuan): diajukan
  (`cash.transfer.create`), disetujui & diposting orang lain (`cash.transfer.approve`).
  Saldo buku rekening sumber harus cukup. Satu cabang → satu jurnal; antar cabang →
  satu jurnal per cabang yang diseimbangkan dengan RK (kantor pusat: 1-3101 RK
  Cabang, cabang: 3-1501 RK Kantor Pusat, keduanya dengan cabang lawan) sehingga
  pemeriksaan RK antar kantor dan eliminasi konsolidasi tetap cocok. Koreksi lewat
  pembalikan (ditolak bila sudah direkonsiliasi dengan rekening koran).
- **Rekonsiliasi bank**: impor mutasi rekening koran **CSV** internet banking (kolom
  Tanggal, Keterangan, Referensi, Debit/Kredit atau Jumlah bertanda, Saldo; pemisah
  `;` `,` atau tab; angka format Indonesia/internasional) atau **MT940**. Saldo awal +
  mutasi harus = saldo akhir; periode tidak boleh bertumpang tindih. Pencocokan
  otomatis satu-satu dengan mutasi buku rekening yang sama (jumlah persis, tanggal ±3
  hari, nomor referensi diutamakan); sisanya dicocokkan manual, dibuatkan **jurnal
  memorial** (biaya/bunga bank — tetap diposting orang lain), atau diabaikan dengan
  alasan. Finalisasi (`cash.reconcile.approve`, bukan pengimpor) hanya bila semua
  baris tertangani, saldo awal sama dengan buku, dan *saldo buku disesuaikan*
  (buku − setoran dalam perjalanan + pembayaran belum dicairkan + mutasi bank
  diabaikan) = saldo rekening koran.
- **Setoran PPN masa** (pemusatan di kantor pusat): pratinjau saldo PPN keluaran
  (2-1401) & masukan (1-1701) per cabang per akhir masa → draf (`tax.settlement.create`)
  → posting oleh orang lain (`tax.settlement.post`): tiap cabang menutup saldonya ke
  RK, kantor pusat mencatat kurang bayar di utang pajak (pemetaan *Utang pajak*,
  bawaan 2-1301) atau mengompensasikan lebih bayar → pembayaran dari rekening kantor
  pusat dengan **NTPN**. Satu setoran per masa; posting ditolak bila saldo berubah
  sejak draf dibuat.

| Izin | Staf keuangan | Akuntan senior |
| --- | --- | --- |
| `cash.transfer.create`, `tax.settlement.create` | ✓ | |
| `cash.reconcile` (impor, cocokkan, jurnal selisih) | ✓ | ✓ |
| `cash.transfer.approve`, `cash.reconcile.approve`, `tax.settlement.post` | | ✓ |

Semua pasangan buat ↔ setujui ditegakkan per dokumen (juga untuk admin). Migrasi
`0009_cash_bank.sql` menambah tabel `cash_transfers`, `bank_statements`,
`bank_statement_lines`, dan `tax_settlements` dengan RLS per cabang.

## Persediaan: stok, opname, transfer

Menu **Persediaan**: **Stok & Kartu Stok**, **Penyesuaian & Opname**, **Transfer Stok**.

- **Stok & kartu stok**: saldo per gudang dengan harga pokok rata-rata bergerak dan
  status minimum/maksimum; klik barang untuk kartu stok periode (saldo awal, mutasi
  masuk/keluar bernilai, saldo berjalan). Gudang dikelola di halaman yang sama
  (`inventory.warehouse.manage`); gudang berisi stok atau dengan transfer terbuka tidak
  dapat dinonaktifkan.
- **Penyesuaian & opname**: gudang mencatat hasil hitung fisik / barang rusak / hilang /
  koreksi (`inventory.adjust`), orang lain menyetujui (`inventory.adjust.approve`, per
  dokumen, juga untuk admin). Saat diposting selisih = hitung fisik − stok sistem saat
  itu × HPP rata-rata, dijurnal Dr/Cr persediaan (1-1501 / 1-1503) ↔ **selisih
  persediaan** (pemetaan *Selisih persediaan*, bawaan 5-1901).
- **Transfer stok** (`inventory.transfer`): draf → **kirim**. Antar gudang satu cabang
  stok langsung pindah dengan HPP yang sama. Antar cabang: cabang asal Dr RK / Cr
  persediaan, cabang tujuan Dr **persediaan dalam perjalanan** (1-1504) / Cr RK —
  RK selalu seimbang dengan cabang lawan; gudang tujuan **menerima** → Dr persediaan /
  Cr 1-1504. Pemeriksaan rekonsiliasi baru *Persediaan dalam perjalanan* mencocokkan
  Σ transfer terkirim-belum-diterima dengan saldo 1-1504.

Semua mutasi tercatat di `stock_moves` dan buku besar sekaligus, sehingga pemeriksaan
*Persediaan* (kartu stok = 1-1501 + 1-1502 + 1-1503) tetap cocok dan nilainya tampil di
neraca, neraca saldo, dan buku besar; selisih opname di laba rugi. Migrasi
`0010_inventory.sql` menambah `warehouses`, `stock_adjustments(_lines)`,
`stock_transfers(_lines)` (transfer terlihat oleh cabang asal & tujuan), akun 1-1504,
dan izin `inventory.adjust.approve`, `inventory.warehouse.manage`.

## Produksi: BOM & perintah kerja

Menu **Produksi**: **Perintah Kerja** (papan Antre → Berjalan → Pemeriksaan mutu →
Selesai, saring per lini) dan **Bill of Materials**.

- **BOM** (`production.manage`): bahan per ukuran batch untuk satu barang hasil, berlaku
  semua cabang, dengan estimasi biaya bahan dari HPP rata-rata. Barang hasil tidak boleh
  menjadi bahannya sendiri; jasa tidak dapat menjadi bahan.
- **Perintah kerja**: kebutuhan bahan = BOM × qty rencana, disalin saat dibuat.
  **Keluarkan bahan** (sebagian atau sisa kebutuhan) dari gudang perintah kerja →
  Dr **barang dalam proses** (1-1502) / Cr persediaan bahan. Kemajuan & penanda masalah
  dicatat di kartu. **Kirim ke QC** dengan qty baik & cacat; **lolos QC**
  (`production.complete`, harus orang lain dari pelapor — juga untuk admin) → barang jadi
  masuk gudang senilai seluruh saldo WIP perintah kerja (biaya produk cacat diserap):
  Dr persediaan barang jadi / Cr 1-1502; atau **kerjakan ulang** dengan catatan. Perintah
  kerja tanpa pemakaian bahan dapat dibatalkan.
- Pemeriksaan rekonsiliasi baru *Barang dalam proses*: Σ bahan dikeluarkan − Σ hasil
  produksi s.d. tanggal = saldo 1-1502; pemeriksaan *Persediaan* kini membandingkan
  kartu stok dengan 1-1501 + 1-1503.

Peran baru **Staf Produksi** (`production.read`, `production.manage`); Manajer
Operasional mendapat `production.complete`. Migrasi `0011_production.sql` menambah
`boms`, `bom_lines`, `work_orders`, `wo_consumptions`, `wo_outputs`.

## POS / kasir

Menu **POS → Kasir**: kasir (`pos.operate`, peran baru **Kasir**) membuka shift untuk
satu toko (= gudang sumber stok) dengan rekening **kas laci** dan, opsional, rekening
**penampung non-tunai** (QRIS, kartu debit/kredit, transfer) milik cabang toko itu.

- **Transaksi**: harga produk = DPP, PPN 11% per transaksi (seperti faktur); tunai dengan
  uang diterima & kembalian. Qty terjual **dicadangkan** dari stok toko sampai shift
  diposting sehingga tidak bisa oversell. Supervisor (`pos.shift.post`) dapat **void**
  transaksi selama shift buka (dengan alasan).
- **Tutup shift**: kasir menghitung kas; kas seharusnya = kas awal + penjualan tunai,
  selisihnya dicatat.
- **Posting** oleh orang lain dari kasir (juga untuk admin): stok toko berkurang dengan
  HPP rata-rata dan satu jurnal `POS_SHIFT`: Dr kas laci (penjualan tunai ± selisih),
  Dr rekening penampung (non-tunai), Cr penjualan barang, Cr PPN keluaran, Dr HPP / Cr
  persediaan, dan selisih kas ke pemetaan *Selisih kas kasir* (bawaan 5-4101). Kas awal
  sudah bagian dari saldo rekening kas sehingga tidak dijurnal.

Migrasi `0012_pos.sql` menambah `pos_shifts`, `pos_transactions`,
`pos_transaction_lines`, izin `pos.read`/`pos.operate`/`pos.shift.post`, dan peran Kasir;
Manajer Operasional dan Akuntan Senior dapat memposting shift.

## Aset tetap & pemeliharaan

Menu **Aset**: **Aset Tetap & Penyusutan**, **Pemeliharaan**.

- **Perolehan** (`asset.manage`): akun detail di bawah 1-2300/1-2400/1-2500, harga
  perolehan, umur manfaat, nilai residu; dibayar dari rekening cabang aset → Dr aset tetap /
  Cr bank. Tarif garis lurus bulanan; penyusutan mulai bulan perolehan.
- **Penyusutan bulanan** (`asset.depreciate`): pratinjau per cabang, lalu satu jurnal per
  cabang per bulan Dr beban penyusutan (5-3201) / Cr akumulasi (1-2901), tidak melewati
  nilai residu; bulan tidak boleh dilompati dan tidak dapat diulang.
- **Pelepasan** (`asset.depreciate`): hasil penjualan ke rekening cabang; Dr akumulasi +
  Dr bank / Cr harga perolehan, selisih ke laba (4-2101) atau rugi (5-4101) lain-lain.
- **Pemeliharaan** (`asset.manage`): dijadwalkan → berjalan → selesai. Biaya jasa dibayar
  dari kas/bank cabang dan suku cadang dikeluarkan dari stok gudang cabang; Dr beban
  pemeliharaan (5-3401) / Cr kas & persediaan.

Pemeriksaan rekonsiliasi *aset tetap* & *nilai buku* membandingkan register dengan buku
besar (aset yang dilepas lewat sistem dikeluarkan). Migrasi `0013_fixed_assets.sql`.

## SDM & penggajian

Menu **SDM**: **Karyawan**, **Kehadiran & Lembur**, **Penggajian**.

- **Karyawan** (`hr.manage`): NIK, NPWP, dan nomor rekening disimpan terenkripsi
  AES-256-GCM (kunci `DATA_ENCRYPTION_KEY`, atau diturunkan dari `JWT_SECRET` bila
  kosong), ditampilkan tersamar `****1234`; **buka data rahasia** hanya dengan
  `hr.restricted.read` dan setiap pembukaan dicatat di jejak audit (K-41). Gaji pokok hanya
  terlihat oleh SDM & penggajian.
- **Kehadiran**: status harian, jam masuk/pulang, jam lembur; tombol tandai hadir massal.
  Terkunci setelah gaji periodenya diposting.
- **Daftar gaji** (`payroll.process`): per cabang per bulan dari karyawan aktif — lembur
  (upah sejam = gaji pokok/173; jam pertama ×1,5, berikutnya ×2), BPJS pekerja 4% &
  pemberi kerja 10,24% dari gaji pokok + tunjangan tetap, PPh 21 metode setahun (biaya
  jabatan 5% maks. 6 jt, PTKP, tarif Pasal 17). **Posting** oleh orang lain
  (`payroll.approve`): Dr beban tenaga kerja langsung (Produksi) / beban gaji & tunjangan
  (+ BPJS pemberi kerja) — Cr utang gaji (neto), utang pajak (PPh 21), **utang BPJS**
  (akun baru 2-1601).
- **Pembayaran** (`payroll.pay`): pilih slip, bayar dari satu rekening; slip cabang lain
  hanya dari rekening kantor pusat, dijurnal di kedua sisi lewat RK.

Peran baru **Staf SDM**. Migrasi `0014_hr_payroll.sql` menambah `employees`, `attendance`,
`payroll_runs`, `payroll_payments`, kolom rincian pada `payslips`, akun 2-1600/2-1601, dan
mengisi karyawan dari slip gaji yang sudah ada.

## Kotak persetujuan, dokumen & kepatuhan

- **Kotak Persetujuan** (menu Ikhtisar; lonceng di bilah atas dengan jumlah, dimuat ulang
  tiap menit): seluruh dokumen yang menunggu keputusan pengguna — jurnal memorial, pesanan
  penjualan/pembelian, faktur & tagihan draf, pembayaran pemasok, transfer kas, rekonsiliasi
  bank, setoran PPN, penyesuaian stok, transfer stok masuk, QC produksi, shift kasir, daftar
  gaji — disaring izin & cabang, dan **tanpa dokumen buatan sendiri** (empat mata).
- **Repositori Dokumen** (`doc.read` / `doc.manage`): unggah PDF/gambar/Office/CSV/teks/ZIP
  ≤ 1 MB, versi baru, unduh versi mana pun (header `X-Content-SHA256`), folder, cabang,
  masa berlaku (otomatis *kedaluwarsa*), arsip. **Lampiran transaksi** langsung dari laci
  jurnal dan transfer kas. Jenis berkas berisiko (mis. HTML) ditolak; unduhan selalu
  `attachment` + `nosniff`.
- **Kepatuhan** (`compliance.read`): laporan pemisahan tugas per pengguna (konflik izin;
  Admin Sistem ditandai superuser), pemeriksaan **kontrol empat mata per dokumen** dari data
  transaksi (jurnal, transfer kas, penyesuaian stok, QC produksi, shift kasir, daftar gaji,
  pembayaran pemasok — harus nol), dan **verifikasi rantai hash jejak audit** (tautan
  `prev_hash` dan hash isi setiap baris dihitung ulang, K-71).

Migrasi `0015_documents.sql` menambah `documents`, `document_versions`, dan izin
`doc.read`, `doc.manage`, `compliance.read`.

## Asisten AI

Menu **Asisten AI** menjawab pertanyaan keuangan dalam bahasa sehari-hari, misalnya
"cabang mana yang marginnya paling rendah bulan ini?". Asisten memakai Claude API
dengan alat hanya-baca atas laporan yang sama dengan UI, sehingga izin dan batas
cabang pengguna tetap berlaku. Kontrol keamanannya ada di dok. 11 §11a.

Aktifkan dengan mengisi `ANTHROPIC_API_KEY` di `.env` API (di hosting:
`~/erp-config/.env`), lalu nyalakan ulang API. Model bawaan `claude-opus-5`
dengan `ASSISTANT_EFFORT=medium` agar waktu jawab tetap singkat; keduanya dapat
diganti lewat variabel lingkungan. Permintaan memakai cadangan sisi server
(`fallbacks: "default"`) bila model utama menolak.

## Pemasangan di shared hosting cPanel (erp.semestateknologiutama.com)

Hosting tanpa Passenger: API berjalan sebagai proses Node pada `127.0.0.1:3620`
yang dijaga cron, Apache memproksi `/api` ke sana dan menyajikan SPA statis.
Tidak ada langkah build di server — artefak dikirim jadi lewat branch
`deploy/hosting`.

```bash
npm run build:all
node tools/build-hosting.mjs /tmp/hosting     # SPA + server/ (dist, node_modules produksi)
# commit pohon /tmp/hosting sebagai branch deploy/hosting, push, lalu
# cPanel → Git Deploy (branch deploy/hosting → document root subdomain)
```

Di server (sekali saja):

1. cPanel → PostgreSQL Databases: basis data `semestat_erp`, pengguna
   `semestat_erpowner` (pemilik skema) dan `semestat_erpapp` (aplikasi), keduanya
   diberi hak pada basis data.
2. Salin `~/erp-config/env.example` (dibuat otomatis oleh runner) menjadi
   `~/erp-config/.env` dan isi kata sandi basis data serta `JWT_SECRET`.
3. Cron `*/4 * * * * /bin/bash ~/erp.semestateknologiutama.com/server/erp-runner.sh`.
   Runner menjalankan migrasi saat revisi berubah, lalu menyalakan API.
4. Data contoh: buat `~/erp-config/seed.request` berisi satu baris kata sandi awal
   (≥ 12 karakter) untuk pengguna seed; berkas dihapus setelah diproses.

Berkas penanda lain: `~/erp-restart.request` (nyalakan ulang),
`~/erp-migrate.request` (ulangi migrasi). Log: `~/erp-app.log`,
`~/erp-install.log`, status ringkas di `~/erp-status.txt`.

## Catatan implementasi vs dokumen pra-pengembangan

- **Akses basis data**: SQL migrasi dan pustaka `pg` langsung (bukan ORM) agar
  invarian buku besar hidup sebagai trigger/constraint di PostgreSQL dan
  row-level security dipaksakan (`FORCE ROW LEVEL SECURITY`) untuk peran
  aplikasi `erp_app`.
- **Autentikasi**: untuk fase pengembangan memakai kata sandi lokal (Argon2id)
  + JWT HS256 berumur pendek dan refresh cookie HttpOnly. Integrasi OIDC/IdP
  dan MFA (dok. 11) dijadwalkan pada fase berikutnya.
- **Cakupan fase ini**: buku besar, laporan, konsolidasi, rekonsiliasi,
  administrasi cabang/akun/bank, dan audit. Modul operasional (penjualan,
  pembelian, persediaan, produksi, SDM) menyusul sesuai dok. 13.

---

# Purwarupa UI/UX

Purwarupa antarmuka untuk aplikasi ERP terpadu: dasbor, penjualan, pembelian,
inventaris, produksi, keuangan, SDM, dan administrasi sistem. Purwarupa berjalan
di peramban tanpa peladen, tanpa pustaka pihak ketiga, dan tanpa proses build
wajib — cukup buka satu berkas. Seluruh data bersifat fiktif dan disimpan di
memori; menyegarkan halaman mengembalikan keadaan awal.

## Menjalankan purwarupa

```bash
# Cara tercepat — berkas tunggal hasil build
open dist/prototipe.html

# Atau layani berkas sumbernya
python3 -m http.server -d prototype 8080   # lalu buka http://localhost:8080
```

## Isi purwarupa

| Jalur | Isi |
| --- | --- |
| `prototype/index.html` | Kerangka halaman |
| `prototype/assets/tokens.css` | Token desain: warna, tipografi, ruang, radius, tema terang/gelap |
| `prototype/assets/app.css` | Shell dan seluruh komponen |
| `prototype/assets/data.js` | Data contoh (tenant peraga PT Karya Nusantara Mandiri) |
| `prototype/assets/charts.js` | Pemformat angka id-ID dan mesin grafik SVG |
| `prototype/assets/ledger.js` | Mesin buku besar: posting otomatis per modul, saldo, kartu buku besar, neraca saldo, laba rugi, neraca, konsolidasi, rekonsiliasi sub-buku |
| `prototype/assets/app.js` | Perutean, layar, register, laci rekaman, overlay, konteks cabang & periode |
| `docs/` | Dokumen desain (01–07) dan dokumen pra-pengembangan (08–13) |
| `tools/build.mjs` | Menggabungkan purwarupa menjadi berkas tunggal di `dist/` |
| `tools/smoke.mjs` | Uji asap: 36 layar × 2 tema + interaksi (konteks cabang, jurnal, buku besar, rekonsiliasi) + tampilan sempit |

## Dokumen desain

1. [Ringkasan produk & persona](docs/01-ringkasan-produk.md)
2. [Arsitektur informasi](docs/02-arsitektur-informasi.md)
3. [Alur pengguna utama](docs/03-alur-pengguna.md)
4. [Sistem desain](docs/04-sistem-desain.md)
5. [Cakupan & batas purwarupa](docs/05-cakupan-purwarupa.md)
6. [Model data & entitas](docs/06-model-data.md)
7. [Spesifikasi fungsional per modul](docs/07-spesifikasi-fungsional.md)

## Dokumen pra-pengembangan

Disusun untuk memulai implementasi produksi dari purwarupa ini.

8. [Arsitektur teknis](docs/08-arsitektur-teknis.md) — tumpukan (frontend Vue 3), modul, mesin posting, multi-cabang, lingkungan
9. [Skema basis data](docs/09-skema-basis-data.md) — tabel, invarian buku besar, row-level security, indeks
10. [Spesifikasi API](docs/10-spesifikasi-api.md) — konvensi, endpoint per modul, laporan, webhook
11. [Keamanan](docs/11-keamanan.md) — model ancaman, autentikasi, otorisasi & pemisahan tugas, kontrol keuangan, UU PDP, audit, checklist rilis
12. [Standar pengembangan & pengujian](docs/12-standar-pengembangan-dan-pengujian.md) — alur kerja, tinjauan, uji invarian, CI, definisi selesai
13. [Rencana pengembangan](docs/13-rencana-pengembangan.md) — fase, sprint, risiko, peran

Kebijakan pelaporan kerentanan: [SECURITY.md](SECURITY.md).

## Perkakas

```bash
npm install                 # hanya untuk uji asap (Playwright)
node tools/build.mjs        # -> dist/prototipe.html, dist/artifact.html
node tools/smoke.mjs        # -> lulus/gagal + tangkapan layar di dist/shots/
```

Uji asap membuka setiap layar pada tema terang dan gelap, menangkap galat
konsol, memastikan tidak ada luapan horizontal pada badan halaman, lalu menguji
laci rekaman, palet perintah, modal, toast, pergantian cabang, keseimbangan
neraca cabang, laci jurnal → kartu buku besar, jurnal memorial baru, dan
rekonsiliasi sub-buku terhadap buku besar.

## Yang sudah dapat dicoba

- Navigasi 44 layar, tertaut lewat URL (`#/pesanan-penjualan`, `#/neraca`, …)
- **Pemilih cabang & periode** di strip konteks yang benar-benar membatasi
  register, dasbor, dan laporan (tersimpan di `localStorage`)
- **Jurnal umum berpasangan** (Σ debit = Σ kredit) yang dibentuk otomatis dari
  faktur, hutang, penggajian, penyusutan aset, pemeliharaan, POS, mutasi stok,
  pajak, dan beban rutin — plus jurnal memorial manual dengan validasi
  (periode terkunci, akun header, rekening kas wajib) dan alur posting/tolak
- **Kartu buku besar** per akun dengan saldo berjalan, saringan rekening bank,
  klik baris → jurnal asal → dokumen sumber
- **Neraca saldo, laba rugi, neraca** per cabang; **laporan konsolidasi** dengan
  kolom per cabang, eliminasi RK Cabang ↔ RK Kantor Pusat, dan hasil gabungan
- **Integrasi & rekonsiliasi**: peta posting antar modul dan 11 pemeriksaan
  sub-buku (piutang, hutang, bank, persediaan, aset, utang gaji, neraca saldo,
  neraca, RK antar kantor, keseimbangan jurnal) terhadap buku besar
- **Manajemen cabang**: profil & KPI tiap cabang, tambah cabang baru (langsung
  mendapat buku besar, giro, kas kecil), nonaktifkan cabang
- Register: cari, saring status, urutkan kolom, pilih baris, aksi massal, paginasi
- Laci rekaman pesanan penjualan lengkap dengan baris barang, posisi kredit
  pelanggan, linimasa, serta tindakan setujui/tolak yang benar-benar mengubah data
- Papan produksi dengan saringan lini
- Matriks izin yang dapat diklik (ubah & setujui → lihat saja → tanpa akses)
- Palet perintah (`Ctrl/Cmd + K` atau `/`) untuk melompat ke halaman dan rekaman
- Modal pesanan baru yang menambahkan baris nyata ke daftar
- Tema terang/gelap/ikut sistem, papan ketik penuh, dan tata letak responsif
