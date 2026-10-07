/* Kontrol akses berbasis peran + pembatasan cakupan data per perusahaan/cabang.
   ISO 27001 A.5.15 (kontrol akses), A.5.18 (hak akses), A.8.3 (pembatasan akses informasi). */
import * as db from '../db.js';
import { forbidden, bad } from '../lib/util.js';

export const LEVEL = { none: 0, read: 1, write: 2, approve: 3, admin: 4 };

const permCache = new Map();
export const clearPermCache = () => permCache.clear();

export function permissionsFor(roleId) {
  if (permCache.has(roleId)) return permCache.get(roleId);
  const map = {};
  for (const r of db.all('SELECT module, level FROM role_permissions WHERE role_id = ?', roleId)) map[r.module] = r.level;
  permCache.set(roleId, map);
  return map;
}

export const can = (ctx, module, level = LEVEL.read) => (ctx.perms[module] || 0) >= level;

export function requirePerm(ctx, module, level = LEVEL.read) {
  if (!can(ctx, module, level)) throw forbidden();
}

/** Perusahaan yang boleh diakses pengguna. */
export function allowedCompanies(user) {
  return user.company_id
    ? db.all('SELECT id, code, name, parent_id, ownership_pct FROM companies WHERE id = ? AND status = ?', user.company_id, 'aktif')
    : db.all('SELECT id, code, name, parent_id, ownership_pct FROM companies WHERE status = ? ORDER BY id', 'aktif');
}

export function allowedBranches(user, companyId) {
  if (user.branch_id) return db.all('SELECT id, code, name, company_id FROM branches WHERE id = ? AND company_id = ?', user.branch_id, companyId);
  return db.all("SELECT id, code, name, company_id FROM branches WHERE company_id = ? AND status = 'aktif' ORDER BY code", companyId);
}

/** Menentukan konteks perusahaan & cabang dari permintaan, memvalidasi terhadap hak pengguna. */
export function resolveScope(ctx, companyParam, branchParam) {
  const companies = allowedCompanies(ctx.user);
  if (!companies.length) throw forbidden('Akun Anda tidak memiliki akses ke perusahaan mana pun.');
  let companyId = Number(companyParam) || companies[0].id;
  if (!companies.some((c) => c.id === companyId)) throw forbidden('Anda tidak memiliki akses ke perusahaan tersebut.');
  const branches = allowedBranches(ctx.user, companyId);
  let branchId = null;
  if (ctx.user.branch_id) branchId = ctx.user.branch_id;
  else if (branchParam && branchParam !== 'all') {
    branchId = Number(branchParam);
    if (!branches.some((b) => b.id === branchId)) throw forbidden('Anda tidak memiliki akses ke cabang tersebut.');
  }
  if (ctx.user.branch_id && !branches.length) throw forbidden('Cabang pengguna tidak berada di perusahaan ini.');
  ctx.companyId = companyId;
  ctx.branchId = branchId;
  ctx.companies = companies;
  ctx.branches = branches;
  return ctx;
}

/** Klausa WHERE untuk membatasi baris sesuai cakupan. alias = alias tabel. */
export function scopeWhere(ctx, scope, alias = 't') {
  if (scope === 'global') return { sql: '1=1', params: [] };
  if (scope === 'company') return { sql: `${alias}.company_id = ?`, params: [ctx.companyId] };
  if (ctx.branchId) return { sql: `${alias}.company_id = ? AND ${alias}.branch_id = ?`, params: [ctx.companyId, ctx.branchId] };
  return { sql: `${alias}.company_id = ?`, params: [ctx.companyId] };
}

/** Pastikan baris berada dalam cakupan pengguna (cegah IDOR). */
export function assertInScope(ctx, scope, row) {
  if (!row) return;
  if (scope === 'global') return;
  if (row.company_id !== ctx.companyId) throw forbidden('Data berada di luar cakupan perusahaan Anda.');
  if (scope === 'branch' && ctx.user.branch_id && row.branch_id !== ctx.user.branch_id) throw forbidden('Data berada di luar cakupan cabang Anda.');
}

/** Cabang yang dipakai untuk membuat dokumen baru. */
export function branchForWrite(ctx, requested) {
  const id = Number(requested) || ctx.branchId || ctx.user.branch_id;
  if (!id) throw bad('Pilih cabang terlebih dahulu (konteks cabang atau bidang cabang).');
  if (!ctx.branches.some((b) => b.id === id)) throw forbidden('Anda tidak memiliki akses ke cabang tersebut.');
  return id;
}
