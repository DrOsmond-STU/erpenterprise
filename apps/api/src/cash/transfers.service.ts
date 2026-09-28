/**
 * Transfer kas & bank (setoran kas cabang ↔ pusat, pemindahbukuan antar rekening).
 * Diajukan staf keuangan, disetujui & diposting orang lain (pembuat ≠ penyetuju).
 * Antar cabang: satu jurnal per cabang yang diseimbangkan dengan RK sehingga
 * rekonsiliasi antar kantor tetap cocok dan tereliminasi pada konsolidasi.
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { transferLegs } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, DomainError, forbidden, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from '../ledger/ledger.shared.js';
import { acrossBranches, auditTrail, invalid, nextDocNo, postAutoJournal, reverseAutoJournals, todayWib, trimBranch, UUID } from '../sales/sales.shared.js';
import { assertBranches, bankBookBalance, headOffice, usableBank } from './cash.shared.js';

export interface TransferInput { fromBank: string; toBank: string; amount: number; date?: string; reference?: string; notes?: string }

const STATUS_LABEL: Record<string, string> = { menunggu: 'Menunggu persetujuan', diposting: 'Diposting', ditolak: 'Ditolak', batal: 'Batal', dibalik: 'Dibalik' };
const SELECT = `SELECT t.*, fb.name AS from_bank_name, tb.name AS to_bank_name FROM cash_transfers t
  LEFT JOIN bank_accounts fb ON fb.company_id = t.company_id AND fb.code = t.from_bank_code
  LEFT JOIN bank_accounts tb ON tb.company_id = t.company_id AND tb.code = t.to_bank_code`;

export const mapTransfer = (t: any) => ({
  id: t.id, docNo: t.doc_no, branch: trimBranch(t.branch_code), toBranch: trimBranch(t.to_branch_code), date: t.transfer_date,
  fromBank: t.from_bank_code, fromBankName: t.from_bank_name, toBank: t.to_bank_code, toBankName: t.to_bank_name, amount: t.amount,
  reference: t.reference, notes: t.notes, status: t.status, statusLabel: STATUS_LABEL[t.status] ?? t.status,
  interBranch: trimBranch(t.branch_code) !== trimBranch(t.to_branch_code),
  createdBy: t.created_by, createdByName: t.created_by_name, decidedByName: t.decided_by_name, decidedAt: t.decided_at, decisionNote: t.decision_note, createdAt: t.created_at,
});

@Injectable()
export class CashTransfersService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly refs: LedgerRefs) {}

  async list(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) =>
      (await c.query(`${SELECT} WHERE t.company_id = $1 AND ($2::text IS NULL OR t.branch_code = $2 OR t.to_branch_code = $2) ORDER BY (t.status = 'menunggu') DESC, t.transfer_date DESC, t.doc_no DESC LIMIT 5000`,
        [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(mapTransfer));
  }

  private async row(c: PoolClient, companyId: string, id: string, lock = false) {
    if (!UUID.test(id)) throw notFound('Transfer');
    if (lock) await c.query('SELECT 1 FROM cash_transfers WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
    const r = (await c.query(`${SELECT} WHERE t.company_id = $1 AND t.id = $2`, [companyId, id])).rows[0];
    if (!r) throw notFound('Transfer');
    return r;
  }

  private async load(c: PoolClient, companyId: string, id: string) {
    const t = await this.row(c, companyId, id);
    const journals = await acrossBranches(c, async () => (await c.query(
      `SELECT id, journal_no, journal_date, branch_code, rule_code, status, total_debit, description FROM journals
        WHERE company_id = $1 AND ((source_type = 'cash_transfer' AND source_id = $2) OR (source_type = 'reversal' AND source_id IN (SELECT id::text FROM journals WHERE source_type = 'cash_transfer' AND source_id = $2)))
        ORDER BY journal_date, journal_no`, [companyId, id])).rows);
    return {
      ...mapTransfer(t),
      journals: journals.map((j: any) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, branch: trimBranch(j.branch_code), rule: j.rule_code, status: j.status, total: j.total_debit, description: j.description })),
      timeline: await auditTrail(c, companyId, 'cash_transfer', t.doc_no),
    };
  }

  async get(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), (c) => this.load(c, u.companyId, id));
  }

  async create(u: RequestUser, s: ScopeContext, b: TransferInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const [from, to] = await acrossBranches(c, async () => [await usableBank(c, u.companyId, b.fromBank, 'Rekening sumber'), await usableBank(c, u.companyId, b.toBank, 'Rekening tujuan')]);
      if (from.code === to.code) throw invalid('TRANSFER_SAME_BANK', 'Rekening sumber dan tujuan harus berbeda.');
      if (s.branch !== 'ALL' && from.branch_code !== s.branch) throw forbidden(`Rekening sumber milik cabang ${from.branch_code}; ajukan dari konteks cabang tersebut.`);
      if (u.branches !== '*' && !u.branches.includes(from.branch_code)) throw forbidden(`Anda tidak memiliki akses ke cabang ${from.branch_code}.`);
      const date = b.date ?? todayWib();
      const balance = await acrossBranches(c, () => bankBookBalance(c, u.companyId, from.code, date));
      if (b.amount > balance) throw invalid('TRANSFER_INSUFFICIENT', `Saldo buku ${from.code} per ${date} Rp ${balance.toLocaleString('id-ID')} tidak cukup untuk transfer Rp ${b.amount.toLocaleString('id-ID')}.`);
      const docNo = await nextDocNo(c, u.companyId, 'TRF', Number(date.slice(0, 4)));
      const t = (await c.query(
        `INSERT INTO cash_transfers (company_id, branch_code, to_branch_code, doc_no, transfer_date, from_bank_code, to_bank_code, amount, reference, notes, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [u.companyId, from.branch_code, to.branch_code, docNo, date, from.code, to.code, b.amount, b.reference ?? null, b.notes ?? null, u.id, u.name])).rows[0];
      await this.audit.record(c, { companyId: u.companyId, branchCode: from.branch_code, userId: u.id, sessionId: u.sessionId, action: 'cash_transfer.requested', entityType: 'cash_transfer', entityId: docNo,
        after: { from: from.code, to: to.code, amount: b.amount, toBranch: to.branch_code }, requestId });
      return this.load(c, u.companyId, t.id);
    });
  }

  /** Setujui & posting: jurnal satu cabang, atau dua jurnal RK antar cabang. */
  async approve(u: RequestUser, s: ScopeContext, id: string, note: string | undefined, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const t = await this.row(c, u.companyId, id, true);
      if (t.status !== 'menunggu') throw conflict('TRANSFER_NOT_PENDING', `Transfer ${t.doc_no} tidak sedang menunggu persetujuan.`);
      if (t.created_by === u.id) throw new DomainError('SOD_CASH_TRANSFER', 'Pengaju transfer tidak boleh menyetujui transfernya sendiri (kontrol empat mata).', HttpStatus.FORBIDDEN);
      const fromBranch = trimBranch(t.branch_code), toBranch = trimBranch(t.to_branch_code);
      assertBranches(u, [fromBranch, toBranch]);
      await acrossBranches(c, async () => {
        const from = await usableBank(c, u.companyId, t.from_bank_code, 'Rekening sumber');
        const to = await usableBank(c, u.companyId, t.to_bank_code, 'Rekening tujuan');
        const balance = await bankBookBalance(c, u.companyId, from.code, t.transfer_date);
        if (t.amount > balance) throw invalid('TRANSFER_INSUFFICIENT', `Saldo buku ${from.code} per ${t.transfer_date} Rp ${balance.toLocaleString('id-ID')} tidak cukup.`);
        const links = await this.refs.links(c, u.companyId);
        const legs = transferLegs({ fromBranch, toBranch, fromGl: from.gl_account_code, toGl: to.gl_account_code, fromBank: from.code, toBank: to.code, amount: t.amount,
          headOffice: await headOffice(c, u.companyId), rkBranch: links.rkBranch, rkHeadOffice: links.rkHeadOffice });
        for (const leg of legs) {
          const rule = legs.length === 1 ? 'CASH_TRANSFER' : leg.branch === fromBranch ? 'CASH_TRANSFER_OUT' : 'CASH_TRANSFER_IN';
          await postAutoJournal(c, u, { branch: leg.branch, date: t.transfer_date, source: 'cash_transfer', sourceId: id, rule, ref: t.doc_no,
            description: `Transfer ${t.doc_no}: ${from.code} → ${to.code}${t.reference ? ` (${t.reference})` : ''}`, lines: leg.lines.map((l) => ({ ...l, memo: t.notes })) });
        }
      });
      await c.query(`UPDATE cash_transfers SET status = 'diposting', decided_by = $2, decided_by_name = $3, decided_at = now(), decision_note = $4, updated_at = now() WHERE id = $1`, [id, u.id, u.name, note ?? null]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: fromBranch, userId: u.id, sessionId: u.sessionId, action: 'cash_transfer.posted', entityType: 'cash_transfer', entityId: t.doc_no, after: { note, amount: t.amount }, requestId });
      return this.load(c, u.companyId, id);
    });
  }

  async reject(u: RequestUser, s: ScopeContext, id: string, note: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const t = await this.row(c, u.companyId, id, true);
      if (t.status !== 'menunggu') throw conflict('TRANSFER_NOT_PENDING', `Transfer ${t.doc_no} tidak sedang menunggu persetujuan.`);
      if (t.created_by === u.id) throw new DomainError('SOD_CASH_TRANSFER', 'Pengaju tidak dapat menolak transfernya sendiri — gunakan pembatalan.', HttpStatus.FORBIDDEN);
      await c.query(`UPDATE cash_transfers SET status = 'ditolak', decided_by = $2, decided_by_name = $3, decided_at = now(), decision_note = $4, updated_at = now() WHERE id = $1`, [id, u.id, u.name, note]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(t.branch_code), userId: u.id, sessionId: u.sessionId, action: 'cash_transfer.rejected', entityType: 'cash_transfer', entityId: t.doc_no, after: { note }, requestId });
      return this.load(c, u.companyId, id);
    });
  }

  async cancel(u: RequestUser, s: ScopeContext, id: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const t = await this.row(c, u.companyId, id, true);
      if (t.status !== 'menunggu') throw conflict('TRANSFER_LOCKED', `Transfer ${t.doc_no} berstatus ${STATUS_LABEL[t.status]}; hanya yang menunggu yang dapat dibatalkan.`);
      if (t.created_by !== u.id && !u.permissions.has('cash.transfer.approve')) throw forbidden('Hanya pengaju atau penyetuju yang dapat membatalkan transfer.');
      await c.query(`UPDATE cash_transfers SET status = 'batal', decision_note = $2, updated_at = now() WHERE id = $1`, [id, reason]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(t.branch_code), userId: u.id, sessionId: u.sessionId, action: 'cash_transfer.cancelled', entityType: 'cash_transfer', entityId: t.doc_no, after: { reason }, requestId });
      return this.load(c, u.companyId, id);
    });
  }

  /** Transfer yang sudah diposting dikoreksi dengan jurnal balik (tanggal pembalikan). */
  async reverse(u: RequestUser, s: ScopeContext, id: string, reason: string, date: string | undefined, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const t = await this.row(c, u.companyId, id, true);
      if (t.status !== 'diposting') throw conflict('TRANSFER_NOT_POSTED', `Transfer ${t.doc_no} belum diposting.`);
      assertBranches(u, [trimBranch(t.branch_code), trimBranch(t.to_branch_code)]);
      const when = date ?? todayWib();
      if (when < t.transfer_date) throw invalid('REVERSE_DATE', 'Tanggal pembalikan tidak boleh sebelum tanggal transfer.');
      const matched = Number((await acrossBranches(c, () => c.query(
        `SELECT count(*) AS n FROM bank_statement_lines bsl JOIN journal_lines jl ON jl.id = bsl.journal_line_id JOIN journals j ON j.id = jl.journal_id
          WHERE j.company_id = $1 AND j.source_type = 'cash_transfer' AND j.source_id = $2`, [u.companyId, id]))).rows[0].n);
      if (matched) throw conflict('TRANSFER_RECONCILED', `Transfer ${t.doc_no} sudah dicocokkan dengan rekening koran; lepaskan pencocokannya dahulu.`);
      const reversed = await acrossBranches(c, () => reverseAutoJournals(c, u, 'cash_transfer', id, when, reason));
      await c.query(`UPDATE cash_transfers SET status = 'dibalik', decision_note = $2, updated_at = now() WHERE id = $1`, [id, reason]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(t.branch_code), userId: u.id, sessionId: u.sessionId, action: 'cash_transfer.reversed', entityType: 'cash_transfer', entityId: t.doc_no, after: { reason, reversed }, requestId });
      return this.load(c, u.companyId, id);
    });
  }
}
