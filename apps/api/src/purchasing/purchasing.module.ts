import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ApInvoicesService } from './ap-invoices.service.js';
import { PurchaseOrdersService } from './orders.service.js';
import { ProcurementController } from './procurement.controller.js';
import { ProcurementService } from './procurement.service.js';
import { SupplierPaymentsService } from './payments.service.js';
import { PurchasingController } from './purchasing.controller.js';
import { SuppliersService } from './suppliers.service.js';

@Module({ imports: [LedgerModule], controllers: [PurchasingController, ProcurementController], providers: [SuppliersService, PurchaseOrdersService, ProcurementService, ApInvoicesService, SupplierPaymentsService], exports: [SupplierPaymentsService] })
export class PurchasingModule {}
