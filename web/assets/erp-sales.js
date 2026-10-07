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

  ERP.sales = { quoteReport };
})();
