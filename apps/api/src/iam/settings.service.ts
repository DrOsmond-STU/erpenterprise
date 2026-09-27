/** Pengaturan perusahaan: profil dan kebijakan dokumen (halaman Pengaturan). */
import { Injectable } from '@nestjs/common';
import { ACCOUNT_LINK_DEFS, DEFAULT_ACCOUNT_LINKS, linkProblem, type AccountLinks } from '@erp/domain';
import { DomainError } from '../common/errors.js';
import { mapAccount } from '../ledger/ledger.shared.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser } from '../common/context.js';
import { DbService, systemContext } from '../db/db.service.js';

export interface CompanyPolicies {
  salesApprovalThreshold: number;
  blockOverCreditLimit: boolean;
  allowPartialShipment: boolean;
  autoDocumentNumbering: boolean;
  /** PO di atas nilai ini memerlukan persetujuan manajer (dok. 07 §6.3). */
  purchaseApprovalThreshold: number;
  /** K-26: pembayaran pemasok di atas nilai ini memerlukan dua penyetuju berbeda. */
  paymentDualApprovalThreshold: number;
}
export const DEFAULT_POLICIES: CompanyPolicies = { salesApprovalThreshold: 150_000_000, blockOverCreditLimit: true, allowPartialShipment: false, autoDocumentNumbering: true,
  purchaseApprovalThreshold: 150_000_000, paymentDualApprovalThreshold: 100_000_000 };

export interface SettingsPatch {
  name?: string; npwp?: string; address?: string; phone?: string; email?: string; website?: string;
  fiscalYearStartMonth?: number; policies?: Partial<CompanyPolicies>; accountLinks?: Partial<AccountLinks>; reason?: string;
}

@Injectable()
export class SettingsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  private map(r: any) {
    return {
      code: r.code, name: r.name, npwp: r.npwp, address: r.address, phone: r.phone, email: r.email, website: r.website,
      baseCurrency: r.base_currency, fiscalYearStartMonth: r.fiscal_year_start_month,
      policies: { ...DEFAULT_POLICIES, ...(r.settings?.policies ?? {}) } as CompanyPolicies,
      accountLinks: { ...DEFAULT_ACCOUNT_LINKS, ...(r.settings?.accountLinks ?? {}) } as AccountLinks,
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
      /* Pemetaan akun: hanya akun detail aktif berkategori sesuai; header tidak dapat ditautkan. */
      const links: AccountLinks = { ...DEFAULT_ACCOUNT_LINKS, ...(cur.settings?.accountLinks ?? {}), ...(p.accountLinks ?? {}) };
      if (p.accountLinks && Object.keys(p.accountLinks).length) {
        const rows = (await c.query('SELECT * FROM chart_of_accounts WHERE company_id = $1', [u.companyId])).rows.map(mapAccount);
        const byCode = new Map(rows.map((a) => [a.code, a]));
        const errs = ACCOUNT_LINK_DEFS.filter((d) => d.key in p.accountLinks!).map((d) => linkProblem(d, byCode.get(links[d.key as keyof AccountLinks]))).filter(Boolean) as string[];
        if (errs.length) throw new DomainError('ACCOUNT_LINK_INVALID', errs[0], 422, errs);
        if (!p.reason || p.reason.trim().length < 3) throw new DomainError('REASON_REQUIRED', 'Perubahan pemetaan akun wajib diberi alasan (memengaruhi posting otomatis).', 422);
      }
      const upd = await c.query(
        `UPDATE companies SET name = coalesce($2, name), npwp = coalesce($3, npwp), address = coalesce($4, address), phone = coalesce($5, phone),
            email = coalesce($6, email), website = coalesce($7, website), fiscal_year_start_month = coalesce($8, fiscal_year_start_month),
            settings = jsonb_set(jsonb_set(coalesce(settings, '{}'::jsonb), '{policies}', $9::jsonb), '{accountLinks}', $10::jsonb), updated_at = now()
          WHERE id = $1 RETURNING *`,
        [u.companyId, p.name ?? null, p.npwp ?? null, p.address ?? null, p.phone ?? null, p.email ?? null, p.website ?? null, p.fiscalYearStartMonth ?? null, JSON.stringify(policies), JSON.stringify(links)]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'settings.updated', entityType: 'company', entityId: cur.code,
        before: this.map(cur), after: p, requestId });
      return this.map(upd.rows[0]);
    });
  }
}
