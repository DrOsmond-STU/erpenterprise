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
exports.PurchaseOrdersService = exports.mapPo = void 0;
/**
 * Pesanan pembelian (dok. 07 §6.3): draf → ajukan → (ambang PO / pemasok
 * dipantau) → menunggu/disetujui → penerimaan barang (sebagian/penuh).
 * Penerimaan menambah stok (harga pokok rata-rata) dan memposting
 * Dr Persediaan / Cr Utang barang diterima belum ditagih dalam transaksi yang sama.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const lines_js_1 = require("./lines.js");
const suppliers_service_js_1 = require("./suppliers.service.js");
const STATUS_LABEL = { draf: 'Draf', menunggu: 'Menunggu persetujuan', disetujui: 'Disetujui — menunggu barang', ditolak: 'Ditolak', 'diterima-sebagian': 'Diterima sebagian', selesai: 'Selesai', batal: 'Batal' };
const mapPo = (o) => ({
    id: o.id, docNo: o.doc_no, branch: (0, sales_shared_js_1.trimBranch)(o.branch_code), supplierId: o.supplier_id, supplierName: o.supplier_name, supplierCode: o.supplier_code,
    date: o.order_date, expectedDate: o.expected_date, status: o.status, statusLabel: STATUS_LABEL[o.status] ?? o.status,
    subtotal: o.subtotal, discount: o.discount, net: o.net_amount, ppn: o.ppn_amount, total: o.total, notes: o.notes, approvalReasons: o.approval_reasons ?? [],
    createdBy: o.created_by, createdByName: o.created_by_name, submittedAt: o.submitted_at, decidedByName: o.decided_by_name, decidedAt: o.decided_at, decisionNote: o.decision_note,
    createdAt: o.created_at, lineCount: o.line_count ?? undefined, receivedPct: o.received_pct === null || o.received_pct === undefined ? undefined : Number(o.received_pct),
});
exports.mapPo = mapPo;
const SELECT = `SELECT o.*, s.name AS supplier_name, s.code AS supplier_code,
  (SELECT count(*)::int FROM purchase_order_lines l WHERE l.order_id = o.id) AS line_count,
  (SELECT CASE WHEN sum(l.qty) FILTER (WHERE l.kind = 'barang') > 0 THEN round(100 * sum(l.qty_received) FILTER (WHERE l.kind = 'barang') / sum(l.qty) FILTER (WHERE l.kind = 'barang')) END
     FROM purchase_order_lines l WHERE l.order_id = o.id) AS received_pct
  FROM purchase_orders o JOIN suppliers s ON s.id = o.supplier_id`;
let PurchaseOrdersService = class PurchaseOrdersService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`${SELECT} WHERE o.company_id = $1 AND ($2::text IS NULL OR o.branch_code = $2) ORDER BY o.order_date DESC, o.doc_no DESC LIMIT 5000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(exports.mapPo));
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Pesanan pembelian');
        if (lock)
            await c.query('SELECT 1 FROM purchase_orders WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
        const o = (await c.query(`${SELECT} WHERE o.company_id = $1 AND o.id = $2`, [companyId, id])).rows[0];
        if (!o)
            throw (0, errors_js_1.notFound)('Pesanan pembelian');
        return o;
    }
    async load(c, companyId, id) {
        const o = await this.row(c, companyId, id);
        const lines = (await c.query('SELECT * FROM purchase_order_lines WHERE order_id = $1 ORDER BY line_no', [id])).rows.map(lines_js_1.mapPoLine);
        const sup = (await c.query('SELECT * FROM suppliers WHERE id = $1', [o.supplier_id])).rows[0];
        const receipts = (await c.query(`SELECT g.*, j.journal_no FROM goods_receipts g LEFT JOIN journals j ON j.id = g.journal_id WHERE g.order_id = $1 ORDER BY g.receipt_date, g.doc_no`, [id])).rows
            .map((g) => ({ id: g.id, docNo: g.doc_no, date: g.receipt_date, warehouse: g.warehouse_code, value: g.total_value, journalId: g.journal_id, journalNo: g.journal_no, createdByName: g.created_by_name, deliveryNote: g.delivery_note }));
        const invoices = (await c.query(`SELECT id, doc_no, invoice_date, total_gross, paid_amount, status FROM ap_invoices WHERE company_id = $1 AND purchase_order_id = $2 ORDER BY invoice_date, doc_no`, [companyId, id])).rows
            .map((i) => ({ id: i.id, docNo: i.doc_no, date: i.invoice_date, total: i.total_gross, paid: i.paid_amount, status: i.status }));
        const uninvoicedReceipts = Number((await c.query(`SELECT coalesce(sum(gl.value),0) AS v FROM goods_receipt_lines gl JOIN goods_receipts g ON g.id = gl.receipt_id WHERE g.order_id = $1 AND gl.invoice_id IS NULL`, [id])).rows[0].v);
        const openServices = lines.filter((l) => l.kind === 'jasa' && l.qtyInvoiced < l.qty).length;
        return { ...(0, exports.mapPo)(o), lines, supplier: (0, suppliers_service_js_1.mapSupplier)(sup), receipts, invoices, uninvoicedReceipts, canInvoice: uninvoicedReceipts > 0 || (openServices > 0 && ['disetujui', 'diterima-sebagian'].includes(o.status)), timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'purchase_order', o.doc_no) };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    async supplier(c, companyId, id) {
        if (!id || !sales_shared_js_1.UUID.test(id))
            throw (0, sales_shared_js_1.invalid)('SUPPLIER_REQUIRED', 'Pilih pemasok.');
        const r = (await c.query('SELECT * FROM suppliers WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
        if (!r)
            throw (0, sales_shared_js_1.invalid)('SUPPLIER_UNKNOWN', 'Pemasok tidak dikenal.');
        if (r.status === 'nonaktif' || r.status === 'diblokir')
            throw (0, sales_shared_js_1.invalid)('SUPPLIER_BLOCKED', `Pemasok ${r.name} berstatus ${r.status}; PO tidak dapat dibuat.`);
        return r;
    }
    async create(u, s, b, requestId) {
        const branch = String(b.branch ?? (s.branch === 'ALL' ? '' : s.branch)).toUpperCase();
        if (!/^[A-Z]{3}$/.test(branch))
            throw (0, sales_shared_js_1.invalid)('BRANCH_REQUIRED', 'Pilih cabang PO.');
        (0, sales_shared_js_1.assertBranch)(u, s, branch);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const br = (await c.query('SELECT status FROM branches WHERE company_id = $1 AND code = $2', [u.companyId, branch])).rows[0];
            if (!br || br.status !== 'aktif')
                throw (0, sales_shared_js_1.invalid)('BRANCH_INACTIVE', `Cabang ${branch} tidak aktif.`);
            const sup = await this.supplier(c, u.companyId, b.supplierId);
            const { lines, totals } = await (0, lines_js_1.resolvePoLines)(c, u.companyId, branch, b.lines ?? []);
            const date = b.orderDate ?? (0, sales_shared_js_1.todayWib)();
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'PO', Number(date.slice(0, 4)));
            const o = (await c.query(`INSERT INTO purchase_orders (company_id, branch_code, doc_no, supplier_id, order_date, expected_date, notes, subtotal, discount, net_amount, ppn_amount, total, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, [u.companyId, branch, docNo, sup.id, date, b.expectedDate ?? (0, domain_1.addDays)(date, sup.lead_days), b.notes ?? null, totals.subtotal, totals.discount, totals.net, totals.ppn, totals.total, u.id, u.name])).rows[0];
            await (0, lines_js_1.insertPoLines)(c, o.id, u.companyId, branch, lines);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'purchase_order.created', entityType: 'purchase_order', entityId: docNo, after: { supplier: sup.name, total: totals.total }, requestId });
            if (b.submit)
                await this.doSubmit(c, u, o.id, requestId);
            return this.load(c, u.companyId, o.id);
        });
    }
    async update(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const o = await this.row(c, u.companyId, id, true);
            if (!['draf', 'ditolak'].includes(o.status))
                throw (0, errors_js_1.conflict)('PO_LOCKED', `PO ${o.doc_no} berstatus ${STATUS_LABEL[o.status]}; hanya draf atau PO ditolak yang dapat diubah.`);
            const sup = await this.supplier(c, u.companyId, b.supplierId ?? o.supplier_id);
            const res = b.lines ? await (0, lines_js_1.resolvePoLines)(c, u.companyId, (0, sales_shared_js_1.trimBranch)(o.branch_code), b.lines) : null;
            await c.query(`UPDATE purchase_orders SET supplier_id = $2, order_date = coalesce($3, order_date), expected_date = coalesce($4, expected_date), notes = coalesce($5, notes),
            subtotal = coalesce($6, subtotal), discount = coalesce($7, discount), net_amount = coalesce($8, net_amount), ppn_amount = coalesce($9, ppn_amount), total = coalesce($10, total),
            status = 'draf', approval_reasons = '[]'::jsonb, updated_at = now() WHERE id = $1`, [id, sup.id, b.orderDate ?? null, b.expectedDate ?? null, b.notes ?? null, res?.totals.subtotal ?? null, res?.totals.discount ?? null, res?.totals.net ?? null, res?.totals.ppn ?? null, res?.totals.total ?? null]);
            if (res)
                await (0, lines_js_1.insertPoLines)(c, id, u.companyId, (0, sales_shared_js_1.trimBranch)(o.branch_code), res.lines);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(o.branch_code), userId: u.id, sessionId: u.sessionId, action: 'purchase_order.updated', entityType: 'purchase_order', entityId: o.doc_no, after: { total: res?.totals.total ?? o.total }, requestId });
            if (b.submit)
                await this.doSubmit(c, u, id, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    async submit(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => { await this.doSubmit(c, u, id, requestId); return this.load(c, u.companyId, id); });
    }
    /** Ajukan: di bawah ambang & pemasok aktif → disetujui otomatis; selainnya menunggu manajer (K-24). */
    async doSubmit(c, u, id, requestId) {
        const o = await this.row(c, u.companyId, id, true);
        if (o.status !== 'draf')
            throw (0, errors_js_1.conflict)('PO_NOT_DRAFT', `PO ${o.doc_no} bukan draf.`);
        if (o.total <= 0)
            throw (0, sales_shared_js_1.invalid)('PO_EMPTY', 'Nilai PO nol.');
        const sup = await this.supplier(c, u.companyId, o.supplier_id);
        const pol = await (0, sales_shared_js_1.companyPolicies)(c, u.companyId);
        const reasons = [];
        if (pol.purchaseApprovalThreshold > 0 && o.total > pol.purchaseApprovalThreshold)
            reasons.push(`Nilai PO di atas batas persetujuan Rp ${pol.purchaseApprovalThreshold.toLocaleString('id-ID')}.`);
        if (sup.status === 'pantau')
            reasons.push(`Pemasok ${sup.name} berstatus dipantau.`);
        const status = reasons.length ? 'menunggu' : 'disetujui';
        await c.query(`UPDATE purchase_orders SET status = $2, approval_reasons = $3::jsonb, submitted_at = now(), updated_at = now(),
          decided_by = NULL, decided_by_name = CASE WHEN $2 = 'disetujui' THEN 'Sistem (di bawah ambang)' END, decided_at = CASE WHEN $2 = 'disetujui' THEN now() END, decision_note = NULL
        WHERE id = $1`, [id, status, JSON.stringify(reasons)]);
        await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(o.branch_code), userId: u.id, sessionId: u.sessionId, action: reasons.length ? 'purchase_order.submitted' : 'purchase_order.auto_approved',
            entityType: 'purchase_order', entityId: o.doc_no, after: { total: o.total, reasons, threshold: pol.purchaseApprovalThreshold }, requestId });
    }
    async decide(u, s, id, approve, note, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const o = await this.row(c, u.companyId, id, true);
            if (o.status !== 'menunggu')
                throw (0, errors_js_1.conflict)('PO_NOT_PENDING', `PO ${o.doc_no} tidak sedang menunggu persetujuan.`);
            if (o.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_PURCHASE_ORDER', 'Pembuat PO tidak boleh memutus PO-nya sendiri (kontrol empat mata).', common_1.HttpStatus.FORBIDDEN);
            if (!approve && (!note || note.trim().length < 3))
                throw (0, sales_shared_js_1.invalid)('REASON_REQUIRED', 'Penolakan PO wajib diberi alasan.');
            await c.query(`UPDATE purchase_orders SET status = $2, decided_by = $3, decided_by_name = $4, decided_at = now(), decision_note = $5, updated_at = now() WHERE id = $1`, [id, approve ? 'disetujui' : 'ditolak', u.id, u.name, note ?? null]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(o.branch_code), userId: u.id, sessionId: u.sessionId, action: approve ? 'purchase_order.approved' : 'purchase_order.rejected', entityType: 'purchase_order', entityId: o.doc_no, after: { note, reasons: o.approval_reasons }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async cancel(u, s, id, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const o = await this.row(c, u.companyId, id, true);
            if (!['draf', 'menunggu', 'disetujui', 'ditolak'].includes(o.status))
                throw (0, errors_js_1.conflict)('PO_LOCKED', `PO ${o.doc_no} berstatus ${STATUS_LABEL[o.status]} dan tidak dapat dibatalkan.`);
            const moved = (await c.query('SELECT coalesce(sum(qty_received + qty_invoiced),0) AS n FROM purchase_order_lines WHERE order_id = $1', [id])).rows[0].n;
            if (Number(moved) > 0)
                throw (0, errors_js_1.conflict)('PO_HAS_ACTIVITY', `PO ${o.doc_no} sudah memiliki penerimaan atau tagihan.`);
            if (!(o.created_by === u.id || u.permissions.has('purchasing.order.approve')))
                throw (0, errors_js_1.forbidden)('Hanya pembuat PO atau penyetuju yang dapat membatalkan PO.');
            await c.query(`UPDATE purchase_orders SET status = 'batal', decision_note = $2, updated_at = now() WHERE id = $1`, [id, reason]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(o.branch_code), userId: u.id, sessionId: u.sessionId, action: 'purchase_order.cancelled', entityType: 'purchase_order', entityId: o.doc_no, after: { reason }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    /** Status PO dari kemajuan barang (diterima) dan jasa (ditagih). */
    async refreshStatus(c, id) {
        const r = (await c.query(`SELECT bool_and(CASE WHEN kind = 'barang' THEN qty_received >= qty ELSE qty_invoiced >= qty END) AS done,
              bool_or(qty_received > 0 OR qty_invoiced > 0) AS started FROM purchase_order_lines WHERE order_id = $1`, [id])).rows[0];
        await c.query(`UPDATE purchase_orders SET status = CASE WHEN $2 THEN 'selesai' WHEN $3 THEN 'diterima-sebagian' ELSE 'disetujui' END, updated_at = now()
                    WHERE id = $1 AND status IN ('disetujui','diterima-sebagian','selesai')`, [id, Boolean(r.done), Boolean(r.started)]);
    }
    /** Penerimaan barang (GR): stok bertambah dengan harga PO, jurnal Dr persediaan / Cr barang diterima belum ditagih. */
    async receive(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const o = await this.row(c, u.companyId, id, true);
            if (!['disetujui', 'diterima-sebagian'].includes(o.status))
                throw (0, errors_js_1.conflict)('PO_NOT_OPEN', `PO ${o.doc_no} berstatus ${STATUS_LABEL[o.status]}; barang tidak dapat diterima.`);
            const branch = (0, sales_shared_js_1.trimBranch)(o.branch_code);
            const date = b.date ?? (0, sales_shared_js_1.todayWib)();
            if (date < o.order_date)
                throw (0, sales_shared_js_1.invalid)('RECEIPT_DATE', 'Tanggal penerimaan tidak boleh sebelum tanggal PO.');
            const lines = (await c.query('SELECT * FROM purchase_order_lines WHERE order_id = $1 FOR UPDATE', [id])).rows;
            const errs = [];
            const picked = b.lines.filter((x) => x.qty > 0).map((x) => {
                const l = lines.find((y) => Number(y.id) === x.orderLineId);
                if (!l) {
                    errs.push(`Baris ${x.orderLineId} bukan bagian dari PO ini.`);
                    return null;
                }
                if (l.kind !== 'barang') {
                    errs.push(`${l.description}: jasa tidak melalui penerimaan barang.`);
                    return null;
                }
                const open = Number(l.qty) - Number(l.qty_received);
                if (x.qty > open + 1e-9)
                    errs.push(`${l.sku}: diterima ${x.qty} melebihi sisa PO (${open}).`);
                return { l, qty: x.qty };
            }).filter(Boolean);
            if (!picked.length && !errs.length)
                errs.push('Isi kuantitas diterima minimal satu baris.');
            if (errs.length)
                throw (0, sales_shared_js_1.invalid)('RECEIPT_INVALID', errs[0], errs);
            const links = await this.refs.links(c, u.companyId);
            const brRow = (await c.query('SELECT city FROM branches WHERE company_id = $1 AND code = $2', [u.companyId, branch])).rows[0];
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'GR', Number(date.slice(0, 4)));
            const gr = (await c.query(`INSERT INTO goods_receipts (company_id, branch_code, doc_no, order_id, receipt_date, warehouse_code, delivery_note, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [u.companyId, branch, docNo, id, date, b.warehouse ?? '', b.deliveryNote ?? null, u.id, u.name])).rows[0];
            const byAccount = new Map();
            let total = 0;
            let variance = 0;
            let wh = b.warehouse ?? '';
            for (const { l, qty } of picked) {
                /* Nilai persis proporsional terhadap neto baris PO: sisa terakhir menyerap pembulatan. */
                const remainingQty = Number(l.qty) - Number(l.qty_received);
                const receivedValue = Number((await c.query('SELECT coalesce(sum(value),0) AS v FROM goods_receipt_lines WHERE order_line_id = $1', [l.id])).rows[0].v);
                const value = Math.abs(qty - remainingQty) < 1e-9 ? Number(l.net) - receivedValue : Math.round((Number(l.net) * qty) / Number(l.qty));
                const unitCost = Math.round(value / qty);
                let st = (await c.query(`SELECT * FROM stock_items WHERE company_id = $1 AND branch_code = $2 AND sku = $3 ${b.warehouse ? 'AND warehouse_code = $4' : ''} ORDER BY on_hand DESC LIMIT 1 FOR UPDATE`, b.warehouse ? [u.companyId, branch, l.sku, b.warehouse] : [u.companyId, branch, l.sku])).rows[0];
                if (!st) {
                    const any = (await c.query('SELECT name, category, uom FROM stock_items WHERE company_id = $1 AND sku = $2 LIMIT 1', [u.companyId, l.sku])).rows[0];
                    const whCode = b.warehouse || (await c.query('SELECT warehouse_code FROM stock_items WHERE company_id = $1 AND branch_code = $2 LIMIT 1', [u.companyId, branch])).rows[0]?.warehouse_code
                        || (await c.query(`SELECT code FROM warehouses WHERE company_id = $1 AND branch_code = $2 AND status = 'aktif' ORDER BY code LIMIT 1`, [u.companyId, branch])).rows[0]?.code || brRow?.city || branch;
                    st = (await c.query(`INSERT INTO stock_items (company_id, branch_code, warehouse_code, sku, name, category, uom, on_hand, avg_cost) VALUES ($1,$2,$3,$4,$5,$6,$7,0,0) RETURNING *`, [u.companyId, branch, whCode, l.sku, any?.name ?? l.description, any?.category ?? 'Bahan baku', any?.uom ?? l.unit])).rows[0];
                }
                wh = st.warehouse_code;
                /* Kartu stok bernilai on_hand × rata-rata (bulat); jurnal persediaan = perubahan nilai kartu,
                   selisih pembulatan terhadap nilai PO dibebankan ke HPP agar GRNI tetap tepat sebesar nilai PO. */
                const onHand = Number(st.on_hand), avg = Number(st.avg_cost);
                const newAvg = (0, domain_1.movingAverage)(onHand, avg, qty, value / qty);
                const delta = Math.round((onHand + qty) * newAvg - onHand * avg);
                await c.query('UPDATE stock_items SET on_hand = on_hand + $2, avg_cost = $3 WHERE id = $1', [st.id, qty, newAvg]);
                await c.query(`INSERT INTO stock_moves (company_id, branch_code, warehouse_code, sku, move_date, qty, unit_cost, ref_type, ref_id, ref_no, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'goods_receipt',$8,$9,$10)`, [u.companyId, branch, st.warehouse_code, l.sku, date, qty, unitCost, gr.id, docNo, u.id]);
                await c.query(`INSERT INTO goods_receipt_lines (receipt_id, company_id, branch_code, order_line_id, sku, description, qty, unit_cost, value) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [gr.id, u.companyId, branch, l.id, l.sku, l.description, qty, unitCost, value]);
                await c.query('UPDATE purchase_order_lines SET qty_received = qty_received + $2 WHERE id = $1', [l.id, qty]);
                const acct = st.category === 'Barang jadi' ? links.invFinished : links.invRaw;
                byAccount.set(acct, (byAccount.get(acct) ?? 0) + delta);
                variance += value - delta;
                total += value;
            }
            const j = await (0, sales_shared_js_1.postAutoJournal)(c, u, {
                branch, date, source: 'goods_receipt', sourceId: gr.id, rule: 'PURCHASE_RECEIPT', ref: docNo, description: `Penerimaan barang ${docNo} — ${o.supplier_name} (${o.doc_no})`,
                lines: [
                    ...[...byAccount].map(([account, v]) => ({ account, debit: Math.max(v, 0), credit: Math.max(-v, 0) })),
                    { account: links.cogs, debit: Math.max(variance, 0), credit: Math.max(-variance, 0), memo: 'Selisih pembulatan harga pokok rata-rata' },
                    { account: links.grni, debit: 0, credit: total, party: o.supplier_name },
                ],
            });
            await c.query('UPDATE goods_receipts SET total_value = $2, journal_id = $3, warehouse_code = $4 WHERE id = $1', [gr.id, total, j.id, wh]);
            await this.refreshStatus(c, id);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'purchase_order.received', entityType: 'purchase_order', entityId: o.doc_no,
                after: { receipt: docNo, value: total, journal: j.journalNo, lines: picked.map((p) => ({ sku: p.l.sku, qty: p.qty })) }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async receipts(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`SELECT g.*, o.doc_no AS order_no, s.name AS supplier_name, j.journal_no,
                (SELECT count(*)::int FROM goods_receipt_lines l WHERE l.receipt_id = g.id) AS line_count,
                (SELECT bool_and(l.invoice_id IS NOT NULL) FROM goods_receipt_lines l WHERE l.receipt_id = g.id) AS invoiced
           FROM goods_receipts g JOIN purchase_orders o ON o.id = g.order_id JOIN suppliers s ON s.id = o.supplier_id LEFT JOIN journals j ON j.id = g.journal_id
          WHERE g.company_id = $1 AND ($2::text IS NULL OR g.branch_code = $2) ORDER BY g.receipt_date DESC, g.doc_no DESC LIMIT 5000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows
            .map((g) => ({ id: g.id, docNo: g.doc_no, branch: (0, sales_shared_js_1.trimBranch)(g.branch_code), date: g.receipt_date, orderId: g.order_id, orderNo: g.order_no, supplierName: g.supplier_name,
            warehouse: g.warehouse_code, value: g.total_value, journalId: g.journal_id, journalNo: g.journal_no, lineCount: g.line_count, invoiced: Boolean(g.invoiced), createdByName: g.created_by_name })));
    }
};
exports.PurchaseOrdersService = PurchaseOrdersService;
exports.PurchaseOrdersService = PurchaseOrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], PurchaseOrdersService);
//# sourceMappingURL=orders.service.js.map