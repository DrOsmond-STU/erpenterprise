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
exports.SupplierPaymentsService = void 0;
/**
 * Pembayaran pemasok (dok. 07 §6.6; dok. 11 K-25, K-26).
 *  menunggu → (1 penyetuju, atau 2 penyetuju berbeda di atas ambang) → disetujui → dibayar.
 *  Pembuat tidak boleh menyetujui; penyetuju yang sama tidak dihitung dua kali.
 *  Eksekusi transfer memerlukan rekening pemasok terverifikasi yang sudah melewati
 *  masa tunggu dan tanpa usulan perubahan yang tertunda. Jurnal Dr utang / Cr bank.
 * Umur hutang per tanggal (akhir periode konteks) cocok dengan buku besar utang usaha.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const ap_invoices_service_js_1 = require("./ap-invoices.service.js");
const SELECT = `SELECT p.*, i.doc_no AS invoice_no, i.supplier_name, b.name AS bank_name, j.journal_no
  FROM supplier_payments p JOIN ap_invoices i ON i.id = p.invoice_id
  LEFT JOIN bank_accounts b ON b.company_id = p.company_id AND b.code = p.bank_account_code LEFT JOIN journals j ON j.id = p.journal_id`;
let SupplierPaymentsService = class SupplierPaymentsService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`${SELECT} WHERE p.company_id = $1 AND ($2::text IS NULL OR p.branch_code = $2) ORDER BY (p.status IN ('menunggu','disetujui')) DESC, p.payment_date DESC, p.doc_no DESC LIMIT 5000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(ap_invoices_service_js_1.mapPaymentRow));
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Pembayaran');
        if (lock)
            await c.query('SELECT 1 FROM supplier_payments WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
        const r = (await c.query(`${SELECT} WHERE p.company_id = $1 AND p.id = $2`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Pembayaran');
        return r;
    }
    async load(c, companyId, id) {
        const p = await this.row(c, companyId, id);
        const inv = (await c.query('SELECT * FROM ap_invoices WHERE id = $1', [p.invoice_id])).rows[0];
        const sup = p.supplier_id ? (await c.query('SELECT * FROM suppliers WHERE id = $1', [p.supplier_id])).rows[0] : null;
        return {
            ...(0, ap_invoices_service_js_1.mapPaymentRow)(p), invoice: (0, ap_invoices_service_js_1.mapApInvoice)(inv),
            supplierBank: sup ? { name: sup.bank_name, last4: sup.bank_account_last4, holder: sup.bank_holder, verifiedAt: sup.bank_verified_at, pending: Boolean(sup.bank_pending), readyProblem: sup.bank_pending ? 'Ada usulan perubahan rekening pemasok yang belum diputus.' : (0, domain_1.bankCoolingProblem)(sup.bank_verified_at) } : null,
            timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'supplier_payment', p.doc_no),
        };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    async bank(c, companyId, code, branch) {
        const bank = (await c.query('SELECT * FROM bank_accounts WHERE company_id = $1 AND code = $2', [companyId, code])).rows[0];
        if (!bank)
            throw (0, sales_shared_js_1.invalid)('BANK_UNKNOWN', `Rekening ${code} tidak dikenal.`);
        if ((0, sales_shared_js_1.trimBranch)(bank.branch_code) !== branch)
            throw (0, sales_shared_js_1.invalid)('BANK_BRANCH', `Rekening ${bank.code} milik cabang ${(0, sales_shared_js_1.trimBranch)(bank.branch_code)}, bukan cabang tagihan ${branch}.`);
        if (bank.status !== 'aktif' || bank.currency !== 'IDR')
            throw (0, sales_shared_js_1.invalid)('BANK_INACTIVE', `Rekening ${bank.code} nonaktif atau berdenominasi valas.`);
        if (!bank.gl_account_code)
            throw (0, sales_shared_js_1.invalid)('BANK_NO_ACCOUNT', `Rekening ${bank.code} belum memiliki akun buku besar.`);
        return bank;
    }
    /** Usulan pembayaran: jumlah ≤ sisa tagihan − pembayaran lain yang masih berjalan. */
    async create(u, s, b, requestId) {
        if (!sales_shared_js_1.UUID.test(b.invoiceId ?? ''))
            throw (0, sales_shared_js_1.invalid)('INVOICE_REQUIRED', 'Pilih tagihan pemasok.');
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            await c.query('SELECT 1 FROM ap_invoices WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, b.invoiceId]);
            const i = (await c.query('SELECT * FROM ap_invoices WHERE company_id = $1 AND id = $2', [u.companyId, b.invoiceId])).rows[0];
            if (!i)
                throw (0, errors_js_1.notFound)('Tagihan pemasok');
            if (!['belum-dibayar', 'sebagian'].includes(i.status))
                throw (0, errors_js_1.conflict)('AP_INVOICE_NOT_OPEN', `Tagihan ${i.doc_no} berstatus ${i.status}; pembayaran tidak dapat diajukan.`);
            const branch = (0, sales_shared_js_1.trimBranch)(i.branch_code);
            if (s.branch !== 'ALL' && s.branch !== branch)
                throw (0, errors_js_1.forbidden)(`Tagihan cabang ${branch} tidak dapat dibayar dari konteks cabang ${s.branch}.`);
            const pending = Number((await c.query(`SELECT coalesce(sum(amount),0) AS v FROM supplier_payments WHERE invoice_id = $1 AND status IN ('menunggu','disetujui')`, [i.id])).rows[0].v);
            const open = i.total_gross - i.paid_amount - pending;
            if (!(b.amount > 0))
                throw (0, sales_shared_js_1.invalid)('PAYMENT_AMOUNT', 'Jumlah pembayaran harus lebih dari nol.');
            if (b.amount > open)
                throw (0, sales_shared_js_1.invalid)('PAYMENT_OVERPAY', `Pembayaran melebihi sisa tagihan yang belum diajukan (sisa Rp ${Math.max(open, 0).toLocaleString('id-ID')}).`);
            const bank = await this.bank(c, u.companyId, b.bankAccount, branch);
            const date = b.date ?? (0, sales_shared_js_1.todayWib)();
            if (date < i.invoice_date)
                throw (0, sales_shared_js_1.invalid)('PAYMENT_DATE', 'Tanggal pembayaran tidak boleh sebelum tanggal tagihan.');
            const sup = i.supplier_id ? (await c.query('SELECT status, name FROM suppliers WHERE id = $1', [i.supplier_id])).rows[0] : null;
            if (sup?.status === 'diblokir')
                throw (0, sales_shared_js_1.invalid)('SUPPLIER_BLOCKED', `Pemasok ${sup.name} diblokir; pembayaran tidak dapat diajukan.`);
            const pol = await (0, sales_shared_js_1.companyPolicies)(c, u.companyId);
            const required = (0, domain_1.paymentApprovalsRequired)(b.amount, pol.paymentDualApprovalThreshold);
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'PAY', Number(date.slice(0, 4)));
            const p = (await c.query(`INSERT INTO supplier_payments (company_id, branch_code, doc_no, payment_date, invoice_id, supplier_id, amount, bank_account_code, method, reference, required_approvals, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [u.companyId, branch, docNo, date, i.id, i.supplier_id, b.amount, bank.code, b.method ?? 'transfer', b.reference ?? null, required, u.id, u.name])).rows[0];
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'supplier_payment.requested', entityType: 'supplier_payment', entityId: docNo,
                after: { invoice: i.doc_no, supplier: i.supplier_name, amount: b.amount, bank: bank.code, requiredApprovals: required, threshold: pol.paymentDualApprovalThreshold }, requestId });
            return this.load(c, u.companyId, p.id);
        });
    }
    async approve(u, s, id, note, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const p = await this.row(c, u.companyId, id, true);
            if (p.status !== 'menunggu')
                throw (0, errors_js_1.conflict)('PAYMENT_NOT_PENDING', `Pembayaran ${p.doc_no} tidak sedang menunggu persetujuan.`);
            if (p.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_PAYMENT', 'Pengaju pembayaran tidak boleh menyetujui pembayarannya sendiri (kontrol empat mata).', common_1.HttpStatus.FORBIDDEN);
            const approvals = p.approvals ?? [];
            if (approvals.some((a) => a.userId === u.id))
                throw new errors_js_1.DomainError('PAYMENT_ALREADY_APPROVED', 'Anda sudah menyetujui pembayaran ini; persetujuan kedua harus dari orang lain (K-26).', common_1.HttpStatus.CONFLICT);
            approvals.push({ userId: u.id, name: u.name, at: new Date().toISOString(), note: note ?? null });
            const done = approvals.length >= p.required_approvals;
            await c.query(`UPDATE supplier_payments SET approvals = $2::jsonb, status = $3, updated_at = now() WHERE id = $1`, [id, JSON.stringify(approvals), done ? 'disetujui' : 'menunggu']);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(p.branch_code), userId: u.id, sessionId: u.sessionId, action: done ? 'supplier_payment.approved' : 'supplier_payment.approval_recorded',
                entityType: 'supplier_payment', entityId: p.doc_no, after: { approval: approvals.length, of: p.required_approvals, note }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async reject(u, s, id, note, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const p = await this.row(c, u.companyId, id, true);
            if (!['menunggu', 'disetujui'].includes(p.status))
                throw (0, errors_js_1.conflict)('PAYMENT_NOT_PENDING', `Pembayaran ${p.doc_no} tidak dapat ditolak.`);
            if (p.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_PAYMENT', 'Pengaju tidak dapat menolak pembayarannya sendiri — gunakan pembatalan.', common_1.HttpStatus.FORBIDDEN);
            await c.query(`UPDATE supplier_payments SET status = 'ditolak', decision_note = $2, updated_at = now() WHERE id = $1`, [id, note]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(p.branch_code), userId: u.id, sessionId: u.sessionId, action: 'supplier_payment.rejected', entityType: 'supplier_payment', entityId: p.doc_no, after: { note }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async cancel(u, s, id, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const p = await this.row(c, u.companyId, id, true);
            if (!['menunggu', 'disetujui'].includes(p.status))
                throw (0, errors_js_1.conflict)('PAYMENT_LOCKED', `Pembayaran ${p.doc_no} berstatus ${p.status}; tidak dapat dibatalkan.`);
            if (p.created_by !== u.id && !u.permissions.has('purchasing.payment.approve'))
                throw (0, errors_js_1.forbidden)('Hanya pengaju atau penyetuju yang dapat membatalkan pembayaran.');
            await c.query(`UPDATE supplier_payments SET status = 'batal', decision_note = $2, updated_at = now() WHERE id = $1`, [id, reason]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(p.branch_code), userId: u.id, sessionId: u.sessionId, action: 'supplier_payment.cancelled', entityType: 'supplier_payment', entityId: p.doc_no, after: { reason }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    /** Eksekusi pembayaran yang sudah disetujui: jurnal Dr utang usaha / Cr bank. */
    async pay(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const p = await this.row(c, u.companyId, id, true);
            if (p.status !== 'disetujui')
                throw (0, errors_js_1.conflict)('PAYMENT_NOT_APPROVED', `Pembayaran ${p.doc_no} belum disetujui (${(p.approvals ?? []).length}/${p.required_approvals} persetujuan).`);
            await c.query('SELECT 1 FROM ap_invoices WHERE id = $1 FOR UPDATE', [p.invoice_id]);
            const i = (await c.query('SELECT * FROM ap_invoices WHERE id = $1', [p.invoice_id])).rows[0];
            if (!['belum-dibayar', 'sebagian'].includes(i.status))
                throw (0, errors_js_1.conflict)('AP_INVOICE_NOT_OPEN', `Tagihan ${i.doc_no} berstatus ${i.status}.`);
            if (p.amount > i.total_gross - i.paid_amount)
                throw (0, sales_shared_js_1.invalid)('PAYMENT_OVERPAY', 'Pembayaran melebihi sisa tagihan.');
            const branch = (0, sales_shared_js_1.trimBranch)(p.branch_code);
            const sup = p.supplier_id ? (await c.query('SELECT * FROM suppliers WHERE id = $1', [p.supplier_id])).rows[0] : null;
            if (sup?.status === 'diblokir')
                throw (0, sales_shared_js_1.invalid)('SUPPLIER_BLOCKED', `Pemasok ${sup.name} diblokir; pembayaran ditahan.`);
            if (p.method === 'transfer') {
                if (!sup)
                    throw (0, sales_shared_js_1.invalid)('SUPPLIER_BANK_UNVERIFIED', 'Tagihan tanpa data pemasok tidak dapat ditransfer.');
                if (sup.bank_pending)
                    throw (0, sales_shared_js_1.invalid)('SUPPLIER_BANK_PENDING', `Ada usulan perubahan rekening ${sup.name} yang belum diputus; transfer ditahan (K-25).`);
                const why = (0, domain_1.bankCoolingProblem)(sup.bank_verified_at);
                if (why)
                    throw (0, sales_shared_js_1.invalid)('SUPPLIER_BANK_COOLING', why);
            }
            const bank = await this.bank(c, u.companyId, p.bank_account_code, branch);
            const date = b.date ?? (p.payment_date > (0, sales_shared_js_1.todayWib)() ? p.payment_date : (0, sales_shared_js_1.todayWib)());
            if (date < i.invoice_date)
                throw (0, sales_shared_js_1.invalid)('PAYMENT_DATE', 'Tanggal pembayaran tidak boleh sebelum tanggal tagihan.');
            const links = await this.refs.links(c, u.companyId);
            const j = await (0, sales_shared_js_1.postAutoJournal)(c, u, {
                branch, date, source: 'supplier_payment', sourceId: id, rule: 'PURCHASE_PAYMENT', ref: i.doc_no, description: `Pembayaran ${p.doc_no} — ${i.supplier_name} (${i.doc_no})`,
                lines: [{ account: links.ap, debit: p.amount, credit: 0, party: i.supplier_name }, { account: bank.gl_account_code, debit: 0, credit: p.amount, bank: bank.code }],
            });
            await c.query(`UPDATE supplier_payments SET status = 'dibayar', payment_date = $2, reference = coalesce($3, reference), journal_id = $4, paid_at = now(), paid_by = $5, paid_by_name = $6, updated_at = now() WHERE id = $1`, [id, date, b.reference ?? null, j.id, u.id, u.name]);
            const paid = i.paid_amount + p.amount;
            await c.query(`UPDATE ap_invoices SET paid_amount = $2, paid_date = GREATEST(coalesce(paid_date, $3::date), $3::date), bank_account_code = $4, status = $5, updated_at = now() WHERE id = $1`, [i.id, paid, date, bank.code, (0, domain_1.invoiceStatus)(i.total_gross, paid)]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'supplier_payment.paid', entityType: 'supplier_payment', entityId: p.doc_no,
                after: { invoice: i.doc_no, amount: p.amount, bank: bank.code, journal: j.journalNo, approvals: (p.approvals ?? []).map((a) => a.name) }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    /**
     * Hutang per tanggal (akhir periode konteks, paling lambat hari ini):
     * sisa = tagihan terposting − pembayaran dibayar s.d. tanggal itu; sama dengan
     * pemeriksaan rekonsiliasi utang usaha.
     */
    async payables(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
            const today = (0, sales_shared_js_1.todayWib)();
            const asOf = period.to < today ? period.to : today;
            const b = s.branch === 'ALL' ? null : s.branch;
            const rows = (await c.query(`SELECT i.*, s.code AS supplier_code,
                i.total_gross - coalesce((SELECT sum(p.amount) FROM supplier_payments p WHERE p.invoice_id = i.id AND p.status = 'dibayar' AND p.payment_date <= $2), 0) AS open_asof,
                (SELECT coalesce(sum(p.amount),0) FROM supplier_payments p WHERE p.invoice_id = i.id AND p.status IN ('menunggu','disetujui')) AS pending_payments
           FROM ap_invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id
          WHERE i.company_id = $1 AND i.status <> 'draf' AND i.invoice_date <= $2 AND (i.status <> 'batal' OR i.cancel_date > $2)
            AND ($3::text IS NULL OR i.branch_code = $3)
          ORDER BY i.due_date`, [u.companyId, asOf, b])).rows;
            const open = rows.filter((r) => Number(r.open_asof) > 0).map((r) => ({ ...(0, ap_invoices_service_js_1.mapApInvoice)({ ...r, paid_amount: r.total_gross - Number(r.open_asof), status: r.status === 'batal' ? 'belum-dibayar' : r.status }, asOf), open: Number(r.open_asof) }));
            const buckets = (0, domain_1.aging)(open.map((x) => ({ dueDate: x.dueDate, open: x.open })), asOf);
            const total = open.reduce((t, x) => t + x.open, 0);
            const overdue = open.filter((x) => x.dueDate < asOf).reduce((t, x) => t + x.open, 0);
            const bySupplier = new Map();
            for (const x of open) {
                const k = x.supplierId ?? x.supplierName;
                const e = bySupplier.get(k) ?? { supplierId: x.supplierId, supplierName: x.supplierName, supplierCode: x.supplierCode, open: 0, overdue: 0, count: 0, oldestDays: 0, pending: 0 };
                e.open += x.open;
                e.count += 1;
                e.pending += x.pendingPayments ?? 0;
                if (x.dueDate < asOf) {
                    e.overdue += x.open;
                    e.oldestDays = Math.max(e.oldestDays, (0, domain_1.daysBetween)(x.dueDate, asOf));
                }
                bySupplier.set(k, e);
            }
            /* DPO = hutang ÷ pembelian 90 hari terakhir × 90. Jatuh tempo 7 hari ke depan untuk rencana kas. */
            const purchases90 = Number((await c.query(`SELECT coalesce(sum(total_gross),0)::bigint AS v FROM ap_invoices WHERE company_id = $1 AND status NOT IN ('draf','batal') AND invoice_date BETWEEN ($2::date - 89) AND $2 AND ($3::text IS NULL OR branch_code = $3)`, [u.companyId, asOf, b])).rows[0].v);
            const paidPeriod = Number((await c.query(`SELECT coalesce(sum(amount),0)::bigint AS v FROM supplier_payments WHERE company_id = $1 AND status = 'dibayar' AND payment_date BETWEEN $2 AND $3 AND ($4::text IS NULL OR branch_code = $4)`, [u.companyId, period.from, asOf, b])).rows[0].v);
            const pendingApproval = (await c.query(`SELECT count(*)::int AS n, coalesce(sum(amount),0)::bigint AS v FROM supplier_payments WHERE company_id = $1 AND status IN ('menunggu','disetujui') AND ($2::text IS NULL OR branch_code = $2)`, [u.companyId, b])).rows[0];
            const dueSoon = open.filter((x) => x.dueDate >= asOf && (0, domain_1.daysBetween)(asOf, x.dueDate) <= 7).reduce((t, x) => t + x.open, 0);
            const bal = await this.refs.balances(c, u.companyId, b, period.from, asOf);
            const gl = bal[(await this.refs.links(c, u.companyId)).ap]?.ending ?? 0;
            return {
                asOf, period, scope: s.branch,
                kpi: { total, overdue, overduePct: total ? overdue / total : 0, count: open.length, dpo: purchases90 ? Math.round((total / purchases90) * 90) : 0, paid: paidPeriod, dueSoon,
                    pendingCount: pendingApproval.n, pendingAmount: Number(pendingApproval.v), ledger: gl, reconciled: Math.abs(gl - total) < 1 },
                aging: buckets, suppliers: [...bySupplier.values()].sort((a, b2) => b2.open - a.open), invoices: open,
            };
        });
    }
};
exports.SupplierPaymentsService = SupplierPaymentsService;
exports.SupplierPaymentsService = SupplierPaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], SupplierPaymentsService);
//# sourceMappingURL=payments.service.js.map