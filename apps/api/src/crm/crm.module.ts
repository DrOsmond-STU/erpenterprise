import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';

@Module({ imports: [SalesModule], controllers: [CrmController], providers: [CrmService] })
export class CrmModule {}
