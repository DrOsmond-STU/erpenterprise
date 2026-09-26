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
exports.SalesController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const customers_service_js_1 = require("./customers.service.js");
const invoices_service_js_1 = require("./invoices.service.js");
const orders_service_js_1 = require("./orders.service.js");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const reason = zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const money = zod_1.z.number().int('Nilai rupiah bulat').min(0).max(1e13);
const opt = (t) => t.optional();
const text = (max) => zod_1.z.string().trim().max(max);
const customerBase = {
    name: zod_1.z.string().trim().min(3, 'Nama minimal 3 karakter').max(160),
    segment: opt(zod_1.z.enum(['Langsung', 'Distributor', 'Kontrak', 'Ritel'])),
    pic: opt(text(120)), phone: opt(text(40)), email: opt(zod_1.z.string().trim().email('Email tidak sah').max(200).or(zod_1.z.literal(''))),
    address: opt(text(400)), city: opt(text(80)), npwp: opt(zod_1.z.string().trim().regex(/^[0-9.\-\s]{15,25}$/, 'NPWP 15/16 digit').or(zod_1.z.literal(''))),
    branch: opt(zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^([A-Z]{3})?$/, 'Kode cabang 3 huruf')).nullable()),
    creditLimit: opt(money), termsDays: opt(zod_1.z.number().int().min(0).max(365)),
    status: opt(zod_1.z.enum(['aktif', 'ditahan', 'nonaktif'])),
};
const customerCreate = zod_1.z.object(customerBase);
const customerPatch = zod_1.z.object({ ...customerBase, name: opt(customerBase.name), reason: opt(reason) });
const productCreate = zod_1.z.object({
    sku: zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z0-9-]{3,30}$/, 'SKU 3–30 karakter huruf besar, angka, tanda hubung')),
    name: zod_1.z.string().trim().min(3).max(160), kind: zod_1.z.enum(['barang', 'jasa']), unit: zod_1.z.string().trim().min(1).max(20), price: money,
});
const productPatch = zod_1.z.object({ name: opt(zod_1.z.string().trim().min(3).max(160)), kind: opt(zod_1.z.enum(['barang', 'jasa'])), unit: opt(zod_1.z.string().trim().min(1).max(20)), price: opt(money), status: opt(zod_1.z.enum(['aktif', 'nonaktif'])), reason: opt(reason) });
const line = zod_1.z.object({
    productId: opt(zod_1.z.string().uuid().nullable()), description: opt(text(200)), kind: opt(zod_1.z.enum(['barang', 'jasa'])), unit: opt(text(20)),
    qty: zod_1.z.number().positive('Kuantitas harus lebih dari nol').max(1e9), price: opt(money), discPct: opt(zod_1.z.number().min(0).max(100)),
});
const branch = zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf'));
const orderInput = zod_1.z.object({
    branch: opt(branch), customerId: opt(zod_1.z.string().uuid('Pilih pelanggan')), orderDate: opt(date), deliveryDate: opt(date.nullable()),
    channel: opt(text(40)), notes: opt(text(500)), lines: opt(zod_1.z.array(line).min(1, 'Minimal satu baris').max(100)), submit: opt(zod_1.z.boolean()),
});
const invoiceInput = zod_1.z.object({
    branch: opt(branch), customerId: opt(zod_1.z.string().uuid('Pilih pelanggan')), invoiceDate: opt(date), dueDate: opt(date),
    notes: opt(text(500)), lines: opt(zod_1.z.array(line).min(1, 'Minimal satu baris').max(100)),
});
const receiptInput = zod_1.z.object({
    date: opt(date), amount: zod_1.z.number().int('Nilai rupiah bulat').positive('Nilai penerimaan harus lebih dari nol').max(1e13),
    bankAccount: zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Pilih rekening')),
    method: opt(zod_1.z.enum(['transfer', 'tunai', 'giro'])), reference: opt(text(80)),
});
const reasonOnly = zod_1.z.object({ reason });
const approveInput = zod_1.z.object({ note: opt(text(300)) });
const cancelInput = zod_1.z.object({ reason, date: opt(date) });
const toInvoiceInput = zod_1.z.object({ invoiceDate: opt(date) });
let SalesController = class SalesController {
    customers;
    orders;
    invoices;
    constructor(customers, orders, invoices) {
        this.customers = customers;
        this.orders = orders;
        this.invoices = invoices;
    }
    /* --- Pelanggan & produk --- */
    listCustomers(u, s, r) { return this.customers.list(u, s, r.requestId); }
    getCustomer(id, u, s, r) { return this.customers.get(u, s, id, r.requestId); }
    createCustomer(b, u, s, r) {
        return this.customers.create(u, s, b, r.requestId);
    }
    patchCustomer(id, b, u, s, r) {
        return this.customers.patch(u, s, id, b, r.requestId);
    }
    products(u, s, r) { return this.customers.products(u, s, r.requestId); }
    createProduct(b, u, s, r) {
        return this.customers.createProduct(u, s, b, r.requestId);
    }
    patchProduct(sku, b, u, s, r) {
        return this.customers.patchProduct(u, s, sku.toUpperCase().slice(0, 30), b, r.requestId);
    }
    deleteProduct(sku, b, u, s, r) {
        return this.customers.deleteProduct(u, s, sku.toUpperCase().slice(0, 30), b.reason, r.requestId);
    }
    /* --- Pesanan penjualan --- */
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
        return this.orders.approve(u, s, id, b.note, r.requestId);
    }
    rejectOrder(id, b, u, s, r) {
        return this.orders.reject(u, s, id, b.reason, r.requestId);
    }
    /** Pembuat pesanan atau penyetuju — diperiksa di layanan. */
    cancelOrder(id, b, u, s, r) {
        return this.orders.cancel(u, s, id, b.reason, r.requestId);
    }
    orderToInvoice(id, b, u, s, r) {
        return this.orders.toInvoice(u, s, id, b.invoiceDate, r.requestId);
    }
    /* --- Faktur & piutang --- */
    listInvoices(u, s, r) { return this.invoices.list(u, s, r.requestId); }
    getInvoice(id, u, s, r) { return this.invoices.get(u, s, id, r.requestId); }
    createInvoice(b, u, s, r) {
        return this.invoices.create(u, s, b, r.requestId);
    }
    updateInvoice(id, b, u, s, r) {
        return this.invoices.update(u, s, id, b, r.requestId);
    }
    issue(id, u, s, r) { return this.invoices.issue(u, s, id, r.requestId); }
    receive(id, b, u, s, r) {
        return this.invoices.receive(u, s, id, b, r.requestId);
    }
    /** Draf: pembuatnya; terbit: sales.invoice.cancel — diperiksa di layanan. */
    cancelInvoice(id, b, u, s, r) {
        return this.invoices.cancel(u, s, id, b.reason, b.date, r.requestId);
    }
    receivables(u, s, r) { return this.invoices.receivables(u, s, r.requestId); }
};
exports.SalesController = SalesController;
__decorate([
    (0, common_1.Get)('customers'),
    (0, context_js_1.RequirePermission)('sales.invoice.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "listCustomers", null);
__decorate([
    (0, common_1.Get)('customers/:id'),
    (0, context_js_1.RequirePermission)('sales.invoice.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "getCustomer", null);
__decorate([
    (0, common_1.Post)('customers'),
    (0, context_js_1.RequirePermission)('sales.customer.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(customerCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "createCustomer", null);
__decorate([
    (0, common_1.Patch)('customers/:id'),
    (0, context_js_1.RequirePermission)('sales.customer.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(customerPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "patchCustomer", null);
__decorate([
    (0, common_1.Get)('products'),
    (0, context_js_1.RequirePermission)('sales.invoice.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "products", null);
__decorate([
    (0, common_1.Post)('products'),
    (0, context_js_1.RequirePermission)('sales.customer.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(productCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "createProduct", null);
__decorate([
    (0, common_1.Patch)('products/:sku'),
    (0, context_js_1.RequirePermission)('sales.customer.manage'),
    __param(0, (0, common_1.Param)('sku')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(productPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "patchProduct", null);
__decorate([
    (0, common_1.Delete)('products/:sku'),
    (0, context_js_1.RequirePermission)('sales.customer.manage'),
    __param(0, (0, common_1.Param)('sku')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "deleteProduct", null);
__decorate([
    (0, common_1.Get)('orders'),
    (0, context_js_1.RequirePermission)('sales.invoice.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "listOrders", null);
__decorate([
    (0, common_1.Get)('orders/:id'),
    (0, context_js_1.RequirePermission)('sales.invoice.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "getOrder", null);
__decorate([
    (0, common_1.Post)('orders'),
    (0, context_js_1.RequirePermission)('sales.order.create'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(orderInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "createOrder", null);
__decorate([
    (0, common_1.Patch)('orders/:id'),
    (0, context_js_1.RequirePermission)('sales.order.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(orderInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "updateOrder", null);
__decorate([
    (0, common_1.Post)('orders/:id/submit'),
    (0, context_js_1.RequirePermission)('sales.order.create'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "submitOrder", null);
__decorate([
    (0, common_1.Post)('orders/:id/approve'),
    (0, context_js_1.RequirePermission)('sales.order.approve'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(approveInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "approveOrder", null);
__decorate([
    (0, common_1.Post)('orders/:id/reject'),
    (0, context_js_1.RequirePermission)('sales.order.approve'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "rejectOrder", null);
__decorate([
    (0, common_1.Post)('orders/:id/cancel'),
    (0, context_js_1.RequirePermission)('sales.invoice.read'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "cancelOrder", null);
__decorate([
    (0, common_1.Post)('orders/:id/invoice'),
    (0, context_js_1.RequirePermission)('sales.invoice.create'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(toInvoiceInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "orderToInvoice", null);
__decorate([
    (0, common_1.Get)('invoices'),
    (0, context_js_1.RequirePermission)('sales.invoice.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "listInvoices", null);
__decorate([
    (0, common_1.Get)('invoices/:id'),
    (0, context_js_1.RequirePermission)('sales.invoice.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "getInvoice", null);
__decorate([
    (0, common_1.Post)('invoices'),
    (0, context_js_1.RequirePermission)('sales.invoice.create'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(invoiceInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "createInvoice", null);
__decorate([
    (0, common_1.Patch)('invoices/:id'),
    (0, context_js_1.RequirePermission)('sales.invoice.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(invoiceInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "updateInvoice", null);
__decorate([
    (0, common_1.Post)('invoices/:id/issue'),
    (0, context_js_1.RequirePermission)('sales.invoice.issue'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "issue", null);
__decorate([
    (0, common_1.Post)('invoices/:id/receipts'),
    (0, context_js_1.RequirePermission)('sales.receipt.create'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(receiptInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "receive", null);
__decorate([
    (0, common_1.Post)('invoices/:id/cancel'),
    (0, context_js_1.RequirePermission)('sales.invoice.read'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(cancelInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "cancelInvoice", null);
__decorate([
    (0, common_1.Get)('receivables'),
    (0, context_js_1.RequirePermission)('sales.invoice.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "receivables", null);
exports.SalesController = SalesController = __decorate([
    (0, common_1.Controller)('sales'),
    __metadata("design:paramtypes", [customers_service_js_1.CustomersService, orders_service_js_1.OrdersService, invoices_service_js_1.InvoicesService])
], SalesController);
//# sourceMappingURL=sales.controller.js.map