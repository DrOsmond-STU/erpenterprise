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
exports.LedgerController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const journals_service_js_1 = require("./journals.service.js");
const master_service_js_1 = require("./master.service.js");
const reconciliation_service_js_1 = require("./reconciliation.service.js");
const reports_service_js_1 = require("./reports.service.js");
const listQuery = zod_1.z.object({
    status: zod_1.z.enum(['draft', 'pending', 'posted', 'rejected', 'reversed']).optional(),
    source: zod_1.z.string().regex(/^[a-z_-]{2,30}$/).optional(),
    account: zod_1.z.string().regex(/^\d-\d{4}$/).optional(),
    q: zod_1.z.string().trim().max(100).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    size: zod_1.z.coerce.number().int().min(1).max(200).default(25),
});
const reasonSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(300) });
const reverseSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(300), date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const cardQuery = zod_1.z.object({ bank: zod_1.z.string().regex(/^[A-Z0-9-]{3,30}$/).optional() });
const tbQuery = zod_1.z.object({ by_branch: zod_1.z.enum(['true', 'false']).optional() });
const accountCreate = zod_1.z.object({
    code: zod_1.z.string().trim().regex(/^\d-\d{4}$/, 'Kode akun berformat 9-9999'),
    name: zod_1.z.string().trim().min(3).max(120),
    type: zod_1.z.enum(['header', 'detail']),
    parentCode: zod_1.z.string().trim().regex(/^\d-\d{4}$/, 'Kode induk berformat 9-9999'),
    isContra: zod_1.z.boolean().optional(),
});
const accountPatch = zod_1.z.object({ name: zod_1.z.string().trim().min(3).max(120).optional(), status: zod_1.z.enum(['aktif', 'nonaktif']).optional(), reason: zod_1.z.string().trim().min(3).max(300) });
const bankCreate = zod_1.z.object({
    code: zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Kode rekening 3–30 karakter huruf besar, angka, atau tanda hubung')),
    branch: zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf')),
    name: zod_1.z.string().trim().min(3).max(120),
    bankName: zod_1.z.string().trim().min(2).max(60),
    accountNoLast4: zod_1.z.string().trim().regex(/^\d{4}$/, 'Empat digit terakhir nomor rekening').optional().or(zod_1.z.literal('').transform(() => undefined)),
});
const bankPatch = zod_1.z.object({
    name: zod_1.z.string().trim().min(3).max(120).optional(),
    bankName: zod_1.z.string().trim().min(2).max(60).optional(),
    accountNoLast4: zod_1.z.string().trim().regex(/^\d{4}$/, 'Empat digit terakhir nomor rekening').optional().or(zod_1.z.literal('')),
    status: zod_1.z.enum(['aktif', 'nonaktif']).optional(),
    reason: zod_1.z.string().trim().min(3).max(300),
});
const deleteSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(300) });
let LedgerController = class LedgerController {
    journals;
    reports;
    recon;
    master;
    constructor(journals, reports, recon, master) {
        this.journals = journals;
        this.reports = reports;
        this.recon = recon;
        this.master = master;
    }
    /* --- Jurnal ------------------------------------------------------------ */
    list(q, u, s, r) {
        return this.journals.list(u, s, q, r.requestId);
    }
    byRef(ref, u, s, r) {
        return this.journals.byRef(u, s, ref.slice(0, 60), r.requestId);
    }
    get(id, u, s, r) {
        return this.journals.get(u, s, id, r.requestId);
    }
    create(body, u, s, r) {
        return this.journals.create(u, s, body, r.requestId);
    }
    post(id, u, s, r) {
        return this.journals.post(u, s, id, r.requestId);
    }
    reject(id, b, u, s, r) {
        return this.journals.reject(u, s, id, b.reason, r.requestId);
    }
    reverse(id, b, u, s, r) {
        return this.journals.reverse(u, s, id, b.date, b.reason, r.requestId);
    }
    /* --- Bagan akun & kartu buku besar ---------------------------------------- */
    accounts(u, s, r) { return this.reports.chartOfAccounts(u, s, r.requestId); }
    card(code, q, u, s, r) {
        return this.reports.ledgerCard(u, s, code, q.bank ?? null, r.requestId);
    }
    banks(u, s, r) { return this.reports.bankBalances(u, s, r.requestId); }
    /* --- CRUD data induk (ledger.account.manage) ------------------------------ */
    createAccount(b, u, s, r) {
        return this.master.createAccount(u, s, b, r.requestId);
    }
    patchAccount(code, b, u, s, r) {
        return this.master.patchAccount(u, s, code.slice(0, 10), b, r.requestId);
    }
    deleteAccount(code, b, u, s, r) {
        return this.master.deleteAccount(u, s, code.slice(0, 10), b.reason, r.requestId);
    }
    createBank(b, u, s, r) {
        return this.master.createBank(u, s, b, r.requestId);
    }
    patchBank(code, b, u, s, r) {
        return this.master.patchBank(u, s, code.slice(0, 30).toUpperCase(), b, r.requestId);
    }
    deleteBank(code, b, u, s, r) {
        return this.master.deleteBank(u, s, code.slice(0, 30).toUpperCase(), b.reason, r.requestId);
    }
    /* --- Laporan -------------------------------------------------------------- */
    kpis(u, s, r) { return this.reports.kpis(u, s, r.requestId); }
    tb(q, u, s, r) {
        return this.reports.trialBalance(u, s, q.by_branch === 'true', r.requestId);
    }
    pl(u, s, r) { return this.reports.incomeStatement(u, s, r.requestId); }
    bs(u, s, r) { return this.reports.balanceSheet(u, s, r.requestId); }
    cons(u, s, r) { return this.reports.consolidation(u, s, r.requestId); }
    reconciliation(u, s, r) { return this.recon.forScope(u, s, r.requestId); }
};
exports.LedgerController = LedgerController;
__decorate([
    (0, common_1.Get)('ledger/journals'),
    (0, context_js_1.RequirePermission)('ledger.journal.read'),
    __param(0, (0, common_1.Query)(new zod_pipe_js_1.ZodValidationPipe(listQuery))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('ledger/journals/by-ref/:ref'),
    (0, context_js_1.RequirePermission)('ledger.journal.read'),
    __param(0, (0, common_1.Param)('ref')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "byRef", null);
__decorate([
    (0, common_1.Get)('ledger/journals/:id'),
    (0, context_js_1.RequirePermission)('ledger.journal.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('ledger/journals'),
    (0, context_js_1.RequirePermission)('ledger.journal.create'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('ledger/journals/:id/post'),
    (0, context_js_1.RequirePermission)('ledger.journal.post'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "post", null);
__decorate([
    (0, common_1.Post)('ledger/journals/:id/reject'),
    (0, context_js_1.RequirePermission)('ledger.journal.post'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonSchema))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)('ledger/journals/:id/reverse'),
    (0, context_js_1.RequirePermission)('ledger.journal.reverse'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reverseSchema))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "reverse", null);
__decorate([
    (0, common_1.Get)('ledger/accounts'),
    (0, context_js_1.RequirePermission)('ledger.account.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "accounts", null);
__decorate([
    (0, common_1.Get)('ledger/accounts/:code/card'),
    (0, context_js_1.RequirePermission)('ledger.report.read'),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Query)(new zod_pipe_js_1.ZodValidationPipe(cardQuery))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "card", null);
__decorate([
    (0, common_1.Get)('ledger/bank-accounts'),
    (0, context_js_1.RequirePermission)('ledger.report.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "banks", null);
__decorate([
    (0, common_1.Post)('ledger/accounts'),
    (0, context_js_1.RequirePermission)('ledger.account.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(accountCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "createAccount", null);
__decorate([
    (0, common_1.Patch)('ledger/accounts/:code'),
    (0, context_js_1.RequirePermission)('ledger.account.manage'),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(accountPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "patchAccount", null);
__decorate([
    (0, common_1.Delete)('ledger/accounts/:code'),
    (0, context_js_1.RequirePermission)('ledger.account.manage'),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(deleteSchema))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "deleteAccount", null);
__decorate([
    (0, common_1.Post)('ledger/bank-accounts'),
    (0, context_js_1.RequirePermission)('ledger.account.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(bankCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "createBank", null);
__decorate([
    (0, common_1.Patch)('ledger/bank-accounts/:code'),
    (0, context_js_1.RequirePermission)('ledger.account.manage'),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(bankPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "patchBank", null);
__decorate([
    (0, common_1.Delete)('ledger/bank-accounts/:code'),
    (0, context_js_1.RequirePermission)('ledger.account.manage'),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(deleteSchema))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "deleteBank", null);
__decorate([
    (0, common_1.Get)('reports/kpis'),
    (0, context_js_1.RequirePermission)('ledger.report.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "kpis", null);
__decorate([
    (0, common_1.Get)('reports/trial-balance'),
    (0, context_js_1.RequirePermission)('ledger.report.read'),
    __param(0, (0, common_1.Query)(new zod_pipe_js_1.ZodValidationPipe(tbQuery))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "tb", null);
__decorate([
    (0, common_1.Get)('reports/income-statement'),
    (0, context_js_1.RequirePermission)('ledger.report.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "pl", null);
__decorate([
    (0, common_1.Get)('reports/balance-sheet'),
    (0, context_js_1.RequirePermission)('ledger.report.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "bs", null);
__decorate([
    (0, common_1.Get)('reports/consolidation'),
    (0, context_js_1.RequirePermission)('report.consolidated'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "cons", null);
__decorate([
    (0, common_1.Get)('reports/reconciliation'),
    (0, context_js_1.RequirePermission)('ledger.report.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], LedgerController.prototype, "reconciliation", null);
exports.LedgerController = LedgerController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [journals_service_js_1.JournalsService, reports_service_js_1.ReportsService, reconciliation_service_js_1.ReconciliationService, master_service_js_1.MasterDataService])
], LedgerController);
//# sourceMappingURL=ledger.controller.js.map