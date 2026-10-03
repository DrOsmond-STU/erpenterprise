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
exports.BomsService = void 0;
exports.skuInfo = skuInfo;
/** Bill of materials: resep bahan per barang hasil produksi (berlaku seluruh perusahaan). */
const common_1 = require("@nestjs/common");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
/** Nama, satuan, dan HPP rata-rata perusahaan per SKU (lintas gudang). */
async function skuInfo(c, companyId, skus) {
    const rows = await (0, sales_shared_js_1.acrossBranches)(c, async () => (await c.query(`SELECT s.sku, coalesce(p.name, si.name) AS name, coalesce(p.unit, si.uom) AS uom, p.kind, si.category,
            CASE WHEN si.qty > 0 THEN round(si.val / si.qty) ELSE si.avg END AS avg_cost
       FROM unnest($2::text[]) AS s(sku)
       LEFT JOIN products p ON p.company_id = $1 AND p.sku = s.sku
       LEFT JOIN LATERAL (SELECT max(name) AS name, max(uom) AS uom, max(category) AS category, sum(on_hand) AS qty, sum(on_hand * avg_cost) AS val, max(avg_cost) AS avg
                            FROM stock_items WHERE company_id = $1 AND sku = s.sku) si ON true`, [companyId, skus])).rows);
    return new Map(rows.map((r) => [r.sku, { name: r.name, uom: r.uom, kind: r.kind, category: r.category, avgCost: Number(r.avg_cost ?? 0) }]));
}
let BomsService = class BomsService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    async load(c, companyId, id) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('BOM');
        const b = (await c.query('SELECT * FROM boms WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
        if (!b)
            throw (0, errors_js_1.notFound)('BOM');
        const lines = (await c.query('SELECT * FROM bom_lines WHERE bom_id = $1 ORDER BY line_no', [id])).rows;
        const info = await skuInfo(c, companyId, [b.sku, ...lines.map((l) => l.sku)]);
        const ls = lines.map((l) => {
            const i = info.get(l.sku);
            return { lineNo: l.line_no, sku: l.sku, name: i?.name ?? l.sku, uom: i?.uom ?? '', qty: Number(l.qty), unitCost: i?.avgCost ?? 0, cost: Math.round(Number(l.qty) * (i?.avgCost ?? 0)) };
        });
        const batchCost = ls.reduce((t, l) => t + l.cost, 0);
        const out = info.get(b.sku);
        const used = Number((await c.query('SELECT count(*) FROM work_orders WHERE company_id = $1 AND bom_id = $2', [companyId, id])).rows[0].count);
        return {
            id: b.id, code: b.code, sku: b.sku, productName: out?.name ?? b.sku, uom: out?.uom ?? '', name: b.name, batchQty: Number(b.batch_qty), status: b.status, notes: b.notes,
            lines: ls, batchCost, unitCost: Math.round(batchCost / Number(b.batch_qty)), workOrders: used, createdByName: b.created_by_name, createdAt: b.created_at,
        };
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const ids = (await c.query('SELECT id FROM boms WHERE company_id = $1 ORDER BY status, code', [u.companyId])).rows;
            const out = [];
            for (const r of ids)
                out.push(await this.load(c, u.companyId, r.id));
            return out;
        });
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    async validate(c, companyId, sku, lines) {
        const seen = new Set();
        for (const l of lines) {
            if (l.sku === sku)
                throw (0, sales_shared_js_1.invalid)('BOM_SELF', 'Barang hasil tidak boleh menjadi bahannya sendiri.');
            if (seen.has(l.sku))
                throw (0, sales_shared_js_1.invalid)('BOM_DUP_SKU', `Bahan ${l.sku} tercantum lebih dari sekali.`);
            seen.add(l.sku);
        }
        const info = await skuInfo(c, companyId, [sku, ...lines.map((l) => l.sku)]);
        const out = info.get(sku);
        if (!out?.name || out.kind === 'jasa')
            throw (0, sales_shared_js_1.invalid)('BOM_PRODUCT', `Barang hasil ${sku} tidak dikenal atau berupa jasa.`);
        for (const l of lines) {
            const i = info.get(l.sku);
            if (!i?.name || i.kind === 'jasa')
                throw (0, sales_shared_js_1.invalid)('BOM_COMPONENT', `Bahan ${l.sku} tidak dikenal atau berupa jasa.`);
        }
        return out;
    }
    async writeLines(c, companyId, bomId, lines) {
        await c.query('DELETE FROM bom_lines WHERE bom_id = $1', [bomId]);
        let n = 0;
        for (const l of lines) {
            n += 1;
            await c.query('INSERT INTO bom_lines (bom_id, company_id, line_no, sku, qty) VALUES ($1,$2,$3,$4,$5)', [bomId, companyId, n, l.sku, l.qty]);
        }
    }
    async create(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            if ((await c.query('SELECT 1 FROM boms WHERE company_id = $1 AND lower(code) = lower($2)', [u.companyId, b.code])).rowCount)
                throw (0, errors_js_1.conflict)('BOM_EXISTS', `Kode BOM ${b.code} sudah dipakai.`);
            const out = await this.validate(c, u.companyId, b.sku, b.lines);
            const r = (await c.query(`INSERT INTO boms (company_id, code, sku, name, batch_qty, notes, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [u.companyId, b.code, b.sku, b.name || `BOM ${out.name}`, b.batchQty, b.notes ?? null, u.id, u.name])).rows[0];
            await this.writeLines(c, u.companyId, r.id, b.lines);
            await this.audit.record(c, { companyId: u.companyId, branchCode: null, userId: u.id, sessionId: u.sessionId, action: 'bom.created', entityType: 'bom', entityId: b.code, after: { sku: b.sku, batchQty: b.batchQty, lines: b.lines }, requestId });
            return this.load(c, u.companyId, r.id);
        });
    }
    async update(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const before = await this.load(c, u.companyId, id);
            if (b.lines) {
                await this.validate(c, u.companyId, before.sku, b.lines);
                await this.writeLines(c, u.companyId, id, b.lines);
            }
            await c.query(`UPDATE boms SET name = coalesce($3, name), batch_qty = coalesce($4, batch_qty), notes = coalesce($5, notes), status = coalesce($6, status), updated_at = now() WHERE company_id = $1 AND id = $2`, [u.companyId, id, b.name ?? null, b.batchQty ?? null, b.notes ?? null, b.status ?? null]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: null, userId: u.id, sessionId: u.sessionId, action: 'bom.updated', entityType: 'bom', entityId: before.code,
                before: { batchQty: before.batchQty, status: before.status, lines: before.lines.map((l) => ({ sku: l.sku, qty: l.qty })) }, after: b, requestId });
            return this.load(c, u.companyId, id);
        });
    }
};
exports.BomsService = BomsService;
exports.BomsService = BomsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], BomsService);
//# sourceMappingURL=boms.service.js.map