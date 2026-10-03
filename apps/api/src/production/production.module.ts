import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { BomsService } from './boms.service.js';
import { ProductionController } from './production.controller.js';
import { WorkOrdersService } from './work-orders.service.js';

@Module({ imports: [LedgerModule], controllers: [ProductionController], providers: [BomsService, WorkOrdersService] })
export class ProductionModule {}
