import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { OrgController } from './org.controller.js';
import { OrgService } from './org.service.js';

@Module({ imports: [LedgerModule], controllers: [OrgController], providers: [OrgService] })
export class OrgModule {}
