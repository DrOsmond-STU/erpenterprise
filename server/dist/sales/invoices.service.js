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
exports.InvoicesService = void 0;
exports.mapInvoice = mapInvoice;
/**
 * Faktur & piutang (dok. 07 §4.3, §10.2; dok. 10 §4).
 *  - draf → terbit: jurnal piutang/pendapatan/PPN + jurnal HPP (stok dikurangi),
 *    diposting otomatis; pembuat ≠ penerbit.
 *  - penerimaan: jurnal kas/piutang per penerimaan (boleh sebagian).
 *  - batal: draf langsung; terbit hanya bila belum ada penerimaan → jurnal balik
 *    & stok dikembalikan; pesanan asal kembali "disetujui".
 * Semua tulisan buku besar berada dalam transaksi yang sama dengan dokumen.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const customers_service_js_1 = require("./customers.service.js");
const lines_js_1 = require("./lines.js");
const sales_shared_js_1 = require("./sales.shared.js");
const STATUS_LABEL = { draf: 'Draf', 'belum-dibayar': 'Belum dibayar', sebagian: 'Dibayar sebagian', lunas: 'Lunas', batal: 'Batal' };
function mapInvoice(i, asOf = (0, sales_shared_js_1.todayWib)()) {
    const open = i.status === 'draf' || i.status === 'batal' ? 0 : i.total_gross - i.paid_amount;
    const overdue = (0, domain_1.overdueDays)(i.due_date, asOf, open);
    return {
        id: i.id, docNo: i.doc_no, branch: (0, sales_shared_js_1.trimBranch)(i.branch_code), customerId: i.customer_id, customerName: i.customer_name, customerCode: i.customer_code ?? null,
        date: i.invoice_date, dueDate: i.due_date, subtotal: i.subtotal, discount: i.discount, net: i.net_amount, ppn: i.ppn_amount, total: i.total_gross,
        paid: i.paid_amount, paidDate: i.paid_date, open, overdueDays: overdue, isOverdue: overdue > 0,
        status: i.status, statusLabel: overdue > 0 ? `Jatuh tempo ${overdue} hari` : STATUS_LABEL[i.status] ?? i.status,
        salesOrderId: i.sales_order_id, salesOrderNo: i.order_no ?? null, notes: i.notes, cogs: i.cogs_amount,
        createdBy: i.created_by, createdByName: i.created_by_name, issuedByName: i.issued_by_name, issuedAt: i.issued_at,
        cancelDate: i.cancel_date, cancelReason: i.cancel_reason, legacy: i.subtotal === 0 && i.total_gross > 0 && i.status !== 'draf',
    };
}
const SELECT = `SELECT i.*, c.code AS customer_code, o.doc_no AS order_no FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id LEFT JOIN sales_orders o ON o.id = i.sales_order_id`;
let InvoicesService = class InvoicesService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const rows = (await c.query(`${SELECT} WHERE i.company_id = $1 AND ($2::text IS NULL OR i.branch_code = $2) ORDER BY i.invoice_date DESC, i.doc_no DESC LIMIT 5000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows;
            const today = (0, sales_shared_js_1.todayWib)();
            return rows.map((r) => mapInvoice(r, today));
        });
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Faktur');
        if (lock)
            await c.query('SELECT 1 FROM invoices WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
        const r = (await c.query(`${SELECT} WHERE i.company_id = $1 AND i.id = $2`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Faktur');
        return r;
    }
    async load(c, companyId, id) {
        const i = await this.row(c, companyId, id);
        const lines = (await c.query('SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY line_no', [id])).rows.map(lines_js_1.mapLine);
        const receipts = (await c.query(`SELECT r.*, b.name AS bank_name, j.journal_no FROM receipts r LEFT JOIN bank_accounts b ON b.company_id = r.company_id AND b.code = r.bank_account_code
         LEFT JOIN journals j ON j.id = r.journal_id WHERE r.invoice_id = $1 ORDER BY r.receipt_date, r.doc_no`, [id])).rows
            .map((r) => ({ id: r.id, docNo: r.doc_no, date: r.receipt_date, amount: r.amount, bankAccount: r.bank_account_code, bankName: r.bank_name, method: r.method, reference: r.reference, journalId: r.journal_id, journalNo: r.journal_no, createdByName: r.created_by_name }));
        const journals = (await c.query(`SELECT id, journal_no, journal_date, rule_code, status, total_debit, description FROM journals
        WHERE company_id = $1 AND ((source_type = 'invoice' AND (source_id = $2 OR (source_id IS NULL AND ref = $3))) OR ref = $3 OR id IN (SELECT journal_id FROM receipts WHERE invoice_id = $2::uuid AND journal_id IS NOT NULL))
        ORDER BY journal_date, journal_no`, [companyId, id, i.doc_no])).rows
            .map((j) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, rule: j.rule_code, status: j.status, total: j.total_debit, description: j.description }));
        const cust = i.customer_id ? (0, customers_service_js_1.mapCustomer)((await c.query('SELECT * FROM customers WHERE id = $1', [i.customer_id])).rows[0]) : null;
        return { ...mapInvoice(i), lines, receipts, journals, customer: cust, timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'invoice', i.doc_no) };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    async customer(c, companyId, id) {
        if (!id || !sales_shared_js_1.UUID.test(id))
            throw (0, sales_shared_js_1.invalid)('CUSTOMER_REQUIRED', 'Pilih pelanggan.');
        const r = (await c.query('SELECT * FROM customers WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
        if (!r)
            throw (0, sales_shared_js_1.invalid)('CUSTOMER_UNKNOWN', 'Pelanggan tidak dikenal.');
        if (r.status === 'nonaktif')
            throw (0, sales_shared_js_1.invalid)('CUSTOMER_INACTIVE', `Pelanggan ${r.name} nonaktif.`);
        return r;
    }
    /** Faktur langsung (tanpa pesanan), mis. jasa. Tetap draf sampai diterbitkan orang lain. */
    async create(u, s, b, requestId) {
        const branch = String(b.branch ?? (s.branch === 'ALL' ? '' : s.branch)).toUpperCase();
        if (!/^[A-Z]{3}$/.test(branch))
            throw (0, sales_shared_js_1.invalid)('BRANCH_REQUIRED', 'Pilih cabang faktur.');
        (0, sales_shared_js_1.assertBranch)(u, s, branch);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const cust = await this.customer(c, u.companyId, b.customerId);
            const { lines, totals } = await (0, lines_js_1.resolveLines)(c, u.companyId, b.lines ?? []);
            const date = b.invoiceDate ?? (0, sales_shared_js_1.todayWib)();
            const due = b.dueDate ?? (0, domain_1.addDays)(date, cust.terms_days);
            if (due < date)
                throw (0, sales_shared_js_1.invalid)('INVOICE_DUE', 'Jatuh tempo tidak boleh sebelum tanggal faktur.');
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'INV', Number(date.slice(0, 4)));
            const inv = (await c.query(`INSERT INTO invoices (company_id, branch_code, doc_no, customer_name, customer_id, invoice_date, due_date, total_gross, subtotal, discount, net_amount, ppn_amount, status, notes, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draf',$13,$14,$15) RETURNING id`, [u.companyId, branch, docNo, cust.name, cust.id, date, due, totals.total, totals.subtotal, totals.discount, totals.net, totals.ppn, b.notes ?? null, u.id, u.name])).rows[0];
            await (0, lines_js_1.insertLines)(c, 'invoice_lines', 'invoice_id', inv.id, u.companyId, branch, lines);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'invoice.created', entityType: 'invoice', entityId: docNo, after: { customer: cust.name, total: totals.total }, requestId });
            return this.load(c, u.companyId, inv.id);
        });
    }
    async update(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const i = await this.row(c, u.companyId, id, true);
            if (i.status !== 'draf')
                throw (0, errors_js_1.conflict)('INVOICE_LOCKED', `Faktur ${i.doc_no} sudah diterbitkan; koreksi lewat pembatalan.`);
            const cust = await this.customer(c, u.companyId, b.customerId ?? i.customer_id);
            const res = b.lines ? await (0, lines_js_1.resolveLines)(c, u.companyId, b.lines) : null;
            const date = b.invoiceDate ?? i.invoice_date;
            const due = b.dueDate ?? (b.invoiceDate || b.customerId ? (0, domain_1.addDays)(date, cust.terms_days) : i.due_date);
            if (due < date)
                throw (0, sales_shared_js_1.invalid)('INVOICE_DUE', 'Jatuh tempo tidak boleh sebelum tanggal faktur.');
            await c.query(`UPDATE invoices SET customer_id = $2, customer_name = $3, invoice_date = $4, due_date = $5, notes = coalesce($6, notes),
            total_gross = coalesce($7, total_gross), subtotal = coalesce($8, subtotal), discount = coalesce($9, discount), net_amount = coalesce($10, net_amount), ppn_amount = coalesce($11, ppn_amount), updated_at = now()
          WHERE id = $1`, [id, cust.id, cust.name, date, due, b.notes ?? null, res?.totals.total ?? null, res?.totals.subtotal ?? null, res?.totals.discount ?? null, res?.totals.net ?? null, res?.totals.ppn ?? null]);
            if (res)
                await (0, lines_js_1.insertLines)(c, 'invoice_lines', 'invoice_id', id, u.companyId, (0, sales_shared_js_1.trimBranch)(i.branch_code), res.lines);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(i.branch_code), userId: u.id, sessionId: u.sessionId, action: 'invoice.updated', entityType: 'invoice', entityId: i.doc_no, after: { total: res?.totals.total ?? i.total_gross }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    /** Terbitkan: jurnal otomatis + pengeluaran stok. Kegagalan apa pun membatalkan seluruh transaksi. */
    async issue(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const i = await this.row(c, u.companyId, id, true);
            if (i.status !== 'draf')
                throw (0, errors_js_1.conflict)('INVOICE_NOT_DRAFT', `Faktur ${i.doc_no} bukan draf.`);
            if (i.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_INVOICE', 'Pembuat faktur tidak boleh menerbitkan fakturnya sendiri (kontrol empat mata).', common_1.HttpStatus.FORBIDDEN);
            const cust = await this.customer(c, u.companyId, i.customer_id);
            const branch = (0, sales_shared_js_1.trimBranch)(i.branch_code);
            const lines = (await c.query('SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY line_no', [id])).rows;
            if (!lines.length)
                throw (0, sales_shared_js_1.invalid)('SALES_NO_LINES', 'Faktur tanpa baris tidak dapat diterbitkan.');
            /* HPP: keluarkan stok dari gudang cabang faktur dengan harga pokok rata-rata. */
            const cogsByAccount = new Map();
            const errs = [];
            for (const l of lines.filter((x) => x.kind === 'barang')) {
                const qty = Number(l.qty);
                const st = (await c.query(`SELECT * FROM stock_items WHERE company_id = $1 AND branch_code = $2 AND sku = $3 AND on_hand >= $4 ORDER BY on_hand DESC LIMIT 1 FOR UPDATE`, [u.companyId, branch, l.sku, qty])).rows[0];
                if (!st) {
                    const have = (await c.query(`SELECT coalesce(sum(on_hand),0) AS q FROM stock_items WHERE company_id = $1 AND branch_code = $2 AND sku = $3`, [u.companyId, branch, l.sku])).rows[0].q;
                    errs.push(`Stok ${l.sku} ${l.description} di cabang ${branch} tidak cukup (tersedia ${Number(have).toLocaleString('id-ID')} ${l.unit}, dibutuhkan ${qty.toLocaleString('id-ID')}).`);
                    continue;
                }
                const cost = Math.round(qty * st.avg_cost);
                await c.query('UPDATE stock_items SET on_hand = on_hand - $2 WHERE id = $1', [st.id, qty]);
                await c.query(`INSERT INTO stock_moves (company_id, branch_code, warehouse_code, sku, move_date, qty, unit_cost, ref_type, ref_id, ref_no, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'invoice',$8,$9,$10)`, [u.companyId, branch, st.warehouse_code, l.sku, i.invoice_date, -qty, st.avg_cost, id, i.doc_no, u.id]);
                await c.query('UPDATE invoice_lines SET cost_amount = $2 WHERE id = $1', [l.id, cost]);
                const acct = st.category === 'Barang jadi' ? domain_1.FINISHED_GOODS : domain_1.RAW_MATERIALS;
                cogsByAccount.set(acct, (cogsByAccount.get(acct) ?? 0) + cost);
            }
            if (errs.length)
                throw (0, sales_shared_js_1.invalid)('STOCK_INSUFFICIENT', errs[0], errs);
            const goods = lines.filter((l) => l.kind === 'barang').reduce((t, l) => t + Number(l.net), 0);
            const service = lines.filter((l) => l.kind === 'jasa').reduce((t, l) => t + Number(l.net), 0);
            const party = cust.name;
            const j1 = await (0, sales_shared_js_1.postAutoJournal)(c, u, {
                branch, date: i.invoice_date, source: 'invoice', sourceId: id, rule: 'SALES_INVOICE', ref: i.doc_no, description: `Faktur ${i.doc_no} — ${cust.name}`,
                lines: [
                    { account: domain_1.AR_ACCOUNT, debit: i.total_gross, credit: 0, party },
                    { account: domain_1.REVENUE_GOODS, debit: 0, credit: goods }, { account: domain_1.REVENUE_SERVICE, debit: 0, credit: service },
                    { account: domain_1.PPN_OUT, debit: 0, credit: i.ppn_amount },
                ],
            });
            const cogs = [...cogsByAccount.values()].reduce((t, v) => t + v, 0);
            let j2 = null;
            if (cogs > 0) {
                j2 = await (0, sales_shared_js_1.postAutoJournal)(c, u, {
                    branch, date: i.invoice_date, source: 'invoice', sourceId: id, rule: 'SALES_COGS', ref: i.doc_no, description: `HPP faktur ${i.doc_no}`,
                    lines: [{ account: domain_1.COGS_ACCOUNT, debit: cogs, credit: 0 }, ...[...cogsByAccount].map(([account, v]) => ({ account, debit: 0, credit: v }))],
                });
            }
            await c.query(`UPDATE invoices SET status = 'belum-dibayar', cogs_amount = $2, issued_by = $3, issued_by_name = $4, issued_at = now(), updated_at = now() WHERE id = $1`, [id, cogs, u.id, u.name]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'invoice.issued', entityType: 'invoice', entityId: i.doc_no,
                after: { total: i.total_gross, cogs, journals: [j1.journalNo, j2?.journalNo].filter(Boolean) }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async receive(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const i = await this.row(c, u.companyId, id, true);
            if (!['belum-dibayar', 'sebagian'].includes(i.status))
                throw (0, errors_js_1.conflict)('INVOICE_NOT_OPEN', `Faktur ${i.doc_no} berstatus ${STATUS_LABEL[i.status]}; penerimaan tidak dapat dicatat.`);
            const branch = (0, sales_shared_js_1.trimBranch)(i.branch_code);
            const open = i.total_gross - i.paid_amount;
            const date = b.date ?? (0, sales_shared_js_1.todayWib)();
            if (date < i.invoice_date)
                throw (0, sales_shared_js_1.invalid)('RECEIPT_DATE', 'Tanggal penerimaan tidak boleh sebelum tanggal faktur.');
            if (b.amount > open)
                throw (0, sales_shared_js_1.invalid)('RECEIPT_OVERPAY', `Penerimaan melebihi sisa tagihan (sisa Rp ${open.toLocaleString('id-ID')}).`);
            const bank = (await c.query('SELECT * FROM bank_accounts WHERE company_id = $1 AND code = $2', [u.companyId, b.bankAccount])).rows[0];
            if (!bank)
                throw (0, sales_shared_js_1.invalid)('BANK_UNKNOWN', `Rekening ${b.bankAccount} tidak dikenal.`);
            if ((0, sales_shared_js_1.trimBranch)(bank.branch_code) !== branch)
                throw (0, sales_shared_js_1.invalid)('BANK_BRANCH', `Rekening ${bank.code} milik cabang ${(0, sales_shared_js_1.trimBranch)(bank.branch_code)}, bukan cabang faktur ${branch}.`);
            if (bank.status !== 'aktif' || bank.currency !== 'IDR')
                throw (0, sales_shared_js_1.invalid)('BANK_INACTIVE', `Rekening ${bank.code} nonaktif atau berdenominasi valas.`);
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'RCV', Number(date.slice(0, 4)));
            const r = (await c.query(`INSERT INTO receipts (company_id, branch_code, doc_no, receipt_date, invoice_id, customer_id, amount, bank_account_code, method, reference, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [u.companyId, branch, docNo, date, id, i.customer_id, b.amount, bank.code, b.method ?? 'transfer', b.reference ?? null, u.id, u.name])).rows[0];
            const j = await (0, sales_shared_js_1.postAutoJournal)(c, u, {
                branch, date, source: 'receipt', sourceId: r.id, rule: 'SALES_RECEIPT', ref: i.doc_no, description: `Penerimaan ${docNo} — ${i.customer_name} (${i.doc_no})`,
                lines: [{ account: domain_1.CASH_ACCOUNT, debit: b.amount, credit: 0, bank: bank.code }, { account: domain_1.AR_ACCOUNT, debit: 0, credit: b.amount, party: i.customer_name }],
            });
            await c.query('UPDATE receipts SET journal_id = $2 WHERE id = $1', [r.id, j.id]);
            const paid = i.paid_amount + b.amount;
            await c.query(`UPDATE invoices SET paid_amount = $2, paid_date = GREATEST(coalesce(paid_date, $3::date), $3::date), bank_account_code = $4, status = $5, updated_at = now() WHERE id = $1`, [id, paid, date, bank.code, (0, domain_1.invoiceStatus)(i.total_gross, paid)]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'invoice.receipt', entityType: 'invoice', entityId: i.doc_no,
                after: { receipt: docNo, amount: b.amount, bank: bank.code, journal: j.journalNo }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async cancel(u, s, id, reason, date, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const i = await this.row(c, u.companyId, id, true);
            const branch = (0, sales_shared_js_1.trimBranch)(i.branch_code);
            if (i.status === 'batal')
                throw (0, errors_js_1.conflict)('INVOICE_CANCELLED', `Faktur ${i.doc_no} sudah batal.`);
            const cancelDate = date ?? (0, sales_shared_js_1.todayWib)();
            let reversed = [];
            if (i.status === 'draf') {
                if (!(u.permissions.has('sales.invoice.cancel') || (u.permissions.has('sales.invoice.create') && i.created_by === u.id)))
                    throw (0, errors_js_1.forbidden)('Draf faktur hanya dapat dibatalkan pembuatnya atau pemegang izin pembatalan faktur.');
            }
            else {
                if (!u.permissions.has('sales.invoice.cancel'))
                    throw (0, errors_js_1.forbidden)('Memerlukan izin sales.invoice.cancel.');
                if (i.paid_amount > 0)
                    throw (0, errors_js_1.conflict)('INVOICE_HAS_RECEIPTS', `Faktur ${i.doc_no} sudah menerima pembayaran Rp ${Number(i.paid_amount).toLocaleString('id-ID')}; faktur yang sudah dibayar tidak dapat dibatalkan.`);
                if (cancelDate < i.invoice_date)
                    throw (0, sales_shared_js_1.invalid)('CANCEL_DATE', 'Tanggal pembatalan tidak boleh sebelum tanggal faktur.');
                reversed = await (0, sales_shared_js_1.reverseAutoJournals)(c, u, 'invoice', id, cancelDate, reason);
                /* Kembalikan stok ke gudang asal dengan harga pokok yang sama. */
                const moves = (await c.query(`SELECT * FROM stock_moves WHERE company_id = $1 AND ref_type = 'invoice' AND ref_id = $2`, [u.companyId, id])).rows;
                for (const m of moves) {
                    await c.query('UPDATE stock_items SET on_hand = on_hand + $5 WHERE company_id = $1 AND branch_code = $2 AND warehouse_code = $3 AND sku = $4', [u.companyId, m.branch_code, m.warehouse_code, m.sku, -Number(m.qty)]);
                    await c.query(`INSERT INTO stock_moves (company_id, branch_code, warehouse_code, sku, move_date, qty, unit_cost, ref_type, ref_id, ref_no, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'invoice_cancel',$8,$9,$10)`, [u.companyId, m.branch_code, m.warehouse_code, m.sku, cancelDate, -Number(m.qty), m.unit_cost, id, i.doc_no, u.id]);
                }
            }
            await c.query(`UPDATE invoices SET status = 'batal', cancel_date = $2, cancel_reason = $3, updated_at = now() WHERE id = $1`, [id, i.status === 'draf' ? null : cancelDate, reason]);
            if (i.sales_order_id)
                await c.query(`UPDATE sales_orders SET status = 'disetujui', invoice_id = NULL, updated_at = now() WHERE id = $1 AND invoice_id = $2`, [i.sales_order_id, id]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'invoice.cancelled', entityType: 'invoice', entityId: i.doc_no, after: { reason, reversed }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    /**
     * Piutang per tanggal (akhir periode konteks, paling lambat hari ini):
     * sisa = nilai faktur terbit − penerimaan s.d. tanggal itu. Sama dengan
     * sumber pemeriksaan rekonsiliasi 1-1200, sehingga angkanya selalu cocok.
     */
    async receivables(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
            const today = (0, sales_shared_js_1.todayWib)();
            const asOf = period.to < today ? period.to : today;
            const b = s.branch === 'ALL' ? null : s.branch;
            const rows = (await c.query(`SELECT i.*, c.code AS customer_code, c.credit_limit, c.status AS customer_status,
                i.total_gross - coalesce((SELECT sum(r.amount) FROM receipts r WHERE r.invoice_id = i.id AND r.receipt_date <= $2), 0) AS open_asof
           FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
          WHERE i.company_id = $1 AND i.status <> 'draf' AND i.invoice_date <= $2 AND (i.status <> 'batal' OR i.cancel_date > $2)
            AND ($3::text IS NULL OR i.branch_code = $3)
          ORDER BY i.due_date`, [u.companyId, asOf, b])).rows;
            const open = rows.filter((r) => Number(r.open_asof) > 0).map((r) => ({ ...mapInvoice({ ...r, paid_amount: r.total_gross - Number(r.open_asof), status: r.status === 'batal' ? 'belum-dibayar' : r.status }, asOf), open: Number(r.open_asof) }));
            const buckets = (0, domain_1.aging)(open.map((x) => ({ dueDate: x.dueDate, open: x.open })), asOf);
            const total = open.reduce((t, x) => t + x.open, 0);
            const overdue = open.filter((x) => x.dueDate < asOf).reduce((t, x) => t + x.open, 0);
            const byCustomer = new Map();
            for (const x of open) {
                const k = x.customerId ?? x.customerName;
                const e = byCustomer.get(k) ?? { customerId: x.customerId, customerName: x.customerName, customerCode: x.customerCode, open: 0, overdue: 0, count: 0, oldestDays: 0 };
                e.open += x.open;
                e.count += 1;
                if (x.dueDate < asOf) {
                    e.overdue += x.open;
                    e.oldestDays = Math.max(e.oldestDays, (0, domain_1.daysBetween)(x.dueDate, asOf));
                }
                byCustomer.set(k, e);
            }
            /* DSO = piutang ÷ penjualan kredit 90 hari terakhir × 90. */
            const sales90 = Number((await c.query(`SELECT coalesce(sum(total_gross),0)::bigint AS v FROM invoices WHERE company_id = $1 AND status NOT IN ('draf','batal') AND invoice_date BETWEEN ($2::date - 89) AND $2 AND ($3::text IS NULL OR branch_code = $3)`, [u.companyId, asOf, b])).rows[0].v);
            const collected = Number((await c.query(`SELECT coalesce(sum(amount),0)::bigint AS v FROM receipts WHERE company_id = $1 AND receipt_date BETWEEN $2 AND $3 AND ($4::text IS NULL OR branch_code = $4)`, [u.companyId, period.from, asOf, b])).rows[0].v);
            const bal = await this.refs.balances(c, u.companyId, b, period.from, asOf);
            const gl = bal[domain_1.AR_ACCOUNT]?.ending ?? 0;
            return {
                asOf, period, scope: s.branch,
                kpi: { total, overdue, overduePct: total ? overdue / total : 0, count: open.length, dso: sales90 ? Math.round((total / sales90) * 90) : 0, collected, ledger: gl, reconciled: Math.abs(gl - total) < 1 },
                aging: buckets, customers: [...byCustomer.values()].sort((a, b2) => b2.open - a.open), invoices: open,
            };
        });
    }
};
exports.InvoicesService = InvoicesService;
exports.InvoicesService = InvoicesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], InvoicesService);
//# sourceMappingURL=invoices.service.js.map