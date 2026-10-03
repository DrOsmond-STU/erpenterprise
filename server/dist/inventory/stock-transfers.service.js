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
exports.StockTransfersService = void 0;
/**
 * Transfer stok.
 *  - Antar gudang satu cabang: kirim = terima seketika; tanpa jurnal kecuali selisih
 *    pembulatan harga pokok rata-rata di gudang tujuan.
 *  - Antar cabang: kirim → asal Dr RK / Cr persediaan, tujuan Dr barang dalam
 *    perjalanan / Cr RK (RK selalu seimbang); terima → tujuan Dr persediaan /
 *    Cr barang dalam perjalanan (+ selisih pembulatan).
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const cash_shared_js_1 = require("../cash/cash.shared.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const stock_shared_js_1 = require("./stock.shared.js");
const STATUS_LABEL = { draf: 'Draf', dikirim: 'Dalam perjalanan', diterima: 'Diterima', batal: 'Batal' };
const map = (t) => ({
    id: t.id, docNo: t.doc_no, branch: (0, sales_shared_js_1.trimBranch)(t.branch_code), toBranch: (0, sales_shared_js_1.trimBranch)(t.to_branch_code), fromWarehouse: t.from_warehouse, toWarehouse: t.to_warehouse,
    date: t.transfer_date, status: t.status, statusLabel: STATUS_LABEL[t.status] ?? t.status, interBranch: (0, sales_shared_js_1.trimBranch)(t.branch_code) !== (0, sales_shared_js_1.trimBranch)(t.to_branch_code),
    notes: t.notes, totalValue: Number(t.total_value), shippedDate: t.shipped_date, shippedByName: t.shipped_by_name, receivedDate: t.received_date, receivedByName: t.received_by_name,
    createdBy: t.created_by, createdByName: t.created_by_name, createdAt: t.created_at, lineCount: t.line_count ?? undefined,
});
let StockTransfersService = class StockTransfersService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`SELECT t.*, (SELECT count(*)::int FROM stock_transfer_lines l WHERE l.transfer_id = t.id) AS line_count FROM stock_transfers t
          WHERE t.company_id = $1 AND ($2::text IS NULL OR t.branch_code = $2 OR t.to_branch_code = $2) ORDER BY (t.status IN ('draf','dikirim')) DESC, t.transfer_date DESC, t.doc_no DESC LIMIT 2000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(map));
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Transfer stok');
        const r = (await c.query(`SELECT * FROM stock_transfers WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Transfer stok');
        return r;
    }
    async load(c, companyId, id) {
        const t = await this.row(c, companyId, id);
        const { lines, journals } = await (0, sales_shared_js_1.acrossBranches)(c, async () => ({
            lines: (await c.query(`SELECT l.*, (SELECT name FROM stock_items si WHERE si.company_id = l.company_id AND si.sku = l.sku LIMIT 1) AS name,
                                    (SELECT uom FROM stock_items si WHERE si.company_id = l.company_id AND si.sku = l.sku LIMIT 1) AS uom,
                                    (SELECT on_hand FROM stock_items si WHERE si.company_id = l.company_id AND si.sku = l.sku AND si.warehouse_code = $2 LIMIT 1) AS available
                               FROM stock_transfer_lines l WHERE l.transfer_id = $1 ORDER BY l.line_no`, [id, t.from_warehouse])).rows
                .map((l) => ({ id: Number(l.id), lineNo: l.line_no, sku: l.sku, name: l.name, uom: l.uom, qty: Number(l.qty), unitCost: l.unit_cost === null ? null : Number(l.unit_cost), value: l.value === null ? null : Number(l.value), available: l.available === null ? 0 : Number(l.available) })),
            journals: (await c.query(`SELECT id, journal_no, journal_date, branch_code, rule_code, status, total_debit FROM journals WHERE company_id = $1 AND source_type = 'stock_transfer' AND source_id = $2 ORDER BY journal_no`, [companyId, id])).rows
                .map((j) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, branch: (0, sales_shared_js_1.trimBranch)(j.branch_code), rule: j.rule_code, status: j.status, total: j.total_debit })),
        }));
        return { ...map(t), lines, journals, timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'stock_transfer', t.doc_no) };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    access(u, branch) {
        if (u.branches !== '*' && !u.branches.includes(branch))
            throw (0, errors_js_1.forbidden)(`Memerlukan akses ke cabang ${branch}.`);
    }
    async create(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const [from, to] = [await (0, stock_shared_js_1.warehouseOf)(c, u.companyId, b.fromWarehouse), await (0, stock_shared_js_1.warehouseOf)(c, u.companyId, b.toWarehouse)];
            if (from.code === to.code)
                throw (0, sales_shared_js_1.invalid)('TRANSFER_SAME_WAREHOUSE', 'Gudang asal dan tujuan harus berbeda.');
            this.access(u, from.branch_code);
            if (s.branch !== 'ALL' && from.branch_code !== s.branch)
                throw (0, errors_js_1.forbidden)(`Gudang asal milik cabang ${from.branch_code}; ajukan dari konteks cabang tersebut.`);
            const seen = new Set();
            for (const l of b.lines) {
                if (seen.has(l.sku))
                    throw (0, sales_shared_js_1.invalid)('TRANSFER_DUP_SKU', `SKU ${l.sku} tercantum lebih dari sekali.`);
                seen.add(l.sku);
                const it = (await c.query('SELECT on_hand, uom FROM stock_items WHERE company_id = $1 AND branch_code = $2 AND warehouse_code = $3 AND sku = $4', [u.companyId, from.branch_code, from.code, l.sku])).rows[0];
                if (!it)
                    throw (0, sales_shared_js_1.invalid)('STOCK_ITEM_UNKNOWN', `SKU ${l.sku} tidak ada di gudang ${from.code}.`);
                if (l.qty > Number(it.on_hand))
                    throw (0, sales_shared_js_1.invalid)('STOCK_INSUFFICIENT', `Stok ${l.sku} di ${from.code} hanya ${Number(it.on_hand).toLocaleString('id-ID')} ${it.uom}.`);
            }
            const date = b.date ?? (0, sales_shared_js_1.todayWib)();
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'TRS', Number(date.slice(0, 4)));
            const t = (await c.query(`INSERT INTO stock_transfers (company_id, branch_code, to_branch_code, from_warehouse, to_warehouse, doc_no, transfer_date, notes, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [u.companyId, from.branch_code, to.branch_code, from.code, to.code, docNo, date, b.notes ?? null, u.id, u.name])).rows[0];
            let n = 0;
            for (const l of b.lines) {
                n += 1;
                await c.query('INSERT INTO stock_transfer_lines (transfer_id, company_id, branch_code, line_no, sku, qty) VALUES ($1,$2,$3,$4,$5,$6)', [t.id, u.companyId, from.branch_code, n, l.sku, l.qty]);
            }
            await this.audit.record(c, { companyId: u.companyId, branchCode: from.branch_code, userId: u.id, sessionId: u.sessionId, action: 'stock_transfer.created', entityType: 'stock_transfer', entityId: docNo, after: { from: from.code, to: to.code, lines: b.lines.length }, requestId });
            return this.load(c, u.companyId, t.id);
        });
    }
    /** Kirim: stok asal berkurang; antar gudang satu cabang langsung diterima. */
    async ship(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const t = await this.row(c, u.companyId, id, true);
            if (t.status !== 'draf')
                throw (0, errors_js_1.conflict)('TRANSFER_NOT_DRAFT', `Transfer ${t.doc_no} bukan draf.`);
            const fromBranch = (0, sales_shared_js_1.trimBranch)(t.branch_code), toBranch = (0, sales_shared_js_1.trimBranch)(t.to_branch_code);
            this.access(u, fromBranch);
            const date = t.transfer_date;
            await (0, sales_shared_js_1.acrossBranches)(c, async () => {
                const links = await this.refs.links(c, u.companyId);
                const lines = (await c.query('SELECT * FROM stock_transfer_lines WHERE transfer_id = $1 ORDER BY line_no FOR UPDATE', [id])).rows;
                const byAccount = new Map();
                let total = 0;
                const sameBranch = fromBranch === toBranch;
                const destByAccount = new Map();
                let variance = 0;
                for (const l of lines) {
                    const out = await (0, stock_shared_js_1.issueStock)(c, u, links, { branch: fromBranch, warehouse: t.from_warehouse, sku: l.sku, qty: Number(l.qty), date, refType: 'transfer_out', refId: id, refNo: t.doc_no });
                    await c.query('UPDATE stock_transfer_lines SET unit_cost = $2, value = $3 WHERE id = $1', [l.id, out.unitCost, out.value]);
                    (0, stock_shared_js_1.addTo)(byAccount, out.account, out.value);
                    total += out.value;
                    if (sameBranch) {
                        const inn = await (0, stock_shared_js_1.receiveStock)(c, u, links, { branch: toBranch, warehouse: t.to_warehouse, sku: l.sku, qty: Number(l.qty), value: out.value, date, refType: 'transfer_in', refId: id, refNo: t.doc_no,
                            template: { name: out.item.name, category: out.item.category, uom: out.item.uom } });
                        (0, stock_shared_js_1.addTo)(destByAccount, inn.account, inn.delta);
                        (0, stock_shared_js_1.addTo)(destByAccount, out.account, -out.value);
                        variance += inn.variance;
                    }
                }
                if (sameBranch) {
                    const net = [...destByAccount].filter(([, v]) => v !== 0);
                    if (net.length || variance) {
                        await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch: fromBranch, date, source: 'stock_transfer', sourceId: id, rule: 'STOCK_TRANSFER_LOCAL', ref: t.doc_no, description: `Transfer stok ${t.doc_no}: ${t.from_warehouse} → ${t.to_warehouse}`,
                            lines: [...net.map(([acc, v]) => (0, domain_1.signedLine)(acc, v)), (0, domain_1.signedLine)(links.invVariance, variance, 'Selisih pembulatan harga pokok')] });
                    }
                    await c.query(`UPDATE stock_transfers SET status = 'diterima', total_value = $2, shipped_date = $3, shipped_by_name = $4, received_date = $3, received_by_name = $4 WHERE id = $1`, [id, total, date, u.name]);
                }
                else {
                    const legs = (0, domain_1.transferShipLegs)({ fromBranch, toBranch, headOffice: await (0, cash_shared_js_1.headOffice)(c, u.companyId), rkBranch: links.rkBranch, rkHeadOffice: links.rkHeadOffice, transit: links.invTransit, byAccount: Object.fromEntries(byAccount) });
                    for (const leg of legs) {
                        await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch: leg.branch, date, source: 'stock_transfer', sourceId: id, rule: leg.branch === fromBranch ? 'STOCK_TRANSFER_OUT' : 'STOCK_TRANSFER_TRANSIT', ref: t.doc_no,
                            description: `Transfer stok ${t.doc_no}: ${t.from_warehouse} (${fromBranch}) → ${t.to_warehouse} (${toBranch})`, lines: leg.lines });
                    }
                    await c.query(`UPDATE stock_transfers SET status = 'dikirim', total_value = $2, shipped_date = $3, shipped_by_name = $4 WHERE id = $1`, [id, total, date, u.name]);
                }
            });
            await this.audit.record(c, { companyId: u.companyId, branchCode: fromBranch, userId: u.id, sessionId: u.sessionId, action: 'stock_transfer.shipped', entityType: 'stock_transfer', entityId: t.doc_no, after: { toBranch }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    /** Terima di cabang tujuan: persediaan bertambah dari akun barang dalam perjalanan. */
    async receive(u, s, id, date, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const t = await this.row(c, u.companyId, id, true);
            if (t.status !== 'dikirim')
                throw (0, errors_js_1.conflict)('TRANSFER_NOT_SHIPPED', `Transfer ${t.doc_no} tidak sedang dalam perjalanan.`);
            const toBranch = (0, sales_shared_js_1.trimBranch)(t.to_branch_code);
            this.access(u, toBranch);
            const when = date ?? (0, sales_shared_js_1.todayWib)();
            if (when < t.shipped_date)
                throw (0, sales_shared_js_1.invalid)('RECEIVE_DATE', 'Tanggal terima tidak boleh sebelum tanggal kirim.');
            await (0, sales_shared_js_1.acrossBranches)(c, async () => {
                const links = await this.refs.links(c, u.companyId);
                const lines = (await c.query('SELECT * FROM stock_transfer_lines WHERE transfer_id = $1 ORDER BY line_no', [id])).rows;
                const byAccount = new Map();
                let variance = 0;
                for (const l of lines) {
                    const tpl = (await c.query('SELECT name, category, uom FROM stock_items WHERE company_id = $1 AND sku = $2 AND warehouse_code = $3', [u.companyId, l.sku, t.from_warehouse])).rows[0];
                    const inn = await (0, stock_shared_js_1.receiveStock)(c, u, links, { branch: toBranch, warehouse: t.to_warehouse, sku: l.sku, qty: Number(l.qty), value: Number(l.value), date: when, refType: 'transfer_in', refId: id, refNo: t.doc_no, template: tpl });
                    (0, stock_shared_js_1.addTo)(byAccount, inn.account, inn.delta);
                    variance += inn.variance;
                }
                await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch: toBranch, date: when, source: 'stock_transfer', sourceId: id, rule: 'STOCK_TRANSFER_IN', ref: t.doc_no, description: `Penerimaan transfer stok ${t.doc_no} di ${t.to_warehouse}`,
                    lines: [...[...byAccount].map(([acc, v]) => (0, domain_1.signedLine)(acc, v)), (0, domain_1.signedLine)(links.invVariance, variance, 'Selisih pembulatan harga pokok'), { account: links.invTransit, debit: 0, credit: Number(t.total_value), memo: null }] });
                await c.query(`UPDATE stock_transfers SET status = 'diterima', received_date = $2, received_by_name = $3 WHERE id = $1`, [id, when, u.name]);
            });
            await this.audit.record(c, { companyId: u.companyId, branchCode: toBranch, userId: u.id, sessionId: u.sessionId, action: 'stock_transfer.received', entityType: 'stock_transfer', entityId: t.doc_no, after: { date: when }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async cancel(u, s, id, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const t = await this.row(c, u.companyId, id, true);
            if (t.status !== 'draf')
                throw (0, errors_js_1.conflict)('TRANSFER_LOCKED', `Transfer ${t.doc_no} sudah dikirim; tidak dapat dibatalkan.`);
            this.access(u, (0, sales_shared_js_1.trimBranch)(t.branch_code));
            await c.query(`UPDATE stock_transfers SET status = 'batal', notes = coalesce(notes || ' — ', '') || $2 WHERE id = $1`, [id, `Batal: ${reason}`]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(t.branch_code), userId: u.id, sessionId: u.sessionId, action: 'stock_transfer.cancelled', entityType: 'stock_transfer', entityId: t.doc_no, after: { reason }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
};
exports.StockTransfersService = StockTransfersService;
exports.StockTransfersService = StockTransfersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], StockTransfersService);
//# sourceMappingURL=stock-transfers.service.js.map