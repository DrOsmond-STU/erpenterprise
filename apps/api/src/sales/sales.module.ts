import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { CustomersService } from './customers.service.js';
import { InvoicesService } from './invoices.service.js';
import { OrdersService } from './orders.service.js';
import { SalesController } from './sales.controller.js';

@Module({ imports: [LedgerModule], controllers: [SalesController], providers: [CustomersService, OrdersService, InvoicesService], exports: [InvoicesService] })
export class SalesModule {}
