"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerRefs = exports.mapPeriod = exports.mapAccount = void 0;
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const errors_js_1 = require("../common/errors.js");
const mapAccount = (a) => ({
    code: a.code, name: a.name, type: a.type, category: a.category, parentCode: a.parent_code, level: a.level, normalSide: a.normal_side,
    isIntercompany: a.is_intercompany, isContra: a.is_contra, isCash: a.is_cash, isComputed: a.is_computed, status: a.status,
});
exports.mapAccount = mapAccount;
const mapPeriod = (p) => ({ id: p.code, label: p.label, from: p.date_from, to: p.date_to, status: p.status, group: p.period_group });
exports.mapPeriod = mapPeriod;
/** Pemuat referensi yang dipakai lintas modul buku besar (bagan akun, periode, rekening, cabang). */
let LedgerRefs = class LedgerRefs {
    async accounts(c, companyId) {
        const { rows } = await c.query('SELECT * FROM chart_of_accounts WHERE company_id = $1 ORDER BY code', [companyId]);
        return new domain_1.AccountIndex(rows.map(exports.mapAccount));
    }
    async periods(c, companyId) {
        const { rows } = await c.query('SELECT * FROM fiscal_periods WHERE company_id = $1 ORDER BY date_from, date_to', [companyId]);
        return rows.map(exports.mapPeriod);
    }
    /** Periode dari header; bila kosong, bulan yang memuat hari ini atau bulan terakhir yang terdaftar. */
    async resolvePeriod(c, companyId, code) {
        const all = await this.periods(c, companyId);
        if (code) {
            const p = all.find((x) => x.id === code);
            if (!p)
                throw (0, errors_js_1.notFound)(`Periode ${code}`);
            return p;
        }
        const today = new Date().toISOString().slice(0, 10);
        const months = all.filter((p) => p.group === 'Bulan');
        return months.find((p) => today >= p.from && today <= p.to) ?? months[months.length - 1] ?? all[all.length - 1];
    }
    async periodForDate(c, companyId, date) {
        const all = await this.periods(c, companyId);
        return all.find((p) => p.group === 'Bulan' && date >= p.from && date <= p.to);
    }
    async bankAccounts(c, companyId) {
        const { rows } = await c.query('SELECT * FROM bank_accounts WHERE company_id = $1 ORDER BY branch_code, code', [companyId]);
        return rows.map((b) => ({ id: b.code, code: b.code, name: b.name, bankName: b.bank_name, branchCode: String(b.branch_code).trim(), branch: String(b.branch_code).trim(), currency: b.currency, openingBalance: b.opening_balance, status: b.status, accountNoMasked: b.account_no_masked }));
    }
    async branches(c, companyId) {
        const { rows } = await c.query('SELECT code, name, short_name, status, is_head_office, target_monthly FROM branches WHERE company_id = $1 ORDER BY is_head_office DESC, code', [companyId]);
        return rows.map((b) => ({ code: String(b.code).trim(), name: b.name, short: b.short_name, status: b.status, isHeadOffice: b.is_head_office, targetMonthly: b.target_monthly }));
    }
    /** Saldo per akun untuk cakupan cabang (null = semua yang diizinkan RLS) dan rentang periode. */
    async balances(c, companyId, branch, from, to) {
        const { rows } = await c.query(`SELECT jl.account_code AS code,
              sum(CASE WHEN jl.journal_date < $3 THEN jl.debit ELSE 0 END)::bigint AS opening_debit,
              sum(CASE WHEN jl.journal_date < $3 THEN jl.credit ELSE 0 END)::bigint AS opening_credit,
              sum(CASE WHEN jl.journal_date >= $3 THEN jl.debit ELSE 0 END)::bigint AS debit,
              sum(CASE WHEN jl.journal_date >= $3 THEN jl.credit ELSE 0 END)::bigint AS credit
         FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
        WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.journal_date <= $4
          AND ($2::text IS NULL OR jl.branch_code = $2)
        GROUP BY jl.account_code`, [companyId, branch, from, to]);
        return (0, domain_1.balancesFromAggregates)(rows.map((r) => ({ code: r.code, openingDebit: r.opening_debit, openingCredit: r.opening_credit, debit: r.debit, credit: r.credit })));
    }
    /** Saldo per cabang sekaligus (untuk konsolidasi). */
    async balancesByBranch(c, companyId, from, to) {
        const { rows } = await c.query(`SELECT jl.branch_code, jl.account_code AS code,
              sum(CASE WHEN jl.journal_date < $2 THEN jl.debit ELSE 0 END)::bigint AS opening_debit,
              sum(CASE WHEN jl.journal_date < $2 THEN jl.credit ELSE 0 END)::bigint AS opening_credit,
              sum(CASE WHEN jl.journal_date >= $2 THEN jl.debit ELSE 0 END)::bigint AS debit,
              sum(CASE WHEN jl.journal_date >= $2 THEN jl.credit ELSE 0 END)::bigint AS credit
         FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
        WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.journal_date <= $3
        GROUP BY jl.branch_code, jl.account_code`, [companyId, from, to]);
        const by = {};
        for (const r of rows)
            (by[String(r.branch_code).trim()] ||= []).push({ code: r.code, openingDebit: r.opening_debit, openingCredit: r.opening_credit, debit: r.debit, credit: r.credit });
        const out = {};
        for (const [b, list] of Object.entries(by))
            out[b] = (0, domain_1.balancesFromAggregates)(list);
        return out;
    }
    /** Pendapatan bulanan (akun 4-xxxx) untuk grafik tren. */
    async monthlyRevenue(c, companyId, branch, year) {
        const { rows } = await c.query(`SELECT extract(month FROM jl.journal_date)::int AS month, sum(jl.credit - jl.debit)::bigint AS amount
         FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
        WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.account_code LIKE '4-%'
          AND extract(year FROM jl.journal_date) = $3 AND ($2::text IS NULL OR jl.branch_code = $2)
        GROUP BY 1 ORDER BY 1`, [companyId, branch, year]);
        return rows.map((r) => ({ month: r.month, amount: r.amount }));
    }
};
exports.LedgerRefs = LedgerRefs;
exports.LedgerRefs = LedgerRefs = __decorate([
    (0, common_1.Injectable)()
], LedgerRefs);
//# sourceMappingURL=ledger.shared.js.map