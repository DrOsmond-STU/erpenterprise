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
exports.CostCentersService = void 0;
/**
 * Master pusat biaya: berlaku untuk seluruh cabang perusahaan, hierarki opsional
 * (induk) dan jenis pusat biaya/pusat laba. Pusat biaya yang sudah dipakai jurnal,
 * dokumen, karyawan, atau anggaran tidak dapat dihapus — nonaktifkan saja.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const mapCc = (r) => ({
    id: r.id, code: r.code, name: r.name, kind: r.kind, kindLabel: domain_1.COST_CENTER_KIND_LABEL[r.kind] ?? r.kind,
    parentId: r.parent_id, parentCode: r.parent_code ?? null, parentName: r.parent_name ?? null, managerName: r.manager_name, description: r.description, status: r.status,
    createdByName: r.created_by_name, createdAt: r.created_at, updatedAt: r.updated_at,
});
/* Pemakaian yang mengunci penghapusan. */
const USAGE = `SELECT
    (SELECT count(*) FROM journal_lines WHERE company_id = $1 AND cost_center_id = $2)::int AS lines,
    (SELECT count(*) FROM budgets WHERE company_id = $1 AND cost_center_id = $2)::int AS budgets,
    (SELECT count(*) FROM employees WHERE company_id = $1 AND cost_center_id = $2)::int AS employees,
    (SELECT count(*) FROM cost_centers WHERE company_id = $1 AND parent_id = $2)::int AS children,
    ((SELECT count(*) FROM invoices WHERE company_id = $1 AND cost_center_id = $2) + (SELECT count(*) FROM ap_invoices WHERE company_id = $1 AND cost_center_id = $2)
     + (SELECT count(*) FROM purchase_orders WHERE company_id = $1 AND cost_center_id = $2) + (SELECT count(*) FROM purchase_requisitions WHERE company_id = $1 AND cost_center_id = $2))::int AS documents`;
let CostCentersService = class CostCentersService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    rec(c, u, action, code, before, after, requestId) {
        return this.audit.record(c, { companyId: u.companyId, branchCode: null, userId: u.id, sessionId: u.sessionId, action, entityType: 'cost_center', entityId: code, before, after, requestId });
    }
    /** Daftar + realisasi tahun berjalan (pendapatan & beban bertanda) dalam cakupan cabang. */
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const rows = (await c.query(`SELECT cc.*, p.code AS parent_code, p.name AS parent_name FROM cost_centers cc LEFT JOIN cost_centers p ON p.id = cc.parent_id
          WHERE cc.company_id = $1 ORDER BY coalesce(p.code, cc.code), cc.parent_id NULLS FIRST, cc.code`, [u.companyId])).rows;
            const year = Number((0, sales_shared_js_1.todayWib)().slice(0, 4));
            const act = (await c.query(`SELECT l.cost_center_id, coalesce(sum(l.credit - l.debit) FILTER (WHERE l.account_code LIKE '4-%'), 0)::bigint AS revenue,
                coalesce(sum(l.debit - l.credit) FILTER (WHERE l.account_code LIKE '5-%'), 0)::bigint AS expense, count(*)::int AS lines
           FROM journal_lines l JOIN journals j ON j.id = l.journal_id
          WHERE l.company_id = $1 AND l.cost_center_id IS NOT NULL AND j.status IN ('posted','reversed') AND extract(year FROM l.journal_date) = $2
            AND ($3::text IS NULL OR l.branch_code = $3) GROUP BY 1`, [u.companyId, year, s.branch === 'ALL' ? null : s.branch])).rows;
            const emp = (await c.query(`SELECT cost_center_id, count(*)::int AS n FROM employees WHERE company_id = $1 AND status = 'aktif' AND cost_center_id IS NOT NULL GROUP BY 1`, [u.companyId])).rows;
            const by = new Map(act.map((r) => [r.cost_center_id, r]));
            const empBy = new Map(emp.map((r) => [r.cost_center_id, r.n]));
            return {
                year,
                data: rows.map((r) => {
                    const a = by.get(r.id);
                    return { ...mapCc(r), ytdRevenue: Number(a?.revenue ?? 0), ytdExpense: Number(a?.expense ?? 0), ytdNet: Number(a?.revenue ?? 0) - Number(a?.expense ?? 0), ytdLines: a?.lines ?? 0, employees: empBy.get(r.id) ?? 0 };
                }),
            };
        });
    }
    /** Pusat biaya aktif untuk pilihan dimensi (jurnal, dokumen, karyawan, anggaran). */
    async options(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`SELECT cc.id, cc.code, cc.name, cc.kind, cc.parent_id AS "parentId" FROM cost_centers cc WHERE cc.company_id = $1 AND cc.status = 'aktif' ORDER BY cc.code`, [u.companyId])).rows);
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Pusat biaya');
        const r = (await c.query(`SELECT cc.*, p.code AS parent_code, p.name AS parent_name FROM cost_centers cc LEFT JOIN cost_centers p ON p.id = cc.parent_id
                               WHERE cc.company_id = $1 AND cc.id = $2 ${lock ? 'FOR UPDATE OF cc' : ''}`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Pusat biaya');
        return r;
    }
    async load(c, companyId, id) {
        const r = await this.row(c, companyId, id);
        const usage = (await c.query(USAGE, [companyId, id])).rows[0];
        const children = (await c.query('SELECT id, code, name, status FROM cost_centers WHERE company_id = $1 AND parent_id = $2 ORDER BY code', [companyId, id])).rows;
        return { ...mapCc(r), usage, children, deletable: !usage.lines && !usage.budgets && !usage.employees && !usage.children && !usage.documents, timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'cost_center', r.code) };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    async checkParent(c, companyId, id, parentId) {
        if (!parentId)
            return null;
        if (!sales_shared_js_1.UUID.test(parentId))
            throw (0, sales_shared_js_1.invalid)('COST_CENTER_PARENT', 'Induk pusat biaya tidak dikenal.');
        const all = (await c.query('SELECT id, parent_id AS "parentId", status, code FROM cost_centers WHERE company_id = $1', [companyId])).rows;
        const p = all.find((x) => x.id === parentId);
        if (!p)
            throw (0, sales_shared_js_1.invalid)('COST_CENTER_PARENT', 'Induk pusat biaya tidak dikenal.');
        if (id && (0, domain_1.costCenterCycle)(all, id, parentId))
            throw (0, sales_shared_js_1.invalid)('COST_CENTER_CYCLE', `Pusat biaya ${p.code} berada di bawah pusat biaya ini; hierarki tidak boleh melingkar.`);
        return parentId;
    }
    async create(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const code = String(b.code ?? '').trim().toUpperCase();
            if ((await c.query('SELECT 1 FROM cost_centers WHERE company_id = $1 AND code = $2', [u.companyId, code])).rowCount)
                throw (0, errors_js_1.conflict)('COST_CENTER_EXISTS', `Kode pusat biaya ${code} sudah dipakai.`);
            const parentId = await this.checkParent(c, u.companyId, null, b.parentId);
            const r = (await c.query(`INSERT INTO cost_centers (company_id, code, name, kind, parent_id, manager_name, description, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [u.companyId, code, b.name.trim(), b.kind ?? 'biaya', parentId, b.managerName?.trim() || null, b.description?.trim() || null, u.id, u.name])).rows[0];
            await this.rec(c, u, 'cost_center.created', code, null, { name: b.name, kind: b.kind ?? 'biaya', parentId }, requestId);
            return this.load(c, u.companyId, r.id);
        });
    }
    async update(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const r = await this.row(c, u.companyId, id, true);
            if (b.code !== undefined && b.code.trim().toUpperCase() !== r.code)
                throw (0, sales_shared_js_1.invalid)('COST_CENTER_CODE_IMMUTABLE', `Kode pusat biaya ${r.code} tidak dapat diubah; buat pusat biaya baru bila perlu.`);
            const parentId = b.parentId === undefined ? r.parent_id : await this.checkParent(c, u.companyId, id, b.parentId);
            if (b.status === 'nonaktif' && r.status !== 'nonaktif') {
                const act = Number((await c.query(`SELECT count(*) FROM cost_centers WHERE company_id = $1 AND parent_id = $2 AND status = 'aktif'`, [u.companyId, id])).rows[0].count);
                if (act)
                    throw (0, errors_js_1.conflict)('COST_CENTER_HAS_ACTIVE_CHILDREN', `Pusat biaya ${r.code} masih memiliki ${act} pusat biaya aktif di bawahnya.`);
            }
            await c.query(`UPDATE cost_centers SET name = coalesce($2, name), kind = coalesce($3, kind), parent_id = $4, manager_name = CASE WHEN $5::boolean THEN $6 ELSE manager_name END,
            description = CASE WHEN $7::boolean THEN $8 ELSE description END, status = coalesce($9, status), updated_at = now() WHERE id = $1`, [id, b.name?.trim() || null, b.kind ?? null, parentId, b.managerName !== undefined, b.managerName?.trim() || null, b.description !== undefined, b.description?.trim() || null, b.status ?? null]);
            const action = b.status && b.status !== r.status ? (b.status === 'nonaktif' ? 'cost_center.deactivated' : 'cost_center.activated') : 'cost_center.updated';
            await this.rec(c, u, action, r.code, { name: r.name, kind: r.kind, parentId: r.parent_id, status: r.status }, { name: b.name ?? r.name, kind: b.kind ?? r.kind, parentId, status: b.status ?? r.status, reason: b.reason }, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    async remove(u, s, id, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const r = await this.row(c, u.companyId, id, true);
            const usage = (await c.query(USAGE, [u.companyId, id])).rows[0];
            if (usage.lines || usage.budgets || usage.employees || usage.children || usage.documents)
                throw (0, errors_js_1.conflict)('COST_CENTER_IN_USE', `Pusat biaya ${r.code} sudah dipakai (${usage.lines} baris jurnal, ${usage.documents} dokumen, ${usage.employees} karyawan, ${usage.budgets} anggaran, ${usage.children} anak); nonaktifkan saja.`);
            await c.query('DELETE FROM cost_centers WHERE id = $1', [id]);
            await this.rec(c, u, 'cost_center.deleted', r.code, { name: r.name }, { reason }, requestId);
            return { id, code: r.code, deleted: true };
        });
    }
};
exports.CostCentersService = CostCentersService;
exports.CostCentersService = CostCentersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], CostCentersService);
//# sourceMappingURL=cost-centers.service.js.map