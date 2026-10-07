/* Definisi rute API. Seluruh rute selain /api/auth/login dan /api/health
   memerlukan sesi sah; perubahan data memerlukan token CSRF. */
import * as db from './db.js';
import * as crud from './modules/crud.js';
import * as reports from './ledger/reports.js';
import * as auth from './security/auth.js';
import * as audit from './security/audit.js';
import { MODULES, STATUS, ENTITIES } from './modules/entities.js';
import { LEVEL, can, requirePerm, resolveScope, permissionsFor, clearPermCache } from './security/rbac.js';
import { getSetting, setSetting, securityPolicy, accountMap, approvalPolicy, clearSettingsCache } from './lib/settings.js';
import { clearAccountCache } from './ledger/posting.js';
import { copyBudgets } from './ledger/budget.js';
import { expireQuotations, portalRespond, quotationReport } from './ledger/quotation.js';
import { invoiceFromDeliveries } from './ledger/documents.js';
import { fulfillmentReport } from './ledger/fulfillment.js';
import { installmentsOf, installmentSchedule, advanceBalance, giroRegister } from './ledger/payments.js';
import { verifyPassword } from './security/crypto.js';
import { createBackup, listBackups } from './lib/backup.js';
import * as extras from './modules/extras.js';
import { HttpError, bad, forbidden, notFound, today, isDate, nowIso } from './lib/util.js';
import { DEFAULT_SECURITY_POLICY } from './config.js';

const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, opts });
};

export function match(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(pathname);
    if (m) return { ...r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

/* --- Bantuan konteks ------------------------------------------------------------- */
function scoped(ctx, q) {
  return resolveScope(ctx, q.company || ctx.headers['x-company'], q.branch ?? ctx.headers['x-branch']);
}

function userView(u) {
  const role = db.get('SELECT id, code, name FROM roles WHERE id = ?', u.role_id);
  return {
    id: u.id, username: u.username, fullName: u.full_name, email: u.email, role,
    companyId: u.company_id, branchId: u.branch_id, mfaEnabled: !!u.mfa_enabled,
    initials: String(u.full_name || u.username).split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase(),
    passwordChangedAt: u.password_changed_at, lastLoginAt: u.last_login_at,
    portal: u.customer_id ? 'customer' : u.supplier_id ? 'supplier' : null,
  };
}

/* --- Autentikasi ------------------------------------------------------------------ */
route('GET', '/api/health', () => ({ ok: true, time: nowIso() }), { public: true });

route('POST', '/api/auth/login', async (ctx, body) => {
  const out = await auth.login({ username: body.username, password: body.password, ip: ctx.ip, ua: ctx.ua });
  ctx.setSession(out.token);
  return { mfaRequired: out.mfaRequired, mustChangePassword: out.mustChangePassword, mfaSetupRequired: out.mfaSetupRequired };
}, { public: true, login: true });

route('POST', '/api/auth/mfa', (ctx, body) => {
  if (!ctx.session.mfa_pending) throw bad('Verifikasi MFA tidak diperlukan.');
  const raw = auth.verifyMfaLogin(ctx.session, body.code, ctx);
  ctx.setSession(raw);
  return { ok: true };
}, { allowMfaPending: true, login: true });

route('POST', '/api/auth/logout', (ctx) => {
  auth.revokeSession(ctx.session.id);
  audit.log(ctx, 'auth.logout', { entity: 'users', entityId: ctx.user.id });
  ctx.clearSession();
  return { ok: true };
}, { allowMfaPending: true, allowMustChange: true });

route('GET', '/api/auth/me', (ctx) => {
  const policy = securityPolicy();
  const u = ctx.user;
  const expired = u.password_changed_at && Date.parse(u.password_changed_at) + policy.passwordMaxAgeDays * 864e5 < Date.now();
  return {
    user: userView(u), csrf: ctx.session.csrf, mfaPending: !!ctx.session.mfa_pending,
    mustChangePassword: !!u.must_change_password || !!expired,
    permissions: ctx.perms, sessionIdleMinutes: policy.sessionIdleMinutes,
  };
}, { allowMfaPending: true, allowMustChange: true });

route('POST', '/api/auth/password', async (ctx, body) => {
  const u = db.get('SELECT * FROM users WHERE id = ?', ctx.user.id);
  if (!(await verifyPassword(String(body.current || ''), u.password_hash))) {
    audit.log(ctx, 'auth.password_change_failed', { entity: 'users', entityId: u.id });
    throw bad('Sandi saat ini salah.');
  }
  const errs = await auth.checkPasswordPolicy(body.next, u);
  if (errs.length) throw bad(`Kata sandi baru harus ${errs.join(', ')}.`);
  await auth.setPassword(u.id, body.next);
  auth.revokeAllSessions(u.id, ctx.session.id);
  audit.log(ctx, 'auth.password_changed', { entity: 'users', entityId: u.id });
  return { ok: true };
}, { allowMustChange: true });

route('POST', '/api/auth/mfa/setup', (ctx) => {
  if (ctx.user.mfa_enabled) throw bad('MFA sudah aktif. Nonaktifkan dahulu untuk mendaftar ulang.');
  const r = auth.startMfaSetup(ctx.user);
  audit.log(ctx, 'auth.mfa_setup_started', { entity: 'users', entityId: ctx.user.id });
  return r;
}, { allowMustChange: true });

route('POST', '/api/auth/mfa/enable', (ctx, body) => {
  auth.enableMfa(ctx.user, body.code);
  audit.log(ctx, 'auth.mfa_enabled', { entity: 'users', entityId: ctx.user.id });
  return { ok: true };
}, { allowMustChange: true });

route('POST', '/api/auth/mfa/disable', async (ctx, body) => {
  const u = db.get('SELECT * FROM users WHERE id = ?', ctx.user.id);
  if (!(await verifyPassword(String(body.password || ''), u.password_hash))) throw bad('Sandi salah.');
  if (securityPolicy().mfaRequiredForAdmin && (ctx.perms.admin || 0) >= 3) throw forbidden('Kebijakan mewajibkan MFA untuk administrator.');
  db.run('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?', u.id);
  audit.log(ctx, 'auth.mfa_disabled', { entity: 'users', entityId: u.id });
  return { ok: true };
});

route('GET', '/api/auth/sessions', (ctx) => db.all('SELECT id, created_at, last_seen, expires_at, ip, user_agent FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen DESC', ctx.user.id)
  .map((s) => ({ ...s, id: s.id.slice(0, 16), current: s.id === ctx.session.id })));

route('DELETE', '/api/auth/sessions/:id', (ctx, _b, p) => {
  const s = db.get('SELECT id FROM sessions WHERE user_id = ? AND substr(id, 1, 16) = ? AND revoked_at IS NULL', ctx.user.id, p.id);
  if (!s) throw notFound();
  auth.revokeSession(s.id);
  audit.log(ctx, 'auth.session_revoked', { entity: 'users', entityId: ctx.user.id });
  return { ok: true };
});

/* --- Metadata & konteks ------------------------------------------------------------ */
route('GET', '/api/meta', (ctx, _b, _p, q) => {
  scoped(ctx, q);
  return {
    entities: crud.metaFor(ctx), modules: MODULES, status: STATUS, permissions: ctx.perms,
    companies: ctx.companies, branches: ctx.branches, companyId: ctx.companyId, branchId: ctx.branchId,
    today: today(), canConsolidate: !ctx.user.company_id && !ctx.user.branch_id,
    company: db.get('SELECT id, code, name, legal_name, address, npwp FROM companies WHERE id = ?', ctx.companyId),
    importable: extras.IMPORTABLE.filter((k) => can(ctx, ENTITIES[k].module, LEVEL.write)),
  };
});

/* --- CRUD generik -------------------------------------------------------------------- */
/* Penawaran lewat masa berlaku ditandai kedaluwarsa sebelum dibaca/ditindaklanjuti. */
const sweep = (entity) => { if (entity === 'quotations') expireQuotations(); };
route('GET', '/api/e/:entity', (ctx, _b, p, q) => { sweep(p.entity); return crud.list(scoped(ctx, q), p.entity, q); });
route('GET', '/api/e/:entity/:id', (ctx, _b, p, q) => { sweep(p.entity); return crud.read(scoped(ctx, q), p.entity, p.id); });
route('POST', '/api/e/:entity', (ctx, b, p, q) => crud.create(scoped(ctx, q), p.entity, b));
route('PUT', '/api/e/:entity/:id', (ctx, b, p, q) => crud.update(scoped(ctx, q), p.entity, p.id, b));
route('DELETE', '/api/e/:entity/:id', (ctx, _b, p, q) => crud.remove(scoped(ctx, q), p.entity, p.id));
route('POST', '/api/e/:entity/:id/actions/:action', (ctx, b, p, q) => { sweep(p.entity); return crud.runAction(scoped(ctx, q), p.entity, p.id, p.action, b); });
route('GET', '/api/lookup/:entity', (ctx, _b, p, q) => crud.lookup(scoped(ctx, q), p.entity, q));

/* Ekspor CSV — dicatat di jejak audit; sel diawali =,+,-,@ dinetralkan (CSV injection). */
route('GET', '/api/export/:entity', (ctx, _b, p, q) => {
  scoped(ctx, q);
  const e = crud.mustEntity(p.entity);
  requirePerm(ctx, e.module, LEVEL.read);
  const { rows } = crud.list(ctx, p.entity, { ...q, size: 500, page: 1 });
  const cols = e.fields.filter((f) => !f.virtual && f.type !== 'password');
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map((f) => cell(f.label)).join(';');
  const body = rows.map((r) => cols.map((f) => cell(f.type === 'ref' ? r[`${f.name}__label`] : r[f.name])).join(';')).join('\n');
  audit.log(ctx, 'export', { entity: p.entity, companyId: ctx.companyId, detail: { rows: rows.length } });
  return { __raw: '﻿' + header + '\n' + body, type: 'text/csv; charset=utf-8', filename: `${p.entity}-${today()}.csv` };
});

/* --- Laporan -------------------------------------------------------------------------- */
function reportQuery(ctx, q) {
  scoped(ctx, q);
  const t = today();
  const from = isDate(q.from) ? q.from : `${t.slice(0, 4)}-01-01`;
  const to = isDate(q.to) ? q.to : t;
  return { companyId: ctx.companyId, branchId: ctx.branchId, from, to, asOf: isDate(q.asOf) ? q.asOf : to, mode: ['single', 'branch', 'consolidated'].includes(q.mode) ? q.mode : 'single' };
}

const REPORTS = {
  'laba-rugi': (ctx, r) => reports.incomeStatement(ctx, r),
  neraca: (ctx, r) => reports.balanceSheet(ctx, r),
  'neraca-saldo': (ctx, r) => reports.trialBalance(ctx, r),
  'buku-besar': (ctx, r, q) => reports.generalLedger(ctx, { ...r, accountId: q.account }),
  'arus-kas': (ctx, r) => reports.cashFlow(ctx, r),
  'umur-piutang': (ctx, r) => reports.arAging(ctx, r),
  'umur-hutang': (ctx, r) => reports.apAging(ctx, r),
  persediaan: (ctx, r) => reports.inventoryValuation(ctx, r),
  anggaran: (ctx, r, q) => reports.budgetVsActual(ctx, { ...r, year: Number(q.year) || Number(r.to.slice(0, 4)), view: ['ytd', 'bulanan', 'pusat-biaya'].includes(q.view) ? q.view : 'ytd', version: q.version === 'semua' ? 'semua' : 'disetujui' }),
  'anggaran-akun': (ctx, r, q) => reports.budgetByAccount(ctx, { ...r, year: Number(q.year) || Number(r.to.slice(0, 4)) }),
  proyek: (ctx, r) => reports.projectSummary(ctx, r),
  'proyek-detail': (ctx, r, q) => reports.projectDetail(ctx, { ...r, projectId: Number(q.project) }),
  penawaran: (ctx, r) => quotationReport(ctx, r),
  pemenuhan: (ctx, r) => fulfillmentReport(ctx, r),
  giro: (ctx, r, q) => giroRegister(ctx, { ...r, side: q.side === 'out' ? 'out' : 'in', from: isDate(q.from) ? q.from : null }),
  angsuran: (ctx, r, q) => installmentSchedule(ctx, { ...r, side: q.side === 'ap' ? 'ap' : 'ar', days: q.days }),
  pajak: (ctx, r) => reports.taxReport(ctx, r),
  'kartu-mitra': (ctx, r, q) => reports.partnerStatement(ctx, { ...r, partnerType: q.partner_type === 'supplier' ? 'supplier' : 'customer', partnerId: q.partner }),
};

route('GET', '/api/reports/:name', (ctx, _b, p, q) => {
  const fn = REPORTS[p.name];
  if (!fn) throw notFound('Laporan tidak dikenal.');
  const r = reportQuery(ctx, q);
  const needs = { 'umur-piutang': 'sales', 'umur-hutang': 'purchasing', persediaan: 'inventory', anggaran: 'finance', 'anggaran-akun': 'finance', proyek: 'projects', 'proyek-detail': 'projects', penawaran: 'sales', pemenuhan: 'sales' }[p.name]
    || (p.name === 'angsuran' ? (q.side === 'ap' ? 'purchasing' : 'sales') : null)
    || (p.name === 'giro' ? (q.side === 'out' ? 'purchasing' : 'sales') : null)
    || (p.name === 'kartu-mitra' ? (q.partner_type === 'supplier' ? 'purchasing' : 'sales') : 'reports');
  if (!can(ctx, needs, LEVEL.read) && !can(ctx, 'reports', LEVEL.read)) throw forbidden();
  if (r.mode === 'consolidated') requirePerm(ctx, 'reports', LEVEL.approve);
  if (r.mode !== 'single') r.branchId = null;
  return fn(ctx, r, q);
});

/* Salin anggaran dari tahun sebelumnya (sebagai draf) — butuh hak ubah Keuangan; teraudit. */
route('POST', '/api/budgets/copy', (ctx, body, _p, q) => {
  scoped(ctx, q);
  requirePerm(ctx, 'finance', LEVEL.write);
  const fromYear = Number(body.fromYear), toYear = Number(body.toYear);
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear)) throw bad('Tahun sumber dan tujuan wajib diisi.');
  const branchIds = ctx.branchId ? [ctx.branchId] : ctx.branches.map((b) => b.id);
  const res = copyBudgets(ctx, { companyId: ctx.companyId, branchIds, fromYear, toYear, adjustPct: Number(body.adjustPct) || 0, basis: body.basis === 'realisasi' ? 'realisasi' : 'anggaran' });
  audit.log(ctx, 'budgets.copy', { entity: 'budgets', companyId: ctx.companyId, branchId: ctx.branchId, detail: { fromYear, toYear, adjustPct: Number(body.adjustPct) || 0, basis: body.basis, ...res } });
  return res;
});

/* --- Pembayaran bertahap ------------------------------------------------------------- */
/* Jadwal angsuran & riwayat pembayaran satu faktur/tagihan (cakupan diperiksa lewat crud.read). */
route('GET', '/api/settlement/:entity/:id', (ctx, _b, p, q) => {
  scoped(ctx, q);
  if (!['sales_invoices', 'purchase_bills'].includes(p.entity)) throw notFound();
  const doc = crud.read(ctx, p.entity, p.id);
  const ar = p.entity === 'sales_invoices';
  const payments = db.all(ar
    ? `SELECT r.id, r.number, r.date, r.mode, r.status, l.amount, COALESCE(l.discount,0) discount, COALESCE(l.pph23,0) pph23, COALESCE(l.settled, l.amount) settled, 'customer_receipts' entity FROM customer_receipt_lines l JOIN customer_receipts r ON r.id = l.parent_id WHERE l.invoice_id = ? AND r.status <> 'draf' ORDER BY r.date, r.id`
    : `SELECT r.id, r.number, r.date, r.mode, r.status, l.amount, COALESCE(l.discount,0) discount, COALESCE(l.pph23,0) pph23, COALESCE(l.settled, l.amount) settled, 'supplier_payments' entity FROM supplier_payment_lines l JOIN supplier_payments r ON r.id = l.parent_id WHERE l.bill_id = ? AND r.status <> 'draf' ORDER BY r.date, r.id`, doc.id);
  const credits = db.all(ar
    ? "SELECT id, number, date, total settled, 'sales_returns' entity FROM sales_returns WHERE sales_invoice_id = ? AND status = 'diposting'"
    : "SELECT id, number, date, total settled, 'purchase_returns' entity FROM purchase_returns WHERE purchase_bill_id = ? AND status = 'diposting'", doc.id);
  const partyType = ar ? 'customer' : 'supplier';
  return { installments: installmentsOf(p.entity, doc.id), payments, credits, open: Math.round((doc.total - (doc.paid || 0)) * 100) / 100, advance: advanceBalance(partyType, doc[ar ? 'customer_id' : 'supplier_id'], doc.company_id) };
});
/* Saldo uang muka mitra (untuk formulir penerimaan/pembayaran). */
route('GET', '/api/advance/:type/:id', (ctx, _b, p, q) => {
  scoped(ctx, q);
  const ar = p.type === 'customer';
  if (!ar && p.type !== 'supplier') throw notFound();
  requirePerm(ctx, ar ? 'sales' : 'purchasing', LEVEL.read);
  const party = db.get(`SELECT id, company_id FROM ${ar ? 'customers' : 'suppliers'} WHERE id = ?`, Number(p.id));
  if (!party || party.company_id !== ctx.companyId) throw notFound();
  return { balance: advanceBalance(p.type, party.id, ctx.companyId) };
});

/* --- Surat jalan → faktur ------------------------------------------------------------ */
/* Surat jalan terkirim yang belum difakturkan (untuk faktur gabungan), dibatasi cakupan perusahaan/cabang. */
route('GET', '/api/deliveries/uninvoiced', (ctx, _b, _p, q) => {
  scoped(ctx, q);
  requirePerm(ctx, 'sales', LEVEL.read);
  const where = ["d.company_id = ?", "d.status = 'dikirim'", 'd.invoice_id IS NULL'], params = [ctx.companyId];
  if (ctx.branchId) { where.push('d.branch_id = ?'); params.push(ctx.branchId); }
  if (q.customer) { where.push('d.customer_id = ?'); params.push(Number(q.customer)); }
  return db.all(`SELECT d.id, d.number, d.date, d.value, d.customer_id, c.name customer, so.number so_number, so.currency_id, so.tax_rate, w.name warehouse
    FROM delivery_orders d JOIN customers c ON c.id = d.customer_id JOIN sales_orders so ON so.id = d.sales_order_id JOIN warehouses w ON w.id = d.warehouse_id
    WHERE ${where.join(' AND ')} ORDER BY c.name, d.date, d.number LIMIT 500`, ...params);
});
/* Faktur dari satu/beberapa surat jalan — setiap surat jalan diperiksa cakupannya (anti-IDOR). */
route('POST', '/api/deliveries/invoice', (ctx, body, _p, q) => {
  scoped(ctx, q);
  requirePerm(ctx, 'sales', LEVEL.write);
  const ids = Array.isArray(body.delivery_ids) ? body.delivery_ids.slice(0, 50) : [];
  for (const id of ids) crud.read(ctx, 'delivery_orders', id);
  if (body.date !== undefined && body.date !== null && body.date !== '' && !isDate(body.date)) throw bad('Tanggal faktur tidak valid.');
  return db.tx(() => invoiceFromDeliveries(ctx, ids, { date: body.date || null }));
});

route('GET', '/api/dashboard', (ctx, _b, _p, q) => {
  scoped(ctx, q);
  requirePerm(ctx, 'dashboard', LEVEL.read);
  const d = reports.dashboard(ctx, { companyId: ctx.companyId, branchId: ctx.branchId });
  if (!can(ctx, 'reports', LEVEL.read)) { d.kpis = { arOpen: d.kpis.arOpen, apOpen: d.kpis.apOpen }; d.trend = []; d.byBranch = []; }
  return d;
});

/* Kotak persetujuan lintas modul. */
const APPROVAL_SOURCES = [
  ['sales_orders', 'menunggu', 'approve'], ['purchase_orders', 'menunggu', 'approve'], ['purchase_requests', 'menunggu', 'approve'],
  ['journals', 'diajukan', 'approve'], ['supplier_payments', 'menunggu', 'post'], ['leave_requests', 'menunggu', 'approve'], ['payroll_runs', 'draf', 'approve'], ['budgets', 'diajukan', 'approve'], ['quotations', 'menunggu', 'approve'],
];
route('GET', '/api/approvals', (ctx, _b, _p, q) => {
  scoped(ctx, q);
  const out = [];
  for (const [key, status, action] of APPROVAL_SOURCES) {
    const e = ENTITIES[key];
    if (!can(ctx, e.module, LEVEL.approve)) continue;
    const { rows } = crud.list(ctx, key, { status, size: 50 });
    for (const r of rows) out.push({ entity: key, entityLabel: e.one, action, id: r.id, number: r.number || r.code, date: r.date || r.start_date || r.period, total: r.total ?? r.amount ?? null, title: r.customer_id__label || r.supplier_id__label || r.employee_id__label || (r.account_id__label ? `${r.account_id__label} · ${r.year}` : null) || r.description || r.requester || r.period, note: r.approval_note || r.notes || r.reason || null, createdBy: r.created_by, sodBlocked: r.created_by === ctx.user.id, branch: r.branch_id__label });
  }
  return out;
});

/* --- Peran & izin -------------------------------------------------------------------- */
route('GET', '/api/roles/:id/permissions', (ctx, _b, p) => {
  requirePerm(ctx, 'admin', LEVEL.read);
  return { modules: MODULES, permissions: permissionsFor(Number(p.id)) };
});

route('PUT', '/api/roles/:id/permissions', (ctx, body, p) => {
  requirePerm(ctx, 'admin', LEVEL.admin);
  const role = db.get('SELECT * FROM roles WHERE id = ?', Number(p.id));
  if (!role) throw notFound();
  if (role.id === ctx.user.role_id) throw forbidden('Anda tidak dapat mengubah izin peran Anda sendiri (pemisahan tugas).');
  const before = permissionsFor(role.id);
  const valid = new Set(MODULES.map((m) => m[0]));
  db.tx(() => {
    for (const [mod, lvl] of Object.entries(body.permissions || {})) {
      if (!valid.has(mod)) throw bad(`Modul ${mod} tidak dikenal.`);
      const n = Number(lvl);
      if (!Number.isInteger(n) || n < 0 || n > 4) throw bad('Tingkat izin harus 0–4.');
      db.run('INSERT INTO role_permissions(role_id, module, level) VALUES (?, ?, ?) ON CONFLICT(role_id, module) DO UPDATE SET level = excluded.level', role.id, mod, n);
    }
    clearPermCache();
    audit.log(ctx, 'permissions.update', { entity: 'roles', entityId: role.id, detail: { before, after: permissionsFor(role.id) } });
  });
  return { ok: true, permissions: permissionsFor(role.id) };
});

/* --- Pengaturan ----------------------------------------------------------------------- */
const SETTING_KEYS = {
  security_policy: { get: securityPolicy, defaults: DEFAULT_SECURITY_POLICY },
  account_map: { get: accountMap },
  approval_policy: { get: approvalPolicy },
};
route('GET', '/api/settings', (ctx) => {
  requirePerm(ctx, 'admin', LEVEL.read);
  return Object.fromEntries(Object.entries(SETTING_KEYS).map(([k, s]) => [k, s.get()]));
});

route('PUT', '/api/settings/:key', (ctx, body, p) => {
  requirePerm(ctx, 'admin', LEVEL.admin);
  const s = SETTING_KEYS[p.key];
  if (!s) throw notFound();
  const cur = s.get();
  const next = { ...cur };
  for (const [k, v] of Object.entries(body)) {
    if (!(k in cur)) throw bad(`Pengaturan ${k} tidak dikenal.`);
    if (typeof cur[k] === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw bad(`${k} harus angka positif.`);
      next[k] = n;
    } else if (typeof cur[k] === 'boolean') next[k] = !!v;
    else next[k] = String(v).slice(0, 40);
  }
  if (p.key === 'security_policy') {
    if (next.passwordMinLength < 8) throw bad('Panjang sandi minimum tidak boleh kurang dari 8.');
    if (next.lockoutThreshold < 3 || next.lockoutThreshold > 20) throw bad('Ambang penguncian 3–20 percobaan.');
    if (next.sessionIdleMinutes < 5 || next.sessionIdleMinutes > 240) throw bad('Batas sesi diam 5–240 menit.');
  }
  if (p.key === 'approval_policy' && !['none', 'warn', 'block'].includes(next.budgetControl)) throw bad('Kontrol anggaran harus none, warn, atau block.');
  if (p.key === 'account_map') {
    for (const code of Object.values(next)) if (!db.get('SELECT id FROM accounts WHERE code = ? AND is_header = 0', code)) throw bad(`Akun ${code} tidak ditemukan atau akun induk.`);
    clearAccountCache();
  }
  setSetting(p.key, next, ctx.user.id);
  clearSettingsCache();
  audit.log(ctx, 'settings.update', { entity: 'settings', detail: { key: p.key, changes: Object.fromEntries(Object.keys(next).filter((k) => next[k] !== cur[k]).map((k) => [k, [cur[k], next[k]]])) } });
  return s.get();
});

/* --- Jejak audit & pemantauan keamanan ---------------------------------------------- */
route('GET', '/api/audit', (ctx, _b, _p, q) => {
  requirePerm(ctx, 'compliance', LEVEL.read);
  const where = ['1=1'], params = [];
  if (q.q) { where.push('(username LIKE ? OR action LIKE ? OR entity LIKE ? OR detail LIKE ?)'); const t = `%${String(q.q).slice(0, 60)}%`; params.push(t, t, t, t); }
  if (q.action) { where.push('action LIKE ?'); params.push(`${String(q.action).slice(0, 40)}%`); }
  if (q.entity) { where.push('entity = ?'); params.push(String(q.entity)); }
  if (isDate(q.from)) { where.push('ts >= ?'); params.push(q.from); }
  if (isDate(q.to)) { where.push('ts < date(?, \'+1 day\')'); params.push(q.to); }
  const size = Math.min(Number(q.size) || 50, 500), page = Math.max(Number(q.page) || 1, 1);
  const total = db.get(`SELECT COUNT(*) n FROM audit_log WHERE ${where.join(' AND ')}`, ...params).n;
  const rows = db.all(`SELECT id, ts, username, ip, action, entity, entity_id, company_id, detail, hash FROM audit_log WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, size, (page - 1) * size);
  return { rows, total, page, size };
});

route('GET', '/api/audit/verify', (ctx) => {
  requirePerm(ctx, 'compliance', LEVEL.read);
  const r = audit.verifyChain();
  audit.log(ctx, 'audit.verify', { detail: { ok: r.ok, count: r.count } });
  return r;
});

route('GET', '/api/security/overview', (ctx) => {
  requirePerm(ctx, 'admin', LEVEL.read);
  const policy = securityPolicy();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  return {
    policy,
    failedLogins7d: db.get('SELECT COUNT(*) n FROM login_attempts WHERE success = 0 AND ts >= ?', since).n,
    successLogins7d: db.get('SELECT COUNT(*) n FROM login_attempts WHERE success = 1 AND ts >= ?', since).n,
    recentFailures: db.all('SELECT ts, username, ip, reason FROM login_attempts WHERE success = 0 ORDER BY id DESC LIMIT 15'),
    lockedUsers: db.all("SELECT id, username, full_name, locked_until FROM users WHERE locked_until > ? OR status = 'terkunci'", nowIso()),
    activeSessions: db.get('SELECT COUNT(*) n FROM sessions WHERE revoked_at IS NULL AND expires_at > ?', nowIso()).n,
    usersWithoutMfa: db.all("SELECT id, username, full_name FROM users WHERE status = 'aktif' AND mfa_enabled = 0"),
    passwordExpired: db.all("SELECT id, username, full_name, password_changed_at FROM users WHERE status = 'aktif' AND (password_changed_at IS NULL OR password_changed_at < ?)", new Date(Date.now() - policy.passwordMaxAgeDays * 864e5).toISOString()),
    dormantUsers: db.all("SELECT id, username, full_name, last_login_at FROM users WHERE status = 'aktif' AND (last_login_at IS NULL OR last_login_at < ?)", new Date(Date.now() - 90 * 864e5).toISOString()),
    privileged: db.all("SELECT u.id, u.username, u.full_name, r.name role FROM users u JOIN roles r ON r.id = u.role_id JOIN role_permissions rp ON rp.role_id = r.id AND rp.module = 'admin' AND rp.level >= 3 WHERE u.status = 'aktif'"),
    auditChain: audit.verifyChain(),
  };
});

/* --- Cadangan --------------------------------------------------------------------------- */
route('POST', '/api/admin/backup', async (ctx) => {
  requirePerm(ctx, 'admin', LEVEL.admin);
  const b = await createBackup();
  audit.log(ctx, 'backup.create', { detail: b });
  return b;
});
route('GET', '/api/admin/backups', (ctx) => { requirePerm(ctx, 'admin', LEVEL.admin); return listBackups(); });

/* --- Fitur lanjutan --------------------------------------------------------------- */
route('GET', '/api/notifications', (ctx, _b, _p, q) => extras.notifications(scoped(ctx, q)));
route('GET', '/api/search', (ctx, _b, _p, q) => extras.search(scoped(ctx, q), q.q));
route('GET', '/api/analytics', (ctx, _b, _p, q) => {
  const r = reportQuery(ctx, q);
  requirePerm(ctx, 'reports', LEVEL.read);
  return extras.analytics(ctx, r);
});
route('GET', '/api/bsc', (ctx, _b, _p, q) => extras.balancedScorecard(ctx, reportQuery(ctx, q)));
route('POST', '/api/assistant', (ctx, b, _p, q) => {
  scoped(ctx, q);
  const out = extras.assistant(ctx, b.q);
  audit.log(ctx, 'assistant.query', { companyId: ctx.companyId, detail: { q: String(b.q || '').slice(0, 120) } });
  return out;
});
route('GET', '/api/mrp', (ctx, _b, _p, q) => extras.mrp(scoped(ctx, q)));
route('POST', '/api/mrp/request', (ctx, b, _p, q) => extras.mrpCreateRequest(scoped(ctx, q), b.items, b.branch_id));
route('POST', '/api/import/:entity', (ctx, b, p, q) => extras.importRows(scoped(ctx, q), p.entity, b.rows), { maxBody: 4 * 1024 * 1024 });
route('GET', '/api/attachments/:entity/:id', (ctx, _b, p, q) => extras.listAttachments(scoped(ctx, q), p.entity, p.id));
route('POST', '/api/attachments/:entity/:id', (ctx, b, p, q) => extras.addAttachment(scoped(ctx, q), p.entity, p.id, b), { maxBody: 8 * 1024 * 1024 });
route('GET', '/api/attachment/:id', (ctx, _b, p, q) => extras.downloadAttachment(scoped(ctx, q), p.id));
route('DELETE', '/api/attachment/:id', (ctx, _b, p, q) => extras.deleteAttachment(scoped(ctx, q), p.id));
route('GET', '/api/prefs/:key', (ctx, _b, p) => ({ value: extras.getPref(ctx, p.key) }));
route('PUT', '/api/prefs/:key', (ctx, b, p) => ({ value: extras.setPref(ctx, p.key, b.value) }));
route('GET', '/api/bank-recon/:id', (ctx, _b, p, q) => extras.reconDetail(scoped(ctx, q), p.id));
route('PUT', '/api/bank-recon/:id/items', (ctx, b, p, q) => extras.reconSetItems(scoped(ctx, q), p.id, b.lineIds));
route('GET', '/api/fx-rate', (ctx, _b, _p, q) => extras.fxRate(q.currency_id, q.date));
route('GET', '/api/portal/summary', (ctx) => extras.portalSummary(ctx));
route('GET', '/api/portal/docs/:type', (ctx, _b, p) => extras.portalDocuments(ctx, p.type));
route('GET', '/api/portal/docs/:type/:id', (ctx, _b, p) => extras.portalDocument(ctx, p.type, p.id));
route('GET', '/api/portal/statement', (ctx, _b, _p, q) => extras.portalStatement(ctx, q));
route('POST', '/api/portal/quotations/:id/respond', (ctx, b, p) => { const pc = extras.portalContext(ctx); if (pc.type !== 'customer') throw forbidden(); return portalRespond(ctx, pc.party, p.id, b); });

export { HttpError };
