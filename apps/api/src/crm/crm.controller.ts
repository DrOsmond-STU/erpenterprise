import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { OPP_STAGES } from '@erp/domain';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { CrmService } from './crm.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const opt = <T extends z.ZodTypeAny>(t: T) => t.optional();
const text = (max: number) => z.string().trim().max(max);
const branch = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf'));
const money = z.number().int('Nilai rupiah bulat').min(0).max(1e14);
const reason = z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const stage = z.enum(OPP_STAGES);

const oppBase = {
  branch: opt(branch), name: opt(z.string().trim().min(3, 'Nama peluang minimal 3 karakter').max(200)), customerId: opt(z.string().uuid().nullable()), companyName: opt(text(200)),
  contactName: opt(text(120)), contactPhone: opt(text(40)), contactEmail: opt(z.string().trim().email('Email tidak sah').max(200).or(z.literal(''))), value: opt(money),
  stage: opt(stage), probability: opt(z.number().int().min(0).max(100).nullable()), source: opt(text(40)), ownerName: opt(text(120)),
  expectedClose: opt(date.nullable()), nextAction: opt(text(300).nullable()), nextActionDate: opt(date.nullable()),
};
const oppCreate = z.object({ ...oppBase, name: oppBase.name.unwrap() });
const oppPatch = z.object(oppBase);
const stageInput = z.object({ stage, probability: opt(z.number().int().min(0).max(100).nullable()), lostReason: opt(text(300).nullable()) });
const activity = z.object({ kind: z.enum(['catatan', 'telepon', 'rapat', 'email', 'kunjungan']), note: z.string().trim().min(3, 'Catatan minimal 3 karakter').max(1000), nextAction: opt(text(300).nullable()), nextActionDate: opt(date.nullable()) });
const line = z.object({
  productId: opt(z.string().uuid().nullable()), description: opt(text(200)), kind: opt(z.enum(['barang', 'jasa'])), unit: opt(text(20)),
  qty: z.number().positive('Kuantitas harus lebih dari nol').max(1e9), price: opt(money), discPct: opt(z.number().min(0).max(100)),
});
const quoteBase = { branch: opt(branch), customerId: opt(z.string().uuid('Pilih pelanggan')), opportunityId: opt(z.string().uuid().nullable()), quoteDate: opt(date), validUntil: opt(date), terms: opt(text(500)), notes: opt(text(500)) };
const quoteCreate = z.object({ ...quoteBase, lines: z.array(line).min(1, 'Minimal satu baris').max(100) });
const quotePatch = z.object({ ...quoteBase, lines: opt(z.array(line).min(1).max(100)) });
const decision = z.object({ note: opt(text(300)) });
const rejectInput = z.object({ note: reason });
const reasonOnly = z.object({ reason });
const toOrder = z.object({ orderDate: opt(date), deliveryDate: opt(date.nullable()) });

@Controller('crm')
export class CrmController {
  constructor(private readonly svc: CrmService) {}

  @Get('opportunities') @RequirePermission('crm.read')
  opps(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.listOpps(u, s, r.requestId); }

  @Get('opportunities/:id') @RequirePermission('crm.read')
  opp(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.getOpp(u, s, id, r.requestId); }

  @Post('opportunities') @RequirePermission('crm.manage')
  createOpp(@Body(new ZodValidationPipe(oppCreate)) b: z.infer<typeof oppCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.createOpp(u, s, b as any, r.requestId); }

  @Patch('opportunities/:id') @RequirePermission('crm.manage')
  patchOpp(@Param('id') id: string, @Body(new ZodValidationPipe(oppPatch)) b: z.infer<typeof oppPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.updateOpp(u, s, id, b as any, r.requestId); }

  @Post('opportunities/:id/stage') @HttpCode(200) @RequirePermission('crm.manage')
  stage(@Param('id') id: string, @Body(new ZodValidationPipe(stageInput)) b: z.infer<typeof stageInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.moveStage(u, s, id, b, r.requestId); }

  @Post('opportunities/:id/activities') @HttpCode(200) @RequirePermission('crm.manage')
  activity(@Param('id') id: string, @Body(new ZodValidationPipe(activity)) b: z.infer<typeof activity>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.addActivity(u, s, id, b, r.requestId); }

  @Get('quotations') @RequirePermission('crm.read|sales.quote.create')
  quotes(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.listQuotes(u, s, r.requestId); }

  @Get('quotations/:id') @RequirePermission('crm.read|sales.quote.create')
  quote(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.getQuote(u, s, id, r.requestId); }

  @Post('quotations') @RequirePermission('sales.quote.create')
  createQuote(@Body(new ZodValidationPipe(quoteCreate)) b: z.infer<typeof quoteCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.createQuote(u, s, b as any, r.requestId); }

  @Patch('quotations/:id') @RequirePermission('sales.quote.create')
  patchQuote(@Param('id') id: string, @Body(new ZodValidationPipe(quotePatch)) b: z.infer<typeof quotePatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.updateQuote(u, s, id, b as any, r.requestId); }

  @Post('quotations/:id/send') @HttpCode(200) @RequirePermission('sales.quote.create')
  send(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.sendQuote(u, s, id, r.requestId); }

  @Post('quotations/:id/accept') @HttpCode(200) @RequirePermission('sales.quote.create')
  accept(@Param('id') id: string, @Body(new ZodValidationPipe(decision)) b: z.infer<typeof decision>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.decideQuote(u, s, id, true, b.note, r.requestId); }

  @Post('quotations/:id/reject') @HttpCode(200) @RequirePermission('sales.quote.create')
  reject(@Param('id') id: string, @Body(new ZodValidationPipe(rejectInput)) b: z.infer<typeof rejectInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.decideQuote(u, s, id, false, b.note, r.requestId); }

  @Post('quotations/:id/order') @HttpCode(200) @RequirePermission('sales.order.create')
  order(@Param('id') id: string, @Body(new ZodValidationPipe(toOrder)) b: z.infer<typeof toOrder>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.quoteToOrder(u, s, id, b, r.requestId); }

  @Post('quotations/:id/cancel') @HttpCode(200) @RequirePermission('sales.quote.create')
  cancel(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.svc.cancelQuote(u, s, id, b.reason, r.requestId); }
}
