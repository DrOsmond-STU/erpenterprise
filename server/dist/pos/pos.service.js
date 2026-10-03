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
exports.PosService = void 0;
/**
 * POS / kasir: buka shift (toko = gudang, kas laci + rekening penampung non-tunai),
 * transaksi (stok dicadangkan sampai posting), tutup shift dengan hitung kas, lalu
 * posting oleh orang lain: satu jurnal penjualan, PPN, HPP, dan selisih kas;
 * stok toko berkurang saat posting sehingga kartu stok = buku besar.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const cash_shared_js_1 = require("../cash/cash.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const stock_shared_js_1 = require("../inventory/stock.shared.js");
const STATUS_LABEL = { buka: 'Buka', ditutup: 'Ditutup — menunggu posting', diposting: 'Diposting' };
const mapShift = (s) => ({
    id: s.id, docNo: s.doc_no, branch: (0, sales_shared_js_1.trimBranch)(s.branch_code), warehouse: s.warehouse_code, cashAccount: s.cash_account, settlementAccount: s.settlement_account,
    cashierId: s.cashier_id, cashierName: s.cashier_name, date: s.shift_date, openedAt: s.opened_at, openingCash: Number(s.opening_cash), closedAt: s.closed_at,
    countedCash: s.counted_cash === null ? null : Number(s.counted_cash), expectedCash: s.expected_cash === null ? null : Number(s.expected_cash), cashDiff: s.cash_diff === null ? null : Number(s.cash_diff),
    cogs: s.cogs === null ? null : Number(s.cogs), status: s.status, statusLabel: STATUS_LABEL[s.status] ?? s.status, closeNote: s.close_note, postedByName: s.posted_by_name, postedAt: s.posted_at,
});
const mapTrx = (t) => ({
    id: t.id, trxNo: t.trx_no, at: t.trx_at, net: Number(t.net), ppn: Number(t.ppn), total: Number(t.total), method: t.payment_method,
    tendered: t.tendered === null ? null : Number(t.tendered), change: t.change_amount === null ? null : Number(t.change_amount), reference: t.reference,
    status: t.status, voidReason: t.void_reason, voidedByName: t.voided_by_name, createdByName: t.created_by_name,
});
let PosService = class PosService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    /** Qty yang sudah terjual di shift yang belum diposting (dicadangkan). */
    async reserved(c, companyId, warehouse) {
        const rows = (await c.query(`SELECT l.sku, sum(l.qty) AS q FROM pos_transaction_lines l JOIN pos_transactions t ON t.id = l.trx_id JOIN pos_shifts sh ON sh.id = t.shift_id
        WHERE sh.company_id = $1 AND sh.warehouse_code = $2 AND sh.status IN ('buka','ditutup') AND t.status = 'selesai' GROUP BY l.sku`, [companyId, warehouse])).rows;
        return new Map(rows.map((r) => [r.sku, Number(r.q)]));
    }
    async catalog(u, s, warehouse, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const wh = await (0, stock_shared_js_1.warehouseOf)(c, u.companyId, warehouse);
            const res = await this.reserved(c, u.companyId, wh.code);
            return (await c.query(`SELECT p.sku, p.name, p.unit, p.price, si.on_hand FROM products p JOIN stock_items si ON si.company_id = p.company_id AND si.sku = p.sku AND si.warehouse_code = $2
          WHERE p.company_id = $1 AND p.kind = 'barang' AND p.status = 'aktif' ORDER BY p.name`, [u.companyId, wh.code])).rows
                .map((p) => ({ sku: p.sku, name: p.name, uom: p.unit, price: Number(p.price), available: Math.max(0, Number(p.on_hand) - (res.get(p.sku) ?? 0)) }));
        });
    }
    async summarize(c, shift) {
        const trx = (await c.query('SELECT * FROM pos_transactions WHERE shift_id = $1 ORDER BY trx_at, trx_no', [shift.id])).rows.map(mapTrx);
        return { trx, summary: (0, domain_1.shiftSummary)(trx, Number(shift.opening_cash)) };
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const rows = (await c.query(`SELECT * FROM pos_shifts WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2) ORDER BY (status = 'buka') DESC, (status = 'ditutup') DESC, opened_at DESC LIMIT 500`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows;
            const out = [];
            for (const r of rows)
                out.push({ ...mapShift(r), summary: r.summary ?? (await this.summarize(c, r)).summary });
            return out;
        });
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Shift kasir');
        const r = (await c.query(`SELECT * FROM pos_shifts WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Shift kasir');
        return r;
    }
    async load(c, companyId, id) {
        const sh = await this.row(c, companyId, id);
        const { trx, summary } = await this.summarize(c, sh);
        const lines = (await c.query('SELECT l.* FROM pos_transaction_lines l JOIN pos_transactions t ON t.id = l.trx_id WHERE t.shift_id = $1 ORDER BY l.trx_id, l.line_no', [id])).rows;
        const journals = (await c.query(`SELECT id, journal_no, journal_date, rule_code, status, total_debit FROM journals WHERE company_id = $1 AND source_type = 'pos_shift' AND source_id = $2 ORDER BY journal_no`, [companyId, id])).rows
            .map((j) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, rule: j.rule_code, status: j.status, total: j.total_debit }));
        return {
            ...mapShift(sh), summary,
            transactions: trx.map((t) => ({ ...t, lines: lines.filter((l) => l.trx_id === t.id).map((l) => ({ sku: l.sku, name: l.name, uom: l.uom, qty: Number(l.qty), price: Number(l.price), discPct: Number(l.disc_pct), net: Number(l.net) })) })),
            journals, timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'pos_shift', sh.doc_no),
        };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    log(c, u, sh, action, after, requestId) {
        return this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(sh.branch_code), userId: u.id, sessionId: u.sessionId, action: `pos_shift.${action}`, entityType: 'pos_shift', entityId: sh.doc_no, after, requestId });
    }
    async open(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const wh = await (0, stock_shared_js_1.warehouseOf)(c, u.companyId, b.warehouse);
            (0, sales_shared_js_1.assertBranch)(u, s, wh.branch_code);
            const cash = await (0, cash_shared_js_1.usableBank)(c, u.companyId, b.cashAccount, 'Rekening kas');
            if (cash.branch_code !== wh.branch_code)
                throw (0, sales_shared_js_1.invalid)('BANK_BRANCH', `Rekening kas ${cash.code} bukan milik cabang ${wh.branch_code}.`);
            let settle = null;
            if (b.settlementAccount) {
                settle = await (0, cash_shared_js_1.usableBank)(c, u.companyId, b.settlementAccount, 'Rekening penampung');
                if (settle.branch_code !== wh.branch_code)
                    throw (0, sales_shared_js_1.invalid)('BANK_BRANCH', `Rekening penampung ${settle.code} bukan milik cabang ${wh.branch_code}.`);
                if (settle.code === cash.code)
                    throw (0, sales_shared_js_1.invalid)('BANK_SAME', 'Rekening penampung non-tunai harus berbeda dari kas laci.');
            }
            if ((await c.query(`SELECT 1 FROM pos_shifts WHERE company_id = $1 AND cashier_id = $2 AND status = 'buka'`, [u.companyId, u.id])).rowCount)
                throw (0, errors_js_1.conflict)('SHIFT_ALREADY_OPEN', 'Anda masih memiliki shift terbuka; tutup dulu sebelum membuka shift baru.');
            const date = b.date ?? (0, sales_shared_js_1.todayWib)();
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'SHF', Number(date.slice(0, 4)));
            const r = (await c.query(`INSERT INTO pos_shifts (company_id, branch_code, doc_no, warehouse_code, cash_account, settlement_account, cashier_id, cashier_name, shift_date, opening_cash)
                                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [u.companyId, wh.branch_code, docNo, wh.code, cash.code, settle?.code ?? null, u.id, u.name, date, b.openingCash])).rows[0];
            await this.log(c, u, r, 'opened', { warehouse: wh.code, cash: cash.code, openingCash: b.openingCash }, requestId);
            return this.load(c, u.companyId, r.id);
        });
    }
    async sale(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const sh = await this.row(c, u.companyId, id, true);
            if (sh.status !== 'buka')
                throw (0, errors_js_1.conflict)('SHIFT_NOT_OPEN', `Shift ${sh.doc_no} sudah ditutup.`);
            if (sh.cashier_id !== u.id)
                throw (0, errors_js_1.forbidden)('Transaksi hanya dapat dicatat oleh kasir pemilik shift.');
            if (b.method !== 'tunai' && !sh.settlement_account)
                throw (0, sales_shared_js_1.invalid)('NO_SETTLEMENT_ACCOUNT', 'Shift ini tidak memiliki rekening penampung non-tunai; hanya pembayaran tunai.');
            const seen = new Set();
            for (const l of b.lines) {
                if (seen.has(l.sku))
                    throw (0, sales_shared_js_1.invalid)('POS_DUP_SKU', `SKU ${l.sku} tercantum lebih dari sekali.`);
                seen.add(l.sku);
            }
            const res = await this.reserved(c, u.companyId, sh.warehouse_code);
            const items = [];
            for (const l of b.lines) {
                const p = (await c.query(`SELECT p.sku, p.name, p.unit, p.price, p.kind, p.status, si.on_hand FROM products p LEFT JOIN stock_items si ON si.company_id = p.company_id AND si.sku = p.sku AND si.warehouse_code = $3
                                   WHERE p.company_id = $1 AND p.sku = $2`, [u.companyId, l.sku, sh.warehouse_code])).rows[0];
                if (!p || p.kind !== 'barang' || p.status !== 'aktif')
                    throw (0, sales_shared_js_1.invalid)('POS_PRODUCT', `Barang ${l.sku} tidak tersedia untuk dijual.`);
                const avail = Number(p.on_hand ?? 0) - (res.get(l.sku) ?? 0);
                if (l.qty > avail + 1e-9)
                    throw (0, sales_shared_js_1.invalid)('STOCK_INSUFFICIENT', `Stok ${p.name} di toko hanya ${Math.max(0, avail).toLocaleString('id-ID')} ${p.unit}.`);
                items.push({ ...l, name: p.name, uom: p.unit, price: Number(p.price), discPct: l.discPct ?? 0 });
            }
            const t = (0, domain_1.salesTotals)(items.map((i) => ({ qty: i.qty, price: i.price, discPct: i.discPct, kind: 'barang' })));
            if (t.total <= 0)
                throw (0, sales_shared_js_1.invalid)('POS_ZERO', 'Total transaksi harus lebih dari nol.');
            let change = null;
            if (b.method === 'tunai') {
                const tendered = b.tendered ?? t.total;
                if (tendered < t.total)
                    throw (0, sales_shared_js_1.invalid)('POS_TENDERED', `Uang diterima kurang dari total ${t.total.toLocaleString('id-ID')}.`);
                change = tendered - t.total;
                b.tendered = tendered;
            }
            const trxNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'TRX', Number(String(sh.shift_date).slice(0, 4)), 5);
            const r = (await c.query(`INSERT INTO pos_transactions (shift_id, company_id, branch_code, trx_no, net, ppn, total, payment_method, tendered, change_amount, reference, created_by_name)
                                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [id, u.companyId, sh.branch_code, trxNo, t.net, t.ppn, t.total, b.method, b.method === 'tunai' ? b.tendered : null, change, b.reference ?? null, u.name])).rows[0];
            let n = 0;
            for (const [i, it] of items.entries()) {
                n += 1;
                await c.query(`INSERT INTO pos_transaction_lines (trx_id, company_id, branch_code, line_no, sku, name, uom, qty, price, disc_pct, net) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [r.id, u.companyId, sh.branch_code, n, it.sku, it.name, it.uom, it.qty, it.price, it.discPct, t.lines[i]]);
            }
            return { ...mapTrx(r), lines: items.map((it, i) => ({ sku: it.sku, name: it.name, uom: it.uom, qty: it.qty, price: it.price, discPct: it.discPct, net: t.lines[i] })) };
        });
    }
    async voidTrx(u, s, trxId, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            if (!sales_shared_js_1.UUID.test(trxId))
                throw (0, errors_js_1.notFound)('Transaksi');
            const t = (await c.query('SELECT * FROM pos_transactions WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, trxId])).rows[0];
            if (!t)
                throw (0, errors_js_1.notFound)('Transaksi');
            const sh = await this.row(c, u.companyId, t.shift_id, true);
            if (sh.status !== 'buka')
                throw (0, errors_js_1.conflict)('SHIFT_NOT_OPEN', 'Transaksi hanya dapat dibatalkan selama shift masih buka.');
            if (t.status === 'void')
                throw (0, errors_js_1.conflict)('TRX_VOID', `Transaksi ${t.trx_no} sudah dibatalkan.`);
            await c.query(`UPDATE pos_transactions SET status = 'void', void_reason = $2, voided_by_name = $3, voided_at = now() WHERE id = $1`, [trxId, reason, u.name]);
            await this.log(c, u, sh, 'trx_voided', { trx: t.trx_no, total: Number(t.total), reason }, requestId);
            return this.load(c, u.companyId, sh.id);
        });
    }
    async close(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const sh = await this.row(c, u.companyId, id, true);
            if (sh.status !== 'buka')
                throw (0, errors_js_1.conflict)('SHIFT_NOT_OPEN', `Shift ${sh.doc_no} sudah ditutup.`);
            if (sh.cashier_id !== u.id && !u.permissions.has('pos.shift.post'))
                throw (0, errors_js_1.forbidden)('Shift hanya dapat ditutup oleh kasirnya atau supervisor.');
            const { summary } = await this.summarize(c, sh);
            const diff = b.countedCash - summary.expectedCash;
            await c.query(`UPDATE pos_shifts SET status = 'ditutup', closed_at = now(), counted_cash = $2, expected_cash = $3, cash_diff = $4, summary = $5, close_note = $6 WHERE id = $1`, [id, b.countedCash, summary.expectedCash, diff, JSON.stringify(summary), b.note ?? null]);
            await this.log(c, u, sh, 'closed', { counted: b.countedCash, expected: summary.expectedCash, diff, note: b.note }, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    async post(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const sh = await this.row(c, u.companyId, id, true);
            const branch = (0, sales_shared_js_1.trimBranch)(sh.branch_code);
            (0, sales_shared_js_1.assertBranch)(u, { ...s, branch: 'ALL' }, branch);
            if (sh.status !== 'ditutup')
                throw (0, errors_js_1.conflict)('SHIFT_NOT_CLOSED', `Shift ${sh.doc_no} ${sh.status === 'buka' ? 'masih buka' : 'sudah diposting'}.`);
            if (sh.cashier_id === u.id)
                throw new errors_js_1.DomainError('SOD_POS_SHIFT', 'Kasir tidak boleh memposting shift-nya sendiri (hitung kas diperiksa orang lain).', common_1.HttpStatus.FORBIDDEN);
            const links = await this.refs.links(c, u.companyId);
            const { summary } = await this.summarize(c, sh);
            const qty = (await c.query(`SELECT l.sku, sum(l.qty) AS q FROM pos_transaction_lines l JOIN pos_transactions t ON t.id = l.trx_id WHERE t.shift_id = $1 AND t.status = 'selesai' GROUP BY l.sku ORDER BY l.sku`, [id])).rows;
            const cogsBy = new Map();
            let cogs = 0;
            for (const q of qty) {
                const out = await (0, stock_shared_js_1.issueStock)(c, u, links, { branch, warehouse: sh.warehouse_code, sku: q.sku, qty: Number(q.q), date: sh.shift_date, refType: 'pos', refId: id, refNo: sh.doc_no });
                (0, stock_shared_js_1.addTo)(cogsBy, out.account, out.value);
                cogs += out.value;
            }
            const cash = await (0, cash_shared_js_1.usableBank)(c, u.companyId, sh.cash_account, 'Rekening kas');
            const settle = sh.settlement_account ? await (0, cash_shared_js_1.usableBank)(c, u.companyId, sh.settlement_account, 'Rekening penampung') : null;
            const j = (0, domain_1.shiftJournalLines)({
                summary, countedCash: Number(sh.counted_cash), cashAccount: cash.gl_account_code, cashBank: cash.code, settlementAccount: settle?.gl_account_code ?? null, settlementBank: settle?.code ?? null,
                salesGoods: links.salesGoods, ppnOut: links.ppnOut, cogs: links.cogs, overShort: links.cashOverShort, cogsByAccount: Object.fromEntries(cogsBy),
            });
            if (j.lines.length) {
                await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch, date: sh.shift_date, source: 'pos_shift', sourceId: id, rule: 'POS_SHIFT', ref: sh.doc_no,
                    description: `Penjualan POS ${sh.doc_no} — ${sh.cashier_name}, toko ${sh.warehouse_code} (${summary.count} transaksi)`, lines: j.lines });
            }
            await c.query(`UPDATE pos_shifts SET status = 'diposting', cogs = $2, posted_by = $3, posted_by_name = $4, posted_at = now() WHERE id = $1`, [id, cogs, u.id, u.name]);
            await this.log(c, u, sh, 'posted', { gross: summary.gross, cogs, diff: Number(sh.cash_diff) }, requestId);
            return this.load(c, u.companyId, id);
        });
    }
};
exports.PosService = PosService;
exports.PosService = PosService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], PosService);
//# sourceMappingURL=pos.service.js.map