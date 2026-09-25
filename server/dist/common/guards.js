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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchContextGuard = exports.PermissionsGuard = exports.JwtAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const auth_service_js_1 = require("../auth/auth.service.js");
const context_js_1 = require("./context.js");
const errors_js_1 = require("./errors.js");
/** K-05/K-13: setiap endpoint (kecuali @Public) memerlukan access token yang sah. */
let JwtAuthGuard = class JwtAuthGuard {
    reflector;
    auth;
    constructor(reflector, auth) {
        this.reflector = reflector;
        this.auth = auth;
    }
    async canActivate(ctx) {
        if (this.reflector.getAllAndOverride(context_js_1.PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]))
            return true;
        const req = ctx.switchToHttp().getRequest();
        const header = req.headers.authorization ?? '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token)
            throw new common_1.UnauthorizedException('Token akses tidak ada.');
        req.user = await this.auth.userFromAccessToken(token);
        return true;
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector, auth_service_js_1.AuthService])
], JwtAuthGuard);
/** K-10/K-13: izin granular per aksi, ditegakkan di server. */
let PermissionsGuard = class PermissionsGuard {
    reflector;
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(ctx) {
        const required = this.reflector.getAllAndOverride(context_js_1.PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);
        if (!required || !required.length)
            return true;
        const req = ctx.switchToHttp().getRequest();
        if (!req.user)
            return false;
        const missing = required.filter((p) => !req.user.permissions.has(p));
        if (missing.length)
            throw (0, errors_js_1.forbidden)(`Memerlukan izin ${missing.join(', ')}.`);
        return true;
    }
};
exports.PermissionsGuard = PermissionsGuard;
exports.PermissionsGuard = PermissionsGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], PermissionsGuard);
/**
 * K-11: konteks cabang dari header X-Branch-Id; 'ALL' hanya untuk pemegang
 * report.consolidated atau peran lintas cabang. Periode dari X-Period-Id.
 */
let BranchContextGuard = class BranchContextGuard {
    reflector;
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(ctx) {
        if (this.reflector.getAllAndOverride(context_js_1.PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]))
            return true;
        const req = ctx.switchToHttp().getRequest();
        const user = req.user;
        const raw = String(req.headers['x-branch-id'] ?? '').trim().toUpperCase();
        const period = String(req.headers['x-period-id'] ?? '').trim() || null;
        if (period && !/^[0-9A-Z-]{4,12}$/.test(period))
            throw (0, errors_js_1.forbidden)('Periode tidak sah.');
        if (!raw) {
            /* Tanpa header: cakupan = seluruh cabang yang dimiliki pengguna (RLS tetap membatasi). */
            req.scope = { branch: user.branches === '*' ? 'ALL' : user.branches.length === 1 ? user.branches[0] : 'ALL', rlsBranches: user.branches, period };
            return true;
        }
        if (raw === 'ALL') {
            const allowedAll = user.branches === '*' || user.permissions.has('report.consolidated');
            if (!allowedAll)
                throw (0, errors_js_1.forbidden)('Konteks "Semua cabang" memerlukan izin laporan konsolidasi.');
            req.scope = { branch: 'ALL', rlsBranches: user.branches, period };
            return true;
        }
        if (!/^[A-Z]{3}$/.test(raw))
            throw (0, errors_js_1.forbidden)('Kode cabang tidak sah.');
        if (user.branches !== '*' && !user.branches.includes(raw))
            throw (0, errors_js_1.forbidden)(`Anda tidak memiliki akses ke cabang ${raw}.`);
        req.scope = { branch: raw, rlsBranches: [raw], period };
        return true;
    }
};
exports.BranchContextGuard = BranchContextGuard;
exports.BranchContextGuard = BranchContextGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], BranchContextGuard);
//# sourceMappingURL=guards.js.map