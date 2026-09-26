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
exports.ReportsService = void 0;
exports.daysBetween = daysBetween;
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("./ledger.shared.js");
let ReportsService = class ReportsService {
    db;
    refs;
    constructor(db, refs) {
        this.db = db;
        this.refs = refs;
    }
    scopeBranch(s) { return s.branch === 'ALL' ? null : s.branch; }
    async base(c, u, s) {
        const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
        const accounts = await this.refs.accounts(c, u.companyId);
        const bal = await this.refs.balances(c, u.companyId, this.scopeBranch(s), period.from, period.to);
        return { period, accounts, bal };
    }
    async trialBalance(u, s, byBranch, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const { period, accounts, bal } = await this.base(c, u, s);
            const tb = (0, domain_1.trialBalance)(accounts, bal);
            if (!byBranch || s.branch !== 'ALL')
                return { period, scope: s.branch, ...tb };
            const per = await this.refs.balancesByBranch(c, u.companyId, period.from, period.to);
            const branches = (await this.refs.branches(c, u.companyId)).filter((b) => b.status === 'aktif');
            const signed = (code, v) => ((0, domain_1.isDebitNormal)(code) ? v : -v);
            const rows = tb.rows.map((r) => {
                const values = branches.map((b) => signed(r.code, per[b.code]?.[r.code]?.ending ?? 0));
                const combined = values.reduce((x, y) => x + y, 0);
                const elimination = r.interco ? -combined : 0;
                return { code: r.code, name: r.name, category: r.category, interco: r.interco, values, elimination, consolidated: combined + elimination };
            });
            return { period, scope: s.branch, columns: branches.map((b) => ({ branch: b.code, label: b.short })), rows, totals: tb.totals, balanced: tb.balanced };
        });
    }
    async incomeStatement(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const { period, accounts, bal } = await this.base(c, u, s);
            return { period, scope: s.branch, ...(0, domain_1.incomeStatement)(accounts, bal) };
        });
    }
    async balanceSheet(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const { period, accounts, bal } = await this.base(c, u, s);
            return { period, scope: s.branch, ...(0, domain_1.balanceSheet)(accounts, bal, period.to) };
        });
    }
    /** Konsolidasi seluruh cabang aktif dengan eliminasi RK antar kantor. */
    async consolidation(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, { ...s, branch: 'ALL', rlsBranches: '*' }, requestId), async (c) => {
            const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
            const accounts = await this.refs.accounts(c, u.companyId);
            const per = await this.refs.balancesByBranch(c, u.companyId, period.from, period.to);
            const branches = (await this.refs.branches(c, u.companyId)).filter((b) => b.status === 'aktif');
            const perBranch = branches.map((b) => ({ branch: b.code, label: b.short, balances: per[b.code] ?? {} }));
            const pl = (0, domain_1.consolidate)(accounts, perBranch, (m) => (0, domain_1.incomeStatement)(accounts, m));
            const bs = (0, domain_1.consolidate)(accounts, perBranch, (m) => (0, domain_1.balanceSheet)(accounts, m, period.to));
            const combined = (0, domain_1.sumBalances)(perBranch.map((p) => p.balances));
            const kpis = branches.map((b, i) => {
                const p = pl.columns[i].report, q = bs.columns[i].report;
                const g = (rows, code) => rows.find((r) => r.code === code)?.amount ?? 0;
                return { branch: b.code, name: b.name, short: b.short, type: '', revenue: p.revenue, gross: p.gross, net: p.net, netMargin: p.netMargin, cash: g(q.assets, '1-1100'), ar: g(q.assets, '1-1200'), ap: g(q.liabilities, '2-1100'), totalAssets: q.totalAssets };
            });
            return { period, branches: branches.map((b) => ({ code: b.code, label: b.short, name: b.name })), incomeStatement: pl, balanceSheet: bs, kpis, intercompanyMismatch: (0, domain_1.intercompanyMismatch)(accounts, combined) };
        });
    }
    /** Ubin KPI dasbor dari buku besar & sub-buku. */
    async kpis(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const { period, accounts, bal } = await this.base(c, u, s);
            const pl = (0, domain_1.incomeStatement)(accounts, bal);
            const bs = (0, domain_1.balanceSheet)(accounts, bal, period.to);
            const branch = this.scopeBranch(s);
            const year = Number(period.to.slice(0, 4));
            const monthly = await this.refs.monthlyRevenue(c, u.companyId, branch, year);
            const branches = (await this.refs.branches(c, u.companyId)).filter((b) => b.status === 'aktif' && (!branch || b.code === branch));
            const months = Math.max(1, Math.round((daysBetween(period.from, period.to) + 1) / 30));
            const target = branches.reduce((t, b) => t + b.targetMonthly, 0) * months;
            const today = new Date().toISOString().slice(0, 10);
            const overdue = (await c.query(`SELECT count(*)::int AS n, coalesce(sum(total_gross - paid_amount),0)::bigint AS amount FROM invoices
          WHERE company_id = $1 AND status IN ('belum-dibayar','sebagian') AND total_gross > paid_amount AND due_date < $2 AND ($3::text IS NULL OR branch_code = $3)`, [u.companyId, today, branch])).rows[0];
            const pending = (await c.query(`SELECT count(*)::int AS n FROM journals WHERE company_id = $1 AND status = 'pending' AND ($2::text IS NULL OR branch_code = $2)`, [u.companyId, branch])).rows[0].n;
            return {
                period, scope: s.branch,
                revenue: pl.revenue, gross: pl.gross, net: pl.net, grossMargin: pl.grossMargin, netMargin: pl.netMargin, target,
                cash: bs.assets.find((a) => a.code === '1-1100')?.amount ?? 0,
                ar: bs.assets.find((a) => a.code === '1-1200')?.amount ?? 0,
                ap: bs.liabilities.find((a) => a.code === '2-1100')?.amount ?? 0,
                overdueInvoices: overdue.n, overdueAmount: overdue.amount, pendingJournals: pending,
                monthlyRevenue: Array.from({ length: 12 }, (_, i) => monthly.find((m) => m.month === i + 1)?.amount ?? 0),
                monthlyTarget: branches.reduce((t, b) => t + b.targetMonthly, 0),
                profit: bs.profit, totalAssets: bs.totalAssets,
            };
        });
    }
    /** Bagan akun beserta saldo akhir (header = Σ anak). */
    async chartOfAccounts(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const { period, accounts, bal } = await this.base(c, u, s);
            const profit = (0, domain_1.ytdProfit)(accounts, bal);
            const balanceOf = (code) => {
                const a = accounts.get(code);
                if (a.isComputed)
                    return profit;
                if (a.type === 'detail')
                    return bal[code]?.ending ?? 0;
                return accounts.children(code).reduce((t, x) => t + balanceOf(x.code), 0);
            };
            return { period, scope: s.branch, accounts: accounts.list.map((a) => ({ ...a, balance: balanceOf(a.code) })) };
        });
    }
    /** Kartu buku besar satu akun (opsional tersaring rekening bank). */
    async ledgerCard(u, s, code, bank, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
            const accounts = await this.refs.accounts(c, u.companyId);
            const acc = accounts.get(code);
            if (!acc || acc.type !== 'detail')
                throw (0, errors_js_1.notFound)(`Akun detail ${code}`);
            const branch = this.scopeBranch(s);
            const dn = (0, domain_1.isDebitNormal)(code);
            const open = (await c.query(`SELECT coalesce(sum(jl.debit),0)::bigint AS d, coalesce(sum(jl.credit),0)::bigint AS k FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
          WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.account_code = $2 AND jl.journal_date < $3
            AND ($4::text IS NULL OR jl.branch_code = $4) AND ($5::text IS NULL OR jl.bank_account_code = $5)`, [u.companyId, code, period.from, branch, bank])).rows[0];
            const opening = dn ? open.d - open.k : open.k - open.d;
            const rows = (await c.query(`SELECT jl.journal_date AS date, j.id AS journal_id, j.journal_no, j.description, j.ref, j.source_type AS source, jl.branch_code, jl.debit, jl.credit, jl.bank_account_code, jl.party
           FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
          WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.account_code = $2 AND jl.journal_date BETWEEN $3 AND $4
            AND ($5::text IS NULL OR jl.branch_code = $5) AND ($6::text IS NULL OR jl.bank_account_code = $6)
          ORDER BY jl.journal_date, j.journal_no, jl.line_no`, [u.companyId, code, period.from, period.to, branch, bank])).rows;
            let running = opening;
            const lines = rows.map((r) => { running += dn ? r.debit - r.credit : r.credit - r.debit; return { ...r, branch: String(r.branch_code).trim(), balance: running }; });
            return {
                period, scope: s.branch, account: { code: acc.code, name: acc.name, normalSide: acc.normalSide }, bank, opening, ending: running,
                debit: lines.reduce((t, l) => t + l.debit, 0), credit: lines.reduce((t, l) => t + l.credit, 0), lines,
            };
        });
    }
    async bankBalances(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
            const banks = (await this.refs.bankAccounts(c, u.companyId)).filter((b) => s.branch === 'ALL' || b.branchCode === s.branch);
            const sums = (await c.query(`SELECT jl.bank_account_code AS code, coalesce(sum(jl.debit - jl.credit),0)::bigint AS net FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
          WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.bank_account_code IS NOT NULL AND jl.journal_date <= $2 GROUP BY 1`, [u.companyId, period.to])).rows;
            const net = Object.fromEntries(sums.map((r) => [r.code, r.net]));
            return { period, scope: s.branch, accounts: banks.map((b) => ({ ...b, balance: b.currency === 'IDR' ? (net[b.code] ?? 0) : b.openingBalance })) };
        });
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, ledger_shared_js_1.LedgerRefs])
], ReportsService);
function daysBetween(a, b) {
    return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
}
//# sourceMappingURL=reports.service.js.map