/* ==========================================================================
   Layanan CRUD generik berbasis definisi entitas.
   Validasi masukan sisi server, pembatasan cakupan data, penguncian
   optimistis, penyamaran data sensitif, dan jejak audit di setiap perubahan.
   ========================================================================== */
import * as db from '../db.js';
import { ENTITIES, entity as getEntity } from './entities.js';
import { HOOKS } from './hooks.js';
import { ACTIONS } from '../ledger/documents.js';
import * as audit from '../security/audit.js';
import { LEVEL, can, requirePerm, scopeWhere, assertInScope, branchForWrite } from '../security/rbac.js';
import { HttpError, bad, notFound, conflict, forbidden, round2, nowIso, isDate, today } from '../lib/util.js';
import { nextNumber } from '../ledger/posting.js';

export function mustEntity(key) {
  const e = getEntity(key);
  if (!e) throw notFound('Entitas tidak dikenal.');
  return e;
}

/* --- Label rujukan ----------------------------------------------------------- */
export function labelExpr(refKey, alias) {
  const r = ENTITIES[refKey];
  const has = (n) => r.fields.some((f) => f.name === n);
  if (refKey === 'users') return `${alias}.full_name`;
  if (r.number) return `${alias}.number`;
  if (has('code') && r.title !== 'code') return `(${alias}.code || ' · ' || ${alias}."${r.title}")`;
  return `${alias}."${r.title}"`;
}

function scopeSql(sql, ctx) {
  return sql.replace(/\{\{scope:(\w+)\}\}/g, (_, a) => {
    let s = `AND ${a}.company_id = ${Number(ctx.companyId)}`;
    if (ctx.branchId) s += a === 'j' ? ` AND jl.branch_id = ${Number(ctx.branchId)}` : ` AND ${a}.branch_id = ${Number(ctx.branchId)}`;
    return s;
  });
}

function selectParts(e, ctx) {
  const cols = ['t.*'];
  const joins = [];
  for (const f of e.fields) {
    if (f.type === 'ref' && !f.virtual) {
      const a = `r_${f.name}`;
      joins.push(`LEFT JOIN "${ENTITIES[f.ref].table}" ${a} ON ${a}.id = t."${f.name}"`);
      cols.push(`${labelExpr(f.ref, a)} AS "${f.name}__label"`);
    }
  }
  if (e.scope === 'branch') {
    joins.push('LEFT JOIN branches r_branch ON r_branch.id = t.branch_id');
    cols.push('r_branch.name AS "branch_id__label"');
  }
  for (const [k, c] of Object.entries(e.computed)) cols.push(`${scopeSql(c.sql, ctx)} AS "${k}"`);
  return { cols: cols.join(', '), joins: joins.join('\n') };
}

/* --- Penyamaran data pribadi (UU PDP / ISO 27001 A.8.11) -------------------- */
function mask(e, ctx, row, fields = e.fields) {
  if (!row || can(ctx, 'pii', LEVEL.read)) return row;
  for (const f of fields) {
    if (!f.sensitive || row[f.name] == null || row[f.name] === '') continue;
    const v = String(row[f.name]);
    row[f.name] = f.type === 'money' ? null : '•••• ' + v.slice(-3);
  }
  row.__masked = true;
  return row;
}

/** Samarkan bidang sensitif sebelum dicatat di jejak audit (data minimisasi). */
function redact(e, obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const f of e.fields) if (f.sensitive && out[f.name] != null) out[f.name] = Array.isArray(out[f.name]) ? ['[PII]', '[PII]'] : '[PII]';
  delete out.password_hash; delete out.mfa_secret;
  return out;
}

/* --- Daftar ------------------------------------------------------------------ */
export function list(ctx, key, q = {}) {
  const e = mustEntity(key);
  requirePerm(ctx, e.module, LEVEL.read);
  const { cols, joins } = selectParts(e, ctx);
  const where = [], params = [];
  const sc = scopeWhere(ctx, e.scope);
  where.push(sc.sql); params.push(...sc.params);

  if (q.q) {
    const term = `%${String(q.q).slice(0, 100).replace(/[%_\\]/g, (m) => '\\' + m)}%`;
    const parts = [];
    for (const f of e.fields.filter((x) => x.search)) {
      parts.push(f.type === 'ref' ? `${labelExpr(f.ref, `r_${f.name}`)} LIKE ? ESCAPE '\\'` : `t."${f.name}" LIKE ? ESCAPE '\\'`);
      params.push(term);
    }
    if (e.number) { parts.push(`t.number LIKE ? ESCAPE '\\'`); params.push(term); }
    if (parts.length) where.push(`(${parts.join(' OR ')})`);
  }
  // Saringan bidang (hanya bidang yang terdefinisi — daftar putih).
  for (const f of e.fields) {
    const v = q[`f_${f.name}`];
    if (v === undefined || v === '' || f.virtual) continue;
    const vals = String(v).split(',').slice(0, 20);
    where.push(`t."${f.name}" IN (${vals.map(() => '?').join(',')})`);
    params.push(...vals.map((x) => (['ref', 'int', 'bool'].includes(f.type) ? Number(x) : x)));
  }
  const dateField = e.fields.find((f) => f.name === 'date') ? 'date' : null;
  if (dateField && isDate(q.from)) { where.push(`t.date >= ?`); params.push(q.from); }
  if (dateField && isDate(q.to)) { where.push(`t.date <= ?`); params.push(q.to); }

  const baseWhere = where.join(' AND ');
  const statusCounts = {};
  if (e.statusField) {
    for (const r of db.all(`SELECT t."${e.statusField}" s, COUNT(*) n FROM "${e.table}" t ${joins} WHERE ${baseWhere} GROUP BY 1`, ...params)) statusCounts[r.s] = r.n;
  }
  if (q.status && q.status !== 'semua' && e.statusField) {
    where.push(`t."${e.statusField}" = ?`); params.push(String(q.status));
  }
  const fullWhere = where.join(' AND ');

  const sortable = new Set(['id', 'created_at', 'updated_at', ...e.fields.filter((f) => !f.virtual).map((f) => f.name), ...Object.keys(e.computed)]);
  const sortKey = sortable.has(q.sort) ? q.sort : e.sort || 'id';
  const dir = (q.dir || e.sortDir || 'asc') === 'desc' ? 'DESC' : 'ASC';
  const sortField = e.fields.find((f) => f.name === sortKey);
  const orderBy = sortField?.type === 'ref' ? `"${sortKey}__label"` : e.computed[sortKey] ? `"${sortKey}"` : `t."${sortKey}"`;
  const size = Math.min(Math.max(Number(q.size) || e.pageSize || 25, 1), 500);
  const page = Math.max(Number(q.page) || 1, 1);

  const total = db.get(`SELECT COUNT(*) n FROM "${e.table}" t ${joins} WHERE ${fullWhere}`, ...params).n;
  const rows = db.all(`SELECT ${cols} FROM "${e.table}" t ${joins} WHERE ${fullWhere} ORDER BY ${orderBy} ${dir}, t.id ${dir} LIMIT ? OFFSET ?`, ...params, size, (page - 1) * size);
  for (const r of rows) { mask(e, ctx, r); delete r.password_hash; delete r.mfa_secret; }
  return { rows, total, page, size, statusCounts };
}

/* --- Ambil satu --------------------------------------------------------------- */
export function getRow(e, id) {
  return db.get(`SELECT * FROM "${e.table}" WHERE id = ?`, Number(id));
}

export function getLines(e, id) {
  if (!e.lines) return [];
  const cols = ['l.*'], joins = [];
  for (const f of e.lines.fields) {
    if (f.type === 'ref') {
      const a = `r_${f.name}`;
      joins.push(`LEFT JOIN "${ENTITIES[f.ref].table}" ${a} ON ${a}.id = l."${f.name}"`);
      cols.push(`${labelExpr(f.ref, a)} AS "${f.name}__label"`);
    }
  }
  return db.all(`SELECT ${cols.join(', ')} FROM "${e.lines.table}" l ${joins.join(' ')} WHERE l.parent_id = ? ORDER BY l.line_no, l.id`, Number(id));
}

export function read(ctx, key, id) {
  const e = mustEntity(key);
  requirePerm(ctx, e.module, LEVEL.read);
  const { cols, joins } = selectParts(e, ctx);
  const row = db.get(`SELECT ${cols} FROM "${e.table}" t ${joins} WHERE t.id = ?`, Number(id));
  if (!row) throw notFound();
  assertInScope(ctx, e.scope, row);
  delete row.password_hash; delete row.mfa_secret;
  mask(e, ctx, row);
  if (e.lines) row.lines = getLines(e, id).map((l) => mask({}, ctx, l, e.lines.fields));
  row.__journals = db.all(`SELECT id, number, date, description, total, status, reversal_of FROM journals WHERE source_type = ? AND source_id = ? ORDER BY id`, key, row.id);
  row.__audit = db.all('SELECT ts, username, action, detail FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY id DESC LIMIT 30', key, row.id);
  row.__actions = availableActions(ctx, e, row);
  row.__editable = isEditable(e, row) && can(ctx, e.module, LEVEL.write) && !e.readonlyEntity;
  return row;
}

function isEditable(e, row) {
  if (!e.editable || !e.statusField) return true;
  return e.editable.includes(row[e.statusField]);
}

function availableActions(ctx, e, row) {
  return e.actions
    .filter((a) => !a.from || a.from.includes(row[e.statusField]))
    .filter((a) => can(ctx, e.module, Math.min(a.level, 3)) && (a.level < 4 || can(ctx, 'admin', 3)))
    .map((a) => ({ name: a.name, label: a.label, confirm: a.confirm || null, params: a.params ? a.params.map((p) => openAmountDefault(e, row, p)) : null, sodBlocked: !!(a.sod && row.created_by === ctx.user.id) }));
}

/* Aksi bayar dari faktur/tagihan: nilai bawaan = sisa terbuka (boleh diubah menjadi sebagian). */
function openAmountDefault(e, row, p) {
  if (p.name === 'amount' && ['sales_invoices', 'purchase_bills'].includes(e.key)) return { ...p, default: Math.round(((row.total || 0) - (row.paid || 0)) * 100) / 100, help: `${p.help || ''} Sisa terbuka saat ini ${(Math.round(((row.total || 0) - (row.paid || 0)) * 100) / 100).toLocaleString('id-ID')}.`.trim() };
  return p;
}

/* --- Validasi ----------------------------------------------------------------- */
function coerce(f, v, ctx, companyId) {
  if (v === undefined) return undefined;
  if (v === null || v === '') {
    if (f.type === 'bool') return 0;
    return null;
  }
  const label = f.label;
  switch (f.type) {
    case 'text': case 'textarea': case 'email': case 'password': {
      if (typeof v !== 'string' && typeof v !== 'number') throw bad(`${label}: format tidak valid.`);
      const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
      if (s.length > (f.max || 200)) throw bad(`${label}: maksimal ${f.max || 200} karakter.`);
      if (f.pattern && !new RegExp(f.pattern).test(s)) throw bad(`${label}: format tidak valid.`);
      if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad(`${label}: alamat surel tidak valid.`);
      return s;
    }
    case 'int': case 'number': case 'money': case 'pct': {
      const n = Number(v);
      if (!Number.isFinite(n)) throw bad(`${label}: harus berupa angka.`);
      if (f.type === 'int' && !Number.isInteger(n)) throw bad(`${label}: harus bilangan bulat.`);
      if (f.min !== undefined && n < f.min) throw bad(`${label}: minimal ${f.min}.`);
      if (f.max !== undefined && n > f.max) throw bad(`${label}: maksimal ${f.max}.`);
      if (Math.abs(n) > 1e14) throw bad(`${label}: nilai terlalu besar.`);
      return f.type === 'money' ? round2(n) : n;
    }
    case 'bool': return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
    case 'date': if (!isDate(String(v))) throw bad(`${label}: tanggal tidak valid.`); return String(v);
    case 'select': {
      const opts = f.options.map((o) => (Array.isArray(o) ? o[0] : o));
      if (!opts.includes(String(v))) throw bad(`${label}: pilihan tidak valid.`);
      return String(v);
    }
    case 'ref': {
      const id = Number(v);
      if (!Number.isInteger(id) || id <= 0) throw bad(`${label}: rujukan tidak valid.`);
      const re = ENTITIES[f.ref];
      const r = db.get(`SELECT * FROM "${re.table}" WHERE id = ?`, id);
      if (!r) throw bad(`${label}: data rujukan tidak ditemukan.`);
      if (re.scope !== 'global' && companyId && r.company_id !== companyId) throw bad(`${label}: data rujukan berada di perusahaan lain.`);
      for (const [k, want] of Object.entries(f.refFilter || {})) {
        if (k === 'status') continue;
        if (Array.isArray(want) ? !want.includes(r[k]) : r[k] !== want) throw bad(`${label}: ${labelFor(re, r)} tidak memenuhi syarat.`);
      }
      return id;
    }
    default: throw bad(`${label}: tipe tidak didukung.`);
  }
}

const labelFor = (re, r) => r.code || r.number || r[re.title] || `#${r.id}`;

function validateFields(fields, body, ctx, { companyId, isCreate, existing }) {
  const out = {};
  const canPii = can(ctx, 'pii', LEVEL.read);
  for (const f of fields) {
    if (f.readonly) continue;
    if (f.createOnly && !isCreate) continue;
    if (f.sensitive && !canPii && !isCreate) continue; // nilai tersamar tidak boleh menimpa data asli
    let v = coerce(f, body[f.name], ctx, companyId);
    if (v === undefined && isCreate && f.default !== undefined) v = f.default;
    if (v === undefined) continue;
    out[f.name] = v;
  }
  for (const f of fields) {
    if (!f.required || f.readonly || (f.createOnly && !isCreate)) continue;
    const v = f.name in out ? out[f.name] : existing?.[f.name];
    if (v === null || v === undefined || v === '') throw bad(`${f.label} wajib diisi.`);
  }
  return out;
}

function validateLines(e, lines, ctx, companyId) {
  if (!Array.isArray(lines)) throw bad('Baris dokumen harus berupa daftar.');
  if (lines.length > 500) throw bad('Maksimal 500 baris per dokumen.');
  return lines.map((l, i) => {
    try {
      return validateFields(e.lines.fields, l || {}, ctx, { companyId, isCreate: true });
    } catch (err) {
      err.message = `Baris ${i + 1}: ${err.message}`;
      throw err;
    }
  });
}

function writeLines(e, parentId, lines) {
  db.run(`DELETE FROM "${e.lines.table}" WHERE parent_id = ?`, parentId);
  lines.forEach((l, i) => db.insert(e.lines.table, { ...l, parent_id: parentId, line_no: i + 1 }));
}

function checkUnique(e, row, companyId, excludeId = 0) {
  for (const f of e.fields.filter((x) => x.unique)) {
    if (row[f.name] == null) continue;
    const scope = e.scope === 'global' ? '' : ' AND company_id = ?';
    const args = [row[f.name], excludeId, ...(e.scope === 'global' ? [] : [companyId])];
    if (db.get(`SELECT id FROM "${e.table}" WHERE "${f.name}" = ? AND id != ?${scope}`, ...args)) throw conflict(`${f.label} "${row[f.name]}" sudah dipakai.`);
  }
}

/** Cabang dokumen dapat disimpulkan dari rujukan bercakupan cabang (gudang, rekening, aset…). */
function inferBranch(e, row) {
  for (const f of e.fields) {
    if (f.type !== 'ref' || !row[f.name] || ENTITIES[f.ref].scope !== 'branch') continue;
    const r = db.get(`SELECT branch_id FROM "${ENTITIES[f.ref].table}" WHERE id = ?`, row[f.name]);
    if (r) return r.branch_id;
  }
  return null;
}

/* --- Buat --------------------------------------------------------------------- */
export async function create(ctx, key, body = {}) {
  const e = mustEntity(key);
  if (e.readonlyEntity) throw forbidden('Data ini hanya dapat dibuat oleh sistem.');
  requirePerm(ctx, e.module, LEVEL.write);
  const hooks = HOOKS[key] || {};
  const companyId = e.scope === 'global' ? null : ctx.companyId;
  const row = validateFields(e.fields, body, ctx, { companyId, isCreate: true });
  let lines = e.lines ? validateLines(e, body.lines || [], ctx, companyId) : null;

  if (e.scope !== 'global') row.company_id = ctx.companyId;
  if (e.scope === 'branch') row.branch_id = branchForWrite(ctx, body.branch_id || inferBranch(e, row));
  if (e.statusField && (e.editable || row[e.statusField] == null)) row[e.statusField] = e.fields.find((f) => f.name === e.statusField).default;
  if (hooks.beforeCreate) await hooks.beforeCreate(ctx, row, body);
  for (const f of e.fields) if (f.virtual) delete row[f.name];

  const created = db.tx(() => {
    if (e.number) row.number = nextNumber(e.number, row.company_id ?? 0, row.date || row.reported_at || row.pay_date || (row.period ? row.period + '-01' : today()));
    if (hooks.compute) hooks.compute(ctx, row, lines);
    checkUnique(e, row, row.company_id);
    Object.assign(row, { created_at: nowIso(), created_by: ctx.user.id, updated_at: nowIso(), updated_by: ctx.user.id });
    const id = db.insert(e.table, row);
    if (lines) writeLines(e, id, lines);
    if (hooks.afterCreate) hooks.afterCreate(ctx, id, row, body);
    audit.log(ctx, 'create', { entity: key, entityId: id, companyId: row.company_id, branchId: row.branch_id, detail: redact(e, { ...row, lines: lines?.length }) });
    return id;
  });
  if (hooks.afterCommit) await hooks.afterCommit(ctx, created, row, body);
  return read(ctx, key, created);
}

/* --- Ubah --------------------------------------------------------------------- */
export async function update(ctx, key, id, body = {}) {
  const e = mustEntity(key);
  if (e.readonlyEntity) throw forbidden('Data ini tidak dapat diubah.');
  requirePerm(ctx, e.module, LEVEL.write);
  const hooks = HOOKS[key] || {};
  const existing = getRow(e, id);
  if (!existing) throw notFound();
  assertInScope(ctx, e.scope, existing);
  if (!isEditable(e, existing)) throw conflict(`Dokumen berstatus "${existing[e.statusField]}" tidak dapat diubah lagi.`);
  if (body.row_version !== undefined && Number(body.row_version) !== existing.row_version) {
    throw conflict('Data telah diubah pengguna lain sejak Anda membukanya. Muat ulang lalu ulangi perubahan.');
  }
  const companyId = e.scope === 'global' ? null : existing.company_id;
  const row = validateFields(e.fields, body, ctx, { companyId, isCreate: false, existing });
  // Status dokumen ber-alur kerja hanya berubah lewat aksi; entitas master boleh lewat formulir.
  if (e.statusField && e.editable) delete row[e.statusField];
  let lines = e.lines && body.lines !== undefined ? validateLines(e, body.lines, ctx, companyId) : null;
  if (e.scope === 'branch' && body.branch_id && Number(body.branch_id) !== existing.branch_id) row.branch_id = branchForWrite(ctx, body.branch_id);
  if (hooks.beforeUpdate) await hooks.beforeUpdate(ctx, row, existing, body);

  return db.tx(() => {
    const merged = { ...existing, ...row };
    if (hooks.compute) {
      const ls = lines || (e.lines ? db.all(`SELECT * FROM "${e.lines.table}" WHERE parent_id = ? ORDER BY line_no`, id) : null);
      hooks.compute(ctx, merged, ls);
      // Nilai yang dihitung kait (total, pembagian bulanan, dll.) ikut disimpan.
      for (const f of e.fields.filter((x) => !x.virtual && x.name !== e.statusField)) if (merged[f.name] !== (f.name in row ? row[f.name] : existing[f.name])) row[f.name] = merged[f.name];
      if (lines) lines = ls;
    }
    checkUnique(e, merged, merged.company_id, existing.id);
    Object.assign(row, { updated_at: nowIso(), updated_by: ctx.user.id, row_version: existing.row_version + 1 });
    db.update(e.table, existing.id, row);
    if (lines) writeLines(e, existing.id, lines.map((l) => { const c = { ...l }; delete c.id; delete c.parent_id; delete c.line_no; return c; }));
    audit.log(ctx, 'update', { entity: key, entityId: existing.id, companyId: existing.company_id, branchId: existing.branch_id, detail: redact(e, audit.diff(existing, { ...existing, ...row })) });
    return read(ctx, key, existing.id);
  });
}

/* --- Hapus -------------------------------------------------------------------- */
export function remove(ctx, key, id) {
  const e = mustEntity(key);
  if (e.readonlyEntity) throw forbidden('Data ini tidak dapat dihapus.');
  requirePerm(ctx, e.module, LEVEL.write);
  const existing = getRow(e, id);
  if (!existing) throw notFound();
  assertInScope(ctx, e.scope, existing);
  if (e.editable && !isEditable(e, existing)) throw conflict('Dokumen yang sudah diproses tidak dapat dihapus; gunakan aksi Batalkan.');
  if (key === 'users' && existing.id === ctx.user.id) throw conflict('Anda tidak dapat menghapus akun Anda sendiri.');
  if (HOOKS[key]?.beforeDelete) HOOKS[key].beforeDelete(ctx, existing);
  try {
    db.tx(() => {
      db.run(`DELETE FROM "${e.table}" WHERE id = ?`, existing.id);
      audit.log(ctx, 'delete', { entity: key, entityId: existing.id, companyId: existing.company_id, branchId: existing.branch_id, detail: redact(e, existing) });
    });
  } catch (err) {
    if (/FOREIGN KEY/i.test(err.message)) throw conflict('Data ini masih dirujuk oleh data lain sehingga tidak dapat dihapus. Ubah statusnya menjadi nonaktif.');
    throw err;
  }
  return { ok: true };
}

/* --- Aksi alur kerja -------------------------------------------------------- */
export async function runAction(ctx, key, id, actionName, params = {}) {
  const e = mustEntity(key);
  const a = e.actions.find((x) => x.name === actionName);
  if (!a) throw notFound('Aksi tidak dikenal.');
  if (a.level >= 4) requirePerm(ctx, 'admin', LEVEL.approve);
  else requirePerm(ctx, e.module, a.level);
  const existing = getRow(e, id);
  if (!existing) throw notFound();
  assertInScope(ctx, e.scope, existing);
  if (a.from && !a.from.includes(existing[e.statusField])) throw conflict(`Aksi "${a.label}" tidak berlaku untuk status "${existing[e.statusField]}".`);
  // Pemisahan tugas (ISO 27001 A.5.3): pembuat dokumen tidak boleh menyetujuinya sendiri.
  if (a.sod && existing.created_by === ctx.user.id) throw forbidden('Pemisahan tugas: dokumen tidak boleh disetujui oleh pembuatnya sendiri.');
  const p = a.params ? validateFields(a.params, params, ctx, { companyId: existing.company_id ?? null, isCreate: true }) : {};
  const handler = ACTIONS[key]?.[actionName];
  if (!handler) throw new HttpError(501, 'Aksi belum diimplementasikan.');
  const pre = HOOKS[key]?.beforeAction ? await HOOKS[key].beforeAction(ctx, actionName, existing, p) : null;
  const result = db.tx(() => {
    const out = handler(ctx, existing, p, pre) || {};
    db.run(`UPDATE "${e.table}" SET updated_at = ?, updated_by = ?, row_version = row_version + 1 WHERE id = ?`, nowIso(), ctx.user.id, existing.id);
    const after = getRow(e, existing.id);
    audit.log(ctx, `action.${actionName}`, { entity: key, entityId: existing.id, companyId: existing.company_id, branchId: existing.branch_id, detail: { params: p, from: existing[e.statusField], to: after?.[e.statusField], ...out.audit } });
    return out;
  });
  return { ok: true, record: result.redirect ? null : read(ctx, key, existing.id), redirect: result.redirect || null, message: result.message || null };
}

/* --- Pencarian rujukan ------------------------------------------------------ */
/* Data induk yang dirujuk lintas modul (mis. produk di penjualan & pembelian). */
const SHARED_LOOKUPS = new Set(['products', 'warehouses', 'accounts', 'cost_centers', 'projects', 'bank_accounts', 'customers', 'suppliers', 'boms', 'branches', 'companies', 'fixed_assets', 'purchase_requests', 'quotations', 'sales_orders', 'purchase_orders', 'leads', 'roles', 'currencies', 'warehouse_bins']);

export function lookup(ctx, key, q = {}) {
  const e = mustEntity(key);
  // Hak minimum: lookup hanya untuk modul yang boleh dibaca, kecuali data induk bersama
  // (hanya id + label, tanpa bidang sensitif) bagi pengguna yang memiliki akses tulis di modul mana pun.
  const anyWrite = Object.values(ctx.perms).some((l) => l >= LEVEL.write);
  if (!can(ctx, e.module, LEVEL.read) && !(SHARED_LOOKUPS.has(key) && anyWrite)) throw forbidden();
  const sc = scopeWhere(ctx, e.scope === 'branch' && q.scope === 'company' ? 'company' : e.scope);
  const where = [sc.sql], params = [...sc.params];
  const lab = labelExpr(key, 't');
  if (q.q) { where.push(`${lab} LIKE ?`); params.push(`%${String(q.q).slice(0, 60)}%`); }
  for (const f of e.fields) {
    const v = q[`f_${f.name}`];
    if (v === undefined || v === '') continue;
    const vals = String(v).split(',').slice(0, 10);
    where.push(`t."${f.name}" IN (${vals.map(() => '?').join(',')})`);
    params.push(...vals.map((x) => (['ref', 'int', 'bool'].includes(f.type) ? Number(x) : x)));
  }
  if (e.statusField && !q.f_status && !q[`f_${e.statusField}`] && ['aktif'].includes(e.fields.find((f) => f.name === e.statusField).default)) {
    where.push(`t."${e.statusField}" = 'aktif'`);
  }
  const extra = key === 'products' ? ', t.price, t.standard_cost, t.kind, t.uom' : key === 'sales_invoices' || key === 'purchase_bills' ? ', ROUND(t.total - t.paid, 2) AS open_amount' : '';
  return db.all(`SELECT t.id, ${lab} AS label${extra} FROM "${e.table}" t WHERE ${where.join(' AND ')} ORDER BY label LIMIT 200`, ...params);
}

/* --- Metadata untuk klien --------------------------------------------------- */
export function metaFor(ctx) {
  const out = {};
  for (const [k, e] of Object.entries(ENTITIES)) {
    if (!can(ctx, e.module, LEVEL.read)) continue;
    out[k] = {
      key: k, label: e.label, one: e.one, module: e.module, scope: e.scope, title: e.title, number: !!e.number,
      statusField: e.statusField, editable: e.editable || null, readonly: !!e.readonlyEntity, sort: e.sort, sortDir: e.sortDir || 'asc',
      canWrite: can(ctx, e.module, LEVEL.write) && !e.readonlyEntity,
      fields: e.fields.map(({ name, label, type, options, ref, required, readonly, list, search, max, min, help, sensitive, createOnly, refFilter, refParent, refScope, default: d, hidden, pattern, unique, internal }) =>
        ({ name, label, type, options, ref, required, readonly, list, search, max, min, help, sensitive, createOnly, refFilter, refParent, refScope, default: d, hidden, pattern, unique, internal })),
      computed: Object.fromEntries(Object.entries(e.computed).map(([n, c]) => [n, { label: c.label, type: c.type, list: c.list }])),
      lines: e.lines ? { fields: e.lines.fields } : null,
      actions: e.actions.map((a) => ({ name: a.name, label: a.label, from: a.from, params: !!a.params, level: a.level, sod: !!a.sod, confirm: a.confirm || null })),
    };
  }
  return out;
}
