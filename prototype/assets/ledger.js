/* ==========================================================================
   ERP Enterprise — Mesin buku besar (general ledger)
   --------------------------------------------------------------------------
   Seluruh modul operasional (penjualan, pembelian, persediaan, produksi,
   penggajian, aset, pemeliharaan, POS, kas & bank) bermuara di sini:

     dokumen sumber  ──posting otomatis──▶  jurnal berpasangan (Dr = Kr)
                                                │
                    kartu buku besar ◀──────────┤
                    neraca saldo     ◀──────────┤  per cabang
                    laba rugi        ◀──────────┤  atau konsolidasi
                    neraca           ◀──────────┘  (dengan eliminasi RK)

   Setiap jurnal dicap cabang. Kantor pusat (JKT) memegang akun 1-3100
   "RK Cabang"; setiap cabang memegang 3-1500 "RK Kantor Pusat". Keduanya
   selalu sama besar dan dieliminasi pada laporan konsolidasi.

   Modul ini murni fungsi atas DATA; tidak menyentuh DOM.
   ========================================================================== */

const Ledger = (() => {
  'use strict';

  const FISCAL_START = '2026-01-01';
  const TODAY = '2026-08-14';
  const PPN = 0.11;
  const HO = 'JKT';               // kantor pusat
  const RK_CABANG = '1-3100';     // di buku kantor pusat
  const RK_PUSAT = '3-1500';      // di buku cabang
  const INTERCO = new Set([RK_CABANG, RK_PUSAT]);

  const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08'];
  const LAST_DAY = { '01': 31, '02': 28, '03': 31, '04': 30, '05': 31, '06': 30, '07': 31, '08': 31, '09': 30, '10': 31, '11': 30, '12': 31 };
  const monthEnd = (m) => `2026-${m}-${LAST_DAY[m]}`;
  const nextMonth = (m) => String(Number(m) + 1).padStart(2, '0');
  const BULAN = { '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'Mei', '06': 'Jun', '07': 'Jul', '08': 'Agu', '09': 'Sep' };

  /* ---------------------------------------------------------------------- */
  /* Utilitas                                                                */
  /* ---------------------------------------------------------------------- */
  const r0 = (v) => Math.round(v);
  const splitPPN = (gross) => {
    const net = r0(gross / (1 + PPN));
    return { net, ppn: r0(gross) - net };
  };
  const acct = (code) => DATA.chartOfAccounts.find((a) => a.code === code);
  const acctName = (code) => { const a = acct(code); return a ? a.name : code; };
  const branchOf = (id) => DATA.branches.find((b) => b.id === id);
  const bankOf = (id) => DATA.bankAccounts.find((b) => b.id === id);
  const mainBank = (branch) => branchOf(branch).mainBank;
  const pettyCash = (branch) => branchOf(branch).pettyCash;
  const isDebitNormal = (code) => /^[15]/.test(code);
  const invAccountFor = (category) => (category === 'Barang jadi' ? '1-1500' : '1-1400');
  const itemCost = (sku) => { const it = DATA.stockItems.find((s) => s.sku === sku); return it ? it.cost : 0; };

  /** Baris jurnal. `bank` menandai rekening kas/bank yang terlibat. */
  const D = (account, amount, extra) => ({ account, debit: r0(amount), credit: 0, ...(extra || {}) });
  const C = (account, amount, extra) => ({ account, debit: 0, credit: r0(amount), ...(extra || {}) });

  /** Rapikan: buang baris nol, gabungkan, dan pastikan seimbang (selisih pembulatan ≤ 2 masuk baris terakhir). */
  function finalize(j) {
    j.lines = j.lines.filter((l) => l.debit || l.credit);
    const dr = j.lines.reduce((s, l) => s + l.debit, 0);
    const cr = j.lines.reduce((s, l) => s + l.credit, 0);
    const diff = dr - cr;
    if (diff !== 0 && Math.abs(diff) <= 2 && j.lines.length) {
      const last = j.lines[j.lines.length - 1];
      if (last.credit) last.credit += diff; else last.debit -= diff;
    }
    j.total = j.lines.reduce((s, l) => s + l.debit, 0);
    j.balanced = j.lines.reduce((s, l) => s + l.debit - l.credit, 0) === 0;
    return j;
  }

  /* ---------------------------------------------------------------------- */
  /* Posting otomatis dari dokumen sumber                                    */
  /* ---------------------------------------------------------------------- */
  function generate() {
    const out = [];
    const push = (j) => { out.push(finalize({ status: 'diposting', by: 'Sistem', ...j })); };

    /* --- 0. Saldo awal per cabang (1 Jan 2026) --------------------------- */
    /* Saldo awal dibangun dari sub-buku: kas & bank, persediaan, aset tetap,
       ditambah pos eksplisit (tanah/bangunan, pinjaman, modal). Ekuitas
       menjadi penyeimbang: RK Kantor Pusat untuk cabang, laba ditahan
       untuk kantor pusat. */
    const openingByBranch = {};
    DATA.branches.forEach((b) => {
      const lines = [];
      DATA.bankAccounts.filter((k) => k.branch === b.id && k.currency === 'IDR' && k.opening)
        .forEach((k) => lines.push(D('1-1100', k.opening, { bank: k.id })));
      (DATA.openingBalances[b.id] || []).forEach(([code, amount]) => {
        lines.push(amount >= 0 === isDebitNormal(code) ? D(code, Math.abs(amount)) : C(code, Math.abs(amount)));
      });
      /* Aset tetap dari register aset: harga perolehan & akumulasi awal */
      DATA.assets.filter((a) => a.branch === b.id).forEach((a) => {
        lines.push(D(a.account, a.acquisitionCost));
        const accum = a.status === 'dihapuskan'
          ? a.acquisitionCost
          : Math.max(0, a.acquisitionCost - a.bookValue - a.monthlyDepr * MONTHS.length);
        if (accum) lines.push(C('1-2900', accum));
      });
      openingByBranch[b.id] = lines;
    });

    /* Persediaan awal = nilai kartu stok saat ini − mutasi persediaan yang
       dijurnal sepanjang tahun (dihitung setelah jurnal lain terbentuk). */

    /* --- 1. Rekap operasional bulanan per cabang ------------------------- */
    /* Penjualan tunai, pembelian tunai, hasil produksi, dan setoran kas ke
       kantor pusat. Faktur kredit & tagihan pemasok dijurnal per dokumen. */
    DATA.salesRecap.forEach((rc) => {
      const b = branchOf(rc.branch);
      rc.sales.forEach((gross, i) => {
        const m = MONTHS[i];
        const date = i === MONTHS.length - 1 ? '2026-08-13' : monthEnd(m);
        const { net, ppn } = splitPPN(gross);
        const cogs = r0(net * rc.cogsRatio);
        push({
          date, branch: rc.branch, source: 'penjualan', ref: `REKAP-${rc.branch}-2026${m}`,
          desc: `Rekap penjualan tunai ${BULAN[m]} 2026 — ${b.short}`,
          lines: [D('1-1100', gross, { bank: b.mainBank }), C('4-1000', net), C('2-1400', ppn),
                  D('5-1000', cogs), C('1-1500', cogs)],
        });
        const pg = rc.purchases[i];
        const pp = splitPPN(pg);
        push({
          date, branch: rc.branch, source: 'pembelian', ref: `BELI-${rc.branch}-2026${m}`,
          desc: `Rekap pembelian tunai ${rc.producer ? 'bahan baku' : 'barang dagang'} ${BULAN[m]} 2026 — ${b.short}`,
          lines: [D(rc.producer ? '1-1400' : '1-1500', pp.net), D('1-1700', pp.ppn), C('1-1100', pg, { bank: b.mainBank })],
        });
        if (rc.producer) push({
          date, branch: rc.branch, source: 'produksi', ref: `PROD-${rc.branch}-2026${m}`,
          desc: `Hasil produksi ${BULAN[m]} 2026 — ${b.short} (bahan → barang jadi)`,
          lines: [D('1-1500', pp.net), C('1-1400', pp.net)],
        });
        if (rc.remit && i < MONTHS.length - 1) {
          push({
            date: `2026-${m}-27`, branch: rc.branch, source: 'kas-bank', ref: `REMIT-${rc.branch}-2026${m}`,
            desc: `Setoran kas cabang ke kantor pusat ${BULAN[m]} 2026`,
            lines: [D(RK_PUSAT, rc.remit), C('1-1100', rc.remit, { bank: b.mainBank })],
          });
          push({
            date: `2026-${m}-27`, branch: HO, source: 'kas-bank', ref: `REMIT-${rc.branch}-2026${m}`,
            desc: `Terima setoran kas ${b.short} ${BULAN[m]} 2026`,
            lines: [D('1-1100', rc.remit, { bank: 'BNK-001' }), C(RK_CABANG, rc.remit, { interBranch: rc.branch })],
          });
        }
      });
    });

    /* --- 2. Faktur penjualan → piutang, pendapatan, PPN keluaran, HPP ----- */
    DATA.invoices.forEach((inv) => {
      const { net, ppn } = splitPPN(inv.amount);
      const svc = inv.service ? r0(net * inv.service) : 0;
      push({
        date: inv.date, branch: inv.branch, source: 'penjualan', ref: inv.id,
        desc: `Faktur ${inv.id} — ${inv.customer}`,
        lines: [D('1-1200', inv.amount, { party: inv.customer }), C('4-1000', net - svc), C('4-2000', svc), C('2-1400', ppn)],
      });
      if (inv.cogs) push({
        date: inv.date, branch: inv.branch, source: 'persediaan', ref: inv.id,
        desc: `HPP faktur ${inv.id}`,
        lines: [D('5-1000', inv.cogs), C('1-1500', inv.cogs)],
      });
      if (inv.paid) push({
        date: inv.paidDate || inv.date, branch: inv.branch, source: 'kas-bank', ref: inv.id,
        desc: `Penerimaan pelanggan ${inv.customer} — ${inv.id}`,
        lines: [D('1-1100', inv.paid, { bank: inv.bank || mainBank(inv.branch) }), C('1-1200', inv.paid, { party: inv.customer })],
      });
    });

    /* --- 3. Hutang usaha (faktur pemasok) → persediaan/beban, PPN masukan - */
    DATA.payables.forEach((ap) => {
      const { net, ppn } = splitPPN(ap.amount);
      const target = ap.kind === 'jasa' ? ap.account : '1-1400';
      push({
        date: ap.date, branch: ap.branch, source: 'pembelian', ref: ap.id,
        desc: `${ap.kind === 'jasa' ? 'Tagihan' : 'Penerimaan barang'} ${ap.supplier} — ${ap.poRef || ap.id}`,
        lines: [D(target, net), D('1-1700', ppn), C('2-1100', ap.amount, { party: ap.supplier })],
      });
      if (ap.paid) push({
        date: ap.paidDate || ap.date, branch: ap.branch, source: 'kas-bank', ref: ap.id,
        desc: `Pembayaran ${ap.supplier} — ${ap.id}`,
        lines: [D('2-1100', ap.paid, { party: ap.supplier }), C('1-1100', ap.paid, { bank: ap.bank || mainBank(ap.branch) })],
      });
    });

    /* --- 4. Penggajian per cabang, dibayar terpusat oleh kantor pusat ----- */
    const payrollFund = {};
    DATA.branches.forEach((b) => {
      MONTHS.forEach((m) => {
        const isCurrent = m === '08';
        const rows = DATA.payroll.filter((p) => p.branch === b.id && (!isCurrent || p.status !== 'draf'));
        if (!rows.length) return;
        const gross = (r) => r.basic + r.allowance + r.overtime;
        const direct = rows.filter((r) => r.dept === 'Produksi').reduce((s, r) => s + gross(r), 0);
        const indirect = rows.filter((r) => r.dept !== 'Produksi').reduce((s, r) => s + gross(r), 0);
        const ded = rows.reduce((s, r) => s + r.deduction, 0);
        const net = rows.reduce((s, r) => s + r.netPay, 0);
        push({
          date: `2026-${m}-10`, branch: b.id, source: 'penggajian', ref: `PAY-2026-${m}-${b.id}`,
          desc: `Beban gaji ${BULAN[m]} 2026 — ${b.short} (${rows.length} karyawan)`,
          lines: [D('5-2100', direct), D('5-2200', indirect), C('2-1300', ded), C('2-1200', net)],
        });
        const paidRows = isCurrent ? rows.filter((r) => r.status === 'dibayar') : rows;
        const paid = paidRows.reduce((s, r) => s + r.netPay, 0);
        if (!paid) return;
        payrollFund[m] = (payrollFund[m] || 0) + paid;
        if (b.id === HO) {
          push({
            date: `2026-${m}-13`, branch: HO, source: 'kas-bank', ref: `PAY-2026-${m}-${b.id}`,
            desc: `Pembayaran gaji ${BULAN[m]} 2026 — ${b.short}`,
            lines: [D('2-1200', paid), C('1-1100', paid, { bank: 'BNK-002' })],
          });
        } else {
          push({
            date: `2026-${m}-13`, branch: b.id, source: 'kas-bank', ref: `PAY-2026-${m}-${b.id}`,
            desc: `Pembayaran gaji ${BULAN[m]} 2026 oleh kantor pusat`,
            lines: [D('2-1200', paid), C(RK_PUSAT, paid)],
          });
          push({
            date: `2026-${m}-13`, branch: HO, source: 'kas-bank', ref: `PAY-2026-${m}-${b.id}`,
            desc: `Transfer gaji ${BULAN[m]} 2026 untuk ${b.short}`,
            lines: [D(RK_CABANG, paid, { interBranch: b.id }), C('1-1100', paid, { bank: 'BNK-002' })],
          });
        }
      });
    });

    Object.entries(payrollFund).forEach(([m, amount]) => push({
      date: `2026-${m}-12`, branch: HO, source: 'kas-bank', ref: `FUND-2026-${m}`,
      desc: `Pemindahbukuan dana gaji ${BULAN[m]} 2026 ke rekening gaji`,
      lines: [D('1-1100', amount, { bank: 'BNK-002' }), C('1-1100', amount, { bank: 'BNK-001' })],
    }));

    /* --- 5. Penyusutan aset tetap bulanan per cabang ---------------------- */
    DATA.branches.forEach((b) => {
      const depr = DATA.assets.filter((a) => a.branch === b.id && a.status === 'aktif').reduce((s, a) => s + a.monthlyDepr, 0);
      if (!depr) return;
      MONTHS.forEach((m) => push({
        date: monthEnd(m), branch: b.id, source: 'aset', ref: `DEPR-2026-${m}-${b.id}`,
        desc: `Penyusutan aset tetap ${BULAN[m]} 2026 — ${b.short}`,
        lines: [D('5-3200', depr), C('1-2900', depr)],
      }));
    });

    /* --- 6. Beban rutin per cabang (sewa, utilitas, pemasaran, bunga, …) -- */
    DATA.recurringExpenses.forEach((re) => {
      MONTHS.forEach((m) => push({
        date: `2026-${m}-${String(re.day || 5).padStart(2, '0')}`, branch: re.branch, source: 'kas-bank', ref: `RUTIN-${re.branch}-${re.account}-${m}`,
        desc: `${re.desc} ${BULAN[m]} 2026`,
        lines: [D(re.account, re.amount), C('1-1100', re.amount, { bank: re.bank || mainBank(re.branch) })],
      }));
    });

    /* --- 7. Angsuran pinjaman bank (kantor pusat) ------------------------- */
    MONTHS.forEach((m) => push({
      date: `2026-${m}-20`, branch: HO, source: 'kas-bank', ref: `LOAN-2026-${m}`,
      desc: `Angsuran pokok utang bank ${BULAN[m]} 2026`,
      lines: [D('2-2100', DATA.loanInstallment), C('1-1100', DATA.loanInstallment, { bank: 'BNK-001' })],
    }));

    /* --- 8. POS: rekap bulanan per toko + rekap shift hari ini ------------ */
    DATA.posSummary.forEach((ps) => {
      const { net, ppn } = splitPPN(ps.sales);
      const cogs = r0(net * ps.cogsRatio);
      push({
        date: ps.date, branch: ps.branch, source: 'pos', ref: ps.ref,
        desc: ps.desc,
        lines: [D('1-1100', ps.sales, { bank: mainBank(ps.branch) }), C('4-1000', net), C('2-1400', ppn),
                D('5-1000', cogs), C('1-1500', cogs)],
      });
    });
    const stores = [...new Set(DATA.posShifts.map((s) => s.store))];
    stores.forEach((store) => {
      const shifts = DATA.posShifts.filter((s) => s.store === store);
      const sales = shifts.reduce((s, x) => s + x.totalSales, 0);
      if (!sales) return;
      const { net, ppn } = splitPPN(sales);
      const cogs = r0(net * 0.62);
      push({
        date: TODAY, branch: shifts[0].branch, source: 'pos', ref: shifts.map((s) => s.id).join(', '),
        desc: `Rekap penjualan POS ${store} — ${shifts.length} shift`,
        lines: [D('1-1100', sales, { bank: pettyCash(shifts[0].branch) }), C('4-1000', net), C('2-1400', ppn),
                D('5-1000', cogs), C('1-1500', cogs)],
      });
    });

    /* --- 9. Mutasi stok yang berdampak nilai (produksi, opname, transfer, pemakaian) */
    DATA.stockMoves.forEach((mv) => {
      const value = Math.abs(mv.qty) * itemCost(mv.sku);
      const item = DATA.stockItems.find((s) => s.sku === mv.sku);
      const invAcc = invAccountFor(item ? item.category : '');
      const base = { date: mv.date, branch: mv.branch, source: 'persediaan', ref: mv.id };
      switch (mv.type) {
        case 'Keluar — Produksi':
          push({ ...base, desc: `Pemakaian bahan ${mv.name} untuk ${mv.ref}`, lines: [D('1-1450', value), C(invAcc, value)] }); break;
        case 'Masuk — Hasil produksi':
          push({ ...base, desc: `Hasil produksi ${mv.name} dari ${mv.ref}`, lines: [D('1-1500', value), C('1-1450', value)] }); break;
        case 'Penyesuaian — Opname':
          push({ ...base, desc: `Selisih opname ${mv.name} (${mv.ref})`,
            lines: mv.qty < 0 ? [D('5-1900', value), C(invAcc, value)] : [D(invAcc, value), C('5-1900', value)] }); break;
        case 'Keluar — Pemeliharaan':
          push({ ...base, desc: `Pemakaian ${mv.name} untuk ${mv.ref}`, lines: [D('5-3400', value), C(invAcc, value)] }); break;
        case 'Transfer — Antar gudang': {
          const other = mv.to || mv.from;
          if (mv.qty < 0) {
            push({ ...base, desc: `Transfer ${mv.name} ke ${branchOf(other).short} (${mv.ref})`,
              lines: mv.branch === HO
                ? [D(RK_CABANG, value, { interBranch: other }), C(invAcc, value)]
                : [D(RK_PUSAT, value, { interBranch: other }), C(invAcc, value)] });
          } else {
            push({ ...base, desc: `Terima transfer ${mv.name} dari ${branchOf(other).short} (${mv.ref})`,
              lines: mv.branch === HO
                ? [D(invAcc, value), C(RK_CABANG, value, { interBranch: other })]
                : [D(invAcc, value), C(RK_PUSAT, value, { interBranch: other })] });
          }
          break;
        }
        default: /* Penerimaan & pengiriman dijurnal lewat hutang usaha & faktur */ break;
      }
    });

    /* --- 10. Pemeliharaan selesai → beban pemeliharaan dari kas kecil ------ */
    DATA.maintenanceOrders.filter((mo) => mo.status === 'selesai').forEach((mo) => push({
      date: mo.scheduledDate, branch: mo.branch, source: 'pemeliharaan', ref: mo.id,
      desc: `Biaya pemeliharaan ${mo.asset} — ${mo.desc}`,
      lines: [D('5-3400', mo.cost), C('1-1100', mo.cost, { bank: pettyCash(mo.branch) })],
    }));

    /* --- 11. Saldo awal persediaan: turunkan dari kartu stok --------------- */
    DATA.branches.forEach((b) => {
      const snapshot = {};
      DATA.stockItems.filter((s) => s.branch === b.id).forEach((s) => {
        const a = invAccountFor(s.category);
        snapshot[a] = (snapshot[a] || 0) + s.onHand * s.cost;
      });
      ['1-1400', '1-1450', '1-1500'].forEach((a) => {
        const moved = out.filter((j) => j.branch === b.id).flatMap((j) => j.lines)
          .filter((l) => l.account === a).reduce((s, l) => s + l.debit - l.credit, 0);
        const opening = (snapshot[a] || 0) - moved;
        if (opening) openingByBranch[b.id].push(opening > 0 ? D(a, opening) : C(a, -opening));
      });
    });

    /* --- 12. Setoran pajak bulanan (PPN & PPh) — dipusatkan di kantor pusat */
    MONTHS.slice(0, -1).forEach((m) => {
      let hoPaysForBranches = 0;
      DATA.branches.forEach((b) => {
        const lines = out.filter((j) => j.branch === b.id && j.date.slice(5, 7) === m && j.status === 'diposting' && j.source !== 'pajak').flatMap((j) => j.lines);
        const sum = (code) => lines.filter((l) => l.account === code).reduce((s, l) => s + l.credit - l.debit, 0);
        const ppnOut = sum('2-1400'), ppnIn = -sum('1-1700'), pph = sum('2-1300');
        const netTax = ppnOut - ppnIn + pph;
        if (!ppnOut && !ppnIn && !pph) return;
        const settle = b.id === HO ? C('1-1100', netTax, { bank: 'BNK-001' }) : C(RK_PUSAT, netTax);
        if (b.id !== HO) hoPaysForBranches += netTax;
        push({
          date: `2026-${nextMonth(m)}-10`, branch: b.id, source: 'pajak', ref: `TAX-2026-${m}-${b.id}`,
          desc: `Setoran PPN & PPh masa ${BULAN[m]} 2026 — ${b.short}`,
          lines: [D('2-1400', ppnOut), C('1-1700', ppnIn), D('2-1300', pph), settle],
        });
      });
      if (hoPaysForBranches) push({
        date: `2026-${nextMonth(m)}-10`, branch: HO, source: 'pajak', ref: `TAX-2026-${m}-CABANG`,
        desc: `Setoran pajak masa ${BULAN[m]} 2026 atas nama cabang`,
        lines: [D(RK_CABANG, hoPaysForBranches), C('1-1100', hoPaysForBranches, { bank: 'BNK-001' })],
      });
    });

    /* --- 13. Ekuitas penyeimbang saldo awal --------------------------------- */
    /* Cabang: RK Kantor Pusat = aset − liabilitas cabang.
       Kantor pusat: RK Cabang = Σ RK Kantor Pusat; laba ditahan = sisa. */
    let totalRK = 0;
    DATA.branches.filter((b) => b.id !== HO).forEach((b) => {
      const lines = openingByBranch[b.id];
      const net = lines.reduce((s, l) => s + l.debit - l.credit, 0);
      totalRK += net;
      lines.push(net >= 0 ? C(RK_PUSAT, net) : D(RK_PUSAT, -net));
    });
    const hoLines = openingByBranch[HO];
    hoLines.push(D(RK_CABANG, totalRK));
    const hoNet = hoLines.reduce((s, l) => s + l.debit - l.credit, 0);
    hoLines.push(hoNet >= 0 ? C('3-2000', hoNet) : D('3-2000', -hoNet));
    DATA.branches.forEach((b) => {
      if (!openingByBranch[b.id].some((l) => l.debit || l.credit)) return; // cabang baru tanpa saldo awal
      push({
        date: FISCAL_START, branch: b.id, source: 'saldo-awal', ref: `OPN-2026-${b.id}`,
        desc: `Saldo awal 1 Jan 2026 — ${b.name}`, by: 'Migrasi',
        lines: openingByBranch[b.id],
      });
    });

    return out;
  }

  /* ---------------------------------------------------------------------- */
  /* Register jurnal: otomatis + manual + buatan pengguna                    */
  /* ---------------------------------------------------------------------- */
  const userJournals = [];
  let cache = null;
  let seq = 0;

  function all() {
    if (cache) return cache;
    const gen = generate();
    const manual = DATA.manualJournals.map((j) => finalize({ ...j, lines: j.lines.map((l) => ({ ...l })) }));
    const list = [...gen, ...manual, ...userJournals];
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    seq = 0;
    /* Jurnal otomatis dinomori urut tanggal; jurnal manual & buatan pengguna sudah ber-ID. */
    list.forEach((j) => { if (!j.id) j.id = `JV-2026-${String(++seq).padStart(4, '0')}`; });
    cache = list;
    return list;
  }
  const invalidate = () => { cache = null; };

  function addJournal(j) {
    const nj = finalize({ status: j.status || 'menunggu', by: j.by || DATA.org.user.name, source: 'manual', ...j });
    nj.id = `JV-2026-${String(800 + userJournals.length + 1).padStart(4, '0')}`;
    userJournals.push(nj);
    invalidate();
    return nj;
  }
  function setStatus(id, status) {
    const j = all().find((x) => x.id === id);
    if (!j) return null;
    j.status = status;
    /* Jurnal manual dari data: ubah pula sumbernya agar tidak kembali saat cache dibangun ulang. */
    const src = DATA.manualJournals.find((x) => x.id === id);
    if (src) src.status = status;
    invalidate();
    return j;
  }
  const byRef = (ref) => all().filter((j) => j.ref && String(j.ref).split(', ').includes(ref));

  /* ---------------------------------------------------------------------- */
  /* Konteks: cabang & periode                                               */
  /* ---------------------------------------------------------------------- */
  const period = (id) => DATA.periods.find((p) => p.id === id) || DATA.periods[0];
  const inBranch = (j, branch) => branch === 'ALL' || j.branch === branch;
  const posted = (j) => j.status === 'diposting';

  /** Baris terposting yang cocok cabang & rentang tanggal (inklusif). */
  function lines(branch, from, to) {
    const res = [];
    all().forEach((j) => {
      if (!posted(j) || !inBranch(j, branch)) return;
      if (from && j.date < from) return;
      if (to && j.date > to) return;
      j.lines.forEach((l) => res.push({ ...l, date: j.date, jid: j.id, desc: j.desc, ref: j.ref, branch: j.branch, source: j.source }));
    });
    return res;
  }

  /** Saldo per akun: awal (sebelum `from`), mutasi, akhir (s.d. `to`). Nilai bertanda sisi normal. */
  function balances(ctx) {
    const p = period(ctx.period);
    const res = {};
    const ensure = (code) => (res[code] ||= { code, name: acctName(code), opening: 0, debit: 0, credit: 0, ending: 0 });
    all().forEach((j) => {
      if (!posted(j) || !inBranch(j, ctx.branch) || j.date > p.to) return;
      j.lines.forEach((l) => {
        const b = ensure(l.account);
        if (j.date < p.from) b.opening += isDebitNormal(l.account) ? l.debit - l.credit : l.credit - l.debit;
        else { b.debit += l.debit; b.credit += l.credit; }
      });
    });
    Object.values(res).forEach((b) => {
      b.ending = b.opening + (isDebitNormal(b.code) ? b.debit - b.credit : b.credit - b.debit);
    });
    return res;
  }

  /* --- Kartu buku besar ---------------------------------------------------- */
  function glCard(ctx, code, bank) {
    const p = period(ctx.period);
    const dn = isDebitNormal(code);
    const match = (l) => l.account === code && (!bank || l.bank === bank);
    const before = lines(ctx.branch, null, p.from).filter((l) => match(l) && l.date < p.from);
    let bal = before.reduce((s, l) => s + (dn ? l.debit - l.credit : l.credit - l.debit), 0);
    const opening = bal;
    const rows = lines(ctx.branch, p.from, p.to).filter(match).map((l) => {
      bal += dn ? l.debit - l.credit : l.credit - l.debit;
      return { ...l, balance: bal };
    });
    return {
      code, name: acctName(code), opening, rows, ending: bal,
      debit: rows.reduce((s, l) => s + l.debit, 0), credit: rows.reduce((s, l) => s + l.credit, 0),
    };
  }

  /* --- Neraca saldo -------------------------------------------------------- */
  function trialBalance(ctx) {
    const bal = balances(ctx);
    const rows = DATA.chartOfAccounts.filter((a) => a.type === 'Detail').map((a) => {
      const b = bal[a.code] || { opening: 0, debit: 0, credit: 0, ending: 0 };
      const dn = isDebitNormal(a.code);
      const side = (v) => (dn ? (v >= 0 ? { d: v, k: 0 } : { d: 0, k: -v }) : (v >= 0 ? { d: 0, k: v } : { d: -v, k: 0 }));
      return { code: a.code, name: a.name, category: a.category, interco: INTERCO.has(a.code),
        open: side(b.opening), debit: b.debit, credit: b.credit, end: side(b.ending) };
    }).filter((r) => r.open.d || r.open.k || r.debit || r.credit || r.end.d || r.end.k);
    const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
    return {
      rows,
      totals: { openD: sum((r) => r.open.d), openK: sum((r) => r.open.k), debit: sum((r) => r.debit), credit: sum((r) => r.credit), endD: sum((r) => r.end.d), endK: sum((r) => r.end.k) },
    };
  }

  /* --- Laba rugi ----------------------------------------------------------- */
  const PL_GROUPS = [
    { id: 'pendapatan', label: 'Pendapatan', accounts: ['4-1000', '4-2000', '4-9000'] },
    { id: 'hpp', label: 'Harga pokok penjualan', accounts: ['5-1000', '5-1900'] },
    { id: 'opex', label: 'Beban operasional', accounts: ['5-2100', '5-2200', '5-2300', '5-2400'] },
    { id: 'ga', label: 'Beban umum & administrasi', accounts: ['5-3100', '5-3200', '5-3300', '5-3400', '5-3500', '5-3600', '5-3700'] },
    { id: 'lain', label: 'Pendapatan (beban) lain-lain', accounts: ['4-3000', '5-4000', '5-4100'] },
  ];

  /** Nilai periode berjalan per akun laba rugi (positif = menambah laba). */
  function plAmounts(ctx) {
    const bal = balances(ctx);
    const amt = {};
    DATA.chartOfAccounts.filter((a) => a.type === 'Detail' && /^[45]/.test(a.code)).forEach((a) => {
      const b = bal[a.code];
      const mut = b ? (a.code.startsWith('4') ? b.credit - b.debit : b.debit - b.credit) : 0; // sisi normal
      amt[a.code] = a.code.startsWith('4') ? mut : -mut;
    });
    return amt;
  }

  function incomeStatement(ctx) {
    const amt = plAmounts(ctx);
    const g = (id) => PL_GROUPS.find((x) => x.id === id).accounts.reduce((s, c) => s + (amt[c] || 0), 0);
    const revenue = g('pendapatan'), cogs = -g('hpp'), gross = revenue - cogs;
    const opex = -g('opex'), ga = -g('ga'), operating = gross - opex - ga;
    const other = g('lain'), net = operating + other;
    return {
      groups: PL_GROUPS.map((grp) => ({ ...grp, rows: grp.accounts.map((c) => ({ code: c, name: acctName(c), amount: amt[c] || 0 })).filter((r) => r.amount) })),
      amounts: amt, revenue, cogs, gross, opex, ga, operating, other, net,
      grossMargin: revenue ? (gross / revenue) * 100 : 0, netMargin: revenue ? (net / revenue) * 100 : 0,
    };
  }

  /** Laba (rugi) sejak awal tahun buku s.d. akhir periode — untuk ekuitas neraca. */
  function ytdProfit(branch, to) {
    const ls = lines(branch, FISCAL_START, to);
    return ls.reduce((s, l) => s + (l.account.startsWith('4') ? l.credit - l.debit : l.account.startsWith('5') ? l.credit - l.debit : 0), 0);
  }

  /* --- Neraca ---------------------------------------------------------------- */
  function balanceSheet(ctx) {
    const p = period(ctx.period);
    const bal = balances(ctx);
    const section = (prefix) => DATA.chartOfAccounts
      .filter((a) => a.type === 'Detail' && a.code.startsWith(prefix))
      .map((a) => ({ code: a.code, name: a.name, amount: bal[a.code] ? bal[a.code].ending : 0, parent: a.parent, interco: INTERCO.has(a.code) }))
      .filter((r) => r.amount);
    const assets = section('1'), liabilities = section('2'), equity = section('3');
    const profit = ytdProfit(ctx.branch, p.to);
    const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0);
    const totalAssets = sum(assets), totalLiab = sum(liabilities), totalEquity = sum(equity) + profit;
    return {
      asOf: p.to, assets, liabilities, equity, profit,
      totalAssets, totalLiab, totalEquity, totalLiabEquity: totalLiab + totalEquity,
      balanced: Math.abs(totalAssets - (totalLiab + totalEquity)) < 1,
      currentAssets: sum(assets.filter((r) => r.parent === '1-1000')),
      fixedAssets: sum(assets.filter((r) => r.parent === '1-2000')),
    };
  }

  /* --- Konsolidasi: kolom per cabang + eliminasi + total -------------------- */
  function consolidate(kind, ctx) {
    const cols = DATA.branches.filter((b) => b.status !== 'nonaktif').map((b) => ({ id: b.id, label: b.short, report: (kind === 'pl' ? incomeStatement : balanceSheet)({ ...ctx, branch: b.id }) }));
    const combined = (kind === 'pl' ? incomeStatement : balanceSheet)({ ...ctx, branch: 'ALL' });
    return { cols, combined };
  }

  /* --- Bank & kas ------------------------------------------------------------ */
  function bankBalance(bankId, asOf) {
    const k = bankOf(bankId);
    if (!k || k.currency !== 'IDR') return k ? k.opening : 0;
    return lines('ALL', null, asOf || TODAY).filter((l) => l.bank === bankId).reduce((s, l) => s + l.debit - l.credit, 0);
  }

  /* --- Sub-buku & rekonsiliasi antar modul ----------------------------------- */
  function checks(ctx) {
    const asOf = period(ctx.period).to;
    const bal = balances(ctx);
    const gl = (code) => (bal[code] ? bal[code].ending : 0);
    const inB = (r) => ctx.branch === 'ALL' || r.branch === ctx.branch;
    const res = [];
    const add = (id, label, source, sub, glv, note, module) => res.push({ id, label, module, source, sub, gl: glv, diff: sub - glv, ok: Math.abs(sub - glv) < 1, note });

    const openAt = (d) => d.amount - ((d.paidDate || d.date) <= asOf ? d.paid : 0);
    const ar = DATA.invoices.filter((i) => inB(i) && i.date <= asOf).reduce((s, i) => s + openAt(i), 0);
    add('ar', 'Piutang usaha', 'Σ sisa tagihan faktur (modul Faktur)', ar, gl('1-1200'), 'Setiap faktur & penerimaan diposting otomatis ke 1-1200', 'faktur');
    const ap = DATA.payables.filter((i) => inB(i) && i.date <= asOf).reduce((s, i) => s + openAt(i), 0);
    add('ap', 'Hutang usaha', 'Σ sisa bayar tagihan pemasok (modul Hutang)', ap, gl('2-1100'), 'Setiap tagihan & pembayaran diposting otomatis ke 2-1100', 'hutang');
    const banks = DATA.bankAccounts.filter((k) => inB(k) && k.currency === 'IDR').reduce((s, k) => s + bankBalance(k.id, asOf), 0);
    add('bank', 'Kas & bank', 'Σ saldo rekening IDR (modul Kas & Bank)', banks, gl('1-1100'), 'Rekening valas (USD) tidak dikonsolidasi ke IDR', 'kas-bank');
    if (asOf >= TODAY) {
      const inv = DATA.stockItems.filter((s) => inB(s)).reduce((s, it) => s + it.onHand * it.cost, 0);
      add('inv', 'Persediaan', 'Σ kuantitas × harga pokok (kartu stok)', inv, gl('1-1400') + gl('1-1450') + gl('1-1500'), 'Bahan baku, barang dalam proses, dan barang jadi', 'stok');
      const fa = DATA.assets.filter((a) => inB(a)).reduce((s, a) => s + a.acquisitionCost, 0);
      add('fa', 'Aset tetap — harga perolehan', 'Σ nilai perolehan (register aset)', fa, gl('1-2300') + gl('1-2400') + gl('1-2500'), 'Tanah & bangunan dicatat langsung di buku besar', 'aset');
      const nbv = DATA.assets.filter((a) => inB(a)).reduce((s, a) => s + (a.status === 'aktif' ? a.bookValue : 0), 0);
      add('nbv', 'Aset tetap — nilai buku', 'Σ nilai buku register aset', nbv, gl('1-2300') + gl('1-2400') + gl('1-2500') + gl('1-2900'), 'Akumulasi penyusutan (1-2900) bersaldo kredit sebagai akun kontra', 'aset');
      const unpaid = DATA.payroll.filter((p) => inB(p) && p.status === 'diproses').reduce((s, p) => s + p.netPay, 0);
      add('pay', 'Utang gaji', 'Σ gaji bersih berstatus diproses (modul Penggajian)', unpaid, gl('2-1200'), 'Slip berstatus draf belum dijurnal', 'penggajian');
    }
    const tb = trialBalance(ctx);
    res.push({ id: 'tb', label: 'Neraca saldo', module: 'neraca-saldo', source: 'Σ debit', sub: tb.totals.endD, gl: tb.totals.endK, diff: tb.totals.endD - tb.totals.endK, ok: Math.abs(tb.totals.endD - tb.totals.endK) < 1, note: 'Σ debit harus sama dengan Σ kredit' });
    const bs = balanceSheet(ctx);
    res.push({ id: 'bs', label: 'Neraca', module: 'neraca', source: 'Total aset', sub: bs.totalAssets, gl: bs.totalLiabEquity, diff: bs.totalAssets - bs.totalLiabEquity, ok: bs.balanced, note: 'Aset = liabilitas + ekuitas (termasuk laba periode berjalan)' });
    if (ctx.branch === 'ALL') {
      const rkC = gl(RK_CABANG), rkP = gl(RK_PUSAT);
      res.push({ id: 'rk', label: 'Rekening koran antar kantor', module: 'cabang', source: 'RK Cabang (kantor pusat)', sub: rkC, gl: rkP, diff: rkC - rkP, ok: Math.abs(rkC - rkP) < 1, note: 'Dieliminasi pada laporan konsolidasi' });
    }
    const unbalanced = all().filter((j) => !j.balanced).length;
    res.push({ id: 'jv', label: 'Keseimbangan jurnal', module: 'jurnal', source: 'Jurnal tidak seimbang', sub: unbalanced, gl: 0, diff: unbalanced, ok: unbalanced === 0, note: 'Setiap jurnal wajib Σ debit = Σ kredit', count: true });
    return res;
  }

  /** Ringkasan alur posting per modul sumber. */
  function postingSummary(ctx) {
    const p = period(ctx.period);
    const map = {};
    all().forEach((j) => {
      if (!inBranch(j, ctx.branch) || j.date < p.from || j.date > p.to) return;
      const m = (map[j.source] ||= { source: j.source, count: 0, posted: 0, pending: 0, amount: 0 });
      m.count += 1;
      if (posted(j)) { m.posted += 1; m.amount += j.total; } else m.pending += 1;
    });
    return Object.values(map);
  }

  /* --- KPI cabang ------------------------------------------------------------ */
  function branchKpis(branchId, periodId) {
    const ctx = { branch: branchId, period: periodId };
    const pl = incomeStatement(ctx);
    const bs = balanceSheet(ctx);
    const g = (rows, code) => { const r = rows.find((x) => x.code === code); return r ? r.amount : 0; };
    return {
      revenue: pl.revenue, gross: pl.gross, net: pl.net, grossMargin: pl.grossMargin, netMargin: pl.netMargin,
      cash: g(bs.assets, '1-1100'), ar: g(bs.assets, '1-1200'), ap: g(bs.liabilities, '2-1100'),
      inventory: g(bs.assets, '1-1400') + g(bs.assets, '1-1450') + g(bs.assets, '1-1500'),
      totalAssets: bs.totalAssets,
      employees: DATA.employees.filter((e) => branchId === 'ALL' || e.branch === branchId).length,
    };
  }

  /** Pendapatan bulanan Jan–Agu (untuk grafik tren). */
  function monthlyRevenue(branch) {
    return MONTHS.map((m) => lines(branch, `2026-${m}-01`, monthEnd(m))
      .filter((l) => l.account.startsWith('4')).reduce((s, l) => s + l.credit - l.debit, 0));
  }

  const monthLabels = () => MONTHS.map((m) => BULAN[m]);

  /* --- Umur piutang / hutang dari sub-buku ------------------------------------ */
  function aging(kind, branch) {
    const docs = (kind === 'ar' ? DATA.invoices : DATA.payables).filter((d) => branch === 'ALL' || d.branch === branch);
    const buckets = [
      { label: 'Belum jatuh tempo', short: 'Lancar', min: -Infinity, max: 0 },
      { label: '1–30 hari', short: '1–30', min: 1, max: 30 },
      { label: '31–60 hari', short: '31–60', min: 31, max: 60 },
      { label: '61–90 hari', short: '61–90', min: 61, max: 90 },
      { label: 'Lebih dari 90 hari', short: '>90', min: 91, max: Infinity },
    ].map((b) => ({ ...b, value: 0, count: 0 }));
    docs.forEach((d) => {
      const open = d.amount - d.paid;
      if (open <= 0) return;
      const days = daysBetween(d.dueDate, TODAY);
      const b = buckets.find((x) => days >= x.min && days <= x.max) || buckets[0];
      b.value += open; b.count += 1;
    });
    return buckets;
  }
  function daysBetween(a, b) {
    const da = new Date(a + 'T00:00:00Z'), db = new Date(b + 'T00:00:00Z');
    return Math.round((db - da) / 86400000);
  }

  /* --- Validasi jurnal manual -------------------------------------------------- */
  function validate(j) {
    const errs = [];
    if (!j.date) errs.push('Tanggal wajib diisi.');
    const p = DATA.periods.find((x) => x.closed && j.date >= x.from && j.date <= x.to);
    if (p) errs.push(`Periode ${p.label} sudah ditutup; jurnal tidak dapat diposting ke periode terkunci.`);
    if (!DATA.branches.some((b) => b.id === j.branch)) errs.push('Cabang tidak dikenal.');
    const ls = (j.lines || []).filter((l) => l.debit || l.credit);
    if (ls.length < 2) errs.push('Jurnal memerlukan minimal dua baris.');
    ls.forEach((l) => {
      const a = acct(l.account);
      if (!a) errs.push(`Akun ${l.account} tidak ada di bagan akun.`);
      else if (a.type !== 'Detail') errs.push(`Akun ${a.code} ${a.name} adalah akun header — hanya akun detail yang menerima jurnal.`);
      if (l.debit && l.credit) errs.push(`Baris ${l.account}: isi debit atau kredit, bukan keduanya.`);
      if (l.account === '1-1100' && !l.bank) errs.push('Baris Kas & Bank (1-1100) harus menyebut rekening agar sub-buku bank tetap cocok dengan buku besar.');
      if (l.bank) {
        const k = bankOf(l.bank);
        if (!k) errs.push(`Rekening ${l.bank} tidak dikenal.`);
        else if (k.branch !== j.branch) errs.push(`Rekening ${k.name} milik cabang ${k.branch}, bukan ${j.branch}.`);
      }
    });
    const dr = ls.reduce((s, l) => s + (l.debit || 0), 0), cr = ls.reduce((s, l) => s + (l.credit || 0), 0);
    if (Math.abs(dr - cr) >= 1) errs.push(`Tidak seimbang: debit ${FMT.rp(dr)} ≠ kredit ${FMT.rp(cr)}.`);
    return errs;
  }

  return {
    FISCAL_START, TODAY, HO, RK_CABANG, RK_PUSAT, INTERCO, PL_GROUPS,
    all, invalidate, addJournal, setStatus, byRef, period, lines, balances, glCard, trialBalance,
    incomeStatement, balanceSheet, consolidate, ytdProfit, bankBalance, checks, postingSummary,
    branchKpis, monthlyRevenue, monthLabels, aging, validate, isDebitNormal, acctName, daysBetween,
  };
})();
