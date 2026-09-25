import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { journalInputSchema, normalizeLines, reverseLines, validateJournal, type JournalInput } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { DomainError, forbidden, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from './ledger.shared.js';

export interface JournalFilter { status?: string; source?: string; q?: string; page: number; size: number; account?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assertUuid = (id: string) => { if (!UUID.test(id)) throw notFound('Jurnal'); };

const STATUS_ID: Record<string, string> = { posted: 'diposting', pending: 'menunggu', rejected: 'ditolak', reversed: 'dibalik', draft: 'draf' };

const mapJournal = (j: any) => ({
  id: j.id, journalNo: j.journal_no, date: j.journal_date, branch: String(j.branch_code).trim(), period: j.period_code,
  source: j.source_type, sourceId: j.source_id, ruleCode: j.rule_code, ref: j.ref, description: j.description,
  status: j.status, statusLabel: STATUS_ID[j.status] ?? j.status, total: j.total_debit,
  createdAt: j.created_at, createdBy: j.created_by, createdByName: j.created_by_name, postedAt: j.posted_at, postedBy: j.posted_by,
  reversedByJournalId: j.reversed_by_journal_id, reversesJournalId: j.reverses_journal_id, lineCount: j.line_count ?? undefined,
});
const mapLine = (l: any) => ({ lineNo: l.line_no, account: l.account_code, accountName: l.account_name, debit: l.debit, credit: l.credit, bankAccountId: l.bank_account_code, bankName: l.bank_name, party: l.party, counterBranch: l.counter_branch ? String(l.counter_branch).trim() : null, memo: l.memo });

@Injectable()
export class JournalsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly refs: LedgerRefs) {}

  async list(u: RequestUser, s: ScopeContext, f: JournalFilter, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const p = await this.refs.resolvePeriod(c, u.companyId, s.period);
      const where: string[] = ['j.company_id = $1', 'j.journal_date BETWEEN $2 AND $3'];
      const args: unknown[] = [u.companyId, p.from, p.to];
      if (s.branch !== 'ALL') { args.push(s.branch); where.push(`j.branch_code = $${args.length}`); }
      if (f.status) { args.push(f.status); where.push(`j.status = $${args.length}`); }
      if (f.source) { args.push(f.source); where.push(`j.source_type = $${args.length}`); }
      if (f.account) { args.push(f.account); where.push(`EXISTS (SELECT 1 FROM journal_lines x WHERE x.journal_id = j.id AND x.account_code = $${args.length})`); }
      if (f.q) { args.push(`%${f.q}%`); where.push(`(j.journal_no ILIKE $${args.length} OR j.description ILIKE $${args.length} OR coalesce(j.ref,'') ILIKE $${args.length} OR j.created_by_name ILIKE $${args.length})`); }
      const w = where.join(' AND ');
      const total = (await c.query(`SELECT count(*)::int AS n FROM journals j WHERE ${w}`, args)).rows[0].n;
      const counts = (await c.query(`SELECT status, count(*)::int AS n FROM journals j WHERE ${where.filter((x) => !x.startsWith('j.status')).join(' AND ')} GROUP BY status`, args.filter((_, i) => !(f.status && i === args.indexOf(f.status))))).rows;
      args.push(f.size, (f.page - 1) * f.size);
      const rows = (await c.query(
        `SELECT j.*, (SELECT count(*)::int FROM journal_lines l WHERE l.journal_id = j.id) AS line_count
           FROM journals j WHERE ${w} ORDER BY j.journal_date DESC, j.journal_no DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
      return { data: rows.map(mapJournal), meta: { total, page: f.page, size: f.size, period: p, statusCounts: Object.fromEntries(counts.map((r: any) => [r.status, r.n])) } };
    });
  }

  async get(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => this.load(c, u.companyId, id));
  }

  private async load(c: PoolClient, companyId: string, idOrNo: string) {
    const j = (await c.query('SELECT * FROM journals WHERE company_id = $1 AND (($2 ~* $3 AND id::text = $2) OR journal_no = $2)', [companyId, idOrNo, UUID.source])).rows[0];
    if (!j) throw notFound('Jurnal');
    const lines = (await c.query(
      `SELECT l.*, a.name AS account_name, b.name AS bank_name FROM journal_lines l
         LEFT JOIN chart_of_accounts a ON a.company_id = l.company_id AND a.code = l.account_code
         LEFT JOIN bank_accounts b ON b.company_id = l.company_id AND b.code = l.bank_account_code
        WHERE l.journal_id = $1 ORDER BY l.line_no`, [j.id])).rows;
    return { ...mapJournal(j), lines: lines.map(mapLine) };
  }

  async byRef(u: RequestUser, s: ScopeContext, ref: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) =>
      (await c.query('SELECT j.*, (SELECT count(*)::int FROM journal_lines l WHERE l.journal_id = j.id) AS line_count FROM journals j WHERE company_id = $1 AND (ref = $2 OR source_id = $2) ORDER BY journal_date', [u.companyId, ref])).rows.map(mapJournal));
  }

  /** Jurnal memorial baru → status pending (K-20/K-21; pembuat ≠ pemosting). */
  async create(u: RequestUser, s: ScopeContext, raw: unknown, requestId: string) {
    const input = journalInputSchema.parse(raw) as JournalInput;
    if (s.branch !== 'ALL' && input.branch !== s.branch) throw forbidden(`Jurnal untuk cabang ${input.branch} tidak dapat dibuat dari konteks cabang ${s.branch}.`);
    if (u.branches !== '*' && !u.branches.includes(input.branch)) throw forbidden(`Anda tidak memiliki akses ke cabang ${input.branch}.`);
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const accounts = await this.refs.accounts(c, u.companyId);
      const periods = await this.refs.periods(c, u.companyId);
      const branches = await this.refs.branches(c, u.companyId);
      const bankAccounts = await this.refs.bankAccounts(c, u.companyId);
      const lines = normalizeLines(input.lines);
      const errs = validateJournal({ ...input, lines }, { accounts, periods, branches, bankAccounts });
      if (errs.length) throw new DomainError('LEDGER_INVALID', errs[0], HttpStatus.UNPROCESSABLE_ENTITY, errs);
      const period = periods.find((p) => p.group === 'Bulan' && input.date >= p.from && input.date <= p.to)!;
      const year = Number(input.date.slice(0, 4));
      const seq = (await c.query('SELECT next_doc_no($1, $2, $3) AS n', [u.companyId, 'JV', year])).rows[0].n;
      const journalNo = `JV-${year}-${String(seq).padStart(6, '0')}`;
      const ins = await c.query(
        `INSERT INTO journals (company_id, branch_code, period_code, journal_no, journal_date, source_type, rule_code, ref, description, status, total_debit, total_credit, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,'manual','MANUAL',$6,$7,'pending',$8,$8,$9,$10) RETURNING *`,
        [u.companyId, input.branch, period.id, journalNo, input.date, input.ref ?? null, input.description, lines.reduce((t, l) => t + l.debit, 0), u.id, u.name]);
      const j = ins.rows[0];
      await this.insertLines(c, j, lines);
      await this.audit.record(c, { companyId: u.companyId, branchCode: input.branch, userId: u.id, sessionId: u.sessionId, action: 'journal.created', entityType: 'journal', entityId: journalNo, after: { ...input, lines }, requestId });
      return this.load(c, u.companyId, j.id);
    });
  }

  private async insertLines(c: PoolClient, j: any, lines: JournalInput['lines']) {
    let n = 0;
    for (const l of lines) {
      n += 1;
      await c.query(
        `INSERT INTO journal_lines (journal_id, company_id, branch_code, journal_date, line_no, account_code, debit, credit, bank_account_code, party, counter_branch, memo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [j.id, j.company_id, j.branch_code, j.journal_date, n, l.account, l.debit, l.credit, l.bankAccountId ?? null, l.party ?? null, l.counterBranch ?? null, l.memo ?? null]);
    }
  }

  /** Posting: hanya jurnal pending, oleh orang selain pembuatnya (SoD). Trigger basis data menjaga periode & keseimbangan. */
  async post(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    assertUuid(id);
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const j = (await c.query('SELECT * FROM journals WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
      if (!j) throw notFound('Jurnal');
      if (j.status !== 'pending') throw new DomainError('LEDGER_NOT_PENDING', `Jurnal ${j.journal_no} berstatus ${STATUS_ID[j.status]}, bukan menunggu.`, HttpStatus.CONFLICT);
      if (j.created_by && j.created_by === u.id) throw new DomainError('SOD_JOURNAL', 'Pembuat jurnal tidak boleh memposting jurnalnya sendiri (kontrol empat mata).', HttpStatus.FORBIDDEN);
      await c.query(`UPDATE journals SET status = 'posted', posted_by = $3, posted_at = now() WHERE company_id = $1 AND id = $2`, [u.companyId, id, u.id]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: String(j.branch_code).trim(), userId: u.id, sessionId: u.sessionId, action: 'journal.posted', entityType: 'journal', entityId: j.journal_no, before: { status: 'pending' }, after: { status: 'posted' }, requestId });
      return this.load(c, u.companyId, id);
    });
  }

  async reject(u: RequestUser, s: ScopeContext, id: string, reason: string, requestId: string) {
    assertUuid(id);
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const j = (await c.query('SELECT * FROM journals WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
      if (!j) throw notFound('Jurnal');
      if (j.status !== 'pending') throw new DomainError('LEDGER_NOT_PENDING', `Jurnal ${j.journal_no} tidak sedang menunggu persetujuan.`, HttpStatus.CONFLICT);
      await c.query(`UPDATE journals SET status = 'rejected' WHERE company_id = $1 AND id = $2`, [u.companyId, id]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: String(j.branch_code).trim(), userId: u.id, sessionId: u.sessionId, action: 'journal.rejected', entityType: 'journal', entityId: j.journal_no, after: { reason }, requestId });
      return this.load(c, u.companyId, id);
    });
  }

  /** Jurnal balik: koreksi satu-satunya untuk jurnal terposting (K-20). Diposting langsung oleh pemegang izin reverse. */
  async reverse(u: RequestUser, s: ScopeContext, id: string, date: string | undefined, reason: string, requestId: string) {
    assertUuid(id);
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const j = (await c.query('SELECT * FROM journals WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
      if (!j) throw notFound('Jurnal');
      if (j.status !== 'posted') throw new DomainError('LEDGER_NOT_POSTED', `Hanya jurnal terposting yang dapat dibalik.`, HttpStatus.CONFLICT);
      const rdate = date ?? new Date().toISOString().slice(0, 10);
      const period = await this.refs.periodForDate(c, u.companyId, rdate);
      if (!period) throw new DomainError('LEDGER_UNKNOWN_PERIOD', `Tanggal ${rdate} tidak berada dalam periode terdaftar.`);
      if (period.status !== 'open') throw new DomainError('LEDGER_PERIOD_CLOSED', `Periode ${period.label} sudah ditutup.`);
      const lines = (await c.query('SELECT * FROM journal_lines WHERE journal_id = $1 ORDER BY line_no', [j.id])).rows
        .map((l: any) => ({ account: l.account_code, debit: l.debit, credit: l.credit, bankAccountId: l.bank_account_code, party: l.party, counterBranch: l.counter_branch, memo: l.memo }));
      const year = Number(rdate.slice(0, 4));
      const seq = (await c.query('SELECT next_doc_no($1, $2, $3) AS n', [u.companyId, 'JV', year])).rows[0].n;
      const journalNo = `JV-${year}-${String(seq).padStart(6, '0')}`;
      const ins = await c.query(
        `INSERT INTO journals (company_id, branch_code, period_code, journal_no, journal_date, source_type, rule_code, ref, description, status, total_debit, total_credit, created_by, created_by_name, posted_by, posted_at, reverses_journal_id)
         VALUES ($1,$2,$3,$4,$5,'manual','REVERSAL',$6,$7,'posted',$8,$8,$9,$10,$9,now(),$11) RETURNING *`,
        [u.companyId, j.branch_code, period.id, journalNo, rdate, j.journal_no, `Pembalikan ${j.journal_no}: ${reason}`, j.total_debit, u.id, u.name, j.id]);
      await this.insertLines(c, ins.rows[0], reverseLines(lines));
      await c.query(`UPDATE journals SET status = 'reversed', reversed_by_journal_id = $3 WHERE company_id = $1 AND id = $2`, [u.companyId, id, ins.rows[0].id]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: String(j.branch_code).trim(), userId: u.id, sessionId: u.sessionId, action: 'journal.reversed', entityType: 'journal', entityId: j.journal_no, after: { reversedBy: journalNo, reason }, requestId });
      return this.load(c, u.companyId, ins.rows[0].id);
    });
  }
}
