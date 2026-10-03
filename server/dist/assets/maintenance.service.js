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
exports.MaintenanceService = void 0;
/**
 * Perintah pemeliharaan aset: dijadwalkan → berjalan → selesai. Saat selesai, biaya
 * jasa dibayar dari rekening (Cr bank) dan suku cadang dikeluarkan dari stok
 * (Cr persediaan); keduanya Dr beban pemeliharaan.
 */
const common_1 = require("@nestjs/common");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const cash_shared_js_1 = require("../cash/cash.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const stock_shared_js_1 = require("../inventory/stock.shared.js");
const STATUS_LABEL = { dijadwalkan: 'Dijadwalkan', berjalan: 'Berjalan', selesai: 'Selesai', batal: 'Batal' };
const map = (m) => ({
    id: m.id, docNo: m.doc_no, branch: (0, sales_shared_js_1.trimBranch)(m.branch_code), assetId: m.asset_id, assetCode: m.asset_code, assetName: m.asset_name, kind: m.kind, priority: m.priority,
    assignee: m.assignee, scheduledDate: m.scheduled_date, description: m.description, estimatedCost: Number(m.estimated_cost), status: m.status, statusLabel: STATUS_LABEL[m.status] ?? m.status,
    completedDate: m.completed_date, serviceCost: m.service_cost === null ? null : Number(m.service_cost), partsCost: m.parts_cost === null ? null : Number(m.parts_cost),
    totalCost: m.status === 'selesai' ? Number(m.service_cost ?? 0) + Number(m.parts_cost ?? 0) : null, bank: m.bank_account, legacy: m.legacy, notes: m.notes,
    createdByName: m.created_by_name, completedByName: m.completed_by_name,
});
const SELECT = `SELECT m.*, a.code AS asset_code, a.name AS asset_name FROM maintenance_orders m JOIN assets a ON a.id = m.asset_id`;
let MaintenanceService = class MaintenanceService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`${SELECT} WHERE m.company_id = $1 AND ($2::text IS NULL OR m.branch_code = $2)
          ORDER BY (m.status IN ('dijadwalkan','berjalan')) DESC, m.scheduled_date DESC, m.doc_no DESC LIMIT 1000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(map));
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Perintah pemeliharaan');
        const r = (await c.query(`${SELECT} WHERE m.company_id = $1 AND m.id = $2 ${lock ? 'FOR UPDATE OF m' : ''}`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Perintah pemeliharaan');
        return r;
    }
    async load(c, companyId, id) {
        const m = await this.row(c, companyId, id);
        const parts = (await c.query(`SELECT p.*, (SELECT name FROM stock_items si WHERE si.company_id = p.company_id AND si.sku = p.sku LIMIT 1) AS name FROM maintenance_parts p WHERE p.order_id = $1 ORDER BY p.id`, [id])).rows
            .map((p) => ({ warehouse: p.warehouse_code, sku: p.sku, name: p.name, qty: Number(p.qty), unitCost: Number(p.unit_cost), value: Number(p.value) }));
        const journals = (await c.query(`SELECT id, journal_no, journal_date, rule_code, status, total_debit FROM journals WHERE company_id = $1 AND source_type = 'maintenance_order' AND source_id = $2`, [companyId, id])).rows
            .map((j) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, rule: j.rule_code, status: j.status, total: j.total_debit }));
        return { ...map(m), parts, journals, timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'maintenance_order', m.doc_no) };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    log(c, u, m, action, after, requestId) {
        return this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(m.branch_code), userId: u.id, sessionId: u.sessionId, action: `maintenance.${action}`, entityType: 'maintenance_order', entityId: m.doc_no, after, requestId });
    }
    async create(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            if (!sales_shared_js_1.UUID.test(b.assetId))
                throw (0, sales_shared_js_1.invalid)('ASSET_UNKNOWN', 'Pilih aset.');
            const a = (await c.query('SELECT * FROM assets WHERE company_id = $1 AND id = $2', [u.companyId, b.assetId])).rows[0];
            if (!a)
                throw (0, sales_shared_js_1.invalid)('ASSET_UNKNOWN', 'Aset tidak dikenal.');
            if (a.status !== 'aktif')
                throw (0, sales_shared_js_1.invalid)('ASSET_NOT_ACTIVE', `Aset ${a.code} sudah dilepas.`);
            const branch = (0, sales_shared_js_1.trimBranch)(a.branch_code);
            (0, sales_shared_js_1.assertBranch)(u, s, branch);
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'MNT', Number(b.scheduledDate.slice(0, 4)));
            const r = (await c.query(`INSERT INTO maintenance_orders (company_id, branch_code, doc_no, asset_id, kind, priority, assignee, scheduled_date, description, estimated_cost, created_by, created_by_name)
                                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [u.companyId, branch, docNo, a.id, b.kind, b.priority, b.assignee ?? null, b.scheduledDate, b.description, b.estimatedCost ?? 0, u.id, u.name])).rows[0];
            await this.log(c, u, r, 'created', { asset: a.code, kind: b.kind, estimate: b.estimatedCost }, requestId);
            return this.load(c, u.companyId, r.id);
        });
    }
    async start(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const m = await this.row(c, u.companyId, id, true);
            if (m.status !== 'dijadwalkan')
                throw (0, errors_js_1.conflict)('MAINT_STATUS', `Perintah ${m.doc_no} berstatus ${STATUS_LABEL[m.status]}.`);
            await c.query(`UPDATE maintenance_orders SET status = 'berjalan' WHERE id = $1`, [id]);
            await this.log(c, u, m, 'started', {}, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    async complete(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const m = await this.row(c, u.companyId, id, true);
            const branch = (0, sales_shared_js_1.trimBranch)(m.branch_code);
            (0, sales_shared_js_1.assertBranch)(u, { ...s, branch: 'ALL' }, branch);
            if (m.status !== 'dijadwalkan' && m.status !== 'berjalan')
                throw (0, errors_js_1.conflict)('MAINT_STATUS', `Perintah ${m.doc_no} berstatus ${STATUS_LABEL[m.status]}.`);
            const date = b.date ?? (0, sales_shared_js_1.todayWib)();
            const links = await this.refs.links(c, u.companyId);
            let bank = null;
            if (b.serviceCost > 0) {
                if (!b.bank)
                    throw (0, sales_shared_js_1.invalid)('MAINT_BANK', 'Pilih rekening pembayaran biaya jasa.');
                bank = await (0, cash_shared_js_1.usableBank)(c, u.companyId, b.bank, 'Rekening');
                if (bank.branch_code !== branch)
                    throw (0, sales_shared_js_1.invalid)('BANK_BRANCH', `Rekening ${bank.code} bukan milik cabang ${branch}.`);
            }
            const byAccount = new Map();
            let parts = 0;
            for (const p of b.parts ?? []) {
                const wh = await (0, stock_shared_js_1.warehouseOf)(c, u.companyId, p.warehouse);
                if (wh.branch_code !== branch)
                    throw (0, sales_shared_js_1.invalid)('WAREHOUSE_BRANCH', `Gudang ${wh.code} bukan milik cabang ${branch}.`);
                const out = await (0, stock_shared_js_1.issueStock)(c, u, links, { branch, warehouse: wh.code, sku: p.sku, qty: p.qty, date, refType: 'maintenance', refId: id, refNo: m.doc_no });
                await c.query('INSERT INTO maintenance_parts (order_id, company_id, branch_code, warehouse_code, sku, qty, unit_cost, value) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, u.companyId, branch, wh.code, p.sku, p.qty, out.unitCost, out.value]);
                (0, stock_shared_js_1.addTo)(byAccount, out.account, out.value);
                parts += out.value;
            }
            const total = b.serviceCost + parts;
            if (total <= 0)
                throw (0, sales_shared_js_1.invalid)('MAINT_ZERO', 'Isi biaya jasa atau suku cadang yang dipakai.');
            await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch, date, source: 'maintenance_order', sourceId: id, rule: 'MAINTENANCE', ref: m.doc_no, description: `Pemeliharaan ${m.asset_code} — ${m.description}`,
                lines: [{ account: links.maintenanceExpense, debit: total, credit: 0, memo: null },
                    ...(b.serviceCost > 0 ? [{ account: bank.gl_account_code, debit: 0, credit: b.serviceCost, bank: bank.code, memo: 'Biaya jasa' }] : []),
                    ...[...byAccount].map(([acc, v]) => ({ account: acc, debit: 0, credit: v, memo: 'Suku cadang dari stok' }))] });
            await c.query(`UPDATE maintenance_orders SET status = 'selesai', completed_date = $2, service_cost = $3, parts_cost = $4, bank_account = $5, notes = coalesce($6, notes), completed_by_name = $7 WHERE id = $1`, [id, date, b.serviceCost, parts, bank?.code ?? null, b.notes ?? null, u.name]);
            await this.log(c, u, m, 'completed', { service: b.serviceCost, parts, total }, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    async cancel(u, s, id, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const m = await this.row(c, u.companyId, id, true);
            if (m.status !== 'dijadwalkan' && m.status !== 'berjalan')
                throw (0, errors_js_1.conflict)('MAINT_STATUS', `Perintah ${m.doc_no} berstatus ${STATUS_LABEL[m.status]}.`);
            await c.query(`UPDATE maintenance_orders SET status = 'batal', notes = coalesce(notes || ' — ', '') || $2 WHERE id = $1`, [id, `Batal: ${reason}`]);
            await this.log(c, u, m, 'cancelled', { reason }, requestId);
            return this.load(c, u.companyId, id);
        });
    }
};
exports.MaintenanceService = MaintenanceService;
exports.MaintenanceService = MaintenanceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], MaintenanceService);
//# sourceMappingURL=maintenance.service.js.map