/* ==========================================================================
   Kerangka aplikasi: autentikasi (masuk, MFA, ganti sandi wajib), navigasi
   berbasis izin, perutean hash, konteks perusahaan/cabang/periode,
   penanganan peristiwa global, dan batas waktu sesi di sisi klien.
   ========================================================================== */
/* global ERP, FMT, Charts */
(() => {
  'use strict';
  const { $, $$, esc, icon, api, state, toast, fail, closeOverlay, openModal } = ERP;
  const R = () => ERP.records;
  const V = () => ERP.views;

  /* --- Navigasi ------------------------------------------------------------- */
  const E = (id, entity, ic, label) => ({ id, entity, icon: ic, label });
  const NAV = [
    { label: 'Ikhtisar', items: [{ id: 'dasbor', label: 'Dasbor', icon: 'grid', perm: 'dashboard', view: 'dashboard' }, { id: 'persetujuan', label: 'Kotak Persetujuan', icon: 'inbox', view: 'approvals', perm: 'dashboard' }] },
    { label: 'Data Master', items: [E('produk', 'products', 'database', 'Produk & Layanan'), E('gudang', 'warehouses', 'building'), E('bom', 'boms', 'tree', 'Bill of Materials')] },
    { label: 'CRM', items: [{ id: 'lead', entity: 'leads', icon: 'target', label: 'Lead & Peluang', view: 'crm' }] },
    { label: 'Penjualan', items: [E('penawaran', 'quotations', 'quote'), { id: 'analisis-penawaran', label: 'Analisis Penawaran', icon: 'bar-chart', view: 'quote-report', perm: 'sales' }, E('pesanan-penjualan', 'sales_orders', 'cart'), E('faktur', 'sales_invoices', 'invoice'), E('penerimaan', 'customer_receipts', 'wallet'), E('retur-penjualan', 'sales_returns', 'transfer'), E('pelanggan', 'customers', 'building'), { id: 'kartu-piutang', label: 'Kartu Piutang', icon: 'ledger', view: 'partner-customer', perm: 'sales' }, { id: 'umur-piutang', label: 'Umur Piutang', icon: 'clock', view: 'report', report: 'umur-piutang', perm: 'sales' }] },
    { label: 'POS / Kasir', items: [{ id: 'kasir', entity: 'pos_sales', icon: 'barcode', label: 'Kasir', view: 'pos' }, E('shift-kasir', 'pos_shifts', 'clock', 'Shift Kasir')] },
    { label: 'Pembelian', items: [E('permintaan-pembelian', 'purchase_requests', 'clipboard'), E('rfq', 'rfqs', 'scale'), E('pesanan-pembelian', 'purchase_orders', 'truck'), E('tagihan', 'purchase_bills', 'invoice'), E('pembayaran', 'supplier_payments', 'credit-card'), E('retur-pembelian', 'purchase_returns', 'transfer'), E('pemasok', 'suppliers', 'handshake'), { id: 'kartu-hutang', label: 'Kartu Hutang', icon: 'ledger', view: 'partner-supplier', perm: 'purchasing' }, { id: 'umur-hutang', label: 'Umur Hutang', icon: 'clock', view: 'report', report: 'umur-hutang', perm: 'purchasing' }] },
    { label: 'Inventaris', items: [{ id: 'stok', label: 'Stok & Valuasi', icon: 'boxes', view: 'report', report: 'persediaan', perm: 'inventory' }, E('mutasi', 'stock_moves', 'transfer'), E('penyesuaian', 'stock_adjustments', 'edit'), E('transfer-stok', 'stock_transfers', 'transfer'), E('lokasi-rak', 'warehouse_bins', 'boxes', 'Lokasi Rak'), E('penempatan', 'product_locations', 'link', 'Penempatan Barang'), E('rantai-pasok', 'shipments', 'link')] },
    { label: 'Produksi', items: [{ id: 'perintah-kerja', entity: 'work_orders', icon: 'factory', label: 'Perintah Kerja', view: 'wo' }, { id: 'mrp', label: 'Perencanaan Bahan (MRP)', icon: 'clipboard', view: 'mrp', perm: 'inventory' }] },
    { label: 'Proyek', items: [E('proyek', 'projects', 'gantt'), E('tugas-proyek', 'project_tasks', 'calendar'), { id: 'lap-proyek', label: 'Laporan Proyek', icon: 'bar-chart', view: 'project-report', perm: 'projects' }] },
    { label: 'Keuangan', items: [{ id: 'bagan-akun', entity: 'accounts', icon: 'tree', label: 'Bagan Akun', view: 'coa' }, E('jurnal', 'journals', 'ledger'), E('kas-bank', 'bank_accounts', 'vault'), E('kas-transaksi', 'cash_transactions', 'banknote'), E('transfer-bank', 'bank_transfers', 'transfer'), { id: 'rekonsiliasi', entity: 'bank_reconciliations', icon: 'file-check', label: 'Rekonsiliasi Bank', view: 'recon' }, E('mata-uang', 'currencies', 'banknote', 'Mata Uang'), E('kurs', 'exchange_rates', 'transfer', 'Kurs Valuta'), E('anggaran', 'budgets', 'piechart', 'Anggaran (COA)'), { id: 'realisasi-anggaran', label: 'Realisasi & Variance', icon: 'bar-chart', view: 'budget', perm: 'finance' }, E('pusat-biaya', 'cost_centers', 'target'), E('periode', 'fiscal_periods', 'calendar')] },
    { label: 'Laporan Keuangan', items: [
      { id: 'lap-neraca', label: 'Neraca', icon: 'scale', view: 'report', report: 'neraca', perm: 'reports' },
      { id: 'lap-laba-rugi', label: 'Laba Rugi', icon: 'bar-chart', view: 'report', report: 'laba-rugi', perm: 'reports' },
      { id: 'lap-arus-kas', label: 'Arus Kas', icon: 'banknote', view: 'report', report: 'arus-kas', perm: 'reports' },
      { id: 'lap-neraca-saldo', label: 'Neraca Saldo', icon: 'ledger', view: 'report', report: 'neraca-saldo', perm: 'reports' },
      { id: 'lap-buku-besar', label: 'Buku Besar', icon: 'scroll', view: 'report', report: 'buku-besar', perm: 'reports' },
      { id: 'lap-cabang', label: 'Laporan Cabang', icon: 'building', view: 'branch', perm: 'reports' },
      { id: 'lap-konsolidasi', label: 'Konsolidasi Grup', icon: 'link', view: 'consolidated', perm: 'reports', minLevel: 3, consolidate: true },
      { id: 'lap-anggaran', label: 'Anggaran vs Realisasi', icon: 'piechart', view: 'budget', perm: 'reports' },
      { id: 'lap-proyek-keu', label: 'Laporan Proyek', icon: 'gantt', view: 'project-report', perm: 'reports' },
      { id: 'lap-pajak', label: 'Rekap Pajak', icon: 'file-check', view: 'tax', perm: 'reports' },
    ] },
    { label: 'Analitik', items: [{ id: 'analitik', label: 'BI & Analitik', icon: 'bar-chart', view: 'analytics', perm: 'reports' }, { id: 'bsc', label: 'Balanced Scorecard', icon: 'target', view: 'bsc', perm: 'reports' }, E('sasaran-bsc', 'bsc_metrics', 'edit', 'Sasaran BSC')] },
    { label: 'SDM', items: [E('karyawan', 'employees', 'users'), E('kehadiran', 'attendance', 'calendar'), E('cuti', 'leave_requests', 'clock', 'Cuti & Izin'), E('penggajian', 'payroll_runs', 'banknote')] },
    { label: 'Aset', items: [E('aset', 'fixed_assets', 'landmark'), E('penyusutan', 'depreciation_runs', 'piechart'), E('pemeliharaan', 'maintenance_orders', 'wrench')] },
    { label: 'Dokumen & Alur Kerja', items: [E('dokumen', 'documents', 'folder'), E('alur-kerja', 'workflows', 'workflow')] },
    { label: 'Keamanan & Kepatuhan', items: [{ id: 'keamanan', label: 'Pusat Keamanan', icon: 'shield', view: 'security', perm: 'admin' }, E('kepatuhan', 'compliance_items', 'file-check'), E('risiko', 'risks', 'alert'), E('insiden', 'security_incidents', 'bell'), { id: 'jejak-audit', label: 'Jejak Audit', icon: 'scroll', view: 'audit', perm: 'compliance' }] },
    { label: 'Administrasi', items: [E('pengguna', 'users', 'users'), { id: 'peran', entity: 'roles', icon: 'shield', label: 'Peran & Izin', view: 'roles' }, E('perusahaan', 'companies', 'building'), E('cabang', 'branches', 'link'), { id: 'pengaturan', label: 'Pengaturan', icon: 'gear', view: 'settings', perm: 'admin' }] },
  ];
  const HIDDEN = [{ id: 'profil', label: 'Profil', view: 'profile' }];

  const allowed = (it) => {
    if (it.consolidate && !state.meta.canConsolidate) return false;
    if (it.entity) return !!state.meta.entities[it.entity];
    return (state.me.permissions[it.perm] || 0) >= (it.minLevel || 1);
  };
  const navItems = () => NAV.map((g) => ({ ...g, items: g.items.filter(allowed).map((it) => ({ ...it, label: it.label || state.meta.entities[it.entity]?.label })) })).filter((g) => g.items.length);
  const findItem = (id) => [...NAV.flatMap((g) => g.items), ...HIDDEN].find((i) => i.id === id);
  const viewForEntity = (key) => NAV.flatMap((g) => g.items).find((i) => i.entity === key && allowed(i));

  /* --- Tema ------------------------------------------------------------------- */
  function applyTheme() {
    const root = document.documentElement;
    if (state.theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', state.theme);
    try { localStorage.setItem('erp-theme', state.theme); } catch { /* abaikan */ }
    requestAnimationFrame(() => Charts.redrawAll());
  }
  try { const t = localStorage.getItem('erp-theme'); if (['light', 'dark', 'system'].includes(t)) state.theme = t; } catch { /* abaikan */ }
  try { state.railCollapsed = localStorage.getItem('erp-rail') === '1'; } catch { /* abaikan */ }

  /* --- Layar masuk --------------------------------------------------------------- */
  function renderLogin(step = 'password', message = '') {
    const app = $('#app');
    app.className = 'auth-shell';
    app.innerHTML = `
      <div class="auth-art" aria-hidden="true"><div class="auth-art-inner"><span class="rail-mark">${icon('boxes')}</span><h2>ERP Enterprise</h2><p>Satu buku besar untuk seluruh perusahaan, cabang, dan modul operasional.</p>
        <ul><li>${icon('check')} Jurnal otomatis dari penjualan, pembelian, stok, gaji, aset</li><li>${icon('check')} Neraca & laba rugi per cabang dan konsolidasi grup</li><li>${icon('check')} Kontrol keamanan selaras ISO/IEC 27001:2022</li></ul></div></div>
      <main class="auth-panel" id="content">
        <form class="auth-card" data-auth="${step}" novalidate>
          <h1>${step === 'mfa' ? 'Verifikasi dua langkah' : step === 'change' ? 'Ganti kata sandi' : 'Masuk'}</h1>
          <p class="muted">${step === 'mfa' ? 'Masukkan kode 6 digit dari aplikasi autentikator Anda.' : step === 'change' ? 'Kata sandi Anda wajib diganti sebelum melanjutkan (sandi sementara atau sudah kedaluwarsa).' : 'Gunakan akun yang diberikan administrator.'}</p>
          ${message ? `<div class="notice" data-tone="danger" role="alert">${icon('alert')} ${esc(message)}</div>` : ''}
          ${step === 'password' ? `
            <div class="field"><label for="lg-user">Nama pengguna</label><input class="input" id="lg-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="60" required></div>
            <div class="field"><label for="lg-pass">Kata sandi</label><input class="input" id="lg-pass" name="password" type="password" autocomplete="current-password" maxlength="128" required></div>
            <button class="btn btn-primary btn-block" type="submit">Masuk</button>` : ''}
          ${step === 'mfa' ? `
            <div class="field"><label for="lg-otp">Kode autentikator</label><input class="input num otp" id="lg-otp" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required></div>
            <button class="btn btn-primary btn-block" type="submit">Verifikasi</button><button class="btn btn-ghost btn-block" type="button" data-logout>Batal</button>` : ''}
          ${step === 'change' ? `
            <div class="field"><label for="ch-cur">Sandi saat ini</label><input class="input" id="ch-cur" name="current" type="password" autocomplete="current-password" required></div>
            <div class="field"><label for="ch-new">Sandi baru</label><input class="input" id="ch-new" name="next" type="password" autocomplete="new-password" required></div>
            <div class="field"><label for="ch-new2">Ulangi sandi baru</label><input class="input" id="ch-new2" name="next2" type="password" autocomplete="new-password" required></div>
            <span class="field-hint">Minimal 12 karakter: huruf besar, huruf kecil, angka, dan simbol.</span>
            <button class="btn btn-primary btn-block" type="submit">Simpan & lanjutkan</button><button class="btn btn-ghost btn-block" type="button" data-logout>Keluar</button>` : ''}
          <p class="auth-foot">Akses tercatat di jejak audit. Penggunaan tanpa izin dilarang.</p>
        </form>
      </main>`;
    setTimeout(() => $('input', app)?.focus(), 20);
  }

  async function submitAuth(form) {
    const step = form.dataset.auth;
    const fd = Object.fromEntries(new FormData(form));
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      if (step === 'password') {
        const r = await api('POST', '/api/auth/login', { username: fd.username, password: fd.password });
        if (r.mfaRequired) return renderLogin('mfa');
      } else if (step === 'mfa') {
        await api('POST', '/api/auth/mfa', { code: fd.code });
      } else if (step === 'change') {
        if (fd.next !== fd.next2) throw new Error('Ulangan sandi baru tidak sama.');
        await api('POST', '/api/auth/password', { current: fd.current, next: fd.next });
        toast('Sandi diganti', 'Sesi lain telah dicabut.');
      }
      await boot();
    } catch (err) {
      renderLogin(step === 'password' ? 'password' : step, err.message);
    }
  }

  /* --- Boot ---------------------------------------------------------------------- */
  async function boot() {
    let me;
    try { me = await api('GET', '/api/auth/me'); } catch { return renderLogin(); }
    state.me = me;
    state.csrf = me.csrf;
    if (me.mfaPending) return renderLogin('mfa');
    if (me.mustChangePassword) return renderLogin('change');
    if (me.user.portal) { state.meta = await api('GET', '/api/meta').catch(() => ({ status: {}, companies: [], branches: [], today: new Date().toISOString().slice(0, 10) })); startIdleTimer(); return ERP.more.renderPortal(); }
    try {
      state.meta = await api('GET', '/api/meta');
    } catch (err) {
      if (err.status === 403) { state.companyId = null; state.branchId = 'all'; state.meta = await api('GET', '/api/meta'); } else throw err;
    }
    state.companyId = state.meta.companyId;
    state.branchId = state.meta.branchId || 'all';
    ERP.saveCtx();
    const hash = location.hash.replace(/^#\//, '').split('/');
    state.view = findItem(hash[0]) && (hash[0] === 'profil' || allowed(findItem(hash[0]))) ? hash[0] : 'dasbor';
    render();
    startIdleTimer();
  }

  async function reloadMeta() {
    ERP.forms.clearLookups();
    state.reg = {};
    state.meta = await api('GET', '/api/meta');
    state.companyId = state.meta.companyId;
    state.branchId = state.meta.branchId || 'all';
    ERP.saveCtx();
    render();
  }

  /* --- Kerangka ------------------------------------------------------------------- */
  function renderRail() {
    return `<nav class="rail" aria-label="Navigasi utama">
      <div class="rail-brand"><span class="rail-mark">${icon('boxes')}</span><span class="rail-wordmark"><b>ERP Enterprise</b><span>${esc(state.meta.companies.find((c) => c.id === state.meta.companyId)?.code || '')}</span></span></div>
      <div class="rail-scroll">${navItems().map((g) => `<div class="rail-group"><div class="rail-group-label">${esc(g.label)}</div>${g.items.map((it) => `
        <button class="rail-link" data-nav="${it.id}" ${state.view === it.id ? 'aria-current="page"' : ''} title="${esc(it.label)}">${icon(it.icon, 'rail-link-icon')}<span class="rail-link-text">${esc(it.label)}</span></button>`).join('')}</div>`).join('')}</div>
      <div class="rail-foot"><button class="rail-link" data-toggle-rail title="Lebarkan atau ciutkan navigasi">${icon('panel', 'rail-link-icon')}<span class="rail-link-text">Ciutkan panel</span></button></div>
    </nav>`;
  }

  function renderTopbar() {
    const it = findItem(state.view);
    const group = NAV.find((g) => g.items.some((i) => i.id === state.view))?.label;
    return `<header class="topbar">
      <div class="crumbs">${group ? `<span class="crumbs-trail">${esc(group)}</span><span class="crumbs-sep crumbs-trail">/</span>` : ''}<b>${esc(it?.label || state.meta.entities[it?.entity]?.label || '')}</b></div>
      <div class="topbar-spacer"></div>
      <button class="omni" data-open-palette aria-label="Cari menu dan dokumen">${icon('search')}<span class="omni-text">Cari menu, dokumen, pelanggan…</span><span class="kbd">Ctrl K</span></button>
      <button class="btn btn-icon btn-ghost" data-open-assistant aria-label="Asisten data" title="Asisten data">${icon('sparkle')}</button>
      <button class="btn btn-icon btn-ghost has-badge" data-open-notif aria-label="Notifikasi" title="Notifikasi">${icon('bell')}<i class="notif-count" data-notif-count hidden></i></button>
      <button class="btn btn-icon btn-ghost" data-open-user aria-label="Menu pengguna"><span class="avatar">${esc(state.me.user.initials)}</span></button>
    </header>`;
  }

  function renderContextBar() {
    const m = state.meta;
    const p = { from: state.from || `${m.today.slice(0, 4)}-01-01`, to: state.to || m.today };
    return `<div class="contextbar">
      <div class="ctx-field"><label class="micro" for="ctx-co">Perusahaan</label><select class="select ctx-select" id="ctx-co" data-ctx="company" ${m.companies.length < 2 ? 'disabled' : ''}>${m.companies.map((c) => `<option value="${c.id}" ${c.id === m.companyId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="ctx-field"><label class="micro" for="ctx-br">Cabang</label><select class="select ctx-select" id="ctx-br" data-ctx="branch" ${state.me.user.branchId ? 'disabled' : ''}>${state.me.user.branchId ? '' : '<option value="all">Semua cabang</option>'}${m.branches.map((b) => `<option value="${b.id}" ${b.id === m.branchId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
      <div class="ctx-field"><label class="micro" for="ctx-from">Periode laporan</label><span class="ctx-range"><input class="input num" type="date" id="ctx-from" data-ctx="from" value="${esc(p.from)}"> – <input class="input num" type="date" data-ctx="to" value="${esc(p.to)}" aria-label="Sampai tanggal"></span></div>
      <div class="ctx-field"><span class="micro">Mata uang</span><span class="ctx-static">IDR — Rupiah</span></div>
      <div class="contextbar-spacer"></div>
      <div class="ctx-actions"><button class="btn btn-sm btn-ghost" data-print>${icon('print')} Cetak</button></div>
    </div>`;
  }

  function render() {
    Charts.prune();
    const app = $('#app');
    app.className = 'app';
    app.dataset.rail = state.railCollapsed ? 'collapsed' : 'expanded';
    app.innerHTML = `${renderRail()}<div class="main">${renderTopbar()}${renderContextBar()}<main class="content" id="content"><div class="content-inner" data-view-root></div></main></div>`;
    if (location.hash !== `#/${state.view}`) history.replaceState(null, '', `#/${state.view}`);
    renderView();
    ERP.more.loadNotifications();
  }

  async function renderView() {
    const host = $('[data-view-root]');
    const root = document.createElement('div');
    root.className = 'view-root';
    host.replaceChildren(root);
    const it = findItem(state.view) || findItem('dasbor');
    try {
      switch (it.view) {
        case 'dashboard': return await ERP.more.dashboard(root);
        case 'analytics': return await ERP.more.analytics(root);
        case 'bsc': return await ERP.more.bsc(root);
        case 'mrp': return await ERP.more.mrp(root);
        case 'recon': return await ERP.more.recon(root);
        case 'tax': return await ERP.more.taxReport(root);
        case 'partner-customer': return await ERP.more.partnerReport(root, 'customer');
        case 'partner-supplier': return await ERP.more.partnerReport(root, 'supplier');
        case 'approvals': return await V().approvals(root);
        case 'report': return await V().report(root, it.report);
        case 'branch': return await V().report(root, state.branchTab || 'laba-rugi', 'branch');
        case 'consolidated': return await V().report(root, state.consTab || 'neraca', 'consolidated');
        case 'coa': return await V().coa(root);
        case 'budget': return await ERP.budget.budgetReport(root);
        case 'quote-report': return await ERP.sales.quoteReport(root);
        case 'project-report': return await ERP.budget.projectReport(root);
        case 'crm': return state.listMode?.leads ? await R().renderRegister(root, 'leads') : await V().board(root, 'leads', V().crmCfg);
        case 'wo': return state.listMode?.work_orders ? await R().renderRegister(root, 'work_orders') : await V().board(root, 'work_orders', V().woCfg);
        case 'pos': return await V().pos(root);
        case 'security': return await V().security(root);
        case 'audit': return await V().audit(root);
        case 'roles': return await V().roles(root);
        case 'settings': return await V().settings(root);
        case 'profile': return await V().profile(root);
        default: return await R().renderRegister(root, it.entity, { title: it.label });
      }
    } catch (err) {
      root.innerHTML = `<div class="empty"><div class="empty-card"><span class="empty-title">Tidak dapat memuat</span><span class="empty-note">${esc(err.message)}</span></div></div>`;
    }
  }

  function setView(id) {
    if (!findItem(id)) id = 'dasbor';
    if (id !== 'rekonsiliasi') state.reconId = null;
    state.view = id;
    closeOverlay();
    render();
    window.scrollTo({ top: 0 });
    $('#content')?.focus?.();
  }

  /** Muat ulang tampilan aktif bila memuat entitas yang baru berubah. */
  function refreshView(key) {
    const it = findItem(state.view);
    if (['dashboard', 'approvals', 'crm', 'wo', 'coa'].includes(it?.view) && (!it.entity || it.entity === key || it.view === 'approvals' || it.view === 'dashboard')) renderView();
  }

  /* --- Palet perintah sederhana --------------------------------------------- */
  function openPalette() {
    const items = navItems().flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
    const m = openModal({ title: 'Cari', body: `<input class="input" type="search" data-palette-input placeholder="Ketik nama menu, nomor dokumen, pelanggan, barang…" aria-label="Cari menu dan dokumen"><div class="worklist palette-list" data-palette-list></div>`, foot: '<span class="field-hint">Enter untuk membuka · Esc untuk menutup</span>' });
    let seq = 0;
    const draw = async (q = '') => {
      const my = ++seq;
      const menus = items.filter((i) => `${i.label} ${i.group}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
        .map((i) => `<button class="worklist-item" data-nav="${i.id}"><span class="wl-icon">${icon(i.icon)}</span><span class="worklist-body"><span class="worklist-title">${esc(i.label)}</span><span class="worklist-meta">${esc(i.group)}</span></span></button>`).join('');
      $('[data-palette-list]', m).innerHTML = (menus ? `<div class="palette-group-label">Menu</div>${menus}` : '') + (q.length >= 2 ? '<div class="palette-group-label" data-rec-head>Dokumen & data · mencari…</div>' : '');
      if (q.length < 2) return;
      const recs = await ERP.more.searchRecords(q);
      if (my !== seq || !$('[data-palette-list]', m)) return;
      const head = $('[data-rec-head]', m);
      if (head) head.outerHTML = `<div class="palette-group-label">Dokumen & data (${recs.length})</div>` + recs.map((r) => `<button class="worklist-item" data-open="${esc(r.entity)}:${r.id}"><span class="wl-icon">${icon('file-check')}</span><span class="worklist-body"><span class="worklist-title">${esc(r.label || '')}</span><span class="worklist-meta">${esc(r.entityLabel)}${r.sub ? ` · ${esc(r.sub)}` : ''}</span></span></button>`).join('');
    };
    draw();
    const inp = $('[data-palette-input]', m);
    let tmr = null;
    inp.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => draw(inp.value), 220); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-nav], [data-open]', m)?.click(); });
  }

  function openUserMenu(anchor) {
    const u = state.me.user;
    const r = anchor.getBoundingClientRect();
    state.lastFocus = anchor;
    state.overlay = { kind: 'popover' };
    ERP.overlays().innerHTML = `<div class="scrim scrim-clear" data-close></div><div class="popover" role="menu" style="top:${Math.round(r.bottom + 6)}px;right:${Math.round(window.innerWidth - r.right)}px">
      <div class="popover-head"><b>${esc(u.fullName)}</b><span class="muted">${esc(u.username)} · ${esc(u.role?.name || '')}</span></div>
      <div class="menu"><button class="menu-item" role="menuitem" data-nav="profil">${icon('users')} Profil & keamanan akun</button>
      <button class="menu-item" role="menuitem" data-theme-cycle>${icon(state.theme === 'dark' ? 'moon' : state.theme === 'light' ? 'sun' : 'monitor')} Tema: ${state.theme === 'dark' ? 'Gelap' : state.theme === 'light' ? 'Terang' : 'Ikut sistem'}</button>
      <div class="menu-sep"></div><button class="menu-item" role="menuitem" data-logout>${icon('logout')} Keluar</button></div></div>`;
    $('.menu-item', ERP.overlays())?.focus();
  }

  async function logout() {
    try { await api('POST', '/api/auth/logout', {}); } catch { /* sesi mungkin sudah berakhir */ }
    state.me = null; state.meta = null; state.csrf = '';
    ERP.forms.clearLookups();
    state.reg = {};
    stopIdleTimer();
    closeOverlay();
    renderLogin();
  }

  /* --- Batas waktu sesi diam (A.8.5 / A.5.15): keluar otomatis ------------------ */
  let idleTimer = null, warnTimer = null, lastActivity = Date.now();
  function startIdleTimer() {
    stopIdleTimer();
    const minutes = state.me?.sessionIdleMinutes || 30;
    const tick = () => {
      const idle = Date.now() - lastActivity;
      if (idle > minutes * 60e3) { toast('Sesi berakhir', 'Anda keluar otomatis karena tidak aktif.', 'warn'); logout(); return; }
      if (idle > (minutes - 1) * 60e3 && !warnTimer) { warnTimer = 1; toast('Sesi hampir berakhir', 'Gerakkan tetikus atau tekan tombol untuk tetap masuk.', 'warn'); }
    };
    idleTimer = setInterval(tick, 15e3);
  }
  function stopIdleTimer() { if (idleTimer) clearInterval(idleTimer); idleTimer = null; }
  let pingAt = 0;
  const activity = () => {
    lastActivity = Date.now(); warnTimer = null;
    // Perpanjang sesi server paling sering tiap 2 menit selama pengguna aktif.
    if (state.me && Date.now() - pingAt > 120e3) { pingAt = Date.now(); api('GET', '/api/auth/me').catch(() => {}); }
  };
  ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach((ev) => document.addEventListener(ev, activity, { passive: true }));

  /* --- Peristiwa global ------------------------------------------------------------ */
  document.addEventListener('submit', (ev) => {
    const form = ev.target;
    if (form.matches('[data-auth]')) { ev.preventDefault(); submitAuth(form); }
    if (form.matches('[data-setting-form]')) {
      ev.preventDefault();
      const body = {};
      for (const el of $$('[name]', form)) body[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
      api('PUT', `/api/settings/${form.dataset.settingForm}`, body).then(() => toast('Pengaturan disimpan', 'Perubahan tercatat di jejak audit.')).catch(fail);
    }
    if (form.matches('[data-pw-form]')) {
      ev.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      if (fd.next !== fd.next2) return toast('Ulangan sandi tidak sama', '', 'danger');
      api('POST', '/api/auth/password', { current: fd.current, next: fd.next }).then(() => { form.reset(); toast('Sandi diganti', 'Sesi lain telah dicabut.'); }).catch(fail);
    }
    if (form.matches('[data-mfa-disable]')) {
      ev.preventDefault();
      api('POST', '/api/auth/mfa/disable', { password: form.password.value }).then(async () => { toast('MFA dinonaktifkan', '', 'warn'); state.me = await api('GET', '/api/auth/me'); renderView(); }).catch(fail);
    }
  });

  document.addEventListener('click', async (ev) => {
    const t = ev.target;
    const q = (sel) => t.closest(sel);
    let el;
    if (q('[data-dismiss]')) { document.getElementById(q('[data-dismiss]').dataset.dismiss)?.remove(); return; }
    if (q('[data-close]')) { closeOverlay(); return; }
    if (q('[data-logout]')) { logout(); return; }
    if ((el = q('[data-nav]'))) { ev.preventDefault(); setView(el.dataset.nav); return; }
    if ((el = q('[data-nav-list]'))) { state.listMode = { ...(state.listMode || {}), [el.dataset.navList]: true }; renderView(); return; }
    if (q('[data-toggle-rail]')) { state.railCollapsed = !state.railCollapsed; try { localStorage.setItem('erp-rail', state.railCollapsed ? '1' : '0'); } catch { /* abaikan */ } $('#app').dataset.rail = state.railCollapsed ? 'collapsed' : 'expanded'; return; }
    if (q('[data-open-palette]')) { openPalette(); return; }
    if ((el = q('[data-open-user]'))) { openUserMenu(el); return; }
    if (q('[data-theme-cycle]')) { state.theme = state.theme === 'system' ? 'light' : state.theme === 'light' ? 'dark' : 'system'; applyTheme(); closeOverlay(); return; }
    if ((el = q('[data-theme-set]'))) { state.theme = el.dataset.themeSet; applyTheme(); $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', b === el)); return; }
    if (q('[data-print]')) { window.print(); return; }
    if ((el = q('[data-new]'))) { R().openForm(el.dataset.new); return; }
    if ((el = q('[data-edit]'))) { const [k, id] = el.dataset.edit.split(':'); R().openForm(k, Number(id)); return; }
    if ((el = q('[data-delete]'))) { const [k, id] = el.dataset.delete.split(':'); R().removeRecord(k, Number(id)); return; }
    if ((el = q('[data-action-run]'))) { const [k, id, a] = el.dataset.actionRun.split(':'); R().runAction(k, Number(id), a); return; }
    if ((el = q('[data-export]'))) { R().exportCsv(el.dataset.export); return; }
    if (q('[data-stop]')) return;
    if ((el = q('[data-open]'))) { const [k, id] = el.dataset.open.split(':'); R().openRecord(k, Number(id)); return; }
    if ((el = q('[data-gl]'))) {
      state.reportState = state.reportState || {};
      state.reportState['buku-besar'] = { mode: 'single', account: el.dataset.gl };
      setView('lap-buku-besar'); return;
    }
    // Register
    const card = t.closest('[data-register]');
    if (card) {
      const key = card.dataset.register;
      const st = R().regState(key);
      if ((el = q('[data-sort]'))) { const s = el.dataset.sort; st.dir = (st.sort || R().ent(key).sort) === s && (st.dir || R().ent(key).sortDir) === 'asc' ? 'desc' : 'asc'; st.sort = s; st.page = 1; R().loadRegister(key); return; }
      if ((el = q('[data-status]'))) { st.status = el.dataset.status; st.page = 1; R().loadRegister(key); return; }
      if ((el = q('[data-page]'))) { st.page += el.dataset.page === 'next' ? 1 : -1; R().loadRegister(key); return; }
    }
    // Laporan
    if ((el = q('[data-rmode]'))) { const it = findItem(state.view); state.reportState[it.report].mode = el.dataset.rmode; renderView(); return; }
    if ((el = q('[data-rtab]'))) { if (findItem(state.view).view === 'branch') state.branchTab = el.dataset.rtab; else state.consTab = el.dataset.rtab; renderView(); return; }
    if (q('[data-report-csv]')) { const tb = $('.report-body table'); if (tb) ERP.download(`laporan-${state.view}-${state.meta.today}.csv`, ERP.csvFromTable(tb)); return; }
    // Jejak audit
    if ((el = q('[data-audit-page]'))) { state.auditState.page += el.dataset.auditPage === 'next' ? 1 : -1; V().loadAudit($('.view-root')); return; }
    if (q('[data-verify-audit]')) {
      try { const r = await api('GET', '/api/audit/verify'); toast(r.ok ? 'Jejak audit utuh' : 'Jejak audit RUSAK', r.ok ? `${FMT.int(r.count)} entri terverifikasi berantai.` : `Rantai putus pada entri #${r.brokenAt}.`, r.ok ? 'ok' : 'danger'); } catch (e) { fail(e); }
      return;
    }
    if (q('[data-backup]')) {
      try { const b = await api('POST', '/api/admin/backup', {}); toast('Cadangan dibuat', `${b.file} · SHA-256 ${b.sha256.slice(0, 12)}…`); renderView(); } catch (e) { fail(e); }
      return;
    }
    // Profil
    if (q('[data-mfa-setup]')) {
      try {
        const s = await api('POST', '/api/auth/mfa/setup', {});
        const box = $('[data-mfa-box]');
        box.innerHTML = `<ol class="steps"><li>Buka aplikasi autentikator dan tambahkan akun secara manual.</li><li>Masukkan kunci rahasia berikut:</li></ol>
          <p class="secret code" data-secret>${esc(s.secret.replace(/(.{4})/g, '$1 ').trim())}</p><p class="field-hint">URI: <span class="code">${esc(s.uri)}</span></p>
          <form class="form-grid" data-mfa-enable><div class="field"><label>Kode 6 digit</label><input class="input num otp" name="code" inputmode="numeric" maxlength="6" pattern="\\d{6}" required></div><div class="form-grid-full"><button class="btn btn-primary" type="button" data-mfa-confirm>Konfirmasi & aktifkan</button></div></form>`;
      } catch (e) { fail(e); }
      return;
    }
    if (q('[data-mfa-confirm]')) {
      const code = $('[data-mfa-enable] [name=code]').value;
      try { await api('POST', '/api/auth/mfa/enable', { code }); toast('MFA aktif', 'Kode autentikator akan diminta setiap kali masuk.'); state.me = await api('GET', '/api/auth/me'); renderView(); } catch (e) { fail(e); }
      return;
    }
    if ((el = q('[data-revoke-session]'))) {
      try { await api('DELETE', `/api/auth/sessions/${el.dataset.revokeSession}`); toast('Sesi dicabut'); renderView(); } catch (e) { fail(e); }
    }
  });

  document.addEventListener('change', async (ev) => {
    const t = ev.target;
    if (t.matches('[data-ctx="company"]')) { state.companyId = Number(t.value); state.branchId = 'all'; await reloadMeta(); return; }
    if (t.matches('[data-ctx="branch"]')) { state.branchId = t.value; await reloadMeta(); return; }
    if (t.matches('[data-ctx="from"],[data-ctx="to"]')) { state[t.dataset.ctx] = t.value || null; ERP.saveCtx(); renderView(); return; }
    if (t.matches('[data-rp]')) {
      state[t.dataset.rp] = t.value || null; ERP.saveCtx();
      const ctxInput = $(`[data-ctx="${t.dataset.rp}"]`); if (ctxInput) ctxInput.value = t.value;
      const it = findItem(state.view);
      if (it.view === 'budget') { ERP.budget.loadBudget(); return; }
      const name = it.report || (it.view === 'branch' ? state.branchTab || 'laba-rugi' : state.consTab || 'neraca');
      V().loadReport($('.view-root'), name, state.reportState[name]); return;
    }
    if (t.matches('[data-rp-account]')) { state.reportState['buku-besar'].account = t.value; V().loadReport($('.view-root'), 'buku-besar', state.reportState['buku-besar']); return; }
    if (t.matches('[data-perm]')) {
      const [roleId, mod] = t.dataset.perm.split(':');
      try { await api('PUT', `/api/roles/${roleId}/permissions`, { permissions: { [mod]: Number(t.value) } }); toast('Izin diperbarui', 'Perubahan tercatat di jejak audit.'); } catch (e) { fail(e); renderView(); }
    }
  });

  let searchTimer = null;
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.matches('[data-reg-search]')) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { const st = R().regState(t.dataset.regSearch); st.q = t.value; st.page = 1; R().loadRegister(t.dataset.regSearch); }, 250);
    }
    if (t.matches('[data-audit-search]')) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.auditState.q = t.value; state.auditState.page = 1; V().loadAudit($('.view-root')); }, 300);
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && state.overlay) { closeOverlay(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k' && state.meta) { ev.preventDefault(); openPalette(); return; }
    if (ev.key === 'Enter' && ev.target.matches('tr[data-open], .board-card[data-open], tr[data-gl]')) { ev.target.click(); }
  });

  // Seret-dan-lepas kanban CRM.
  let dragId = null;
  document.addEventListener('dragstart', (ev) => { const c = ev.target.closest?.('[data-drag-id]'); if (c) { dragId = c.dataset.dragId; ev.dataTransfer.effectAllowed = 'move'; } });
  document.addEventListener('dragover', (ev) => { if (dragId && ev.target.closest('[data-drop]')) ev.preventDefault(); });
  document.addEventListener('drop', (ev) => {
    const col = ev.target.closest('[data-drop]');
    if (!dragId || !col) return;
    ev.preventDefault();
    const key = col.closest('[data-board]').dataset.board;
    V().moveCard(key, dragId, col.dataset.drop);
    dragId = null;
  });

  window.addEventListener('hashchange', () => {
    const id = location.hash.replace(/^#\//, '').split('/')[0];
    if (state.meta && id && id !== state.view && findItem(id)) setView(id);
  });

  ERP.onUnauthorized = () => { if (state.me) { state.me = null; stopIdleTimer(); closeOverlay(); renderLogin('password', 'Sesi Anda berakhir. Silakan masuk kembali.'); } };
  ERP.onMustChange = () => renderLogin('change');
  const canSee = (id) => { const it = findItem(id); return !!it && allowed(it); };
  ERP.app = { render, renderView, setView, refreshView, boot, viewForEntity, canSee };

  applyTheme();
  boot();
})();
