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
exports.StockAdjustmentsService = void 0;
/**
 * Penyesuaian / opname stok: gudang mencatat hasil hitung fisik (atau barang
 * rusak/hilang), orang lain menyetujui. Saat diposting, selisih = hitung fisik −
 * stok sistem saat itu, dinilai dengan harga pokok rata-rata; jurnal Dr/Cr
 * persediaan ↔ selisih persediaan.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const stock_shared_js_1 = require("./stock.shared.js");
const STATUS_LABEL = { menunggu: 'Menunggu persetujuan', diposting: 'Diposting', ditolak: 'Ditolak', batal: 'Batal' };
const REASON_LABEL = { opname: 'Stok opname', rusak: 'Barang rusak', hilang: 'Barang hilang', koreksi: 'Koreksi' };
const mapAdj = (a) => ({
    id: a.id, docNo: a.doc_no, branch: (0, sales_shared_js_1.trimBranch)(a.branch_code), warehouse: a.warehouse_code, date: a.adj_date, reason: a.reason, reasonLabel: REASON_LABEL[a.reason] ?? a.reason,
    notes: a.notes, status: a.status, statusLabel: STATUS_LABEL[a.status] ?? a.status, totalValue: Number(a.total_value), lineCount: a.line_count ?? undefined,
    createdBy: a.created_by, createdByName: a.created_by_name, createdAt: a.created_at, decidedByName: a.decided_by_name, decidedAt: a.decided_at, decisionNote: a.decision_note,
});
let StockAdjustmentsService = class StockAdjustmentsService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`SELECT a.*, (SELECT count(*)::int FROM stock_adjustment_lines l WHERE l.adjustment_id = a.id) AS line_count FROM stock_adjustments a
          WHERE a.company_id = $1 AND ($2::text IS NULL OR a.branch_code = $2) ORDER BY (a.status = 'menunggu') DESC, a.adj_date DESC, a.doc_no DESC LIMIT 2000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(mapAdj));
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Penyesuaian stok');
        const r = (await c.query(`SELECT * FROM stock_adjustments WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Penyesuaian stok');
        return r;
    }
    async load(c, companyId, id) {
        const a = await this.row(c, companyId, id);
        const lines = (await c.query(`SELECT l.*, si.name, si.uom, si.on_hand, si.avg_cost FROM stock_adjustment_lines l
         LEFT JOIN stock_items si ON si.company_id = l.company_id AND si.branch_code = l.branch_code AND si.warehouse_code = $2 AND si.sku = l.sku
        WHERE l.adjustment_id = $1 ORDER BY l.line_no`, [id, a.warehouse_code])).rows.map((l) => {
            const posted = l.system_qty !== null;
            const sys = posted ? Number(l.system_qty) : Number(l.on_hand ?? 0);
            const est = posted ? { diff: Number(l.diff_qty), value: Number(l.value) } : (0, domain_1.countDifference)(sys, Number(l.counted_qty), Number(l.avg_cost ?? 0));
            return { id: Number(l.id), lineNo: l.line_no, sku: l.sku, name: l.name, uom: l.uom, countedQty: Number(l.counted_qty), systemQty: sys, diffQty: est.diff, unitCost: posted ? Number(l.unit_cost) : Number(l.avg_cost ?? 0), value: est.value, note: l.note, estimate: !posted };
        });
        const journals = (await c.query(`SELECT id, journal_no, journal_date, status, total_debit FROM journals WHERE company_id = $1 AND source_type = 'stock_adjustment' AND source_id = $2 ORDER BY journal_no`, [companyId, id])).rows
            .map((j) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, status: j.status, total: j.total_debit }));
        return { ...mapAdj(a), lines, estimatedValue: lines.reduce((t, l) => t + l.value, 0), journals, timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'stock_adjustment', a.doc_no) };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    async create(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const wh = await (0, stock_shared_js_1.warehouseOf)(c, u.companyId, b.warehouse);
            if (s.branch !== 'ALL' && wh.branch_code !== s.branch)
                throw (0, errors_js_1.forbidden)(`Gudang ${wh.code} milik cabang ${wh.branch_code}.`);
            if (u.branches !== '*' && !u.branches.includes(wh.branch_code))
                throw (0, errors_js_1.forbidden)(`Anda tidak memiliki akses ke cabang ${wh.branch_code}.`);
            const seen = new Set();
            for (const l of b.lines) {
                if (seen.has(l.sku))
                    throw (0, sales_shared_js_1.invalid)('ADJ_DUP_SKU', `SKU ${l.sku} tercantum lebih dari sekali.`);
                seen.add(l.sku);
                const it = (await c.query('SELECT on_hand FROM stock_items WHERE company_id = $1 AND branch_code = $2 AND warehouse_code = $3 AND sku = $4', [u.companyId, wh.branch_code, wh.code, l.sku])).rows[0];
                if (!it)
                    throw (0, sales_shared_js_1.invalid)('STOCK_ITEM_UNKNOWN', `SKU ${l.sku} tidak ada di gudang ${wh.code}.`);
                if (b.reason !== 'opname' && b.reason !== 'koreksi' && l.countedQty > Number(it.on_hand))
                    throw (0, sales_shared_js_1.invalid)('ADJ_REASON_QTY', `${REASON_LABEL[b.reason]} hanya dapat mengurangi stok (${l.sku}).`);
            }
            const date = b.date ?? (0, sales_shared_js_1.todayWib)();
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'ADJ', Number(date.slice(0, 4)));
            const a = (await c.query(`INSERT INTO stock_adjustments (company_id, branch_code, warehouse_code, doc_no, adj_date, reason, notes, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [u.companyId, wh.branch_code, wh.code, docNo, date, b.reason, b.notes ?? null, u.id, u.name])).rows[0];
            let n = 0;
            for (const l of b.lines) {
                n += 1;
                await c.query(`INSERT INTO stock_adjustment_lines (adjustment_id, company_id, branch_code, line_no, sku, counted_qty, note) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [a.id, u.companyId, wh.branch_code, n, l.sku, l.countedQty, l.note ?? null]);
            }
            await this.audit.record(c, { companyId: u.companyId, branchCode: wh.branch_code, userId: u.id, sessionId: u.sessionId, action: 'stock_adjustment.created', entityType: 'stock_adjustment', entityId: docNo,
                after: { warehouse: wh.code, reason: b.reason, lines: b.lines.length }, requestId });
            return this.load(c, u.companyId, a.id);
        });
    }
    async approve(u, s, id, note, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const a = await this.row(c, u.companyId, id, true);
            if (a.status !== 'menunggu')
                throw (0, errors_js_1.conflict)('ADJ_NOT_PENDING', `Penyesuaian ${a.doc_no} tidak sedang menunggu persetujuan.`);
            if (a.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_STOCK_ADJUSTMENT', 'Pembuat penyesuaian stok tidak boleh menyetujuinya sendiri (kontrol empat mata).', common_1.HttpStatus.FORBIDDEN);
            const branch = (0, sales_shared_js_1.trimBranch)(a.branch_code);
            const links = await this.refs.links(c, u.companyId);
            const lines = (await c.query('SELECT * FROM stock_adjustment_lines WHERE adjustment_id = $1 ORDER BY line_no FOR UPDATE', [id])).rows;
            const byAccount = new Map();
            let total = 0;
            for (const l of lines) {
                const item = await (0, stock_shared_js_1.lockItem)(c, u.companyId, branch, a.warehouse_code, l.sku);
                if (!item)
                    throw (0, sales_shared_js_1.invalid)('STOCK_ITEM_UNKNOWN', `SKU ${l.sku} tidak ada lagi di gudang ${a.warehouse_code}.`);
                const avg = Number(item.avg_cost);
                const { diff, value } = (0, domain_1.countDifference)(Number(item.on_hand), Number(l.counted_qty), avg);
                await c.query('UPDATE stock_adjustment_lines SET system_qty = $2, diff_qty = $3, unit_cost = $4, value = $5 WHERE id = $1', [l.id, item.on_hand, diff, avg, value]);
                if (diff === 0)
                    continue;
                await c.query('UPDATE stock_items SET on_hand = $2 WHERE id = $1', [item.id, l.counted_qty]);
                await c.query(`INSERT INTO stock_moves (company_id, branch_code, warehouse_code, sku, move_date, qty, unit_cost, ref_type, ref_id, ref_no, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'adjustment',$8,$9,$10)`, [u.companyId, branch, a.warehouse_code, l.sku, a.adj_date, diff, avg, id, a.doc_no, u.id]);
                (0, stock_shared_js_1.addTo)(byAccount, (0, stock_shared_js_1.inventoryAccount)(item.category, links), value);
                total += value;
            }
            if ([...byAccount.values()].some((v) => v !== 0)) {
                await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch, date: a.adj_date, source: 'stock_adjustment', sourceId: id, rule: 'STOCK_ADJUSTMENT', ref: a.doc_no,
                    description: `${REASON_LABEL[a.reason]} ${a.doc_no} — gudang ${a.warehouse_code}`,
                    lines: [...[...byAccount].map(([acc, v]) => (0, domain_1.signedLine)(acc, v)), (0, domain_1.signedLine)(links.invVariance, -total, 'Selisih persediaan')] });
            }
            await c.query(`UPDATE stock_adjustments SET status = 'diposting', total_value = $2, decided_by = $3, decided_by_name = $4, decided_at = now(), decision_note = $5 WHERE id = $1`, [id, total, u.id, u.name, note ?? null]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'stock_adjustment.posted', entityType: 'stock_adjustment', entityId: a.doc_no, after: { value: total, note }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async reject(u, s, id, note, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const a = await this.row(c, u.companyId, id, true);
            if (a.status !== 'menunggu')
                throw (0, errors_js_1.conflict)('ADJ_NOT_PENDING', `Penyesuaian ${a.doc_no} tidak sedang menunggu persetujuan.`);
            if (a.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_STOCK_ADJUSTMENT', 'Pembuat tidak dapat menolak penyesuaiannya sendiri — gunakan pembatalan.', common_1.HttpStatus.FORBIDDEN);
            await c.query(`UPDATE stock_adjustments SET status = 'ditolak', decided_by = $2, decided_by_name = $3, decided_at = now(), decision_note = $4 WHERE id = $1`, [id, u.id, u.name, note]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(a.branch_code), userId: u.id, sessionId: u.sessionId, action: 'stock_adjustment.rejected', entityType: 'stock_adjustment', entityId: a.doc_no, after: { note }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async cancel(u, s, id, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const a = await this.row(c, u.companyId, id, true);
            if (a.status !== 'menunggu')
                throw (0, errors_js_1.conflict)('ADJ_LOCKED', `Penyesuaian ${a.doc_no} berstatus ${STATUS_LABEL[a.status]}.`);
            if (a.created_by !== u.id && !u.permissions.has('inventory.adjust.approve'))
                throw (0, errors_js_1.forbidden)('Hanya pembuat atau penyetuju yang dapat membatalkan.');
            await c.query(`UPDATE stock_adjustments SET status = 'batal', decision_note = $2 WHERE id = $1`, [id, reason]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(a.branch_code), userId: u.id, sessionId: u.sessionId, action: 'stock_adjustment.cancelled', entityType: 'stock_adjustment', entityId: a.doc_no, after: { reason }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
};
exports.StockAdjustmentsService = StockAdjustmentsService;
exports.StockAdjustmentsService = StockAdjustmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], StockAdjustmentsService);
//# sourceMappingURL=adjustments.service.js.map