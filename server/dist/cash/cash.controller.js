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
exports.CashController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const statements_service_js_1 = require("./statements.service.js");
const tax_service_js_1 = require("./tax.service.js");
const transfers_service_js_1 = require("./transfers.service.js");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const reason = zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const opt = (t) => t.optional();
const text = (max) => zod_1.z.string().trim().max(max);
const bankCode = zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Pilih rekening'));
const money = zod_1.z.number().int('Nilai rupiah bulat').positive('Nilai harus lebih dari nol').max(1e13);
const transferInput = zod_1.z.object({ fromBank: bankCode, toBank: bankCode, amount: money, date: opt(date), reference: opt(text(80)), notes: opt(text(300)) });
const approveInput = zod_1.z.object({ note: opt(text(300)) });
const rejectInput = zod_1.z.object({ note: reason });
const reasonOnly = zod_1.z.object({ reason });
const reverseInput = zod_1.z.object({ reason, date: opt(date) });
const importInput = zod_1.z.object({
    bankAccount: bankCode, fileName: opt(text(200)), content: zod_1.z.string().min(10, 'Berkas kosong').max(1_500_000, 'Berkas terlalu besar (maks. 1,5 MB)'),
    opening: opt(zod_1.z.number().int().min(-1e13).max(1e13)), closing: opt(zod_1.z.number().int().min(-1e13).max(1e13)),
});
const matchInput = zod_1.z.object({ journalLineId: zod_1.z.number().int().positive() });
const ignoreInput = zod_1.z.object({ note: reason });
const journalInput = zod_1.z.object({ account: zod_1.z.string().trim().regex(/^\d-\d{4}(\.\d{2})?$/, 'Kode akun tidak sah'), description: opt(text(300)) });
const periodInput = zod_1.z.object({ period: zod_1.z.string().trim().regex(/^\d{4}-\d{2}$/, 'Masa pajak berformat YYYY-MM') });
const payInput = zod_1.z.object({ bankAccount: bankCode, date: opt(date), ntpn: zod_1.z.string().trim().toUpperCase().regex(/^[A-Z0-9]{16}$/, 'NTPN 16 karakter huruf/angka') });
const READ = 'ledger.report.read';
let CashController = class CashController {
    transfers;
    statements;
    tax;
    constructor(transfers, statements, tax) {
        this.transfers = transfers;
        this.statements = statements;
        this.tax = tax;
    }
    /* --- Transfer kas & bank --- */
    listTransfers(u, s, r) { return this.transfers.list(u, s, r.requestId); }
    getTransfer(id, u, s, r) { return this.transfers.get(u, s, id, r.requestId); }
    createTransfer(b, u, s, r) {
        return this.transfers.create(u, s, b, r.requestId);
    }
    approveTransfer(id, b, u, s, r) {
        return this.transfers.approve(u, s, id, b.note, r.requestId);
    }
    rejectTransfer(id, b, u, s, r) {
        return this.transfers.reject(u, s, id, b.note, r.requestId);
    }
    cancelTransfer(id, b, u, s, r) {
        return this.transfers.cancel(u, s, id, b.reason, r.requestId);
    }
    reverseTransfer(id, b, u, s, r) {
        return this.transfers.reverse(u, s, id, b.reason, b.date, r.requestId);
    }
    /* --- Rekonsiliasi bank --- */
    listStatements(u, s, r) { return this.statements.list(u, s, r.requestId); }
    getStatement(id, u, s, r) { return this.statements.get(u, s, id, r.requestId); }
    importStatement(b, u, s, r) {
        return this.statements.import(u, s, b, r.requestId);
    }
    autoMatch(id, u, s, r) { return this.statements.autoMatchAgain(u, s, id, r.requestId); }
    match(id, lineId, b, u, s, r) {
        return this.statements.match(u, s, id, lineId, b.journalLineId, r.requestId);
    }
    unmatch(id, lineId, u, s, r) {
        return this.statements.unmatch(u, s, id, lineId, r.requestId);
    }
    ignore(id, lineId, b, u, s, r) {
        return this.statements.ignore(u, s, id, lineId, b.note, r.requestId);
    }
    lineJournal(id, lineId, b, u, s, r) {
        return this.statements.createJournal(u, s, id, lineId, b, r.requestId);
    }
    finalize(id, u, s, r) { return this.statements.finalize(u, s, id, r.requestId); }
    cancelStatement(id, b, u, s, r) {
        return this.statements.cancel(u, s, id, b.reason, r.requestId);
    }
    /* --- Setoran PPN --- */
    ppn(period, u, s, r) {
        return this.tax.preview(u, s, period && /^\d{4}-\d{2}$/.test(period) ? period : null, r.requestId);
    }
    listSettlements(u, s, r) { return this.tax.list(u, s, r.requestId); }
    getSettlement(id, u, s, r) { return this.tax.get(u, s, id, r.requestId); }
    createSettlement(b, u, s, r) {
        return this.tax.create(u, s, b.period, r.requestId);
    }
    postSettlement(id, u, s, r) { return this.tax.post(u, s, id, r.requestId); }
    paySettlement(id, b, u, s, r) {
        return this.tax.pay(u, s, id, b, r.requestId);
    }
    cancelSettlement(id, b, u, s, r) {
        return this.tax.cancel(u, s, id, b.reason, r.requestId);
    }
};
exports.CashController = CashController;
__decorate([
    (0, common_1.Get)('transfers'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "listTransfers", null);
__decorate([
    (0, common_1.Get)('transfers/:id'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "getTransfer", null);
__decorate([
    (0, common_1.Post)('transfers'),
    (0, context_js_1.RequirePermission)('cash.transfer.create'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(transferInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "createTransfer", null);
__decorate([
    (0, common_1.Post)('transfers/:id/approve'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('cash.transfer.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(approveInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "approveTransfer", null);
__decorate([
    (0, common_1.Post)('transfers/:id/reject'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('cash.transfer.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(rejectInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "rejectTransfer", null);
__decorate([
    (0, common_1.Post)('transfers/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('cash.transfer.create|cash.transfer.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "cancelTransfer", null);
__decorate([
    (0, common_1.Post)('transfers/:id/reverse'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('cash.transfer.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reverseInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "reverseTransfer", null);
__decorate([
    (0, common_1.Get)('statements'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "listStatements", null);
__decorate([
    (0, common_1.Get)('statements/:id'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "getStatement", null);
__decorate([
    (0, common_1.Post)('statements'),
    (0, context_js_1.RequirePermission)('cash.reconcile'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(importInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "importStatement", null);
__decorate([
    (0, common_1.Post)('statements/:id/auto-match'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('cash.reconcile'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "autoMatch", null);
__decorate([
    (0, common_1.Post)('statements/:id/lines/:lineId/match'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('cash.reconcile'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('lineId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(matchInput))),
    __param(3, (0, context_js_1.CurrentUser)()),
    __param(4, (0, context_js_1.Scope)()),
    __param(5, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "match", null);
__decorate([
    (0, common_1.Post)('statements/:id/lines/:lineId/unmatch'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('cash.reconcile'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('lineId', common_1.ParseIntPipe)),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "unmatch", null);
__decorate([
    (0, common_1.Post)('statements/:id/lines/:lineId/ignore'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('cash.reconcile'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('lineId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(ignoreInput))),
    __param(3, (0, context_js_1.CurrentUser)()),
    __param(4, (0, context_js_1.Scope)()),
    __param(5, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "ignore", null);
__decorate([
    (0, common_1.Post)('statements/:id/lines/:lineId/journal'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('cash.reconcile', 'ledger.journal.create|ledger.journal.post'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('lineId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(journalInput))),
    __param(3, (0, context_js_1.CurrentUser)()),
    __param(4, (0, context_js_1.Scope)()),
    __param(5, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "lineJournal", null);
__decorate([
    (0, common_1.Post)('statements/:id/finalize'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('cash.reconcile.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "finalize", null);
__decorate([
    (0, common_1.Post)('statements/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('cash.reconcile'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "cancelStatement", null);
__decorate([
    (0, common_1.Get)('tax/ppn'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, common_1.Query)('period')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "ppn", null);
__decorate([
    (0, common_1.Get)('tax/settlements'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "listSettlements", null);
__decorate([
    (0, common_1.Get)('tax/settlements/:id'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "getSettlement", null);
__decorate([
    (0, common_1.Post)('tax/settlements'),
    (0, context_js_1.RequirePermission)('tax.settlement.create'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(periodInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "createSettlement", null);
__decorate([
    (0, common_1.Post)('tax/settlements/:id/post'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('tax.settlement.post'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "postSettlement", null);
__decorate([
    (0, common_1.Post)('tax/settlements/:id/pay'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('tax.settlement.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(payInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "paySettlement", null);
__decorate([
    (0, common_1.Post)('tax/settlements/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('tax.settlement.create|tax.settlement.post'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CashController.prototype, "cancelSettlement", null);
exports.CashController = CashController = __decorate([
    (0, common_1.Controller)('cash'),
    __metadata("design:paramtypes", [transfers_service_js_1.CashTransfersService, statements_service_js_1.BankStatementsService, tax_service_js_1.TaxSettlementsService])
], CashController);
//# sourceMappingURL=cash.controller.js.map