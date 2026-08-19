# 2 — Arsitektur informasi

## Peta navigasi

Navigasi dikelompokkan menurut **domain bisnis**, bukan menurut jenis objek.
Seorang staf penjualan tidak mencari "daftar", ia mencari "pesanan".

```
Ikhtisar
├── Dasbor                          #/dasbor
└── Kotak Persetujuan          [5]  #/persetujuan

Data Master
└── Produk & Layanan                #/data-master

CRM
└── Lead & Peluang            [24]  #/lead

Penjualan
├── Penawaran                 [12]  #/penawaran
├── Pesanan Penjualan        [148]  #/pesanan-penjualan
├── Faktur                    [62]  #/faktur
└── Pelanggan                       #/pelanggan

POS / Kasir
└── Kasir                           #/kasir

Pembelian
├── Permintaan Pembelian       [8]  #/permintaan-pembelian
├── RFQ & Vendor               [4]  #/rfq
├── Pesanan Pembelian         [34]  #/pesanan-pembelian
└── Pemasok                         #/pemasok

Inventaris & Rantai Pasok
├── Stok Barang                [9]  #/stok
├── Mutasi Stok                     #/mutasi
└── Rantai Pasok                    #/rantai-pasok

Produksi
└── Perintah Kerja            [17]  #/perintah-kerja

Proyek
└── Daftar Proyek              [5]  #/proyek

Keuangan
├── Bagan Akun                      #/bagan-akun
├── Piutang Usaha                   #/piutang
├── Hutang Usaha                    #/hutang
├── Kas & Bank                      #/kas-bank
├── Jurnal Umum                     #/jurnal
└── Anggaran                        #/anggaran

SDM
├── Karyawan                        #/karyawan
├── Kehadiran & Cuti                #/kehadiran
└── Penggajian                [12]  #/penggajian

Aset
├── Daftar Aset                     #/aset
└── Pemeliharaan               [6]  #/pemeliharaan

Dokumen
└── Repositori               [156]  #/dokumen

Alur Kerja
└── Desainer Alur Kerja             #/alur-kerja

Analitik
├── BI & Laporan                    #/analitik
└── Balanced Scorecard              #/bsc

Sistem
├── Kepatuhan & GRC                 #/kepatuhan
├── Peran & Izin                    #/peran
├── Jejak Audit                     #/jejak-audit
├── Pengaturan                      #/pengaturan
└── Sistem Desain                   #/sistem-desain
```

**16 kelompok, 37 butir navigasi.** Lencana angka `[n]` menandakan
**pekerjaan menunggu**, bukan jumlah total baris — 148 pesanan terbuka, 9
barang di bawah minimum, 5 dokumen menunggu persetujuan. Angka yang tidak
menuntut tindakan tidak diberi lencana.

## Empat arketipe halaman

Seluruh aplikasi memakai empat bentuk halaman. Keseragaman inilah yang membuat
modul yang belum pernah dibuka tetap terasa dikenali.

### Arketipe 1 — Ikhtisar (dasbor)

Menjawab "apa yang perlu saya lakukan hari ini?".

```
┌──────────────────────────────────────────────────────────┐
│ Sapaan + konteks + tindakan utama                        │
├────────┬────────┬────────┬────────────────────────────── │
│ KPI    │ KPI    │ KPI    │ KPI     (angka + tren + basis) │
├────────────────────────────────┬─────────────────────────┤
│ Grafik utama (tren)            │ Daftar kerja            │
│                                │ (antrean persetujuan)   │
├────────────────────────────────┼─────────────────────────┤
│ Komposisi                      │ Ember ordinal           │
├────────────────────────────────┼─────────────────────────┤
│ Peringatan operasional         │ Aktivitas / jejak audit │
└────────────────────────────────┴─────────────────────────┘
```

Urutan itu disengaja: **angka → tren → keputusan → sebaran → peringatan →
riwayat**. Semakin ke bawah, semakin bersifat penelusuran.

Dasbor utama, Analitik (BI), dan Balanced Scorecard sama-sama memakai arketipe
ini dengan widget yang dapat dikustomisasi (seret, tambah, hapus, reset).

### Arketipe 2 — Daftar (register)

Menjawab "temukan baris yang saya butuhkan".

```
┌──────────────────────────────────────────────────────────┐
│ Judul + penjelasan + Ekspor / Buat baru                  │
├──────────────────────────────────────────────────────────┤
│ [cari] [chip status ×n]              n baris  [⚙ kolom]  │
├──────────────────────────────────────────────────────────┤
│ n baris dipilih   → Setujui  Cetak  Batalkan pilihan     │  (muncul saat ada seleksi)
├──────────────────────────────────────────────────────────┤
│ ☐ │ KOLOM ▲ │ KOLOM │ … │ NILAI → │ STATUS               │
│ ☐ │ baris yang dapat diklik → membuka laci rekaman       │
├──────────────────────────────────────────────────────────┤
│ Halaman 1 dari n                                  ‹  ›   │
└──────────────────────────────────────────────────────────┘
```

Aturan tetap di semua register:

- kolom pengenal (nomor dokumen, SKU) selalu paling kiri dan bergaya monospace;
- kolom nilai selalu rata kanan;
- kolom status selalu paling kanan;
- baris kedua di dalam sel dipakai untuk konteks pendukung (kanal, kategori,
  gudang) supaya jumlah kolom tetap sedikit;
- chip status membawa cacahnya sendiri, sehingga saringan sekaligus berfungsi
  sebagai ringkasan sebaran.

**22 register** memakai arketipe ini, dari pesanan penjualan hingga jejak audit.

### Arketipe 3 — Papan (Kanban)

Menjawab "di tahap apa setiap item?".

Papan produksi, CRM Pipeline, dan Kotak Persetujuan memakai arketipe ini.
Sumbu penyaring sama dengan register, tetapi baris diganti kartu karena yang
penting di sana adalah **tahap**, bukan atribut kolom.

- **Perintah Kerja:** 4 kolom (Antre → Berjalan → QC → Selesai), saringan lini
- **CRM Pipeline:** 6 kolom (Prospek → Kualifikasi → Penawaran → Negosiasi → Menang → Kalah)
- **Kotak Persetujuan:** kartu per dokumen menunggu, dengan tombol Setujui/Tolak

### Arketipe 4 — Rekaman (laci)

Menjawab "apa isi baris ini, dan apa yang harus saya putuskan?".

Rekaman dibuka sebagai laci di atas daftar, bukan sebagai halaman penuh. Alasan:
pengguna hampir selalu memeriksa beberapa rekaman berturut-turut, dan kehilangan
posisi gulir serta saringan daftar adalah biaya yang lebih mahal daripada ruang
layar yang hilang.

```
┌────────────────────────────────────┐
│ nomor + status            [tutup]  │
│ Judul rekaman                      │
│ nilai · dibuat kapan · oleh siapa  │
├────────────────────────────────────┤
│ ⚠ Perlu keputusan Anda + alasannya │  (hanya bila menunggu persetujuan)
├────────────────────────────────────┤
│ Rincian (pasangan istilah–nilai)   │
│ Posisi kredit pelanggan            │
│ Baris barang + subtotal/PPN/total  │
│ Linimasa                           │
├────────────────────────────────────┤
│ Setujui   Tolak        …  Ubah     │
└────────────────────────────────────┘
```

Tindakan menetap di kaki laci sehingga tetap terjangkau tanpa menggulir balik.

## Halaman khusus

Beberapa layar menggabungkan arketipe di atas:

| Halaman | Struktur |
| --- | --- |
| **Piutang Usaha** | KPI tiles + grafik umur piutang + register faktur terbuka |
| **Proyek** | Kartu proyek + bilah Gantt inline per tugas |
| **Bagan Akun** | Kartu ringkasan per kategori + pohon akun hierarkis |
| **Anggaran** | Tab pusat biaya / per akun, masing-masing KPI + register |
| **Kas & Bank** | KPI tiles + register rekening |
| **Rantai Pasok** | KPI tiles + register pengiriman |
| **POS / Kasir** | KPI tiles + tabel shift + tabel transaksi |
| **Pengaturan** | Formulir konfigurasi perusahaan & tampilan |
| **Sistem Desain** | Galeri token & komponen |

## Konteks: strip kepala dokumen

Di bawah topbar terdapat strip berisi **Perusahaan · Cabang · Periode · Mata
uang**. Strip ini membingkai setiap angka di halaman mana pun, dan sengaja
digambar seperti kepala formulir tercetak: label mikro huruf besar di atas,
nilai tebal di bawah, dipisahkan garis vertikal tipis.

Ini keputusan informasi, bukan hiasan. Di ERP, kesalahan yang paling mahal
adalah membaca angka yang benar untuk periode yang salah.

## Pencarian & papan ketik

| Pintasan | Aksi |
| --- | --- |
| `Ctrl/Cmd + K` atau `/` | Palet perintah |
| `Ctrl/Cmd + N` | Pesanan penjualan baru |
| `Esc` | Tutup laci, modal, palet, popover |
| `↑ ↓` lalu `Enter` | Menavigasi hasil palet |

Palet perintah mencari lintas jenis: halaman, pesanan penjualan, pelanggan,
stok barang, lead CRM, proyek, aset, dan dokumen — masing-masing dikelompokkan
dengan label jenisnya, sehingga "sentosa" mengembalikan pelanggan *dan*
pesanannya sekaligus.

## Perutean

Setiap layar punya URL (`#/stok`). Konsekuensinya: layar dapat ditandai,
dibagikan, dan dibuka langsung — termasuk oleh tautan di dalam notifikasi.
