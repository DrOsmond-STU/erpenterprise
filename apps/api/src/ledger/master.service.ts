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
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AP_ACCOUNT, AR_ACCOUNT, CASH_ACCOUNT, CURRENT_EARNINGS, INVENTORY_ACCOUNTS, RK_CABANG, RK_PUSAT } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, DomainError, forbidden, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { mapAccount } from './ledger.shared.js';

const SYSTEM_ACCOUNTS = new Set([RK_CABANG, RK_PUSAT, CASH_ACCOUNT, AR_ACCOUNT, AP_ACCOUNT, CURRENT_EARNINGS, ...INVENTORY_ACCOUNTS]);

export interface AccountCreate { code: string; name: string; type: 'header' | 'detail'; parentCode: string; isContra?: boolean }
export interface AccountPatch { name?: string; status?: 'aktif' | 'nonaktif'; reason: string }
export interface BankCreate { code: string; branch: string; name: string; bankName: string; accountNoLast4?: string }
export interface BankPatch { name?: string; bankName?: string; accountNoLast4?: string; status?: 'aktif' | 'nonaktif'; reason: string }

const invalid = (code: string, msg: string) => new DomainError(code, msg, HttpStatus.UNPROCESSABLE_ENTITY);

@Injectable()
export class MasterDataService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  /* ------------------------------ Bagan akun ------------------------------ */

  private async account(c: PoolClient, companyId: string, code: string) {
    const r = (await c.query('SELECT * FROM chart_of_accounts WHERE company_id = $1 AND code = $2', [companyId, code])).rows[0];
    if (!r) throw notFound(`Akun ${code}`);
    return r;
  }
  private isSystem(a: any) { return SYSTEM_ACCOUNTS.has(a.code) || a.is_computed || a.is_intercompany || a.is_cash; }
  private async usage(c: PoolClient, companyId: string, code: string) {
    const r = (await c.query(
      `SELECT count(*)::int AS lines, coalesce(sum(CASE WHEN j.status IN ('posted','reversed') THEN l.debit - l.credit ELSE 0 END),0)::bigint AS net
         FROM journal_lines l JOIN journals j ON j.id = l.journal_id WHERE l.company_id = $1 AND l.account_code = $2`, [companyId, code])).rows[0];
    const children = (await c.query(`SELECT count(*) FILTER (WHERE status = 'aktif')::int AS active, count(*)::int AS total FROM chart_of_accounts WHERE company_id = $1 AND parent_code = $2`, [companyId, code])).rows[0];
    return { lines: r.lines as number, net: Number(r.net), activeChildren: children.active as number, children: children.total as number };
  }

  async createAccount(u: RequestUser, s: ScopeContext, b: AccountCreate, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const dup = await c.query('SELECT 1 FROM chart_of_accounts WHERE company_id = $1 AND code = $2', [u.companyId, b.code]);
      if (dup.rowCount) throw conflict('ACCOUNT_EXISTS', `Kode akun ${b.code} sudah dipakai.`);
      const parent = await this.account(c, u.companyId, b.parentCode);
      if (parent.type !== 'header') throw invalid('ACCOUNT_PARENT_DETAIL', `Induk ${parent.code} adalah akun detail; akun baru harus berada di bawah akun header.`);
      if (parent.status !== 'aktif') throw invalid('ACCOUNT_PARENT_INACTIVE', `Induk ${parent.code} nonaktif.`);
      if (parent.is_computed) throw invalid('ACCOUNT_PARENT_COMPUTED', `Induk ${parent.code} adalah akun dihitung.`);
      if (b.code[0] !== parent.code[0]) throw invalid('ACCOUNT_CODE_CATEGORY', `Kode ${b.code} harus diawali ${parent.code[0]} agar sekelompok dengan induk ${parent.code} (${parent.category}).`);
      const normal = b.isContra ? (parent.normal_side === 'debit' ? 'credit' : 'debit') : parent.normal_side;
      const ins = await c.query(
        `INSERT INTO chart_of_accounts (company_id, code, name, type, category, parent_code, level, normal_side, is_contra)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [u.companyId, b.code, b.name, b.type, parent.category, parent.code, parent.level + 1, normal, Boolean(b.isContra)]);
      const row = mapAccount(ins.rows[0]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'account.created', entityType: 'account', entityId: b.code, after: row, requestId });
      return row;
    });
  }

  async patchAccount(u: RequestUser, s: ScopeContext, code: string, p: AccountPatch, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const cur = await this.account(c, u.companyId, code);
      if (p.status === 'nonaktif' && cur.status === 'aktif') {
        if (this.isSystem(cur)) throw forbidden(`Akun ${code} adalah akun sistem dan tidak dapat dinonaktifkan.`);
        const use = await this.usage(c, u.companyId, code);
        if (use.activeChildren > 0) throw invalid('ACCOUNT_HAS_CHILDREN', `Akun ${code} masih memiliki ${use.activeChildren} akun anak yang aktif.`);
        if (use.net !== 0) throw invalid('ACCOUNT_HAS_BALANCE', `Akun ${code} masih bersaldo; pindahkan saldonya dengan jurnal sebelum dinonaktifkan.`);
      }
      if (p.status === 'aktif' && cur.status === 'nonaktif' && cur.parent_code) {
        const parent = await this.account(c, u.companyId, cur.parent_code);
        if (parent.status !== 'aktif') throw invalid('ACCOUNT_PARENT_INACTIVE', `Aktifkan dahulu akun induk ${parent.code}.`);
      }
      const upd = await c.query('UPDATE chart_of_accounts SET name = coalesce($3, name), status = coalesce($4, status) WHERE company_id = $1 AND code = $2 RETURNING *',
        [u.companyId, code, p.name ?? null, p.status ?? null]);
      const row = mapAccount(upd.rows[0]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'account.updated', entityType: 'account', entityId: code, before: mapAccount(cur), after: { ...row, reason: p.reason }, requestId });
      return row;
    });
  }

  async deleteAccount(u: RequestUser, s: ScopeContext, code: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const cur = await this.account(c, u.companyId, code);
      if (this.isSystem(cur)) throw forbidden(`Akun ${code} adalah akun sistem dan tidak dapat dihapus.`);
      const use = await this.usage(c, u.companyId, code);
      if (use.children > 0) throw invalid('ACCOUNT_HAS_CHILDREN', `Akun ${code} memiliki akun anak; hapus atau pindahkan anaknya dahulu.`);
      if (use.lines > 0) throw invalid('ACCOUNT_IN_USE', `Akun ${code} sudah dipakai ${use.lines} baris jurnal; nonaktifkan saja.`);
      await c.query('DELETE FROM chart_of_accounts WHERE company_id = $1 AND code = $2', [u.companyId, code]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'account.deleted', entityType: 'account', entityId: code, before: mapAccount(cur), after: { reason }, requestId });
      return { code, deleted: true };
    });
  }

  /* --------------------------- Rekening kas/bank -------------------------- */

  private mapBank = (b: any) => ({ code: b.code, name: b.name, bankName: b.bank_name, branchCode: String(b.branch_code).trim(), currency: b.currency, status: b.status, accountNoMasked: b.account_no_masked });

  private async bank(c: PoolClient, companyId: string, code: string) {
    const r = (await c.query('SELECT * FROM bank_accounts WHERE company_id = $1 AND code = $2', [companyId, code])).rows[0];
    if (!r) throw notFound(`Rekening ${code}`);
    return r;
  }
  private assertBranchAccess(u: RequestUser, s: ScopeContext, branch: string) {
    if (u.branches !== '*' && !u.branches.includes(branch)) throw forbidden(`Anda tidak memiliki akses ke cabang ${branch}.`);
    if (s.branch !== 'ALL' && s.branch !== branch) throw forbidden(`Rekening cabang ${branch} tidak dapat dikelola dari konteks cabang ${s.branch}.`);
  }

  async createBank(u: RequestUser, s: ScopeContext, b: BankCreate, requestId: string) {
    this.assertBranchAccess(u, s, b.branch);
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const br = (await c.query('SELECT status FROM branches WHERE company_id = $1 AND code = $2', [u.companyId, b.branch])).rows[0];
      if (!br) throw notFound(`Cabang ${b.branch}`);
      if (br.status !== 'aktif') throw invalid('BRANCH_INACTIVE', `Cabang ${b.branch} nonaktif.`);
      const dup = await c.query('SELECT 1 FROM bank_accounts WHERE company_id = $1 AND code = $2', [u.companyId, b.code]);
      if (dup.rowCount) throw conflict('BANK_EXISTS', `Kode rekening ${b.code} sudah dipakai.`);
      const ins = await c.query(
        `INSERT INTO bank_accounts (company_id, branch_code, code, name, bank_name, account_no_masked, currency, opening_balance, opening_date)
         VALUES ($1,$2,$3,$4,$5,$6,'IDR',0,current_date) RETURNING *`,
        [u.companyId, b.branch, b.code, b.name, b.bankName, b.accountNoLast4 ? `••••${b.accountNoLast4}` : '—']);
      const row = this.mapBank(ins.rows[0]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: b.branch, userId: u.id, sessionId: u.sessionId, action: 'bank_account.created', entityType: 'bank_account', entityId: b.code, after: row, requestId });
      return row;
    });
  }

  async patchBank(u: RequestUser, s: ScopeContext, code: string, p: BankPatch, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const cur = await this.bank(c, u.companyId, code);
      this.assertBranchAccess(u, s, String(cur.branch_code).trim());
      if (p.status === 'nonaktif' && cur.status === 'aktif') {
        const main = await c.query('SELECT 1 FROM branches WHERE company_id = $1 AND (main_bank_account_code = $2 OR petty_cash_account_code = $2) AND status = $3', [u.companyId, code, 'aktif']);
        if (main.rowCount) throw invalid('BANK_IS_BRANCH_MAIN', `Rekening ${code} adalah rekening utama/kas kecil cabang aktif.`);
        const bal = (await c.query(`SELECT coalesce(sum(l.debit - l.credit),0)::bigint AS n FROM journal_lines l JOIN journals j ON j.id = l.journal_id WHERE l.company_id = $1 AND l.bank_account_code = $2 AND j.status IN ('posted','reversed')`, [u.companyId, code])).rows[0].n;
        if (Number(bal) !== 0) throw invalid('BANK_HAS_BALANCE', `Rekening ${code} masih bersaldo; kosongkan dengan jurnal pemindahan sebelum dinonaktifkan.`);
      }
      const masked = p.accountNoLast4 === undefined ? null : p.accountNoLast4 ? `••••${p.accountNoLast4}` : '—';
      const upd = await c.query(
        'UPDATE bank_accounts SET name = coalesce($3, name), bank_name = coalesce($4, bank_name), account_no_masked = coalesce($5, account_no_masked), status = coalesce($6, status) WHERE company_id = $1 AND code = $2 RETURNING *',
        [u.companyId, code, p.name ?? null, p.bankName ?? null, masked, p.status ?? null]);
      const row = this.mapBank(upd.rows[0]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: row.branchCode, userId: u.id, sessionId: u.sessionId, action: 'bank_account.updated', entityType: 'bank_account', entityId: code, before: this.mapBank(cur), after: { ...row, reason: p.reason }, requestId });
      return row;
    });
  }

  async deleteBank(u: RequestUser, s: ScopeContext, code: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const cur = await this.bank(c, u.companyId, code);
      this.assertBranchAccess(u, s, String(cur.branch_code).trim());
      const main = await c.query('SELECT 1 FROM branches WHERE company_id = $1 AND (main_bank_account_code = $2 OR petty_cash_account_code = $2)', [u.companyId, code]);
      if (main.rowCount) throw invalid('BANK_IS_BRANCH_MAIN', `Rekening ${code} adalah rekening utama/kas kecil cabang dan tidak dapat dihapus.`);
      const used = (await c.query('SELECT count(*)::int AS n FROM journal_lines WHERE company_id = $1 AND bank_account_code = $2', [u.companyId, code])).rows[0].n;
      if (used > 0) throw invalid('BANK_IN_USE', `Rekening ${code} sudah dipakai ${used} baris jurnal; nonaktifkan saja.`);
      await c.query('DELETE FROM bank_accounts WHERE company_id = $1 AND code = $2', [u.companyId, code]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: String(cur.branch_code).trim(), userId: u.id, sessionId: u.sessionId, action: 'bank_account.deleted', entityType: 'bank_account', entityId: code, before: this.mapBank(cur), after: { reason }, requestId });
      return { code, deleted: true };
    });
  }
}
