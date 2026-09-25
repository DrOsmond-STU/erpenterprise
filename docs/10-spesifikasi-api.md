# 10 — Spesifikasi API

REST/JSON di atas HTTPS, versi pada jalur (`/api/v1`). Spesifikasi OpenAPI
dibangkitkan dari kode dan dipublikasikan di `/api/docs` (hanya lingkungan
non-produksi).

---

## 1. Konvensi

| Hal | Aturan |
| --- | --- |
| Autentikasi | `Authorization: Bearer <access_token>` (JWT OIDC, umur 15 menit); refresh lewat cookie `HttpOnly; Secure; SameSite=Strict`. |
| Konteks | `X-Company-Id`, `X-Branch-Id` (`ALL` hanya untuk izin konsolidasi), `X-Period-Id`. Server memvalidasi bahwa pengguna berhak atas kombinasi ini; ketidakcocokan → `403`. |
| Idempoten | Setiap `POST` yang membuat dokumen wajib membawa `Idempotency-Key` (UUID); kunci disimpan 24 jam, permintaan ulang mengembalikan hasil pertama. |
| Paginasi | `?page=1&size=25` (maks 200); balasan memuat `meta.total`, `meta.page`. |
| Penyaringan | `?status=posted&date_from=2026-08-01&date_to=2026-08-31&q=teks`. |
| Pengurutan | `?sort=-journal_date,journal_no`. |
| Uang | Integer rupiah. Tanggal `YYYY-MM-DD`; waktu ISO-8601 UTC. |
| Kesalahan | `{ "error": { "code": "LEDGER_UNBALANCED", "message": "...", "details": [...] , "request_id": "..." } }`. Pesan tidak membocorkan detail internal. |
| Pembatasan laju | 600 permintaan / menit / pengguna; 20 / menit untuk endpoint login. Balasan `429` dengan `Retry-After`. |
| Versi entitas | `ETag` pada GET dokumen; `If-Match` wajib pada PUT/PATCH untuk mencegah *lost update* (`412` bila usang). |

---

## 2. Identitas

| Metode | Jalur | Izin | Keterangan |
| --- | --- | --- | --- |
| GET | `/auth/login` | — | Redirect ke IdP (OIDC Authorization Code + PKCE) |
| POST | `/auth/callback` | — | Tukar kode, terbitkan sesi |
| POST | `/auth/refresh` | sesi | Rotasi refresh token; token lama dicabut |
| POST | `/auth/logout` | sesi | Cabut sesi |
| GET | `/me` | sesi | Profil, peran, cabang yang diizinkan, izin efektif |
| GET | `/me/sessions` · DELETE `/me/sessions/{id}` | sesi | Lihat & cabut sesi aktif |

---

## 3. Organisasi

| Metode | Jalur | Izin |
| --- | --- | --- |
| GET/POST | `/branches` | `org.branch.read` / `org.branch.manage` |
| PATCH | `/branches/{id}` (`status`, profil) | `org.branch.manage` |
| GET | `/periods` | `org.period.read` |
| POST | `/periods/{id}/close` | `ledger.period.close` (langkah tutup buku, dok. 11 §7) |
| POST | `/periods/{id}/reopen` | `ledger.period.reopen` (dua persetujuan) |

Membuat cabang otomatis membuat rekening giro & kas kecil bersaldo nol dan
mencatat `audit_log`.

---

## 4. Dokumen operasional (pola seragam)

Semua modul dokumen memakai pola yang sama; contoh untuk faktur:

| Metode | Jalur | Izin | Efek buku besar |
| --- | --- | --- | --- |
| GET | `/invoices` | `sales.invoice.read` | — |
| GET | `/invoices/{id}` | `sales.invoice.read` | — (menyertakan `journals[]` terkait) |
| POST | `/invoices` | `sales.invoice.create` | Draf; belum ada jurnal |
| POST | `/invoices/{id}/issue` | `sales.invoice.issue` | Memancarkan `invoice.issued` → jurnal piutang/pendapatan/PPN/HPP |
| POST | `/invoices/{id}/receipts` | `sales.receipt.create` | Jurnal kas/piutang |
| POST | `/invoices/{id}/cancel` | `sales.invoice.cancel` | Jurnal balik otomatis; hanya bila periode terbuka |

Jalur serupa: `/sales-orders` (+`/approve`, `/reject`), `/ap-invoices`
(+`/payments`), `/stock-moves`, `/transfers` (dua cabang), `/work-orders`
(+`/complete`), `/payroll-runs` (+`/process`, `/pay`), `/assets`
(+`/depreciation-runs`), `/maintenance-orders` (+`/complete`), `/pos/shifts`
(+`/close`).

Transisi status hanya lewat endpoint aksi (`/issue`, `/approve`), tidak lewat
`PATCH status`. Ini yang membuat otorisasi per aksi dapat ditegakkan.

---

## 5. Buku besar

| Metode | Jalur | Izin | Keterangan |
| --- | --- | --- | --- |
| GET | `/ledger/journals` | `ledger.journal.read` | Saring cabang/periode/status/sumber/akun |
| GET | `/ledger/journals/{id}` | `ledger.journal.read` | Baris, dokumen sumber, jejak |
| POST | `/ledger/journals` | `ledger.journal.create` | Jurnal memorial → `pending` (validasi dok. 07 §10.5) |
| POST | `/ledger/journals/{id}/post` | `ledger.journal.post` | Pembuat ≠ pemosting (SoD) |
| POST | `/ledger/journals/{id}/reject` | `ledger.journal.post` | |
| POST | `/ledger/journals/{id}/reverse` | `ledger.journal.reverse` | Membuat jurnal balik bertanggal hari ini/periode terbuka |
| GET | `/ledger/accounts/{code}/card` | `ledger.report.read` | Kartu buku besar: saldo awal, baris, saldo berjalan; `?bank_account_id=` |
| GET | `/ledger/posting-rules` · PUT `/ledger/posting-rules/{code}` | `ledger.rules.manage` | Perubahan aturan dicatat & diversi |
| GET | `/ledger/posting-exceptions` | `ledger.journal.read` | Dokumen yang gagal diposting |

---

## 6. Laporan

| Metode | Jalur | Izin | Keterangan |
| --- | --- | --- | --- |
| GET | `/reports/trial-balance` | `ledger.report.read` | `?branch=CKR&period=2026-08` atau `branch=ALL&by_branch=true` |
| GET | `/reports/income-statement` | `ledger.report.read` | Kolom per cabang bila `branch=ALL` |
| GET | `/reports/balance-sheet` | `ledger.report.read` | Menyertakan `eliminations[]` |
| GET | `/reports/consolidation` | `report.consolidated` | Kontribusi + tiga laporan |
| GET | `/reports/reconciliation` | `ledger.report.read` | 11 pemeriksaan sub-buku vs buku besar |
| POST | `/reports/{kind}/export` | `report.export` | Antrean → PDF/XLSX; balasan `202` + `job_id`; unduhan bertanda tangan, kedaluwarsa 15 menit |

Ekspor laporan dicatat di `audit_log` (siapa mengunduh apa, kapan) karena
laporan keuangan adalah data sensitif.

---

## 7. Administrasi

| Metode | Jalur | Izin |
| --- | --- | --- |
| GET/POST/PATCH | `/admin/users` | `admin.user.manage` |
| GET/PUT | `/admin/roles/{id}/permissions` | `admin.role.manage` (perubahan wajib alasan; dicatat) |
| GET | `/admin/audit-log` | `admin.audit.read` (baca-saja; tidak ada endpoint tulis) |
| GET | `/admin/health` | — (tanpa detail versi/infrastruktur pada produksi) |

---

## 8. Peristiwa keluar (webhook / integrasi)

Untuk integrasi pihak ketiga (e-faktur, bank, payroll eksternal):
`POST` ke URL terdaftar dengan tanda tangan `X-Signature: HMAC-SHA256(body,
secret)`, pengulangan eksponensial, dan *idempotency key* di badan. Rahasia
per pelanggan webhook, dapat dirotasi.
