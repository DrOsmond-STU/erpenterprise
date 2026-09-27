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
exports.MasterDataService = void 0;
/**
 * CRUD data induk buku besar: bagan akun dan rekening kas/bank.
 *
 * Aturan (dok. 07 & 11):
 * - Akun baru selalu berada di bawah akun header yang aktif; kategori, sisi
 *   normal, dan level mewarisi induk sehingga laporan tetap tersusun benar.
 * - Akun sistem (kas, piutang, hutang, persediaan, RK antar kantor, laba
 *   berjalan, akun dihitung) tidak dapat dinonaktifkan atau dihapus.
 * - Menonaktifkan hanya bila saldo nol dan tidak ada akun anak yang aktif;
 *   menghapus hanya bila akun belum pernah dipakai jurnal dan tidak punya anak.
 * - Rekening yang sudah dipakai jurnal atau menjadi rekening utama/kas kecil
 *   cabang tidak dapat dihapus; cabang & kodenya tidak dapat diubah.
 * Setiap perubahan dicatat di jejak audit dalam transaksi yang sama.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const ledger_shared_js_1 = require("./ledger.shared.js");
const invalid = (code, msg) => new errors_js_1.DomainError(code, msg, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
let MasterDataService = class MasterDataService {
    db;
    audit;
    refs;
    constructor(db, audit, refs) {
        this.db = db;
        this.audit = audit;
        this.refs = refs;
    }
    /* ------------------------------ Bagan akun ------------------------------ */
    async account(c, companyId, code) {
        const r = (await c.query('SELECT * FROM chart_of_accounts WHERE company_id = $1 AND code = $2', [companyId, code])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)(`Akun ${code}`);
        return r;
    }
    /** Akun yang ditautkan ke fitur lain (pemetaan akun, rekening kas/bank) atau dihitung tidak boleh dinonaktifkan/dihapus. */
    async systemReason(c, companyId, a) {
        if (a.is_computed)
            return 'akun dihitung otomatis';
        if (a.is_intercompany)
            return 'akun antar kantor (dieliminasi pada konsolidasi)';
        if (a.is_cash && a.type === 'detail')
            return 'akun rekening kas/bank — kelola lewat menu Kas & Bank';
        if (a.is_cash)
            return 'header Kas/Bank';
        const links = await this.refs.links(c, companyId);
        const def = domain_1.ACCOUNT_LINK_DEFS.find((d) => links[d.key] === a.code);
        return def ? `ditautkan sebagai "${def.label}" di Pengaturan → Pemetaan akun` : null;
    }
    async usage(c, companyId, code) {
        const r = (await c.query(`SELECT count(*)::int AS lines, coalesce(sum(CASE WHEN j.status IN ('posted','reversed') THEN l.debit - l.credit ELSE 0 END),0)::bigint AS net
         FROM journal_lines l JOIN journals j ON j.id = l.journal_id WHERE l.company_id = $1 AND l.account_code = $2`, [companyId, code])).rows[0];
        const children = (await c.query(`SELECT count(*) FILTER (WHERE status = 'aktif')::int AS active, count(*)::int AS total FROM chart_of_accounts WHERE company_id = $1 AND parent_code = $2`, [companyId, code])).rows[0];
        return { lines: r.lines, net: Number(r.net), activeChildren: children.active, children: children.total };
    }
    async createAccount(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const level = (0, domain_1.levelOfCode)(b.code);
            if (!level || level === 1)
                throw invalid('ACCOUNT_CODE', `Kode ${b.code} tidak sah. Pola: 9-9000 (level 2), 9-9900 (level 3), 9-9999 (level 4), 9-9999.99 (level 5).`);
            const parentCode = (0, domain_1.parentOfCode)(b.code);
            if (b.parentCode && b.parentCode !== parentCode)
                throw invalid('ACCOUNT_PARENT_CODE', `Menurut pola kode, induk ${b.code} adalah ${parentCode}, bukan ${b.parentCode}.`);
            const tp = (0, domain_1.typeProblems)(level, b.type);
            if (tp)
                throw invalid('ACCOUNT_LEVEL', tp);
            const dup = await c.query('SELECT 1 FROM chart_of_accounts WHERE company_id = $1 AND code = $2', [u.companyId, b.code]);
            if (dup.rowCount)
                throw (0, errors_js_1.conflict)('ACCOUNT_EXISTS', `Kode akun ${b.code} sudah dipakai.`);
            const parent = (await c.query('SELECT * FROM chart_of_accounts WHERE company_id = $1 AND code = $2', [u.companyId, parentCode])).rows[0];
            if (!parent)
                throw invalid('ACCOUNT_PARENT_MISSING', `Induk ${parentCode} belum ada; buat header level ${level - 1} terlebih dahulu.`);
            if (parent.type !== 'header')
                throw invalid('ACCOUNT_PARENT_DETAIL', `Induk ${parent.code} adalah akun detail; akun baru harus berada di bawah akun header.`);
            if (parent.status !== 'aktif')
                throw invalid('ACCOUNT_PARENT_INACTIVE', `Induk ${parent.code} nonaktif.`);
            if (parent.is_cash)
                throw invalid('ACCOUNT_PARENT_CASH', `Akun di bawah ${parent.code} ${parent.name} dibuat otomatis saat menambah rekening di menu Kas & Bank.`);
            const normal = b.isContra ? (parent.normal_side === 'debit' ? 'credit' : 'debit') : parent.normal_side;
            const ins = await c.query(`INSERT INTO chart_of_accounts (company_id, code, name, type, category, parent_code, level, normal_side, is_contra)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [u.companyId, b.code, b.name, b.type, parent.category, parent.code, level, normal, Boolean(b.isContra)]);
            const row = (0, ledger_shared_js_1.mapAccount)(ins.rows[0]);
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'account.created', entityType: 'account', entityId: b.code, after: row, requestId });
            return row;
        });
    }
    async patchAccount(u, s, code, p, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const cur = await this.account(c, u.companyId, code);
            if (cur.is_cash && cur.type === 'detail' && (p.name || p.status))
                throw invalid('ACCOUNT_IS_BANK', `Akun ${code} milik rekening kas/bank; ubah nama atau status lewat menu Kas & Bank.`);
            if (p.status === 'nonaktif' && cur.status === 'aktif') {
                const why = await this.systemReason(c, u.companyId, cur);
                if (why)
                    throw (0, errors_js_1.forbidden)(`Akun ${code} tidak dapat dinonaktifkan: ${why}.`);
                const use = await this.usage(c, u.companyId, code);
                if (use.activeChildren > 0)
                    throw invalid('ACCOUNT_HAS_CHILDREN', `Akun ${code} masih memiliki ${use.activeChildren} akun anak yang aktif.`);
                if (use.net !== 0)
                    throw invalid('ACCOUNT_HAS_BALANCE', `Akun ${code} masih bersaldo; pindahkan saldonya dengan jurnal sebelum dinonaktifkan.`);
            }
            if (p.status === 'aktif' && cur.status === 'nonaktif' && cur.parent_code) {
                const parent = await this.account(c, u.companyId, cur.parent_code);
                if (parent.status !== 'aktif')
                    throw invalid('ACCOUNT_PARENT_INACTIVE', `Aktifkan dahulu akun induk ${parent.code}.`);
            }
            const upd = await c.query('UPDATE chart_of_accounts SET name = coalesce($3, name), status = coalesce($4, status) WHERE company_id = $1 AND code = $2 RETURNING *', [u.companyId, code, p.name ?? null, p.status ?? null]);
            const row = (0, ledger_shared_js_1.mapAccount)(upd.rows[0]);
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'account.updated', entityType: 'account', entityId: code, before: (0, ledger_shared_js_1.mapAccount)(cur), after: { ...row, reason: p.reason }, requestId });
            return row;
        });
    }
    async deleteAccount(u, s, code, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const cur = await this.account(c, u.companyId, code);
            const why = await this.systemReason(c, u.companyId, cur);
            if (why)
                throw (0, errors_js_1.forbidden)(`Akun ${code} tidak dapat dihapus: ${why}.`);
            const use = await this.usage(c, u.companyId, code);
            if (use.children > 0)
                throw invalid('ACCOUNT_HAS_CHILDREN', `Akun ${code} memiliki akun anak; hapus atau pindahkan anaknya dahulu.`);
            if (use.lines > 0)
                throw invalid('ACCOUNT_IN_USE', `Akun ${code} sudah dipakai ${use.lines} baris jurnal; nonaktifkan saja.`);
            await c.query('DELETE FROM chart_of_accounts WHERE company_id = $1 AND code = $2', [u.companyId, code]);
            await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'account.deleted', entityType: 'account', entityId: code, before: (0, ledger_shared_js_1.mapAccount)(cur), after: { reason }, requestId });
            return { code, deleted: true };
        });
    }
    /* --------------------------- Rekening kas/bank -------------------------- */
    mapBank = (b) => ({ code: b.code, name: b.name, bankName: b.bank_name, branchCode: String(b.branch_code).trim(), currency: b.currency, status: b.status, accountNoMasked: b.account_no_masked, glAccountCode: b.gl_account_code });
    async bank(c, companyId, code) {
        const r = (await c.query('SELECT * FROM bank_accounts WHERE company_id = $1 AND code = $2', [companyId, code])).rows[0];
        if (!r)
            throw (0, errors_js_1.notFound)(`Rekening ${code}`);
        return r;
    }
    assertBranchAccess(u, s, branch) {
        if (u.branches !== '*' && !u.branches.includes(branch))
            throw (0, errors_js_1.forbidden)(`Anda tidak memiliki akses ke cabang ${branch}.`);
        if (s.branch !== 'ALL' && s.branch !== branch)
            throw (0, errors_js_1.forbidden)(`Rekening cabang ${branch} tidak dapat dikelola dari konteks cabang ${s.branch}.`);
    }
    async createBank(u, s, b, requestId) {
        this.assertBranchAccess(u, s, b.branch);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const br = (await c.query('SELECT status FROM branches WHERE company_id = $1 AND code = $2', [u.companyId, b.branch])).rows[0];
            if (!br)
                throw (0, errors_js_1.notFound)(`Cabang ${b.branch}`);
            if (br.status !== 'aktif')
                throw invalid('BRANCH_INACTIVE', `Cabang ${b.branch} nonaktif.`);
            const dup = await c.query('SELECT 1 FROM bank_accounts WHERE company_id = $1 AND code = $2', [u.companyId, b.code]);
            if (dup.rowCount)
                throw (0, errors_js_1.conflict)('BANK_EXISTS', `Kode rekening ${b.code} sudah dipakai.`);
            const ins = await c.query(`INSERT INTO bank_accounts (company_id, branch_code, code, name, bank_name, account_no_masked, currency, opening_balance, opening_date)
         VALUES ($1,$2,$3,$4,$5,$6,'IDR',0,current_date) RETURNING *`, [u.companyId, b.branch, b.code, b.name, b.bankName, b.accountNoLast4 ? `••••${b.accountNoLast4}` : '—']);
            const row = this.mapBank(ins.rows[0]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: b.branch, userId: u.id, sessionId: u.sessionId, action: 'bank_account.created', entityType: 'bank_account', entityId: b.code, after: row, requestId });
            return row;
        });
    }
    async patchBank(u, s, code, p, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const cur = await this.bank(c, u.companyId, code);
            this.assertBranchAccess(u, s, String(cur.branch_code).trim());
            if (p.status === 'nonaktif' && cur.status === 'aktif') {
                const main = await c.query('SELECT 1 FROM branches WHERE company_id = $1 AND (main_bank_account_code = $2 OR petty_cash_account_code = $2) AND status = $3', [u.companyId, code, 'aktif']);
                if (main.rowCount)
                    throw invalid('BANK_IS_BRANCH_MAIN', `Rekening ${code} adalah rekening utama/kas kecil cabang aktif.`);
                const bal = (await c.query(`SELECT coalesce(sum(l.debit - l.credit),0)::bigint AS n FROM journal_lines l JOIN journals j ON j.id = l.journal_id WHERE l.company_id = $1 AND l.bank_account_code = $2 AND j.status IN ('posted','reversed')`, [u.companyId, code])).rows[0].n;
                if (Number(bal) !== 0)
                    throw invalid('BANK_HAS_BALANCE', `Rekening ${code} masih bersaldo; kosongkan dengan jurnal pemindahan sebelum dinonaktifkan.`);
            }
            if (p.bankName && (0, domain_1.bankParentOf)(p.bankName) !== (0, domain_1.bankParentOf)(cur.bank_name))
                throw invalid('BANK_KIND', 'Rekening kas tidak dapat diubah menjadi rekening bank (atau sebaliknya) karena akun buku besarnya berada di header berbeda; buat rekening baru.');
            const masked = p.accountNoLast4 === undefined ? null : p.accountNoLast4 ? `••••${p.accountNoLast4}` : '—';
            const upd = await c.query('UPDATE bank_accounts SET name = coalesce($3, name), bank_name = coalesce($4, bank_name), account_no_masked = coalesce($5, account_no_masked), status = coalesce($6, status) WHERE company_id = $1 AND code = $2 RETURNING *', [u.companyId, code, p.name ?? null, p.bankName ?? null, masked, p.status ?? null]);
            const row = this.mapBank(upd.rows[0]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: row.branchCode, userId: u.id, sessionId: u.sessionId, action: 'bank_account.updated', entityType: 'bank_account', entityId: code, before: this.mapBank(cur), after: { ...row, reason: p.reason }, requestId });
            return row;
        });
    }
    async deleteBank(u, s, code, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const cur = await this.bank(c, u.companyId, code);
            this.assertBranchAccess(u, s, String(cur.branch_code).trim());
            const main = await c.query('SELECT 1 FROM branches WHERE company_id = $1 AND (main_bank_account_code = $2 OR petty_cash_account_code = $2)', [u.companyId, code]);
            if (main.rowCount)
                throw invalid('BANK_IS_BRANCH_MAIN', `Rekening ${code} adalah rekening utama/kas kecil cabang dan tidak dapat dihapus.`);
            const used = (await c.query('SELECT count(*)::int AS n FROM journal_lines WHERE company_id = $1 AND bank_account_code = $2', [u.companyId, code])).rows[0].n;
            if (used > 0)
                throw invalid('BANK_IN_USE', `Rekening ${code} sudah dipakai ${used} baris jurnal; nonaktifkan saja.`);
            await c.query('DELETE FROM bank_accounts WHERE company_id = $1 AND code = $2', [u.companyId, code]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: String(cur.branch_code).trim(), userId: u.id, sessionId: u.sessionId, action: 'bank_account.deleted', entityType: 'bank_account', entityId: code, before: this.mapBank(cur), after: { reason }, requestId });
            return { code, deleted: true };
        });
    }
};
exports.MasterDataService = MasterDataService;
exports.MasterDataService = MasterDataService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, ledger_shared_js_1.LedgerRefs])
], MasterDataService);
//# sourceMappingURL=master.service.js.map