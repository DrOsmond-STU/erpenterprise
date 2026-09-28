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
exports.CashTransfersService = exports.mapTransfer = void 0;
/**
 * Transfer kas & bank (setoran kas cabang ↔ pusat, pemindahbukuan antar rekening).
 * Diajukan staf keuangan, disetujui & diposting orang lain (pembuat ≠ penyetuju).
 * Antar cabang: satu jurnal per cabang yang diseimbangkan dengan RK sehingga
 * rekonsiliasi antar kantor tetap cocok dan tereliminasi pada konsolidasi.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const cash_shared_js_1 = require("./cash.shared.js");
const STATUS_LABEL = { menunggu: 'Menunggu persetujuan', diposting: 'Diposting', ditolak: 'Ditolak', batal: 'Batal', dibalik: 'Dibalik' };
const SELECT = `SELECT t.*, fb.name AS from_bank_name, tb.name AS to_bank_name FROM cash_transfers t
  LEFT JOIN bank_accounts fb ON fb.company_id = t.company_id AND fb.code = t.from_bank_code
  LEFT JOIN bank_accounts tb ON tb.company_id = t.company_id AND tb.code = t.to_bank_code`;
const mapTransfer = (t) => ({
    id: t.id, docNo: t.doc_no, branch: (0, sales_shared_js_1.trimBranch)(t.branch_code), toBranch: (0, sales_shared_js_1.trimBranch)(t.to_branch_code), date: t.transfer_date,
    fromBank: t.from_bank_code, fromBankName: t.from_bank_name, toBank: t.to_bank_code, toBankName: t.to_bank_name, amount: t.amount,
    reference: t.reference, notes: t.notes, status: t.status, statusLabel: STATUS_LABEL[t.status] ?? t.status,
    interBranch: (0, sales_shared_js_1.trimBranch)(t.branch_code) !== (0, sales_shared_js_1.trimBranch)(t.to_branch_code),
    createdBy: t.created_by, createdByName: t.created_by_name, decidedByName: t.decided_by_name, decidedAt: t.decided_at, decisionNote: t.decision_note, createdAt: t.created_at,
});
exports.mapTransfer = mapTransfer;
let CashTransfersService = class CashTransfersService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`${SELECT} WHERE t.company_id = $1 AND ($2::text IS NULL OR t.branch_code = $2 OR t.to_branch_code = $2) ORDER BY (t.status = 'menunggu') DESC, t.transfer_date DESC, t.doc_no DESC LIMIT 5000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(exports.mapTransfer));
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Transfer');
        if (lock)
            await c.query('SELECT 1 FROM cash_transfers WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
        const r = (await c.query(`${SELECT} WHERE t.company_id = $1 AND t.id = $2`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Transfer');
        return r;
    }
    async load(c, companyId, id) {
        const t = await this.row(c, companyId, id);
        const journals = await (0, sales_shared_js_1.acrossBranches)(c, async () => (await c.query(`SELECT id, journal_no, journal_date, branch_code, rule_code, status, total_debit, description FROM journals
        WHERE company_id = $1 AND ((source_type = 'cash_transfer' AND source_id = $2) OR (source_type = 'reversal' AND source_id IN (SELECT id::text FROM journals WHERE source_type = 'cash_transfer' AND source_id = $2)))
        ORDER BY journal_date, journal_no`, [companyId, id])).rows);
        return {
            ...(0, exports.mapTransfer)(t),
            journals: journals.map((j) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, branch: (0, sales_shared_js_1.trimBranch)(j.branch_code), rule: j.rule_code, status: j.status, total: j.total_debit, description: j.description })),
            timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'cash_transfer', t.doc_no),
        };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    async create(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const [from, to] = await (0, sales_shared_js_1.acrossBranches)(c, async () => [await (0, cash_shared_js_1.usableBank)(c, u.companyId, b.fromBank, 'Rekening sumber'), await (0, cash_shared_js_1.usableBank)(c, u.companyId, b.toBank, 'Rekening tujuan')]);
            if (from.code === to.code)
                throw (0, sales_shared_js_1.invalid)('TRANSFER_SAME_BANK', 'Rekening sumber dan tujuan harus berbeda.');
            if (s.branch !== 'ALL' && from.branch_code !== s.branch)
                throw (0, errors_js_1.forbidden)(`Rekening sumber milik cabang ${from.branch_code}; ajukan dari konteks cabang tersebut.`);
            if (u.branches !== '*' && !u.branches.includes(from.branch_code))
                throw (0, errors_js_1.forbidden)(`Anda tidak memiliki akses ke cabang ${from.branch_code}.`);
            const date = b.date ?? (0, sales_shared_js_1.todayWib)();
            const balance = await (0, sales_shared_js_1.acrossBranches)(c, () => (0, cash_shared_js_1.bankBookBalance)(c, u.companyId, from.code, date));
            if (b.amount > balance)
                throw (0, sales_shared_js_1.invalid)('TRANSFER_INSUFFICIENT', `Saldo buku ${from.code} per ${date} Rp ${balance.toLocaleString('id-ID')} tidak cukup untuk transfer Rp ${b.amount.toLocaleString('id-ID')}.`);
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'TRF', Number(date.slice(0, 4)));
            const t = (await c.query(`INSERT INTO cash_transfers (company_id, branch_code, to_branch_code, doc_no, transfer_date, from_bank_code, to_bank_code, amount, reference, notes, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [u.companyId, from.branch_code, to.branch_code, docNo, date, from.code, to.code, b.amount, b.reference ?? null, b.notes ?? null, u.id, u.name])).rows[0];
            await this.audit.record(c, { companyId: u.companyId, branchCode: from.branch_code, userId: u.id, sessionId: u.sessionId, action: 'cash_transfer.requested', entityType: 'cash_transfer', entityId: docNo,
                after: { from: from.code, to: to.code, amount: b.amount, toBranch: to.branch_code }, requestId });
            return this.load(c, u.companyId, t.id);
        });
    }
    /** Setujui & posting: jurnal satu cabang, atau dua jurnal RK antar cabang. */
    async approve(u, s, id, note, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const t = await this.row(c, u.companyId, id, true);
            if (t.status !== 'menunggu')
                throw (0, errors_js_1.conflict)('TRANSFER_NOT_PENDING', `Transfer ${t.doc_no} tidak sedang menunggu persetujuan.`);
            if (t.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_CASH_TRANSFER', 'Pengaju transfer tidak boleh menyetujui transfernya sendiri (kontrol empat mata).', common_1.HttpStatus.FORBIDDEN);
            const fromBranch = (0, sales_shared_js_1.trimBranch)(t.branch_code), toBranch = (0, sales_shared_js_1.trimBranch)(t.to_branch_code);
            (0, cash_shared_js_1.assertBranches)(u, [fromBranch, toBranch]);
            await (0, sales_shared_js_1.acrossBranches)(c, async () => {
                const from = await (0, cash_shared_js_1.usableBank)(c, u.companyId, t.from_bank_code, 'Rekening sumber');
                const to = await (0, cash_shared_js_1.usableBank)(c, u.companyId, t.to_bank_code, 'Rekening tujuan');
                const balance = await (0, cash_shared_js_1.bankBookBalance)(c, u.companyId, from.code, t.transfer_date);
                if (t.amount > balance)
                    throw (0, sales_shared_js_1.invalid)('TRANSFER_INSUFFICIENT', `Saldo buku ${from.code} per ${t.transfer_date} Rp ${balance.toLocaleString('id-ID')} tidak cukup.`);
                const links = await this.refs.links(c, u.companyId);
                const legs = (0, domain_1.transferLegs)({ fromBranch, toBranch, fromGl: from.gl_account_code, toGl: to.gl_account_code, fromBank: from.code, toBank: to.code, amount: t.amount,
                    headOffice: await (0, cash_shared_js_1.headOffice)(c, u.companyId), rkBranch: links.rkBranch, rkHeadOffice: links.rkHeadOffice });
                for (const leg of legs) {
                    const rule = legs.length === 1 ? 'CASH_TRANSFER' : leg.branch === fromBranch ? 'CASH_TRANSFER_OUT' : 'CASH_TRANSFER_IN';
                    await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch: leg.branch, date: t.transfer_date, source: 'cash_transfer', sourceId: id, rule, ref: t.doc_no,
                        description: `Transfer ${t.doc_no}: ${from.code} → ${to.code}${t.reference ? ` (${t.reference})` : ''}`, lines: leg.lines.map((l) => ({ ...l, memo: t.notes })) });
                }
            });
            await c.query(`UPDATE cash_transfers SET status = 'diposting', decided_by = $2, decided_by_name = $3, decided_at = now(), decision_note = $4, updated_at = now() WHERE id = $1`, [id, u.id, u.name, note ?? null]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: fromBranch, userId: u.id, sessionId: u.sessionId, action: 'cash_transfer.posted', entityType: 'cash_transfer', entityId: t.doc_no, after: { note, amount: t.amount }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async reject(u, s, id, note, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const t = await this.row(c, u.companyId, id, true);
            if (t.status !== 'menunggu')
                throw (0, errors_js_1.conflict)('TRANSFER_NOT_PENDING', `Transfer ${t.doc_no} tidak sedang menunggu persetujuan.`);
            if (t.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_CASH_TRANSFER', 'Pengaju tidak dapat menolak transfernya sendiri — gunakan pembatalan.', common_1.HttpStatus.FORBIDDEN);
            await c.query(`UPDATE cash_transfers SET status = 'ditolak', decided_by = $2, decided_by_name = $3, decided_at = now(), decision_note = $4, updated_at = now() WHERE id = $1`, [id, u.id, u.name, note]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(t.branch_code), userId: u.id, sessionId: u.sessionId, action: 'cash_transfer.rejected', entityType: 'cash_transfer', entityId: t.doc_no, after: { note }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async cancel(u, s, id, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const t = await this.row(c, u.companyId, id, true);
            if (t.status !== 'menunggu')
                throw (0, errors_js_1.conflict)('TRANSFER_LOCKED', `Transfer ${t.doc_no} berstatus ${STATUS_LABEL[t.status]}; hanya yang menunggu yang dapat dibatalkan.`);
            if (t.created_by !== u.id && !u.permissions.has('cash.transfer.approve'))
                throw (0, errors_js_1.forbidden)('Hanya pengaju atau penyetuju yang dapat membatalkan transfer.');
            await c.query(`UPDATE cash_transfers SET status = 'batal', decision_note = $2, updated_at = now() WHERE id = $1`, [id, reason]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(t.branch_code), userId: u.id, sessionId: u.sessionId, action: 'cash_transfer.cancelled', entityType: 'cash_transfer', entityId: t.doc_no, after: { reason }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    /** Transfer yang sudah diposting dikoreksi dengan jurnal balik (tanggal pembalikan). */
    async reverse(u, s, id, reason, date, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const t = await this.row(c, u.companyId, id, true);
            if (t.status !== 'diposting')
                throw (0, errors_js_1.conflict)('TRANSFER_NOT_POSTED', `Transfer ${t.doc_no} belum diposting.`);
            (0, cash_shared_js_1.assertBranches)(u, [(0, sales_shared_js_1.trimBranch)(t.branch_code), (0, sales_shared_js_1.trimBranch)(t.to_branch_code)]);
            const when = date ?? (0, sales_shared_js_1.todayWib)();
            if (when < t.transfer_date)
                throw (0, sales_shared_js_1.invalid)('REVERSE_DATE', 'Tanggal pembalikan tidak boleh sebelum tanggal transfer.');
            const matched = Number((await (0, sales_shared_js_1.acrossBranches)(c, () => c.query(`SELECT count(*) AS n FROM bank_statement_lines bsl JOIN journal_lines jl ON jl.id = bsl.journal_line_id JOIN journals j ON j.id = jl.journal_id
          WHERE j.company_id = $1 AND j.source_type = 'cash_transfer' AND j.source_id = $2`, [u.companyId, id]))).rows[0].n);
            if (matched)
                throw (0, errors_js_1.conflict)('TRANSFER_RECONCILED', `Transfer ${t.doc_no} sudah dicocokkan dengan rekening koran; lepaskan pencocokannya dahulu.`);
            const reversed = await (0, sales_shared_js_1.acrossBranches)(c, () => (0, sales_shared_js_1.reverseAutoJournals)(c, u, 'cash_transfer', id, when, reason));
            await c.query(`UPDATE cash_transfers SET status = 'dibalik', decision_note = $2, updated_at = now() WHERE id = $1`, [id, reason]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(t.branch_code), userId: u.id, sessionId: u.sessionId, action: 'cash_transfer.reversed', entityType: 'cash_transfer', entityId: t.doc_no, after: { reason, reversed }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
};
exports.CashTransfersService = CashTransfersService;
exports.CashTransfersService = CashTransfersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], CashTransfersService);
//# sourceMappingURL=transfers.service.js.map