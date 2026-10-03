import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { PosController } from './pos.controller.js';
import { PosService } from './pos.service.js';

@Module({ imports: [LedgerModule], controllers: [PosController], providers: [PosService] })
export class PosModule {}
