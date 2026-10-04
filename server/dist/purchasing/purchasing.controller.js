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
exports.PurchasingController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const ap_invoices_service_js_1 = require("./ap-invoices.service.js");
const orders_service_js_1 = require("./orders.service.js");
const payments_service_js_1 = require("./payments.service.js");
const suppliers_service_js_1 = require("./suppliers.service.js");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const reason = zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const money = zod_1.z.number().int('Nilai rupiah bulat').min(0).max(1e13);
const opt = (t) => t.optional();
const text = (max) => zod_1.z.string().trim().max(max);
const branch = zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf'));
const accountCode = zod_1.z.string().trim().regex(/^\d-\d{4}(\.\d{2})?$/, 'Kode akun tidak sah');
const bankFields = {
    bankName: zod_1.z.string().trim().min(2, 'Nama bank wajib').max(80),
    bankAccountLast4: zod_1.z.string().trim().regex(/^\d{4}$/, '4 digit terakhir nomor rekening'),
    bankHolder: zod_1.z.string().trim().min(3, 'Nama pemilik rekening wajib').max(160),
};
const supplierBase = {
    name: zod_1.z.string().trim().min(3, 'Nama minimal 3 karakter').max(160), category: opt(text(80)),
    pic: opt(text(120)), phone: opt(text(40)), email: opt(zod_1.z.string().trim().email('Email tidak sah').max(200).or(zod_1.z.literal(''))),
    address: opt(text(400)), city: opt(text(80)), npwp: opt(zod_1.z.string().trim().regex(/^[0-9.\-\s]{15,25}$/, 'NPWP 15/16 digit').or(zod_1.z.literal(''))),
    branch: opt(zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^([A-Z]{3})?$/, 'Kode cabang 3 huruf')).nullable()),
    termsDays: opt(zod_1.z.number().int().min(0).max(365)), leadDays: opt(zod_1.z.number().int().min(0).max(365)),
    status: opt(zod_1.z.enum(['aktif', 'pantau', 'diblokir', 'nonaktif'])),
};
const supplierCreate = zod_1.z.object({ ...supplierBase, bankName: opt(bankFields.bankName), bankAccountLast4: opt(bankFields.bankAccountLast4), bankHolder: opt(bankFields.bankHolder) });
const supplierPatch = zod_1.z.object({ ...supplierBase, name: opt(supplierBase.name), reason: opt(reason) });
const bankRequest = zod_1.z.object({ ...bankFields, reason });
const decision = zod_1.z.object({ approve: zod_1.z.boolean(), note: opt(text(300)) });
const line = zod_1.z.object({
    productId: opt(zod_1.z.string().uuid().nullable()), description: opt(text(200)), kind: opt(zod_1.z.enum(['barang', 'jasa'])), unit: opt(text(20)),
    qty: zod_1.z.number().positive('Kuantitas harus lebih dari nol').max(1e9), price: opt(money), discPct: opt(zod_1.z.number().min(0).max(100)),
    expenseAccount: opt(accountCode.nullable()),
});
const orderInput = zod_1.z.object({
    branch: opt(branch), supplierId: opt(zod_1.z.string().uuid('Pilih pemasok')), orderDate: opt(date), expectedDate: opt(date.nullable()),
    notes: opt(text(500)), lines: opt(zod_1.z.array(line).min(1, 'Minimal satu baris').max(100)), submit: opt(zod_1.z.boolean()), projectId: opt(zod_1.z.string().uuid('Proyek tidak sah').nullable()),
});
const receiveInput = zod_1.z.object({
    date: opt(date), warehouse: opt(text(40)), deliveryNote: opt(text(80)),
    lines: zod_1.z.array(zod_1.z.object({ orderLineId: zod_1.z.number().int().positive(), qty: zod_1.z.number().min(0).max(1e9) })).min(1).max(100),
});
const invoiceInput = zod_1.z.object({
    branch: opt(branch), supplierId: opt(zod_1.z.string().uuid('Pilih pemasok')), orderId: opt(zod_1.z.string().uuid()), invoiceDate: opt(date), dueDate: opt(date),
    supplierInvoiceNo: opt(text(60)), supplierTotal: opt(money), notes: opt(text(500)), lines: opt(zod_1.z.array(line).min(1, 'Minimal satu baris').max(100)),
    projectId: opt(zod_1.z.string().uuid('Proyek tidak sah').nullable()), campaignId: opt(zod_1.z.string().uuid('Kampanye tidak sah').nullable()),
});
const paymentInput = zod_1.z.object({
    invoiceId: zod_1.z.string().uuid('Pilih tagihan'), amount: zod_1.z.number().int('Nilai rupiah bulat').positive('Nilai pembayaran harus lebih dari nol').max(1e13),
    bankAccount: zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Pilih rekening')),
    method: opt(zod_1.z.enum(['transfer', 'tunai', 'giro'])), date: opt(date), reference: opt(text(80)),
});
const payInput = zod_1.z.object({ date: opt(date), reference: opt(text(80)) });
const approveInput = zod_1.z.object({ note: opt(text(300)) });
const rejectInput = zod_1.z.object({ note: reason });
const reasonOnly = zod_1.z.object({ reason });
const cancelInput = zod_1.z.object({ reason, date: opt(date) });
/* Baca PO & penerimaan: bagian keuangan (purchasing.invoice.read) maupun gudang (purchasing.receipt.create). */
const READ_ORDERS = 'purchasing.invoice.read|purchasing.receipt.create';
let PurchasingController = class PurchasingController {
    suppliers;
    orders;
    invoices;
    payments;
    constructor(suppliers, orders, invoices, payments) {
        this.suppliers = suppliers;
        this.orders = orders;
        this.invoices = invoices;
        this.payments = payments;
    }
    /* --- Pemasok --- */
    listSuppliers(u, s, r) { return this.suppliers.list(u, s, r.requestId); }
    getSupplier(id, u, s, r) { return this.suppliers.get(u, s, id, r.requestId); }
    createSupplier(b, u, s, r) {
        return this.suppliers.create(u, s, b, r.requestId);
    }
    patchSupplier(id, b, u, s, r) {
        return this.suppliers.patch(u, s, id, b, r.requestId);
    }
    /** K-25: usulan rekening boleh dari bagian keuangan; persetujuan oleh pengelola pemasok lain. */
    requestBank(id, b, u, s, r) {
        return this.suppliers.requestBank(u, s, id, b, r.requestId);
    }
    decideBank(id, b, u, s, r) {
        return this.suppliers.decideBank(u, s, id, b.approve, b.note, r.requestId);
    }
    /* --- Pesanan pembelian & penerimaan barang --- */
    listOrders(u, s, r) { return this.orders.list(u, s, r.requestId); }
    getOrder(id, u, s, r) { return this.orders.get(u, s, id, r.requestId); }
    createOrder(b, u, s, r) {
        return this.orders.create(u, s, b, r.requestId);
    }
    updateOrder(id, b, u, s, r) {
        return this.orders.update(u, s, id, b, r.requestId);
    }
    submitOrder(id, u, s, r) { return this.orders.submit(u, s, id, r.requestId); }
    approveOrder(id, b, u, s, r) {
        return this.orders.decide(u, s, id, true, b.note, r.requestId);
    }
    rejectOrder(id, b, u, s, r) {
        return this.orders.decide(u, s, id, false, b.note, r.requestId);
    }
    cancelOrder(id, b, u, s, r) {
        return this.orders.cancel(u, s, id, b.reason, r.requestId);
    }
    receive(id, b, u, s, r) {
        return this.orders.receive(u, s, id, b, r.requestId);
    }
    receipts(u, s, r) { return this.orders.receipts(u, s, r.requestId); }
    /* --- Tagihan pemasok --- */
    listInvoices(u, s, r) { return this.invoices.list(u, s, r.requestId); }
    getInvoice(id, u, s, r) { return this.invoices.get(u, s, id, r.requestId); }
    createInvoice(b, u, s, r) {
        return this.invoices.create(u, s, b, r.requestId);
    }
    updateInvoice(id, b, u, s, r) {
        return this.invoices.update(u, s, id, b, r.requestId);
    }
    postInvoice(id, u, s, r) { return this.invoices.post(u, s, id, r.requestId); }
    cancelInvoice(id, b, u, s, r) {
        return this.invoices.cancel(u, s, id, b.reason, b.date, r.requestId);
    }
    /* --- Pembayaran & hutang --- */
    listPayments(u, s, r) { return this.payments.list(u, s, r.requestId); }
    getPayment(id, u, s, r) { return this.payments.get(u, s, id, r.requestId); }
    createPayment(b, u, s, r) {
        return this.payments.create(u, s, b, r.requestId);
    }
    approvePayment(id, b, u, s, r) {
        return this.payments.approve(u, s, id, b.note, r.requestId);
    }
    rejectPayment(id, b, u, s, r) {
        return this.payments.reject(u, s, id, b.note, r.requestId);
    }
    cancelPayment(id, b, u, s, r) {
        return this.payments.cancel(u, s, id, b.reason, r.requestId);
    }
    pay(id, b, u, s, r) {
        return this.payments.pay(u, s, id, b, r.requestId);
    }
    payables(u, s, r) { return this.payments.payables(u, s, r.requestId); }
};
exports.PurchasingController = PurchasingController;
__decorate([
    (0, common_1.Get)('suppliers'),
    (0, context_js_1.RequirePermission)(`${READ_ORDERS}|purchasing.rfq.manage|purchasing.order.create`),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "listSuppliers", null);
__decorate([
    (0, common_1.Get)('suppliers/:id'),
    (0, context_js_1.RequirePermission)(READ_ORDERS),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "getSupplier", null);
__decorate([
    (0, common_1.Post)('suppliers'),
    (0, context_js_1.RequirePermission)('purchasing.supplier.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(supplierCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "createSupplier", null);
__decorate([
    (0, common_1.Patch)('suppliers/:id'),
    (0, context_js_1.RequirePermission)('purchasing.supplier.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(supplierPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "patchSupplier", null);
__decorate([
    (0, common_1.Post)('suppliers/:id/bank'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.supplier.manage|purchasing.payment.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(bankRequest))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "requestBank", null);
__decorate([
    (0, common_1.Post)('suppliers/:id/bank/decision'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.supplier.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(decision))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "decideBank", null);
__decorate([
    (0, common_1.Get)('orders'),
    (0, context_js_1.RequirePermission)(READ_ORDERS),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "listOrders", null);
__decorate([
    (0, common_1.Get)('orders/:id'),
    (0, context_js_1.RequirePermission)(READ_ORDERS),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "getOrder", null);
__decorate([
    (0, common_1.Post)('orders'),
    (0, context_js_1.RequirePermission)('purchasing.order.create'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(orderInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "createOrder", null);
__decorate([
    (0, common_1.Patch)('orders/:id'),
    (0, context_js_1.RequirePermission)('purchasing.order.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(orderInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "updateOrder", null);
__decorate([
    (0, common_1.Post)('orders/:id/submit'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.order.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "submitOrder", null);
__decorate([
    (0, common_1.Post)('orders/:id/approve'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.order.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(approveInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "approveOrder", null);
__decorate([
    (0, common_1.Post)('orders/:id/reject'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.order.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(rejectInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "rejectOrder", null);
__decorate([
    (0, common_1.Post)('orders/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.order.create|purchasing.order.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "cancelOrder", null);
__decorate([
    (0, common_1.Post)('orders/:id/receive'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.receipt.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(receiveInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "receive", null);
__decorate([
    (0, common_1.Get)('receipts'),
    (0, context_js_1.RequirePermission)(READ_ORDERS),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "receipts", null);
__decorate([
    (0, common_1.Get)('invoices'),
    (0, context_js_1.RequirePermission)('purchasing.invoice.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "listInvoices", null);
__decorate([
    (0, common_1.Get)('invoices/:id'),
    (0, context_js_1.RequirePermission)('purchasing.invoice.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "getInvoice", null);
__decorate([
    (0, common_1.Post)('invoices'),
    (0, context_js_1.RequirePermission)('purchasing.invoice.create'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(invoiceInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "createInvoice", null);
__decorate([
    (0, common_1.Patch)('invoices/:id'),
    (0, context_js_1.RequirePermission)('purchasing.invoice.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(invoiceInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "updateInvoice", null);
__decorate([
    (0, common_1.Post)('invoices/:id/post'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.invoice.post'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "postInvoice", null);
__decorate([
    (0, common_1.Post)('invoices/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.invoice.create|purchasing.invoice.post'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(cancelInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "cancelInvoice", null);
__decorate([
    (0, common_1.Get)('payments'),
    (0, context_js_1.RequirePermission)('purchasing.invoice.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "listPayments", null);
__decorate([
    (0, common_1.Get)('payments/:id'),
    (0, context_js_1.RequirePermission)('purchasing.invoice.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "getPayment", null);
__decorate([
    (0, common_1.Post)('payments'),
    (0, context_js_1.RequirePermission)('purchasing.payment.create'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(paymentInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "createPayment", null);
__decorate([
    (0, common_1.Post)('payments/:id/approve'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.payment.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(approveInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "approvePayment", null);
__decorate([
    (0, common_1.Post)('payments/:id/reject'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.payment.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(rejectInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "rejectPayment", null);
__decorate([
    (0, common_1.Post)('payments/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.payment.create|purchasing.payment.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "cancelPayment", null);
__decorate([
    (0, common_1.Post)('payments/:id/pay'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('purchasing.payment.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(payInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "pay", null);
__decorate([
    (0, common_1.Get)('payables'),
    (0, context_js_1.RequirePermission)('purchasing.invoice.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PurchasingController.prototype, "payables", null);
exports.PurchasingController = PurchasingController = __decorate([
    (0, common_1.Controller)('purchasing'),
    __metadata("design:paramtypes", [suppliers_service_js_1.SuppliersService, orders_service_js_1.PurchaseOrdersService, ap_invoices_service_js_1.ApInvoicesService, payments_service_js_1.SupplierPaymentsService])
], PurchasingController);
//# sourceMappingURL=purchasing.controller.js.map