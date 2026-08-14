# 2 — Arsitektur informasi

## Peta navigasi

Navigasi dikelompokkan menurut **domain bisnis**, bukan menurut jenis objek.
Seorang staf penjualan tidak mencari "daftar", ia mencari "pesanan".

```
Ikhtisar
└── Dasbor                          #/dasbor

Penjualan
├── Pesanan Penjualan               #/pesanan-penjualan
├── Faktur                          #/faktur
└── Pelanggan                       #/pelanggan

Pembelian
├── Pesanan Pembelian               #/pesanan-pembelian
└── Pemasok                         #/pemasok

Inventaris
├── Stok Barang                     #/stok
└── Mutasi Stok                     #/mutasi

Produksi
└── Perintah Kerja                  #/perintah-kerja

Keuangan
├── Piutang Usaha                   #/piutang
└── Jurnal Umum                     #/jurnal

SDM
└── Karyawan                        #/karyawan

Sistem
├── Peran & Izin                    #/peran
├── Pengaturan                      #/pengaturan
└── Sistem Desain                   #/sistem-desain
```

Lencana angka pada butir navigasi menandakan **pekerjaan menunggu**, bukan
jumlah total baris — 148 pesanan terbuka, 9 barang di bawah minimum. Angka yang
tidak menuntut tindakan tidak diberi lencana.

## Tiga arketipe halaman

Seluruh aplikasi hanya memakai tiga bentuk halaman. Keseragaman inilah yang
membuat modul yang belum pernah dibuka tetap terasa dikenali.

### Arketipe 1 — Ikhtisar

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

Papan produksi adalah varian arketipe ini: sumbu penyaring sama, hanya baris
diganti kartu karena yang penting di sana adalah **tahap**, bukan atribut.

### Arketipe 3 — Rekaman (laci)

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

Palet perintah mencari lintas jenis: halaman, pesanan penjualan, pelanggan, dan
stok barang — masing-masing dikelompokkan dengan label jenisnya, sehingga
"sentosa" mengembalikan pelanggan *dan* pesanannya sekaligus.

## Perutean

Setiap layar punya URL (`#/stok`). Konsekuensinya: layar dapat ditandai,
dibagikan, dan dibuka langsung — termasuk oleh tautan di dalam notifikasi.
