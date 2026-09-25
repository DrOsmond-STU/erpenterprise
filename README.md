# ERP Enterprise — Purwarupa UI/UX

Purwarupa antarmuka untuk aplikasi ERP terpadu: dasbor, penjualan, pembelian,
inventaris, produksi, keuangan, SDM, dan administrasi sistem. Purwarupa berjalan
di peramban tanpa peladen, tanpa pustaka pihak ketiga, dan tanpa proses build
wajib — cukup buka satu berkas.

Repositori ini berisi **desain**, bukan aplikasi produksi. Seluruh data bersifat
fiktif dan disimpan di memori; menyegarkan halaman mengembalikan keadaan awal.

Sejak versi ini seluruh modul operasional **bermuara pada buku besar**: setiap
faktur, tagihan pemasok, slip gaji, mutasi stok, order pemeliharaan, dan shift
POS diposting otomatis sebagai jurnal berpasangan per cabang, lalu diturunkan
menjadi kartu buku besar, neraca saldo, laba rugi, dan neraca — per cabang
maupun konsolidasi dengan eliminasi rekening koran antar kantor.

## Menjalankan

```bash
# Cara tercepat — berkas tunggal hasil build
open dist/prototipe.html

# Atau layani berkas sumbernya
python3 -m http.server -d prototype 8080   # lalu buka http://localhost:8080
```

## Isi repositori

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

8. [Arsitektur teknis](docs/08-arsitektur-teknis.md) — tumpukan, modul, mesin posting, multi-cabang, lingkungan
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
