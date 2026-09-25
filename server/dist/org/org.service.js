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
exports.OrgService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const reconciliation_service_js_1 = require("../ledger/reconciliation.service.js");
const mapBranch = (b) => ({
    code: String(b.code).trim(), name: b.name, short: b.short_name, type: b.type, city: b.city, address: b.address, phone: b.phone,
    manager: b.manager_name, isHeadOffice: b.is_head_office, status: b.status, targetMonthly: b.target_monthly, budgetShare: Number(b.budget_share),
    mainBankAccountId: b.main_bank_account_code, pettyCashAccountId: b.petty_cash_account_code, openedAt: b.opened_at,
});
let OrgService = class OrgService {
    db;
    audit;
    recon;
    constructor(db, audit, recon) {
        this.db = db;
        this.audit = audit;
        this.recon = recon;
    }
    async listBranches(u) {
        return this.db.run((0, db_service_js_1.systemContext)(u.companyId), async (c) => (await c.query('SELECT * FROM branches WHERE company_id = $1 ORDER BY is_head_office DESC, code', [u.companyId])).rows.map(mapBranch));
    }
    async createBranch(u, b, requestId) {
        return this.db.run({ userId: u.id, companyId: u.companyId, branches: '*', requestId }, async (c) => {
            const dup = await c.query('SELECT 1 FROM branches WHERE company_id = $1 AND code = $2', [u.companyId, b.code]);
            if (dup.rowCount)
                throw (0, errors_js_1.conflict)('BRANCH_EXISTS', `Kode cabang ${b.code} sudah dipakai.`);
            const giro = `BNK-${b.code}-GIRO`, petty = `BNK-${b.code}-KAS`;
            const today = new Date().toISOString().slice(0, 10);
            await c.query(`INSERT INTO bank_accounts (company_id, branch_code, code, name, bank_name, account_no_masked, currency, opening_balance, opening_date)
        VALUES ($1,$2,$3,$4,$5,'—','IDR',0,$6), ($1,$2,$7,$8,'Kas','—','IDR',0,$6)`, [u.companyId, b.code, giro, `${b.bankName} — Giro Cabang ${b.city}`, b.bankName, today, petty, `Kas Kecil — ${b.city}`]);
            const ins = await c.query(`INSERT INTO branches (company_id, code, name, short_name, type, city, address, phone, manager_name, main_bank_account_code, petty_cash_account_code, target_monthly, opened_at, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [u.companyId, b.code, b.name, b.shortName ?? b.name.split(' — ')[0], b.type, b.city, b.address ?? null, b.phone ?? null, b.managerName ?? null, giro, petty, b.targetMonthly, today, u.id]);
            const row = mapBranch(ins.rows[0]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: b.code, userId: u.id, sessionId: u.sessionId, action: 'branch.created', entityType: 'branch', entityId: b.code, after: row, requestId });
            return row;
        });
    }
    async patchBranch(u, code, p, requestId) {
        return this.db.run({ userId: u.id, companyId: u.companyId, branches: '*', requestId }, async (c) => {
            const cur = (await c.query('SELECT * FROM branches WHERE company_id = $1 AND code = $2', [u.companyId, code])).rows[0];
            if (!cur)
                throw (0, errors_js_1.notFound)(`Cabang ${code}`);
            if (p.status === 'nonaktif' && cur.is_head_office)
                throw new errors_js_1.DomainError('HEAD_OFFICE', 'Kantor pusat tidak dapat dinonaktifkan.');
            const upd = await c.query(`UPDATE branches SET name = coalesce($3, name), manager_name = coalesce($4, manager_name), status = coalesce($5, status), target_monthly = coalesce($6, target_monthly), updated_at = now()
        WHERE company_id = $1 AND code = $2 RETURNING *`, [u.companyId, code, p.name ?? null, p.managerName ?? null, p.status ?? null, p.targetMonthly ?? null]);
            const row = mapBranch(upd.rows[0]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: code, userId: u.id, sessionId: u.sessionId, action: 'branch.updated', entityType: 'branch', entityId: code, before: mapBranch(cur), after: { ...row, reason: p.reason }, requestId });
            return row;
        });
    }
    async listPeriods(u) {
        return this.db.run((0, db_service_js_1.systemContext)(u.companyId), async (c) => (await c.query('SELECT code, label, date_from, date_to, period_group, status, closed_at FROM fiscal_periods WHERE company_id = $1 ORDER BY date_from, date_to', [u.companyId])).rows
            .map((p) => ({ id: p.code, label: p.label, from: p.date_from, to: p.date_to, group: p.period_group, status: p.status, closedAt: p.closed_at })));
    }
    /** K-27: tutup periode hanya bila tidak ada jurnal pending dan seluruh rekonsiliasi cocok. */
    async closePeriod(u, code, reason, requestId) {
        return this.db.run({ userId: u.id, companyId: u.companyId, branches: '*', requestId }, async (c) => {
            const p = (await c.query('SELECT * FROM fiscal_periods WHERE company_id = $1 AND code = $2', [u.companyId, code])).rows[0];
            if (!p)
                throw (0, errors_js_1.notFound)(`Periode ${code}`);
            if (p.status === 'closed')
                throw (0, errors_js_1.conflict)('PERIOD_CLOSED', `Periode ${p.label} sudah ditutup.`);
            const pending = await c.query(`SELECT count(*)::int AS n FROM journals WHERE company_id = $1 AND status = 'pending' AND journal_date BETWEEN $2 AND $3`, [u.companyId, p.date_from, p.date_to]);
            if (pending.rows[0].n > 0)
                throw new errors_js_1.DomainError('PERIOD_HAS_PENDING', `${pending.rows[0].n} jurnal masih menunggu persetujuan dalam periode ${p.label}.`);
            const checks = await this.recon.run(c, u.companyId, 'ALL', { id: p.code, from: p.date_from, to: p.date_to }, u.id);
            const failed = checks.filter((k) => !k.ok);
            if (failed.length)
                throw new errors_js_1.DomainError('PERIOD_RECON_FAILED', `Rekonsiliasi belum cocok: ${failed.map((f) => f.label).join(', ')}.`, 422, failed);
            await c.query(`UPDATE fiscal_periods SET status = 'closed', closed_at = now(), closed_by = $3 WHERE company_id = $1 AND code = $2`, [u.companyId, code, u.id]);
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'period.closed', entityType: 'period', entityId: code, after: { reason }, requestId });
            return { code, status: 'closed' };
        });
    }
    async reopenPeriod(u, code, reason, requestId) {
        return this.db.run({ userId: u.id, companyId: u.companyId, branches: '*', requestId }, async (c) => {
            const p = (await c.query('SELECT * FROM fiscal_periods WHERE company_id = $1 AND code = $2', [u.companyId, code])).rows[0];
            if (!p)
                throw (0, errors_js_1.notFound)(`Periode ${code}`);
            if (p.closed_by && p.closed_by === u.id)
                throw new errors_js_1.DomainError('SOD_PERIOD', 'Penutup periode tidak boleh membuka kembali periode yang sama (pemisahan tugas).', 403);
            await c.query(`UPDATE fiscal_periods SET status = 'open', closed_at = NULL, closed_by = NULL WHERE company_id = $1 AND code = $2`, [u.companyId, code]);
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'period.reopened', entityType: 'period', entityId: code, before: { status: p.status }, after: { status: 'open', reason }, requestId });
            return { code, status: 'open' };
        });
    }
};
exports.OrgService = OrgService;
exports.OrgService = OrgService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, reconciliation_service_js_1.ReconciliationService])
], OrgService);
//# sourceMappingURL=org.service.js.map