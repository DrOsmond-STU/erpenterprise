/**
 * Pengelolaan identitas & akses (dok. 11 §2–3):
 * - Pengguna: tambah, ubah, aktif/nonaktif, reset kata sandi, buka kunci.
 * - Peran: tambah, ubah izin (matriks), hapus bila tidak dipakai.
 * Aturan yang ditegakkan di server:
 * - Pemisahan tugas per pengguna (gabungan izin seluruh perannya) dan per peran.
 * - Anti-kehilangan-akses: selalu tersisa ≥1 pengguna aktif yang memegang
 *   admin.user.manage dan admin.role.manage; admin tidak dapat menonaktifkan
 *   dirinya sendiri; peran "admin" tidak dapat dihapus.
 * - Kata sandi awal/reset wajib diganti saat masuk pertama; semua sesi pengguna
 *   dicabut saat dinonaktifkan atau direset.
 * Setiap perubahan dicatat di jejak audit (tanpa kata sandi).
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { randomInt } from 'node:crypto';
import { PERMISSIONS, passwordProblems, sodViolations } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { RequestUser } from '../common/context.js';
import { conflict, DomainError, forbidden, notFound } from '../common/errors.js';
import { DbService, systemContext } from '../db/db.service.js';

export interface RoleAssignment { role: string; branch: string }
export interface UserCreate { email: string; name: string; roles: RoleAssignment[]; password?: string }
export interface UserPatch { name?: string; email?: string; status?: 'aktif' | 'nonaktif'; roles?: RoleAssignment[]; reason: string }
export interface RoleCreate { code: string; name: string; permissions: string[] }
export interface RolePatch { name?: string; permissions?: string[]; reason: string }

const KNOWN = new Set<string>(PERMISSIONS);
const invalid = (code: string, msg: string, details?: unknown) => new DomainError(code, msg, HttpStatus.UNPROCESSABLE_ENTITY, details);
const PROTECTED_ADMIN = ['admin.user.manage', 'admin.role.manage'];

/** Kata sandi sementara yang mudah dibacakan: tanpa karakter mirip (0/O, 1/l/I). */
export function temporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', digits = '23456789';
  const pick = (set: string, n: number) => Array.from({ length: n }, () => set[randomInt(set.length)]).join('');
  return `${pick(letters, 4)}-${pick(digits, 4)}-${pick(letters, 4)}`;
}

@Injectable()
export class IamService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  private ctx(u: RequestUser, requestId: string) { return { ...systemContext(u.companyId), userId: u.id, requestId }; }

  /* ------------------------------- Pengguna ------------------------------- */

  async listUsers(u: RequestUser) {
    return this.db.run(systemContext(u.companyId), (c) => this.queryUsers(c, u.companyId));
  }

  private async queryUsers(c: PoolClient, companyId: string, onlyId?: string) {
    return (await c.query(
      `SELECT u.id, u.email, u.display_name, u.status, u.last_login_at, u.locked_until, u.failed_logins, u.must_change_password, u.created_at,
              coalesce(json_agg(json_build_object('role', r.code, 'roleName', r.name, 'branch', trim(ur.branch_code)) ORDER BY r.name) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles,
              (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS active_sessions
         FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.company_id = $1 AND (u.password_hash IS NOT NULL OR ur.role_id IS NOT NULL) AND ($2::uuid IS NULL OR u.id = $2)
        GROUP BY u.id ORDER BY u.display_name`, [companyId, onlyId ?? null])).rows.map((r: any) => ({
      id: r.id, email: r.email, name: r.display_name, status: r.status, lastLoginAt: r.last_login_at,
      locked: Boolean(r.locked_until && new Date(r.locked_until) > new Date()), failedLogins: r.failed_logins,
      mustChangePassword: r.must_change_password, createdAt: r.created_at, roles: r.roles, activeSessions: r.active_sessions,
    }));
  }

  /** Memvalidasi daftar peran → id peran; cabang harus ada ('ALL' = semua cabang). */
  private async resolveRoles(c: PoolClient, companyId: string, list: RoleAssignment[]) {
    if (!list.length) throw invalid('USER_NO_ROLE', 'Pengguna harus memiliki minimal satu peran.');
    const out: { roleId: string; branch: string; code: string; permissions: string[] }[] = [];
    const seen = new Set<string>();
    for (const a of list) {
      const key = `${a.role}|${a.branch}`;
      if (seen.has(key)) continue; seen.add(key);
      const r = (await c.query(`SELECT r.id, r.code, coalesce(array_agg(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS perms
          FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id WHERE r.company_id = $1 AND r.code = $2 GROUP BY r.id`, [companyId, a.role])).rows[0];
      if (!r) throw notFound(`Peran ${a.role}`);
      if (a.branch !== 'ALL') {
        const b = (await c.query('SELECT status FROM branches WHERE company_id = $1 AND code = $2', [companyId, a.branch])).rows[0];
        if (!b) throw notFound(`Cabang ${a.branch}`);
      }
      out.push({ roleId: r.id, branch: a.branch, code: r.code, permissions: r.perms });
    }
    const violations = sodViolations(out.flatMap((x) => x.permissions));
    if (violations.length) throw invalid('SOD_CONFLICT', `Kombinasi peran melanggar pemisahan tugas: ${violations.join(' ')}`, violations);
    return out;
  }

  private async setRoles(c: PoolClient, userId: string, roles: { roleId: string; branch: string }[]) {
    await c.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    for (const r of roles) await c.query('INSERT INTO user_roles (user_id, role_id, branch_code) VALUES ($1,$2,$3)', [userId, r.roleId, r.branch]);
  }

  /** Anti-kehilangan-akses: harus tetap ada pemegang aktif untuk setiap izin admin inti. */
  private async assertAdminsRemain(c: PoolClient, companyId: string) {
    for (const perm of PROTECTED_ADMIN) {
      const n = (await c.query(`SELECT count(DISTINCT u.id)::int AS n FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN role_permissions rp ON rp.role_id = ur.role_id
          WHERE u.company_id = $1 AND u.status = 'aktif' AND rp.permission_code = $2`, [companyId, perm])).rows[0].n;
      if (n === 0) throw invalid('LAST_ADMIN', `Perubahan ditolak: tidak akan ada lagi pengguna aktif dengan izin ${perm}.`);
    }
  }

  private async user(c: PoolClient, companyId: string, id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Pengguna');
    const r = (await c.query('SELECT * FROM users WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
    if (!r) throw notFound('Pengguna');
    return r;
  }

  async createUser(u: RequestUser, b: UserCreate, requestId: string) {
    const password = b.password || temporaryPassword();
    const problems = passwordProblems(password, b.email);
    if (problems.length) throw invalid('PASSWORD_WEAK', problems.join(' '), problems);
    return this.db.run(this.ctx(u, requestId), async (c) => {
      const dup = await c.query('SELECT 1 FROM users WHERE company_id = $1 AND lower(email) = lower($2)', [u.companyId, b.email]);
      if (dup.rowCount) throw conflict('USER_EXISTS', `Email ${b.email} sudah terdaftar.`);
      const roles = await this.resolveRoles(c, u.companyId, b.roles);
      const ins = await c.query(`INSERT INTO users (company_id, email, display_name, password_hash, must_change_password, created_by)
        VALUES ($1,$2,$3,$4,true,$5) RETURNING id`, [u.companyId, b.email.toLowerCase(), b.name, await AuthService.hashPassword(password), u.id]);
      const id = ins.rows[0].id;
      await this.setRoles(c, id, roles);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'user.created', entityType: 'user', entityId: id,
        after: { email: b.email.toLowerCase(), name: b.name, roles: b.roles }, requestId });
      return { id, email: b.email.toLowerCase(), name: b.name, temporaryPassword: b.password ? undefined : password };
    });
  }

  async patchUser(u: RequestUser, id: string, p: UserPatch, requestId: string) {
    return this.db.run(this.ctx(u, requestId), async (c) => {
      const cur = await this.user(c, u.companyId, id);
      if (id === u.id && p.status === 'nonaktif') throw forbidden('Anda tidak dapat menonaktifkan akun Anda sendiri.');
      if (p.email && p.email.toLowerCase() !== cur.email) {
        const dup = await c.query('SELECT 1 FROM users WHERE company_id = $1 AND lower(email) = lower($2) AND id <> $3', [u.companyId, p.email, id]);
        if (dup.rowCount) throw conflict('USER_EXISTS', `Email ${p.email} sudah terdaftar.`);
      }
      const beforeRoles = (await c.query('SELECT r.code AS role, trim(ur.branch_code) AS branch FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 ORDER BY 1, 2', [id])).rows;
      if (p.roles) await this.setRoles(c, id, await this.resolveRoles(c, u.companyId, p.roles));
      await c.query('UPDATE users SET display_name = coalesce($3, display_name), email = coalesce($4, email), status = coalesce($5, status) WHERE company_id = $1 AND id = $2',
        [u.companyId, id, p.name ?? null, p.email?.toLowerCase() ?? null, p.status ?? null]);
      if (p.status === 'nonaktif' || p.roles) {
        /* Hak berubah → sesi lama dicabut agar izin baru berlaku seketika. */
        if (id !== u.id || p.status === 'nonaktif') await c.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      }
      await this.assertAdminsRemain(c, u.companyId);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'user.updated', entityType: 'user', entityId: id,
        before: { name: cur.display_name, email: cur.email, status: cur.status, roles: beforeRoles },
        after: { name: p.name, email: p.email, status: p.status, roles: p.roles, reason: p.reason }, requestId });
      return (await this.queryUsers(c, u.companyId, id))[0];
    });
  }

  async resetPassword(u: RequestUser, id: string, password: string | undefined, reason: string, requestId: string) {
    return this.db.run(this.ctx(u, requestId), async (c) => {
      const cur = await this.user(c, u.companyId, id);
      if (id === u.id) throw forbidden('Gunakan halaman Profil untuk mengganti kata sandi Anda sendiri.');
      const pw = password || temporaryPassword();
      const problems = passwordProblems(pw, cur.email);
      if (problems.length) throw invalid('PASSWORD_WEAK', problems.join(' '), problems);
      await c.query('UPDATE users SET password_hash = $2, must_change_password = true, failed_logins = 0, locked_until = NULL WHERE id = $1', [id, await AuthService.hashPassword(pw)]);
      const revoked = await c.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'user.password_reset', entityType: 'user', entityId: id,
        after: { reason, sessionsRevoked: revoked.rowCount }, requestId });
      return { id, temporaryPassword: password ? undefined : pw, sessionsRevoked: revoked.rowCount ?? 0 };
    });
  }

  async unlock(u: RequestUser, id: string, reason: string, requestId: string) {
    return this.db.run(this.ctx(u, requestId), async (c) => {
      await this.user(c, u.companyId, id);
      await c.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [id]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'user.unlocked', entityType: 'user', entityId: id, after: { reason }, requestId });
      return { id, unlocked: true };
    });
  }

  /* --------------------------------- Peran -------------------------------- */

  async listRoles(u: RequestUser) {
    return this.db.run(systemContext(u.companyId), (c) => this.queryRoles(c, u.companyId));
  }

  private async queryRoles(c: PoolClient, companyId: string): Promise<any[]> {
    return (await c.query(
      `SELECT r.code, r.name,
              coalesce((SELECT array_agg(rp.permission_code ORDER BY rp.permission_code) FROM role_permissions rp WHERE rp.role_id = r.id), '{}') AS permissions,
              (SELECT count(DISTINCT ur.user_id)::int FROM user_roles ur JOIN users x ON x.id = ur.user_id WHERE ur.role_id = r.id AND x.status = 'aktif') AS users
         FROM roles r WHERE r.company_id = $1 ORDER BY (r.code = 'admin') DESC, r.name`, [companyId])).rows;
  }

  private checkPermissions(perms: string[]) {
    const unknown = perms.filter((p) => !KNOWN.has(p));
    if (unknown.length) throw invalid('PERMISSION_UNKNOWN', `Izin tidak dikenal: ${unknown.join(', ')}.`);
    const v = sodViolations(perms);
    if (v.length) throw invalid('SOD_CONFLICT', `Peran melanggar pemisahan tugas: ${v.join(' ')}`, v);
  }

  private async setPermissions(c: PoolClient, roleId: string, perms: string[]) {
    await c.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    for (const p of [...new Set(perms)]) await c.query('INSERT INTO role_permissions (role_id, permission_code) VALUES ($1,$2)', [roleId, p]);
  }

  async createRole(u: RequestUser, b: RoleCreate, requestId: string) {
    this.checkPermissions(b.permissions);
    return this.db.run(this.ctx(u, requestId), async (c) => {
      const dup = await c.query('SELECT 1 FROM roles WHERE company_id = $1 AND code = $2', [u.companyId, b.code]);
      if (dup.rowCount) throw conflict('ROLE_EXISTS', `Kode peran ${b.code} sudah dipakai.`);
      const r = (await c.query('INSERT INTO roles (company_id, code, name) VALUES ($1,$2,$3) RETURNING id', [u.companyId, b.code, b.name])).rows[0];
      await this.setPermissions(c, r.id, b.permissions);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'role.created', entityType: 'role', entityId: b.code, after: b, requestId });
      return (await this.queryRoles(c, u.companyId)).find((x: any) => x.code === b.code);
    });
  }

  async patchRole(u: RequestUser, code: string, p: RolePatch, requestId: string) {
    if (p.permissions) this.checkPermissions(p.permissions);
    return this.db.run(this.ctx(u, requestId), async (c) => {
      const r = (await c.query('SELECT id, name FROM roles WHERE company_id = $1 AND code = $2', [u.companyId, code])).rows[0];
      if (!r) throw notFound(`Peran ${code}`);
      const before = (await c.query('SELECT coalesce(array_agg(permission_code ORDER BY permission_code), \'{}\') AS p FROM role_permissions WHERE role_id = $1', [r.id])).rows[0].p;
      if (p.permissions) {
        if (code === 'admin' && PROTECTED_ADMIN.some((x) => !p.permissions!.includes(x))) throw forbidden('Peran Admin Sistem harus tetap memegang izin kelola pengguna dan kelola peran.');
        await this.setPermissions(c, r.id, p.permissions);
        /* Gabungan izin tiap pemegang peran ini tidak boleh melanggar pemisahan tugas. */
        const holders = (await c.query('SELECT DISTINCT ur.user_id, u.display_name FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE ur.role_id = $1', [r.id])).rows;
        for (const h of holders) {
          const all = (await c.query('SELECT DISTINCT rp.permission_code AS p FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id WHERE ur.user_id = $1', [h.user_id])).rows.map((x: any) => x.p);
          const v = sodViolations(all);
          if (v.length) throw invalid('SOD_CONFLICT', `Perubahan membuat ${h.display_name} melanggar pemisahan tugas: ${v.join(' ')}`, v);
        }
      }
      if (p.name) await c.query('UPDATE roles SET name = $2 WHERE id = $1', [r.id, p.name]);
      await this.assertAdminsRemain(c, u.companyId);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'role.updated', entityType: 'role', entityId: code,
        before: { name: r.name, permissions: before }, after: { name: p.name, permissions: p.permissions, reason: p.reason }, requestId });
      return (await this.queryRoles(c, u.companyId)).find((x: any) => x.code === code);
    });
  }

  async deleteRole(u: RequestUser, code: string, reason: string, requestId: string) {
    if (code === 'admin') throw forbidden('Peran Admin Sistem tidak dapat dihapus.');
    return this.db.run(this.ctx(u, requestId), async (c) => {
      const r = (await c.query('SELECT id, name FROM roles WHERE company_id = $1 AND code = $2', [u.companyId, code])).rows[0];
      if (!r) throw notFound(`Peran ${code}`);
      const n = (await c.query('SELECT count(*)::int AS n FROM user_roles WHERE role_id = $1', [r.id])).rows[0].n;
      if (n > 0) throw invalid('ROLE_IN_USE', `Peran ${r.name} masih dipakai ${n} penugasan pengguna; pindahkan penggunanya dahulu.`);
      await c.query('DELETE FROM roles WHERE id = $1', [r.id]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'role.deleted', entityType: 'role', entityId: code, before: { name: r.name }, after: { reason }, requestId });
      return { code, deleted: true };
    });
  }
}
