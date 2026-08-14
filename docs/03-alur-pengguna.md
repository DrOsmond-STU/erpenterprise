# 3 — Alur pengguna utama

Empat alur yang menentukan bentuk antarmuka. Semuanya dapat dijalankan langsung
di purwarupa.

---

## Alur 1 — Menyetujui pesanan yang melewati plafon kredit

**Pelaku:** Osmond (Manajer Operasional) · **Frekuensi:** 5–15× per hari

```
Dasbor
  │  Kartu "Menunggu persetujuan Anda" menampilkan alasan tiap dokumen
  │  berhenti — bukan sekadar daftar nomor.
  ▼
Klik "PT Sentosa Baja Perkasa · Melebihi plafon kredit pelanggan"
  │
  ▼
Laci rekaman SO-2026-0418
  ├─ Panel peringatan: "Pemakaian plafon sudah 92%. Menyetujui pesanan
  │   ini akan melampaui plafon kredit."
  ├─ Posisi kredit: plafon, terpakai, sisa — sisa ditandai merah bila
  │   lebih kecil daripada nilai pesanan
  ├─ Baris barang + subtotal, PPN 11%, total
  └─ Linimasa: siapa membuat, pemeriksaan otomatis apa yang gagal, kapan
      diteruskan
  ▼
[Setujui pesanan]
  ├─ Status berubah menjadi "Disetujui"
  ├─ Linimasa bertambah satu entri atas nama penyetuju
  └─ Toast: "Pesanan disetujui — diteruskan ke gudang untuk dijadwalkan."
```

**Keputusan desain.** Alasan penahanan ditampilkan di dua tempat: sebagai baris
konteks di antrean dasbor, dan sebagai panel penuh di puncak laci. Manajer harus
bisa menolak dari daftar tanpa membuka rekaman ketika alasannya sudah cukup,
tetapi tidak boleh menyetujui tanpa melihat posisi kredit.

**Jalur gagal.** `[Tolak]` mengubah status menjadi "Batal" dan mengembalikan
dokumen ke pembuatnya. Toast memakai nada danger, bukan sekadar netral.

---

## Alur 2 — Membuat pesanan penjualan

**Pelaku:** Rina (Account Executive) · **Frekuensi:** 10–20× per hari

```
Mana saja
  │  [+ Pesanan baru]  atau  Ctrl/Cmd + N
  ▼
Modal "Pesanan penjualan baru"
  ├─ Pelanggan (pilih) ──▶ petunjuk plafon diperbarui seketika:
  │      "Sisa plafon Rp 1.158.000.000 · terpakai 42% · termin Net 30"
  │      Petunjuk berubah merah pada pemakaian ≥ 90%.
  ├─ Tanggal pesan, jatuh tempo, kanal, gudang kirim, nomor PO pelanggan
  ├─ Baris barang: tabel yang dapat ditambah/dikurangi
  ├─ Subtotal / PPN 11% / Total dihitung di tempat
  └─ Catatan internal
  ▼
[Kirim untuk persetujuan]         [Simpan sebagai draf]
  │                                │
  └─ status "Menunggu persetujuan" └─ status "Draf"
  ▼
Daftar pesanan terbuka dengan baris baru di puncak + toast berisi nomor,
pelanggan, dan nilai.
```

**Keputusan desain.** Informasi plafon kredit muncul **saat memilih pelanggan**,
bukan sebagai kegagalan validasi setelah menekan kirim. Rina jadi tahu sejak awal
bahwa pesanan ini akan tertahan, dan bisa memberi tahu pelanggannya lebih dulu.

Dua tombol simpan bukan satu: menyimpan draf dan meminta persetujuan adalah dua
niat berbeda, dan keduanya sama seringnya.

---

## Alur 3 — Menangani stok kritis

**Pelaku:** Fitri (Kepala Gudang) / Osmond · **Frekuensi:** harian

```
Dasbor · kartu "Stok di bawah minimum"
  │  Tiap baris membawa sisa, batas minimum, dan status pengadaannya:
  │  "Habis dalam ±2 hari" / "PO tiba 18 Agu" / "Belum ada PO"
  ▼
Buka stok
  ▼
Register Stok Barang, terurut masalah lebih dahulu
  │  Habis ▸ Menipis ▸ Aman — bukan menurut abjad status
  │  Meteran posisi stok memakai nada: merah habis, kuning menipis, petrol aman
  ├─ Chip status berfungsi ganda sebagai ringkasan: Aman 7 · Menipis 4 · Habis 1
  └─ Pilih beberapa baris ▸ bilah aksi massal muncul
  ▼
[Penyesuaian stok]  atau lanjut ke Pesanan Pembelian
```

**Keputusan desain.** Urutan bawaan register ini sengaja *bukan* abjad. Daftar
yang dibuka untuk mencari masalah harus menaruh masalah di baris pertama.

Status stok tidak pernah hanya warna: setiap baris memuat pil bertuliskan
"Habis" / "Menipis" / "Aman", dan meteran memberi isyarat kedua berupa panjang.

---

## Alur 4 — Menjadwalkan produksi

**Pelaku:** Osmond / supervisor lini · **Frekuensi:** 2–3× per hari

```
Perintah Kerja
  │  Papan empat kolom: Antre ▸ Berjalan ▸ Pemeriksaan mutu ▸ Selesai
  │  Saring lini: Semua · Lini 1 Potong · Lini 2 Pres · Lini 3 Bubut · Lini 4 Rakit
  ▼
Kartu bermasalah menonjol sendiri
  │  WO-2026-0183 · "Bahan baku menipis"
  │  WO-2026-0178 · "3 unit ditolak QC"
  ▼
Klik kartu ▸ laci rekaman
  ├─ Panel peringatan bila ada penanda
  ├─ Rincian: produk, kuantitas, lini, penanggung jawab, tenggat
  └─ Kemajuan: selesai vs sisa
  ▼
[Cek ketersediaan bahan] ▸ melompat ke register Stok Barang
```

**Keputusan desain.** Kemajuan hanya ditampilkan pada kolom "Berjalan". Pada
kolom lain angka itu selalu 0% atau 100% dan hanya menambah kebisingan visual.

---

## Pola lintas alur

| Pola | Aturan |
| --- | --- |
| **Konfirmasi** | Tindakan yang mengubah keadaan menghasilkan toast berisi identitas objek yang terpengaruh, bukan "Berhasil". |
| **Nada toast** | ok untuk selesai, danger untuk penolakan, warn untuk yang belum tersedia. |
| **Keadaan kosong** | Selalu menyertakan jalan keluar — "Bersihkan saringan", bukan hanya "Tidak ada data". |
| **Belum tersedia** | Kendali yang sengaja belum diimplementasikan menjawab jujur lewat toast, bukan diam atau tampak rusak. |
| **Kembali** | Laci menutup dengan `Esc` atau klik latar; fokus papan ketik kembali ke elemen pemicu. |
