"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = exports.DEFAULT_POLICIES = void 0;
/** Pengaturan perusahaan: profil dan kebijakan dokumen (halaman Pengaturan). */
const common_1 = require("@nestjs/common");
const audit_service_js_1 = require("../audit/audit.service.js");
const db_service_js_1 = require("../db/db.service.js");
exports.DEFAULT_POLICIES = { salesApprovalThreshold: 150_000_000, blockOverCreditLimit: true, allowPartialShipment: false, autoDocumentNumbering: true };
let SettingsService = class SettingsService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    map(r) {
        return {
            code: r.code, name: r.name, npwp: r.npwp, address: r.address, phone: r.phone, email: r.email, website: r.website,
            baseCurrency: r.base_currency, fiscalYearStartMonth: r.fiscal_year_start_month,
            policies: { ...exports.DEFAULT_POLICIES, ...(r.settings?.policies ?? {}) },
            security: { passwordMinLength: 12, lockAfterFailedLogins: 5, lockMinutes: 15, idleMinutes: 30, accessTokenMinutes: 15 },
            updatedAt: r.updated_at,
        };
    }
    async get(u) {
        return this.db.run((0, db_service_js_1.systemContext)(u.companyId), async (c) => this.map((await c.query('SELECT * FROM companies WHERE id = $1', [u.companyId])).rows[0]));
    }
    async patch(u, p, requestId) {
        return this.db.run({ ...(0, db_service_js_1.systemContext)(u.companyId), userId: u.id, requestId }, async (c) => {
            const cur = (await c.query('SELECT * FROM companies WHERE id = $1', [u.companyId])).rows[0];
            const policies = { ...exports.DEFAULT_POLICIES, ...(cur.settings?.policies ?? {}), ...(p.policies ?? {}) };
            const upd = await c.query(`UPDATE companies SET name = coalesce($2, name), npwp = coalesce($3, npwp), address = coalesce($4, address), phone = coalesce($5, phone),
            email = coalesce($6, email), website = coalesce($7, website), fiscal_year_start_month = coalesce($8, fiscal_year_start_month),
            settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{policies}', $9::jsonb), updated_at = now()
          WHERE id = $1 RETURNING *`, [u.companyId, p.name ?? null, p.npwp ?? null, p.address ?? null, p.phone ?? null, p.email ?? null, p.website ?? null, p.fiscalYearStartMonth ?? null, JSON.stringify(policies)]);
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'settings.updated', entityType: 'company', entityId: cur.code,
                before: this.map(cur), after: p, requestId });
            return this.map(upd.rows[0]);
        });
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], SettingsService);
//# sourceMappingURL=settings.service.js.map