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
exports.OrgController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const org_service_js_1 = require("./org.service.js");
const branchSchema = zod_1.z.object({
    code: zod_1.z.string().regex(/^[A-Za-z]{3}$/, 'Kode cabang tepat 3 huruf').transform((s) => s.toUpperCase()),
    name: zod_1.z.string().trim().min(3).max(120),
    shortName: zod_1.z.string().trim().min(2).max(40).optional(),
    type: zod_1.z.string().trim().min(3).max(60),
    city: zod_1.z.string().trim().min(2).max(80),
    address: zod_1.z.string().trim().max(300).optional(),
    phone: zod_1.z.string().trim().max(40).optional(),
    managerName: zod_1.z.string().trim().max(120).optional(),
    bankName: zod_1.z.string().trim().min(2).max(60).default('BCA'),
    targetMonthly: zod_1.z.number().int().min(0).default(0),
});
const branchPatch = zod_1.z.object({
    name: zod_1.z.string().trim().min(3).max(120).optional(),
    managerName: zod_1.z.string().trim().max(120).optional(),
    status: zod_1.z.enum(['aktif', 'nonaktif']).optional(),
    targetMonthly: zod_1.z.number().int().min(0).optional(),
    reason: zod_1.z.string().trim().min(3).max(300),
});
const reasonSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(300) });
let OrgController = class OrgController {
    org;
    constructor(org) {
        this.org = org;
    }
    list(u) { return this.org.listBranches(u); }
    create(body, u, req) {
        return this.org.createBranch(u, body, req.requestId);
    }
    patch(code, body, u, req) {
        return this.org.patchBranch(u, code.toUpperCase(), body, req.requestId);
    }
    periods(u) { return this.org.listPeriods(u); }
    close(code, body, u, req) {
        return this.org.closePeriod(u, code, body.reason, req.requestId);
    }
    reopen(code, body, u, req) {
        return this.org.reopenPeriod(u, code, body.reason, req.requestId);
    }
};
exports.OrgController = OrgController;
__decorate([
    (0, common_1.Get)('branches'),
    (0, context_js_1.RequirePermission)('org.branch.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('branches'),
    (0, context_js_1.RequirePermission)('org.branch.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(branchSchema))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('branches/:code'),
    (0, context_js_1.RequirePermission)('org.branch.manage'),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(branchPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "patch", null);
__decorate([
    (0, common_1.Get)('periods'),
    (0, context_js_1.RequirePermission)('org.period.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "periods", null);
__decorate([
    (0, common_1.Post)('periods/:code/close'),
    (0, context_js_1.RequirePermission)('ledger.period.close'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonSchema))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "close", null);
__decorate([
    (0, common_1.Post)('periods/:code/reopen'),
    (0, context_js_1.RequirePermission)('ledger.period.reopen'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonSchema))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], OrgController.prototype, "reopen", null);
exports.OrgController = OrgController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [org_service_js_1.OrgService])
], OrgController);
//# sourceMappingURL=org.controller.js.map