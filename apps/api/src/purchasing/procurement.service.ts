/**
 * Pengadaan (dok. 07 §6.1–6.2): permintaan pembelian (PR) dari unit kerja →
 * persetujuan (pemohon ≠ penyetuju, SLA menurut prioritas) → langsung PO atau
 * RFQ ke minimal dua pemasok → penawaran → pemenang (harga terbaik, selain itu
 * beralasan) → PO. PR/RFQ tidak menjurnal; PO hasil konversi mengikuti alur PO
 * biasa (ambang persetujuan, penerimaan → persediaan/GRNI, tagihan → utang).
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { addDays, awardProblems, bestQuote, expenseAccountProblem, MIN_RFQ_VENDORS, quoteTotals, slaDue, type PrPriority, type QuotePrice } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, DomainError, forbidden, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { mapAccount } from '../ledger/ledger.shared.js';
import { assertBranch, auditTrail, invalid, nextDocNo, todayWib, trimBranch, UUID } from '../sales/sales.shared.js';
import { budgetAvailability } from '../planning/budget.shared.js';
import { assertProject } from '../planning/project.shared.js';
import { resolvePoLines, type PoLineInput } from './lines.js';
import { PurchaseOrdersService } from './orders.service.js';

export interface PrInput {
  branch?: string; requestDate?: string; neededDate?: string | null; department?: string; requesterName?: string; description?: string;
  priority?: PrPriority; notes?: string; lines?: PoLineInput[]; submit?: boolean; projectId?: string | null;
}
export interface RfqInput { requisitionId: string; title?: string; date?: string; deadline: string; supplierIds: string[] }
export interface QuoteInput { supplierId: string; declined?: boolean; quoteRef?: string; quoteDate?: string; leadDays?: number; validUntil?: string | null; notes?: string; prices?: QuotePrice[] }

const PR_LABEL: Record<string, string> = { draf: 'Draf', menunggu: 'Menunggu persetujuan', disetujui: 'Disetujui', ditolak: 'Ditolak', selesai: 'Selesai — sudah menjadi PO', batal: 'Batal' };
const RFQ_LABEL: Record<string, string> = { terbuka: 'Terbuka — menunggu penawaran', dipesan: 'Pemenang dipilih — PO dibuat', batal: 'Batal' };

const mapPr = (r: any) => ({
  id: r.id, docNo: r.doc_no, branch: trimBranch(r.branch_code), date: r.request_date, neededDate: r.needed_date, department: r.department, requesterName: r.requester_name,
  description: r.description, priority: r.priority, status: r.status, statusLabel: PR_LABEL[r.status] ?? r.status, estimatedTotal: Number(r.estimated_total), notes: r.notes,
  submittedAt: r.submitted_at, slaDueAt: r.sla_due_at, slaOverdue: r.status === 'menunggu' && r.sla_due_at && new Date(r.sla_due_at).getTime() < Date.now(),
  createdBy: r.created_by, createdByName: r.created_by_name, decidedByName: r.decided_by_name, decidedAt: r.decided_at, decisionNote: r.decision_note,
  rfqId: r.rfq_id, rfqNo: r.rfq_no ?? null, rfqStatus: r.rfq_status ?? null, orderId: r.order_id, orderNo: r.order_no ?? null, orderStatus: r.order_status ?? null,
  lineCount: r.line_count ?? undefined, createdAt: r.created_at, projectId: r.project_id ?? null, projectCode: r.project_code ?? null,
});
const PR_SELECT = `SELECT r.*, q.doc_no AS rfq_no, q.status AS rfq_status, o.doc_no AS order_no, o.status AS order_status, (SELECT pj.code FROM projects pj WHERE pj.id = r.project_id) AS project_code,
  (SELECT count(*)::int FROM purchase_requisition_lines l WHERE l.requisition_id = r.id) AS line_count
  FROM purchase_requisitions r LEFT JOIN rfqs q ON q.id = r.rfq_id LEFT JOIN purchase_orders o ON o.id = r.order_id`;
const mapPrLine = (l: any) => ({
  id: Number(l.id), lineNo: l.line_no, productId: l.product_id, sku: l.sku, description: l.description, kind: l.kind, expenseAccount: l.expense_account_code,
  qty: Number(l.qty), unit: l.unit, estPrice: Number(l.est_price), estTotal: Number(l.est_total),
});

const mapRfq = (r: any) => ({
  id: r.id, docNo: r.doc_no, branch: trimBranch(r.branch_code), requisitionId: r.requisition_id, requisitionNo: r.requisition_no, title: r.title, date: r.rfq_date, deadline: r.deadline,
  status: r.status, statusLabel: RFQ_LABEL[r.status] ?? r.status, awardedQuoteId: r.awarded_quote_id, awardReason: r.award_reason, orderId: r.order_id, orderNo: r.order_no ?? null,
  cancelReason: r.cancel_reason, createdBy: r.created_by, createdByName: r.created_by_name, awardedByName: r.awarded_by_name, awardedAt: r.awarded_at, createdAt: r.created_at,
  invited: r.invited ?? undefined, received: r.received ?? undefined, bestTotal: r.best_total === null || r.best_total === undefined ? null : Number(r.best_total), bestSupplier: r.best_supplier ?? null,
  overdue: r.status === 'terbuka' && r.deadline < todayWib(),
});
const RFQ_SELECT = `SELECT q.*, pr.doc_no AS requisition_no, o.doc_no AS order_no,
  (SELECT count(*)::int FROM rfq_quotes x WHERE x.rfq_id = q.id) AS invited,
  (SELECT count(*)::int FROM rfq_quotes x WHERE x.rfq_id = q.id AND x.status = 'masuk') AS received,
  (SELECT min(x.total) FROM rfq_quotes x WHERE x.rfq_id = q.id AND x.status = 'masuk') AS best_total,
  (SELECT s.name FROM rfq_quotes x JOIN suppliers s ON s.id = x.supplier_id WHERE x.rfq_id = q.id AND x.status = 'masuk' ORDER BY x.total, s.name LIMIT 1) AS best_supplier
  FROM rfqs q JOIN purchase_requisitions pr ON pr.id = q.requisition_id LEFT JOIN purchase_orders o ON o.id = q.order_id`;
const mapQuote = (x: any) => ({
  id: x.id, supplierId: x.supplier_id, supplierName: x.supplier_name, supplierCode: x.supplier_code, supplierStatus: x.supplier_status, status: x.status, quoteRef: x.quote_ref,
  quoteDate: x.quote_date, leadDays: x.lead_days, validUntil: x.valid_until, prices: x.prices ?? [], net: x.net_amount === null ? null : Number(x.net_amount),
  ppn: x.ppn_amount === null ? null : Number(x.ppn_amount), total: x.total === null ? null : Number(x.total), notes: x.notes, enteredByName: x.entered_by_name, enteredAt: x.entered_at,
});

@Injectable()
export class ProcurementService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly orders: PurchaseOrdersService) {}

  private rec(c: PoolClient, u: RequestUser, branch: string, action: string, entityType: string, entityId: string, after: unknown, requestId: string) {
    return this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action, entityType, entityId, after, requestId });
  }

  /** Barang berstok aktif (dengan stok per cabang) dan akun biaya detail untuk formulir PR — tanpa izin penjualan/buku besar. */
  async catalog(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const products = (await c.query(
        `SELECT p.id, p.sku, p.name, p.unit, p.price, p.kind, p.status,
                coalesce((SELECT json_agg(json_build_object('branch', trim(st.branch_code), 'onHand', st.on_hand, 'avgCost', st.avg_cost)) FROM stock_items st WHERE st.company_id = p.company_id AND st.sku = p.sku), '[]') AS stock
           FROM products p WHERE p.company_id = $1 AND p.kind = 'barang' AND p.status = 'aktif' ORDER BY p.sku`, [u.companyId])).rows
        .map((p: any) => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit, price: Number(p.price), kind: p.kind, status: p.status, stock: p.stock }));
      const accounts = (await c.query(`SELECT * FROM chart_of_accounts WHERE company_id = $1 AND type = 'detail' AND status = 'aktif' AND category IN ('Beban','Aset') ORDER BY code`, [u.companyId])).rows
        .map(mapAccount).filter((a: any) => !expenseAccountProblem(a)).map((a: any) => ({ code: a.code, name: a.name, category: a.category }));
      const departments = (await c.query(`SELECT DISTINCT department FROM purchase_requisitions WHERE company_id = $1 UNION SELECT DISTINCT dept FROM employees WHERE company_id = $1 AND dept IS NOT NULL ORDER BY 1`, [u.companyId])).rows.map((r: any) => r.department);
      return { products, accounts, departments };
    });
  }

  /* ------------------------------ Permintaan pembelian ------------------------------ */

  async listRequisitions(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) =>
      (await c.query(`${PR_SELECT} WHERE r.company_id = $1 AND ($2::text IS NULL OR r.branch_code = $2) ORDER BY r.request_date DESC, r.doc_no DESC LIMIT 5000`,
        [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(mapPr));
  }

  private async prRow(c: PoolClient, companyId: string, id: string, lock = false) {
    if (!UUID.test(id)) throw notFound('Permintaan pembelian');
    if (lock) await c.query('SELECT 1 FROM purchase_requisitions WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
    const r = (await c.query(`${PR_SELECT} WHERE r.company_id = $1 AND r.id = $2`, [companyId, id])).rows[0];
    if (!r) throw notFound('Permintaan pembelian');
    return r;
  }

  private async prLines(c: PoolClient, id: string) {
    return (await c.query('SELECT * FROM purchase_requisition_lines WHERE requisition_id = $1 ORDER BY line_no', [id])).rows.map(mapPrLine);
  }

  async loadRequisition(c: PoolClient, companyId: string, id: string) {
    const r = await this.prRow(c, companyId, id);
    const rfqs = (await c.query(`${RFQ_SELECT} WHERE q.company_id = $1 AND q.requisition_id = $2 ORDER BY q.created_at`, [companyId, id])).rows.map(mapRfq);
    const lines = await this.prLines(c, id);
    /* Cek anggaran baris jasa: sisa anggaran disetujui akun itu (cabang & tahun PR); PR yang belum disetujui belum termasuk komitmen. */
    const request = new Map<string, number>();
    for (const l of lines) if (l.kind === 'jasa' && l.expenseAccount) request.set(l.expenseAccount, (request.get(l.expenseAccount) ?? 0) + l.estTotal);
    const avail = request.size ? await budgetAvailability(c, companyId, trimBranch(r.branch_code), Number(String(r.request_date).slice(0, 4)), [...request.keys()]) : [];
    const pendingOwn = ['draf', 'menunggu', 'ditolak'].includes(r.status);
    const budgetCheck = [...request].map(([account, amount]) => {
      const a = avail.find((x) => x.account === account);
      if (!a) return { account, request: amount, budgeted: false };
      const after = a.available - (pendingOwn ? amount : 0);
      return { account, request: amount, budgeted: true, budget: a.budget, actual: a.actual, commitment: a.commitment, available: a.available, afterRequest: after, over: after < 0 };
    });
    return { ...mapPr(r), lines, rfqs, budgetCheck, timeline: await auditTrail(c, companyId, 'purchase_requisition', r.doc_no) };
  }

  async getRequisition(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), (c) => this.loadRequisition(c, u.companyId, id));
  }

  private async writeLines(c: PoolClient, companyId: string, id: string, branch: string, input: PoLineInput[]) {
    const { lines, totals } = await resolvePoLines(c, companyId, branch, input.map((l) => ({ ...l, discPct: 0 })));
    await c.query('DELETE FROM purchase_requisition_lines WHERE requisition_id = $1', [id]);
    let n = 0;
    for (const l of lines) {
      n += 1;
      await c.query(
        `INSERT INTO purchase_requisition_lines (requisition_id, company_id, branch_code, line_no, product_id, sku, description, kind, expense_account_code, qty, unit, est_price, est_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [id, companyId, branch, n, l.productId, l.sku, l.description, l.kind, l.expenseAccount, l.qty, l.unit, l.price, l.net]);
    }
    await c.query('UPDATE purchase_requisitions SET estimated_total = $2 WHERE id = $1', [id, totals.net]);
    return totals.net;
  }

  async createRequisition(u: RequestUser, s: ScopeContext, b: PrInput, requestId: string) {
    const branch = String(b.branch ?? (s.branch === 'ALL' ? '' : s.branch)).toUpperCase();
    if (!/^[A-Z]{3}$/.test(branch)) throw invalid('BRANCH_REQUIRED', 'Pilih cabang permintaan.');
    assertBranch(u, s, branch);
    if (!b.description?.trim()) throw invalid('DESCRIPTION_REQUIRED', 'Isi keperluan / deskripsi permintaan.');
    if (!b.department?.trim()) throw invalid('DEPARTMENT_REQUIRED', 'Isi departemen pemohon.');
    const date = b.requestDate ?? todayWib();
    if (b.neededDate && b.neededDate < date) throw invalid('NEEDED_DATE', 'Tanggal dibutuhkan tidak boleh sebelum tanggal permintaan.');
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const br = (await c.query('SELECT status FROM branches WHERE company_id = $1 AND code = $2', [u.companyId, branch])).rows[0];
      if (!br || br.status !== 'aktif') throw invalid('BRANCH_INACTIVE', `Cabang ${branch} tidak aktif.`);
      const projectId = await assertProject(c, u.companyId, b.projectId, branch);
      const docNo = await nextDocNo(c, u.companyId, 'PR', Number(date.slice(0, 4)));
      const r = (await c.query(
        `INSERT INTO purchase_requisitions (company_id, branch_code, doc_no, request_date, needed_date, department, requester_name, description, priority, notes, created_by, created_by_name, project_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [u.companyId, branch, docNo, date, b.neededDate ?? null, b.department!.trim(), (b.requesterName?.trim() || u.name), b.description!.trim(), b.priority ?? 'sedang', b.notes ?? null, u.id, u.name, projectId])).rows[0];
      const est = await this.writeLines(c, u.companyId, r.id, branch, b.lines ?? []);
      await this.rec(c, u, branch, 'purchase_requisition.created', 'purchase_requisition', docNo, { estimated: est, priority: b.priority ?? 'sedang' }, requestId);
      if (b.submit) await this.doSubmit(c, u, r.id, requestId);
      return this.loadRequisition(c, u.companyId, r.id);
    });
  }

  async updateRequisition(u: RequestUser, s: ScopeContext, id: string, b: PrInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const r = await this.prRow(c, u.companyId, id, true);
      if (!['draf', 'ditolak'].includes(r.status)) throw conflict('PR_LOCKED', `${r.doc_no} berstatus ${PR_LABEL[r.status]}; hanya draf atau PR ditolak yang dapat diubah.`);
      if (r.created_by !== u.id) throw forbidden('Hanya pemohon yang dapat mengubah permintaannya.');
      const date = b.requestDate ?? r.request_date;
      if ((b.neededDate ?? r.needed_date) && (b.neededDate ?? r.needed_date) < date) throw invalid('NEEDED_DATE', 'Tanggal dibutuhkan tidak boleh sebelum tanggal permintaan.');
      await c.query(
        `UPDATE purchase_requisitions SET request_date = $2, needed_date = $3, department = coalesce($4, department), requester_name = coalesce($5, requester_name),
            description = coalesce($6, description), priority = coalesce($7, priority), notes = coalesce($8, notes), status = 'draf', submitted_at = NULL, sla_due_at = NULL, updated_at = now() WHERE id = $1`,
        [id, date, b.neededDate === undefined ? r.needed_date : b.neededDate, b.department?.trim() || null, b.requesterName?.trim() || null, b.description?.trim() || null, b.priority ?? null, b.notes ?? null]);
      if (b.projectId !== undefined) await c.query('UPDATE purchase_requisitions SET project_id = $2 WHERE id = $1', [id, await assertProject(c, u.companyId, b.projectId, trimBranch(r.branch_code))]);
      const est = b.lines ? await this.writeLines(c, u.companyId, id, trimBranch(r.branch_code), b.lines) : Number(r.estimated_total);
      await this.rec(c, u, trimBranch(r.branch_code), 'purchase_requisition.updated', 'purchase_requisition', r.doc_no, { estimated: est }, requestId);
      if (b.submit) await this.doSubmit(c, u, id, requestId);
      return this.loadRequisition(c, u.companyId, id);
    });
  }

  async submitRequisition(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => { await this.doSubmit(c, u, id, requestId); return this.loadRequisition(c, u.companyId, id); });
  }

  private async doSubmit(c: PoolClient, u: RequestUser, id: string, requestId: string) {
    const r = await this.prRow(c, u.companyId, id, true);
    if (r.status !== 'draf') throw conflict('PR_NOT_DRAFT', `${r.doc_no} bukan draf.`);
    if (Number(r.estimated_total) <= 0) throw invalid('PR_EMPTY', 'Perkiraan nilai permintaan nol.');
    const now = new Date();
    const due = slaDue(now, r.priority);
    await c.query(`UPDATE purchase_requisitions SET status = 'menunggu', submitted_at = $2, sla_due_at = $3, decided_by = NULL, decided_by_name = NULL, decided_at = NULL, decision_note = NULL, updated_at = now() WHERE id = $1`, [id, now, due]);
    await this.rec(c, u, trimBranch(r.branch_code), 'purchase_requisition.submitted', 'purchase_requisition', r.doc_no, { priority: r.priority, slaDueAt: due.toISOString(), estimated: Number(r.estimated_total) }, requestId);
  }

  async decideRequisition(u: RequestUser, s: ScopeContext, id: string, approve: boolean, note: string | undefined, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const r = await this.prRow(c, u.companyId, id, true);
      if (r.status !== 'menunggu') throw conflict('PR_NOT_PENDING', `${r.doc_no} tidak sedang menunggu persetujuan.`);
      if (r.created_by === u.id) throw new DomainError('SOD_REQUISITION', 'Pemohon tidak boleh memutus permintaan pembeliannya sendiri (kontrol empat mata).', HttpStatus.FORBIDDEN);
      if (!approve && (!note || note.trim().length < 3)) throw invalid('REASON_REQUIRED', 'Penolakan permintaan wajib diberi alasan.');
      const late = r.sla_due_at && new Date(r.sla_due_at).getTime() < Date.now();
      await c.query(`UPDATE purchase_requisitions SET status = $2, decided_by = $3, decided_by_name = $4, decided_at = now(), decision_note = $5, updated_at = now() WHERE id = $1`,
        [id, approve ? 'disetujui' : 'ditolak', u.id, u.name, note ?? null]);
      await this.rec(c, u, trimBranch(r.branch_code), approve ? 'purchase_requisition.approved' : 'purchase_requisition.rejected', 'purchase_requisition', r.doc_no, { note, slaMet: !late }, requestId);
      return this.loadRequisition(c, u.companyId, id);
    });
  }

  async cancelRequisition(u: RequestUser, s: ScopeContext, id: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const r = await this.prRow(c, u.companyId, id, true);
      if (!['draf', 'menunggu', 'disetujui', 'ditolak'].includes(r.status)) throw conflict('PR_LOCKED', `${r.doc_no} berstatus ${PR_LABEL[r.status]} dan tidak dapat dibatalkan.`);
      if (r.rfq_id && r.rfq_status === 'terbuka') throw conflict('PR_HAS_RFQ', `${r.doc_no} masih memiliki RFQ ${r.rfq_no} yang terbuka; batalkan RFQ terlebih dahulu.`);
      if (!(r.created_by === u.id || u.permissions.has('purchasing.requisition.approve'))) throw forbidden('Hanya pemohon atau penyetuju yang dapat membatalkan permintaan.');
      await c.query(`UPDATE purchase_requisitions SET status = 'batal', decision_note = $2, updated_at = now() WHERE id = $1`, [id, reason]);
      await this.rec(c, u, trimBranch(r.branch_code), 'purchase_requisition.cancelled', 'purchase_requisition', r.doc_no, { reason }, requestId);
      return this.loadRequisition(c, u.companyId, id);
    });
  }

  private assertConvertible(r: any) {
    if (r.status !== 'disetujui') throw conflict('PR_NOT_APPROVED', `${r.doc_no} berstatus ${PR_LABEL[r.status]}; hanya PR disetujui yang dapat diproses menjadi PO/RFQ.`);
    if (r.order_id) throw conflict('PR_HAS_ORDER', `${r.doc_no} sudah menjadi ${r.order_no}.`);
  }

  /** PR disetujui → PO langsung ke satu pemasok (harga perkiraan PR, dapat ditimpa per baris). */
  async requisitionToOrder(u: RequestUser, s: ScopeContext, id: string, b: { supplierId: string; orderDate?: string; prices?: QuotePrice[]; submit?: boolean }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const r = await this.prRow(c, u.companyId, id, true);
      this.assertConvertible(r);
      if (r.rfq_id && r.rfq_status === 'terbuka') throw conflict('PR_HAS_RFQ', `${r.doc_no} sedang dalam RFQ ${r.rfq_no}; pilih pemenang di RFQ atau batalkan RFQ.`);
      const lines = await this.prLines(c, id);
      const override = new Map((b.prices ?? []).map((p) => [p.lineNo, p]));
      const branch = trimBranch(r.branch_code);
      assertBranch(u, s, branch);
      const orderId = await this.orders.createIn(c, u, branch, {
        supplierId: b.supplierId, orderDate: b.orderDate, submit: b.submit ?? true, requisitionId: id, projectId: r.project_id,
        notes: `Dari ${r.doc_no} — ${r.description} (${r.department}, ${r.requester_name})`.slice(0, 500),
        lines: lines.map((l) => ({ productId: l.productId, description: l.description, kind: l.kind, unit: l.unit, qty: l.qty, price: override.get(l.lineNo)?.price ?? l.estPrice, discPct: override.get(l.lineNo)?.discPct ?? 0, expenseAccount: l.expenseAccount })),
      }, requestId);
      const po = (await c.query('SELECT doc_no, total FROM purchase_orders WHERE id = $1', [orderId])).rows[0];
      await c.query(`UPDATE purchase_requisitions SET status = 'selesai', order_id = $2, updated_at = now() WHERE id = $1`, [id, orderId]);
      await this.rec(c, u, branch, 'purchase_requisition.ordered', 'purchase_requisition', r.doc_no, { order: po.doc_no, total: Number(po.total) }, requestId);
      return this.orders.load(c, u.companyId, orderId);
    });
  }

  /* ------------------------------ RFQ & penawaran ------------------------------ */

  async listRfqs(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) =>
      (await c.query(`${RFQ_SELECT} WHERE q.company_id = $1 AND ($2::text IS NULL OR q.branch_code = $2) ORDER BY q.rfq_date DESC, q.doc_no DESC LIMIT 5000`,
        [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(mapRfq));
  }

  private async rfqRow(c: PoolClient, companyId: string, id: string, lock = false) {
    if (!UUID.test(id)) throw notFound('RFQ');
    if (lock) await c.query('SELECT 1 FROM rfqs WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
    const r = (await c.query(`${RFQ_SELECT} WHERE q.company_id = $1 AND q.id = $2`, [companyId, id])).rows[0];
    if (!r) throw notFound('RFQ');
    return r;
  }

  private async quotes(c: PoolClient, rfqId: string) {
    return (await c.query(`SELECT x.*, s.name AS supplier_name, s.code AS supplier_code, s.status AS supplier_status FROM rfq_quotes x JOIN suppliers s ON s.id = x.supplier_id WHERE x.rfq_id = $1 ORDER BY x.total NULLS LAST, s.name`, [rfqId])).rows.map(mapQuote);
  }

  async loadRfq(c: PoolClient, companyId: string, id: string) {
    const q = await this.rfqRow(c, companyId, id);
    const quotes = await this.quotes(c, id);
    const best = bestQuote(quotes);
    const pr = await this.prRow(c, companyId, q.requisition_id);
    return {
      ...mapRfq(q), requisition: { ...mapPr(pr), lines: await this.prLines(c, q.requisition_id) },
      quotes: quotes.map((x) => ({ ...x, best: best?.id === x.id, awarded: q.awarded_quote_id === x.id })), bestQuoteId: best?.id ?? null, minVendors: MIN_RFQ_VENDORS,
      timeline: await auditTrail(c, companyId, 'rfq', q.doc_no),
    };
  }

  async getRfq(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), (c) => this.loadRfq(c, u.companyId, id));
  }

  private async invitable(c: PoolClient, companyId: string, supplierId: string) {
    if (!UUID.test(supplierId)) throw invalid('SUPPLIER_UNKNOWN', 'Pemasok tidak dikenal.');
    const sup = (await c.query('SELECT id, name, status FROM suppliers WHERE company_id = $1 AND id = $2', [companyId, supplierId])).rows[0];
    if (!sup) throw invalid('SUPPLIER_UNKNOWN', 'Pemasok tidak dikenal.');
    if (['diblokir', 'nonaktif'].includes(sup.status)) throw invalid('SUPPLIER_BLOCKED', `Pemasok ${sup.name} berstatus ${sup.status}; tidak dapat diundang.`);
    return sup;
  }

  async createRfq(u: RequestUser, s: ScopeContext, b: RfqInput, requestId: string) {
    const ids = [...new Set(b.supplierIds)];
    if (ids.length < MIN_RFQ_VENDORS) throw invalid('RFQ_MIN_VENDORS', `RFQ memerlukan minimal ${MIN_RFQ_VENDORS} pemasok berbeda.`);
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const pr = await this.prRow(c, u.companyId, b.requisitionId, true);
      this.assertConvertible(pr);
      if (pr.rfq_id && pr.rfq_status !== 'batal') throw conflict('PR_HAS_RFQ', `${pr.doc_no} sudah memiliki RFQ ${pr.rfq_no}.`);
      const branch = trimBranch(pr.branch_code);
      assertBranch(u, s, branch);
      const date = b.date ?? todayWib();
      if (b.deadline < date) throw invalid('RFQ_DEADLINE', 'Batas penawaran tidak boleh sebelum tanggal RFQ.');
      const sups = [];
      for (const id of ids) sups.push(await this.invitable(c, u.companyId, id));
      const docNo = await nextDocNo(c, u.companyId, 'RFQ', Number(date.slice(0, 4)));
      const q = (await c.query(
        `INSERT INTO rfqs (company_id, branch_code, doc_no, requisition_id, title, rfq_date, deadline, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [u.companyId, branch, docNo, pr.id, (b.title?.trim() || pr.description).slice(0, 200), date, b.deadline, u.id, u.name])).rows[0];
      for (const sup of sups) await c.query('INSERT INTO rfq_quotes (rfq_id, company_id, branch_code, supplier_id) VALUES ($1,$2,$3,$4)', [q.id, u.companyId, branch, sup.id]);
      await c.query('UPDATE purchase_requisitions SET rfq_id = $2, updated_at = now() WHERE id = $1', [pr.id, q.id]);
      await this.rec(c, u, branch, 'rfq.created', 'rfq', docNo, { requisition: pr.doc_no, suppliers: sups.map((x) => x.name), deadline: b.deadline }, requestId);
      await this.rec(c, u, branch, 'purchase_requisition.rfq_created', 'purchase_requisition', pr.doc_no, { rfq: docNo, suppliers: sups.length }, requestId);
      return this.loadRfq(c, u.companyId, q.id);
    });
  }

  private async openRfq(c: PoolClient, companyId: string, id: string) {
    const q = await this.rfqRow(c, companyId, id, true);
    if (q.status !== 'terbuka') throw conflict('RFQ_CLOSED', `${q.doc_no} berstatus ${RFQ_LABEL[q.status]}.`);
    return q;
  }

  async invite(u: RequestUser, s: ScopeContext, id: string, supplierId: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const q = await this.openRfq(c, u.companyId, id);
      const sup = await this.invitable(c, u.companyId, supplierId);
      const ins = await c.query('INSERT INTO rfq_quotes (rfq_id, company_id, branch_code, supplier_id) VALUES ($1,$2,$3,$4) ON CONFLICT (rfq_id, supplier_id) DO NOTHING', [id, u.companyId, trimBranch(q.branch_code), sup.id]);
      if (!ins.rowCount) throw conflict('RFQ_ALREADY_INVITED', `${sup.name} sudah diundang.`);
      await this.rec(c, u, trimBranch(q.branch_code), 'rfq.invited', 'rfq', q.doc_no, { supplier: sup.name }, requestId);
      return this.loadRfq(c, u.companyId, id);
    });
  }

  /** Catat penawaran pemasok (atau penolakan untuk menawar). Dapat diperbarui selama RFQ terbuka. */
  async recordQuote(u: RequestUser, s: ScopeContext, id: string, b: QuoteInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const q = await this.openRfq(c, u.companyId, id);
      const row = (await c.query('SELECT x.id, s.name FROM rfq_quotes x JOIN suppliers s ON s.id = x.supplier_id WHERE x.rfq_id = $1 AND x.supplier_id = $2 FOR UPDATE OF x', [id, b.supplierId])).rows[0];
      if (!row) throw invalid('RFQ_NOT_INVITED', 'Pemasok ini belum diundang ke RFQ; undang terlebih dahulu.');
      const branch = trimBranch(q.branch_code);
      if (b.declined) {
        await c.query(`UPDATE rfq_quotes SET status = 'menolak', prices = '[]'::jsonb, net_amount = NULL, ppn_amount = NULL, total = NULL, notes = $2, entered_by = $3, entered_by_name = $4, entered_at = now() WHERE id = $1`,
          [row.id, b.notes ?? null, u.id, u.name]);
        await this.rec(c, u, branch, 'rfq.declined', 'rfq', q.doc_no, { supplier: row.name, note: b.notes }, requestId);
        return this.loadRfq(c, u.companyId, id);
      }
      const lines = await this.prLines(c, q.requisition_id);
      const t = quoteTotals(lines.map((l) => ({ lineNo: l.lineNo, qty: l.qty, kind: l.kind })), b.prices ?? []);
      if (t.problems.length) throw invalid('QUOTE_INVALID', t.problems[0], t.problems);
      const date = b.quoteDate ?? todayWib();
      if (b.validUntil && b.validUntil < date) throw invalid('QUOTE_VALIDITY', 'Masa berlaku penawaran tidak boleh sebelum tanggal penawaran.');
      await c.query(
        `UPDATE rfq_quotes SET status = 'masuk', quote_ref = $2, quote_date = $3, lead_days = $4, valid_until = $5, prices = $6::jsonb, net_amount = $7, ppn_amount = $8, total = $9, notes = $10,
            entered_by = $11, entered_by_name = $12, entered_at = now() WHERE id = $1`,
        [row.id, b.quoteRef ?? null, date, b.leadDays ?? null, b.validUntil ?? null, JSON.stringify((b.prices ?? []).map((p) => ({ lineNo: p.lineNo, price: p.price, discPct: p.discPct ?? 0 }))), t.net, t.ppn, t.total, b.notes ?? null, u.id, u.name]);
      await this.rec(c, u, branch, 'rfq.quoted', 'rfq', q.doc_no, { supplier: row.name, total: t.total }, requestId);
      return this.loadRfq(c, u.companyId, id);
    });
  }

  /** Pilih pemenang → PO ke pemasok itu dengan harga penawarannya; PR selesai. */
  async award(u: RequestUser, s: ScopeContext, id: string, b: { quoteId: string; reason?: string; orderDate?: string; submit?: boolean }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const q = await this.openRfq(c, u.companyId, id);
      const branch = trimBranch(q.branch_code);
      assertBranch(u, s, branch);
      const quotes = await this.quotes(c, id);
      const errs = awardProblems(quotes, b.quoteId, b.reason);
      if (errs.length) throw invalid('AWARD_INVALID', errs[0], errs);
      const chosen = quotes.find((x) => x.id === b.quoteId)!;
      if (chosen.validUntil && chosen.validUntil < (b.orderDate ?? todayWib())) throw invalid('QUOTE_EXPIRED', `Penawaran ${chosen.supplierName} sudah kedaluwarsa (${chosen.validUntil}); minta penawaran ulang.`);
      const pr = await this.prRow(c, u.companyId, q.requisition_id, true);
      this.assertConvertible(pr);
      const lines = await this.prLines(c, pr.id);
      const price = new Map((chosen.prices as QuotePrice[]).map((p) => [p.lineNo, p]));
      const date = b.orderDate ?? todayWib();
      const orderId = await this.orders.createIn(c, u, branch, {
        supplierId: chosen.supplierId, orderDate: date, submit: b.submit ?? true, requisitionId: pr.id, rfqId: id, projectId: pr.project_id,
        expectedDate: chosen.leadDays !== null && chosen.leadDays !== undefined ? addDays(date, chosen.leadDays) : undefined,
        notes: `Dari ${q.doc_no} / ${pr.doc_no} — penawaran ${chosen.quoteRef ?? chosen.supplierName}${b.reason ? `; alasan: ${b.reason}` : ''}`.slice(0, 500),
        lines: lines.map((l) => ({ productId: l.productId, description: l.description, kind: l.kind, unit: l.unit, qty: l.qty, price: price.get(l.lineNo)!.price, discPct: price.get(l.lineNo)!.discPct ?? 0, expenseAccount: l.expenseAccount })),
      }, requestId);
      const po = (await c.query('SELECT doc_no, total FROM purchase_orders WHERE id = $1', [orderId])).rows[0];
      await c.query(`UPDATE rfqs SET status = 'dipesan', awarded_quote_id = $2, award_reason = $3, order_id = $4, awarded_by = $5, awarded_by_name = $6, awarded_at = now(), updated_at = now() WHERE id = $1`,
        [id, chosen.id, b.reason?.trim() || null, orderId, u.id, u.name]);
      await c.query(`UPDATE purchase_requisitions SET status = 'selesai', order_id = $2, updated_at = now() WHERE id = $1`, [pr.id, orderId]);
      const best = bestQuote(quotes);
      await this.rec(c, u, branch, 'rfq.awarded', 'rfq', q.doc_no, { supplier: chosen.supplierName, total: chosen.total, best: best?.id === chosen.id, reason: b.reason, order: po.doc_no }, requestId);
      await this.rec(c, u, branch, 'purchase_requisition.ordered', 'purchase_requisition', pr.doc_no, { order: po.doc_no, rfq: q.doc_no, total: Number(po.total) }, requestId);
      return this.loadRfq(c, u.companyId, id);
    });
  }

  async cancelRfq(u: RequestUser, s: ScopeContext, id: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const q = await this.openRfq(c, u.companyId, id);
      await c.query(`UPDATE rfqs SET status = 'batal', cancel_reason = $2, updated_at = now() WHERE id = $1`, [id, reason]);
      await c.query('UPDATE purchase_requisitions SET rfq_id = NULL, updated_at = now() WHERE id = $1 AND rfq_id = $2', [q.requisition_id, id]);
      await this.rec(c, u, trimBranch(q.branch_code), 'rfq.cancelled', 'rfq', q.doc_no, { reason }, requestId);
      return this.loadRfq(c, u.companyId, id);
    });
  }
}
