# 13 — Rencana pengembangan

Urutan pembangunan dari purwarupa ke sistem produksi. Prinsipnya: **buku
besar dan keamanan dibangun pertama**, modul operasional menyusul dan
langsung terhubung ke mesin posting — sehingga sejak sprint awal laporan
keuangan sudah benar untuk apa pun yang ada.

Asumsi tim: 1 pemimpin teknis, 3 pengembang backend, 2 pengembang frontend,
1 QA, 1 analis bisnis/akuntan paruh waktu, 1 DevOps paruh waktu. Sprint dua
minggu.

---

## Fase 0 — Persiapan (2 minggu)

- Konfirmasi keputusan **[KEPUTUSAN]** dok. 08 §10.
- Monorepo, CI dasar (lint, uji, pemindaian), Docker Compose, IdP dev.
- Pindahkan `tokens.css` dan komponen inti ke `packages/ui` sebagai
  komponen Vue 3; katalog komponen dengan Histoire.
- Skema awal: identitas, organisasi, bagan akun, periode, `audit_log`, RLS.
- Kebijakan keamanan dasar aktif: K-01…K-07, K-50…K-54, K-60…K-65.

**Keluaran:** login OIDC, halaman kosong dengan rail/konteks, pipeline hijau.

## Fase 1 — Inti keuangan (3 sprint)

| Sprint | Isi |
| --- | --- |
| 1 | Bagan akun, cabang, periode; jurnal memorial (buat, validasi, posting dengan SoD, tolak, balik); imutabilitas & trigger; kartu buku besar. |
| 2 | Mesin posting (outbox + worker + `posting_rules`), saldo harian materialized, neraca saldo, laba rugi, neraca per cabang. |
| 3 | Konsolidasi & eliminasi, halaman Integrasi & rekonsiliasi (kerangka 11 pemeriksaan), tutup/buka periode dengan checklist, ekspor PDF. |

**Kriteria selesai:** golden dataset purwarupa (Agu 2026, TA 2026) menghasilkan
neraca saldo, laba rugi, dan neraca yang identik di sistem produksi.

## Fase 2 — Penjualan, pembelian, kas (3 sprint)

| Sprint | Isi |
| --- | --- |
| 4 | Pelanggan, produk, pesanan penjualan + persetujuan plafon, faktur → posting, penerimaan kas, umur piutang. |
| 5 | Pemasok, PR/PO, penerimaan barang, tagihan pemasok (barang/jasa) → posting, pembayaran (dua penyetuju, cooling period rekening K-25/K-26), umur hutang. |
| 6 | Kas & bank (rekening per cabang, rekonsiliasi bank impor CSV/MT940), setoran kas cabang ↔ pusat, setoran pajak, dasbor KPI dari buku besar. |

## Fase 3 — Persediaan, produksi, POS (3 sprint)

| Sprint | Isi |
| --- | --- |
| 7 | Kartu stok per cabang/gudang, mutasi (penerimaan, pengiriman, penyesuaian) → posting, biaya rata-rata. |
| 8 | Transfer antar cabang (dua jurnal RK), perintah kerja, BOM sederhana, pemakaian & hasil produksi → WIP → barang jadi. |
| 9 | POS: shift, transaksi, tutup shift → posting; rekonsiliasi kas kasir. |

## Fase 4 — SDM, aset, dokumen, alur kerja (2 sprint)

| Sprint | Isi |
| --- | --- |
| 10 | Karyawan (kolom terenkripsi K-41), kehadiran, penggajian → posting & pembayaran terpusat; aset & penyusutan bulanan; pemeliharaan → posting. |
| 11 | Repositori dokumen (K-34), desainer alur persetujuan berbasis data, notifikasi, kepatuhan (SoD, rantai hash). |

## Fase 5 — Pengerasan & peluncuran (2 sprint)

- Uji kinerja (dok. 08 §9), uji pemulihan cadangan, uji penetrasi pihak
  ketiga, perbaikan temuan.
- Migrasi data pelanggan pertama (dok. 09 §8), pelatihan, UAT per cabang.
- Peluncuran bertahap: satu cabang non-pabrik dahulu, lalu seluruh cabang,
  dengan periode paralel satu bulan terhadap sistem lama.

**Total indikatif:** 13 sprint ≈ 6,5 bulan + fase 0.

---

## Yang sengaja ditunda ke rilis berikutnya

- Laporan arus kas metode tidak langsung; anggaran per cabang penuh.
- Multi-perusahaan dalam satu grup (konsolidasi antar entitas hukum,
  penjabaran kurs).
- Analitik/BI lanjutan dan Balanced Scorecard yang terhubung ke gudang data.
- AI Copilot (memerlukan tinjauan privasi tersendiri sebelum data keuangan
  dikirim ke layanan model apa pun).
- Portal pelanggan/pemasok, e-faktur DJP, integrasi bank host-to-host.

---

## Risiko utama dan mitigasinya

| Risiko | Mitigasi |
| --- | --- |
| Aturan posting berbeda dari kebijakan akuntansi perusahaan | Akuntan meninjau `posting_rules` di Fase 1; golden dataset menjadi kontrak. |
| Kinerja laporan pada volume besar | Saldo harian materialized sejak awal; uji k6 sebelum Fase 5. |
| Kebocoran lintas cabang karena kueri lupa saring | RLS sebagai jaring kedua; uji otorisasi lintas cabang wajib di setiap PR. |
| Migrasi data lama tidak seimbang | Migrasi ditolak bila 11 rekonsiliasi tidak `ok`; saldo awal diaudit. |
| Perubahan cakupan di tengah jalan | Dok. 07 sebagai baseline; perubahan lewat tiket berlabel `scope-change` yang disetujui pemilik produk. |
| Ketergantungan pada satu orang untuk domain akuntansi | Aturan posting sebagai data + dokumentasi dok. 09 §4; pasangan pengembang–akuntan di Fase 1. |

---

## Peran dan tanggung jawab

| Peran | Tanggung jawab |
| --- | --- |
| Pemilik produk | Prioritas, penerimaan, keputusan cakupan |
| Pemimpin teknis | Arsitektur (dok. 08), tinjauan PR inti, kualitas |
| Pemilik keamanan | Dok. 11, checklist rilis, respons insiden |
| Akuntan/analis | Aturan posting, bagan akun, UAT laporan |
| QA | Rencana uji dok. 12, E2E, golden dataset |
| DevOps | Infrastruktur, cadangan, pemantauan, pemindaian |
