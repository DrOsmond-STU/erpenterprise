import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { BankStatementsService } from './statements.service.js';
import { TaxSettlementsService } from './tax.service.js';
import { CashTransfersService } from './transfers.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const reason = z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const opt = <T extends z.ZodTypeAny>(t: T) => t.optional();
const text = (max: number) => z.string().trim().max(max);
const bankCode = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Pilih rekening'));
const money = z.number().int('Nilai rupiah bulat').positive('Nilai harus lebih dari nol').max(1e13);

const transferInput = z.object({ fromBank: bankCode, toBank: bankCode, amount: money, date: opt(date), reference: opt(text(80)), notes: opt(text(300)) });
const approveInput = z.object({ note: opt(text(300)) });
const rejectInput = z.object({ note: reason });
const reasonOnly = z.object({ reason });
const reverseInput = z.object({ reason, date: opt(date) });
const importInput = z.object({
  bankAccount: bankCode, fileName: opt(text(200)), content: z.string().min(10, 'Berkas kosong').max(1_500_000, 'Berkas terlalu besar (maks. 1,5 MB)'),
  opening: opt(z.number().int().min(-1e13).max(1e13)), closing: opt(z.number().int().min(-1e13).max(1e13)),
});
const matchInput = z.object({ journalLineId: z.number().int().positive() });
const ignoreInput = z.object({ note: reason });
const journalInput = z.object({ account: z.string().trim().regex(/^\d-\d{4}(\.\d{2})?$/, 'Kode akun tidak sah'), description: opt(text(300)) });
const periodInput = z.object({ period: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Masa pajak berformat YYYY-MM') });
const payInput = z.object({ bankAccount: bankCode, date: opt(date), ntpn: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{16}$/, 'NTPN 16 karakter huruf/angka') });

const READ = 'ledger.report.read';

@Controller('cash')
export class CashController {
  constructor(private readonly transfers: CashTransfersService, private readonly statements: BankStatementsService, private readonly tax: TaxSettlementsService) {}

  /* --- Transfer kas & bank --- */
  @Get('transfers') @RequirePermission(READ)
  listTransfers(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.transfers.list(u, s, r.requestId); }

  @Get('transfers/:id') @RequirePermission(READ)
  getTransfer(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.transfers.get(u, s, id, r.requestId); }

  @Post('transfers') @RequirePermission('cash.transfer.create')
  createTransfer(@Body(new ZodValidationPipe(transferInput)) b: z.infer<typeof transferInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.transfers.create(u, s, b, r.requestId);
  }

  @Post('transfers/:id/approve') @HttpCode(200) @RequirePermission('cash.transfer.approve')
  approveTransfer(@Param('id') id: string, @Body(new ZodValidationPipe(approveInput)) b: z.infer<typeof approveInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.transfers.approve(u, s, id, b.note, r.requestId);
  }

  @Post('transfers/:id/reject') @HttpCode(200) @RequirePermission('cash.transfer.approve')
  rejectTransfer(@Param('id') id: string, @Body(new ZodValidationPipe(rejectInput)) b: z.infer<typeof rejectInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.transfers.reject(u, s, id, b.note, r.requestId);
  }

  @Post('transfers/:id/cancel') @HttpCode(200) @RequirePermission('cash.transfer.create|cash.transfer.approve')
  cancelTransfer(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.transfers.cancel(u, s, id, b.reason, r.requestId);
  }

  @Post('transfers/:id/reverse') @HttpCode(200) @RequirePermission('cash.transfer.approve')
  reverseTransfer(@Param('id') id: string, @Body(new ZodValidationPipe(reverseInput)) b: z.infer<typeof reverseInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.transfers.reverse(u, s, id, b.reason, b.date, r.requestId);
  }

  /* --- Rekonsiliasi bank --- */
  @Get('statements') @RequirePermission(READ)
  listStatements(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.statements.list(u, s, r.requestId); }

  @Get('statements/:id') @RequirePermission(READ)
  getStatement(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.statements.get(u, s, id, r.requestId); }

  @Post('statements') @RequirePermission('cash.reconcile')
  importStatement(@Body(new ZodValidationPipe(importInput)) b: z.infer<typeof importInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.statements.import(u, s, b, r.requestId);
  }

  @Post('statements/:id/auto-match') @HttpCode(200) @RequirePermission('cash.reconcile')
  autoMatch(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.statements.autoMatchAgain(u, s, id, r.requestId); }

  @Post('statements/:id/lines/:lineId/match') @HttpCode(200) @RequirePermission('cash.reconcile')
  match(@Param('id') id: string, @Param('lineId', ParseIntPipe) lineId: number, @Body(new ZodValidationPipe(matchInput)) b: z.infer<typeof matchInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.statements.match(u, s, id, lineId, b.journalLineId, r.requestId);
  }

  @Post('statements/:id/lines/:lineId/unmatch') @HttpCode(200) @RequirePermission('cash.reconcile')
  unmatch(@Param('id') id: string, @Param('lineId', ParseIntPipe) lineId: number, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.statements.unmatch(u, s, id, lineId, r.requestId);
  }

  @Post('statements/:id/lines/:lineId/ignore') @HttpCode(200) @RequirePermission('cash.reconcile')
  ignore(@Param('id') id: string, @Param('lineId', ParseIntPipe) lineId: number, @Body(new ZodValidationPipe(ignoreInput)) b: z.infer<typeof ignoreInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.statements.ignore(u, s, id, lineId, b.note, r.requestId);
  }

  @Post('statements/:id/lines/:lineId/journal') @HttpCode(200) @RequirePermission('cash.reconcile', 'ledger.journal.create|ledger.journal.post')
  lineJournal(@Param('id') id: string, @Param('lineId', ParseIntPipe) lineId: number, @Body(new ZodValidationPipe(journalInput)) b: z.infer<typeof journalInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.statements.createJournal(u, s, id, lineId, b, r.requestId);
  }

  @Post('statements/:id/finalize') @HttpCode(200) @RequirePermission('cash.reconcile.approve')
  finalize(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.statements.finalize(u, s, id, r.requestId); }

  @Post('statements/:id/cancel') @HttpCode(200) @RequirePermission('cash.reconcile')
  cancelStatement(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.statements.cancel(u, s, id, b.reason, r.requestId);
  }

  /* --- Setoran PPN --- */
  @Get('tax/ppn') @RequirePermission(READ)
  ppn(@Query('period') period: string | undefined, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.tax.preview(u, s, period && /^\d{4}-\d{2}$/.test(period) ? period : null, r.requestId);
  }

  @Get('tax/settlements') @RequirePermission(READ)
  listSettlements(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.tax.list(u, s, r.requestId); }

  @Get('tax/settlements/:id') @RequirePermission(READ)
  getSettlement(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.tax.get(u, s, id, r.requestId); }

  @Post('tax/settlements') @RequirePermission('tax.settlement.create')
  createSettlement(@Body(new ZodValidationPipe(periodInput)) b: z.infer<typeof periodInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.tax.create(u, s, b.period, r.requestId);
  }

  @Post('tax/settlements/:id/post') @HttpCode(200) @RequirePermission('tax.settlement.post')
  postSettlement(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.tax.post(u, s, id, r.requestId); }

  @Post('tax/settlements/:id/pay') @HttpCode(200) @RequirePermission('tax.settlement.create')
  paySettlement(@Param('id') id: string, @Body(new ZodValidationPipe(payInput)) b: z.infer<typeof payInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.tax.pay(u, s, id, b, r.requestId);
  }

  @Post('tax/settlements/:id/cancel') @HttpCode(200) @RequirePermission('tax.settlement.create|tax.settlement.post')
  cancelSettlement(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.tax.cancel(u, s, id, b.reason, r.requestId);
  }
}
