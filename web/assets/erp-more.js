/* ==========================================================================
   Fitur lanjutan klien: cetak dokumen, lampiran, aksi massal, impor CSV,
   notifikasi, asisten, widget dasbor, analitik, Balanced Scorecard, MRP,
   rekonsiliasi bank, laporan pajak/kartu mitra, dan portal eksternal.
   ========================================================================== */
/* global ERP, FMT, Charts */
(() => {
  'use strict';
  const { $, $$, esc, icon, api, qs, state, money, pill, toast, fail, num, openModal, closeOverlay, fieldHtml } = ERP;
  const R = () => ERP.records;
  const V = () => ERP.views;
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const kpi = (label, value, foot = '', tone = '') => `<div class="kpi-tile"><span class="kpi-label">${esc(label)}</span><span class="kpi-value ${tone}">${value}</span><span class="kpi-foot">${esc(foot)}</span></div>`;
  const period = () => ({ from: state.from || `${state.meta.today.slice(0, 4)}-01-01`, to: state.to || state.meta.today });
  const card = (title, note, body, tools = '') => `<article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">${esc(title)}</h2>${note ? `<span class="card-note">${esc(note)}</span>` : ''}</div>${tools ? `<div class="card-tools">${tools}</div>` : ''}</div>${body}</article>`;

  /* ======================================================================== */
  /* Terbilang (angka → kata, bahasa Indonesia)                               */
  /* ======================================================================== */
  const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  function terbilang(n) {
    n = Math.floor(Math.abs(n));
    if (n < 12) return SATUAN[n];
    if (n < 20) return `${terbilang(n - 10)} belas`;
    if (n < 100) return `${terbilang(Math.floor(n / 10))} puluh ${terbilang(n % 10)}`.trim();
    if (n < 200) return `seratus ${terbilang(n - 100)}`.trim();
    if (n < 1000) return `${terbilang(Math.floor(n / 100))} ratus ${terbilang(n % 100)}`.trim();
    if (n < 2000) return `seribu ${terbilang(n - 1000)}`.trim();
    for (const [v, w] of [[1e12, 'triliun'], [1e9, 'miliar'], [1e6, 'juta'], [1e3, 'ribu']]) {
      if (n >= v) return `${terbilang(Math.floor(n / v))} ${w} ${terbilang(n % v)}`.trim();
    }
    return '';
  }
  const terbilangRupiah = (v) => { const t = terbilang(v); return t ? `${t[0].toUpperCase()}${t.slice(1)} rupiah` : 'Nol rupiah'; };

  /* ======================================================================== */
  /* Cetak dokumen                                                            */
  /* ======================================================================== */
  const PRINT_TITLES = {
    sales_invoices: 'FAKTUR PENJUALAN', quotations: 'PENAWARAN HARGA', sales_orders: 'PESANAN PENJUALAN', purchase_orders: 'PESANAN PEMBELIAN',
    purchase_bills: 'TAGIHAN PEMASOK', customer_receipts: 'KUITANSI PENERIMAAN', supplier_payments: 'BUKTI PEMBAYARAN', cash_transactions: 'BUKTI KAS / BANK',
    journals: 'BUKTI JURNAL UMUM', sales_returns: 'NOTA RETUR PENJUALAN (NOTA KREDIT)', purchase_returns: 'NOTA RETUR PEMBELIAN (NOTA DEBIT)', pos_sales: 'STRUK PENJUALAN',
    purchase_requests: 'PERMINTAAN PEMBELIAN', stock_transfers: 'SURAT JALAN TRANSFER STOK', stock_adjustments: 'BERITA ACARA PENYESUAIAN STOK', work_orders: 'PERINTAH KERJA',
    bank_transfers: 'BUKTI PEMINDAHBUKUAN', delivery_orders: 'SURAT JALAN', depreciation_runs: 'DAFTAR PENYUSUTAN', bank_reconciliations: 'REKONSILIASI BANK', pos_shifts: 'LAPORAN SHIFT KASIR',
  };
  const SIGN = {
    sales_invoices: ['Hormat kami', 'Penerima'], customer_receipts: ['Penerima kas', 'Penyetor'], supplier_payments: ['Dibuat oleh', 'Disetujui oleh', 'Penerima'],
    purchase_orders: ['Pembeli', 'Disetujui oleh', 'Pemasok'], quotations: ['Hormat kami', 'Disetujui pelanggan (nama, tanggal & cap)'], delivery_orders: ['Bagian gudang', 'Pengemudi', 'Diterima baik oleh (nama, tanggal & cap)'], journals: ['Dibuat oleh', 'Diperiksa oleh', 'Disetujui oleh'], stock_transfers: ['Pengirim', 'Pengemudi', 'Penerima'],
  };

  function companyHeader() {
    const c = state.meta.company || {};
    return `<div class="ps-company"><span class="rail-mark ps-mark">${icon('boxes')}</span><div><b>${esc(c.legal_name || c.name || '')}</b>
      <span>${esc(c.address || '')}</span>${c.npwp && !String(c.npwp).startsWith('••') ? `<span>NPWP ${esc(c.npwp)}</span>` : ''}</div></div>`;
  }

  function openPrint(html, title, extra = '') {
    state.lastFocus = document.activeElement;
    state.overlay = { kind: 'print' };
    ERP.overlays().innerHTML = `<div class="scrim" data-close></div><div class="print-wrap" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="print-toolbar"><b>${esc(title)}</b><div class="toolbar-spacer"></div><button class="btn btn-primary" data-print-now>${icon('print')} Cetak / simpan PDF</button><button class="btn btn-ghost" data-close>Tutup</button></div>
      ${extra}<div class="print-pages">${html}</div></div>`;
    $('[data-print-now]', ERP.overlays()).focus();
  }

  function sheet(inner) { return `<section class="print-sheet">${inner}<footer class="ps-foot">Dicetak oleh ${esc(state.me.user.fullName)} · ${esc(ERP.dateTime(new Date().toISOString()))} · ERP Enterprise — keaslian dokumen dapat diverifikasi melalui nomor dokumen dan jejak audit.</footer></section>`; }

  async function printRecord(key, id) {
    let r;
    try { r = await api('GET', `/api/e/${key}/${id}`); } catch (e) { return fail(e); }
    const e = R().ent(key);
    if (key === 'payroll_runs') return printPayslips(e, r);
    const title = PRINT_TITLES[key] || e.label.toUpperCase();
    const curCode = r.currency_id__label ? String(r.currency_id__label).split(' · ')[0] : 'IDR';
    const headFields = e.fields.filter((f) => !f.hidden && !['number', 'status', 'subtotal', 'tax', 'tax_rate', 'total', 'paid', 'notes', 'description', 'reason'].includes(f.name) && f.type !== 'password' && r[f.name] != null && r[f.name] !== '' && !f.sensitive && !f.internal && f.type !== 'textarea' && !(f.name === 'exchange_rate' && Number(r[f.name]) === 1) && !(key === 'quotations' && ['revision', 'sales_order_id', 'revised_from'].includes(f.name) && !r[f.name]));
    const left = headFields.slice(0, Math.ceil(headFields.length / 2)), right = headFields.slice(Math.ceil(headFields.length / 2));
    const dl = (fs) => `<dl class="ps-dl">${fs.map((f) => `<dt>${esc(f.label)}</dt><dd>${fieldHtml(f, r)}</dd>`).join('')}</dl>`;
    let linesHtml = '';
    if (e.lines && r.lines?.length) {
      const lf = e.lines.fields.filter((f) => !f.sensitive && !f.internal);
      linesHtml = `<table class="ps-table"><thead><tr><th>No</th>${lf.map((f) => `<th class="${['money', 'number', 'int', 'pct'].includes(f.type) ? 'ta-r' : ''}">${esc(f.label)}</th>`).join('')}</tr></thead>
        <tbody>${r.lines.map((l, i) => `<tr><td>${i + 1}</td>${lf.map((f) => `<td class="${['money', 'number', 'int', 'pct'].includes(f.type) ? 'ta-r' : ''}">${fieldHtml(f, l)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    const total = r.total ?? r.amount ?? null;
    const totals = r.subtotal !== undefined && r.tax !== undefined
      ? `<div class="ps-totals"><div><span>Subtotal</span><b>${esc(curCode)} ${esc(num(r.subtotal))}</b></div><div><span>PPN ${esc(num(r.tax_rate))}%</span><b>${esc(curCode)} ${esc(num(r.tax))}</b></div><div class="ps-grand"><span>Total</span><b>${esc(curCode)} ${esc(num(r.total))}</b></div>${r.paid ? `<div><span>Terbayar / dikreditkan</span><b>${esc(curCode)} ${esc(num(r.paid))}</b></div><div><span>Sisa</span><b>${esc(curCode)} ${esc(num(r.total - r.paid))}</b></div>` : ''}</div>`
      : total != null ? `<div class="ps-totals"><div class="ps-grand"><span>Jumlah</span><b>${esc(curCode)} ${esc(num(total))}</b></div></div>` : '';
    const words = total != null && curCode === 'IDR' ? `<p class="ps-words"><span>Terbilang:</span> <i>${esc(terbilangRupiah(total))}</i></p>` : total != null && r.exchange_rate > 1 ? `<p class="ps-words"><span>Setara IDR (kurs ${esc(num(r.exchange_rate))}):</span> <b>${esc(FMT.rp(total * r.exchange_rate))}</b></p>` : '';
    const notes = (r.notes || r.description || r.reason ? `<p class="ps-notes"><span>Keterangan:</span> ${esc(r.notes || r.description || r.reason)}</p>` : '') + (key === 'quotations' ? quoteTerms(r) : '') + (key === 'delivery_orders' && r.ship_to ? `<p class="ps-notes"><span>Alamat kirim:</span> ${esc(r.ship_to)}</p><p class="ps-notes"><span>Catatan penerima:</span> barang diterima dalam keadaan baik & jumlah sesuai, kecuali dicatat di bawah ini.</p>` : '');
    const signs = (SIGN[key] || ['Dibuat oleh', 'Disetujui oleh']).map((s) => `<div class="ps-sign"><span>${esc(s)}</span><i></i><span>(&nbsp;${'&nbsp;'.repeat(30)}&nbsp;)</span></div>`).join('');
    openPrint(sheet(`<header class="ps-head">${companyHeader()}<div class="ps-title"><h1>${esc(title)}</h1><b class="code">${esc(r.number || r.code || `#${r.id}`)}</b>${e.statusField ? pill(r[e.statusField]) : ''}</div></header>
      <div class="ps-meta">${dl(left)}${dl(right)}</div>${linesHtml}${totals}${words}${notes}<div class="ps-signs">${signs}</div>`), `${title} ${r.number || ''}`);
  }

  /** Syarat penawaran pada cetakan & portal. */
  function quoteTerms(r) {
    const items = [
      r.valid_until && `Penawaran berlaku sampai <b>${esc(ERP.date(r.valid_until))}</b>.`,
      r.terms_days != null && `Pembayaran ${Number(r.terms_days) ? `${esc(r.terms_days)} hari setelah tanggal faktur` : 'tunai / di muka'}.`,
      r.lead_time_days && `Waktu penyerahan ${esc(r.lead_time_days)} hari setelah PO diterima.`,
      r.delivery_terms && `Penyerahan: ${esc(r.delivery_terms)}.`,
      'Harga belum termasuk PPN kecuali dinyatakan lain; PPN dihitung sesuai tarif yang berlaku.',
    ].filter(Boolean);
    return `<div class="ps-notes"><span>Syarat & ketentuan:</span><ol class="ps-terms">${items.map((x) => `<li>${x}</li>`).join('')}</ol></div>`;
  }

  function printPayslips(e, r) {
    const slips = (r.lines || []).map((l) => sheet(`<header class="ps-head">${companyHeader()}<div class="ps-title"><h1>SLIP GAJI</h1><b>Periode ${esc(r.period)}</b><span class="muted">RAHASIA</span></div></header>
      <dl class="ps-dl ps-dl-wide"><dt>Karyawan</dt><dd>${esc(l.employee_id__label || '')}</dd><dt>Tanggal bayar</dt><dd>${esc(ERP.date(r.pay_date))}</dd></dl>
      <table class="ps-table"><tbody>
        <tr><td>Gaji pokok</td><td class="ta-r">${l.basic == null ? '••••' : esc(FMT.rp(l.basic))}</td></tr><tr><td>Tunjangan</td><td class="ta-r">${l.allowance == null ? '••••' : esc(FMT.rp(l.allowance))}</td></tr>
        <tr><td>Lembur</td><td class="ta-r">${l.overtime == null ? '••••' : esc(FMT.rp(l.overtime))}</td></tr><tr><td>Potongan BPJS</td><td class="ta-r">(${l.bpjs == null ? '••••' : esc(FMT.rp(l.bpjs))})</td></tr>
        <tr><td>PPh 21</td><td class="ta-r">(${l.pph21 == null ? '••••' : esc(FMT.rp(l.pph21))})</td></tr><tr class="ps-grand-row"><td><b>Gaji bersih diterima</b></td><td class="ta-r"><b>${l.net == null ? '••••' : esc(FMT.rp(l.net))}</b></td></tr>
      </tbody></table>${l.net != null ? `<p class="ps-words"><span>Terbilang:</span> <i>${esc(terbilangRupiah(l.net))}</i></p>` : ''}
      <div class="ps-signs"><div class="ps-sign"><span>Bagian SDM</span><i></i><span>(&nbsp;${'&nbsp;'.repeat(30)}&nbsp;)</span></div><div class="ps-sign"><span>Karyawan</span><i></i><span>(&nbsp;${'&nbsp;'.repeat(30)}&nbsp;)</span></div></div>`)).join('');
    openPrint(slips || '<p class="pad">Belum ada slip — isi penggajian terlebih dahulu.</p>', `Slip gaji ${r.period}`);
  }

  async function printReport() {
    const body = $('.report-body');
    if (!body) return window.print();
    openPrint(sheet(`<header class="ps-head">${companyHeader()}</header>${body.innerHTML}`), $('.page-title')?.textContent || 'Laporan');
  }

  /* ======================================================================== */
  /* Lampiran                                                                 */
  /* ======================================================================== */
  async function loadAttachments(key, id) {
    const box = $(`[data-attachments="${key}:${id}"]`);
    if (!box) return;
    let list = [];
    try { list = await api('GET', `/api/attachments/${key}/${id}`); } catch { box.innerHTML = ''; return; }
    const canWrite = R().ent(key)?.canWrite;
    box.innerHTML = `<span class="section-title">Lampiran (${list.length})</span>
      ${list.length ? `<ul class="att-list">${list.map((a) => `<li><span class="att-icon">${icon('folder')}</span><span class="att-name">${esc(a.filename)}<span class="cell-sub">${esc(FMT.int(Math.ceil(a.size / 1024)))} KB · ${esc(a.uploader || '')} · ${esc(ERP.dateTime(a.created_at))}</span></span>
        <button class="btn btn-sm" data-att-get="${a.id}" data-att-name="${esc(a.filename)}">${icon('download')} Unduh</button>${canWrite ? `<button class="btn btn-sm btn-ghost btn-danger-ghost" data-att-del="${a.id}" data-att-of="${key}:${id}" aria-label="Hapus lampiran">${icon('x')}</button>` : ''}</li>`).join('')}</ul>` : '<span class="field-hint">Belum ada lampiran.</span>'}
      ${canWrite ? `<label class="btn btn-sm att-upload">${icon('plus')} Unggah berkas<input type="file" data-att-upload="${key}:${id}" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.txt" hidden></label><span class="field-hint">PDF, gambar, Excel, Word, CSV, TXT · maks 5 MB · disimpan terenkripsi</span>` : ''}`;
  }

  const MIME_BY_EXT = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', csv: 'text/csv', txt: 'text/plain' };
  async function uploadAttachment(input) {
    const [key, id] = input.dataset.attUpload.split(':');
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('Berkas terlalu besar', 'Maksimal 5 MB.', 'danger');
    const mime = MIME_BY_EXT[file.name.split('.').pop().toLowerCase()];
    if (!mime) return toast('Tipe berkas tidak diizinkan', '', 'danger');
    const data = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = no; fr.readAsDataURL(file); });
    try { await api('POST', `/api/attachments/${key}/${id}`, { filename: file.name, mime, data }); toast('Lampiran diunggah', file.name); } catch (e) { fail(e); }
    loadAttachments(key, id);
  }

  async function downloadAttachment(id, name) {
    try { const res = await api('GET', `/api/attachment/${id}`, undefined, { raw: true }); ERP.download(name, await res.blob()); } catch (e) { fail(e); }
  }

  /* ======================================================================== */
  /* Aksi massal                                                              */
  /* ======================================================================== */
  function bulkActions(key) {
    const e = R().ent(key);
    const perms = state.me.permissions[e.module] || 0;
    return (e.actions || []).filter((a) => !a.params && perms >= Math.min(a.level || 3, 3));
  }

  function renderBulkbar(key) {
    const card = $(`[data-register="${key}"]`);
    if (!card) return;
    const st = R().regState(key);
    const sel = st.selected || new Set();
    let bar = $('[data-bulkbar]', card);
    if (!sel.size) { bar?.remove(); return; }
    const acts = bulkActions(key);
    const html = `<b>${sel.size}</b>&nbsp;baris dipilih<div class="toolbar-spacer"></div>${acts.map((a) => `<button class="btn btn-sm" data-bulk="${key}:${a.name}">${esc(a.label)}</button>`).join('')}<button class="btn btn-sm" data-bulk-print="${key}">${icon('print')} Cetak</button><button class="btn btn-sm btn-ghost" data-bulk-clear="${key}">Batalkan pilihan</button>`;
    if (!bar) { bar = document.createElement('div'); bar.className = 'bulkbar'; bar.dataset.bulkbar = ''; $('.toolbar', card).after(bar); }
    bar.innerHTML = html;
  }

  async function runBulk(key, action) {
    const st = R().regState(key);
    const ids = [...(st.selected || [])];
    const a = R().ent(key).actions.find((x) => x.name === action);
    if (!(await ERP.confirmBox(`${a.label} — ${ids.length} dokumen`, 'Aksi dijalankan satu per satu; dokumen yang tidak memenuhi syarat (status, pemisahan tugas) akan dilewati dan dilaporkan.', { ok: a.label }))) return;
    let ok = 0;
    const errs = [];
    for (const id of ids) {
      try { await api('POST', `/api/e/${key}/${id}/actions/${action}`, {}); ok++; } catch (e) { errs.push(`#${id}: ${e.message}`); }
    }
    st.selected = new Set();
    toast(`${a.label}: ${ok} berhasil`, errs.length ? `${errs.length} dilewati — ${errs[0]}` : 'Semua dokumen diproses.', errs.length ? 'warn' : 'ok');
    ERP.forms.clearLookups();
    R().loadRegister(key);
  }

  async function bulkPrint(key) {
    const ids = [...(R().regState(key).selected || [])].slice(0, 30);
    const pages = [];
    for (const id of ids) {
      await printRecord(key, id);
      const p = $('.print-pages', ERP.overlays());
      if (p) pages.push(p.innerHTML);
    }
    if (pages.length) openPrint(pages.join(''), `${R().ent(key).label} (${pages.length} dokumen)`);
  }

  /* ======================================================================== */
  /* Impor CSV                                                                */
  /* ======================================================================== */
  function parseCsv(text) {
    const first = text.split(/\r?\n/)[0] || '';
    const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
      if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (ch !== '\r') cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = (rows.shift() || []).map((h) => h.replace(/^﻿/, '').trim());
    return rows.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  }

  function openImport(key) {
    const e = R().ent(key);
    const fields = e.fields.filter((f) => !f.readonly && !f.hidden && f.type !== 'password');
    const m = openModal({
      title: `Impor ${e.label} dari CSV`, note: 'Baris pertama = judul kolom (nama bidang atau labelnya). Rujukan dapat ditulis dengan kode atau nama.',
      body: `<div class="field"><label>Berkas CSV (pemisah ; atau ,)</label><input class="input" type="file" accept=".csv,text/csv" data-import-file></div>
        <p class="field-hint">Kolom yang dikenali: ${fields.map((f) => `<span class="code">${esc(f.label)}</span>${f.required ? '*' : ''}`).join(', ')}</p>
        <div data-import-preview></div>`,
      foot: `<button class="btn btn-primary" data-import-run disabled>${icon('check')} Impor</button><button class="btn" data-import-template>${icon('download')} Unduh templat</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" data-close>Tutup</button>`,
      wide: true,
    });
    let rows = [];
    $('[data-import-file]', m).addEventListener('change', async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      rows = parseCsv(await f.text());
      const cols = Object.keys(rows[0] || {});
      $('[data-import-preview]', m).innerHTML = rows.length ? `<p><b>${rows.length}</b> baris terbaca. Pratinjau:</p><div class="table-scroll"><table class="table tbl-sm"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 5).map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="neg">Tidak ada baris data.</p>';
      $('[data-import-run]', m).disabled = !rows.length;
    });
    $('[data-import-template]', m).addEventListener('click', () => ERP.download(`templat-${key}.csv`, '﻿' + fields.map((f) => f.label).join(';') + '\n'));
    $('[data-import-run]', m).addEventListener('click', async () => {
      const btn = $('[data-import-run]', m);
      btn.disabled = true;
      try {
        const r = await api('POST', `/api/import/${key}`, { rows });
        $('[data-import-preview]', m).innerHTML = `<div class="notice" data-tone="${r.failed ? 'warn' : 'ok'}">${icon(r.failed ? 'alert' : 'check')} ${r.imported} dari ${r.total} baris berhasil diimpor${r.failed ? `; ${r.failed} gagal` : ''}.</div>
          ${r.failed ? `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Baris</th><th>Galat</th></tr></thead><tbody>${r.results.filter((x) => !x.ok).slice(0, 100).map((x) => `<tr><td class="num">${x.row + 1}</td><td class="neg">${esc(x.error)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
        ERP.forms.clearLookups();
        R().loadRegister(key);
      } catch (e) { fail(e); btn.disabled = false; }
    });
  }

  /* ======================================================================== */
  /* Notifikasi & pencarian global & asisten                                  */
  /* ======================================================================== */
  let notifCache = { at: 0, items: [] };
  async function loadNotifications(force = false) {
    if (!force && Date.now() - notifCache.at < 60e3) return notifCache.items;
    try { notifCache = { at: Date.now(), items: await api('GET', '/api/notifications') }; } catch { /* abaikan */ }
    const badge = $('[data-notif-count]');
    if (badge) { badge.hidden = !notifCache.items.length; badge.textContent = notifCache.items.length > 9 ? '9+' : String(notifCache.items.length); }
    return notifCache.items;
  }

  async function openNotifications(anchor) {
    const items = await loadNotifications(true);
    const r = anchor.getBoundingClientRect();
    state.lastFocus = anchor;
    state.overlay = { kind: 'popover' };
    ERP.overlays().innerHTML = `<div class="scrim scrim-clear" data-close></div><div class="popover popover-wide" role="dialog" aria-label="Notifikasi" style="top:${Math.round(r.bottom + 6)}px;right:${Math.round(window.innerWidth - r.right)}px">
      <div class="popover-head"><b>Notifikasi</b><span class="muted">${items.length} perlu perhatian</span></div>
      <div class="worklist">${items.map((n) => `<button class="worklist-item" data-nav="${esc(n.link?.view || 'dasbor')}"><span class="wl-icon" data-tone="${esc(n.tone)}">${icon(n.tone === 'danger' || n.tone === 'warn' ? 'alert' : 'bell')}</span><span class="worklist-body"><span class="worklist-title">${esc(n.title)}</span><span class="worklist-meta">${esc(n.note)}</span></span></button>`).join('') || '<div class="pad muted">Tidak ada notifikasi.</div>'}</div></div>`;
    $('.worklist-item', ERP.overlays())?.focus();
  }

  async function searchRecords(q) {
    if (q.length < 2) return [];
    try { return await api('GET', `/api/search${qs({ q })}`); } catch { return []; }
  }

  function openAssistant() {
    state.assistantLog = state.assistantLog || [{ who: 'bot', answer: 'Halo! Saya asisten data ERP. Tanyakan pendapatan, laba, kas, piutang, hutang, stok, atau status dokumen.', suggestions: ['Berapa pendapatan bulan ini?', 'Piutang yang lewat jatuh tempo', 'Stok kritis', 'Dokumen menunggu persetujuan'] }];
    ERP.openDrawer({ eyebrow: `<span class="pill" data-tone="accent"><i class="pill-dot"></i>Data langsung · tanpa layanan AI eksternal</span>`, title: 'Asisten ERP', subtitle: 'Jawaban dihitung dari buku besar & modul sesuai hak akses Anda', body: '<div class="chat" data-chat></div>', foot: `<form class="chat-form" data-chat-form><input class="input" name="q" placeholder="Tulis pertanyaan…" maxlength="300" autocomplete="off" aria-label="Pertanyaan"><button class="btn btn-primary" type="submit">${icon('send')} Kirim</button></form>` });
    drawChat();
    setTimeout(() => $('[data-chat-form] input')?.focus(), 30);
  }

  function drawChat() {
    const box = $('[data-chat]');
    if (!box) return;
    const fmtAns = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    box.innerHTML = state.assistantLog.map((m) => m.who === 'me' ? `<div class="chat-msg chat-me">${esc(m.q)}</div>` : `<div class="chat-msg chat-bot"><p>${fmtAns(m.answer || '')}</p>
      ${m.rows?.length ? `<table class="table tbl-sm"><tbody>${m.rows.map((r) => `<tr><td>${esc(r[0])}</td><td class="ta-r num">${esc(r[1])}</td></tr>`).join('')}</tbody></table>` : ''}
      ${m.links?.length ? `<div class="chat-links">${m.links.map((l) => l.entity ? `<button class="btn btn-sm" data-open="${esc(l.entity)}:${l.id}">${esc(l.label)}</button>` : `<button class="btn btn-sm" data-nav="${esc(l.view)}">${esc(l.label)}</button>`).join('')}</div>` : ''}
      ${m.suggestions?.length ? `<div class="chips">${m.suggestions.map((s) => `<button class="chip" data-ask="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}</div>`).join('');
    box.scrollTop = box.scrollHeight;
  }

  async function ask(q) {
    q = String(q || '').trim();
    if (!q) return;
    state.assistantLog.push({ who: 'me', q });
    drawChat();
    try { state.assistantLog.push({ who: 'bot', ...(await api('POST', '/api/assistant', { q })) }); } catch (e) { state.assistantLog.push({ who: 'bot', answer: e.message }); }
    drawChat();
  }

  /* ======================================================================== */
  /* Dasbor dengan widget yang dapat diatur                                   */
  /* ======================================================================== */
  const WIDGETS = [['kpi', 'Indikator utama (KPI)'], ['trend', 'Pendapatan per bulan'], ['branch', 'Pendapatan per cabang & pelanggan teratas'], ['pending', 'Menunggu tindakan'], ['lowstock', 'Stok kritis'], ['notif', 'Notifikasi'], ['quick', 'Pintasan']];

  async function dashboard(root) {
    const company = state.meta.companies.find((c) => c.id === state.meta.companyId)?.name || '';
    const branch = state.meta.branchId ? state.meta.branches.find((b) => b.id === state.meta.branchId)?.name : 'Semua cabang';
    root.innerHTML = V().pageHead('Dasbor', `Ikhtisar ${company} · ${branch}`) + '<div class="loading-cell">Memuat…</div>';
    let d, pref, notes = [];
    try {
      [d, pref, notes] = await Promise.all([api('GET', '/api/dashboard'), api('GET', '/api/prefs/dashboard').then((x) => x.value).catch(() => null), loadNotifications(true)]);
    } catch (e) { root.innerHTML += `<p class="neg">${esc(e.message)}</p>`; return; }
    const prefs = { order: WIDGETS.map((w) => w[0]), hidden: [], ...(pref || {}) };
    const order = [...prefs.order.filter((k) => WIDGETS.some((w) => w[0] === k)), ...WIDGETS.map((w) => w[0]).filter((k) => !prefs.order.includes(k))];
    const k = d.kpis;
    const hasFin = k.revenueYtd !== undefined;
    const W = {
      kpi: () => `<section class="kpi-grid-erp" aria-label="Indikator utama">
        ${hasFin ? kpi('Pendapatan bulan berjalan', esc(FMT.rpCompact(k.revenueMtd)), 'dari jurnal pendapatan') + kpi('Pendapatan tahun berjalan', esc(FMT.rpCompact(k.revenueYtd)), `Margin kotor ${FMT.pct(k.grossMarginPct)}`) + kpi('Laba bersih YTD', esc(FMT.rpCompact(k.netIncomeYtd)), 'setelah pajak', k.netIncomeYtd < 0 ? 'neg' : 'pos') + kpi('Kas & bank', esc(FMT.rpCompact(k.cash)), 'saldo buku besar') : ''}
        ${kpi('Piutang terbuka', esc(FMT.rpCompact(k.arOpen)), k.arOverdue ? `${FMT.rpCompact(k.arOverdue)} lewat jatuh tempo` : 'tidak ada yang lewat jatuh tempo', k.arOverdue ? 'neg' : '')}
        ${kpi('Hutang terbuka', esc(FMT.rpCompact(k.apOpen)), 'ke pemasok')}</section>`,
      trend: () => (hasFin ? card('Pendapatan per bulan', '12 bulan terakhir · akun golongan pendapatan', `<div class="card-body"><div class="chart" data-chart="rev"></div></div>
        <div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Bulan</th><th class="ta-r">Pendapatan</th><th class="ta-r">Beban</th><th class="ta-r">Selisih</th></tr></thead><tbody>
        ${d.trend.slice(-6).map((t) => `<tr><td class="num">${esc(BULAN[Number(t.month.slice(5)) - 1])} ${t.month.slice(0, 4)}</td><td class="ta-r">${money(t.revenue)}</td><td class="ta-r">${money(t.expense)}</td><td class="ta-r">${money(t.revenue - t.expense)}</td></tr>`).join('')}</tbody></table></div>`) : ''),
      branch: () => (hasFin ? card('Pendapatan per cabang', 'tahun berjalan', `<div class="card-body"><div data-chart="branch"></div></div><div class="card-head"><div class="card-head-text"><h2 class="card-title">Pelanggan teratas</h2></div></div>
        <div class="table-scroll"><table class="table tbl-sm"><tbody>${d.topCustomers.map((c) => `<tr><td>${esc(c.name)}</td><td class="ta-r">${money(c.revenue)}</td></tr>`).join('') || '<tr><td class="muted">Belum ada penjualan.</td></tr>'}</tbody></table></div>`) : ''),
      pending: () => card('Menunggu tindakan', 'dokumen pada alur persetujuan', `<div class="worklist">${d.pending.map((p) => `<button class="worklist-item" data-nav="persetujuan"><span class="wl-icon" data-tone="warn">${icon('inbox')}</span><span class="worklist-body"><span class="worklist-title">${esc(p.label)}</span><span class="worklist-meta">menunggu persetujuan / proses</span></span><span class="worklist-side"><b class="num">${p.count}</b>${icon('chevron-right')}</span></button>`).join('') || '<div class="empty-note pad">Tidak ada dokumen menunggu.</div>'}</div>`),
      lowstock: () => card('Stok kritis', 'di bawah titik pesan ulang', `<div class="worklist">${d.lowStock.map((s) => `<button class="worklist-item" data-nav="mrp"><span class="wl-icon" data-tone="${s.state === 'habis' ? 'danger' : 'warn'}">${icon('alert')}</span><span class="worklist-body"><span class="worklist-title">${esc(s.name)}</span><span class="worklist-meta"><span class="code">${esc(s.code)}</span><span>${esc(s.warehouse)}</span></span></span><span class="worklist-side"><b class="num">${esc(num(s.qty, 0))} ${esc(s.uom)}</b><span class="micro">min ${esc(num(s.min_stock, 0))}</span></span></button>`).join('') || '<div class="empty-note pad">Semua stok di atas minimum.</div>'}</div>`),
      notif: () => card('Notifikasi', 'hal yang perlu perhatian', `<div class="worklist">${notes.map((n) => `<button class="worklist-item" data-nav="${esc(n.link?.view || 'dasbor')}"><span class="wl-icon" data-tone="${esc(n.tone)}">${icon(n.tone === 'danger' || n.tone === 'warn' ? 'alert' : 'bell')}</span><span class="worklist-body"><span class="worklist-title">${esc(n.title)}</span><span class="worklist-meta">${esc(n.note)}</span></span></button>`).join('') || '<div class="empty-note pad">Tidak ada notifikasi.</div>'}</div>`),
      quick: () => card('Pintasan', 'tugas yang sering dipakai', `<div class="quick-grid">${[['faktur', 'invoice', 'Faktur penjualan'], ['kasir', 'barcode', 'Kasir'], ['pesanan-pembelian', 'truck', 'Pesanan pembelian'], ['mrp', 'factory', 'Perencanaan bahan (MRP)'], ['lap-neraca', 'scale', 'Neraca'], ['analitik', 'bar-chart', 'Analitik']].filter(([id]) => ERP.app.canSee(id)).map(([id, ic, label]) => `<button class="btn" data-nav="${id}">${icon(ic)} ${esc(label)}</button>`).join('')}</div>`),
    };
    const half = new Set(['branch', 'pending', 'lowstock', 'notif', 'quick']);
    const parts = order.filter((x) => !prefs.hidden.includes(x)).map((x) => [x, W[x]()]).filter(([, h]) => h);
    let html = '';
    for (let i = 0; i < parts.length; i++) {
      const [key, h] = parts[i];
      if (half.has(key) && parts[i + 1] && half.has(parts[i + 1][0])) { html += `<div class="grid grid-1-1" data-widget="${key}">${h}${parts[i + 1][1]}</div>`; i++; } else html += `<div data-widget="${key}">${h}</div>`;
    }
    root.innerHTML = V().pageHead('Dasbor', `Ikhtisar ${company} · ${branch} per ${ERP.date(d.asOf)} — dihitung langsung dari buku besar terposting.`,
      `<button class="btn" data-dash-config>${icon('gear')} Atur widget</button><button class="btn" data-open-assistant>${icon('sparkle')} Tanya asisten</button><button class="btn" data-nav="lap-neraca">${icon('scale')} Neraca</button>`) + html;
    const rev = $('[data-chart="rev"]', root);
    if (rev && d.trend.length) Charts.columnChart(rev, { title: 'Pendapatan per bulan', ariaLabel: 'Pendapatan per bulan', items: d.trend.map((t) => ({ label: `${BULAN[Number(t.month.slice(5)) - 1]} ${t.month.slice(0, 4)}`, short: BULAN[Number(t.month.slice(5)) - 1], value: Math.max(0, t.revenue), count: t.count })), height: 220 });
    const br = $('[data-chart="branch"]', root);
    if (br && d.byBranch.length) Charts.rankBars(br, { items: d.byBranch.map((b) => ({ label: esc(b.name), value: Math.max(0, b.revenue) })) });
    state.dashPrefs = { order, hidden: prefs.hidden };
  }

  function openDashConfig() {
    const p = state.dashPrefs || { order: WIDGETS.map((w) => w[0]), hidden: [] };
    const label = Object.fromEntries(WIDGETS);
    const draw = () => p.order.map((k, i) => `<li class="dash-cfg-row"><label class="check-inline"><input type="checkbox" data-wcheck="${k}" ${p.hidden.includes(k) ? '' : 'checked'}> ${esc(label[k])}</label><span class="toolbar-spacer"></span>
      <button class="btn btn-sm btn-icon" data-wmove="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="Naikkan">${icon('chevron-up')}</button><button class="btn btn-sm btn-icon" data-wmove="${i}:1" ${i === p.order.length - 1 ? 'disabled' : ''} aria-label="Turunkan">${icon('chevron-down')}</button></li>`).join('');
    const m = openModal({ title: 'Atur widget dasbor', note: 'Pilih widget yang tampil dan urutannya. Disimpan per pengguna di server.', body: `<ul class="dash-cfg" data-wlist>${draw()}</ul>`, foot: `<button class="btn btn-primary" data-wsave>${icon('check')} Simpan</button><button class="btn" data-wreset>Kembalikan bawaan</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" data-close>Batal</button>` });
    m.addEventListener('change', (ev) => {
      const c = ev.target.closest('[data-wcheck]');
      if (c) p.hidden = c.checked ? p.hidden.filter((x) => x !== c.dataset.wcheck) : [...new Set([...p.hidden, c.dataset.wcheck])];
    });
    m.addEventListener('click', async (ev) => {
      const mv = ev.target.closest('[data-wmove]');
      if (mv) { const [i, d] = mv.dataset.wmove.split(':').map(Number); [p.order[i], p.order[i + d]] = [p.order[i + d], p.order[i]]; $('[data-wlist]', m).innerHTML = draw(); }
      if (ev.target.closest('[data-wreset]')) { p.order = WIDGETS.map((w) => w[0]); p.hidden = []; $('[data-wlist]', m).innerHTML = draw(); }
      if (ev.target.closest('[data-wsave]')) {
        p.hidden = $$('[data-wcheck]', m).filter((c) => !c.checked).map((c) => c.dataset.wcheck);
        try { await api('PUT', '/api/prefs/dashboard', { value: p }); closeOverlay(); toast('Tata letak dasbor disimpan'); ERP.app.renderView(); } catch (e) { fail(e); }
      }
    });
  }

  /* ======================================================================== */
  /* Analitik & BI                                                            */
  /* ======================================================================== */
  async function analytics(root) {
    const p = period();
    root.innerHTML = V().pageHead('Analitik & BI', `Analisis lintas modul ${ERP.date(p.from)} – ${ERP.date(p.to)} (ubah periode di bilah konteks).`) + '<div class="loading-cell">Menghitung…</div>';
    let a;
    try { a = await api('GET', `/api/analytics${qs(p)}`); } catch (e) { root.innerHTML = R().noAccess(); return; }
    const k = a.kpis;
    const tbl = (rows, cols) => `<div class="table-scroll"><table class="table tbl-sm"><thead><tr>${cols.map((c) => `<th class="${c.r ? 'ta-r' : ''}">${esc(c.l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.r ? 'ta-r' : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">Tidak ada data.</td></tr>`}</tbody></table></div>`;
    root.innerHTML = V().pageHead('Analitik & BI', `Analisis lintas modul ${ERP.date(p.from)} – ${ERP.date(p.to)} (ubah periode di bilah konteks).`, `<button class="btn" data-nav="bsc">${icon('target')} Balanced Scorecard</button>`) +
      `<section class="kpi-grid-erp">${kpi('Pendapatan', esc(FMT.rpCompact(k.revenue)), 'periode terpilih')}${kpi('Margin kotor', esc(FMT.pct(k.grossMarginPct)), 'pendapatan − HPP')}${kpi('Margin bersih', esc(FMT.pct(k.netMarginPct)), FMT.rpCompact(k.netIncome), k.netIncome < 0 ? 'neg' : 'pos')}${kpi('DSO', `${esc(num(k.dso, 1))} hari`, 'rata-rata umur piutang')}${kpi('Nilai persediaan', esc(FMT.rpCompact(k.inventoryValue)), 'valuasi rata-rata')}${kpi('Win rate CRM', esc(FMT.pct(k.winRate)), `${k.openOrders} pesanan terbuka`)}</section>
      <div class="grid grid-2-1">${card('Tren pendapatan & margin', '12 bulan · dari buku besar', `<div class="card-body"><div class="chart" data-chart="months"></div></div>${tbl(a.months.slice(-6), [{ l: 'Bulan', f: (r) => `<span class="num">${esc(BULAN[Number(r.month.slice(5)) - 1])} ${r.month.slice(0, 4)}</span>` }, { l: 'Pendapatan', r: 1, f: (r) => money(r.revenue) }, { l: 'HPP', r: 1, f: (r) => money(r.cogs) }, { l: 'Beban op.', r: 1, f: (r) => money(r.opex) }, { l: 'Margin kotor', r: 1, f: (r) => esc(FMT.pct(r.grossMargin)) }])}`)}
        ${card('Penjualan per kategori', 'faktur terposting', '<div class="card-body"><div data-chart="cat"></div></div>')}</div>
      <div class="grid grid-1-1">${card('Produk terlaris', 'pendapatan & margin', tbl(a.topProducts, [{ l: 'Produk', f: (r) => `<span class="code">${esc(r.code)}</span> ${esc(r.name)}` }, { l: 'Qty', r: 1, f: (r) => esc(num(r.qty, 0)) }, { l: 'Pendapatan', r: 1, f: (r) => money(r.revenue) }, { l: 'Margin', r: 1, f: (r) => esc(FMT.pct(r.margin)) }]))}
        ${card('Penjualan per segmen pelanggan', '', '<div class="card-body"><div data-chart="seg"></div></div>')}</div>
      <div class="grid grid-1-1">${card('Beban terbesar', 'akun beban operasional & lain-lain', '<div class="card-body"><div data-chart="exp"></div></div>')}${card('Pembelian per pemasok', 'tagihan terposting', '<div class="card-body"><div data-chart="sup"></div></div>')}</div>
      <div class="grid grid-1-1">${card('Umur piutang', 'per tanggal akhir periode', '<div class="card-body"><div class="chart" data-chart="ar"></div></div>')}${card('Komposisi persediaan', 'per jenis barang', '<div class="card-body"><div data-chart="inv"></div></div>')}</div>
      <div class="grid grid-1-1">${card('Pipeline CRM per tahap', '', tbl(a.pipeline, [{ l: 'Tahap', f: (r) => pill(r.label) }, { l: 'Peluang', r: 1, f: (r) => esc(r.n) }, { l: 'Nilai', r: 1, f: (r) => money(r.value) }]))}${card('Karyawan per departemen', 'aktif', '<div class="card-body"><div data-chart="hc"></div></div>')}</div>`;
    const ch = (sel) => $(`[data-chart="${sel}"]`, root);
    const bars = (sel, items, fmtVal) => { if (ch(sel) && items.length) Charts.rankBars(ch(sel), { items: items.map((x) => ({ label: esc(x.label), value: Math.max(0, x.value) })) }); if (ch(sel) && fmtVal) { /* label nilai dari rankBars */ } };
    if (a.months.length) Charts.columnChart(ch('months'), { title: 'Pendapatan', ariaLabel: 'Pendapatan per bulan', items: a.months.map((x) => ({ label: x.month, short: BULAN[Number(x.month.slice(5)) - 1], value: Math.max(0, x.revenue), count: x.count })), height: 220 });
    bars('cat', a.byCategory); bars('seg', a.bySegment); bars('exp', a.expenses); bars('sup', a.suppliers); bars('inv', a.invByKind.map((x) => ({ ...x, label: { bahan_baku: 'Bahan baku', barang_jadi: 'Barang jadi', barang_dagang: 'Barang dagangan' }[x.label] || x.label })));
    if (a.arBuckets.some((x) => x.value > 0)) Charts.columnChart(ch('ar'), { title: 'Umur piutang', ariaLabel: 'Umur piutang', items: a.arBuckets.map((x) => ({ label: esc(x.label), short: esc(x.label.replace(' hari', '')), value: Math.max(0, x.value), count: 0 })), height: 200 });
    if (a.headcount.length) Charts.rankBars(ch('hc'), { items: a.headcount.map((x) => ({ label: esc(x.label), value: x.value })) });
    $$('[data-chart="hc"] b.num', root).forEach((b, i) => { b.textContent = `${a.headcount[i]?.value ?? ''} orang`; });
  }

  /* ======================================================================== */
  /* Balanced Scorecard                                                       */
  /* ======================================================================== */
  async function bsc(root) {
    const p = period();
    root.innerHTML = V().pageHead('Balanced Scorecard', 'Kinerja empat perspektif Kaplan & Norton. Ukuran otomatis dihitung dari data ERP; ukuran manual diisi di Sasaran BSC.') + '<div class="loading-cell">Menghitung…</div>';
    let b;
    try { b = await api('GET', `/api/bsc${qs({ to: p.to })}`); } catch (e) { root.innerHTML = R().noAccess(); return; }
    const tone = (s) => (s === null ? 'neutral' : s >= 100 ? 'ok' : s >= 85 ? 'warn' : 'danger');
    const fmtVal = (v, unit) => (v === null || v === undefined ? '—' : `${num(v, 2)} ${unit || ''}`.trim());
    root.innerHTML = V().pageHead('Balanced Scorecard', `Per ${ERP.date(b.asOf)} · skor = realisasi ÷ target (dibalik untuk ukuran yang semakin rendah semakin baik), maksimal 120%.`,
      `${R().ent('bsc_metrics') ? `<button class="btn" data-nav="sasaran-bsc">${icon('edit')} Kelola sasaran</button>` : ''}`) +
      `<section class="kpi-grid-erp">${kpi('Skor keseluruhan', b.overall === null ? '—' : `${esc(num(b.overall, 1))}%`, 'rata-rata empat perspektif', tone(b.overall) === 'ok' ? 'pos' : tone(b.overall) === 'danger' ? 'neg' : '')}
        ${b.perspectives.map((x) => kpi(x.label, x.score === null ? '—' : `${esc(num(x.score, 1))}%`, `${x.metrics.length} ukuran`, tone(x.score) === 'ok' ? 'pos' : tone(x.score) === 'danger' ? 'neg' : '')).join('')}</section>
      <div class="grid grid-1-1">${b.perspectives.map((x) => card(x.label, `skor ${x.score === null ? '—' : `${num(x.score, 1)}%`}`, `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Ukuran</th><th class="ta-r">Target</th><th class="ta-r">Realisasi</th><th>Pencapaian</th></tr></thead><tbody>
        ${x.metrics.map((m) => `<tr data-open="bsc_metrics:${m.id}" tabindex="0"><td>${esc(m.name)}<span class="cell-sub">${m.source === 'manual' ? 'input manual' : 'otomatis dari ERP'} · ${m.direction === 'turun' ? 'semakin rendah semakin baik' : 'semakin tinggi semakin baik'}</span></td><td class="ta-r num">${esc(fmtVal(m.target, m.unit))}</td><td class="ta-r num">${esc(fmtVal(m.actual, m.unit))}</td>
          <td><span class="meter"><span class="meter-track"><span class="meter-fill" ${m.tone !== 'ok' && m.tone !== 'neutral' ? `data-tone="${m.tone}"` : ''} style="width:${Math.min(100, (m.score || 0) / 1.2)}%"></span></span><span class="meter-val">${m.score === null ? '—' : `${esc(num(m.score, 0))}%`}</span></span></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Belum ada ukuran.</td></tr>'}
        </tbody></table></div>`)).join('')}</div>`;
  }

  /* ======================================================================== */
  /* MRP                                                                      */
  /* ======================================================================== */
  async function mrp(root) {
    root.innerHTML = V().pageHead('Perencanaan Kebutuhan Bahan (MRP)', 'Kebutuhan = pesanan penjualan terbuka + kebutuhan komponen perintah kerja + stok pengaman; pasokan = stok + PO/PR terbuka + produksi berjalan.') + '<div class="loading-cell">Menghitung…</div>';
    let d;
    try { d = await api('GET', '/api/mrp'); } catch (e) { root.innerHTML = R().noAccess(); return; }
    const canPr = R().ent('purchase_requests')?.canWrite, canWo = R().ent('work_orders')?.canWrite;
    const branchSel = !state.meta.branchId && state.meta.branches.length > 1 ? `<label class="ctx-inline">Cabang PR <select class="select" data-mrp-branch>${state.meta.branches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label>` : '';
    root.innerHTML = V().pageHead('Perencanaan Kebutuhan Bahan (MRP)', `Per ${ERP.date(d.asOf)} · ${d.suggestions} saran tindakan untuk perusahaan aktif.`,
      `${branchSel}${canPr ? `<button class="btn btn-primary" data-mrp-pr>${icon('clipboard')} Buat permintaan pembelian dari pilihan</button>` : ''}`) +
      `<article class="card"><div class="table-scroll"><table class="table"><thead><tr><th class="col-check"></th><th>Barang</th><th class="ta-r">Stok</th><th class="ta-r">Masuk (PO/PR/WO)</th><th class="ta-r">Kebutuhan</th><th class="ta-r">Stok pengaman</th><th class="ta-r">Kekurangan</th><th>Saran</th><th class="ta-r">Estimasi biaya</th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr class="${r.action ? 'row-attn' : ''}"><td class="col-check">${r.action === 'pembelian' && canPr ? `<input type="checkbox" data-mrp-item="${r.product_id}:${r.qty}" checked aria-label="Pilih ${esc(r.code)}">` : ''}</td>
        <td><span class="code">${esc(r.code)}</span> ${esc(r.name)}<span class="cell-sub">${esc(r.kind.replace('_', ' '))}</span></td><td class="ta-r num">${esc(num(r.stock))}</td><td class="ta-r num">${esc(num(r.incoming))}</td><td class="ta-r num">${esc(num(r.demand))}</td><td class="ta-r num">${esc(num(r.safety))}</td>
        <td class="ta-r num ${r.net > 0 ? 'neg' : ''}">${esc(num(r.net))}</td>
        <td>${r.action === 'pembelian' ? `<span class="pill" data-tone="warn"><i class="pill-dot"></i>Beli ${esc(num(r.qty, 0))} ${esc(r.uom)}</span>${r.supplier ? `<span class="cell-sub">pemasok terakhir: ${esc(r.supplier.name)}</span>` : ''}` : r.action === 'produksi' ? `<span class="pill" data-tone="accent"><i class="pill-dot"></i>Produksi ${esc(num(r.qty, 0))} batch</span>${canWo ? ` <button class="btn btn-sm" data-mrp-wo="${r.bom_id}:${r.qty}">Buat WO</button>` : ''}` : '<span class="muted">Cukup</span>'}</td>
        <td class="ta-r">${r.estCost ? money(r.estCost) : ''}</td></tr>`).join('')}
      </tbody></table></div></article>`;
  }

  async function mrpCreatePr() {
    const items = $$('[data-mrp-item]:checked').map((c) => { const [product_id, qty] = c.dataset.mrpItem.split(':').map(Number); return { product_id, qty }; });
    if (!items.length) return toast('Pilih saran pembelian', '', 'warn');
    const br = $('[data-mrp-branch]')?.value || state.meta.branchId;
    try { const pr = await api('POST', '/api/mrp/request', { items, branch_id: br ? Number(br) : undefined }); toast('Permintaan pembelian dibuat', pr.number); R().openRecord('purchase_requests', pr.id); } catch (e) { fail(e); }
  }

  /* ======================================================================== */
  /* Rekonsiliasi bank                                                        */
  /* ======================================================================== */
  async function recon(root) {
    if (!state.reconId) return R().renderRegister(root, 'bank_reconciliations', { title: 'Rekonsiliasi Bank', sub: 'Cocokkan mutasi buku besar rekening dengan rekening koran bank. Buka rekonsiliasi lalu pilih "Cocokkan mutasi".' });
    let d;
    try { d = await api('GET', `/api/bank-recon/${state.reconId}`); } catch (e) { state.reconId = null; return recon(root); }
    const draft = d.recon.status === 'draf';
    root.innerHTML = V().pageHead(`Rekonsiliasi ${d.recon.number}`, `${d.bank.name} · rekening koran per ${ERP.date(d.recon.statement_date)}. Centang mutasi yang sudah tercantum di rekening koran.`,
      `<button class="btn" data-recon-back>${icon('chevron-left')} Daftar rekonsiliasi</button>${draft ? `<button class="btn" data-recon-save>${icon('check')} Simpan centang</button><button class="btn btn-primary" data-action-run="bank_reconciliations:${d.recon.id}:finalize">Selesaikan</button>` : ''}`) +
      `<section class="kpi-grid-erp">${kpi('Saldo rekening koran', esc(FMT.rp(d.recon.statement_balance)), 'diinput dari bank')}${kpi('Saldo buku besar', esc(FMT.rp(d.gl)), 's.d. tanggal rekening koran')}${kpi('Saldo terekonsiliasi', `<span data-recon-cleared>${esc(FMT.rp(d.cleared))}</span>`, 'mutasi dicentang')}${kpi('Selisih', `<span data-recon-diff>${esc(FMT.rp(d.difference))}</span>`, 'harus nol untuk diselesaikan', Math.abs(d.difference) < 0.005 ? 'pos' : 'neg')}</section>
      <article class="card"><div class="toolbar">${draft ? `<button class="btn btn-sm" data-recon-all>Centang semua</button><button class="btn btn-sm btn-ghost" data-recon-none>Hapus centang</button>` : pill('selesai')}<div class="toolbar-spacer"></div><span class="pager-info">${d.lines.length} mutasi belum/akan direkonsiliasi</span></div>
      <div class="table-scroll"><table class="table tbl-sm"><thead><tr><th class="col-check"></th><th>Tanggal</th><th>Jurnal</th><th>Uraian</th><th class="ta-r">Debit (masuk)</th><th class="ta-r">Kredit (keluar)</th></tr></thead><tbody>
      ${d.lines.map((l) => `<tr><td class="col-check"><input type="checkbox" data-recon-line="${l.id}" data-amt="${l.debit - l.credit}" ${l.cleared ? 'checked' : ''} ${draft ? '' : 'disabled'} aria-label="Cocokkan ${esc(l.number)}"></td><td class="num">${esc(ERP.date(l.date))}</td><td class="code"><button class="link" data-open="journals:${l.journal_id}">${esc(l.number)}</button></td><td>${esc(l.description)}${l.memo ? `<span class="cell-sub">${esc(l.memo)}</span>` : ''}</td><td class="ta-r">${l.debit ? money(l.debit) : ''}</td><td class="ta-r">${l.credit ? money(l.credit) : ''}</td></tr>`).join('')}
      </tbody></table></div></article>`;
    state.reconBase = round2(d.cleared - d.lines.filter((l) => l.cleared).reduce((s, l) => s + l.debit - l.credit, 0));
    state.reconStatement = d.recon.statement_balance;
  }
  const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  function reconRecalc() {
    const cleared = round2(state.reconBase + $$('[data-recon-line]:checked').reduce((s, c) => s + Number(c.dataset.amt), 0));
    const diff = round2(state.reconStatement - cleared);
    const c = $('[data-recon-cleared]'), d = $('[data-recon-diff]');
    if (c) c.textContent = FMT.rp(cleared);
    if (d) { d.textContent = FMT.rp(diff); d.closest('.kpi-value').className = `kpi-value ${Math.abs(diff) < 0.005 ? 'pos' : 'neg'}`; }
  }
  async function reconSave(silent = false) {
    const ids = $$('[data-recon-line]:checked').map((c) => Number(c.dataset.reconLine));
    try { await api('PUT', `/api/bank-recon/${state.reconId}/items`, { lineIds: ids }); if (!silent) toast('Centang disimpan'); } catch (e) { fail(e); throw e; }
  }

  /* ======================================================================== */
  /* Laporan tambahan: pajak & kartu mitra                                    */
  /* ======================================================================== */
  async function taxReport(root) {
    const p = period();
    root.innerHTML = V().pageHead('Rekap Pajak (PPN & PPh 21)', 'PPN keluaran/masukan dari faktur, kasir, tagihan, dan retur; PPh 21 dari penggajian — dihitung dari buku besar.', `<button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button><button class="btn" data-print-report>${icon('print')} Cetak</button>`) + '<article class="card report-card"><div class="report-body"><div class="loading-cell">Menghitung…</div></div></article>';
    let r;
    try { r = await api('GET', `/api/reports/pajak${qs({ to: p.to })}`); } catch (e) { $('.report-body', root).innerHTML = `<p class="pad neg">${esc(e.message)}</p>`; return; }
    $('.report-body', root).innerHTML = `<div class="report-head"><b>${esc(state.meta.company?.name || '')}</b><span>${esc(r.title)}</span><span class="num">s.d. ${esc(ERP.date(r.period.to))}</span></div>
      <div class="table-scroll"><table class="table report-table"><thead><tr><th>Masa</th><th class="ta-r">PPN keluaran</th><th class="ta-r">PPN masukan</th><th class="ta-r">Kurang (lebih) bayar</th><th class="ta-r">PPN disetor</th><th class="ta-r">PPh 21 dipotong</th><th class="ta-r">PPh 21 disetor</th></tr></thead><tbody>
      ${r.rows.map((x) => `<tr><td class="num">${esc(BULAN[Number(x.month.slice(5)) - 1])} ${x.month.slice(0, 4)}</td><td class="ta-r">${money(x.vatOut)}</td><td class="ta-r">${money(x.vatIn)}</td><td class="ta-r">${money(x.vatNet)}</td><td class="ta-r">${money(x.vatPaid)}</td><td class="ta-r">${money(x.pph21)}</td><td class="ta-r">${money(x.pph21Paid)}</td></tr>`).join('')}
      </tbody><tfoot><tr class="row-total"><td>Total</td><td class="ta-r">${money(r.totals.vatOut)}</td><td class="ta-r">${money(r.totals.vatIn)}</td><td class="ta-r">${money(r.totals.vatNet)}</td><td class="ta-r">${money(r.totals.vatPaid)}</td><td class="ta-r">${money(r.totals.pph21)}</td><td class="ta-r">${money(r.totals.pph21Paid)}</td></tr></tfoot></table></div>`;
  }

  async function partnerReport(root, type) {
    const isCust = type === 'customer';
    const key = isCust ? 'customers' : 'suppliers';
    state.partnerSel = state.partnerSel || {};
    const p = period();
    root.innerHTML = V().pageHead(isCust ? 'Kartu Piutang Pelanggan' : 'Kartu Hutang Pemasok', 'Mutasi faktur/tagihan, pembayaran, dan retur per mitra dari buku besar, dengan saldo berjalan.', `<button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button><button class="btn" data-print-report>${icon('print')} Cetak</button>`) +
      `<article class="card report-card"><div class="toolbar report-toolbar"><label class="ctx-inline">${isCust ? 'Pelanggan' : 'Pemasok'} <select class="select" data-partner-sel="${type}" data-ref="${key}" data-ref-filter="{}" data-value="${esc(state.partnerSel[type] || '')}"><option value="">Memuat…</option></select></label><span class="pager-info">${esc(ERP.date(p.from))} – ${esc(ERP.date(p.to))}</span></div><div class="report-body"></div></article>`;
    await ERP.forms.hydrateRefs(root);
    const sel = $('[data-partner-sel]', root);
    if (!state.partnerSel[type] && sel.options.length > 1) { sel.selectedIndex = 1; state.partnerSel[type] = sel.value; }
    loadPartner(root, type);
  }

  async function loadPartner(root, type) {
    const body = $('.report-body', root);
    const id = state.partnerSel[type];
    if (!id) { body.innerHTML = '<p class="pad muted">Pilih mitra.</p>'; return; }
    const p = period();
    let r;
    try { r = await api('GET', `/api/reports/kartu-mitra${qs({ from: p.from, to: p.to, partner: id, partner_type: type })}`); } catch (e) { body.innerHTML = `<p class="pad neg">${esc(e.message)}</p>`; return; }
    body.innerHTML = `<div class="report-head"><b>${esc(state.meta.company?.name || '')}</b><span>${esc(r.title)}</span><span class="num">${esc(ERP.date(r.period.from))} s.d. ${esc(ERP.date(r.period.to))}</span></div>
      <div class="table-scroll"><table class="table report-table"><thead><tr><th>Tanggal</th><th>Dokumen</th><th>Uraian</th><th class="ta-r">Debit</th><th class="ta-r">Kredit</th><th class="ta-r">Saldo</th></tr></thead><tbody>
      <tr class="row-sub"><td colspan="5">Saldo awal</td><td class="ta-r">${money(r.opening)}</td></tr>
      ${r.lines.map((l) => `<tr ${l.source_id && R().ent(l.source_type) ? `data-open="${esc(l.source_type)}:${l.source_id}" tabindex="0"` : ''}><td class="num">${esc(ERP.date(l.date))}</td><td class="code">${esc(l.source_no || l.number)}</td><td>${esc(l.description)}</td><td class="ta-r">${l.debit ? money(l.debit) : ''}</td><td class="ta-r">${l.credit ? money(l.credit) : ''}</td><td class="ta-r">${money(l.balance)}</td></tr>`).join('')}
      </tbody><tfoot><tr class="row-total"><td colspan="5">Saldo akhir</td><td class="ta-r">${money(r.closing)}</td></tr></tfoot></table></div>`;
  }

  /* ======================================================================== */
  /* Kurs otomatis pada formulir                                              */
  /* ======================================================================== */
  function bindFx(form) {
    const cur = $('[name="currency_id"]', form), rate = $('[name="exchange_rate"]', form);
    if (!cur || !rate) return;
    const refresh = async () => {
      if (!cur.value) { rate.value = ''; rate.placeholder = '1 (IDR)'; return; }
      try {
        const date = $('[name="date"]', form)?.value || state.meta.today;
        const r = await api('GET', `/api/fx-rate${qs({ currency_id: cur.value, date })}`);
        if (r.base) { rate.value = 1; return; }
        if (r.rate) { rate.value = r.rate; rate.title = `Kurs per ${r.date}`; } else toast('Kurs belum tersedia', `Isi kurs ${r.code} di Keuangan → Kurs Valuta.`, 'warn');
      } catch { /* abaikan */ }
    };
    cur.addEventListener('change', refresh);
    if (cur.value && !rate.value) refresh();
  }

  /* ======================================================================== */
  /* Portal pelanggan / pemasok                                               */
  /* ======================================================================== */
  const PORTAL_TABS = {
    customer: [['ringkasan', 'Ringkasan', 'grid'], ['invoices', 'Faktur', 'invoice'], ['orders', 'Pesanan', 'cart'], ['quotations', 'Penawaran', 'quote'], ['payments', 'Pembayaran', 'wallet'], ['returns', 'Retur', 'transfer'], ['statement', 'Kartu piutang', 'ledger'], ['profil', 'Keamanan akun', 'shield']],
    supplier: [['ringkasan', 'Ringkasan', 'grid'], ['orders', 'Pesanan pembelian (PO)', 'truck'], ['bills', 'Tagihan', 'invoice'], ['payments', 'Pembayaran diterima', 'wallet'], ['returns', 'Retur', 'transfer'], ['statement', 'Kartu hutang', 'ledger'], ['profil', 'Keamanan akun', 'shield']],
  };

  async function renderPortal() {
    const app = $('#app');
    app.className = 'portal-shell';
    const type = state.me.user.portal;
    state.portalTab = state.portalTab || 'ringkasan';
    const tabs = PORTAL_TABS[type];
    let sum;
    try { sum = await api('GET', '/api/portal/summary'); } catch (e) { app.innerHTML = `<p class="pad neg">${esc(e.message)}</p>`; return; }
    app.innerHTML = `<header class="portal-top"><span class="rail-mark">${icon('boxes')}</span><div class="portal-brand"><b>Portal ${type === 'customer' ? 'Pelanggan' : 'Pemasok'}</b><span>${esc(sum.company.name)}</span></div><div class="toolbar-spacer"></div>
        <span class="portal-party">${esc(sum.party.name)}</span><button class="btn btn-sm" data-logout>${icon('logout')} Keluar</button></header>
      <nav class="portal-tabs" role="tablist">${tabs.map(([id, label, ic]) => `<button class="tab" role="tab" data-portal-tab="${id}" aria-selected="${state.portalTab === id}">${icon(ic)} ${esc(label)}</button>`).join('')}</nav>
      <main class="content portal-content" id="content"><div class="content-inner" data-portal-root></div></main>`;
    const root = $('[data-portal-root]');
    const t = state.portalTab;
    const docTable = (rows, kind) => `<article class="card"><div class="table-scroll"><table class="table"><thead><tr><th>Nomor</th><th>Tanggal</th>${rows[0]?.due_date !== undefined ? '<th>Jatuh tempo</th>' : ''}<th class="ta-r">Total</th>${rows[0]?.paid !== undefined ? '<th class="ta-r">Sisa</th>' : ''}<th>Status</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="code cell-strong">${esc(r.number)}</td><td class="num">${esc(ERP.date(r.date))}</td>${r.due_date !== undefined ? `<td class="num ${r.due_date < state.meta.today && r.total - r.paid > 0 ? 'neg' : ''}">${esc(ERP.date(r.due_date))}</td>` : ''}<td class="ta-r">${money(r.total)}</td>${r.paid !== undefined ? `<td class="ta-r">${money(r.total - r.paid)}</td>` : ''}<td>${pill(r.status)}</td><td><button class="btn btn-sm" data-portal-doc="${kind}:${r.id}">${icon('eye')} Lihat / cetak</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Tidak ada dokumen.</td></tr>'}</tbody></table></div></article>`;
    if (t === 'ringkasan') {
      root.innerHTML = V().pageHead(`Selamat datang, ${state.me.user.fullName}`, `Ringkasan akun ${sum.party.name} di ${sum.company.name}. Data yang Anda lihat terbatas pada akun Anda sendiri.`) +
        `<section class="kpi-grid-erp">${type === 'customer'
          ? kpi('Tagihan terbuka', esc(FMT.rpCompact(sum.open.v)), `${sum.open.n} faktur`) + kpi('Lewat jatuh tempo', esc(FMT.rpCompact(sum.open.overdue)), 'mohon segera dilunasi', sum.open.overdue ? 'neg' : 'pos') + kpi('Pesanan berjalan', String(sum.orders), 'menunggu/disetujui') + kpi('Termin pembayaran', `${sum.party.terms_days} hari`, '')
          : kpi('Tagihan belum dibayar', esc(FMT.rpCompact(sum.open.v)), `${sum.open.n} tagihan`) + kpi('PO aktif', String(sum.orders), 'siap dikirim') + kpi('Termin pembayaran', `${sum.party.terms_days} hari`, '')}</section>
        <div class="notice" data-tone="info">${icon('shield')} Akses portal dicatat di jejak audit. Aktifkan autentikasi dua faktor di tab Keamanan akun.</div>`;
    } else if (t === 'statement') {
      const r = await api('GET', '/api/portal/statement');
      root.innerHTML = V().pageHead(r.title, `${ERP.date(r.period.from)} s.d. ${ERP.date(r.period.to)}`) + `<article class="card"><div class="table-scroll"><table class="table report-table"><thead><tr><th>Tanggal</th><th>Dokumen</th><th>Uraian</th><th class="ta-r">Debit</th><th class="ta-r">Kredit</th><th class="ta-r">Saldo</th></tr></thead><tbody>
        <tr class="row-sub"><td colspan="5">Saldo awal</td><td class="ta-r">${money(r.opening)}</td></tr>${r.lines.map((l) => `<tr><td class="num">${esc(ERP.date(l.date))}</td><td class="code">${esc(l.number)}</td><td>${esc(l.description)}</td><td class="ta-r">${l.debit ? money(l.debit) : ''}</td><td class="ta-r">${l.credit ? money(l.credit) : ''}</td><td class="ta-r">${money(l.balance)}</td></tr>`).join('')}
        </tbody><tfoot><tr class="row-total"><td colspan="5">Saldo akhir</td><td class="ta-r">${money(r.closing)}</td></tr></tfoot></table></div></article>`;
    } else if (t === 'profil') {
      await V().profile(root);
    } else {
      const label = tabs.find((x) => x[0] === t)?.[1] || '';
      root.innerHTML = V().pageHead(label, 'Dokumen terbaru (maks. 200).') + docTable(await api('GET', `/api/portal/docs/${t}`), t);
    }
  }

  async function portalDoc(kind, id) {
    let d;
    try { d = await api('GET', `/api/portal/docs/${kind}/${id}`); } catch (e) { return fail(e); }
    const titles = { invoices: 'FAKTUR PENJUALAN', orders: state.me.user.portal === 'customer' ? 'PESANAN PENJUALAN' : 'PESANAN PEMBELIAN', quotations: 'PENAWARAN HARGA', payments: state.me.user.portal === 'customer' ? 'KUITANSI' : 'BUKTI PEMBAYARAN', returns: 'NOTA RETUR', bills: 'TAGIHAN' };
    state.meta = state.meta || {};
    state.meta.company = d.company;
    openPrint(sheet(`<header class="ps-head">${companyHeader()}<div class="ps-title"><h1>${esc(titles[kind] || 'DOKUMEN')}</h1><b class="code">${esc(d.number)}</b>${pill(d.status)}</div></header>
      <div class="ps-meta"><dl class="ps-dl"><dt>Kepada / dari</dt><dd>${esc(d.party)}</dd><dt>Tanggal</dt><dd>${esc(ERP.date(d.date))}</dd>${d.due_date ? `<dt>Jatuh tempo</dt><dd>${esc(ERP.date(d.due_date))}</dd>` : ''}</dl></div>
      ${kind === 'quotations' ? `<div class="ps-meta"><dl class="ps-dl">${d.attention ? `<dt>Kepada (UP)</dt><dd>${esc(d.attention)}</dd>` : ''}${d.revision ? `<dt>Revisi</dt><dd>${esc(d.revision)}</dd>` : ''}<dt>Berlaku sampai</dt><dd>${esc(ERP.date(d.valid_until))}</dd></dl><dl class="ps-dl">${d.salesperson ? `<dt>Tenaga penjual</dt><dd>${esc(d.salesperson)}</dd>` : ''}${d.terms_days != null ? `<dt>Termin</dt><dd>${esc(d.terms_days)} hari</dd>` : ''}</dl></div>` : ''}
      ${d.lines.length ? `<table class="ps-table"><thead><tr><th>No</th><th>Barang / dokumen</th><th class="ta-r">Qty</th><th class="ta-r">Harga</th>${d.lines.some((l) => l.discount_pct) ? '<th class="ta-r">Diskon</th>' : ''}<th class="ta-r">Jumlah</th></tr></thead><tbody>${d.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.product || '')}${l.description ? `<span class="cell-sub">${esc(l.description)}</span>` : ''}</td><td class="ta-r">${l.qty != null ? esc(num(l.qty)) : ''}</td><td class="ta-r">${l.price != null ? esc(num(l.price)) : ''}</td>${d.lines.some((x) => x.discount_pct) ? `<td class="ta-r">${l.discount_pct ? `${esc(num(l.discount_pct))}%` : ''}</td>` : ''}<td class="ta-r">${esc(num(l.amount))}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="ps-totals">${d.subtotal != null ? `<div><span>Subtotal</span><b>${esc(num(d.subtotal))}</b></div><div><span>PPN ${esc(num(d.tax_rate))}%</span><b>${esc(num(d.tax))}</b></div>` : ''}<div class="ps-grand"><span>Total</span><b>${esc(num(d.total))}</b></div>${d.paid ? `<div><span>Terbayar</span><b>${esc(num(d.paid))}</b></div>` : ''}</div>
      ${d.total ? `<p class="ps-words"><span>Terbilang:</span> <i>${esc(terbilangRupiah(d.total))}</i></p>` : ''}
      ${kind === 'quotations' ? `${d.notes ? `<p class="ps-notes"><span>Catatan:</span> ${esc(d.notes)}</p>` : ''}${quoteTerms(d)}${d.accepted_by ? `<p class="ps-notes"><span>Disetujui pelanggan:</span> ${esc(d.accepted_by)}${d.customer_po ? ` · PO ${esc(d.customer_po)}` : ''} · ${esc(ERP.date(d.responded_at))}</p>` : ''}` : ''}`),
    `${titles[kind] || 'Dokumen'} ${d.number}`, kind === 'quotations' && d.canRespond ? quoteRespondPanel(d) : '');
  }

  /** Panel tanggapan penawaran untuk pelanggan (tidak ikut tercetak). */
  function quoteRespondPanel(d) {
    return `<form class="print-toolbar quote-respond" data-quote-respond="${d.id}" novalidate>
      <div class="quote-respond-text"><b>Tanggapi penawaran ${esc(d.number)}</b><span class="muted">Berlaku sampai ${esc(ERP.date(d.valid_until))}. Keputusan Anda tercatat dan diteruskan ke tenaga penjual kami.</span></div>
      <input class="input" name="name" placeholder="Nama & jabatan penanggung jawab" maxlength="120" aria-label="Nama penanggung jawab" required>
      <input class="input" name="customer_po" placeholder="No. PO (opsional)" maxlength="60" aria-label="Nomor PO">
      <button class="btn btn-primary" type="button" data-quote-decide="accept">${icon('check')} Terima penawaran</button>
      <select class="select" name="lost_reason" aria-label="Alasan menolak"><option value="harga">Harga</option><option value="waktu">Waktu penyerahan</option><option value="spesifikasi">Spesifikasi</option><option value="pesaing">Memilih penyedia lain</option><option value="anggaran">Anggaran</option><option value="ditunda">Ditunda</option><option value="lainnya">Lainnya</option></select>
      <button class="btn btn-danger-ghost" type="button" data-quote-decide="reject">Tolak</button>
    </form>`;
  }
  async function quoteDecide(btn) {
    const f = btn.closest('[data-quote-respond]');
    const name = f.name.value.trim();
    if (!name) { f.name.focus(); return toast('Isi nama penanggung jawab', '', 'warn'); }
    const decision = btn.dataset.quoteDecide;
    if (decision === 'reject' && !(await ERP.confirmBox('Tolak penawaran', 'Penawaran akan ditandai ditolak. Lanjutkan?', { danger: true, ok: 'Tolak' }))) return;
    try {
      await api('POST', `/api/portal/quotations/${f.dataset.quoteRespond}/respond`, { decision, name, customer_po: f.customer_po.value.trim(), lost_reason: f.lost_reason.value });
      closeOverlay();
      toast(decision === 'accept' ? 'Penawaran diterima' : 'Penawaran ditolak', decision === 'accept' ? 'Terima kasih — kami akan segera memproses pesanan Anda.' : 'Terima kasih atas tanggapan Anda.');
      renderPortal();
    } catch (e) { fail(e); }
  }

  /* ======================================================================== */
  /* Peristiwa                                                                */
  /* ======================================================================== */
  document.addEventListener('click', async (ev) => {
    const q = (sel) => ev.target.closest(sel);
    let el;
    if (q('[data-print-now]')) { document.body.classList.add('printing'); window.print(); return; }
    if ((el = q('[data-print-record]'))) { const [k, id] = el.dataset.printRecord.split(':'); printRecord(k, Number(id)); return; }
    if (q('[data-print-report]')) { printReport(); return; }
    if ((el = q('[data-att-get]'))) { downloadAttachment(el.dataset.attGet, el.dataset.attName); return; }
    if ((el = q('[data-att-del]'))) {
      if (!(await ERP.confirmBox('Hapus lampiran', 'Lampiran dihapus permanen; jejak audit tetap mencatat nama & hash berkas.', { danger: true, ok: 'Hapus' }))) return;
      const [k, id] = el.dataset.attOf.split(':');
      try { await api('DELETE', `/api/attachment/${el.dataset.attDel}`); toast('Lampiran dihapus'); } catch (e) { fail(e); }
      R().openRecord(k, Number(id));
      return;
    }
    if ((el = q('[data-bulk]'))) { const [k, a] = el.dataset.bulk.split(':'); runBulk(k, a); return; }
    if ((el = q('[data-bulk-clear]'))) { R().regState(el.dataset.bulkClear).selected = new Set(); R().loadRegister(el.dataset.bulkClear); return; }
    if ((el = q('[data-bulk-print]'))) { bulkPrint(el.dataset.bulkPrint); return; }
    if ((el = q('[data-import]'))) { openImport(el.dataset.import); return; }
    if ((el = q('[data-open-notif]'))) { openNotifications(el); return; }
    if (q('[data-open-assistant]')) { openAssistant(); return; }
    if ((el = q('[data-ask]'))) { ask(el.dataset.ask); return; }
    if (q('[data-dash-config]')) { openDashConfig(); return; }
    if (q('[data-mrp-pr]')) { mrpCreatePr(); return; }
    if ((el = q('[data-mrp-wo]'))) { const [bom, qty] = el.dataset.mrpWo.split(':').map(Number); R().openForm('work_orders', null, { bom_id: bom, qty }); return; }
    if ((el = q('[data-recon-open]'))) { state.reconId = Number(el.dataset.reconOpen); closeOverlay(); ERP.app.setView('rekonsiliasi'); return; }
    if (q('[data-recon-back]')) { state.reconId = null; ERP.app.renderView(); return; }
    if (q('[data-recon-all]')) { $$('[data-recon-line]').forEach((c) => { c.checked = true; }); reconRecalc(); return; }
    if (q('[data-recon-none]')) { $$('[data-recon-line]').forEach((c) => { c.checked = false; }); reconRecalc(); return; }
    if (q('[data-recon-save]')) { await reconSave().catch(() => {}); ERP.app.renderView(); return; }
    if ((el = q('[data-portal-tab]'))) { state.portalTab = el.dataset.portalTab; renderPortal(); return; }
    if ((el = q('[data-portal-doc]'))) { const [k, id] = el.dataset.portalDoc.split(':'); portalDoc(k, id); return; }
    if ((el = q('[data-quote-decide]'))) { quoteDecide(el); }
  }, true);

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.matches('[data-att-upload]')) uploadAttachment(t);
    if (t.matches('[data-recon-line]')) reconRecalc();
    if (t.matches('[data-partner-sel]')) { state.partnerSel[t.dataset.partnerSel] = t.value; loadPartner($('.view-root'), t.dataset.partnerSel); }
    if (t.matches('[data-row-check]')) {
      const key = t.closest('[data-register]').dataset.register;
      const st = R().regState(key);
      st.selected = st.selected || new Set();
      const id = Number(t.dataset.rowCheck);
      if (t.checked) st.selected.add(id); else st.selected.delete(id);
      renderBulkbar(key);
    }
    if (t.matches('[data-check-all]')) {
      const card = t.closest('[data-register]');
      const st = R().regState(card.dataset.register);
      st.selected = st.selected || new Set();
      $$('[data-row-check]', card).forEach((c) => { c.checked = t.checked; if (t.checked) st.selected.add(Number(c.dataset.rowCheck)); else st.selected.delete(Number(c.dataset.rowCheck)); });
      renderBulkbar(card.dataset.register);
    }
  });

  document.addEventListener('submit', (ev) => {
    if (ev.target.matches('[data-chat-form]')) { ev.preventDefault(); const i = ev.target.q; ask(i.value); i.value = ''; }
  });
  window.addEventListener('afterprint', () => document.body.classList.remove('printing'));

  // Sebelum aksi "Selesaikan" rekonsiliasi, simpan centang terbaru lalu jalankan aksinya.
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-action-run^="bank_reconciliations:"][data-action-run$=":finalize"]');
    if (!b || !$('[data-recon-line]')) return;
    ev.stopPropagation();
    ev.preventDefault();
    try { await reconSave(true); } catch { return; }
    const [k, id, a] = b.dataset.actionRun.split(':');
    await R().runAction(k, Number(id), a);
    ERP.app.renderView();
  }, true);

  ERP.more = { terbilang, printRecord, loadAttachments, renderBulkbar, bulkActions, openImport, loadNotifications, searchRecords, openAssistant, dashboard, analytics, bsc, mrp, recon, taxReport, partnerReport, bindFx, renderPortal };
})();
