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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const auth_service_js_1 = require("./auth.service.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const context_js_1 = require("../common/context.js");
const config_js_1 = require("../config.js");
const db_service_js_1 = require("../db/db.service.js");
const loginSchema = zod_1.z.object({ email: zod_1.z.string().email().max(200), password: zod_1.z.string().min(1).max(200) });
const passwordSchema = zod_1.z.object({ currentPassword: zod_1.z.string().min(1).max(200), newPassword: zod_1.z.string().min(1).max(200) });
const REFRESH_COOKIE = 'erp_refresh';
let AuthController = class AuthController {
    auth;
    db;
    cfg = (0, config_js_1.loadConfig)();
    constructor(auth, db) {
        this.auth = auth;
        this.db = db;
    }
    setRefreshCookie(res, r) {
        res.cookie(REFRESH_COOKIE, r.refreshToken, {
            httpOnly: true, secure: this.cfg.NODE_ENV === 'production', sameSite: 'strict', path: '/api/v1/auth', expires: r.refreshExpiresAt,
        });
    }
    body(r) { return { access_token: r.accessToken, expires_in: r.expiresIn, user: r.user }; }
    meta(req) { return { ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.requestId }; }
    async login(body, req, res) {
        const r = await this.auth.login(body.email, body.password, this.meta(req));
        this.setRefreshCookie(res, r);
        return this.body(r);
    }
    async refresh(req, res) {
        const token = req.cookies?.[REFRESH_COOKIE];
        const r = await this.auth.refresh(String(token ?? ''), this.meta(req));
        this.setRefreshCookie(res, r);
        return this.body(r);
    }
    async logout(req, res) {
        const header = req.headers.authorization ?? '';
        let user;
        if (header.startsWith('Bearer '))
            user = await this.auth.userFromAccessToken(header.slice(7)).catch(() => undefined);
        await this.auth.logout(req.cookies?.[REFRESH_COOKIE], user);
        res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    }
    async me(user) {
        const branches = await this.db.run((0, db_service_js_1.systemContext)(user.companyId), async (c) => (await c.query('SELECT code, name, short_name, type, city, is_head_office, status, target_monthly, main_bank_account_code, petty_cash_account_code FROM branches WHERE company_id = $1 ORDER BY is_head_office DESC, code', [user.companyId])).rows);
        const periods = await this.db.run((0, db_service_js_1.systemContext)(user.companyId), async (c) => (await c.query('SELECT code, label, date_from, date_to, period_group, status FROM fiscal_periods WHERE company_id = $1 ORDER BY date_from, date_to', [user.companyId])).rows);
        const company = await this.db.run((0, db_service_js_1.systemContext)(user.companyId), async (c) => (await c.query('SELECT code, name FROM companies WHERE id = $1', [user.companyId])).rows[0]);
        return {
            user: { id: user.id, email: user.email, name: user.name, permissions: [...user.permissions].sort(), branches: user.branches, mustChangePassword: Boolean(user.mustChangePassword) },
            company,
            branches: branches.filter((b) => user.branches === '*' || user.branches.includes(String(b.code).trim())).map((b) => ({ ...b, code: String(b.code).trim() })),
            allBranches: user.branches === '*' || user.permissions.has('report.consolidated'),
            periods: periods.map((p) => ({ id: p.code, label: p.label, from: p.date_from, to: p.date_to, status: p.status, group: p.period_group })),
        };
    }
    changePassword(b, user, req) {
        return this.auth.changeOwnPassword(user, b.currentPassword, b.newPassword, this.meta(req));
    }
    sessions(user) { return this.auth.listSessions(user); }
    revoke(user, id) { return this.auth.revokeSession(user, id); }
};
exports.AuthController = AuthController;
__decorate([
    (0, context_js_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    (0, common_1.Post)('auth/login'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(loginSchema))),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, context_js_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 120, ttl: 60_000 } }) // per IP; setiap muat ulang SPA memanggil refresh sekali
    ,
    (0, common_1.Post)('auth/refresh'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, context_js_1.Public)(),
    (0, common_1.Post)('auth/logout'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
__decorate([
    (0, common_1.Post)('me/password'),
    (0, common_1.HttpCode)(200),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(passwordSchema))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Get)('me/sessions'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "sessions", null);
__decorate([
    (0, common_1.Delete)('me/sessions/:id'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "revoke", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [auth_service_js_1.AuthService, db_service_js_1.DbService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map