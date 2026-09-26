import { Module } from '@nestjs/common';
import { JournalsService } from './journals.service.js';
import { LedgerController } from './ledger.controller.js';
import { LedgerRefs } from './ledger.shared.js';
import { ReconciliationService } from './reconciliation.service.js';
import { ReportsService } from './reports.service.js';

@Module({
  controllers: [LedgerController],
  providers: [LedgerRefs, JournalsService, ReportsService, ReconciliationService],
  exports: [LedgerRefs, ReconciliationService, ReportsService, JournalsService],
})
export class LedgerModule {}
