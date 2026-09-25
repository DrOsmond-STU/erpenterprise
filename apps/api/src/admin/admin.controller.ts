import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Public, RequirePermission, RequestUser } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { DbService, systemContext } from '../db/db.service.js';

const auditQuery = z.object({
  entity: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(50),
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
      args.push(q.size, (q.page - 1) * q.size);
      const rows = (await c.query(
        `SELECT a.id, a.at, a.branch_code, a.user_id, u.display_name AS user_name, a.action, a.entity_type, a.entity_id, a.before, a.after, host(a.ip) AS ip, a.request_id
           FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
      const chain = await this.audit.verifyChain(c, 5000);
      return { data: rows, meta: { page: q.page, size: q.size, chain } };
    });
  }
}
