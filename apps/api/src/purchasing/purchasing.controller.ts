import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ApInvoicesService } from './ap-invoices.service.js';
import { PurchaseOrdersService } from './orders.service.js';
import { SupplierPaymentsService } from './payments.service.js';
import { SuppliersService } from './suppliers.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const reason = z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const money = z.number().int('Nilai rupiah bulat').min(0).max(1e13);
const opt = <T extends z.ZodTypeAny>(t: T) => t.optional();
const text = (max: number) => z.string().trim().max(max);
const branch = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf'));
const accountCode = z.string().trim().regex(/^\d-\d{4}(\.\d{2})?$/, 'Kode akun tidak sah');
const bankFields = {
  bankName: z.string().trim().min(2, 'Nama bank wajib').max(80),
  bankAccountLast4: z.string().trim().regex(/^\d{4}$/, '4 digit terakhir nomor rekening'),
  bankHolder: z.string().trim().min(3, 'Nama pemilik rekening wajib').max(160),
};

const supplierBase = {
  name: z.string().trim().min(3, 'Nama minimal 3 karakter').max(160), category: opt(text(80)),
  pic: opt(text(120)), phone: opt(text(40)), email: opt(z.string().trim().email('Email tidak sah').max(200).or(z.literal(''))),
  address: opt(text(400)), city: opt(text(80)), npwp: opt(z.string().trim().regex(/^[0-9.\-\s]{15,25}$/, 'NPWP 15/16 digit').or(z.literal(''))),
  branch: opt(z.string().trim().toUpperCase().pipe(z.string().regex(/^([A-Z]{3})?$/, 'Kode cabang 3 huruf')).nullable()),
  termsDays: opt(z.number().int().min(0).max(365)), leadDays: opt(z.number().int().min(0).max(365)),
  status: opt(z.enum(['aktif', 'pantau', 'diblokir', 'nonaktif'])),
};
const supplierCreate = z.object({ ...supplierBase, bankName: opt(bankFields.bankName), bankAccountLast4: opt(bankFields.bankAccountLast4), bankHolder: opt(bankFields.bankHolder) });
const supplierPatch = z.object({ ...supplierBase, name: opt(supplierBase.name), reason: opt(reason) });
const bankRequest = z.object({ ...bankFields, reason });
const decision = z.object({ approve: z.boolean(), note: opt(text(300)) });

const line = z.object({
  productId: opt(z.string().uuid().nullable()), description: opt(text(200)), kind: opt(z.enum(['barang', 'jasa'])), unit: opt(text(20)),
  qty: z.number().positive('Kuantitas harus lebih dari nol').max(1e9), price: opt(money), discPct: opt(z.number().min(0).max(100)),
  expenseAccount: opt(accountCode.nullable()),
});
const orderInput = z.object({
  branch: opt(branch), supplierId: opt(z.string().uuid('Pilih pemasok')), orderDate: opt(date), expectedDate: opt(date.nullable()),
  notes: opt(text(500)), lines: opt(z.array(line).min(1, 'Minimal satu baris').max(100)), submit: opt(z.boolean()),
});
const receiveInput = z.object({
  date: opt(date), warehouse: opt(text(40)), deliveryNote: opt(text(80)),
  lines: z.array(z.object({ orderLineId: z.number().int().positive(), qty: z.number().min(0).max(1e9) })).min(1).max(100),
});
const invoiceInput = z.object({
  branch: opt(branch), supplierId: opt(z.string().uuid('Pilih pemasok')), orderId: opt(z.string().uuid()), invoiceDate: opt(date), dueDate: opt(date),
  supplierInvoiceNo: opt(text(60)), supplierTotal: opt(money), notes: opt(text(500)), lines: opt(z.array(line).min(1, 'Minimal satu baris').max(100)),
});
const paymentInput = z.object({
  invoiceId: z.string().uuid('Pilih tagihan'), amount: z.number().int('Nilai rupiah bulat').positive('Nilai pembayaran harus lebih dari nol').max(1e13),
  bankAccount: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Pilih rekening')),
  method: opt(z.enum(['transfer', 'tunai', 'giro'])), date: opt(date), reference: opt(text(80)),
});
const payInput = z.object({ date: opt(date), reference: opt(text(80)) });
const approveInput = z.object({ note: opt(text(300)) });
const rejectInput = z.object({ note: reason });
const reasonOnly = z.object({ reason });
const cancelInput = z.object({ reason, date: opt(date) });

/* Baca PO & penerimaan: bagian keuangan (purchasing.invoice.read) maupun gudang (purchasing.receipt.create). */
const READ_ORDERS = 'purchasing.invoice.read|purchasing.receipt.create';

@Controller('purchasing')
export class PurchasingController {
  constructor(private readonly suppliers: SuppliersService, private readonly orders: PurchaseOrdersService, private readonly invoices: ApInvoicesService, private readonly payments: SupplierPaymentsService) {}

  /* --- Pemasok --- */
  @Get('suppliers') @RequirePermission(`${READ_ORDERS}|purchasing.rfq.manage|purchasing.order.create`)
  listSuppliers(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.suppliers.list(u, s, r.requestId); }

  @Get('suppliers/:id') @RequirePermission(READ_ORDERS)
  getSupplier(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.suppliers.get(u, s, id, r.requestId); }

  @Post('suppliers') @RequirePermission('purchasing.supplier.manage')
  createSupplier(@Body(new ZodValidationPipe(supplierCreate)) b: z.infer<typeof supplierCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.suppliers.create(u, s, b as any, r.requestId);
  }

  @Patch('suppliers/:id') @RequirePermission('purchasing.supplier.manage')
  patchSupplier(@Param('id') id: string, @Body(new ZodValidationPipe(supplierPatch)) b: z.infer<typeof supplierPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.suppliers.patch(u, s, id, b as any, r.requestId);
  }

  /** K-25: usulan rekening boleh dari bagian keuangan; persetujuan oleh pengelola pemasok lain. */
  @Post('suppliers/:id/bank') @HttpCode(200) @RequirePermission('purchasing.supplier.manage|purchasing.payment.create')
  requestBank(@Param('id') id: string, @Body(new ZodValidationPipe(bankRequest)) b: z.infer<typeof bankRequest>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.suppliers.requestBank(u, s, id, b, r.requestId);
  }

  @Post('suppliers/:id/bank/decision') @HttpCode(200) @RequirePermission('purchasing.supplier.manage')
  decideBank(@Param('id') id: string, @Body(new ZodValidationPipe(decision)) b: z.infer<typeof decision>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.suppliers.decideBank(u, s, id, b.approve, b.note, r.requestId);
  }

  /* --- Pesanan pembelian & penerimaan barang --- */
  @Get('orders') @RequirePermission(READ_ORDERS)
  listOrders(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.orders.list(u, s, r.requestId); }

  @Get('orders/:id') @RequirePermission(READ_ORDERS)
  getOrder(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.orders.get(u, s, id, r.requestId); }

  @Post('orders') @RequirePermission('purchasing.order.create')
  createOrder(@Body(new ZodValidationPipe(orderInput)) b: z.infer<typeof orderInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.orders.create(u, s, b as any, r.requestId);
  }

  @Patch('orders/:id') @RequirePermission('purchasing.order.create')
  updateOrder(@Param('id') id: string, @Body(new ZodValidationPipe(orderInput)) b: z.infer<typeof orderInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.orders.update(u, s, id, b as any, r.requestId);
  }

  @Post('orders/:id/submit') @HttpCode(200) @RequirePermission('purchasing.order.create')
  submitOrder(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.orders.submit(u, s, id, r.requestId); }

  @Post('orders/:id/approve') @HttpCode(200) @RequirePermission('purchasing.order.approve')
  approveOrder(@Param('id') id: string, @Body(new ZodValidationPipe(approveInput)) b: z.infer<typeof approveInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.orders.decide(u, s, id, true, b.note, r.requestId);
  }

  @Post('orders/:id/reject') @HttpCode(200) @RequirePermission('purchasing.order.approve')
  rejectOrder(@Param('id') id: string, @Body(new ZodValidationPipe(rejectInput)) b: z.infer<typeof rejectInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.orders.decide(u, s, id, false, b.note, r.requestId);
  }

  @Post('orders/:id/cancel') @HttpCode(200) @RequirePermission('purchasing.order.create|purchasing.order.approve')
  cancelOrder(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.orders.cancel(u, s, id, b.reason, r.requestId);
  }

  @Post('orders/:id/receive') @HttpCode(200) @RequirePermission('purchasing.receipt.create')
  receive(@Param('id') id: string, @Body(new ZodValidationPipe(receiveInput)) b: z.infer<typeof receiveInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.orders.receive(u, s, id, b, r.requestId);
  }

  @Get('receipts') @RequirePermission(READ_ORDERS)
  receipts(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.orders.receipts(u, s, r.requestId); }

  /* --- Tagihan pemasok --- */
  @Get('invoices') @RequirePermission('purchasing.invoice.read')
  listInvoices(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.invoices.list(u, s, r.requestId); }

  @Get('invoices/:id') @RequirePermission('purchasing.invoice.read')
  getInvoice(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.invoices.get(u, s, id, r.requestId); }

  @Post('invoices') @RequirePermission('purchasing.invoice.create')
  createInvoice(@Body(new ZodValidationPipe(invoiceInput)) b: z.infer<typeof invoiceInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.invoices.create(u, s, b as any, r.requestId);
  }

  @Patch('invoices/:id') @RequirePermission('purchasing.invoice.create')
  updateInvoice(@Param('id') id: string, @Body(new ZodValidationPipe(invoiceInput)) b: z.infer<typeof invoiceInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.invoices.update(u, s, id, b as any, r.requestId);
  }

  @Post('invoices/:id/post') @HttpCode(200) @RequirePermission('purchasing.invoice.post')
  postInvoice(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.invoices.post(u, s, id, r.requestId); }

  @Post('invoices/:id/cancel') @HttpCode(200) @RequirePermission('purchasing.invoice.create|purchasing.invoice.post')
  cancelInvoice(@Param('id') id: string, @Body(new ZodValidationPipe(cancelInput)) b: z.infer<typeof cancelInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.invoices.cancel(u, s, id, b.reason, b.date, r.requestId);
  }

  /* --- Pembayaran & hutang --- */
  @Get('payments') @RequirePermission('purchasing.invoice.read')
  listPayments(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.payments.list(u, s, r.requestId); }

  @Get('payments/:id') @RequirePermission('purchasing.invoice.read')
  getPayment(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.payments.get(u, s, id, r.requestId); }

  @Post('payments') @RequirePermission('purchasing.payment.create')
  createPayment(@Body(new ZodValidationPipe(paymentInput)) b: z.infer<typeof paymentInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.payments.create(u, s, b, r.requestId);
  }

  @Post('payments/:id/approve') @HttpCode(200) @RequirePermission('purchasing.payment.approve')
  approvePayment(@Param('id') id: string, @Body(new ZodValidationPipe(approveInput)) b: z.infer<typeof approveInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.payments.approve(u, s, id, b.note, r.requestId);
  }

  @Post('payments/:id/reject') @HttpCode(200) @RequirePermission('purchasing.payment.approve')
  rejectPayment(@Param('id') id: string, @Body(new ZodValidationPipe(rejectInput)) b: z.infer<typeof rejectInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.payments.reject(u, s, id, b.note, r.requestId);
  }

  @Post('payments/:id/cancel') @HttpCode(200) @RequirePermission('purchasing.payment.create|purchasing.payment.approve')
  cancelPayment(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.payments.cancel(u, s, id, b.reason, r.requestId);
  }

  @Post('payments/:id/pay') @HttpCode(200) @RequirePermission('purchasing.payment.create')
  pay(@Param('id') id: string, @Body(new ZodValidationPipe(payInput)) b: z.infer<typeof payInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.payments.pay(u, s, id, b, r.requestId);
  }

  @Get('payables') @RequirePermission('purchasing.invoice.read')
  payables(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.payments.payables(u, s, r.requestId); }
}
