import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { CashController } from './cash.controller.js';
import { BankStatementsService } from './statements.service.js';
import { TaxSettlementsService } from './tax.service.js';
import { CashTransfersService } from './transfers.service.js';

@Module({ imports: [LedgerModule], controllers: [CashController], providers: [CashTransfersService, BankStatementsService, TaxSettlementsService] })
export class CashModule {}
