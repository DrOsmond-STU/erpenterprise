import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { StockAdjustmentsService } from './adjustments.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { StockTransfersService } from './stock-transfers.service.js';

@Module({ imports: [LedgerModule], controllers: [InventoryController], providers: [InventoryService, StockAdjustmentsService, StockTransfersService] })
export class InventoryModule {}
