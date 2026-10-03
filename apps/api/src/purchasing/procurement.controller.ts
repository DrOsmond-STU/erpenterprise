import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ProcurementService } from './procurement.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const reason = z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const opt = <T extends z.ZodTypeAny>(t: T) => t.optional();
const text = (max: number) => z.string().trim().max(max);
const branch = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf'));
const money = z.number().int('Nilai rupiah bulat').min(0).max(1e13);
const line = z.object({
  productId: opt(z.string().uuid().nullable()), description: opt(text(200)), kind: opt(z.enum(['barang', 'jasa'])), unit: opt(text(20)),
  qty: z.number().positive('Kuantitas harus lebih dari nol').max(1e9), price: opt(money),
  expenseAccount: opt(z.string().trim().regex(/^\d-\d{4}(\.\d{2})?$/, 'Kode akun tidak sah').nullable()),
});
const prBase = {
  branch: opt(branch), requestDate: opt(date), neededDate: opt(date.nullable()), department: opt(z.string().trim().min(2, 'Departemen minimal 2 karakter').max(80)),
  requesterName: opt(text(120)), description: opt(z.string().trim().min(5, 'Deskripsi minimal 5 karakter').max(300)), priority: opt(z.enum(['rendah', 'sedang', 'tinggi'])),
  notes: opt(text(500)), submit: opt(z.boolean()),
};
const prCreate = z.object({ ...prBase, department: prBase.department.unwrap(), description: prBase.description.unwrap(), lines: z.array(line).min(1, 'Minimal satu baris').max(100) });
const prPatch = z.object({ ...prBase, lines: opt(z.array(line).min(1, 'Minimal satu baris').max(100)) });
const price = z.object({ lineNo: z.number().int().positive(), price: money, discPct: opt(z.number().min(0).max(100)) });
const toOrder = z.object({ supplierId: z.string().uuid('Pilih pemasok'), orderDate: opt(date), prices: opt(z.array(price).max(100)), submit: opt(z.boolean()) });
const rfqCreate = z.object({
  requisitionId: z.string().uuid('Pilih permintaan pembelian'), title: opt(text(200)), date: opt(date), deadline: date,
  supplierIds: z.array(z.string().uuid('Pemasok tidak sah')).min(2, 'Undang minimal 2 pemasok').max(20),
});
const invite = z.object({ supplierId: z.string().uuid('Pilih pemasok') });
const quote = z.object({
  supplierId: z.string().uuid('Pilih pemasok'), declined: opt(z.boolean()), quoteRef: opt(text(60)), quoteDate: opt(date), leadDays: opt(z.number().int().min(0).max(365)),
  validUntil: opt(date.nullable()), notes: opt(text(300)), prices: opt(z.array(price).max(100)),
});
const award = z.object({ quoteId: z.string().uuid('Pilih penawaran'), reason: opt(text(300)), orderDate: opt(date), submit: opt(z.boolean()) });
const decision = z.object({ note: opt(text(300)) });
const rejectInput = z.object({ note: reason });
const reasonOnly = z.object({ reason });

/* Siapa pun yang terlibat dalam pengadaan dapat membaca PR & RFQ di cabangnya. */
const READ = 'purchasing.requisition.create|purchasing.requisition.approve|purchasing.rfq.manage|purchasing.order.create';

@Controller('purchasing')
export class ProcurementController {
  constructor(private readonly svc: ProcurementService) {}

  @Get('procurement/catalog') @RequirePermission(READ)
  catalog(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.catalog(u, s, r.requestId); }

  /* --- Permintaan pembelian --- */
  @Get('requisitions') @RequirePermission(READ)
  list(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.listRequisitions(u, s, r.requestId); }

  @Get('requisitions/:id') @RequirePermission(READ)
  get(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.getRequisition(u, s, id, r.requestId); }

  @Post('requisitions') @RequirePermission('purchasing.requisition.create')
  create(@Body(new ZodValidationPipe(prCreate)) b: z.infer<typeof prCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.svc.createRequisition(u, s, b as any, r.requestId);
  }

  @Patch('requisitions/:id') @RequirePermission('purchasing.requisition.create')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(prPatch)) b: z.infer<typeof prPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.svc.updateRequisition(u, s, id, b as any, r.requestId);
  }

  @Post('requisitions/:id/submit') @HttpCode(200) @RequirePermission('purchasing.requisition.create')
  submit(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.submitRequisition(u, s, id, r.requestId); }

  @Post('requisitions/:id/approve') @HttpCode(200) @RequirePermission('purchasing.requisition.approve')
  approve(@Param('id') id: string, @Body(new ZodValidationPipe(decision)) b: z.infer<typeof decision>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.svc.decideRequisition(u, s, id, true, b.note, r.requestId);
  }

  @Post('requisitions/:id/reject') @HttpCode(200) @RequirePermission('purchasing.requisition.approve')
  reject(@Param('id') id: string, @Body(new ZodValidationPipe(rejectInput)) b: z.infer<typeof rejectInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.svc.decideRequisition(u, s, id, false, b.note, r.requestId);
  }

  @Post('requisitions/:id/cancel') @HttpCode(200) @RequirePermission('purchasing.requisition.create|purchasing.requisition.approve')
  cancel(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.svc.cancelRequisition(u, s, id, b.reason, r.requestId);
  }

  @Post('requisitions/:id/order') @HttpCode(200) @RequirePermission('purchasing.order.create')
  order(@Param('id') id: string, @Body(new ZodValidationPipe(toOrder)) b: z.infer<typeof toOrder>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.svc.requisitionToOrder(u, s, id, b as any, r.requestId);
  }

  /* --- RFQ & penawaran pemasok --- */
  @Get('rfqs') @RequirePermission(READ)
  rfqs(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.listRfqs(u, s, r.requestId); }

  @Get('rfqs/:id') @RequirePermission(READ)
  rfq(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.getRfq(u, s, id, r.requestId); }

  @Post('rfqs') @RequirePermission('purchasing.rfq.manage')
  createRfq(@Body(new ZodValidationPipe(rfqCreate)) b: z.infer<typeof rfqCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.svc.createRfq(u, s, b, r.requestId);
  }

  @Post('rfqs/:id/invite') @HttpCode(200) @RequirePermission('purchasing.rfq.manage')
  invite(@Param('id') id: string, @Body(new ZodValidationPipe(invite)) b: z.infer<typeof invite>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.svc.invite(u, s, id, b.supplierId, r.requestId);
  }

  @Post('rfqs/:id/quotes') @HttpCode(200) @RequirePermission('purchasing.rfq.manage')
  quote(@Param('id') id: string, @Body(new ZodValidationPipe(quote)) b: z.infer<typeof quote>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.svc.recordQuote(u, s, id, b as any, r.requestId);
  }

  @Post('rfqs/:id/award') @HttpCode(200) @RequirePermission('purchasing.rfq.manage')
  award(@Param('id') id: string, @Body(new ZodValidationPipe(award)) b: z.infer<typeof award>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.svc.award(u, s, id, b, r.requestId);
  }

  @Post('rfqs/:id/cancel') @HttpCode(200) @RequirePermission('purchasing.rfq.manage')
  cancelRfq(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.svc.cancelRfq(u, s, id, b.reason, r.requestId);
  }
}
