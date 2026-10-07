/* ==========================================================================
   Tampilan khusus: dasbor, kotak persetujuan, laporan keuangan (perusahaan,
   per cabang, konsolidasi), bagan akun, papan CRM & produksi, kasir POS,
   pusat keamanan, jejak audit, matriks izin, pengaturan, dan profil.
   ========================================================================== */
/* global ERP, FMT, Charts */
(() => {
  'use strict';
  const { $, $$, esc, icon, api, qs, state, money, pill, toast, fail, num, openModal, closeOverlay, confirmBox } = ERP;
  const R = () => ERP.records;

  const pageHead = (title, sub, actions = '') => `
    <div class="page-head"><div class="page-head-text"><h1 class="page-title">${esc(title)}</h1><p class="page-sub">${esc(sub)}</p></div>
    <div class="page-actions">${actions}</div></div>`;
  const kpi = (label, value, foot = '', tone = '') => `<div class="kpi-tile"><span class="kpi-label">${esc(label)}</span><span class="kpi-value ${tone}">${value}</span><span class="kpi-foot">${esc(foot)}</span></div>`;
  const companyName = () => state.meta.companies.find((c) => c.id === state.meta.companyId)?.name || '';
  const branchName = () => (state.meta.branchId ? state.meta.branches.find((b) => b.id === state.meta.branchId)?.name : 'Semua cabang');
  const period = () => ({ from: state.from || `${state.meta.today.slice(0, 4)}-01-01`, to: state.to || state.meta.today });
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  /* ======================================================================== */
  /* Dasbor                                                                   */
  /* ======================================================================== */
  async function dashboard(root) {
    root.innerHTML = pageHead('Dasbor', `Ikhtisar ${companyName()} · ${branchName()} — seluruh angka dihitung langsung dari buku besar terposting.`) + '<div class="loading-cell">Memuat…</div>';
    let d;
    try { d = await api('GET', '/api/dashboard'); } catch (e) { root.innerHTML += `<p class="neg">${esc(e.message)}</p>`; return; }
    const k = d.kpis;
    const hasFin = k.revenueYtd !== undefined;
    root.innerHTML = pageHead('Dasbor', `Ikhtisar ${companyName()} · ${branchName()} per ${ERP.date(d.asOf)} — dihitung langsung dari buku besar terposting.`,
      `<button class="btn" data-nav="lap-neraca">${icon('scale')} Neraca</button><button class="btn" data-nav="lap-laba-rugi">${icon('bar-chart')} Laba rugi</button>`) +
      `<section class="kpi-grid-erp" aria-label="Indikator utama">
        ${hasFin ? kpi('Pendapatan bulan berjalan', esc(FMT.rpCompact(k.revenueMtd)), 'dari jurnal pendapatan') + kpi('Pendapatan tahun berjalan', esc(FMT.rpCompact(k.revenueYtd)), `Margin kotor ${FMT.pct(k.grossMarginPct)}`) + kpi('Laba bersih YTD', esc(FMT.rpCompact(k.netIncomeYtd)), 'setelah pajak', k.netIncomeYtd < 0 ? 'neg' : 'pos') + kpi('Kas & bank', esc(FMT.rpCompact(k.cash)), 'saldo buku besar') : ''}
        ${kpi('Piutang terbuka', esc(FMT.rpCompact(k.arOpen)), k.arOverdue ? `${FMT.rpCompact(k.arOverdue)} lewat jatuh tempo` : 'tidak ada yang lewat jatuh tempo', k.arOverdue ? 'neg' : '')}
        ${kpi('Hutang terbuka', esc(FMT.rpCompact(k.apOpen)), 'ke pemasok')}
      </section>
      ${hasFin ? `<div class="grid grid-2-1">
        <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Pendapatan per bulan</h2><span class="card-note">12 bulan terakhir · akun golongan pendapatan</span></div></div>
          <div class="card-body"><div class="chart" data-chart="rev"></div></div>
          <div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Bulan</th><th class="ta-r">Pendapatan</th><th class="ta-r">Beban</th><th class="ta-r">Selisih</th></tr></thead><tbody>
          ${d.trend.slice(-6).map((t) => `<tr><td class="num">${esc(BULAN[Number(t.month.slice(5)) - 1])} ${t.month.slice(0, 4)}</td><td class="ta-r">${money(t.revenue)}</td><td class="ta-r">${money(t.expense)}</td><td class="ta-r">${money(t.revenue - t.expense)}</td></tr>`).join('')}
          </tbody></table></div></article>
        <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Pendapatan per cabang</h2><span class="card-note">tahun berjalan</span></div></div><div class="card-body"><div data-chart="branch"></div></div>
          <div class="card-head"><div class="card-head-text"><h2 class="card-title">Pelanggan teratas</h2></div></div>
          <div class="table-scroll"><table class="table tbl-sm"><tbody>${d.topCustomers.map((c) => `<tr><td>${esc(c.name)}</td><td class="ta-r">${money(c.revenue)}</td></tr>`).join('') || '<tr><td class="muted">Belum ada penjualan.</td></tr>'}</tbody></table></div>
        </article>
      </div>` : ''}
      <div class="grid grid-1-1">
        <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Menunggu tindakan</h2><span class="card-note">dokumen pada alur persetujuan</span></div></div>
          <div class="worklist">${d.pending.map((p) => `<button class="worklist-item" data-nav="persetujuan"><span class="wl-icon" data-tone="warn">${icon('inbox')}</span><span class="worklist-body"><span class="worklist-title">${esc(p.label)}</span><span class="worklist-meta">menunggu persetujuan / proses</span></span><span class="worklist-side"><b class="num">${p.count}</b>${icon('chevron-right')}</span></button>`).join('') || '<div class="empty-note pad">Tidak ada dokumen menunggu.</div>'}</div></article>
        <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Stok kritis</h2><span class="card-note">di bawah titik pesan ulang</span></div></div>
          <div class="worklist">${d.lowStock.map((s) => `<button class="worklist-item" data-nav="stok"><span class="wl-icon" data-tone="${s.state === 'habis' ? 'danger' : 'warn'}">${icon('alert')}</span><span class="worklist-body"><span class="worklist-title">${esc(s.name)}</span><span class="worklist-meta"><span class="code">${esc(s.code)}</span><span>${esc(s.warehouse)}</span></span></span><span class="worklist-side"><b class="num">${esc(num(s.qty, 0))} ${esc(s.uom)}</b><span class="micro">min ${esc(num(s.min_stock, 0))}</span></span></button>`).join('') || '<div class="empty-note pad">Semua stok di atas minimum.</div>'}</div></article>
      </div>`;
    if (hasFin) {
      const rev = $('[data-chart="rev"]', root);
      if (rev && d.trend.length) Charts.columnChart(rev, { title: 'Pendapatan per bulan', ariaLabel: 'Pendapatan per bulan', items: d.trend.map((t) => ({ label: `${BULAN[Number(t.month.slice(5)) - 1]} ${t.month.slice(0, 4)}`, short: BULAN[Number(t.month.slice(5)) - 1], value: Math.max(0, t.revenue), count: t.count })), height: 220 });
      const br = $('[data-chart="branch"]', root);
      if (br && d.byBranch.length) Charts.rankBars(br, { items: d.byBranch.map((b) => ({ label: esc(b.name), value: Math.max(0, b.revenue) })) });
    }
  }

  /* ======================================================================== */
  /* Kotak persetujuan                                                        */
  /* ======================================================================== */
  async function approvals(root) {
    root.innerHTML = pageHead('Kotak Persetujuan', 'Dokumen lintas modul yang menunggu keputusan Anda. Pembuat dokumen tidak dapat menyetujui dokumennya sendiri (pemisahan tugas).') + '<div class="loading-cell">Memuat…</div>';
    let items;
    try { items = await api('GET', '/api/approvals'); } catch (e) { return fail(e); }
    root.innerHTML = pageHead('Kotak Persetujuan', 'Dokumen lintas modul yang menunggu keputusan Anda. Pembuat dokumen tidak dapat menyetujui dokumennya sendiri (pemisahan tugas).') +
      (items.length ? `<div class="approval-grid">${items.map((a) => `
        <article class="approval-card">
          <div class="approval-card-head"><span class="code">${esc(a.number || '')}</span>${pill(a.entity === 'journals' ? 'diajukan' : a.entity === 'payroll_runs' ? 'draf' : 'menunggu')}</div>
          <div class="approval-card-body">
            <b>${esc(a.title || '')}</b>
            <span class="muted">${esc(a.entityLabel)} · ${esc(a.branch || '')} · ${esc(ERP.date(a.date))}</span>
            ${a.total != null ? `<span class="num approval-amount">${esc(FMT.rp(a.total))}</span>` : ''}
            ${a.note ? `<span class="field-hint">${esc(a.note)}</span>` : ''}
          </div>
          <div class="approval-card-foot">
            <button class="btn btn-sm" data-open="${a.entity}:${a.id}">${icon('eye')} Rincian</button>
            <div class="toolbar-spacer"></div>
            ${a.sodBlocked ? '<span class="field-hint">Dibuat oleh Anda</span>' : `<button class="btn btn-sm btn-primary" data-action-run="${a.entity}:${a.id}:${a.action}">${icon('check')} Setujui</button>`}
          </div>
        </article>`).join('')}</div>` : `<div class="empty"><div class="empty-card"><span class="empty-title">Kotak persetujuan kosong</span><span class="empty-note">Tidak ada dokumen yang menunggu keputusan Anda.</span></div></div>`);
  }

  /* ======================================================================== */
  /* Laporan keuangan                                                         */
  /* ======================================================================== */
  const REPORT_META = {
    neraca: { title: 'Laporan Posisi Keuangan (Neraca)', asOf: true, modes: true },
    'laba-rugi': { title: 'Laporan Laba Rugi', range: true, modes: true },
    'arus-kas': { title: 'Laporan Arus Kas', range: true },
    'neraca-saldo': { title: 'Neraca Saldo', range: true },
    'buku-besar': { title: 'Buku Besar', range: true, account: true },
    'umur-piutang': { title: 'Umur Piutang Usaha', asOf: true },
    'umur-hutang': { title: 'Umur Hutang Usaha', asOf: true },
    persediaan: { title: 'Stok & Valuasi Persediaan' },
    anggaran: { title: 'Anggaran vs Realisasi', asOf: true },
  };

  async function report(root, name, forcedMode = null) {
    const meta = REPORT_META[name];
    const st = (state.reportState = state.reportState || {});
    const rs = (st[name] = st[name] || { mode: forcedMode || 'single', account: null });
    if (forcedMode) rs.mode = forcedMode;
    const p = period();
    const modeSwitch = meta.modes && !forcedMode ? `<div class="segmented" role="group" aria-label="Cakupan laporan">
        <button data-rmode="single" aria-pressed="${rs.mode === 'single'}">Perusahaan</button>
        <button data-rmode="branch" aria-pressed="${rs.mode === 'branch'}">Per cabang</button>
        ${state.meta.canConsolidate && (state.me.permissions.reports || 0) >= 3 ? `<button data-rmode="consolidated" aria-pressed="${rs.mode === 'consolidated'}">Konsolidasi grup</button>` : ''}
      </div>` : '';
    const forcedTabs = forcedMode ? `<div class="segmented" role="group" aria-label="Jenis laporan">
        <button data-rtab="neraca" aria-pressed="${name === 'neraca'}">Neraca</button><button data-rtab="laba-rugi" aria-pressed="${name === 'laba-rugi'}">Laba rugi</button></div>` : '';
    const title = forcedMode === 'branch' ? `Laporan Cabang — ${meta.title}` : forcedMode === 'consolidated' ? `Laporan Konsolidasi — ${meta.title}` : meta.title;
    root.innerHTML = pageHead(title, `${companyName()}${rs.mode === 'single' ? ` · ${branchName()}` : rs.mode === 'branch' ? ' · seluruh cabang' : ' beserta entitas anak'} — sumber: buku besar terposting.`,
      `<button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button><button class="btn" data-print-report>${icon('print')} Cetak</button>`) +
      `<article class="card report-card">
        <div class="toolbar report-toolbar">
          ${forcedTabs}${modeSwitch}
          ${meta.range ? `<label class="ctx-inline">Dari <input class="input num" type="date" data-rp="from" value="${esc(p.from)}"></label><label class="ctx-inline">Sampai <input class="input num" type="date" data-rp="to" value="${esc(p.to)}"></label>` : ''}
          ${meta.asOf ? `<label class="ctx-inline">Per tanggal <input class="input num" type="date" data-rp="to" value="${esc(p.to)}"></label>` : ''}
          ${meta.account ? `<label class="ctx-inline">Akun <select class="select" data-rp-account data-ref="accounts" data-ref-filter='{"f_is_header":"0"}' data-value="${esc(rs.account || '')}"><option value="">Memuat…</option></select></label>` : ''}
          <div class="toolbar-spacer"></div>
          <span class="pager-info" data-rinfo></span>
        </div>
        <div class="report-body" data-report-body><div class="loading-cell">Menghitung…</div></div>
      </article>`;
    if (meta.account) {
      await ERP.forms.hydrateRefs(root);
      const sel = $('[data-rp-account]', root);
      if (!rs.account && sel.options.length > 1) { rs.account = sel.options[1].value; sel.value = rs.account; }
    }
    await loadReport(root, name, rs);
  }

  async function loadReport(root, name, rs) {
    const body = $('[data-report-body]', root);
    const p = period();
    const q = { from: p.from, to: p.to, asOf: p.to, mode: rs.mode, account: rs.account || '' };
    if (name === 'buku-besar' && !rs.account) { body.innerHTML = '<p class="pad muted">Pilih akun.</p>'; return; }
    let r;
    try { r = await api('GET', `/api/reports/${name}${qs(q)}`); } catch (e) { body.innerHTML = `<p class="pad neg">${esc(e.message)}</p>`; return; }
    const info = $('[data-rinfo]', root);
    const headerLine = `<div class="report-head"><b>${esc(companyName())}</b><span>${esc(r.title)}</span><span class="num">${r.period ? `${esc(ERP.date(r.period.from))} s.d. ${esc(ERP.date(r.period.to))}` : `Per ${esc(ERP.date(r.asOf || p.to))}`}</span><span class="muted">Disajikan dalam Rupiah · ${esc(rs.mode === 'consolidated' ? 'Konsolidasi grup' : rs.mode === 'branch' ? 'Per cabang' : branchName())}</span></div>`;
    const check = (ok, okText, badText) => `<div class="notice" data-tone="${ok ? 'ok' : 'danger'}">${icon(ok ? 'check' : 'alert')} ${esc(ok ? okText : badText)}</div>`;
    switch (name) {
      case 'neraca': case 'laba-rugi':
        body.innerHTML = headerLine + statement(r, rs.mode === 'single') + (r.balanced !== undefined ? check(r.balanced, 'Neraca seimbang: total aset = total liabilitas + ekuitas.', `Neraca tidak seimbang (selisih ${FMT.rp(Object.values(r.diff)[0])}).`) : '');
        break;
      case 'neraca-saldo':
        body.innerHTML = headerLine + `<div class="table-scroll"><table class="table report-table"><thead><tr><th>Kode</th><th>Akun</th><th class="ta-r">Saldo awal</th><th class="ta-r">Debit</th><th class="ta-r">Kredit</th><th class="ta-r">Saldo akhir</th></tr></thead><tbody>
          ${r.rows.map((a) => `<tr data-gl="${a.id}" tabindex="0"><td class="code">${esc(a.code)}</td><td>${esc(a.name)}</td><td class="ta-r">${money(a.opening)}</td><td class="ta-r">${money(a.debit)}</td><td class="ta-r">${money(a.credit)}</td><td class="ta-r">${money(a.closing)}</td></tr>`).join('')}
          </tbody><tfoot><tr class="row-total"><td></td><td>Total</td><td class="ta-r">${money(r.totals.opening)}</td><td class="ta-r">${money(r.totals.debit)}</td><td class="ta-r">${money(r.totals.credit)}</td><td class="ta-r">${money(r.totals.closing)}</td></tr></tfoot></table></div>` +
          check(r.balanced, 'Neraca saldo seimbang (Σ debit = Σ kredit).', 'Neraca saldo tidak seimbang!');
        break;
      case 'buku-besar':
        body.innerHTML = headerLine + `<div class="table-scroll"><table class="table report-table"><thead><tr><th>Tanggal</th><th>Jurnal</th><th>Uraian</th><th>Cabang</th><th class="ta-r">Debit</th><th class="ta-r">Kredit</th><th class="ta-r">Saldo</th></tr></thead><tbody>
          <tr class="row-sub"><td colspan="6">Saldo awal</td><td class="ta-r">${money(r.opening)}</td></tr>
          ${r.lines.map((l) => `<tr data-open="journals:${l.journal_id}" tabindex="0"><td class="num">${esc(ERP.date(l.date))}</td><td class="code">${esc(l.number)}</td><td>${esc(l.description)}${l.memo ? `<span class="cell-sub">${esc(l.memo)}</span>` : ''}</td><td>${esc(l.branch)}</td><td class="ta-r">${l.debit ? money(l.debit) : ''}</td><td class="ta-r">${l.credit ? money(l.credit) : ''}</td><td class="ta-r">${money(l.balance)}</td></tr>`).join('')}
          </tbody><tfoot><tr class="row-total"><td colspan="6">Saldo akhir</td><td class="ta-r">${money(r.closing)}</td></tr></tfoot></table></div>`;
        if (info) info.textContent = `${r.lines.length} mutasi`;
        break;
      case 'arus-kas':
        body.innerHTML = headerLine + `<div class="table-scroll"><table class="table report-table"><tbody>
          ${r.sections.map((s) => `<tr class="row-section"><td colspan="2">${esc(s.label)}</td></tr>${s.rows.map((x) => `<tr><td class="indent-1">${esc(x.code)} ${esc(x.name)}</td><td class="ta-r">${money(x.amount)}</td></tr>`).join('')}<tr class="row-sub"><td>Kas bersih dari ${esc(s.label.replace('Arus kas dari ', '').replace('Arus kas ', ''))}</td><td class="ta-r">${money(s.total)}</td></tr>`).join('')}
          <tr class="row-total"><td>Kenaikan (penurunan) bersih kas</td><td class="ta-r">${money(r.net)}</td></tr>
          <tr><td>Kas & setara kas awal periode</td><td class="ta-r">${money(r.opening)}</td></tr>
          <tr class="row-grand"><td>Kas & setara kas akhir periode</td><td class="ta-r">${money(r.closing)}</td></tr></tbody></table></div>` +
          check(r.balanced, 'Arus kas terekonsiliasi dengan saldo kas buku besar.', 'Arus kas tidak cocok dengan saldo kas!');
        break;
      case 'umur-piutang': case 'umur-hutang':
        body.innerHTML = headerLine + `<div class="table-scroll"><table class="table report-table"><thead><tr><th>${name === 'umur-piutang' ? 'Pelanggan' : 'Pemasok'}</th>${r.buckets.map((b) => `<th class="ta-r">${esc(b.label)}</th>`).join('')}<th class="ta-r">Total</th></tr></thead><tbody>
          ${r.parties.map((p2) => `<tr><td>${esc(p2.party)}</td>${r.buckets.map((b) => `<td class="ta-r">${p2[b.key] ? money(p2[b.key]) : '<span class="muted">—</span>'}</td>`).join('')}<td class="ta-r"><b>${money(p2.total)}</b></td></tr>`).join('') || `<tr><td colspan="${r.buckets.length + 2}" class="muted">Tidak ada saldo terbuka.</td></tr>`}
          </tbody><tfoot><tr class="row-total"><td>Total</td>${r.buckets.map((b) => `<td class="ta-r">${money(r.totals[b.key])}</td>`).join('')}<td class="ta-r">${money(r.totals.total)}</td></tr></tfoot></table></div>` +
          check(r.reconciled, `Sub-buku cocok dengan saldo buku besar (${FMT.rp(r.glBalance)}).`, `Sub-buku (${FMT.rp(r.totals.total)}) tidak cocok dengan buku besar (${FMT.rp(r.glBalance)}).`) +
          `<details class="pad"><summary>Rincian ${r.docs.length} dokumen terbuka</summary><table class="table tbl-sm"><thead><tr><th>Nomor</th><th>Pihak</th><th>Jatuh tempo</th><th class="ta-r">Hari</th><th class="ta-r">Sisa</th></tr></thead><tbody>${r.docs.map((x) => `<tr data-open="${name === 'umur-piutang' ? 'sales_invoices' : 'purchase_bills'}:${x.id}" tabindex="0"><td class="code">${esc(x.number)}</td><td>${esc(x.party)}</td><td class="num">${esc(ERP.date(x.due_date))}</td><td class="ta-r num ${x.days > 0 ? 'neg' : ''}">${x.days}</td><td class="ta-r">${money(x.open)}</td></tr>`).join('')}</tbody></table></details>`;
        break;
      case 'persediaan':
        body.innerHTML = `<div class="table-scroll"><table class="table report-table"><thead><tr><th>SKU</th><th>Barang</th><th>Gudang</th><th class="ta-r">Qty</th><th class="ta-r">Min</th><th class="ta-r">Biaya rata-rata</th><th class="ta-r">Nilai</th><th>Status</th></tr></thead><tbody>
          ${r.rows.map((x) => `<tr><td class="code">${esc(x.code)}</td><td>${esc(x.name)}</td><td>${esc(x.warehouse)}<span class="cell-sub">${esc(x.branch)}</span></td><td class="ta-r num">${esc(num(x.qty))} ${esc(x.uom)}</td><td class="ta-r num">${esc(num(x.min_stock, 0))}</td><td class="ta-r">${money(x.avg_cost)}</td><td class="ta-r">${money(x.value)}</td><td><span class="pill" data-tone="${x.state === 'aman' ? 'ok' : x.state === 'rendah' ? 'warn' : 'danger'}"><i class="pill-dot"></i>${esc(x.state)}</span></td></tr>`).join('')}
          </tbody><tfoot><tr class="row-total"><td colspan="6">Total nilai persediaan</td><td class="ta-r">${money(r.total)}</td><td></td></tr></tfoot></table></div>` +
          check(r.reconciled, `Valuasi stok cocok dengan akun persediaan buku besar (${FMT.rp(r.glBalance)}).`, `Valuasi stok (${FMT.rp(r.total)}) berbeda dengan buku besar (${FMT.rp(r.glBalance)}).`);
        break;
      case 'anggaran':
        body.innerHTML = headerLine + `<div class="table-scroll"><table class="table report-table"><thead><tr><th>Akun</th><th class="ta-r">Anggaran setahun</th><th class="ta-r">Anggaran s.d. bulan ini</th><th class="ta-r">Realisasi</th><th class="ta-r">Selisih</th><th class="ta-r">Prakiraan setahun</th><th>Serapan</th></tr></thead><tbody>
          ${r.rows.map((x) => { const rev = x.type === 'revenue'; const bad = rev ? x.variance < 0 : x.variance > 0; return `<tr><td><span class="code">${esc(x.code)}</span> ${esc(x.name)}</td><td class="ta-r">${money(x.budget)}</td><td class="ta-r">${money(x.ytdBudget)}</td><td class="ta-r">${money(x.actual)}</td><td class="ta-r ${bad ? 'neg' : 'pos'}">${esc(FMT.rp(x.variance))}</td><td class="ta-r">${money(x.forecast)}</td><td><span class="meter"><span class="meter-track"><span class="meter-fill" ${x.usage > 100 ? 'data-tone="danger"' : x.usage > 85 ? 'data-tone="warn"' : ''} style="width:${Math.min(100, x.usage)}%"></span></span><span class="meter-val">${esc(num(x.usage, 1))}%</span></span></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Belum ada anggaran untuk tahun ini. Tambahkan di menu Keuangan → Anggaran.</td></tr>'}
          </tbody></table></div>`;
        break;
      default: body.textContent = '';
    }
  }

  /** Penyaji laporan keuangan berkolom (neraca / laba rugi). */
  function statement(r, drill) {
    const cols = r.columns;
    const cells = (v, cls = '') => cols.map((c) => { const x = v?.[c.key] ?? 0; return `<td class="ta-r ${cls}${c.kind === 'elim' ? ' col-elim' : c.kind === 'total' || c.key === 'total' ? ' col-total' : ''}">${Math.abs(x) < 0.005 ? '<span class="muted">–</span>' : money(x)}</td>`; }).join('');
    let html = `<div class="table-scroll"><table class="table report-table statement"><thead><tr><th>Pos</th>${cols.map((c) => `<th class="ta-r${c.kind === 'elim' ? ' col-elim' : c.kind === 'total' || c.key === 'total' ? ' col-total' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>`;
    for (const b of r.blocks) {
      if (b.section) {
        html += `<tr class="row-section"><td colspan="${cols.length + 1}">${esc(b.section.label)}</td></tr>`;
        for (const row of b.section.rows) html += `<tr class="${row.header ? 'row-header' : ''}" ${!row.header && drill ? `data-gl="${row.id}" tabindex="0"` : ''}><td class="indent-${Math.min(row.level, 4)}"><span class="code">${esc(row.code)}</span> ${esc(row.name)}</td>${cells(row.values, row.header ? 'muted' : '')}</tr>`;
        for (const x of b.extra || []) html += `<tr class="row-extra"><td class="indent-1">${esc(x.name)}</td>${cells(x.values)}</tr>`;
        html += `<tr class="row-sub"><td>${esc(b.totalLabel || `Total ${b.section.label.toLowerCase()}`)}</td>${cells(b.total || b.section.total)}</tr>`;
      } else if (b.subtotal) {
        html += `<tr class="${b.grand ? 'row-grand' : 'row-total'}"><td>${esc(b.subtotal)}</td>${cells(b.values)}</tr>`;
      }
    }
    return html + '</tbody></table></div>';
  }

  /* ======================================================================== */
  /* Bagan akun (pohon)                                                       */
  /* ======================================================================== */
  async function coa(root) {
    const e = R().ent('accounts');
    root.innerHTML = pageHead('Bagan Akun (COA)', 'Struktur akun buku besar grup. Saldo dihitung dari jurnal terposting untuk perusahaan & cabang aktif. Hanya akun detail yang menerima jurnal.',
      `${e.canWrite ? `<button class="btn btn-primary" data-new="accounts">${icon('plus')} Akun baru</button>` : ''}`) + '<article class="card"><div class="loading-cell">Memuat…</div></article>';
    let data;
    try { data = await api('GET', '/api/e/accounts?size=500&sort=code'); } catch (err) { return fail(err); }
    const rows = data.rows;
    const byId = new Map(rows.map((r) => [r.id, { ...r, kids: [] }]));
    for (const r of byId.values()) if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id).kids.push(r);
    const total = (n) => (n.is_header ? n.kids.reduce((s, k) => s + total(k), 0) : n.balance || 0);
    const TYPE = Object.fromEntries((e.fields.find((f) => f.name === 'type').options).map(([k, v]) => [k, v]));
    const lines = [];
    const walk = (n, lvl) => {
      const bal = total(n);
      const sign = ['asset', 'cogs', 'expense', 'other_expense', 'tax'].includes(n.type) ? 1 : -1;
      lines.push(`<tr data-open="accounts:${n.id}" tabindex="0" class="${n.is_header ? 'coa-header-row' : ''}"><td class="indent-${Math.min(lvl, 4)}"><span class="code">${esc(n.code)}</span></td><td class="indent-${Math.min(lvl, 4)}">${n.is_header ? `<b>${esc(n.name)}</b>` : esc(n.name)}${n.is_intercompany ? ' <span class="pill" data-tone="info"><i class="pill-dot"></i>Antar perusahaan</span>' : ''}</td><td>${esc(TYPE[n.type] || n.type)}</td><td>${n.is_header ? 'Induk' : 'Detail'}</td><td class="ta-r">${money(Math.round(bal * sign * 100) / 100)}</td><td>${pill(n.status)}</td></tr>`);
      for (const k of n.kids.sort((a, b) => a.code.localeCompare(b.code))) walk(k, lvl + 1);
    };
    for (const r of [...byId.values()].filter((x) => !x.parent_id || !byId.has(x.parent_id)).sort((a, b) => a.code.localeCompare(b.code))) walk(r, 0);
    $('.card', root).innerHTML = `<div class="table-scroll"><table class="table"><thead><tr><th>Kode</th><th>Nama akun</th><th>Golongan</th><th>Tipe</th><th class="ta-r">Saldo normal</th><th>Status</th></tr></thead><tbody>${lines.join('')}</tbody></table></div>`;
  }

  /* ======================================================================== */
  /* Papan kanban (CRM & produksi)                                            */
  /* ======================================================================== */
  async function board(root, key, cfg) {
    const e = R().ent(key);
    if (!e) { root.innerHTML = R().noAccess(); return; }
    root.innerHTML = pageHead(cfg.title, cfg.sub, `<button class="btn" data-nav-list="${key}">${icon('filter')} Tampilan daftar</button>${e.canWrite ? `<button class="btn btn-primary" data-new="${key}">${icon('plus')} ${esc(cfg.newLabel)}</button>` : ''}`) + '<div class="loading-cell">Memuat…</div>';
    let data;
    try { data = await api('GET', `/api/e/${key}?size=500`); } catch (err) { return fail(err); }
    const sf = e.statusField;
    const cols = (e.fields.find((f) => f.name === sf).options).map((o) => (Array.isArray(o) ? o[0] : o)).filter((s) => !cfg.hide?.includes(s));
    const kpis = cfg.kpis ? `<section class="kpi-grid-erp">${cfg.kpis(data.rows)}</section>` : '';
    root.innerHTML = pageHead(cfg.title, cfg.sub, `<button class="btn" data-nav-list="${key}">${icon('filter')} Tampilan daftar</button>${e.canWrite ? `<button class="btn btn-primary" data-new="${key}">${icon('plus')} ${esc(cfg.newLabel)}</button>` : ''}`) + kpis +
      `<div class="board board-erp" data-board="${key}">${cols.map((s) => {
        const items = data.rows.filter((r) => r[sf] === s);
        return `<section class="board-col" data-drop="${esc(s)}"><header class="board-col-head">${pill(s)}<span class="chip-count">${items.length}</span></header>
          <div class="board-col-body">${items.map((r) => `<article class="board-card" ${cfg.draggable && e.canWrite ? 'draggable="true"' : ''} data-drag-id="${r.id}" data-open="${key}:${r.id}" tabindex="0">${cfg.card(r)}</article>`).join('') || '<span class="empty-note">—</span>'}</div></section>`;
      }).join('')}</div>`;
  }

  const crmCfg = {
    title: 'Lead & Peluang', sub: 'Pipeline penjualan dari prospek hingga closing. Seret kartu untuk memindahkan tahap; perubahan tersimpan & teraudit.', newLabel: 'Peluang baru', draggable: true,
    card: (r) => `<div class="board-card-top"><span class="code">${esc(r.number)}</span><span class="num">${esc(num(r.probability, 0))}%</span></div><div class="board-card-title">${esc(r.title)}</div><div class="board-card-meta"><span>${esc(r.company_name)}</span><b class="num">${esc(FMT.rpCompact(r.value || 0))}</b></div>`,
    kpis: (rows) => {
      const active = rows.filter((r) => !['menang', 'kalah'].includes(r.stage));
      const pipe = active.reduce((s, r) => s + (r.value || 0), 0), weighted = active.reduce((s, r) => s + (r.value || 0) * (r.probability || 0) / 100, 0);
      return kpi('Nilai pipeline', esc(FMT.rpCompact(pipe)), `${active.length} peluang aktif`) + kpi('Tertimbang', esc(FMT.rpCompact(weighted)), 'nilai × probabilitas') + kpi('Menang', String(rows.filter((r) => r.stage === 'menang').length), 'peluang', 'pos') + kpi('Kalah', String(rows.filter((r) => r.stage === 'kalah').length), 'peluang', 'neg');
    },
  };
  const woCfg = {
    title: 'Perintah Kerja', sub: 'Papan produksi: antre → berjalan → QC → selesai. Penyelesaian memakai bahan baku (BOM) dan memposting hasil produksi ke persediaan & buku besar.', newLabel: 'Perintah kerja baru',
    card: (r) => `<div class="board-card-top"><span class="code">${esc(r.number)}</span><span>${esc(r.line || '')}</span></div><div class="board-card-title">${esc(r.bom_id__label || '')}</div><div class="board-card-meta"><span>${esc(num(r.qty, 0))} batch · ${esc(ERP.date(r.due_date))}</span><span class="num">${esc(num(r.progress, 0))}%</span></div><span class="meter"><span class="meter-track"><span class="meter-fill" style="width:${Number(r.progress) || 0}%"></span></span></span>`,
  };

  async function moveCard(key, id, status) {
    try {
      await api('PUT', `/api/e/${key}/${id}`, { stage: status });
      toast('Tahap diperbarui', state.meta.status[status]?.[0] || status);
    } catch (err) { fail(err); }
    ERP.app.render();
  }

  /* ======================================================================== */
  /* Kasir (POS)                                                              */
  /* ======================================================================== */
  async function pos(root) {
    const e = R().ent('pos_sales');
    if (!e) { root.innerHTML = R().noAccess(); return; }
    const cart = (state.posCart = state.posCart || []);
    root.innerHTML = pageHead('Kasir (POS)', 'Penjualan tunai/non-tunai di toko. Setiap transaksi langsung mengurangi stok dan memposting jurnal kas, pendapatan, PPN, dan HPP.') +
      `<div class="grid grid-2-1"><article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Pilih barang</h2></div>
        <div class="search-wrap">${icon('search')}<input class="input" type="search" data-pos-search placeholder="Cari SKU / nama"></div></div><div class="pos-grid" data-pos-products><div class="loading-cell">Memuat…</div></div></article>
      <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Keranjang</h2></div></div>
        <form class="pos-form" data-pos-form>
          <div class="field"><label>Gudang toko</label><select class="select" name="warehouse_id" data-ref="warehouses" data-ref-filter="{}" required></select></div>
          <div class="field"><label>Laci kas / rekening</label><select class="select" name="bank_account_id" data-ref="bank_accounts" data-ref-filter="{}" required></select></div>
          <div class="field"><label>Metode bayar</label><select class="select" name="payment_method">${['Tunai', 'QRIS', 'Debit', 'Kartu kredit', 'Transfer'].map((m) => `<option>${m}</option>`).join('')}</select></div>
        </form>
        <div class="table-scroll"><table class="table tbl-sm" data-pos-cart></table></div>
        <div class="card-foot pos-foot"><div class="totals" data-pos-totals></div></div>
        <div class="card-foot"><button class="btn btn-primary" data-pos-pay>${icon('check')} Bayar & posting</button><button class="btn btn-ghost" data-pos-clear>Kosongkan</button></div>
      </article></div>
      <div data-pos-register></div>`;
    await ERP.forms.hydrateRefs($('[data-pos-form]', root));
    const products = await ERP.forms.lookup('products', { f_kind: 'barang_dagang,jasa' });
    const drawProducts = (q = '') => {
      $('[data-pos-products]', root).innerHTML = products.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())).map((p) => `<button class="pos-item" data-pos-add="${p.id}"><span class="cell-strong">${esc(p.label)}</span><span class="num">${esc(FMT.rp(p.price || 0))}</span></button>`).join('') || '<span class="empty-note">Tidak ada barang.</span>';
    };
    const drawCart = () => {
      const sub = cart.reduce((s, l) => s + l.qty * l.price, 0), tax = Math.round(sub * 0.11 * 100) / 100;
      $('[data-pos-cart]', root).innerHTML = `<thead><tr><th>Barang</th><th class="ta-r">Qty</th><th class="ta-r">Jumlah</th><th></th></tr></thead><tbody>${cart.map((l, i) => `<tr><td>${esc(l.label)}</td><td class="ta-r"><input class="input num input-qty" type="number" min="1" step="1" value="${l.qty}" data-pos-qty="${i}" aria-label="Qty"></td><td class="ta-r">${money(l.qty * l.price)}</td><td><button class="btn btn-sm btn-icon btn-ghost" data-pos-del="${i}" aria-label="Hapus">${icon('x')}</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Keranjang kosong.</td></tr>'}</tbody>`;
      $('[data-pos-totals]', root).innerHTML = `<div class="totals-row"><span>Subtotal</span><b>${esc(FMT.rp(sub))}</b></div><div class="totals-row"><span>PPN 11%</span><b>${esc(FMT.rp(tax))}</b></div><div class="totals-row totals-grand"><span>Total</span><b>${esc(FMT.rp(sub + tax))}</b></div>`;
    };
    drawProducts(); drawCart();
    root.addEventListener('input', (ev) => {
      if (ev.target.matches('[data-pos-search]')) drawProducts(ev.target.value);
      if (ev.target.matches('[data-pos-qty]')) { cart[Number(ev.target.dataset.posQty)].qty = Math.max(1, Number(ev.target.value) || 1); drawCartTotalsOnly(); }
    });
    const drawCartTotalsOnly = () => { const sub = cart.reduce((s, l) => s + l.qty * l.price, 0); const tax = Math.round(sub * 0.11 * 100) / 100; $('[data-pos-totals]', root).innerHTML = `<div class="totals-row"><span>Subtotal</span><b>${esc(FMT.rp(sub))}</b></div><div class="totals-row"><span>PPN 11%</span><b>${esc(FMT.rp(tax))}</b></div><div class="totals-row totals-grand"><span>Total</span><b>${esc(FMT.rp(sub + tax))}</b></div>`; };
    root.addEventListener('click', async (ev) => {
      const add = ev.target.closest('[data-pos-add]');
      if (add) { const p = products.find((x) => String(x.id) === add.dataset.posAdd); const ex = cart.find((l) => l.product_id === p.id); if (ex) ex.qty++; else cart.push({ product_id: p.id, label: p.label, qty: 1, price: p.price || 0 }); drawCart(); }
      const del = ev.target.closest('[data-pos-del]');
      if (del) { cart.splice(Number(del.dataset.posDel), 1); drawCart(); }
      if (ev.target.closest('[data-pos-clear]')) { cart.length = 0; drawCart(); }
      if (ev.target.closest('[data-pos-pay]')) {
        if (!cart.length) return toast('Keranjang kosong', '', 'warn');
        const f = $('[data-pos-form]', root);
        const body = { date: state.meta.today, warehouse_id: Number(f.warehouse_id.value), bank_account_id: Number(f.bank_account_id.value), payment_method: f.payment_method.value, customer_name: 'Umum', tax_rate: 11, lines: cart.map((l) => ({ product_id: l.product_id, qty: l.qty, price: l.price, discount_pct: 0 })) };
        if (!body.warehouse_id || !body.bank_account_id) return toast('Lengkapi gudang & laci kas', '', 'warn');
        try {
          const s = await api('POST', '/api/e/pos_sales', body);
          await api('POST', `/api/e/pos_sales/${s.id}/actions/pay`, {});
          cart.length = 0; drawCart();
          toast('Transaksi lunas', `${s.number} · ${FMT.rp(s.total)}`);
          R().loadRegister('pos_sales');
        } catch (err) { fail(err); }
      }
    });
    await R().renderRegister($('[data-pos-register]', root), 'pos_sales', { title: 'Riwayat transaksi', sub: 'Transaksi kasir pada cabang aktif.' });
  }

  /* ======================================================================== */
  /* Pusat keamanan (ISO 27001)                                               */
  /* ======================================================================== */
  async function security(root) {
    root.innerHTML = pageHead('Pusat Keamanan Informasi', 'Pemantauan kontrol ISO/IEC 27001:2022 — autentikasi, hak akses istimewa, sesi, integritas jejak audit, dan cadangan.') + '<div class="loading-cell">Memuat…</div>';
    let s, backups = [];
    try { s = await api('GET', '/api/security/overview'); } catch (e) { root.innerHTML = R().noAccess(); return; }
    const fullAdmin = (state.me.permissions.admin || 0) >= 4;
    if (fullAdmin) { try { backups = await api('GET', '/api/admin/backups'); } catch { /* abaikan */ } }
    const list = (rows, cols) => rows.length ? `<table class="table tbl-sm"><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(typeof c === 'function' ? c(r) : r[c] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="pad muted">Tidak ada.</p>';
    root.innerHTML = pageHead('Pusat Keamanan Informasi', 'Pemantauan kontrol ISO/IEC 27001:2022 — autentikasi, hak akses istimewa, sesi, integritas jejak audit, dan cadangan.',
      `<button class="btn" data-verify-audit>${icon('file-check')} Verifikasi jejak audit</button>${fullAdmin ? `<button class="btn btn-primary" data-backup>${icon('database')} Buat cadangan terenkripsi</button>` : ''}`) +
      `<section class="kpi-grid-erp">
        ${kpi('Integritas jejak audit', s.auditChain.ok ? 'Utuh' : 'RUSAK', `${FMT.int(s.auditChain.count)} entri berantai SHA-256`, s.auditChain.ok ? 'pos' : 'neg')}
        ${kpi('Gagal masuk 7 hari', FMT.int(s.failedLogins7d), `${FMT.int(s.successLogins7d)} berhasil`, s.failedLogins7d > 20 ? 'neg' : '')}
        ${kpi('Sesi aktif', FMT.int(s.activeSessions), `batas diam ${s.policy.sessionIdleMinutes} menit`)}
        ${kpi('Pengguna tanpa MFA', FMT.int(s.usersWithoutMfa.length), s.policy.mfaRequiredForAdmin ? 'MFA wajib untuk admin' : 'MFA opsional', s.usersWithoutMfa.length ? 'neg' : 'pos')}
      </section>
      <div class="grid grid-1-1">
        <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Kebijakan aktif</h2><span class="card-note">A.5.17 · A.8.5 — ubah di Pengaturan</span></div></div>
          <dl class="deflist pad">
            <dt>Panjang sandi minimum</dt><dd>${s.policy.passwordMinLength} karakter + huruf besar/kecil, angka, simbol</dd>
            <dt>Riwayat sandi</dt><dd>${s.policy.passwordHistory} sandi terakhir tidak boleh dipakai ulang</dd>
            <dt>Masa berlaku sandi</dt><dd>${s.policy.passwordMaxAgeDays} hari</dd>
            <dt>Penguncian akun</dt><dd>${s.policy.lockoutThreshold} kali gagal → kunci ${s.policy.lockoutMinutes} menit</dd>
            <dt>Batas sesi</dt><dd>diam ${s.policy.sessionIdleMinutes} menit · mutlak ${s.policy.sessionAbsoluteHours} jam</dd>
            <dt>Pembatas laju</dt><dd>masuk ${s.policy.loginRateLimitPerMinute}/menit · API ${s.policy.apiRateLimitPerMinute}/menit per IP</dd>
          </dl></article>
        <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Percobaan masuk gagal terakhir</h2><span class="card-note">A.8.15 · A.8.16</span></div></div>
          <div class="table-scroll">${list(s.recentFailures, [(r) => ERP.dateTime(r.ts), 'username', 'ip', 'reason'])}</div></article>
        <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Akun hak istimewa</h2><span class="card-note">A.8.2 — tinjau berkala</span></div></div>
          <div class="table-scroll">${list(s.privileged, ['username', 'full_name', 'role'])}</div></article>
        <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Akun terkunci</h2></div></div>
          <div class="table-scroll">${list(s.lockedUsers, ['username', 'full_name', (r) => ERP.dateTime(r.locked_until)])}</div></article>
        <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Sandi kedaluwarsa / akun dorman</h2><span class="card-note">A.5.18 tinjauan hak akses</span></div></div>
          <div class="table-scroll">${list([...s.passwordExpired.map((u) => ({ ...u, why: 'Sandi kedaluwarsa' })), ...s.dormantUsers.map((u) => ({ ...u, why: 'Tidak masuk > 90 hari' }))], ['username', 'full_name', 'why'])}</div></article>
        <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Cadangan terenkripsi</h2><span class="card-note">A.8.13 — AES-256-GCM + SHA-256</span></div></div>
          <div class="table-scroll">${list(backups, ['file', (b) => `${FMT.int(Math.round(b.bytes / 1024))} KB`, (b) => ERP.dateTime(b.created)])}</div></article>
      </div>`;
  }

  /* ======================================================================== */
  /* Jejak audit                                                              */
  /* ======================================================================== */
  async function audit(root) {
    const st = (state.auditState = state.auditState || { q: '', page: 1 });
    root.innerHTML = pageHead('Jejak Audit', 'Catatan append-only seluruh peristiwa: masuk/keluar, perubahan data, persetujuan, posting, ekspor. Setiap entri terkunci hash SHA-256 entri sebelumnya.',
      `<button class="btn" data-verify-audit>${icon('file-check')} Verifikasi integritas</button>`) +
      `<article class="card"><div class="toolbar"><div class="search-wrap toolbar-search">${icon('search')}<input class="input" type="search" data-audit-search placeholder="Cari pengguna, aksi, entitas…" value="${esc(st.q)}"></div><div class="toolbar-spacer"></div><span class="pager-info" data-count></span></div>
      <div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Waktu</th><th>Pengguna</th><th>IP</th><th>Aksi</th><th>Entitas</th><th>Rincian</th><th>Hash</th></tr></thead><tbody data-audit-rows><tr><td colspan="7" class="loading-cell">Memuat…</td></tr></tbody></table></div>
      <div class="card-foot"><span class="pager-info" data-pageinfo></span><div class="toolbar-spacer"></div><div class="pager"><button class="btn btn-sm btn-icon" data-audit-page="prev" aria-label="Sebelumnya">${icon('chevron-left')}</button><button class="btn btn-sm btn-icon" data-audit-page="next" aria-label="Berikutnya">${icon('chevron-right')}</button></div></div></article>`;
    await loadAudit(root);
  }

  async function loadAudit(root) {
    const st = state.auditState;
    let d;
    try { d = await api('GET', `/api/audit${qs({ q: st.q, page: st.page, size: 50 })}`); } catch (e) { $('[data-audit-rows]', root).innerHTML = `<tr><td colspan="7" class="neg">${esc(e.message)}</td></tr>`; return; }
    const pages = Math.max(1, Math.ceil(d.total / 50));
    $('[data-audit-rows]', root).innerHTML = d.rows.map((r) => {
      let det = '';
      try { const o = JSON.parse(r.detail || 'null'); det = o ? JSON.stringify(o).slice(0, 160) : ''; } catch { det = ''; }
      return `<tr><td class="num nowrap">${esc(ERP.dateTime(r.ts))}</td><td>${esc(r.username || '—')}</td><td class="num">${esc(r.ip || '')}</td><td><span class="code">${esc(r.action)}</span></td><td>${r.entity && r.entity_id && R().ent(r.entity) ? `<button class="link" data-open="${esc(r.entity)}:${r.entity_id}">${esc(r.entity)} #${r.entity_id}</button>` : esc(r.entity || '')}</td><td class="audit-detail">${esc(det)}</td><td class="code muted" title="${esc(r.hash)}">${esc(r.hash.slice(0, 10))}…</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="muted">Tidak ada entri.</td></tr>';
    $('[data-count]', root).textContent = `${FMT.int(d.total)} entri`;
    $('[data-pageinfo]', root).textContent = `Halaman ${st.page} dari ${pages}`;
    $('[data-audit-page="prev"]', root).disabled = st.page <= 1;
    $('[data-audit-page="next"]', root).disabled = st.page >= pages;
  }

  /* ======================================================================== */
  /* Peran & izin                                                             */
  /* ======================================================================== */
  async function roles(root) {
    const LVL = ['Tanpa akses', 'Lihat', 'Ubah', 'Setujui/posting', 'Admin penuh'];
    let rolesData;
    try { rolesData = await api('GET', '/api/e/roles?size=100'); } catch (e) { root.innerHTML = R().noAccess(); return; }
    const canEdit = (state.me.permissions.admin || 0) >= 4;
    const perms = await Promise.all(rolesData.rows.map((r) => api('GET', `/api/roles/${r.id}/permissions`)));
    const modules = perms[0]?.modules || [];
    root.innerHTML = pageHead('Peran & Izin', 'Matriks hak akses peran terhadap modul (prinsip hak minimum, ISO 27001 A.5.15/A.5.18). Perubahan tercatat di jejak audit; Anda tidak dapat mengubah izin peran Anda sendiri.',
      `${R().ent('roles')?.canWrite ? `<button class="btn" data-new="roles">${icon('plus')} Peran baru</button>` : ''}`) +
      `<article class="card"><div class="table-scroll"><table class="matrix"><thead><tr><th>Modul</th>${rolesData.rows.map((r) => `<th><button class="link" data-open="roles:${r.id}">${esc(r.name)}</button></th>`).join('')}</tr></thead><tbody>
      ${modules.map(([m, label]) => `<tr><th>${esc(label)}</th>${rolesData.rows.map((r, i) => `<td><select class="select select-sm" data-perm="${r.id}:${esc(m)}" ${canEdit && r.id !== state.me.user.role.id ? '' : 'disabled'} aria-label="${esc(label)} — ${esc(r.name)}">${LVL.map((l, lv) => `<option value="${lv}" ${(perms[i].permissions[m] || 0) === lv ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}
      </tbody></table></div></article>`;
  }

  /* ======================================================================== */
  /* Pengaturan                                                               */
  /* ======================================================================== */
  const SETTING_LABELS = {
    passwordMinLength: 'Panjang sandi minimum', passwordHistory: 'Jumlah riwayat sandi', passwordMaxAgeDays: 'Masa berlaku sandi (hari)',
    lockoutThreshold: 'Ambang penguncian (kali gagal)', lockoutMinutes: 'Lama penguncian (menit)', sessionIdleMinutes: 'Batas sesi diam (menit)',
    sessionAbsoluteHours: 'Batas sesi mutlak (jam)', mfaRequiredForAdmin: 'Wajibkan MFA untuk administrator', loginRateLimitPerMinute: 'Batas percobaan masuk per menit per IP',
    apiRateLimitPerMinute: 'Batas permintaan API per menit per IP', poThreshold: 'Ambang persetujuan PO (Rp)', paymentThreshold: 'Ambang persetujuan pembayaran (Rp)',
    requireJournalApproval: 'Jurnal manual wajib disetujui',
  };
  async function settings(root) {
    let s;
    try { s = await api('GET', '/api/settings'); } catch (e) { root.innerHTML = R().noAccess(); return; }
    const canEdit = (state.me.permissions.admin || 0) >= 4;
    const group = (key, title, note) => `<article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">${esc(title)}</h2><span class="card-note">${esc(note)}</span></div></div>
      <form class="form-grid pad" data-setting-form="${key}">${Object.entries(s[key]).map(([k, v]) => typeof v === 'boolean'
        ? `<div class="field"><label class="check-inline"><input type="checkbox" name="${k}" ${v ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> <span>${esc(SETTING_LABELS[k] || k)}</span></label></div>`
        : `<div class="field"><label>${esc(SETTING_LABELS[k] || k)}</label><input class="input ${typeof v === 'number' ? 'num' : 'code'}" name="${k}" type="${typeof v === 'number' ? 'number' : 'text'}" value="${esc(v)}" ${canEdit ? '' : 'disabled'}></div>`).join('')}
      ${canEdit ? `<div class="form-grid-full"><button class="btn btn-primary" type="submit">${icon('check')} Simpan ${esc(title.toLowerCase())}</button></div>` : ''}</form></article>`;
    root.innerHTML = pageHead('Pengaturan', 'Kebijakan keamanan, persetujuan, pemetaan akun posting otomatis, dan tampilan. Setiap perubahan tercatat di jejak audit.') +
      `<div class="grid grid-1-1">${group('security_policy', 'Kebijakan keamanan', 'ISO 27001 A.5.17, A.8.5')}${group('approval_policy', 'Kebijakan persetujuan', 'Pemisahan tugas A.5.3')}</div>
      ${group('account_map', 'Pemetaan akun posting otomatis', 'Kode akun buku besar yang dipakai modul operasional')}
      <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Tampilan</h2></div></div><div class="pad"><div class="segmented" role="group" aria-label="Tema">
        <button data-theme-set="light" aria-pressed="${state.theme === 'light'}">Terang</button><button data-theme-set="dark" aria-pressed="${state.theme === 'dark'}">Gelap</button><button data-theme-set="system" aria-pressed="${state.theme === 'system'}">Ikut sistem</button></div></div></article>`;
  }

  /* ======================================================================== */
  /* Profil: sandi, MFA, sesi                                                 */
  /* ======================================================================== */
  async function profile(root) {
    const u = state.me.user;
    let sessions = [];
    try { sessions = await api('GET', '/api/auth/sessions'); } catch { /* abaikan */ }
    root.innerHTML = pageHead('Profil & Keamanan Akun', `${u.fullName} · ${u.role?.name || ''}`) +
      `<div class="grid grid-1-1">
        <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Ganti kata sandi</h2><span class="card-note">Seluruh sesi lain akan dicabut setelah sandi diganti.</span></div></div>
          <form class="form-grid pad" data-pw-form>
            <div class="field form-grid-full"><label for="pw-cur">Sandi saat ini</label><input class="input" id="pw-cur" type="password" name="current" autocomplete="current-password" required></div>
            <div class="field"><label for="pw-new">Sandi baru</label><input class="input" id="pw-new" type="password" name="next" autocomplete="new-password" required></div>
            <div class="field"><label for="pw-new2">Ulangi sandi baru</label><input class="input" id="pw-new2" type="password" name="next2" autocomplete="new-password" required></div>
            <div class="form-grid-full"><span class="field-hint">Minimal 12 karakter dengan huruf besar, huruf kecil, angka, dan simbol; tidak boleh sama dengan sandi sebelumnya.</span></div>
            <div class="form-grid-full"><button class="btn btn-primary" type="submit">Ganti sandi</button></div>
          </form></article>
        <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Autentikasi dua faktor (TOTP)</h2><span class="card-note">${u.mfaEnabled ? 'Aktif' : 'Belum aktif'} — Google/Microsoft Authenticator</span></div></div>
          <div class="pad" data-mfa-box>${u.mfaEnabled
            ? `<p>MFA aktif untuk akun ini.</p><form class="form-grid" data-mfa-disable><div class="field"><label>Sandi untuk menonaktifkan</label><input class="input" type="password" name="password" autocomplete="current-password" required></div><div class="form-grid-full"><button class="btn btn-danger" type="submit">Nonaktifkan MFA</button></div></form>`
            : `<p>Lindungi akun Anda dengan kode 6 digit dari aplikasi autentikator.</p><button class="btn btn-primary" data-mfa-setup>${icon('shield')} Aktifkan MFA</button>`}</div></article>
      </div>
      <article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Sesi aktif</h2><span class="card-note">Cabut sesi yang tidak Anda kenali.</span></div></div>
        <div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Mulai</th><th>Terakhir aktif</th><th>IP</th><th>Perangkat</th><th></th></tr></thead><tbody>
        ${sessions.map((s) => `<tr><td class="num">${esc(ERP.dateTime(s.created_at))}</td><td class="num">${esc(ERP.dateTime(s.last_seen))}</td><td class="num">${esc(s.ip)}</td><td class="audit-detail">${esc(s.user_agent)}</td><td>${s.current ? '<span class="pill" data-tone="ok"><i class="pill-dot"></i>Sesi ini</span>' : `<button class="btn btn-sm" data-revoke-session="${esc(s.id)}">Cabut</button>`}</td></tr>`).join('')}
        </tbody></table></div></article>`;
  }

  ERP.views = { dashboard, approvals, report, loadReport, coa, board, crmCfg, woCfg, moveCard, pos, security, audit, loadAudit, roles, settings, profile, pageHead, REPORT_META };
})();
