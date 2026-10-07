/* ==========================================================================
   Fitur lanjutan: notifikasi, pencarian global, analitik BI, Balanced
   Scorecard, asisten (tanya-jawab data tanpa layanan AI eksternal), MRP,
   impor CSV, lampiran terenkripsi, preferensi pengguna, rekonsiliasi bank,
   dan portal pelanggan/pemasok. Seluruh fungsi menghormati izin & cakupan.
   ========================================================================== */
import { createHash } from 'node:crypto';
import * as db from '../db.js';
import * as crud from './crud.js';
import { expireQuotations } from '../ledger/quotation.js';
import { installmentsOf } from '../ledger/payments.js';
import * as reports from '../ledger/reports.js';
import { acct } from '../ledger/posting.js';
import { reconState } from '../ledger/documents.js';
import { ENTITIES } from './entities.js';
import * as audit from '../security/audit.js';
import { encrypt, decrypt } from '../security/crypto.js';
import { LEVEL, can, requirePerm, assertInScope } from '../security/rbac.js';
import { securityPolicy } from '../lib/settings.js';
import { bad, forbidden, notFound, conflict, round2, today, nowIso, isDate } from '../lib/util.js';

const yearStart = (d) => `${d.slice(0, 4)}-01-01`;
const bfx = (ctx, alias = '') => (ctx.branchId ? { sql: ` AND ${alias}branch_id = ?`, p: [ctx.branchId] } : { sql: '', p: [] });
const fmt = (v) => 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(v || 0));
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function sumType(m, types) {
  return round2(db.all('SELECT id, type FROM accounts').filter((a) => types.includes(a.type)).reduce((s, a) => s + reports.signFor(a.type) * reports.netOf(m, a.id), 0));
}

/* ======================================================================== */
/* Notifikasi                                                               */
/* ======================================================================== */
export function notifications(ctx) {
  const out = [];
  const t = today();
  const b = bfx(ctx);
  const push = (tone, title, note, link) => out.push({ tone, title, note, link });
  const count = (sql, ...p) => db.get(sql, ...p).n;
  const pend = [
    ['sales_orders', 'menunggu', 'pesanan penjualan', 'pesanan-penjualan'], ['purchase_orders', 'menunggu', 'pesanan pembelian', 'pesanan-pembelian'],
    ['purchase_requests', 'menunggu', 'permintaan pembelian', 'permintaan-pembelian'], ['journals', 'diajukan', 'jurnal manual', 'jurnal'],
    ['supplier_payments', 'menunggu', 'pembayaran pemasok', 'pembayaran'], ['leave_requests', 'menunggu', 'pengajuan cuti', 'cuti'],
    ['quotations', 'menunggu', 'penawaran (harga)', 'penawaran'], ['budgets', 'diajukan', 'anggaran', 'anggaran'],
  ];
  for (const [table, status, label, view] of pend) {
    const e = ENTITIES[table];
    if (!can(ctx, e.module, LEVEL.approve)) continue;
    const n = count(`SELECT COUNT(*) n FROM ${table} WHERE company_id = ? AND status = ?${b.sql}`, ctx.companyId, status, ...b.p);
    if (n) push('warn', `${n} ${label} menunggu persetujuan`, 'Buka Kotak Persetujuan untuk memutuskan.', { view: 'persetujuan' });
  }
  if (can(ctx, 'sales', LEVEL.read)) {
    const r = db.get(`SELECT COUNT(*) n, COALESCE(SUM((total - paid) * COALESCE(exchange_rate,1)),0) v FROM sales_invoices WHERE company_id = ? AND status IN ('terbit','sebagian') AND due_date < ?${b.sql}`, ctx.companyId, t, ...b.p);
    if (r.n) push('danger', `${r.n} faktur lewat jatuh tempo`, `Total ${fmt(r.v)} perlu ditagih.`, { view: 'umur-piutang' });
  }
  if (can(ctx, 'sales', LEVEL.read)) {
    expireQuotations();
    const acc = count(`SELECT COUNT(*) n FROM quotations WHERE company_id = ? AND status = 'diterima'${b.sql}`, ctx.companyId, ...b.p);
    if (acc) push('ok', `${acc} penawaran diterima pelanggan`, 'Buat pesanan penjualan dari penawaran tersebut.', { view: 'penawaran' });
    const exp = count(`SELECT COUNT(*) n FROM quotations WHERE company_id = ? AND status IN ('disetujui','terkirim') AND valid_until BETWEEN ? AND ?${b.sql}`, ctx.companyId, t, addDays(t, 7), ...b.p);
    if (exp) push('warn', `${exp} penawaran berakhir ≤ 7 hari`, 'Tindak lanjuti pelanggan atau buat revisi.', { view: 'analisis-penawaran' });
    const g = db.get(`SELECT COUNT(*) n, COALESCE(SUM(total),0) v FROM customer_receipts WHERE company_id = ? AND method = 'giro' AND giro_status = 'beredar' AND giro_due <= ?${b.sql}`, ctx.companyId, addDays(t, 3), ...b.p);
    if (g.n) push('warn', `${g.n} giro masuk jatuh tempo ≤ 3 hari / lewat`, `Total ${fmt(g.v)} — setor kliring & catat "Giro cair".`, { view: 'giro' });
  }
  if (can(ctx, 'purchasing', LEVEL.read)) {
    const g = db.get(`SELECT COUNT(*) n, COALESCE(SUM(total),0) v FROM supplier_payments WHERE company_id = ? AND method = 'giro' AND giro_status = 'beredar' AND giro_due <= ?${b.sql}`, ctx.companyId, addDays(t, 3), ...b.p);
    if (g.n) push('danger', `${g.n} giro keluar efektif ≤ 3 hari`, `Pastikan saldo rekening cukup: ${fmt(g.v)}.`, { view: 'giro' });
  }
  if (can(ctx, 'purchasing', LEVEL.read)) {
    const r = db.get(`SELECT COUNT(*) n, COALESCE(SUM((total - paid) * COALESCE(exchange_rate,1)),0) v FROM purchase_bills WHERE company_id = ? AND status IN ('terbit','sebagian') AND due_date BETWEEN ? AND ?${b.sql}`, ctx.companyId, t, addDays(t, 7), ...b.p);
    if (r.n) push('warn', `${r.n} tagihan pemasok jatuh tempo ≤ 7 hari`, `Total ${fmt(r.v)}.`, { view: 'umur-hutang' });
  }
  if (can(ctx, 'inventory', LEVEL.read)) {
    const n = count(`SELECT COUNT(*) n FROM stock_balances sb JOIN products p ON p.id = sb.product_id JOIN warehouses w ON w.id = sb.warehouse_id WHERE w.company_id = ? AND p.min_stock > 0 AND sb.qty <= p.min_stock${ctx.branchId ? ' AND w.branch_id = ?' : ''}`, ctx.companyId, ...b.p);
    if (n) push('warn', `${n} posisi stok di bawah minimum`, 'Periksa Stok & Valuasi atau jalankan MRP.', { view: 'mrp' });
  }
  if (can(ctx, 'documents', LEVEL.read)) {
    const n = count("SELECT COUNT(*) n FROM documents WHERE company_id = ? AND status = 'berlaku' AND expiry_date BETWEEN ? AND ?", ctx.companyId, t, addDays(t, 30));
    if (n) push('info', `${n} dokumen kedaluwarsa dalam 30 hari`, 'Tinjau dan perbarui versi dokumen.', { view: 'dokumen' });
  }
  if (can(ctx, 'compliance', LEVEL.read)) {
    const n = count("SELECT COUNT(*) n FROM compliance_items WHERE company_id = ? AND status != 'patuh' AND due_date <= ?", ctx.companyId, addDays(t, 14));
    if (n) push('warn', `${n} butir kepatuhan jatuh tempo ≤ 14 hari`, 'Lihat register Kepatuhan & GRC.', { view: 'kepatuhan' });
    const inc = count("SELECT COUNT(*) n FROM security_incidents WHERE company_id = ? AND status IN ('dilaporkan','investigasi')", ctx.companyId);
    if (inc) push('danger', `${inc} insiden keamanan belum ditangani`, 'Tindak lanjuti sesuai prosedur respons insiden.', { view: 'insiden' });
  }
  const pol = securityPolicy();
  const u = ctx.user;
  if (u.password_changed_at) {
    const days = Math.floor((Date.parse(u.password_changed_at) + pol.passwordMaxAgeDays * 864e5 - Date.now()) / 864e5);
    if (days <= 14) push('warn', `Kata sandi Anda kedaluwarsa dalam ${Math.max(days, 0)} hari`, 'Ganti sandi di Profil & keamanan akun.', { view: 'profil' });
  }
  if (!u.mfa_enabled) push('info', 'Aktifkan autentikasi dua faktor', 'Lindungi akun Anda dengan kode autentikator (MFA).', { view: 'profil' });
  return out;
}

/* ======================================================================== */
/* Pencarian global                                                         */
/* ======================================================================== */
const SEARCHABLE = ['sales_invoices', 'sales_orders', 'quotations', 'customers', 'purchase_orders', 'purchase_bills', 'suppliers', 'products', 'employees', 'journals', 'leads', 'projects', 'fixed_assets', 'documents'];
export function search(ctx, q) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const out = [];
  for (const key of SEARCHABLE) {
    const e = ENTITIES[key];
    if (!can(ctx, e.module, LEVEL.read)) continue;
    const { rows } = crud.list(ctx, key, { q: term, size: 5 });
    for (const r of rows) {
      out.push({
        entity: key, entityLabel: e.label, id: r.id,
        label: r.number || r.code || r.name || r.title,
        sub: [r.customer_id__label, r.supplier_id__label, r.name && (r.number || r.code) ? r.name : null, r.title, r.description, r.status ? r.status : null].filter(Boolean).slice(0, 2).join(' · '),
      });
    }
  }
  return out.slice(0, 40);
}

/* ======================================================================== */
/* Analitik & BI                                                            */
/* ======================================================================== */
export function analytics(ctx, { from, to }) {
  const c = ctx.companyId;
  const b = bfx(ctx, 'i.');
  const m = reports.balances({ companyIds: [c], branchId: ctx.branchId, from, to });
  const revenue = sumType(m, ['revenue']), cogs = sumType(m, ['cogs']);
  const net = round2(revenue + sumType(m, ['other_income']) - sumType(m, ['cogs', 'expense', 'other_expense', 'tax']));
  const rateExpr = 'COALESCE(i.exchange_rate, 1)';
  const posted = "i.status IN ('terbit','sebagian','lunas')";
  const byCategory = db.all(`SELECT COALESCE(p.category, 'Lainnya') label, ROUND(SUM(l.amount * ${rateExpr}),2) value FROM sales_invoice_lines l JOIN sales_invoices i ON i.id = l.parent_id JOIN products p ON p.id = l.product_id
    WHERE i.company_id = ? AND ${posted} AND i.date BETWEEN ? AND ?${b.sql} GROUP BY 1 ORDER BY value DESC`, c, from, to, ...b.p);
  const topProducts = db.all(`SELECT p.code, p.name, ROUND(SUM(l.qty),2) qty, ROUND(SUM(l.amount * ${rateExpr}),2) revenue, ROUND(SUM(l.qty * COALESCE(l.unit_cost,0)),2) cost FROM sales_invoice_lines l JOIN sales_invoices i ON i.id = l.parent_id JOIN products p ON p.id = l.product_id
    WHERE i.company_id = ? AND ${posted} AND i.date BETWEEN ? AND ?${b.sql} GROUP BY p.id ORDER BY revenue DESC LIMIT 8`, c, from, to, ...b.p)
    .map((r) => ({ ...r, margin: r.revenue ? round2((r.revenue - r.cost) / r.revenue * 100) : 0 }));
  const bySegment = db.all(`SELECT COALESCE(cu.segment, 'Lainnya') label, ROUND(SUM(i.subtotal * ${rateExpr}),2) value FROM sales_invoices i JOIN customers cu ON cu.id = i.customer_id
    WHERE i.company_id = ? AND ${posted} AND i.date BETWEEN ? AND ?${b.sql} GROUP BY 1 ORDER BY value DESC`, c, from, to, ...b.p);
  const months = [];
  let cur = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 12, 1));
  for (let i = 0; i < 12; i++) {
    const f = cur.toISOString().slice(0, 10);
    const e = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const mm = reports.balances({ companyIds: [c], branchId: ctx.branchId, from: f, to: e });
    const rv = sumType(mm, ['revenue']), cg = sumType(mm, ['cogs']), ex = sumType(mm, ['expense']);
    const cnt = db.get(`SELECT (SELECT COUNT(*) FROM sales_invoices i WHERE i.company_id = ? AND ${posted} AND i.date BETWEEN ? AND ?${b.sql}) + (SELECT COUNT(*) FROM pos_sales i WHERE i.company_id = ? AND i.status = 'lunas' AND i.date BETWEEN ? AND ?${b.sql}) n`, c, f, e, ...b.p, c, f, e, ...b.p).n;
    months.push({ month: f.slice(0, 7), revenue: rv, cogs: cg, opex: ex, grossMargin: rv ? round2((rv - cg) / rv * 100) : 0, count: cnt });
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  const expenses = db.all(`SELECT a.code, a.name label, ROUND(SUM(jl.debit - jl.credit),2) value FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id
    WHERE j.status = 'diposting' AND jl.company_id = ? AND a.type IN ('expense','other_expense') AND j.date BETWEEN ? AND ?${ctx.branchId ? ' AND jl.branch_id = ?' : ''} GROUP BY a.id ORDER BY value DESC LIMIT 8`, c, from, to, ...b.p);
  const suppliers = db.all(`SELECT s.name label, ROUND(SUM(i.subtotal * ${rateExpr}),2) value FROM purchase_bills i JOIN suppliers s ON s.id = i.supplier_id
    WHERE i.company_id = ? AND ${posted} AND i.date BETWEEN ? AND ?${b.sql} GROUP BY s.id ORDER BY value DESC LIMIT 6`, c, from, to, ...b.p);
  const pipeline = db.all(`SELECT stage label, COUNT(*) n, ROUND(SUM(value),2) value FROM leads WHERE company_id = ?${bfx(ctx).sql} GROUP BY stage`, c, ...bfx(ctx).p);
  const won = pipeline.find((x) => x.label === 'menang')?.n || 0, lost = pipeline.find((x) => x.label === 'kalah')?.n || 0;
  const inv = reports.inventoryValuation(ctx, { companyId: c, branchId: ctx.branchId });
  const invByKind = Object.entries(inv.rows.reduce((acc, r) => { acc[r.kind] = round2((acc[r.kind] || 0) + r.value); return acc; }, {})).map(([label, value]) => ({ label, value }));
  const ar = reports.arAging(ctx, { companyId: c, branchId: ctx.branchId, asOf: to });
  const days = Math.max(1, (Date.parse(to) - Date.parse(from)) / 864e5 + 1);
  const headcount = db.all(`SELECT department label, COUNT(*) value FROM employees WHERE company_id = ? AND status = 'aktif'${bfx(ctx).sql} GROUP BY 1 ORDER BY value DESC`, c, ...bfx(ctx).p);
  const openOrders = db.get(`SELECT COUNT(*) n FROM sales_orders WHERE company_id = ? AND status IN ('menunggu','disetujui')${bfx(ctx).sql}`, c, ...bfx(ctx).p).n;
  return {
    period: { from, to },
    kpis: {
      revenue, grossMarginPct: revenue ? round2((revenue - cogs) / revenue * 100) : 0, netIncome: net, netMarginPct: revenue ? round2(net / revenue * 100) : 0,
      dso: revenue ? round2(ar.totals.total / (revenue / days)) : 0, inventoryValue: inv.total, openOrders, winRate: won + lost ? round2(won / (won + lost) * 100) : 0,
    },
    byCategory, topProducts, bySegment, months, expenses, suppliers, pipeline, invByKind,
    arBuckets: ar.buckets.map((x) => ({ label: x.label, value: ar.totals[x.key] })), headcount,
  };
}

/* ======================================================================== */
/* Balanced Scorecard                                                       */
/* ======================================================================== */
function bscActuals(ctx, to) {
  const c = ctx.companyId;
  const from = yearStart(to);
  const ytd = reports.balances({ companyIds: [c], branchId: ctx.branchId, from, to });
  const rev = sumType(ytd, ['revenue']), cogs = sumType(ytd, ['cogs']);
  const ni = round2(rev + sumType(ytd, ['other_income']) - sumType(ytd, ['cogs', 'expense', 'other_expense', 'tax']));
  const monthRev = (offset) => {
    const d0 = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1 - offset, 1));
    const f = d0.toISOString().slice(0, 10);
    const e = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    return sumType(reports.balances({ companyIds: [c], branchId: ctx.branchId, from: f, to: e }), ['revenue']);
  };
  const r1 = monthRev(1), r2 = monthRev(2);
  const all = reports.balances({ companyIds: [c], branchId: ctx.branchId, to });
  const accs = db.all('SELECT id, type, subtype FROM accounts WHERE is_header = 0');
  const bal = (filter) => round2(accs.filter(filter).reduce((s, a) => s + reports.signFor(a.type) * reports.netOf(all, a.id), 0));
  const currentAssets = bal((a) => a.type === 'asset' && ['cash', 'ar', 'inventory', 'current_asset'].includes(a.subtype));
  const currentLiab = bal((a) => a.type === 'liability' && ['ap', 'current_liability'].includes(a.subtype));
  const equity = bal((a) => a.type === 'equity') + ni;
  const days = Math.max(1, (Date.parse(to) - Date.parse(from)) / 864e5 + 1);
  const b = bfx(ctx);
  const ar = db.get(`SELECT COALESCE(SUM((total - paid) * COALESCE(exchange_rate,1)),0) v FROM sales_invoices WHERE company_id = ? AND status IN ('terbit','sebagian')${b.sql}`, c, ...b.p).v;
  const inv = db.get(`SELECT COALESCE(SUM(total),0) t, COALESCE(SUM(paid),0) p FROM sales_invoices WHERE company_id = ? AND status IN ('terbit','sebagian','lunas') AND date BETWEEN ? AND ?${b.sql}`, c, from, to, ...b.p);
  const custs = db.all(`SELECT customer_id, COUNT(*) n FROM sales_invoices WHERE company_id = ? AND status IN ('terbit','sebagian','lunas') AND date BETWEEN ? AND ?${b.sql} GROUP BY customer_id`, c, from, to, ...b.p);
  const stock = reports.inventoryValuation(ctx, { companyId: c, branchId: ctx.branchId }).total;
  const wo = db.get(`SELECT SUM(status = 'selesai') d, SUM(status != 'batal') n FROM work_orders WHERE company_id = ? AND date BETWEEN ? AND ?${b.sql}`, c, from, to, ...b.p);
  const pending = ['sales_orders', 'purchase_orders', 'purchase_requests', 'supplier_payments'].reduce((s, t) => s + db.get(`SELECT COUNT(*) n FROM ${t} WHERE company_id = ? AND status = 'menunggu'${b.sql}`, c, ...b.p).n, 0)
    + db.get(`SELECT COUNT(*) n FROM journals WHERE company_id = ? AND status = 'diajukan'${b.sql}`, c, ...b.p).n;
  const att = db.get(`SELECT SUM(status IN ('hadir','terlambat')) h, COUNT(*) n FROM attendance WHERE company_id = ?${b.sql}`, c, ...b.p);
  const comp = db.get("SELECT SUM(status = 'patuh') p, COUNT(*) n FROM compliance_items WHERE company_id = ?", c);
  return {
    revenue_growth: r2 ? round2((r1 - r2) / r2 * 100) : 0,
    gross_margin: rev ? round2((rev - cogs) / rev * 100) : 0,
    net_margin: rev ? round2(ni / rev * 100) : 0,
    roe: equity ? round2((ni * 365 / days) / equity * 100) : 0,
    current_ratio: currentLiab ? round2(currentAssets / currentLiab) : 0,
    dso: rev ? round2(ar / (rev / days)) : 0,
    collection_rate: inv.t ? round2(inv.p / inv.t * 100) : 0,
    customer_count: custs.length,
    repeat_customers: custs.length ? round2(custs.filter((x) => x.n > 1).length / custs.length * 100) : 0,
    inventory_turnover: stock ? round2((cogs * 365 / days) / stock) : 0,
    wo_completion: wo.n ? round2(wo.d / wo.n * 100) : 0,
    po_on_time: pending,
    headcount: db.get(`SELECT COUNT(*) n FROM employees WHERE company_id = ? AND status = 'aktif'${b.sql}`, c, ...b.p).n,
    attendance_rate: att.n ? round2(att.h / att.n * 100) : 0,
    compliance_rate: comp.n ? round2(comp.p / comp.n * 100) : 0,
  };
}

export function balancedScorecard(ctx, { to }) {
  requirePerm(ctx, 'reports', LEVEL.read);
  const actual = bscActuals(ctx, to);
  const metrics = db.all('SELECT * FROM bsc_metrics WHERE company_id = ? ORDER BY perspective, id', ctx.companyId).map((m) => {
    const a = m.source === 'manual' ? m.actual_manual : actual[m.source];
    let score = null;
    if (a !== null && a !== undefined && m.target) {
      score = m.direction === 'turun' ? (a <= 0 ? 1.2 : m.target / a) : a / m.target;
      score = round2(Math.max(0, Math.min(1.2, score)) * 100);
    }
    return { ...m, actual: a ?? null, score, tone: score === null ? 'neutral' : score >= 100 ? 'ok' : score >= 85 ? 'warn' : 'danger' };
  });
  const P = [['keuangan', 'Keuangan'], ['pelanggan', 'Pelanggan'], ['proses', 'Proses internal'], ['pembelajaran', 'Pembelajaran & pertumbuhan']];
  const perspectives = P.map(([key, label]) => {
    const ms = metrics.filter((m) => m.perspective === key);
    const scored = ms.filter((m) => m.score !== null);
    return { key, label, metrics: ms, score: scored.length ? round2(scored.reduce((s, m) => s + Math.min(m.score, 120), 0) / scored.length) : null };
  });
  const scored = perspectives.filter((p) => p.score !== null);
  return { asOf: to, overall: scored.length ? round2(scored.reduce((s, p) => s + p.score, 0) / scored.length) : null, perspectives };
}

/* ======================================================================== */
/* Asisten — tanya jawab data dengan pola bahasa Indonesia (tanpa LLM luar) */
/* ======================================================================== */
const HELP = ['Berapa pendapatan bulan ini?', 'Laba bersih tahun ini', 'Saldo kas dan bank', 'Piutang yang lewat jatuh tempo', 'Hutang jatuh tempo minggu ini', 'Stok kritis', 'Stok FG-101', 'Dokumen menunggu persetujuan', 'Pelanggan terbesar', 'Beban terbesar tahun ini', 'Apakah neraca seimbang?', 'Status INV-2026-00012'];

export function assistant(ctx, question) {
  const q = String(question || '').toLowerCase().trim().slice(0, 300);
  const t = today();
  const c = ctx.companyId;
  const need = (mod) => { if (!can(ctx, mod, LEVEL.read)) throw forbidden(`Pertanyaan ini memerlukan akses modul ${mod}.`); };
  const ans = (answer, extra = {}) => ({ question, answer, ...extra });
  if (!q || /^(bantuan|help|\?|apa yang bisa|contoh)/.test(q)) return ans('Saya dapat menjawab pertanyaan tentang data perusahaan aktif secara langsung dari buku besar dan modul operasional. Contoh pertanyaan:', { suggestions: HELP });

  const docNo = q.toUpperCase().match(/\b(INV|SO|PO|BILL|QT|RCV|PAY|JU|POS|SR|PRT|PR|WO)-\d{4}-\d{5}\b/);
  if (docNo) {
    const prefix = docNo[1];
    const map = { INV: 'sales_invoices', SO: 'sales_orders', PO: 'purchase_orders', BILL: 'purchase_bills', QT: 'quotations', RCV: 'customer_receipts', PAY: 'supplier_payments', JU: 'journals', POS: 'pos_sales', SR: 'sales_returns', PRT: 'purchase_returns', PR: 'purchase_requests', WO: 'work_orders' };
    const key = map[prefix];
    const e = ENTITIES[key];
    need(e.module);
    const { rows } = crud.list(ctx, key, { q: docNo[0], size: 1 });
    if (!rows.length) return ans(`Dokumen ${docNo[0]} tidak ditemukan di perusahaan/cabang aktif.`);
    const r = rows[0];
    const parts = [`${e.one[0].toUpperCase()}${e.one.slice(1)} ${r.number} berstatus **${r.status}**`];
    if (r.date) parts.push(`tanggal ${r.date}`);
    if (r.customer_id__label || r.supplier_id__label) parts.push(`mitra ${r.customer_id__label || r.supplier_id__label}`);
    if (r.total != null) parts.push(`total ${fmt(r.total * (r.exchange_rate || 1))}`);
    if (r.paid != null) parts.push(`terbayar ${fmt(r.paid * (r.exchange_rate || 1))}`);
    return ans(parts.join(', ') + '.', { links: [{ label: `Buka ${r.number}`, entity: key, id: r.id }] });
  }
  if (/neraca|seimbang|balance/.test(q)) {
    need('reports');
    const bs = reports.balanceSheet(ctx, { companyId: c, branchId: ctx.branchId, asOf: t });
    const a = bs.blocks[0].total.v, l = bs.blocks[1].total.v, eq = bs.blocks[2].total.v;
    return ans(`Per ${t}, total aset ${fmt(a)}; liabilitas ${fmt(l)}; ekuitas ${fmt(eq)}. Neraca ${bs.balanced ? 'seimbang ✔' : 'TIDAK seimbang'}.`, { links: [{ label: 'Buka Neraca', view: 'lap-neraca' }] });
  }
  if (/(pendapatan|penjualan|omzet|omset|revenue)/.test(q) && !/pelanggan/.test(q)) {
    need('reports');
    const period = /tahun|ytd|setahun/.test(q) ? [yearStart(t), t, 'tahun ini'] : /hari ini/.test(q) ? [t, t, 'hari ini'] : /bulan lalu/.test(q) ? (() => { const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 2, 1)); const f = d.toISOString().slice(0, 10); return [f, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10), 'bulan lalu']; })() : [t.slice(0, 8) + '01', t, 'bulan ini'];
    const m = reports.balances({ companyIds: [c], branchId: ctx.branchId, from: period[0], to: period[1] });
    const rev = sumType(m, ['revenue']), cogs = sumType(m, ['cogs']);
    const rows = /cabang/.test(q) ? db.all(`SELECT b.name, ROUND(SUM(jl.credit - jl.debit),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id JOIN branches b ON b.id = jl.branch_id
      WHERE j.status = 'diposting' AND jl.company_id = ? AND a.type = 'revenue' AND j.date BETWEEN ? AND ? GROUP BY b.id ORDER BY v DESC`, c, period[0], period[1]).map((r) => [r.name, fmt(r.v)]) : null;
    return ans(`Pendapatan ${period[2]} (${period[0]} s.d. ${period[1]}) sebesar ${fmt(rev)} dengan margin kotor ${rev ? round2((rev - cogs) / rev * 100) : 0}%.`, { rows, links: [{ label: 'Laba Rugi', view: 'lap-laba-rugi' }] });
  }
  if (/(laba|rugi|profit|untung)/.test(q)) {
    need('reports');
    const m = reports.balances({ companyIds: [c], branchId: ctx.branchId, from: yearStart(t), to: t });
    const ni = round2(sumType(m, ['revenue', 'other_income']) - sumType(m, ['cogs', 'expense', 'other_expense', 'tax']));
    return ans(`Laba bersih tahun berjalan (s.d. ${t}) adalah ${fmt(ni)}${ni < 0 ? ' (rugi)' : ''}.`, { links: [{ label: 'Laba Rugi', view: 'lap-laba-rugi' }] });
  }
  if (/(kas|bank|saldo|uang|likuid)/.test(q)) {
    need('finance');
    const { rows } = crud.list(ctx, 'bank_accounts', { size: 50 });
    const total = round2(rows.reduce((s, r) => s + (r.balance || 0), 0));
    return ans(`Total saldo kas & bank menurut buku besar: ${fmt(total)}.`, { rows: rows.map((r) => [r.name, fmt(r.balance)]), links: [{ label: 'Kas & Bank', view: 'kas-bank' }] });
  }
  if (/piutang|tagih/.test(q)) {
    need('sales');
    const ar = reports.arAging(ctx, { companyId: c, branchId: ctx.branchId, asOf: t });
    const overdue = round2(ar.totals.total - ar.totals.current);
    return ans(`Piutang terbuka ${fmt(ar.totals.total)}; ${fmt(overdue)} di antaranya lewat jatuh tempo. Pelanggan dengan saldo terbesar:`, { rows: ar.parties.slice(0, 5).map((p) => [p.party, fmt(p.total)]), links: [{ label: 'Umur Piutang', view: 'umur-piutang' }] });
  }
  if (/hutang|utang|bayar pemasok/.test(q)) {
    need('purchasing');
    const ap = reports.apAging(ctx, { companyId: c, branchId: ctx.branchId, asOf: t });
    const soon = ap.docs.filter((d) => d.days >= -7);
    return ans(`Hutang terbuka ${fmt(ap.totals.total)}; ${soon.length} tagihan jatuh tempo dalam 7 hari ke depan atau sudah lewat.`, { rows: soon.slice(0, 6).map((d) => [`${d.number} · ${d.party}`, fmt(d.open)]), links: [{ label: 'Umur Hutang', view: 'umur-hutang' }] });
  }
  if (/stok|persediaan|inventaris|barang/.test(q)) {
    need('inventory');
    const inv = reports.inventoryValuation(ctx, { companyId: c, branchId: ctx.branchId });
    const code = q.toUpperCase().match(/\b[A-Z]{2}-\d{3}\b/);
    if (code) {
      const rows = inv.rows.filter((r) => r.code === code[0]);
      if (!rows.length) return ans(`Tidak ada saldo stok untuk ${code[0]}.`);
      return ans(`Stok ${code[0]} ${rows[0].name}: ${rows.reduce((s, r) => s + r.qty, 0)} ${rows[0].uom} di ${rows.length} gudang.`, { rows: rows.map((r) => [r.warehouse, `${r.qty} ${r.uom} · ${r.state}`]) });
    }
    const crit = inv.rows.filter((r) => ['kritis', 'habis'].includes(r.state));
    return ans(`Nilai persediaan ${fmt(inv.total)}. ${crit.length} posisi stok kritis/habis${crit.length ? ':' : '.'}`, { rows: crit.slice(0, 8).map((r) => [`${r.code} ${r.name} (${r.warehouse})`, `${r.qty} / min ${r.min_stock}`]), links: [{ label: 'Jalankan MRP', view: 'mrp' }] });
  }
  if (/setuju|approval|menunggu|pending/.test(q)) {
    const items = pendingApprovals(ctx);
    return ans(items.length ? `Ada ${items.length} dokumen menunggu persetujuan Anda.` : 'Tidak ada dokumen yang menunggu persetujuan Anda.', { rows: items.slice(0, 8).map((a) => [`${a.number} · ${a.label}`, a.total != null ? fmt(a.total) : '']), links: [{ label: 'Kotak Persetujuan', view: 'persetujuan' }] });
  }
  if (/pelanggan/.test(q)) {
    need('sales');
    const rows = db.all(`SELECT cu.name, ROUND(SUM(i.subtotal * COALESCE(i.exchange_rate,1)),2) v FROM sales_invoices i JOIN customers cu ON cu.id = i.customer_id WHERE i.company_id = ? AND i.status IN ('terbit','sebagian','lunas') AND i.date >= ? GROUP BY cu.id ORDER BY v DESC LIMIT 5`, c, yearStart(t));
    return ans('Pelanggan dengan penjualan terbesar tahun ini:', { rows: rows.map((r) => [r.name, fmt(r.v)]) });
  }
  if (/beban|biaya|pengeluaran/.test(q)) {
    need('reports');
    const rows = db.all(`SELECT a.code || ' ' || a.name n, ROUND(SUM(jl.debit - jl.credit),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id WHERE j.status = 'diposting' AND jl.company_id = ? AND a.type IN ('expense','other_expense') AND j.date >= ? GROUP BY a.id ORDER BY v DESC LIMIT 6`, c, yearStart(t));
    return ans('Beban operasional terbesar tahun ini:', { rows: rows.map((r) => [r.n, fmt(r.v)]) });
  }
  return ans('Maaf, saya belum memahami pertanyaan itu. Coba salah satu contoh berikut:', { suggestions: HELP });
}

function pendingApprovals(ctx) {
  const out = [];
  for (const [key, status] of [['sales_orders', 'menunggu'], ['purchase_orders', 'menunggu'], ['purchase_requests', 'menunggu'], ['journals', 'diajukan'], ['supplier_payments', 'menunggu'], ['leave_requests', 'menunggu']]) {
    const e = ENTITIES[key];
    if (!can(ctx, e.module, LEVEL.approve)) continue;
    for (const r of crud.list(ctx, key, { status, size: 50 }).rows) out.push({ number: r.number || `#${r.id}`, label: e.one, total: r.total ?? null });
  }
  return out;
}

/* ======================================================================== */
/* MRP — perencanaan kebutuhan bahan                                        */
/* ======================================================================== */
export function mrp(ctx) {
  requirePerm(ctx, 'inventory', LEVEL.read);
  const c = ctx.companyId;
  const products = db.all("SELECT * FROM products WHERE status = 'aktif' AND kind != 'jasa' ORDER BY code");
  const onHand = new Map(db.all('SELECT sb.product_id p, SUM(sb.qty) q FROM stock_balances sb JOIN warehouses w ON w.id = sb.warehouse_id WHERE w.company_id = ? GROUP BY 1', c).map((r) => [r.p, r.q]));
  const soDemand = new Map(db.all("SELECT l.product_id p, SUM(l.qty) q FROM sales_order_lines l JOIN sales_orders s ON s.id = l.parent_id WHERE s.company_id = ? AND s.status IN ('menunggu','disetujui') GROUP BY 1", c).map((r) => [r.p, r.q]));
  const poSupply = new Map(db.all("SELECT l.product_id p, SUM(l.qty) q FROM purchase_order_lines l JOIN purchase_orders o ON o.id = l.parent_id WHERE o.company_id = ? AND o.status IN ('draf','menunggu','disetujui') GROUP BY 1", c).map((r) => [r.p, r.q]));
  const prSupply = new Map(db.all("SELECT l.product_id p, SUM(l.qty) q FROM purchase_request_lines l JOIN purchase_requests r ON r.id = l.parent_id WHERE r.company_id = ? AND r.status IN ('draf','menunggu','disetujui') GROUP BY 1", c).map((r) => [r.p, r.q]));
  const boms = new Map(db.all("SELECT * FROM boms WHERE status = 'aktif'").map((b) => [b.product_id, { ...b, lines: db.all('SELECT * FROM bom_lines WHERE parent_id = ?', b.id) }]));
  const woOut = new Map();
  const compDemand = new Map();
  for (const w of db.all("SELECT w.*, b.product_id, b.output_qty FROM work_orders w JOIN boms b ON b.id = w.bom_id WHERE w.company_id = ? AND w.status IN ('antre','berjalan','qc')", c)) {
    woOut.set(w.product_id, (woOut.get(w.product_id) || 0) + w.qty * (w.output_qty || 1));
    for (const l of db.all('SELECT * FROM bom_lines WHERE parent_id = ?', w.bom_id)) compDemand.set(l.component_id, (compDemand.get(l.component_id) || 0) + l.qty * w.qty);
  }
  const lastSupplier = (pid) => db.get('SELECT s.id, s.name FROM purchase_bill_lines l JOIN purchase_bills b ON b.id = l.parent_id JOIN suppliers s ON s.id = b.supplier_id WHERE l.product_id = ? AND b.company_id = ? ORDER BY b.date DESC LIMIT 1', pid, c);
  const rows = [];
  const plannedComp = new Map();
  // Barang jadi terlebih dahulu agar kebutuhan komponen dari rencana produksi ikut dihitung.
  const order = [...products.filter((p) => boms.has(p.id)), ...products.filter((p) => !boms.has(p.id))];
  for (const p of order) {
    const stock = round2(onHand.get(p.id) || 0);
    const incoming = round2((poSupply.get(p.id) || 0) + (prSupply.get(p.id) || 0) + (woOut.get(p.id) || 0));
    const demand = round2((soDemand.get(p.id) || 0) + (compDemand.get(p.id) || 0) + (plannedComp.get(p.id) || 0));
    const safety = p.min_stock || 0;
    const net = round2(demand + safety - stock - incoming);
    let action = null, qty = 0, supplier = null;
    if (net > 0) {
      const bom = boms.get(p.id);
      if (bom) {
        action = 'produksi';
        qty = Math.ceil(net / (bom.output_qty || 1));
        for (const l of bom.lines) plannedComp.set(l.component_id, (plannedComp.get(l.component_id) || 0) + l.qty * qty);
      } else { action = 'pembelian'; qty = Math.ceil(net); supplier = lastSupplier(p.id); }
    }
    if (demand || stock || incoming || net > 0 || safety) rows.push({ bom_id: boms.get(p.id)?.id ?? null, product_id: p.id, code: p.code, name: p.name, kind: p.kind, uom: p.uom, stock, incoming, demand, safety, net: Math.max(0, net), action, qty, estCost: round2(qty * (p.standard_cost || 0)), supplier });
  }
  return { asOf: today(), rows: rows.sort((a, b) => (b.net > 0) - (a.net > 0) || a.code.localeCompare(b.code)), suggestions: rows.filter((r) => r.action).length };
}

export async function mrpCreateRequest(ctx, items, branchId) {
  if (!Array.isArray(items) || !items.length) throw bad('Pilih minimal satu saran pembelian.');
  const lines = items.slice(0, 200).map((i) => {
    const p = db.get("SELECT id, standard_cost FROM products WHERE id = ? AND kind != 'jasa'", Number(i.product_id));
    if (!p) throw bad('Barang tidak valid.');
    const qty = Number(i.qty);
    if (!(qty > 0)) throw bad('Qty harus positif.');
    return { product_id: p.id, qty, price: p.standard_cost || 0, description: 'Saran MRP' };
  });
  return crud.create(ctx, 'purchase_requests', { branch_id: branchId, date: today(), requester: ctx.user.full_name, priority: 'sedang', notes: 'Dibuat dari perencanaan kebutuhan bahan (MRP)', lines });
}

/* ======================================================================== */
/* Impor CSV data induk                                                     */
/* ======================================================================== */
export const IMPORTABLE = ['products', 'customers', 'suppliers', 'employees', 'accounts', 'cost_centers', 'warehouses', 'leads', 'budgets', 'exchange_rates', 'warehouse_bins', 'compliance_items', 'risks'];

export async function importRows(ctx, key, rows) {
  if (!IMPORTABLE.includes(key)) throw bad('Entitas ini tidak mendukung impor.');
  const e = ENTITIES[key];
  requirePerm(ctx, e.module, LEVEL.write);
  if (!Array.isArray(rows) || !rows.length) throw bad('Berkas tidak berisi baris data.');
  if (rows.length > 1000) throw bad('Maksimal 1.000 baris per impor.');
  const byKey = new Map();
  for (const f of e.fields) { byKey.set(f.name.toLowerCase(), f); byKey.set(f.label.toLowerCase(), f); }
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const src = rows[i] || {};
    const body = {};
    try {
      for (const [k, v] of Object.entries(src)) {
        const f = byKey.get(String(k).trim().toLowerCase());
        if (!f || f.readonly || v === '' || v == null) continue;
        let val = typeof v === 'string' ? v.trim() : v;
        if (f.type === 'ref' && !/^\d+$/.test(String(val))) {
          const re = ENTITIES[f.ref];
          const has = (n) => re.fields.some((x) => x.name === n);
          const hit = db.get(`SELECT id FROM "${re.table}" WHERE ${has('code') ? 'code = ? OR ' : ''}"${re.title}" = ?${re.scope !== 'global' ? ' AND company_id = ?' : ''}`, ...(has('code') ? [val] : []), val, ...(re.scope !== 'global' ? [ctx.companyId] : []));
          if (!hit) throw bad(`${f.label} "${val}" tidak ditemukan.`);
          val = hit.id;
        }
        if (['money', 'number', 'int', 'pct'].includes(f.type) && typeof val === 'string') val = Number(val.replace(/\./g, '').replace(',', '.'));
        if (f.type === 'bool') val = /^(1|ya|true|y)$/i.test(String(val)) ? 1 : 0;
        if (f.type === 'select') {
          const opt = (f.options || []).find((o) => (Array.isArray(o) ? [o[0], o[1]] : [o]).some((x) => String(x).toLowerCase() === String(val).toLowerCase()));
          if (opt) val = Array.isArray(opt) ? opt[0] : opt;
        }
        body[f.name] = val;
      }
      const r = await crud.create(ctx, key, body);
      results.push({ row: i + 1, ok: true, id: r.id });
    } catch (err) {
      results.push({ row: i + 1, ok: false, error: err.message });
    }
  }
  audit.log(ctx, 'import', { entity: key, companyId: ctx.companyId, detail: { rows: rows.length, ok: results.filter((r) => r.ok).length } });
  return { total: rows.length, imported: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

/* ======================================================================== */
/* Lampiran terenkripsi                                                     */
/* ======================================================================== */
const MAX_FILE = 5 * 1024 * 1024;
const MIME = {
  'application/pdf': (b) => b.subarray(0, 4).toString() === '%PDF',
  'image/png': (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  'text/csv': (b) => !b.includes(0),
  'text/plain': (b) => !b.includes(0),
};

function recordFor(ctx, key, id, level) {
  const e = crud.mustEntity(key);
  requirePerm(ctx, e.module, level);
  const row = crud.getRow(e, id);
  if (!row) throw notFound();
  assertInScope(ctx, e.scope, row);
  return { e, row };
}

export function listAttachments(ctx, key, id) {
  recordFor(ctx, key, id, LEVEL.read);
  return db.all('SELECT a.id, a.filename, a.mime, a.size, a.sha256, a.created_at, u.full_name uploader FROM attachments a LEFT JOIN users u ON u.id = a.created_by WHERE a.entity = ? AND a.entity_id = ? ORDER BY a.id DESC', key, Number(id));
}

export function addAttachment(ctx, key, id, body) {
  const { row } = recordFor(ctx, key, id, LEVEL.write);
  const mime = String(body.mime || '');
  if (!MIME[mime]) throw bad('Tipe berkas tidak diizinkan. Gunakan PDF, PNG, JPG, XLSX, DOCX, CSV, atau TXT.');
  const name = String(body.filename || 'berkas').replace(/[^\w.\- ()]/g, '_').slice(0, 120);
  let data;
  try { data = Buffer.from(String(body.data || ''), 'base64'); } catch { throw bad('Data berkas tidak valid.'); }
  if (!data.length) throw bad('Berkas kosong.');
  if (data.length > MAX_FILE) throw bad('Ukuran berkas maksimal 5 MB.');
  if (!MIME[mime](data)) throw bad('Isi berkas tidak sesuai dengan tipenya.');
  const sha256 = createHash('sha256').update(data).digest('hex');
  const aid = db.insert('attachments', { entity: key, entity_id: row.id, company_id: row.company_id ?? null, filename: name, mime, size: data.length, sha256, data: encrypt(data), created_at: nowIso(), created_by: ctx.user.id });
  audit.log(ctx, 'attachment.add', { entity: key, entityId: row.id, companyId: row.company_id, detail: { attachment: aid, filename: name, size: data.length, sha256 } });
  return { id: aid, filename: name, size: data.length, sha256 };
}

function attachmentRow(ctx, attId, level) {
  const a = db.get('SELECT * FROM attachments WHERE id = ?', Number(attId));
  if (!a) throw notFound();
  recordFor(ctx, a.entity, a.entity_id, level);
  return a;
}

export function downloadAttachment(ctx, attId) {
  const a = attachmentRow(ctx, attId, LEVEL.read);
  const data = decrypt(a.data);
  if (createHash('sha256').update(data).digest('hex') !== a.sha256) throw conflict('Integritas lampiran gagal diverifikasi.');
  audit.log(ctx, 'attachment.download', { entity: a.entity, entityId: a.entity_id, detail: { attachment: a.id, filename: a.filename } });
  return { __raw: data, type: a.mime.startsWith('text/') ? `${a.mime}; charset=utf-8` : a.mime, filename: a.filename };
}

export function deleteAttachment(ctx, attId) {
  const a = attachmentRow(ctx, attId, LEVEL.write);
  db.run('DELETE FROM attachments WHERE id = ?', a.id);
  audit.log(ctx, 'attachment.delete', { entity: a.entity, entityId: a.entity_id, detail: { attachment: a.id, filename: a.filename, sha256: a.sha256 } });
  return { ok: true };
}

/* ======================================================================== */
/* Preferensi pengguna (mis. tata letak widget dasbor)                       */
/* ======================================================================== */
const PREF_KEYS = new Set(['dashboard', 'ui']);
export function getPref(ctx, key) {
  if (!PREF_KEYS.has(key)) throw notFound();
  const r = db.get('SELECT value FROM user_prefs WHERE user_id = ? AND key = ?', ctx.user.id, key);
  return r ? JSON.parse(r.value) : null;
}
export function setPref(ctx, key, value) {
  if (!PREF_KEYS.has(key)) throw notFound();
  const s = JSON.stringify(value ?? null);
  if (s.length > 4096) throw bad('Preferensi terlalu besar.');
  db.run('INSERT INTO user_prefs(user_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', ctx.user.id, key, s, nowIso());
  return value;
}

/* ======================================================================== */
/* Rekonsiliasi bank: daftar mutasi & centang                                */
/* ======================================================================== */
export function reconDetail(ctx, id) {
  const { row } = recordFor(ctx, 'bank_reconciliations', id, LEVEL.read);
  const st = reconState(row);
  const lines = db.all(`SELECT jl.id, j.id journal_id, j.date, j.number, j.description, j.source_no, jl.memo, jl.debit, jl.credit,
      (SELECT r.id FROM reconciliation_items ri JOIN bank_reconciliations r ON r.id = ri.recon_id WHERE ri.journal_line_id = jl.id AND r.id = ?) mine,
      (SELECT r.number FROM reconciliation_items ri JOIN bank_reconciliations r ON r.id = ri.recon_id WHERE ri.journal_line_id = jl.id AND r.status = 'selesai' AND r.id != ?) other
    FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id
    WHERE j.status = 'diposting' AND jl.account_id = ? AND jl.branch_id = ? AND j.date <= ? ORDER BY j.date, j.id`, row.id, row.id, st.bank.account_id, st.bank.branch_id, row.statement_date)
    .filter((l) => !l.other).map((l) => ({ ...l, cleared: !!l.mine }));
  return { recon: row, bank: { id: st.bank.id, name: st.bank.name }, gl: st.gl, cleared: st.cleared, difference: st.difference, lines };
}

export function reconSetItems(ctx, id, lineIds) {
  const { row } = recordFor(ctx, 'bank_reconciliations', id, LEVEL.write);
  if (row.status !== 'draf') throw conflict('Rekonsiliasi yang sudah selesai tidak dapat diubah.');
  if (!Array.isArray(lineIds) || lineIds.length > 5000) throw bad('Daftar baris tidak valid.');
  const b = db.get('SELECT account_id, branch_id FROM bank_accounts WHERE id = ?', row.bank_account_id);
  db.tx(() => {
    db.run('DELETE FROM reconciliation_items WHERE recon_id = ?', row.id);
    for (const lid of lineIds.map(Number)) {
      const l = db.get(`SELECT jl.id FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE jl.id = ? AND jl.account_id = ? AND jl.branch_id = ? AND j.status = 'diposting' AND j.date <= ?`, lid, b.account_id, b.branch_id, row.statement_date);
      if (!l) throw bad('Baris mutasi tidak valid untuk rekening ini.');
      if (db.get("SELECT 1 FROM reconciliation_items ri JOIN bank_reconciliations r ON r.id = ri.recon_id WHERE ri.journal_line_id = ? AND r.status = 'selesai'", lid)) throw conflict('Baris sudah direkonsiliasi pada periode lain.');
      db.run('INSERT INTO reconciliation_items(recon_id, journal_line_id) VALUES (?, ?)', row.id, lid);
    }
    const st = reconState(row);
    db.update('bank_reconciliations', row.id, { gl_balance: st.gl, cleared_balance: st.cleared, difference: st.difference, updated_at: nowIso(), updated_by: ctx.user.id });
    audit.log(ctx, 'recon.items', { entity: 'bank_reconciliations', entityId: row.id, companyId: row.company_id, detail: { count: lineIds.length, difference: st.difference } });
  });
  return reconDetail(ctx, id);
}

/* ======================================================================== */
/* Portal pelanggan & pemasok                                               */
/* ======================================================================== */
export function portalContext(ctx) {
  if (!can(ctx, 'portal', LEVEL.read) || !(ctx.user.customer_id || ctx.user.supplier_id)) throw forbidden('Akun ini bukan akun portal.');
  if (ctx.user.customer_id) {
    const p = db.get('SELECT id, code, name, company_id, credit_limit, terms_days FROM customers WHERE id = ?', ctx.user.customer_id);
    return { type: 'customer', party: p };
  }
  const p = db.get('SELECT id, code, name, company_id, terms_days FROM suppliers WHERE id = ?', ctx.user.supplier_id);
  return { type: 'supplier', party: p };
}

const PORTAL_DOCS = {
  customer: { invoices: ['sales_invoices', 'customer_id'], orders: ['sales_orders', 'customer_id'], quotations: ['quotations', 'customer_id'], payments: ['customer_receipts', 'customer_id'], returns: ['sales_returns', 'customer_id'] },
  supplier: { orders: ['purchase_orders', 'supplier_id'], bills: ['purchase_bills', 'supplier_id'], payments: ['supplier_payments', 'supplier_id'], returns: ['purchase_returns', 'supplier_id'] },
};
const PORTAL_HIDDEN_STATUS = { sales_orders: ['draf'], quotations: ['draf', 'menunggu', 'disetujui', 'batal'], purchase_orders: ['draf', 'menunggu'], sales_invoices: ['draf'], purchase_bills: ['draf'], customer_receipts: ['draf'], supplier_payments: ['draf', 'menunggu'], sales_returns: ['draf'], purchase_returns: ['draf'] };

export function portalSummary(ctx) {
  const pc = portalContext(ctx);
  const company = db.get('SELECT name, address FROM companies WHERE id = ?', pc.party.company_id);
  if (pc.type === 'customer') {
    const open = db.get("SELECT COUNT(*) n, COALESCE(SUM(total - paid),0) v, COALESCE(SUM(CASE WHEN due_date < ? THEN total - paid END),0) overdue FROM sales_invoices WHERE customer_id = ? AND status IN ('terbit','sebagian')", today(), pc.party.id);
    const orders = db.get("SELECT COUNT(*) n FROM sales_orders WHERE customer_id = ? AND status IN ('menunggu','disetujui')", pc.party.id).n;
    return { ...pc, company, open, orders };
  }
  const open = db.get("SELECT COUNT(*) n, COALESCE(SUM(total - paid),0) v FROM purchase_bills WHERE supplier_id = ? AND status IN ('terbit','sebagian')", pc.party.id);
  const orders = db.get("SELECT COUNT(*) n FROM purchase_orders WHERE supplier_id = ? AND status = 'disetujui'", pc.party.id).n;
  return { ...pc, company, open, orders };
}

export function portalDocuments(ctx, type) {
  const pc = portalContext(ctx);
  const def = PORTAL_DOCS[pc.type][type];
  if (!def) throw notFound();
  const [table, field] = def;
  const hidden = PORTAL_HIDDEN_STATUS[table] || [];
  return db.all(`SELECT id, number, date, ${table.includes('invoice') || table.includes('bill') ? 'due_date, paid,' : ''} total, status FROM "${table}" WHERE "${field}" = ? AND status NOT IN (${hidden.map(() => '?').join(',') || "''"}) ORDER BY date DESC, id DESC LIMIT 200`, pc.party.id, ...hidden);
}

export function portalDocument(ctx, type, id) {
  const pc = portalContext(ctx);
  const def = PORTAL_DOCS[pc.type][type];
  if (!def) throw notFound();
  const [table, field] = def;
  const e = ENTITIES[table];
  if (table === 'quotations') expireQuotations();
  const row = db.get(`SELECT * FROM "${table}" WHERE id = ? AND "${field}" = ?`, Number(id), pc.party.id);
  if (!row || (PORTAL_HIDDEN_STATUS[table] || []).includes(row.status)) throw notFound();
  const lines = e.lines ? crud.getLines(e, row.id).map((l) => ({ product: l.product_id__label || l.invoice_id__label || l.bill_id__label, description: l.description, qty: l.qty, price: l.price, discount_pct: l.discount_pct, amount: l.amount })) : [];
  audit.log(ctx, 'portal.view', { entity: table, entityId: row.id, companyId: row.company_id });
  // Faktur/tagihan: jadwal angsuran (termin bertahap) untuk mitra.
  const schedule = ['sales_invoices', 'purchase_bills'].includes(table) ? installmentsOf(table, row.id).map(({ label, due_date, amount, paid, open, status }) => ({ label, due_date, amount, paid, open, status })) : null;
  // Penawaran: syarat komersial untuk pelanggan (tanpa margin/HPP/catatan persetujuan internal).
  const quote = table === 'quotations' ? {
    valid_until: row.valid_until, revision: row.revision, attention: row.attention, salesperson: row.salesperson, terms_days: row.terms_days, lead_time_days: row.lead_time_days,
    delivery_terms: row.delivery_terms, notes: row.notes, sent_at: row.sent_at, responded_at: row.responded_at, accepted_by: row.accepted_by, customer_po: row.customer_po,
    canRespond: row.status === 'terkirim',
  } : {};
  return { id: row.id, type, number: row.number, date: row.date, due_date: row.due_date, subtotal: row.subtotal, tax: row.tax, tax_rate: row.tax_rate, total: row.total, paid: row.paid, status: row.status, lines, party: pc.party.name, company: db.get('SELECT name, address, npwp FROM companies WHERE id = ?', row.company_id), schedule, ...quote };
}

export function portalStatement(ctx, { from, to }) {
  const pc = portalContext(ctx);
  const f = isDate(from) ? from : `${today().slice(0, 4)}-01-01`, t = isDate(to) ? to : today();
  const r = reports.partnerStatement({ ...ctx, companyId: pc.party.company_id }, { companyId: pc.party.company_id, from: f, to: t, partnerType: pc.type, partnerId: pc.party.id });
  r.lines = r.lines.map(({ date, number, source_no, description, debit, credit, balance }) => ({ date, number: source_no || number, description, debit, credit, balance }));
  return r;
}

export function fxRate(currencyId, date) {
  const cur = db.get('SELECT * FROM currencies WHERE id = ?', Number(currencyId));
  if (!cur) throw notFound('Mata uang tidak ditemukan.');
  if (cur.is_base) return { rate: 1, base: true };
  const r = db.get('SELECT rate, date FROM exchange_rates WHERE currency_id = ? AND date <= ? ORDER BY date DESC, id DESC LIMIT 1', cur.id, isDate(date) ? date : today());
  return { rate: r?.rate ?? null, date: r?.date ?? null, code: cur.code };
}

export const ACCT = acct;
