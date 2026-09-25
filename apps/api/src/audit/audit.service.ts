import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

export interface AuditEntry {
  companyId: string | null;
  branchCode?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/** K-70: setiap perubahan bermakna dicatat dalam transaksi yang sama dengan perubahannya. */
@Injectable()
export class AuditService {
  async record(c: PoolClient, e: AuditEntry): Promise<void> {
    await c.query(
      `INSERT INTO audit_log (company_id, branch_code, user_id, session_id, action, entity_type, entity_id, before, after, ip, user_agent, request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [e.companyId, e.branchCode ?? null, e.userId ?? null, e.sessionId ?? null, e.action, e.entityType, e.entityId ?? null,
        e.before === undefined ? null : JSON.stringify(e.before), e.after === undefined ? null : JSON.stringify(e.after),
        e.ip ?? null, e.userAgent ? String(e.userAgent).slice(0, 300) : null, e.requestId ?? null],
    );
  }

  /** K-71: verifikasi rantai hash — mengembalikan id baris pertama yang rusak, atau null. */
  async verifyChain(c: PoolClient, limit = 100_000): Promise<{ checked: number; brokenAt: number | null }> {
    const { rows } = await c.query(`SELECT id, encode(prev_hash,'hex') AS prev, encode(hash,'hex') AS hash FROM audit_log ORDER BY id ASC LIMIT $1`, [limit]);
    let prev: string | null = null;
    for (const r of rows) {
      if ((r.prev ?? null) !== prev) return { checked: rows.length, brokenAt: r.id };
      prev = r.hash;
    }
    return { checked: rows.length, brokenAt: null };
  }
}
