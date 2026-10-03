import { Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service.js';
import { DocumentsService } from './documents.service.js';
import { InboxService } from './inbox.service.js';
import { WorkflowController } from './workflow.controller.js';

@Module({ controllers: [WorkflowController], providers: [InboxService, ComplianceService, DocumentsService] })
export class WorkflowModule {}
