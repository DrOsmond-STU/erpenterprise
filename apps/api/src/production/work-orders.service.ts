/**
 * Perintah kerja: antre → berjalan (pemakaian bahan: Dr WIP / Cr persediaan bahan)
 * → pemeriksaan mutu (lapor qty baik & cacat) → selesai (lolos QC oleh orang lain:
 * Dr persediaan barang jadi / Cr WIP sebesar seluruh saldo WIP perintah kerja).
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { bomRequirement, canMove, round4, signedLine, unitCostOf, usageVariance, type WoStatus } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, DomainError, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from '../ledger/ledger.shared.js';
import { assertBranch, auditTrail, invalid, nextDocNo, postAutoJournal, todayWib, trimBranch, UUID } from '../sales/sales.shared.js';
import { addTo, issueStock, receiveStock, warehouseOf } from '../inventory/stock.shared.js';
import { skuInfo } from './boms.service.js';

export interface WorkOrderInput { bomId: string; warehouse: string; plannedQty: number; date?: string; dueDate?: string; line?: string; pic?: string; notes?: string }
export interface WorkOrderPatch { progress?: number; flag?: string | null; line?: string; pic?: string; dueDate?: string | null; notes?: string }

const STATUS_LABEL: Record<string, string> = { draf: 'Draf', antre: 'Antre', berjalan: 'Berjalan', qc: 'Pemeriksaan mutu', selesai: 'Selesai', batal: 'Batal' };
const map = (w: any) => ({
  id: w.id, docNo: w.doc_no, branch: trimBranch(w.branch_code), bomId: w.bom_id, sku: w.sku, productName: w.product_name, uom: w.uom, plannedQty: Number(w.planned_qty),
  warehouse: w.warehouse_code, line: w.line, pic: w.pic, date: w.wo_date, dueDate: w.due_date, status: w.status, statusLabel: STATUS_LABEL[w.status] ?? w.status,
  progress: w.progress, flag: w.flag, goodQty: w.good_qty === null ? null : Number(w.good_qty), rejectQty: w.reject_qty === null ? null : Number(w.reject_qty),
  issuedValue: Number(w.issued_value), outputValue: Number(w.output_value), wip: Number(w.issued_value) - Number(w.output_value), notes: w.notes,
  qcSubmittedBy: w.qc_submitted_by, qcSubmittedByName: w.qc_submitted_by_name, qcSubmittedAt: w.qc_submitted_at, completedDate: w.completed_date, completedByName: w.completed_by_name, qcNote: w.qc_note,
  cancelReason: w.cancel_reason, createdBy: w.created_by, createdByName: w.created_by_name, createdAt: w.created_at,
});

@Injectable()
export class WorkOrdersService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly refs: LedgerRefs) {}

  async list(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) =>
      (await c.query(`SELECT * FROM work_orders WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2)
          ORDER BY (status IN ('selesai','batal')), coalesce(due_date, wo_date), doc_no DESC LIMIT 2000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(map));
  }

  private async row(c: PoolClient, companyId: string, id: string, lock = false) {
    if (!UUID.test(id)) throw notFound('Perintah kerja');
    const r = (await c.query(`SELECT * FROM work_orders WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id])).rows[0];
    if (!r) throw notFound('Perintah kerja');
    return r;
  }

  private async load(c: PoolClient, companyId: string, id: string) {
    const w = await this.row(c, companyId, id);
    const req: { sku: string; qty: number }[] = w.requirements;
    const cons = (await c.query('SELECT * FROM wo_consumptions WHERE wo_id = $1 ORDER BY issue_no, id', [id])).rows;
    const outs = (await c.query('SELECT * FROM wo_outputs WHERE wo_id = $1 ORDER BY id', [id])).rows;
    const info = await skuInfo(c, companyId, req.map((r) => r.sku));
    const stock = new Map((await c.query('SELECT sku, on_hand FROM stock_items WHERE company_id = $1 AND warehouse_code = $2', [companyId, w.warehouse_code])).rows.map((r: any) => [r.sku, Number(r.on_hand)]));
    const usage = usageVariance(req, cons.map((x: any) => ({ sku: x.sku, qty: Number(x.qty) })));
    const materials = usage.map((m) => ({ ...m, name: info.get(m.sku)?.name ?? m.sku, uom: info.get(m.sku)?.uom ?? '', available: stock.get(m.sku) ?? 0,
      issuedValue: cons.filter((x: any) => x.sku === m.sku).reduce((t: number, x: any) => t + Number(x.value), 0), remaining: round4(Math.max(0, m.standard - m.actual)) }));
    const journals = (await c.query(`SELECT id, journal_no, journal_date, rule_code, status, total_debit FROM journals WHERE company_id = $1 AND source_type = 'work_order' AND source_id = $2 ORDER BY journal_no`, [companyId, id])).rows
      .map((j: any) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, rule: j.rule_code, status: j.status, total: j.total_debit }));
    return {
      ...map(w), materials,
      issues: cons.map((x: any) => ({ id: Number(x.id), issueNo: x.issue_no, date: x.issue_date, sku: x.sku, name: info.get(x.sku)?.name ?? x.sku, qty: Number(x.qty), unitCost: Number(x.unit_cost), value: Number(x.value), byName: x.created_by_name })),
      outputs: outs.map((o: any) => ({ id: Number(o.id), date: o.output_date, goodQty: Number(o.good_qty), rejectQty: Number(o.reject_qty), unitCost: Number(o.unit_cost), value: Number(o.value), byName: o.created_by_name })),
      journals, timeline: await auditTrail(c, companyId, 'work_order', w.doc_no),
    };
  }

  async get(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), (c) => this.load(c, u.companyId, id));
  }

  private transition(w: any, to: WoStatus) {
    if (!canMove(w.status, to)) throw conflict('WO_STATUS', `Perintah kerja ${w.doc_no} berstatus ${STATUS_LABEL[w.status]}; tidak dapat menjadi ${STATUS_LABEL[to]}.`);
  }

  private log(c: PoolClient, u: RequestUser, w: any, action: string, after: unknown, requestId: string) {
    return this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(w.branch_code), userId: u.id, sessionId: u.sessionId, action: `work_order.${action}`, entityType: 'work_order', entityId: w.doc_no, after, requestId });
  }

  async create(u: RequestUser, s: ScopeContext, b: WorkOrderInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      if (!UUID.test(b.bomId)) throw invalid('BOM_UNKNOWN', 'Pilih BOM.');
      const bom = (await c.query('SELECT * FROM boms WHERE company_id = $1 AND id = $2', [u.companyId, b.bomId])).rows[0];
      if (!bom) throw invalid('BOM_UNKNOWN', 'BOM tidak dikenal.');
      if (bom.status !== 'aktif') throw invalid('BOM_INACTIVE', `BOM ${bom.code} nonaktif.`);
      const wh = await warehouseOf(c, u.companyId, b.warehouse);
      assertBranch(u, s, wh.branch_code);
      const lines = (await c.query('SELECT sku, qty FROM bom_lines WHERE bom_id = $1 ORDER BY line_no', [bom.id])).rows.map((l: any) => ({ sku: l.sku, qty: Number(l.qty) }));
      const req = bomRequirement(lines, Number(bom.batch_qty), b.plannedQty);
      const out = (await skuInfo(c, u.companyId, [bom.sku])).get(bom.sku)!;
      const date = b.date ?? todayWib();
      if (b.dueDate && b.dueDate < date) throw invalid('WO_DUE', 'Jatuh tempo tidak boleh sebelum tanggal perintah kerja.');
      const docNo = await nextDocNo(c, u.companyId, 'WO', Number(date.slice(0, 4)));
      const r = (await c.query(
        `INSERT INTO work_orders (company_id, branch_code, doc_no, bom_id, sku, product_name, uom, planned_qty, requirements, warehouse_code, line, pic, wo_date, due_date, status, notes, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'antre',$15,$16,$17) RETURNING *`,
        [u.companyId, wh.branch_code, docNo, bom.id, bom.sku, out.name ?? bom.sku, out.uom ?? 'unit', b.plannedQty, JSON.stringify(req), wh.code, b.line ?? null, b.pic ?? null, date, b.dueDate ?? null, b.notes ?? null, u.id, u.name])).rows[0];
      await this.log(c, u, r, 'created', { bom: bom.code, qty: b.plannedQty, warehouse: wh.code }, requestId);
      return this.load(c, u.companyId, r.id);
    });
  }

  async update(u: RequestUser, s: ScopeContext, id: string, b: WorkOrderPatch, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const w = await this.row(c, u.companyId, id, true);
      if (!['draf', 'antre', 'berjalan'].includes(w.status)) throw conflict('WO_LOCKED', `Perintah kerja ${w.doc_no} berstatus ${STATUS_LABEL[w.status]}.`);
      if (b.progress !== undefined && b.progress >= 100) throw invalid('WO_PROGRESS', 'Kemajuan 100% dicatat lewat “Kirim ke pemeriksaan mutu”.');
      await c.query(`UPDATE work_orders SET progress = coalesce($2, progress), flag = CASE WHEN $3::boolean THEN $4 ELSE flag END, line = coalesce($5, line), pic = coalesce($6, pic),
                       due_date = CASE WHEN $7::boolean THEN $8::date ELSE due_date END, notes = coalesce($9, notes), updated_at = now() WHERE id = $1`,
        [id, b.progress ?? null, b.flag !== undefined, b.flag || null, b.line ?? null, b.pic ?? null, b.dueDate !== undefined, b.dueDate || null, b.notes ?? null]);
      await this.log(c, u, w, 'updated', b, requestId);
      return this.load(c, u.companyId, id);
    });
  }

  /** Keluarkan bahan dari gudang perintah kerja; default = sisa kebutuhan standar. */
  async issue(u: RequestUser, s: ScopeContext, id: string, b: { date?: string; lines?: { sku: string; qty: number }[] }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const w = await this.row(c, u.companyId, id, true);
      const branch = trimBranch(w.branch_code);
      assertBranch(u, { ...s, branch: 'ALL' }, branch);
      if (w.status !== 'antre' && w.status !== 'berjalan') throw conflict('WO_STATUS', `Bahan hanya dapat dikeluarkan untuk perintah kerja antre/berjalan (${w.doc_no}: ${STATUS_LABEL[w.status]}).`);
      const date = b.date ?? todayWib();
      if (date < w.wo_date) throw invalid('ISSUE_DATE', 'Tanggal pemakaian tidak boleh sebelum tanggal perintah kerja.');
      const done = (await c.query('SELECT sku, sum(qty) AS q, max(issue_no) AS n FROM wo_consumptions WHERE wo_id = $1 GROUP BY sku', [id])).rows;
      const issued = new Map(done.map((r: any) => [r.sku, Number(r.q)]));
      const issueNo = Math.max(0, ...done.map((r: any) => Number(r.n))) + 1;
      const req: { sku: string; qty: number }[] = w.requirements;
      let lines = b.lines?.filter((l) => l.qty > 0) ?? req.map((r) => ({ sku: r.sku, qty: round4(r.qty - (issued.get(r.sku) ?? 0)) })).filter((l) => l.qty > 0);
      if (!lines.length) throw invalid('ISSUE_EMPTY', 'Tidak ada bahan yang perlu dikeluarkan.');
      const allowed = new Set(req.map((r) => r.sku));
      for (const l of lines) if (!allowed.has(l.sku)) throw invalid('ISSUE_NOT_IN_BOM', `${l.sku} bukan bahan dalam BOM perintah kerja ini.`);
      const seen = new Set<string>();
      lines = lines.filter((l) => (seen.has(l.sku) ? false : (seen.add(l.sku), true)));
      const links = await this.refs.links(c, u.companyId);
      const byAccount = new Map<string, number>();
      let total = 0;
      for (const l of lines) {
        const out = await issueStock(c, u, links, { branch, warehouse: w.warehouse_code, sku: l.sku, qty: l.qty, date, refType: 'production_issue', refId: id, refNo: w.doc_no });
        await c.query(`INSERT INTO wo_consumptions (wo_id, company_id, branch_code, issue_no, issue_date, sku, qty, unit_cost, value, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [id, u.companyId, branch, issueNo, date, l.sku, l.qty, out.unitCost, out.value, u.name]);
        addTo(byAccount, out.account, out.value);
        total += out.value;
      }
      if (total) {
        await postAutoJournal(c, u, { branch, date, source: 'work_order', sourceId: id, rule: `WO_ISSUE_${issueNo}`, ref: w.doc_no, description: `Pemakaian bahan ${w.doc_no} #${issueNo} — ${w.product_name}`,
          lines: [{ account: links.invWip, debit: total, credit: 0, memo: null }, ...[...byAccount].map(([acc, v]) => signedLine(acc, -v))] });
      }
      await c.query(`UPDATE work_orders SET status = 'berjalan', issued_value = issued_value + $2, progress = greatest(progress, 10), updated_at = now() WHERE id = $1`, [id, total]);
      await this.log(c, u, w, 'issued', { issueNo, value: total, lines }, requestId);
      return this.load(c, u.companyId, id);
    });
  }

  async submitQc(u: RequestUser, s: ScopeContext, id: string, b: { goodQty: number; rejectQty: number; note?: string }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const w = await this.row(c, u.companyId, id, true);
      assertBranch(u, { ...s, branch: 'ALL' }, trimBranch(w.branch_code));
      this.transition(w, 'qc');
      if (Number(w.issued_value) <= 0) throw invalid('WO_NO_MATERIAL', 'Belum ada bahan yang dikeluarkan untuk perintah kerja ini.');
      await c.query(`UPDATE work_orders SET status = 'qc', progress = 100, good_qty = $2, reject_qty = $3, qc_submitted_by = $4, qc_submitted_by_name = $5, qc_submitted_at = now(), qc_note = $6, updated_at = now() WHERE id = $1`,
        [id, b.goodQty, b.rejectQty, u.id, u.name, b.note ?? null]);
      await this.log(c, u, w, 'qc_submitted', { goodQty: b.goodQty, rejectQty: b.rejectQty, note: b.note }, requestId);
      return this.load(c, u.companyId, id);
    });
  }

  /** Lolos QC: barang jadi masuk gudang senilai seluruh saldo WIP perintah kerja. */
  async complete(u: RequestUser, s: ScopeContext, id: string, b: { date?: string; note?: string }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const w = await this.row(c, u.companyId, id, true);
      const branch = trimBranch(w.branch_code);
      assertBranch(u, { ...s, branch: 'ALL' }, branch);
      this.transition(w, 'selesai');
      if (w.qc_submitted_by === u.id) throw new DomainError('SOD_WORK_ORDER', 'Pelapor hasil produksi tidak boleh meloloskan QC-nya sendiri (kontrol empat mata).', HttpStatus.FORBIDDEN);
      const date = b.date ?? todayWib();
      const lastIssue = (await c.query('SELECT max(issue_date) AS d FROM wo_consumptions WHERE wo_id = $1', [id])).rows[0].d;
      if (lastIssue && date < lastIssue) throw invalid('COMPLETE_DATE', 'Tanggal selesai tidak boleh sebelum pemakaian bahan terakhir.');
      const links = await this.refs.links(c, u.companyId);
      const wip = Number(w.issued_value) - Number(w.output_value);
      const good = Number(w.good_qty);
      const tpl = (await c.query('SELECT name, category, uom FROM stock_items WHERE company_id = $1 AND sku = $2 LIMIT 1', [u.companyId, w.sku])).rows[0]
        ?? { name: w.product_name, category: 'Barang jadi', uom: w.uom };
      const inn = await receiveStock(c, u, links, { branch, warehouse: w.warehouse_code, sku: w.sku, qty: good, value: wip, date, refType: 'production_output', refId: id, refNo: w.doc_no, template: tpl });
      await c.query(`INSERT INTO wo_outputs (wo_id, company_id, branch_code, output_date, good_qty, reject_qty, unit_cost, value, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, u.companyId, branch, date, good, Number(w.reject_qty ?? 0), unitCostOf(wip, good), wip, u.name]);
      await postAutoJournal(c, u, { branch, date, source: 'work_order', sourceId: id, rule: 'WO_OUTPUT', ref: w.doc_no, description: `Hasil produksi ${w.doc_no} — ${good.toLocaleString('id-ID')} ${w.uom} ${w.product_name}`,
        lines: [signedLine(inn.account, inn.delta), signedLine(links.invVariance, inn.variance, 'Selisih pembulatan harga pokok'), { account: links.invWip, debit: 0, credit: wip, memo: null }] });
      await c.query(`UPDATE work_orders SET status = 'selesai', output_value = output_value + $2, completed_date = $3, completed_by = $4, completed_by_name = $5, qc_note = coalesce($6, qc_note), flag = NULL, updated_at = now() WHERE id = $1`,
        [id, wip, date, u.id, u.name, b.note ?? null]);
      await this.log(c, u, w, 'completed', { goodQty: good, value: wip, note: b.note }, requestId);
      return this.load(c, u.companyId, id);
    });
  }

  /** QC tidak lolos: kembali berjalan (pengerjaan ulang). */
  async rework(u: RequestUser, s: ScopeContext, id: string, note: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const w = await this.row(c, u.companyId, id, true);
      assertBranch(u, { ...s, branch: 'ALL' }, trimBranch(w.branch_code));
      this.transition(w, 'berjalan');
      await c.query(`UPDATE work_orders SET status = 'berjalan', progress = 90, flag = $2, qc_note = $2, qc_submitted_by = NULL, qc_submitted_by_name = NULL, qc_submitted_at = NULL, updated_at = now() WHERE id = $1`, [id, `QC: ${note}`]);
      await this.log(c, u, w, 'qc_rejected', { note }, requestId);
      return this.load(c, u.companyId, id);
    });
  }

  async cancel(u: RequestUser, s: ScopeContext, id: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const w = await this.row(c, u.companyId, id, true);
      assertBranch(u, { ...s, branch: 'ALL' }, trimBranch(w.branch_code));
      this.transition(w, 'batal');
      if (Number(w.issued_value) > 0) throw conflict('WO_HAS_WIP', 'Bahan sudah dikeluarkan; selesaikan perintah kerja ini.');
      await c.query(`UPDATE work_orders SET status = 'batal', cancel_reason = $2, updated_at = now() WHERE id = $1`, [id, reason]);
      await this.log(c, u, w, 'cancelled', { reason }, requestId);
      return this.load(c, u.companyId, id);
    });
  }
}
