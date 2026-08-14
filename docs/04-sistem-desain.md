# 4 — Sistem desain

Arah visual: **"Ledger & Steel"** — netral graphite dingin berbias petrol
(baja pabrik), satu warna merek petrol-teal, dan angka yang selalu bergaya buku
besar. Bukan indigo/violet generik, dan bukan sudut membulat besar di mana-mana:
ERP adalah alat kerja padat, dan bahasa visualnya diambil dari dunia
manufaktur — papan nama industri, formulir tercetak, kartu gudang.

Halaman **Sistem Desain** di dalam purwarupa (`#/sistem-desain`) menampilkan
seluruh token dan komponen ini secara langsung, di tema mana pun yang sedang
aktif.

---

## Warna

Semua nilai didefinisikan di `prototype/assets/tokens.css`.

### Merek — petrol teal

| Token | Terang | Peran |
| --- | --- | --- |
| `--brand-500` | `#0089A0` | Rona merek, seri pertama grafik |
| `--brand-600` | `#0C6E7C` | Tombol utama, isian meteran |
| `--brand-700` | `#0B5763` | Sorotan tombol utama |

Pada tema gelap, aksi memakai `#1E9AB2` dan teks aksen `#57B2C6`.

### Netral — graphite berbias petrol

Netral **dipilih**, bukan abu-abu murni bawaan: seluruh netral digeser sedikit
ke arah rona merek, sehingga permukaan dan garis terbaca sebagai satu keluarga
dengan aksennya.

| Token | Terang | Gelap |
| --- | --- | --- |
| `--canvas` | `#EFF3F4` | `#080F12` |
| `--surface` | `#FFFFFF` | `#0F171B` |
| `--surface-2` | `#F6F9FA` | `#141F24` |
| `--line` | `#DCE5E8` | `#22323A` |
| `--ink` | `#0C1A1E` | `#E4EDEF` |
| `--ink-3` | `#5E747B` | `#879BA1` |

### Semantik status

Terpisah penuh dari warna merek **dan** dari palet grafik. Warna status tidak
pernah dipakai sebagai "seri keempat", dan tidak pernah berdiri sendiri —
selalu bersama ikon dan teks.

| Token | Terang | Makna |
| --- | --- | --- |
| `--ok` | `#2E7D4F` | Selesai, lunas, aman |
| `--warn` | `#A66A00` | Menunggu, menipis, dipantau |
| `--danger` | `#B3261E` | Batal, jatuh tempo, habis |
| `--info` | `#1C5FA8` | Dalam perjalanan, sebagian |

### Tema

Struktur tiga-lapis yang wajib dipertahankan, karena pemirsa punya tiga keadaan
— terang eksplisit, gelap eksplisit, dan "ikut sistem" yang tidak menandai apa
pun pada elemen akar:

```css
:root { /* palet TERANG lengkap */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* hanya token, untuk OS gelap */ }
}

:root[data-theme="dark"] { /* hanya token, untuk pilihan eksplisit */ }
```

Tidak ada satu pun warna komponen yang didefinisikan di dalam blok media atau
`[data-theme]`. Komponen selalu membaca token. Warna yang hanya hidup di dalam
blok bersyarat tidak akan pernah berlaku pada keadaan tak-bertanda, dan itulah
sumber klasik halaman yang menampilkan teks satu tema di atas latar tema lain.

`body` juga memakai `background` dari token secara eksplisit, karena latar di
belakang halaman dicat oleh induknya.

---

## Palet grafik

Warna grafik dipilih menurut **pekerjaan** yang dilakukannya, lalu diverifikasi
dengan perkakas — bukan dikira-kira.

### Kategorikal (identitas)

Urutan **tetap**; seri ke-6 tidak pernah dibuat dengan mendaur ulang rona,
melainkan dilipat menjadi "Lainnya".

| | Terang | Gelap |
| --- | --- | --- |
| `--cat-1` | `#0089A0` | `#159AB0` |
| `--cat-2` | `#B87710` | `#BE851B` |
| `--cat-3` | `#6B5BD6` | `#7B6FE0` |
| `--cat-4` | `#C03C7A` | `#D2528A` |
| `--cat-5` | `#5A9B2A` | `#69A836` |

Kedua set lolos seluruh pemeriksaan: pita lightness, lantai chroma, pemisahan
CVD antar pasangan bersebelahan (deutan/protan/tritan), lantai penglihatan
normal, dan kontras ≥ 3:1 terhadap permukaannya masing-masing. Palet gelap
**dipilih ulang** terhadap permukaan `#0F171B`, bukan hasil pembalikan otomatis
palet terang.

### Sekuensial (magnitudo / ember ordinal)

Satu rona, terang ke gelap: `--seq-1` … `--seq-5`. Dipakai untuk umur piutang,
di mana ember berurut secara alami dan warna yang makin pekat berarti makin tua.
Tidak pernah pelangi, dan tidak pernah rona di titik tengah.

### Aturan yang berlaku di setiap grafik

- **Satu sumbu nilai.** Tidak pernah dua skala y.
- **Peringkat satu ukuran memakai satu rona.** Identitas dibawa label, bukan warna.
- **Acuan target** digambar sebagai garis putus netral, bukan rona kategorikal kedua.
- Marka tipis, ujung data membulat 4 px menempel garis dasar, garis 2 px,
  penanda ≥ 8 px, celah 2 px antar isian, cincin permukaan 2 px pada marka bertumpuk.
- Label langsung bersifat selektif — titik akhir ditekankan, bukan angka di setiap titik.
- Kisi dan sumbu bersifat resesif; teks memakai token tinta, tidak pernah warna seri.
- Lapisan hover (crosshair + tooltip) ada secara bawaan.
- Grafik utama menyediakan sakelar **Grafik / Tabel** sebagai jalur baca alternatif.

---

## Tipografi

Dua peran, keduanya dari tumpukan sistem — tanpa webfont eksternal, sehingga
tidak ada risiko kegagalan pemuatan yang diam-diam berubah menjadi muka cadangan.

| Peran | Tumpukan | Dipakai untuk |
| --- | --- | --- |
| `--font-ui` | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, …` | Seluruh teks antarmuka |
| `--font-num` | `ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, Consolas, …` | **Setiap** angka, nilai, kode dokumen, SKU, nomor akun, label mikro |

Aturan monospace itulah kepribadian tipografi sistem ini — gagasan buku besar,
diambil dari formulir dan kartu gudang yang digantikan aplikasi ini. Efek
praktisnya nyata: `font-variant-numeric: tabular-nums` membuat kolom nilai dapat
dipindai lurus ke bawah, dan nomor dokumen tidak pernah tertukar bacaannya.

### Tangga ukuran

| Token | Ukuran | Pemakaian |
| --- | --- | --- |
| `--fs-micro` | 11 px | Label mikro mono huruf besar, jarak huruf `0.08em` |
| `--fs-cap` | 12 px | Keterangan, meta, pil |
| `--fs-sm` | 13 px | Sel tabel, judul kartu, tombol |
| `--fs-base` | 14 px | Teks antarmuka (kerapatan ERP) |
| `--fs-h3` | 18 px | Judul laci & modal |
| `--fs-h1` | 28 px | Judul halaman, jarak huruf `-0.015em` |
| `--fs-metric` | 26 px | Angka KPI, mono, jarak huruf `-0.025em` |

---

## Ruang, radius, elevasi

Ruang berkelipatan 4: `--sp-1` (4) sampai `--sp-8` (40).

Radius sengaja kecil dan industrial: `3 / 5 / 6 / 8 px`, ditambah `999px` yang
**hanya** dipakai pil status dan chip saringan. Kartu memakai 6 px.

Elevasi hampir seluruhnya dikerjakan garis rambut 1 px. Bayangan hanya dipakai
untuk lapisan mengambang: laci, modal, popover, toast.

---

## Komponen

| Kelompok | Komponen |
| --- | --- |
| Kerangka | Rail navigasi (dapat diciutkan), topbar, strip kepala dokumen, kanvas konten |
| Kendali | Tombol (utama/sekunder/halus/danger/ikon), input, select, textarea, checkbox, switch, segmented, chip |
| Data | Tabel padat berkepala lengket, meteran inline, pil status, paginasi, bilah aksi massal |
| Ikhtisar | Ubin KPI dengan sparkline, daftar kerja, linimasa, kartu papan |
| Lapisan | Laci rekaman, modal, palet perintah, popover, toast |
| Keadaan | Kosong (dengan jalan keluar), memuat, terpilih, nonaktif, fokus |

---

## Aksesibilitas

- Kontras teks memenuhi WCAG AA pada kedua tema; warna grafik ≥ 3:1 terhadap permukaannya.
- Status tidak pernah warna saja — selalu ada ikon dan teks.
- Identitas seri tidak pernah warna saja — legenda selalu hadir untuk ≥ 2 seri,
  dan grafik utama menyediakan tampilan tabel.
- Fokus papan ketik selalu terlihat (`:focus-visible`, cincin 2 px).
- Laci dan modal memakai `role="dialog"` + `aria-modal`, menutup dengan `Esc`,
  dan mengembalikan fokus ke elemen pemicunya.
- Toast berada di wilayah `aria-live="polite"`.
- `prefers-reduced-motion: reduce` mematikan seluruh transisi dan animasi.
- Konten lebar (tabel, papan) menggulir di dalam wadahnya sendiri; badan halaman
  tidak pernah menggulir menyamping — diperiksa otomatis oleh `tools/smoke.mjs`.
- Tersedia tautan lewati-ke-konten, dan grafik membawa `role="img"` dengan
  ringkasan `aria-label`.

---

## Responsif

| Titik henti | Perubahan |
| --- | --- |
| ≤ 1360 px | Baris KPI menjadi 2 kolom |
| ≤ 1180 px | Rail menciut menjadi ikon; grid dua kolom menjadi satu; papan menjadi 2 kolom |
| ≤ 820 px | KPI satu kolom; papan satu kolom; pencarian topbar menjadi ikon; daftar istilah bertumpuk |
| ≤ 720 px | Laci rekaman selebar layar penuh |

Aturan cetak menyembunyikan kerangka aplikasi dan mencegah kartu terpotong
antar halaman.
