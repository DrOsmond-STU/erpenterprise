# 8 — Arsitektur teknis (target implementasi)

Dokumen ini menetapkan bentuk sistem produksi yang akan dibangun dari
purwarupa. Ia menjawab *bagaimana* purwarupa dipindahkan ke peladen, basis
data, dan lingkungan multi-pengguna tanpa mengubah keputusan produk yang sudah
diuji di dokumen 01–07.

> **Status:** rancangan pra-pengembangan. Butir bertanda **[KEPUTUSAN]**
> perlu dikonfirmasi tim sebelum sprint pertama.

---

## 1. Prinsip yang mengikat

| Prinsip | Konsekuensi teknis |
| --- | --- |
| **Buku besar adalah sumber kebenaran** | Semua angka laporan diturunkan dari `journal_lines`; tidak ada saldo yang disimpan sebagai kolom yang diketik manual. |
| **Setiap dokumen bercap cabang & periode** | Kolom `branch_id` dan `period_id` wajib pada tabel transaksi; kebijakan akses membacanya. |
| **Jurnal tidak dapat diubah** | Koreksi = jurnal balik + jurnal baru. `UPDATE`/`DELETE` pada jurnal terposting ditolak di lapisan basis data. |
| **Posting otomatis harus idempoten** | Satu dokumen → satu set jurnal, dikunci oleh `(source_type, source_id, posting_rule)`. |
| **Keamanan sejak rancangan** | Kontrol pada dokumen 11 adalah persyaratan, bukan tambahan. |
| **Purwarupa adalah spesifikasi UI** | `tokens.css`, komponen, dan alur di `app.js` dipindahkan, bukan dirancang ulang. |

---

## 2. Tumpukan teknologi **[KEPUTUSAN]**

Rekomendasi: satu bahasa (TypeScript) di seluruh lapisan agar model data,
validasi, dan aturan posting dapat dibagi antara klien dan peladen.

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Basis data | **PostgreSQL 16** | Transaksi ACID, `CHECK`/trigger untuk invarian akuntansi, row-level security untuk isolasi cabang, partisi untuk `journal_lines`. |
| Cache & antrean | **Redis 7** | Sesi, rate-limit, antrean posting & laporan (BullMQ). |
| Backend | **Node.js 22 + NestJS** | Modul per domain, DI, guard/interceptor untuk otorisasi, OpenAPI bawaan. |
| ORM & migrasi | **Prisma** (skema) + **SQL migrasi terkelola** untuk trigger/RLS | Prisma untuk CRUD; SQL murni untuk aturan yang harus hidup di basis data. |
| Frontend | **React 18 + Vite + TypeScript** | Memindahkan `tokens.css` dan komponen purwarupa; tabel data dengan TanStack Table; grafik memakai `charts.js` yang diport ke komponen. |
| Autentikasi | **OIDC** (Keycloak atau Authentik, swakelola) | SSO, MFA, kebijakan kata sandi, audit login terpusat. |
| Laporan & cetak | Peladen HTML→PDF (Playwright headless) | Laporan keuangan dicetak dari tampilan yang sama dengan layar. |
| Penyimpanan berkas | S3-compatible (MinIO swakelola / cloud) | Dokumen repositori, lampiran faktur. |
| Infrastruktur | Docker Compose (dev) → Kubernetes atau VM + Docker (prod) | Skala horizontal untuk API; basis data tunggal dengan replika baca. |
| Observabilitas | OpenTelemetry → Grafana/Loki/Tempo | Trace per permintaan, log terstruktur, metrik posting. |

Alternatif yang setara bila tim lebih fasih: Laravel 11 + PostgreSQL (backend),
Vue 3 (frontend). Keputusan arsitektur di bawah tidak bergantung pada
kerangka kerja.

---

## 3. Gambaran sistem

```
┌─────────────┐   HTTPS   ┌──────────────────────┐        ┌──────────────┐
│  Browser    │──────────▶│  API Gateway / Nginx │───────▶│  OIDC (IdP)  │
│  React SPA  │           │  TLS, WAF, rate-limit│        └──────────────┘
└─────────────┘           └──────────┬───────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     │        NestJS API (N replika)  │
                     │  modul: penjualan, pembelian,  │
                     │  persediaan, produksi, sdm,    │
                     │  aset, keuangan, laporan,      │
                     │  cabang, admin, audit          │
                     └───┬──────────────┬────────────┘
                         │              │
              ┌──────────▼───┐   ┌──────▼──────────┐   ┌──────────────┐
              │ PostgreSQL   │   │ Redis           │   │ Worker       │
              │ + replika    │   │ sesi · antrean  │◀──│ posting,     │
              │   baca       │   │ rate-limit      │   │ laporan, PDF │
              └──────────────┘   └─────────────────┘   └──────────────┘
                         │
              ┌──────────▼───┐   ┌─────────────────┐
              │ Object store │   │ Observabilitas  │
              │ (dokumen)    │   │ OTel, log, alert│
              └──────────────┘   └─────────────────┘
```

---

## 4. Pembagian modul backend

Setiap modul NestJS memiliki: `controller` (HTTP), `service` (aturan bisnis),
`repository` (akses data), `dto` (validasi masukan), `policy` (otorisasi),
`events` (peristiwa domain). Modul tidak boleh mengimpor repositori modul lain;
komunikasi lintas modul lewat service publik atau peristiwa.

| Modul | Entitas utama | Peristiwa yang dipancarkan |
| --- | --- | --- |
| `identity` | user, role, permission, session | `user.login`, `user.locked` |
| `org` | company, branch, period, fiscal_year | `period.closed`, `branch.created` |
| `master` | product, customer, supplier, employee, coa | `coa.changed` |
| `sales` | quotation, sales_order, delivery, invoice, receipt | `invoice.issued`, `receipt.recorded` |
| `purchasing` | pr, rfq, po, goods_receipt, ap_invoice, payment | `ap_invoice.recorded`, `payment.recorded` |
| `inventory` | stock_item, stock_move, transfer, adjustment | `stock.moved` |
| `production` | work_order, bom, consumption, output | `wo.completed` |
| `hr` | attendance, payroll_run, payslip | `payroll.processed`, `payroll.paid` |
| `assets` | asset, depreciation_run, maintenance_order | `depreciation.run`, `maintenance.completed` |
| `pos` | shift, pos_transaction | `shift.closed` |
| `ledger` | journal, journal_line, posting_rule, opening_balance | `journal.posted`, `journal.reversed` |
| `reporting` | laporan turunan (baca-saja) | — |
| `workflow` | approval_request, approval_step | `approval.decided` |
| `audit` | audit_log (append-only) | — |

---

## 5. Mesin posting (inti integrasi)

`ledger.js` pada purwarupa menjadi spesifikasi eksekusi. Di produksi, mesin
posting adalah **worker** yang mengonsumsi peristiwa domain lewat pola
*transactional outbox*:

1. Modul sumber menyimpan dokumen **dan** baris outbox dalam satu transaksi
   basis data.
2. Worker membaca outbox, memuat `posting_rule` yang aktif untuk
   `(source_type, event)`, membentuk jurnal, memvalidasi (Σ debit = Σ kredit,
   akun detail, periode terbuka, cabang sama), lalu menyimpan jurnal
   berstatus `posted` dalam satu transaksi bersama penanda `posted_at` pada
   outbox.
3. Kunci unik `(source_type, source_id, rule_code)` menjamin idempoten;
   pengulangan worker tidak menggandakan jurnal.
4. Kegagalan validasi menghasilkan `posting_exception` yang muncul di halaman
   Integrasi & Rekonsiliasi — dokumen tidak diam-diam tidak terposting.

Aturan posting disimpan sebagai data (tabel `posting_rules`), bukan kode, agar
akuntan dapat memetakan ulang akun tanpa rilis. Lihat dokumen 09 §4.

Rekonsiliasi sub-buku (11 pemeriksaan pada purwarupa) dijalankan sebagai
tugas terjadwal setiap malam dan sesudah tutup periode; hasilnya disimpan di
`reconciliation_runs` dan ditampilkan di halaman Integrasi.

---

## 6. Multi-cabang dan konsolidasi

- Satu basis data per **perusahaan (entitas hukum)**; cabang adalah dimensi
  baris (`branch_id`), bukan skema terpisah. Ini membuat konsolidasi menjadi
  agregasi biasa.
- Kantor pusat ditandai `branches.is_head_office = true`. Akun antar kantor
  (`1-3100`, `3-1500`) ditandai `is_intercompany` di bagan akun; laporan
  konsolidasi mengeliminasi keduanya dan memeriksa selisih = 0.
- Transaksi lintas cabang (transfer stok, setoran kas, pembayaran gaji
  terpusat, setoran pajak) selalu menghasilkan **dua jurnal** — satu per
  cabang — dalam satu transaksi basis data.
- Konteks cabang pengguna dibawa lewat header `X-Branch-Id`; nilai `ALL`
  hanya sah untuk peran yang memegang izin `report.consolidated`.
- Multi-perusahaan (grup): setiap perusahaan adalah *tenant* dengan basis data
  sendiri; konsolidasi grup berada di luar cakupan rilis pertama.

---

## 7. Frontend

- SPA React; perutean per modul mengikuti `#/…` purwarupa (diubah ke path
  `/…`).
- **Konteks global** (perusahaan, cabang, periode) disimpan di store dan
  dikirim sebagai header di setiap permintaan; server memvalidasi ulang.
- Komponen inti dipindahkan dari purwarupa: rail, topbar, strip konteks,
  register (tabel + chip + paginasi server-side), laci rekaman, modal, palet
  perintah, toast, grafik.
- Semua angka diformat di klien dengan `Intl.NumberFormat('id-ID')`; server
  mengirim nilai mentah dalam rupiah bulat (integer, satuan rupiah).
- Tidak ada logika akuntansi di klien selain pratinjau (mis. total jurnal
  memorial); validasi final di server.

---

## 8. Lingkungan dan alur rilis

| Lingkungan | Tujuan | Data |
| --- | --- | --- |
| `dev` (lokal, Docker Compose) | Pengembangan | Seed fiktif dari `data.js` |
| `test` (CI) | Uji otomatis | Basis data sekali pakai per pipeline |
| `staging` | UAT & migrasi | Salinan produksi yang **disamarkan** (lihat dok. 11 §9) |
| `prod` | Operasional | Terenkripsi, cadangan harian |

Rilis mengikuti *trunk-based*: PR kecil ke `main`, tag semver, deploy otomatis
ke staging, promosi manual ke produksi setelah checklist keamanan (dok. 11
§13) dan uji regresi (dok. 12 §5) lulus.

---

## 9. Kinerja dan skala yang ditargetkan

| Ukuran | Target rilis pertama |
| --- | --- |
| Pengguna serentak | 200 |
| Jurnal per tahun | 2 juta baris (`journal_lines` dipartisi per tahun buku) |
| Neraca saldo satu cabang, satu periode | < 2 detik (materialized view saldo harian) |
| Konsolidasi 10 cabang | < 5 detik |
| Posting satu dokumen | < 500 ms dari simpan hingga jurnal terlihat |
| RPO / RTO | 15 menit / 4 jam |

Saldo per akun-cabang-hari disimpan sebagai *materialized view* yang
diperbarui inkremental oleh worker posting; laporan membaca view ini, kartu
buku besar membaca baris jurnal langsung.

---

## 10. Keputusan yang perlu dikonfirmasi

1. **[KEPUTUSAN]** Tumpukan: NestJS/React/PostgreSQL seperti §2, atau
   Laravel/Vue.
2. **[KEPUTUSAN]** IdP: Keycloak swakelola atau layanan identitas cloud.
3. **[KEPUTUSAN]** Hosting: VM + Docker (lebih murah, cukup untuk 200
   pengguna) atau Kubernetes.
4. **[KEPUTUSAN]** Kebijakan tutup buku: apakah jurnal ke periode tertutup
   boleh dibuka kembali oleh peran tertentu (dok. 11 §7).
