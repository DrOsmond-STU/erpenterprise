import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { BudgetsService } from './budgets.service.js';
import { PlanningController } from './planning.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({ imports: [LedgerModule], controllers: [PlanningController], providers: [BudgetsService, ProjectsService] })
export class PlanningModule {}
