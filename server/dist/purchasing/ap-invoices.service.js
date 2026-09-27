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
exports.invoiceStatus = exports.mapPaymentRow = exports.PAYMENT_STATUS_LABEL = exports.ApInvoicesService = void 0;
exports.mapApInvoice = mapApInvoice;
/**
 * Tagihan pemasok (dok. 07 §6.5, §10.3).
 *  - Dari PO: baris barang = penerimaan barang yang belum ditagih (nilai persis
 *    sama dengan kredit GRNI saat penerimaan), baris jasa = sisa kuantitas PO.
 *    Bila nilai tagihan pemasok diisi, harus sama dengan hasil kecocokan tiga arah.
 *  - Langsung (tanpa PO): hanya baris jasa/biaya dengan akun detail.
 *  - Posting oleh orang lain (purchasing.invoice.post): Dr GRNI/biaya + PPN masukan, Cr utang usaha.
 *  - Batal: draf bebas; terposting hanya bila belum ada pembayaran → jurnal balik,
 *    penerimaan barang dilepas agar dapat ditagih ulang.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
Object.defineProperty(exports, "invoiceStatus", { enumerable: true, get: function () { return domain_1.invoiceStatus; } });
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const lines_js_1 = require("./lines.js");
const orders_service_js_1 = require("./orders.service.js");
const suppliers_service_js_1 = require("./suppliers.service.js");
const STATUS_LABEL = { draf: 'Draf', 'belum-dibayar': 'Belum dibayar', sebagian: 'Dibayar sebagian', lunas: 'Lunas', batal: 'Batal' };
function mapApInvoice(i, asOf = (0, sales_shared_js_1.todayWib)()) {
    const open = i.status === 'draf' || i.status === 'batal' ? 0 : i.total_gross - i.paid_amount;
    const overdue = (0, domain_1.overdueDays)(i.due_date, asOf, open);
    return {
        id: i.id, docNo: i.doc_no, branch: (0, sales_shared_js_1.trimBranch)(i.branch_code), supplierId: i.supplier_id, supplierName: i.supplier_name, supplierCode: i.supplier_code ?? null,
        orderId: i.purchase_order_id, orderNo: i.order_no ?? i.po_ref ?? null, supplierInvoiceNo: i.supplier_invoice_no,
        date: i.invoice_date, dueDate: i.due_date, subtotal: i.subtotal, discount: i.discount, net: i.net_amount, ppn: i.ppn_amount, total: i.total_gross,
        paid: i.paid_amount, paidDate: i.paid_date, open, overdueDays: overdue, isOverdue: overdue > 0, pendingPayments: i.pending_payments === undefined ? undefined : Number(i.pending_payments),
        status: i.status, statusLabel: overdue > 0 ? `Jatuh tempo ${overdue} hari` : STATUS_LABEL[i.status] ?? i.status,
        threeWayMatched: i.three_way_matched, kind: i.kind, notes: i.notes,
        createdBy: i.created_by, createdByName: i.created_by_name, postedByName: i.posted_by_name, postedAt: i.posted_at,
        cancelDate: i.cancel_date, cancelReason: i.cancel_reason, legacy: i.subtotal === 0 && i.total_gross > 0 && i.status !== 'draf',
    };
}
const SELECT = `SELECT i.*, s.code AS supplier_code, o.doc_no AS order_no,
  (SELECT coalesce(sum(p.amount),0) FROM supplier_payments p WHERE p.invoice_id = i.id AND p.status IN ('menunggu','disetujui')) AS pending_payments
  FROM ap_invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id LEFT JOIN purchase_orders o ON o.id = i.purchase_order_id`;
let ApInvoicesService = class ApInvoicesService {
    db;
    audit;
    refs;
    orders;
    constructor(db, audit, refs, orders) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
        this.orders = orders;
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const rows = (await c.query(`${SELECT} WHERE i.company_id = $1 AND ($2::text IS NULL OR i.branch_code = $2) ORDER BY i.invoice_date DESC, i.doc_no DESC LIMIT 5000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows;
            const today = (0, sales_shared_js_1.todayWib)();
            return rows.map((r) => mapApInvoice(r, today));
        });
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Tagihan pemasok');
        if (lock)
            await c.query('SELECT 1 FROM ap_invoices WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
        const r = (await c.query(`${SELECT} WHERE i.company_id = $1 AND i.id = $2`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Tagihan pemasok');
        return r;
    }
    async load(c, companyId, id) {
        const i = await this.row(c, companyId, id);
        const lines = (await c.query('SELECT * FROM ap_invoice_lines WHERE invoice_id = $1 ORDER BY line_no', [id])).rows
            .map((l) => ({ id: Number(l.id), lineNo: l.line_no, orderLineId: l.order_line_id ? Number(l.order_line_id) : null, sku: l.sku, description: l.description, kind: l.kind, account: l.account_code, qty: Number(l.qty), unit: l.unit, price: l.price, net: l.net }));
        const payments = (await c.query(`SELECT p.*, b.name AS bank_name, j.journal_no FROM supplier_payments p LEFT JOIN bank_accounts b ON b.company_id = p.company_id AND b.code = p.bank_account_code
         LEFT JOIN journals j ON j.id = p.journal_id WHERE p.invoice_id = $1 ORDER BY p.payment_date, p.doc_no`, [id])).rows.map(exports.mapPaymentRow);
        const receipts = (await c.query(`SELECT DISTINCT g.id, g.doc_no, g.receipt_date, g.total_value FROM goods_receipts g JOIN goods_receipt_lines l ON l.receipt_id = g.id WHERE l.invoice_id = $1 ORDER BY g.receipt_date`, [id])).rows
            .map((g) => ({ id: g.id, docNo: g.doc_no, date: g.receipt_date, value: g.total_value }));
        const journals = (await c.query(`SELECT id, journal_no, journal_date, rule_code, status, total_debit, description FROM journals
        WHERE company_id = $1 AND ((source_type = 'ap_invoice' AND (source_id = $2 OR (source_id IS NULL AND ref = $3))) OR ref = $3 OR id IN (SELECT journal_id FROM supplier_payments WHERE invoice_id = $2::uuid AND journal_id IS NOT NULL))
        ORDER BY journal_date, journal_no`, [companyId, id, i.doc_no])).rows
            .map((j) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, rule: j.rule_code, status: j.status, total: j.total_debit, description: j.description }));
        const sup = i.supplier_id ? (0, suppliers_service_js_1.mapSupplier)((await c.query('SELECT * FROM suppliers WHERE id = $1', [i.supplier_id])).rows[0]) : null;
        return { ...mapApInvoice(i), lines, payments, receipts, journals, supplier: sup, timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'ap_invoice', i.doc_no) };
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
        if (r.status === 'nonaktif')
            throw (0, sales_shared_js_1.invalid)('SUPPLIER_INACTIVE', `Pemasok ${r.name} nonaktif.`);
        return r;
    }
    /** Baris tagihan dari PO: penerimaan belum ditagih (barang) + sisa jasa. */
    async linesFromOrder(c, orderId, grni) {
        const poLines = (await c.query('SELECT * FROM purchase_order_lines WHERE order_id = $1 ORDER BY line_no FOR UPDATE', [orderId])).rows;
        const out = [];
        const receiptLineIds = [];
        const checks = [];
        for (const l of poLines) {
            if (l.kind === 'barang') {
                const gr = (await c.query(`SELECT id, qty, value FROM goods_receipt_lines WHERE order_line_id = $1 AND invoice_id IS NULL FOR UPDATE`, [l.id])).rows;
                if (!gr.length)
                    continue;
                const qty = gr.reduce((t, g) => t + Number(g.qty), 0);
                const net = gr.reduce((t, g) => t + Number(g.value), 0);
                receiptLineIds.push(...gr.map((g) => Number(g.id)));
                const price = Math.round(net / qty);
                const poUnitNet = Math.round(Number(l.net) / Number(l.qty));
                checks.push({ sku: l.sku, qty, price, received: Number(l.qty_received), invoiced: Number(l.qty_invoiced), poPrice: Math.abs(price - poUnitNet) <= 1 ? price : poUnitNet });
                out.push({ orderLineId: Number(l.id), sku: l.sku, description: l.description, kind: 'barang', account: grni, qty, unit: l.unit, price, net });
            }
            else {
                const openQty = Number(l.qty) - Number(l.qty_invoiced);
                if (openQty <= 1e-9)
                    continue;
                const billed = Number((await c.query(`SELECT coalesce(sum(al.net),0) AS v FROM ap_invoice_lines al JOIN ap_invoices a ON a.id = al.invoice_id WHERE al.order_line_id = $1 AND a.status <> 'batal'`, [l.id])).rows[0].v);
                const net = Number(l.net) - billed;
                out.push({ orderLineId: Number(l.id), sku: l.sku, description: l.description, kind: 'jasa', account: l.expense_account_code, qty: openQty, unit: l.unit, price: Math.round(net / openQty), net });
            }
        }
        const problems = (0, domain_1.threeWayProblems)(checks);
        if (problems.length)
            throw (0, sales_shared_js_1.invalid)('THREE_WAY_MISMATCH', problems[0], problems);
        return { lines: out, receiptLineIds };
    }
    async insert(c, u, h) {
        const t = (0, domain_1.salesTotals)(h.lines.map((l) => ({ qty: 1, price: l.net, discPct: 0, kind: l.kind })));
        const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'APV', Number(h.date.slice(0, 4)));
        const inv = (await c.query(`INSERT INTO ap_invoices (company_id, branch_code, doc_no, supplier_name, supplier_id, purchase_order_id, po_ref, supplier_invoice_no, kind, invoice_date, due_date,
                                total_gross, subtotal, discount, net_amount, ppn_amount, three_way_matched, status, notes, created_by, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,$13,$14,$15,'draf',$16,$17,$18) RETURNING id`, [u.companyId, h.branch, docNo, h.supplier.name, h.supplier.id, h.orderId, h.orderNo, h.supplierInvoiceNo ?? null, h.kind, h.date, h.due,
            t.total, t.net, t.ppn, h.matched, h.notes ?? null, u.id, u.name])).rows[0];
        let n = 0;
        for (const l of h.lines) {
            n += 1;
            await c.query(`INSERT INTO ap_invoice_lines (invoice_id, company_id, branch_code, line_no, order_line_id, sku, description, kind, account_code, qty, unit, price, net) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [inv.id, u.companyId, h.branch, n, l.orderLineId, l.sku, l.description, l.kind, l.account, l.qty, l.unit, l.price, l.net]);
        }
        return { id: inv.id, docNo, totals: t };
    }
    async create(u, s, b, requestId) {
        return b.orderId ? this.createFromOrder(u, s, b.orderId, b, requestId) : this.createDirect(u, s, b, requestId);
    }
    async createFromOrder(u, s, orderId, b, requestId) {
        if (!sales_shared_js_1.UUID.test(orderId))
            throw (0, errors_js_1.notFound)('Pesanan pembelian');
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            await c.query('SELECT 1 FROM purchase_orders WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, orderId]);
            const o = (await c.query('SELECT * FROM purchase_orders WHERE company_id = $1 AND id = $2', [u.companyId, orderId])).rows[0];
            if (!o)
                throw (0, errors_js_1.notFound)('Pesanan pembelian');
            if (!['disetujui', 'diterima-sebagian', 'selesai'].includes(o.status))
                throw (0, errors_js_1.conflict)('PO_NOT_OPEN', `PO ${o.doc_no} berstatus ${o.status}; tagihan belum dapat dibuat.`);
            const branch = (0, sales_shared_js_1.trimBranch)(o.branch_code);
            (0, sales_shared_js_1.assertBranch)(u, s, branch);
            const sup = await this.supplier(c, u.companyId, o.supplier_id);
            const links = await this.refs.links(c, u.companyId);
            const { lines, receiptLineIds } = await this.linesFromOrder(c, orderId, links.grni);
            if (!lines.length)
                throw (0, errors_js_1.conflict)('NOTHING_TO_INVOICE', `Tidak ada barang diterima atau jasa yang belum ditagih pada PO ${o.doc_no}.`);
            const date = b.invoiceDate ?? (0, sales_shared_js_1.todayWib)();
            if (date < o.order_date)
                throw (0, sales_shared_js_1.invalid)('INVOICE_DATE', 'Tanggal tagihan tidak boleh sebelum tanggal PO.');
            const due = b.dueDate ?? (0, domain_1.addDays)(date, sup.terms_days);
            if (due < date)
                throw (0, sales_shared_js_1.invalid)('INVOICE_DUE', 'Jatuh tempo tidak boleh sebelum tanggal tagihan.');
            const kind = lines.every((l) => l.kind === 'jasa') ? 'service' : 'goods';
            const preview = (0, domain_1.salesTotals)(lines.map((l) => ({ qty: 1, price: l.net, discPct: 0, kind: l.kind })));
            if (b.supplierTotal !== undefined && b.supplierTotal !== preview.total)
                throw (0, sales_shared_js_1.invalid)('THREE_WAY_MISMATCH', `Nilai tagihan pemasok Rp ${b.supplierTotal.toLocaleString('id-ID')} tidak sama dengan PO × barang diterima Rp ${preview.total.toLocaleString('id-ID')}. Minta nota koreksi pemasok atau revisi PO.`, { expected: preview.total, supplierTotal: b.supplierTotal });
            const inv = await this.insert(c, u, { branch, supplier: sup, orderId, orderNo: o.doc_no, date, due, supplierInvoiceNo: b.supplierInvoiceNo, notes: b.notes, kind, lines, matched: true });
            if (receiptLineIds.length)
                await c.query('UPDATE goods_receipt_lines SET invoice_id = $2 WHERE id = ANY($1::bigint[])', [receiptLineIds, inv.id]);
            for (const l of lines)
                await c.query('UPDATE purchase_order_lines SET qty_invoiced = qty_invoiced + $2 WHERE id = $1', [l.orderLineId, l.qty]);
            await this.orders.refreshStatus(c, orderId);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'ap_invoice.created', entityType: 'ap_invoice', entityId: inv.docNo,
                after: { supplier: sup.name, order: o.doc_no, total: inv.totals.total, supplierInvoiceNo: b.supplierInvoiceNo }, requestId });
            return this.load(c, u.companyId, inv.id);
        });
    }
    /** Tagihan tanpa PO: hanya jasa/biaya (barang berstok wajib lewat PO & penerimaan). */
    async createDirect(u, s, b, requestId) {
        const branch = String(b.branch ?? (s.branch === 'ALL' ? '' : s.branch)).toUpperCase();
        if (!/^[A-Z]{3}$/.test(branch))
            throw (0, sales_shared_js_1.invalid)('BRANCH_REQUIRED', 'Pilih cabang tagihan.');
        (0, sales_shared_js_1.assertBranch)(u, s, branch);
        if ((b.lines ?? []).some((l) => l.productId || (l.kind && l.kind !== 'jasa')))
            throw (0, sales_shared_js_1.invalid)('DIRECT_GOODS', 'Barang berstok harus melalui pesanan pembelian dan penerimaan barang; tagihan langsung hanya untuk jasa/biaya.');
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const sup = await this.supplier(c, u.companyId, b.supplierId);
            const { lines } = await (0, lines_js_1.resolvePoLines)(c, u.companyId, branch, (b.lines ?? []).map((l) => ({ ...l, kind: 'jasa', productId: null })));
            const date = b.invoiceDate ?? (0, sales_shared_js_1.todayWib)();
            const due = b.dueDate ?? (0, domain_1.addDays)(date, sup.terms_days);
            if (due < date)
                throw (0, sales_shared_js_1.invalid)('INVOICE_DUE', 'Jatuh tempo tidak boleh sebelum tanggal tagihan.');
            const draft = lines.map((l) => ({ orderLineId: null, sku: null, description: l.description, kind: 'jasa', account: l.expenseAccount, qty: l.qty, unit: l.unit, price: l.price, net: l.net }));
            const inv = await this.insert(c, u, { branch, supplier: sup, orderId: null, orderNo: null, date, due, supplierInvoiceNo: b.supplierInvoiceNo, notes: b.notes, kind: 'service', lines: draft, matched: false });
            if (b.supplierTotal !== undefined && b.supplierTotal !== inv.totals.total)
                throw (0, sales_shared_js_1.invalid)('INVOICE_TOTAL_MISMATCH', `Total baris Rp ${inv.totals.total.toLocaleString('id-ID')} tidak sama dengan nilai tagihan pemasok Rp ${b.supplierTotal.toLocaleString('id-ID')}.`);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'ap_invoice.created', entityType: 'ap_invoice', entityId: inv.docNo,
                after: { supplier: sup.name, total: inv.totals.total, direct: true }, requestId });
            return this.load(c, u.companyId, inv.id);
        });
    }
    /** Draf: ubah tanggal/nomor tagihan pemasok/catatan; baris hanya untuk tagihan langsung. */
    async update(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const i = await this.row(c, u.companyId, id, true);
            if (i.status !== 'draf')
                throw (0, errors_js_1.conflict)('AP_INVOICE_LOCKED', `Tagihan ${i.doc_no} sudah diposting; koreksi lewat pembatalan.`);
            const branch = (0, sales_shared_js_1.trimBranch)(i.branch_code);
            if (b.lines && i.purchase_order_id)
                throw (0, sales_shared_js_1.invalid)('AP_INVOICE_FROM_PO', 'Baris tagihan dari PO mengikuti penerimaan barang; batalkan draf lalu buat ulang bila perlu.');
            const date = b.invoiceDate ?? i.invoice_date;
            const due = b.dueDate ?? i.due_date;
            if (due < date)
                throw (0, sales_shared_js_1.invalid)('INVOICE_DUE', 'Jatuh tempo tidak boleh sebelum tanggal tagihan.');
            let totals = null;
            if (b.lines) {
                if (b.lines.some((l) => l.productId || (l.kind && l.kind !== 'jasa')))
                    throw (0, sales_shared_js_1.invalid)('DIRECT_GOODS', 'Tagihan langsung hanya untuk jasa/biaya.');
                const r = await (0, lines_js_1.resolvePoLines)(c, u.companyId, branch, b.lines.map((l) => ({ ...l, kind: 'jasa', productId: null })));
                totals = r.totals;
                await c.query('DELETE FROM ap_invoice_lines WHERE invoice_id = $1', [id]);
                let n = 0;
                for (const l of r.lines) {
                    n += 1;
                    await c.query(`INSERT INTO ap_invoice_lines (invoice_id, company_id, branch_code, line_no, description, kind, account_code, qty, unit, price, net) VALUES ($1,$2,$3,$4,$5,'jasa',$6,$7,$8,$9,$10)`, [id, u.companyId, branch, n, l.description, l.expenseAccount, l.qty, l.unit, l.price, l.net]);
                }
            }
            await c.query(`UPDATE ap_invoices SET invoice_date = $2, due_date = $3, supplier_invoice_no = coalesce($4, supplier_invoice_no), notes = coalesce($5, notes),
            total_gross = coalesce($6, total_gross), subtotal = coalesce($7, subtotal), net_amount = coalesce($7, net_amount), ppn_amount = coalesce($8, ppn_amount), updated_at = now() WHERE id = $1`, [id, date, due, b.supplierInvoiceNo ?? null, b.notes ?? null, totals?.total ?? null, totals?.net ?? null, totals?.ppn ?? null]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'ap_invoice.updated', entityType: 'ap_invoice', entityId: i.doc_no, after: { total: totals?.total ?? i.total_gross }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    /** Posting: jurnal utang otomatis; pembuat ≠ pemosting. */
    async post(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const i = await this.row(c, u.companyId, id, true);
            if (i.status !== 'draf')
                throw (0, errors_js_1.conflict)('AP_INVOICE_NOT_DRAFT', `Tagihan ${i.doc_no} bukan draf.`);
            if (i.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_AP_INVOICE', 'Pembuat tagihan tidak boleh memposting tagihannya sendiri (kontrol empat mata).', common_1.HttpStatus.FORBIDDEN);
            const branch = (0, sales_shared_js_1.trimBranch)(i.branch_code);
            const lines = (await c.query('SELECT * FROM ap_invoice_lines WHERE invoice_id = $1 ORDER BY line_no', [id])).rows;
            if (!lines.length)
                throw (0, sales_shared_js_1.invalid)('PURCHASE_NO_LINES', 'Tagihan tanpa baris tidak dapat diposting.');
            const links = await this.refs.links(c, u.companyId);
            const byAccount = new Map();
            for (const l of lines)
                byAccount.set(l.account_code, (byAccount.get(l.account_code) ?? 0) + Number(l.net));
            const j = await (0, sales_shared_js_1.postAutoJournal)(c, u, {
                branch, date: i.invoice_date, source: 'ap_invoice', sourceId: id, rule: 'PURCHASE_INVOICE', ref: i.doc_no,
                description: `Tagihan pemasok ${i.doc_no}${i.supplier_invoice_no ? ` (${i.supplier_invoice_no})` : ''} — ${i.supplier_name}`,
                lines: [
                    ...[...byAccount].map(([account, v]) => ({ account, debit: v, credit: 0 })),
                    { account: links.ppnIn, debit: i.ppn_amount, credit: 0 },
                    { account: links.ap, debit: 0, credit: i.total_gross, party: i.supplier_name },
                ],
            });
            await c.query(`UPDATE ap_invoices SET status = 'belum-dibayar', posted_by = $2, posted_by_name = $3, posted_at = now(), updated_at = now() WHERE id = $1`, [id, u.id, u.name]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'ap_invoice.posted', entityType: 'ap_invoice', entityId: i.doc_no,
                after: { total: i.total_gross, journal: j.journalNo, threeWay: i.three_way_matched }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async cancel(u, s, id, reason, date, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const i = await this.row(c, u.companyId, id, true);
            const branch = (0, sales_shared_js_1.trimBranch)(i.branch_code);
            if (i.status === 'batal')
                throw (0, errors_js_1.conflict)('AP_INVOICE_CANCELLED', `Tagihan ${i.doc_no} sudah batal.`);
            const cancelDate = date ?? (0, sales_shared_js_1.todayWib)();
            let reversed = [];
            if (i.status === 'draf') {
                if (!(u.permissions.has('purchasing.invoice.post') || (u.permissions.has('purchasing.invoice.create') && i.created_by === u.id)))
                    throw (0, errors_js_1.forbidden)('Draf tagihan hanya dapat dibatalkan pembuatnya atau pemegang izin posting tagihan.');
            }
            else {
                if (!u.permissions.has('purchasing.invoice.post'))
                    throw (0, errors_js_1.forbidden)('Memerlukan izin purchasing.invoice.post.');
                if (i.paid_amount > 0)
                    throw (0, errors_js_1.conflict)('AP_INVOICE_HAS_PAYMENTS', `Tagihan ${i.doc_no} sudah dibayar Rp ${Number(i.paid_amount).toLocaleString('id-ID')}; tagihan yang sudah dibayar tidak dapat dibatalkan.`);
                if (cancelDate < i.invoice_date)
                    throw (0, sales_shared_js_1.invalid)('CANCEL_DATE', 'Tanggal pembatalan tidak boleh sebelum tanggal tagihan.');
                reversed = await (0, sales_shared_js_1.reverseAutoJournals)(c, u, 'ap_invoice', id, cancelDate, reason);
            }
            /* Pembayaran yang belum dieksekusi ikut batal; penerimaan & kuantitas PO dilepas agar dapat ditagih ulang. */
            await c.query(`UPDATE supplier_payments SET status = 'batal', decision_note = $2, updated_at = now() WHERE invoice_id = $1 AND status IN ('menunggu','disetujui')`, [id, `Tagihan dibatalkan: ${reason}`]);
            await c.query('UPDATE goods_receipt_lines SET invoice_id = NULL WHERE invoice_id = $1', [id]);
            const lines = (await c.query('SELECT order_line_id, qty FROM ap_invoice_lines WHERE invoice_id = $1 AND order_line_id IS NOT NULL', [id])).rows;
            for (const l of lines)
                await c.query('UPDATE purchase_order_lines SET qty_invoiced = greatest(qty_invoiced - $2, 0) WHERE id = $1', [l.order_line_id, l.qty]);
            await c.query(`UPDATE ap_invoices SET status = 'batal', cancel_date = $2, cancel_reason = $3, updated_at = now() WHERE id = $1`, [id, i.status === 'draf' ? null : cancelDate, reason]);
            if (i.purchase_order_id)
                await this.orders.refreshStatus(c, i.purchase_order_id);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'ap_invoice.cancelled', entityType: 'ap_invoice', entityId: i.doc_no, after: { reason, reversed }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
};
exports.ApInvoicesService = ApInvoicesService;
exports.ApInvoicesService = ApInvoicesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs, orders_service_js_1.PurchaseOrdersService])
], ApInvoicesService);
exports.PAYMENT_STATUS_LABEL = { menunggu: 'Menunggu persetujuan', disetujui: 'Disetujui — siap dibayar', dibayar: 'Dibayar', ditolak: 'Ditolak', batal: 'Batal' };
const mapPaymentRow = (p) => ({
    id: p.id, docNo: p.doc_no, branch: (0, sales_shared_js_1.trimBranch)(p.branch_code), date: p.payment_date, invoiceId: p.invoice_id, invoiceNo: p.invoice_no ?? null, supplierId: p.supplier_id, supplierName: p.supplier_name ?? null,
    amount: p.amount, bankAccount: p.bank_account_code, bankName: p.bank_name ?? null, method: p.method, reference: p.reference,
    status: p.status, statusLabel: exports.PAYMENT_STATUS_LABEL[p.status] ?? p.status, requiredApprovals: p.required_approvals, approvals: p.approvals ?? [], decisionNote: p.decision_note,
    journalId: p.journal_id, journalNo: p.journal_no ?? null, paidAt: p.paid_at, paidByName: p.paid_by_name, createdBy: p.created_by, createdByName: p.created_by_name, createdAt: p.created_at,
    legacy: String(p.doc_no ?? '').startsWith('PAY-L-'),
});
exports.mapPaymentRow = mapPaymentRow;
//# sourceMappingURL=ap-invoices.service.js.map