/**
 * Perintah pemeliharaan aset: dijadwalkan → berjalan → selesai. Saat selesai, biaya
 * jasa dibayar dari rekening (Cr bank) dan suku cadang dikeluarkan dari stok
 * (Cr persediaan); keduanya Dr beban pemeliharaan.
 */
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from '../ledger/ledger.shared.js';
import { usableBank } from '../cash/cash.shared.js';
import { assertBranch, auditTrail, invalid, nextDocNo, postAutoJournal, todayWib, trimBranch, UUID } from '../sales/sales.shared.js';
import { addTo, issueStock, warehouseOf } from '../inventory/stock.shared.js';

export interface MaintenanceInput { assetId: string; kind: 'preventif' | 'korektif'; priority: 'rendah' | 'sedang' | 'tinggi'; assignee?: string; scheduledDate: string; description: string; estimatedCost?: number }
export interface CompleteInput { date?: string; serviceCost: number; bank?: string; parts?: { warehouse: string; sku: string; qty: number }[]; notes?: string }

const STATUS_LABEL: Record<string, string> = { dijadwalkan: 'Dijadwalkan', berjalan: 'Berjalan', selesai: 'Selesai', batal: 'Batal' };
const map = (m: any) => ({
  id: m.id, docNo: m.doc_no, branch: trimBranch(m.branch_code), assetId: m.asset_id, assetCode: m.asset_code, assetName: m.asset_name, kind: m.kind, priority: m.priority,
  assignee: m.assignee, scheduledDate: m.scheduled_date, description: m.description, estimatedCost: Number(m.estimated_cost), status: m.status, statusLabel: STATUS_LABEL[m.status] ?? m.status,
  completedDate: m.completed_date, serviceCost: m.service_cost === null ? null : Number(m.service_cost), partsCost: m.parts_cost === null ? null : Number(m.parts_cost),
  totalCost: m.status === 'selesai' ? Number(m.service_cost ?? 0) + Number(m.parts_cost ?? 0) : null, bank: m.bank_account, legacy: m.legacy, notes: m.notes,
  createdByName: m.created_by_name, completedByName: m.completed_by_name,
});
const SELECT = `SELECT m.*, a.code AS asset_code, a.name AS asset_name FROM maintenance_orders m JOIN assets a ON a.id = m.asset_id`;

@Injectable()
export class MaintenanceService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly refs: LedgerRefs) {}

  async list(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) =>
      (await c.query(`${SELECT} WHERE m.company_id = $1 AND ($2::text IS NULL OR m.branch_code = $2)
          ORDER BY (m.status IN ('dijadwalkan','berjalan')) DESC, m.scheduled_date DESC, m.doc_no DESC LIMIT 1000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(map));
  }

  private async row(c: PoolClient, companyId: string, id: string, lock = false) {
    if (!UUID.test(id)) throw notFound('Perintah pemeliharaan');
    const r = (await c.query(`${SELECT} WHERE m.company_id = $1 AND m.id = $2 ${lock ? 'FOR UPDATE OF m' : ''}`, [companyId, id])).rows[0];
    if (!r) throw notFound('Perintah pemeliharaan');
    return r;
  }

  private async load(c: PoolClient, companyId: string, id: string) {
    const m = await this.row(c, companyId, id);
    const parts = (await c.query(`SELECT p.*, (SELECT name FROM stock_items si WHERE si.company_id = p.company_id AND si.sku = p.sku LIMIT 1) AS name FROM maintenance_parts p WHERE p.order_id = $1 ORDER BY p.id`, [id])).rows
      .map((p: any) => ({ warehouse: p.warehouse_code, sku: p.sku, name: p.name, qty: Number(p.qty), unitCost: Number(p.unit_cost), value: Number(p.value) }));
    const journals = (await c.query(`SELECT id, journal_no, journal_date, rule_code, status, total_debit FROM journals WHERE company_id = $1 AND source_type = 'maintenance_order' AND source_id = $2`, [companyId, id])).rows
      .map((j: any) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, rule: j.rule_code, status: j.status, total: j.total_debit }));
    return { ...map(m), parts, journals, timeline: await auditTrail(c, companyId, 'maintenance_order', m.doc_no) };
  }

  async get(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), (c) => this.load(c, u.companyId, id));
  }

  private log(c: PoolClient, u: RequestUser, m: any, action: string, after: unknown, requestId: string) {
    return this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(m.branch_code), userId: u.id, sessionId: u.sessionId, action: `maintenance.${action}`, entityType: 'maintenance_order', entityId: m.doc_no, after, requestId });
  }

  async create(u: RequestUser, s: ScopeContext, b: MaintenanceInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      if (!UUID.test(b.assetId)) throw invalid('ASSET_UNKNOWN', 'Pilih aset.');
      const a = (await c.query('SELECT * FROM assets WHERE company_id = $1 AND id = $2', [u.companyId, b.assetId])).rows[0];
      if (!a) throw invalid('ASSET_UNKNOWN', 'Aset tidak dikenal.');
      if (a.status !== 'aktif') throw invalid('ASSET_NOT_ACTIVE', `Aset ${a.code} sudah dilepas.`);
      const branch = trimBranch(a.branch_code);
      assertBranch(u, s, branch);
      const docNo = await nextDocNo(c, u.companyId, 'MNT', Number(b.scheduledDate.slice(0, 4)));
      const r = (await c.query(`INSERT INTO maintenance_orders (company_id, branch_code, doc_no, asset_id, kind, priority, assignee, scheduled_date, description, estimated_cost, created_by, created_by_name)
                                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [u.companyId, branch, docNo, a.id, b.kind, b.priority, b.assignee ?? null, b.scheduledDate, b.description, b.estimatedCost ?? 0, u.id, u.name])).rows[0];
      await this.log(c, u, r, 'created', { asset: a.code, kind: b.kind, estimate: b.estimatedCost }, requestId);
      return this.load(c, u.companyId, r.id);
    });
  }

  async start(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const m = await this.row(c, u.companyId, id, true);
      if (m.status !== 'dijadwalkan') throw conflict('MAINT_STATUS', `Perintah ${m.doc_no} berstatus ${STATUS_LABEL[m.status]}.`);
      await c.query(`UPDATE maintenance_orders SET status = 'berjalan' WHERE id = $1`, [id]);
      await this.log(c, u, m, 'started', {}, requestId);
      return this.load(c, u.companyId, id);
    });
  }

  async complete(u: RequestUser, s: ScopeContext, id: string, b: CompleteInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const m = await this.row(c, u.companyId, id, true);
      const branch = trimBranch(m.branch_code);
      assertBranch(u, { ...s, branch: 'ALL' }, branch);
      if (m.status !== 'dijadwalkan' && m.status !== 'berjalan') throw conflict('MAINT_STATUS', `Perintah ${m.doc_no} berstatus ${STATUS_LABEL[m.status]}.`);
      const date = b.date ?? todayWib();
      const links = await this.refs.links(c, u.companyId);
      let bank: any = null;
      if (b.serviceCost > 0) {
        if (!b.bank) throw invalid('MAINT_BANK', 'Pilih rekening pembayaran biaya jasa.');
        bank = await usableBank(c, u.companyId, b.bank, 'Rekening');
        if (bank.branch_code !== branch) throw invalid('BANK_BRANCH', `Rekening ${bank.code} bukan milik cabang ${branch}.`);
      }
      const byAccount = new Map<string, number>();
      let parts = 0;
      for (const p of b.parts ?? []) {
        const wh = await warehouseOf(c, u.companyId, p.warehouse);
        if (wh.branch_code !== branch) throw invalid('WAREHOUSE_BRANCH', `Gudang ${wh.code} bukan milik cabang ${branch}.`);
        const out = await issueStock(c, u, links, { branch, warehouse: wh.code, sku: p.sku, qty: p.qty, date, refType: 'maintenance', refId: id, refNo: m.doc_no });
        await c.query('INSERT INTO maintenance_parts (order_id, company_id, branch_code, warehouse_code, sku, qty, unit_cost, value) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, u.companyId, branch, wh.code, p.sku, p.qty, out.unitCost, out.value]);
        addTo(byAccount, out.account, out.value);
        parts += out.value;
      }
      const total = b.serviceCost + parts;
      if (total <= 0) throw invalid('MAINT_ZERO', 'Isi biaya jasa atau suku cadang yang dipakai.');
      await postAutoJournal(c, u, { branch, date, source: 'maintenance_order', sourceId: id, rule: 'MAINTENANCE', ref: m.doc_no, description: `Pemeliharaan ${m.asset_code} — ${m.description}`,
        lines: [{ account: links.maintenanceExpense, debit: total, credit: 0, memo: null },
          ...(b.serviceCost > 0 ? [{ account: bank.gl_account_code, debit: 0, credit: b.serviceCost, bank: bank.code, memo: 'Biaya jasa' }] : []),
          ...[...byAccount].map(([acc, v]) => ({ account: acc, debit: 0, credit: v, memo: 'Suku cadang dari stok' }))] });
      await c.query(`UPDATE maintenance_orders SET status = 'selesai', completed_date = $2, service_cost = $3, parts_cost = $4, bank_account = $5, notes = coalesce($6, notes), completed_by_name = $7 WHERE id = $1`,
        [id, date, b.serviceCost, parts, bank?.code ?? null, b.notes ?? null, u.name]);
      await this.log(c, u, m, 'completed', { service: b.serviceCost, parts, total }, requestId);
      return this.load(c, u.companyId, id);
    });
  }

  async cancel(u: RequestUser, s: ScopeContext, id: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const m = await this.row(c, u.companyId, id, true);
      if (m.status !== 'dijadwalkan' && m.status !== 'berjalan') throw conflict('MAINT_STATUS', `Perintah ${m.doc_no} berstatus ${STATUS_LABEL[m.status]}.`);
      await c.query(`UPDATE maintenance_orders SET status = 'batal', notes = coalesce(notes || ' — ', '') || $2 WHERE id = $1`, [id, `Batal: ${reason}`]);
      await this.log(c, u, m, 'cancelled', { reason }, requestId);
      return this.load(c, u.companyId, id);
    });
  }
}
