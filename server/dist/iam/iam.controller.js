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
exports.IamController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const domain_1 = require("@erp/domain");
const context_js_1 = require("../common/context.js");
const errors_js_1 = require("../common/errors.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const iam_service_js_1 = require("./iam.service.js");
const settings_service_js_1 = require("./settings.service.js");
const reason = zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const assignment = zod_1.z.object({
    role: zod_1.z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Kode peran tidak sah'),
    branch: zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^(ALL|[A-Z]{3})$/, 'Cabang: ALL atau kode 3 huruf')),
});
const userCreate = zod_1.z.object({
    email: zod_1.z.string().trim().email('Email tidak sah').max(200),
    name: zod_1.z.string().trim().min(2).max(120),
    roles: zod_1.z.array(assignment).min(1, 'Minimal satu peran').max(20),
    password: zod_1.z.string().max(200).optional().or(zod_1.z.literal('').transform(() => undefined)),
});
const userPatch = zod_1.z.object({
    email: zod_1.z.string().trim().email('Email tidak sah').max(200).optional(),
    name: zod_1.z.string().trim().min(2).max(120).optional(),
    status: zod_1.z.enum(['aktif', 'nonaktif']).optional(),
    roles: zod_1.z.array(assignment).min(1, 'Minimal satu peran').max(20).optional(),
    reason,
});
const resetSchema = zod_1.z.object({ password: zod_1.z.string().max(200).optional().or(zod_1.z.literal('').transform(() => undefined)), reason });
const reasonOnly = zod_1.z.object({ reason });
const roleCreate = zod_1.z.object({
    code: zod_1.z.string().trim().toLowerCase().pipe(zod_1.z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Kode peran: huruf kecil, angka, garis bawah (2–40)')),
    name: zod_1.z.string().trim().min(3).max(80),
    permissions: zod_1.z.array(zod_1.z.string()).max(100),
});
const rolePatch = zod_1.z.object({ name: zod_1.z.string().trim().min(3).max(80).optional(), permissions: zod_1.z.array(zod_1.z.string()).max(100).optional(), reason });
const settingsPatch = zod_1.z.object({
    name: zod_1.z.string().trim().min(3).max(160).optional(),
    npwp: zod_1.z.string().trim().regex(/^[0-9.\-\s]{15,25}$/, 'NPWP berupa angka (15/16 digit) dengan titik/tanda hubung').optional().or(zod_1.z.literal('')),
    address: zod_1.z.string().trim().max(400).optional(),
    phone: zod_1.z.string().trim().max(40).optional(),
    email: zod_1.z.string().trim().email('Email tidak sah').max(200).optional().or(zod_1.z.literal('')),
    website: zod_1.z.string().trim().max(200).optional(),
    fiscalYearStartMonth: zod_1.z.number().int().min(1).max(12).optional(),
    policies: zod_1.z.object({
        salesApprovalThreshold: zod_1.z.number().int().min(0).max(1e13).optional(),
        blockOverCreditLimit: zod_1.z.boolean().optional(),
        allowPartialShipment: zod_1.z.boolean().optional(),
        autoDocumentNumbering: zod_1.z.boolean().optional(),
    }).optional(),
});
let IamController = class IamController {
    iam;
    settings;
    constructor(iam, settings) {
        this.iam = iam;
        this.settings = settings;
    }
    /* --- Katalog --- */
    catalog() { return { groups: domain_1.PERMISSION_CATALOG, passwordMinLength: domain_1.PASSWORD_MIN }; }
    /* --- Pengguna --- */
    users(u) { return this.iam.listUsers(u); }
    createUser(b, u, r) {
        return this.iam.createUser(u, b, r.requestId);
    }
    patchUser(id, b, u, r) {
        return this.iam.patchUser(u, id, b, r.requestId);
    }
    reset(id, b, u, r) {
        return this.iam.resetPassword(u, id, b.password, b.reason, r.requestId);
    }
    unlock(id, b, u, r) {
        return this.iam.unlock(u, id, b.reason, r.requestId);
    }
    /* --- Peran --- */
    /** Dibaca oleh pengelola peran maupun pengelola pengguna (untuk memilih peran). */
    roles(u) {
        if (!u.permissions.has('admin.role.manage') && !u.permissions.has('admin.user.manage'))
            throw (0, errors_js_1.forbidden)('Memerlukan izin admin.role.manage atau admin.user.manage.');
        return this.iam.listRoles(u);
    }
    createRole(b, u, r) {
        return this.iam.createRole(u, b, r.requestId);
    }
    patchRole(code, b, u, r) {
        return this.iam.patchRole(u, code.slice(0, 40), b, r.requestId);
    }
    deleteRole(code, b, u, r) {
        return this.iam.deleteRole(u, code.slice(0, 40), b.reason, r.requestId);
    }
    /* --- Pengaturan --- */
    getSettings(u) { return this.settings.get(u); }
    patchSettings(b, u, r) {
        return this.settings.patch(u, b, r.requestId);
    }
};
exports.IamController = IamController;
__decorate([
    (0, common_1.Get)('admin/permissions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], IamController.prototype, "catalog", null);
__decorate([
    (0, common_1.Get)('admin/users'),
    (0, context_js_1.RequirePermission)('admin.user.manage'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IamController.prototype, "users", null);
__decorate([
    (0, common_1.Post)('admin/users'),
    (0, context_js_1.RequirePermission)('admin.user.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(userCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], IamController.prototype, "createUser", null);
__decorate([
    (0, common_1.Patch)('admin/users/:id'),
    (0, context_js_1.RequirePermission)('admin.user.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(userPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], IamController.prototype, "patchUser", null);
__decorate([
    (0, common_1.Post)('admin/users/:id/reset-password'),
    (0, context_js_1.RequirePermission)('admin.user.manage'),
    (0, common_1.HttpCode)(200),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(resetSchema))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], IamController.prototype, "reset", null);
__decorate([
    (0, common_1.Post)('admin/users/:id/unlock'),
    (0, context_js_1.RequirePermission)('admin.user.manage'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], IamController.prototype, "unlock", null);
__decorate([
    (0, common_1.Get)('admin/roles'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IamController.prototype, "roles", null);
__decorate([
    (0, common_1.Post)('admin/roles'),
    (0, context_js_1.RequirePermission)('admin.role.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(roleCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], IamController.prototype, "createRole", null);
__decorate([
    (0, common_1.Patch)('admin/roles/:code'),
    (0, context_js_1.RequirePermission)('admin.role.manage'),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(rolePatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], IamController.prototype, "patchRole", null);
__decorate([
    (0, common_1.Delete)('admin/roles/:code'),
    (0, context_js_1.RequirePermission)('admin.role.manage'),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], IamController.prototype, "deleteRole", null);
__decorate([
    (0, common_1.Get)('settings'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IamController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Patch)('settings'),
    (0, context_js_1.RequirePermission)('admin.settings.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(settingsPatch))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], IamController.prototype, "patchSettings", null);
exports.IamController = IamController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [iam_service_js_1.IamService, settings_service_js_1.SettingsService])
], IamController);
//# sourceMappingURL=iam.controller.js.map