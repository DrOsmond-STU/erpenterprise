import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../config.js';
import { DbService, systemContext } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DomainError } from '../common/errors.js';
import type { RequestUser } from '../common/context.js';

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

interface AccessClaims { sub: string; sid: string; cid: string; email: string; name: string }

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: Omit<RequestUser, 'permissions'> & { permissions: string[] };
}

/**
 * Autentikasi lokal untuk dev/staging (K-02…K-06). Di produksi, IdP OIDC
 * menerbitkan token; guard tetap memakai `userFromAccessToken` yang sama.
 */
@Injectable()
export class AuthService {
  private readonly cfg = loadConfig();
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  private sha256(v: string) { return createHash('sha256').update(v).digest('hex'); }

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string; requestId?: string }): Promise<LoginResult> {
    return this.db.run(systemContext(), async (c) => {
      const { rows } = await c.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
      const u = rows[0];
      const generic = new UnauthorizedException('Email atau kata sandi salah.');
      if (!u || u.status !== 'aktif' || !u.password_hash) {
        /* K-04: waktu respons tetap serupa; tidak membedakan akun tidak ada. */
        await argon2.hash(password).catch(() => undefined);
        throw generic;
      }
      if (u.locked_until && new Date(u.locked_until) > new Date()) {
        throw new DomainError('ACCOUNT_LOCKED', `Akun terkunci sementara. Coba lagi setelah ${LOCK_MINUTES} menit.`, HttpStatus.LOCKED);
      }
      const ok = await argon2.verify(u.password_hash, password);
      if (!ok) {
        const failed = u.failed_logins + 1;
        await c.query('UPDATE users SET failed_logins = $2::int, locked_until = CASE WHEN $2::int >= $3::int THEN now() + make_interval(mins => $4::int) ELSE NULL END WHERE id = $1', [u.id, failed, LOCK_AFTER, LOCK_MINUTES]);
        await this.audit.record(c, { companyId: u.company_id, userId: u.id, action: failed >= LOCK_AFTER ? 'user.locked' : 'user.login_failed', entityType: 'user', entityId: u.id, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId });
        throw generic;
      }
      await c.query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [u.id]);
      const refresh = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + this.cfg.REFRESH_TOKEN_TTL_SECONDS * 1000);
      const s = await c.query('INSERT INTO sessions (user_id, refresh_token_hash, ip, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [u.id, this.sha256(refresh), meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null, expiresAt]);
      const sid = s.rows[0].id;
      await this.audit.record(c, { companyId: u.company_id, userId: u.id, sessionId: sid, action: 'user.login', entityType: 'user', entityId: u.id, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId });
      const user = await this.loadUser(c, u.id, sid);
      return this.tokens(user, refresh, expiresAt);
    });
  }

  async refresh(refreshToken: string, meta: { ip?: string; userAgent?: string; requestId?: string }): Promise<LoginResult> {
    return this.db.run(systemContext(), async (c) => {
      const { rows } = await c.query('SELECT * FROM sessions WHERE refresh_token_hash = $1', [this.sha256(refreshToken)]);
      const s = rows[0];
      if (!s) throw new UnauthorizedException('Sesi tidak dikenal.');
      if (s.revoked_at) {
        /* K-05: penggunaan ulang refresh token = indikasi pencurian → cabut seluruh sesi pengguna. */
        await c.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [s.user_id]);
        await this.audit.record(c, { companyId: null, userId: s.user_id, sessionId: s.id, action: 'session.reuse_detected', entityType: 'session', entityId: s.id, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId });
        throw new UnauthorizedException('Sesi dicabut karena token dipakai ulang.');
      }
      if (new Date(s.expires_at) < new Date()) throw new UnauthorizedException('Sesi kedaluwarsa.');
      const idle = (Date.now() - new Date(s.last_used_at).getTime()) / 1000;
      if (idle > 30 * 60 && idle > this.cfg.ACCESS_TOKEN_TTL_SECONDS) {
        await c.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [s.id]);
        throw new UnauthorizedException('Sesi berakhir karena tidak aktif.');
      }
      const next = randomBytes(32).toString('base64url');
      const expiresAt = new Date(s.expires_at);
      const ins = await c.query('INSERT INTO sessions (user_id, refresh_token_hash, ip, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [s.user_id, this.sha256(next), meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null, expiresAt]);
      await c.query('UPDATE sessions SET revoked_at = now(), replaced_by = $2 WHERE id = $1', [s.id, ins.rows[0].id]);
      const user = await this.loadUser(c, s.user_id, ins.rows[0].id);
      return this.tokens(user, next, expiresAt);
    });
  }

  async logout(refreshToken: string | undefined, user: RequestUser | undefined): Promise<void> {
    await this.db.run(systemContext(), async (c) => {
      if (refreshToken) await c.query('UPDATE sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL', [this.sha256(refreshToken)]);
      if (user) {
        await c.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [user.sessionId]);
        await this.audit.record(c, { companyId: user.companyId, userId: user.id, sessionId: user.sessionId, action: 'user.logout', entityType: 'user', entityId: user.id });
      }
    });
  }

  async listSessions(user: RequestUser) {
    return this.db.run(systemContext(), async (c) => (await c.query(
      'SELECT id, ip, user_agent, created_at, last_used_at, expires_at, id = $2 AS current FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC', [user.id, user.sessionId])).rows);
  }

  async revokeSession(user: RequestUser, id: string) {
    await this.db.run(systemContext(), async (c) => {
      await c.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2', [id, user.id]);
      await this.audit.record(c, { companyId: user.companyId, userId: user.id, sessionId: user.sessionId, action: 'session.revoked', entityType: 'session', entityId: id });
    });
  }

  async userFromAccessToken(token: string): Promise<RequestUser> {
    let claims: AccessClaims;
    try {
      claims = jwt.verify(token, this.cfg.JWT_SECRET, { algorithms: ['HS256'], audience: 'erp-api', issuer: 'erp-auth' }) as AccessClaims;
    } catch {
      throw new UnauthorizedException('Token akses tidak sah atau kedaluwarsa.');
    }
    return this.db.run(systemContext(), async (c) => {
      const s = await c.query('SELECT revoked_at, expires_at FROM sessions WHERE id = $1', [claims.sid]);
      if (!s.rows[0] || s.rows[0].revoked_at || new Date(s.rows[0].expires_at) < new Date()) throw new UnauthorizedException('Sesi sudah berakhir.');
      await c.query('UPDATE sessions SET last_used_at = now() WHERE id = $1 AND last_used_at < now() - interval \'1 minute\'', [claims.sid]);
      return this.loadUser(c, claims.sub, claims.sid);
    });
  }

  /** Memuat izin efektif & cabang yang diizinkan (K-10, K-11). */
  async loadUser(c: import('pg').PoolClient, userId: string, sessionId: string): Promise<RequestUser> {
    const u = (await c.query('SELECT id, email, display_name, company_id, status FROM users WHERE id = $1', [userId])).rows[0];
    if (!u || u.status !== 'aktif') throw new UnauthorizedException('Pengguna tidak aktif.');
    const perms = await c.query(
      `SELECT DISTINCT rp.permission_code AS code, ur.branch_code
         FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
        WHERE ur.user_id = $1`, [userId]);
    const permissions = new Set<string>(perms.rows.map((r: any) => r.code));
    const branchRows = await c.query('SELECT DISTINCT branch_code FROM user_roles WHERE user_id = $1', [userId]);
    const all = branchRows.rows.some((r: any) => String(r.branch_code).trim() === 'ALL');
    const branches: '*' | string[] = all ? '*' : branchRows.rows.map((r: any) => String(r.branch_code).trim());
    return { id: u.id, email: u.email, name: u.display_name, companyId: u.company_id, permissions, branches, sessionId };
  }

  private tokens(user: RequestUser, refreshToken: string, refreshExpiresAt: Date): LoginResult {
    const claims: AccessClaims = { sub: user.id, sid: user.sessionId, cid: user.companyId, email: user.email, name: user.name };
    const accessToken = jwt.sign(claims, this.cfg.JWT_SECRET, { algorithm: 'HS256', expiresIn: this.cfg.ACCESS_TOKEN_TTL_SECONDS, audience: 'erp-api', issuer: 'erp-auth' });
    return { accessToken, expiresIn: this.cfg.ACCESS_TOKEN_TTL_SECONDS, refreshToken, refreshExpiresAt, user: { ...user, permissions: [...user.permissions].sort() } };
  }

  static hashPassword(pw: string): Promise<string> { return argon2.hash(pw, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }); }
}
