# ERP Enterprise

Monorepo untuk aplikasi ERP terpadu multi-cabang: **purwarupa UI/UX** (HTML/JS
tanpa build) dan **implementasi produksi** yang sedang dikembangkan dari
purwarupa tersebut — Vue 3 di sisi klien, NestJS + PostgreSQL di sisi peladen,
dengan paket domain bersama yang memuat aturan buku besar.

Seluruh modul operasional **bermuara pada buku besar**: setiap dokumen sumber
diposting sebagai jurnal berpasangan per cabang, lalu diturunkan menjadi kartu
buku besar, neraca saldo, laba rugi, dan neraca — per cabang maupun konsolidasi
dengan eliminasi rekening koran antar kantor.

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
| `admin@knm.co.id` | Admin sistem (cabang, akun, pengguna, log audit) | semua |
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
penguncian & buka kunci, admin terakhir, pemisahan tugas pada peran).

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

## Penjualan & piutang

Menu **Penjualan**: Pesanan Penjualan, Faktur, Piutang Usaha, Pelanggan, Produk & Jasa.

```
Pesanan (draf) ──ajukan──► cek plafon & batas ──► disetujui ──buat faktur──► Faktur (draf)
                                   │ gagal                                      │ terbitkan (orang lain)
                                   ▼                                            ▼
                         menunggu → setujui / tolak (manajer)   Jurnal otomatis: Dr 1-1200 │ Cr 4-1000, 4-2000, 2-1400
                                                                                 Dr 5-1000 │ Cr 1-1500/1-1400 (stok cabang −)
                                                            Penerimaan ──► Dr 1-1100 (rekening cabang) │ Cr 1-1200
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
  pemeriksaan rekonsiliasi 1-1200 (halaman Integrasi) sehingga selalu cocok.
- Asisten AI mendapat alat baca `piutang_usaha` untuk pemegang `sales.invoice.read`.

| Izin | Staf keuangan | Akuntan senior | Manajer |
| --- | --- | --- | --- |
| `sales.invoice.read` (lihat semua menu penjualan) | ✓ | ✓ | ✓ |
| `sales.order.create`, `sales.invoice.create`, `sales.receipt.create` | ✓ | | |
| `sales.invoice.issue`, `sales.invoice.cancel` | | ✓ | |
| `sales.order.approve`, `sales.customer.manage` | | | ✓ |

Basis data yang sudah berisi data contoh dilengkapi (pelanggan, produk, pesanan,
penautan faktur lama) dengan menjalankan seed lagi — jalur *upgrade* idempoten.

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
