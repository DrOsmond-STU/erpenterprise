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
exports.AssetsController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const assets_service_js_1 = require("./assets.service.js");
const maintenance_service_js_1 = require("./maintenance.service.js");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const period = zod_1.z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periode berformat YYYY-MM');
const money = zod_1.z.number().int('Nilai rupiah bulat').min(0).max(1e13);
const text = (max) => zod_1.z.string().trim().max(max);
const bankCode = zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Pilih rekening'));
const reason = zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const assetInput = zod_1.z.object({
    name: zod_1.z.string().trim().min(3, 'Nama minimal 3 karakter').max(120), category: zod_1.z.string().trim().min(3).max(60), glAccount: zod_1.z.string().trim().regex(/^\d-\d{4}$/, 'Pilih akun aset'),
    branch: zod_1.z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Pilih cabang'), location: text(120).optional(), acquisitionDate: date, cost: money.min(1, 'Harga perolehan wajib'),
    usefulLifeMonths: zod_1.z.number().int().min(1, 'Umur manfaat minimal 1 bulan').max(600), salvage: money.optional(), bank: bankCode,
});
const runInput = zod_1.z.object({ period });
const disposeInput = zod_1.z.object({ date, proceeds: money, bank: bankCode.optional(), note: reason });
const maintInput = zod_1.z.object({
    assetId: zod_1.z.string().uuid('Pilih aset'), kind: zod_1.z.enum(['preventif', 'korektif']), priority: zod_1.z.enum(['rendah', 'sedang', 'tinggi']).default('sedang'),
    assignee: text(80).optional(), scheduledDate: date, description: zod_1.z.string().trim().min(3, 'Uraian minimal 3 karakter').max(300), estimatedCost: money.optional(),
});
const completeInput = zod_1.z.object({
    date: date.optional(), serviceCost: money, bank: bankCode.optional(), notes: text(300).optional(),
    parts: zod_1.z.array(zod_1.z.object({ warehouse: zod_1.z.string().trim().min(1).max(40), sku: zod_1.z.string().trim().min(1).max(40), qty: zod_1.z.number().finite().positive().max(1e6) })).max(50).optional(),
});
const reasonOnly = zod_1.z.object({ reason });
let AssetsController = class AssetsController {
    assets;
    maint;
    constructor(assets, maint) {
        this.assets = assets;
        this.maint = maint;
    }
    list(u, s, r) { return this.assets.list(u, s, r.requestId); }
    runs(u, s, r) { return this.assets.runs(u, s, r.requestId); }
    preview(q, u, s, r) { return this.assets.preview(u, s, q.period, r.requestId); }
    run(b, u, s, r) { return this.assets.runDepreciation(u, s, b.period, r.requestId); }
    listMaint(u, s, r) { return this.maint.list(u, s, r.requestId); }
    getMaint(id, u, s, r) { return this.maint.get(u, s, id, r.requestId); }
    createMaint(b, u, s, r) { return this.maint.create(u, s, b, r.requestId); }
    startMaint(id, u, s, r) { return this.maint.start(u, s, id, r.requestId); }
    completeMaint(id, b, u, s, r) {
        return this.maint.complete(u, s, id, b, r.requestId);
    }
    cancelMaint(id, b, u, s, r) {
        return this.maint.cancel(u, s, id, b.reason, r.requestId);
    }
    get(id, u, s, r) { return this.assets.get(u, s, id, r.requestId); }
    create(b, u, s, r) { return this.assets.create(u, s, b, r.requestId); }
    dispose(id, b, u, s, r) {
        return this.assets.dispose(u, s, id, b, r.requestId);
    }
};
exports.AssetsController = AssetsController;
__decorate([
    (0, common_1.Get)(),
    (0, context_js_1.RequirePermission)('asset.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('depreciation/runs'),
    (0, context_js_1.RequirePermission)('asset.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "runs", null);
__decorate([
    (0, common_1.Get)('depreciation/preview'),
    (0, context_js_1.RequirePermission)('asset.read'),
    __param(0, (0, common_1.Query)(new zod_pipe_js_1.ZodValidationPipe(runInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)('depreciation/run'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('asset.depreciate'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(runInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "run", null);
__decorate([
    (0, common_1.Get)('maintenance'),
    (0, context_js_1.RequirePermission)('asset.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "listMaint", null);
__decorate([
    (0, common_1.Get)('maintenance/:id'),
    (0, context_js_1.RequirePermission)('asset.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "getMaint", null);
__decorate([
    (0, common_1.Post)('maintenance'),
    (0, context_js_1.RequirePermission)('asset.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(maintInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "createMaint", null);
__decorate([
    (0, common_1.Post)('maintenance/:id/start'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('asset.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "startMaint", null);
__decorate([
    (0, common_1.Post)('maintenance/:id/complete'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('asset.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(completeInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "completeMaint", null);
__decorate([
    (0, common_1.Post)('maintenance/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('asset.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "cancelMaint", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, context_js_1.RequirePermission)('asset.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, context_js_1.RequirePermission)('asset.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(assetInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/dispose'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('asset.depreciate'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(disposeInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssetsController.prototype, "dispose", null);
exports.AssetsController = AssetsController = __decorate([
    (0, common_1.Controller)('assets'),
    __metadata("design:paramtypes", [assets_service_js_1.AssetsService, maintenance_service_js_1.MaintenanceService])
], AssetsController);
//# sourceMappingURL=assets.controller.js.map