import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AppRequest, CurrentUser, Public, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { contextOf, DbService, systemContext } from '../db/db.service.js';

const auditQuery = z.object({
  entity: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(80).optional(),
  q: z.string().trim().max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(50),
});

const exportInput = z.object({
  resource: z.string().trim().min(1).max(120), title: z.string().trim().min(1).max(200), format: z.enum(['xlsx', 'pdf']),
  rows: z.number().int().min(0).max(1_000_000), filters: z.string().trim().max(500).optional(),
});

@Controller()
export class AdminController {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  /** K-65: health tanpa detail versi/infrastruktur. */
  @Public() @Get('health')
  async health() {
    const ok = await this.db.pool.query('SELECT 1').then(() => true).catch(() => false);
    return { status: ok ? 'ok' : 'degraded' };
  }

  @Get('admin/audit-log') @RequirePermission('admin.audit.read')
  async auditLog(@Query(new ZodValidationPipe(auditQuery)) q: z.infer<typeof auditQuery>, @CurrentUser() u: RequestUser) {
    return this.db.run(systemContext(u.companyId), async (c) => {
      const where = ['(a.company_id = $1 OR a.company_id IS NULL)'];
      const args: unknown[] = [u.companyId];
      if (q.entity) { args.push(q.entity); where.push(`a.entity_type = $${args.length}`); }
      if (q.entityId) { args.push(q.entityId); where.push(`a.entity_id = $${args.length}`); }
      if (q.q) { args.push(`%${q.q}%`); where.push(`(a.action ILIKE $${args.length} OR a.entity_type ILIKE $${args.length} OR coalesce(a.entity_id,'') ILIKE $${args.length} OR coalesce(u.display_name,'') ILIKE $${args.length} OR coalesce(a.after::text,'') ILIKE $${args.length})`); }
      if (q.from) { args.push(q.from); where.push(`a.at >= $${args.length}::date`); }
      if (q.to) { args.push(q.to); where.push(`a.at < $${args.length}::date + 1`); }
      const total = (await c.query(`SELECT count(*)::int AS n FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE ${where.join(' AND ')}`, args)).rows[0].n;
      args.push(q.size, (q.page - 1) * q.size);
      const rows = (await c.query(
        `SELECT a.id, a.at, a.branch_code, a.user_id, u.display_name AS user_name, a.action, a.entity_type, a.entity_id, a.before, a.after, host(a.ip) AS ip, a.request_id
           FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
      const chain = await this.audit.verifyChain(c, 5000);
      return { data: rows, meta: { page: q.page, size: q.size, total, chain } };
    });
  }

  /**
   * Ekspor tabel (PDF/XLSX) dibuat di peramban dari data yang sudah diizinkan API untuk
   * pengguna ini; endpoint ini menjadi gerbang izin `report.export` dan mencatat setiap
   * ekspor (halaman, cakupan cabang/periode, saringan, jumlah baris) di jejak audit.
   */
  @Post('exports') @HttpCode(201) @RequirePermission('report.export')
  async recordExport(@Body(new ZodValidationPipe(exportInput)) b: z.infer<typeof exportInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    const id = randomUUID().slice(0, 8).toUpperCase();
    return this.db.run(contextOf(u, s, r.requestId), async (c) => {
      await this.audit.record(c, { companyId: u.companyId, branchCode: s.branch === 'ALL' ? null : s.branch, userId: u.id, sessionId: u.sessionId, action: 'data.exported', entityType: 'export', entityId: b.resource,
        after: { ref: id, title: b.title, format: b.format, rows: b.rows, filters: b.filters ?? null, branch: s.branch, period: s.period }, ip: r.ip ?? null, userAgent: r.headers?.['user-agent'] as string | undefined, requestId: r.requestId });
      return { id, at: new Date().toISOString() };
    });
  }
}
