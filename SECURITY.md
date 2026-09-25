# Kebijakan keamanan

Spesifikasi keamanan lengkap untuk implementasi ERP Enterprise ada di
[docs/11-keamanan.md](docs/11-keamanan.md). Berkas ini mengatur cara
melaporkan kerentanan dan status keamanan purwarupa.

## Melaporkan kerentanan

- Kirim laporan ke pemilik repositori lewat **GitHub Security Advisory**
  (tab *Security* → *Report a vulnerability*), bukan lewat issue publik.
- Sertakan langkah reproduksi, dampak yang diperkirakan, dan versi/commit.
- Kami menargetkan konfirmasi penerimaan dalam 3 hari kerja dan pembaruan
  status setiap 7 hari hingga selesai.
- Mohon tidak menguji terhadap data pihak lain dan tidak mengungkap kerentanan
  sebelum perbaikan tersedia.

## Status purwarupa

Purwarupa di repositori ini berjalan sepenuhnya di peramban tanpa peladen,
tanpa autentikasi, dan hanya memuat data fiktif. Karena itu:

- Purwarupa **tidak boleh** dipakai dengan data perusahaan sungguhan.
- Layar masuk (`prototype/login.html`) adalah rancangan tampilan, bukan
  mekanisme autentikasi.
- Preferensi tampilan (tema, konteks cabang/periode, tata letak widget)
  disimpan di `localStorage` peramban dan tidak berisi data sensitif.
- Bundel `dist/prototipe.html` tidak memuat pustaka pihak ketiga; satu-satunya
  dependensi pengembangan adalah Playwright untuk uji asap.

## Versi yang didukung

| Versi | Status |
| --- | --- |
| Purwarupa (cabang `main`) | Perbaikan bila memengaruhi rancangan keamanan |
| Implementasi produksi | Mengikuti dok. 11 §13 sejak rilis pertama |
