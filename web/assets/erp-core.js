/* ==========================================================================
   ERP Enterprise — inti klien
   Klien API (sesi cookie HttpOnly + token CSRF), keadaan aplikasi,
   utilitas DOM, pemformat, ikon, dan overlay (laci, modal, toast).
   Seluruh teks dinamis di-escape sebelum disisipkan (cegah XSS).
   ========================================================================== */
/* global FMT, Charts */
const ERP = (() => {
  'use strict';

  /* --- Ikon (dari sistem desain purwarupa) ----------------------------- */
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
    'tree': '<path d="M8 2v5M8 7H4.5M8 7h3.5M4.5 7v3M11.5 7v3M4.5 10H2.5v2.5h4V10H4.5zM11.5 10H9.5v2.5h4V10H11.5z"/>',
  };
  const icon = (name, cls = '') =>
    `<svg class="${cls}" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;

  /* --- Utilitas DOM ------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* --- Keadaan ------------------------------------------------------------ */
  const state = {
    me: null, meta: null, csrf: '',
    companyId: null, branchId: 'all',
    from: null, to: null,
    view: 'dasbor', param: null,
    reg: {}, theme: 'system', railCollapsed: false,
    lookups: new Map(), overlay: null, lastFocus: null, toastSeq: 0,
  };

  try {
    const s = JSON.parse(sessionStorage.getItem('erp-ctx') || '{}');
    Object.assign(state, { companyId: s.companyId || null, branchId: s.branchId || 'all', from: s.from || null, to: s.to || null });
  } catch { /* penyimpanan tidak tersedia */ }
  const saveCtx = () => {
    try { sessionStorage.setItem('erp-ctx', JSON.stringify({ companyId: state.companyId, branchId: state.branchId, from: state.from, to: state.to })); } catch { /* abaikan */ }
  };

  /* --- Klien API ----------------------------------------------------------- */
  class ApiError extends Error {
    constructor(status, message, body) { super(message); this.status = status; this.body = body; }
  }

  async function api(method, path, body, { raw = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF-Token'] = state.csrf;
    if (state.companyId) headers['X-Company'] = String(state.companyId);
    if (state.branchId) headers['X-Branch'] = String(state.branchId);
    const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', cache: 'no-store' });
    if (raw && res.ok) return res;
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
    if (!res.ok) {
      const err = new ApiError(res.status, data?.error || `Galat ${res.status}`, data);
      if (res.status === 401 && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/mfa')) ERP.onUnauthorized?.(err);
      if (res.status === 428) ERP.onMustChange?.(err);
      throw err;
    }
    return data;
  }

  const qs = (o) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  /* --- Pemformat ----------------------------------------------------------- */
  const money = (v) => (v == null ? '<span class="muted">—</span>' : `<span class="num${v < 0 ? ' neg' : ''}">${esc(FMT.rp(v))}</span>`);
  const moneyPlain = (v) => (v == null ? '—' : FMT.rp(v));
  const num = (v, d = 2) => (v == null ? '—' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(v));
  const date = (v) => (v ? FMT.date(String(v).slice(0, 10)) : '—');
  const dateTime = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  };

  function pill(status) {
    const meta = state.meta?.status?.[status];
    const [label, tone] = meta || [status, 'neutral'];
    return `<span class="pill"${tone && tone !== 'neutral' ? ` data-tone="${tone}"` : ''}><i class="pill-dot"></i>${esc(label)}</span>`;
  }

  const optionLabel = (f, v) => {
    const o = (f.options || []).find((x) => (Array.isArray(x) ? x[0] : x) === v);
    return o ? (Array.isArray(o) ? o[1] : o) : v;
  };

  /** Nilai tampilan suatu bidang (sudah di-escape / HTML aman). */
  function fieldHtml(f, row) {
    const v = row[f.name];
    if (f.type === 'ref') return row[`${f.name}__label`] ? esc(row[`${f.name}__label`]) : '<span class="muted">—</span>';
    if (v === null || v === undefined || v === '') return '<span class="muted">—</span>';
    if (f.name === 'status' || f.name === 'stage') return pill(v);
    switch (f.type) {
      case 'money': return typeof v === 'number' ? money(v) : esc(v);
      case 'number': return `<span class="num">${num(v, 4)}</span>`;
      case 'int': return `<span class="num">${num(v, 0)}</span>`;
      case 'pct': return `<span class="num">${num(v, 2)}%</span>`;
      case 'date': return `<span class="num">${esc(date(v))}</span>`;
      case 'bool': return v ? 'Ya' : 'Tidak';
      case 'select': return esc(optionLabel(f, v));
      default: return esc(v);
    }
  }

  /* --- Overlay ---------------------------------------------------------------- */
  const overlays = () => $('#overlays');

  function closeOverlay() {
    overlays().innerHTML = '';
    state.overlay = null;
    if (state.lastFocus && state.lastFocus.isConnected) state.lastFocus.focus();
    state.lastFocus = null;
  }

  function openDrawer({ eyebrow = '', title, subtitle = '', body, foot = '' }) {
    state.lastFocus = document.activeElement;
    state.overlay = { kind: 'drawer' };
    overlays().innerHTML = `
      <div class="scrim" data-close></div>
      <aside class="drawer drawer-wide" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header class="drawer-head">
          <div class="drawer-head-top">
            <div class="drawer-head-text">
              <div class="drawer-eyebrow">${eyebrow}</div>
              <h2 class="drawer-title">${esc(title)}</h2>
              <span class="card-note">${esc(subtitle)}</span>
            </div>
            <button class="btn btn-icon btn-ghost" data-close aria-label="Tutup">${icon('x')}</button>
          </div>
        </header>
        <div class="drawer-body">${body}</div>
        <footer class="drawer-foot">${foot}</footer>
      </aside>`;
    $('.drawer [data-close]', overlays())?.focus();
  }

  /** Modal generik. Mengembalikan elemen modal. */
  function openModal({ title, note = '', body, foot, wide = false }) {
    state.lastFocus = document.activeElement;
    state.overlay = { kind: 'modal' };
    overlays().innerHTML = `
      <div class="scrim" data-close></div>
      <div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal-head">
          <div class="modal-head-text">
            <h2 class="modal-title" id="modal-title">${esc(title)}</h2>
            ${note ? `<span class="card-note">${esc(note)}</span>` : ''}
          </div>
          <button class="btn btn-icon btn-ghost" data-close aria-label="Tutup">${icon('x')}</button>
        </header>
        <div class="modal-body">${body}</div>
        <footer class="modal-foot">${foot}</footer>
      </div>`;
    const m = $('.modal', overlays());
    setTimeout(() => $('input:not([type=hidden]),select,textarea', m)?.focus(), 30);
    return m;
  }

  /** Konfirmasi dengan modal (pengganti window.confirm). */
  function confirmBox(title, message, { danger = false, ok = 'Lanjutkan' } = {}) {
    return new Promise((resolve) => {
      const m = openModal({
        title, body: `<p>${esc(message)}</p>`,
        foot: `<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok>${esc(ok)}</button><button class="btn btn-ghost" data-close>Batal</button>`,
      });
      m.querySelector('[data-confirm-ok]').addEventListener('click', () => { closeOverlay(); resolve(true); });
      overlays().querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => resolve(false), { once: true }));
    });
  }

  function toast(title, note = '', tone = 'ok') {
    const host = $('#toasts');
    const id = `t${++state.toastSeq}`;
    const node = document.createElement('div');
    node.className = 'toast';
    node.id = id;
    node.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    if (tone !== 'accent') node.dataset.tone = tone;
    node.innerHTML = `
      <span class="wl-icon" data-tone="${tone}">${icon(tone === 'danger' || tone === 'warn' ? 'alert' : 'check')}</span>
      <span class="toast-body"><span class="toast-title">${esc(title)}</span>${note ? `<span class="toast-note">${esc(note)}</span>` : ''}</span>
      <button class="btn btn-sm btn-icon btn-ghost" data-dismiss="${id}" aria-label="Tutup pemberitahuan">${icon('x')}</button>`;
    host.appendChild(node);
    setTimeout(() => node.remove(), tone === 'danger' ? 9000 : 5000);
  }

  const fail = (err) => toast('Gagal', err?.message || String(err), 'danger');

  /* --- Unduhan berkas (CSV) ------------------------------------------------- */
  function download(filename, content, type = 'text/csv;charset=utf-8') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function csvFromTable(table) {
    const cell = (s) => {
      let t = String(s).replace(/\s+/g, ' ').trim();
      if (/^[=+\-@]/.test(t) && !/^-?[\d.,]+$/.test(t)) t = "'" + t;
      return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    return '﻿' + Array.from(table.rows).map((r) => Array.from(r.cells).map((c) => cell(c.innerText)).join(';')).join('\n');
  }

  return {
    ICONS, icon, $, $$, esc, state, saveCtx, api, qs, ApiError, money, moneyPlain, num, date, dateTime, pill, fieldHtml, optionLabel,
    openDrawer, openModal, closeOverlay, confirmBox, toast, fail, download, csvFromTable, overlays,
  };
})();
