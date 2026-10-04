import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module.js';
import { CrmFullController } from './crm-full.controller.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';
import { LeadsService } from './leads.service.js';
import { RelationsService } from './relations.service.js';
import { ServiceDeskService } from './service-desk.service.js';

@Module({ imports: [SalesModule], controllers: [CrmController, CrmFullController], providers: [CrmService, LeadsService, RelationsService, ServiceDeskService] })
export class CrmModule {}
