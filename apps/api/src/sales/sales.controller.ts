import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { CustomersService } from './customers.service.js';
import { InvoicesService } from './invoices.service.js';
import { OrdersService } from './orders.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const reason = z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const money = z.number().int('Nilai rupiah bulat').min(0).max(1e13);
const opt = <T extends z.ZodTypeAny>(t: T) => t.optional();
const text = (max: number) => z.string().trim().max(max);

const customerBase = {
  name: z.string().trim().min(3, 'Nama minimal 3 karakter').max(160),
  segment: opt(z.enum(['Langsung', 'Distributor', 'Kontrak', 'Ritel'])),
  pic: opt(text(120)), phone: opt(text(40)), email: opt(z.string().trim().email('Email tidak sah').max(200).or(z.literal(''))),
  address: opt(text(400)), city: opt(text(80)), npwp: opt(z.string().trim().regex(/^[0-9.\-\s]{15,25}$/, 'NPWP 15/16 digit').or(z.literal(''))),
  branch: opt(z.string().trim().toUpperCase().pipe(z.string().regex(/^([A-Z]{3})?$/, 'Kode cabang 3 huruf')).nullable()),
  creditLimit: opt(money), termsDays: opt(z.number().int().min(0).max(365)),
  status: opt(z.enum(['aktif', 'ditahan', 'nonaktif'])),
};
const customerCreate = z.object(customerBase);
const customerPatch = z.object({ ...customerBase, name: opt(customerBase.name), reason: opt(reason) });
const productCreate = z.object({
  sku: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9-]{3,30}$/, 'SKU 3–30 karakter huruf besar, angka, tanda hubung')),
  name: z.string().trim().min(3).max(160), kind: z.enum(['barang', 'jasa']), unit: z.string().trim().min(1).max(20), price: money,
});
const productPatch = z.object({ name: opt(z.string().trim().min(3).max(160)), kind: opt(z.enum(['barang', 'jasa'])), unit: opt(z.string().trim().min(1).max(20)), price: opt(money), status: opt(z.enum(['aktif', 'nonaktif'])), reason: opt(reason) });
const line = z.object({
  productId: opt(z.string().uuid().nullable()), description: opt(text(200)), kind: opt(z.enum(['barang', 'jasa'])), unit: opt(text(20)),
  qty: z.number().positive('Kuantitas harus lebih dari nol').max(1e9), price: opt(money), discPct: opt(z.number().min(0).max(100)),
});
const branch = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf'));
const orderInput = z.object({
  branch: opt(branch), customerId: opt(z.string().uuid('Pilih pelanggan')), orderDate: opt(date), deliveryDate: opt(date.nullable()),
  channel: opt(text(40)), notes: opt(text(500)), lines: opt(z.array(line).min(1, 'Minimal satu baris').max(100)), submit: opt(z.boolean()),
});
const invoiceInput = z.object({
  branch: opt(branch), customerId: opt(z.string().uuid('Pilih pelanggan')), invoiceDate: opt(date), dueDate: opt(date),
  notes: opt(text(500)), lines: opt(z.array(line).min(1, 'Minimal satu baris').max(100)),
});
const receiptInput = z.object({
  date: opt(date), amount: z.number().int('Nilai rupiah bulat').positive('Nilai penerimaan harus lebih dari nol').max(1e13),
  bankAccount: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Pilih rekening')),
  method: opt(z.enum(['transfer', 'tunai', 'giro'])), reference: opt(text(80)),
});
const reasonOnly = z.object({ reason });
const approveInput = z.object({ note: opt(text(300)) });
const cancelInput = z.object({ reason, date: opt(date) });
const toInvoiceInput = z.object({ invoiceDate: opt(date) });

@Controller('sales')
export class SalesController {
  constructor(private readonly customers: CustomersService, private readonly orders: OrdersService, private readonly invoices: InvoicesService) {}

  /* --- Pelanggan & produk --- */
  @Get('customers') @RequirePermission('sales.invoice.read')
  listCustomers(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.customers.list(u, s, r.requestId); }

  @Get('customers/:id') @RequirePermission('sales.invoice.read')
  getCustomer(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.customers.get(u, s, id, r.requestId); }

  @Post('customers') @RequirePermission('sales.customer.manage')
  createCustomer(@Body(new ZodValidationPipe(customerCreate)) b: z.infer<typeof customerCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.customers.create(u, s, b as any, r.requestId);
  }

  @Patch('customers/:id') @RequirePermission('sales.customer.manage')
  patchCustomer(@Param('id') id: string, @Body(new ZodValidationPipe(customerPatch)) b: z.infer<typeof customerPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.customers.patch(u, s, id, b as any, r.requestId);
  }

  @Get('products') @RequirePermission('sales.invoice.read')
  products(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.customers.products(u, s, r.requestId); }

  @Post('products') @RequirePermission('sales.customer.manage')
  createProduct(@Body(new ZodValidationPipe(productCreate)) b: z.infer<typeof productCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.customers.createProduct(u, s, b, r.requestId);
  }

  @Patch('products/:sku') @RequirePermission('sales.customer.manage')
  patchProduct(@Param('sku') sku: string, @Body(new ZodValidationPipe(productPatch)) b: z.infer<typeof productPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.customers.patchProduct(u, s, sku.toUpperCase().slice(0, 30), b, r.requestId);
  }

  @Delete('products/:sku') @RequirePermission('sales.customer.manage')
  deleteProduct(@Param('sku') sku: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.customers.deleteProduct(u, s, sku.toUpperCase().slice(0, 30), b.reason, r.requestId);
  }

  /* --- Pesanan penjualan --- */
  @Get('orders') @RequirePermission('sales.invoice.read')
  listOrders(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.orders.list(u, s, r.requestId); }

  @Get('orders/:id') @RequirePermission('sales.invoice.read')
  getOrder(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.orders.get(u, s, id, r.requestId); }

  @Post('orders') @RequirePermission('sales.order.create')
  createOrder(@Body(new ZodValidationPipe(orderInput)) b: z.infer<typeof orderInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.orders.create(u, s, b as any, r.requestId);
  }

  @Patch('orders/:id') @RequirePermission('sales.order.create')
  updateOrder(@Param('id') id: string, @Body(new ZodValidationPipe(orderInput)) b: z.infer<typeof orderInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.orders.update(u, s, id, b as any, r.requestId);
  }

  @Post('orders/:id/submit') @RequirePermission('sales.order.create') @HttpCode(200)
  submitOrder(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.orders.submit(u, s, id, r.requestId); }

  @Post('orders/:id/approve') @RequirePermission('sales.order.approve') @HttpCode(200)
  approveOrder(@Param('id') id: string, @Body(new ZodValidationPipe(approveInput)) b: z.infer<typeof approveInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.orders.approve(u, s, id, b.note, r.requestId);
  }

  @Post('orders/:id/reject') @RequirePermission('sales.order.approve') @HttpCode(200)
  rejectOrder(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.orders.reject(u, s, id, b.reason, r.requestId);
  }

  /** Pembuat pesanan atau penyetuju — diperiksa di layanan. */
  @Post('orders/:id/cancel') @RequirePermission('sales.invoice.read') @HttpCode(200)
  cancelOrder(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.orders.cancel(u, s, id, b.reason, r.requestId);
  }

  @Post('orders/:id/invoice') @RequirePermission('sales.invoice.create') @HttpCode(200)
  orderToInvoice(@Param('id') id: string, @Body(new ZodValidationPipe(toInvoiceInput)) b: z.infer<typeof toInvoiceInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.orders.toInvoice(u, s, id, b.invoiceDate, r.requestId);
  }

  /* --- Faktur & piutang --- */
  @Get('invoices') @RequirePermission('sales.invoice.read')
  listInvoices(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.invoices.list(u, s, r.requestId); }

  @Get('invoices/:id') @RequirePermission('sales.invoice.read')
  getInvoice(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.invoices.get(u, s, id, r.requestId); }

  @Post('invoices') @RequirePermission('sales.invoice.create')
  createInvoice(@Body(new ZodValidationPipe(invoiceInput)) b: z.infer<typeof invoiceInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.invoices.create(u, s, b as any, r.requestId);
  }

  @Patch('invoices/:id') @RequirePermission('sales.invoice.create')
  updateInvoice(@Param('id') id: string, @Body(new ZodValidationPipe(invoiceInput)) b: z.infer<typeof invoiceInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.invoices.update(u, s, id, b as any, r.requestId);
  }

  @Post('invoices/:id/issue') @RequirePermission('sales.invoice.issue') @HttpCode(200)
  issue(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.invoices.issue(u, s, id, r.requestId); }

  @Post('invoices/:id/receipts') @RequirePermission('sales.receipt.create') @HttpCode(200)
  receive(@Param('id') id: string, @Body(new ZodValidationPipe(receiptInput)) b: z.infer<typeof receiptInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.invoices.receive(u, s, id, b, r.requestId);
  }

  /** Draf: pembuatnya; terbit: sales.invoice.cancel — diperiksa di layanan. */
  @Post('invoices/:id/cancel') @RequirePermission('sales.invoice.read') @HttpCode(200)
  cancelInvoice(@Param('id') id: string, @Body(new ZodValidationPipe(cancelInput)) b: z.infer<typeof cancelInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.invoices.cancel(u, s, id, b.reason, b.date, r.requestId);
  }

  @Get('receivables') @RequirePermission('sales.invoice.read')
  receivables(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.invoices.receivables(u, s, r.requestId); }
}
