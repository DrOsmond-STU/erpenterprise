# 9 — Keamanan informasi & pemetaan ISO/IEC 27001:2022

Dokumen ini adalah **pernyataan penerapan (Statement of Applicability) tingkat
aplikasi**: kontrol Annex A yang relevan dengan aplikasi ERP, bagaimana kontrol
itu diterapkan di kode, dan bukti pengujiannya. Kontrol organisasi (kebijakan,
SDM, fisik) tetap menjadi tanggung jawab ISMS perusahaan; aplikasi menyediakan
register **Kepatuhan & GRC**, **Register Risiko SI**, **Insiden Keamanan**, dan
**Repositori Dokumen** untuk mengelolanya.

> Sertifikasi ISO 27001 diberikan kepada *organisasi* oleh lembaga sertifikasi,
> bukan kepada perangkat lunak. Aplikasi ini dirancang agar kontrol teknis yang
> diperiksa auditor sudah tersedia dan dapat dibuktikan.

## Ringkasan kontrol teknis

| Kontrol Annex A | Penerapan | Lokasi kode | Bukti uji |
| --- | --- | --- | --- |
| **A.5.3** Pemisahan tugas | Aksi persetujuan bertanda SoD menolak pembuat dokumen (jurnal, SO, PO, PR, pembayaran, penggajian, cuti, anggaran, harga penawaran). Kontrol anggaran dapat memblokir transaksi yang melampaui anggaran disetujui. Pengguna tidak dapat mengubah izin perannya sendiri atau menaikkan perannya. | `crud.runAction`, `routes.js` (izin), `ledger/budget.js` | `security.test` SoD; `ledger.test` pembayaran; `budget.test` |
| **A.5.15** Kontrol akses | RBAC 18 modul × 5 tingkat (tanpa akses, lihat, ubah, setujui, admin). Seluruh rute API memeriksa izin di server. | `security/rbac.js` | `security.test` RBAC |
| **A.5.16** Manajemen identitas | Akun unik per orang, status aktif/nonaktif/terkunci, tanpa akun bersama. | entitas `users` | — |
| **A.5.17** Informasi autentikasi | scrypt (N=2¹⁵, r=8, garam 16 byte); kebijakan sandi ≥ 12 karakter + kompleksitas; tolak sandi umum & yang memuat nama pengguna; riwayat 5 sandi; kedaluwarsa 90 hari; sandi sementara wajib diganti. | `security/crypto.js`, `security/auth.js` | `security.test` kebijakan sandi |
| **A.5.18** Hak akses | Tinjauan hak akses di Pusat Keamanan: akun hak istimewa, akun dorman > 90 hari, sandi kedaluwarsa, pengguna tanpa MFA. | `/api/security/overview` | — |
| **A.5.24–5.28** Insiden | Register insiden keamanan; jejak audit sebagai bukti forensik. | entitas `security_incidents` | — |
| **A.5.33** Perlindungan rekaman | Jurnal terposting, mutasi stok, dan jejak audit append-only (trigger DB). | `schema.js` | `security.test` imutabilitas |
| **A.5.34 / UU PDP** Privasi & PII | Bidang sensitif (NIK, NPWP, rekening, gaji) disamarkan bagi peran tanpa izin *Data Pribadi*; nilai tersamar tidak dapat menimpa data asli; PII tidak ditulis ke jejak audit. | `crud.mask`, `crud.redact` | `security.test` penyamaran & audit |
| **A.8.2** Hak akses istimewa | Hanya peran admin tingkat 4 yang dapat memberi peran administratif, mengubah izin & kebijakan. | `hooks.guardPrivilege` | `security.test` eskalasi |
| **A.8.3** Pembatasan akses informasi | Cakupan data per perusahaan/cabang di setiap kueri; pemeriksaan kepemilikan baris (anti-IDOR); lookup rujukan mengikuti izin modul. | `rbac.scopeWhere`, `assertInScope` | `security.test` cakupan |
| **A.8.5** Autentikasi aman | Pesan galat generik + penyamaan waktu (anti enumerasi akun); penguncian setelah 5 gagal selama 15 menit; MFA TOTP (RFC 6238) dengan anti-pemakaian ulang; rotasi sesi setelah MFA; batas sesi diam 30 menit & mutlak 10 jam; keluar otomatis di klien. | `security/auth.js`, `totp.js`, `erp-app.js` | `security.test` lockout, MFA |
| **A.8.6** Manajemen kapasitas | Pembatas laju per IP untuk masuk & API; batas ukuran badan 1 MB; batas waktu permintaan. | `http.js` | `security.test` rate limit |
| **A.8.9** Manajemen konfigurasi | Rahasia hanya dari variabel lingkungan; produksi menolak berjalan tanpa `DATA_KEY`; admin awal wajib sandi kuat; unit systemd dengan pengerasan. | `config.js`, `index.js`, `deploy/` | uji manual (lihat dok. 10) |
| **A.8.11** Penyamaran data | Lihat A.5.34. | | |
| **A.8.12** Pencegahan kebocoran data | Ekspor CSV hanya untuk yang berhak, dicatat di jejak audit, dinetralkan dari injeksi formula; `Cache-Control: no-store` pada API; galat internal tanpa jejak tumpukan. | `routes.js`, `http.js` | `security.test` CSV |
| **A.8.13** Cadangan | `VACUUM INTO` → terenkripsi AES-256-GCM + checksum SHA-256 + retensi; alat pemulihan memverifikasi checksum. | `lib/backup.js`, `tools/` | `security.test` cadangan |
| **A.8.15** Pencatatan log | Jejak audit append-only berantai hash SHA-256 untuk: masuk/keluar/gagal, perubahan data (before/after), aksi alur kerja, ekspor, pengaturan, izin, verifikasi. Verifikasi integritas dari UI. | `security/audit.js` | `security.test` rantai audit |
| **A.8.16** Pemantauan | Log akses terstruktur JSON (tanpa data sensitif) dengan ID permintaan; Pusat Keamanan menampilkan gagal masuk & akun terkunci. | `http.logEvent` | — |
| **A.8.20–8.22** Keamanan jaringan | Aplikasi mendengarkan di loopback; TLS & HSTS di reverse proxy; pembatas laju lapis kedua di nginx. | `deploy/nginx.conf` | — |
| **A.8.23** Penyaringan web | CSP ketat (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP. | `http.SECURITY_HEADERS` | `security.test` header |
| **A.8.24** Kriptografi | scrypt untuk sandi; SHA-256 untuk token sesi tersimpan & rantai audit; AES-256-GCM untuk rahasia MFA & cadangan; token acak 256 bit. | `security/crypto.js` | `security.test` MFA terenkripsi |
| **A.8.25–8.29** Pengembangan aman | Kueri berparameter; validasi tipe/rentang/pola per bidang di server; daftar putih kolom urut & saring; tolak `__proto__`; escape HTML di seluruh klien; CSRF token + SameSite=Strict + pemeriksaan Origin; 128 uji integrasi + uji E2E. | `crud.js`, `http.js`, `web/` | `crud.test`, `security.test`, `tools/e2e.mjs` |
| **A.8.28** Pengodean aman (rantai pasok) | Nol dependensi runtime pihak ketiga. | `package.json` | — |
| **A.5.19–5.21** Hubungan pemasok | Portal pemasok/pelanggan memakai peran khusus yang hanya membuka data milik mitra tersebut (dokumen draf/internal disembunyikan; margin & HPP penawaran tidak pernah dikirim ke portal); akses portal & tanggapan penawaran oleh pelanggan teraudit; MFA tersedia untuk akun eksternal. | `extras.portal*`, `ledger/quotation.js` | `phase2.test` portal, `quotation.test` |
| **A.8.7** Perlindungan dari malware | Lampiran dibatasi tipe & ukuran, tipe diverifikasi dari isi berkas (bukan ekstensi), diunduh sebagai *attachment* dengan `nosniff`. | `extras.addAttachment` | `phase2.test` lampiran |
| **A.8.10 / A.8.24** Penyimpanan & kriptografi lampiran | Lampiran dienkripsi AES-256-GCM dengan kunci data, diverifikasi SHA-256 saat diunduh; ikut dalam cadangan terenkripsi. | `extras.*Attachment` | `phase2.test` lampiran |
| **A.5.23 / A.5.14** Layanan cloud & transfer informasi | Asisten data bekerja sepenuhnya di server sendiri — tidak ada data keuangan yang dikirim ke penyedia AI pihak ketiga. | `extras.assistant` | `phase2.test` asisten |
| **A.8.32** Manajemen perubahan | Penguncian optimistis (`row_version`) mencegah tertimpanya perubahan; seluruh perubahan teraudit; migrasi skema aditif & idempoten (data lama tidak diubah). | `crud.update` | `crud.test` konflik versi |

## Integritas data keuangan

* Trigger DB menolak `UPDATE`/`DELETE` atas jurnal terposting dan barisnya.
* Jurnal tidak seimbang, akun induk, akun nonaktif, dan periode tertutup ditolak.
* Uji otomatis memeriksa **setiap** jurnal seimbang secara total dan per cabang,
  serta sub-buku piutang, hutang, dan persediaan cocok dengan buku besar.

## Risiko sisa & rekomendasi

| Risiko sisa | Alasan / mitigasi |
| --- | --- |
| CSP mengizinkan `style-src 'unsafe-inline'` | Diperlukan untuk atribut gaya dinamis grafik; skrip tetap `'self'` saja, seluruh teks di-escape. Dapat diperketat dengan memindahkan gaya ke kelas CSS. |
| Pembatas laju dalam memori | Cukup untuk satu instans; untuk banyak instans gunakan pembatas di reverse proxy (sudah disediakan di `nginx.conf`). |
| SQLite satu berkas | Cocok untuk skala UKM–menengah; untuk ketersediaan tinggi gunakan replikasi berkas (mis. Litestream) + cadangan terenkripsi luar lokasi. |
| Kunci data di variabel lingkungan | Simpan di brankas rahasia (Vault/KMS) dan batasi akses berkas `erp.env` ke root; rotasi kunci memerlukan enkripsi ulang cadangan. |
| Penilaian ulang kurs valas belum terealisasi (unrealized) | Selisih kurs dibukukan saat pelunasan (terealisasi); revaluasi akhir periode dapat dicatat melalui jurnal manual. |
| QR MFA tidak ditampilkan | Pendaftaran memakai kunci teks/URI `otpauth://` untuk menghindari pustaka pihak ketiga. |

## Akun demo

Hanya dibuat bila `SEED_DEMO=1` (bawaan di luar produksi). Seluruh akun demo
memakai sandi `Erp#Demo2026!` — **jangan pernah dipakai di produksi**.

| Pengguna | Peran | Cakupan |
| --- | --- | --- |
| `admin` | Administrator Sistem | seluruh grup |
| `osmond` | Direksi / Direktur Keuangan (penyetuju) | seluruh grup |
| `rina.akuntan` | Staf Akuntansi | seluruh grup |
| `budi.ops` | Manajer Operasional | PT KNM |
| `sari.sales` | Staf Penjualan | PT KNM · Jakarta |
| `agus.gudang` | Staf Gudang & Produksi | PT KNM · Cikarang |
| `dewi.hr` | Staf SDM (akses data pribadi) | PT KNM |
| `yoga.kasir` | Kasir Toko | PT KNM · Medan |
| `auditor` | Auditor Internal (hanya baca) | seluruh grup |
| `portal.astra` | Portal Pelanggan | PT Astra Komponen Indonesia |
| `portal.krakatau` | Portal Pemasok | PT Krakatau Baja Niaga |
