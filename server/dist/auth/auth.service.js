"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const argon2_1 = __importDefault(require("argon2"));
const node_crypto_1 = require("node:crypto");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_js_1 = require("../config.js");
const db_service_js_1 = require("../db/db.service.js");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
/**
 * Autentikasi lokal untuk dev/staging (K-02…K-06). Di produksi, IdP OIDC
 * menerbitkan token; guard tetap memakai `userFromAccessToken` yang sama.
 */
let AuthService = AuthService_1 = class AuthService {
    db;
    audit;
    cfg = (0, config_js_1.loadConfig)();
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    sha256(v) { return (0, node_crypto_1.createHash)('sha256').update(v).digest('hex'); }
    async login(email, password, meta) {
        const generic = () => new common_1.UnauthorizedException('Email atau kata sandi salah.');
        /* Percobaan gagal harus TERSIMPAN (K-04). Karena itu hasil gagal dikembalikan
           sebagai nilai dan pengecualian baru dilempar SETELAH transaksi di-commit;
           melempar di dalam db.run akan membatalkan penghitung & catatan audit. */
        const outcome = await this.db.run((0, db_service_js_1.systemContext)(), async (c) => {
            const { rows } = await c.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
            const u = rows[0];
            if (!u || u.status !== 'aktif' || !u.password_hash) {
                /* K-04: waktu respons tetap serupa; tidak membedakan akun tidak ada. */
                await argon2_1.default.hash(password).catch(() => undefined);
                return 'invalid';
            }
            if (u.locked_until && new Date(u.locked_until) > new Date())
                return 'locked';
            const ok = await argon2_1.default.verify(u.password_hash, password);
            if (!ok) {
                const failed = u.failed_logins + 1;
                await c.query('UPDATE users SET failed_logins = $2::int, locked_until = CASE WHEN $2::int >= $3::int THEN now() + make_interval(mins => $4::int) ELSE NULL END WHERE id = $1', [u.id, failed, LOCK_AFTER, LOCK_MINUTES]);
                await this.audit.record(c, { companyId: u.company_id, userId: u.id, action: failed >= LOCK_AFTER ? 'user.locked' : 'user.login_failed', entityType: 'user', entityId: u.id, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId });
                return failed >= LOCK_AFTER ? 'locked' : 'invalid';
            }
            await c.query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [u.id]);
            const refresh = (0, node_crypto_1.randomBytes)(32).toString('base64url');
            const expiresAt = new Date(Date.now() + this.cfg.REFRESH_TOKEN_TTL_SECONDS * 1000);
            const s = await c.query('INSERT INTO sessions (user_id, refresh_token_hash, ip, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id', [u.id, this.sha256(refresh), meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null, expiresAt]);
            const sid = s.rows[0].id;
            await this.audit.record(c, { companyId: u.company_id, userId: u.id, sessionId: sid, action: 'user.login', entityType: 'user', entityId: u.id, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId });
            const user = await this.loadUser(c, u.id, sid);
            return this.tokens(user, refresh, expiresAt);
        });
        if (outcome === 'invalid')
            throw generic();
        if (outcome === 'locked')
            throw new errors_js_1.DomainError('ACCOUNT_LOCKED', `Akun terkunci sementara. Coba lagi setelah ${LOCK_MINUTES} menit.`, common_1.HttpStatus.LOCKED);
        return outcome;
    }
    async refresh(refreshToken, meta) {
        /* Pencabutan sesi (pemakaian ulang token, idle) harus tersimpan: kegagalan
           dikembalikan sebagai pesan dan dilempar setelah transaksi di-commit. */
        const outcome = await this.db.run((0, db_service_js_1.systemContext)(), async (c) => {
            const { rows } = await c.query('SELECT * FROM sessions WHERE refresh_token_hash = $1', [this.sha256(refreshToken)]);
            const s = rows[0];
            if (!s)
                return { fail: 'Sesi tidak dikenal.' };
            if (s.revoked_at) {
                /* K-05: penggunaan ulang refresh token = indikasi pencurian → cabut seluruh sesi pengguna. */
                await c.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [s.user_id]);
                await this.audit.record(c, { companyId: null, userId: s.user_id, sessionId: s.id, action: 'session.reuse_detected', entityType: 'session', entityId: s.id, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId });
                return { fail: 'Sesi dicabut karena token dipakai ulang.' };
            }
            if (new Date(s.expires_at) < new Date())
                return { fail: 'Sesi kedaluwarsa.' };
            const idle = (Date.now() - new Date(s.last_used_at).getTime()) / 1000;
            if (idle > 30 * 60 && idle > this.cfg.ACCESS_TOKEN_TTL_SECONDS) {
                await c.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [s.id]);
                return { fail: 'Sesi berakhir karena tidak aktif.' };
            }
            const next = (0, node_crypto_1.randomBytes)(32).toString('base64url');
            const expiresAt = new Date(s.expires_at);
            const ins = await c.query('INSERT INTO sessions (user_id, refresh_token_hash, ip, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id', [s.user_id, this.sha256(next), meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null, expiresAt]);
            await c.query('UPDATE sessions SET revoked_at = now(), replaced_by = $2 WHERE id = $1', [s.id, ins.rows[0].id]);
            const user = await this.loadUser(c, s.user_id, ins.rows[0].id);
            return this.tokens(user, next, expiresAt);
        });
        if ('fail' in outcome)
            throw new common_1.UnauthorizedException(outcome.fail);
        return outcome;
    }
    async logout(refreshToken, user) {
        await this.db.run((0, db_service_js_1.systemContext)(), async (c) => {
            if (refreshToken)
                await c.query('UPDATE sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL', [this.sha256(refreshToken)]);
            if (user) {
                await c.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [user.sessionId]);
                await this.audit.record(c, { companyId: user.companyId, userId: user.id, sessionId: user.sessionId, action: 'user.logout', entityType: 'user', entityId: user.id });
            }
        });
    }
    async listSessions(user) {
        return this.db.run((0, db_service_js_1.systemContext)(), async (c) => (await c.query('SELECT id, ip, user_agent, created_at, last_used_at, expires_at, id = $2 AS current FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC', [user.id, user.sessionId])).rows);
    }
    async revokeSession(user, id) {
        await this.db.run((0, db_service_js_1.systemContext)(), async (c) => {
            await c.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2', [id, user.id]);
            await this.audit.record(c, { companyId: user.companyId, userId: user.id, sessionId: user.sessionId, action: 'session.revoked', entityType: 'session', entityId: id });
        });
    }
    async userFromAccessToken(token) {
        let claims;
        try {
            claims = jsonwebtoken_1.default.verify(token, this.cfg.JWT_SECRET, { algorithms: ['HS256'], audience: 'erp-api', issuer: 'erp-auth' });
        }
        catch {
            throw new common_1.UnauthorizedException('Token akses tidak sah atau kedaluwarsa.');
        }
        return this.db.run((0, db_service_js_1.systemContext)(), async (c) => {
            const s = await c.query('SELECT revoked_at, expires_at FROM sessions WHERE id = $1', [claims.sid]);
            if (!s.rows[0] || s.rows[0].revoked_at || new Date(s.rows[0].expires_at) < new Date())
                throw new common_1.UnauthorizedException('Sesi sudah berakhir.');
            await c.query('UPDATE sessions SET last_used_at = now() WHERE id = $1 AND last_used_at < now() - interval \'1 minute\'', [claims.sid]);
            return this.loadUser(c, claims.sub, claims.sid);
        });
    }
    /** Memuat izin efektif & cabang yang diizinkan (K-10, K-11). */
    async loadUser(c, userId, sessionId) {
        const u = (await c.query('SELECT id, email, display_name, company_id, status, must_change_password FROM users WHERE id = $1', [userId])).rows[0];
        if (!u || u.status !== 'aktif')
            throw new common_1.UnauthorizedException('Pengguna tidak aktif.');
        const perms = await c.query(`SELECT DISTINCT rp.permission_code AS code, ur.branch_code
         FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
        WHERE ur.user_id = $1`, [userId]);
        const permissions = new Set(perms.rows.map((r) => r.code));
        const branchRows = await c.query('SELECT DISTINCT branch_code FROM user_roles WHERE user_id = $1', [userId]);
        const all = branchRows.rows.some((r) => String(r.branch_code).trim() === 'ALL');
        const branches = all ? '*' : branchRows.rows.map((r) => String(r.branch_code).trim());
        return { id: u.id, email: u.email, name: u.display_name, companyId: u.company_id, permissions, branches, sessionId, mustChangePassword: Boolean(u.must_change_password) };
    }
    tokens(user, refreshToken, refreshExpiresAt) {
        const claims = { sub: user.id, sid: user.sessionId, cid: user.companyId, email: user.email, name: user.name };
        const accessToken = jsonwebtoken_1.default.sign(claims, this.cfg.JWT_SECRET, { algorithm: 'HS256', expiresIn: this.cfg.ACCESS_TOKEN_TTL_SECONDS, audience: 'erp-api', issuer: 'erp-auth' });
        return { accessToken, expiresIn: this.cfg.ACCESS_TOKEN_TTL_SECONDS, refreshToken, refreshExpiresAt, user: { ...user, permissions: [...user.permissions].sort() } };
    }
    /** Ganti kata sandi sendiri: verifikasi kata sandi lama, terapkan kebijakan, cabut sesi lain. */
    async changeOwnPassword(user, current, next, meta) {
        const problems = (0, domain_1.passwordProblems)(next, user.email);
        if (problems.length)
            throw new errors_js_1.DomainError('PASSWORD_WEAK', problems.join(' '), common_1.HttpStatus.UNPROCESSABLE_ENTITY, problems);
        if (current === next)
            throw new errors_js_1.DomainError('PASSWORD_SAME', 'Kata sandi baru harus berbeda dari kata sandi lama.', common_1.HttpStatus.UNPROCESSABLE_ENTITY);
        return this.db.run((0, db_service_js_1.systemContext)(), async (c) => {
            const u = (await c.query('SELECT password_hash FROM users WHERE id = $1', [user.id])).rows[0];
            if (!u?.password_hash || !(await argon2_1.default.verify(u.password_hash, current)))
                throw new errors_js_1.DomainError('PASSWORD_WRONG', 'Kata sandi saat ini salah.', common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            await c.query('UPDATE users SET password_hash = $2, must_change_password = false, password_changed_at = now(), failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id, await AuthService_1.hashPassword(next)]);
            const revoked = await c.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL', [user.id, user.sessionId]);
            await this.audit.record(c, { companyId: user.companyId, userId: user.id, sessionId: user.sessionId, action: 'user.password_changed', entityType: 'user', entityId: user.id, after: { otherSessionsRevoked: revoked.rowCount }, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId });
            return { changed: true, otherSessionsRevoked: revoked.rowCount ?? 0 };
        });
    }
    static hashPassword(pw) { return argon2_1.default.hash(pw, { type: argon2_1.default.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }); }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], AuthService);
//# sourceMappingURL=auth.service.js.map