/* ==========================================================================
   Penganggaran: laporan anggaran vs realisasi COA (YTD, bulanan, pusat
   biaya), salin anggaran tahun lalu, kolom anggaran di bagan akun, serta
   laporan anggaran & realisasi proyek (RAB, komitmen, nilai hasil, kurva-S).
   ========================================================================== */
/* global ERP, FMT, Charts */
(() => {
  'use strict';
  const { $, $$, esc, icon, api, qs, state, money, pill, toast, fail, num, openModal, closeOverlay } = ERP;
  const R = () => ERP.records;
  const V = () => ERP.views;
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const kpi = (label, value, foot = '', tone = '') => `<div class="kpi-tile"><span class="kpi-label">${esc(label)}</span><span class="kpi-value ${tone}">${value}</span><span class="kpi-foot">${esc(foot)}</span></div>`;
  const card = (title, note, body, tools = '') => `<article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">${esc(title)}</h2>${note ? `<span class="card-note">${esc(note)}</span>` : ''}</div>${tools ? `<div class="card-tools">${tools}</div>` : ''}</div>${body}</article>`;
  const asOf = () => state.to || state.meta.today;
  const pctTxt = (v, d = 1) => (v == null ? '—' : `${num(v, d)}%`);
  const signed = (v) => `<span class="num ${v > 0 ? '' : ''}">${esc(FMT.rp(v))}</span>`;
  /** Meter serapan: hijau ≤ 85%, kuning ≤ 100%, merah > 100%. */
  const meter = (v, warnAt = 85) => (v == null ? '<span class="muted">—</span>' : `<span class="meter"><span class="meter-track"><span class="meter-fill" ${v > 100 ? 'data-tone="danger"' : v > warnAt ? 'data-tone="warn"' : ''} style="width:${Math.max(0, Math.min(100, v))}%"></span></span><span class="meter-val">${esc(num(v, 1))}%</span></span>`);
  const varCell = (x) => `<td class="ta-r ${Math.abs(x.variance) < 0.005 ? '' : x.favorable ? 'pos' : 'neg'}">${signed(x.variance)}</td>`;
  const varPct = (x) => `<td class="ta-r num ${x.variancePct == null ? 'muted' : x.favorable ? 'pos' : 'neg'}">${x.variancePct == null ? '—' : `${x.variancePct > 0 ? '+' : ''}${esc(num(x.variancePct, 1))}%`}</td>`;
  const canFinanceWrite = () => (state.me.permissions.finance || 0) >= 2;

  /* ======================================================================== */
  /* Anggaran vs realisasi (COA)                                              */
  /* ======================================================================== */
  const bs = () => (state.budgetRpt = state.budgetRpt || { year: Number(asOf().slice(0, 4)), view: 'ytd', version: 'disetujui' });

  async function budgetReport(root) {
    const s = bs();
    const y0 = Number(state.meta.today.slice(0, 4));
    const years = [y0 - 2, y0 - 1, y0, y0 + 1];
    if (!years.includes(s.year)) years.push(s.year);
    const canManage = !!R().ent('budgets');
    root.innerHTML = V().pageHead('Anggaran vs Realisasi', 'Anggaran per akun bagan akun (COA) dibandingkan realisasi buku besar terposting. Selisih hijau = menguntungkan (pendapatan di atas / beban di bawah anggaran).',
      `${canManage ? `<button class="btn" data-nav="anggaran">${icon('edit')} Kelola anggaran</button>` : ''}${canFinanceWrite() && canManage ? `<button class="btn" data-budget-copy>${icon('transfer')} Salin anggaran</button>` : ''}<button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button><button class="btn" data-print-report>${icon('print')} Cetak</button>`) +
      `<div data-budget-kpi></div>
      <article class="card report-card">
        <div class="toolbar report-toolbar">
          <div class="segmented" role="group" aria-label="Tampilan">
            <button data-bview="ytd" aria-pressed="${s.view === 'ytd'}">Ringkasan YTD</button><button data-bview="bulanan" aria-pressed="${s.view === 'bulanan'}">Bulanan</button><button data-bview="pusat-biaya" aria-pressed="${s.view === 'pusat-biaya'}">Per pusat biaya</button>
          </div>
          <label class="ctx-inline">Tahun <select class="select" data-bud="year">${years.sort().map((y) => `<option value="${y}" ${y === s.year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
          <label class="ctx-inline">Per tanggal <input class="input num" type="date" data-rp="to" value="${esc(asOf())}"></label>
          <label class="ctx-inline">Versi <select class="select" data-bud="version"><option value="disetujui" ${s.version === 'disetujui' ? 'selected' : ''}>Disetujui</option><option value="semua" ${s.version === 'semua' ? 'selected' : ''}>Semua (termasuk draf/diajukan)</option></select></label>
          <div class="toolbar-spacer"></div><span class="pager-info" data-rinfo></span>
        </div>
        <div class="report-body" data-report-body><div class="loading-cell">Menghitung…</div></div>
      </article>`;
    await loadBudget(root);
  }

  async function loadBudget(root = $('.view-root')) {
    const s = bs();
    const body = $('[data-report-body]', root);
    let r;
    try { r = await api('GET', `/api/reports/anggaran${qs({ year: s.year, to: asOf(), view: s.view, version: s.version })}`); } catch (e) { body.innerHTML = `<p class="pad neg">${esc(e.message)}</p>`; return; }
    const upto = r.monthsElapsed ? `${BULAN[r.monthsElapsed - 1]} ${r.year}` : `belum berjalan`;
    const sm = r.summary;
    $('[data-budget-kpi]', root).innerHTML = `<section class="kpi-grid-erp">
      ${kpi('Pendapatan', esc(FMT.rpCompact(sm.revenue.actual)), `anggaran s.d. ${upto}: ${FMT.rpCompact(sm.revenue.ytdBudget)}`, sm.revenue.favorable ? 'pos' : 'neg')}
      ${kpi('Beban', esc(FMT.rpCompact(sm.cost.actual)), `anggaran s.d. ${upto}: ${FMT.rpCompact(sm.cost.ytdBudget)}`, sm.cost.favorable ? 'pos' : 'neg')}
      ${kpi('Laba bersih', esc(FMT.rpCompact(sm.net.actual)), `anggaran: ${FMT.rpCompact(sm.net.ytdBudget)} · selisih ${FMT.rpCompact(sm.net.variance)}`, sm.net.favorable ? 'pos' : 'neg')}
      ${kpi('Serapan beban setahun', esc(pctTxt(sm.cost.usage)), `prakiraan akhir tahun ${FMT.rpCompact(sm.cost.forecast)}`)}
      ${kpi('Status anggaran', `${r.status.approved}/${r.status.total}`, `disetujui · ${r.status.pending} menunggu · ${r.status.draft} draf`, r.status.pending ? 'neg' : '')}
    </section>
    <div class="grid grid-1-1">${card('Pendapatan per bulan', `realisasi vs anggaran ${r.year}`, '<div class="card-body"><div class="chart" data-chart="bud-rev"></div></div>')}${card('Beban per bulan', `realisasi vs anggaran ${r.year}`, '<div class="card-body"><div class="chart" data-chart="bud-cost"></div></div>')}</div>`;
    const m = r.monthly.slice(0, Math.max(1, r.monthsElapsed));
    const line = (sel, a, b) => { const el = $(`[data-chart="${sel}"]`, root); if (el && r.monthsElapsed) Charts.lineChart(el, { title: sel, labels: m.map((x) => `${BULAN[x.month - 1]}${x.partial ? '*' : ''}`), actual: m.map((x) => Math.max(0, x[a] || 0)), target: m.map((x) => Math.max(0, x[b] || 0)), format: 'rp-compact', height: 200, actualLabel: 'Realisasi', targetLabel: 'Anggaran', tipSuffix: ` ${r.year}` }); else if (el) el.innerHTML = '<p class="muted pad">Tahun anggaran belum berjalan.</p>'; };
    line('bud-rev', 'revenueActual', 'revenueBudget');
    line('bud-cost', 'costActual', 'costBudget');

    const head = `<div class="report-head"><b>${esc(state.meta.company?.name || '')}</b><span>${esc(r.title)}</span><span class="num">Realisasi s.d. ${esc(ERP.date(r.asOf))} · anggaran ${esc(num(r.monthFraction, 1))} bulan</span><span class="muted">${esc(r.version === 'semua' ? 'Versi: semua anggaran (simulasi)' : 'Versi: anggaran disetujui')} · ${esc(state.meta.branchId ? (state.meta.branches.find((b) => b.id === state.meta.branchId)?.name || '') : 'seluruh cabang')}</span></div>`;
    const empty = !r.sections.length ? `<p class="pad muted">Belum ada anggaran maupun realisasi untuk tahun ${r.year}. Susun anggaran di Keuangan → Anggaran (COA)${canFinanceWrite() ? ' atau gunakan "Salin anggaran"' : ''}.</p>` : '';
    const info = $('[data-rinfo]', root);
    if (r.view === 'bulanan') body.innerHTML = head + (empty || monthlyTable(r));
    else if (r.view === 'pusat-biaya') body.innerHTML = head + (empty || ccTable(r));
    else body.innerHTML = head + (empty || ytdTable(r));
    if (info) info.textContent = `${r.sections.reduce((n, x) => n + x.rows.filter((y) => !y.header).length, 0)} akun`;
  }

  function ytdTable(r) {
    const cols = '<th class="ta-r">Anggaran setahun</th><th class="ta-r">Anggaran s.d. periode</th><th class="ta-r">Realisasi</th><th class="ta-r">Selisih</th><th class="ta-r">Selisih %</th><th class="ta-r">Sisa anggaran</th><th class="ta-r">Prakiraan akhir tahun</th><th>Serapan</th>';
    const cells = (x) => `<td class="ta-r">${money(x.budget)}</td><td class="ta-r">${money(x.ytdBudget)}</td><td class="ta-r">${money(x.actual)}</td>${varCell(x)}${varPct(x)}<td class="ta-r">${money(x.remaining)}</td><td class="ta-r">${money(x.forecast)}</td><td>${meter(x.usage)}</td>`;
    let html = `<div class="table-scroll"><table class="table report-table"><thead><tr><th>Akun</th>${cols}</tr></thead><tbody>`;
    for (const s of r.sections) {
      html += `<tr class="row-section"><td colspan="9">${esc(s.label)}</td></tr>`;
      for (const x of s.rows) html += `<tr class="${x.header ? 'row-header' : ''}" ${x.header ? '' : `data-gl="${x.id}" tabindex="0"`}><td class="indent-${Math.min(x.level, 4)}"><span class="code">${esc(x.code)}</span> ${esc(x.name)}${x.noBudget ? ' <span class="pill pill-xs" data-tone="warn"><i class="pill-dot"></i>Tanpa anggaran</span>' : ''}</td>${cells(x)}</tr>`;
      html += `<tr class="row-sub"><td>Total ${esc(s.label.toLowerCase())}</td>${cells(s.total)}</tr>`;
    }
    html += `<tr class="row-grand"><td>Laba (rugi) bersih</td>${cells(r.summary.net)}</tr></tbody></table></div>`;
    return html + '<p class="pad field-hint">Anggaran s.d. periode = anggaran bulanan Januari s.d. bulan sebelumnya + porsi hari bulan berjalan (prorata). Prakiraan akhir tahun = realisasi + anggaran bulan tersisa. Klik akun untuk membuka buku besar.</p>';
  }

  function monthlyTable(r) {
    const el = r.monthsElapsed;
    const cell = (x, m, i, type) => {
      const fav = type === 'revenue' || type === 'other_income' ? m.actual >= m.budget : m.actual <= m.budget;
      return i < el ? `<td class="ta-r"><span class="num ${Math.abs(m.actual - m.budget) < 0.005 ? '' : fav ? 'pos' : 'neg'}">${esc(FMT.rpCompact(m.actual))}</span><span class="cell-sub num">${esc(FMT.rpCompact(m.budget))}</span></td>`
        : `<td class="ta-r"><span class="muted">—</span><span class="cell-sub num">${esc(FMT.rpCompact(m.budget))}</span></td>`;
    };
    let html = `<div class="table-scroll"><table class="table report-table tbl-sm"><thead><tr><th>Akun</th>${BULAN.map((b) => `<th class="ta-r">${b}</th>`).join('')}<th class="ta-r">Total</th></tr></thead><tbody>`;
    for (const s of r.sections) {
      html += `<tr class="row-section"><td colspan="14">${esc(s.label)}</td></tr>`;
      for (const x of s.rows) html += `<tr class="${x.header ? 'row-header' : ''}" ${x.header ? '' : `data-gl="${x.id}" tabindex="0"`}><td class="indent-${Math.min(x.level, 4)}"><span class="code">${esc(x.code)}</span> ${esc(x.name)}</td>${x.months.map((m, i) => cell(x, m, i, s.key)).join('')}<td class="ta-r"><b class="num">${esc(FMT.rpCompact(x.actual))}</b><span class="cell-sub num">${esc(FMT.rpCompact(x.budget))}</span></td></tr>`;
      html += `<tr class="row-sub"><td>Total ${esc(s.label.toLowerCase())}</td>${s.total.months.map((m, i) => cell(s.total, m, i, s.key)).join('')}<td class="ta-r"><b class="num">${esc(FMT.rpCompact(s.total.actual))}</b><span class="cell-sub num">${esc(FMT.rpCompact(s.total.budget))}</span></td></tr>`;
    }
    return html + '</tbody></table></div><p class="pad field-hint">Setiap sel: baris atas = realisasi, baris bawah = anggaran bulan tersebut.</p>';
  }

  function ccTable(r) {
    let html = `<div class="table-scroll"><table class="table report-table"><thead><tr><th>Pusat biaya / akun</th><th class="ta-r">Anggaran setahun</th><th class="ta-r">Anggaran s.d. periode</th><th class="ta-r">Realisasi</th><th class="ta-r">Selisih</th><th class="ta-r">Selisih %</th><th>Serapan</th></tr></thead><tbody>`;
    for (const c of r.costCenters || []) {
      html += `<tr class="row-section"><td colspan="7">${esc(c.code)} · ${esc(c.name)}</td></tr>`;
      for (const x of c.rows) html += `<tr data-gl="${x.id}" tabindex="0"><td class="indent-1"><span class="code">${esc(x.code)}</span> ${esc(x.name)}${x.noBudget ? ' <span class="pill pill-xs" data-tone="warn"><i class="pill-dot"></i>Tanpa anggaran</span>' : ''}</td><td class="ta-r">${money(x.budget)}</td><td class="ta-r">${money(x.ytdBudget)}</td><td class="ta-r">${money(x.actual)}</td>${varCell(x)}${varPct(x)}<td>${meter(x.usage)}</td></tr>`;
      html += `<tr class="row-sub"><td>Total beban ${esc(c.name)}</td><td class="ta-r">${money(c.cost.budget)}</td><td class="ta-r">${money(c.cost.ytdBudget)}</td><td class="ta-r">${money(c.cost.actual)}</td>${varCell(c.cost)}${varPct(c.cost)}<td>${meter(c.cost.usage)}</td></tr>`;
    }
    return html + '</tbody></table></div><p class="pad field-hint">Realisasi per pusat biaya mengikuti dimensi pusat biaya pada baris jurnal; anggaran tanpa pusat biaya dikelompokkan pada "Tanpa pusat biaya".</p>';
  }

  /* Salin anggaran tahun lalu → draf tahun tujuan. */
  function openCopy() {
    const y = bs().year;
    openModal({
      title: 'Salin anggaran', size: 'sm',
      body: `<form class="form-grid" data-budget-copy-form>
        <div class="field"><label>Dari tahun</label><input class="input num" type="number" name="fromYear" value="${y - 1}" min="2000" max="2100" required></div>
        <div class="field"><label>Ke tahun</label><input class="input num" type="number" name="toYear" value="${y}" min="2000" max="2100" required></div>
        <div class="field"><label>Dasar</label><select class="select" name="basis"><option value="anggaran">Anggaran disetujui tahun sumber</option><option value="realisasi">Realisasi tahun sumber (pola bulanan aktual)</option></select></div>
        <div class="field"><label>Penyesuaian (%)</label><input class="input num" type="number" name="adjustPct" value="5" step="0.5" min="-99" max="500"></div>
        <p class="form-grid-full field-hint">Hasil disimpan sebagai <b>draf</b> per cabang ${esc(state.meta.branchId ? 'aktif' : 'dalam perusahaan aktif')} dengan pola bulanan manual, lalu diajukan & disetujui seperti biasa. Anggaran yang sudah ada untuk akun/cabang/pusat biaya yang sama dilewati.</p>
      </form>`,
      foot: `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" data-budget-copy-run>${icon('transfer')} Salin</button>`,
    });
  }
  async function runCopy() {
    const f = $('[data-budget-copy-form]');
    if (!f.reportValidity()) return;
    const fd = Object.fromEntries(new FormData(f));
    try {
      const r = await api('POST', '/api/budgets/copy', { fromYear: Number(fd.fromYear), toYear: Number(fd.toYear), basis: fd.basis, adjustPct: Number(fd.adjustPct) || 0 });
      closeOverlay();
      toast('Anggaran disalin', `${r.created} anggaran draf dibuat${r.skipped ? `, ${r.skipped} dilewati karena sudah ada` : ''}.`);
      bs().year = Number(fd.toYear); bs().version = 'semua';
      ERP.app.renderView();
    } catch (e) { fail(e); }
  }

  /* ======================================================================== */
  /* Bagan akun: kolom anggaran                                               */
  /* ======================================================================== */
  async function coaBudget(year) {
    try { return await api('GET', `/api/reports/anggaran-akun${qs({ year, to: asOf() })}`); } catch { return null; }
  }

  /* ======================================================================== */
  /* Laporan proyek                                                           */
  /* ======================================================================== */
  const HEALTH = { sehat: ['Sehat', 'ok'], waspada: ['Waspada', 'warn'], kritis: ['Kritis', 'danger'] };
  const health = (h) => `<span class="pill" data-tone="${HEALTH[h]?.[1] || 'neutral'}"><i class="pill-dot"></i>${esc(HEALTH[h]?.[0] || h)}</span>`;
  const idx = (v) => (v == null ? '<span class="muted">—</span>' : `<span class="num ${v >= 1 ? 'pos' : v >= 0.9 ? '' : 'neg'}">${esc(num(v, 2))}</span>`);

  async function projectReport(root) {
    state.projRpt = state.projRpt || { id: null };
    if (state.projRpt.id) return projectDetail(root, state.projRpt.id);
    root.innerHTML = V().pageHead('Laporan Proyek', 'Anggaran biaya (RAB) vs realisasi buku besar, komitmen PO, sisa anggaran, nilai hasil (EV), CPI/SPI, prakiraan biaya akhir (EAC), dan margin per proyek.',
      `${R().ent('projects')?.canWrite ? `<button class="btn" data-new="projects">${icon('plus')} Proyek baru</button>` : ''}<button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button><button class="btn" data-print-report>${icon('print')} Cetak</button>`) + '<div class="loading-cell">Menghitung…</div>';
    let r;
    try { r = await api('GET', `/api/reports/proyek${qs({ to: asOf() })}`); } catch (e) { root.innerHTML = R().noAccess(); return; }
    const t = r.totals;
    root.innerHTML = V().pageHead('Laporan Proyek', `Per ${ERP.date(r.asOf)} — realisasi dari jurnal berdimensi proyek; komitmen = PO menunggu/disetujui yang belum ditagih.`,
      `${R().ent('projects')?.canWrite ? `<button class="btn" data-new="projects">${icon('plus')} Proyek baru</button>` : ''}<button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button><button class="btn" data-print-report>${icon('print')} Cetak</button>`) +
      `<section class="kpi-grid-erp">${kpi('Total RAB', esc(FMT.rpCompact(t.budget)), `${r.rows.length} proyek`)}${kpi('Realisasi biaya', esc(FMT.rpCompact(t.cost)), `serapan ${pctTxt(t.usage)}`, t.usage > 100 ? 'neg' : '')}${kpi('Komitmen PO', esc(FMT.rpCompact(t.commitment)), 'belum ditagih')}${kpi('Sisa anggaran', esc(FMT.rpCompact(t.available)), 'RAB − realisasi − komitmen', t.available < 0 ? 'neg' : 'pos')}${kpi('Pendapatan proyek', esc(FMT.rpCompact(t.revenue)), `margin ${FMT.rpCompact(t.margin)}`, t.margin < 0 ? 'neg' : 'pos')}${kpi('CPI portofolio', t.cpi == null ? '—' : esc(num(t.cpi, 2)), `${r.health.sehat} sehat · ${r.health.waspada} waspada · ${r.health.kritis} kritis`, t.cpi != null && t.cpi < 1 ? 'neg' : 'pos')}</section>
      <article class="card report-card"><div class="report-body"><div class="report-head"><b>${esc(state.meta.company?.name || '')}</b><span>${esc(r.title)}</span><span class="num">Per ${esc(ERP.date(r.asOf))}</span></div>
      <div class="table-scroll"><table class="table report-table"><thead><tr><th>Proyek</th><th class="ta-r">Nilai kontrak</th><th class="ta-r">RAB</th><th class="ta-r">Realisasi</th><th class="ta-r">Komitmen</th><th class="ta-r">Sisa anggaran</th><th>Serapan</th><th class="ta-r">Kemajuan</th><th class="ta-r">CPI</th><th class="ta-r">SPI</th><th class="ta-r">EAC</th><th class="ta-r">Pendapatan</th><th class="ta-r">Margin</th><th>Kesehatan</th></tr></thead><tbody>
      ${r.rows.map((p) => `<tr data-proj-open="${p.id}" tabindex="0"><td><span class="code">${esc(p.code)}</span> ${esc(p.name)}<span class="cell-sub">${esc(p.customer || 'Internal')} · ${esc(p.manager || '')} · ${esc(p.branch)}</span></td>
        <td class="ta-r">${money(p.contract)}</td><td class="ta-r">${money(p.budget)}</td><td class="ta-r">${money(p.cost)}</td><td class="ta-r">${money(p.commitment)}</td><td class="ta-r ${p.available < 0 ? 'neg' : ''}">${money(p.available)}</td><td>${meter(p.usage)}</td>
        <td class="ta-r num">${esc(num(p.progress, 0))}%<span class="cell-sub">waktu ${p.timePct == null ? '—' : `${esc(num(p.timePct, 0))}%`}</span></td><td class="ta-r">${idx(p.cpi)}</td><td class="ta-r">${idx(p.spi)}</td><td class="ta-r ${p.eac > p.budget ? 'neg' : ''}">${money(p.eac)}</td><td class="ta-r">${money(p.revenue)}</td><td class="ta-r ${p.margin < 0 ? 'neg' : 'pos'}">${money(p.margin)}${p.marginPct != null ? `<span class="cell-sub">${esc(num(p.marginPct, 1))}%</span>` : ''}</td><td>${health(p.health)}</td></tr>`).join('') || '<tr><td colspan="14" class="muted">Belum ada proyek.</td></tr>'}
      </tbody><tfoot><tr class="row-total"><td>Total</td><td class="ta-r">${money(t.contract)}</td><td class="ta-r">${money(t.budget)}</td><td class="ta-r">${money(t.cost)}</td><td class="ta-r">${money(t.commitment)}</td><td class="ta-r">${money(t.available)}</td><td>${meter(t.usage)}</td><td></td><td class="ta-r">${idx(t.cpi)}</td><td></td><td class="ta-r">${money(t.eac)}</td><td class="ta-r">${money(t.revenue)}</td><td class="ta-r">${money(t.margin)}</td><td></td></tr></tfoot></table></div>
      <p class="pad field-hint">EV (nilai hasil) = RAB × kemajuan fisik. CPI = EV ÷ realisasi biaya (≥ 1 hemat). SPI = EV ÷ nilai rencana menurut jadwal (≥ 1 tepat waktu). EAC = RAB ÷ CPI. Klik proyek untuk rincian per akun.</p></div></article>`;
  }

  async function projectDetail(root, id) {
    root.innerHTML = V().pageHead('Laporan Proyek', '') + '<div class="loading-cell">Menghitung…</div>';
    let r;
    try { r = await api('GET', `/api/reports/proyek-detail${qs({ project: id, to: asOf() })}`); } catch (e) { state.projRpt.id = null; fail(e); return projectReport(root); }
    const p = r.project, f = r.figures;
    const canEdit = R().ent('projects')?.canWrite;
    root.innerHTML = V().pageHead(`${p.code} — ${p.name}`, `${p.customer || 'Proyek internal'} · manajer ${p.manager || '—'} · ${p.branch} · ${p.start_date ? ERP.date(p.start_date) : '—'} s.d. ${p.end_date ? ERP.date(p.end_date) : '—'}`,
      `<button class="btn" data-proj-back>${icon('chevron-left')} Semua proyek</button>${canEdit ? `<button class="btn" data-edit="projects:${p.id}">${icon('edit')} Ubah RAB</button>` : ''}<button class="btn" data-open="projects:${p.id}">${icon('eye')} Rincian proyek</button><button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button><button class="btn" data-print-report>${icon('print')} Cetak</button>`) +
      `<section class="kpi-grid-erp">${kpi('Nilai kontrak', esc(FMT.rpCompact(f.contract)), f.plannedMarginPct == null ? 'proyek internal' : `margin rencana ${num(f.plannedMarginPct, 1)}%`)}${kpi('RAB', esc(FMT.rpCompact(f.budget)), `kemajuan ${num(f.progress, 0)}% · waktu ${f.timePct == null ? '—' : `${num(f.timePct, 0)}%`}`)}${kpi('Realisasi biaya', esc(FMT.rpCompact(f.cost)), `serapan ${pctTxt(f.usage)}`, f.usage > 100 ? 'neg' : '')}${kpi('Komitmen PO', esc(FMT.rpCompact(f.commitment)), `sisa ${FMT.rpCompact(f.available)}`, f.available < 0 ? 'neg' : '')}${kpi('EAC (prakiraan akhir)', esc(FMT.rpCompact(f.eac)), `VAC ${FMT.rpCompact(f.vac)} · CPI ${f.cpi == null ? '—' : num(f.cpi, 2)} · SPI ${f.spi == null ? '—' : num(f.spi, 2)}`, f.vac < 0 ? 'neg' : 'pos')}${kpi('Pendapatan & margin', esc(FMT.rpCompact(f.revenue)), `margin ${FMT.rpCompact(f.margin)}${f.billedPct != null ? ` · tertagih ${num(f.billedPct, 0)}%` : ''}`, f.margin < 0 ? 'neg' : 'pos')}</section>
      <div class="grid grid-2-1">${card('Kurva-S biaya', 'nilai rencana (PV, garis putus) vs biaya aktual kumulatif', '<div class="card-body"><div class="chart" data-chart="scurve"></div></div>')}
        ${card('Kesehatan proyek', '', `<div class="pad"><p>${health(f.health)}</p><dl class="deflist"><dt>Nilai hasil (EV)</dt><dd>${money(f.ev)}</dd><dt>Nilai rencana (PV)</dt><dd>${money(f.pv)}</dd><dt>Biaya untuk selesai (ETC)</dt><dd>${money(f.etc)}</dd><dt>Selisih RAB − realisasi</dt><dd>${money(f.variance)}</dd></dl></div>`)}</div>
      <article class="card report-card"><div class="report-body"><div class="report-head"><b>${esc(state.meta.company?.name || '')}</b><span>${esc(r.title)}</span><span class="num">Per ${esc(ERP.date(r.asOf))}</span></div>
        <div class="table-scroll"><table class="table report-table"><thead><tr><th>Akun biaya / uraian RAB</th><th class="ta-r">RAB</th><th class="ta-r">Realisasi</th><th class="ta-r">Komitmen</th><th class="ta-r">Selisih</th><th class="ta-r">Sisa anggaran</th><th>Serapan</th></tr></thead><tbody>
        <tr class="row-section"><td colspan="7">Biaya proyek</td></tr>
        ${r.costRows.map((x) => `<tr data-gl="${x.id}" tabindex="0"><td><span class="code">${esc(x.code)}</span> ${esc(x.name)}${x.noBudget ? ' <span class="pill pill-xs" data-tone="warn"><i class="pill-dot"></i>Di luar RAB</span>' : ''}${x.items.length ? `<span class="cell-sub">${esc(x.items.join('; '))}</span>` : ''}</td><td class="ta-r">${money(x.budget)}</td><td class="ta-r">${money(x.actual)}</td><td class="ta-r">${money(x.commitment)}</td><td class="ta-r ${x.variance > 0 ? 'neg' : 'pos'}">${signed(x.variance)}</td><td class="ta-r ${x.available < 0 ? 'neg' : ''}">${money(x.available)}</td><td>${meter(x.usage)}</td></tr>`).join('')}
        ${Math.abs(r.unallocated) >= 0.005 ? `<tr><td class="muted">RAB belum dirinci per akun</td><td class="ta-r">${money(r.unallocated)}</td><td></td><td></td><td></td><td class="ta-r">${money(r.unallocated)}</td><td></td></tr>` : ''}
        <tr class="row-sub"><td>Total biaya</td><td class="ta-r">${money(f.budget)}</td><td class="ta-r">${money(f.cost)}</td><td class="ta-r">${money(f.commitment)}</td><td class="ta-r ${f.cost - f.budget > 0 ? 'neg' : 'pos'}">${signed(f.cost - f.budget)}</td><td class="ta-r">${money(f.available)}</td><td>${meter(f.usage)}</td></tr>
        <tr class="row-section"><td colspan="7">Pendapatan proyek</td></tr>
        ${r.revenueRows.map((x) => `<tr data-gl="${x.id}" tabindex="0"><td><span class="code">${esc(x.code)}</span> ${esc(x.name)}</td><td class="ta-r">${money(f.contract)}</td><td class="ta-r">${money(x.actual)}</td><td></td><td></td><td class="ta-r">${money(f.contract - x.actual)}</td><td>${meter(f.contract ? x.actual / f.contract * 100 : null, 101)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Belum ada pendapatan berdimensi proyek.</td></tr>'}
        <tr class="row-grand"><td>Margin proyek (pendapatan − biaya)</td><td class="ta-r">${money(f.contract - f.budget)}</td><td class="ta-r">${money(f.margin)}</td><td colspan="4"></td></tr>
        </tbody></table></div></div></article>
      <div class="grid grid-1-1">
        ${card('Tugas & kemajuan', `${r.tasks.length} tugas`, `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Tugas</th><th>Jadwal</th><th>Kemajuan</th></tr></thead><tbody>${r.tasks.map((t2) => `<tr data-open="project_tasks:${t2.id}" tabindex="0"><td>${esc(t2.name)}<span class="cell-sub">${esc(t2.assignee || '')}</span></td><td class="num">${esc(ERP.date(t2.start_date))} – ${esc(ERP.date(t2.end_date))}</td><td>${meter(t2.progress, 101)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada tugas.</td></tr>'}</tbody></table></div>`)}
        ${card('Komitmen terbuka (PO)', 'menunggu/disetujui, belum ditagih', `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>PO</th><th>Tanggal</th><th>Status</th><th class="ta-r">Nilai (DPP)</th></tr></thead><tbody>${r.openPos.map((o) => `<tr data-open="purchase_orders:${o.id}" tabindex="0"><td class="code">${esc(o.number)}</td><td class="num">${esc(ERP.date(o.date))}</td><td>${pill(o.status)}</td><td class="ta-r">${money(o.amount)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Tidak ada komitmen terbuka.</td></tr>'}</tbody></table></div>`)}
      </div>
      ${card('Transaksi proyek', `${r.transactions.length} baris jurnal berdimensi proyek (terbaru)`, `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Tanggal</th><th>Jurnal</th><th>Uraian</th><th>Akun</th><th class="ta-r">Biaya</th><th class="ta-r">Pendapatan</th></tr></thead><tbody>
        ${r.transactions.map((x) => { const rev = ['revenue', 'other_income'].includes(x.type); const v = rev ? x.credit - x.debit : x.debit - x.credit; return `<tr data-open="journals:${x.journal_id}" tabindex="0"><td class="num">${esc(ERP.date(x.date))}</td><td class="code">${esc(x.number)}<span class="cell-sub">${esc(x.source_no || '')}</span></td><td>${esc(x.description)}${x.memo ? `<span class="cell-sub">${esc(x.memo)}</span>` : ''}</td><td><span class="code">${esc(x.code)}</span> ${esc(x.account)}</td><td class="ta-r">${rev ? '' : money(v)}</td><td class="ta-r">${rev ? money(v) : ''}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Belum ada transaksi.</td></tr>'}
      </tbody></table></div>`)}`;
    const el = $('[data-chart="scurve"]', root);
    const pts = r.curve.filter((c) => c.ac != null);
    if (el && pts.length) {
      Charts.lineChart(el, { title: 'Kurva-S', labels: pts.map((c) => `${BULAN[Number(c.month.slice(5)) - 1]} ${c.month.slice(2, 4)}`), actual: pts.map((c) => c.ac), target: pts.map((c) => c.pv), format: 'rp-compact', height: 220, actualLabel: 'Biaya aktual', targetLabel: 'Nilai rencana', tipSuffix: '' });
    } else if (el) el.innerHTML = '<p class="muted pad">Isi tanggal mulai proyek untuk menampilkan kurva-S.</p>';
  }

  /** Ringkasan anggaran di laci rincian proyek. */
  async function projectDrawer(id) {
    if (!ERP.app.canSee('lap-proyek')) return '';
    let r;
    try { r = await api('GET', `/api/reports/proyek-detail${qs({ project: id, to: asOf() })}`); } catch { return ''; }
    const f = r.figures;
    return `<div class="section"><span class="section-title">Anggaran vs realisasi</span>
      <dl class="deflist"><dt>RAB</dt><dd>${money(f.budget)}</dd><dt>Realisasi biaya</dt><dd>${money(f.cost)} <span class="muted">(${esc(pctTxt(f.usage))})</span></dd><dt>Komitmen PO</dt><dd>${money(f.commitment)}</dd><dt>Sisa anggaran</dt><dd class="${f.available < 0 ? 'neg' : ''}">${money(f.available)}</dd><dt>Pendapatan / margin</dt><dd>${money(f.revenue)} / ${money(f.margin)}</dd><dt>CPI · SPI · EAC</dt><dd>${f.cpi == null ? '—' : esc(num(f.cpi, 2))} · ${f.spi == null ? '—' : esc(num(f.spi, 2))} · ${money(f.eac)}</dd><dt>Kesehatan</dt><dd>${health(f.health)}</dd></dl>
      <div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Akun</th><th class="ta-r">RAB</th><th class="ta-r">Realisasi</th><th>Serapan</th></tr></thead><tbody>${r.costRows.map((x) => `<tr><td><span class="code">${esc(x.code)}</span> ${esc(x.name)}</td><td class="ta-r">${money(x.budget)}</td><td class="ta-r">${money(x.actual)}</td><td>${meter(x.usage)}</td></tr>`).join('')}</tbody></table></div>
      <button class="btn btn-sm" data-proj-report="${id}">${icon('bar-chart')} Buka laporan proyek</button></div>`;
  }

  /* --- Peristiwa ------------------------------------------------------------------- */
  document.addEventListener('click', (ev) => {
    const q = (sel) => ev.target.closest(sel);
    let el;
    if ((el = q('[data-bview]'))) { bs().view = el.dataset.bview; $$('[data-bview]').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); loadBudget(); return; }
    if (q('[data-budget-copy]')) { openCopy(); return; }
    if (q('[data-budget-copy-run]')) { runCopy(); return; }
    if ((el = q('[data-proj-open]'))) { state.projRpt = { id: Number(el.dataset.projOpen) }; ERP.app.renderView(); window.scrollTo({ top: 0 }); return; }
    if (q('[data-proj-back]')) { state.projRpt = { id: null }; ERP.app.renderView(); return; }
    if ((el = q('[data-proj-report]'))) { state.projRpt = { id: Number(el.dataset.projReport) }; closeOverlay(); ERP.app.setView('lap-proyek'); }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.matches('[data-bud="year"]')) { bs().year = Number(t.value); loadBudget(); }
    if (t.matches('[data-bud="version"]')) { bs().version = t.value; loadBudget(); }
    if (t.matches('[data-coa-year]')) { state.coaYear = Number(t.value); ERP.app.renderView(); }
    if (t.matches('[data-coa-budget]')) { state.coaBudget = t.checked; ERP.app.renderView(); }
  });

  ERP.budget = { budgetReport, loadBudget, coaBudget, projectReport, projectDrawer };
})();
