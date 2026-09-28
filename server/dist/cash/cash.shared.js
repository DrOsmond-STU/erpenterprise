"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usableBank = usableBank;
exports.bankBookBalance = bankBookBalance;
exports.headOffice = headOffice;
exports.assertBranches = assertBranches;
const errors_js_1 = require("../common/errors.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
/** Rekening aktif berdenominasi IDR dengan akun buku besar detail. */
async function usableBank(c, companyId, code, label = 'Rekening') {
    const b = (await c.query('SELECT * FROM bank_accounts WHERE company_id = $1 AND code = $2', [companyId, String(code ?? '').toUpperCase()])).rows[0];
    if (!b)
        throw (0, sales_shared_js_1.invalid)('BANK_UNKNOWN', `${label} ${code} tidak dikenal.`);
    if (b.status !== 'aktif' || b.currency !== 'IDR')
        throw (0, sales_shared_js_1.invalid)('BANK_INACTIVE', `${label} ${b.code} nonaktif atau berdenominasi valas.`);
    if (!b.gl_account_code)
        throw (0, sales_shared_js_1.invalid)('BANK_NO_ACCOUNT', `${label} ${b.code} belum memiliki akun buku besar.`);
    return { ...b, branch_code: (0, sales_shared_js_1.trimBranch)(b.branch_code) };
}
/** Saldo buku rekening per tanggal (jurnal terposting/dibalik). */
async function bankBookBalance(c, companyId, bank, asOf, before = false) {
    return Number((await c.query(`SELECT coalesce(sum(jl.debit - jl.credit),0)::bigint AS v FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
      WHERE jl.company_id = $1 AND jl.bank_account_code = $2 AND j.status IN ('posted','reversed') AND jl.journal_date ${before ? '<' : '<='} $3`, [companyId, bank, asOf])).rows[0].v);
}
async function headOffice(c, companyId) {
    const r = (await c.query('SELECT code FROM branches WHERE company_id = $1 AND is_head_office ORDER BY code LIMIT 1', [companyId])).rows[0];
    if (!r)
        throw (0, sales_shared_js_1.invalid)('NO_HEAD_OFFICE', 'Kantor pusat belum ditetapkan pada data cabang.');
    return (0, sales_shared_js_1.trimBranch)(r.code);
}
/** Pengguna harus berhak atas semua cabang yang dijurnal. */
function assertBranches(u, branches) {
    const missing = branches.filter((b) => u.branches !== '*' && !u.branches.includes(b));
    if (missing.length)
        throw (0, errors_js_1.forbidden)(`Memerlukan akses ke cabang ${missing.join(', ')} untuk memposting dokumen ini.`);
}
//# sourceMappingURL=cash.shared.js.map