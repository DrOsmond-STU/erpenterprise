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
exports.AssetsService = void 0;
/**
 * Register aset tetap: perolehan (Dr aset / Cr bank), penyusutan bulanan per cabang
 * (Dr beban penyusutan / Cr akumulasi), dan pelepasan (laba/rugi lain-lain).
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const cash_shared_js_1 = require("../cash/cash.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const prevMonthEnd = (iso) => { const d = new Date(iso.slice(0, 7) + '-01T00:00:00Z'); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
const map = (a) => ({
    id: a.id, code: a.code, name: a.name, category: a.category, glAccount: a.gl_account_code, branch: (0, sales_shared_js_1.trimBranch)(a.branch_code), location: a.location,
    acquisitionDate: a.acquisition_date, cost: Number(a.acquisition_cost), bookValue: Number(a.book_value), accumulated: Number(a.acquisition_cost) - Number(a.book_value),
    monthly: Number(a.monthly_depreciation), usefulLifeMonths: a.useful_life_months, salvage: Number(a.salvage_value), depreciatedThrough: a.depreciated_through,
    status: a.status, disposedDate: a.disposed_date, disposalProceeds: a.disposal_proceeds === null ? null : Number(a.disposal_proceeds), disposalNote: a.disposal_note,
});
let AssetsService = class AssetsService {
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
            const rows = (await c.query(`SELECT * FROM assets WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2) ORDER BY (status = 'aktif') DESC, code`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(map);
            const accounts = await this.refs.accounts(c, u.companyId);
            const glOptions = domain_1.FIXED_ASSET_HEADERS.flatMap((h) => accounts.descendantDetails(h)).map((a) => ({ code: a.code, name: a.name }));
            return { assets: rows, glOptions };
        });
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            if (!sales_shared_js_1.UUID.test(id))
                throw (0, errors_js_1.notFound)('Aset');
            const a = (await c.query('SELECT * FROM assets WHERE company_id = $1 AND id = $2', [u.companyId, id])).rows[0];
            if (!a)
                throw (0, errors_js_1.notFound)('Aset');
            const depr = (await c.query(`SELECT r.period_code, r.doc_no, l.amount, l.book_value_after FROM depreciation_lines l JOIN depreciation_runs r ON r.id = l.run_id WHERE l.asset_id = $1 ORDER BY r.period_code DESC`, [id])).rows
                .map((r) => ({ period: r.period_code, docNo: r.doc_no, amount: Number(r.amount), bookValueAfter: Number(r.book_value_after) }));
            const maint = (await c.query(`SELECT id, doc_no, kind, status, scheduled_date, coalesce(service_cost,0) + coalesce(parts_cost,0) AS cost, estimated_cost FROM maintenance_orders WHERE asset_id = $1 ORDER BY scheduled_date DESC`, [id])).rows
                .map((m) => ({ id: m.id, docNo: m.doc_no, kind: m.kind, status: m.status, date: m.scheduled_date, cost: m.status === 'selesai' ? Number(m.cost) : Number(m.estimated_cost) }));
            const journals = (await c.query(`SELECT id, journal_no, journal_date, rule_code, status, total_debit FROM journals WHERE company_id = $1 AND source_type = 'asset' AND source_id = $2 ORDER BY journal_no`, [u.companyId, id])).rows
                .map((j) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, rule: j.rule_code, status: j.status, total: j.total_debit }));
            return { ...map(a), depreciation: depr, maintenance: maint, journals, timeline: await (0, sales_shared_js_1.auditTrail)(c, u.companyId, 'asset', a.code) };
        });
    }
    async create(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            (0, sales_shared_js_1.assertBranch)(u, s, b.branch);
            const accounts = await this.refs.accounts(c, u.companyId);
            if (!domain_1.FIXED_ASSET_HEADERS.flatMap((h) => accounts.descendantDetails(h)).some((a) => a.code === b.glAccount))
                throw (0, sales_shared_js_1.invalid)('ASSET_ACCOUNT', `Akun ${b.glAccount} bukan akun detail aset tetap (${domain_1.FIXED_ASSET_HEADERS.join(', ')}).`);
            if ((b.salvage ?? 0) >= b.cost)
                throw (0, sales_shared_js_1.invalid)('ASSET_SALVAGE', 'Nilai residu harus lebih kecil dari harga perolehan.');
            const bank = await (0, cash_shared_js_1.usableBank)(c, u.companyId, b.bank, 'Rekening pembayaran');
            if (bank.branch_code !== b.branch)
                throw (0, sales_shared_js_1.invalid)('BANK_BRANCH', `Rekening ${bank.code} bukan milik cabang ${b.branch}.`);
            const max = Number((await (0, sales_shared_js_1.acrossBranches)(c, async () => c.query(`SELECT coalesce(max(nullif(regexp_replace(code, '\\D', '', 'g'), '')::int), 0) AS n FROM assets WHERE company_id = $1`, [u.companyId]))).rows[0].n);
            const code = `AST-${String(max + 1).padStart(4, '0')}`;
            const monthly = (0, domain_1.monthlyStraightLine)(b.cost, b.salvage ?? 0, b.usefulLifeMonths);
            const a = (await c.query(`INSERT INTO assets (company_id, branch_code, code, name, category, gl_account_code, acquisition_date, acquisition_cost, book_value, monthly_depreciation, status,
                                  location, useful_life_months, salvage_value, depreciated_through, funding_bank, created_by_name)
                                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,'aktif',$10,$11,$12,$13,$14,$15) RETURNING *`, [u.companyId, b.branch, code, b.name, b.category, b.glAccount, b.acquisitionDate, b.cost, monthly, b.location ?? null, b.usefulLifeMonths, b.salvage ?? 0, prevMonthEnd(b.acquisitionDate), bank.code, u.name])).rows[0];
            await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch: b.branch, date: b.acquisitionDate, source: 'asset', sourceId: a.id, rule: 'ASSET_ACQUISITION', ref: code, description: `Perolehan aset ${code} — ${b.name}`,
                lines: [{ account: b.glAccount, debit: b.cost, credit: 0, memo: null }, { account: bank.gl_account_code, debit: 0, credit: b.cost, bank: bank.code, memo: null }] });
            await this.audit.record(c, { companyId: u.companyId, branchCode: b.branch, userId: u.id, sessionId: u.sessionId, action: 'asset.acquired', entityType: 'asset', entityId: code, after: { cost: b.cost, monthly, bank: bank.code }, requestId });
            return map(a);
        });
    }
    /** Pratinjau penyusutan periode untuk cabang-cabang dalam konteks. */
    async preview(u, s, period, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.compute(c, u, s, period));
    }
    async compute(c, u, s, period) {
        const end = (0, domain_1.monthEndOf)(period), prevEnd = prevMonthEnd(end);
        const rows = (await c.query(`SELECT * FROM assets WHERE company_id = $1 AND status = 'aktif' AND ($2::text IS NULL OR branch_code = $2) AND acquisition_date <= $3 ORDER BY branch_code, code`, [u.companyId, s.branch === 'ALL' ? null : s.branch, end])).rows;
        const done = new Set((await c.query('SELECT branch_code FROM depreciation_runs WHERE company_id = $1 AND period_code = $2', [u.companyId, period])).rows.map((r) => (0, sales_shared_js_1.trimBranch)(r.branch_code)));
        const items = rows.map((a) => {
            const through = a.depreciated_through;
            const state = through && through >= end ? 'sudah' : through && through < prevEnd ? 'tertinggal' : 'jatuh';
            const amount = state === 'jatuh' ? (0, domain_1.depreciationFor)(Number(a.book_value), Number(a.salvage_value), Number(a.monthly_depreciation)) : 0;
            return { ...map(a), state, amount };
        });
        const branches = [...new Set(items.map((i) => i.branch))].map((b) => {
            const its = items.filter((i) => i.branch === b);
            return { branch: b, done: done.has(b), lagging: its.filter((i) => i.state === 'tertinggal').map((i) => i.code), total: its.reduce((t, i) => t + i.amount, 0), count: its.filter((i) => i.amount > 0).length };
        });
        return { period, end, items, branches, total: items.reduce((t, i) => t + i.amount, 0) };
    }
    async runDepreciation(u, s, period, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const p = await this.compute(c, u, s, period);
            const links = await this.refs.links(c, u.companyId);
            const posted = [];
            for (const br of p.branches) {
                if (br.done)
                    continue;
                if (u.branches !== '*' && !u.branches.includes(br.branch))
                    throw (0, errors_js_1.forbidden)(`Memerlukan akses ke cabang ${br.branch}.`);
                if (br.lagging.length)
                    throw (0, errors_js_1.conflict)('DEPRECIATION_LAGGING', `Cabang ${br.branch}: penyusutan aset ${br.lagging.join(', ')} tertinggal; jalankan periode sebelumnya dulu.`);
                const its = p.items.filter((i) => i.branch === br.branch && i.amount > 0);
                const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'DEP', Number(period.slice(0, 4)));
                const run = (await c.query(`INSERT INTO depreciation_runs (company_id, branch_code, doc_no, period_code, run_date, total, asset_count, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [u.companyId, br.branch, docNo, period, p.end, br.total, its.length, u.id, u.name])).rows[0];
                for (const i of its) {
                    await c.query('INSERT INTO depreciation_lines (run_id, company_id, branch_code, asset_id, amount, book_value_after) VALUES ($1,$2,$3,$4,$5,$6)', [run.id, u.companyId, br.branch, i.id, i.amount, i.bookValue - i.amount]);
                }
                await c.query(`UPDATE assets a SET book_value = a.book_value - l.amount, depreciated_through = $2 FROM depreciation_lines l WHERE l.run_id = $1 AND l.asset_id = a.id`, [run.id, p.end]);
                await c.query(`UPDATE assets SET depreciated_through = $3 WHERE company_id = $1 AND branch_code = $2 AND status = 'aktif' AND acquisition_date <= $3 AND (depreciated_through IS NULL OR depreciated_through < $3)`, [u.companyId, br.branch, p.end]);
                if (br.total) {
                    await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch: br.branch, date: p.end, source: 'depreciation_run', sourceId: run.id, rule: 'DEPRECIATION', ref: docNo, description: `Penyusutan aset tetap ${period} — ${br.count} aset`,
                        lines: [{ account: links.depreciationExpense, debit: br.total, credit: 0, memo: null }, { account: links.accumDepreciation, debit: 0, credit: br.total, memo: null }] });
                }
                await this.audit.record(c, { companyId: u.companyId, branchCode: br.branch, userId: u.id, sessionId: u.sessionId, action: 'depreciation.posted', entityType: 'depreciation_run', entityId: docNo, after: { period, total: br.total, assets: its.length }, requestId });
                posted.push({ branch: br.branch, docNo, total: br.total, count: its.length });
            }
            if (!posted.length)
                throw (0, errors_js_1.conflict)('DEPRECIATION_DONE', `Penyusutan ${period} untuk cabang dalam konteks sudah dijalankan.`);
            return { period, posted, preview: await this.compute(c, u, s, period) };
        });
    }
    async runs(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`SELECT r.*, (SELECT id FROM journals j WHERE j.company_id = r.company_id AND j.source_type = 'depreciation_run' AND j.source_id = r.id::text LIMIT 1) AS journal_id
                        FROM depreciation_runs r WHERE r.company_id = $1 AND ($2::text IS NULL OR r.branch_code = $2) ORDER BY r.period_code DESC, r.branch_code LIMIT 500`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows
            .map((r) => ({ id: r.id, docNo: r.doc_no, branch: (0, sales_shared_js_1.trimBranch)(r.branch_code), period: r.period_code, date: r.run_date, total: Number(r.total), count: r.asset_count, byName: r.created_by_name, journalId: r.journal_id })));
    }
    async dispose(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            if (!sales_shared_js_1.UUID.test(id))
                throw (0, errors_js_1.notFound)('Aset');
            const a = (await c.query('SELECT * FROM assets WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
            if (!a)
                throw (0, errors_js_1.notFound)('Aset');
            const branch = (0, sales_shared_js_1.trimBranch)(a.branch_code);
            (0, sales_shared_js_1.assertBranch)(u, { ...s, branch: 'ALL' }, branch);
            if (a.status !== 'aktif')
                throw (0, errors_js_1.conflict)('ASSET_NOT_ACTIVE', `Aset ${a.code} sudah dilepas.`);
            if (b.date < a.acquisition_date)
                throw (0, sales_shared_js_1.invalid)('DISPOSAL_DATE', 'Tanggal pelepasan sebelum tanggal perolehan.');
            let bank = null;
            if (b.proceeds > 0) {
                if (!b.bank)
                    throw (0, sales_shared_js_1.invalid)('DISPOSAL_BANK', 'Pilih rekening penerima hasil pelepasan.');
                bank = await (0, cash_shared_js_1.usableBank)(c, u.companyId, b.bank, 'Rekening');
                if (bank.branch_code !== branch)
                    throw (0, sales_shared_js_1.invalid)('BANK_BRANCH', `Rekening ${bank.code} bukan milik cabang ${branch}.`);
            }
            const links = await this.refs.links(c, u.companyId);
            const d = (0, domain_1.disposalLines)({ cost: Number(a.acquisition_cost), bookValue: Number(a.book_value), proceeds: b.proceeds, assetAccount: a.gl_account_code, accumAccount: links.accumDepreciation,
                bankAccount: bank?.gl_account_code, bank: bank?.code, gainAccount: links.otherIncome, lossAccount: links.otherExpense });
            await (0, sales_shared_js_1.postAutoJournal)(c, u, { branch, date: b.date, source: 'asset', sourceId: id, rule: 'ASSET_DISPOSAL', ref: a.code, description: `Pelepasan aset ${a.code} — ${a.name}`, lines: d.lines });
            await c.query(`UPDATE assets SET status = 'dihapuskan', disposed_date = $2, disposal_proceeds = $3, disposal_note = $4, book_value = 0 WHERE id = $1`, [id, b.date, b.proceeds, b.note]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'asset.disposed', entityType: 'asset', entityId: a.code, after: { proceeds: b.proceeds, gain: d.gain, note: b.note }, requestId });
            return { ...map({ ...a, status: 'dihapuskan', disposed_date: b.date, disposal_proceeds: b.proceeds, disposal_note: b.note, book_value: 0 }), gain: d.gain };
        });
    }
};
exports.AssetsService = AssetsService;
exports.AssetsService = AssetsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], AssetsService);
//# sourceMappingURL=assets.service.js.map