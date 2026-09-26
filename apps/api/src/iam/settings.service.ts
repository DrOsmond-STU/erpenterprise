/** Pengaturan perusahaan: profil dan kebijakan dokumen (halaman Pengaturan). */
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser } from '../common/context.js';
import { DbService, systemContext } from '../db/db.service.js';

export interface CompanyPolicies {
  salesApprovalThreshold: number;
  blockOverCreditLimit: boolean;
  allowPartialShipment: boolean;
  autoDocumentNumbering: boolean;
}
export const DEFAULT_POLICIES: CompanyPolicies = { salesApprovalThreshold: 150_000_000, blockOverCreditLimit: true, allowPartialShipment: false, autoDocumentNumbering: true };

export interface SettingsPatch {
  name?: string; npwp?: string; address?: string; phone?: string; email?: string; website?: string;
  fiscalYearStartMonth?: number; policies?: Partial<CompanyPolicies>;
}

@Injectable()
export class SettingsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  private map(r: any) {
    return {
      code: r.code, name: r.name, npwp: r.npwp, address: r.address, phone: r.phone, email: r.email, website: r.website,
      baseCurrency: r.base_currency, fiscalYearStartMonth: r.fiscal_year_start_month,
      policies: { ...DEFAULT_POLICIES, ...(r.settings?.policies ?? {}) } as CompanyPolicies,
      security: { passwordMinLength: 12, lockAfterFailedLogins: 5, lockMinutes: 15, idleMinutes: 30, accessTokenMinutes: 15 },
      updatedAt: r.updated_at,
    };
  }

  async get(u: RequestUser) {
    return this.db.run(systemContext(u.companyId), async (c) => this.map((await c.query('SELECT * FROM companies WHERE id = $1', [u.companyId])).rows[0]));
  }

  async patch(u: RequestUser, p: SettingsPatch, requestId: string) {
    return this.db.run({ ...systemContext(u.companyId), userId: u.id, requestId }, async (c) => {
      const cur = (await c.query('SELECT * FROM companies WHERE id = $1', [u.companyId])).rows[0];
      const policies = { ...DEFAULT_POLICIES, ...(cur.settings?.policies ?? {}), ...(p.policies ?? {}) };
      const upd = await c.query(
        `UPDATE companies SET name = coalesce($2, name), npwp = coalesce($3, npwp), address = coalesce($4, address), phone = coalesce($5, phone),
            email = coalesce($6, email), website = coalesce($7, website), fiscal_year_start_month = coalesce($8, fiscal_year_start_month),
            settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{policies}', $9::jsonb), updated_at = now()
          WHERE id = $1 RETURNING *`,
        [u.companyId, p.name ?? null, p.npwp ?? null, p.address ?? null, p.phone ?? null, p.email ?? null, p.website ?? null, p.fiscalYearStartMonth ?? null, JSON.stringify(policies)]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'settings.updated', entityType: 'company', entityId: cur.code,
        before: this.map(cur), after: p, requestId });
      return this.map(upd.rows[0]);
    });
  }
}
