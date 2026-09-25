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
exports.JournalsService = void 0;
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("./ledger.shared.js");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assertUuid = (id) => { if (!UUID.test(id))
    throw (0, errors_js_1.notFound)('Jurnal'); };
const STATUS_ID = { posted: 'diposting', pending: 'menunggu', rejected: 'ditolak', reversed: 'dibalik', draft: 'draf' };
const mapJournal = (j) => ({
    id: j.id, journalNo: j.journal_no, date: j.journal_date, branch: String(j.branch_code).trim(), period: j.period_code,
    source: j.source_type, sourceId: j.source_id, ruleCode: j.rule_code, ref: j.ref, description: j.description,
    status: j.status, statusLabel: STATUS_ID[j.status] ?? j.status, total: j.total_debit,
    createdAt: j.created_at, createdBy: j.created_by, createdByName: j.created_by_name, postedAt: j.posted_at, postedBy: j.posted_by,
    reversedByJournalId: j.reversed_by_journal_id, reversesJournalId: j.reverses_journal_id, lineCount: j.line_count ?? undefined,
});
const mapLine = (l) => ({ lineNo: l.line_no, account: l.account_code, accountName: l.account_name, debit: l.debit, credit: l.credit, bankAccountId: l.bank_account_code, bankName: l.bank_name, party: l.party, counterBranch: l.counter_branch ? String(l.counter_branch).trim() : null, memo: l.memo });
let JournalsService = class JournalsService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    async list(u, s, f, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const p = await this.refs.resolvePeriod(c, u.companyId, s.period);
            const where = ['j.company_id = $1', 'j.journal_date BETWEEN $2 AND $3'];
            const args = [u.companyId, p.from, p.to];
            if (s.branch !== 'ALL') {
                args.push(s.branch);
                where.push(`j.branch_code = $${args.length}`);
            }
            if (f.status) {
                args.push(f.status);
                where.push(`j.status = $${args.length}`);
            }
            if (f.source) {
                args.push(f.source);
                where.push(`j.source_type = $${args.length}`);
            }
            if (f.account) {
                args.push(f.account);
                where.push(`EXISTS (SELECT 1 FROM journal_lines x WHERE x.journal_id = j.id AND x.account_code = $${args.length})`);
            }
            if (f.q) {
                args.push(`%${f.q}%`);
                where.push(`(j.journal_no ILIKE $${args.length} OR j.description ILIKE $${args.length} OR coalesce(j.ref,'') ILIKE $${args.length} OR j.created_by_name ILIKE $${args.length})`);
            }
            const w = where.join(' AND ');
            const total = (await c.query(`SELECT count(*)::int AS n FROM journals j WHERE ${w}`, args)).rows[0].n;
            const counts = (await c.query(`SELECT status, count(*)::int AS n FROM journals j WHERE ${where.filter((x) => !x.startsWith('j.status')).join(' AND ')} GROUP BY status`, args.filter((_, i) => !(f.status && i === args.indexOf(f.status))))).rows;
            args.push(f.size, (f.page - 1) * f.size);
            const rows = (await c.query(`SELECT j.*, (SELECT count(*)::int FROM journal_lines l WHERE l.journal_id = j.id) AS line_count
           FROM journals j WHERE ${w} ORDER BY j.journal_date DESC, j.journal_no DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
            return { data: rows.map(mapJournal), meta: { total, page: f.page, size: f.size, period: p, statusCounts: Object.fromEntries(counts.map((r) => [r.status, r.n])) } };
        });
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => this.load(c, u.companyId, id));
    }
    async load(c, companyId, idOrNo) {
        const j = (await c.query('SELECT * FROM journals WHERE company_id = $1 AND (($2 ~* $3 AND id::text = $2) OR journal_no = $2)', [companyId, idOrNo, UUID.source])).rows[0];
        if (!j)
            throw (0, errors_js_1.notFound)('Jurnal');
        const lines = (await c.query(`SELECT l.*, a.name AS account_name, b.name AS bank_name FROM journal_lines l
         LEFT JOIN chart_of_accounts a ON a.company_id = l.company_id AND a.code = l.account_code
         LEFT JOIN bank_accounts b ON b.company_id = l.company_id AND b.code = l.bank_account_code
        WHERE l.journal_id = $1 ORDER BY l.line_no`, [j.id])).rows;
        return { ...mapJournal(j), lines: lines.map(mapLine) };
    }
    async byRef(u, s, ref, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query('SELECT j.*, (SELECT count(*)::int FROM journal_lines l WHERE l.journal_id = j.id) AS line_count FROM journals j WHERE company_id = $1 AND (ref = $2 OR source_id = $2) ORDER BY journal_date', [u.companyId, ref])).rows.map(mapJournal));
    }
    /** Jurnal memorial baru → status pending (K-20/K-21; pembuat ≠ pemosting). */
    async create(u, s, raw, requestId) {
        const input = domain_1.journalInputSchema.parse(raw);
        if (s.branch !== 'ALL' && input.branch !== s.branch)
            throw (0, errors_js_1.forbidden)(`Jurnal untuk cabang ${input.branch} tidak dapat dibuat dari konteks cabang ${s.branch}.`);
        if (u.branches !== '*' && !u.branches.includes(input.branch))
            throw (0, errors_js_1.forbidden)(`Anda tidak memiliki akses ke cabang ${input.branch}.`);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const accounts = await this.refs.accounts(c, u.companyId);
            const periods = await this.refs.periods(c, u.companyId);
            const branches = await this.refs.branches(c, u.companyId);
            const bankAccounts = await this.refs.bankAccounts(c, u.companyId);
            const lines = (0, domain_1.normalizeLines)(input.lines);
            const errs = (0, domain_1.validateJournal)({ ...input, lines }, { accounts, periods, branches, bankAccounts });
            if (errs.length)
                throw new errors_js_1.DomainError('LEDGER_INVALID', errs[0], common_1.HttpStatus.UNPROCESSABLE_ENTITY, errs);
            const period = periods.find((p) => p.group === 'Bulan' && input.date >= p.from && input.date <= p.to);
            const year = Number(input.date.slice(0, 4));
            const seq = (await c.query('SELECT next_doc_no($1, $2, $3) AS n', [u.companyId, 'JV', year])).rows[0].n;
            const journalNo = `JV-${year}-${String(seq).padStart(6, '0')}`;
            const ins = await c.query(`INSERT INTO journals (company_id, branch_code, period_code, journal_no, journal_date, source_type, rule_code, ref, description, status, total_debit, total_credit, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,'manual','MANUAL',$6,$7,'pending',$8,$8,$9,$10) RETURNING *`, [u.companyId, input.branch, period.id, journalNo, input.date, input.ref ?? null, input.description, lines.reduce((t, l) => t + l.debit, 0), u.id, u.name]);
            const j = ins.rows[0];
            await this.insertLines(c, j, lines);
            await this.audit.record(c, { companyId: u.companyId, branchCode: input.branch, userId: u.id, sessionId: u.sessionId, action: 'journal.created', entityType: 'journal', entityId: journalNo, after: { ...input, lines }, requestId });
            return this.load(c, u.companyId, j.id);
        });
    }
    async insertLines(c, j, lines) {
        let n = 0;
        for (const l of lines) {
            n += 1;
            await c.query(`INSERT INTO journal_lines (journal_id, company_id, branch_code, journal_date, line_no, account_code, debit, credit, bank_account_code, party, counter_branch, memo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [j.id, j.company_id, j.branch_code, j.journal_date, n, l.account, l.debit, l.credit, l.bankAccountId ?? null, l.party ?? null, l.counterBranch ?? null, l.memo ?? null]);
        }
    }
    /** Posting: hanya jurnal pending, oleh orang selain pembuatnya (SoD). Trigger basis data menjaga periode & keseimbangan. */
    async post(u, s, id, requestId) {
        assertUuid(id);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const j = (await c.query('SELECT * FROM journals WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
            if (!j)
                throw (0, errors_js_1.notFound)('Jurnal');
            if (j.status !== 'pending')
                throw new errors_js_1.DomainError('LEDGER_NOT_PENDING', `Jurnal ${j.journal_no} berstatus ${STATUS_ID[j.status]}, bukan menunggu.`, common_1.HttpStatus.CONFLICT);
            if (j.created_by && j.created_by === u.id)
                throw new errors_js_1.DomainError('SOD_JOURNAL', 'Pembuat jurnal tidak boleh memposting jurnalnya sendiri (kontrol empat mata).', common_1.HttpStatus.FORBIDDEN);
            await c.query(`UPDATE journals SET status = 'posted', posted_by = $3, posted_at = now() WHERE company_id = $1 AND id = $2`, [u.companyId, id, u.id]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: String(j.branch_code).trim(), userId: u.id, sessionId: u.sessionId, action: 'journal.posted', entityType: 'journal', entityId: j.journal_no, before: { status: 'pending' }, after: { status: 'posted' }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    async reject(u, s, id, reason, requestId) {
        assertUuid(id);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const j = (await c.query('SELECT * FROM journals WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
            if (!j)
                throw (0, errors_js_1.notFound)('Jurnal');
            if (j.status !== 'pending')
                throw new errors_js_1.DomainError('LEDGER_NOT_PENDING', `Jurnal ${j.journal_no} tidak sedang menunggu persetujuan.`, common_1.HttpStatus.CONFLICT);
            await c.query(`UPDATE journals SET status = 'rejected' WHERE company_id = $1 AND id = $2`, [u.companyId, id]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: String(j.branch_code).trim(), userId: u.id, sessionId: u.sessionId, action: 'journal.rejected', entityType: 'journal', entityId: j.journal_no, after: { reason }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
    /** Jurnal balik: koreksi satu-satunya untuk jurnal terposting (K-20). Diposting langsung oleh pemegang izin reverse. */
    async reverse(u, s, id, date, reason, requestId) {
        assertUuid(id);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const j = (await c.query('SELECT * FROM journals WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
            if (!j)
                throw (0, errors_js_1.notFound)('Jurnal');
            if (j.status !== 'posted')
                throw new errors_js_1.DomainError('LEDGER_NOT_POSTED', `Hanya jurnal terposting yang dapat dibalik.`, common_1.HttpStatus.CONFLICT);
            const rdate = date ?? new Date().toISOString().slice(0, 10);
            const period = await this.refs.periodForDate(c, u.companyId, rdate);
            if (!period)
                throw new errors_js_1.DomainError('LEDGER_UNKNOWN_PERIOD', `Tanggal ${rdate} tidak berada dalam periode terdaftar.`);
            if (period.status !== 'open')
                throw new errors_js_1.DomainError('LEDGER_PERIOD_CLOSED', `Periode ${period.label} sudah ditutup.`);
            const lines = (await c.query('SELECT * FROM journal_lines WHERE journal_id = $1 ORDER BY line_no', [j.id])).rows
                .map((l) => ({ account: l.account_code, debit: l.debit, credit: l.credit, bankAccountId: l.bank_account_code, party: l.party, counterBranch: l.counter_branch, memo: l.memo }));
            const year = Number(rdate.slice(0, 4));
            const seq = (await c.query('SELECT next_doc_no($1, $2, $3) AS n', [u.companyId, 'JV', year])).rows[0].n;
            const journalNo = `JV-${year}-${String(seq).padStart(6, '0')}`;
            const ins = await c.query(`INSERT INTO journals (company_id, branch_code, period_code, journal_no, journal_date, source_type, rule_code, ref, description, status, total_debit, total_credit, created_by, created_by_name, posted_by, posted_at, reverses_journal_id)
         VALUES ($1,$2,$3,$4,$5,'manual','REVERSAL',$6,$7,'posted',$8,$8,$9,$10,$9,now(),$11) RETURNING *`, [u.companyId, j.branch_code, period.id, journalNo, rdate, j.journal_no, `Pembalikan ${j.journal_no}: ${reason}`, j.total_debit, u.id, u.name, j.id]);
            await this.insertLines(c, ins.rows[0], (0, domain_1.reverseLines)(lines));
            await c.query(`UPDATE journals SET status = 'reversed', reversed_by_journal_id = $3 WHERE company_id = $1 AND id = $2`, [u.companyId, id, ins.rows[0].id]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: String(j.branch_code).trim(), userId: u.id, sessionId: u.sessionId, action: 'journal.reversed', entityType: 'journal', entityId: j.journal_no, after: { reversedBy: journalNo, reason }, requestId });
            return this.load(c, u.companyId, ins.rows[0].id);
        });
    }
};
exports.JournalsService = JournalsService;
exports.JournalsService = JournalsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], JournalsService);
//# sourceMappingURL=journals.service.js.map