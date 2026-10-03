import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ComplianceService } from './compliance.service.js';
import { DocumentsService } from './documents.service.js';
import { InboxService } from './inbox.service.js';

const text = (max: number) => z.string().trim().max(max);
const file = z.object({ name: z.string().trim().min(1).max(200), mime: z.string().trim().max(120), base64: z.string().min(4).max(1_420_000, 'Ukuran berkas maksimal 1 MB') });
const docInput = z.object({
  name: z.string().trim().min(3, 'Nama minimal 3 karakter').max(200), docType: z.string().trim().min(2).max(40), folder: z.string().trim().min(2).max(120).default('Umum'),
  branch: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(), entityType: text(40).optional(), entityRef: text(80).optional(),
  status: z.enum(['draf', 'berlaku', 'arsip']).default('berlaku'), expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: text(300).optional(), file,
});
const versionInput = z.object({ file, note: text(300).optional() });
const docPatch = z.object({ status: z.enum(['draf', 'berlaku', 'arsip']).optional(), expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), folder: z.string().trim().min(2).max(120).optional(), name: z.string().trim().min(3).max(200).optional() });
const listQuery = z.object({ entityType: text(40).optional(), entityRef: text(80).optional() });

@Controller()
export class WorkflowController {
  constructor(private readonly inbox: InboxService, private readonly compliance: ComplianceService, private readonly docs: DocumentsService) {}

  /** Kotak persetujuan — tanpa izin khusus: isinya disaring izin pengguna sendiri. */
  @Get('inbox')
  items(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.inbox.items(u, s, r.requestId); }

  @Get('compliance/sod') @RequirePermission('compliance.read')
  sod(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.compliance.sod(u, s, r.requestId); }

  @Get('compliance/audit-chain') @RequirePermission('compliance.read|admin.audit.read')
  chain(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.compliance.auditChain(u, s, r.requestId); }

  @Get('documents') @RequirePermission('doc.read')
  list(@Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.docs.list(u, s, q, r.requestId); }

  @Get('documents/:id') @RequirePermission('doc.read')
  get(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.docs.get(u, s, id, r.requestId); }

  @Post('documents') @RequirePermission('doc.manage')
  create(@Body(new ZodValidationPipe(docInput)) b: z.infer<typeof docInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.docs.create(u, s, b, r.requestId); }

  @Post('documents/:id/versions') @RequirePermission('doc.manage')
  addVersion(@Param('id') id: string, @Body(new ZodValidationPipe(versionInput)) b: z.infer<typeof versionInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.docs.addVersion(u, s, id, b, r.requestId);
  }

  @Patch('documents/:id') @RequirePermission('doc.manage')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(docPatch)) b: z.infer<typeof docPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.docs.update(u, s, id, b, r.requestId); }

  @Get('documents/:id/download') @RequirePermission('doc.read')
  async download(@Param('id') id: string, @Query('version') v: string | undefined, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest, @Res() res: Response) {
    const f = await this.docs.download(u, s, id, v && /^\d+$/.test(v) ? Number(v) : null, r.requestId);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Content-SHA256', f.sha256);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(f.content);
  }
}
