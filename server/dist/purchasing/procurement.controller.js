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
exports.ProcurementController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const procurement_service_js_1 = require("./procurement.service.js");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const reason = zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const opt = (t) => t.optional();
const text = (max) => zod_1.z.string().trim().max(max);
const branch = zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf'));
const money = zod_1.z.number().int('Nilai rupiah bulat').min(0).max(1e13);
const line = zod_1.z.object({
    productId: opt(zod_1.z.string().uuid().nullable()), description: opt(text(200)), kind: opt(zod_1.z.enum(['barang', 'jasa'])), unit: opt(text(20)),
    qty: zod_1.z.number().positive('Kuantitas harus lebih dari nol').max(1e9), price: opt(money),
    expenseAccount: opt(zod_1.z.string().trim().regex(/^\d-\d{4}(\.\d{2})?$/, 'Kode akun tidak sah').nullable()),
});
const prBase = {
    branch: opt(branch), requestDate: opt(date), neededDate: opt(date.nullable()), department: opt(zod_1.z.string().trim().min(2, 'Departemen minimal 2 karakter').max(80)),
    requesterName: opt(text(120)), description: opt(zod_1.z.string().trim().min(5, 'Deskripsi minimal 5 karakter').max(300)), priority: opt(zod_1.z.enum(['rendah', 'sedang', 'tinggi'])),
    notes: opt(text(500)), submit: opt(zod_1.z.boolean()),
};
const prCreate = zod_1.z.object({ ...prBase, department: prBase.department.unwrap(), description: prBase.description.unwrap(), lines: zod_1.z.array(line).min(1, 'Minimal satu baris').max(100) });
const prPatch = zod_1.z.object({ ...prBase, lines: opt(zod_1.z.array(line).min(1, 'Minimal satu baris').max(100)) });
const price = zod_1.z.object({ lineNo: zod_1.z.number().int().positive(), price: money, discPct: opt(zod_1.z.number().min(0).max(100)) });
const toOrder = zod_1.z.object({ supplierId: zod_1.z.string().uuid('Pilih pemasok'), orderDate: opt(date), prices: opt(zod_1.z.array(price).max(100)), submit: opt(zod_1.z.boolean()) });
const rfqCreate = zod_1.z.object({
    requisitionId: zod_1.z.string().uuid('Pilih permintaan pembelian'), title: opt(text(200)), date: opt(date), deadline: date,
    supplierIds: zod_1.z.array(zod_1.z.string().uuid('Pemasok tidak sah')).min(2, 'Undang minimal 2 pemasok').max(20),
});
const invite = zod_1.z.object({ supplierId: zod_1.z.string().uuid('Pilih pemasok') });
const quote = zod_1.z.object({
    supplierId: zod_1.z.string().uuid('Pilih pemasok'), declined: opt(zod_1.z.boolean()), quoteRef: opt(text(60)), quoteDate: opt(date), leadDays: opt(zod_1.z.number().int().min(0).max(365)),
    validUntil: opt(date.nullable()), notes: opt(text(300)), prices: opt(zod_1.z.array(price).max(100)),
});
const award = zod_1.z.object({ quoteId: zod_1.z.string().uuid('Pilih penawaran'), reason: opt(text(300)), orderDate: opt(date), submit: opt(zod_1.z.boolean()) });
const decision = zod_1.z.object({ note: opt(text(300)) });
const rejectInput = zod_1.z.object({ note: reason });
const reasonOnly = zod_1.z.object({ reason });
/* Siapa pun yang terlibat dalam pengadaan dapat membaca PR & RFQ di cabangnya. */
const READ = 'purchasing.requisition.create|purchasing.requisition.approve|purchasing.rfq.manage|purchasing.order.create';
let ProcurementController = class ProcurementController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    catalog(u, s, r) { return this.svc.catalog(u, s, r.requestId); }
    /* --- Permintaan pembelian --- */
    list(u, s, r) { return this.svc.listRequisitions(u, s, r.requestId); }
    get(id, u, s, r) { return this.svc.getRequisition(u, s, id, r.requestId); }
    create(b, u, s, r) {
        return this.svc.createRequisition(u, s, b, r.requestId);
    }
    update(id, b, u, s, r) {
        return this.svc.updateRequisition(u, s, id, b, r.requestId);
    }
    submit(id, u, s, r) { return this.svc.submitRequisition(u, s, id, r.requestId); }
    approve(id, b, u, s, r) {
        return this.svc.decideRequisition(u, s, id, true, b.note, r.requestId);
    }
    reject(id, b, u, s, r) {
        return this.svc.decideRequisition(u, s, id, false, b.note, r.requestId);
    }
    cancel(id, b, u, s, r) {
        return this.svc.cancelRequisition(u, s, id, b.reason, r.requestId);
    }
    order(id, b, u, s, r) {
        return this.svc.requisitionToOrder(u, s, id, b, r.requestId);
    }
    /* --- RFQ & penawaran pemasok --- */
    rfqs(u, s, r) { return this.svc.listRfqs(u, s, r.requestId); }
    rfq(id, u, s, r) { return this.svc.getRfq(u, s, id, r.requestId); }
    createRfq(b, u, s, r) {
        return this.svc.createRfq(u, s, b, r.requestId);
    }
    invite(id, b, u, s, r) {
        return this.svc.invite(u, s, id, b.supplierId, r.requestId);
    }
    quote(id, b, u, s, r) {
        return this.svc.recordQuote(u, s, id, b, r.requestId);
    }
    award(id, b, u, s, r) {
        return this.svc.award(u, s, id, b, r.requestId);
    }
    cancelRfq(id, b, u, s, r) {
        return this.svc.cancelRfq(u, s, id, b.reason, r.requestId);
    }
};
exports.ProcurementController = ProcurementController;
__decorate([
    (0, common_1.Get)('procurement/catalog'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "catalog", null);
__decorate([
    (0, common_1.Get)('requisitions'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('requisitions/:id'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('requisitions'),
    (0, context_js_1.RequirePermission)('purchasing.requisition.create'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(prCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('requisitions/:id'),
    (0, context_js_1.RequirePermission)('purchasing.requisition.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(prPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('requisitions/:id/submit'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.requisition.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)('requisitions/:id/approve'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.requisition.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(decision))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)('requisitions/:id/reject'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.requisition.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(rejectInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)('requisitions/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.requisition.create|purchasing.requisition.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)('requisitions/:id/order'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.order.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(toOrder))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "order", null);
__decorate([
    (0, common_1.Get)('rfqs'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "rfqs", null);
__decorate([
    (0, common_1.Get)('rfqs/:id'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "rfq", null);
__decorate([
    (0, common_1.Post)('rfqs'),
    (0, context_js_1.RequirePermission)('purchasing.rfq.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(rfqCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "createRfq", null);
__decorate([
    (0, common_1.Post)('rfqs/:id/invite'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.rfq.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(invite))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "invite", null);
__decorate([
    (0, common_1.Post)('rfqs/:id/quotes'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.rfq.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(quote))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "quote", null);
__decorate([
    (0, common_1.Post)('rfqs/:id/award'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.rfq.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(award))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "award", null);
__decorate([
    (0, common_1.Post)('rfqs/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.rfq.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "cancelRfq", null);
exports.ProcurementController = ProcurementController = __decorate([
    (0, common_1.Controller)('purchasing'),
    __metadata("design:paramtypes", [procurement_service_js_1.ProcurementService])
], ProcurementController);
//# sourceMappingURL=procurement.controller.js.map