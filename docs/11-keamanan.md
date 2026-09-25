# 11 — Spesifikasi keamanan

Keamanan pada ERP bukan lapisan tambahan: buku besar yang dapat diubah diam-
diam, laporan yang bocor antar cabang, atau persetujuan yang dapat dipalsukan
merusak seluruh nilai sistem. Dokumen ini menetapkan kontrol yang **wajib**
ada sebelum rilis produksi, dipetakan ke OWASP ASVS 4.0 (Level 2) dan kewajiban
UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.

Setiap kontrol diberi kode `K-nn` agar dapat dirujuk dari tiket, pengujian,
dan checklist rilis.

---

## 1. Model ancaman

| Aset | Ancaman utama | Dampak |
| --- | --- | --- |
| Buku besar & laporan keuangan | Manipulasi jurnal, penghapusan jejak, posting ke periode tertutup | Laporan salah, kerugian, sanksi audit |
| Data pelanggan/pemasok/karyawan (NIK, NPWP, gaji, rekening) | Kebocoran, akses lintas cabang, ekspor massal | Pelanggaran UU PDP, reputasi |
| Kas & pembayaran | Pembayaran fiktif, pengubahan rekening tujuan pemasok | Kerugian langsung |
| Kredensial & sesi | Phishing, kata sandi lemah, sesi dicuri | Penyalahgunaan hak |
| Ketersediaan | DoS, ransomware, kehilangan cadangan | Operasi berhenti |
| Rantai pasok perangkat lunak | Dependensi berbahaya, CI disusupi | Kompromi menyeluruh |

Pelaku yang dipertimbangkan: penyerang eksternal tanpa akun, pengguna sah
yang melampaui wewenang (termasuk kolusi dua orang), admin sistem, dan
integrasi pihak ketiga yang disusupi.

---

## 2. Autentikasi (ASVS V2, V3)

| Kode | Kontrol |
| --- | --- |
| K-01 | Login lewat OIDC Authorization Code + PKCE; aplikasi tidak pernah menyimpan kata sandi. |
| K-02 | Kata sandi minimal 12 karakter, diperiksa terhadap daftar kata sandi bocor; tanpa aturan komposisi yang memaksa rotasi berkala. |
| K-03 | **MFA wajib** untuk peran `admin`, `keuangan`, `manajer`, dan setiap pengguna dengan izin posting, pembayaran, atau laporan konsolidasi; disarankan untuk semua. TOTP atau WebAuthn; SMS tidak diterima. |
| K-04 | Kunci akun 15 menit setelah 5 kegagalan berturut-turut; pemberitahuan ke pemilik akun; tidak membedakan "akun tidak ada" dan "kata sandi salah". |
| K-05 | Access token JWT umur 15 menit; refresh token dirotasi setiap pemakaian, disimpan sebagai hash, cookie `HttpOnly; Secure; SameSite=Strict`; deteksi penggunaan ulang refresh token mencabut seluruh sesi pengguna. |
| K-06 | Sesi idle 30 menit, absolut 12 jam; pengguna dapat melihat & mencabut sesi aktif (`/me/sessions`). |
| K-07 | Akun layanan/integrasi memakai kredensial klien terpisah dengan cakupan izin minimal dan rotasi ≤ 90 hari. |

---

## 3. Otorisasi (ASVS V4)

| Kode | Kontrol |
| --- | --- |
| K-10 | **RBAC** dengan izin granular per aksi (`sales.invoice.issue`, `ledger.journal.post`), bukan per halaman. Matriks awal diturunkan dari halaman Peran & Izin purwarupa. |
| K-11 | **Pembatasan cabang**: setiap penugasan peran memiliki `branch_id` atau `NULL` (semua cabang). Konteks `X-Branch-Id` wajib termasuk dalam cabang yang diizinkan; `ALL` memerlukan `report.consolidated`. |
| K-12 | **Row-level security PostgreSQL** (dok. 09 §6) sebagai lapisan kedua; uji otomatis membuktikan pengguna cabang A tidak dapat membaca baris cabang B walau lolos ke SQL. |
| K-13 | Otorisasi ditegakkan di server pada setiap endpoint (guard) dan pada setiap transisi status; UI hanya menyembunyikan, tidak melindungi. |
| K-14 | Penolakan otorisasi mengembalikan `403` tanpa mengungkap keberadaan entitas cabang lain (`404` untuk entitas yang di luar cakupan). |
| K-15 | Perubahan peran/izin memerlukan alasan, dicatat di `audit_log`, dan berlaku setelah pengguna terdampak login ulang (sesi dicabut). |

### Pemisahan tugas (Segregation of Duties)

Kombinasi berikut **tidak boleh** dipegang satu pengguna; sistem menolak
penugasan peran yang melanggar, dan halaman Kepatuhan menampilkan
pelanggaran yang ada:

| Tidak boleh bersama | Alasan |
| --- | --- |
| Membuat jurnal memorial ↔ memposting jurnal yang sama | Kontrol empat mata pada koreksi |
| Membuat pesanan pembelian ↔ menyetujui PO di atas ambang | Pengadaan fiktif |
| Mengubah rekening bank pemasok ↔ menyetujui pembayaran | Pengalihan pembayaran |
| Membuat faktur ↔ mencatat penerimaan kas ↔ menulis piutang tak tertagih | *Lapping* |
| Mengelola pengguna/peran ↔ memposting jurnal | Admin memberi diri sendiri hak keuangan |
| Menutup periode ↔ membuka kembali periode | Kontrol tutup buku |

---

## 4. Kontrol keuangan (khusus ERP)

| Kode | Kontrol |
| --- | --- |
| K-20 | Jurnal terposting **tidak dapat diubah atau dihapus**; koreksi hanya lewat jurnal balik yang merujuk jurnal asal (ditegakkan trigger basis data, dok. 09 §4). |
| K-21 | Setiap jurnal wajib seimbang, hanya akun detail, periode terbuka, cabang rekening = cabang jurnal (validasi server + constraint). |
| K-22 | Posting otomatis idempoten per `(source_type, source_id, rule_code)`; percobaan ganda tidak menggandakan jurnal. |
| K-23 | Perubahan aturan posting (`posting_rules`) diversi, memerlukan izin `ledger.rules.manage`, alasan, dan berlaku hanya untuk dokumen berikutnya. |
| K-24 | Ambang persetujuan (nilai PO, diskon, plafon kredit) disimpan sebagai konfigurasi yang diaudit; persetujuan mencatat pengguna, waktu, IP, dan alasan. |
| K-25 | Perubahan **rekening bank pemasok/karyawan** memerlukan persetujuan orang kedua dan menahan pembayaran ke rekening baru selama 24 jam (*cooling period*). |
| K-26 | Pembayaran di atas ambang (mis. Rp 100 jt) memerlukan dua penyetuju berbeda cabang/level. |
| K-27 | Tutup periode: checklist otomatis (semua dokumen terposting, 11 rekonsiliasi `ok`, tidak ada jurnal `pending`) sebelum status `closed`; pembukaan kembali memerlukan dua persetujuan dan alasan, dan dicatat. |
| K-28 | Rekonsiliasi sub-buku vs buku besar dijalankan setiap malam; selisih membuka tiket otomatis ke akuntan senior. |
| K-29 | Ekspor laporan keuangan & data master dicatat (siapa, apa, kapan, jumlah baris) dan dibatasi izin `report.export`. |

---

## 5. Validasi masukan dan keluaran (ASVS V5)

| Kode | Kontrol |
| --- | --- |
| K-30 | Semua masukan divalidasi di server dengan skema (DTO + class-validator/zod): tipe, panjang, rentang, enum, format tanggal/uang. Nilai uang integer ≥ 0; kuantitas dalam batas wajar; tanggal dalam periode. |
| K-31 | Akses basis data hanya lewat kueri berparameter (ORM/prepared statement); tidak ada penggabungan string SQL, termasuk pada penyaring laporan dan pengurutan (`sort` dipetakan ke daftar putih kolom). |
| K-32 | Keluaran HTML di-*escape* secara bawaan (interpolasi Vue `{{ }}`); `v-html` dilarang oleh aturan ESLint (`vue/no-v-html`) kecuali untuk konten yang disanitasi DOMPurify di komponen khusus yang ditinjau — memo jurnal dan catatan bebas diperlakukan sebagai teks. Tidak ada template yang dibangun dari string pengguna (tanpa *runtime compiler*). |
| K-33 | Content-Security-Policy ketat: `default-src 'self'`, tanpa skrip inline (nonce untuk yang perlu), `frame-ancestors 'none'`, `object-src 'none'`. |
| K-34 | Unggahan berkas (repositori dokumen, lampiran): daftar putih tipe berdasarkan isi (magic bytes) bukan ekstensi, batas ukuran, pemindaian antivirus, disimpan di object store dengan nama acak, disajikan lewat URL bertanda tangan berumur pendek dengan `Content-Disposition: attachment`. |
| K-35 | Ekspor CSV/XLSX menetralkan sel yang diawali `= + - @` (*CSV injection*). |
| K-36 | Permintaan yang mengubah data hanya lewat `POST/PUT/PATCH/DELETE` dengan token CSRF ganda (cookie SameSite=Strict + header), tidak pernah lewat `GET`. |
| K-37 | Pengenal entitas memakai UUID acak; nomor dokumen tampil tetapi bukan kunci akses. |

---

## 6. Perlindungan data pribadi (UU PDP 27/2022)

| Kode | Kontrol |
| --- | --- |
| K-40 | Inventaris data pribadi: NIK, NPWP, alamat, telepon, rekening bank, gaji, kehadiran, data kesehatan (cuti sakit). Setiap kolom diberi klasifikasi `public / internal / confidential / restricted`. |
| K-41 | Kolom `restricted` (NIK, NPWP, nomor rekening, gaji) dienkripsi di kolom (AES-256-GCM, kunci di KMS/HSM), ditampilkan tersamar (`****1234`) kecuali untuk peran yang berhak, dan pembacaan penuh dicatat. |
| K-42 | Prinsip minimisasi: laporan dan ekspor tidak menyertakan kolom `restricted` kecuali diminta eksplisit dengan izin khusus. |
| K-43 | Dasar pemrosesan & masa retensi didokumentasikan per entitas (mis. data karyawan 10 tahun setelah berhenti sesuai ketentuan perpajakan; data kandidat 1 tahun). Penghapusan/anonimisasi terjadwal. |
| K-44 | Hak subjek data (akses, koreksi, penghapusan bila memungkinkan) dilayani lewat prosedur admin yang diaudit. |
| K-45 | Pemberitahuan kebocoran: prosedur internal memastikan pemberitahuan kepada subjek data dan lembaga berwenang ≤ 3 × 24 jam sesuai UU PDP (lihat §12). |
| K-46 | Lingkungan non-produksi hanya memakai data sintetis atau data produksi yang **disamarkan** (nama, NIK, rekening diganti; nilai transaksi boleh dipertahankan). |

---

## 7. Periode dan waktu

- Server menjadi sumber waktu; tanggal dokumen dari klien divalidasi terhadap
  periode terbuka dan tidak boleh lebih dari 7 hari di masa depan (kecuali
  dokumen berjadwal seperti penyusutan).
- Jam basis data dan aplikasi disinkronkan (NTP); `audit_log.at` selalu UTC.

---

## 8. Kriptografi dan rahasia (ASVS V6, V9)

| Kode | Kontrol |
| --- | --- |
| K-50 | TLS 1.2+ (disarankan 1.3) untuk seluruh lalu lintas; HSTS `max-age=31536000; includeSubDomains; preload`. Koneksi aplikasi ↔ basis data ↔ Redis juga TLS. |
| K-51 | Enkripsi at-rest: volume basis data, cadangan, dan object store terenkripsi; kunci dikelola KMS, dirotasi tahunan, dengan pemisahan peran antara admin infrastruktur dan pemegang kunci. |
| K-52 | Rahasia (kredensial DB, kunci JWT, kunci webhook) di secret manager (Vault/cloud KMS); **tidak pernah** di repositori, gambar Docker, atau variabel lingkungan yang tercatat di log. Pemindaian rahasia di CI (gitleaks). |
| K-53 | Hash kata sandi (bila ada kata sandi lokal untuk keadaan darurat): Argon2id; token dan kunci acak dari CSPRNG. |
| K-54 | Kunci JWT asimetris (RS256/ES256), rotasi dengan JWKS; klaim `aud`, `iss`, `exp` diverifikasi. |

---

## 9. Lingkungan, infrastruktur, rantai pasok

| Kode | Kontrol |
| --- | --- |
| K-60 | Kontainer non-root, sistem berkas baca-saja, gambar dasar minimal, dipindai kerentanan (Trivy) di CI; kerentanan `critical/high` memblokir rilis. |
| K-61 | Dependensi dikunci (lockfile), diperbarui terjadwal, diperiksa `npm audit`/Dependabot; paket baru ditinjau manusia. |
| K-62 | CI/CD: cabang `main` terlindungi, PR wajib satu peninjau, semua uji & pemindaian lulus; kredensial deploy berumur pendek (OIDC ke cloud), tidak ada rahasia statis di runner. |
| K-63 | Jaringan: basis data dan Redis tidak terpapar publik; hanya gateway yang terjangkau; WAF dengan aturan OWASP CRS; rate-limit di gateway dan aplikasi. |
| K-64 | Header keamanan: CSP (K-33), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal, tanpa `Server`/`X-Powered-By`. |
| K-65 | Endpoint dokumentasi API, debug, dan metrik internal tidak tersedia di produksi atau dilindungi jaringan internal + autentikasi. |
| K-66 | Cadangan basis data harian penuh + WAL kontinu (RPO 15 menit), terenkripsi, disalin ke lokasi kedua, **uji pemulihan** bulanan yang didokumentasikan (RTO 4 jam). Cadangan bersifat *immutable* selama 30 hari untuk menahan ransomware. |

---

## 10. Pencatatan, audit, dan pemantauan (ASVS V7)

| Kode | Kontrol |
| --- | --- |
| K-70 | `audit_log` append-only (peran aplikasi tanpa `UPDATE/DELETE`), mencatat setiap pembuatan/perubahan/transisi status/persetujuan/posting/ekspor/perubahan izin dengan `before/after`, pengguna, sesi, IP, `request_id`. |
| K-71 | Rantai hash: `hash = SHA-256(prev_hash ‖ isi baris)`; verifikasi rantai dijalankan harian dan hasilnya tampil di halaman Kepatuhan — perubahan jejak audit terdeteksi. |
| K-72 | Log aplikasi terstruktur (JSON) tanpa data pribadi `restricted`, tanpa token; dikirim ke penyimpanan log terpusat dengan retensi ≥ 1 tahun (jejak audit ≥ 10 tahun sesuai kebutuhan perpajakan). |
| K-73 | Peringatan otomatis untuk: lonjakan login gagal, login dari lokasi/perangkat baru untuk peran keuangan, posting di luar jam kerja dalam jumlah tidak wajar, perubahan rekening pemasok, ekspor massal, kegagalan rekonsiliasi, kegagalan verifikasi rantai hash. |
| K-74 | Waktu server disinkronkan; log mencantumkan `request_id` yang juga dikembalikan ke klien untuk pelacakan. |

---

## 11. Frontend

- Tidak menyimpan token akses di `localStorage`; hanya cookie `HttpOnly`
  untuk refresh dan token akses di memori.
- Konteks cabang/periode yang tersimpan lokal hanya preferensi tampilan;
  server memvalidasi ulang setiap permintaan (K-11).
- Nilai sensitif tidak dimasukkan ke URL (tidak ada NIK/rekening pada query
  string).
- Layar terkunci otomatis setelah idle (K-06) dengan penyamaran angka
  keuangan.
- Dependensi frontend dipindai sama seperti backend (K-61).

---

## 12. Respons insiden

1. **Deteksi** — peringatan §10 atau laporan pengguna/peneliti (lihat
   `SECURITY.md`).
2. **Triase** (≤ 4 jam) — pemilik keamanan menetapkan tingkat: P1 (data
   bocor / integritas buku besar), P2 (akses tidak sah tanpa bukti bocor), P3.
3. **Pembendungan** — cabut sesi/kredensial terdampak, blokir IP, nonaktifkan
   integrasi; untuk integritas buku besar: bekukan posting, jalankan
   rekonsiliasi & verifikasi rantai hash.
4. **Pemberitahuan** — P1 yang menyangkut data pribadi: subjek data dan
   lembaga berwenang ≤ 72 jam (UU PDP Pasal 46); manajemen dan auditor
   internal segera.
5. **Pemulihan & pembelajaran** — laporan pasca-insiden dalam 5 hari kerja
   dengan tindakan perbaikan yang dilacak sebagai tiket.

---

## 13. Checklist keamanan per rilis

Rilis ke produksi memerlukan semua butir berikut dicentang oleh pemilik
teknis dan pemilik keamanan (dua orang berbeda):

- [ ] Semua uji otorisasi lintas cabang dan SoD lulus (dok. 12 §4)
- [ ] Uji invarian buku besar lulus: keseimbangan, imutabilitas, periode
      tertutup, idempoten posting, 11 rekonsiliasi
- [ ] Pemindaian dependensi & gambar: tidak ada `critical/high` terbuka
- [ ] Pemindaian rahasia bersih
- [ ] SAST (semgrep/CodeQL) tanpa temuan `high`
- [ ] DAST/ZAP baseline terhadap staging tanpa temuan `high`
- [ ] Migrasi basis data ditinjau: constraint & trigger K-20/K-21 utuh, RLS
      aktif pada tabel baru
- [ ] Header keamanan & CSP diverifikasi di staging
- [ ] Cadangan terbaru berhasil dipulihkan (≤ 30 hari terakhir)
- [ ] Catatan rilis menyebut perubahan izin/aturan posting, bila ada
- [ ] Uji penetrasi pihak ketiga untuk rilis mayor (≥ sekali setahun) tanpa
      temuan `high` terbuka

---

## 14. Pemetaan cepat ke matriks izin purwarupa

| Baris purwarupa (Peran & Izin) | Izin produksi |
| --- | --- |
| Pesanan penjualan — ubah & setujui | `sales.order.create`, `sales.order.approve` (approve butuh ambang & SoD) |
| Faktur penjualan | `sales.invoice.create`, `sales.invoice.issue`, `sales.receipt.create` |
| Plafon kredit pelanggan | `master.customer.credit.manage` (dua persetujuan di atas ambang) |
| Kartu stok / penyesuaian / transfer | `inventory.read`, `inventory.adjust`, `inventory.transfer` (per cabang) |
| Jurnal umum | `ledger.journal.read/create/post/reverse` |
| Tutup buku periode | `ledger.period.close`, `ledger.period.reopen` |
| Laporan keuangan | `ledger.report.read`, `report.consolidated`, `report.export` |
| Pengguna & peran | `admin.user.manage`, `admin.role.manage` |
| Jejak audit | `admin.audit.read` (baca-saja) |
