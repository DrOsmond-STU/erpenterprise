/* ==========================================================================
   Laporan keuangan — seluruhnya dihitung langsung dari buku besar terposting.
   Neraca, Laba Rugi, Arus Kas, Neraca Saldo, Buku Besar, umur piutang/hutang,
   valuasi persediaan, anggaran vs realisasi, laporan per cabang, dan
   laporan konsolidasi grup dengan eliminasi antar perusahaan & investasi.
   ========================================================================== */
import * as db from '../db.js';
import { acct } from './posting.js';
import { bad, round2, isDate, today } from '../lib/util.js';

export const DEBIT_NORMAL = new Set(['asset', 'cogs', 'expense', 'other_expense', 'tax']);
export const PL_TYPES = ['revenue', 'cogs', 'expense', 'other_income', 'other_expense', 'tax'];
const EPS = 0.005;

export const TYPE_LABEL = {
  asset: 'Aset', liability: 'Liabilitas', equity: 'Ekuitas', revenue: 'Pendapatan', cogs: 'Beban Pokok Penjualan',
  expense: 'Beban Operasional', other_income: 'Pendapatan Lain-lain', other_expense: 'Beban Lain-lain', tax: 'Beban Pajak Penghasilan',
};

const yearStart = (d) => `${d.slice(0, 4)}-01-01`;
const dayBefore = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };

function accounts() {
  const list = db.all('SELECT id, code, name, type, subtype, parent_id, is_header, is_intercompany, cash_flow FROM accounts ORDER BY code');
  const byId = new Map(list.map((a) => [a.id, a]));
  for (const a of list) {
    let lvl = 0, p = a.parent_id;
    while (p && byId.has(p) && lvl < 10) { lvl++; p = byId.get(p).parent_id; }
    a.level = lvl;
  }
  return { list, byId };
}

/** Saldo bersih (D − K) per akun untuk sekumpulan perusahaan/cabang dan rentang tanggal. */
export function balances({ companyIds, branchId = null, from = null, to = null }) {
  if (!companyIds?.length) return new Map();
  const where = [`j.status = 'diposting'`, `jl.company_id IN (${companyIds.map(() => '?').join(',')})`];
  const params = [...companyIds];
  if (branchId) { where.push('jl.branch_id = ?'); params.push(branchId); }
  if (from) { where.push('j.date >= ?'); params.push(from); }
  if (to) { where.push('j.date <= ?'); params.push(to); }
  const rows = db.all(`SELECT jl.account_id a, ROUND(SUM(jl.debit),2) d, ROUND(SUM(jl.credit),2) c FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE ${where.join(' AND ')} GROUP BY jl.account_id`, ...params);
  return new Map(rows.map((r) => [r.a, { d: r.d, c: r.c, net: round2(r.d - r.c) }]));
}

export const netOf = (m, id) => m.get(id)?.net || 0;
export const signFor = (type) => (DEBIT_NORMAL.has(type) ? 1 : -1);

/* --- Pembentuk pohon akun -------------------------------------------------- */
function buildSection(accs, types, valueFn, colKeys) {
  const included = accs.list.filter((a) => types.includes(a.type));
  const vals = new Map();
  for (const a of included) if (!a.is_header) vals.set(a.id, Object.fromEntries(colKeys.map((k) => [k, round2(valueFn(a, k))])));
  // Agregasi ke akun induk.
  for (const a of [...included].reverse()) {
    if (!a.is_header) continue;
    const v = Object.fromEntries(colKeys.map((k) => [k, 0]));
    for (const c of included.filter((x) => x.parent_id === a.id)) for (const k of colKeys) v[k] = round2(v[k] + (vals.get(c.id)?.[k] || 0));
    vals.set(a.id, v);
  }
  const nonzero = (id) => colKeys.some((k) => Math.abs(vals.get(id)?.[k] || 0) > EPS);
  const rows = included.filter((a) => nonzero(a.id)).map((a) => ({ id: a.id, code: a.code, name: a.name, level: a.level, header: !!a.is_header, values: vals.get(a.id) }));
  const total = Object.fromEntries(colKeys.map((k) => [k, round2(included.filter((a) => !a.is_header).reduce((s, a) => s + (vals.get(a.id)?.[k] || 0), 0))]));
  return { rows, total };
}

const addV = (...vs) => Object.fromEntries(Object.keys(vs[0]).map((k) => [k, round2(vs.reduce((s, v) => s + (v[k] || 0), 0))]));
const subV = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, round2(a[k] - (b[k] || 0))]));

/* --- Kolom laporan ------------------------------------------------------------ */
export function columnsFor(ctx, mode, companyId, branchId) {
  if (mode === 'branch') {
    const cols = ctx.branches.map((b) => ({ key: `b${b.id}`, label: b.name, companyIds: [companyId], branchId: b.id }));
    if (!ctx.user.branch_id) cols.push({ key: 'total', label: 'Total perusahaan', companyIds: [companyId], branchId: null, total: true });
    return cols;
  }
  return [{ key: 'v', label: branchId ? (ctx.branches.find((b) => b.id === branchId)?.name || 'Cabang') : 'Jumlah', companyIds: [companyId], branchId }];
}

/** Anggota grup konsolidasi: induk + seluruh anak perusahaan (rekursif). */
export function groupMembers(parentId) {
  const all = db.all("SELECT id, code, name, parent_id, ownership_pct FROM companies WHERE status = 'aktif'");
  const out = [all.find((c) => c.id === parentId)];
  if (!out[0]) throw bad('Perusahaan induk tidak ditemukan.');
  const walk = (pid, eff) => {
    for (const c of all.filter((x) => x.parent_id === pid)) {
      const pct = eff * ((c.ownership_pct ?? 100) / 100);
      out.push({ ...c, effective_pct: pct });
      walk(c.id, pct);
    }
  };
  out[0].effective_pct = 1;
  walk(parentId, 1);
  return out;
}

/* --- Laba rugi ----------------------------------------------------------------- */
export function incomeStatement(ctx, { companyId, branchId, from, to, mode = 'single' }) {
  if (!isDate(from) || !isDate(to) || from > to) throw bad('Rentang tanggal tidak valid.');
  const accs = accounts();
  const cols = mode === 'consolidated' ? consolidationColumns(ctx, companyId) : columnsFor(ctx, mode, companyId, branchId);
  const entityCols = cols.filter((c) => !c.virtual);
  const bal = Object.fromEntries(entityCols.map((c) => [c.key, balances({ companyIds: c.companyIds, branchId: c.branchId, from, to })]));
  const keys = cols.map((c) => c.key);

  const val = (a, k) => {
    if (k === 'elim') return a.is_intercompany ? -entityCols.reduce((s, c) => s + signFor(a.type) * netOf(bal[c.key], a.id), 0) : 0;
    if (k === 'cons') return entityCols.filter((c) => !c.total).reduce((s, c) => s + signFor(a.type) * netOf(bal[c.key], a.id), 0) + val(a, 'elim');
    return signFor(a.type) * netOf(bal[k], a.id);
  };
  const sec = (t) => ({ key: t, label: TYPE_LABEL[t], ...buildSection(accs, [t], val, keys) });
  const s = Object.fromEntries(PL_TYPES.map((t) => [t, sec(t)]));
  const gross = subV(s.revenue.total, s.cogs.total);
  const operating = subV(gross, s.expense.total);
  const pbt = subV(addV(operating, s.other_income.total), s.other_expense.total);
  const net = subV(pbt, s.tax.total);

  const report = {
    title: 'Laporan Laba Rugi', period: { from, to }, columns: cols.map(({ key, label, kind }) => ({ key, label, kind })),
    blocks: [
      { section: s.revenue }, { section: s.cogs }, { subtotal: 'Laba kotor', values: gross },
      { section: s.expense }, { subtotal: 'Laba usaha', values: operating },
      { section: s.other_income }, { section: s.other_expense }, { subtotal: 'Laba sebelum pajak', values: pbt },
      { section: s.tax }, { subtotal: 'Laba (rugi) bersih', values: net, grand: true },
    ],
    netIncome: net,
  };
  if (mode === 'consolidated') {
    const nci = nciShare(cols, (c) => net[c.key]);
    report.blocks.push({ subtotal: 'Diatribusikan kepada pemilik entitas induk', values: { ...zero(keys), cons: round2(net.cons - nci) } });
    report.blocks.push({ subtotal: 'Diatribusikan kepada kepentingan non-pengendali', values: { ...zero(keys), cons: nci } });
  }
  return report;
}

const zero = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));

function nciShare(cols, valueOf) {
  return round2(cols.filter((c) => c.member && c.member.effective_pct < 1).reduce((s, c) => s + (1 - c.member.effective_pct) * valueOf(c), 0));
}

function consolidationColumns(ctx, parentId) {
  if (ctx.user.company_id || ctx.user.branch_id) throw bad('Laporan konsolidasi memerlukan akses ke seluruh perusahaan grup.');
  const members = groupMembers(parentId);
  return [
    ...members.map((m) => ({ key: `c${m.id}`, label: m.name, companyIds: [m.id], branchId: null, member: m, kind: 'entity' })),
    { key: 'elim', label: 'Eliminasi', virtual: true, kind: 'elim' },
    { key: 'cons', label: 'Konsolidasi', virtual: true, kind: 'total' },
  ];
}

/* --- Neraca ------------------------------------------------------------------ */
export function balanceSheet(ctx, { companyId, branchId, asOf, mode = 'single' }) {
  if (!isDate(asOf)) throw bad('Tanggal neraca tidak valid.');
  const accs = accounts();
  const cols = mode === 'consolidated' ? consolidationColumns(ctx, companyId) : columnsFor(ctx, mode, companyId, branchId);
  const entityCols = cols.filter((c) => !c.virtual);
  const keys = cols.map((c) => c.key);
  const fy = yearStart(asOf);
  const bal = Object.fromEntries(entityCols.map((c) => [c.key, balances({ companyIds: c.companyIds, branchId: c.branchId, to: asOf })]));
  const plPrior = Object.fromEntries(entityCols.map((c) => [c.key, balances({ companyIds: c.companyIds, branchId: c.branchId, to: dayBefore(fy) })]));
  const plCurrent = Object.fromEntries(entityCols.map((c) => [c.key, balances({ companyIds: c.companyIds, branchId: c.branchId, from: fy, to: asOf })]));
  const plSum = (m) => round2(accs.list.filter((a) => PL_TYPES.includes(a.type)).reduce((s, a) => s - netOf(m, a.id), 0)); // positif = laba

  const members = entityCols.filter((c) => c.member && c.member.effective_pct < 1 && c.member.id !== companyId);
  const subsAll = entityCols.filter((c) => c.member && c.member.id !== companyId);
  const invId = mode === 'consolidated' ? acct('investment_sub') : null;
  const capId = mode === 'consolidated' ? acct('share_capital') : null;
  const pctOf = (c) => c.member.effective_pct;

  const raw = (a, k) => signFor(a.type) * netOf(bal[k], a.id);
  const elimFor = (a) => {
    let v = 0;
    if (a.is_intercompany) v -= entityCols.reduce((s, c) => s + raw(a, c.key), 0);
    if (a.id === invId) v -= entityCols.reduce((s, c) => s + raw(a, c.key), 0);
    if (a.id === capId) v -= subsAll.reduce((s, c) => s + raw(a, c.key), 0);
    return v;
  };
  const val = (a, k) => {
    if (k === 'elim') return elimFor(a);
    if (k === 'cons') return entityCols.reduce((s, c) => s + raw(a, c.key), 0) + elimFor(a);
    return raw(a, k);
  };
  const assets = buildSection(accs, ['asset'], val, keys);
  const liab = buildSection(accs, ['liability'], val, keys);
  const equity = buildSection(accs, ['equity'], val, keys);

  const prior = {}, current = {};
  for (const c of entityCols) { prior[c.key] = plSum(plPrior[c.key]); current[c.key] = plSum(plCurrent[c.key]); }

  const extraAssets = [], extraEquity = [];
  if (mode === 'consolidated') {
    const sumE = (o) => round2(entityCols.reduce((s, c) => s + o[c.key], 0));
    // Eliminasi antar perusahaan pada laba rugi tidak mengubah laba jika seimbang;
    // selisih IC dicatat sebagai baris tersendiri agar neraca tetap seimbang.
    const icPL = round2(accs.list.filter((a) => a.is_intercompany && PL_TYPES.includes(a.type)).reduce((s, a) => s + entityCols.reduce((x, c) => x - netOf(plCurrent[c.key], a.id), 0), 0));
    const capOf = (c) => raw(accs.byId.get(capId), c.key);
    const invTotal = round2(entityCols.reduce((s, c) => s + raw(accs.byId.get(invId), c.key), 0));
    const goodwill = round2(invTotal - subsAll.reduce((s, c) => s + pctOf(c) * capOf(c), 0));
    const nciPrior = round2(members.reduce((s, c) => s + (1 - pctOf(c)) * prior[c.key], 0));
    const nciCurrent = round2(members.reduce((s, c) => s + (1 - pctOf(c)) * current[c.key], 0));
    const nciCap = round2(members.reduce((s, c) => s + (1 - pctOf(c)) * capOf(c), 0));
    const nciEquityOther = round2(members.reduce((s, c) => s + (1 - pctOf(c)) * (raw(accs.byId.get(acct('retained_earnings')), c.key)), 0));
    prior.elim = -nciPrior; prior.cons = round2(sumE(prior) - nciPrior);
    current.elim = round2(-nciCurrent - icPL); current.cons = round2(sumE(current) - nciCurrent - icPL);
    const gw = { ...zero(keys), elim: goodwill, cons: goodwill };
    if (Math.abs(goodwill) > EPS) extraAssets.push({ name: goodwill >= 0 ? 'Goodwill (konsolidasi)' : 'Selisih lebih akuisisi (konsolidasi)', values: gw });
    const nci = round2(nciCap + nciPrior + nciCurrent + nciEquityOther);
    // Bagian NCI atas saldo laba (akun) dikeluarkan dari ekuitas induk.
    if (Math.abs(nciEquityOther) > EPS) extraEquity.push({ name: 'Bagian NCI atas saldo laba', values: { ...zero(keys), elim: -nciEquityOther, cons: -nciEquityOther } });
    extraEquity.push({ name: 'Kepentingan non-pengendali', values: { ...zero(keys), elim: nci, cons: nci } });
    // Selisih rekonsiliasi antar perusahaan (nol bila kedua sisi transaksi IC sudah dicatat).
    const residual = round2(-accs.list.filter((a) => a.is_intercompany).reduce((s, a) => s + entityCols.reduce((x, c) => x + netOf(PL_TYPES.includes(a.type) ? plCurrent[c.key] : bal[c.key], a.id), 0), 0));
    if (Math.abs(residual) > EPS) extraEquity.push({ name: 'Selisih rekonsiliasi antar perusahaan', values: { ...zero(keys), elim: residual, cons: residual } });
  } else {
    for (const k of keys) if (prior[k] === undefined) {
      // Kolom total cabang (mode branch) sudah dihitung sebagai kolom entitas.
      prior[k] = 0; current[k] = 0;
    }
  }

  const totalAssets = addV(assets.total, ...extraAssets.map((r) => r.values));
  const totalEquity = addV(equity.total, prior, current, ...extraEquity.map((r) => r.values));
  const totalLE = addV(liab.total, totalEquity);
  const diff = subV(totalAssets, totalLE);

  return {
    title: 'Laporan Posisi Keuangan (Neraca)', asOf, columns: cols.map(({ key, label, kind }) => ({ key, label, kind })),
    blocks: [
      { section: { key: 'asset', label: 'Aset', ...assets }, extra: extraAssets, totalLabel: 'Total aset', total: totalAssets },
      { section: { key: 'liability', label: 'Liabilitas', ...liab }, totalLabel: 'Total liabilitas', total: liab.total },
      {
        section: { key: 'equity', label: 'Ekuitas', ...equity },
        extra: [{ name: 'Saldo laba tahun-tahun lalu (belum ditutup)', values: prior }, { name: 'Laba (rugi) tahun berjalan', values: current }, ...extraEquity],
        totalLabel: 'Total ekuitas', total: totalEquity,
      },
      { subtotal: 'Total liabilitas dan ekuitas', values: totalLE, grand: true },
    ],
    balanced: Object.values(diff).every((v) => Math.abs(v) < 1),
    diff,
  };
}

/* --- Neraca saldo -------------------------------------------------------------- */
export function trialBalance(ctx, { companyId, branchId, from, to }) {
  const accs = accounts();
  const cids = [companyId];
  const fy = yearStart(from);
  const openBS = balances({ companyIds: cids, branchId, to: dayBefore(from) });
  const openPL = from > fy ? balances({ companyIds: cids, branchId, from: fy, to: dayBefore(from) }) : new Map();
  const mov = balances({ companyIds: cids, branchId, from, to });
  const rows = [];
  const tot = { opening: 0, debit: 0, credit: 0, closing: 0 };
  for (const a of accs.list.filter((x) => !x.is_header)) {
    const opening = PL_TYPES.includes(a.type) ? netOf(openPL, a.id) : netOf(openBS, a.id);
    const m = mov.get(a.id) || { d: 0, c: 0 };
    const closing = round2(opening + m.d - m.c);
    if (Math.abs(opening) < EPS && !m.d && !m.c) continue;
    rows.push({ id: a.id, code: a.code, name: a.name, type: a.type, opening, debit: m.d, credit: m.c, closing });
    tot.opening = round2(tot.opening + opening); tot.debit = round2(tot.debit + m.d); tot.credit = round2(tot.credit + m.c); tot.closing = round2(tot.closing + closing);
  }
  return { title: 'Neraca Saldo', period: { from, to }, rows, totals: tot, balanced: Math.abs(tot.debit - tot.credit) < EPS && Math.abs(tot.closing) < 1 };
}

/* --- Buku besar ----------------------------------------------------------------- */
export function generalLedger(ctx, { companyId, branchId, from, to, accountId }) {
  const a = db.get('SELECT * FROM accounts WHERE id = ?', Number(accountId));
  if (!a) throw bad('Pilih akun.');
  const fy = yearStart(from);
  const openMap = PL_TYPES.includes(a.type)
    ? (from > fy ? balances({ companyIds: [companyId], branchId, from: fy, to: dayBefore(from) }) : new Map())
    : balances({ companyIds: [companyId], branchId, to: dayBefore(from) });
  let running = netOf(openMap, a.id);
  const opening = running;
  const where = ["j.status = 'diposting'", 'jl.account_id = ?', 'jl.company_id = ?', 'j.date BETWEEN ? AND ?'];
  const params = [a.id, companyId, from, to];
  if (branchId) { where.push('jl.branch_id = ?'); params.push(branchId); }
  const lines = db.all(`SELECT j.id journal_id, j.number, j.date, j.description, j.source_type, j.source_id, j.source_no, jl.memo, jl.debit, jl.credit, b.name branch
    FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN branches b ON b.id = jl.branch_id
    WHERE ${where.join(' AND ')} ORDER BY j.date, j.id, jl.line_no LIMIT 5000`, ...params);
  for (const l of lines) { running = round2(running + l.debit - l.credit); l.balance = running; }
  return { title: `Buku Besar ${a.code} ${a.name}`, account: a, period: { from, to }, opening, closing: running, lines };
}

/* --- Arus kas (metode langsung dari buku besar) --------------------------------- */
export function cashFlow(ctx, { companyId, branchId, from, to }) {
  const cashIds = db.all("SELECT id FROM accounts WHERE subtype = 'cash'").map((r) => r.id);
  if (!cashIds.length) return { title: 'Laporan Arus Kas', sections: [] };
  const inList = cashIds.map(() => '?').join(',');
  const bf = branchId ? ' AND jl.branch_id = ?' : '';
  const bp = branchId ? [branchId] : [];
  const opening = round2(db.get(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status='diposting' AND jl.company_id = ? AND jl.account_id IN (${inList}) AND j.date < ?${bf}`, companyId, ...cashIds, from, ...bp).v);
  const rows = db.all(`
    SELECT a.id, a.code, a.name, a.cash_flow, a.code = ? AS is_rak, ROUND(SUM(jl.credit - jl.debit),2) amount
    FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id
    WHERE j.status = 'diposting' AND jl.company_id = ? AND j.date BETWEEN ? AND ?${bf}
      AND jl.account_id NOT IN (${inList})
      AND EXISTS (SELECT 1 FROM journal_lines c WHERE c.parent_id = j.id AND c.account_id IN (${inList})${branchId ? ' AND c.branch_id = ?' : ''})
    GROUP BY a.id HAVING ABS(amount) > 0.004 ORDER BY a.code`,
  db.get('SELECT code FROM accounts WHERE id = ?', acct('inter_branch')).code, companyId, from, to, ...bp, ...cashIds, ...cashIds, ...bp);
  const cats = [['operating', 'Arus kas dari aktivitas operasi'], ['investing', 'Arus kas dari aktivitas investasi'], ['financing', 'Arus kas dari aktivitas pendanaan'], ['interbranch', 'Arus kas antar cabang']];
  const sections = cats.map(([k, label]) => {
    const rs = rows.filter((r) => (r.is_rak ? 'interbranch' : r.cash_flow || 'operating') === k);
    return { key: k, label, rows: rs.map((r) => ({ code: r.code, name: r.name, amount: r.amount })), total: round2(rs.reduce((s, r) => s + r.amount, 0)) };
  }).filter((s) => s.rows.length);
  const net = round2(sections.reduce((s, x) => s + x.total, 0));
  const closing = round2(db.get(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status='diposting' AND jl.company_id = ? AND jl.account_id IN (${inList}) AND j.date <= ?${bf}`, companyId, ...cashIds, to, ...bp).v);
  return { title: 'Laporan Arus Kas (metode langsung)', period: { from, to }, opening, sections, net, closing, balanced: Math.abs(opening + net - closing) < 1 };
}

/* --- Umur piutang & hutang ------------------------------------------------------- */
function aging(table, partyTable, partyField, ctx, { companyId, branchId, asOf }) {
  const where = [`d.company_id = ?`, `d.status IN ('terbit','sebagian')`, 'd.date <= ?'];
  const params = [companyId, asOf];
  if (branchId) { where.push('d.branch_id = ?'); params.push(branchId); }
  const docs = db.all(`SELECT d.id, d.number, d.date, d.due_date, ROUND((d.total - d.paid) * COALESCE(d.exchange_rate, 1),2) open, ROUND(d.total - d.paid,2) open_doc, d.exchange_rate, p.name party, p.id party_id, b.name branch
    FROM "${table}" d JOIN "${partyTable}" p ON p.id = d."${partyField}" JOIN branches b ON b.id = d.branch_id WHERE ${where.join(' AND ')} ORDER BY d.due_date`, ...params);
  const B = [['current', 'Belum jatuh tempo'], ['d30', '1–30 hari'], ['d60', '31–60 hari'], ['d90', '61–90 hari'], ['over', '> 90 hari']];
  const bucket = (days) => (days <= 0 ? 'current' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'over');
  const parties = new Map();
  const totals = Object.fromEntries(B.map(([k]) => [k, 0]));
  for (const d of docs) {
    d.days = Math.round((Date.parse(asOf) - Date.parse(d.due_date || d.date)) / 864e5);
    d.bucket = bucket(d.days);
    const p = parties.get(d.party_id) || { party: d.party, ...Object.fromEntries(B.map(([k]) => [k, 0])), total: 0 };
    p[d.bucket] = round2(p[d.bucket] + d.open); p.total = round2(p.total + d.open);
    parties.set(d.party_id, p);
    totals[d.bucket] = round2(totals[d.bucket] + d.open);
  }
  totals.total = round2(Object.values(totals).reduce((s, v) => s + v, 0));
  return { buckets: B.map(([key, label]) => ({ key, label })), parties: [...parties.values()].sort((a, b) => b.total - a.total), docs, totals };
}

export function arAging(ctx, q) {
  const r = aging('sales_invoices', 'customers', 'customer_id', ctx, q);
  const gl = balances({ companyIds: [q.companyId], branchId: q.branchId, to: q.asOf });
  r.glBalance = round2(netOf(gl, acct('ar')) + netOf(gl, acct('ic_receivable')));
  r.reconciled = Math.abs(r.glBalance - r.totals.total) < 1;
  return { title: 'Umur Piutang Usaha', asOf: q.asOf, ...r };
}

export function apAging(ctx, q) {
  const r = aging('purchase_bills', 'suppliers', 'supplier_id', ctx, q);
  const gl = balances({ companyIds: [q.companyId], branchId: q.branchId, to: q.asOf });
  r.glBalance = round2(-(netOf(gl, acct('ap')) + netOf(gl, acct('ic_payable'))));
  r.reconciled = Math.abs(r.glBalance - r.totals.total) < 1;
  return { title: 'Umur Hutang Usaha', asOf: q.asOf, ...r };
}

/* --- Persediaan ------------------------------------------------------------------- */
export function inventoryValuation(ctx, { companyId, branchId }) {
  const where = ['w.company_id = ?'], params = [companyId];
  if (branchId) { where.push('w.branch_id = ?'); params.push(branchId); }
  const rows = db.all(`SELECT p.id, p.code, p.name, p.kind, p.uom, p.min_stock, p.max_stock, w.name warehouse, b.name branch,
      sb.qty, ROUND(sb.avg_cost,2) avg_cost, ROUND(sb.qty * sb.avg_cost, 2) value
    FROM stock_balances sb JOIN products p ON p.id = sb.product_id JOIN warehouses w ON w.id = sb.warehouse_id JOIN branches b ON b.id = w.branch_id
    WHERE ${where.join(' AND ')} AND (ABS(sb.qty) > 0.00001 OR p.min_stock > 0) ORDER BY p.code, w.name`, ...params);
  for (const r of rows) r.state = r.qty <= 0 ? 'habis' : r.qty <= r.min_stock ? 'kritis' : r.qty <= r.min_stock * 1.5 ? 'rendah' : 'aman';
  const total = round2(rows.reduce((s, r) => s + r.value, 0));
  const invAccts = db.all("SELECT id FROM accounts WHERE subtype = 'inventory' AND is_header = 0").map((r) => r.id);
  const gl = balances({ companyIds: [companyId], branchId });
  const glBalance = round2(invAccts.reduce((s, id) => s + netOf(gl, id), 0));
  return { title: 'Valuasi Persediaan', rows, total, glBalance, reconciled: Math.abs(total - glBalance) < 1 };
}

/* --- Anggaran vs realisasi ---------------------------------------------------- */
export function budgetVsActual(ctx, { companyId, branchId, year, asOf }) {
  const where = ['b.company_id = ?', 'b.year = ?'], params = [companyId, year];
  if (branchId) { where.push('b.branch_id = ?'); params.push(branchId); }
  const budgets = db.all(`SELECT b.account_id, a.code, a.name, a.type, ROUND(SUM(b.amount),2) budget FROM budgets b JOIN accounts a ON a.id = b.account_id WHERE ${where.join(' AND ')} GROUP BY b.account_id ORDER BY a.code`, ...params);
  const end = asOf && asOf.startsWith(String(year)) ? asOf : `${year}-12-31`;
  const act = balances({ companyIds: [companyId], branchId, from: `${year}-01-01`, to: end });
  const elapsed = Math.min(12, Number(end.slice(5, 7)));
  const rows = budgets.map((b) => {
    const actual = round2(signFor(b.type) * netOf(act, b.account_id));
    const forecast = round2(elapsed ? (actual / elapsed) * 12 : 0);
    const ytdBudget = round2(b.budget * elapsed / 12);
    return { ...b, ytdBudget, actual, variance: round2(actual - ytdBudget), forecast, usage: b.budget ? round2(actual / b.budget * 100) : 0 };
  });
  return { title: `Anggaran vs Realisasi ${year}`, asOf: end, monthsElapsed: elapsed, rows, totals: { budget: round2(rows.reduce((s, r) => s + r.budget, 0)), actual: round2(rows.reduce((s, r) => s + r.actual, 0)) } };
}

/* --- Dasbor --------------------------------------------------------------------- */
export function dashboard(ctx, { companyId, branchId }) {
  const asOf = today();
  const cids = [companyId];
  const yStart = yearStart(asOf);
  const mStart = asOf.slice(0, 8) + '01';
  const sumType = (m, types) => round2(db.all('SELECT id, type FROM accounts').filter((a) => types.includes(a.type)).reduce((s, a) => s + signFor(a.type) * netOf(m, a.id), 0));
  const ytd = balances({ companyIds: cids, branchId, from: yStart, to: asOf });
  const mtd = balances({ companyIds: cids, branchId, from: mStart, to: asOf });
  const all = balances({ companyIds: cids, branchId, to: asOf });
  const cashIds = db.all("SELECT id FROM accounts WHERE subtype = 'cash'").map((r) => r.id);
  const revYtd = sumType(ytd, ['revenue']);
  const cogsYtd = sumType(ytd, ['cogs']);
  const netYtd = round2(revYtd + sumType(ytd, ['other_income']) - sumType(ytd, ['cogs', 'expense', 'other_expense', 'tax']));

  const trend = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)) - 1 - i, 1));
    const from = d.toISOString().slice(0, 10);
    const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const m = balances({ companyIds: cids, branchId, from, to });
    const bfx = branchId ? ' AND branch_id = ?' : '';
    const count = db.get(`SELECT (SELECT COUNT(*) FROM sales_invoices WHERE company_id = ? AND status IN ('terbit','sebagian','lunas') AND date BETWEEN ? AND ?${bfx}) + (SELECT COUNT(*) FROM pos_sales WHERE company_id = ? AND status = 'lunas' AND date BETWEEN ? AND ?${bfx}) n`,
      companyId, from, to, ...(branchId ? [branchId] : []), companyId, from, to, ...(branchId ? [branchId] : [])).n;
    trend.push({ month: from.slice(0, 7), revenue: sumType(m, ['revenue']), expense: sumType(m, ['cogs', 'expense', 'other_expense']), count });
  }
  const bf = branchId ? ' AND jl.branch_id = ?' : '';
  const byBranch = db.all(`SELECT b.name, ROUND(SUM(jl.credit - jl.debit),2) revenue FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id JOIN branches b ON b.id = jl.branch_id
    WHERE j.status='diposting' AND jl.company_id = ? AND a.type = 'revenue' AND j.date BETWEEN ? AND ?${bf} GROUP BY b.id ORDER BY revenue DESC`, companyId, yStart, asOf, ...(branchId ? [branchId] : []));
  const sf = branchId ? ' AND i.branch_id = ?' : '';
  const topCustomers = db.all(`SELECT c.name, ROUND(SUM(i.subtotal * COALESCE(i.exchange_rate,1)),2) revenue FROM sales_invoices i JOIN customers c ON c.id = i.customer_id WHERE i.company_id = ? AND i.status IN ('terbit','sebagian','lunas') AND i.date >= ?${sf} GROUP BY c.id ORDER BY revenue DESC LIMIT 5`, companyId, yStart, ...(branchId ? [branchId] : []));
  const pending = [
    ['sales_orders', 'menunggu', 'Pesanan penjualan'], ['purchase_orders', 'menunggu', 'Pesanan pembelian'], ['purchase_requests', 'menunggu', 'Permintaan pembelian'],
    ['journals', 'diajukan', 'Jurnal manual'], ['supplier_payments', 'menunggu', 'Pembayaran pemasok'], ['leave_requests', 'menunggu', 'Cuti'], ['payroll_runs', 'draf', 'Penggajian (draf)'],
  ].map(([t, s, label]) => ({ entity: t, label, count: db.get(`SELECT COUNT(*) n FROM ${t} WHERE company_id = ? AND status = ?${branchId ? ' AND branch_id = ?' : ''}`, companyId, s, ...(branchId ? [branchId] : [])).n })).filter((x) => x.count);
  const lowStock = inventoryValuation(ctx, { companyId, branchId }).rows.filter((r) => r.state === 'kritis' || r.state === 'habis').slice(0, 6);
  const arOpen = db.get(`SELECT ROUND(COALESCE(SUM((total - paid) * COALESCE(exchange_rate,1)),0),2) v, COALESCE(SUM(CASE WHEN due_date < ? THEN (total - paid) * COALESCE(exchange_rate,1) END),0) overdue FROM sales_invoices WHERE company_id = ? AND status IN ('terbit','sebagian')${branchId ? ' AND branch_id = ?' : ''}`, asOf, companyId, ...(branchId ? [branchId] : []));
  const apOpen = db.get(`SELECT ROUND(COALESCE(SUM((total - paid) * COALESCE(exchange_rate,1)),0),2) v FROM purchase_bills WHERE company_id = ? AND status IN ('terbit','sebagian')${branchId ? ' AND branch_id = ?' : ''}`, companyId, ...(branchId ? [branchId] : []));
  return {
    asOf,
    kpis: {
      revenueMtd: sumType(mtd, ['revenue']), revenueYtd: revYtd, grossMarginPct: revYtd ? round2((revYtd - cogsYtd) / revYtd * 100) : 0,
      netIncomeYtd: netYtd, cash: round2(cashIds.reduce((s, id) => s + netOf(all, id), 0)),
      arOpen: arOpen.v, arOverdue: round2(arOpen.overdue), apOpen: apOpen.v,
    },
    trend, byBranch, topCustomers, pending, lowStock,
  };
}

/* --- Laporan pajak (PPN & PPh 21) ------------------------------------------------ */
export function taxReport(ctx, { companyId, branchId, to }) {
  const year = to.slice(0, 4);
  const bf = branchId ? ' AND jl.branch_id = ?' : '';
  const bp = branchId ? [branchId] : [];
  const q = (accountKey, sources, side) => db.all(`SELECT substr(j.date, 1, 7) m, ROUND(SUM(${side}), 2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id
    WHERE j.status = 'diposting' AND jl.company_id = ? AND jl.account_id = ? AND j.date BETWEEN ? AND ? AND j.source_type IN (${sources.map(() => '?').join(',')})${bf} GROUP BY 1`,
  companyId, acct(accountKey), `${year}-01-01`, `${year}-12-31`, ...sources, ...bp);
  const toMap = (rows) => new Map(rows.map((r) => [r.m, r.v]));
  const out = toMap(q('vat_out', ['sales_invoices', 'pos_sales', 'sales_returns'], 'jl.credit - jl.debit'));
  const inp = toMap(q('vat_in', ['purchase_bills', 'purchase_returns'], 'jl.debit - jl.credit'));
  const pph = toMap(q('pph21_payable', ['payroll_runs'], 'jl.credit - jl.debit'));
  const paid = toMap(q('pph21_payable', ['cash_transactions', 'manual'], 'jl.debit - jl.credit'));
  const vatPaid = toMap(q('vat_out', ['cash_transactions'], 'jl.debit - jl.credit'));
  const rows = [];
  for (let m = 1; m <= 12; m++) {
    const k = `${year}-${String(m).padStart(2, '0')}`;
    if (k > to.slice(0, 7)) break;
    const o = out.get(k) || 0, i = inp.get(k) || 0;
    rows.push({ month: k, vatOut: o, vatIn: i, vatNet: round2(o - i), vatPaid: vatPaid.get(k) || 0, pph21: pph.get(k) || 0, pph21Paid: paid.get(k) || 0 });
  }
  const t = (k) => round2(rows.reduce((s, r) => s + r[k], 0));
  return { title: `Rekap Pajak ${year}`, period: { from: `${year}-01-01`, to }, rows, totals: { vatOut: t('vatOut'), vatIn: t('vatIn'), vatNet: t('vatNet'), vatPaid: t('vatPaid'), pph21: t('pph21'), pph21Paid: t('pph21Paid') } };
}

/* --- Kartu piutang / hutang per mitra (dari buku besar) --------------------------- */
export function partnerStatement(ctx, { companyId, from, to, partnerType, partnerId }) {
  const isCust = partnerType === 'customer';
  const party = db.get(`SELECT id, code, name, company_id FROM ${isCust ? 'customers' : 'suppliers'} WHERE id = ?`, Number(partnerId));
  if (!party || party.company_id !== companyId) throw bad('Pilih pelanggan/pemasok.');
  const accts = isCust ? [acct('ar'), acct('ic_receivable')] : [acct('ap'), acct('ic_payable')];
  const sign = isCust ? 1 : -1; // piutang: debit menambah; hutang: kredit menambah
  const base = `FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status = 'diposting' AND jl.company_id = ? AND jl.partner_type = ? AND jl.partner_id = ? AND jl.account_id IN (?, ?)`;
  const opening = round2(sign * db.get(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) v ${base} AND j.date < ?`, companyId, partnerType, party.id, ...accts, from).v);
  let bal = opening;
  const lines = db.all(`SELECT j.id journal_id, j.date, j.number, j.source_type, j.source_id, j.source_no, j.description, jl.debit, jl.credit ${base} AND j.date BETWEEN ? AND ? ORDER BY j.date, j.id`, companyId, partnerType, party.id, ...accts, from, to)
    .map((l) => { bal = round2(bal + sign * (l.debit - l.credit)); return { ...l, balance: bal }; });
  return { title: `Kartu ${isCust ? 'Piutang' : 'Hutang'} — ${party.name}`, party, period: { from, to }, opening, closing: bal, lines };
}
