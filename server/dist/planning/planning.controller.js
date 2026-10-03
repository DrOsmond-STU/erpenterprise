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
exports.PlanningController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const budgets_service_js_1 = require("./budgets.service.js");
const projects_service_js_1 = require("./projects.service.js");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const opt = (t) => t.optional();
const text = (max) => zod_1.z.string().trim().max(max);
const branch = zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf'));
const money = zod_1.z.number().int('Nilai rupiah bulat').min(0).max(1e14);
const reason = zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const accountCode = zod_1.z.string().trim().regex(/^\d-\d{4}(\.\d{2})?$/, 'Kode akun tidak sah');
const budgetLine = zod_1.z.object({ account: accountCode, amounts: opt(zod_1.z.array(money).length(12, '12 nilai bulanan')), annual: opt(money), note: opt(text(200).nullable()) });
const budgetCreate = zod_1.z.object({
    branch: opt(branch), fiscalYear: zod_1.z.number().int().min(2000).max(2100), name: opt(text(120)), notes: opt(text(500)),
    lines: opt(zod_1.z.array(budgetLine).max(500)), fromActualYear: opt(zod_1.z.number().int().min(2000).max(2100)), growthPct: opt(zod_1.z.number().min(-90).max(500)),
});
const budgetPatch = zod_1.z.object({ name: opt(text(120)), notes: opt(text(500)), lines: opt(zod_1.z.array(budgetLine).max(500)) });
const asOfQuery = zod_1.z.object({ asOf: opt(date) });
const decision = zod_1.z.object({ note: opt(text(300)) });
const returnInput = zod_1.z.object({ note: reason });
const reasonOnly = zod_1.z.object({ reason });
const task = zod_1.z.object({
    name: zod_1.z.string().trim().min(2, 'Nama tugas minimal 2 karakter').max(160), startDate: date, endDate: date,
    progress: opt(zod_1.z.number().int().min(0).max(100)), weight: opt(zod_1.z.number().positive().max(1000)), assignee: opt(text(120).nullable()),
});
const projectBase = {
    branch: opt(branch), name: opt(zod_1.z.string().trim().min(3, 'Nama proyek minimal 3 karakter').max(200)), customerId: opt(zod_1.z.string().uuid().nullable()), customerName: opt(text(200)),
    pmName: opt(zod_1.z.string().trim().min(2).max(120)), budget: opt(money), contractValue: opt(money), startDate: opt(date), endDate: opt(date),
    status: opt(zod_1.z.enum(['perencanaan', 'berjalan', 'ditunda', 'selesai', 'batal'])), manualProgress: opt(zod_1.z.number().int().min(0).max(100).nullable()), notes: opt(text(1000)),
    tasks: opt(zod_1.z.array(task).max(200)),
};
const projectCreate = zod_1.z.object({ ...projectBase, name: projectBase.name.unwrap(), pmName: projectBase.pmName.unwrap(), startDate: date, endDate: date });
const projectPatch = zod_1.z.object(projectBase);
const optionsQuery = zod_1.z.object({ branch: opt(branch) });
/* Pilihan proyek untuk dimensi biaya dibutuhkan pembuat jurnal, PR, PO, dan tagihan. */
const PROJECT_PICK = 'project.read|ledger.journal.create|purchasing.requisition.create|purchasing.order.create|purchasing.invoice.create';
let PlanningController = class PlanningController {
    budgets;
    projects;
    constructor(budgets, projects) {
        this.budgets = budgets;
        this.projects = projects;
    }
    /* --- Anggaran --- */
    listBudgets(u, s, r) { return this.budgets.list(u, s, r.requestId); }
    getBudget(id, q, u, s, r) {
        return this.budgets.get(u, s, id, q.asOf, r.requestId);
    }
    createBudget(b, u, s, r) {
        return this.budgets.create(u, s, b, r.requestId);
    }
    patchBudget(id, b, u, s, r) {
        return this.budgets.update(u, s, id, b, r.requestId);
    }
    submitBudget(id, u, s, r) { return this.budgets.submit(u, s, id, r.requestId); }
    approveBudget(id, b, u, s, r) {
        return this.budgets.decide(u, s, id, true, b.note, r.requestId);
    }
    returnBudget(id, b, u, s, r) {
        return this.budgets.decide(u, s, id, false, b.note, r.requestId);
    }
    reviseBudget(id, b, u, s, r) {
        return this.budgets.revise(u, s, id, b.reason, r.requestId);
    }
    /* --- Proyek --- */
    listProjects(u, s, r) { return this.projects.list(u, s, r.requestId); }
    projectOptions(q, u, s, r) {
        return this.projects.options(u, s, q.branch, r.requestId);
    }
    getProject(id, u, s, r) { return this.projects.get(u, s, id, r.requestId); }
    createProject(b, u, s, r) {
        return this.projects.create(u, s, b, r.requestId);
    }
    patchProject(id, b, u, s, r) {
        return this.projects.update(u, s, id, b, r.requestId);
    }
};
exports.PlanningController = PlanningController;
__decorate([
    (0, common_1.Get)('budgets'),
    (0, context_js_1.RequirePermission)('budget.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "listBudgets", null);
__decorate([
    (0, common_1.Get)('budgets/:id'),
    (0, context_js_1.RequirePermission)('budget.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)(new zod_pipe_js_1.ZodValidationPipe(asOfQuery))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "getBudget", null);
__decorate([
    (0, common_1.Post)('budgets'),
    (0, context_js_1.RequirePermission)('budget.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(budgetCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "createBudget", null);
__decorate([
    (0, common_1.Patch)('budgets/:id'),
    (0, context_js_1.RequirePermission)('budget.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(budgetPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "patchBudget", null);
__decorate([
    (0, common_1.Post)('budgets/:id/submit'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('budget.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "submitBudget", null);
__decorate([
    (0, common_1.Post)('budgets/:id/approve'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('budget.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(decision))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "approveBudget", null);
__decorate([
    (0, common_1.Post)('budgets/:id/return'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('budget.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(returnInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "returnBudget", null);
__decorate([
    (0, common_1.Post)('budgets/:id/revise'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('budget.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "reviseBudget", null);
__decorate([
    (0, common_1.Get)('projects'),
    (0, context_js_1.RequirePermission)('project.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "listProjects", null);
__decorate([
    (0, common_1.Get)('projects/options'),
    (0, context_js_1.RequirePermission)(PROJECT_PICK),
    __param(0, (0, common_1.Query)(new zod_pipe_js_1.ZodValidationPipe(optionsQuery))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "projectOptions", null);
__decorate([
    (0, common_1.Get)('projects/:id'),
    (0, context_js_1.RequirePermission)('project.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "getProject", null);
__decorate([
    (0, common_1.Post)('projects'),
    (0, context_js_1.RequirePermission)('project.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(projectCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "createProject", null);
__decorate([
    (0, common_1.Patch)('projects/:id'),
    (0, context_js_1.RequirePermission)('project.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(projectPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PlanningController.prototype, "patchProject", null);
exports.PlanningController = PlanningController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [budgets_service_js_1.BudgetsService, projects_service_js_1.ProjectsService])
], PlanningController);
//# sourceMappingURL=planning.controller.js.map