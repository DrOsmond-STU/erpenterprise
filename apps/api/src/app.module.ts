import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller.js';
import { AssistantModule } from './assistant/assistant.module.js';
import { IamModule } from './iam/iam.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AppExceptionFilter } from './common/errors.js';
import { BranchContextGuard, JwtAuthGuard, PermissionsGuard } from './common/guards.js';
import { DbModule } from './db/db.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { OrgModule } from './org/org.module.js';
import { SalesModule } from './sales/sales.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }] }),
    DbModule, AuditModule, AuthModule, LedgerModule, OrgModule, AssistantModule, IamModule, SalesModule,
  ],
  controllers: [AdminController],
  providers: [
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    /* Urutan guard: laju → autentikasi → izin → konteks cabang */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: BranchContextGuard },
  ],
})
export class AppModule {}
