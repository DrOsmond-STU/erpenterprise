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
import { ACCOUNT_LINK_DEFS, bankParentOf, levelOfCode, parentOfCode, typeProblems } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, DomainError, forbidden, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs, mapAccount } from './ledger.shared.js';


export interface AccountCreate { code: string; name: string; type: 'header' | 'detail'; parentCode?: string; isContra?: boolean }
export interface AccountPatch { code?: string; name?: string; status?: 'aktif' | 'nonaktif'; type?: 'header' | 'detail'; isContra?: boolean; reason: string }
export interface BankCreate { code: string; branch: string; name: string; bankName: string; accountNoLast4?: string }
export interface BankPatch { name?: string; bankName?: string; accountNoLast4?: string; status?: 'aktif' | 'nonaktif'; reason: string }

const invalid = (code: string, msg: string) => new DomainError(code, msg, HttpStatus.UNPROCESSABLE_ENTITY);

@Injectable()
export class MasterDataService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly refs: LedgerRefs) {}

  /* ------------------------------ Bagan akun ------------------------------ */

  private async account(c: PoolClient, companyId: string, code: string) {
    const r = (await c.query('SELECT * FROM chart_of_accounts WHERE company_id = $1 AND code = $2', [companyId, code])).rows[0];
    if (!r) throw notFound(`Akun ${code}`);
    return r;
  }
  /** Akun yang ditautkan ke fitur lain (pemetaan akun, rekening kas/bank) atau dihitung tidak boleh dinonaktifkan/dihapus. */
  private async systemReason(c: PoolClient, companyId: string, a: any): Promise<string | null> {
    if (a.is_computed) return 'akun dihitung otomatis';
    if (a.is_intercompany) return 'akun antar kantor (dieliminasi pada konsolidasi)';
    if (a.is_cash && a.type === 'detail') return 'akun rekening kas/bank — kelola lewat menu Kas & Bank';
    if (a.is_cash) return 'header Kas/Bank';
    const links = await this.refs.links(c, companyId);
    const def = ACCOUNT_LINK_DEFS.find((d) => links[d.key as keyof typeof links] === a.code);
    return def ? `ditautkan sebagai "${def.label}" di Pengaturan → Pemetaan akun` : null;
  }
  /** Pemakaian akun lintas cabang: baris jurnal, akun anak, dan tautan dokumen/fitur lain. */
  private async usage(c: PoolClient, companyId: string, code: string) {
    const r = (await c.query(
      `SELECT count(*)::int AS lines, coalesce(sum(CASE WHEN j.status IN ('posted','reversed') THEN l.debit - l.credit ELSE 0 END),0)::bigint AS net
         FROM journal_lines l JOIN journals j ON j.id = l.journal_id WHERE l.company_id = $1 AND l.account_code = $2`, [companyId, code])).rows[0];
    const children = (await c.query(`SELECT count(*) FILTER (WHERE status = 'aktif')::int AS active, count(*)::int AS total FROM chart_of_accounts WHERE company_id = $1 AND parent_code = $2`, [companyId, code])).rows[0];
    const refs = (await c.query(
      `SELECT (SELECT count(*) FROM bank_accounts WHERE company_id = $1 AND gl_account_code = $2)::int AS banks,
              (SELECT count(*) FROM ap_invoices WHERE company_id = $1 AND expense_account_code = $2)::int AS ap,
              (SELECT count(*) FROM assets WHERE company_id = $1 AND gl_account_code = $2)::int AS assets`, [companyId, code])).rows[0];
    const linked: string[] = [];
    if (refs.banks) linked.push('rekening kas/bank');
    if (refs.ap) linked.push(`${refs.ap} tagihan pemasok`);
    if (refs.assets) linked.push(`${refs.assets} aset tetap`);
    return { lines: r.lines as number, net: Number(r.net), activeChildren: children.active as number, children: children.total as number, linked };
  }

  /* Operasi data induk bersifat lintas cabang: pemeriksaan pemakaian tidak boleh terpotong RLS. */
  private ctx(u: RequestUser, s: ScopeContext, requestId: string) { return { ...contextOf(u, s, requestId), branches: '*' as const }; }

  async createAccount(u: RequestUser, s: ScopeContext, b: AccountCreate, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const level = levelOfCode(b.code);
      if (!level || level === 1) throw invalid('ACCOUNT_CODE', `Kode ${b.code} tidak sah. Pola: 9-9000 (level 2), 9-9900 (level 3), 9-9999 (level 4), 9-9999.99 (level 5).`);
      const parentCode = parentOfCode(b.code)!;
      if (b.parentCode && b.parentCode !== parentCode) throw invalid('ACCOUNT_PARENT_CODE', `Menurut pola kode, induk ${b.code} adalah ${parentCode}, bukan ${b.parentCode}.`);
      const tp = typeProblems(level, b.type);
      if (tp) throw invalid('ACCOUNT_LEVEL', tp);
      const dup = await c.query('SELECT 1 FROM chart_of_accounts WHERE company_id = $1 AND code = $2', [u.companyId, b.code]);
      if (dup.rowCount) throw conflict('ACCOUNT_EXISTS', `Kode akun ${b.code} sudah dipakai.`);
      const parent = (await c.query('SELECT * FROM chart_of_accounts WHERE company_id = $1 AND code = $2', [u.companyId, parentCode])).rows[0];
      if (!parent) throw invalid('ACCOUNT_PARENT_MISSING', `Induk ${parentCode} belum ada; buat header level ${level - 1} terlebih dahulu.`);
      if (parent.type !== 'header') throw invalid('ACCOUNT_PARENT_DETAIL', `Induk ${parent.code} adalah akun detail; akun baru harus berada di bawah akun header.`);
      if (parent.status !== 'aktif') throw invalid('ACCOUNT_PARENT_INACTIVE', `Induk ${parent.code} nonaktif.`);
      if (parent.is_cash) throw invalid('ACCOUNT_PARENT_CASH', `Akun di bawah ${parent.code} ${parent.name} dibuat otomatis saat menambah rekening di menu Kas & Bank.`);
      const normal = b.isContra ? (parent.normal_side === 'debit' ? 'credit' : 'debit') : parent.normal_side;
      const ins = await c.query(
        `INSERT INTO chart_of_accounts (company_id, code, name, type, category, parent_code, level, normal_side, is_contra)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [u.companyId, b.code, b.name, b.type, parent.category, parent.code, level, normal, Boolean(b.isContra)]);
      const row = mapAccount(ins.rows[0]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'account.created', entityType: 'account', entityId: b.code, after: row, requestId });
      return row;
    });
  }

  /**
   * Nomor akun tidak dapat diubah (acuan seluruh riwayat jurnal). Yang dapat diubah:
   * nama, status, sifat kontra (bila belum bertransaksi), dan tipe header/detail
   * khusus level 4 (bila tidak ada anak, transaksi, maupun tautan).
   */
  async patchAccount(u: RequestUser, s: ScopeContext, code: string, p: AccountPatch, requestId: string) {
    return this.db.run(this.ctx(u, s, requestId), async (c) => {
      const cur = await this.account(c, u.companyId, code);
      if (p.code !== undefined && p.code !== code) throw invalid('ACCOUNT_CODE_IMMUTABLE', `Nomor akun ${code} tidak dapat diubah; yang dapat diubah hanya nama, status, tipe (level 4), dan sifat kontra.`);
      if (cur.is_cash && cur.type === 'detail' && (p.name || p.status)) throw invalid('ACCOUNT_IS_BANK', `Akun ${code} milik rekening kas/bank; ubah nama atau status lewat menu Kas & Bank.`);
      const use = await this.usage(c, u.companyId, code);
      if (p.status === 'nonaktif' && cur.status === 'aktif') {
        const why = await this.systemReason(c, u.companyId, cur);
        if (why) throw forbidden(`Akun ${code} tidak dapat dinonaktifkan: ${why}.`);
        if (use.activeChildren > 0) throw invalid('ACCOUNT_HAS_CHILDREN', `Akun ${code} masih memiliki ${use.activeChildren} akun anak yang aktif.`);
        if (use.net !== 0) throw invalid('ACCOUNT_HAS_BALANCE', `Akun ${code} masih bersaldo; pindahkan saldonya dengan jurnal sebelum dinonaktifkan.`);
      }
      if (p.status === 'aktif' && cur.status === 'nonaktif' && cur.parent_code) {
        const parent = await this.account(c, u.companyId, cur.parent_code);
        if (parent.status !== 'aktif') throw invalid('ACCOUNT_PARENT_INACTIVE', `Aktifkan dahulu akun induk ${parent.code}.`);
      }
      if (p.type && p.type !== cur.type) {
        const tp = typeProblems(cur.level, p.type);
        if (tp) throw invalid('ACCOUNT_LEVEL', tp);
        if (cur.is_cash || cur.is_computed || cur.is_intercompany) throw forbidden(`Tipe akun ${code} tidak dapat diubah (akun sistem).`);
        if (p.type === 'detail' && use.children > 0) throw invalid('ACCOUNT_HAS_CHILDREN', `Header ${code} masih memiliki ${use.children} akun di bawahnya; tidak dapat diubah menjadi detail.`);
        if (p.type === 'header') {
          const why = await this.systemReason(c, u.companyId, cur);
          if (why) throw forbidden(`Akun ${code} tidak dapat diubah menjadi header: ${why}.`);
          if (use.lines > 0) throw invalid('ACCOUNT_IN_USE', `Akun ${code} sudah dipakai ${use.lines} baris jurnal; header tidak boleh bertransaksi.`);
          if (use.linked.length) throw invalid('ACCOUNT_LINKED', `Akun ${code} masih terkait ${use.linked.join(', ')}.`);
        }
      }
      if (p.isContra !== undefined && p.isContra !== cur.is_contra && use.lines > 0) throw invalid('ACCOUNT_IN_USE', `Sifat kontra akun ${code} tidak dapat diubah karena sudah dipakai ${use.lines} baris jurnal.`);
      const parent = cur.parent_code ? await this.account(c, u.companyId, cur.parent_code) : null;
      const normal = p.isContra === undefined || !parent ? cur.normal_side : p.isContra ? (parent.normal_side === 'debit' ? 'credit' : 'debit') : parent.normal_side;
      const upd = await c.query(
        `UPDATE chart_of_accounts SET name = coalesce($3, name), status = coalesce($4, status), type = coalesce($5, type), is_contra = coalesce($6, is_contra), normal_side = $7
          WHERE company_id = $1 AND code = $2 RETURNING *`,
        [u.companyId, code, p.name ?? null, p.status ?? null, p.type ?? null, p.isContra ?? null, normal]);
      const row = mapAccount(upd.rows[0]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'account.updated', entityType: 'account', entityId: code, before: mapAccount(cur), after: { ...row, reason: p.reason }, requestId });
      return row;
    });
  }

  /** Header: hanya bila tidak punya akun di bawahnya. Detail: hanya bila belum bertransaksi dan tidak terkait fitur lain. */
  async deleteAccount(u: RequestUser, s: ScopeContext, code: string, reason: string, requestId: string) {
    return this.db.run(this.ctx(u, s, requestId), async (c) => {
      const cur = await this.account(c, u.companyId, code);
      const use = await this.usage(c, u.companyId, code);
      if (use.children > 0) throw invalid('ACCOUNT_HAS_CHILDREN', `Header ${code} masih memiliki ${use.children} akun di bawahnya; hapus akun-akun tersebut terlebih dahulu.`);
      const why = await this.systemReason(c, u.companyId, cur);
      if (why) throw forbidden(`Akun ${code} tidak dapat dihapus: ${why}.`);
      if (use.lines > 0) throw invalid('ACCOUNT_IN_USE', `Akun ${code} sudah dipakai ${use.lines} baris jurnal; nonaktifkan saja.`);
      if (use.linked.length) throw invalid('ACCOUNT_LINKED', `Akun ${code} terkait ${use.linked.join(', ')}; lepaskan tautannya atau nonaktifkan saja.`);
      await c.query('DELETE FROM chart_of_accounts WHERE company_id = $1 AND code = $2', [u.companyId, code]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'account.deleted', entityType: 'account', entityId: code, before: mapAccount(cur), after: { reason }, requestId });
      return { code, deleted: true };
    });
  }

  /* --------------------------- Rekening kas/bank -------------------------- */

  private mapBank = (b: any) => ({ code: b.code, name: b.name, bankName: b.bank_name, branchCode: String(b.branch_code).trim(), currency: b.currency, status: b.status, accountNoMasked: b.account_no_masked, glAccountCode: b.gl_account_code });

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
      if (p.bankName && bankParentOf(p.bankName) !== bankParentOf(cur.bank_name))
        throw invalid('BANK_KIND', 'Rekening kas tidak dapat diubah menjadi rekening bank (atau sebaliknya) karena akun buku besarnya berada di header berbeda; buat rekening baru.');
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
