import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { BudgetsService } from './budgets.service.js';
import { CostCenterReportsService } from './cost-center-reports.service.js';
import { CostCentersService } from './cost-centers.service.js';
import { PlanningController } from './planning.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({ imports: [LedgerModule], controllers: [PlanningController], providers: [BudgetsService, ProjectsService, CostCentersService, CostCenterReportsService] })
export class PlanningModule {}
