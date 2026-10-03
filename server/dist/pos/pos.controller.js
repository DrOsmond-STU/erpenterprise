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
exports.PosController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const domain_1 = require("@erp/domain");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const pos_service_js_1 = require("./pos.service.js");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const bankCode = zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Pilih rekening'));
const money = zod_1.z.number().int('Nilai rupiah bulat').min(0).max(1e12);
const openInput = zod_1.z.object({ warehouse: zod_1.z.string().trim().min(1, 'Pilih toko').max(40), cashAccount: bankCode, settlementAccount: bankCode.optional(), openingCash: money, date: date.optional() });
const saleInput = zod_1.z.object({
    lines: zod_1.z.array(zod_1.z.object({ sku: zod_1.z.string().trim().min(1).max(40), qty: zod_1.z.number().finite().positive('Jumlah harus lebih dari nol').max(1e6), discPct: zod_1.z.number().min(0).max(100).optional() })).min(1, 'Keranjang kosong').max(100),
    method: zod_1.z.enum(domain_1.PAY_METHODS), tendered: money.optional(), reference: zod_1.z.string().trim().max(80).optional(),
});
const closeInput = zod_1.z.object({ countedCash: money, note: zod_1.z.string().trim().max(300).optional() });
const reasonOnly = zod_1.z.object({ reason: zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300) });
let PosController = class PosController {
    pos;
    constructor(pos) {
        this.pos = pos;
    }
    list(u, s, r) { return this.pos.list(u, s, r.requestId); }
    get(id, u, s, r) { return this.pos.get(u, s, id, r.requestId); }
    catalog(warehouse, u, s, r) { return this.pos.catalog(u, s, String(warehouse ?? ''), r.requestId); }
    open(b, u, s, r) { return this.pos.open(u, s, b, r.requestId); }
    sale(id, b, u, s, r) {
        return this.pos.sale(u, s, id, b, r.requestId);
    }
    voidTrx(id, b, u, s, r) {
        return this.pos.voidTrx(u, s, id, b.reason, r.requestId);
    }
    close(id, b, u, s, r) {
        return this.pos.close(u, s, id, b, r.requestId);
    }
    post(id, u, s, r) { return this.pos.post(u, s, id, r.requestId); }
};
exports.PosController = PosController;
__decorate([
    (0, common_1.Get)('shifts'),
    (0, context_js_1.RequirePermission)('pos.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('shifts/:id'),
    (0, context_js_1.RequirePermission)('pos.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "get", null);
__decorate([
    (0, common_1.Get)('catalog'),
    (0, context_js_1.RequirePermission)('pos.operate'),
    __param(0, (0, common_1.Query)('warehouse')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "catalog", null);
__decorate([
    (0, common_1.Post)('shifts'),
    (0, context_js_1.RequirePermission)('pos.operate'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(openInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "open", null);
__decorate([
    (0, common_1.Post)('shifts/:id/transactions'),
    (0, context_js_1.RequirePermission)('pos.operate'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(saleInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "sale", null);
__decorate([
    (0, common_1.Post)('transactions/:id/void'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('pos.shift.post'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "voidTrx", null);
__decorate([
    (0, common_1.Post)('shifts/:id/close'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('pos.operate|pos.shift.post'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(closeInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "close", null);
__decorate([
    (0, common_1.Post)('shifts/:id/post'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('pos.shift.post'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "post", null);
exports.PosController = PosController = __decorate([
    (0, common_1.Controller)('pos'),
    __metadata("design:paramtypes", [pos_service_js_1.PosService])
], PosController);
//# sourceMappingURL=pos.controller.js.map