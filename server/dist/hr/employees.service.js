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
exports.EmployeesService = void 0;
/** Karyawan: data rahasia (NIK, NPWP, rekening) terenkripsi; dibuka hanya oleh pemegang izin dan dicatat (K-41). */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const crypto_js_1 = require("../common/crypto.js");
const db_service_js_1 = require("../db/db.service.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const map = (e, canSeePay) => ({
    id: e.id, code: e.code, name: e.name, branch: (0, sales_shared_js_1.trimBranch)(e.branch_code), dept: e.dept, title: e.title, joinDate: e.join_date, employment: e.employment, status: e.status, ptkp: e.ptkp,
    basicSalary: canSeePay ? Number(e.basic_salary) : null, fixedAllowance: canSeePay ? Number(e.fixed_allowance) : null, email: e.email,
    nik: e.nik_masked, npwp: e.npwp_masked, bankName: e.bank_name, bankAccount: e.bank_account_masked,
});
let EmployeesService = class EmployeesService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    seesPay = (u) => u.permissions.has('hr.manage') || u.permissions.has('payroll.process') || u.permissions.has('payroll.approve');
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`SELECT * FROM employees WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2) ORDER BY (status = 'aktif') DESC, branch_code, name`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows
            .map((e) => map(e, this.seesPay(u))));
    }
    async row(c, companyId, id) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Karyawan');
        const e = (await c.query('SELECT * FROM employees WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
        if (!e)
            throw (0, errors_js_1.notFound)('Karyawan');
        return e;
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const e = await this.row(c, u.companyId, id);
            const slips = (await c.query(`SELECT doc_no, period_code, gross, net_pay, status, paid_date FROM payslips WHERE company_id = $1 AND (employee_id = $2 OR employee_code = $3) ORDER BY period_code DESC LIMIT 24`, [u.companyId, id, e.code])).rows
                .map((p) => ({ docNo: p.doc_no, period: p.period_code, gross: p.gross === null ? null : Number(p.gross), net: Number(p.net_pay), status: p.status, paidDate: p.paid_date }));
            return { ...map(e, this.seesPay(u)), payslips: this.seesPay(u) ? slips : [] };
        });
    }
    /** Buka data rahasia — hanya `hr.restricted.read`, setiap pembukaan dicatat di jejak audit. */
    async reveal(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            if (!u.permissions.has('hr.restricted.read'))
                throw (0, errors_js_1.forbidden)('Memerlukan izin hr.restricted.read.');
            const e = await this.row(c, u.companyId, id);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(e.branch_code), userId: u.id, sessionId: u.sessionId, action: 'employee.restricted_read', entityType: 'employee', entityId: e.code, after: { fields: ['nik', 'npwp', 'bankAccount'] }, requestId });
            return { nik: (0, crypto_js_1.decryptField)(e.nik_enc), npwp: (0, crypto_js_1.decryptField)(e.npwp_enc), bankName: e.bank_name, bankAccount: (0, crypto_js_1.decryptField)(e.bank_account_enc) };
        });
    }
    secret(v) { return v === undefined ? undefined : { enc: (0, crypto_js_1.encryptField)(v || null), masked: (0, domain_1.maskTail)(v || null) }; }
    async create(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            (0, sales_shared_js_1.assertBranch)(u, s, b.branch);
            const max = Number((await (0, sales_shared_js_1.acrossBranches)(c, async () => c.query(`SELECT coalesce(max(nullif(regexp_replace(code, '\\D', '', 'g'), '')::int), 0) AS n FROM employees WHERE company_id = $1`, [u.companyId]))).rows[0].n);
            const code = `EMP-${String(max + 1).padStart(4, '0')}`;
            const nik = this.secret(b.nik), npwp = this.secret(b.npwp), acct = this.secret(b.bankAccount);
            const e = (await c.query(`INSERT INTO employees (company_id, branch_code, code, name, dept, title, join_date, employment, ptkp, basic_salary, fixed_allowance, email,
                                  nik_enc, nik_masked, npwp_enc, npwp_masked, bank_name, bank_account_enc, bank_account_masked, created_by_name)
                                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`, [u.companyId, b.branch, code, b.name, b.dept, b.title ?? null, b.joinDate ?? null, b.employment, b.ptkp, b.basicSalary, b.fixedAllowance, b.email ?? null,
                nik?.enc ?? null, nik?.masked ?? null, npwp?.enc ?? null, npwp?.masked ?? null, b.bankName ?? null, acct?.enc ?? null, acct?.masked ?? null, u.name])).rows[0];
            await this.audit.record(c, { companyId: u.companyId, branchCode: b.branch, userId: u.id, sessionId: u.sessionId, action: 'employee.created', entityType: 'employee', entityId: code, after: { name: b.name, dept: b.dept, branch: b.branch }, requestId });
            return map(e, true);
        });
    }
    async update(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const e = await this.row(c, u.companyId, id);
            if (b.branch && b.branch !== (0, sales_shared_js_1.trimBranch)(e.branch_code)) {
                (0, sales_shared_js_1.assertBranch)(u, { ...s, branch: 'ALL' }, b.branch);
                if ((await c.query(`SELECT 1 FROM payslips WHERE employee_id = $1 AND status IN ('draf','diproses')`, [id])).rowCount)
                    throw (0, errors_js_1.conflict)('EMPLOYEE_OPEN_PAYSLIP', 'Masih ada slip gaji draf/belum dibayar; pindah cabang setelah dibayar.');
            }
            const nik = this.secret(b.nik), npwp = this.secret(b.npwp), acct = this.secret(b.bankAccount);
            await c.query(`UPDATE employees SET name = coalesce($3, name), branch_code = coalesce($4, branch_code), dept = coalesce($5, dept), title = coalesce($6, title), join_date = coalesce($7, join_date),
                       employment = coalesce($8, employment), ptkp = coalesce($9, ptkp), basic_salary = coalesce($10, basic_salary), fixed_allowance = coalesce($11, fixed_allowance), email = coalesce($12, email),
                       status = coalesce($13, status), bank_name = coalesce($14, bank_name),
                       nik_enc = CASE WHEN $15::boolean THEN $16 ELSE nik_enc END, nik_masked = CASE WHEN $15::boolean THEN $17 ELSE nik_masked END,
                       npwp_enc = CASE WHEN $18::boolean THEN $19 ELSE npwp_enc END, npwp_masked = CASE WHEN $18::boolean THEN $20 ELSE npwp_masked END,
                       bank_account_enc = CASE WHEN $21::boolean THEN $22 ELSE bank_account_enc END, bank_account_masked = CASE WHEN $21::boolean THEN $23 ELSE bank_account_masked END,
                       updated_at = now() WHERE company_id = $1 AND id = $2`, [u.companyId, id, b.name ?? null, b.branch ?? null, b.dept ?? null, b.title ?? null, b.joinDate ?? null, b.employment ?? null, b.ptkp ?? null, b.basicSalary ?? null, b.fixedAllowance ?? null, b.email ?? null,
                b.status ?? null, b.bankName ?? null, !!nik, nik?.enc ?? null, nik?.masked ?? null, !!npwp, npwp?.enc ?? null, npwp?.masked ?? null, !!acct, acct?.enc ?? null, acct?.masked ?? null]);
            const changed = Object.keys(b).map((k) => (['nik', 'npwp', 'bankAccount'].includes(k) ? `${k} (rahasia)` : k));
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(e.branch_code), userId: u.id, sessionId: u.sessionId, action: 'employee.updated', entityType: 'employee', entityId: e.code, after: { fields: changed }, requestId });
            return map(await (0, sales_shared_js_1.acrossBranches)(c, () => this.row(c, u.companyId, id)), true);
        });
    }
};
exports.EmployeesService = EmployeesService;
exports.EmployeesService = EmployeesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], EmployeesService);
//# sourceMappingURL=employees.service.js.map