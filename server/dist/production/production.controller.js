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
exports.ProductionController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const boms_service_js_1 = require("./boms.service.js");
const work_orders_service_js_1 = require("./work-orders.service.js");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const reason = zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const text = (max) => zod_1.z.string().trim().max(max);
const sku = zod_1.z.string().trim().min(1, 'Pilih barang').max(40);
const qty = zod_1.z.number().finite().positive('Jumlah harus lebih dari nol').max(1e9);
const bomLines = zod_1.z.array(zod_1.z.object({ sku, qty })).min(1, 'Minimal satu bahan').max(200);
const bomInput = zod_1.z.object({
    code: zod_1.z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/, 'Kode BOM 2–30 huruf/angka/tanda hubung'), sku, name: text(120).optional(),
    batchQty: qty, notes: text(300).optional(), lines: bomLines,
});
const bomPatch = zod_1.z.object({ name: text(120).min(3).optional(), batchQty: qty.optional(), notes: text(300).optional(), status: zod_1.z.enum(['aktif', 'nonaktif']).optional(), lines: bomLines.optional() });
const woInput = zod_1.z.object({
    bomId: zod_1.z.string().uuid('Pilih BOM'), warehouse: zod_1.z.string().trim().min(1, 'Pilih gudang').max(40), plannedQty: qty, date: date.optional(), dueDate: date.optional(),
    line: text(60).optional(), pic: text(80).optional(), notes: text(300).optional(),
});
const woPatch = zod_1.z.object({ progress: zod_1.z.number().int().min(0).max(100).optional(), flag: text(120).nullable().optional(), line: text(60).optional(), pic: text(80).optional(), dueDate: date.nullable().optional(), notes: text(300).optional() });
const issueInput = zod_1.z.object({ date: date.optional(), lines: zod_1.z.array(zod_1.z.object({ sku, qty: zod_1.z.number().finite().min(0).max(1e9) })).max(200).optional() });
const qcInput = zod_1.z.object({ goodQty: qty, rejectQty: zod_1.z.number().finite().min(0).max(1e9).default(0), note: text(300).optional() });
const completeInput = zod_1.z.object({ date: date.optional(), note: text(300).optional() });
const reworkInput = zod_1.z.object({ note: reason });
const reasonOnly = zod_1.z.object({ reason });
const READ = 'production.read';
const MANAGE = 'production.manage';
let ProductionController = class ProductionController {
    boms;
    wo;
    constructor(boms, wo) {
        this.boms = boms;
        this.wo = wo;
    }
    /* --- BOM --- */
    listBoms(u, s, r) { return this.boms.list(u, s, r.requestId); }
    getBom(id, u, s, r) { return this.boms.get(u, s, id, r.requestId); }
    createBom(b, u, s, r) { return this.boms.create(u, s, b, r.requestId); }
    updateBom(id, b, u, s, r) {
        return this.boms.update(u, s, id, b, r.requestId);
    }
    /* --- Perintah kerja --- */
    listWo(u, s, r) { return this.wo.list(u, s, r.requestId); }
    getWo(id, u, s, r) { return this.wo.get(u, s, id, r.requestId); }
    createWo(b, u, s, r) { return this.wo.create(u, s, b, r.requestId); }
    updateWo(id, b, u, s, r) {
        return this.wo.update(u, s, id, b, r.requestId);
    }
    issue(id, b, u, s, r) {
        return this.wo.issue(u, s, id, b, r.requestId);
    }
    submitQc(id, b, u, s, r) {
        return this.wo.submitQc(u, s, id, b, r.requestId);
    }
    complete(id, b, u, s, r) {
        return this.wo.complete(u, s, id, b, r.requestId);
    }
    rework(id, b, u, s, r) {
        return this.wo.rework(u, s, id, b.note, r.requestId);
    }
    cancel(id, b, u, s, r) {
        return this.wo.cancel(u, s, id, b.reason, r.requestId);
    }
};
exports.ProductionController = ProductionController;
__decorate([
    (0, common_1.Get)('boms'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "listBoms", null);
__decorate([
    (0, common_1.Get)('boms/:id'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "getBom", null);
__decorate([
    (0, common_1.Post)('boms'),
    (0, context_js_1.RequirePermission)(MANAGE),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(bomInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "createBom", null);
__decorate([
    (0, common_1.Patch)('boms/:id'),
    (0, context_js_1.RequirePermission)(MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(bomPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "updateBom", null);
__decorate([
    (0, common_1.Get)('work-orders'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "listWo", null);
__decorate([
    (0, common_1.Get)('work-orders/:id'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "getWo", null);
__decorate([
    (0, common_1.Post)('work-orders'),
    (0, context_js_1.RequirePermission)(MANAGE),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(woInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "createWo", null);
__decorate([
    (0, common_1.Patch)('work-orders/:id'),
    (0, context_js_1.RequirePermission)(MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(woPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "updateWo", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/issue'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)(MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(issueInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "issue", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/qc'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)(MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(qcInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "submitQc", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/complete'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('production.complete'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(completeInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "complete", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/rework'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('production.complete'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reworkInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "rework", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)(MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProductionController.prototype, "cancel", null);
exports.ProductionController = ProductionController = __decorate([
    (0, common_1.Controller)('production'),
    __metadata("design:paramtypes", [boms_service_js_1.BomsService, work_orders_service_js_1.WorkOrdersService])
], ProductionController);
//# sourceMappingURL=production.controller.js.map