import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';
import { MaintenanceService } from './maintenance.service.js';

@Module({ imports: [LedgerModule], controllers: [AssetsController], providers: [AssetsService, MaintenanceService] })
export class AssetsModule {}
