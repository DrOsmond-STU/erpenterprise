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
exports.BankStatementsService = void 0;
/**
 * Rekonsiliasi bank dari mutasi rekening koran (CSV internet banking / MT940).
 *  - Impor: baris mutasi disimpan, dicek saldo awal + mutasi = saldo akhir, lalu
 *    dicocokkan otomatis dengan baris buku rekening yang sama (jumlah & tanggal ±3 hari).
 *  - Baris bank yang belum ada di buku (biaya/bunga bank) dibuatkan jurnal memorial
 *    yang tetap harus diposting orang lain; setelah diposting, cocokkan ulang.
 *  - Finalisasi oleh orang lain (pengimpor ≠ penutup): semua baris cocok/diabaikan,
 *    saldo awal sama dengan buku, dan saldo buku disesuaikan = saldo rekening koran.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const journals_service_js_1 = require("../ledger/journals.service.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const cash_shared_js_1 = require("./cash.shared.js");
const STATUS_LABEL = { proses: 'Dalam proses', selesai: 'Selesai', batal: 'Batal' };
const MATCH_WINDOW = 3;
const BOOK_SQL = `SELECT jl.id, jl.journal_date, (jl.debit - jl.credit) AS amount, jl.memo, jl.party, j.journal_no, j.ref, j.description, j.id AS journal_id,
    (SELECT bsl.statement_id FROM bank_statement_lines bsl WHERE bsl.journal_line_id = jl.id) AS matched_statement
  FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
  WHERE jl.company_id = $1 AND jl.bank_account_code = $2 AND j.status IN ('posted','reversed') AND jl.journal_date BETWEEN $3 AND $4
  ORDER BY jl.journal_date, j.journal_no, jl.line_no`;
const mapBook = (r) => ({ id: Number(r.id), date: r.journal_date, amount: Number(r.amount), journalId: r.journal_id, journalNo: r.journal_no, ref: r.ref, description: r.description, party: r.party, matchedStatement: r.matched_statement });
let BankStatementsService = class BankStatementsService {
    db;
    audit;
    journals;
    constructor(db, audit, journals) {
        this.db = db;
        this.audit = audit;
        this.journals = journals;
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`SELECT st.*, b.name AS bank_name,
                (SELECT count(*)::int FROM bank_statement_lines l WHERE l.statement_id = st.id) AS line_count,
                (SELECT count(*)::int FROM bank_statement_lines l WHERE l.statement_id = st.id AND l.status = 'belum') AS open_count
           FROM bank_statements st LEFT JOIN bank_accounts b ON b.company_id = st.company_id AND b.code = st.bank_account_code
          WHERE st.company_id = $1 AND ($2::text IS NULL OR st.branch_code = $2) ORDER BY st.period_to DESC, st.doc_no DESC LIMIT 2000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map((r) => ({ ...this.mapHeader(r), lineCount: r.line_count, openCount: r.open_count })));
    }
    mapHeader(r) {
        return {
            id: r.id, docNo: r.doc_no, branch: (0, sales_shared_js_1.trimBranch)(r.branch_code), bankAccount: r.bank_account_code, bankName: r.bank_name ?? null, from: r.period_from, to: r.period_to,
            opening: Number(r.opening_balance), closing: Number(r.closing_balance), source: r.source, fileName: r.file_name, status: r.status, statusLabel: STATUS_LABEL[r.status] ?? r.status,
            createdBy: r.created_by, createdByName: r.created_by_name, createdAt: r.created_at, finalizedByName: r.finalized_by_name, finalizedAt: r.finalized_at, summary: r.summary,
        };
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Rekening koran');
        const r = (await c.query(`SELECT st.*, b.name AS bank_name FROM bank_statements st LEFT JOIN bank_accounts b ON b.company_id = st.company_id AND b.code = st.bank_account_code
       WHERE st.company_id = $1 AND st.id = $2 ${lock ? 'FOR UPDATE OF st' : ''}`, [companyId, id])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)('Rekening koran');
        return r;
    }
    async summary(c, companyId, st) {
        const lines = (await c.query('SELECT amount, status FROM bank_statement_lines WHERE statement_id = $1', [st.id])).rows;
        const book = (await c.query(BOOK_SQL, [companyId, st.bank_account_code, st.period_from, st.period_to])).rows.map(mapBook);
        const bookOnly = book.filter((b) => !b.matchedStatement);
        return {
            ...(0, domain_1.bankRecSummary)({
                statementOpening: Number(st.opening_balance), statementClosing: Number(st.closing_balance),
                bookOpening: await (0, cash_shared_js_1.bankBookBalance)(c, companyId, st.bank_account_code, st.period_from, true), bookClosing: await (0, cash_shared_js_1.bankBookBalance)(c, companyId, st.bank_account_code, st.period_to),
                bookOnly: bookOnly.map((b) => b.amount), unmatched: lines.filter((l) => l.status === 'belum').map((l) => Number(l.amount)), ignored: lines.filter((l) => l.status === 'diabaikan').map((l) => Number(l.amount)),
            }),
            bookOpening: await (0, cash_shared_js_1.bankBookBalance)(c, companyId, st.bank_account_code, st.period_from, true), bookClosing: await (0, cash_shared_js_1.bankBookBalance)(c, companyId, st.bank_account_code, st.period_to),
            counts: { total: lines.length, matched: lines.filter((l) => l.status === 'cocok').length, ignored: lines.filter((l) => l.status === 'diabaikan').length, open: lines.filter((l) => l.status === 'belum').length, bookOnly: bookOnly.length },
        };
    }
    async load(c, companyId, id) {
        const st = await this.row(c, companyId, id);
        const lines = (await c.query(`SELECT l.*, jl.journal_date AS book_date, j.journal_no AS book_journal_no, j.description AS book_description, cj.journal_no AS created_journal_no, cj.status AS created_journal_status
         FROM bank_statement_lines l LEFT JOIN journal_lines jl ON jl.id = l.journal_line_id LEFT JOIN journals j ON j.id = jl.journal_id LEFT JOIN journals cj ON cj.id = l.journal_id
        WHERE l.statement_id = $1 ORDER BY l.line_no`, [id])).rows.map((l) => ({
            id: Number(l.id), lineNo: l.line_no, date: l.tx_date, description: l.description, reference: l.reference, amount: Number(l.amount), balance: l.balance === null ? null : Number(l.balance),
            status: l.status, matchKind: l.match_kind, matchedByName: l.matched_by_name, note: l.note,
            book: l.journal_line_id ? { lineId: Number(l.journal_line_id), date: l.book_date, journalNo: l.book_journal_no, description: l.book_description } : null,
            createdJournal: l.journal_id ? { id: l.journal_id, journalNo: l.created_journal_no, status: l.created_journal_status } : null,
        }));
        const from = new Date(Date.parse(st.period_from + 'T00:00:00Z') - 10 * 86_400_000).toISOString().slice(0, 10);
        const to = new Date(Date.parse(st.period_to + 'T00:00:00Z') + 10 * 86_400_000).toISOString().slice(0, 10);
        const book = (await c.query(BOOK_SQL, [companyId, st.bank_account_code, from, to])).rows.map(mapBook);
        return {
            ...this.mapHeader(st), lines,
            bookOnly: book.filter((b) => !b.matchedStatement && b.date >= st.period_from && b.date <= st.period_to),
            candidates: book.filter((b) => !b.matchedStatement),
            reconciliation: await this.summary(c, companyId, st),
            timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'bank_statement', st.doc_no),
        };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    assertBank(u, s, branch) {
        if (s.branch !== 'ALL' && branch !== s.branch)
            throw (0, errors_js_1.forbidden)(`Rekening milik cabang ${branch}; buka dari konteks cabang tersebut.`);
        if (u.branches !== '*' && !u.branches.includes(branch))
            throw (0, errors_js_1.forbidden)(`Anda tidak memiliki akses ke cabang ${branch}.`);
    }
    async import(u, s, b, requestId) {
        const parsed = (0, domain_1.parseStatement)(b.content);
        if (parsed.errors.length)
            throw (0, sales_shared_js_1.invalid)('STATEMENT_PARSE', parsed.errors[0], parsed.errors.slice(0, 20));
        if (!parsed.lines.length)
            throw (0, sales_shared_js_1.invalid)('STATEMENT_EMPTY', 'Berkas tidak berisi mutasi.');
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const bank = await (0, cash_shared_js_1.usableBank)(c, u.companyId, b.bankAccount);
            this.assertBank(u, s, bank.branch_code);
            const last4 = /(\d{4})$/.exec(bank.account_no_masked ?? '')?.[1];
            if (parsed.account && last4 && !parsed.account.replace(/\D/g, '').endsWith(last4))
                throw (0, sales_shared_js_1.invalid)('STATEMENT_ACCOUNT', `Berkas untuk rekening ${parsed.account}, bukan ${bank.code} (…${last4}).`);
            const dates = parsed.lines.map((l) => l.date).sort();
            const from = dates[0], to = dates[dates.length - 1];
            const opening = parsed.opening ?? b.opening;
            if (opening === undefined || opening === null)
                throw (0, sales_shared_js_1.invalid)('STATEMENT_OPENING', 'Saldo awal tidak ada di berkas; isi saldo awal rekening koran.');
            const closing = parsed.closing ?? b.closing ?? opening + parsed.lines.reduce((t, l) => t + l.amount, 0);
            const problems = (0, domain_1.statementProblems)({ opening, closing, lines: parsed.lines });
            if (problems.length)
                throw (0, sales_shared_js_1.invalid)('STATEMENT_UNBALANCED', problems[0], problems);
            const overlap = (await c.query(`SELECT doc_no FROM bank_statements WHERE company_id = $1 AND bank_account_code = $2 AND status <> 'batal' AND period_from <= $4 AND period_to >= $3`, [u.companyId, bank.code, from, to])).rows[0];
            if (overlap)
                throw (0, errors_js_1.conflict)('STATEMENT_OVERLAP', `Periode ${from} s.d. ${to} bertumpang tindih dengan rekening koran ${overlap.doc_no} untuk ${bank.code}.`);
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'MUT', Number(to.slice(0, 4)));
            const st = (await c.query(`INSERT INTO bank_statements (company_id, branch_code, bank_account_code, doc_no, period_from, period_to, opening_balance, closing_balance, source, file_name, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [u.companyId, bank.branch_code, bank.code, docNo, from, to, opening, closing, parsed.format, (b.fileName ?? '').slice(0, 200) || null, u.id, u.name])).rows[0];
            let n = 0;
            for (const l of parsed.lines) {
                n += 1;
                await c.query(`INSERT INTO bank_statement_lines (statement_id, company_id, branch_code, line_no, tx_date, description, reference, amount, balance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [st.id, u.companyId, bank.branch_code, n, l.date, l.description, l.reference ? l.reference.slice(0, 120) : null, l.amount, l.balance]);
            }
            const matched = await this.runAutoMatch(c, u, st.id);
            await this.audit.record(c, { companyId: u.companyId, branchCode: bank.branch_code, userId: u.id, sessionId: u.sessionId, action: 'bank_statement.imported', entityType: 'bank_statement', entityId: docNo,
                after: { bank: bank.code, format: parsed.format, lines: parsed.lines.length, from, to, opening, closing, matched }, requestId });
            return this.load(c, u.companyId, st.id);
        });
    }
    async runAutoMatch(c, u, id) {
        const st = await this.row(c, u.companyId, id);
        const open = (await c.query(`SELECT id, tx_date, amount, reference, description FROM bank_statement_lines WHERE statement_id = $1 AND status = 'belum'`, [id])).rows
            .map((l) => ({ id: Number(l.id), date: l.tx_date, amount: Number(l.amount), reference: l.reference, description: l.description }));
        if (!open.length)
            return 0;
        const from = new Date(Date.parse(st.period_from + 'T00:00:00Z') - MATCH_WINDOW * 86_400_000).toISOString().slice(0, 10);
        const to = new Date(Date.parse(st.period_to + 'T00:00:00Z') + MATCH_WINDOW * 86_400_000).toISOString().slice(0, 10);
        const book = (await c.query(BOOK_SQL, [u.companyId, st.bank_account_code, from, to])).rows.map(mapBook).filter((b) => !b.matchedStatement)
            .map((b) => ({ id: b.id, date: b.date, amount: b.amount, text: `${b.journalNo} ${b.ref ?? ''} ${b.description} ${b.party ?? ''}` }));
        const pairs = (0, domain_1.autoMatch)(open, book, MATCH_WINDOW);
        for (const p of pairs) {
            await c.query(`UPDATE bank_statement_lines SET status = 'cocok', journal_line_id = $2, match_kind = 'otomatis', matched_by_name = 'Sistem', matched_at = now() WHERE id = $1`, [p.statementLineId, p.bookLineId]);
        }
        return pairs.length;
    }
    async editable(c, u, s, id) {
        const st = await this.row(c, u.companyId, id, true);
        if (st.status !== 'proses')
            throw (0, errors_js_1.conflict)('STATEMENT_LOCKED', `Rekening koran ${st.doc_no} berstatus ${STATUS_LABEL[st.status]}.`);
        this.assertBank(u, s, (0, sales_shared_js_1.trimBranch)(st.branch_code));
        return st;
    }
    async line(c, id, lineId) {
        const l = (await c.query('SELECT * FROM bank_statement_lines WHERE statement_id = $1 AND id = $2 FOR UPDATE', [id, lineId])).rows[0];
        if (!l)
            throw (0, errors_js_1.notFound)('Baris rekening koran');
        return l;
    }
    async autoMatchAgain(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const st = await this.editable(c, u, s, id);
            const n = await this.runAutoMatch(c, u, id);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(st.branch_code), userId: u.id, sessionId: u.sessionId, action: 'bank_statement.auto_matched', entityType: 'bank_statement', entityId: st.doc_no, after: { matched: n }, requestId });
            return { ...(await this.load(c, u.companyId, id)), newlyMatched: n };
        });
    }
    async match(u, s, id, lineId, journalLineId, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const st = await this.editable(c, u, s, id);
            const l = await this.line(c, id, lineId);
            if (l.status !== 'belum')
                throw (0, errors_js_1.conflict)('LINE_NOT_OPEN', 'Baris ini sudah dicocokkan atau diabaikan; lepaskan dahulu.');
            const jl = (await c.query(`SELECT jl.*, j.status FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE jl.company_id = $1 AND jl.id = $2`, [u.companyId, journalLineId])).rows[0];
            if (!jl || jl.bank_account_code !== st.bank_account_code || !['posted', 'reversed'].includes(jl.status))
                throw (0, sales_shared_js_1.invalid)('BOOK_LINE_INVALID', `Baris buku bukan mutasi terposting rekening ${st.bank_account_code}.`);
            if (Number(jl.debit) - Number(jl.credit) !== Number(l.amount))
                throw (0, sales_shared_js_1.invalid)('MATCH_AMOUNT', `Jumlah tidak sama: rekening koran Rp ${Number(l.amount).toLocaleString('id-ID')}, buku Rp ${(Number(jl.debit) - Number(jl.credit)).toLocaleString('id-ID')}.`);
            const taken = (await c.query('SELECT 1 FROM bank_statement_lines WHERE journal_line_id = $1', [journalLineId])).rowCount;
            if (taken)
                throw (0, errors_js_1.conflict)('BOOK_LINE_TAKEN', 'Baris buku ini sudah dicocokkan dengan baris rekening koran lain.');
            await c.query(`UPDATE bank_statement_lines SET status = 'cocok', journal_line_id = $2, match_kind = 'manual', matched_by_name = $3, matched_at = now() WHERE id = $1`, [lineId, journalLineId, u.name]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(st.branch_code), userId: u.id, sessionId: u.sessionId, action: 'bank_statement.matched', entityType: 'bank_statement', entityId: st.doc_no, after: { line: l.line_no, journalLineId }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async unmatch(u, s, id, lineId, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const st = await this.editable(c, u, s, id);
            const l = await this.line(c, id, lineId);
            if (l.status === 'belum')
                throw (0, errors_js_1.conflict)('LINE_OPEN', 'Baris ini belum dicocokkan.');
            await c.query(`UPDATE bank_statement_lines SET status = 'belum', journal_line_id = NULL, match_kind = NULL, matched_by_name = NULL, matched_at = NULL, note = NULL WHERE id = $1`, [lineId]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(st.branch_code), userId: u.id, sessionId: u.sessionId, action: 'bank_statement.unmatched', entityType: 'bank_statement', entityId: st.doc_no, after: { line: l.line_no, was: l.status }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async ignore(u, s, id, lineId, note, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const st = await this.editable(c, u, s, id);
            const l = await this.line(c, id, lineId);
            if (l.status !== 'belum')
                throw (0, errors_js_1.conflict)('LINE_NOT_OPEN', 'Baris ini sudah dicocokkan atau diabaikan.');
            await c.query(`UPDATE bank_statement_lines SET status = 'diabaikan', note = $2, matched_by_name = $3, matched_at = now() WHERE id = $1`, [lineId, note, u.name]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(st.branch_code), userId: u.id, sessionId: u.sessionId, action: 'bank_statement.ignored', entityType: 'bank_statement', entityId: st.doc_no, after: { line: l.line_no, amount: Number(l.amount), note }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    /** Jurnal memorial (pending) untuk transaksi bank yang belum dibukukan: biaya administrasi, bunga, pajak bunga. */
    async createJournal(u, s, id, lineId, b, requestId) {
        const prep = await this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const st = await this.editable(c, u, s, id);
            const l = await this.line(c, id, lineId);
            if (l.status !== 'belum')
                throw (0, errors_js_1.conflict)('LINE_NOT_OPEN', 'Baris ini sudah dicocokkan atau diabaikan.');
            if (l.journal_id) {
                const j = (await c.query('SELECT status, journal_no FROM journals WHERE id = $1', [l.journal_id])).rows[0];
                if (j && ['pending', 'posted'].includes(j.status))
                    throw (0, errors_js_1.conflict)('LINE_HAS_JOURNAL', `Baris ini sudah dibuatkan jurnal ${j.journal_no} (${j.status}).`);
            }
            const bank = await (0, cash_shared_js_1.usableBank)(c, u.companyId, st.bank_account_code);
            return { st, l, bank };
        });
        const amount = Number(prep.l.amount);
        const bankLine = { account: prep.bank.gl_account_code, debit: amount > 0 ? amount : 0, credit: amount < 0 ? -amount : 0 };
        const other = { account: b.account, debit: amount < 0 ? -amount : 0, credit: amount > 0 ? amount : 0 };
        const journal = await this.journals.create(u, s, {
            branch: (0, sales_shared_js_1.trimBranch)(prep.st.branch_code), date: prep.l.tx_date, ref: prep.st.doc_no,
            description: (b.description?.trim() || `${prep.l.description} (rekening koran ${prep.st.doc_no} baris ${prep.l.line_no})`).slice(0, 300),
            lines: amount < 0 ? [other, bankLine] : [bankLine, other],
        }, requestId);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            await c.query('UPDATE bank_statement_lines SET journal_id = $2 WHERE id = $1', [lineId, journal.id]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(prep.st.branch_code), userId: u.id, sessionId: u.sessionId, action: 'bank_statement.journal_created', entityType: 'bank_statement', entityId: prep.st.doc_no,
                after: { line: prep.l.line_no, journal: journal.journalNo, account: b.account, amount }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async finalize(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const st = await this.editable(c, u, s, id);
            if (st.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_BANK_RECON', 'Pengimpor rekening koran tidak boleh memfinalisasi rekonsiliasinya sendiri (kontrol empat mata).', common_1.HttpStatus.FORBIDDEN);
            const sum = await this.summary(c, u.companyId, st);
            const errs = [];
            if (sum.counts.open)
                errs.push(`${sum.counts.open} baris rekening koran belum dicocokkan atau diabaikan.`);
            if (sum.openingDifference)
                errs.push(`Saldo awal rekening koran berbeda Rp ${sum.openingDifference.toLocaleString('id-ID')} dari saldo buku awal periode.`);
            if (!sum.balanced)
                errs.push(`Saldo buku disesuaikan Rp ${sum.adjustedBook.toLocaleString('id-ID')} ≠ saldo rekening koran Rp ${Number(st.closing_balance).toLocaleString('id-ID')}.`);
            if (errs.length)
                throw (0, sales_shared_js_1.invalid)('RECON_NOT_BALANCED', errs[0], errs);
            await c.query(`UPDATE bank_statements SET status = 'selesai', summary = $2::jsonb, finalized_by = $3, finalized_by_name = $4, finalized_at = now() WHERE id = $1`, [id, JSON.stringify(sum), u.id, u.name]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(st.branch_code), userId: u.id, sessionId: u.sessionId, action: 'bank_statement.finalized', entityType: 'bank_statement', entityId: st.doc_no,
                after: { closing: Number(st.closing_balance), book: sum.bookClosing, inTransit: sum.inTransit, outstanding: sum.outstanding, ignored: sum.ignored }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async cancel(u, s, id, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const st = await this.editable(c, u, s, id);
            if (st.created_by !== u.id && !u.permissions.has('cash.reconcile.approve'))
                throw (0, errors_js_1.forbidden)('Hanya pengimpor atau pemegang izin finalisasi yang dapat membatalkan rekening koran.');
            await c.query(`UPDATE bank_statement_lines SET status = 'belum', journal_line_id = NULL, match_kind = NULL WHERE statement_id = $1`, [id]);
            await c.query(`UPDATE bank_statements SET status = 'batal' WHERE id = $1`, [id]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(st.branch_code), userId: u.id, sessionId: u.sessionId, action: 'bank_statement.cancelled', entityType: 'bank_statement', entityId: st.doc_no, after: { reason }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
};
exports.BankStatementsService = BankStatementsService;
exports.BankStatementsService = BankStatementsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, journals_service_js_1.JournalsService])
], BankStatementsService);
//# sourceMappingURL=statements.service.js.map