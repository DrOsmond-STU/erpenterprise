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
exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const adjustments_service_js_1 = require("./adjustments.service.js");
const inventory_service_js_1 = require("./inventory.service.js");
const stock_transfers_service_js_1 = require("./stock-transfers.service.js");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const reason = zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const text = (max) => zod_1.z.string().trim().max(max);
const code = zod_1.z.string().trim().min(1, 'Wajib diisi').max(40);
const qty = zod_1.z.number().finite().max(1e9);
const adjustmentInput = zod_1.z.object({
    warehouse: code, date: date.optional(), reason: zod_1.z.enum(['opname', 'rusak', 'hilang', 'koreksi']), notes: text(300).optional(),
    lines: zod_1.z.array(zod_1.z.object({ sku: code, countedQty: qty.min(0, 'Jumlah hitung tidak boleh negatif'), note: text(200).optional() })).min(1, 'Minimal satu barang').max(500),
});
const transferInput = zod_1.z.object({
    fromWarehouse: code, toWarehouse: code, date: date.optional(), notes: text(300).optional(),
    lines: zod_1.z.array(zod_1.z.object({ sku: code, qty: qty.positive('Jumlah harus lebih dari nol') })).min(1, 'Minimal satu barang').max(500),
});
const noteInput = zod_1.z.object({ note: text(300).optional() });
const rejectInput = zod_1.z.object({ note: reason });
const reasonOnly = zod_1.z.object({ reason });
const receiveInput = zod_1.z.object({ date: date.optional() });
const warehouseInput = zod_1.z.object({
    code: zod_1.z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/, 'Kode gudang 2–30 huruf/angka/tanda hubung'), name: zod_1.z.string().trim().min(3, 'Nama minimal 3 karakter').max(80),
    branch: zod_1.z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Pilih cabang'),
});
const warehousePatch = zod_1.z.object({ name: zod_1.z.string().trim().min(3).max(80).optional(), status: zod_1.z.enum(['aktif', 'nonaktif']).optional() });
const READ = 'inventory.read';
let InventoryController = class InventoryController {
    inv;
    adj;
    trf;
    constructor(inv, adj, trf) {
        this.inv = inv;
        this.adj = adj;
        this.trf = trf;
    }
    warehouses(all, u, s, r) { return this.inv.warehouses(u, s, all === '1', r.requestId); }
    createWarehouse(b, u, s, r) {
        return this.inv.createWarehouse(u, s, b, r.requestId);
    }
    updateWarehouse(code, b, u, s, r) {
        return this.inv.updateWarehouse(u, s, code, b, r.requestId);
    }
    stock(u, s, r) { return this.inv.stock(u, s, r.requestId); }
    card(sku, warehouse, u, s, r) {
        return this.inv.card(u, s, String(sku ?? ''), String(warehouse ?? ''), r.requestId);
    }
    /* --- Penyesuaian / opname --- */
    listAdjustments(u, s, r) { return this.adj.list(u, s, r.requestId); }
    getAdjustment(id, u, s, r) { return this.adj.get(u, s, id, r.requestId); }
    createAdjustment(b, u, s, r) {
        return this.adj.create(u, s, b, r.requestId);
    }
    approveAdjustment(id, b, u, s, r) {
        return this.adj.approve(u, s, id, b.note, r.requestId);
    }
    rejectAdjustment(id, b, u, s, r) {
        return this.adj.reject(u, s, id, b.note, r.requestId);
    }
    cancelAdjustment(id, b, u, s, r) {
        return this.adj.cancel(u, s, id, b.reason, r.requestId);
    }
    /* --- Transfer stok --- */
    listTransfers(u, s, r) { return this.trf.list(u, s, r.requestId); }
    getTransfer(id, u, s, r) { return this.trf.get(u, s, id, r.requestId); }
    createTransfer(b, u, s, r) {
        return this.trf.create(u, s, b, r.requestId);
    }
    ship(id, u, s, r) { return this.trf.ship(u, s, id, r.requestId); }
    receive(id, b, u, s, r) {
        return this.trf.receive(u, s, id, b.date, r.requestId);
    }
    cancelTransfer(id, b, u, s, r) {
        return this.trf.cancel(u, s, id, b.reason, r.requestId);
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.Get)('warehouses'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, common_1.Query)('all')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "warehouses", null);
__decorate([
    (0, common_1.Post)('warehouses'),
    (0, context_js_1.RequirePermission)('inventory.warehouse.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(warehouseInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "createWarehouse", null);
__decorate([
    (0, common_1.Patch)('warehouses/:code'),
    (0, context_js_1.RequirePermission)('inventory.warehouse.manage'),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(warehousePatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "updateWarehouse", null);
__decorate([
    (0, common_1.Get)('stock'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "stock", null);
__decorate([
    (0, common_1.Get)('card'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, common_1.Query)('sku')),
    __param(1, (0, common_1.Query)('warehouse')),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "card", null);
__decorate([
    (0, common_1.Get)('adjustments'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "listAdjustments", null);
__decorate([
    (0, common_1.Get)('adjustments/:id'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "getAdjustment", null);
__decorate([
    (0, common_1.Post)('adjustments'),
    (0, context_js_1.RequirePermission)('inventory.adjust'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(adjustmentInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "createAdjustment", null);
__decorate([
    (0, common_1.Post)('adjustments/:id/approve'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('inventory.adjust.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(noteInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "approveAdjustment", null);
__decorate([
    (0, common_1.Post)('adjustments/:id/reject'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('inventory.adjust.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(rejectInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "rejectAdjustment", null);
__decorate([
    (0, common_1.Post)('adjustments/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('inventory.adjust|inventory.adjust.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "cancelAdjustment", null);
__decorate([
    (0, common_1.Get)('transfers'),
    (0, context_js_1.RequirePermission)(READ),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "listTransfers", null);
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
], InventoryController.prototype, "getTransfer", null);
__decorate([
    (0, common_1.Post)('transfers'),
    (0, context_js_1.RequirePermission)('inventory.transfer'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(transferInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "createTransfer", null);
__decorate([
    (0, common_1.Post)('transfers/:id/ship'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('inventory.transfer'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "ship", null);
__decorate([
    (0, common_1.Post)('transfers/:id/receive'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('inventory.transfer'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(receiveInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "receive", null);
__decorate([
    (0, common_1.Post)('transfers/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('inventory.transfer'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "cancelTransfer", null);
exports.InventoryController = InventoryController = __decorate([
    (0, common_1.Controller)('inventory'),
    __metadata("design:paramtypes", [inventory_service_js_1.InventoryService, adjustments_service_js_1.StockAdjustmentsService, stock_transfers_service_js_1.StockTransfersService])
], InventoryController);
//# sourceMappingURL=inventory.controller.js.map