/* ==========================================================================
   ERP Enterprise — Purwarupa antarmuka
   --------------------------------------------------------------------------
   Tiga arketipe halaman:
     Ikhtisar (dasbor)  — ringkasan sebelum rincian
     Daftar   (register)— saring, urutkan, pilih, buka
     Rekaman  (laci)    — rincian + baris + linimasa + tindakan
   Purwarupa; data disimpan di memori dan hilang saat halaman dimuat ulang.
   ========================================================================== */

(() => {
  'use strict';

  /* ====================================================================== */
  /* Ikon                                                                    */
  /* ====================================================================== */
  const ICONS = {
    grid: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
    cart: '<circle cx="6.2" cy="13.2" r="1.1"/><circle cx="12" cy="13.2" r="1.1"/><path d="M1.4 2h2.2l1.9 8.1h7.3l1.6-5.9H4.2"/>',
    invoice: '<path d="M3.6 1.6h8.8v12.8l-2.2-1.3-2.2 1.3-2.2-1.3-2.2 1.3z"/><path d="M6 5.2h4M6 8.2h4"/>',
    building: '<path d="M2.6 14.2V3.4l6-1.8v12.6z"/><path d="M8.6 6.2h4.8v8"/><path d="M4.6 5.6h2M4.6 8.2h2M4.6 10.8h2M10.6 8.8h1M10.6 11.4h1"/>',
    truck: '<path d="M1.4 3.6h8.2v7.2H1.4z"/><path d="M9.6 6.2h2.6l2.4 2.6v2H9.6z"/><circle cx="4.6" cy="12.6" r="1.2"/><circle cx="11.6" cy="12.6" r="1.2"/>',
    handshake: '<path d="M5.6 3.4V2.2a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1v1.2"/><rect x="1.5" y="3.4" width="13" height="9.4" rx="1.4"/><path d="M1.5 7.6h13"/>',
    boxes: '<path d="M8 1.6 14 4.6 8 7.6 2 4.6z"/><path d="M2 4.6v6.8L8 14.4l6-3V4.6"/><path d="M8 7.6v6.8"/>',
    transfer: '<path d="M2.2 5.2h10M9.4 2.6 12.2 5.2 9.4 7.8"/><path d="M13.8 10.8h-10M6.6 8.2 3.8 10.8l2.8 2.6"/>',
    factory: '<path d="M1.6 14.4V7l4.2 2.6V7L10 9.6V3.4h4v11z"/><path d="M4.4 11.8h1.2M8.2 11.8h1.2M11.8 11.8h1"/>',
    wallet: '<rect x="1.5" y="3.4" width="13" height="9.6" rx="1.5"/><path d="M1.5 6.6h13"/><circle cx="11.4" cy="9.9" r="1"/>',
    ledger: '<path d="M4 1.6h8.4a1 1 0 0 1 1 1v11.8H4a1.6 1.6 0 0 1 0-3.2h9.4"/><path d="M6.8 5.2h4M6.8 7.8h4"/>',
    users: '<circle cx="6" cy="5" r="2.5"/><path d="M1.6 13.6c0-2.5 2-4.1 4.4-4.1s4.4 1.6 4.4 4.1"/><path d="M11 3.3a2.5 2.5 0 0 1 0 4.4"/><path d="M12.3 10c1.4.5 2.2 1.8 2.2 3.6"/>',
    shield: '<path d="M8 1.5 13.4 3.4v4c0 3.4-2.2 6-5.4 7-3.2-1-5.4-3.6-5.4-7v-4z"/><path d="m5.8 8 1.6 1.6 3-3.2"/>',
    gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.6v1.7M8 12.7v1.7M14.4 8h-1.7M3.3 8H1.6M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2M12.5 12.5l-1.2-1.2M4.7 4.7 3.5 3.5"/>',
    palette: '<path d="M8 1.6a6.4 6.4 0 0 0 0 12.8c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1a1.5 1.5 0 0 1 1.1-2.5h1.3A3.4 3.4 0 0 0 15 5.9C14.5 3.4 11.6 1.6 8 1.6z"/><circle cx="5.1" cy="6" r=".9"/><circle cx="8" cy="4.5" r=".9"/><circle cx="10.9" cy="6" r=".9"/>',
    search: '<circle cx="7" cy="7" r="4.6"/><path d="m10.4 10.4 3.6 3.6"/>',
    bell: '<path d="M4.2 6.6a3.8 3.8 0 0 1 7.6 0c0 2.9 1 3.9 1 3.9H3.2s1-1 1-3.9z"/><path d="M6.4 12.9a1.7 1.7 0 0 0 3.2 0"/>',
    'chevron-down': '<path d="m4 6.2 4 4 4-4"/>',
    'chevron-up': '<path d="m4 9.8 4-4 4 4"/>',
    'chevron-right': '<path d="m6.2 4 4 4-4 4"/>',
    'chevron-left': '<path d="m9.8 4-4 4 4 4"/>',
    plus: '<path d="M8 3.2v9.6M3.2 8h9.6"/>',
    x: '<path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6"/>',
    check: '<path d="m3.6 8.4 3 3 5.8-6.8"/>',
    minus: '<path d="M4 8h8"/>',
    filter: '<path d="M2 3.4h12l-4.6 5.3v4.4l-2.8 1.5V8.7z"/>',
    alert: '<path d="M8 2.2 15 13.6H1z"/><path d="M8 6.6v3.2"/><circle cx="8" cy="11.8" r=".6" fill="currentColor" stroke="none"/>',
    download: '<path d="M8 2.2v8.2M4.6 7 8 10.4 11.4 7"/><path d="M2.4 13.6h11.2"/>',
    more: '<circle cx="3.6" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="12.4" cy="8" r="1" fill="currentColor" stroke="none"/>',
    panel: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11"/>',
    sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.2v1.5M8 13.3v1.5M14.8 8h-1.5M2.7 8H1.2M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1M12.8 12.8l-1.1-1.1M4.3 4.3 3.2 3.2"/>',
    moon: '<path d="M13.4 9.7A5.8 5.8 0 0 1 6.3 2.6a5.8 5.8 0 1 0 7.1 7.1z"/>',
    monitor: '<rect x="1.5" y="2.6" width="13" height="8.8" rx="1.4"/><path d="M5.6 14.2h4.8M8 11.4v2.8"/>',
    'arrow-up': '<path d="M8 13.2V3.4M4.2 7.2 8 3.4l3.8 3.8"/>',
    'arrow-down': '<path d="M8 2.8v9.8M4.2 8.8 8 12.6l3.8-3.8"/>',
    'arrow-right': '<path d="M2.8 8h10.4M9.4 4.2 13.2 8l-3.8 3.8"/>',
    clock: '<circle cx="8" cy="8" r="6.3"/><path d="M8 4.3V8l2.6 1.6"/>',
    edit: '<path d="M11 2.2 13.8 5l-8 8H3v-2.8z"/>',
    print: '<path d="M4.6 6V2.2h6.8V6"/><rect x="1.5" y="6" width="13" height="5.4" rx="1.2"/><path d="M4.6 9.6h6.8v4.8H4.6z"/>',
    eye: '<path d="M1.2 8S3.8 3.6 8 3.6 14.8 8 14.8 8 12.2 12.4 8 12.4 1.2 8 1.2 8z"/><circle cx="8" cy="8" r="1.9"/>',
    external: '<path d="M9.2 2.4h4.4v4.4"/><path d="M13.6 2.4 7.2 8.8"/><path d="M12 9.6v3.4a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V5.4a1 1 0 0 1 1-1h3.4"/>',
    logout: '<path d="M6.2 2.4H3.4a1 1 0 0 0-1 1v9.2a1 1 0 0 0 1 1h2.8"/><path d="M10 5 13 8l-3 3"/><path d="M13 8H6.4"/>',
    /* Ikon baru untuk modul tambahan */
    target: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3.6"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>',
    quote: '<path d="M3 4.6h10a1 1 0 0 1 1 1v6.8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5.6a1 1 0 0 1 1-1z"/><path d="M5 2v2.6M11 2v2.6M5 8.4h6M5 10.8h3"/>',
    barcode: '<path d="M2 3.4v9.2M5 3.4v9.2M7 3.4v9.2M8.6 3.4v9.2M11 3.4v9.2M14 3.4v9.2M3.4 3.4v9.2" stroke-width="0.9"/>',
    clipboard: '<path d="M5.6 2.4h4.8v2H5.6z"/><path d="M4.2 3.4H3.4a1 1 0 0 0-1 1v9.2a1 1 0 0 0 1 1h9.2a1 1 0 0 0 1-1V4.4a1 1 0 0 0-1-1h-.8"/><path d="M5.6 8h4.8M5.6 10.6h3"/>',
    gantt: '<path d="M2 3.2h12M2 8h12M2 12.8h12"/><rect x="4" y="4.4" width="5" height="2.4" rx=".6"/><rect x="6" y="9.2" width="5.5" height="2.4" rx=".6"/>',
    piechart: '<path d="M8 2.4A5.6 5.6 0 1 1 2.4 8H8V2.4z"/><path d="M10 1.8a5.6 5.6 0 0 1 4.2 5.4H10V1.8z"/>',
    banknote: '<rect x="1.5" y="4" width="13" height="8" rx="1.4"/><circle cx="8" cy="8" r="2"/><path d="M4.2 4v8M11.8 4v8"/>',
    landmark: '<path d="M2 13.6h12M3.4 6.2h9.2L8 2.2z"/><path d="M4.2 6.2v5.6M7 6.2v5.6M9 6.2v5.6M11.8 6.2v5.6"/><path d="M2.6 11.8h10.8"/>',
    wrench: '<path d="M4.2 10.8 10.8 4.2a2.6 2.6 0 0 1 3.5.1l-2 2 .5 1.4 1.4.5 2-.1a2.6 2.6 0 0 1-.1 2.3l-6.6 6.6a2 2 0 0 1-2.8 0l-2.5-2.5a2 2 0 0 1 0-2.8z" d="M5.2 11.4l-2.8 2.8"/>',
    folder: '<path d="M2 4.6V12a1.4 1.4 0 0 0 1.4 1.4h9.2A1.4 1.4 0 0 0 14 12V6.8a1.4 1.4 0 0 0-1.4-1.4H8L6.4 3.6H3.4A1.4 1.4 0 0 0 2 5z"/>',
    scroll: '<path d="M12 2.4H5.6A1.6 1.6 0 0 0 4 4v8a1.6 1.6 0 0 0 1.6 1.6h8V4a1.6 1.6 0 0 0-1.6-1.6z"/><path d="M4 12a1.6 1.6 0 0 1-1.6-1.6V4.8"/><path d="M7 6h3.6M7 8.4h3.6M7 10.8h2"/>',
    sparkle: '<path d="M8 1.4l1.2 4.2L13.4 6.8 9.2 8l-1.2 4.2L6.8 8 2.6 6.8l4.2-1.2z"/><path d="M12 11l.5 1.6 1.5.4-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.4z"/>',
    send: '<path d="M14.4 1.6 6.6 9.4"/><path d="M14.4 1.6l-4.4 12.8-2.6-6.2-6.2-2.6z"/>',
    /* Ikon modul tambahan */
    inbox: '<path d="M2.4 2.4h11.2v11.2H2.4z"/><path d="M2.4 9.6h3.6l1.2 2h1.6l1.2-2h3.6"/>',
    database: '<ellipse cx="8" cy="4" rx="5.6" ry="2.2"/><path d="M2.4 4v8c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2V4"/><path d="M13.6 8c0 1.2-2.5 2.2-5.6 2.2S2.4 9.2 2.4 8"/>',
    scale: '<path d="M8 2v12M3 5l5-3 5 3"/><path d="M1.6 9.4 3 5l1.4 4.4a2.4 2.4 0 0 1-2.8 0z"/><path d="M11.6 9.4 13 5l1.4 4.4a2.4 2.4 0 0 1-2.8 0z"/>',
    link: '<path d="M7.2 8.8a3.2 3.2 0 0 0 4.5.5l1.8-1.8a3.2 3.2 0 0 0-4.5-4.5L7.8 4.2"/><path d="M8.8 7.2a3.2 3.2 0 0 0-4.5-.5L2.5 8.5a3.2 3.2 0 0 0 4.5 4.5l1.2-1.2"/>',
    'credit-card': '<rect x="1.5" y="3.4" width="13" height="9.2" rx="1.4"/><path d="M1.5 6.6h13M1.5 9h4"/>',
    vault: '<rect x="2" y="2.4" width="12" height="11.2" rx="1.4"/><circle cx="8" cy="8" r="2.6"/><path d="M8 5.4v5.2M5.4 8h5.2"/><path d="M2 5.6h1M2 10.4h1M13 5.6h1M13 10.4h1"/>',
    calendar: '<rect x="2.4" y="3" width="11.2" height="10.6" rx="1.4"/><path d="M5.2 1.4v3.2M10.8 1.4v3.2M2.4 6.6h11.2"/><path d="M5.2 9h1.4M9.4 9h1.4M5.2 11.4h1.4"/>',
    workflow: '<circle cx="3.4" cy="4.4" r="1.8"/><circle cx="12.6" cy="4.4" r="1.8"/><circle cx="8" cy="12" r="1.8"/><path d="M5.2 4.4h5.6M4.4 6 8 10.2M11.6 6 8 10.2"/>',
    'bar-chart': '<path d="M2 14h12"/><rect x="3.6" y="6" width="2" height="8" rx=".4"/><rect x="7" y="3" width="2" height="11" rx=".4"/><rect x="10.4" y="8" width="2" height="6" rx=".4"/>',
    'file-check': '<path d="M4 1.6h5.6L13 5v8.4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.6a1 1 0 0 1 1-1z"/><path d="M9.6 1.6V5H13"/><path d="M6.4 9.4l1.4 1.4 2.8-2.8"/>',
  };

  const icon = (name, cls = '') =>
    `<svg class="${cls}" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;

  /* ====================================================================== */
  /* Utilitas                                                                */
  /* ====================================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const STATUS = {
    draf: { label: 'Draf' },
    menunggu: { label: 'Menunggu persetujuan', tone: 'warn' },
    disetujui: { label: 'Disetujui', tone: 'accent' },
    dikirim: { label: 'Dikirim', tone: 'info' },
    selesai: { label: 'Selesai', tone: 'ok' },
    batal: { label: 'Batal', tone: 'danger' },
    'belum-dibayar': { label: 'Belum dibayar' },
    sebagian: { label: 'Dibayar sebagian', tone: 'info' },
    lunas: { label: 'Lunas', tone: 'ok' },
    'jatuh-tempo': { label: 'Jatuh tempo', tone: 'danger' },
    'dikirim-pemasok': { label: 'Dikirim ke pemasok', tone: 'info' },
    'diterima-sebagian': { label: 'Diterima sebagian', tone: 'warn' },
    diposting: { label: 'Diposting', tone: 'ok' },
    ditolak: { label: 'Ditolak', tone: 'danger' },
    aktif: { label: 'Aktif', tone: 'ok' },
    nonaktif: { label: 'Nonaktif' },
    ditahan: { label: 'Ditahan', tone: 'danger' },
    pantau: { label: 'Dipantau', tone: 'warn' },
    tetap: { label: 'Tetap', tone: 'ok' },
    kontrak: { label: 'Kontrak', tone: 'info' },
    magang: { label: 'Magang' },
    aman: { label: 'Aman', tone: 'ok' },
    menipis: { label: 'Menipis', tone: 'warn' },
    habis: { label: 'Habis', tone: 'danger' },
    /* Status modul baru */
    terkirim: { label: 'Terkirim', tone: 'info' },
    diterima: { label: 'Diterima', tone: 'ok' },
    kedaluwarsa: { label: 'Kedaluwarsa', tone: 'danger' },
    tinggi: { label: 'Tinggi', tone: 'danger' },
    sedang: { label: 'Sedang', tone: 'warn' },
    rendah: { label: 'Rendah' },
    dijadwalkan: { label: 'Dijadwalkan', tone: 'info' },
    berlaku: { label: 'Berlaku', tone: 'ok' },
    dibayar: { label: 'Dibayar', tone: 'ok' },
    diproses: { label: 'Diproses', tone: 'info' },
    dihapuskan: { label: 'Dihapuskan' },
    berjalan: { label: 'Berjalan', tone: 'accent' },
    perencanaan: { label: 'Perencanaan' },
    hijau: { label: 'Hijau', tone: 'ok' },
    kuning: { label: 'Kuning', tone: 'warn' },
    merah: { label: 'Merah', tone: 'danger' },
    void: { label: 'Void', tone: 'danger' },
    preventif: { label: 'Preventif', tone: 'info' },
    korektif: { label: 'Korektif', tone: 'warn' },
    /* Status modul tambahan */
    hadir: { label: 'Hadir', tone: 'ok' },
    cuti: { label: 'Cuti', tone: 'info' },
    sakit: { label: 'Sakit', tone: 'warn' },
    terlambat: { label: 'Terlambat', tone: 'danger' },
    alpha: { label: 'Alpha', tone: 'danger' },
    terbuka: { label: 'Terbuka', tone: 'accent' },
    evaluasi: { label: 'Evaluasi', tone: 'warn' },
    transit: { label: 'Transit', tone: 'info' },
    patuh: { label: 'Patuh', tone: 'ok' },
    peninjauan: { label: 'Peninjauan', tone: 'warn' },
    'tidak-patuh': { label: 'Tidak Patuh', tone: 'danger' },
  };

  /** Status selalu ikon + teks — tidak pernah warna saja. */
  const pill = (key) => {
    const s = STATUS[key] || { label: key };
    const tone = s.tone ? ` data-tone="${s.tone}"` : '';
    return `<span class="pill"${tone}><i class="pill-dot"></i>${esc(s.label)}</span>`;
  };

  const stockStatus = (r) => (r.onHand === 0 ? 'habis' : r.onHand < r.min ? 'menipis' : 'aman');

  /* ====================================================================== */
  /* Keadaan aplikasi                                                        */
  /* ====================================================================== */
  const state = {
    view: 'dasbor',
    theme: 'system',
    railCollapsed: false,
    reg: {},            // keadaan per register: {q, status, sort, page, selected}
    chartView: { tren: 'grafik', mix: 'grafik' },
    boardFilter: 'semua',
    overlay: null,      // {kind, ...}
    lastFocus: null,
    toastSeq: 0,
    aiCopilotOpen: false,
    dashEditMode: false,
    dashWidgets: null,
  };

  const regState = (id) => (state.reg[id] ||= {
    q: '', status: 'semua', sort: null, page: 1, selected: new Set(),
  });

  /* ====================================================================== */
  /* Widget dashboard                                                        */
  /* ====================================================================== */
  const DEFAULT_WIDGETS = [
    { id: 'w-kpi', type: 'kpi', label: 'Indikator Utama', w: 12, h: 2 },
    { id: 'w-revenue', type: 'revenue', label: 'Pendapatan vs Target', w: 8, h: 5 },
    { id: 'w-approvals', type: 'approvals', label: 'Menunggu Persetujuan', w: 4, h: 5 },
    { id: 'w-inventory', type: 'inventory', label: 'Komposisi Persediaan', w: 6, h: 5 },
    { id: 'w-aging', type: 'aging', label: 'Umur Piutang', w: 6, h: 5 },
    { id: 'w-stock', type: 'stock-alerts', label: 'Stok Kritis', w: 6, h: 4 },
    { id: 'w-activity', type: 'activity', label: 'Aktivitas Hari Ini', w: 6, h: 4 },
  ];

  const WIDGET_CATALOG = [
    { type: 'kpi', label: 'Indikator Utama (KPI)', desc: '4 kartu metrik ringkasan', icon: 'grid', defaultW: 12, defaultH: 2 },
    { type: 'revenue', label: 'Pendapatan vs Target', desc: 'Grafik garis tren 12 bulan', icon: 'bar-chart', defaultW: 8, defaultH: 5 },
    { type: 'approvals', label: 'Menunggu Persetujuan', desc: 'Daftar dokumen menunggu', icon: 'inbox', defaultW: 4, defaultH: 5 },
    { type: 'inventory', label: 'Komposisi Persediaan', desc: 'Grafik komposisi nilai stok', icon: 'boxes', defaultW: 6, defaultH: 5 },
    { type: 'aging', label: 'Umur Piutang', desc: 'Grafik kolom aging AR', icon: 'clock', defaultW: 6, defaultH: 5 },
    { type: 'stock-alerts', label: 'Stok Kritis', desc: 'Barang di bawah minimum', icon: 'alert', defaultW: 6, defaultH: 4 },
    { type: 'activity', label: 'Aktivitas Hari Ini', desc: 'Jejak audit ringkas', icon: 'scroll', defaultW: 6, defaultH: 4 },
    { type: 'ai-briefing', label: 'AI Briefing', desc: 'Ringkasan harian AI', icon: 'sparkle', defaultW: 12, defaultH: 3 },
  ];

  function getWidgets() {
    if (!state.dashWidgets) {
      try {
        const saved = localStorage.getItem('erp-dash-widgets');
        if (saved) state.dashWidgets = JSON.parse(saved);
      } catch { /* sandbox */ }
      if (!state.dashWidgets) state.dashWidgets = DEFAULT_WIDGETS.map(w => ({...w}));
    }
    return state.dashWidgets;
  }

  function saveWidgets() {
    try { localStorage.setItem('erp-dash-widgets', JSON.stringify(state.dashWidgets)); } catch { /* sandbox */ }
  }

  /* ====================================================================== */
  /* Tema                                                                    */
  /* ====================================================================== */
  function applyTheme() {
    const root = document.documentElement;
    if (state.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.theme);
    try { localStorage.setItem('erp-theme', state.theme); } catch { /* sandbox */ }
    requestAnimationFrame(() => Charts.redrawAll());
  }

  function initTheme() {
    try {
      const saved = localStorage.getItem('erp-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') state.theme = saved;
    } catch { /* sandbox */ }
    applyTheme();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.theme === 'system') requestAnimationFrame(() => Charts.redrawAll());
    });
  }

  /* ====================================================================== */
  /* Konfigurasi register                                                    */
  /* ====================================================================== */
  const money = (v) => `<span class="num">${FMT.rpCompact(v)}</span>`;

  const REGISTERS = {
    'pesanan-penjualan': {
      title: 'Pesanan Penjualan',
      sub: 'Seluruh pesanan pada periode berjalan, termasuk yang menunggu persetujuan Anda.',
      rows: () => DATA.salesOrders,
      key: 'id',
      search: ['id', 'customer', 'pic'],
      statusKey: 'status',
      statuses: ['draf', 'menunggu', 'disetujui', 'dikirim', 'selesai', 'batal'],
      selectable: true,
      primary: { label: 'Pesanan baru', action: 'new-so' },
      sort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Nomor', cls: 'code cell-strong' },
        { key: 'date', label: 'Tanggal', render: (r) => `<span class="num">${FMT.date(r.date)}</span>` },
        { key: 'customer', label: 'Pelanggan', render: (r) => `<span class="cell-strong">${esc(r.customer)}</span><span class="cell-sub">${esc(r.channel)}</span>` },
        { key: 'pic', label: 'Penanggung jawab' },
        { key: 'amount', label: 'Nilai', align: 'r', render: (r) => money(r.amount) },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
        { key: 'due', label: 'Jatuh tempo', render: (r) => `<span class="num">${FMT.date(r.due)}</span>` },
      ],
    },

    faktur: {
      title: 'Faktur Penjualan',
      sub: 'Faktur terbit beserta sisa tagihan dan keterlambatannya.',
      rows: () => DATA.invoices,
      key: 'id',
      search: ['id', 'customer'],
      statusKey: 'status',
      statuses: ['belum-dibayar', 'sebagian', 'lunas', 'jatuh-tempo'],
      selectable: true,
      primary: { label: 'Faktur baru', action: 'demo' },
      sort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Nomor', cls: 'code cell-strong' },
        { key: 'date', label: 'Tanggal', render: (r) => `<span class="num">${FMT.date(r.date)}</span>` },
        { key: 'customer', label: 'Pelanggan', cls: 'cell-strong' },
        { key: 'amount', label: 'Nilai', align: 'r', render: (r) => money(r.amount) },
        { key: 'sisa', label: 'Sisa tagihan', align: 'r', value: (r) => r.amount - r.paid, render: (r) => money(r.amount - r.paid) },
        { key: 'dueDate', label: 'Jatuh tempo', render: (r) => `<span class="num">${FMT.date(r.dueDate)}</span>${r.overdue ? `<span class="cell-sub neg">Lewat ${r.overdue} hari</span>` : ''}` },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    pelanggan: {
      title: 'Pelanggan',
      sub: 'Data induk pelanggan, termin pembayaran, dan pemakaian plafon kredit.',
      rows: () => DATA.customers,
      key: 'id',
      search: ['id', 'name', 'city', 'pic'],
      statusKey: 'status',
      statuses: ['aktif', 'ditahan', 'nonaktif'],
      primary: { label: 'Pelanggan baru', action: 'demo' },
      sort: { key: 'name', dir: 'asc' },
      columns: [
        { key: 'id', label: 'Kode', cls: 'code' },
        { key: 'name', label: 'Nama', render: (r) => `<span class="cell-strong">${esc(r.name)}</span><span class="cell-sub">${esc(r.pic)} · ${esc(r.city)}</span>` },
        { key: 'segment', label: 'Segmen' },
        { key: 'terms', label: 'Termin', cls: 'num' },
        {
          key: 'used', label: 'Pemakaian plafon', align: 'r',
          render: (r) => {
            const share = (r.used / r.limit) * 100;
            const tone = share >= 95 ? 'danger' : share >= 80 ? 'warn' : '';
            return `<span class="meter"><span class="meter-track"><span class="meter-fill"${tone ? ` data-tone="${tone}"` : ''} style="width:${Math.min(100, share)}%"></span></span><span class="meter-val">${FMT.pct(share, 0)}</span></span>`;
          },
        },
        { key: 'limit', label: 'Plafon', align: 'r', render: (r) => money(r.limit) },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    'pesanan-pembelian': {
      title: 'Pesanan Pembelian',
      sub: 'Pesanan ke pemasok beserta perkiraan tanggal tiba.',
      rows: () => DATA.purchaseOrders,
      key: 'id',
      search: ['id', 'supplier', 'buyer'],
      statusKey: 'status',
      statuses: ['draf', 'menunggu', 'dikirim-pemasok', 'diterima-sebagian', 'selesai'],
      selectable: true,
      primary: { label: 'Pesanan baru', action: 'demo' },
      sort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Nomor', cls: 'code cell-strong' },
        { key: 'date', label: 'Tanggal', render: (r) => `<span class="num">${FMT.date(r.date)}</span>` },
        { key: 'supplier', label: 'Pemasok', cls: 'cell-strong' },
        { key: 'buyer', label: 'Pembeli' },
        { key: 'amount', label: 'Nilai', align: 'r', render: (r) => money(r.amount) },
        { key: 'eta', label: 'Perkiraan tiba', render: (r) => `<span class="num">${FMT.date(r.eta)}</span>` },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    pemasok: {
      title: 'Pemasok',
      sub: 'Kinerja pengiriman tepat waktu dan waktu tunggu tiap pemasok.',
      rows: () => DATA.suppliers,
      key: 'id',
      search: ['id', 'name', 'category', 'city'],
      statusKey: 'status',
      statuses: ['aktif', 'pantau'],
      primary: { label: 'Pemasok baru', action: 'demo' },
      sort: { key: 'otd', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Kode', cls: 'code' },
        { key: 'name', label: 'Nama', render: (r) => `<span class="cell-strong">${esc(r.name)}</span><span class="cell-sub">${esc(r.city)}</span>` },
        { key: 'category', label: 'Kategori' },
        { key: 'terms', label: 'Termin', cls: 'num' },
        { key: 'lead', label: 'Waktu tunggu', align: 'r', render: (r) => `<span class="num">${r.lead} hari</span>` },
        {
          key: 'otd', label: 'Tepat waktu', align: 'r',
          render: (r) => `<span class="num${r.otd < 90 ? ' neg' : ''}">${FMT.pct(r.otd)}</span>`,
        },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    stok: {
      title: 'Stok Barang',
      sub: 'Posisi stok terhadap batas minimum, beserta nilai persediaannya.',
      rows: () => DATA.stockItems.map((r) => ({ ...r, status: stockStatus(r), nilai: r.onHand * r.cost })),
      key: 'sku',
      search: ['sku', 'name', 'category', 'wh'],
      statusKey: 'status',
      statuses: ['aman', 'menipis', 'habis'],
      selectable: true,
      primary: { label: 'Penyesuaian stok', action: 'demo' },
      sort: { key: 'status', dir: 'asc' },
      columns: [
        { key: 'sku', label: 'SKU', cls: 'code cell-strong' },
        { key: 'name', label: 'Nama barang', render: (r) => `<span class="cell-strong">${esc(r.name)}</span><span class="cell-sub">${esc(r.category)} · ${esc(r.wh)}</span>` },
        {
          key: 'onHand', label: 'Posisi stok', align: 'r',
          render: (r) => {
            const tone = r.onHand === 0 ? 'danger' : r.onHand < r.min ? 'warn' : '';
            const share = Math.min(100, (r.onHand / (r.max || 1)) * 100);
            return `<span class="meter"><span class="meter-track"><span class="meter-fill"${tone ? ` data-tone="${tone}"` : ''} style="width:${share}%"></span></span><span class="meter-val">${FMT.int(r.onHand)}</span></span>`;
          },
        },
        { key: 'min', label: 'Minimum', align: 'r', render: (r) => `<span class="num muted">${FMT.int(r.min)} ${esc(r.unit)}</span>` },
        { key: 'cost', label: 'Harga pokok', align: 'r', render: (r) => money(r.cost) },
        { key: 'nilai', label: 'Nilai persediaan', align: 'r', render: (r) => money(r.nilai) },
        {
          /* Urutan bawaan menaruh masalah lebih dahulu, bukan abjad status. */
          key: 'status', label: 'Status',
          value: (r) => ({ habis: 0, menipis: 1, aman: 2 }[r.status]),
          render: (r) => pill(r.status),
        },
      ],
    },

    mutasi: {
      title: 'Mutasi Stok',
      sub: 'Setiap pergerakan barang masuk, keluar, transfer, dan penyesuaian.',
      rows: () => DATA.stockMoves,
      key: 'id',
      search: ['id', 'sku', 'name', 'type', 'ref'],
      primary: { label: 'Catat mutasi', action: 'demo' },
      sort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Nomor', cls: 'code' },
        { key: 'date', label: 'Tanggal', render: (r) => `<span class="num">${FMT.date(r.date)}</span>` },
        { key: 'name', label: 'Barang', render: (r) => `<span class="cell-strong">${esc(r.name)}</span><span class="cell-sub code">${esc(r.sku)}</span>` },
        { key: 'type', label: 'Jenis' },
        { key: 'wh', label: 'Gudang' },
        {
          key: 'qty', label: 'Kuantitas', align: 'r',
          render: (r) => `<span class="num ${r.qty > 0 ? 'pos' : 'neg'}">${r.qty > 0 ? '+' : ''}${FMT.int(r.qty)}</span>`,
        },
        { key: 'ref', label: 'Referensi', cls: 'code' },
      ],
    },

    jurnal: {
      title: 'Jurnal Umum',
      sub: 'Entri buku besar periode berjalan beserta status postingnya.',
      rows: () => DATA.journals,
      key: 'id',
      search: ['id', 'desc', 'account', 'by'],
      statusKey: 'status',
      statuses: ['diposting', 'menunggu', 'ditolak'],
      selectable: true,
      primary: { label: 'Jurnal baru', action: 'demo' },
      sort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Nomor', cls: 'code cell-strong' },
        { key: 'date', label: 'Tanggal', render: (r) => `<span class="num">${FMT.date(r.date)}</span>` },
        { key: 'desc', label: 'Keterangan', render: (r) => `<span class="cell-strong">${esc(r.desc)}</span><span class="cell-sub code">${esc(r.account)}</span>` },
        { key: 'debit', label: 'Debit', align: 'r', render: (r) => (r.debit ? money(r.debit) : '<span class="muted">—</span>') },
        { key: 'credit', label: 'Kredit', align: 'r', render: (r) => (r.credit ? money(r.credit) : '<span class="muted">—</span>') },
        { key: 'by', label: 'Dibuat oleh' },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    karyawan: {
      title: 'Karyawan',
      sub: 'Data induk karyawan beserta unit kerja dan status kepegawaian.',
      rows: () => DATA.employees,
      key: 'id',
      search: ['id', 'name', 'dept', 'title', 'location'],
      statusKey: 'status',
      statuses: ['tetap', 'kontrak', 'magang'],
      primary: { label: 'Karyawan baru', action: 'demo' },
      sort: { key: 'name', dir: 'asc' },
      columns: [
        { key: 'id', label: 'NIK', cls: 'code' },
        { key: 'name', label: 'Nama', render: (r) => `<span class="cell-strong">${esc(r.name)}</span><span class="cell-sub">${esc(r.title)}</span>` },
        { key: 'dept', label: 'Unit kerja' },
        { key: 'location', label: 'Lokasi' },
        { key: 'join', label: 'Bergabung', render: (r) => `<span class="num">${FMT.date(r.join)}</span>` },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },
    /* ------------------------------------------------------------------ */
    /* Register baru dari blueprint                                       */
    /* ------------------------------------------------------------------ */

    penawaran: {
      title: 'Penawaran',
      sub: 'Daftar quotation beserta status pengiriman dan masa berlaku.',
      rows: () => DATA.quotations,
      key: 'id',
      search: ['id', 'customer', 'pic', 'opp'],
      statusKey: 'status',
      statuses: ['draf', 'terkirim', 'diterima', 'ditolak'],
      selectable: true,
      primary: { label: 'Penawaran baru', action: 'demo' },
      sort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Nomor', cls: 'code cell-strong' },
        { key: 'date', label: 'Tanggal', render: (r) => `<span class="num">${FMT.date(r.date)}</span>` },
        { key: 'customer', label: 'Pelanggan', cls: 'cell-strong' },
        { key: 'amount', label: 'Nilai', align: 'r', render: (r) => money(r.amount) },
        { key: 'validity', label: 'Berlaku s/d', render: (r) => `<span class="num">${FMT.date(r.validity)}</span>` },
        { key: 'pic', label: 'Penanggung jawab' },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    'permintaan-pembelian': {
      title: 'Permintaan Pembelian',
      sub: 'Permintaan pengadaan internal dari unit kerja.',
      rows: () => DATA.purchaseRequests,
      key: 'id',
      search: ['id', 'requestor', 'dept', 'desc'],
      statusKey: 'status',
      statuses: ['menunggu', 'disetujui', 'selesai', 'ditolak'],
      selectable: true,
      primary: { label: 'Permintaan baru', action: 'demo' },
      sort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Nomor', cls: 'code cell-strong' },
        { key: 'date', label: 'Tanggal', render: (r) => `<span class="num">${FMT.date(r.date)}</span>` },
        { key: 'requestor', label: 'Pemohon', render: (r) => `<span class="cell-strong">${esc(r.requestor)}</span><span class="cell-sub">${esc(r.dept)}</span>` },
        { key: 'desc', label: 'Keterangan' },
        { key: 'amount', label: 'Perkiraan nilai', align: 'r', render: (r) => money(r.amount) },
        { key: 'priority', label: 'Prioritas', value: (r) => ({ tinggi: 0, sedang: 1, rendah: 2 }[r.priority]), render: (r) => pill(r.priority) },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    penggajian: {
      title: 'Penggajian',
      sub: 'Slip gaji karyawan periode berjalan.',
      rows: () => DATA.payroll,
      key: 'id',
      search: ['id', 'name', 'dept', 'employeeId'],
      statusKey: 'status',
      statuses: ['dibayar', 'diproses', 'draf'],
      primary: { label: 'Proses penggajian', action: 'demo' },
      sort: { key: 'name', dir: 'asc' },
      columns: [
        { key: 'id', label: 'Nomor', cls: 'code' },
        { key: 'name', label: 'Karyawan', render: (r) => `<span class="cell-strong">${esc(r.name)}</span><span class="cell-sub code">${esc(r.employeeId)} · ${esc(r.dept)}</span>` },
        { key: 'basic', label: 'Gaji pokok', align: 'r', render: (r) => money(r.basic) },
        { key: 'allowance', label: 'Tunjangan', align: 'r', render: (r) => money(r.allowance) },
        { key: 'deduction', label: 'Potongan', align: 'r', render: (r) => `<span class="num neg">${FMT.rpCompact(r.deduction)}</span>` },
        { key: 'netPay', label: 'Gaji bersih', align: 'r', render: (r) => `<b class="num">${FMT.rpCompact(r.netPay)}</b>` },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    aset: {
      title: 'Daftar Aset',
      sub: 'Aset tetap beserta nilai buku dan penyusutan bulanan.',
      rows: () => DATA.assets,
      key: 'id',
      search: ['id', 'name', 'category', 'location'],
      statusKey: 'status',
      statuses: ['aktif', 'dihapuskan'],
      primary: { label: 'Tambah aset', action: 'demo' },
      sort: { key: 'bookValue', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Kode', cls: 'code' },
        { key: 'name', label: 'Nama aset', render: (r) => `<span class="cell-strong">${esc(r.name)}</span><span class="cell-sub">${esc(r.category)} · ${esc(r.location)}</span>` },
        { key: 'acquisitionDate', label: 'Tgl perolehan', render: (r) => `<span class="num">${FMT.date(r.acquisitionDate)}</span>` },
        { key: 'acquisitionCost', label: 'Nilai perolehan', align: 'r', render: (r) => money(r.acquisitionCost) },
        { key: 'bookValue', label: 'Nilai buku', align: 'r', render: (r) => money(r.bookValue) },
        { key: 'monthlyDepr', label: 'Penyusutan/bln', align: 'r', render: (r) => r.monthlyDepr ? money(r.monthlyDepr) : '<span class="muted">—</span>' },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    pemeliharaan: {
      title: 'Pemeliharaan',
      sub: 'Jadwal dan riwayat perawatan aset, preventif maupun korektif.',
      rows: () => DATA.maintenanceOrders,
      key: 'id',
      search: ['id', 'asset', 'assignee', 'desc'],
      statusKey: 'status',
      statuses: ['dijadwalkan', 'berjalan', 'selesai'],
      selectable: true,
      primary: { label: 'Jadwalkan perawatan', action: 'demo' },
      sort: { key: 'scheduledDate', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Nomor', cls: 'code cell-strong' },
        { key: 'asset', label: 'Aset', render: (r) => `<span class="cell-strong">${esc(r.asset)}</span><span class="cell-sub code">${esc(r.assetId)}</span>` },
        { key: 'type', label: 'Jenis' },
        { key: 'priority', label: 'Prioritas', value: (r) => ({ tinggi: 0, sedang: 1, rendah: 2 }[r.priority]), render: (r) => pill(r.priority) },
        { key: 'assignee', label: 'Penanggung jawab' },
        { key: 'scheduledDate', label: 'Jadwal', render: (r) => `<span class="num">${FMT.date(r.scheduledDate)}</span>` },
        { key: 'cost', label: 'Biaya', align: 'r', render: (r) => money(r.cost) },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    dokumen: {
      title: 'Repositori Dokumen',
      sub: 'Dokumen perusahaan — kontrak, SOP, sertifikat, dan kebijakan.',
      rows: () => DATA.documents,
      key: 'id',
      search: ['id', 'name', 'type', 'folder', 'owner'],
      statusKey: 'status',
      statuses: ['berlaku', 'draf', 'kedaluwarsa'],
      primary: { label: 'Unggah dokumen', action: 'demo' },
      sort: { key: 'modified', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Kode', cls: 'code' },
        { key: 'name', label: 'Nama', render: (r) => `<span class="cell-strong">${esc(r.name)}</span><span class="cell-sub">${esc(r.folder)}</span>` },
        { key: 'type', label: 'Jenis' },
        { key: 'version', label: 'Versi', cls: 'num', render: (r) => `<span class="num">v${r.version}</span>` },
        { key: 'owner', label: 'Pemilik' },
        { key: 'modified', label: 'Diubah', render: (r) => `<span class="num">${FMT.date(r.modified)}</span>` },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    'jejak-audit': {
      title: 'Jejak Audit',
      sub: 'Catatan semua tindakan pengguna dan sistem di seluruh modul.',
      rows: () => DATA.auditTrail,
      key: 'id',
      search: ['id', 'user', 'action', 'module', 'entity', 'detail'],
      sort: { key: 'timestamp', dir: 'desc' },
      columns: [
        { key: 'id', label: 'ID', cls: 'code' },
        { key: 'timestamp', label: 'Waktu', render: (r) => `<span class="num" style="font-size:var(--fs-cap)">${esc(r.timestamp)}</span>` },
        { key: 'user', label: 'Pengguna', cls: 'cell-strong' },
        { key: 'action', label: 'Tindakan' },
        { key: 'module', label: 'Modul' },
        { key: 'entity', label: 'Entitas', cls: 'code' },
        { key: 'detail', label: 'Keterangan' },
        { key: 'ip', label: 'IP', cls: 'code' },
      ],
    },

    'data-master': {
      title: 'Produk & Layanan',
      sub: 'Katalog induk produk, bahan baku, dan jasa beserta harga pokok dan harga jual.',
      rows: () => DATA.masterProducts,
      key: 'id',
      search: ['id', 'name', 'category', 'sku'],
      statusKey: 'status',
      statuses: ['aktif', 'nonaktif'],
      primary: { label: 'Produk baru', action: 'demo' },
      sort: { key: 'name', dir: 'asc' },
      columns: [
        { key: 'id', label: 'Kode', cls: 'code' },
        { key: 'name', label: 'Nama', render: (r) => `<span class="cell-strong">${esc(r.name)}</span><span class="cell-sub">${esc(r.category)} · ${esc(r.uom)}</span>` },
        { key: 'sku', label: 'SKU', cls: 'code' },
        { key: 'costPrice', label: 'Harga pokok', align: 'r', render: (r) => money(r.costPrice) },
        { key: 'salePrice', label: 'Harga jual', align: 'r', render: (r) => r.salePrice ? money(r.salePrice) : '<span class="muted">—</span>' },
        { key: 'taxCode', label: 'Pajak' },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    rfq: {
      title: 'RFQ & Perbandingan Vendor',
      sub: 'Permintaan penawaran ke pemasok dan evaluasi harga terbaik.',
      rows: () => DATA.rfqs,
      key: 'id',
      search: ['id', 'title', 'requestor', 'prRef'],
      statusKey: 'status',
      statuses: ['terbuka', 'evaluasi', 'selesai'],
      selectable: true,
      primary: { label: 'RFQ baru', action: 'demo' },
      sort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Nomor', cls: 'code cell-strong' },
        { key: 'date', label: 'Tanggal', render: (r) => `<span class="num">${FMT.date(r.date)}</span>` },
        { key: 'title', label: 'Deskripsi', cls: 'cell-strong' },
        { key: 'requestor', label: 'Pemohon' },
        { key: 'vendors', label: 'Vendor', align: 'r', render: (r) => `<span class="num">${r.vendors}</span>` },
        { key: 'deadline', label: 'Batas waktu', render: (r) => `<span class="num">${FMT.date(r.deadline)}</span>` },
        { key: 'bestPrice', label: 'Harga terbaik', align: 'r', render: (r) => money(r.bestPrice) },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    hutang: {
      title: 'Hutang Usaha',
      sub: 'Faktur dari pemasok, pencocokan 3-arah, dan jadwal pembayaran.',
      rows: () => DATA.payables,
      key: 'id',
      search: ['id', 'supplier', 'poRef'],
      statusKey: 'status',
      statuses: ['belum-dibayar', 'sebagian', 'lunas'],
      selectable: true,
      primary: { label: 'Catat hutang', action: 'demo' },
      sort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Nomor', cls: 'code cell-strong' },
        { key: 'date', label: 'Tanggal', render: (r) => `<span class="num">${FMT.date(r.date)}</span>` },
        { key: 'supplier', label: 'Pemasok', cls: 'cell-strong' },
        { key: 'poRef', label: 'Ref. PO', cls: 'code' },
        { key: 'amount', label: 'Nilai', align: 'r', render: (r) => money(r.amount) },
        { key: 'sisa', label: 'Sisa bayar', align: 'r', value: (r) => r.amount - r.paid, render: (r) => money(r.amount - r.paid) },
        { key: 'dueDate', label: 'Jatuh tempo', render: (r) => `<span class="num">${FMT.date(r.dueDate)}</span>` },
        { key: 'matched', label: '3-Way', render: (r) => r.matched ? `<span class="pill" data-tone="ok"><i class="pill-dot"></i>Cocok</span>` : `<span class="pill" data-tone="warn"><i class="pill-dot"></i>Belum</span>` },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    kehadiran: {
      title: 'Kehadiran & Cuti',
      sub: 'Rekap kehadiran harian, shift, lembur, dan pengajuan cuti.',
      rows: () => DATA.attendanceRecords,
      key: 'id',
      search: ['id', 'name', 'employeeId', 'type'],
      statusKey: 'status',
      statuses: ['hadir', 'terlambat', 'cuti', 'sakit', 'alpha'],
      primary: { label: 'Ajukan cuti', action: 'demo' },
      sort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'name', label: 'Karyawan', render: (r) => `<span class="cell-strong">${esc(r.name)}</span><span class="cell-sub code">${esc(r.employeeId)}</span>` },
        { key: 'date', label: 'Tanggal', render: (r) => `<span class="num">${FMT.date(r.date)}</span>` },
        { key: 'shift', label: 'Shift' },
        { key: 'clockIn', label: 'Masuk', render: (r) => r.clockIn ? `<span class="num">${r.clockIn}</span>` : '<span class="muted">—</span>' },
        { key: 'clockOut', label: 'Keluar', render: (r) => r.clockOut ? `<span class="num">${r.clockOut}</span>` : '<span class="muted">—</span>' },
        { key: 'overtime', label: 'Lembur (jam)', align: 'r', render: (r) => r.overtime ? `<span class="num">${r.overtime}</span>` : '<span class="muted">—</span>' },
        { key: 'type', label: 'Keterangan' },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    'alur-kerja': {
      title: 'Desainer Alur Kerja',
      sub: 'Template alur persetujuan, eskalasi, dan otomasi proses bisnis.',
      rows: () => DATA.workflows,
      key: 'id',
      search: ['id', 'name', 'trigger', 'owner'],
      statusKey: 'status',
      statuses: ['aktif', 'nonaktif'],
      primary: { label: 'Alur baru', action: 'demo' },
      sort: { key: 'name', dir: 'asc' },
      columns: [
        { key: 'id', label: 'Kode', cls: 'code' },
        { key: 'name', label: 'Nama Alur', render: (r) => `<span class="cell-strong">${esc(r.name)}</span><span class="cell-sub">Pemicu: ${esc(r.trigger)}</span>` },
        { key: 'steps', label: 'Langkah', align: 'r', render: (r) => `<span class="num">${r.steps}</span>` },
        { key: 'sla', label: 'SLA' },
        { key: 'activeInstances', label: 'Aktif', align: 'r', render: (r) => r.activeInstances ? `<span class="num">${r.activeInstances}</span>` : '<span class="muted">0</span>' },
        { key: 'owner', label: 'Pemilik' },
        { key: 'lastModified', label: 'Diubah', render: (r) => `<span class="num">${FMT.date(r.lastModified)}</span>` },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    analitik: {
      title: 'BI & Laporan',
      sub: 'Daftar laporan standar dan analitik, frekuensi, dan terakhir dijalankan.',
      rows: () => DATA.reports,
      key: 'id',
      search: ['id', 'name', 'module', 'type'],
      statusKey: 'status',
      statuses: ['aktif', 'nonaktif'],
      primary: { label: 'Laporan baru', action: 'demo' },
      sort: { key: 'lastRun', dir: 'desc' },
      columns: [
        { key: 'id', label: 'Kode', cls: 'code' },
        { key: 'name', label: 'Nama Laporan', render: (r) => `<span class="cell-strong">${esc(r.name)}</span><span class="cell-sub">${esc(r.module)}</span>` },
        { key: 'type', label: 'Tipe' },
        { key: 'frequency', label: 'Frekuensi' },
        { key: 'format', label: 'Format' },
        { key: 'lastRun', label: 'Terakhir', render: (r) => `<span class="num">${FMT.date(r.lastRun)}</span>` },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },

    kepatuhan: {
      title: 'Kepatuhan & GRC',
      sub: 'Register kepatuhan regulasi, sertifikasi, dan risiko tata kelola.',
      rows: () => DATA.complianceItems,
      key: 'id',
      search: ['id', 'title', 'category', 'owner'],
      statusKey: 'status',
      statuses: ['patuh', 'peninjauan', 'dijadwalkan', 'tidak-patuh'],
      primary: { label: 'Tambah item', action: 'demo' },
      sort: { key: 'risk', dir: 'asc' },
      columns: [
        { key: 'id', label: 'Kode', cls: 'code' },
        { key: 'title', label: 'Judul', render: (r) => `<span class="cell-strong">${esc(r.title)}</span><span class="cell-sub">${esc(r.category)}</span>` },
        { key: 'owner', label: 'Penanggung jawab' },
        { key: 'risk', label: 'Risiko', value: (r) => ({ tinggi: 0, sedang: 1, rendah: 2 }[r.risk]), render: (r) => pill(r.risk) },
        { key: 'lastReview', label: 'Tinjauan terakhir', render: (r) => r.lastReview ? `<span class="num">${FMT.date(r.lastReview)}</span>` : '<span class="muted">—</span>' },
        { key: 'dueDate', label: 'Tenggat', render: (r) => r.dueDate ? `<span class="num">${FMT.date(r.dueDate)}</span>` : '<span class="muted">—</span>' },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    },
  };

  const PAGE_SIZE = 10;

  /* ====================================================================== */
  /* Kerangka: rail, topbar, context bar                                     */
  /* ====================================================================== */
  function viewMeta(id) {
    var dashViews = {
      analitik: { title: 'Analitik & BI', sub: 'Ringkasan kinerja bisnis, tren, dan perbandingan antar departemen.' },
      bsc: { title: 'Balanced Scorecard', sub: 'Kinerja empat perspektif: keuangan, pelanggan, proses, dan pertumbuhan.' },
    };
    if (dashViews[id]) return dashViews[id];
    if (REGISTERS[id]) return { title: REGISTERS[id].title, sub: REGISTERS[id].sub };
    return ({
      dasbor: { title: 'Dasbor', sub: `Ikhtisar operasi ${DATA.org.company} untuk periode ${DATA.org.period}.` },
      'perintah-kerja': { title: 'Perintah Kerja', sub: 'Papan produksi lintas lini, dari antrean hingga selesai.' },
      piutang: { title: 'Piutang Usaha', sub: 'Sebaran umur piutang dan faktur yang perlu ditagih.' },
      peran: { title: 'Peran & Izin', sub: 'Matriks hak akses tiap peran terhadap modul dan tindakan.' },
      pengaturan: { title: 'Pengaturan', sub: 'Profil perusahaan, kebijakan dokumen, dan preferensi tampilan.' },
      'sistem-desain': { title: 'Sistem Desain', sub: 'Token, tipografi, dan komponen yang menyusun purwarupa ini.' },
      lead: { title: 'Pipeline CRM', sub: 'Peluang penjualan dari prospek hingga closing, beserta nilai dan probabilitasnya.' },
      kasir: { title: 'Kasir (POS)', sub: 'Ikhtisar shift kasir, transaksi hari ini, dan pencapaian target penjualan toko.' },
      proyek: { title: 'Manajemen Proyek', sub: 'Progres proyek, kesehatan anggaran, dan linimasa tugas utama.' },
      anggaran: { title: 'Anggaran & Biaya', sub: 'Realisasi biaya terhadap anggaran per pusat biaya.' },
      persetujuan: { title: 'Kotak Persetujuan', sub: 'Dokumen dan transaksi yang menunggu persetujuan Anda.' },
      'kas-bank': { title: 'Kas & Bank', sub: 'Saldo rekening bank, kas kecil, dan status rekonsiliasi.' },
      'rantai-pasok': { title: 'Rantai Pasok', sub: 'Pengiriman aktif, logistik, dan pelacakan barang.' },
      analitik: { title: 'Analitik & BI', sub: 'Ringkasan kinerja bisnis, tren, dan perbandingan antar departemen.' },
      bsc: { title: 'Balanced Scorecard', sub: 'Kinerja empat perspektif: keuangan, pelanggan, proses, dan pertumbuhan.' },
    })[id] || { title: 'Halaman', sub: '' };
  }

  function navGroupOf(id) {
    for (const g of DATA.nav) if (g.items.some((i) => i.id === id)) return g.label;
    return '';
  }

  function renderRail() {
    const groups = DATA.nav.map((g) => `
      <div class="rail-group">
        <div class="rail-group-label">${esc(g.label)}</div>
        ${g.items.map((it) => `
          <button class="rail-link" data-nav="${it.id}" ${state.view === it.id ? 'aria-current="page"' : ''} title="${esc(it.label)}">
            ${icon(it.icon, 'rail-link-icon')}
            <span class="rail-link-text">${esc(it.label)}</span>
            ${it.count ? `<span class="rail-link-count">${FMT.int(it.count)}</span>` : ''}
          </button>`).join('')}
      </div>`).join('');

    return `
      <nav class="rail" aria-label="Navigasi utama">
        <div class="rail-brand">
          <span class="rail-mark">${icon('boxes')}</span>
          <span class="rail-wordmark"><b>ERP Enterprise</b><span>Karya Nusantara</span></span>
        </div>
        <div class="rail-scroll">${groups}</div>
        <div class="rail-foot">
          <button class="rail-link" data-action="toggle-rail" title="Lebarkan atau ciutkan navigasi">
            ${icon('panel', 'rail-link-icon')}
            <span class="rail-link-text">Ciutkan panel</span>
          </button>
        </div>
      </nav>`;
  }

  function renderTopbar() {
    const meta = viewMeta(state.view);
    const group = navGroupOf(state.view);
    const unread = DATA.notifications.filter((n) => n.unread).length;
    return `
      <header class="topbar">
        <div class="crumbs">
          ${group ? `<span class="crumbs-trail">${esc(group)}</span><span class="crumbs-sep crumbs-trail">/</span>` : ''}
          <b>${esc(meta.title)}</b>
        </div>
        <div class="topbar-spacer"></div>
        <button class="omni" data-action="open-palette" aria-label="Cari apa saja">
          ${icon('search')}
          <span class="omni-text">Cari pesanan, pelanggan, barang…</span>
          <span class="kbd">Ctrl K</span>
        </button>
        <button class="btn btn-icon btn-ghost has-badge" data-action="open-notifications" aria-label="Notifikasi${unread ? `, ${unread} belum dibaca` : ''}">
          ${icon('bell')}${unread ? '<i class="dot-badge"></i>' : ''}
        </button>
        <button class="btn btn-icon btn-ghost" data-action="open-user" aria-label="Menu pengguna">
          <span class="avatar">${esc(DATA.org.user.initials)}</span>
        </button>
      </header>`;
  }

  /** Strip kepala dokumen — konteks yang membatasi seluruh angka di layar. */
  function renderContextBar() {
    const f = (label, value, action) => `
      <div class="ctx-field">
        <span class="micro">${esc(label)}</span>
        <button class="ctx-value" data-action="${action}">${esc(value)} ${icon('chevron-down')}</button>
      </div>`;
    return `
      <div class="contextbar">
        ${f('Perusahaan', DATA.org.company, 'switch-company')}
        ${f('Cabang', DATA.org.branch, 'switch-branch')}
        ${f('Periode', DATA.org.period, 'switch-period')}
        <div class="ctx-field">
          <span class="micro">Mata uang</span>
          <span class="ctx-static">IDR — Rupiah</span>
        </div>
        <div class="contextbar-spacer"></div>
        <div class="ctx-actions">
          <button class="btn btn-sm btn-ghost" data-action="demo">${icon('print')} Cetak</button>
          <button class="btn btn-sm" data-action="demo">${icon('download')} Ekspor</button>
        </div>
      </div>`;
  }

  /* ====================================================================== */
  /* Arketipe 1 — Ikhtisar (dasbor)                                          */
  /* ====================================================================== */
  function kpiTile(k) {
    const tone = k.delta === 0 ? 'flat'
      : k.delta > 0 ? (k.dir === 'up' ? 'up-good' : 'up-bad')
      : (k.dir === 'down' ? 'down-good' : 'down-bad');
    return `
      <article class="card kpi">
        <div class="kpi-top">
          <span class="micro">${esc(k.label)}</span>
        </div>
        <div class="kpi-metric">${FMT.value(k.value, k.format)}${k.unit ? `<span class="kpi-unit"> ${esc(k.unit)}</span>` : ''}</div>
        <div class="kpi-row">
          <span class="kpi-delta" data-tone="${tone}">
            ${icon(k.delta >= 0 ? 'arrow-up' : 'arrow-down')}<span>${FMT.signedPct(k.delta)}</span>
            <span class="kpi-basis">vs bulan lalu</span>
          </span>
          <div class="kpi-spark" data-spark="${k.id}"></div>
        </div>
        <div class="kpi-foot">${esc(k.foot)}</div>
      </article>`;
  }

  function renderWidgetContent(widget) {
    const type = widget.type;

    if (type === 'kpi') {
      return '<section class="grid grid-kpi" aria-label="Indikator utama">' + DATA.kpis.map(kpiTile).join('') + '</section>';
    }

    if (type === 'revenue') {
      const trenTable =
        '<div class="table-scroll"><table class="table">' +
        '<thead><tr><th>Bulan</th><th class="ta-r">Pendapatan</th><th class="ta-r">Target</th><th class="ta-r">Selisih</th></tr></thead>' +
        '<tbody>' +
        DATA.revenueTrend.labels.map((l, i) => {
          const a = DATA.revenueTrend.actual[i], t = DATA.revenueTrend.target[i];
          const d = a - t;
          return '<tr><td class="num">' + esc(l) + ' 2026</td><td class="ta-r num">' + FMT.rpCompact(a * 1e9) + '</td><td class="ta-r num">' + FMT.rpCompact(t * 1e9) + '</td><td class="ta-r num ' + (d >= 0 ? 'pos' : 'neg') + '">' + (d >= 0 ? '+' : '') + FMT.rpCompact(d * 1e9) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';

      const pressed = function(k) { return state.chartView.tren === k ? 'true' : 'false'; };
      return '<div class="card-head"><div class="card-head-text">' +
        '<h2 class="card-title">Pendapatan terhadap target</h2>' +
        '<span class="card-note">12 bulan terakhir &middot; nilai dalam rupiah</span></div>' +
        '<div class="card-tools"><div class="segmented" role="group" aria-label="Tampilan pendapatan">' +
        '<button data-chart-view="tren:grafik" aria-pressed="' + pressed('grafik') + '">Grafik</button>' +
        '<button data-chart-view="tren:tabel" aria-pressed="' + pressed('tabel') + '">Tabel</button>' +
        '</div></div></div>' +
        (state.chartView.tren === 'grafik'
          ? '<div class="card-body"><div class="chart" data-chart="tren"></div>' +
            '<div class="chart-legend"><span class="chart-legend-item"><i class="chart-swatch" data-swatch="cat-1"></i>Pendapatan aktual</span>' +
            '<span class="chart-legend-item"><i class="chart-swatch chart-swatch-line"></i>Target</span></div></div>'
          : trenTable);
    }

    if (type === 'approvals') {
      return '<div class="card-head"><div class="card-head-text">' +
        '<h2 class="card-title">Menunggu persetujuan Anda</h2>' +
        '<span class="card-note">' + DATA.approvals.length + ' dokumen &middot; Rp 828,6 jt</span>' +
        '</div></div><div class="worklist">' +
        DATA.approvals.slice(0, 4).map(function(a) {
          return '<button class="worklist-item" data-approval="' + esc(a.id) + '">' +
            '<span class="wl-icon" data-tone="' + a.tone + '">' + icon(a.icon) + '</span>' +
            '<span class="worklist-body">' +
            '<span class="worklist-title">' + esc(a.title) + '</span>' +
            '<span class="worklist-meta"><span class="code">' + esc(a.id) + '</span><span>' + esc(a.reason) + '</span></span>' +
            '<span class="worklist-meta">' + esc(a.by) + ' &middot; ' + esc(a.ago) + '</span></span>' +
            '<span class="worklist-side"><b class="num">' + FMT.rpCompact(a.amount) + '</b>' + icon('chevron-right') + '</span></button>';
        }).join('') +
        '</div><div class="card-foot"><button class="btn btn-sm" data-nav="pesanan-penjualan">Buka semua persetujuan</button></div>';
    }

    if (type === 'inventory') {
      const mixTotal = DATA.inventoryMix.reduce(function(s, d) { return s + d.value; }, 0);
      const mixTable =
        '<div class="table-scroll"><table class="table">' +
        '<thead><tr><th>Kategori</th><th class="ta-r">Nilai</th><th class="ta-r">Porsi</th></tr></thead><tbody>' +
        DATA.inventoryMix.map(function(d) {
          return '<tr><td>' + esc(d.label) + '</td><td class="ta-r num">' + FMT.rpCompact(d.value) + '</td><td class="ta-r num">' + FMT.pct((d.value / mixTotal) * 100) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';

      const pressed = function(k) { return state.chartView.mix === k ? 'true' : 'false'; };
      return '<div class="card-head"><div class="card-head-text">' +
        '<h2 class="card-title">Komposisi nilai persediaan</h2>' +
        '<span class="card-note">Total ' + FMT.rpCompact(mixTotal) + ' per ' + esc(DATA.org.period) + '</span></div>' +
        '<div class="card-tools"><div class="segmented" role="group" aria-label="Tampilan persediaan">' +
        '<button data-chart-view="mix:grafik" aria-pressed="' + pressed('grafik') + '">Grafik</button>' +
        '<button data-chart-view="mix:tabel" aria-pressed="' + pressed('tabel') + '">Tabel</button>' +
        '</div></div></div>' +
        (state.chartView.mix === 'grafik'
          ? '<div class="card-body"><div class="chart"><div data-stackbar="mix"></div></div><div data-stacklegend="mix"></div></div>'
          : mixTable);
    }

    if (type === 'aging') {
      return '<div class="card-head"><div class="card-head-text">' +
        '<h2 class="card-title">Umur piutang</h2>' +
        '<span class="card-note">Semakin tua ember, semakin pekat warnanya</span></div>' +
        '<div class="card-tools"><button class="btn btn-sm" data-nav="piutang">Rincian</button></div></div>' +
        '<div class="card-body"><div class="chart" data-chart="aging"></div></div>';
    }

    if (type === 'stock-alerts') {
      return '<div class="card-head"><div class="card-head-text">' +
        '<h2 class="card-title">Stok di bawah minimum</h2>' +
        '<span class="card-note">' + DATA.stockAlerts.length + ' barang perlu tindakan pengadaan</span></div>' +
        '<div class="card-tools"><button class="btn btn-sm" data-nav="stok">Buka stok</button></div></div>' +
        '<div class="worklist">' +
        DATA.stockAlerts.map(function(s) {
          return '<button class="worklist-item" data-nav="stok">' +
            '<span class="wl-icon" data-tone="' + s.tone + '">' + icon('alert') + '</span>' +
            '<span class="worklist-body"><span class="worklist-title">' + esc(s.name) + '</span>' +
            '<span class="worklist-meta"><span class="code">' + esc(s.sku) + '</span><span>' + esc(s.note) + '</span></span></span>' +
            '<span class="worklist-side"><b class="num">' + FMT.int(s.onHand) + ' ' + esc(s.unit) + '</b>' +
            '<span class="micro">min ' + FMT.int(s.min) + '</span></span></button>';
        }).join('') +
        '</div>';
    }

    if (type === 'activity') {
      return '<div class="card-head"><div class="card-head-text">' +
        '<h2 class="card-title">Aktivitas hari ini</h2>' +
        '<span class="card-note">Jejak audit ringkas</span></div></div>' +
        '<div class="card-body"><div class="timeline">' +
        DATA.activity.map(function(a) {
          return '<div class="tl-item"><span class="tl-rail"><i class="tl-node" data-tone="' + a.tone + '"></i><i class="tl-line"></i></span>' +
            '<span class="tl-body"><span class="tl-title"><b>' + esc(a.who) + '</b> ' + esc(a.what) + ' <span class="code">' + esc(a.ref) + '</span></span>' +
            '<span class="tl-meta">' + esc(a.when) + '</span></span></div>';
        }).join('') +
        '</div></div>';
    }

    if (type === 'ai-briefing') {
      return '<div class="card-head"><div class="card-head-text">' +
        '<h2 class="card-title">' + icon('sparkle') + ' AI Briefing Harian</h2>' +
        '<span class="card-note">Ringkasan otomatis oleh AI</span></div></div>' +
        '<div class="card-body"><p style="font-size:var(--fs-sm);line-height:1.6;color:var(--ink-2)">' +
        esc(DATA.aiBriefing) + '</p></div>';
    }

    return '<div class="card-body"><p class="muted">Widget tidak dikenali.</p></div>';
  }

  function widgetEditToolbar(w, idx) {
    const cat = WIDGET_CATALOG.find(function(c) { return c.type === w.type; });
    const typeLabel = cat ? cat.label : w.type;
    return '<div class="widget-toolbar" data-widget-idx="' + idx + '">' +
      /* Drag handle + label */
      '<span class="widget-toolbar-drag" draggable="true" data-widget-idx="' + idx + '" title="Seret untuk pindahkan">' + icon('grid') + '</span>' +
      '<span class="widget-toolbar-label">' + esc(typeLabel) + '</span>' +
      '<span class="widget-toolbar-spacer"></span>' +
      /* Width controls */
      '<span class="widget-toolbar-group">' +
      '<span class="micro">Lebar</span>' +
      '<button class="widget-toolbar-btn" data-widget-resize="' + idx + ':-1:0" title="Kurangi lebar">' + icon('minus') + '</button>' +
      '<span class="widget-toolbar-val">' + w.w + '</span>' +
      '<button class="widget-toolbar-btn" data-widget-resize="' + idx + ':1:0" title="Tambah lebar">' + icon('plus') + '</button>' +
      '</span>' +
      /* Height controls */
      '<span class="widget-toolbar-group">' +
      '<span class="micro">Tinggi</span>' +
      '<button class="widget-toolbar-btn" data-widget-resize="' + idx + ':0:-1" title="Kurangi tinggi">' + icon('minus') + '</button>' +
      '<span class="widget-toolbar-val">' + w.h + '</span>' +
      '<button class="widget-toolbar-btn" data-widget-resize="' + idx + ':0:1" title="Tambah tinggi">' + icon('plus') + '</button>' +
      '</span>' +
      /* Change content */
      '<button class="widget-toolbar-btn" data-widget-change="' + idx + '" title="Ganti konten">' + icon('edit') + '</button>' +
      /* Delete */
      '<button class="widget-toolbar-btn widget-toolbar-btn-danger" data-widget-remove="' + idx + '" title="Hapus widget">' + icon('x') + '</button>' +
      '</div>';
  }

  function renderDashboard() {
    const widgets = getWidgets();
    const editMode = state.dashEditMode;

    const editBar =
      '<div class="dash-edit-bar" style="display:flex;align-items:flex-start;gap:var(--sp-4);margin-bottom:var(--sp-4)">' +
      '<div style="flex:1">' +
      '<h1 class="page-title">Selamat pagi, ' + esc(DATA.org.user.name.split(' ')[0]) + '</h1>' +
      '<p class="page-sub">' + esc(DATA.org.branch) + ' &middot; ' + esc(DATA.org.period) + ' &middot; 5 dokumen menunggu keputusan Anda.</p></div>' +
      '<div class="page-actions" style="display:flex;gap:var(--sp-2)">' +
      (editMode
        ? '<button class="btn" data-action="widget-add">' + icon('plus') + ' Tambah Widget</button>' +
          '<button class="btn" data-action="widget-reset">' + icon('transfer') + ' Reset Layout</button>' +
          '<button class="btn btn-primary" data-action="dash-edit-toggle">' + icon('check') + ' Selesai</button>'
        : '<button class="btn" data-action="demo">' + icon('download') + ' Unduh ringkasan</button>' +
          '<button class="btn" data-action="dash-edit-toggle">' + icon('edit') + ' Kustomisasi</button>' +
          '<button class="btn btn-primary" data-action="new-so">' + icon('plus') + ' Pesanan baru</button>') +
      '</div></div>';

    const widgetHtml = widgets.map(function(w, idx) {
      return '<article class="card dash-widget' + (editMode ? ' dash-widget-editing' : '') + '"' +
        ' style="grid-column:span ' + w.w + ';grid-row:span ' + w.h + '"' +
        ' data-widget-idx="' + idx + '" data-widget-type="' + w.type + '">' +
        (editMode ? widgetEditToolbar(w, idx) : '') +
        '<div class="widget-body">' + renderWidgetContent(w) + '</div>' +
        '</article>';
    }).join('');

    return editBar +
      '<div class="dash-grid' + (editMode ? ' dash-edit-mode' : '') + '">' +
      widgetHtml + '</div>';
  }

  function mountDashboard(root) {
    DATA.kpis.forEach((k) => {
      const node = $(`[data-spark="${k.id}"]`, root);
      if (node) Charts.sparkline(node, k.spark);
    });

    const tren = $('[data-chart="tren"]', root);
    if (tren) {
      Charts.lineChart(tren, {
        title: 'Pendapatan terhadap target',
        labels: DATA.revenueTrend.labels,
        actual: DATA.revenueTrend.actual,
        target: DATA.revenueTrend.target,
        format: 'rp-compact',
        scale: 1e9,
      });
    }

    const swatch = $('[data-swatch="cat-1"]', root);
    if (swatch) swatch.style.background = Charts.cssVar('--cat-1');

    const bar = $('[data-stackbar="mix"]', root);
    if (bar) {
      Charts.compositionBar(bar, $('[data-stacklegend="mix"]', root), {
        title: 'Komposisi nilai persediaan',
        items: DATA.inventoryMix,
      });
    }

    const aging = $('[data-chart="aging"]', root);
    if (aging) {
      Charts.columnChart(aging, {
        title: 'Umur piutang',
        ariaLabel: 'Umur piutang per ember: ' + DATA.arAging.map((d) => `${d.label} ${FMT.rpCompact(d.value)}`).join(', '),
        items: DATA.arAging,
        height: 214,
      });
    }
  }

  /* ====================================================================== */
  /* Arketipe 2 — Daftar (register)                                          */
  /* ====================================================================== */
  function sortedRows(id) {
    const cfg = REGISTERS[id];
    const st = regState(id);
    let rows = cfg.rows().slice();

    if (st.q) {
      const q = st.q.toLowerCase();
      rows = rows.filter((r) => (cfg.search || []).some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
    }
    if (cfg.statusKey && st.status !== 'semua') {
      rows = rows.filter((r) => r[cfg.statusKey] === st.status);
    }

    const sort = st.sort || cfg.sort;
    if (sort) {
      const col = cfg.columns.find((c) => c.key === sort.key);
      const val = (r) => (col && col.value ? col.value(r) : r[sort.key]);
      rows.sort((a, b) => {
        const x = val(a), y = val(b);
        const cmp = typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'id');
        return sort.dir === 'desc' ? -cmp : cmp;
      });
    }
    return rows;
  }

  function renderRegister(id) {
    const cfg = REGISTERS[id];
    const st = regState(id);
    const rows = sortedRows(id);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    st.page = Math.min(st.page, pages);
    const slice = rows.slice((st.page - 1) * PAGE_SIZE, st.page * PAGE_SIZE);
    const sort = st.sort || cfg.sort;
    const all = cfg.rows();

    const chips = cfg.statusKey ? `
      <div class="chips" role="group" aria-label="Saring status">
        <button class="chip" data-status="semua" aria-pressed="${st.status === 'semua'}">
          Semua <span class="chip-count">${all.length}</span>
        </button>
        ${cfg.statuses.map((s) => {
          const n = all.filter((r) => r[cfg.statusKey] === s).length;
          return `<button class="chip" data-status="${esc(s)}" aria-pressed="${st.status === s}">
            ${esc(STATUS[s]?.label || s)} <span class="chip-count">${n}</span></button>`;
        }).join('')}
      </div>` : '';

    const head = `
      <tr>
        ${cfg.selectable ? `<th class="col-check"><input type="checkbox" data-check-all aria-label="Pilih semua baris di halaman ini" ${slice.length && slice.every((r) => st.selected.has(r[cfg.key])) ? 'checked' : ''}></th>` : ''}
        ${cfg.columns.map((c) => `
          <th class="${c.align === 'r' ? 'ta-r' : ''}">
            <button class="th-sort" data-sort="${esc(c.key)}" data-active="${sort && sort.key === c.key}">
              ${esc(c.label)}
              <span class="sort-caret">${icon(sort && sort.key === c.key && sort.dir === 'desc' ? 'chevron-down' : 'chevron-up')}</span>
            </button>
          </th>`).join('')}
      </tr>`;

    const body = slice.length ? slice.map((r) => {
      const k = r[cfg.key];
      return `<tr data-row="${esc(k)}" ${st.selected.has(k) ? 'aria-selected="true"' : ''}>
        ${cfg.selectable ? `<td class="col-check"><input type="checkbox" data-check="${esc(k)}" aria-label="Pilih ${esc(k)}" ${st.selected.has(k) ? 'checked' : ''}></td>` : ''}
        ${cfg.columns.map((c) => `<td class="${c.align === 'r' ? 'ta-r ' : ''}${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}
      </tr>`;
    }).join('') : `
      <tr><td colspan="${cfg.columns.length + (cfg.selectable ? 1 : 0)}" style="padding:0">
        <div class="empty">
          <div class="empty-card">
            <span class="empty-title">Tidak ada yang cocok</span>
            <span class="empty-note">Ubah kata kunci atau lepas saringan status untuk melihat baris lainnya.</span>
            <button class="btn btn-sm" data-action="reset-filter">Bersihkan saringan</button>
          </div>
        </div>
      </td></tr>`;

    return `
      <div class="page-head">
        <div class="page-head-text">
          <h1 class="page-title">${esc(cfg.title)}</h1>
          <p class="page-sub">${esc(cfg.sub)}</p>
        </div>
        <div class="page-actions">
          <button class="btn" data-action="demo">${icon('download')} Ekspor</button>
          ${cfg.primary ? `<button class="btn btn-primary" data-action="${cfg.primary.action}">${icon('plus')} ${esc(cfg.primary.label)}</button>` : ''}
        </div>
      </div>

      <article class="card">
        <div class="toolbar">
          <div class="search-wrap toolbar-search">
            ${icon('search')}
            <input class="input" type="search" data-search placeholder="Cari…" value="${esc(st.q)}" aria-label="Cari dalam ${esc(cfg.title)}">
          </div>
          ${chips}
          <div class="toolbar-spacer"></div>
          <span class="pager-info">${FMT.int(rows.length)} baris</span>
          <button class="btn btn-sm btn-icon btn-ghost" data-action="demo" aria-label="Atur kolom">${icon('filter')}</button>
        </div>

        ${st.selected.size ? `
          <div class="bulkbar">
            <b>${FMT.int(st.selected.size)}</b> baris dipilih
            <div class="toolbar-spacer"></div>
            <button class="btn btn-sm" data-action="demo">${icon('check')} Setujui</button>
            <button class="btn btn-sm" data-action="demo">${icon('print')} Cetak</button>
            <button class="btn btn-sm btn-ghost" data-action="clear-selection">Batalkan pilihan</button>
          </div>` : ''}

        <div class="table-scroll">
          <table class="table">
            <thead>${head}</thead>
            <tbody>${body}</tbody>
          </table>
        </div>

        <div class="card-foot">
          <span class="pager-info">Halaman ${st.page} dari ${pages}</span>
          <div class="toolbar-spacer"></div>
          <div class="pager">
            <button class="btn btn-sm btn-icon" data-page="prev" ${st.page === 1 ? 'disabled' : ''} aria-label="Halaman sebelumnya">${icon('chevron-left')}</button>
            <button class="btn btn-sm btn-icon" data-page="next" ${st.page === pages ? 'disabled' : ''} aria-label="Halaman berikutnya">${icon('chevron-right')}</button>
          </div>
        </div>
      </article>`;
  }

  /* ====================================================================== */
  /* Arketipe 2b — Papan produksi                                            */
  /* ====================================================================== */
  function renderBoard() {
    const lines = ['semua', ...new Set(DATA.workOrders.map((w) => w.line))];
    const visible = DATA.workOrders.filter((w) => state.boardFilter === 'semua' || w.line === state.boardFilter);

    return `
      <div class="page-head">
        <div class="page-head-text">
          <h1 class="page-title">Perintah Kerja</h1>
          <p class="page-sub">Papan produksi lintas lini, dari antrean hingga selesai. Klik kartu untuk membuka rekaman.</p>
        </div>
        <div class="page-actions">
          <button class="btn" data-nav="stok">${icon('boxes')} Cek ketersediaan bahan</button>
          <button class="btn btn-primary" data-action="demo">${icon('plus')} Perintah kerja baru</button>
        </div>
      </div>

      <div class="chips" role="group" aria-label="Saring lini produksi">
        ${lines.map((l) => `<button class="chip" data-board-filter="${esc(l)}" aria-pressed="${state.boardFilter === l}">
          ${l === 'semua' ? 'Semua lini' : esc(l)}
          <span class="chip-count">${l === 'semua' ? DATA.workOrders.length : DATA.workOrders.filter((w) => w.line === l).length}</span>
        </button>`).join('')}
      </div>

      <div class="board">
        ${DATA.workOrderColumns.map((col) => {
          const items = visible.filter((w) => w.col === col.id);
          return `
            <section class="board-col" aria-label="${esc(col.label)}">
              <div class="board-col-head">
                <h2 class="card-title">${esc(col.label)}</h2>
                <span class="rail-link-count">${items.length}</span>
              </div>
              <div class="board-col-body">
                ${items.length ? items.map((w) => `
                  <button class="board-card" data-wo="${esc(w.id)}">
                    <span class="board-card-top">
                      <span class="code muted">${esc(w.id)}</span>
                      ${w.flag ? `<span class="pill" data-tone="warn"><i class="pill-dot"></i>${esc(w.flag)}</span>` : ''}
                    </span>
                    <span class="board-card-title">${esc(w.product)}</span>
                    <span class="board-card-meta">
                      <span class="num">${FMT.int(w.qty)} ${esc(w.unit)}</span>
                      <span>${esc(w.line)}</span>
                    </span>
                    ${w.col === 'berjalan' ? `
                      <span class="meter">
                        <span class="meter-track"><span class="meter-fill" style="width:${w.progress}%"></span></span>
                        <span class="meter-val">${w.progress}%</span>
                      </span>` : ''}
                    <span class="board-card-meta">
                      <span>${icon('clock')}</span><span>Tenggat ${esc(w.due)}</span>
                      <span class="toolbar-spacer"></span>
                      <span>${esc(w.pic)}</span>
                    </span>
                  </button>`).join('') : `
                  <div class="empty" style="padding:var(--sp-5) var(--sp-3)">
                    <span class="empty-note">Tidak ada perintah kerja di kolom ini.</span>
                  </div>`}
              </div>
            </section>`;
        }).join('')}
      </div>`;
  }

  /* ====================================================================== */
  /* Halaman piutang (ikhtisar + daftar faktur tertunggak)                   */
  /* ====================================================================== */
  function renderReceivables() {
    const total = DATA.arAging.reduce((s, d) => s + d.value, 0);
    const overdue = DATA.arAging.slice(1).reduce((s, d) => s + d.value, 0);
    const late = DATA.invoices.filter((i) => i.overdue > 0).sort((a, b) => b.overdue - a.overdue);

    const tile = (label, value, foot) => `
      <article class="card kpi">
        <div class="kpi-top"><span class="micro">${esc(label)}</span></div>
        <div class="kpi-metric">${value}</div>
        <div class="kpi-foot">${esc(foot)}</div>
      </article>`;

    return `
      <div class="page-head">
        <div class="page-head-text">
          <h1 class="page-title">Piutang Usaha</h1>
          <p class="page-sub">Sebaran umur piutang dan faktur yang perlu ditagih lebih dahulu.</p>
        </div>
        <div class="page-actions">
          <button class="btn" data-action="demo">${icon('download')} Ekspor umur piutang</button>
          <button class="btn btn-primary" data-action="demo">${icon('bell')} Kirim pengingat</button>
        </div>
      </div>

      <section class="grid grid-kpi">
        ${tile('Total piutang', `<span class="num">${FMT.rpCompact(total)}</span>`, `${DATA.arAging.reduce((s, d) => s + d.count, 0)} faktur beredar`)}
        ${tile('Lewat jatuh tempo', `<span class="num neg">${FMT.rpCompact(overdue)}</span>`, `${FMT.pct((overdue / total) * 100)} dari total piutang`)}
        ${tile('Rata-rata umur', '<span class="num">38 hari</span>', 'Termin rata-rata Net 34')}
        ${tile('Tertagih bulan ini', `<span class="num">${FMT.rpCompact(2_418_500_000)}</span>`, 'Target Rp 2,60 M')}
      </section>

      <article class="card">
        <div class="card-head">
          <div class="card-head-text">
            <h2 class="card-title">Umur piutang per ember</h2>
            <span class="card-note">Ember ordinal memakai satu rona; makin tua makin pekat</span>
          </div>
        </div>
        <div class="card-body">
          <div class="chart" data-chart="aging-lg"></div>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <div class="card-head-text">
            <h2 class="card-title">Faktur lewat jatuh tempo</h2>
            <span class="card-note">Diurutkan dari keterlambatan terlama</span>
          </div>
          <div class="card-tools"><button class="btn btn-sm" data-nav="faktur">Semua faktur</button></div>
        </div>
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr><th>Nomor</th><th>Pelanggan</th><th class="ta-r">Nilai</th><th>Jatuh tempo</th><th class="ta-r">Terlambat</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${late.map((r) => `
                <tr data-invoice="${esc(r.id)}">
                  <td class="code cell-strong">${esc(r.id)}</td>
                  <td class="cell-strong">${esc(r.customer)}</td>
                  <td class="ta-r num">${FMT.rpCompact(r.amount - r.paid)}</td>
                  <td class="num">${FMT.date(r.dueDate)}</td>
                  <td class="ta-r num neg">${r.overdue} hari</td>
                  <td>${pill(r.status)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </article>`;
  }

  /* ====================================================================== */
  /* Matriks peran & izin                                                    */
  /* ====================================================================== */
  const PERM_LEVELS = { full: { icon: 'check', label: 'Ubah & setujui' }, read: { icon: 'eye', label: 'Lihat saja' }, none: { icon: 'minus', label: 'Tanpa akses' } };

  function renderRoles() {
    return `
      <div class="page-head">
        <div class="page-head-text">
          <h1 class="page-title">Peran &amp; Izin</h1>
          <p class="page-sub">Klik sel untuk berputar antara ubah &amp; setujui, lihat saja, dan tanpa akses. Perubahan berlaku bagi semua pengguna dalam peran tersebut.</p>
        </div>
        <div class="page-actions">
          <button class="btn" data-action="demo">${icon('external')} Jejak audit</button>
          <button class="btn btn-primary" data-action="demo">${icon('plus')} Peran baru</button>
        </div>
      </div>

      <article class="card">
        <div class="card-head">
          <div class="card-head-text">
            <h2 class="card-title">Matriks izin</h2>
            <span class="card-note">${DATA.roles.length} peran · ${DATA.permissions.reduce((s, g) => s + g.rows.length, 0)} kewenangan</span>
          </div>
          <div class="card-tools">
            <span class="chart-legend">
              ${Object.entries(PERM_LEVELS).map(([lv, m]) => `<span class="chart-legend-item"><span class="perm" data-level="${lv}" style="cursor:default">${icon(m.icon)}</span>${esc(m.label)}</span>`).join('')}
            </span>
          </div>
        </div>
        <div class="table-scroll">
          <table class="matrix">
            <thead>
              <tr>
                <th>Kewenangan</th>
                ${DATA.roles.map((r) => `<th>${esc(r.label)}<br><span class="muted" style="font-weight:400">${r.users} pengguna</span></th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${DATA.permissions.map((g) => `
                <tr class="matrix-row-group"><th>${esc(g.group)}</th>${DATA.roles.map(() => '<td></td>').join('')}</tr>
                ${g.rows.map((row, ri) => `
                  <tr>
                    <th>${esc(row.label)}</th>
                    ${DATA.roles.map((role) => {
                      const lv = row.by[role.id];
                      const m = PERM_LEVELS[lv];
                      return `<td><button class="perm" data-level="${lv}" data-perm="${esc(g.group)}|${ri}|${role.id}" aria-label="${esc(row.label)} — ${esc(role.label)}: ${esc(m.label)}" title="${esc(m.label)}">${icon(m.icon)}</button></td>`;
                    }).join('')}
                  </tr>`).join('')}`).join('')}
            </tbody>
          </table>
        </div>
      </article>`;
  }

  /* ====================================================================== */
  /* Pengaturan                                                              */
  /* ====================================================================== */
  function renderSettings() {
    const row = (name, note, control) => `
      <div class="setting-row">
        <div class="setting-text"><span class="setting-name">${name}</span><span class="setting-note">${note}</span></div>
        <div class="setting-control">${control}</div>
      </div>`;
    const sw = (on, action) => `<label class="switch"><input type="checkbox" ${on ? 'checked' : ''} data-action="${action}"><span class="switch-track"></span><span class="switch-thumb"></span></label>`;

    return `
      <div class="page-head">
        <div class="page-head-text">
          <h1 class="page-title">Pengaturan</h1>
          <p class="page-sub">Profil perusahaan, kebijakan dokumen, dan preferensi tampilan.</p>
        </div>
        <div class="page-actions">
          <button class="btn" data-action="demo">Batalkan perubahan</button>
          <button class="btn btn-primary" data-action="save-settings">${icon('check')} Simpan</button>
        </div>
      </div>

      <section class="grid grid-1-2">
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Profil perusahaan</h2></div></div>
          <div class="card-body">
            <div class="field"><label for="set-nama">Nama badan usaha</label><input class="input" id="set-nama" value="${esc(DATA.org.company)}"></div>
            <div class="field"><label for="set-npwp">NPWP</label><input class="input num" id="set-npwp" value="01.234.567.8-052.000"></div>
            <div class="field"><label for="set-alamat">Alamat pusat</label><textarea class="textarea" id="set-alamat" rows="3">Jl. Industri Raya No. 42, Kawasan Industri Jababeka, Cikarang, Bekasi 17530</textarea></div>
            <div class="field"><label for="set-mata">Mata uang pelaporan</label>
              <select class="select" id="set-mata"><option>IDR — Rupiah</option><option>USD — Dolar Amerika</option><option>SGD — Dolar Singapura</option></select>
            </div>
          </div>
        </article>

        <div class="grid" style="gap:var(--sp-4)">
          <article class="card">
            <div class="card-head"><div class="card-head-text"><h2 class="card-title">Kebijakan dokumen</h2><span class="card-note">Berlaku untuk semua cabang</span></div></div>
            <div class="card-body" style="gap:0">
              ${row('Wajib persetujuan di atas ambang', 'Pesanan penjualan di atas nilai ini memerlukan persetujuan manajer.', '<input class="input input-num" style="width:150px" value="150.000.000">')}
              ${row('Blokir pesanan bila plafon terlampaui', 'Pesanan tidak dapat dikirim ketika plafon kredit pelanggan sudah habis.', sw(true, 'toggle'))}
              ${row('Kunci periode setelah tutup buku', 'Mencegah jurnal mundur ke periode yang sudah ditutup.', sw(true, 'toggle'))}
              ${row('Nomor dokumen otomatis', 'Format SO-YYYY-NNNN untuk pesanan penjualan.', sw(true, 'toggle'))}
              ${row('Izinkan pengiriman sebagian', 'Gudang boleh mengirim sebagian kuantitas pesanan.', sw(false, 'toggle'))}
            </div>
          </article>

          <article class="card">
            <div class="card-head"><div class="card-head-text"><h2 class="card-title">Tampilan</h2></div></div>
            <div class="card-body" style="gap:0">
              ${row('Tema', 'Mengikuti sistem, atau kunci ke terang / gelap.', `
                <div class="segmented" role="group" aria-label="Tema">
                  <button data-theme-set="light" aria-pressed="${state.theme === 'light'}">Terang</button>
                  <button data-theme-set="dark" aria-pressed="${state.theme === 'dark'}">Gelap</button>
                  <button data-theme-set="system" aria-pressed="${state.theme === 'system'}">Sistem</button>
                </div>`)}
              ${row('Kerapatan tabel', 'Purwarupa ini memakai kerapatan padat sebagai bawaan.', `
                <div class="segmented" role="group" aria-label="Kerapatan">
                  <button aria-pressed="true">Padat</button><button aria-pressed="false">Longgar</button>
                </div>`)}
              ${row('Format angka', 'Pemisah ribuan titik, desimal koma (id-ID).', '<span class="num muted">1.234.567,89</span>')}
            </div>
          </article>
        </div>
      </section>`;
  }

  /* ====================================================================== */
  /* Halaman sistem desain                                                   */
  /* ====================================================================== */
  function renderDesignSystem() {
    const group = (title, note, tokens) => `
      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">${esc(title)}</h2><span class="card-note">${esc(note)}</span></div></div>
        <div class="card-body">
          <div class="swatches">
            ${tokens.map((t) => `
              <div class="swatch">
                <div class="swatch-chip" style="background:var(${t})"></div>
                <span class="swatch-name code">${esc(t)}</span>
              </div>`).join('')}
          </div>
        </div>
      </article>`;

    const typeRow = (label, cls, style, sample) => `
      <div class="setting-row">
        <div class="setting-text"><span class="setting-name">${esc(label)}</span><span class="setting-note code">${esc(style)}</span></div>
        <div class="setting-control"><span class="${cls}" style="${style}">${esc(sample)}</span></div>
      </div>`;

    return `
      <div class="page-head">
        <div class="page-head-text">
          <h1 class="page-title">Sistem Desain</h1>
          <p class="page-sub">Token, tipografi, dan komponen yang menyusun purwarupa ini. Semua warna komponen mengambil token, sehingga tema terang dan gelap selalu terselesaikan sebagai satu set.</p>
        </div>
      </div>

      <section class="grid grid-1-1">
        ${group('Merek — petrol teal', 'Satu rona merek; aksi utama memakai brand-600 di terang.', ['--brand-100', '--brand-300', '--brand-500', '--brand-600', '--brand-800'])}
        ${group('Netral — graphite berbias petrol', 'Netral dipilih, bukan abu-abu murni bawaan.', ['--canvas', '--surface-2', '--surface-3', '--line', '--ink-3', '--ink'])}
      </section>

      <section class="grid grid-1-1">
        ${group('Semantik status', 'Terpisah penuh dari merek dan dari palet grafik; selalu tampil bersama ikon dan teks.', ['--ok', '--warn', '--danger', '--info'])}
        ${group('Kategorikal grafik', 'Urutan tetap, lolos pemeriksaan CVD, chroma, dan kontras pada kedua tema.', ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5'])}
      </section>

      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Ramp sekuensial</h2><span class="card-note">Satu rona, terang ke gelap — dipakai untuk ember ordinal seperti umur piutang</span></div></div>
        <div class="card-body">
          <div class="stackbar">
            ${['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5'].map((t) => `<div class="stackbar-seg" style="flex:1;background:var(${t})"></div>`).join('')}
          </div>
          <div class="chart-legend">
            ${['Lancar', '1–30', '31–60', '61–90', '>90'].map((l) => `<span class="chart-legend-item">${esc(l)}</span>`).join('')}
          </div>
        </div>
      </article>

      <article class="card">
        <div class="card-head"><div class="card-head-text"><h2 class="card-title">Tipografi</h2><span class="card-note">Dua peran: grotesk sistem untuk antarmuka, monospace untuk setiap angka dan kode dokumen</span></div></div>
        <div class="card-body" style="gap:0">
          ${typeRow('Judul halaman', '', 'font-size:var(--fs-h1);font-weight:660;letter-spacing:var(--ls-tight)', 'Pesanan Penjualan')}
          ${typeRow('Judul kartu', '', 'font-size:var(--fs-sm);font-weight:650', 'Pendapatan terhadap target')}
          ${typeRow('Teks antarmuka', '', 'font-size:var(--fs-base)', 'Pesanan melebihi plafon kredit pelanggan.')}
          ${typeRow('Angka & nilai', 'num', 'font-size:var(--fs-metric);font-weight:600;letter-spacing:-0.02em', 'Rp 4,82 M')}
          ${typeRow('Kode dokumen', 'code', 'font-size:var(--fs-cap)', 'SO-2026-0418')}
          ${typeRow('Label mikro', 'micro', 'font-size:var(--fs-micro)', 'JATUH TEMPO')}
        </div>
      </article>

      <section class="grid grid-1-1">
        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Kendali</h2></div></div>
          <div class="card-body">
            <div class="page-actions">
              <button class="btn btn-primary">${icon('plus')} Utama</button>
              <button class="btn">Sekunder</button>
              <button class="btn btn-ghost">Halus</button>
              <button class="btn btn-danger">${icon('x')} Tolak</button>
              <button class="btn" disabled>Nonaktif</button>
            </div>
            <div class="chips">
              <button class="chip" aria-pressed="true">Terpilih <span class="chip-count">12</span></button>
              <button class="chip" aria-pressed="false">Tidak terpilih <span class="chip-count">48</span></button>
            </div>
            <div class="field"><label for="ds-input">Kolom isian</label><input class="input" id="ds-input" placeholder="Ketik di sini…"></div>
            <div class="page-actions">
              <label class="check"><input type="checkbox" checked> Kotak centang</label>
              <label class="switch"><input type="checkbox" checked><span class="switch-track"></span><span class="switch-thumb"></span></label>
              <div class="segmented"><button aria-pressed="true">Grafik</button><button aria-pressed="false">Tabel</button></div>
            </div>
          </div>
        </article>

        <article class="card">
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Status</h2><span class="card-note">Bentuk dan teks membawa keadaan, bukan warna sendirian</span></div></div>
          <div class="card-body">
            <div class="chips">
              ${['draf', 'menunggu', 'disetujui', 'dikirim', 'selesai', 'batal'].map(pill).join('')}
            </div>
            <div class="chips">
              ${['aman', 'menipis', 'habis', 'lunas', 'jatuh-tempo'].map(pill).join('')}
            </div>
            <div class="worklist" style="border:1px solid var(--line);border-radius:var(--r-sm)">
              <div class="worklist-item" style="cursor:default">
                <span class="wl-icon" data-tone="danger">${icon('alert')}</span>
                <span class="worklist-body">
                  <span class="worklist-title">Stok Pelat baja SPHC 3mm kritis</span>
                  <span class="worklist-meta">Sisa 42 lbr dari minimum 250 lbr</span>
                </span>
              </div>
            </div>
          </div>
        </article>
      </section>`;
  }

  /* ====================================================================== */
  /* Arketipe 3 — Rekaman (laci)                                             */
  /* ====================================================================== */
  function orderLines(id) {
    return DATA.salesOrderLines[id] || DATA.defaultLines;
  }

  function lineTotals(lines) {
    const sub = lines.reduce((s, l) => s + l.qty * l.price * (1 - l.disc / 100), 0);
    const ppn = sub * 0.11;
    return { sub, ppn, total: sub + ppn };
  }

  function salesOrderDrawer(row) {
    const lines = orderLines(row.id);
    const { sub, ppn, total } = lineTotals(lines);
    const tl = DATA.orderTimeline[row.id] || DATA.defaultTimeline;
    const cust = DATA.customers.find((c) => c.name === row.customer);
    const pending = row.status === 'menunggu';

    return {
      eyebrow: `<span class="code">${esc(row.id)}</span>${pill(row.status)}`,
      title: esc(row.customer),
      subtitle: `${FMT.rpCompact(total)} · dibuat ${FMT.date(row.date)} oleh ${esc(row.pic)}`,
      body: `
        ${pending ? `
          <div class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)">
            <div style="display:flex;gap:var(--sp-3);align-items:flex-start">
              <span class="wl-icon" data-tone="warn">${icon('alert')}</span>
              <div class="setting-text">
                <span class="setting-name">Perlu keputusan Anda</span>
                <span class="setting-note">${cust && cust.used > cust.limit * 0.9
                  ? `Pemakaian plafon ${esc(row.customer)} sudah ${FMT.pct((cust.used / cust.limit) * 100, 0)}. Menyetujui pesanan ini akan melampaui plafon kredit.`
                  : 'Nilai pesanan melebihi wewenang pembuat dokumen.'}</span>
              </div>
            </div>
          </div>` : ''}

        <div class="section">
          <span class="section-title">Rincian pesanan</span>
          <dl class="deflist">
            <dt>Pelanggan</dt><dd>${esc(row.customer)}</dd>
            <dt>Kanal</dt><dd>${esc(row.channel)}</dd>
            <dt>Tanggal pesan</dt><dd class="num">${FMT.date(row.date)}</dd>
            <dt>Jatuh tempo</dt><dd class="num">${FMT.date(row.due)}</dd>
            <dt>Termin</dt><dd class="num">${esc(cust ? cust.terms : 'Net 30')}</dd>
            <dt>Gudang kirim</dt><dd>${esc(DATA.org.branch)}</dd>
            <dt>Penanggung jawab</dt><dd>${esc(row.pic)}</dd>
          </dl>
        </div>

        ${cust ? `
        <div class="section">
          <span class="section-title">Posisi kredit pelanggan</span>
          <div class="meter" style="min-width:0">
            <span class="meter-track" style="height:8px">
              <span class="meter-fill" ${cust.used / cust.limit >= 0.95 ? 'data-tone="danger"' : cust.used / cust.limit >= 0.8 ? 'data-tone="warn"' : ''} style="width:${Math.min(100, (cust.used / cust.limit) * 100)}%"></span>
            </span>
            <span class="meter-val">${FMT.pct((cust.used / cust.limit) * 100, 0)}</span>
          </div>
          <div class="totals">
            <div class="totals-row"><span>Plafon kredit</span><b>${FMT.rp(cust.limit)}</b></div>
            <div class="totals-row"><span>Terpakai</span><b>${FMT.rp(cust.used)}</b></div>
            <div class="totals-row"><span>Sisa plafon</span><b class="${cust.limit - cust.used < row.amount ? 'neg' : ''}">${FMT.rp(cust.limit - cust.used)}</b></div>
          </div>
        </div>` : ''}

        <div class="section">
          <span class="section-title">Baris barang (${lines.length})</span>
          <div class="lines">
            <div class="table-scroll">
              <table class="table">
                <thead><tr><th>Barang</th><th class="ta-r">Qty</th><th class="ta-r">Harga</th><th class="ta-r">Jumlah</th></tr></thead>
                <tbody>
                  ${lines.map((l) => `
                    <tr>
                      <td><span class="cell-strong">${esc(l.name)}</span><span class="cell-sub code">${esc(l.sku)}${l.disc ? ` · diskon ${l.disc}%` : ''}</span></td>
                      <td class="ta-r num">${FMT.int(l.qty)} ${esc(l.unit)}</td>
                      <td class="ta-r num">${FMT.rpCompact(l.price)}</td>
                      <td class="ta-r num">${FMT.rpCompact(l.qty * l.price * (1 - l.disc / 100))}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div class="totals">
            <div class="totals-row"><span>Subtotal</span><b>${FMT.rp(sub)}</b></div>
            <div class="totals-row"><span>PPN 11%</span><b>${FMT.rp(ppn)}</b></div>
            <div class="totals-row totals-grand"><span>Total</span><b>${FMT.rp(total)}</b></div>
          </div>
        </div>

        <div class="section">
          <span class="section-title">Linimasa</span>
          <div class="timeline">
            ${tl.map((t) => `
              <div class="tl-item">
                <span class="tl-rail"><i class="tl-node" data-tone="${t.tone}"></i><i class="tl-line"></i></span>
                <span class="tl-body"><span class="tl-title">${t.title}</span><span class="tl-meta">${esc(t.meta)}</span></span>
              </div>`).join('')}
          </div>
        </div>`,
      foot: pending
        ? `<button class="btn btn-primary" data-action="approve-so" data-id="${esc(row.id)}">${icon('check')} Setujui pesanan</button>
           <button class="btn btn-danger" data-action="reject-so" data-id="${esc(row.id)}">${icon('x')} Tolak</button>
           <div class="toolbar-spacer"></div>
           <button class="btn btn-ghost" data-action="demo">${icon('edit')} Ubah</button>`
        : `<button class="btn" data-action="demo">${icon('print')} Cetak</button>
           <button class="btn" data-action="demo">${icon('edit')} Ubah</button>
           <div class="toolbar-spacer"></div>
           <button class="btn btn-ghost" data-action="demo">${icon('external')} Buka rekaman penuh</button>`,
    };
  }

  function genericDrawer(cfg, row) {
    const title = row.name || row.customer || row.supplier || row.desc || row[cfg.key];
    return {
      eyebrow: `<span class="code">${esc(row[cfg.key])}</span>${cfg.statusKey ? pill(row[cfg.statusKey]) : ''}`,
      title: esc(title),
      subtitle: esc(cfg.title),
      body: `
        <div class="section">
          <span class="section-title">Rincian</span>
          <dl class="deflist">
            ${cfg.columns.filter((c) => c.key !== cfg.statusKey).map((c) => {
              const raw = c.value ? c.value(row) : row[c.key];
              const val = typeof raw === 'number' && /amount|cost|nilai|limit|debit|credit|sisa|used/.test(c.key)
                ? FMT.rp(raw)
                : (c.key.includes('date') || ['date', 'due', 'eta', 'join', 'dueDate'].includes(c.key)) && typeof raw === 'string' && raw.includes('-')
                  ? FMT.date(raw)
                  : typeof raw === 'number' ? FMT.int(raw) : String(raw ?? '—');
              return `<dt>${esc(c.label)}</dt><dd>${esc(val)}</dd>`;
            }).join('')}
          </dl>
        </div>
        <div class="section">
          <span class="section-title">Linimasa</span>
          <div class="timeline">
            ${DATA.defaultTimeline.map((t) => `
              <div class="tl-item">
                <span class="tl-rail"><i class="tl-node" data-tone="${t.tone}"></i><i class="tl-line"></i></span>
                <span class="tl-body"><span class="tl-title">${t.title}</span><span class="tl-meta">${esc(t.meta)}</span></span>
              </div>`).join('')}
          </div>
        </div>`,
      foot: `<button class="btn" data-action="demo">${icon('print')} Cetak</button>
             <button class="btn" data-action="demo">${icon('edit')} Ubah</button>
             <div class="toolbar-spacer"></div>
             <button class="btn btn-ghost" data-action="demo">${icon('external')} Buka rekaman penuh</button>`,
    };
  }

  function workOrderDrawer(w) {
    return {
      eyebrow: `<span class="code">${esc(w.id)}</span><span class="pill" data-tone="${w.col === 'selesai' ? 'ok' : w.col === 'berjalan' ? 'accent' : w.col === 'qc' ? 'info' : ''}"><i class="pill-dot"></i>${esc(DATA.workOrderColumns.find((c) => c.id === w.col).label)}</span>`,
      title: esc(w.product),
      subtitle: `${FMT.int(w.qty)} ${esc(w.unit)} · ${esc(w.line)}`,
      body: `
        ${w.flag ? `
          <div class="section" style="background:var(--warn-soft);border-bottom:1px solid var(--warn-line)">
            <div style="display:flex;gap:var(--sp-3);align-items:flex-start">
              <span class="wl-icon" data-tone="warn">${icon('alert')}</span>
              <div class="setting-text"><span class="setting-name">${esc(w.flag)}</span>
              <span class="setting-note">Periksa ketersediaan bahan sebelum melanjutkan lini.</span></div>
            </div>
          </div>` : ''}
        <div class="section">
          <span class="section-title">Rincian perintah kerja</span>
          <dl class="deflist">
            <dt>Produk</dt><dd>${esc(w.product)}</dd>
            <dt>Kuantitas</dt><dd class="num">${FMT.int(w.qty)} ${esc(w.unit)}</dd>
            <dt>Lini produksi</dt><dd>${esc(w.line)}</dd>
            <dt>Penanggung jawab</dt><dd>${esc(w.pic)}</dd>
            <dt>Tenggat</dt><dd class="num">${esc(w.due)} 2026</dd>
          </dl>
        </div>
        <div class="section">
          <span class="section-title">Kemajuan</span>
          <div class="meter" style="min-width:0">
            <span class="meter-track" style="height:8px"><span class="meter-fill" style="width:${w.progress}%"></span></span>
            <span class="meter-val">${w.progress}%</span>
          </div>
          <div class="totals">
            <div class="totals-row"><span>Selesai</span><b>${FMT.int(Math.round((w.qty * w.progress) / 100))} ${esc(w.unit)}</b></div>
            <div class="totals-row"><span>Sisa</span><b>${FMT.int(w.qty - Math.round((w.qty * w.progress) / 100))} ${esc(w.unit)}</b></div>
          </div>
        </div>`,
      foot: `<button class="btn btn-primary" data-action="demo">${icon('check')} Catat hasil produksi</button>
             <div class="toolbar-spacer"></div>
             <button class="btn btn-ghost" data-action="demo">${icon('external')} Buka rekaman penuh</button>`,
    };
  }

  /* ====================================================================== */
  /* Lapisan overlay: laci, modal, palet, popover                            */
  /* ====================================================================== */
  const overlays = () => $('#overlays');

  function closeOverlay() {
    overlays().innerHTML = '';
    state.overlay = null;
    if (state.lastFocus && state.lastFocus.isConnected) state.lastFocus.focus();
    state.lastFocus = null;
  }

  function openDrawer(content) {
    state.lastFocus = document.activeElement;
    state.overlay = { kind: 'drawer' };
    overlays().innerHTML = `
      <div class="scrim" data-close></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(content.title)}">
        <header class="drawer-head">
          <div class="drawer-head-top">
            <div style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:var(--sp-2)">
              <div class="drawer-eyebrow">${content.eyebrow}</div>
              <h2 class="drawer-title">${content.title}</h2>
              <span class="card-note">${content.subtitle}</span>
            </div>
            <button class="btn btn-icon btn-ghost" data-close aria-label="Tutup">${icon('x')}</button>
          </div>
        </header>
        <div class="drawer-body">${content.body}</div>
        <footer class="drawer-foot">${content.foot}</footer>
      </aside>`;
    $('.drawer .btn', overlays())?.focus();
  }

  function openNewOrderModal() {
    state.lastFocus = document.activeElement;
    state.overlay = { kind: 'modal' };
    const lines = DATA.defaultLines;
    const { sub, ppn, total } = lineTotals(lines);

    overlays().innerHTML = `
      <div class="scrim" data-close></div>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal-head">
          <div style="flex:1 1 auto">
            <h2 class="modal-title" id="modal-title">Pesanan penjualan baru</h2>
            <span class="card-note">Nomor akan dibuat otomatis saat disimpan</span>
          </div>
          <button class="btn btn-icon btn-ghost" data-close aria-label="Tutup">${icon('x')}</button>
        </header>
        <div class="modal-body">
          <div class="form-grid">
            <div class="field">
              <label for="so-cust">Pelanggan</label>
              <select class="select" id="so-cust">
                ${DATA.customers.filter((c) => c.status === 'aktif').map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}
              </select>
              <span class="field-hint" data-credit-hint></span>
            </div>
            <div class="field"><label for="so-date">Tanggal pesan</label><input class="input num" id="so-date" type="date" value="2026-08-14"></div>
            <div class="field"><label for="so-due">Jatuh tempo</label><input class="input num" id="so-due" type="date" value="2026-09-13"></div>
            <div class="field">
              <label for="so-channel">Kanal</label>
              <select class="select" id="so-channel"><option>Langsung</option><option>Distributor</option><option>Kontrak</option></select>
            </div>
            <div class="field">
              <label for="so-wh">Gudang kirim</label>
              <select class="select" id="so-wh">${DATA.org.branches.map((b) => `<option ${b === DATA.org.branch ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
            </div>
            <div class="field"><label for="so-ref">Nomor PO pelanggan</label><input class="input code" id="so-ref" placeholder="Opsional"></div>
            <div class="field form-grid-full">
              <label>Baris barang</label>
              <div class="lines">
                <div class="table-scroll">
                  <table class="table">
                    <thead><tr><th>Barang</th><th class="ta-r">Qty</th><th class="ta-r">Harga</th><th class="ta-r">Jumlah</th><th></th></tr></thead>
                    <tbody>
                      ${lines.map((l) => `
                        <tr>
                          <td><span class="cell-strong">${esc(l.name)}</span><span class="cell-sub code">${esc(l.sku)}</span></td>
                          <td class="ta-r num">${FMT.int(l.qty)} ${esc(l.unit)}</td>
                          <td class="ta-r num">${FMT.rpCompact(l.price)}</td>
                          <td class="ta-r num">${FMT.rpCompact(l.qty * l.price)}</td>
                          <td class="ta-r"><button class="btn btn-sm btn-icon btn-ghost" data-action="demo" aria-label="Hapus baris">${icon('x')}</button></td>
                        </tr>`).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
              <button class="btn btn-sm" data-action="demo" style="align-self:flex-start">${icon('plus')} Tambah baris</button>
            </div>
            <div class="field form-grid-full">
              <div class="totals">
                <div class="totals-row"><span>Subtotal</span><b>${FMT.rp(sub)}</b></div>
                <div class="totals-row"><span>PPN 11%</span><b>${FMT.rp(ppn)}</b></div>
                <div class="totals-row totals-grand"><span>Total</span><b>${FMT.rp(total)}</b></div>
              </div>
            </div>
            <div class="field form-grid-full"><label for="so-note">Catatan internal</label><textarea class="textarea" id="so-note" rows="2" placeholder="Terlihat oleh tim gudang dan keuangan"></textarea></div>
          </div>
        </div>
        <footer class="modal-foot">
          <button class="btn btn-primary" data-action="submit-so" data-mode="kirim">${icon('check')} Kirim untuk persetujuan</button>
          <button class="btn" data-action="submit-so" data-mode="draf">Simpan sebagai draf</button>
          <div class="toolbar-spacer"></div>
          <button class="btn btn-ghost" data-close>Batal</button>
        </footer>
      </div>`;

    const updateHint = () => {
      const name = $('#so-cust').value;
      const c = DATA.customers.find((x) => x.name === name);
      const hint = $('[data-credit-hint]');
      if (!c || !hint) return;
      const share = (c.used / c.limit) * 100;
      hint.textContent = `Sisa plafon ${FMT.rp(c.limit - c.used)} · terpakai ${FMT.pct(share, 0)} · termin ${c.terms}`;
      hint.className = share >= 90 ? 'field-hint neg' : 'field-hint';
    };
    $('#so-cust').addEventListener('change', updateHint);
    updateHint();
    $('#so-cust').focus();
  }

  function openPalette() {
    state.lastFocus = document.activeElement;
    state.overlay = { kind: 'palette', index: 0 };
    overlays().innerHTML = `
      <div class="scrim" data-close></div>
      <div class="palette" role="dialog" aria-modal="true" aria-label="Cari dan lompat">
        <div class="palette-input-wrap">
          ${icon('search')}
          <input class="palette-input" id="palette-input" type="text" placeholder="Cari halaman, pesanan, pelanggan, atau barang…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="palette-results">
          <span class="kbd">Esc</span>
        </div>
        <div class="palette-results" id="palette-results" role="listbox"></div>
        <div class="palette-foot">
          <span>↑ ↓ untuk memilih</span><span>Enter untuk membuka</span><span>Esc untuk menutup</span>
        </div>
      </div>`;
    const input = $('#palette-input');
    input.addEventListener('input', () => renderPaletteResults(input.value));
    renderPaletteResults('');
    input.focus();
  }

  function paletteItems(q) {
    const query = q.trim().toLowerCase();
    const match = (s) => !query || String(s).toLowerCase().includes(query);
    const groups = [];

    const pages = DATA.nav.flatMap((g) => g.items)
      .filter((i) => match(i.label))
      .map((i) => ({ label: i.label, hint: navGroupOf(i.id), icon: i.icon, go: () => setView(i.id) }));
    if (pages.length) groups.push({ label: 'Halaman', items: pages.slice(0, 6) });

    if (query) {
      const so = DATA.salesOrders.filter((r) => match(r.id) || match(r.customer)).slice(0, 5)
        .map((r) => ({ label: `${r.id} — ${r.customer}`, hint: FMT.rpCompact(r.amount), icon: 'cart', go: () => { setView('pesanan-penjualan'); openDrawer(salesOrderDrawer(r)); } }));
      if (so.length) groups.push({ label: 'Pesanan penjualan', items: so });

      const cust = DATA.customers.filter((r) => match(r.name) || match(r.id)).slice(0, 4)
        .map((r) => ({ label: r.name, hint: r.city, icon: 'building', go: () => { setView('pelanggan'); openDrawer(genericDrawer(REGISTERS.pelanggan, r)); } }));
      if (cust.length) groups.push({ label: 'Pelanggan', items: cust });

      const items = DATA.stockItems.filter((r) => match(r.name) || match(r.sku)).slice(0, 4)
        .map((r) => ({ label: `${r.sku} — ${r.name}`, hint: `${FMT.int(r.onHand)} ${r.unit}`, icon: 'boxes', go: () => { setView('stok'); } }));
      if (items.length) groups.push({ label: 'Stok barang', items });

      const leads = DATA.leads.filter((r) => match(r.name) || match(r.company) || match(r.id)).slice(0, 4)
        .map((r) => ({ label: `${r.id} — ${r.company}`, hint: FMT.rpCompact(r.value), icon: 'target', go: () => setView('lead') }));
      if (leads.length) groups.push({ label: 'Peluang CRM', items: leads });

      const prj = DATA.projects.filter((r) => match(r.name) || match(r.id) || match(r.customer)).slice(0, 4)
        .map((r) => ({ label: r.name, hint: `${r.progress}%`, icon: 'gantt', go: () => setView('proyek') }));
      if (prj.length) groups.push({ label: 'Proyek', items: prj });

      const ast = DATA.assets.filter((r) => match(r.name) || match(r.id) || match(r.category)).slice(0, 4)
        .map((r) => ({ label: `${r.id} — ${r.name}`, hint: FMT.rpCompact(r.bookValue), icon: 'landmark', go: () => setView('aset') }));
      if (ast.length) groups.push({ label: 'Aset', items: ast });

      const docs = DATA.documents.filter((r) => match(r.name) || match(r.id) || match(r.type)).slice(0, 4)
        .map((r) => ({ label: r.name, hint: r.type, icon: 'folder', go: () => setView('dokumen') }));
      if (docs.length) groups.push({ label: 'Dokumen', items: docs });
    } else {
      groups.push({
        label: 'Tindakan cepat',
        items: [
          { label: 'Buat pesanan penjualan', hint: 'Ctrl N', icon: 'plus', go: () => openNewOrderModal() },
          { label: 'Lihat persetujuan tertunda', hint: '5 dokumen', icon: 'check', go: () => setView('dasbor') },
          { label: 'Ganti tema tampilan', hint: state.theme, icon: 'sun', go: () => setView('pengaturan') },
        ],
      });
    }
    return groups;
  }

  function renderPaletteResults(q) {
    const groups = paletteItems(q);
    const box = $('#palette-results');
    if (!box) return;
    let idx = 0;
    const flat = [];
    box.innerHTML = groups.length ? groups.map((g) => `
      <div class="palette-group-label">${esc(g.label)}</div>
      ${g.items.map((it) => {
        const i = idx++;
        flat.push(it);
        return `<button class="palette-item" role="option" data-pi="${i}" data-active="${i === 0}" aria-selected="${i === 0}">
          ${icon(it.icon)}<span class="palette-item-text">${esc(it.label)}</span><span class="palette-item-hint">${esc(it.hint || '')}</span>
        </button>`;
      }).join('')}`).join('') : `
      <div class="empty"><div class="empty-card">
        <span class="empty-title">Tidak ditemukan</span>
        <span class="empty-note">Coba nomor dokumen, nama pelanggan, atau kode barang.</span>
      </div></div>`;
    state.overlay.flat = flat;
    state.overlay.index = 0;
  }

  function movePalette(delta) {
    const items = $$('.palette-item');
    if (!items.length) return;
    state.overlay.index = (state.overlay.index + delta + items.length) % items.length;
    items.forEach((el, i) => {
      const on = i === state.overlay.index;
      el.dataset.active = on;
      el.setAttribute('aria-selected', on);
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function runPalette(i) {
    const item = state.overlay.flat?.[i];
    if (!item) return;
    closeOverlay();
    item.go();
  }

  function openPopover(anchor, html) {
    state.lastFocus = document.activeElement;
    state.overlay = { kind: 'popover' };
    overlays().innerHTML = `<div class="scrim" data-close style="background:transparent"></div>${html}`;
    const pop = $('.popover', overlays());
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${r.bottom + 8}px`;
    const right = Math.max(8, window.innerWidth - r.right);
    pop.style.right = `${Math.min(right, window.innerWidth - 16 - pop.offsetWidth)}px`;
  }

  function openNotifications(anchor) {
    openPopover(anchor, `
      <div class="popover" role="dialog" aria-label="Notifikasi">
        <div class="popover-head">
          <h2 class="card-title">Notifikasi</h2>
          <button class="btn btn-sm btn-ghost" data-action="read-all">Tandai terbaca</button>
        </div>
        <div class="worklist">
          ${DATA.notifications.map((n) => `
            <button class="worklist-item" data-action="demo">
              <span class="wl-icon" data-tone="${n.tone}">${icon(n.tone === 'danger' || n.tone === 'warn' ? 'alert' : n.tone === 'ok' ? 'check' : 'bell')}</span>
              <span class="worklist-body">
                <span class="worklist-title">${esc(n.title)}</span>
                <span class="worklist-meta">${esc(n.note)}</span>
                <span class="worklist-meta">${esc(n.when)}</span>
              </span>
              ${n.unread ? '<span class="worklist-side"><i class="pill-dot" style="background:var(--accent);width:7px;height:7px"></i></span>' : ''}
            </button>`).join('')}
        </div>
      </div>`);
  }

  function openUserMenu(anchor) {
    const u = DATA.org.user;
    const themeItem = (val, label, ic) =>
      `<button class="menu-item" role="menuitemradio" aria-checked="${state.theme === val}" data-theme-set="${val}">${icon(ic)}<span style="flex:1">${label}</span>${state.theme === val ? icon('check') : ''}</button>`;

    openPopover(anchor, `
      <div class="popover" role="menu" aria-label="Menu pengguna">
        <div class="popover-head">
          <span class="avatar avatar-lg">${esc(u.initials)}</span>
          <div class="card-head-text">
            <span class="card-title">${esc(u.name)}</span>
            <span class="card-note">${esc(u.role)} · ${esc(u.email)}</span>
          </div>
        </div>
        <div class="menu">
          <div class="palette-group-label">Tema</div>
          ${themeItem('light', 'Terang', 'sun')}
          ${themeItem('dark', 'Gelap', 'moon')}
          ${themeItem('system', 'Ikuti sistem', 'monitor')}
          <div class="menu-sep"></div>
          <button class="menu-item" data-nav="pengaturan">${icon('gear')} Pengaturan</button>
          <button class="menu-item" data-nav="peran">${icon('shield')} Peran &amp; izin</button>
          <div class="menu-sep"></div>
          <button class="menu-item" data-action="demo">${icon('logout')} Keluar</button>
        </div>
      </div>`);
  }

  /* ====================================================================== */
  /* Toast                                                                   */
  /* ====================================================================== */
  function toast(title, note, tone = 'accent') {
    const host = $('#toasts');
    const id = `t${++state.toastSeq}`;
    const node = document.createElement('div');
    node.className = 'toast';
    node.id = id;
    node.setAttribute('role', 'status');
    if (tone !== 'accent') node.dataset.tone = tone;
    node.innerHTML = `
      <span class="wl-icon" data-tone="${tone}">${icon(tone === 'danger' ? 'alert' : 'check')}</span>
      <span class="toast-body"><span class="toast-title">${esc(title)}</span>${note ? `<span class="toast-note">${esc(note)}</span>` : ''}</span>
      <button class="btn btn-sm btn-icon btn-ghost" data-dismiss="${id}" aria-label="Tutup pemberitahuan">${icon('x')}</button>`;
    host.appendChild(node);
    setTimeout(() => node.remove(), 5000);
  }

  /* ====================================================================== */
  /* Perutean & penggambaran                                                 */
  /* ====================================================================== */
  function setView(id) {
    if (!viewExists(id)) id = 'dasbor';
    state.view = id;
    if (location.hash !== `#/${id}`) history.replaceState(null, '', `#/${id}`);
    render();
    document.querySelector('.content')?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ====================================================================== */
  /* CRM Pipeline Board                                                     */
  /* ====================================================================== */
  function renderCRMBoard() {
    const activeStages = DATA.crmStages.filter((s) => s.id !== 'menang' && s.id !== 'kalah');
    const wonLeads = DATA.leads.filter((l) => l.stage === 'menang');
    const lostLeads = DATA.leads.filter((l) => l.stage === 'kalah');
    const pipelineValue = DATA.leads.filter((l) => l.stage !== 'menang' && l.stage !== 'kalah')
      .reduce((s, l) => s + l.value, 0);
    const weightedValue = DATA.leads.filter((l) => l.stage !== 'menang' && l.stage !== 'kalah')
      .reduce((s, l) => s + l.value * l.prob / 100, 0);

    const kpis = `
      <div class="kpi-row" style="margin-bottom:var(--sp-5)">
        <div class="kpi-tile">
          <span class="kpi-label">Nilai Pipeline</span>
          <span class="kpi-metric">${FMT.rpCompact(pipelineValue)}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Tertimbang</span>
          <span class="kpi-metric">${FMT.rpCompact(weightedValue)}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Menang</span>
          <span class="kpi-metric pos">${wonLeads.length} <small>peluang</small></span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Kalah</span>
          <span class="kpi-metric neg">${lostLeads.length} <small>peluang</small></span>
        </div>
      </div>`;

    const cols = activeStages.map((stage) => {
      const items = DATA.leads.filter((l) => l.stage === stage.id);
      const stageVal = items.reduce((s, l) => s + l.value, 0);
      return `
        <div class="board-col">
          <div class="board-col-head">
            <span class="board-col-title">${esc(stage.label)}</span>
            <span class="board-col-count">${items.length} · ${FMT.rpCompact(stageVal)}</span>
          </div>
          ${items.map((l) => `
            <div class="board-card crm-card" data-lead="${esc(l.id)}">
              <div class="board-card-head">
                <span class="cell-strong" style="font-size:var(--fs-sm)">${esc(l.name)}</span>
              </div>
              <span class="cell-sub">${esc(l.company)}</span>
              <div class="crm-card-meta">
                <span class="num" style="font-weight:600">${FMT.rpCompact(l.value)}</span>
                <span class="pill" data-tone="${l.prob >= 60 ? 'ok' : l.prob >= 30 ? 'warn' : ''}"><i class="pill-dot"></i>${l.prob}%</span>
              </div>
              <div class="cell-sub" style="margin-top:var(--sp-1)">
                ${icon('users', 'icon-inline')} ${esc(l.assignee)} · ${esc(l.nextAction)}
              </div>
            </div>`).join('')}
        </div>`;
    }).join('');

    return `${kpis}<div class="board">${cols}</div>`;
  }

  /* ====================================================================== */
  /* POS / Kasir                                                             */
  /* ====================================================================== */
  function renderPOS() {
    const k = DATA.posKpis;
    const pct = Math.min(100, (k.todaySales / k.todayTarget) * 100);
    const tone = pct >= 90 ? 'ok' : pct >= 60 ? 'warn' : 'danger';

    const kpis = `
      <div class="kpi-row" style="margin-bottom:var(--sp-5)">
        <div class="kpi-tile">
          <span class="kpi-label">Penjualan Hari Ini</span>
          <span class="kpi-metric">${FMT.rpCompact(k.todaySales)}</span>
          <span class="meter" style="margin-top:var(--sp-1)"><span class="meter-track"><span class="meter-fill" data-tone="${tone}" style="width:${pct}%"></span></span><span class="meter-val">${FMT.pct(pct, 0)} target</span></span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Transaksi</span>
          <span class="kpi-metric">${FMT.int(k.transactions)}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Rata-rata Keranjang</span>
          <span class="kpi-metric">${FMT.rpCompact(k.avgBasket)}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Tingkat Refund</span>
          <span class="kpi-metric${k.refundRate > 3 ? ' neg' : ''}">${FMT.pct(k.refundRate)}%</span>
        </div>
      </div>`;

    const shifts = `
      <section class="card" style="margin-bottom:var(--sp-5)">
        <div class="card-head"><h3 class="card-title">${icon('users')} Shift Aktif</h3></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Shift</th><th>Kasir</th><th>Toko</th><th>Waktu</th><th class="r">Kas Awal</th><th class="r">Kas Saat Ini</th><th class="r">Transaksi</th><th class="r">Penjualan</th><th>Status</th></tr></thead>
          <tbody>${DATA.posShifts.map((s) => `<tr>
            <td class="code">${esc(s.id)}</td>
            <td class="cell-strong">${esc(s.cashier)}</td>
            <td>${esc(s.store)}</td>
            <td class="num">${esc(s.startTime)}–${esc(s.endTime)}</td>
            <td class="r num">${FMT.rpCompact(s.openingCash)}</td>
            <td class="r num">${FMT.rpCompact(s.currentCash)}</td>
            <td class="r num">${s.transactions}</td>
            <td class="r num">${FMT.rpCompact(s.totalSales)}</td>
            <td>${pill(s.status)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </section>`;

    const txns = `
      <section class="card">
        <div class="card-head"><h3 class="card-title">${icon('cart')} Transaksi Terakhir</h3></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>No. Transaksi</th><th>Waktu</th><th>Kasir</th><th class="r">Item</th><th class="r">Total</th><th>Pembayaran</th><th>Status</th></tr></thead>
          <tbody>${DATA.posTransactions.map((t) => `<tr>
            <td class="code cell-strong">${esc(t.id)}</td>
            <td class="num">${esc(t.time)}</td>
            <td>${esc(t.cashier)}</td>
            <td class="r num">${t.items}</td>
            <td class="r num">${FMT.rpCompact(t.total)}</td>
            <td>${esc(t.payment)}</td>
            <td>${pill(t.status)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </section>`;

    return kpis + shifts + txns;
  }

  /* ====================================================================== */
  /* Manajemen Proyek                                                        */
  /* ====================================================================== */
  function renderProjects() {
    const chips = ['semua', 'berjalan', 'perencanaan', 'selesai'];
    const filter = state.boardFilter;
    const filtered = filter === 'semua' ? DATA.projects : DATA.projects.filter((p) => p.status === filter);

    const chipBar = `<div class="chip-bar" style="margin-bottom:var(--sp-4)">${chips.map((c) =>
      `<button class="chip${c === filter ? ' on' : ''}" data-board-filter="${c}">${c === 'semua' ? 'Semua' : STATUS[c]?.label || c}</button>`
    ).join('')}</div>`;

    const cards = filtered.map((p) => {
      const budgetPct = Math.min(100, (p.actual / p.budget) * 100);
      const budgetTone = budgetPct > 90 ? 'danger' : budgetPct > 75 ? 'warn' : '';
      const tasks = DATA.projectTasks[p.id] || [];
      const ganttStart = new Date(p.startDate).getTime();
      const ganttEnd = new Date(p.endDate).getTime();
      const ganttSpan = ganttEnd - ganttStart || 1;

      const ganttBars = tasks.length ? `
        <div class="gantt" style="margin-top:var(--sp-3)">
          ${tasks.map((t) => {
            const tStart = Math.max(0, (new Date(t.start).getTime() - ganttStart) / ganttSpan * 100);
            const tWidth = Math.max(2, Math.min(100 - tStart, (new Date(t.end).getTime() - new Date(t.start).getTime()) / ganttSpan * 100));
            return `<div class="gantt-row">
              <span class="gantt-label">${esc(t.name)}</span>
              <span class="gantt-track">
                <span class="gantt-bar" style="left:${tStart}%;width:${tWidth}%">
                  <span class="gantt-fill" style="width:${t.progress}%" data-tone="${t.progress === 100 ? 'ok' : t.progress > 0 ? 'accent' : ''}"></span>
                </span>
              </span>
            </div>`;
          }).join('')}
        </div>` : '';

      return `
        <section class="card project-card" style="margin-bottom:var(--sp-4)">
          <div class="card-head" style="align-items:flex-start">
            <div>
              <h3 class="card-title">${esc(p.name)}</h3>
              <span class="cell-sub"><span class="code">${esc(p.id)}</span> · ${esc(p.customer)} · PM: ${esc(p.pm)}</span>
            </div>
            <div style="display:flex;gap:var(--sp-2);align-items:center">
              ${pill(p.health)}
              ${pill(p.status)}
            </div>
          </div>
          <div class="project-stats">
            <div>
              <span class="cell-sub">Progres</span>
              <span class="meter"><span class="meter-track"><span class="meter-fill" data-tone="${p.progress === 100 ? 'ok' : 'accent'}" style="width:${p.progress}%"></span></span><span class="meter-val">${p.progress}%</span></span>
            </div>
            <div>
              <span class="cell-sub">Anggaran</span>
              <span class="meter"><span class="meter-track"><span class="meter-fill"${budgetTone ? ` data-tone="${budgetTone}"` : ''} style="width:${budgetPct}%"></span></span><span class="meter-val">${FMT.rpCompact(p.actual)} / ${FMT.rpCompact(p.budget)}</span></span>
            </div>
            <div>
              <span class="cell-sub">Periode</span>
              <span class="num">${FMT.date(p.startDate)} — ${FMT.date(p.endDate)}</span>
            </div>
          </div>
          ${ganttBars}
        </section>`;
    }).join('');

    return chipBar + (cards || '<p class="muted" style="padding:var(--sp-5)">Tidak ada proyek pada filter ini.</p>');
  }

  /* ====================================================================== */
  /* Anggaran & Pengendalian Biaya                                           */
  /* ====================================================================== */
  function renderBudget() {
    const totalBudget = DATA.budgets.reduce((s, b) => s + b.budget, 0);
    const totalActual = DATA.budgets.reduce((s, b) => s + b.actual, 0);
    const totalForecast = DATA.budgets.reduce((s, b) => s + b.forecast, 0);
    const overallPct = (totalActual / totalBudget * 100);
    const overallTone = overallPct > 95 ? 'danger' : overallPct > 80 ? 'warn' : '';

    const kpis = `
      <div class="kpi-row" style="margin-bottom:var(--sp-5)">
        <div class="kpi-tile">
          <span class="kpi-label">Total Anggaran</span>
          <span class="kpi-metric">${FMT.rpCompact(totalBudget)}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Realisasi</span>
          <span class="kpi-metric">${FMT.rpCompact(totalActual)}</span>
          <span class="meter" style="margin-top:var(--sp-1)"><span class="meter-track"><span class="meter-fill"${overallTone ? ` data-tone="${overallTone}"` : ''} style="width:${Math.min(100, overallPct)}%"></span></span><span class="meter-val">${FMT.pct(overallPct, 1)}</span></span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Prakiraan</span>
          <span class="kpi-metric${totalForecast > totalBudget ? ' neg' : ''}">${FMT.rpCompact(totalForecast)}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Varians</span>
          <span class="kpi-metric${totalForecast > totalBudget ? ' neg' : ' pos'}">${totalForecast > totalBudget ? '+' : ''}${FMT.rpCompact(totalForecast - totalBudget)}</span>
        </div>
      </div>`;

    const rows = DATA.budgets.map((b) => {
      const usedPct = Math.min(100, b.actual / b.budget * 100);
      const commitPct = Math.min(100 - usedPct, b.commitment / b.budget * 100);
      const forecastOver = b.forecast > b.budget;
      const tone = usedPct > 90 ? 'danger' : usedPct > 75 ? 'warn' : '';
      return `<tr>
        <td class="code">${esc(b.costCenter)}</td>
        <td class="cell-strong">${esc(b.dept)}</td>
        <td>${esc(b.type)}</td>
        <td class="r num">${FMT.rpCompact(b.budget)}</td>
        <td class="r num">${FMT.rpCompact(b.actual)}</td>
        <td>
          <span class="budget-bar">
            <span class="budget-bar-track">
              <span class="budget-bar-actual"${tone ? ` data-tone="${tone}"` : ''} style="width:${usedPct}%"></span>
              <span class="budget-bar-commit" style="left:${usedPct}%;width:${commitPct}%"></span>
            </span>
            <span class="meter-val">${FMT.pct(usedPct, 0)}</span>
          </span>
        </td>
        <td class="r num">${FMT.rpCompact(b.commitment)}</td>
        <td class="r num${forecastOver ? ' neg' : ''}">${FMT.rpCompact(b.forecast)}</td>
      </tr>`;
    }).join('');

    const table = `
      <section class="card">
        <div class="card-head"><h3 class="card-title">${icon('piechart')} Realisasi per Pusat Biaya</h3></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr>
            <th>Kode</th><th>Unit Kerja</th><th>Tipe</th>
            <th class="r">Anggaran</th><th class="r">Realisasi</th>
            <th>Penyerapan</th><th class="r">Komitmen</th><th class="r">Prakiraan</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>`;

    return kpis + table;
  }

  /* ====================================================================== */
  /* Kotak Persetujuan (Approval Inbox)                                      */
  /* ====================================================================== */
  function renderApprovalInbox() {
    const items = DATA.approvals;
    const cards = items.map((a) => `
      <div class="card" style="cursor:pointer" data-approval="${a.id}">
        <div style="display:flex;align-items:flex-start;gap:var(--sp-3)">
          <span class="avatar" style="flex-shrink:0">${icon(a.icon)}</span>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-1)">
              <span class="pill" data-tone="${a.tone}"><i class="pill-dot"></i>${esc(a.kind)}</span>
              <span class="muted" style="font-size:var(--fs-cap)">${esc(a.ago)}</span>
            </div>
            <div class="cell-strong">${esc(a.title)}</div>
            <div class="muted" style="font-size:var(--fs-sm)">${esc(a.id)} · ${esc(a.reason)}</div>
            <div style="margin-top:var(--sp-2);display:flex;align-items:center;gap:var(--sp-3)">
              <span class="num" style="font-size:var(--fs-lead);font-weight:600">${FMT.rpCompact(a.amount)}</span>
              <span class="muted" style="font-size:var(--fs-cap)">oleh ${esc(a.by)}</span>
            </div>
            <div style="margin-top:var(--sp-3);display:flex;gap:var(--sp-2)">
              <button class="btn btn-sm" data-action="demo">${icon('check')} Setujui</button>
              <button class="btn btn-sm btn-ghost" data-action="demo">${icon('x')} Tolak</button>
              <button class="btn btn-sm btn-ghost" data-action="demo">${icon('eye')} Lihat</button>
            </div>
          </div>
        </div>
      </div>`).join('');

    return `
      <section>
        <div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-4)">
          <span class="kpi-icon" data-tone="accent">${icon('inbox')}</span>
          <div>
            <div style="font-size:var(--fs-h3);font-weight:600">${items.length} Dokumen Menunggu</div>
            <div class="muted" style="font-size:var(--fs-sm)">Total nilai Rp ${FMT.rpCompact(items.reduce((s, a) => s + a.amount, 0))}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--sp-3)">${cards}</div>
      </section>`;
  }

  /* ====================================================================== */
  /* Kas & Bank                                                              */
  /* ====================================================================== */
  function renderCashBank() {
    const accounts = DATA.bankAccounts;
    const totalIDR = accounts.filter((a) => a.currency === 'IDR').reduce((s, a) => s + a.balance, 0);

    const summary = `
      <div class="kpi-row">
        <div class="kpi-tile">
          <div class="kpi-label">Total Saldo IDR</div>
          <div class="kpi-value">${FMT.rpCompact(totalIDR)}</div>
          <div class="kpi-foot">${accounts.filter((a) => a.currency === 'IDR').length} rekening aktif</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-label">Belum Direkonsiliasi</div>
          <div class="kpi-value">${accounts.reduce((s, a) => s + a.unrecon, 0)}</div>
          <div class="kpi-foot">transaksi pending</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-label">Kas Kecil</div>
          <div class="kpi-value">${FMT.rpCompact(accounts.filter((a) => a.bank === 'Kas').reduce((s, a) => s + a.balance, 0))}</div>
          <div class="kpi-foot">${accounts.filter((a) => a.bank === 'Kas').length} lokasi</div>
        </div>
      </div>`;

    const rows = accounts.map((a) => `
      <tr>
        <td class="code">${esc(a.id)}</td>
        <td><span class="cell-strong">${esc(a.name)}</span><span class="cell-sub">${esc(a.bank)} · ${esc(a.accountNo)}</span></td>
        <td>${esc(a.currency)}</td>
        <td class="r"><span class="num">${a.currency === 'IDR' ? FMT.rpCompact(a.balance) : 'USD ' + FMT.int(a.balance)}</span></td>
        <td><span class="num">${FMT.date(a.lastRecon)}</span></td>
        <td class="r">${a.unrecon ? `<span class="num neg">${a.unrecon}</span>` : '<span class="muted">—</span>'}</td>
        <td>${pill(a.status)}</td>
      </tr>`).join('');

    const table = `
      <section>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr>
            <th>Kode</th><th>Nama Rekening</th><th>Mata Uang</th>
            <th class="r">Saldo</th><th>Rekonsiliasi Terakhir</th>
            <th class="r">Unrecon</th><th>Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>`;

    return summary + table;
  }

  /* ====================================================================== */
  /* Rantai Pasok (Supply Chain Overview)                                     */
  /* ====================================================================== */
  function renderSupplyChain() {
    const shipments = DATA.shipments;
    const inTransit = shipments.filter((s) => s.status === 'transit');
    const delivered = shipments.filter((s) => s.status === 'diterima');

    const summary = `
      <div class="kpi-row">
        <div class="kpi-tile">
          <div class="kpi-label">Pengiriman Aktif</div>
          <div class="kpi-value">${inTransit.length}</div>
          <div class="kpi-foot">dalam perjalanan</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-label">Total Berat Transit</div>
          <div class="kpi-value">${FMT.int(inTransit.reduce((s, sh) => s + sh.weight, 0))} kg</div>
          <div class="kpi-foot">estimasi tiba 2–3 hari</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-label">Selesai Bulan Ini</div>
          <div class="kpi-value">${delivered.length}</div>
          <div class="kpi-foot">pengiriman diterima</div>
        </div>
      </div>`;

    const rows = shipments.map((s) => `
      <tr>
        <td class="code cell-strong">${esc(s.id)}</td>
        <td><span class="num">${FMT.date(s.date)}</span></td>
        <td><span class="cell-strong">${esc(s.origin)}</span></td>
        <td><span class="cell-strong">${esc(s.destination)}</span></td>
        <td>${esc(s.carrier)}</td>
        <td class="code">${esc(s.ref)}</td>
        <td class="r"><span class="num">${FMT.int(s.weight)} kg</span></td>
        <td><span class="num">${FMT.date(s.eta)}</span></td>
        <td>${pill(s.status)}</td>
      </tr>`).join('');

    const table = `
      <section>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr>
            <th>Nomor</th><th>Tanggal</th><th>Asal</th><th>Tujuan</th>
            <th>Kurir</th><th>Referensi</th><th class="r">Berat</th>
            <th>ETA</th><th>Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>`;

    return summary + table;
  }

  /* ====================================================================== */
  /* AI Copilot floating panel                                               */
  /* ====================================================================== */
  function renderAICopilot() {
    const open = state.aiCopilotOpen;
    const messages = DATA.aiMessages || [];
    const msgHtml = messages.map((m) => {
      const cls = m.role === 'user' ? 'ai-msg ai-msg-user' : 'ai-msg ai-msg-assistant';
      /* Simple markdown-ish: bold, line breaks */
      let text = esc(m.text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
      /* Render simple tables in AI messages */
      if (m.text.includes('|')) {
        const lines = m.text.split('\n');
        let inTable = false;
        let tableHtml = '<div class="tbl-wrap" style="margin:var(--sp-2) 0"><table class="tbl tbl-sm">';
        let outLines = [];
        for (const line of lines) {
          const stripped = line.trim();
          if (stripped.startsWith('|') && stripped.endsWith('|')) {
            const cells = stripped.split('|').filter(Boolean).map((c) => c.trim());
            if (cells.every((c) => /^[-:]+$/.test(c))) continue; // separator
            if (!inTable) { inTable = true; tableHtml += '<thead><tr>' + cells.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>'; }
            else tableHtml += '<tr>' + cells.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>';
          } else {
            if (inTable) { tableHtml += '</tbody></table></div>'; outLines.push(tableHtml); inTable = false; tableHtml = '<div class="tbl-wrap" style="margin:var(--sp-2) 0"><table class="tbl tbl-sm">'; }
            outLines.push(esc(stripped).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'));
          }
        }
        if (inTable) { tableHtml += '</tbody></table></div>'; outLines.push(tableHtml); }
        text = outLines.join('<br>');
      }
      return `<div class="${cls}"><div class="ai-msg-bubble">${text}</div></div>`;
    }).join('');

    return `
      <button class="ai-fab" data-action="toggle-copilot" title="AI Copilot" aria-label="AI Copilot">
        ${icon('sparkle')}
      </button>
      ${open ? `
      <aside class="ai-panel" role="complementary" aria-label="AI Copilot">
        <div class="ai-panel-head">
          <span class="ai-panel-title">${icon('sparkle')} AI Copilot</span>
          <button class="btn-icon" data-action="toggle-copilot" title="Tutup">${icon('x')}</button>
        </div>
        <div class="ai-panel-body" id="ai-messages">${msgHtml}</div>
        <div class="ai-panel-input">
          <input type="text" class="input" placeholder="Tanyakan ke AI Copilot…" data-ai-input aria-label="Tanyakan ke AI Copilot">
          <button class="btn btn-sm" data-action="ai-send" title="Kirim">${icon('send')}</button>
        </div>
      </aside>` : ''}`;
  }

  /* ====================================================================== */
  /* Balanced Scorecard                                                      */
  /* ====================================================================== */
  function renderBSC() {
    var bsc = DATA.bscData;
    var perspectives = [
      { key: 'financial', label: 'Keuangan', icon: 'wallet', color: '#2563eb' },
      { key: 'customer', label: 'Pelanggan', icon: 'users', color: '#16a34a' },
      { key: 'internal', label: 'Proses Internal', icon: 'factory', color: '#d97706' },
      { key: 'growth', label: 'Pembelajaran & Pertumbuhan', icon: 'target', color: '#9333ea' },
    ];

    /* Compute overall score */
    var totalMetrics = 0;
    var achievedSum = 0;
    perspectives.forEach(function(p) {
      bsc[p.key].forEach(function(m) {
        totalMetrics++;
        var ratio = m.actual / m.target;
        if (ratio > 1) ratio = 1;
        achievedSum += ratio;
      });
    });
    var overallPct = Math.round((achievedSum / totalMetrics) * 100);

    /* SVG donut for overall score */
    var radius = 54;
    var circum = 2 * Math.PI * radius;
    var offset = circum - (circum * overallPct / 100);
    var scoreRing =
      '<svg viewBox="0 0 128 128" width="128" height="128" style="display:block;margin:auto">' +
      '<circle cx="64" cy="64" r="' + radius + '" fill="none" stroke="var(--border-1,#e5e7eb)" stroke-width="10"/>' +
      '<circle cx="64" cy="64" r="' + radius + '" fill="none" stroke="' + (overallPct >= 80 ? '#16a34a' : overallPct >= 60 ? '#d97706' : '#ef4444') + '" stroke-width="10" ' +
      'stroke-dasharray="' + circum + '" stroke-dashoffset="' + offset + '" stroke-linecap="round" transform="rotate(-90 64 64)"/>' +
      '<text x="64" y="60" text-anchor="middle" font-size="24" font-weight="700" fill="var(--ink-1,#111)">' + overallPct + '%</text>' +
      '<text x="64" y="78" text-anchor="middle" font-size="10" fill="var(--ink-3,#6b7280)">Skor Keseluruhan</text></svg>';

    var perspectiveCards = perspectives.map(function(p) {
      var metrics = bsc[p.key];
      var rows = metrics.map(function(m) {
        var pct = Math.min(Math.round((m.actual / m.target) * 100), 100);
        var barColor = pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#ef4444';
        var trendHtml = '<span class="bsc-trend" style="display:inline-flex;gap:1px;align-items:flex-end;height:16px">' +
          m.trend.map(function(v) {
            var h = Math.max(3, Math.round((v / m.target) * 16));
            return '<span style="width:4px;height:' + h + 'px;background:' + barColor + ';border-radius:1px;display:inline-block"></span>';
          }).join('') + '</span>';
        return '<tr>' +
          '<td>' + esc(m.metric) + '</td>' +
          '<td class="ta-r num">' + m.actual + (m.unit ? ' ' + esc(m.unit) : '') + '</td>' +
          '<td class="ta-r num">' + m.target + (m.unit ? ' ' + esc(m.unit) : '') + '</td>' +
          '<td class="ta-r"><div style="display:flex;align-items:center;gap:var(--sp-1);justify-content:flex-end">' +
          '<div style="width:64px;height:6px;background:var(--border-1,#e5e7eb);border-radius:3px;overflow:hidden">' +
          '<div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:3px"></div></div>' +
          '<span class="micro num">' + pct + '%</span></div></td>' +
          '<td class="ta-c">' + trendHtml + '</td></tr>';
      }).join('');

      return '<article class="card" style="overflow:hidden">' +
        '<div style="height:4px;background:' + p.color + '"></div>' +
        '<div class="card-head"><div class="card-head-text">' +
        '<h2 class="card-title">' + icon(p.icon) + ' ' + esc(p.label) + '</h2></div></div>' +
        '<div class="table-scroll"><table class="table"><thead><tr>' +
        '<th>Metrik</th><th class="ta-r">Aktual</th><th class="ta-r">Target</th><th class="ta-r">Pencapaian</th><th class="ta-c">Tren</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div></article>';
    }).join('');

    return '<div class="page-head"><div class="page-head-text">' +
      '<h1 class="page-title">Balanced Scorecard</h1>' +
      '<p class="page-sub">Periode ' + esc(bsc.period) + ' &middot; 4 perspektif &middot; ' + totalMetrics + ' indikator kinerja</p></div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);margin-bottom:var(--sp-4)">' +
      '<article class="card"><div class="card-body" style="text-align:center;padding:var(--sp-6)">' +
      scoreRing +
      '<p style="margin-top:var(--sp-3);font-size:var(--fs-sm);color:var(--ink-3)">Rata-rata pencapaian terhadap target seluruh perspektif</p>' +
      '</div></article>' +
      '<article class="card"><div class="card-body" style="padding:var(--sp-4)">' +
      '<h3 style="font-size:var(--fs-sm);font-weight:600;margin-bottom:var(--sp-3)">Ringkasan per Perspektif</h3>' +
      perspectives.map(function(p) {
        var metrics = bsc[p.key];
        var avg = Math.round(metrics.reduce(function(s, m) { return s + Math.min(m.actual / m.target, 1); }, 0) / metrics.length * 100);
        return '<div style="display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-2)">' +
          '<span style="width:10px;height:10px;border-radius:50%;background:' + p.color + ';flex-shrink:0"></span>' +
          '<span style="flex:1;font-size:var(--fs-sm)">' + esc(p.label) + '</span>' +
          '<div style="width:80px;height:6px;background:var(--border-1,#e5e7eb);border-radius:3px;overflow:hidden">' +
          '<div style="width:' + avg + '%;height:100%;background:' + p.color + ';border-radius:3px"></div></div>' +
          '<span class="num micro" style="width:32px;text-align:right">' + avg + '%</span></div>';
      }).join('') +
      '</div></article></div>' +
      perspectiveCards;
  }

  /* ====================================================================== */
  /* Analitik                                                                */
  /* ====================================================================== */
  function renderAnalytics() {
    var kpis = DATA.analyticsKpis;

    var kpiTiles = kpis.map(function(k) {
      var fmtVal;
      if (k.format === 'rp') fmtVal = FMT.rpCompact(k.value);
      else if (k.format === 'pct') fmtVal = FMT.pct(k.value);
      else if (k.format === 'hari') fmtVal = k.value + ' hari';
      else if (k.format === 'item') fmtVal = k.value + ' item';
      else fmtVal = FMT.int(k.value);

      var deltaClass = k.delta >= 0 ? 'pos' : 'neg';
      var deltaIcon = k.delta >= 0 ? 'arrow-up' : 'arrow-down';

      return '<article class="card kpi">' +
        '<div class="kpi-top"><span class="micro">' + icon(k.icon) + ' ' + esc(k.label) + '</span></div>' +
        '<div class="kpi-metric">' + fmtVal + '</div>' +
        '<div class="kpi-row"><span class="kpi-delta ' + deltaClass + '" style="color:' + (k.delta >= 0 ? 'var(--tone-ok,#16a34a)' : 'var(--tone-danger,#ef4444)') + '">' +
        icon(deltaIcon) + ' ' + FMT.signedPct(k.delta) +
        '</span></div></article>';
    }).join('');

    /* Revenue trend chart card */
    var revenueCard =
      '<article class="card">' +
      '<div class="card-head"><div class="card-head-text">' +
      '<h2 class="card-title">Tren Pendapatan 12 Bulan</h2>' +
      '<span class="card-note">Aktual vs target dalam miliar rupiah</span></div></div>' +
      '<div class="card-body"><div class="chart" data-chart="analytics-tren"></div></div></article>';

    /* Pipeline funnel */
    var stages = DATA.crmStages || [];
    var funnelCard =
      '<article class="card">' +
      '<div class="card-head"><div class="card-head-text">' +
      '<h2 class="card-title">Funnel Pipeline CRM</h2>' +
      '<span class="card-note">Nilai peluang per tahap</span></div></div>' +
      '<div class="card-body">' +
      (stages.length > 0 ? stages.map(function(s, i) {
        var leads = (DATA.leads || []).filter(function(l) { return l.stage === s.id; });
        var total = leads.reduce(function(sum, l) { return sum + l.value; }, 0);
        var maxVal = stages.reduce(function(mx, st) {
          var stLeads = (DATA.leads || []).filter(function(l) { return l.stage === st.id; });
          return Math.max(mx, stLeads.reduce(function(s2, l) { return s2 + l.value; }, 0));
        }, 1);
        var pct = Math.round((total / maxVal) * 100);
        var colors = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'];
        var c = colors[i % colors.length];
        return '<div style="margin-bottom:var(--sp-2)">' +
          '<div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);margin-bottom:2px">' +
          '<span>' + esc(s.label) + ' (' + leads.length + ')</span>' +
          '<span class="num">' + FMT.rpCompact(total) + '</span></div>' +
          '<div style="height:8px;background:var(--border-1,#e5e7eb);border-radius:4px;overflow:hidden">' +
          '<div style="width:' + pct + '%;height:100%;background:' + c + ';border-radius:4px"></div></div></div>';
      }).join('') : '<p class="muted">Data pipeline belum tersedia.</p>') +
      '</div></article>';

    /* AR aging chart */
    var agingCard =
      '<article class="card">' +
      '<div class="card-head"><div class="card-head-text">' +
      '<h2 class="card-title">Umur Piutang (Aging)</h2>' +
      '<span class="card-note">Distribusi piutang per bucket</span></div></div>' +
      '<div class="card-body"><div class="chart" data-chart="analytics-aging"></div></div></article>';

    /* Department comparison */
    var deptData = [
      { dept: 'Penjualan', budget: 2400, actual: 2180 },
      { dept: 'Produksi', budget: 5600, actual: 5320 },
      { dept: 'Pembelian', budget: 1800, actual: 1950 },
      { dept: 'SDM', budget: 1200, actual: 1150 },
      { dept: 'Keuangan', budget: 800, actual: 720 },
    ];
    var deptCard =
      '<article class="card">' +
      '<div class="card-head"><div class="card-head-text">' +
      '<h2 class="card-title">Realisasi vs Anggaran per Departemen</h2>' +
      '<span class="card-note">Dalam jutaan rupiah</span></div></div>' +
      '<div class="card-body">' +
      deptData.map(function(d) {
        var pct = Math.round((d.actual / d.budget) * 100);
        var barColor = pct > 100 ? '#ef4444' : pct > 90 ? '#d97706' : '#16a34a';
        return '<div style="margin-bottom:var(--sp-2)">' +
          '<div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);margin-bottom:2px">' +
          '<span>' + esc(d.dept) + '</span>' +
          '<span class="num">' + FMT.rpCompact(d.actual * 1e6) + ' / ' + FMT.rpCompact(d.budget * 1e6) + ' (' + pct + '%)</span></div>' +
          '<div style="height:8px;background:var(--border-1,#e5e7eb);border-radius:4px;overflow:hidden">' +
          '<div style="width:' + Math.min(pct, 100) + '%;height:100%;background:' + barColor + ';border-radius:4px"></div></div></div>';
      }).join('') +
      '</div></article>';

    return '<div class="page-head"><div class="page-head-text">' +
      '<h1 class="page-title">Analitik &amp; BI</h1>' +
      '<p class="page-sub">Ikhtisar kinerja bisnis ' + esc(DATA.org.company) + ' &middot; ' + esc(DATA.org.period) + '</p></div></div>' +
      '<section class="grid grid-kpi" aria-label="Analitik KPI">' + kpiTiles + '</section>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);margin-bottom:var(--sp-4)">' +
      revenueCard + funnelCard + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)">' +
      agingCard + deptCard + '</div>';
  }

  function mountAnalytics(root) {
    var tren = $('[data-chart="analytics-tren"]', root);
    if (tren) {
      Charts.lineChart(tren, {
        title: 'Tren pendapatan',
        labels: DATA.revenueTrend.labels,
        actual: DATA.revenueTrend.actual,
        target: DATA.revenueTrend.target,
        format: 'rp-compact',
        scale: 1e9,
      });
    }
    var aging = $('[data-chart="analytics-aging"]', root);
    if (aging) {
      Charts.columnChart(aging, {
        title: 'Umur piutang',
        ariaLabel: 'Umur piutang per ember: ' + DATA.arAging.map(function(d) { return d.label + ' ' + FMT.rpCompact(d.value); }).join(', '),
        items: DATA.arAging,
        height: 214,
      });
    }
  }

  const viewExists = (id) => Boolean(REGISTERS[id]) ||
    ['dasbor', 'perintah-kerja', 'piutang', 'peran', 'pengaturan', 'sistem-desain',
     'lead', 'kasir', 'proyek', 'anggaran', 'persetujuan', 'kas-bank', 'rantai-pasok',
     'analitik', 'bsc'].includes(id);

  function renderView() {
    const id = state.view;
    if (id === 'analitik') return renderAnalytics();
    if (id === 'bsc') return renderBSC();
    if (REGISTERS[id]) return renderRegister(id);
    switch (id) {
      case 'dasbor': return renderDashboard();
      case 'perintah-kerja': return renderBoard();
      case 'piutang': return renderReceivables();
      case 'peran': return renderRoles();
      case 'pengaturan': return renderSettings();
      case 'sistem-desain': return renderDesignSystem();
      case 'lead': return renderCRMBoard();
      case 'kasir': return renderPOS();
      case 'proyek': return renderProjects();
      case 'anggaran': return renderBudget();
      case 'persetujuan': return renderApprovalInbox();
      case 'kas-bank': return renderCashBank();
      case 'rantai-pasok': return renderSupplyChain();
      case 'analitik': return renderAnalytics();
      case 'bsc': return renderBSC();
      default: return renderDashboard();
    }
  }

  function render() {
    Charts.prune();
    const app = $('#app');
    app.dataset.rail = state.railCollapsed ? 'collapsed' : 'expanded';
    app.innerHTML = `
      ${renderRail()}
      <div class="main">
        ${renderTopbar()}
        ${renderContextBar()}
        <main class="content" id="content">
          <div class="content-inner">${renderView()}</div>
        </main>
      </div>
      ${renderAICopilot()}`;

    const root = $('#content');
    if (state.view === 'dasbor') mountDashboard(root);
    if (state.view === 'analitik') mountAnalytics(root);
    if (state.view === 'piutang') {
      const node = $('[data-chart="aging-lg"]', root);
      if (node) Charts.columnChart(node, {
        title: 'Umur piutang',
        ariaLabel: 'Umur piutang per ember: ' + DATA.arAging.map((d) => `${d.label} ${FMT.rpCompact(d.value)}`).join(', '),
        items: DATA.arAging,
        height: 260,
      });
    }
  }

  /* ====================================================================== */
  /* Peristiwa                                                               */
  /* ====================================================================== */
  function onClick(ev) {
    const t = ev.target;

    if (t.closest('[data-close]')) { closeOverlay(); return; }

    const dismiss = t.closest('[data-dismiss]');
    if (dismiss) { document.getElementById(dismiss.dataset.dismiss)?.remove(); return; }

    const nav = t.closest('[data-nav]');
    if (nav) { closeOverlay(); setView(nav.dataset.nav); return; }

    const themeBtn = t.closest('[data-theme-set]');
    if (themeBtn) {
      state.theme = themeBtn.dataset.themeSet;
      applyTheme();
      if (state.overlay?.kind === 'popover') closeOverlay();
      if (state.view === 'pengaturan') render();
      toast('Tema diperbarui', `Tampilan diatur ke ${state.theme === 'system' ? 'ikut sistem' : state.theme === 'dark' ? 'gelap' : 'terang'}.`, 'ok');
      return;
    }

    const cv = t.closest('[data-chart-view]');
    if (cv) {
      const [k, v] = cv.dataset.chartView.split(':');
      state.chartView[k] = v;
      render();
      return;
    }

    /* --- Widget remove ---------------------------------------------------- */
    const wr = t.closest('[data-widget-remove]');
    if (wr) {
      const idx = Number(wr.dataset.widgetRemove);
      const widgets = getWidgets();
      if (idx >= 0 && idx < widgets.length) {
        const removed = widgets[idx];
        widgets.splice(idx, 1);
        saveWidgets();
        render();
        toast('Widget dihapus', (removed.label || removed.type) + ' dihapus dari dasbor.', 'ok');
      }
      return;
    }

    /* --- Widget resize (+/- lebar & tinggi) ------------------------------- */
    const wr2 = t.closest('[data-widget-resize]');
    if (wr2) {
      const parts = wr2.dataset.widgetResize.split(':');
      const idx = Number(parts[0]), dw = Number(parts[1]), dh = Number(parts[2]);
      const widgets = getWidgets();
      if (idx >= 0 && idx < widgets.length) {
        const w = widgets[idx];
        w.w = Math.max(2, Math.min(12, w.w + dw));
        w.h = Math.max(1, Math.min(10, w.h + dh));
        saveWidgets();
        render();
      }
      return;
    }

    /* --- Widget change content -------------------------------------------- */
    const wch = t.closest('[data-widget-change]');
    if (wch) {
      const idx = Number(wch.dataset.widgetChange);
      const widgets = getWidgets();
      if (idx >= 0 && idx < widgets.length) {
        const current = widgets[idx];
        const changeHtml = WIDGET_CATALOG.map(function(c) {
          var isActive = c.type === current.type ? ' style="border-color:var(--accent);background:var(--accent-faint,rgba(59,130,246,0.08))"' : '';
          return '<button class="worklist-item" data-widget-swap="' + idx + ':' + c.type + '"' + isActive + '>' +
            '<span class="wl-icon">' + icon(c.icon) + '</span>' +
            '<span class="worklist-body">' +
            '<span class="worklist-title">' + esc(c.label) + (c.type === current.type ? ' ✓' : '') + '</span>' +
            '<span class="worklist-meta">' + esc(c.desc) + '</span></span></button>';
        }).join('');
        openDrawer({
          eyebrow: 'Widget #' + (idx + 1),
          title: 'Ganti Konten Widget',
          subtitle: 'Pilih konten baru untuk kotak ini',
          body: '<div class="worklist">' + changeHtml + '</div>',
          foot: '<button class="btn" data-close>Tutup</button>',
        });
      }
      return;
    }

    /* --- Widget swap type ------------------------------------------------- */
    const wsw = t.closest('[data-widget-swap]');
    if (wsw) {
      const parts = wsw.dataset.widgetSwap.split(':');
      const idx = Number(parts[0]), newType = parts[1];
      const widgets = getWidgets();
      if (idx >= 0 && idx < widgets.length) {
        const cat = WIDGET_CATALOG.find(function(c) { return c.type === newType; });
        if (cat) {
          widgets[idx].type = cat.type;
          widgets[idx].label = cat.label;
          saveWidgets();
          closeOverlay();
          render();
          toast('Konten diganti', 'Widget sekarang menampilkan: ' + cat.label, 'ok');
        }
      }
      return;
    }

    /* --- Widget catalog pick (tambah baru) -------------------------------- */
    const wp = t.closest('[data-widget-pick]');
    if (wp) {
      const type = wp.dataset.widgetPick;
      const cat = WIDGET_CATALOG.find(function(c) { return c.type === type; });
      if (cat) {
        var widgets = getWidgets();
        widgets.push({
          id: 'w-' + type + '-' + Date.now(),
          type: cat.type,
          label: cat.label,
          w: cat.defaultW,
          h: cat.defaultH,
        });
        saveWidgets();
        closeOverlay();
        render();
        toast('Widget ditambahkan', cat.label + ' berhasil ditambahkan ke dasbor.', 'ok');
      }
      return;
    }

    const bf = t.closest('[data-board-filter]');
    if (bf) { state.boardFilter = bf.dataset.boardFilter; render(); return; }

    const pi = t.closest('[data-pi]');
    if (pi) { runPalette(Number(pi.dataset.pi)); return; }

    const perm = t.closest('[data-perm]');
    if (perm) {
      const [group, ri, roleId] = perm.dataset.perm.split('|');
      const g = DATA.permissions.find((x) => x.group === group);
      const row = g.rows[Number(ri)];
      const order = ['full', 'read', 'none'];
      const next = order[(order.indexOf(row.by[roleId]) + 1) % order.length];
      row.by[roleId] = next;
      perm.dataset.level = next;
      perm.innerHTML = icon(PERM_LEVELS[next].icon);
      perm.title = PERM_LEVELS[next].label;
      return;
    }

    const approval = t.closest('[data-approval]');
    if (approval) {
      const row = DATA.salesOrders.find((r) => r.id === approval.dataset.approval);
      if (row) { setView('pesanan-penjualan'); openDrawer(salesOrderDrawer(row)); }
      else toast('Belum tersedia di purwarupa', `Rekaman ${approval.dataset.approval} berada di modul lain.`, 'warn');
      return;
    }

    const leadCard = t.closest('[data-lead]');
    if (leadCard) {
      const l = DATA.leads.find((x) => x.id === leadCard.dataset.lead);
      if (l) {
        openDrawer({
          title: l.name, subtitle: `${l.id} · ${l.company}`,
          status: l.stage === 'menang' ? 'diterima' : l.stage === 'kalah' ? 'ditolak' : 'berjalan',
          sections: [
            { label: 'Detail Peluang', pairs: [
              ['Perusahaan', l.company], ['Nilai', FMT.rpCompact(l.value)],
              ['Probabilitas', `${l.prob}%`], ['Sumber', l.source],
              ['Penanggung jawab', l.assignee], ['Tahap', l.stage],
            ]},
            { label: 'Tindakan Selanjutnya', pairs: [
              ['Aktivitas terakhir', FMT.date(l.lastActivity)],
              ['Langkah berikut', l.nextAction],
            ]},
          ],
        });
      }
      return;
    }

    const wo = t.closest('[data-wo]');
    if (wo) {
      const w = DATA.workOrders.find((x) => x.id === wo.dataset.wo);
      if (w) openDrawer(workOrderDrawer(w));
      return;
    }

    const inv = t.closest('[data-invoice]');
    if (inv) {
      const r = DATA.invoices.find((x) => x.id === inv.dataset.invoice);
      if (r) openDrawer(genericDrawer(REGISTERS.faktur, r));
      return;
    }

    /* --- Register: sort, chip status, halaman, seleksi, baris ------------- */
    const cfg = REGISTERS[state.view];
    if (cfg) {
      const st = regState(state.view);

      const sortBtn = t.closest('[data-sort]');
      if (sortBtn) {
        const key = sortBtn.dataset.sort;
        const cur = st.sort || cfg.sort;
        st.sort = { key, dir: cur && cur.key === key && cur.dir === 'asc' ? 'desc' : 'asc' };
        render();
        return;
      }

      const chip = t.closest('[data-status]');
      if (chip) { st.status = chip.dataset.status; st.page = 1; render(); return; }

      const page = t.closest('[data-page]');
      if (page && !page.disabled) {
        st.page += page.dataset.page === 'next' ? 1 : -1;
        render();
        return;
      }

      if (t.closest('[data-check-all]')) {
        const rows = sortedRows(state.view).slice((st.page - 1) * PAGE_SIZE, st.page * PAGE_SIZE);
        const allOn = rows.every((r) => st.selected.has(r[cfg.key]));
        rows.forEach((r) => (allOn ? st.selected.delete(r[cfg.key]) : st.selected.add(r[cfg.key])));
        render();
        return;
      }

      const check = t.closest('[data-check]');
      if (check) {
        const k = check.dataset.check;
        st.selected.has(k) ? st.selected.delete(k) : st.selected.add(k);
        render();
        return;
      }

      const tr = t.closest('[data-row]');
      if (tr) {
        const row = cfg.rows().find((r) => String(r[cfg.key]) === tr.dataset.row);
        if (!row) return;
        openDrawer(state.view === 'pesanan-penjualan' ? salesOrderDrawer(row) : genericDrawer(cfg, row));
        return;
      }
    }

    /* --- Tindakan bernama ------------------------------------------------- */
    const act = t.closest('[data-action]');
    if (!act) return;
    const id = act.dataset.id;

    switch (act.dataset.action) {
      case 'toggle-rail':
        state.railCollapsed = !state.railCollapsed;
        render();
        break;

      case 'open-palette': openPalette(); break;
      case 'open-notifications': openNotifications(act); break;
      case 'open-user': openUserMenu(act); break;

      case 'new-so': closeOverlay(); openNewOrderModal(); break;

      case 'submit-so': {
        const mode = act.dataset.mode;
        const customer = $('#so-cust').value;
        const next = `SO-2026-${String(422 + DATA.salesOrders.filter((r) => r.id > 'SO-2026-0421').length).padStart(4, '0')}`;
        const { total } = lineTotals(DATA.defaultLines);
        DATA.salesOrders.unshift({
          id: next, date: $('#so-date').value || '2026-08-14', customer,
          pic: DATA.org.user.name, amount: Math.round(total),
          status: mode === 'draf' ? 'draf' : 'menunggu',
          due: $('#so-due').value || '2026-09-13', channel: $('#so-channel').value,
        });
        closeOverlay();
        setView('pesanan-penjualan');
        toast(mode === 'draf' ? 'Draf tersimpan' : 'Dikirim untuk persetujuan',
          `${next} · ${customer} · ${FMT.rpCompact(total)}`, 'ok');
        break;
      }

      case 'approve-so': {
        const row = DATA.salesOrders.find((r) => r.id === id);
        if (row) {
          row.status = 'disetujui';
          (DATA.orderTimeline[id] ||= (DATA.orderTimeline[id] || []).slice()).push({
            title: `Disetujui oleh <b>${esc(DATA.org.user.name)}</b>`, meta: '14 Agu 2026 · baru saja', tone: 'ok',
          });
          closeOverlay();
          render();
          toast('Pesanan disetujui', `${id} diteruskan ke gudang untuk dijadwalkan.`, 'ok');
        }
        break;
      }

      case 'reject-so': {
        const row = DATA.salesOrders.find((r) => r.id === id);
        if (row) {
          row.status = 'batal';
          closeOverlay();
          render();
          toast('Pesanan ditolak', `${id} dikembalikan ke pembuat dokumen.`, 'danger');
        }
        break;
      }

      case 'clear-selection':
        regState(state.view).selected.clear();
        render();
        break;

      case 'reset-filter': {
        const st = regState(state.view);
        st.q = ''; st.status = 'semua'; st.page = 1;
        render();
        break;
      }

      case 'read-all':
        DATA.notifications.forEach((n) => (n.unread = false));
        closeOverlay();
        render();
        toast('Semua notifikasi ditandai terbaca', '', 'ok');
        break;

      case 'save-settings':
        toast('Pengaturan tersimpan', 'Kebijakan dokumen berlaku untuk semua cabang.', 'ok');
        break;

      case 'switch-company': case 'switch-branch': case 'switch-period':
        toast('Pemilih konteks', 'Pada purwarupa ini konteks perusahaan, cabang, dan periode belum dapat diganti.', 'warn');
        break;

      case 'toggle-copilot':
        state.aiCopilotOpen = !state.aiCopilotOpen;
        render();
        if (state.aiCopilotOpen) {
          const body = document.getElementById('ai-messages');
          if (body) body.scrollTop = body.scrollHeight;
        }
        break;

      case 'ai-send': {
        const inp = $('[data-ai-input]');
        if (inp && inp.value.trim()) {
          DATA.aiMessages.push({ role: 'user', text: inp.value.trim() });
          DATA.aiMessages.push({ role: 'assistant', text: 'Saya sedang menganalisis data Anda. Fitur ini tersedia pada versi produksi dengan koneksi ke AI backend.' });
          render();
          const body = document.getElementById('ai-messages');
          if (body) body.scrollTop = body.scrollHeight;
        }
        break;
      }

      case 'dash-edit-toggle':
        state.dashEditMode = !state.dashEditMode;
        render();
        if (state.dashEditMode) {
          toast('Mode kustomisasi', 'Seret widget untuk mengatur ulang, atau tambah/hapus sesuai kebutuhan.', 'accent');
        }
        break;

      case 'widget-add': {
        const existing = getWidgets().map(function(w) { return w.type; });
        const available = WIDGET_CATALOG.filter(function(c) { return !existing.includes(c.type); });
        const catalogHtml = (available.length > 0
          ? available.map(function(c) {
              return '<button class="worklist-item" data-widget-pick="' + c.type + '">' +
                '<span class="wl-icon">' + icon(c.icon) + '</span>' +
                '<span class="worklist-body">' +
                '<span class="worklist-title">' + esc(c.label) + '</span>' +
                '<span class="worklist-meta">' + esc(c.desc) + '</span></span>' +
                '<span class="worklist-side">' + icon('plus') + '</span></button>';
            }).join('')
          : '<p style="padding:var(--sp-4);color:var(--ink-3)">Semua widget sudah ditambahkan.</p>');

        openDrawer({
          eyebrow: '',
          title: 'Tambah Widget',
          subtitle: 'Pilih widget untuk ditambahkan ke dasbor',
          body: '<div class="worklist">' + catalogHtml + '</div>',
          foot: '<button class="btn" data-close>Tutup</button>',
        });
        break;
      }

      case 'widget-reset':
        state.dashWidgets = DEFAULT_WIDGETS.map(function(w) { return Object.assign({}, w); });
        saveWidgets();
        render();
        toast('Layout direset', 'Dasbor dikembalikan ke tata letak awal.', 'ok');
        break;

      case 'toggle': break;

      default:
        toast('Belum tersedia di purwarupa', 'Alur ini dirancang, tetapi belum diimplementasikan pada purwarupa.', 'warn');
    }
  }

  function onInput(ev) {
    if (ev.target.matches('[data-search]')) {
      const st = regState(state.view);
      st.q = ev.target.value;
      st.page = 1;
      render();
      const input = $('[data-search]');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
  }

  function onKeydown(ev) {
    const k = ev.key;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);

    if ((ev.metaKey || ev.ctrlKey) && k.toLowerCase() === 'k') {
      ev.preventDefault();
      state.overlay?.kind === 'palette' ? closeOverlay() : (closeOverlay(), openPalette());
      return;
    }
    if ((ev.metaKey || ev.ctrlKey) && k.toLowerCase() === 'n') {
      ev.preventDefault(); closeOverlay(); openNewOrderModal(); return;
    }
    if (k === 'Escape' && state.overlay) { ev.preventDefault(); closeOverlay(); return; }

    if (state.overlay?.kind === 'palette') {
      if (k === 'ArrowDown') { ev.preventDefault(); movePalette(1); }
      else if (k === 'ArrowUp') { ev.preventDefault(); movePalette(-1); }
      else if (k === 'Enter') { ev.preventDefault(); runPalette(state.overlay.index); }
      return;
    }

    if (!typing && k === '/') { ev.preventDefault(); closeOverlay(); openPalette(); }
  }

  /* ====================================================================== */
  /* Mulai                                                                   */
  /* ====================================================================== */
  /* ====================================================================== */
  /* Drag/drop & resize for widget dashboard                                 */
  /* ====================================================================== */
  let dragSrcIdx = null;

  function onDragStart(ev) {
    if (!state.dashEditMode) return;
    var handle = ev.target.closest('.widget-toolbar-drag');
    if (!handle) { ev.preventDefault(); return; }
    var article = handle.closest('article[data-widget-idx]');
    if (!article) return;
    dragSrcIdx = Number(article.dataset.widgetIdx);
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', String(dragSrcIdx));
    article.style.opacity = '0.4';
  }

  function onDragOver(ev) {
    if (!state.dashEditMode || dragSrcIdx === null) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
  }

  function onDrop(ev) {
    if (!state.dashEditMode || dragSrcIdx === null) return;
    ev.preventDefault();
    var target = ev.target.closest('article[data-widget-idx]');
    if (!target) return;
    var destIdx = Number(target.dataset.widgetIdx);
    if (destIdx === dragSrcIdx) return;

    var widgets = getWidgets();
    var moved = widgets.splice(dragSrcIdx, 1)[0];
    widgets.splice(destIdx, 0, moved);
    saveWidgets();
    dragSrcIdx = null;
    render();
  }

  function onDragEnd(ev) {
    dragSrcIdx = null;
    var article = ev.target.closest('article[data-widget-idx]');
    if (article) article.style.opacity = '';
  }

  function start() {
    initTheme();
    const hash = location.hash.replace('#/', '');
    state.view = viewExists(hash) ? hash : 'dasbor';
    render();

    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragend', onDragEnd);
    window.addEventListener('hashchange', () => {
      const id = location.hash.replace('#/', '');
      if (viewExists(id) && id !== state.view) { state.view = id; render(); }
    });
    window.addEventListener('resize', () => { if (state.overlay?.kind === 'popover') closeOverlay(); });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', start)
    : start();
})();
