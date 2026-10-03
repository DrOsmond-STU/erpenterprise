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
exports.PayrollService = void 0;
/**
 * Penggajian: daftar gaji per cabang per periode (draf, dihitung dari data karyawan &
 * lembur kehadiran) → posting oleh orang lain (jurnal beban gaji / utang gaji, PPh 21,
 * BPJS) → pembayaran dari satu rekening (lintas cabang lewat RK).
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const cash_shared_js_1 = require("../cash/cash.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const mapSlip = (p) => ({
    id: p.id, docNo: p.doc_no, employeeId: p.employee_id, employeeCode: p.employee_code, employeeName: p.employee_name, dept: p.dept, branch: (0, sales_shared_js_1.trimBranch)(p.branch_code), period: p.period_code,
    basic: Number(p.basic), allowance: Number(p.allowance), overtime: Number(p.overtime), overtimeHours: p.overtime_hours === null ? null : Number(p.overtime_hours),
    gross: p.gross === null ? Number(p.basic) + Number(p.allowance) + Number(p.overtime) : Number(p.gross), bpjsEmployee: p.bpjs_employee === null ? null : Number(p.bpjs_employee),
    bpjsEmployer: p.bpjs_employer === null ? null : Number(p.bpjs_employer), pph21: p.pph21 === null ? null : Number(p.pph21), deduction: Number(p.deduction), net: Number(p.net_pay),
    status: p.status, runId: p.run_id, paidDate: p.paid_date,
});
const mapRun = (r) => ({ id: r.id, docNo: r.doc_no, branch: (0, sales_shared_js_1.trimBranch)(r.branch_code), period: r.period_code, status: r.status, totals: r.totals, createdBy: r.created_by, createdByName: r.created_by_name, createdAt: r.created_at, postedByName: r.posted_by_name, postedAt: r.posted_at });
let PayrollService = class PayrollService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    async runs(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`SELECT * FROM payroll_runs WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2) ORDER BY period_code DESC, branch_code LIMIT 500`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(mapRun));
    }
    async runRow(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Daftar gaji');
        const r = (await c.query(`SELECT * FROM payroll_runs WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Daftar gaji');
        return r;
    }
    async loadRun(c, companyId, id) {
        const r = await this.runRow(c, companyId, id);
        const slips = (await c.query('SELECT * FROM payslips WHERE run_id = $1 ORDER BY employee_name', [id])).rows.map(mapSlip);
        const journals = (await c.query(`SELECT id, journal_no, journal_date, rule_code, status, total_debit FROM journals WHERE company_id = $1 AND source_type = 'payroll_run' AND source_id = $2`, [companyId, id])).rows
            .map((j) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, rule: j.rule_code, status: j.status, total: j.total_debit }));
        return { ...mapRun(r), slips, journals, timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'payroll_run', r.doc_no) };
    }
    async getRun(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.loadRun(c, u.companyId, id));
    }
    totals(slips) {
        const sum = (k) => slips.reduce((t, p) => t + Number(p[k] ?? 0), 0);
        return { count: slips.length, gross: sum('gross'), bpjsEmployee: sum('bpjs_employee'), bpjsEmployer: sum('bpjs_employer'), pph21: sum('pph21'), net: sum('net_pay') };
    }
    async createRun(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            (0, sales_shared_js_1.assertBranch)(u, s, b.branch);
            if ((await c.query(`SELECT 1 FROM payroll_runs WHERE company_id = $1 AND branch_code = $2 AND period_code = $3 AND status <> 'batal'`, [u.companyId, b.branch, b.period])).rowCount)
                throw (0, errors_js_1.conflict)('PAYROLL_RUN_EXISTS', `Daftar gaji ${b.branch} ${b.period} sudah ada.`);
            if ((await c.query(`SELECT 1 FROM payslips WHERE company_id = $1 AND branch_code = $2 AND period_code = $3 AND run_id IS NULL`, [u.companyId, b.branch, b.period])).rowCount)
                throw (0, errors_js_1.conflict)('PAYROLL_LEGACY', `Slip gaji ${b.branch} ${b.period} sudah ada (data awal).`);
            const emps = (await c.query(`SELECT * FROM employees WHERE company_id = $1 AND branch_code = $2 AND status = 'aktif' ORDER BY name`, [u.companyId, b.branch])).rows;
            if (!emps.length)
                throw (0, sales_shared_js_1.invalid)('PAYROLL_EMPTY', `Tidak ada karyawan aktif di cabang ${b.branch}.`);
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'PAYR', Number(b.period.slice(0, 4)));
            const run = (await c.query(`INSERT INTO payroll_runs (company_id, branch_code, doc_no, period_code, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [u.companyId, b.branch, docNo, b.period, u.id, u.name])).rows[0];
            const from = `${b.period}-01`, to = (0, domain_1.monthEndOf)(b.period);
            for (const e of emps) {
                const hours = (await c.query(`SELECT overtime_hours FROM attendance WHERE employee_id = $1 AND att_date BETWEEN $2 AND $3 AND overtime_hours > 0`, [e.id, from, to])).rows.map((r) => Number(r.overtime_hours));
                const ot = (0, domain_1.overtimePay)(Number(e.basic_salary), hours);
                const p = (0, domain_1.computePayslip)({ basic: Number(e.basic_salary), allowance: Number(e.fixed_allowance), overtime: ot, ptkp: e.ptkp });
                const slipNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'PAY', Number(b.period.slice(0, 4)));
                await c.query(`INSERT INTO payslips (company_id, branch_code, doc_no, employee_code, employee_name, dept, period_code, basic, allowance, overtime, deduction, net_pay, status,
                         run_id, employee_id, gross, bpjs_employee, bpjs_employer, pph21, other_deduction, overtime_hours)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draf',$13,$14,$15,$16,$17,$18,$19,$20)`, [u.companyId, b.branch, slipNo, e.code, e.name, e.dept, b.period, e.basic_salary, e.fixed_allowance, ot, p.deduction, p.net, run.id, e.id, p.gross, p.bpjsEmployee, p.bpjsEmployer, p.pph21, p.otherDeduction, hours.reduce((t, h) => t + h, 0)]);
            }
            const slips = (await c.query('SELECT * FROM payslips WHERE run_id = $1', [run.id])).rows;
            await c.query('UPDATE payroll_runs SET totals = $2 WHERE id = $1', [run.id, JSON.stringify(this.totals(slips))]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: b.branch, userId: u.id, sessionId: u.sessionId, action: 'payroll.created', entityType: 'payroll_run', entityId: docNo, after: { period: b.period, employees: emps.length }, requestId });
            return this.loadRun(c, u.companyId, run.id);
        });
    }
    async postRun(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const r = await this.runRow(c, u.companyId, id, true);
            const branch = (0, sales_shared_js_1.trimBranch)(r.branch_code);
            (0, sales_shared_js_1.assertBranch)(u, { ...s, branch: 'ALL' }, branch);
            if (r.status !== 'draf')
                throw (0, errors_js_1.conflict)('PAYROLL_NOT_DRAFT', `Daftar gaji ${r.doc_no} bukan draf.`);
            if (r.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_PAYROLL', 'Penyusun daftar gaji tidak boleh memposting daftar gajinya sendiri (kontrol empat mata).', common_1.HttpStatus.FORBIDDEN);
            const links = await this.refs.links(c, u.companyId);
            const slips = (await c.query('SELECT * FROM payslips WHERE run_id = $1', [id])).rows;
            const lines = (0, domain_1.payrollJournalLines)(slips.map((p) => ({ dept: p.dept, gross: Number(p.gross), bpjsEmployee: Number(p.bpjs_employee), bpjsEmployer: Number(p.bpjs_employer), pph21: Number(p.pph21), otherDeduction: Number(p.other_deduction ?? 0), net: Number(p.net_pay) })), { directLabor: links.directLabor, salaryExpense: links.salaryExpense, salaryPayable: links.salaryPayable, taxPayable: links.taxPayable, bpjsPayable: links.bpjsPayable });
            await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch, date: (0, domain_1.monthEndOf)(r.period_code), source: 'payroll_run', sourceId: id, rule: 'PAYROLL', ref: r.doc_no, description: `Beban gaji ${r.period_code} — ${branch} (${slips.length} karyawan)`, lines });
            await c.query(`UPDATE payslips SET status = 'diproses' WHERE run_id = $1`, [id]);
            await c.query(`UPDATE payroll_runs SET status = 'diposting', posted_by = $2, posted_by_name = $3, posted_at = now() WHERE id = $1`, [id, u.id, u.name]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'payroll.posted', entityType: 'payroll_run', entityId: r.doc_no, after: r.totals, requestId });
            return this.loadRun(c, u.companyId, id);
        });
    }
    async cancelRun(u, s, id, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const r = await this.runRow(c, u.companyId, id, true);
            if (r.status !== 'draf')
                throw (0, errors_js_1.conflict)('PAYROLL_NOT_DRAFT', `Daftar gaji ${r.doc_no} sudah diposting; koreksi lewat jurnal.`);
            await c.query('DELETE FROM payslips WHERE run_id = $1', [id]);
            await c.query(`UPDATE payroll_runs SET status = 'batal' WHERE id = $1`, [id]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(r.branch_code), userId: u.id, sessionId: u.sessionId, action: 'payroll.cancelled', entityType: 'payroll_run', entityId: r.doc_no, after: { reason }, requestId });
            return this.loadRun(c, u.companyId, id);
        });
    }
    /** Slip yang sudah diposting dan belum dibayar (semua cabang yang dapat diakses). */
    async payable(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`SELECT * FROM payslips WHERE company_id = $1 AND status = 'diproses' AND ($2::text IS NULL OR branch_code = $2) ORDER BY period_code, branch_code, employee_name`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(mapSlip));
    }
    async payments(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`SELECT * FROM payroll_payments WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2 OR $2 = ANY(branches)) ORDER BY pay_date DESC, doc_no DESC LIMIT 200`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows
            .map((p) => ({ id: p.id, docNo: p.doc_no, branch: (0, sales_shared_js_1.trimBranch)(p.branch_code), date: p.pay_date, bank: p.bank_account, total: Number(p.total), count: p.slip_count, branches: p.branches, byName: p.created_by_name })));
    }
    async pay(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const bank = await (0, cash_shared_js_1.usableBank)(c, u.companyId, b.bankAccount, 'Rekening pembayaran');
            return (0, sales_shared_js_1.acrossBranches)(c, async () => {
                const slips = (await c.query(`SELECT * FROM payslips WHERE company_id = $1 AND id = ANY($2::uuid[]) FOR UPDATE`, [u.companyId, b.slipIds])).rows;
                if (slips.length !== new Set(b.slipIds).size)
                    throw (0, sales_shared_js_1.invalid)('PAYSLIP_UNKNOWN', 'Sebagian slip tidak ditemukan.');
                const bad = slips.filter((p) => p.status !== 'diproses');
                if (bad.length)
                    throw (0, errors_js_1.conflict)('PAYSLIP_NOT_PAYABLE', `Slip ${bad.map((p) => p.doc_no).join(', ')} belum diposting atau sudah dibayar.`);
                const early = slips.filter((p) => (0, domain_1.monthEndOf)(p.period_code) > b.date && `${p.period_code}-01` > b.date);
                if (early.length)
                    throw (0, sales_shared_js_1.invalid)('PAY_DATE', 'Tanggal bayar sebelum periode gaji.');
                const groups = [...new Set(slips.map((p) => (0, sales_shared_js_1.trimBranch)(p.branch_code)))].map((br) => ({ branch: br, amount: slips.filter((p) => (0, sales_shared_js_1.trimBranch)(p.branch_code) === br).reduce((t, p) => t + Number(p.net_pay), 0) }));
                (0, cash_shared_js_1.assertBranches)(u, [bank.branch_code, ...groups.map((g) => g.branch)]);
                const ho = await (0, cash_shared_js_1.headOffice)(c, u.companyId);
                if (groups.some((g) => g.branch !== bank.branch_code) && bank.branch_code !== ho)
                    throw (0, errors_js_1.forbidden)('Gaji cabang lain hanya dapat dibayar dari rekening kantor pusat.');
                const links = await this.refs.links(c, u.companyId);
                const total = groups.reduce((t, g) => t + g.amount, 0);
                const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'PAYP', Number(b.date.slice(0, 4)));
                const pay = (await c.query(`INSERT INTO payroll_payments (company_id, branch_code, doc_no, pay_date, bank_account, total, slip_count, branches, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [u.companyId, bank.branch_code, docNo, b.date, bank.code, total, slips.length, groups.map((g) => g.branch), u.id, u.name])).rows[0];
                const legs = (0, domain_1.payrollPaymentLegs)(groups, { bankBranch: bank.branch_code, bankGl: bank.gl_account_code, bank: bank.code, salaryPayable: links.salaryPayable, headOffice: ho, rkBranch: links.rkBranch, rkHeadOffice: links.rkHeadOffice });
                for (const leg of legs) {
                    await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch: leg.branch, date: b.date, source: 'payroll_payment', sourceId: pay.id, rule: leg.branch === bank.branch_code ? 'PAYROLL_PAYMENT' : `PAYROLL_PAYMENT_${leg.branch}`, ref: docNo,
                        description: `Pembayaran gaji ${docNo}${leg.branch === bank.branch_code ? '' : ` — dibayar ${bank.branch_code}`}`, lines: leg.lines });
                }
                await c.query(`UPDATE payslips SET status = 'dibayar', paid_date = $2, payment_id = $3 WHERE id = ANY($1::uuid[])`, [b.slipIds, b.date, pay.id]);
                await this.audit.record(c, { companyId: u.companyId, branchCode: bank.branch_code, userId: u.id, sessionId: u.sessionId, action: 'payroll.paid', entityType: 'payroll_payment', entityId: docNo, after: { total, slips: slips.length, bank: bank.code }, requestId });
                const journals = (await c.query(`SELECT id, journal_no, branch_code, rule_code FROM journals WHERE company_id = $1 AND source_type = 'payroll_payment' AND source_id = $2 ORDER BY journal_no`, [u.companyId, pay.id])).rows
                    .map((j) => ({ id: j.id, journalNo: j.journal_no, branch: (0, sales_shared_js_1.trimBranch)(j.branch_code), rule: j.rule_code }));
                return { id: pay.id, docNo, total, count: slips.length, branches: groups.map((g) => g.branch), journals };
            });
        });
    }
};
exports.PayrollService = PayrollService;
exports.PayrollService = PayrollService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], PayrollService);
//# sourceMappingURL=payroll.service.js.map