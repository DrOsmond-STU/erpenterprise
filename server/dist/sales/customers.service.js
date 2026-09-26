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
exports.CustomersService = exports.mapCustomer = void 0;
/**
 * Data induk penjualan: pelanggan (plafon, termin, status) dan produk/jasa.
 * Plafon & status pelanggan mengendalikan persetujuan pesanan (dok. 07 §4.4).
 */
const common_1 = require("@nestjs/common");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const sales_shared_js_1 = require("./sales.shared.js");
const mapCustomer = (r) => ({
    id: r.id, code: r.code, name: r.name, segment: r.segment, pic: r.pic, phone: r.phone, email: r.email, address: r.address, city: r.city, npwp: r.npwp,
    branch: r.branch_code ? (0, sales_shared_js_1.trimBranch)(r.branch_code) : null, creditLimit: r.credit_limit, termsDays: r.terms_days, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
});
exports.mapCustomer = mapCustomer;
const mapProduct = (r) => ({ id: r.id, sku: r.sku, name: r.name, kind: r.kind, unit: r.unit, price: r.price, status: r.status, stock: r.stock ?? [], updatedAt: r.updated_at });
let CustomersService = class CustomersService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    async withExposure(c, companyId, rows) {
        const ex = await (0, sales_shared_js_1.exposures)(c, companyId);
        return rows.map((r) => {
            const e = ex.get(r.id) ?? { openAr: 0, overdue: 0, drafts: 0, openOrders: 0, total: 0 };
            return { ...(0, exports.mapCustomer)(r), exposure: e, available: r.credit_limit - e.total };
        });
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const rows = (await c.query('SELECT * FROM customers WHERE company_id = $1 ORDER BY name', [u.companyId])).rows;
            return this.withExposure(c, u.companyId, rows);
        });
    }
    async get(u, s, id, requestId) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Pelanggan');
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const r = (await c.query('SELECT * FROM customers WHERE company_id = $1 AND id = $2', [u.companyId, id])).rows[0];
            if (!r)
                throw (0, errors_js_1.notFound)('Pelanggan');
            const [cust] = await this.withExposure(c, u.companyId, [r]);
            /* Dokumen di bawah ini mengikuti RLS: hanya cabang yang boleh dilihat pengguna. */
            const invoices = (await c.query(`SELECT id, doc_no, branch_code, invoice_date, due_date, total_gross, paid_amount, status FROM invoices
          WHERE company_id = $1 AND customer_id = $2 ORDER BY invoice_date DESC, doc_no DESC LIMIT 100`, [u.companyId, id])).rows
                .map((i) => ({ id: i.id, docNo: i.doc_no, branch: (0, sales_shared_js_1.trimBranch)(i.branch_code), date: i.invoice_date, dueDate: i.due_date, total: i.total_gross, paid: i.paid_amount, open: i.status === 'batal' || i.status === 'draf' ? 0 : i.total_gross - i.paid_amount, status: i.status }));
            const orders = (await c.query(`SELECT id, doc_no, branch_code, order_date, total, status FROM sales_orders WHERE company_id = $1 AND customer_id = $2 ORDER BY order_date DESC, doc_no DESC LIMIT 100`, [u.companyId, id])).rows
                .map((o) => ({ id: o.id, docNo: o.doc_no, branch: (0, sales_shared_js_1.trimBranch)(o.branch_code), date: o.order_date, total: o.total, status: o.status }));
            return { ...cust, invoices, orders };
        });
    }
    validate(b, creating) {
        const errs = [];
        if (creating && !b.name)
            errs.push('Nama pelanggan wajib diisi.');
        const status = b.status ?? 'aktif';
        if (b.creditLimit !== undefined && status === 'aktif' && creating && b.creditLimit <= 0)
            errs.push('Plafon kredit harus lebih dari nol untuk pelanggan aktif.');
        if (errs.length)
            throw (0, sales_shared_js_1.invalid)('CUSTOMER_INVALID', errs[0], errs);
    }
    async create(u, s, b, requestId) {
        this.validate(b, true);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const dup = await c.query('SELECT code FROM customers WHERE company_id = $1 AND lower(name) = lower($2)', [u.companyId, b.name]);
            if (dup.rowCount)
                throw (0, errors_js_1.conflict)('CUSTOMER_EXISTS', `Pelanggan "${b.name}" sudah terdaftar (${dup.rows[0].code}).`);
            if (b.branch)
                await this.assertBranchExists(c, u.companyId, b.branch);
            const n = (await c.query(`SELECT next_doc_no($1, 'CUST', 0) AS n`, [u.companyId])).rows[0].n;
            const code = `CUST-${String(n).padStart(4, '0')}`;
            const r = (await c.query(`INSERT INTO customers (company_id, code, name, segment, pic, phone, email, address, city, npwp, branch_code, credit_limit, terms_days, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [u.companyId, code, b.name, b.segment ?? 'Langsung', b.pic ?? null, b.phone ?? null, b.email ?? null, b.address ?? null, b.city ?? null, b.npwp ?? null,
                b.branch || null, b.creditLimit ?? 0, b.termsDays ?? 30, b.status ?? 'aktif'])).rows[0];
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'customer.created', entityType: 'customer', entityId: code, after: (0, exports.mapCustomer)(r), requestId });
            return (0, exports.mapCustomer)(r);
        });
    }
    async assertBranchExists(c, companyId, code) {
        const r = await c.query('SELECT 1 FROM branches WHERE company_id = $1 AND code = $2', [companyId, code]);
        if (!r.rowCount)
            throw (0, sales_shared_js_1.invalid)('BRANCH_UNKNOWN', `Cabang ${code} tidak dikenal.`);
    }
    async patch(u, s, id, b, requestId) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Pelanggan');
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const cur = (await c.query('SELECT * FROM customers WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
            if (!cur)
                throw (0, errors_js_1.notFound)('Pelanggan');
            const sensitive = (b.creditLimit !== undefined && b.creditLimit !== cur.credit_limit) || (b.status !== undefined && b.status !== cur.status) || (b.termsDays !== undefined && b.termsDays !== cur.terms_days);
            if (sensitive && (!b.reason || b.reason.trim().length < 3))
                throw (0, sales_shared_js_1.invalid)('REASON_REQUIRED', 'Perubahan plafon, termin, atau status pelanggan wajib diberi alasan.');
            const status = b.status ?? cur.status;
            const limit = b.creditLimit ?? cur.credit_limit;
            if (status === 'aktif' && limit <= 0)
                throw (0, sales_shared_js_1.invalid)('CUSTOMER_INVALID', 'Plafon kredit harus lebih dari nol untuk pelanggan aktif.');
            if (b.name && b.name.toLowerCase() !== cur.name.toLowerCase()) {
                const dup = await c.query('SELECT code FROM customers WHERE company_id = $1 AND lower(name) = lower($2) AND id <> $3', [u.companyId, b.name, id]);
                if (dup.rowCount)
                    throw (0, errors_js_1.conflict)('CUSTOMER_EXISTS', `Nama "${b.name}" sudah dipakai pelanggan ${dup.rows[0].code}.`);
            }
            if (b.branch)
                await this.assertBranchExists(c, u.companyId, b.branch);
            const r = (await c.query(`UPDATE customers SET name = coalesce($3, name), segment = coalesce($4, segment), pic = coalesce($5, pic), phone = coalesce($6, phone), email = coalesce($7, email),
            address = coalesce($8, address), city = coalesce($9, city), npwp = coalesce($10, npwp), branch_code = CASE WHEN $11::text = '' THEN NULL ELSE coalesce($11, branch_code) END,
            credit_limit = $12, terms_days = coalesce($13, terms_days), status = $14, updated_at = now()
          WHERE company_id = $1 AND id = $2 RETURNING *`, [u.companyId, id, b.name ?? null, b.segment ?? null, b.pic ?? null, b.phone ?? null, b.email ?? null, b.address ?? null, b.city ?? null, b.npwp ?? null,
                b.branch === undefined ? null : b.branch ?? '', limit, b.termsDays ?? null, status])).rows[0];
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'customer.updated', entityType: 'customer', entityId: cur.code,
                before: (0, exports.mapCustomer)(cur), after: { ...(0, exports.mapCustomer)(r), reason: b.reason }, requestId });
            const [out] = await this.withExposure(c, u.companyId, [r]);
            return out;
        });
    }
    /* ------------------------------- Produk -------------------------------- */
    async products(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const rows = (await c.query(`SELECT p.*, coalesce((SELECT json_agg(json_build_object('branch', trim(si.branch_code), 'warehouse', si.warehouse_code, 'onHand', si.on_hand, 'avgCost', si.avg_cost) ORDER BY si.branch_code)
                                 FROM stock_items si WHERE si.company_id = p.company_id AND si.sku = p.sku), '[]'::json) AS stock
           FROM products p WHERE p.company_id = $1 ORDER BY p.kind, p.sku`, [u.companyId])).rows;
            return rows.map(mapProduct);
        });
    }
    async createProduct(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const dup = await c.query('SELECT 1 FROM products WHERE company_id = $1 AND sku = $2', [u.companyId, b.sku]);
            if (dup.rowCount)
                throw (0, errors_js_1.conflict)('PRODUCT_EXISTS', `SKU ${b.sku} sudah dipakai.`);
            const r = (await c.query(`INSERT INTO products (company_id, sku, name, kind, unit, price) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [u.companyId, b.sku, b.name, b.kind, b.unit, b.price])).rows[0];
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'product.created', entityType: 'product', entityId: b.sku, after: mapProduct(r), requestId });
            return mapProduct(r);
        });
    }
    async patchProduct(u, s, sku, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const cur = (await c.query('SELECT * FROM products WHERE company_id = $1 AND sku = $2 FOR UPDATE', [u.companyId, sku])).rows[0];
            if (!cur)
                throw (0, errors_js_1.notFound)(`Produk ${sku}`);
            if (b.kind && b.kind !== cur.kind && await this.used(c, u.companyId, cur.id))
                throw (0, sales_shared_js_1.invalid)('PRODUCT_IN_USE', 'Jenis produk yang sudah dipakai dokumen tidak dapat diubah.');
            const r = (await c.query(`UPDATE products SET name = coalesce($3, name), kind = coalesce($4, kind), unit = coalesce($5, unit), price = coalesce($6, price), status = coalesce($7, status), updated_at = now()
          WHERE company_id = $1 AND sku = $2 RETURNING *`, [u.companyId, sku, b.name ?? null, b.kind ?? null, b.unit ?? null, b.price ?? null, b.status ?? null])).rows[0];
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'product.updated', entityType: 'product', entityId: sku, before: mapProduct(cur), after: { ...mapProduct(r), reason: b.reason }, requestId });
            return mapProduct(r);
        });
    }
    async used(c, companyId, productId) {
        const r = await c.query(`SELECT EXISTS (SELECT 1 FROM sales_order_lines WHERE company_id = $1 AND product_id = $2) OR EXISTS (SELECT 1 FROM invoice_lines WHERE company_id = $1 AND product_id = $2) AS used`, [companyId, productId]);
        return Boolean(r.rows[0].used);
    }
    async deleteProduct(u, s, sku, reason, requestId) {
        return this.db.run({ ...(0, db_service_js_1.contextOf)(u, s, requestId), branches: '*' }, async (c) => {
            const cur = (await c.query('SELECT * FROM products WHERE company_id = $1 AND sku = $2 FOR UPDATE', [u.companyId, sku])).rows[0];
            if (!cur)
                throw (0, errors_js_1.notFound)(`Produk ${sku}`);
            if (await this.used(c, u.companyId, cur.id))
                throw (0, sales_shared_js_1.invalid)('PRODUCT_IN_USE', `Produk ${sku} sudah dipakai pesanan/faktur; nonaktifkan saja.`);
            await c.query('DELETE FROM products WHERE company_id = $1 AND id = $2', [u.companyId, cur.id]);
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'product.deleted', entityType: 'product', entityId: sku, before: mapProduct(cur), after: { reason }, requestId });
            return { sku, deleted: true };
        });
    }
};
exports.CustomersService = CustomersService;
exports.CustomersService = CustomersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], CustomersService);
//# sourceMappingURL=customers.service.js.map