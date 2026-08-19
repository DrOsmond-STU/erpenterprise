# 6 — Model data & entitas

Dokumen ini mendaftarkan setiap entitas yang ada di basis data purwarupa
(`data.js`) — bidang, tipe, relasi, dan aturan bisnisnya. Entitas
dikelompokkan menurut domain bisnis, sesuai pengelompokan navigasi.

> **Catatan:** Seluruh data bersifat fiktif dan hidup di memori klien.
> Skema di bawah menggambarkan *rancangan* yang akan dipetakan ke basis
> data relasional saat implementasi.

---

## Konteks tenant

### `org` — Organisasi

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `company` | string | Nama perusahaan aktif |
| `companies` | string[] | Daftar entitas perusahaan (multi-company) |
| `branch` | string | Cabang aktif |
| `branches` | string[] | Daftar cabang |
| `period` | string | Periode akuntansi aktif |
| `periods` | string[] | Periode yang tersedia |
| `currency` | string | Mata uang utama (IDR) |
| `user` | object | Pengguna masuk: `name`, `initials`, `role`, `email` |

**Aturan bisnis:** Setiap transaksi dicap dengan `company`, `branch`, dan
`period`. Pemilih konteks di strip kepala dokumen mengubah cakupan data
yang ditampilkan.

---

## Navigasi

### `nav` — Struktur menu

Array kelompok, masing-masing berisi `label` (nama kelompok) dan `items[]`.
Setiap item: `id` (rute hash), `label`, `icon`, dan opsional `count`
(lencana pekerjaan menunggu).

**16 kelompok, 37 butir navigasi** — dari Ikhtisar hingga Sistem.

---

## Dasbor & ikhtisar

### `kpis` — Ubin KPI dasbor

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | string | Pengenal unik |
| `label` | string | Judul KPI |
| `value` | number | Nilai saat ini |
| `format` | string | Format tampilan: `rp-compact`, `pct`, dll. |
| `delta` | number | Persentase perubahan (±) |
| `dir` | string | Arah yang diharapkan: `up` \| `down` |
| `foot` | string | Catatan kaki (target, konteks) |
| `spark` | number[] | 12 titik data untuk sparkline |

### `revenueTrend` — Tren pendapatan vs target

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `labels` | string[] | 12 label bulan |
| `actual` | number[] | Pendapatan aktual (miliar Rp) |
| `target` | number[] | Target bulanan (miliar Rp) |

### `revenueByLine` — Pendapatan per lini produk

Array objek: `label` (nama lini), `value` (Rp).

### `inventoryMix` — Komposisi persediaan

Array objek: `label` (kategori), `value` (Rp).

### `arAging` — Ember umur piutang

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `label` | string | Deskripsi rentang |
| `short` | string | Label singkat |
| `value` | number | Nilai total (Rp) |
| `count` | number | Jumlah faktur |

### `stockAlerts` — Peringatan stok

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `sku` | string | Kode SKU → relasi ke `stockItems` |
| `name` | string | Nama barang |
| `onHand` | number | Stok tersedia |
| `min` | number | Stok minimum |
| `unit` | string | Satuan |
| `tone` | string | Tingkat kegentingan: `danger` \| `warn` |
| `note` | string | Catatan operasional |

### `approvals` — Antrean persetujuan

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | string | Nomor dokumen (FK ke entitas sumber) |
| `kind` | string | Jenis dokumen |
| `title` | string | Nama pihak / deskripsi |
| `amount` | number | Nilai (Rp) |
| `by` | string | Diajukan oleh |
| `ago` | string | Waktu relatif |
| `tone` | string | Nada visual |
| `icon` | string | Ikon kategori |
| `reason` | string | Alasan memerlukan persetujuan |

### `activity` — Riwayat aktivitas

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `who` | string | Pelaku |
| `what` | string | Aksi |
| `ref` | string | Nomor dokumen rujukan |
| `when` | string | Waktu |
| `tone` | string | Nada visual |

### `notifications` — Notifikasi

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `title` | string | Judul notifikasi |
| `note` | string | Detail tambahan |
| `when` | string | Waktu relatif |
| `tone` | string | Nada: `accent` \| `danger` \| `warn` \| `ok` |
| `unread` | boolean | Belum dibaca? |

---

## AI Copilot

### `aiMessages` — Riwayat percakapan AI

Array pesan: `role` (`assistant` \| `user`), `text` (Markdown).
Digunakan untuk panel AI assistant di dasbor.

---

## Data master

### `masterProducts` — Produk & layanan

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `PRD-NNNN` |
| `name` | string | Nama produk/jasa |
| `category` | string | Barang Jadi \| Bahan Baku \| Suku Cadang \| Jasa |
| `uom` | string | Satuan ukur |
| `salePrice` | number | Harga jual (0 jika tidak dijual langsung) |
| `costPrice` | number | Harga pokok |
| `weight` | number | Berat (kg) |
| `sku` | string | Kode SKU → relasi ke `stockItems` |
| `taxCode` | string | Kode pajak |
| `status` | enum | `aktif` \| `nonaktif` |

---

## CRM

### `crmStages` — Tahap pipeline

Array objek: `id`, `label`. Urutan: prospek → kualifikasi → penawaran →
negosiasi → menang → kalah.

### `leads` — Lead & peluang

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `OPP-YYYY-NNNN` |
| `name` | string | Nama peluang |
| `company` | string | Nama perusahaan prospek |
| `value` | number | Nilai estimasi (Rp) |
| `stage` | FK | → `crmStages.id` |
| `prob` | number | Probabilitas (%) |
| `source` | string | Sumber lead |
| `assignee` | string | PIC penjualan |
| `lastActivity` | date | Tanggal aktivitas terakhir |
| `nextAction` | string | Tindakan selanjutnya |

**Aturan bisnis:**
- Pipeline value = Σ `value × prob / 100` untuk peluang aktif
- Peluang `menang` otomatis prob 100%, `kalah` prob 0%

---

## Penjualan

### `quotations` — Penawaran

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `QT-YYYY-NNNN` |
| `date` | date | Tanggal penawaran |
| `customer` | string | Nama pelanggan |
| `amount` | number | Nilai (Rp) |
| `validity` | date | Berlaku hingga |
| `status` | enum | `draf` \| `terkirim` \| `diterima` \| `ditolak` |
| `pic` | string | PIC penjualan |
| `opp` | FK | → `leads.id` |

### `salesOrders` — Pesanan penjualan

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `SO-YYYY-NNNN` |
| `date` | date | Tanggal pesanan |
| `customer` | string | → `customers.name` |
| `pic` | string | PIC penjualan |
| `amount` | number | Nilai total (Rp) |
| `status` | enum | `draf` \| `menunggu` \| `disetujui` \| `dikirim` \| `selesai` \| `batal` |
| `due` | date | Tanggal jatuh tempo |
| `channel` | string | Kanal: Distributor \| Langsung \| Kontrak |

**Aturan bisnis:**
- Pesanan melebihi plafon kredit pelanggan → status `menunggu` + approval
- Diskon di atas wewenang → eskalasi ke manajer

### `salesOrderLines` — Baris pesanan penjualan

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `sku` | FK | → `stockItems.sku` |
| `name` | string | Nama barang |
| `qty` | number | Kuantitas |
| `unit` | string | Satuan |
| `price` | number | Harga satuan (Rp) |
| `disc` | number | Diskon (%) |

Dikunci dengan kunci `salesOrders.id` pada objek `salesOrderLines`.

### `orderTimeline` — Linimasa pesanan

Array per pesanan: `title` (HTML), `meta` (waktu + konteks), `tone`.

### `customers` — Pelanggan

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `CUST-NNNN` |
| `name` | string | Nama perusahaan |
| `segment` | string | Kontrak \| Distributor \| Langsung |
| `pic` | string | PIC dari sisi pelanggan |
| `city` | string | Kota |
| `limit` | number | Plafon kredit (Rp) |
| `used` | number | Kredit terpakai (Rp) |
| `terms` | string | Termin pembayaran |
| `status` | enum | `aktif` \| `ditahan` \| `nonaktif` |

**Aturan bisnis:**
- `used / limit > 90%` → peringatan plafon
- Status `ditahan` → pesanan baru memerlukan override manajer

### `invoices` — Faktur penjualan

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `INV-YYYY-NNNN` |
| `date` | date | Tanggal faktur |
| `customer` | string | → `customers.name` |
| `amount` | number | Nilai faktur (Rp) |
| `paid` | number | Jumlah terbayar (Rp) |
| `dueDate` | date | Tanggal jatuh tempo |
| `status` | enum | `belum-dibayar` \| `sebagian` \| `lunas` \| `jatuh-tempo` |
| `overdue` | number | Hari lewat jatuh tempo |

---

## POS / Kasir

### `posShifts` — Shift kasir

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `SHF-NNNN` |
| `cashier` | string | Nama kasir |
| `store` | string | Nama toko |
| `startTime` | time | Jam mulai |
| `endTime` | time | Jam selesai |
| `status` | enum | `aktif` \| `tutup` |
| `openingCash` | number | Kas pembuka (Rp) |
| `currentCash` | number | Kas saat ini (Rp) |
| `transactions` | number | Jumlah transaksi |
| `totalSales` | number | Total penjualan shift (Rp) |

### `posTransactions` — Transaksi POS

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `TRX-YYYY-NNNNN` |
| `time` | time | Waktu transaksi |
| `cashier` | string | Nama kasir |
| `items` | number | Jumlah item |
| `total` | number | Nilai total (Rp) |
| `payment` | string | Metode bayar: Tunai \| QRIS \| Debit \| Kredit \| Transfer |
| `status` | enum | `selesai` \| `void` |

### `posKpis` — KPI POS

Objek tunggal: `todaySales`, `todayTarget`, `transactions`, `avgBasket`,
`topProduct`, `refundRate`.

---

## Pembelian

### `purchaseRequests` — Permintaan pembelian

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `PR-YYYY-NNNN` |
| `date` | date | Tanggal permintaan |
| `requestor` | string | Peminta |
| `dept` | string | Departemen |
| `desc` | string | Deskripsi kebutuhan |
| `amount` | number | Estimasi nilai (Rp) |
| `status` | enum | `menunggu` \| `disetujui` \| `selesai` \| `ditolak` |
| `priority` | enum | `tinggi` \| `sedang` \| `rendah` |

### `rfqs` — Request for Quotation

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `RFQ-YYYY-NNNN` |
| `date` | date | Tanggal RFQ |
| `title` | string | Judul kebutuhan |
| `requestor` | string | PIC |
| `vendors` | number | Jumlah vendor diundang |
| `deadline` | date | Batas penawaran |
| `bestPrice` | number | Harga terendah (Rp) |
| `status` | enum | `terbuka` \| `evaluasi` \| `selesai` |
| `prRef` | FK | → `purchaseRequests.id` (opsional) |

### `purchaseOrders` — Pesanan pembelian

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `PO-YYYY-NNNN` |
| `date` | date | Tanggal PO |
| `supplier` | string | → `suppliers.name` |
| `amount` | number | Nilai PO (Rp) |
| `eta` | date | Estimasi tiba |
| `status` | enum | `draf` \| `menunggu` \| `dikirim-pemasok` \| `diterima-sebagian` \| `selesai` |
| `buyer` | string | PIC pembelian |

### `suppliers` — Pemasok

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `SUP-NNNN` |
| `name` | string | Nama pemasok |
| `category` | string | Kategori komoditas |
| `city` | string | Kota |
| `terms` | string | Termin pembayaran |
| `lead` | number | Waktu tunggu (hari) |
| `otd` | number | On-time delivery (%) |
| `status` | enum | `aktif` \| `pantau` |

---

## Inventaris & rantai pasok

### `stockItems` — Stok barang

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `sku` | PK | Kode SKU |
| `name` | string | Nama barang |
| `category` | string | Kategori: Bahan baku \| Suku cadang \| Barang jadi \| dll. |
| `unit` | string | Satuan |
| `onHand` | number | Stok tersedia |
| `min` | number | Stok minimum (reorder point) |
| `max` | number | Stok maksimum |
| `cost` | number | Biaya per unit (Rp) |
| `wh` | string | Gudang |

**Aturan bisnis:**
- `onHand ≤ min` → peringatan stok kritis
- `onHand = 0` → status habis (danger)

### `stockMoves` — Mutasi stok

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `MOV-YYYY-NNNN` |
| `date` | date | Tanggal mutasi |
| `sku` | FK | → `stockItems.sku` |
| `name` | string | Nama barang |
| `type` | string | Jenis: Masuk \| Keluar \| Transfer \| Penyesuaian |
| `qty` | number | Kuantitas (negatif = keluar) |
| `ref` | string | Nomor dokumen rujukan |
| `wh` | string | Gudang |

### `shipments` — Pengiriman (rantai pasok)

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `SHP-YYYY-NNNN` |
| `date` | date | Tanggal kirim |
| `origin` | string | Asal |
| `destination` | string | Tujuan |
| `carrier` | string | Ekspedisi |
| `ref` | string | Nomor dokumen rujukan (DO/GR/TRF) |
| `weight` | number | Berat (kg) |
| `eta` | date | Estimasi tiba |
| `status` | enum | `transit` \| `diterima` |

---

## Produksi

### `workOrderColumns` — Tahap papan produksi

Array objek: `id`, `label`. Urutan: antre → berjalan → qc → selesai.

### `workOrders` — Perintah kerja

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `WO-YYYY-NNNN` |
| `product` | string | Nama produk |
| `qty` | number | Kuantitas target |
| `unit` | string | Satuan |
| `line` | string | Lini produksi |
| `due` | string | Tanggal jatuh tempo |
| `progress` | number | Kemajuan (%) |
| `col` | FK | → `workOrderColumns.id` (tahap saat ini) |
| `pic` | string | PIC / supervisor |
| `flag` | string | Penanda masalah (opsional) |

---

## Proyek

### `projects` — Daftar proyek

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `PRJ-YYYY-NNN` |
| `name` | string | Nama proyek |
| `customer` | string | Pelanggan / internal |
| `pm` | string | Manajer proyek |
| `budget` | number | Anggaran (Rp) |
| `actual` | number | Realisasi (Rp) |
| `startDate` | date | Tanggal mulai |
| `endDate` | date | Tanggal selesai target |
| `status` | enum | `perencanaan` \| `berjalan` \| `selesai` |
| `health` | enum | `hijau` \| `kuning` \| `merah` |
| `progress` | number | Kemajuan (%) |

**Aturan bisnis:**
- `actual / budget > 85%` pada `progress < 80%` → health `kuning` (risiko overrun)

### `projectTasks` — Tugas proyek (Gantt)

Dikunci per `projects.id`. Setiap tugas:

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `T-NNN` |
| `name` | string | Nama tugas |
| `start` | date | Tanggal mulai |
| `end` | date | Tanggal selesai |
| `progress` | number | Kemajuan (%) |
| `assignee` | string | PIC |

---

## Keuangan

### `chartOfAccounts` — Bagan akun (COA)

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `code` | PK | Kode akun (`X-NNNN`) |
| `name` | string | Nama akun |
| `type` | enum | `Header` \| `Detail` |
| `category` | string | Aset \| Liabilitas \| Ekuitas \| Pendapatan \| Beban |
| `level` | number | Kedalaman hierarki (0–2) |
| `balance` | number | Saldo (Rp) |
| `parent` | FK | → `chartOfAccounts.code` (null untuk root) |
| `status` | enum | `aktif` \| `nonaktif` |

**Struktur:** 5 kategori utama, 47 akun (15 header + 32 detail).
Hierarki: kategori (level 0) → sub-kategori (level 1) → akun detail (level 2).

### `journals` — Jurnal umum

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `JV-YYYY-NNNN` |
| `date` | date | Tanggal jurnal |
| `desc` | string | Deskripsi |
| `account` | string | Kode dan nama akun |
| `debit` | number | Nilai debit (Rp) |
| `credit` | number | Nilai kredit (Rp) |
| `status` | enum | `diposting` \| `menunggu` \| `ditolak` |
| `by` | string | Dibuat oleh |

### `invoices` — Faktur penjualan

(Lihat bagian Penjualan di atas)

### `payables` — Hutang usaha

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `APV-YYYY-NNNN` |
| `date` | date | Tanggal voucher |
| `supplier` | string | → `suppliers.name` |
| `poRef` | FK | → `purchaseOrders.id` |
| `amount` | number | Nilai (Rp) |
| `paid` | number | Jumlah terbayar (Rp) |
| `dueDate` | date | Tanggal jatuh tempo |
| `status` | enum | `belum-dibayar` \| `sebagian` \| `lunas` |
| `matched` | boolean | Sudah dicocokkan dengan PO? |

### `apAging` — Ember umur hutang

Struktur identik dengan `arAging`: `label`, `short`, `value`, `count`.

### `bankAccounts` — Kas & bank

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `BNK-NNN` |
| `name` | string | Nama rekening |
| `bank` | string | Nama bank / Kas |
| `accountNo` | string | Nomor rekening |
| `currency` | string | Mata uang |
| `balance` | number | Saldo (Rp atau USD) |
| `lastRecon` | date | Tanggal rekonsiliasi terakhir |
| `unrecon` | number | Jumlah transaksi belum direkonsiliasi |
| `status` | enum | `aktif` \| `tutup` |

### `budgets` — Anggaran per pusat biaya

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `BDG-NNN` |
| `costCenter` | string | Kode pusat biaya |
| `dept` | string | Nama departemen |
| `type` | enum | `OPEX` \| `CAPEX` |
| `budget` | number | Anggaran (Rp) |
| `commitment` | number | Komitmen belum terealisasi (Rp) |
| `actual` | number | Realisasi (Rp) |
| `forecast` | number | Prakiraan akhir periode (Rp) |

**Aturan bisnis:**
- `forecast > budget` → over budget (peringatan)
- Serapan = `(actual + commitment) / budget × 100%`

### `accountBudgets` — Anggaran per akun (manajemen)

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `accountCode` | FK | → `chartOfAccounts.code` |
| `accountName` | string | Nama akun |
| `period` | string | Periode anggaran |
| `budget` | number | Anggaran (Rp) |
| `actual` | number | Realisasi (Rp) |
| `forecast` | number | Prakiraan (Rp) |
| `variance` | number | Selisih prakiraan − anggaran (Rp) |
| `notes` | string | Catatan |

---

## SDM

### `employees` — Karyawan

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `EMP-NNNN` |
| `name` | string | Nama lengkap |
| `dept` | string | Departemen |
| `title` | string | Jabatan |
| `join` | date | Tanggal bergabung |
| `location` | string | Lokasi kerja |
| `status` | enum | `tetap` \| `kontrak` \| `magang` |

### `attendanceRecords` — Kehadiran & cuti

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `ATT-YYYY-MM-NNN` |
| `employeeId` | FK | → `employees.id` |
| `name` | string | Nama karyawan |
| `date` | date | Tanggal |
| `shift` | string | Reguler \| Shift 1 \| Shift 2 |
| `clockIn` | time | Waktu masuk (null jika cuti/sakit) |
| `clockOut` | time | Waktu keluar |
| `overtime` | number | Jam lembur |
| `status` | enum | `hadir` \| `cuti` \| `sakit` \| `terlambat` |
| `type` | string | Jenis: Kehadiran \| Cuti Tahunan \| Sakit |

### `payroll` — Penggajian

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `PAY-YYYY-MM-NNN` |
| `employeeId` | FK | → `employees.id` |
| `name` | string | Nama karyawan |
| `dept` | string | Departemen |
| `basic` | number | Gaji pokok (Rp) |
| `allowance` | number | Tunjangan (Rp) |
| `deduction` | number | Potongan (Rp) |
| `overtime` | number | Uang lembur (Rp) |
| `netPay` | number | Gaji bersih (Rp) |
| `status` | enum | `draf` \| `diproses` \| `dibayar` |
| `period` | string | Periode gaji |

**Aturan bisnis:** `netPay = basic + allowance - deduction + overtime`

---

## Aset & pemeliharaan

### `assets` — Daftar aset tetap

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `AST-NNNN` |
| `name` | string | Nama aset |
| `category` | string | Kategori aset |
| `location` | string | Lokasi |
| `acquisitionDate` | date | Tanggal perolehan |
| `acquisitionCost` | number | Harga perolehan (Rp) |
| `bookValue` | number | Nilai buku (Rp) |
| `monthlyDepr` | number | Penyusutan bulanan (Rp) |
| `status` | enum | `aktif` \| `dihapuskan` |

### `maintenanceOrders` — Perintah pemeliharaan

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `MNT-YYYY-NNNN` |
| `asset` | string | Nama aset |
| `assetId` | FK | → `assets.id` |
| `type` | enum | `Preventif` \| `Korektif` |
| `priority` | enum | `tinggi` \| `sedang` \| `rendah` |
| `assignee` | string | PIC |
| `scheduledDate` | date | Tanggal jadwal |
| `status` | enum | `dijadwalkan` \| `berjalan` \| `selesai` |
| `cost` | number | Biaya (Rp) |
| `desc` | string | Deskripsi pekerjaan |

---

## Dokumen

### `documents` — Repositori dokumen

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `DOC-NNNN` |
| `name` | string | Nama dokumen |
| `type` | string | Kontrak \| SOP \| Laporan \| Sertifikat \| Kebijakan \| Teknis |
| `folder` | string | Jalur folder |
| `owner` | string | Pemilik |
| `size` | string | Ukuran file |
| `modified` | date | Terakhir diubah |
| `version` | number | Versi |
| `status` | enum | `berlaku` \| `draf` \| `kedaluwarsa` |
| `expiry` | date | Tanggal kedaluwarsa (opsional) |

---

## Alur kerja

### `workflows` — Template alur kerja

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `WFL-NNN` |
| `name` | string | Nama alur kerja |
| `trigger` | string | Pemicu |
| `steps` | number | Jumlah langkah |
| `sla` | string | Batas waktu |
| `activeInstances` | number | Instance aktif |
| `lastModified` | date | Terakhir diubah |
| `status` | enum | `aktif` \| `nonaktif` |
| `owner` | string | Pemilik |

---

## Analitik & BSC

### `reports` — Daftar laporan BI

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `RPT-NNN` |
| `name` | string | Nama laporan |
| `module` | string | Modul sumber |
| `type` | string | Standar \| Analitik |
| `lastRun` | date | Terakhir dijalankan |
| `frequency` | string | Harian \| Mingguan \| Bulanan |
| `format` | string | PDF \| Excel \| Dasbor |
| `status` | enum | `aktif` \| `nonaktif` |

### `analyticsKpis` — KPI analitik

Array objek: `id`, `label`, `value`, `delta`, `format`, `icon`.

### `bscData` — Balanced Scorecard

Objek dengan `period` dan empat perspektif (`financial`, `customer`,
`internal`, `growth`), masing-masing berisi array:

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `metric` | string | Nama metrik |
| `target` | number | Target |
| `actual` | number | Realisasi |
| `unit` | string | Satuan |
| `trend` | number[] | 6 titik data historis |

---

## Sistem & kepatuhan

### `roles` — Peran

Array objek: `id`, `label`, `users` (jumlah pengguna).

### `permissions` — Matriks izin

Array kelompok, masing-masing berisi `group` dan `rows[]`. Setiap row:
`label` (nama fitur), `by` (objek peran → level akses: `full` \| `read` \| `none`).

### `auditTrail` — Jejak audit

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `AUD-NNNN` |
| `timestamp` | datetime | Waktu kejadian |
| `user` | string | Pelaku |
| `action` | string | Buat \| Ubah \| Setujui \| Tolak \| Posting \| dll. |
| `module` | string | Modul |
| `entity` | string | ID entitas terkait |
| `detail` | string | Deskripsi perubahan |
| `ip` | string | Alamat IP |

### `complianceItems` — Kepatuhan & GRC

| Bidang | Tipe | Keterangan |
|--------|------|------------|
| `id` | PK | `CMP-NNN` |
| `title` | string | Judul item kepatuhan |
| `category` | string | Sertifikasi \| Regulasi \| Pajak \| Tata Kelola \| Lingkungan \| Audit |
| `owner` | string | Penanggung jawab |
| `dueDate` | date | Batas waktu (opsional) |
| `lastReview` | date | Tinjauan terakhir |
| `risk` | enum | `rendah` \| `sedang` \| `tinggi` |
| `status` | enum | `patuh` \| `peninjauan` \| `dijadwalkan` |

---

## Diagram relasi

```
┌────────────┐     ┌──────────────┐     ┌───────────────┐
│  leads     │────→│  quotations  │────→│  salesOrders   │
│ (CRM)      │     │              │     │               │
└────────────┘     └──────────────┘     └───────┬───────┘
                                                │
                    ┌──────────────┐             │  orderLines
                    │  customers   │←────────────┘
                    │              │────→ invoices ────→ arAging
                    └──────────────┘
                                        ┌───────────────┐
┌────────────┐     ┌──────────────┐     │ purchaseOrders │
│  purchReq  │────→│    rfqs      │────→│               │
└────────────┘     └──────────────┘     └───────┬───────┘
                                                │
                    ┌──────────────┐             │
                    │  suppliers   │←────────────┘
                    │              │────→ payables ────→ apAging
                    └──────────────┘

┌────────────┐     ┌──────────────┐     ┌───────────────┐
│ stockItems │←───→│  stockMoves  │     │  shipments    │
└────────────┘     └──────────────┘     └───────────────┘

┌────────────┐     ┌──────────────┐
│ workOrders │     │   projects   │────→ projectTasks
└────────────┘     └──────────────┘

┌────────────┐     ┌──────────────┐     ┌───────────────┐
│   COA      │←───→│   journals   │     │ bankAccounts  │
└────────────┘     └──────────────┘     └───────────────┘
       │
       └────────→ budgets (per pusat biaya)
       └────────→ accountBudgets (per akun)

┌────────────┐     ┌──────────────┐     ┌───────────────┐
│ employees  │────→│   payroll    │     │  attendance   │
└────────────┘     └──────────────┘     └───────────────┘

┌────────────┐     ┌──────────────┐
│   assets   │────→│ maintenance  │
└────────────┘     └──────────────┘
```

---

## Statistik ringkas

| Metrik | Nilai |
|--------|-------|
| Jumlah entitas | 35 |
| Jumlah bidang unik | ~280 |
| Domain bisnis | 12 |
| Relasi antar entitas | 22 |
| Hierarki terdalam | 3 level (COA) |
