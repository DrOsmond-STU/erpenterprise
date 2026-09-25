# 12 — Standar pengembangan & rencana pengujian

Aturan kerja tim selama implementasi. Dokumen ini pendek dengan sengaja:
yang tidak tertulis di sini mengikuti bawaan perkakas (ESLint, Prettier,
NestJS, Vue).

---

## 1. Repositori dan cabang

- Satu monorepo: `apps/api`, `apps/web`, `packages/domain` (tipe, validasi,
  aturan posting yang dibagi), `packages/ui` (token & komponen dari
  purwarupa), `infra/`, `docs/`.
- *Trunk-based*: cabang fitur berumur ≤ 3 hari, PR kecil (< 400 baris diff
  bila mungkin), `main` selalu dapat dirilis.
- Nama cabang `feat/<modul>-<ringkas>`, `fix/…`, `chore/…`. Commit mengikuti
  *Conventional Commits* berbahasa Indonesia (`feat(ledger): posting faktur`).
- Setiap PR: deskripsi *apa & mengapa*, tautan tiket, tangkapan layar untuk
  UI, catatan migrasi, dan checklist keamanan singkat (dok. 11 §13 yang
  relevan).

## 2. Tinjauan kode

- Minimal satu peninjau; dua untuk perubahan pada `ledger`, `identity`,
  migrasi basis data, dan aturan posting.
- Peninjau memeriksa secara eksplisit: otorisasi pada endpoint baru, cakupan
  cabang pada kueri baru, pencatatan audit pada perubahan status, dan
  ketiadaan data pribadi di log.
- Perubahan aturan posting atau bagan akun memerlukan tinjauan akuntan.

## 3. Standar kode

| Area | Aturan |
| --- | --- |
| Bahasa | TypeScript `strict`; tidak ada `any` tanpa komentar alasan. |
| Gaya | ESLint (+ `eslint-plugin-vue`, aturan `vue/no-v-html`) + Prettier di pre-commit (lint-staged); CI menolak pelanggaran. |
| Vue | Composition API dengan `<script setup lang="ts">`; props & emits bertipe; state lintas halaman hanya di Pinia; komponen `packages/ui` tanpa akses jaringan; pengujian komponen dengan Vitest + Vue Test Utils. |
| Uang | Tipe `Rupiah = bigint`/integer; dilarang `number` desimal untuk uang; pembulatan hanya di fungsi `splitPPN`/`allocate` yang diuji. |
| Tanggal | `date` untuk tanggal dokumen (tanpa zona), `timestamptz` UTC untuk peristiwa. |
| Kesalahan | Kelas kesalahan domain dengan `code` stabil (mis. `LEDGER_PERIOD_CLOSED`); pesan pengguna berbahasa Indonesia; detail teknis hanya di log. |
| Bahasa UI | Indonesia baku sesuai glosarium purwarupa (Jurnal, Neraca Saldo, Kartu Buku Besar, Cabang, Periode). |
| Konfigurasi | 12-factor; semua konfigurasi lewat variabel lingkungan yang divalidasi saat start (zod); rahasia dari secret manager. |
| Log | Terstruktur JSON, tingkat `info` ke atas di produksi, `request_id` di setiap baris; tidak ada NIK/NPWP/rekening/token. |

## 4. Piramida pengujian

| Tingkat | Cakupan | Alat | Target |
| --- | --- | --- | --- |
| Unit | Aturan posting, validasi jurnal, pemecah PPN, umur piutang, konsolidasi & eliminasi | Vitest | ≥ 90% pada `packages/domain` & modul `ledger` |
| Integrasi (DB nyata) | Trigger imutabilitas, keseimbangan tertunda, RLS, idempoten posting, tutup periode | Vitest + Testcontainers PostgreSQL | Setiap invarian dok. 09 §4 punya uji negatif |
| API/kontrak | Setiap endpoint: 401/403/404/412/422 dan jalur sukses; otorisasi lintas cabang & SoD | Supertest + skema OpenAPI | 100% endpoint |
| E2E | Alur 1–5 dokumen 03 di browser | Playwright | Setiap rilis |
| Keamanan | SAST, pemindaian dependensi/gambar/rahasia, DAST baseline | semgrep/CodeQL, Trivy, gitleaks, ZAP | Setiap PR / rilis |
| Kinerja | Neraca saldo & konsolidasi pada 2 juta baris jurnal | k6 | Sebelum rilis mayor |

### Uji invarian buku besar (wajib, tidak boleh dilewati)

Diturunkan langsung dari 11 pemeriksaan halaman Integrasi purwarupa dan
`Ledger.validate`:

1. Setiap jurnal `posted`: Σ debit = Σ kredit.
2. Tidak ada baris jurnal ke akun header atau akun dihitung.
3. `UPDATE`/`DELETE` jurnal `posted` gagal; `reverse` menghasilkan jurnal
   balik yang membuat saldo bersih nol.
4. Posting ke periode `closed` gagal; setelah `reopen` (dua persetujuan)
   berhasil dan tercatat.
5. Memancarkan peristiwa yang sama dua kali menghasilkan tepat satu set jurnal.
6. Σ sisa faktur = saldo 1-1200 per cabang; Σ sisa tagihan pemasok = 2-1100;
   Σ saldo rekening = 1-1100; Σ kartu stok = 1-14xx/1-1500; Σ perolehan
   aset = 1-2xxx; NBV = perolehan − 1-2900; Σ gaji diproses = 2-1200.
7. Neraca saldo: Σ debit = Σ kredit; neraca: aset = liabilitas + ekuitas
   (termasuk laba berjalan) untuk setiap cabang dan konsolidasi.
8. Konsolidasi: RK Cabang (pusat) = Σ RK Kantor Pusat (cabang); setelah
   eliminasi keduanya nol.
9. Pengguna cabang A tidak dapat membaca/menulis dokumen atau jurnal cabang B
   lewat API maupun SQL (RLS).
10. Pembuat jurnal memorial tidak dapat memposting jurnalnya sendiri.

### Data uji

Seed dari `prototype/assets/data.js` dan hasil `Ledger.all()` dipakai sebagai
*golden dataset*: angka neraca saldo, laba rugi, dan neraca purwarupa untuk
Agu 2026 dan TA 2026 menjadi nilai harapan uji regresi mesin posting produksi.

## 5. Pipeline CI

```
lint → typecheck → unit → integrasi (Postgres) → build → kontrak API →
pemindaian (SAST, dependensi, rahasia, gambar) → E2E (staging sementara) →
artefak & tag
```

PR tidak dapat digabung bila satu tahap gagal. Deploy ke staging otomatis
dari `main`; promosi ke produksi manual dengan checklist dok. 11 §13.

## 6. Definisi selesai

Sebuah tiket selesai bila:

- Kode & uji tergabung ke `main`; cakupan tidak turun.
- Endpoint baru terdaftar di OpenAPI dengan izin yang jelas.
- Perubahan status dicatat di `audit_log`.
- Dokumentasi (dok. 07/09/10) diperbarui bila perilaku berubah.
- Tinjauan keamanan singkat pada PR terisi.
- Diverifikasi di staging oleh pemilik produk atau QA.

## 7. Lingkungan pengembang

- `docker compose up` menjalankan PostgreSQL, Redis, MinIO, Keycloak (realm
  dev), API, web; seed otomatis dari purwarupa.
- Pengguna dev: `admin`, `akuntan`, `manajer`, `gudang-sby`, `kasir-ckr`
  dengan peran dan pembatasan cabang berbeda untuk menguji K-11 sejak awal.
- `make check` = lint + typecheck + unit; `make test` = seluruh pipeline
  lokal.
