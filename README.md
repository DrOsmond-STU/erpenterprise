# ERP Enterprise — Purwarupa UI/UX

Purwarupa antarmuka untuk aplikasi ERP terpadu: dasbor, penjualan, pembelian,
inventaris, produksi, keuangan, SDM, dan administrasi sistem. Purwarupa berjalan
di peramban tanpa peladen, tanpa pustaka pihak ketiga, dan tanpa proses build
wajib — cukup buka satu berkas.

Repositori ini berisi **desain**, bukan aplikasi produksi. Seluruh data bersifat
fiktif dan disimpan di memori; menyegarkan halaman mengembalikan keadaan awal.

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
| `prototype/assets/app.js` | Perutean, layar, register, laci rekaman, overlay |
| `docs/` | Dokumen desain — produk, arsitektur informasi, alur, sistem desain |
| `tools/build.mjs` | Menggabungkan purwarupa menjadi berkas tunggal di `dist/` |
| `tools/smoke.mjs` | Uji asap: 15 layar × 2 tema + interaksi + tampilan sempit |

## Dokumen desain

1. [Ringkasan produk & persona](docs/01-ringkasan-produk.md)
2. [Arsitektur informasi](docs/02-arsitektur-informasi.md)
3. [Alur pengguna utama](docs/03-alur-pengguna.md)
4. [Sistem desain](docs/04-sistem-desain.md)
5. [Cakupan & batas purwarupa](docs/05-cakupan-purwarupa.md)

## Perkakas

```bash
npm install                 # hanya untuk uji asap (Playwright)
node tools/build.mjs        # -> dist/prototipe.html, dist/artifact.html
node tools/smoke.mjs        # -> lulus/gagal + tangkapan layar di dist/shots/
```

Uji asap membuka setiap layar pada tema terang dan gelap, menangkap galat
konsol, memastikan tidak ada luapan horizontal pada badan halaman, lalu menguji
laci rekaman, palet perintah, modal, dan toast.

## Yang sudah dapat dicoba

- Navigasi 15 layar, tertaut lewat URL (`#/pesanan-penjualan`, `#/piutang`, …)
- Register: cari, saring status, urutkan kolom, pilih baris, aksi massal, paginasi
- Laci rekaman pesanan penjualan lengkap dengan baris barang, posisi kredit
  pelanggan, linimasa, serta tindakan setujui/tolak yang benar-benar mengubah data
- Papan produksi dengan saringan lini
- Matriks izin yang dapat diklik (ubah & setujui → lihat saja → tanpa akses)
- Palet perintah (`Ctrl/Cmd + K` atau `/`) untuk melompat ke halaman dan rekaman
- Modal pesanan baru yang menambahkan baris nyata ke daftar
- Tema terang/gelap/ikut sistem, papan ketik penuh, dan tata letak responsif
