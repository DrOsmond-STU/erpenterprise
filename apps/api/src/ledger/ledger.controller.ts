import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { JournalsService } from './journals.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { ReportsService } from './reports.service.js';

const listQuery = z.object({
  status: z.enum(['draft', 'pending', 'posted', 'rejected', 'reversed']).optional(),
  source: z.string().regex(/^[a-z_-]{2,30}$/).optional(),
  account: z.string().regex(/^\d-\d{4}$/).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(25),
});
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });
const reverseSchema = z.object({ reason: z.string().trim().min(3).max(300), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const cardQuery = z.object({ bank: z.string().regex(/^[A-Z0-9-]{3,30}$/).optional() });
const tbQuery = z.object({ by_branch: z.enum(['true', 'false']).optional() });

@Controller()
export class LedgerController {
  constructor(private readonly journals: JournalsService, private readonly reports: ReportsService, private readonly recon: ReconciliationService) {}

  /* --- Jurnal ------------------------------------------------------------ */
  @Get('ledger/journals') @RequirePermission('ledger.journal.read')
  list(@Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.journals.list(u, s, q, r.requestId);
  }

  @Get('ledger/journals/by-ref/:ref') @RequirePermission('ledger.journal.read')
  byRef(@Param('ref') ref: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.journals.byRef(u, s, ref.slice(0, 60), r.requestId);
  }

  @Get('ledger/journals/:id') @RequirePermission('ledger.journal.read')
  get(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.journals.get(u, s, id, r.requestId);
  }

  @Post('ledger/journals') @RequirePermission('ledger.journal.create')
  create(@Body() body: unknown, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.journals.create(u, s, body, r.requestId);
  }

  @Post('ledger/journals/:id/post') @RequirePermission('ledger.journal.post') @HttpCode(200)
  post(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.journals.post(u, s, id, r.requestId);
  }

  @Post('ledger/journals/:id/reject') @RequirePermission('ledger.journal.post') @HttpCode(200)
  reject(@Param('id') id: string, @Body(new ZodValidationPipe(reasonSchema)) b: { reason: string }, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.journals.reject(u, s, id, b.reason, r.requestId);
  }

  @Post('ledger/journals/:id/reverse') @RequirePermission('ledger.journal.reverse') @HttpCode(201)
  reverse(@Param('id') id: string, @Body(new ZodValidationPipe(reverseSchema)) b: z.infer<typeof reverseSchema>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.journals.reverse(u, s, id, b.date, b.reason, r.requestId);
  }

  /* --- Bagan akun & kartu buku besar ---------------------------------------- */
  @Get('ledger/accounts') @RequirePermission('ledger.account.read')
  accounts(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.reports.chartOfAccounts(u, s, r.requestId); }

  @Get('ledger/accounts/:code/card') @RequirePermission('ledger.report.read')
  card(@Param('code') code: string, @Query(new ZodValidationPipe(cardQuery)) q: z.infer<typeof cardQuery>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.reports.ledgerCard(u, s, code, q.bank ?? null, r.requestId);
  }

  @Get('ledger/bank-accounts') @RequirePermission('ledger.report.read')
  banks(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.reports.bankBalances(u, s, r.requestId); }

  /* --- Laporan -------------------------------------------------------------- */
  @Get('reports/kpis') @RequirePermission('ledger.report.read')
  kpis(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.reports.kpis(u, s, r.requestId); }

  @Get('reports/trial-balance') @RequirePermission('ledger.report.read')
  tb(@Query(new ZodValidationPipe(tbQuery)) q: z.infer<typeof tbQuery>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.reports.trialBalance(u, s, q.by_branch === 'true', r.requestId);
  }

  @Get('reports/income-statement') @RequirePermission('ledger.report.read')
  pl(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.reports.incomeStatement(u, s, r.requestId); }

  @Get('reports/balance-sheet') @RequirePermission('ledger.report.read')
  bs(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.reports.balanceSheet(u, s, r.requestId); }

  @Get('reports/consolidation') @RequirePermission('report.consolidated')
  cons(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.reports.consolidation(u, s, r.requestId); }

  @Get('reports/reconciliation') @RequirePermission('ledger.report.read')
  reconciliation(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.recon.forScope(u, s, r.requestId); }
}
