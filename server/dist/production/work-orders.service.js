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
exports.WorkOrdersService = void 0;
/**
 * Perintah kerja: antre → berjalan (pemakaian bahan: Dr WIP / Cr persediaan bahan)
 * → pemeriksaan mutu (lapor qty baik & cacat) → selesai (lolos QC oleh orang lain:
 * Dr persediaan barang jadi / Cr WIP sebesar seluruh saldo WIP perintah kerja).
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const stock_shared_js_1 = require("../inventory/stock.shared.js");
const boms_service_js_1 = require("./boms.service.js");
const STATUS_LABEL = { draf: 'Draf', antre: 'Antre', berjalan: 'Berjalan', qc: 'Pemeriksaan mutu', selesai: 'Selesai', batal: 'Batal' };
const map = (w) => ({
    id: w.id, docNo: w.doc_no, branch: (0, sales_shared_js_1.trimBranch)(w.branch_code), bomId: w.bom_id, sku: w.sku, productName: w.product_name, uom: w.uom, plannedQty: Number(w.planned_qty),
    warehouse: w.warehouse_code, line: w.line, pic: w.pic, date: w.wo_date, dueDate: w.due_date, status: w.status, statusLabel: STATUS_LABEL[w.status] ?? w.status,
    progress: w.progress, flag: w.flag, goodQty: w.good_qty === null ? null : Number(w.good_qty), rejectQty: w.reject_qty === null ? null : Number(w.reject_qty),
    issuedValue: Number(w.issued_value), outputValue: Number(w.output_value), wip: Number(w.issued_value) - Number(w.output_value), notes: w.notes,
    qcSubmittedBy: w.qc_submitted_by, qcSubmittedByName: w.qc_submitted_by_name, qcSubmittedAt: w.qc_submitted_at, completedDate: w.completed_date, completedByName: w.completed_by_name, qcNote: w.qc_note,
    cancelReason: w.cancel_reason, createdBy: w.created_by, createdByName: w.created_by_name, createdAt: w.created_at,
});
let WorkOrdersService = class WorkOrdersService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`SELECT * FROM work_orders WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2)
          ORDER BY (status IN ('selesai','batal')), coalesce(due_date, wo_date), doc_no DESC LIMIT 2000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(map));
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Perintah kerja');
        const r = (await c.query(`SELECT * FROM work_orders WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Perintah kerja');
        return r;
    }
    async load(c, companyId, id) {
        const w = await this.row(c, companyId, id);
        const req = w.requirements;
        const cons = (await c.query('SELECT * FROM wo_consumptions WHERE wo_id = $1 ORDER BY issue_no, id', [id])).rows;
        const outs = (await c.query('SELECT * FROM wo_outputs WHERE wo_id = $1 ORDER BY id', [id])).rows;
        const info = await (0, boms_service_js_1.skuInfo)(c, companyId, req.map((r) => r.sku));
        const stock = new Map((await c.query('SELECT sku, on_hand FROM stock_items WHERE company_id = $1 AND warehouse_code = $2', [companyId, w.warehouse_code])).rows.map((r) => [r.sku, Number(r.on_hand)]));
        const usage = (0, domain_1.usageVariance)(req, cons.map((x) => ({ sku: x.sku, qty: Number(x.qty) })));
        const materials = usage.map((m) => ({ ...m, name: info.get(m.sku)?.name ?? m.sku, uom: info.get(m.sku)?.uom ?? '', available: stock.get(m.sku) ?? 0,
            issuedValue: cons.filter((x) => x.sku === m.sku).reduce((t, x) => t + Number(x.value), 0), remaining: (0, domain_1.round4)(Math.max(0, m.standard - m.actual)) }));
        const journals = (await c.query(`SELECT id, journal_no, journal_date, rule_code, status, total_debit FROM journals WHERE company_id = $1 AND source_type = 'work_order' AND source_id = $2 ORDER BY journal_no`, [companyId, id])).rows
            .map((j) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, rule: j.rule_code, status: j.status, total: j.total_debit }));
        return {
            ...map(w), materials,
            issues: cons.map((x) => ({ id: Number(x.id), issueNo: x.issue_no, date: x.issue_date, sku: x.sku, name: info.get(x.sku)?.name ?? x.sku, qty: Number(x.qty), unitCost: Number(x.unit_cost), value: Number(x.value), byName: x.created_by_name })),
            outputs: outs.map((o) => ({ id: Number(o.id), date: o.output_date, goodQty: Number(o.good_qty), rejectQty: Number(o.reject_qty), unitCost: Number(o.unit_cost), value: Number(o.value), byName: o.created_by_name })),
            journals, timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'work_order', w.doc_no),
        };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    transition(w, to) {
        if (!(0, domain_1.canMove)(w.status, to))
            throw (0, errors_js_1.conflict)('WO_STATUS', `Perintah kerja ${w.doc_no} berstatus ${STATUS_LABEL[w.status]}; tidak dapat menjadi ${STATUS_LABEL[to]}.`);
    }
    log(c, u, w, action, after, requestId) {
        return this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(w.branch_code), userId: u.id, sessionId: u.sessionId, action: `work_order.${action}`, entityType: 'work_order', entityId: w.doc_no, after, requestId });
    }
    async create(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            if (!sales_shared_js_1.UUID.test(b.bomId))
                throw (0, sales_shared_js_1.invalid)('BOM_UNKNOWN', 'Pilih BOM.');
            const bom = (await c.query('SELECT * FROM boms WHERE company_id = $1 AND id = $2', [u.companyId, b.bomId])).rows[0];
            if (!bom)
                throw (0, sales_shared_js_1.invalid)('BOM_UNKNOWN', 'BOM tidak dikenal.');
            if (bom.status !== 'aktif')
                throw (0, sales_shared_js_1.invalid)('BOM_INACTIVE', `BOM ${bom.code} nonaktif.`);
            const wh = await (0, stock_shared_js_1.warehouseOf)(c, u.companyId, b.warehouse);
            (0, sales_shared_js_1.assertBranch)(u, s, wh.branch_code);
            const lines = (await c.query('SELECT sku, qty FROM bom_lines WHERE bom_id = $1 ORDER BY line_no', [bom.id])).rows.map((l) => ({ sku: l.sku, qty: Number(l.qty) }));
            const req = (0, domain_1.bomRequirement)(lines, Number(bom.batch_qty), b.plannedQty);
            const out = (await (0, boms_service_js_1.skuInfo)(c, u.companyId, [bom.sku])).get(bom.sku);
            const date = b.date ?? (0, sales_shared_js_1.todayWib)();
            if (b.dueDate && b.dueDate < date)
                throw (0, sales_shared_js_1.invalid)('WO_DUE', 'Jatuh tempo tidak boleh sebelum tanggal perintah kerja.');
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'WO', Number(date.slice(0, 4)));
            const r = (await c.query(`INSERT INTO work_orders (company_id, branch_code, doc_no, bom_id, sku, product_name, uom, planned_qty, requirements, warehouse_code, line, pic, wo_date, due_date, status, notes, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'antre',$15,$16,$17) RETURNING *`, [u.companyId, wh.branch_code, docNo, bom.id, bom.sku, out.name ?? bom.sku, out.uom ?? 'unit', b.plannedQty, JSON.stringify(req), wh.code, b.line ?? null, b.pic ?? null, date, b.dueDate ?? null, b.notes ?? null, u.id, u.name])).rows[0];
            await this.log(c, u, r, 'created', { bom: bom.code, qty: b.plannedQty, warehouse: wh.code }, requestId);
            return this.load(c, u.companyId, r.id);
        });
    }
    async update(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const w = await this.row(c, u.companyId, id, true);
            if (!['draf', 'antre', 'berjalan'].includes(w.status))
                throw (0, errors_js_1.conflict)('WO_LOCKED', `Perintah kerja ${w.doc_no} berstatus ${STATUS_LABEL[w.status]}.`);
            if (b.progress !== undefined && b.progress >= 100)
                throw (0, sales_shared_js_1.invalid)('WO_PROGRESS', 'Kemajuan 100% dicatat lewat “Kirim ke pemeriksaan mutu”.');
            await c.query(`UPDATE work_orders SET progress = coalesce($2, progress), flag = CASE WHEN $3::boolean THEN $4 ELSE flag END, line = coalesce($5, line), pic = coalesce($6, pic),
                       due_date = CASE WHEN $7::boolean THEN $8::date ELSE due_date END, notes = coalesce($9, notes), updated_at = now() WHERE id = $1`, [id, b.progress ?? null, b.flag !== undefined, b.flag || null, b.line ?? null, b.pic ?? null, b.dueDate !== undefined, b.dueDate || null, b.notes ?? null]);
            await this.log(c, u, w, 'updated', b, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    /** Keluarkan bahan dari gudang perintah kerja; default = sisa kebutuhan standar. */
    async issue(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const w = await this.row(c, u.companyId, id, true);
            const branch = (0, sales_shared_js_1.trimBranch)(w.branch_code);
            (0, sales_shared_js_1.assertBranch)(u, { ...s, branch: 'ALL' }, branch);
            if (w.status !== 'antre' && w.status !== 'berjalan')
                throw (0, errors_js_1.conflict)('WO_STATUS', `Bahan hanya dapat dikeluarkan untuk perintah kerja antre/berjalan (${w.doc_no}: ${STATUS_LABEL[w.status]}).`);
            const date = b.date ?? (0, sales_shared_js_1.todayWib)();
            if (date < w.wo_date)
                throw (0, sales_shared_js_1.invalid)('ISSUE_DATE', 'Tanggal pemakaian tidak boleh sebelum tanggal perintah kerja.');
            const done = (await c.query('SELECT sku, sum(qty) AS q, max(issue_no) AS n FROM wo_consumptions WHERE wo_id = $1 GROUP BY sku', [id])).rows;
            const issued = new Map(done.map((r) => [r.sku, Number(r.q)]));
            const issueNo = Math.max(0, ...done.map((r) => Number(r.n))) + 1;
            const req = w.requirements;
            let lines = b.lines?.filter((l) => l.qty > 0) ?? req.map((r) => ({ sku: r.sku, qty: (0, domain_1.round4)(r.qty - (issued.get(r.sku) ?? 0)) })).filter((l) => l.qty > 0);
            if (!lines.length)
                throw (0, sales_shared_js_1.invalid)('ISSUE_EMPTY', 'Tidak ada bahan yang perlu dikeluarkan.');
            const allowed = new Set(req.map((r) => r.sku));
            for (const l of lines)
                if (!allowed.has(l.sku))
                    throw (0, sales_shared_js_1.invalid)('ISSUE_NOT_IN_BOM', `${l.sku} bukan bahan dalam BOM perintah kerja ini.`);
            const seen = new Set();
            lines = lines.filter((l) => (seen.has(l.sku) ? false : (seen.add(l.sku), true)));
            const links = await this.refs.links(c, u.companyId);
            const byAccount = new Map();
            let total = 0;
            for (const l of lines) {
                const out = await (0, stock_shared_js_1.issueStock)(c, u, links, { branch, warehouse: w.warehouse_code, sku: l.sku, qty: l.qty, date, refType: 'production_issue', refId: id, refNo: w.doc_no });
                await c.query(`INSERT INTO wo_consumptions (wo_id, company_id, branch_code, issue_no, issue_date, sku, qty, unit_cost, value, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, u.companyId, branch, issueNo, date, l.sku, l.qty, out.unitCost, out.value, u.name]);
                (0, stock_shared_js_1.addTo)(byAccount, out.account, out.value);
                total += out.value;
            }
            if (total) {
                await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch, date, source: 'work_order', sourceId: id, rule: `WO_ISSUE_${issueNo}`, ref: w.doc_no, description: `Pemakaian bahan ${w.doc_no} #${issueNo} — ${w.product_name}`,
                    lines: [{ account: links.invWip, debit: total, credit: 0, memo: null }, ...[...byAccount].map(([acc, v]) => (0, domain_1.signedLine)(acc, -v))] });
            }
            await c.query(`UPDATE work_orders SET status = 'berjalan', issued_value = issued_value + $2, progress = greatest(progress, 10), updated_at = now() WHERE id = $1`, [id, total]);
            await this.log(c, u, w, 'issued', { issueNo, value: total, lines }, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    async submitQc(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const w = await this.row(c, u.companyId, id, true);
            (0, sales_shared_js_1.assertBranch)(u, { ...s, branch: 'ALL' }, (0, sales_shared_js_1.trimBranch)(w.branch_code));
            this.transition(w, 'qc');
            if (Number(w.issued_value) <= 0)
                throw (0, sales_shared_js_1.invalid)('WO_NO_MATERIAL', 'Belum ada bahan yang dikeluarkan untuk perintah kerja ini.');
            await c.query(`UPDATE work_orders SET status = 'qc', progress = 100, good_qty = $2, reject_qty = $3, qc_submitted_by = $4, qc_submitted_by_name = $5, qc_submitted_at = now(), qc_note = $6, updated_at = now() WHERE id = $1`, [id, b.goodQty, b.rejectQty, u.id, u.name, b.note ?? null]);
            await this.log(c, u, w, 'qc_submitted', { goodQty: b.goodQty, rejectQty: b.rejectQty, note: b.note }, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    /** Lolos QC: barang jadi masuk gudang senilai seluruh saldo WIP perintah kerja. */
    async complete(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const w = await this.row(c, u.companyId, id, true);
            const branch = (0, sales_shared_js_1.trimBranch)(w.branch_code);
            (0, sales_shared_js_1.assertBranch)(u, { ...s, branch: 'ALL' }, branch);
            this.transition(w, 'selesai');
            if (w.qc_submitted_by === u.id)
                throw new errors_js_1.DomainError('SOD_WORK_ORDER', 'Pelapor hasil produksi tidak boleh meloloskan QC-nya sendiri (kontrol empat mata).', common_1.HttpStatus.FORBIDDEN);
            const date = b.date ?? (0, sales_shared_js_1.todayWib)();
            const lastIssue = (await c.query('SELECT max(issue_date) AS d FROM wo_consumptions WHERE wo_id = $1', [id])).rows[0].d;
            if (lastIssue && date < lastIssue)
                throw (0, sales_shared_js_1.invalid)('COMPLETE_DATE', 'Tanggal selesai tidak boleh sebelum pemakaian bahan terakhir.');
            const links = await this.refs.links(c, u.companyId);
            const wip = Number(w.issued_value) - Number(w.output_value);
            const good = Number(w.good_qty);
            const tpl = (await c.query('SELECT name, category, uom FROM stock_items WHERE company_id = $1 AND sku = $2 LIMIT 1', [u.companyId, w.sku])).rows[0]
                ?? { name: w.product_name, category: 'Barang jadi', uom: w.uom };
            const inn = await (0, stock_shared_js_1.receiveStock)(c, u, links, { branch, warehouse: w.warehouse_code, sku: w.sku, qty: good, value: wip, date, refType: 'production_output', refId: id, refNo: w.doc_no, template: tpl });
            await c.query(`INSERT INTO wo_outputs (wo_id, company_id, branch_code, output_date, good_qty, reject_qty, unit_cost, value, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, u.companyId, branch, date, good, Number(w.reject_qty ?? 0), (0, domain_1.unitCostOf)(wip, good), wip, u.name]);
            await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch, date, source: 'work_order', sourceId: id, rule: 'WO_OUTPUT', ref: w.doc_no, description: `Hasil produksi ${w.doc_no} — ${good.toLocaleString('id-ID')} ${w.uom} ${w.product_name}`,
                lines: [(0, domain_1.signedLine)(inn.account, inn.delta), (0, domain_1.signedLine)(links.invVariance, inn.variance, 'Selisih pembulatan harga pokok'), { account: links.invWip, debit: 0, credit: wip, memo: null }] });
            await c.query(`UPDATE work_orders SET status = 'selesai', output_value = output_value + $2, completed_date = $3, completed_by = $4, completed_by_name = $5, qc_note = coalesce($6, qc_note), flag = NULL, updated_at = now() WHERE id = $1`, [id, wip, date, u.id, u.name, b.note ?? null]);
            await this.log(c, u, w, 'completed', { goodQty: good, value: wip, note: b.note }, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    /** QC tidak lolos: kembali berjalan (pengerjaan ulang). */
    async rework(u, s, id, note, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const w = await this.row(c, u.companyId, id, true);
            (0, sales_shared_js_1.assertBranch)(u, { ...s, branch: 'ALL' }, (0, sales_shared_js_1.trimBranch)(w.branch_code));
            this.transition(w, 'berjalan');
            await c.query(`UPDATE work_orders SET status = 'berjalan', progress = 90, flag = $2, qc_note = $2, qc_submitted_by = NULL, qc_submitted_by_name = NULL, qc_submitted_at = NULL, updated_at = now() WHERE id = $1`, [id, `QC: ${note}`]);
            await this.log(c, u, w, 'qc_rejected', { note }, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    async cancel(u, s, id, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const w = await this.row(c, u.companyId, id, true);
            (0, sales_shared_js_1.assertBranch)(u, { ...s, branch: 'ALL' }, (0, sales_shared_js_1.trimBranch)(w.branch_code));
            this.transition(w, 'batal');
            if (Number(w.issued_value) > 0)
                throw (0, errors_js_1.conflict)('WO_HAS_WIP', 'Bahan sudah dikeluarkan; selesaikan perintah kerja ini.');
            await c.query(`UPDATE work_orders SET status = 'batal', cancel_reason = $2, updated_at = now() WHERE id = $1`, [id, reason]);
            await this.log(c, u, w, 'cancelled', { reason }, requestId);
            return this.load(c, u.companyId, id);
        });
    }
};
exports.WorkOrdersService = WorkOrdersService;
exports.WorkOrdersService = WorkOrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], WorkOrdersService);
//# sourceMappingURL=work-orders.service.js.map