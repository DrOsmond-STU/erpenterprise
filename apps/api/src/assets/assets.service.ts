/**
 * Register aset tetap: perolehan (Dr aset / Cr bank), penyusutan bulanan per cabang
 * (Dr beban penyusutan / Cr akumulasi), dan pelepasan (laba/rugi lain-lain).
 */
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { depreciationFor, disposalLines, FIXED_ASSET_HEADERS, monthEndOf, monthlyStraightLine } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, forbidden, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from '../ledger/ledger.shared.js';
import { usableBank } from '../cash/cash.shared.js';
import { acrossBranches, assertBranch, auditTrail, invalid, nextDocNo, postAutoJournal, trimBranch, UUID } from '../sales/sales.shared.js';

export interface AssetInput { name: string; category: string; glAccount: string; branch: string; location?: string; acquisitionDate: string; cost: number; usefulLifeMonths: number; salvage?: number; bank: string }

const prevMonthEnd = (iso: string) => { const d = new Date(iso.slice(0, 7) + '-01T00:00:00Z'); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
const map = (a: any) => ({
  id: a.id, code: a.code, name: a.name, category: a.category, glAccount: a.gl_account_code, branch: trimBranch(a.branch_code), location: a.location,
  acquisitionDate: a.acquisition_date, cost: Number(a.acquisition_cost), bookValue: Number(a.book_value), accumulated: Number(a.acquisition_cost) - Number(a.book_value),
  monthly: Number(a.monthly_depreciation), usefulLifeMonths: a.useful_life_months, salvage: Number(a.salvage_value), depreciatedThrough: a.depreciated_through,
  status: a.status, disposedDate: a.disposed_date, disposalProceeds: a.disposal_proceeds === null ? null : Number(a.disposal_proceeds), disposalNote: a.disposal_note,
});

@Injectable()
export class AssetsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly refs: LedgerRefs) {}

  async list(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const rows = (await c.query(`SELECT * FROM assets WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2) ORDER BY (status = 'aktif') DESC, code`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(map);
      const accounts = await this.refs.accounts(c, u.companyId);
      const glOptions = FIXED_ASSET_HEADERS.flatMap((h) => accounts.descendantDetails(h)).map((a) => ({ code: a.code, name: a.name }));
      return { assets: rows, glOptions };
    });
  }

  async get(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      if (!UUID.test(id)) throw notFound('Aset');
      const a = (await c.query('SELECT * FROM assets WHERE company_id = $1 AND id = $2', [u.companyId, id])).rows[0];
      if (!a) throw notFound('Aset');
      const depr = (await c.query(`SELECT r.period_code, r.doc_no, l.amount, l.book_value_after FROM depreciation_lines l JOIN depreciation_runs r ON r.id = l.run_id WHERE l.asset_id = $1 ORDER BY r.period_code DESC`, [id])).rows
        .map((r: any) => ({ period: r.period_code, docNo: r.doc_no, amount: Number(r.amount), bookValueAfter: Number(r.book_value_after) }));
      const maint = (await c.query(`SELECT id, doc_no, kind, status, scheduled_date, coalesce(service_cost,0) + coalesce(parts_cost,0) AS cost, estimated_cost FROM maintenance_orders WHERE asset_id = $1 ORDER BY scheduled_date DESC`, [id])).rows
        .map((m: any) => ({ id: m.id, docNo: m.doc_no, kind: m.kind, status: m.status, date: m.scheduled_date, cost: m.status === 'selesai' ? Number(m.cost) : Number(m.estimated_cost) }));
      const journals = (await c.query(`SELECT id, journal_no, journal_date, rule_code, status, total_debit FROM journals WHERE company_id = $1 AND source_type = 'asset' AND source_id = $2 ORDER BY journal_no`, [u.companyId, id])).rows
        .map((j: any) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, rule: j.rule_code, status: j.status, total: j.total_debit }));
      return { ...map(a), depreciation: depr, maintenance: maint, journals, timeline: await auditTrail(c, u.companyId, 'asset', a.code) };
    });
  }

  async create(u: RequestUser, s: ScopeContext, b: AssetInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      assertBranch(u, s, b.branch);
      const accounts = await this.refs.accounts(c, u.companyId);
      if (!FIXED_ASSET_HEADERS.flatMap((h) => accounts.descendantDetails(h)).some((a) => a.code === b.glAccount)) throw invalid('ASSET_ACCOUNT', `Akun ${b.glAccount} bukan akun detail aset tetap (${FIXED_ASSET_HEADERS.join(', ')}).`);
      if ((b.salvage ?? 0) >= b.cost) throw invalid('ASSET_SALVAGE', 'Nilai residu harus lebih kecil dari harga perolehan.');
      const bank = await usableBank(c, u.companyId, b.bank, 'Rekening pembayaran');
      if (bank.branch_code !== b.branch) throw invalid('BANK_BRANCH', `Rekening ${bank.code} bukan milik cabang ${b.branch}.`);
      const max = Number((await acrossBranches(c, async () => c.query(`SELECT coalesce(max(nullif(regexp_replace(code, '\\D', '', 'g'), '')::int), 0) AS n FROM assets WHERE company_id = $1`, [u.companyId]))).rows[0].n);
      const code = `AST-${String(max + 1).padStart(4, '0')}`;
      const monthly = monthlyStraightLine(b.cost, b.salvage ?? 0, b.usefulLifeMonths);
      const a = (await c.query(`INSERT INTO assets (company_id, branch_code, code, name, category, gl_account_code, acquisition_date, acquisition_cost, book_value, monthly_depreciation, status,
                                  location, useful_life_months, salvage_value, depreciated_through, funding_bank, created_by_name)
                                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,'aktif',$10,$11,$12,$13,$14,$15) RETURNING *`,
        [u.companyId, b.branch, code, b.name, b.category, b.glAccount, b.acquisitionDate, b.cost, monthly, b.location ?? null, b.usefulLifeMonths, b.salvage ?? 0, prevMonthEnd(b.acquisitionDate), bank.code, u.name])).rows[0];
      await postAutoJournal(c, u, { branch: b.branch, date: b.acquisitionDate, source: 'asset', sourceId: a.id, rule: 'ASSET_ACQUISITION', ref: code, description: `Perolehan aset ${code} — ${b.name}`,
        lines: [{ account: b.glAccount, debit: b.cost, credit: 0, memo: null }, { account: bank.gl_account_code, debit: 0, credit: b.cost, bank: bank.code, memo: null }] });
      await this.audit.record(c, { companyId: u.companyId, branchCode: b.branch, userId: u.id, sessionId: u.sessionId, action: 'asset.acquired', entityType: 'asset', entityId: code, after: { cost: b.cost, monthly, bank: bank.code }, requestId });
      return map(a);
    });
  }

  /** Pratinjau penyusutan periode untuk cabang-cabang dalam konteks. */
  async preview(u: RequestUser, s: ScopeContext, period: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), (c) => this.compute(c, u, s, period));
  }

  private async compute(c: PoolClient, u: RequestUser, s: ScopeContext, period: string) {
    const end = monthEndOf(period), prevEnd = prevMonthEnd(end);
    const rows = (await c.query(`SELECT * FROM assets WHERE company_id = $1 AND status = 'aktif' AND ($2::text IS NULL OR branch_code = $2) AND acquisition_date <= $3 ORDER BY branch_code, code`,
      [u.companyId, s.branch === 'ALL' ? null : s.branch, end])).rows;
    const done = new Set((await c.query('SELECT branch_code FROM depreciation_runs WHERE company_id = $1 AND period_code = $2', [u.companyId, period])).rows.map((r: any) => trimBranch(r.branch_code)));
    const items = rows.map((a: any) => {
      const through = a.depreciated_through as string | null;
      const state = through && through >= end ? 'sudah' : through && through < prevEnd ? 'tertinggal' : 'jatuh';
      const amount = state === 'jatuh' ? depreciationFor(Number(a.book_value), Number(a.salvage_value), Number(a.monthly_depreciation)) : 0;
      return { ...map(a), state, amount };
    });
    const branches = [...new Set(items.map((i) => i.branch))].map((b) => {
      const its = items.filter((i) => i.branch === b);
      return { branch: b, done: done.has(b), lagging: its.filter((i) => i.state === 'tertinggal').map((i) => i.code), total: its.reduce((t, i) => t + i.amount, 0), count: its.filter((i) => i.amount > 0).length };
    });
    return { period, end, items, branches, total: items.reduce((t, i) => t + i.amount, 0) };
  }

  async runDepreciation(u: RequestUser, s: ScopeContext, period: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const p = await this.compute(c, u, s, period);
      const links = await this.refs.links(c, u.companyId);
      const posted = [];
      for (const br of p.branches) {
        if (br.done) continue;
        if (u.branches !== '*' && !u.branches.includes(br.branch)) throw forbidden(`Memerlukan akses ke cabang ${br.branch}.`);
        if (br.lagging.length) throw conflict('DEPRECIATION_LAGGING', `Cabang ${br.branch}: penyusutan aset ${br.lagging.join(', ')} tertinggal; jalankan periode sebelumnya dulu.`);
        const its = p.items.filter((i) => i.branch === br.branch && i.amount > 0);
        const docNo = await nextDocNo(c, u.companyId, 'DEP', Number(period.slice(0, 4)));
        const run = (await c.query(`INSERT INTO depreciation_runs (company_id, branch_code, doc_no, period_code, run_date, total, asset_count, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [u.companyId, br.branch, docNo, period, p.end, br.total, its.length, u.id, u.name])).rows[0];
        for (const i of its) {
          await c.query('INSERT INTO depreciation_lines (run_id, company_id, branch_code, asset_id, amount, book_value_after) VALUES ($1,$2,$3,$4,$5,$6)', [run.id, u.companyId, br.branch, i.id, i.amount, i.bookValue - i.amount]);
        }
        await c.query(`UPDATE assets a SET book_value = a.book_value - l.amount, depreciated_through = $2 FROM depreciation_lines l WHERE l.run_id = $1 AND l.asset_id = a.id`, [run.id, p.end]);
        await c.query(`UPDATE assets SET depreciated_through = $3 WHERE company_id = $1 AND branch_code = $2 AND status = 'aktif' AND acquisition_date <= $3 AND (depreciated_through IS NULL OR depreciated_through < $3)`, [u.companyId, br.branch, p.end]);
        if (br.total) {
          await postAutoJournal(c, u, { branch: br.branch, date: p.end, source: 'depreciation_run', sourceId: run.id, rule: 'DEPRECIATION', ref: docNo, description: `Penyusutan aset tetap ${period} — ${br.count} aset`,
            lines: [{ account: links.depreciationExpense, debit: br.total, credit: 0, memo: null }, { account: links.accumDepreciation, debit: 0, credit: br.total, memo: null }] });
        }
        await this.audit.record(c, { companyId: u.companyId, branchCode: br.branch, userId: u.id, sessionId: u.sessionId, action: 'depreciation.posted', entityType: 'depreciation_run', entityId: docNo, after: { period, total: br.total, assets: its.length }, requestId });
        posted.push({ branch: br.branch, docNo, total: br.total, count: its.length });
      }
      if (!posted.length) throw conflict('DEPRECIATION_DONE', `Penyusutan ${period} untuk cabang dalam konteks sudah dijalankan.`);
      return { period, posted, preview: await this.compute(c, u, s, period) };
    });
  }

  async runs(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) =>
      (await c.query(`SELECT r.*, (SELECT id FROM journals j WHERE j.company_id = r.company_id AND j.source_type = 'depreciation_run' AND j.source_id = r.id::text LIMIT 1) AS journal_id
                        FROM depreciation_runs r WHERE r.company_id = $1 AND ($2::text IS NULL OR r.branch_code = $2) ORDER BY r.period_code DESC, r.branch_code LIMIT 500`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows
        .map((r: any) => ({ id: r.id, docNo: r.doc_no, branch: trimBranch(r.branch_code), period: r.period_code, date: r.run_date, total: Number(r.total), count: r.asset_count, byName: r.created_by_name, journalId: r.journal_id })));
  }

  async dispose(u: RequestUser, s: ScopeContext, id: string, b: { date: string; proceeds: number; bank?: string; note: string }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      if (!UUID.test(id)) throw notFound('Aset');
      const a = (await c.query('SELECT * FROM assets WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
      if (!a) throw notFound('Aset');
      const branch = trimBranch(a.branch_code);
      assertBranch(u, { ...s, branch: 'ALL' }, branch);
      if (a.status !== 'aktif') throw conflict('ASSET_NOT_ACTIVE', `Aset ${a.code} sudah dilepas.`);
      if (b.date < a.acquisition_date) throw invalid('DISPOSAL_DATE', 'Tanggal pelepasan sebelum tanggal perolehan.');
      let bank: any = null;
      if (b.proceeds > 0) {
        if (!b.bank) throw invalid('DISPOSAL_BANK', 'Pilih rekening penerima hasil pelepasan.');
        bank = await usableBank(c, u.companyId, b.bank, 'Rekening');
        if (bank.branch_code !== branch) throw invalid('BANK_BRANCH', `Rekening ${bank.code} bukan milik cabang ${branch}.`);
      }
      const links = await this.refs.links(c, u.companyId);
      const d = disposalLines({ cost: Number(a.acquisition_cost), bookValue: Number(a.book_value), proceeds: b.proceeds, assetAccount: a.gl_account_code, accumAccount: links.accumDepreciation,
        bankAccount: bank?.gl_account_code, bank: bank?.code, gainAccount: links.otherIncome, lossAccount: links.otherExpense });
      await postAutoJournal(c, u, { branch, date: b.date, source: 'asset', sourceId: id, rule: 'ASSET_DISPOSAL', ref: a.code, description: `Pelepasan aset ${a.code} — ${a.name}`, lines: d.lines });
      await c.query(`UPDATE assets SET status = 'dihapuskan', disposed_date = $2, disposal_proceeds = $3, disposal_note = $4, book_value = 0 WHERE id = $1`, [id, b.date, b.proceeds, b.note]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'asset.disposed', entityType: 'asset', entityId: a.code, after: { proceeds: b.proceeds, gain: d.gain, note: b.note }, requestId });
      return { ...map({ ...a, status: 'dihapuskan', disposed_date: b.date, disposal_proceeds: b.proceeds, disposal_note: b.note, book_value: 0 }), gain: d.gain };
    });
  }
}
