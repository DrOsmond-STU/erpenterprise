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
  const MODE = { pelunasan: 'Pelunasan', uang_muka: 'Uang muka', pakai_uang_muka: 'Pakai uang muka' };

  /** Laci faktur/tagihan: jadwal angsuran, riwayat pembayaran (termasuk potongan), saldo uang muka mitra. */
  async function settlementDrawer(key, r) {
    if (['draf', 'batal'].includes(r.status)) return '';
    let s;
    try { s = await api('GET', `/api/settlement/${key}/${r.id}`); } catch { return ''; }
    const ar = key === 'sales_invoices';
    const act = (r.__actions || []).find((a) => a.name === (ar ? 'receive' : 'pay'));
    return `<div class="section"><span class="section-title">Jadwal angsuran & pembayaran</span>
      <div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>Tahap</th><th>Jatuh tempo</th><th class="ta-r">Jumlah</th><th class="ta-r">Dibayar</th><th class="ta-r">Sisa</th><th>Status</th></tr></thead><tbody>
        ${s.installments.map((i) => `<tr><td>${esc(i.label)}</td><td class="num ${i.status === 'terlambat' ? 'neg' : ''}">${esc(ERP.date(i.due_date))}</td><td class="ta-r">${money(i.amount)}</td><td class="ta-r">${money(i.paid)}</td><td class="ta-r">${money(i.open)}</td><td>${pill(i.status)}</td></tr>`).join('')}
      </tbody><tfoot><tr class="row-total"><td colspan="4">Sisa ${ar ? 'faktur' : 'tagihan'}</td><td class="ta-r">${money(s.open)}</td><td></td></tr></tfoot></table></div>
      ${s.payments.length || s.credits.length ? `<div class="table-scroll"><table class="table tbl-sm"><thead><tr><th>${ar ? 'Penerimaan' : 'Pembayaran'}</th><th>Tanggal</th><th>Jenis</th><th class="ta-r">Kas/uang muka</th><th class="ta-r">Potongan</th><th class="ta-r">PPh 23</th><th class="ta-r">Melunasi</th><th>Status</th></tr></thead><tbody>
        ${s.payments.map((p) => `<tr data-open="${p.entity}:${p.id}" tabindex="0"><td class="code">${esc(p.number)}</td><td class="num">${esc(ERP.date(p.date))}</td><td>${esc(MODE[p.mode] || 'Pelunasan')}</td><td class="ta-r">${money(p.amount)}</td><td class="ta-r">${p.discount ? money(p.discount) : ''}</td><td class="ta-r">${p.pph23 ? money(p.pph23) : ''}</td><td class="ta-r">${money(p.settled)}</td><td>${pill(p.status)}</td></tr>`).join('')}
        ${s.credits.map((c) => `<tr data-open="${c.entity}:${c.id}" tabindex="0"><td class="code">${esc(c.number)}</td><td class="num">${esc(ERP.date(c.date))}</td><td>Retur (nota)</td><td></td><td></td><td></td><td class="ta-r">${money(c.settled)}</td><td>${pill('diposting')}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Belum ada pembayaran.</p>'}
      <p class="field-hint">Saldo uang muka ${ar ? 'pelanggan' : 'ke pemasok'}: <b>${esc(FMT.rp(s.advance))}</b>${s.advance > 0 && s.open > 0 ? ' — dapat dipakai melunasi (sumber dana "Saldo uang muka").' : ''}</p>
      ${act && s.open > 0 ? `<button class="btn btn-sm btn-primary" data-action-run="${key}:${r.id}:${act.name}">${icon('wallet')} ${esc(act.label)} (penuh / sebagian)</button>` : ''}</div>`;
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
        ${r.rows.map((x) => `<tr class="${x.status === 'terlambat' ? 'row-attn' : ''}"><td class="num ${x.status === 'terlambat' ? 'neg' : ''}">${esc(ERP.date(x.due_date))}${x.overdueDays ? `<span class="cell-sub">${x.overdueDays} hari lewat</span>` : ''}</td><td class="code"><button class="link" data-open="${docKey}:${x.doc_id}">${esc(x.number)}</button></td><td>${esc(x.party)}</td><td>${esc(x.label)}${x.stages > 1 ? `<span class="cell-sub">tahap ${x.seq}/${x.stages}</span>` : ''}</td><td class="ta-r">${money(x.amountIdr)}${x.rate !== 1 ? `<span class="cell-sub">valas × ${esc(num(x.rate))}</span>` : ''}</td><td class="ta-r">${x.paid ? money(x.paidIdr) : ''}</td><td class="ta-r">${money(x.openIdr)}</td><td>${pill(x.status)}</td><td>${canPay ? `<button class="btn btn-sm" data-action-run="${docKey}:${x.doc_id}:${ar ? 'receive' : 'pay'}">${ar ? 'Terima' : 'Bayar'}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Tidak ada angsuran terbuka pada rentang ini.</td></tr>'}
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
      <div class="notice" data-tone="${r.reconciled ? 'ok' : 'danger'}">${icon(r.reconciled ? 'check' : 'alert')} ${esc(r.reconciled ? `Giro belum cair cocok dengan saldo akun ${side === 'in' ? '1-1250 Giro Mundur Diterima' : '2-1150 Giro Mundur Diberikan'} (${FMT.rp(r.glBalance)}).` : `Tidak cocok: register ${FMT.rp(t.open)} vs buku besar ${FMT.rp(r.glBalance)}.`)}</div>
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

  ERP.sales = { quoteReport, openDoInvoice, soDrawer, fulfillment, settlementDrawer, schedule, giro };
})();
