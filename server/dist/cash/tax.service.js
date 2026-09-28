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
exports.TaxSettlementsService = exports.mapSettlement = void 0;
/**
 * Setoran PPN masa (pemusatan PPN di kantor pusat).
 *  draf (hitung saldo PPN keluaran & masukan per cabang per akhir masa)
 *   → diposting oleh orang lain: tiap cabang menutup saldo PPN-nya ke RK, kantor
 *     pusat mencatat kurang bayar sebagai utang pajak (lebih bayar dikompensasikan)
 *   → dibayar: Dr utang pajak / Cr rekening kantor pusat, dengan NTPN.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const cash_shared_js_1 = require("./cash.shared.js");
const STATUS_LABEL = { draf: 'Draf', diposting: 'Diposting — menunggu pembayaran', dibayar: 'Dibayar', batal: 'Batal' };
const mapSettlement = (t) => ({
    id: t.id, docNo: t.doc_no, branch: (0, sales_shared_js_1.trimBranch)(t.branch_code), taxType: t.tax_type, period: t.period_code, settleDate: t.settle_date,
    output: Number(t.output_tax), input: Number(t.input_tax), net: Number(t.net_amount), details: t.details, status: t.status,
    statusLabel: t.status === 'diposting' && Number(t.net_amount) <= 0 ? 'Diposting — lebih bayar dikompensasikan' : STATUS_LABEL[t.status] ?? t.status,
    bankAccount: t.bank_account_code, paymentDate: t.payment_date, ntpn: t.ntpn, paymentJournalId: t.payment_journal_id,
    createdBy: t.created_by, createdByName: t.created_by_name, createdAt: t.created_at, postedByName: t.posted_by_name, postedAt: t.posted_at, paidByName: t.paid_by_name, paidAt: t.paid_at, cancelReason: t.cancel_reason,
});
exports.mapSettlement = mapSettlement;
/** PPN dipusatkan: angka seluruh cabang hanya untuk pengguna lintas cabang. */
function assertCompanyWide(u) {
    if (!(u.branches === '*' || u.permissions.has('report.consolidated')))
        throw (0, errors_js_1.forbidden)('Setoran PPN terpusat memerlukan akses seluruh cabang atau izin laporan konsolidasi.');
}
let TaxSettlementsService = class TaxSettlementsService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    /** Saldo PPN keluaran & masukan per cabang per tanggal (seluruh cabang: PPN dipusatkan). */
    async balances(c, companyId, asOf) {
        const links = await this.refs.links(c, companyId);
        const rows = (await (0, sales_shared_js_1.acrossBranches)(c, () => c.query(`SELECT trim(jl.branch_code) AS branch,
              coalesce(sum(jl.credit - jl.debit) FILTER (WHERE jl.account_code = $3),0)::bigint AS output,
              coalesce(sum(jl.debit - jl.credit) FILTER (WHERE jl.account_code = $4),0)::bigint AS input
         FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
        WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.journal_date <= $2 AND jl.account_code IN ($3, $4)
        GROUP BY 1 ORDER BY 1`, [companyId, asOf, links.ppnOut, links.ppnIn]))).rows;
        return rows.map((r) => ({ branch: r.branch, output: Number(r.output), input: Number(r.input) })).filter((r) => r.output || r.input);
    }
    async monthPeriod(c, companyId, code) {
        const p = (await c.query(`SELECT code, label, date_from, date_to, status FROM fiscal_periods WHERE company_id = $1 AND code = $2 AND period_group = 'Bulan'`, [companyId, code])).rows[0];
        if (!p)
            throw (0, sales_shared_js_1.invalid)('TAX_PERIOD', `Masa pajak ${code} tidak dikenal (pilih periode bulanan).`);
        return p;
    }
    /** Pratinjau masa: saldo per cabang, mutasi masa ini, dan setoran yang sudah ada. */
    async preview(u, s, periodCode, requestId) {
        assertCompanyWide(u);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const period = periodCode ? await this.monthPeriod(c, u.companyId, periodCode) : (await c.query(`SELECT code, label, date_from, date_to, status FROM fiscal_periods WHERE company_id = $1 AND period_group = 'Bulan' AND $2::date BETWEEN date_from AND date_to`, [u.companyId, (0, sales_shared_js_1.todayWib)()])).rows[0];
            if (!period)
                throw (0, sales_shared_js_1.invalid)('TAX_PERIOD', 'Masa pajak tidak ditemukan.');
            const links = await this.refs.links(c, u.companyId);
            const balances = await this.balances(c, u.companyId, period.date_to);
            const activity = (await (0, sales_shared_js_1.acrossBranches)(c, () => c.query(`SELECT coalesce(sum(jl.credit - jl.debit) FILTER (WHERE jl.account_code = $4 AND j.source_type <> 'tax_settlement'),0)::bigint AS output,
                coalesce(sum(jl.debit - jl.credit) FILTER (WHERE jl.account_code = $5 AND j.source_type <> 'tax_settlement'),0)::bigint AS input
           FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
          WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.journal_date BETWEEN $2 AND $3`, [u.companyId, period.date_from, period.date_to, links.ppnOut, links.ppnIn]))).rows[0];
            const existing = (await (0, sales_shared_js_1.acrossBranches)(c, () => c.query(`SELECT * FROM tax_settlements WHERE company_id = $1 AND period_code = $2 AND status <> 'batal'`, [u.companyId, period.code]))).rows[0];
            const output = balances.reduce((t, b) => t + b.output, 0), input = balances.reduce((t, b) => t + b.input, 0);
            return {
                period: { id: period.code, label: period.label, from: period.date_from, to: period.date_to, status: period.status },
                headOffice: await (0, cash_shared_js_1.headOffice)(c, u.companyId), accounts: { ppnOut: links.ppnOut, ppnIn: links.ppnIn, taxPayable: links.taxPayable },
                branches: balances.map((b) => ({ ...b, net: b.output - b.input })), output, input, net: output - input,
                activity: { output: Number(activity.output), input: Number(activity.input) },
                existing: existing ? (0, exports.mapSettlement)(existing) : null,
            };
        });
    }
    async list(u, s, requestId) {
        assertCompanyWide(u);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await (0, sales_shared_js_1.acrossBranches)(c, () => c.query('SELECT * FROM tax_settlements WHERE company_id = $1 ORDER BY period_code DESC, doc_no DESC', [u.companyId]))).rows.map(exports.mapSettlement));
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Setoran pajak');
        const r = (await (0, sales_shared_js_1.acrossBranches)(c, () => c.query(`SELECT * FROM tax_settlements WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id]))).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Setoran pajak');
        return r;
    }
    async load(c, companyId, id) {
        const t = await this.row(c, companyId, id);
        const journals = (await (0, sales_shared_js_1.acrossBranches)(c, () => c.query(`SELECT id, journal_no, journal_date, branch_code, rule_code, status, total_debit, description FROM journals
        WHERE company_id = $1 AND ((source_type = 'tax_settlement' AND source_id = $2) OR (source_type = 'reversal' AND source_id IN (SELECT id::text FROM journals WHERE source_type = 'tax_settlement' AND source_id = $2)))
        ORDER BY journal_date, journal_no`, [companyId, id]))).rows;
        return {
            ...(0, exports.mapSettlement)(t),
            journals: journals.map((j) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, branch: (0, sales_shared_js_1.trimBranch)(j.branch_code), rule: j.rule_code, status: j.status, total: j.total_debit, description: j.description })),
            timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'tax_settlement', t.doc_no),
        };
    }
    async get(u, s, id, requestId) {
        assertCompanyWide(u);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    async create(u, s, periodCode, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const period = await this.monthPeriod(c, u.companyId, periodCode);
            if (period.status !== 'open')
                throw (0, sales_shared_js_1.invalid)('LEDGER_PERIOD_CLOSED', `Masa ${period.label} sudah ditutup.`);
            const ho = await (0, cash_shared_js_1.headOffice)(c, u.companyId);
            (0, cash_shared_js_1.assertBranches)(u, [ho]);
            const dup = (await (0, sales_shared_js_1.acrossBranches)(c, () => c.query(`SELECT doc_no FROM tax_settlements WHERE company_id = $1 AND tax_type = 'PPN' AND period_code = $2 AND status <> 'batal'`, [u.companyId, period.code]))).rows[0];
            if (dup)
                throw (0, errors_js_1.conflict)('TAX_EXISTS', `Setoran PPN masa ${period.label} sudah ada (${dup.doc_no}).`);
            const balances = await this.balances(c, u.companyId, period.date_to);
            if (!balances.length)
                throw (0, sales_shared_js_1.invalid)('TAX_NOTHING', `Tidak ada saldo PPN per ${period.date_to}.`);
            const output = balances.reduce((t, b) => t + b.output, 0), input = balances.reduce((t, b) => t + b.input, 0);
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'SPP', Number(period.date_to.slice(0, 4)));
            const r = (await (0, sales_shared_js_1.acrossBranches)(c, () => c.query(`INSERT INTO tax_settlements (company_id, branch_code, doc_no, period_code, settle_date, output_tax, input_tax, net_amount, details, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING id`, [u.companyId, ho, docNo, period.code, period.date_to, output, input, output - input, JSON.stringify(balances), u.id, u.name]))).rows[0];
            await this.audit.record(c, { companyId: u.companyId, branchCode: ho, userId: u.id, sessionId: u.sessionId, action: 'tax_settlement.created', entityType: 'tax_settlement', entityId: docNo, after: { period: period.code, output, input, net: output - input }, requestId });
            return this.load(c, u.companyId, r.id);
        });
    }
    async post(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const t = await this.row(c, u.companyId, id, true);
            if (t.status !== 'draf')
                throw (0, errors_js_1.conflict)('TAX_NOT_DRAFT', `Setoran ${t.doc_no} bukan draf.`);
            if (t.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_TAX_SETTLEMENT', 'Pembuat setoran pajak tidak boleh memostingnya sendiri (kontrol empat mata).', common_1.HttpStatus.FORBIDDEN);
            const now = await this.balances(c, u.companyId, t.settle_date);
            const key = (list) => JSON.stringify([...list].map((b) => [b.branch, Number(b.output), Number(b.input)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
            if (key(now) !== key(t.details))
                throw (0, errors_js_1.conflict)('TAX_BALANCES_CHANGED', 'Saldo PPN berubah sejak draf dibuat (ada transaksi baru). Batalkan draf lalu buat ulang.');
            const links = await this.refs.links(c, u.companyId);
            const ho = (0, sales_shared_js_1.trimBranch)(t.branch_code);
            const { legs } = (0, domain_1.ppnSettlementLegs)(now, { headOffice: ho, ppnOut: links.ppnOut, ppnIn: links.ppnIn, taxPayable: links.taxPayable, rkBranch: links.rkBranch, rkHeadOffice: links.rkHeadOffice });
            (0, cash_shared_js_1.assertBranches)(u, legs.map((l) => l.branch));
            await (0, sales_shared_js_1.acrossBranches)(c, async () => {
                for (const leg of legs) {
                    await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch: leg.branch, date: t.settle_date, source: 'tax_settlement', sourceId: id, rule: `TAX_PPN_${leg.branch}`, ref: t.doc_no,
                        description: `Setoran PPN masa ${t.period_code} (${t.doc_no})${leg.branch === ho ? ' — pemusatan kantor pusat' : ' — dipindah ke kantor pusat'}`, lines: leg.lines });
                }
                await c.query(`UPDATE tax_settlements SET status = 'diposting', posted_by = $2, posted_by_name = $3, posted_at = now(), updated_at = now() WHERE id = $1`, [id, u.id, u.name]);
            });
            await this.audit.record(c, { companyId: u.companyId, branchCode: ho, userId: u.id, sessionId: u.sessionId, action: 'tax_settlement.posted', entityType: 'tax_settlement', entityId: t.doc_no, after: { net: Number(t.net_amount), legs: legs.length }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async pay(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const t = await this.row(c, u.companyId, id, true);
            if (t.status !== 'diposting')
                throw (0, errors_js_1.conflict)('TAX_NOT_POSTED', `Setoran ${t.doc_no} belum diposting atau sudah dibayar.`);
            const net = Number(t.net_amount);
            if (net <= 0)
                throw (0, sales_shared_js_1.invalid)('TAX_NO_PAYMENT', 'Masa ini lebih bayar; tidak ada yang perlu disetor.');
            const ho = (0, sales_shared_js_1.trimBranch)(t.branch_code);
            (0, cash_shared_js_1.assertBranches)(u, [ho]);
            const date = b.date ?? (0, sales_shared_js_1.todayWib)();
            if (date < t.settle_date)
                throw (0, sales_shared_js_1.invalid)('TAX_PAY_DATE', `Tanggal setor tidak boleh sebelum akhir masa (${t.settle_date}).`);
            await (0, sales_shared_js_1.acrossBranches)(c, async () => {
                const bank = await (0, cash_shared_js_1.usableBank)(c, u.companyId, b.bankAccount);
                if (bank.branch_code !== ho)
                    throw (0, sales_shared_js_1.invalid)('BANK_BRANCH', `PPN dipusatkan: setor dari rekening kantor pusat (${ho}), bukan ${bank.branch_code}.`);
                const links = await this.refs.links(c, u.companyId);
                const j = await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch: ho, date, source: 'tax_settlement', sourceId: id, rule: 'TAX_PPN_PAYMENT', ref: t.doc_no,
                    description: `Pembayaran PPN masa ${t.period_code} — NTPN ${b.ntpn}`, lines: [{ account: links.taxPayable, debit: net, credit: 0, party: 'Kas Negara' }, { account: bank.gl_account_code, debit: 0, credit: net, bank: bank.code }] });
                await c.query(`UPDATE tax_settlements SET status = 'dibayar', bank_account_code = $2, payment_date = $3, ntpn = $4, payment_journal_id = $5, paid_by_name = $6, paid_at = now(), updated_at = now() WHERE id = $1`, [id, bank.code, date, b.ntpn, j.id, u.name]);
            });
            await this.audit.record(c, { companyId: u.companyId, branchCode: ho, userId: u.id, sessionId: u.sessionId, action: 'tax_settlement.paid', entityType: 'tax_settlement', entityId: t.doc_no, after: { net, bank: b.bankAccount, ntpn: b.ntpn, date }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async cancel(u, s, id, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const t = await this.row(c, u.companyId, id, true);
            let reversed = [];
            if (t.status === 'draf') {
                if (t.created_by !== u.id && !u.permissions.has('tax.settlement.post'))
                    throw (0, errors_js_1.forbidden)('Draf hanya dapat dibatalkan pembuatnya atau pemegang izin posting setoran.');
            }
            else if (t.status === 'diposting') {
                if (!u.permissions.has('tax.settlement.post'))
                    throw (0, errors_js_1.forbidden)('Memerlukan izin tax.settlement.post.');
                reversed = await (0, sales_shared_js_1.acrossBranches)(c, () => (0, sales_shared_js_1.reverseAutoJournals)(c, u, 'tax_settlement', id, t.settle_date > (0, sales_shared_js_1.todayWib)() ? t.settle_date : (0, sales_shared_js_1.todayWib)(), reason));
            }
            else
                throw (0, errors_js_1.conflict)('TAX_LOCKED', `Setoran ${t.doc_no} berstatus ${STATUS_LABEL[t.status]}; tidak dapat dibatalkan.`);
            await (0, sales_shared_js_1.acrossBranches)(c, () => c.query(`UPDATE tax_settlements SET status = 'batal', cancel_reason = $2, updated_at = now() WHERE id = $1`, [id, reason]));
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(t.branch_code), userId: u.id, sessionId: u.sessionId, action: 'tax_settlement.cancelled', entityType: 'tax_settlement', entityId: t.doc_no, after: { reason, reversed }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
};
exports.TaxSettlementsService = TaxSettlementsService;
exports.TaxSettlementsService = TaxSettlementsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], TaxSettlementsService);
//# sourceMappingURL=tax.service.js.map