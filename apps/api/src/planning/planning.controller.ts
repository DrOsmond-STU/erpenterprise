import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { BudgetsService } from './budgets.service.js';
import { CostCenterReportsService } from './cost-center-reports.service.js';
import { CostCentersService } from './cost-centers.service.js';
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
  branch: opt(branch), costCenterId: opt(z.string().uuid('Pusat biaya tidak sah').nullable()), fiscalYear: z.number().int().min(2000).max(2100), name: opt(text(120)), notes: opt(text(500)),
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

const ccBase = {
  name: opt(z.string().trim().min(3, 'Nama pusat biaya minimal 3 karakter').max(120)), kind: opt(z.enum(['biaya', 'laba'])), parentId: opt(z.string().uuid('Induk tidak sah').nullable()),
  managerName: opt(text(120).nullable()), description: opt(text(500).nullable()),
};
const ccCreate = z.object({
  ...ccBase, name: ccBase.name.unwrap(),
  code: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Kode 2–20 karakter huruf besar, angka, atau tanda hubung')),
});
const ccPatch = z.object({ ...ccBase, code: opt(z.string().trim()), status: opt(z.enum(['aktif', 'nonaktif'])), reason: opt(text(300)) });
const ccPlQuery = z.object({ costCenter: opt(z.string().uuid('Pusat biaya tidak sah')), rollup: opt(z.enum(['true', 'false'])) });
const ccBudgetQuery = z.object({ year: opt(z.coerce.number().int().min(2000).max(2100)), asOf: opt(date) });

/* Pilihan proyek untuk dimensi biaya dibutuhkan pembuat jurnal, PR, PO, dan tagihan. */
const PROJECT_PICK = 'project.read|ledger.journal.create|purchasing.requisition.create|purchasing.order.create|purchasing.invoice.create';
/* Pilihan pusat biaya: pembuat jurnal & dokumen, pengelola karyawan & anggaran, dan pembaca laporan. */
const COST_CENTER_PICK = 'costcenter.read|ledger.journal.create|purchasing.requisition.create|purchasing.order.create|purchasing.invoice.create|sales.invoice.create|hr.manage|budget.read|ledger.report.read';

@Controller()
export class PlanningController {
  constructor(private readonly budgets: BudgetsService, private readonly projects: ProjectsService, private readonly costCenters: CostCentersService, private readonly ccReports: CostCenterReportsService) {}

  /* --- Pusat biaya --- */
  @Get('cost-centers') @RequirePermission('costcenter.read')
  listCostCenters(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.costCenters.list(u, s, r.requestId); }

  @Get('cost-centers/options') @RequirePermission(COST_CENTER_PICK)
  costCenterOptions(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.costCenters.options(u, s, r.requestId); }

  @Get('cost-centers/:id') @RequirePermission('costcenter.read')
  getCostCenter(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.costCenters.get(u, s, id, r.requestId); }

  @Post('cost-centers') @RequirePermission('costcenter.manage')
  createCostCenter(@Body(new ZodValidationPipe(ccCreate)) b: z.infer<typeof ccCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.costCenters.create(u, s, b, r.requestId);
  }

  @Patch('cost-centers/:id') @RequirePermission('costcenter.manage')
  patchCostCenter(@Param('id') id: string, @Body(new ZodValidationPipe(ccPatch)) b: z.infer<typeof ccPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.costCenters.update(u, s, id, b, r.requestId);
  }

  @Delete('cost-centers/:id') @RequirePermission('costcenter.manage')
  deleteCostCenter(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.costCenters.remove(u, s, id, b.reason, r.requestId);
  }

  @Get('reports/cost-centers/income-statement') @RequirePermission('ledger.report.read')
  costCenterPl(@Query(new ZodValidationPipe(ccPlQuery)) q: z.infer<typeof ccPlQuery>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.ccReports.incomeStatement(u, s, { costCenter: q.costCenter, rollup: q.rollup === 'true' }, r.requestId);
  }

  @Get('reports/cost-centers/budget') @RequirePermission('budget.read')
  costCenterBudget(@Query(new ZodValidationPipe(ccBudgetQuery)) q: z.infer<typeof ccBudgetQuery>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.ccReports.budgetReport(u, s, q, r.requestId);
  }

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
