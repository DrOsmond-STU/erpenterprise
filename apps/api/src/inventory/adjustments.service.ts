/**
 * Penyesuaian / opname stok: gudang mencatat hasil hitung fisik (atau barang
 * rusak/hilang), orang lain menyetujui. Saat diposting, selisih = hitung fisik −
 * stok sistem saat itu, dinilai dengan harga pokok rata-rata; jurnal Dr/Cr
 * persediaan ↔ selisih persediaan.
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { countDifference, signedLine } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, DomainError, forbidden, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from '../ledger/ledger.shared.js';
import { auditTrail, invalid, nextDocNo, postAutoJournal, todayWib, trimBranch, UUID } from '../sales/sales.shared.js';
import { addTo, inventoryAccount, lockItem, warehouseOf } from './stock.shared.js';

export interface AdjustmentInput { warehouse: string; date?: string; reason: 'opname' | 'rusak' | 'hilang' | 'koreksi'; notes?: string; lines: { sku: string; countedQty: number; note?: string }[] }

const STATUS_LABEL: Record<string, string> = { menunggu: 'Menunggu persetujuan', diposting: 'Diposting', ditolak: 'Ditolak', batal: 'Batal' };
const REASON_LABEL: Record<string, string> = { opname: 'Stok opname', rusak: 'Barang rusak', hilang: 'Barang hilang', koreksi: 'Koreksi' };

const mapAdj = (a: any) => ({
  id: a.id, docNo: a.doc_no, branch: trimBranch(a.branch_code), warehouse: a.warehouse_code, date: a.adj_date, reason: a.reason, reasonLabel: REASON_LABEL[a.reason] ?? a.reason,
  notes: a.notes, status: a.status, statusLabel: STATUS_LABEL[a.status] ?? a.status, totalValue: Number(a.total_value), lineCount: a.line_count ?? undefined,
  createdBy: a.created_by, createdByName: a.created_by_name, createdAt: a.created_at, decidedByName: a.decided_by_name, decidedAt: a.decided_at, decisionNote: a.decision_note,
});

@Injectable()
export class StockAdjustmentsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly refs: LedgerRefs) {}

  async list(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) =>
      (await c.query(`SELECT a.*, (SELECT count(*)::int FROM stock_adjustment_lines l WHERE l.adjustment_id = a.id) AS line_count FROM stock_adjustments a
          WHERE a.company_id = $1 AND ($2::text IS NULL OR a.branch_code = $2) ORDER BY (a.status = 'menunggu') DESC, a.adj_date DESC, a.doc_no DESC LIMIT 2000`,
        [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(mapAdj));
  }

  private async row(c: PoolClient, companyId: string, id: string, lock = false) {
    if (!UUID.test(id)) throw notFound('Penyesuaian stok');
    const r = (await c.query(`SELECT * FROM stock_adjustments WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id])).rows[0];
    if (!r) throw notFound('Penyesuaian stok');
    return r;
  }

  private async load(c: PoolClient, companyId: string, id: string) {
    const a = await this.row(c, companyId, id);
    const lines = (await c.query(
      `SELECT l.*, si.name, si.uom, si.on_hand, si.avg_cost FROM stock_adjustment_lines l
         LEFT JOIN stock_items si ON si.company_id = l.company_id AND si.branch_code = l.branch_code AND si.warehouse_code = $2 AND si.sku = l.sku
        WHERE l.adjustment_id = $1 ORDER BY l.line_no`, [id, a.warehouse_code])).rows.map((l: any) => {
      const posted = l.system_qty !== null;
      const sys = posted ? Number(l.system_qty) : Number(l.on_hand ?? 0);
      const est = posted ? { diff: Number(l.diff_qty), value: Number(l.value) } : countDifference(sys, Number(l.counted_qty), Number(l.avg_cost ?? 0));
      return { id: Number(l.id), lineNo: l.line_no, sku: l.sku, name: l.name, uom: l.uom, countedQty: Number(l.counted_qty), systemQty: sys, diffQty: est.diff, unitCost: posted ? Number(l.unit_cost) : Number(l.avg_cost ?? 0), value: est.value, note: l.note, estimate: !posted };
    });
    const journals = (await c.query(`SELECT id, journal_no, journal_date, status, total_debit FROM journals WHERE company_id = $1 AND source_type = 'stock_adjustment' AND source_id = $2 ORDER BY journal_no`, [companyId, id])).rows
      .map((j: any) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, status: j.status, total: j.total_debit }));
    return { ...mapAdj(a), lines, estimatedValue: lines.reduce((t: number, l: any) => t + l.value, 0), journals, timeline: await auditTrail(c, companyId, 'stock_adjustment', a.doc_no) };
  }

  async get(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), (c) => this.load(c, u.companyId, id));
  }

  async create(u: RequestUser, s: ScopeContext, b: AdjustmentInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const wh = await warehouseOf(c, u.companyId, b.warehouse);
      if (s.branch !== 'ALL' && wh.branch_code !== s.branch) throw forbidden(`Gudang ${wh.code} milik cabang ${wh.branch_code}.`);
      if (u.branches !== '*' && !u.branches.includes(wh.branch_code)) throw forbidden(`Anda tidak memiliki akses ke cabang ${wh.branch_code}.`);
      const seen = new Set<string>();
      for (const l of b.lines) {
        if (seen.has(l.sku)) throw invalid('ADJ_DUP_SKU', `SKU ${l.sku} tercantum lebih dari sekali.`);
        seen.add(l.sku);
        const it = (await c.query('SELECT on_hand FROM stock_items WHERE company_id = $1 AND branch_code = $2 AND warehouse_code = $3 AND sku = $4', [u.companyId, wh.branch_code, wh.code, l.sku])).rows[0];
        if (!it) throw invalid('STOCK_ITEM_UNKNOWN', `SKU ${l.sku} tidak ada di gudang ${wh.code}.`);
        if (b.reason !== 'opname' && b.reason !== 'koreksi' && l.countedQty > Number(it.on_hand)) throw invalid('ADJ_REASON_QTY', `${REASON_LABEL[b.reason]} hanya dapat mengurangi stok (${l.sku}).`);
      }
      const date = b.date ?? todayWib();
      const docNo = await nextDocNo(c, u.companyId, 'ADJ', Number(date.slice(0, 4)));
      const a = (await c.query(
        `INSERT INTO stock_adjustments (company_id, branch_code, warehouse_code, doc_no, adj_date, reason, notes, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [u.companyId, wh.branch_code, wh.code, docNo, date, b.reason, b.notes ?? null, u.id, u.name])).rows[0];
      let n = 0;
      for (const l of b.lines) {
        n += 1;
        await c.query(`INSERT INTO stock_adjustment_lines (adjustment_id, company_id, branch_code, line_no, sku, counted_qty, note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [a.id, u.companyId, wh.branch_code, n, l.sku, l.countedQty, l.note ?? null]);
      }
      await this.audit.record(c, { companyId: u.companyId, branchCode: wh.branch_code, userId: u.id, sessionId: u.sessionId, action: 'stock_adjustment.created', entityType: 'stock_adjustment', entityId: docNo,
        after: { warehouse: wh.code, reason: b.reason, lines: b.lines.length }, requestId });
      return this.load(c, u.companyId, a.id);
    });
  }

  async approve(u: RequestUser, s: ScopeContext, id: string, note: string | undefined, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const a = await this.row(c, u.companyId, id, true);
      if (a.status !== 'menunggu') throw conflict('ADJ_NOT_PENDING', `Penyesuaian ${a.doc_no} tidak sedang menunggu persetujuan.`);
      if (a.created_by === u.id) throw new DomainError('SOD_STOCK_ADJUSTMENT', 'Pembuat penyesuaian stok tidak boleh menyetujuinya sendiri (kontrol empat mata).', HttpStatus.FORBIDDEN);
      const branch = trimBranch(a.branch_code);
      const links = await this.refs.links(c, u.companyId);
      const lines = (await c.query('SELECT * FROM stock_adjustment_lines WHERE adjustment_id = $1 ORDER BY line_no FOR UPDATE', [id])).rows;
      const byAccount = new Map<string, number>();
      let total = 0;
      for (const l of lines) {
        const item = await lockItem(c, u.companyId, branch, a.warehouse_code, l.sku);
        if (!item) throw invalid('STOCK_ITEM_UNKNOWN', `SKU ${l.sku} tidak ada lagi di gudang ${a.warehouse_code}.`);
        const avg = Number(item.avg_cost);
        const { diff, value } = countDifference(Number(item.on_hand), Number(l.counted_qty), avg);
        await c.query('UPDATE stock_adjustment_lines SET system_qty = $2, diff_qty = $3, unit_cost = $4, value = $5 WHERE id = $1', [l.id, item.on_hand, diff, avg, value]);
        if (diff === 0) continue;
        await c.query('UPDATE stock_items SET on_hand = $2 WHERE id = $1', [item.id, l.counted_qty]);
        await c.query(`INSERT INTO stock_moves (company_id, branch_code, warehouse_code, sku, move_date, qty, unit_cost, ref_type, ref_id, ref_no, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'adjustment',$8,$9,$10)`,
          [u.companyId, branch, a.warehouse_code, l.sku, a.adj_date, diff, avg, id, a.doc_no, u.id]);
        addTo(byAccount, inventoryAccount(item.category, links), value);
        total += value;
      }
      if ([...byAccount.values()].some((v) => v !== 0)) {
        await postAutoJournal(c, u, { branch, date: a.adj_date, source: 'stock_adjustment', sourceId: id, rule: 'STOCK_ADJUSTMENT', ref: a.doc_no,
          description: `${REASON_LABEL[a.reason]} ${a.doc_no} — gudang ${a.warehouse_code}`,
          lines: [...[...byAccount].map(([acc, v]) => signedLine(acc, v)), signedLine(links.invVariance, -total, 'Selisih persediaan')] });
      }
      await c.query(`UPDATE stock_adjustments SET status = 'diposting', total_value = $2, decided_by = $3, decided_by_name = $4, decided_at = now(), decision_note = $5 WHERE id = $1`, [id, total, u.id, u.name, note ?? null]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'stock_adjustment.posted', entityType: 'stock_adjustment', entityId: a.doc_no, after: { value: total, note }, requestId });
      return this.load(c, u.companyId, id);
    });
  }

  async reject(u: RequestUser, s: ScopeContext, id: string, note: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const a = await this.row(c, u.companyId, id, true);
      if (a.status !== 'menunggu') throw conflict('ADJ_NOT_PENDING', `Penyesuaian ${a.doc_no} tidak sedang menunggu persetujuan.`);
      if (a.created_by === u.id) throw new DomainError('SOD_STOCK_ADJUSTMENT', 'Pembuat tidak dapat menolak penyesuaiannya sendiri — gunakan pembatalan.', HttpStatus.FORBIDDEN);
      await c.query(`UPDATE stock_adjustments SET status = 'ditolak', decided_by = $2, decided_by_name = $3, decided_at = now(), decision_note = $4 WHERE id = $1`, [id, u.id, u.name, note]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(a.branch_code), userId: u.id, sessionId: u.sessionId, action: 'stock_adjustment.rejected', entityType: 'stock_adjustment', entityId: a.doc_no, after: { note }, requestId });
      return this.load(c, u.companyId, id);
    });
  }

  async cancel(u: RequestUser, s: ScopeContext, id: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const a = await this.row(c, u.companyId, id, true);
      if (a.status !== 'menunggu') throw conflict('ADJ_LOCKED', `Penyesuaian ${a.doc_no} berstatus ${STATUS_LABEL[a.status]}.`);
      if (a.created_by !== u.id && !u.permissions.has('inventory.adjust.approve')) throw forbidden('Hanya pembuat atau penyetuju yang dapat membatalkan.');
      await c.query(`UPDATE stock_adjustments SET status = 'batal', decision_note = $2 WHERE id = $1`, [id, reason]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(a.branch_code), userId: u.id, sessionId: u.sessionId, action: 'stock_adjustment.cancelled', entityType: 'stock_adjustment', entityId: a.doc_no, after: { reason }, requestId });
      return this.load(c, u.companyId, id);
    });
  }
}
