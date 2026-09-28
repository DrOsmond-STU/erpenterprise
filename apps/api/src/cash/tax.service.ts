/**
 * Setoran PPN masa (pemusatan PPN di kantor pusat).
 *  draf (hitung saldo PPN keluaran & masukan per cabang per akhir masa)
 *   → diposting oleh orang lain: tiap cabang menutup saldo PPN-nya ke RK, kantor
 *     pusat mencatat kurang bayar sebagai utang pajak (lebih bayar dikompensasikan)
 *   → dibayar: Dr utang pajak / Cr rekening kantor pusat, dengan NTPN.
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { ppnSettlementLegs, type PpnBranchBalance } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, DomainError, forbidden, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from '../ledger/ledger.shared.js';
import { acrossBranches, auditTrail, invalid, nextDocNo, postAutoJournal, reverseAutoJournals, todayWib, trimBranch, UUID } from '../sales/sales.shared.js';
import { assertBranches, headOffice, usableBank } from './cash.shared.js';

const STATUS_LABEL: Record<string, string> = { draf: 'Draf', diposting: 'Diposting — menunggu pembayaran', dibayar: 'Dibayar', batal: 'Batal' };

export const mapSettlement = (t: any) => ({
  id: t.id, docNo: t.doc_no, branch: trimBranch(t.branch_code), taxType: t.tax_type, period: t.period_code, settleDate: t.settle_date,
  output: Number(t.output_tax), input: Number(t.input_tax), net: Number(t.net_amount), details: t.details, status: t.status,
  statusLabel: t.status === 'diposting' && Number(t.net_amount) <= 0 ? 'Diposting — lebih bayar dikompensasikan' : STATUS_LABEL[t.status] ?? t.status,
  bankAccount: t.bank_account_code, paymentDate: t.payment_date, ntpn: t.ntpn, paymentJournalId: t.payment_journal_id,
  createdBy: t.created_by, createdByName: t.created_by_name, createdAt: t.created_at, postedByName: t.posted_by_name, postedAt: t.posted_at, paidByName: t.paid_by_name, paidAt: t.paid_at, cancelReason: t.cancel_reason,
});

/** PPN dipusatkan: angka seluruh cabang hanya untuk pengguna lintas cabang. */
function assertCompanyWide(u: RequestUser) {
  if (!(u.branches === '*' || u.permissions.has('report.consolidated'))) throw forbidden('Setoran PPN terpusat memerlukan akses seluruh cabang atau izin laporan konsolidasi.');
}

@Injectable()
export class TaxSettlementsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly refs: LedgerRefs) {}

  /** Saldo PPN keluaran & masukan per cabang per tanggal (seluruh cabang: PPN dipusatkan). */
  private async balances(c: PoolClient, companyId: string, asOf: string): Promise<PpnBranchBalance[]> {
    const links = await this.refs.links(c, companyId);
    const rows = (await acrossBranches(c, () => c.query(
      `SELECT trim(jl.branch_code) AS branch,
              coalesce(sum(jl.credit - jl.debit) FILTER (WHERE jl.account_code = $3),0)::bigint AS output,
              coalesce(sum(jl.debit - jl.credit) FILTER (WHERE jl.account_code = $4),0)::bigint AS input
         FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
        WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.journal_date <= $2 AND jl.account_code IN ($3, $4)
        GROUP BY 1 ORDER BY 1`, [companyId, asOf, links.ppnOut, links.ppnIn]))).rows;
    return rows.map((r: any) => ({ branch: r.branch, output: Number(r.output), input: Number(r.input) })).filter((r) => r.output || r.input);
  }

  private async monthPeriod(c: PoolClient, companyId: string, code: string) {
    const p = (await c.query(`SELECT code, label, date_from, date_to, status FROM fiscal_periods WHERE company_id = $1 AND code = $2 AND period_group = 'Bulan'`, [companyId, code])).rows[0];
    if (!p) throw invalid('TAX_PERIOD', `Masa pajak ${code} tidak dikenal (pilih periode bulanan).`);
    return p;
  }

  /** Pratinjau masa: saldo per cabang, mutasi masa ini, dan setoran yang sudah ada. */
  async preview(u: RequestUser, s: ScopeContext, periodCode: string | null, requestId: string) {
    assertCompanyWide(u);
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const period = periodCode ? await this.monthPeriod(c, u.companyId, periodCode) : (await c.query(
        `SELECT code, label, date_from, date_to, status FROM fiscal_periods WHERE company_id = $1 AND period_group = 'Bulan' AND $2::date BETWEEN date_from AND date_to`, [u.companyId, todayWib()])).rows[0];
      if (!period) throw invalid('TAX_PERIOD', 'Masa pajak tidak ditemukan.');
      const links = await this.refs.links(c, u.companyId);
      const balances = await this.balances(c, u.companyId, period.date_to);
      const activity = (await acrossBranches(c, () => c.query(
        `SELECT coalesce(sum(jl.credit - jl.debit) FILTER (WHERE jl.account_code = $4 AND j.source_type <> 'tax_settlement'),0)::bigint AS output,
                coalesce(sum(jl.debit - jl.credit) FILTER (WHERE jl.account_code = $5 AND j.source_type <> 'tax_settlement'),0)::bigint AS input
           FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
          WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.journal_date BETWEEN $2 AND $3`, [u.companyId, period.date_from, period.date_to, links.ppnOut, links.ppnIn]))).rows[0];
      const existing = (await acrossBranches(c, () => c.query(`SELECT * FROM tax_settlements WHERE company_id = $1 AND period_code = $2 AND status <> 'batal'`, [u.companyId, period.code]))).rows[0];
      const output = balances.reduce((t, b) => t + b.output, 0), input = balances.reduce((t, b) => t + b.input, 0);
      return {
        period: { id: period.code, label: period.label, from: period.date_from, to: period.date_to, status: period.status },
        headOffice: await headOffice(c, u.companyId), accounts: { ppnOut: links.ppnOut, ppnIn: links.ppnIn, taxPayable: links.taxPayable },
        branches: balances.map((b) => ({ ...b, net: b.output - b.input })), output, input, net: output - input,
        activity: { output: Number(activity.output), input: Number(activity.input) },
        existing: existing ? mapSettlement(existing) : null,
      };
    });
  }

  async list(u: RequestUser, s: ScopeContext, requestId: string) {
    assertCompanyWide(u);
    return this.db.run(contextOf(u, s, requestId), async (c) =>
      (await acrossBranches(c, () => c.query('SELECT * FROM tax_settlements WHERE company_id = $1 ORDER BY period_code DESC, doc_no DESC', [u.companyId]))).rows.map(mapSettlement));
  }

  private async row(c: PoolClient, companyId: string, id: string, lock = false) {
    if (!UUID.test(id)) throw notFound('Setoran pajak');
    const r = (await acrossBranches(c, () => c.query(`SELECT * FROM tax_settlements WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id]))).rows[0];
    if (!r) throw notFound('Setoran pajak');
    return r;
  }

  private async load(c: PoolClient, companyId: string, id: string) {
    const t = await this.row(c, companyId, id);
    const journals = (await acrossBranches(c, () => c.query(
      `SELECT id, journal_no, journal_date, branch_code, rule_code, status, total_debit, description FROM journals
        WHERE company_id = $1 AND ((source_type = 'tax_settlement' AND source_id = $2) OR (source_type = 'reversal' AND source_id IN (SELECT id::text FROM journals WHERE source_type = 'tax_settlement' AND source_id = $2)))
        ORDER BY journal_date, journal_no`, [companyId, id]))).rows;
    return {
      ...mapSettlement(t),
      journals: journals.map((j: any) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, branch: trimBranch(j.branch_code), rule: j.rule_code, status: j.status, total: j.total_debit, description: j.description })),
      timeline: await auditTrail(c, companyId, 'tax_settlement', t.doc_no),
    };
  }

  async get(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    assertCompanyWide(u);
    return this.db.run(contextOf(u, s, requestId), (c) => this.load(c, u.companyId, id));
  }

  async create(u: RequestUser, s: ScopeContext, periodCode: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const period = await this.monthPeriod(c, u.companyId, periodCode);
      if (period.status !== 'open') throw invalid('LEDGER_PERIOD_CLOSED', `Masa ${period.label} sudah ditutup.`);
      const ho = await headOffice(c, u.companyId);
      assertBranches(u, [ho]);
      const dup = (await acrossBranches(c, () => c.query(`SELECT doc_no FROM tax_settlements WHERE company_id = $1 AND tax_type = 'PPN' AND period_code = $2 AND status <> 'batal'`, [u.companyId, period.code]))).rows[0];
      if (dup) throw conflict('TAX_EXISTS', `Setoran PPN masa ${period.label} sudah ada (${dup.doc_no}).`);
      const balances = await this.balances(c, u.companyId, period.date_to);
      if (!balances.length) throw invalid('TAX_NOTHING', `Tidak ada saldo PPN per ${period.date_to}.`);
      const output = balances.reduce((t, b) => t + b.output, 0), input = balances.reduce((t, b) => t + b.input, 0);
      const docNo = await nextDocNo(c, u.companyId, 'SPP', Number(period.date_to.slice(0, 4)));
      const r = (await acrossBranches(c, () => c.query(
        `INSERT INTO tax_settlements (company_id, branch_code, doc_no, period_code, settle_date, output_tax, input_tax, net_amount, details, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING id`,
        [u.companyId, ho, docNo, period.code, period.date_to, output, input, output - input, JSON.stringify(balances), u.id, u.name]))).rows[0];
      await this.audit.record(c, { companyId: u.companyId, branchCode: ho, userId: u.id, sessionId: u.sessionId, action: 'tax_settlement.created', entityType: 'tax_settlement', entityId: docNo, after: { period: period.code, output, input, net: output - input }, requestId });
      return this.load(c, u.companyId, r.id);
    });
  }

  async post(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const t = await this.row(c, u.companyId, id, true);
      if (t.status !== 'draf') throw conflict('TAX_NOT_DRAFT', `Setoran ${t.doc_no} bukan draf.`);
      if (t.created_by === u.id) throw new DomainError('SOD_TAX_SETTLEMENT', 'Pembuat setoran pajak tidak boleh memostingnya sendiri (kontrol empat mata).', HttpStatus.FORBIDDEN);
      const now = await this.balances(c, u.companyId, t.settle_date);
      const key = (list: PpnBranchBalance[]) => JSON.stringify([...list].map((b) => [b.branch, Number(b.output), Number(b.input)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
      if (key(now) !== key(t.details)) throw conflict('TAX_BALANCES_CHANGED', 'Saldo PPN berubah sejak draf dibuat (ada transaksi baru). Batalkan draf lalu buat ulang.');
      const links = await this.refs.links(c, u.companyId);
      const ho = trimBranch(t.branch_code);
      const { legs } = ppnSettlementLegs(now, { headOffice: ho, ppnOut: links.ppnOut, ppnIn: links.ppnIn, taxPayable: links.taxPayable, rkBranch: links.rkBranch, rkHeadOffice: links.rkHeadOffice });
      assertBranches(u, legs.map((l) => l.branch));
      await acrossBranches(c, async () => {
        for (const leg of legs) {
          await postAutoJournal(c, u, { branch: leg.branch, date: t.settle_date, source: 'tax_settlement', sourceId: id, rule: `TAX_PPN_${leg.branch}`, ref: t.doc_no,
            description: `Setoran PPN masa ${t.period_code} (${t.doc_no})${leg.branch === ho ? ' — pemusatan kantor pusat' : ' — dipindah ke kantor pusat'}`, lines: leg.lines });
        }
        await c.query(`UPDATE tax_settlements SET status = 'diposting', posted_by = $2, posted_by_name = $3, posted_at = now(), updated_at = now() WHERE id = $1`, [id, u.id, u.name]);
      });
      await this.audit.record(c, { companyId: u.companyId, branchCode: ho, userId: u.id, sessionId: u.sessionId, action: 'tax_settlement.posted', entityType: 'tax_settlement', entityId: t.doc_no, after: { net: Number(t.net_amount), legs: legs.length }, requestId });
      return this.load(c, u.companyId, id);
    });
  }

  async pay(u: RequestUser, s: ScopeContext, id: string, b: { bankAccount: string; date?: string; ntpn: string }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const t = await this.row(c, u.companyId, id, true);
      if (t.status !== 'diposting') throw conflict('TAX_NOT_POSTED', `Setoran ${t.doc_no} belum diposting atau sudah dibayar.`);
      const net = Number(t.net_amount);
      if (net <= 0) throw invalid('TAX_NO_PAYMENT', 'Masa ini lebih bayar; tidak ada yang perlu disetor.');
      const ho = trimBranch(t.branch_code);
      assertBranches(u, [ho]);
      const date = b.date ?? todayWib();
      if (date < t.settle_date) throw invalid('TAX_PAY_DATE', `Tanggal setor tidak boleh sebelum akhir masa (${t.settle_date}).`);
      await acrossBranches(c, async () => {
        const bank = await usableBank(c, u.companyId, b.bankAccount);
        if (bank.branch_code !== ho) throw invalid('BANK_BRANCH', `PPN dipusatkan: setor dari rekening kantor pusat (${ho}), bukan ${bank.branch_code}.`);
        const links = await this.refs.links(c, u.companyId);
        const j = await postAutoJournal(c, u, { branch: ho, date, source: 'tax_settlement', sourceId: id, rule: 'TAX_PPN_PAYMENT', ref: t.doc_no,
          description: `Pembayaran PPN masa ${t.period_code} — NTPN ${b.ntpn}`, lines: [{ account: links.taxPayable, debit: net, credit: 0, party: 'Kas Negara' }, { account: bank.gl_account_code, debit: 0, credit: net, bank: bank.code }] });
        await c.query(`UPDATE tax_settlements SET status = 'dibayar', bank_account_code = $2, payment_date = $3, ntpn = $4, payment_journal_id = $5, paid_by_name = $6, paid_at = now(), updated_at = now() WHERE id = $1`,
          [id, bank.code, date, b.ntpn, j.id, u.name]);
      });
      await this.audit.record(c, { companyId: u.companyId, branchCode: ho, userId: u.id, sessionId: u.sessionId, action: 'tax_settlement.paid', entityType: 'tax_settlement', entityId: t.doc_no, after: { net, bank: b.bankAccount, ntpn: b.ntpn, date }, requestId });
      return this.load(c, u.companyId, id);
    });
  }

  async cancel(u: RequestUser, s: ScopeContext, id: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const t = await this.row(c, u.companyId, id, true);
      let reversed: string[] = [];
      if (t.status === 'draf') {
        if (t.created_by !== u.id && !u.permissions.has('tax.settlement.post')) throw forbidden('Draf hanya dapat dibatalkan pembuatnya atau pemegang izin posting setoran.');
      } else if (t.status === 'diposting') {
        if (!u.permissions.has('tax.settlement.post')) throw forbidden('Memerlukan izin tax.settlement.post.');
        reversed = await acrossBranches(c, () => reverseAutoJournals(c, u, 'tax_settlement', id, t.settle_date > todayWib() ? t.settle_date : todayWib(), reason));
      } else throw conflict('TAX_LOCKED', `Setoran ${t.doc_no} berstatus ${STATUS_LABEL[t.status]}; tidak dapat dibatalkan.`);
      await acrossBranches(c, () => c.query(`UPDATE tax_settlements SET status = 'batal', cancel_reason = $2, updated_at = now() WHERE id = $1`, [id, reason]));
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(t.branch_code), userId: u.id, sessionId: u.sessionId, action: 'tax_settlement.cancelled', entityType: 'tax_settlement', entityId: t.doc_no, after: { reason, reversed }, requestId });
      return this.load(c, u.companyId, id);
    });
  }
}
