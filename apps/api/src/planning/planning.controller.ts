import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { BudgetsService } from './budgets.service.js';
import { ProjectsService } from './projects.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const opt = <T extends z.ZodTypeAny>(t: T) => t.optional();
const text = (max: number) => z.string().trim().max(max);
const branch = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf'));
const money = z.number().int('Nilai rupiah bulat').min(0).max(1e14);
const reason = z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const accountCode = z.string().trim().regex(/^\d-\d{4}(\.\d{2})?$/, 'Kode akun tidak sah');

const budgetLine = z.object({ account: accountCode, amounts: opt(z.array(money).length(12, '12 nilai bulanan')), annual: opt(money), note: opt(text(200).nullable()) });
const budgetCreate = z.object({
  branch: opt(branch), fiscalYear: z.number().int().min(2000).max(2100), name: opt(text(120)), notes: opt(text(500)),
  lines: opt(z.array(budgetLine).max(500)), fromActualYear: opt(z.number().int().min(2000).max(2100)), growthPct: opt(z.number().min(-90).max(500)),
});
const budgetPatch = z.object({ name: opt(text(120)), notes: opt(text(500)), lines: opt(z.array(budgetLine).max(500)) });
const asOfQuery = z.object({ asOf: opt(date) });
const decision = z.object({ note: opt(text(300)) });
const returnInput = z.object({ note: reason });
const reasonOnly = z.object({ reason });

const task = z.object({
  name: z.string().trim().min(2, 'Nama tugas minimal 2 karakter').max(160), startDate: date, endDate: date,
  progress: opt(z.number().int().min(0).max(100)), weight: opt(z.number().positive().max(1000)), assignee: opt(text(120).nullable()),
});
const projectBase = {
  branch: opt(branch), name: opt(z.string().trim().min(3, 'Nama proyek minimal 3 karakter').max(200)), customerId: opt(z.string().uuid().nullable()), customerName: opt(text(200)),
  pmName: opt(z.string().trim().min(2).max(120)), budget: opt(money), contractValue: opt(money), startDate: opt(date), endDate: opt(date),
  status: opt(z.enum(['perencanaan', 'berjalan', 'ditunda', 'selesai', 'batal'])), manualProgress: opt(z.number().int().min(0).max(100).nullable()), notes: opt(text(1000)),
  tasks: opt(z.array(task).max(200)),
};
const projectCreate = z.object({ ...projectBase, name: projectBase.name.unwrap(), pmName: projectBase.pmName.unwrap(), startDate: date, endDate: date });
const projectPatch = z.object(projectBase);
const optionsQuery = z.object({ branch: opt(branch) });

/* Pilihan proyek untuk dimensi biaya dibutuhkan pembuat jurnal, PR, PO, dan tagihan. */
const PROJECT_PICK = 'project.read|ledger.journal.create|purchasing.requisition.create|purchasing.order.create|purchasing.invoice.create';

@Controller()
export class PlanningController {
  constructor(private readonly budgets: BudgetsService, private readonly projects: ProjectsService) {}

  /* --- Anggaran --- */
  @Get('budgets') @RequirePermission('budget.read')
  listBudgets(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.budgets.list(u, s, r.requestId); }

  @Get('budgets/:id') @RequirePermission('budget.read')
  getBudget(@Param('id') id: string, @Query(new ZodValidationPipe(asOfQuery)) q: z.infer<typeof asOfQuery>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.budgets.get(u, s, id, q.asOf, r.requestId);
  }

  @Post('budgets') @RequirePermission('budget.manage')
  createBudget(@Body(new ZodValidationPipe(budgetCreate)) b: z.infer<typeof budgetCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.budgets.create(u, s, b as any, r.requestId);
  }

  @Patch('budgets/:id') @RequirePermission('budget.manage')
  patchBudget(@Param('id') id: string, @Body(new ZodValidationPipe(budgetPatch)) b: z.infer<typeof budgetPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.budgets.update(u, s, id, b as any, r.requestId);
  }

  @Post('budgets/:id/submit') @HttpCode(200) @RequirePermission('budget.manage')
  submitBudget(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.budgets.submit(u, s, id, r.requestId); }

  @Post('budgets/:id/approve') @HttpCode(200) @RequirePermission('budget.approve')
  approveBudget(@Param('id') id: string, @Body(new ZodValidationPipe(decision)) b: z.infer<typeof decision>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.budgets.decide(u, s, id, true, b.note, r.requestId);
  }

  @Post('budgets/:id/return') @HttpCode(200) @RequirePermission('budget.approve')
  returnBudget(@Param('id') id: string, @Body(new ZodValidationPipe(returnInput)) b: z.infer<typeof returnInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.budgets.decide(u, s, id, false, b.note, r.requestId);
  }

  @Post('budgets/:id/revise') @HttpCode(200) @RequirePermission('budget.manage')
  reviseBudget(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.budgets.revise(u, s, id, b.reason, r.requestId);
  }

  /* --- Proyek --- */
  @Get('projects') @RequirePermission('project.read')
  listProjects(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.projects.list(u, s, r.requestId); }

  @Get('projects/options') @RequirePermission(PROJECT_PICK)
  projectOptions(@Query(new ZodValidationPipe(optionsQuery)) q: z.infer<typeof optionsQuery>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.projects.options(u, s, q.branch, r.requestId);
  }

  @Get('projects/:id') @RequirePermission('project.read')
  getProject(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.projects.get(u, s, id, r.requestId); }

  @Post('projects') @RequirePermission('project.manage')
  createProject(@Body(new ZodValidationPipe(projectCreate)) b: z.infer<typeof projectCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.projects.create(u, s, b as any, r.requestId);
  }

  @Patch('projects/:id') @RequirePermission('project.manage')
  patchProject(@Param('id') id: string, @Body(new ZodValidationPipe(projectPatch)) b: z.infer<typeof projectPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.projects.update(u, s, id, b as any, r.requestId);
  }
}
