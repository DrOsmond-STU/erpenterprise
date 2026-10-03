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
exports.CrmController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const domain_1 = require("@erp/domain");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const crm_service_js_1 = require("./crm.service.js");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const opt = (t) => t.optional();
const text = (max) => zod_1.z.string().trim().max(max);
const branch = zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf'));
const money = zod_1.z.number().int('Nilai rupiah bulat').min(0).max(1e14);
const reason = zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const stage = zod_1.z.enum(domain_1.OPP_STAGES);
const oppBase = {
    branch: opt(branch), name: opt(zod_1.z.string().trim().min(3, 'Nama peluang minimal 3 karakter').max(200)), customerId: opt(zod_1.z.string().uuid().nullable()), companyName: opt(text(200)),
    contactName: opt(text(120)), contactPhone: opt(text(40)), contactEmail: opt(zod_1.z.string().trim().email('Email tidak sah').max(200).or(zod_1.z.literal(''))), value: opt(money),
    stage: opt(stage), probability: opt(zod_1.z.number().int().min(0).max(100).nullable()), source: opt(text(40)), ownerName: opt(text(120)),
    expectedClose: opt(date.nullable()), nextAction: opt(text(300).nullable()), nextActionDate: opt(date.nullable()),
};
const oppCreate = zod_1.z.object({ ...oppBase, name: oppBase.name.unwrap() });
const oppPatch = zod_1.z.object(oppBase);
const stageInput = zod_1.z.object({ stage, probability: opt(zod_1.z.number().int().min(0).max(100).nullable()), lostReason: opt(text(300).nullable()) });
const activity = zod_1.z.object({ kind: zod_1.z.enum(['catatan', 'telepon', 'rapat', 'email', 'kunjungan']), note: zod_1.z.string().trim().min(3, 'Catatan minimal 3 karakter').max(1000), nextAction: opt(text(300).nullable()), nextActionDate: opt(date.nullable()) });
const line = zod_1.z.object({
    productId: opt(zod_1.z.string().uuid().nullable()), description: opt(text(200)), kind: opt(zod_1.z.enum(['barang', 'jasa'])), unit: opt(text(20)),
    qty: zod_1.z.number().positive('Kuantitas harus lebih dari nol').max(1e9), price: opt(money), discPct: opt(zod_1.z.number().min(0).max(100)),
});
const quoteBase = { branch: opt(branch), customerId: opt(zod_1.z.string().uuid('Pilih pelanggan')), opportunityId: opt(zod_1.z.string().uuid().nullable()), quoteDate: opt(date), validUntil: opt(date), terms: opt(text(500)), notes: opt(text(500)) };
const quoteCreate = zod_1.z.object({ ...quoteBase, lines: zod_1.z.array(line).min(1, 'Minimal satu baris').max(100) });
const quotePatch = zod_1.z.object({ ...quoteBase, lines: opt(zod_1.z.array(line).min(1).max(100)) });
const decision = zod_1.z.object({ note: opt(text(300)) });
const rejectInput = zod_1.z.object({ note: reason });
const reasonOnly = zod_1.z.object({ reason });
const toOrder = zod_1.z.object({ orderDate: opt(date), deliveryDate: opt(date.nullable()) });
let CrmController = class CrmController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    opps(u, s, r) { return this.svc.listOpps(u, s, r.requestId); }
    opp(id, u, s, r) { return this.svc.getOpp(u, s, id, r.requestId); }
    createOpp(b, u, s, r) { return this.svc.createOpp(u, s, b, r.requestId); }
    patchOpp(id, b, u, s, r) { return this.svc.updateOpp(u, s, id, b, r.requestId); }
    stage(id, b, u, s, r) { return this.svc.moveStage(u, s, id, b, r.requestId); }
    activity(id, b, u, s, r) { return this.svc.addActivity(u, s, id, b, r.requestId); }
    quotes(u, s, r) { return this.svc.listQuotes(u, s, r.requestId); }
    quote(id, u, s, r) { return this.svc.getQuote(u, s, id, r.requestId); }
    createQuote(b, u, s, r) { return this.svc.createQuote(u, s, b, r.requestId); }
    patchQuote(id, b, u, s, r) { return this.svc.updateQuote(u, s, id, b, r.requestId); }
    send(id, u, s, r) { return this.svc.sendQuote(u, s, id, r.requestId); }
    accept(id, b, u, s, r) { return this.svc.decideQuote(u, s, id, true, b.note, r.requestId); }
    reject(id, b, u, s, r) { return this.svc.decideQuote(u, s, id, false, b.note, r.requestId); }
    order(id, b, u, s, r) { return this.svc.quoteToOrder(u, s, id, b, r.requestId); }
    cancel(id, b, u, s, r) { return this.svc.cancelQuote(u, s, id, b.reason, r.requestId); }
};
exports.CrmController = CrmController;
__decorate([
    (0, common_1.Get)('opportunities'),
    (0, context_js_1.RequirePermission)('crm.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "opps", null);
__decorate([
    (0, common_1.Get)('opportunities/:id'),
    (0, context_js_1.RequirePermission)('crm.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "opp", null);
__decorate([
    (0, common_1.Post)('opportunities'),
    (0, context_js_1.RequirePermission)('crm.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(oppCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "createOpp", null);
__decorate([
    (0, common_1.Patch)('opportunities/:id'),
    (0, context_js_1.RequirePermission)('crm.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(oppPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "patchOpp", null);
__decorate([
    (0, common_1.Post)('opportunities/:id/stage'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('crm.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(stageInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "stage", null);
__decorate([
    (0, common_1.Post)('opportunities/:id/activities'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('crm.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(activity))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "activity", null);
__decorate([
    (0, common_1.Get)('quotations'),
    (0, context_js_1.RequirePermission)('crm.read|sales.quote.create'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "quotes", null);
__decorate([
    (0, common_1.Get)('quotations/:id'),
    (0, context_js_1.RequirePermission)('crm.read|sales.quote.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "quote", null);
__decorate([
    (0, common_1.Post)('quotations'),
    (0, context_js_1.RequirePermission)('sales.quote.create'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(quoteCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "createQuote", null);
__decorate([
    (0, common_1.Patch)('quotations/:id'),
    (0, context_js_1.RequirePermission)('sales.quote.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(quotePatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "patchQuote", null);
__decorate([
    (0, common_1.Post)('quotations/:id/send'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('sales.quote.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "send", null);
__decorate([
    (0, common_1.Post)('quotations/:id/accept'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('sales.quote.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(decision))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "accept", null);
__decorate([
    (0, common_1.Post)('quotations/:id/reject'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('sales.quote.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(rejectInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)('quotations/:id/order'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('sales.order.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(toOrder))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "order", null);
__decorate([
    (0, common_1.Post)('quotations/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('sales.quote.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "cancel", null);
exports.CrmController = CrmController = __decorate([
    (0, common_1.Controller)('crm'),
    __metadata("design:paramtypes", [crm_service_js_1.CrmService])
], CrmController);
//# sourceMappingURL=crm.controller.js.map