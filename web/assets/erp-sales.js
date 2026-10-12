/* ==========================================================================
   Analisis penawaran: corong status, tingkat menang, waktu tanggapan
   pelanggan, kinerja tenaga penjual, alasan kalah, dan penawaran yang
   segera berakhir — untuk menindaklanjuti penawaran sebelum menjadi SO.
   ========================================================================== */
/* global ERP, FMT */
(() => {
  'use strict';
  const { esc, icon, api, qs, state, money, pill, num } = ERP;
  const R = () => ERP.records;
  const V = () => ERP.views;
  const kpi = (label, value, foot = '', tone = '') => `<div class="kpi-tile"><span class="kpi-label">${esc(label)}</span><span class="kpi-value ${tone}">${value}</span><span class="kpi-foot">${esc(foot)}</span></div>`;
  const card = (title, note, body) => `<article class="card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">${esc(title)}</h2>${note ? `<span class="card-note">${esc(note)}</span>` : ''}</div></div>${body}</article>`;
  const pct = (v) => (v == null ? '—' : `${num(v, 1)}%`);
  const REASON = { harga: 'Harga terlalu tinggi', waktu: 'Waktu penyerahan', spesifikasi: 'Spesifikasi tidak sesuai', pesaing: 'Memilih pesaing', anggaran: 'Anggaran pelanggan', ditunda: 'Proyek ditunda/batal', lainnya: 'Lainnya' };
  const TONE = { selesai: 'ok', diterima: 'ok', ditolak: 'danger', kedaluwarsa: 'danger', direvisi: 'neutral', batal: 'neutral', draf: 'neutral' };

  async function quoteReport(root) {
    const from = state.from || `${state.meta.today.slice(0, 4)}-01-01`, to = state.to || state.meta.today;
    const actions = `${R().ent('quotations')?.canWrite ? `<button class="btn btn-primary" data-new="quotations">${icon('plus')} Penawaran baru</button>` : ''}<button class="btn" data-nav="penawaran">${icon('quote')} Daftar penawaran</button><button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button>`;
    root.innerHTML = V().pageHead('Analisis Penawaran', 'Penawaran ke pelanggan sebelum pesanan penjualan.') + '<div class="loading-cell">Menghitung…</div>';
    let r;
    try { r = await api('GET', `/api/reports/penawaran${qs({ from, to })}`); } catch (e) { root.innerHTML = R().noAccess(); return; }
    const k = r.kpis;
    const maxV = Math.max(1, ...r.funnel.map((f) => f.value));
    root.innerHTML = V().pageHead('Analisis Penawaran', `${ERP.date(from)} – ${ERP.date(to)} (ubah periode di bilah konteks). Alur: draf → persetujuan harga → kirim → tanggapan pelanggan → pesanan penjualan.`, actions) +
      `<section class="kpi-grid-erp">
        ${kpi('Penawaran', String(k.count), `nilai ${FMT.rpCompact(k.value)} (DPP)`)}
        ${kpi('Menunggu pelanggan', String(k.open), FMT.rpCompact(k.openValue), k.open ? '' : 'pos')}
        ${kpi('Tingkat menang', esc(pct(k.winRate)), `nilai: ${pct(k.valueWinRate)}`, k.winRate >= 50 ? 'pos' : 'neg')}
        ${kpi('Diterima', String(k.won), FMT.rpCompact(k.wonValue), 'pos')}
        ${kpi('Menjadi SO', esc(pct(k.conversion)), 'dari penawaran diterima')}
        ${kpi('Waktu tanggapan', k.avgResponseDays == null ? '—' : `${esc(num(k.avgResponseDays, 1))} hari`, `margin rata-rata ${pct(k.avgMargin)}`)}
      </section>
      <div class="grid grid-2-1">
        ${card('Corong penawaran', 'jumlah & nilai per status', `<div class="pad-y">${r.funnel.map((f) => `<div class="funnel-row"><span>${pill(f.status)} <span class="muted">${esc(f.label)}</span></span><span class="funnel-bar" data-tone="${TONE[f.status] || ''}" style="width:${Math.max(1, f.value / maxV * 100).toFixed(1)}%"></span><span class="num">${f.n} · ${esc(FMT.rpCompact(f.value))}</span></div>`).join('')}</div>`)}
        ${card('Alasan kalah', 'penawaran ditolak pelanggan', `<div class="table-scroll"><table class="table tbl-sm"><tbody>${r.reasons.map((x) => `<tr><td>${esc(REASON[x.reason] || x.reason)}</td><td class="ta-r num">${x.n}</td></tr>`).join('') || '<tr><td class="muted">Belum ada penawaran ditolak.</td></tr>'}</tbody></table></div>`)}
      </div>
      <div class="grid grid-1-1">
        ${card('Kinerja tenaga penjual', '', `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Tenaga penjual</th><th class="ta-r">Penawaran</th><th class="ta-r">Nilai</th><th class="ta-r">Menang</th><th class="ta-r">Kalah</th><th class="ta-r">Terbuka</th><th class="ta-r">Tingkat menang</th></tr></thead><tbody>
          ${r.people.map((p) => `<tr><td>${esc(p.salesperson)}</td><td class="ta-r num">${p.n}</td><td class="ta-r">${money(p.value)}</td><td class="ta-r num pos">${p.won}</td><td class="ta-r num neg">${p.lost}</td><td class="ta-r num">${p.open}</td><td class="ta-r num">${esc(pct(p.winRate))}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Tidak ada data.</td></tr>'}</tbody></table></div>`)}
        ${card('Segera berakhir', 'disetujui/terkirim, berakhir ≤ 7 hari — tindak lanjuti atau revisi', `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Nomor</th><th>Pelanggan</th><th>Berlaku s.d.</th><th class="ta-r">Nilai</th></tr></thead><tbody>
          ${r.expiring.map((x) => `<tr data-open="quotations:${x.id}" tabindex="0"><td class="code">${esc(x.number)}</td><td>${esc(x.customer)}<span class="cell-sub">${esc(x.salesperson || '')}</span></td><td class="num neg">${esc(ERP.date(x.valid_until))}</td><td class="ta-r">${money(x.value)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Tidak ada penawaran yang segera berakhir.</td></tr>'}</tbody></table></div>`)}
      </div>
      <article class="card report-card"><div class="card-head"><div class="card-head-text"><h2 class="card-title">Penawaran periode ini</h2><span class="card-note">${r.rows.length} penawaran terbaru</span></div></div><div class="report-body"><div class="table-scroll"><table class="table report-table tbl-sm"><thead><tr><th>Nomor</th><th>Tanggal</th><th>Pelanggan</th><th>Tenaga penjual</th><th>Berlaku s.d.</th><th class="ta-r">Nilai (DPP)</th><th class="ta-r">Est. margin</th><th>Status</th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr data-open="quotations:${x.id}" tabindex="0"><td class="code">${esc(x.number)}</td><td class="num">${esc(ERP.date(x.date))}</td><td>${esc(x.customer)}</td><td>${esc(x.salesperson || '—')}</td><td class="num">${esc(ERP.date(x.valid_until))}</td><td class="ta-r">${money(x.value)}</td><td class="ta-r num ${x.est_margin < 15 ? 'neg' : ''}">${esc(pct(x.est_margin))}</td><td>${pill(x.status)}${x.lost_reason ? `<span class="cell-sub">${esc(REASON[x.lost_reason] || x.lost_reason)}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Belum ada penawaran.</td></tr>'}
      </tbody></table></div></div></article>`;
  }

  /* ======================================================================== */
  /* Surat jalan → faktur (satu atau beberapa DO)                             */
  /* ======================================================================== */
  const { $, $$, openModal, closeOverlay, toast, fail } = ERP;

  /** Dialog faktur dari surat jalan: pilih pelanggan, centang DO terkirim yang belum difakturkan. */
  async function openDoInvoice(customerId = null) {
    const m = openModal({
      title: 'Faktur dari surat jalan', note: 'Satu faktur dapat memuat satu atau beberapa surat jalan pelanggan yang sama (mata uang & PPN sama). Piutang diakui saat faktur diterbitkan.', wide: true,
      body: `<form class="form-grid" data-doinv-form>
        <div class="field"><label>Pelanggan</label><select class="select" name="customer" data-ref="customers" data-ref-filter="{}" data-value="${esc(customerId || '')}"><option value="">Memuat…</option></select></div>
        <div class="field"><label>Tanggal faktur</label><input class="input num" type="date" name="date" value="${esc(state.meta.today)}"></div>
        <div class="form-grid-full" data-doinv-list><p class="muted">Pilih pelanggan untuk menampilkan surat jalan yang belum difakturkan.</p></div>
      </form>`,
      foot: `<button class="btn btn-primary" data-doinv-run>${icon('invoice')} Buat faktur</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" data-close>Batal</button>`,
    });
    await ERP.forms.hydrateRefs($('[data-doinv-form]', m));
    const sel = $('[name=customer]', m);
    sel.addEventListener('change', () => loadDoList(sel.value));
    if (sel.value) loadDoList(sel.value);
  }
  async function loadDoList(customerId) {
    const box = $('[data-doinv-list]');
    if (!box) return;
    if (!customerId) { box.innerHTML = '<p class="muted">Pilih pelanggan.</p>'; return; }
    let rows;
    try { rows = await api('GET', `/api/deliveries/uninvoiced${qs({ customer: customerId })}`); } catch (e) { box.innerHTML = `<p class="neg">${esc(e.message)}</p>`; return; }
    box.innerHTML = rows.length ? `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th class="col-check"><input type="checkbox" data-doinv-all checked aria-label="Pilih semua"></th><th>Surat jalan</th><th>Tanggal kirim</th><th>Pesanan</th><th>Gudang</th><th class="ta-r">Nilai (DPP)</th></tr></thead><tbody>
      ${rows.map((d) => `<tr><td class="col-check"><input type="checkbox" data-doinv-id="${d.id}" data-val="${d.value}" checked aria-label="Pilih ${esc(d.number)}"></td><td class="code">${esc(d.number)}</td><td class="num">${esc(ERP.date(d.date))}</td><td class="code">${esc(d.so_number)}</td><td>${esc(d.warehouse)}</td><td class="ta-r">${money(d.value)}</td></tr>`).join('')}
      </tbody></table></div><p class="field-hint" data-doinv-sum></p>` : '<p class="muted">Tidak ada surat jalan terkirim yang belum difakturkan untuk pelanggan ini.</p>';
    doSum();
  }
  function doSum() {
    const c = $$('[data-doinv-id]:checked');
    const el = $('[data-doinv-sum]');
    if (el) el.textContent = `${c.length} surat jalan dipilih · DPP ${FMT.rp(c.reduce((t, x) => t + Number(x.dataset.val), 0))} (sebelum PPN)`;
  }
  async function runDoInvoice() {
    const ids = $$('[data-doinv-id]:checked').map((c) => Number(c.dataset.doinvId));
    if (!ids.length) return toast('Pilih surat jalan', 'Centang minimal satu surat jalan.', 'warn');
    const date = $('[data-doinv-form] [name=date]').value;
    try {
      const r = await api('POST', '/api/deliveries/invoice', { delivery_ids: ids, date });
      closeOverlay();
      toast('Faktur dibuat (draf)', `${r.number} dari ${r.deliveries} surat jalan. Terbitkan untuk mengakui piutang.`);
      R().openRecord('sales_invoices', r.id);
    } catch (e) { fail(e); }
  }

  /** Rincian pemenuhan di laci pesanan penjualan: dipesan, terkirim, difakturkan per baris & daftar surat jalan. */
  async function soDrawer(so) {
    if (!R().ent('delivery_orders') || ['draf', 'menunggu', 'batal'].includes(so.status)) return '';
    let dos;
    try { dos = (await api('GET', `/api/e/delivery_orders${qs({ f_sales_order_id: so.id, size: 50, sort: 'date' })}`)).rows; } catch { return ''; }
    return `<div class="section"><span class="section-title">Pengiriman & penagihan</span>
      ${dos.length ? `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Surat jalan</th><th>Tanggal</th><th class="ta-r">Nilai</th><th>Faktur</th><th>Status</th></tr></thead><tbody>
        ${dos.map((d) => `<tr data-open="delivery_orders:${d.id}" tabindex="0"><td class="code">${esc(d.number)}</td><td class="num">${esc(ERP.date(d.date))}</td><td class="ta-r">${money(d.value)}</td><td class="code">${esc(d.invoice_id__label || '—')}</td><td>${pill(d.status)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Belum ada surat jalan.</p>'}
      <p class="field-hint">Terkirim ${esc(num(so.delivered_pct ?? 0, 1))}% dari qty pesanan. Piutang diakui saat faktur dari surat jalan diterbitkan.</p></div>`;
  }

  /* ======================================================================== */
  /* Pemenuhan pesanan                                                        */
  /* ======================================================================== */
  async function fulfillment(root) {
    const to = state.to || state.meta.today;
    const canInv = R().ent('sales_invoices')?.canWrite;
    const actions = `${canInv ? `<button class="btn btn-primary" data-do-invoice>${icon('invoice')} Faktur dari surat jalan</button>` : ''}<button class="btn" data-nav="surat-jalan">${icon('truck')} Surat jalan</button><button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button>`;
    root.innerHTML = V().pageHead('Pemenuhan Pesanan', '') + '<div class="loading-cell">Menghitung…</div>';
    let r;
    try { r = await api('GET', `/api/reports/pemenuhan${qs({ to })}`); } catch (e) { root.innerHTML = R().noAccess(); return; }
    const t = r.totals;
    root.innerHTML = V().pageHead('Pemenuhan Pesanan', `Per ${ERP.date(r.asOf)} — pesanan penjualan → surat jalan (stok keluar) → faktur (piutang diakui).`, actions) +
      `<section class="kpi-grid-erp">
        ${kpi('Pesanan terbuka', String(t.openOrders), `sisa kirim ${FMT.rpCompact(t.backlogValue)}`)}
        ${kpi('Baris terlambat', String(t.lateLines), 'lewat tanggal kirim', t.lateLines ? 'neg' : 'pos')}
        ${kpi('DO belum difakturkan', String(t.unbilledCount), `nilai jual ${FMT.rpCompact(t.unbilledValue)}`, t.unbilledCount ? '' : 'pos')}
        ${kpi('Nilai pokok terkirim', esc(FMT.rpCompact(t.unbilledCost)), `${t.draftInvoiced} sudah ada faktur draf · ${t.over30} > 30 hari`, t.over30 ? 'neg' : '')}
      </section>
      <div class="notice" data-tone="${r.reconciled ? 'ok' : 'danger'}">${icon(r.reconciled ? 'check' : 'alert')} ${esc(r.reconciled ? `Nilai pokok surat jalan belum difakturkan cocok dengan saldo akun Persediaan Terkirim Belum Difakturkan (${FMT.rp(r.glBalance)}).` : `Tidak cocok: surat jalan ${FMT.rp(t.unbilledCost)} vs buku besar ${FMT.rp(r.glBalance)}.`)}</div>
      ${card('Surat jalan terkirim, belum difakturkan', 'buat faktur per surat jalan atau gabungkan beberapa surat jalan pelanggan yang sama', `<div class="report-body"><div class="table-scroll"><table class="table report-table tbl-sm"><thead><tr><th>Surat jalan</th><th>Tanggal kirim</th><th>Pelanggan</th><th>Pesanan</th><th class="ta-r">Umur (hari)</th><th class="ta-r">Nilai jual</th><th class="ta-r">Nilai pokok</th><th>Faktur</th><th></th></tr></thead><tbody>
        ${r.unbilled.map((d) => `<tr><td class="code"><button class="link" data-open="delivery_orders:${d.id}">${esc(d.number)}</button></td><td class="num">${esc(ERP.date(d.date))}</td><td>${esc(d.customer)}</td><td class="code">${esc(d.so_number)}</td><td class="ta-r num ${d.age > 30 ? 'neg' : ''}">${d.age}</td><td class="ta-r">${money(d.valueIdr)}</td><td class="ta-r">${money(d.cost)}</td><td>${d.invoice_number ? `<span class="code">${esc(d.invoice_number)}</span> <span class="muted">(draf)</span>` : '—'}</td><td>${!d.invoice_id && canInv ? `<button class="btn btn-sm" data-do-invoice="${d.id}">Fakturkan</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Semua surat jalan sudah difakturkan.</td></tr>'}
        </tbody><tfoot><tr class="row-total"><td colspan="5">Total</td><td class="ta-r">${money(t.unbilledValue)}</td><td class="ta-r">${money(t.unbilledCost)}</td><td colspan="2"></td></tr></tfoot></table></div></div>`)}
      ${card('Pesanan terbuka per baris', 'dipesan → terkirim → difakturkan', `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Pesanan</th><th>Pelanggan</th><th>Barang</th><th class="ta-r">Dipesan</th><th class="ta-r">Terkirim</th><th class="ta-r">Difakturkan</th><th class="ta-r">Sisa kirim</th><th class="ta-r">Nilai sisa</th><th>Status</th></tr></thead><tbody>
        ${r.orders.map((l) => `<tr data-open="sales_orders:${l.so_id}" tabindex="0" class="${l.late ? 'row-attn' : ''}"><td class="code">${esc(l.number)}<span class="cell-sub">kirim ${esc(ERP.date(l.delivery_date))}${l.late ? ' · terlambat' : ''}</span></td><td>${esc(l.customer)}</td><td><span class="code">${esc(l.code)}</span> ${esc(l.product)}</td><td class="ta-r num">${esc(num(l.ordered))}</td><td class="ta-r num">${esc(num(l.delivered))}</td><td class="ta-r num">${esc(num(l.invoiced))}</td><td class="ta-r num ${l.toDeliver > 0 ? 'neg' : ''}">${esc(num(l.toDeliver))}</td><td class="ta-r">${money(l.backlogValue)}</td><td>${pill(l.status)}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Tidak ada pesanan terbuka.</td></tr>'}
      </tbody></table></div>`)}`;
  }

  document.addEventListener('click', async (ev) => {
    const q = (sel) => ev.target.closest(sel);
    let el;
    if ((el = q('[data-do-invoice]'))) {
      ev.preventDefault();
      let cust = null;
      if (el.dataset.doInvoice) { try { cust = (await api('GET', `/api/e/delivery_orders/${el.dataset.doInvoice}`)).customer_id; } catch { /* abaikan */ } }
      openDoInvoice(cust);
      return;
    }
    if (q('[data-doinv-run]')) { runDoInvoice(); }
  });
  document.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-doinv-all]')) { $$('[data-doinv-id]').forEach((c) => { c.checked = ev.target.checked; }); doSum(); }
    if (ev.target.matches('[data-doinv-id]')) doSum();
  });

  /* ======================================================================== */
  /* Pembayaran bertahap                                                      */
  /* ======================================================================== */
  const MODE = { pelunasan: 'Pelunasan', uang_muka: 'Uang muka', pakai_uang_muka: 'Pakai uang muka', pakai_deposit: 'Pakai deposit' };

  /** Laci faktur/tagihan: jadwal angsuran, riwayat pembayaran (termasuk potongan), saldo uang muka mitra. */
  async function settlementDrawer(key, r) {
    if (['draf', 'batal'].includes(r.status)) return '';
    let s;
    try { s = await api('GET', `/api/settlement/${key}/${r.id}`); } catch { return ''; }
    const ar = ['sales_invoices', 'customer_debit_notes', 'sales_advances'].includes(key);
    const isAdv = ['sales_advances', 'purchase_advances'].includes(key);
    const act = (r.__actions || []).find((a) => a.name === (ar ? 'receive' : 'pay'));
    // Uang muka: pemotongan DPP pada faktur/tagihan akhir.
    const apps = isAdv ? `<div class="section"><span class="section-title">Pemotongan pada ${ar ? 'faktur' : 'tagihan'} akhir</span>
      ${s.applications.length ? `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>${ar ? 'Faktur' : 'Tagihan'}</th><th>Tanggal</th><th class="ta-r">DPP dokumen</th><th class="ta-r">Potongan uang muka</th><th class="ta-r">Total ditagih</th><th>Status</th></tr></thead><tbody>
        ${s.applications.map((x) => `<tr data-open="${x.entity}:${x.id}" tabindex="0"><td class="code">${esc(x.number)}</td><td class="num">${esc(ERP.date(x.date))}</td><td class="ta-r">${money(x.subtotal)}</td><td class="ta-r">${/_returns$/.test(x.entity) ? `<span class="pos">${money(-x.advance_amount)} dipulihkan</span>` : money(x.advance_amount)}</td><td class="ta-r">${money(x.total)}</td><td>${/_returns$/.test(x.entity) ? 'Retur' : pill(x.status)}</td></tr>`).join('')}
      </tbody><tfoot><tr class="row-total"><td colspan="3">Sisa DPP belum dipotong</td><td class="ta-r">${money((r.amount || 0) - (r.applied || 0))}</td><td colspan="2"></td></tr></tfoot></table></div>`
      : `<p class="muted">${r.status === 'lunas' ? `Siap dipotong — pilih uang muka ini pada ${ar ? 'faktur' : 'tagihan'} (otomatis saat dibuat dari ${ar ? 'surat jalan/SO' : 'PO'}).` : `Dapat dipotong setelah uang muka lunas.`}</p>`}</div>` : '';
    return `<div class="section"><span class="section-title">Jadwal angsuran & pembayaran</span>
      <div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Tahap</th><th>Jatuh tempo</th><th class="ta-r">Jumlah</th><th class="ta-r">Dibayar</th><th class="ta-r">Sisa</th><th>Status</th></tr></thead><tbody>
        ${s.installments.map((i) => `<tr><td>${esc(i.label)}</td><td class="num ${i.status === 'terlambat' ? 'neg' : ''}">${esc(ERP.date(i.due_date))}</td><td class="ta-r">${money(i.amount)}</td><td class="ta-r">${money(i.paid)}</td><td class="ta-r">${money(i.open)}</td><td>${pill(i.status)}</td></tr>`).join('')}
      </tbody><tfoot><tr class="row-total"><td colspan="4">Sisa ${isAdv ? 'tagihan uang muka' : ar ? 'faktur' : 'tagihan'}</td><td class="ta-r">${money(s.open)}</td><td></td></tr></tfoot></table></div>
      ${s.payments.length || s.credits.length ? `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>${ar ? 'Penerimaan' : 'Pembayaran'}</th><th>Tanggal</th><th>Jenis</th><th class="ta-r">Kas/uang muka</th><th class="ta-r">Potongan</th><th class="ta-r">PPh 23</th><th class="ta-r">Melunasi</th><th>Status</th></tr></thead><tbody>
        ${s.payments.map((p) => `<tr data-open="${p.entity}:${p.id}" tabindex="0"><td class="code">${esc(p.number)}</td><td class="num">${esc(ERP.date(p.date))}</td><td>${esc(MODE[p.mode] || 'Pelunasan')}</td><td class="ta-r">${money(p.amount)}</td><td class="ta-r">${p.discount ? money(p.discount) : ''}</td><td class="ta-r">${p.pph23 ? money(p.pph23) : ''}</td><td class="ta-r">${money(p.settled)}</td><td>${pill(p.status)}</td></tr>`).join('')}
        ${s.credits.map((c) => `<tr data-open="${c.entity}:${c.id}" tabindex="0"><td class="code">${esc(c.number)}</td><td class="num">${esc(ERP.date(c.date))}</td><td>${esc({ sales_returns: 'Retur penjualan', purchase_returns: 'Retur pembelian', customer_credit_notes: 'Nota kredit', supplier_debit_notes: 'Nota debet' }[c.entity] || 'Pengurang')}</td><td></td><td></td><td></td><td class="ta-r">${money(c.settled)}</td><td>${pill('diposting')}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Belum ada pembayaran.</p>'}
      <p class="field-hint">Saldo uang muka ${ar ? 'pelanggan' : 'ke pemasok'}: <b>${esc(FMT.rp(s.advance))}</b>${s.advance > 0 && s.open > 0 ? ' — dapat dipakai melunasi (sumber dana "Saldo uang muka").' : ''}</p>
      ${act && s.open > 0 ? `<button class="btn btn-sm btn-primary" data-action-run="${key}:${r.id}:${act.name}">${icon('wallet')} ${esc(act.label)} (penuh / sebagian)</button>` : ''}</div>${apps}`;
  }

  /** Jadwal angsuran piutang/hutang: terlambat, jatuh tempo 7/30 hari, saldo uang muka. */
  async function schedule(root, side) {
    const ar = side === 'ar';
    const st = (state.schedDays = state.schedDays || {});
    const days = st[side] || 60;
    const to = state.to || state.meta.today;
    const title = ar ? 'Jadwal Angsuran Piutang' : 'Jadwal Angsuran Hutang';
    root.innerHTML = V().pageHead(title, '') + '<div class="loading-cell">Menghitung…</div>';
    let r;
    try { r = await api('GET', `/api/reports/angsuran${qs({ side, days, to })}`); } catch (e) { root.innerHTML = R().noAccess(); return; }
    const t = r.totals;
    const docKey = ar ? 'sales_invoices' : 'purchase_bills';
    const canPay = R().ent(docKey) && (state.me.permissions[ar ? 'sales' : 'purchasing'] || 0) >= (ar ? 3 : 2);
    root.innerHTML = V().pageHead(title, `Per ${ERP.date(r.asOf)} — angsuran terbuka jatuh tempo s.d. ${ERP.date(r.until)} dari termin bertahap ${ar ? 'faktur' : 'tagihan'}. Bayar penuh atau sebagian; pembayaran dialokasikan ke angsuran tertua.`,
      `<label class="ctx-inline">Rentang <select class="select" data-sched-days="${side}">${[30, 60, 90, 180, 365].map((d) => `<option value="${d}" ${d === days ? 'selected' : ''}>${d} hari</option>`).join('')}</select></label>
      <button class="btn" data-nav="${ar ? 'umur-piutang' : 'umur-hutang'}">${icon('clock')} Umur ${ar ? 'piutang' : 'hutang'}</button><button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button>`) +
      `<section class="kpi-grid-erp">
        ${kpi('Terlambat', esc(FMT.rpCompact(t.overdue)), 'angsuran lewat jatuh tempo', t.overdue ? 'neg' : 'pos')}
        ${kpi('Jatuh tempo 7 hari', esc(FMT.rpCompact(t.next7)), ar ? 'perkiraan kas masuk' : 'perkiraan kas keluar')}
        ${kpi('Jatuh tempo 30 hari', esc(FMT.rpCompact(t.next30)), '')}
        ${kpi('Dokumen bertahap', String(t.staged), 'lebih dari satu angsuran terbuka')}
        ${kpi(ar ? 'Uang muka pelanggan' : 'Uang muka ke pemasok', esc(FMT.rpCompact(r.advanceTotal)), `${r.advances.length} mitra · belum dipakai`)}
      </section>
      <article class="card report-card"><div class="report-body"><div class="table-scroll"><table class="table report-table tbl-sm"><thead><tr><th>Jatuh tempo</th><th>${ar ? 'Faktur' : 'Tagihan'}</th><th>${ar ? 'Pelanggan' : 'Pemasok'}</th><th>Tahap</th><th class="ta-r">Jumlah (IDR)</th><th class="ta-r">Dibayar</th><th class="ta-r">Sisa (IDR)</th><th>Status</th><th></th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr class="${x.status === 'terlambat' ? 'row-attn' : ''}"><td class="num ${x.status === 'terlambat' ? 'neg' : ''}">${esc(ERP.date(x.due_date))}${x.overdueDays ? `<span class="cell-sub">${x.overdueDays} hari lewat</span>` : ''}</td><td class="code"><button class="link" data-open="${x.entity || docKey}:${x.doc_id}">${esc(x.number)}</button></td><td>${esc(x.party)}</td><td>${esc(x.label)}${x.stages > 1 ? `<span class="cell-sub">tahap ${x.seq}/${x.stages}</span>` : ''}</td><td class="ta-r">${money(x.amountIdr)}${x.rate !== 1 ? `<span class="cell-sub">valas × ${esc(num(x.rate))}</span>` : ''}</td><td class="ta-r">${x.paid ? money(x.paidIdr) : ''}</td><td class="ta-r">${money(x.openIdr)}</td><td>${pill(x.status)}</td><td>${canPay ? `<button class="btn btn-sm" data-action-run="${x.entity || docKey}:${x.doc_id}:${ar ? 'receive' : 'pay'}">${ar ? 'Terima' : 'Bayar'}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Tidak ada angsuran terbuka pada rentang ini.</td></tr>'}
      </tbody><tfoot><tr class="row-total"><td colspan="6">Total</td><td class="ta-r">${money(t.all)}</td><td colspan="2"></td></tr></tfoot></table></div></div></article>
      ${r.advances.length ? card(ar ? 'Saldo uang muka pelanggan' : 'Saldo uang muka ke pemasok', 'dapat dipakai melunasi faktur/tagihan berikutnya', `<div class="table-scroll"><table class="table tbl-sm"><tbody>${r.advances.map((a) => `<tr><td>${esc(a.party)}</td><td class="ta-r">${money(a.balance)}</td></tr>`).join('')}</tbody></table></div>`) : ''}`;
  }
  document.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-sched-days]')) { (state.schedDays = state.schedDays || {})[ev.target.dataset.schedDays] = Number(ev.target.value); ERP.app.renderView(); }
  });

  /* ======================================================================== */
  /* Giro mundur                                                               */
  /* ======================================================================== */
  const GIRO_STATE = { beredar: ['Belum cair', 'accent'], segera: ['Jatuh tempo ≤ 7 hari', 'warn'], lewat: ['Lewat tanggal efektif', 'danger'], cair: ['Cair', 'ok'], tolak: ['Ditolak / batal', 'danger'] };
  async function giro(root) {
    state.giroSide = state.giroSide || (state.me.permissions.sales ? 'in' : 'out');
    const side = state.giroSide;
    const table = side === 'in' ? 'customer_receipts' : 'supplier_payments';
    const to = state.to || state.meta.today;
    const head = (sub, tools = '') => V().pageHead('Giro Mundur', sub, tools);
    const tabs = `<div class="segmented" role="group" aria-label="Arah giro"><button data-giro-side="in" aria-pressed="${side === 'in'}">Giro masuk (pelanggan)</button><button data-giro-side="out" aria-pressed="${side === 'out'}">Giro keluar (pemasok)</button></div>`;
    root.innerHTML = head('') + '<div class="loading-cell">Memuat…</div>';
    let r;
    try { r = await api('GET', `/api/reports/giro${qs({ side, to })}`); } catch (e) { root.innerHTML = head('Register bilyet giro / cek mundur.', tabs) + `<p class="pad neg">${esc(e.message)}</p>`; return; }
    const t = r.totals;
    const canAct = (state.me.permissions[side === 'in' ? 'sales' : 'purchasing'] || 0) >= 3;
    root.innerHTML = head(side === 'in'
      ? 'Giro/cek mundur dari pelanggan: faktur dilunasi saat giro diterima (akun Giro Diterima Belum Cair); kas bertambah saat giro cair; giro ditolak membuka kembali faktur.'
      : 'Giro/cek mundur ke pemasok: tagihan dilunasi saat giro diserahkan (Giro Diberikan Belum Cair); kas berkurang saat giro cair di bank.', `${tabs}<button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button>`) +
      `<section class="kpi-grid-erp">
        ${kpi('Belum cair', esc(FMT.rpCompact(t.open)), `${t.openCount} lembar`)}
        ${kpi('Efektif ≤ 7 hari', esc(FMT.rpCompact(t.due7)), side === 'in' ? 'setor kliring' : 'siapkan saldo rekening', t.due7 ? 'neg' : '')}
        ${kpi('Lewat tanggal efektif', esc(FMT.rpCompact(t.overdue)), 'belum dicatat cair/ditolak', t.overdue ? 'neg' : 'pos')}
        ${kpi('Cair (90 hari)', esc(FMT.rpCompact(t.cleared)), '', 'pos')}
        ${kpi('Ditolak / batal', esc(FMT.rpCompact(t.bounced)), `${t.bouncedCount} lembar (90 hari)`, t.bouncedCount ? 'neg' : '')}
      </section>
      <div class="notice" data-tone="${r.reconciled ? 'ok' : 'danger'}">${icon(r.reconciled ? 'check' : 'alert')} ${esc(r.reconciled ? `Giro belum cair cocok dengan saldo akun giro mundur ${side === 'in' ? 'diterima' : 'diberikan'} pada rekening kas/bank (${FMT.rp(r.glBalance)}).` : `Tidak cocok: register ${FMT.rp(t.open)} vs buku besar ${FMT.rp(r.glBalance)}.`)}</div>
      <article class="card report-card"><div class="report-body"><div class="table-scroll"><table class="table report-table tbl-sm"><thead><tr><th>Tanggal efektif</th><th>No. giro</th><th>Bank penerbit</th><th>${side === 'in' ? 'Pelanggan' : 'Pemasok'}</th><th>Dokumen</th><th>Diterima/diserahkan</th><th class="ta-r">Nilai</th><th>Status</th><th></th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr class="${x.state === 'lewat' ? 'row-attn' : ''}"><td class="num ${x.state === 'lewat' ? 'neg' : ''}">${esc(ERP.date(x.giro_due))}${x.giro_status === 'beredar' ? `<span class="cell-sub">${x.daysToDue >= 0 ? `${x.daysToDue} hari lagi` : `${-x.daysToDue} hari lewat`}</span>` : x.giro_cleared ? `<span class="cell-sub">${esc(ERP.date(x.giro_cleared))}</span>` : ''}</td>
          <td class="code">${esc(x.giro_no)}</td><td>${esc(x.giro_bank || '—')}</td><td>${esc(x.party)}</td><td class="code"><button class="link" data-open="${table}:${x.id}">${esc(x.number)}</button></td><td class="num">${esc(ERP.date(x.date))}</td><td class="ta-r">${money(x.amount)}</td>
          <td><span class="pill" data-tone="${GIRO_STATE[x.state]?.[1] || 'neutral'}"><i class="pill-dot"></i>${esc(GIRO_STATE[x.state]?.[0] || x.state)}</span></td>
          <td>${x.giro_status === 'beredar' && canAct ? `<button class="btn btn-sm" data-action-run="${table}:${x.id}:giro_clear">Cair</button> <button class="btn btn-sm btn-danger-ghost" data-action-run="${table}:${x.id}:giro_bounce">Ditolak</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Belum ada giro.</td></tr>'}
      </tbody></table></div></div></article>
      <p class="field-hint">Terima giro dari faktur (Terima pembayaran → sumber dana "Giro / cek mundur") atau buat Penerimaan dengan cara bayar giro. Giro keluar dibuat dari tagihan (Ajukan pembayaran → giro) dan disetujui penyetuju lain.</p>`;
  }
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-giro-side]');
    if (el) { state.giroSide = el.dataset.giroSide; ERP.app.renderView(); }
  });

  /* ======================================================================== */
  /* Register uang muka penjualan / pembelian                                 */
  /* ======================================================================== */
  const ADV_STATE = { terbit: ['Belum dibayar', 'warn'], sebagian: ['Dibayar sebagian', 'warn'], lunas: ['Siap dipotong', 'accent'], diterapkan: ['Habis dipotong', 'ok'] };
  async function advances(root) {
    state.advSide = state.advSide || (state.me.permissions.sales ? 'ar' : 'ap');
    const side = state.advSide, ar = side === 'ar';
    const table = ar ? 'sales_advances' : 'purchase_advances';
    const head = (sub, tools = '') => V().pageHead('Register Uang Muka', sub, tools);
    const tabs = `<div class="segmented" role="group" aria-label="Jenis uang muka"><button data-adv-side="ar" aria-pressed="${ar}">Penjualan (dari pelanggan)</button><button data-adv-side="ap" aria-pressed="${!ar}">Pembelian (ke pemasok)</button></div>`;
    root.innerHTML = head('') + '<div class="loading-cell">Memuat…</div>';
    let r;
    try { r = await api('GET', `/api/reports/uang-muka${qs({ side })}`); } catch (e) { root.innerHTML = head('Faktur uang muka atas pesanan.', tabs) + `<p class="pad neg">${esc(e.message)}</p>`; return; }
    const t = r.totals;
    const canPay = R().ent(table) && (state.me.permissions[ar ? 'sales' : 'purchasing'] || 0) >= (ar ? 3 : 2);
    const canNew = R().ent(table)?.canWrite;
    root.innerHTML = head(ar
      ? 'Faktur uang muka atas pesanan penjualan: PPN keluaran terutang saat uang muka ditagih; setelah lunas, DPP uang muka dipotongkan pada faktur akhir (PPN akhir hanya atas sisa DPP).'
      : 'Uang muka atas pesanan pembelian: PPN masukan dari faktur uang muka pemasok; setelah dibayar (dengan persetujuan), DPP-nya dipotongkan pada tagihan saat barang diterima.',
    `${tabs}${canNew ? `<button class="btn btn-primary" data-nav="${ar ? 'pesanan-penjualan' : 'pesanan-pembelian'}">${icon('plus')} Buat dari ${ar ? 'SO' : 'PO'}</button>` : ''}<button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button>`) +
      `<section class="kpi-grid-erp">
        ${kpi('Belum dibayar', esc(FMT.rpCompact(t.unpaid)), `${t.unpaidCount} dokumen · ${ar ? 'tagih pelanggan' : 'ajukan pembayaran'}`, t.unpaidCount ? 'neg' : '')}
        ${kpi('Siap dipotong', esc(FMT.rpCompact(t.ready)), `${t.readyCount} dokumen lunas`)}
        ${kpi('Sisa DPP belum dipotong', esc(FMT.rpCompact(t.remaining)), `akun ${r.accounts}`)}
        ${kpi('Sudah dipotong', esc(FMT.rpCompact(t.applied)), `pada ${ar ? 'faktur' : 'tagihan'} akhir`, 'pos')}
      </section>
      <div class="notice" data-tone="${r.reconciled ? 'ok' : 'danger'}">${icon(r.reconciled ? 'check' : 'alert')} ${esc(r.reconciled ? `Sisa uang muka cocok dengan saldo akun uang muka ${ar ? 'penjualan' : 'pembelian'} ${r.accounts} (${FMT.rp(r.glBalance)}).` : `Tidak cocok: register ${FMT.rp(t.remaining)} vs buku besar ${FMT.rp(r.glBalance)}.`)}</div>
      <article class="card report-card"><div class="report-body"><div class="table-scroll"><table class="table report-table tbl-sm"><thead><tr><th>Uang muka</th><th>${ar ? 'Pelanggan' : 'Pemasok'}</th><th>Pesanan</th><th class="ta-r">DPP</th><th class="ta-r">Total + PPN</th><th class="ta-r">Dipotong</th><th class="ta-r">Sisa DPP</th><th>Status</th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr><td class="code"><button class="link" data-open="${table}:${x.id}">${esc(x.number)}</button><span class="cell-sub">${esc(ERP.date(x.date))}</span></td><td>${esc(x.party)}</td>
          <td class="code"><button class="link" data-open="${ar ? 'sales_orders' : 'purchase_orders'}:${x.order_id}">${esc(x.order_no)}</button>${x.pct != null ? `<span class="cell-sub">${esc(num(x.pct))}% dari DPP ${money(x.order_dpp)}</span>` : ''}</td>
          <td class="ta-r">${money(x.amount)}</td><td class="ta-r">${money(x.total)}${x.paid > 0 && x.paid < x.total - 0.005 ? `<span class="cell-sub">dibayar ${money(x.paid)}</span>` : ''}</td><td class="ta-r">${x.applied ? money(x.applied) : ''}</td><td class="ta-r">${money(x.remaining)}</td>
          <td><span class="pill" data-tone="${ADV_STATE[x.status]?.[1] || 'neutral'}"><i class="pill-dot"></i>${esc(ADV_STATE[x.status]?.[0] || x.status)}</span>${['terbit', 'sebagian'].includes(x.status) && canPay ? ` <button class="btn btn-sm" data-action-run="${table}:${x.id}:${ar ? 'receive' : 'pay'}">${ar ? 'Terima' : 'Bayar'}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Belum ada uang muka.</td></tr>'}
      </tbody><tfoot><tr class="row-total"><td colspan="6">Total sisa DPP</td><td class="ta-r">${money(t.remaining)}</td><td></td></tr></tfoot></table></div></div></article>
      <p class="field-hint">Buat dari ${ar ? 'pesanan penjualan' : 'pesanan pembelian'}: aksi <b>Buat uang muka (DP)</b> (persentase atau nilai). ${ar ? 'Faktur dari surat jalan/SO' : 'Tagihan dari PO'} otomatis memotong uang muka lunas secara proporsional; ${ar ? 'faktur' : 'tagihan'} terakhir memotong seluruh sisa. Titipan tanpa faktur pajak tetap dicatat lewat ${ar ? 'Penerimaan' : 'Pembayaran'} jenis "titipan / uang muka tanpa faktur".</p>`;
  }
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-adv-side]');
    if (el) { state.advSide = el.dataset.advSide; ERP.app.renderView(); }
  });

  /* ======================================================================== */
  /* Deposit pelanggan                                                        */
  /* ======================================================================== */
  const DEP_KIND = { saldo: 'Saldo prabayar', jaminan: 'Uang jaminan' };
  /** Laci deposit: saldo, pemakaian melunasi faktur/tagihan, pengembalian & pencairan. */
  async function depositDrawer(key, r) {
    if (['draf', 'menunggu', 'ditolak', 'batal'].includes(r.status)) return '';
    const ar = key === 'customer_deposits';
    let h;
    try { h = await api('GET', `/api/deposit-history/${key}/${r.id}`); } catch { return ''; }
    const rows = [
      ...h.receipts.map((x) => `<tr data-open="${x.entity}:${x.id}" tabindex="0"><td class="code">${esc(x.number)}</td><td class="num">${esc(ERP.date(x.date))}</td><td>${ar ? 'Melunasi' : 'Membayar'} ${esc(x.docs || '—')}</td><td class="ta-r">${money(x.amount)}</td><td>${pill(x.status)}</td></tr>`),
      ...h.journals.map((x) => `<tr data-open="${x.entity}:${x.id}" tabindex="0"><td class="code">${esc(x.number)}</td><td class="num">${esc(ERP.date(x.date))}</td><td>${esc(/^Pencairan/.test(x.description) ? 'Dicairkan (kompensasi)' : /^Jaminan hangus/.test(x.description) ? 'Hangus (dibebankan)' : ar ? 'Dikembalikan ke pelanggan' : 'Diterima kembali dari pemasok')}</td><td class="ta-r">${money(x.amount)}</td><td>${pill('diposting')}</td></tr>`),
    ];
    return `<div class="section"><span class="section-title">Riwayat deposit</span>
      ${rows.length ? `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Dokumen</th><th>Tanggal</th><th>Keterangan</th><th class="ta-r">Jumlah</th><th>Status</th></tr></thead><tbody>${rows.join('')}</tbody>
        <tfoot><tr class="row-total"><td colspan="3">Saldo deposit</td><td class="ta-r">${money(h.remaining)}</td><td></td></tr></tfoot></table></div>`
        : `<p class="muted">Belum dipakai. Saldo ${esc(FMT.rp(h.remaining))}.</p>`}
      <p class="field-hint">${r.kind === 'jaminan'
        ? (ar ? 'Uang jaminan dikembalikan saat kontrak berakhir; dapat dikompensasikan ke faktur terbuka atau dicairkan sebagai ganti rugi.' : 'Uang jaminan ditagih kembali saat kontrak berakhir; dapat dipakai membayar tagihan pemasok atau dihanguskan bila dipotong pemasok.')
        : (ar ? 'Pakai melunasi faktur dari sini, atau dari faktur → Terima pembayaran → sumber dana "Deposit pelanggan".' : 'Pakai membayar tagihan dari sini, atau dari tagihan → Ajukan pembayaran → sumber dana "Deposit di pemasok" (disetujui orang lain).')}</p></div>`;
  }

  async function deposits(root) {
    state.depSide = state.depSide || (state.me.permissions.sales ? 'ar' : 'ap');
    const side = state.depSide, ar = side === 'ar';
    const table = ar ? 'customer_deposits' : 'supplier_deposits';
    const head = (sub, tools = '') => V().pageHead('Register Deposit', sub, tools);
    const tabs = `<div class="segmented" role="group" aria-label="Jenis deposit"><button data-dep-side="ar" aria-pressed="${ar}">Deposit pelanggan</button><button data-dep-side="ap" aria-pressed="${!ar}">Deposit di pemasok</button></div>`;
    root.innerHTML = head('') + '<div class="loading-cell">Memuat…</div>';
    let r;
    try { r = await api('GET', `/api/reports/deposit${qs({ side, to: state.to || state.meta.today })}`); } catch (e) { root.innerHTML = head('Deposit saldo prabayar & uang jaminan.', tabs) + `<p class="pad neg">${esc(e.message)}</p>`; return; }
    const t = r.totals;
    const canNew = R().ent(table)?.canWrite;
    const [accS, accJ] = r.accounts;
    root.innerHTML = head(ar
      ? 'Deposit pelanggan: saldo prabayar dipakai melunasi faktur; uang jaminan dikembalikan saat kontrak berakhir atau dicairkan sebagai kompensasi. Liabilitas kepada pelanggan, bukan pendapatan.'
      : 'Deposit kita di pemasok: saldo prabayar dipakai membayar tagihan; uang jaminan (sewa, kontrak) ditagih kembali saat kontrak berakhir atau dibebankan bila hangus. Aset, bukan beban.',
    `${tabs}${canNew ? `<button class="btn btn-primary" data-nav="${ar ? 'deposit-pelanggan' : 'deposit-pemasok'}">${icon('plus')} Deposit baru</button>` : ''}<button class="btn" data-report-csv>${icon('download')} Ekspor CSV</button>`) +
      `<section class="kpi-grid-erp">
        ${kpi('Saldo prabayar', esc(FMT.rpCompact(t.saldo)), `akun ${accS} · ${ar ? 'dapat melunasi faktur' : 'dapat membayar tagihan'}`)}
        ${kpi('Uang jaminan', esc(FMT.rpCompact(t.jaminan)), `akun ${accJ}`)}
        ${kpi('Jaminan jatuh tempo ≤ 30 hari', esc(FMT.rpCompact(t.dueSoon)), `${t.dueSoonCount} deposit · ${ar ? 'siapkan pengembalian' : 'tagih pengembalian'}`, t.dueSoonCount ? 'neg' : '')}
        ${kpi('Dipakai / dikembalikan', esc(FMT.rpCompact(t.used + t.refunded)), `${ar ? 'dicairkan' : 'hangus'} ${FMT.rpCompact(t.forfeited)}`)}
      </section>
      <div class="notice" data-tone="${r.reconciled ? 'ok' : 'danger'}">${icon(r.reconciled ? 'check' : 'alert')} ${esc(r.reconciled ? `Saldo deposit cocok dengan buku besar — ${accS} ${FMT.rp(r.glSaldo)} · ${accJ} ${FMT.rp(r.glJaminan)}.` : `Tidak cocok dengan buku besar (${accS} ${FMT.rp(r.glSaldo)}, ${accJ} ${FMT.rp(r.glJaminan)}).`)}</div>
      <article class="card report-card"><div class="report-body"><div class="table-scroll"><table class="table report-table tbl-sm"><thead><tr><th>Deposit</th><th>${ar ? 'Pelanggan' : 'Pemasok'}</th><th class="ta-r">Nilai</th><th class="ta-r">Dipakai / dikembalikan</th><th class="ta-r">Saldo</th><th>Pengembalian</th><th>Status</th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr class="${x.kind === 'jaminan' && x.remaining > 0 && x.daysToReturn != null && x.daysToReturn < 0 ? 'row-attn' : ''}"><td class="code"><button class="link" data-open="${table}:${x.id}">${esc(x.number)}</button><span class="cell-sub">${esc(DEP_KIND[x.kind] || x.kind)} · ${esc(ERP.date(x.date))}</span></td><td>${esc(x.party)}${x.reference ? `<span class="cell-sub">${esc(x.reference)}</span>` : ''}</td>
          <td class="ta-r">${money(x.amount)}</td><td class="ta-r">${x.used + x.refunded + x.forfeited ? money(x.used + x.refunded + x.forfeited) : ''}${[x.used && `dipakai ${money(x.used)}`, x.refunded && `kembali ${money(x.refunded)}`, x.forfeited && `${ar ? 'dicairkan' : 'hangus'} ${money(x.forfeited)}`].filter(Boolean).map((t2) => `<span class="cell-sub">${t2}</span>`).join('')}</td><td class="ta-r">${money(x.remaining)}</td>
          <td class="num">${x.return_date ? `${esc(ERP.date(x.return_date))}${x.remaining > 0 ? `<span class="cell-sub ${x.daysToReturn < 0 ? 'neg' : ''}">${x.daysToReturn >= 0 ? `${x.daysToReturn} hari lagi` : `${-x.daysToReturn} hari lewat`}</span>` : ''}` : '—'}</td><td>${pill(x.status)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Belum ada deposit.</td></tr>'}
      </tbody><tfoot><tr class="row-total"><td colspan="4">Total saldo deposit</td><td class="ta-r">${money(t.saldo + t.jaminan)}</td><td colspan="2"></td></tr></tfoot></table></div></div></article>`;
  }
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-dep-side]');
    if (el) { state.depSide = el.dataset.depSide; ERP.app.renderView(); }
  });

  ERP.sales = { quoteReport, openDoInvoice, soDrawer, fulfillment, settlementDrawer, schedule, giro, advances, depositDrawer, deposits };
})();
