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
exports.SuppliersService = exports.mapSupplier = void 0;
/**
 * Pemasok (dok. 07 §6.4). Rekening bank pemasok (K-25): setiap penetapan atau
 * perubahan tercatat sebagai usulan yang harus disetujui orang lain; setelah
 * disetujui, transfer ke rekening itu baru boleh dilakukan setelah masa tunggu.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const mapSupplier = (r) => ({
    id: r.id, code: r.code, name: r.name, category: r.category, pic: r.pic, phone: r.phone, email: r.email, address: r.address, city: r.city, npwp: r.npwp,
    branch: r.branch_code ? (0, sales_shared_js_1.trimBranch)(r.branch_code) : null, termsDays: r.terms_days, leadDays: r.lead_days, status: r.status,
    bank: r.bank_name ? { name: r.bank_name, last4: r.bank_account_last4, holder: r.bank_holder, verifiedAt: r.bank_verified_at } : null,
    bankPending: r.bank_pending ? { ...r.bank_pending, requestedBy: r.bank_pending_by, requestedByName: r.bank_pending_by_name, requestedAt: r.bank_pending_at } : null,
    bankReadyProblem: (0, domain_1.bankCoolingProblem)(r.bank_verified_at),
    createdAt: r.created_at, updatedAt: r.updated_at,
});
exports.mapSupplier = mapSupplier;
let SuppliersService = class SuppliersService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    /** Hutang terbuka per pemasok (lintas cabang, hanya agregat). */
    async exposure(c, companyId) {
        return (0, sales_shared_js_1.acrossBranches)(c, async () => {
            const rows = (await c.query(`SELECT supplier_id, coalesce(sum(total_gross - paid_amount) FILTER (WHERE status IN ('belum-dibayar','sebagian')),0)::bigint AS open,
                coalesce(sum(total_gross - paid_amount) FILTER (WHERE status IN ('belum-dibayar','sebagian') AND due_date < $2),0)::bigint AS overdue
           FROM ap_invoices WHERE company_id = $1 AND supplier_id IS NOT NULL GROUP BY 1`, [companyId, (0, sales_shared_js_1.todayWib)()])).rows;
            const po = (await c.query(`SELECT supplier_id, coalesce(sum(total),0)::bigint AS open_po FROM purchase_orders WHERE company_id = $1 AND status IN ('menunggu','disetujui','diterima-sebagian') GROUP BY 1`, [companyId])).rows;
            const m = new Map();
            for (const r of rows)
                m.set(r.supplier_id, { open: r.open, overdue: r.overdue, openOrders: 0 });
            for (const r of po) {
                const e = m.get(r.supplier_id) ?? { open: 0, overdue: 0, openOrders: 0 };
                e.openOrders = r.open_po;
                m.set(r.supplier_id, e);
            }
            return m;
        });
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const rows = (await c.query('SELECT * FROM suppliers WHERE company_id = $1 ORDER BY name', [u.companyId])).rows;
            /* Posisi hutang hanya bagi pembaca tagihan (gudang cukup melihat data induk). */
            const finance = u.permissions.has('purchasing.invoice.read');
            const ex = finance ? await this.exposure(c, u.companyId) : new Map();
            return rows.map((r) => ({ ...(0, exports.mapSupplier)(r), payable: ex.get(r.id) ?? { open: 0, overdue: 0, openOrders: 0 } }));
        });
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Pemasok');
        const r = (await c.query(`SELECT * FROM suppliers WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Pemasok');
        return r;
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const r = await this.row(c, u.companyId, id);
            if (!u.permissions.has('purchasing.invoice.read'))
                return { ...(0, exports.mapSupplier)(r), payable: { open: 0, overdue: 0, openOrders: 0 } };
            const ex = (await this.exposure(c, u.companyId)).get(id) ?? { open: 0, overdue: 0, openOrders: 0 };
            const invoices = (await c.query(`SELECT id, doc_no, branch_code, invoice_date, due_date, total_gross, paid_amount, status FROM ap_invoices WHERE company_id = $1 AND supplier_id = $2 ORDER BY invoice_date DESC, doc_no DESC LIMIT 100`, [u.companyId, id])).rows
                .map((i) => ({ id: i.id, docNo: i.doc_no, branch: (0, sales_shared_js_1.trimBranch)(i.branch_code), date: i.invoice_date, dueDate: i.due_date, total: i.total_gross, paid: i.paid_amount, open: ['draf', 'batal'].includes(i.status) ? 0 : i.total_gross - i.paid_amount, status: i.status }));
            const orders = (await c.query(`SELECT id, doc_no, branch_code, order_date, total, status FROM purchase_orders WHERE company_id = $1 AND supplier_id = $2 ORDER BY order_date DESC, doc_no DESC LIMIT 100`, [u.companyId, id])).rows
                .map((o) => ({ id: o.id, docNo: o.doc_no, branch: (0, sales_shared_js_1.trimBranch)(o.branch_code), date: o.order_date, total: o.total, status: o.status }));
            return { ...(0, exports.mapSupplier)(r), payable: ex, invoices, orders };
        });
    }
    async create(u, s, b, requestId) {
        if (!b.name)
            throw (0, sales_shared_js_1.invalid)('SUPPLIER_INVALID', 'Nama pemasok wajib diisi.');
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const dup = await c.query('SELECT code FROM suppliers WHERE company_id = $1 AND lower(name) = lower($2)', [u.companyId, b.name]);
            if (dup.rowCount)
                throw (0, errors_js_1.conflict)('SUPPLIER_EXISTS', `Pemasok "${b.name}" sudah terdaftar (${dup.rows[0].code}).`);
            const n = (await c.query(`SELECT next_doc_no($1, 'SUP', 0) AS n`, [u.companyId])).rows[0].n;
            const code = `SUP-${String(n).padStart(4, '0')}`;
            const r = (await c.query(`INSERT INTO suppliers (company_id, code, name, category, pic, phone, email, address, city, npwp, branch_code, terms_days, lead_days, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [u.companyId, code, b.name, b.category ?? null, b.pic ?? null, b.phone ?? null, b.email ?? null, b.address ?? null, b.city ?? null, b.npwp ?? null,
                b.branch || null, b.termsDays ?? 30, b.leadDays ?? 7, b.status ?? 'aktif'])).rows[0];
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'supplier.created', entityType: 'supplier', entityId: code, after: (0, exports.mapSupplier)(r), requestId });
            if (b.bankName && b.bankAccountLast4)
                await this.proposeBank(c, u, r, { bankName: b.bankName, bankAccountLast4: b.bankAccountLast4, bankHolder: b.bankHolder ?? b.name }, 'Rekening awal', requestId);
            return (0, exports.mapSupplier)(await this.row(c, u.companyId, r.id));
        });
    }
    async patch(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const cur = await this.row(c, u.companyId, id, true);
            const sensitive = (b.status !== undefined && b.status !== cur.status) || (b.termsDays !== undefined && b.termsDays !== cur.terms_days);
            if (sensitive && (!b.reason || b.reason.trim().length < 3))
                throw (0, sales_shared_js_1.invalid)('REASON_REQUIRED', 'Perubahan status atau termin pemasok wajib diberi alasan.');
            if (b.name && b.name.toLowerCase() !== cur.name.toLowerCase()) {
                const dup = await c.query('SELECT code FROM suppliers WHERE company_id = $1 AND lower(name) = lower($2) AND id <> $3', [u.companyId, b.name, id]);
                if (dup.rowCount)
                    throw (0, errors_js_1.conflict)('SUPPLIER_EXISTS', `Nama "${b.name}" sudah dipakai pemasok ${dup.rows[0].code}.`);
            }
            const r = (await c.query(`UPDATE suppliers SET name = coalesce($3, name), category = coalesce($4, category), pic = coalesce($5, pic), phone = coalesce($6, phone), email = coalesce($7, email),
            address = coalesce($8, address), city = coalesce($9, city), npwp = coalesce($10, npwp), branch_code = CASE WHEN $11::text = '' THEN NULL ELSE coalesce($11, branch_code) END,
            terms_days = coalesce($12, terms_days), lead_days = coalesce($13, lead_days), status = coalesce($14, status), updated_at = now()
          WHERE company_id = $1 AND id = $2 RETURNING *`, [u.companyId, id, b.name ?? null, b.category ?? null, b.pic ?? null, b.phone ?? null, b.email ?? null, b.address ?? null, b.city ?? null, b.npwp ?? null,
                b.branch === undefined ? null : b.branch ?? '', b.termsDays ?? null, b.leadDays ?? null, b.status ?? null])).rows[0];
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'supplier.updated', entityType: 'supplier', entityId: cur.code, before: (0, exports.mapSupplier)(cur), after: { ...(0, exports.mapSupplier)(r), reason: b.reason }, requestId });
            return (0, exports.mapSupplier)(r);
        });
    }
    async proposeBank(c, u, cur, b, reason, requestId) {
        const pending = { bankName: b.bankName, last4: b.bankAccountLast4, holder: b.bankHolder, reason };
        await c.query(`UPDATE suppliers SET bank_pending = $3::jsonb, bank_pending_by = $4, bank_pending_by_name = $5, bank_pending_at = now(), updated_at = now() WHERE company_id = $1 AND id = $2`, [u.companyId, cur.id, JSON.stringify(pending), u.id, u.name]);
        await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'supplier.bank_proposed', entityType: 'supplier', entityId: cur.code,
            before: cur.bank_name ? { bankName: cur.bank_name, last4: cur.bank_account_last4 } : null, after: pending, requestId });
    }
    /** K-25: usulan rekening baru/ubah; berlaku setelah disetujui orang lain. */
    async requestBank(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const cur = await this.row(c, u.companyId, id, true);
            await this.proposeBank(c, u, cur, b, b.reason, requestId);
            return (0, exports.mapSupplier)(await this.row(c, u.companyId, id));
        });
    }
    async decideBank(u, s, id, approve, note, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const cur = await this.row(c, u.companyId, id, true);
            if (!cur.bank_pending)
                throw (0, errors_js_1.conflict)('NO_PENDING_BANK', `Tidak ada usulan rekening yang menunggu untuk ${cur.name}.`);
            if (cur.bank_pending_by === u.id)
                throw new errors_js_1.DomainError('SOD_SUPPLIER_BANK', 'Pengusul perubahan rekening tidak boleh menyetujui usulannya sendiri (K-25).', common_1.HttpStatus.FORBIDDEN);
            const p = cur.bank_pending;
            if (approve) {
                await c.query(`UPDATE suppliers SET bank_name = $3, bank_account_last4 = $4, bank_holder = $5, bank_verified_at = now(), bank_verified_by = $6,
                         bank_pending = NULL, bank_pending_by = NULL, bank_pending_by_name = NULL, bank_pending_at = NULL, updated_at = now() WHERE company_id = $1 AND id = $2`, [u.companyId, id, p.bankName, p.last4, p.holder, u.id]);
            }
            else {
                await c.query(`UPDATE suppliers SET bank_pending = NULL, bank_pending_by = NULL, bank_pending_by_name = NULL, bank_pending_at = NULL, updated_at = now() WHERE company_id = $1 AND id = $2`, [u.companyId, id]);
            }
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: approve ? 'supplier.bank_approved' : 'supplier.bank_rejected', entityType: 'supplier', entityId: cur.code,
                before: cur.bank_name ? { bankName: cur.bank_name, last4: cur.bank_account_last4 } : null, after: { ...p, note }, requestId });
            return (0, exports.mapSupplier)(await this.row(c, u.companyId, id));
        });
    }
};
exports.SuppliersService = SuppliersService;
exports.SuppliersService = SuppliersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], SuppliersService);
//# sourceMappingURL=suppliers.service.js.map