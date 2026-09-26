/**
 * Pesanan penjualan (dok. 07 §4.2): draf → ajukan → (pemeriksaan plafon &
 * batas persetujuan) → menunggu/disetujui → difakturkan. Penyetuju ≠ pembuat.
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { addDays, creditCheck } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, DomainError, forbidden, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { mapCustomer } from './customers.service.js';
import { insertLines, mapLine, resolveLines, type LineInput } from './lines.js';
import { assertBranch, auditTrail, companyPolicies, exposures, invalid, nextDocNo, todayWib, trimBranch, UUID } from './sales.shared.js';

export interface OrderInput { branch?: string; customerId?: string; orderDate?: string; deliveryDate?: string | null; channel?: string; notes?: string; lines?: LineInput[]; submit?: boolean }

const STATUS_LABEL: Record<string, string> = { draf: 'Draf', menunggu: 'Menunggu persetujuan', disetujui: 'Disetujui', ditolak: 'Ditolak', dikirim: 'Dikirim', selesai: 'Selesai (difakturkan)', batal: 'Batal' };

export const mapOrder = (o: any) => ({
  id: o.id, docNo: o.doc_no, branch: trimBranch(o.branch_code), customerId: o.customer_id, customerName: o.customer_name, customerCode: o.customer_code,
  date: o.order_date, deliveryDate: o.delivery_date, channel: o.channel, status: o.status, statusLabel: STATUS_LABEL[o.status] ?? o.status,
  subtotal: o.subtotal, discount: o.discount, net: o.net_amount, ppn: o.ppn_amount, total: o.total, notes: o.notes,
  approvalReasons: o.approval_reasons ?? [], createdBy: o.created_by, createdByName: o.created_by_name, submittedAt: o.submitted_at,
  decidedByName: o.decided_by_name, decidedAt: o.decided_at, decisionNote: o.decision_note, invoiceId: o.invoice_id, invoiceNo: o.invoice_no ?? null,
  createdAt: o.created_at, lineCount: o.line_count ?? undefined,
});

const SELECT = `SELECT o.*, c.name AS customer_name, c.code AS customer_code, i.doc_no AS invoice_no,
  (SELECT count(*)::int FROM sales_order_lines l WHERE l.order_id = o.id) AS line_count
  FROM sales_orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN invoices i ON i.id = o.invoice_id`;

@Injectable()
export class OrdersService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  async list(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const rows = (await c.query(`${SELECT} WHERE o.company_id = $1 AND ($2::text IS NULL OR o.branch_code = $2) ORDER BY o.order_date DESC, o.doc_no DESC LIMIT 5000`,
        [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows;
      return rows.map(mapOrder);
    });
  }

  private async row(c: PoolClient, companyId: string, id: string, lock = false) {
    if (!UUID.test(id)) throw notFound('Pesanan');
    const o = (await c.query(`${SELECT} WHERE o.company_id = $1 AND o.id = $2`, [companyId, id])).rows[0];
    if (!o) throw notFound('Pesanan');
    if (lock) await c.query('SELECT 1 FROM sales_orders WHERE id = $1 FOR UPDATE', [id]);
    return o;
  }

  private async load(c: PoolClient, companyId: string, id: string) {
    const o = await this.row(c, companyId, id);
    const lines = (await c.query('SELECT * FROM sales_order_lines WHERE order_id = $1 ORDER BY line_no', [id])).rows.map(mapLine);
    const cust = (await c.query('SELECT * FROM customers WHERE id = $1', [o.customer_id])).rows[0];
    const ex = (await exposures(c, companyId, o.customer_id, ['menunggu', 'disetujui', 'dikirim'].includes(o.status) ? o.id : undefined)).get(o.customer_id);
    const exposure = ex?.total ?? 0;
    const credit = { limit: cust.credit_limit, exposure, available: cust.credit_limit - exposure, afterOrder: cust.credit_limit - exposure - o.total, overdue: ex?.overdue ?? 0 };
    return { ...mapOrder(o), lines, customer: mapCustomer(cust), credit, timeline: await auditTrail(c, companyId, 'sales_order', o.doc_no) };
  }

  async get(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), (c) => this.load(c, u.companyId, id));
  }

  private async customer(c: PoolClient, companyId: string, id: string | undefined) {
    if (!id || !UUID.test(id)) throw invalid('CUSTOMER_REQUIRED', 'Pilih pelanggan.');
    const r = (await c.query('SELECT * FROM customers WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
    if (!r) throw invalid('CUSTOMER_UNKNOWN', 'Pelanggan tidak dikenal.');
    if (r.status === 'nonaktif') throw invalid('CUSTOMER_INACTIVE', `Pelanggan ${r.name} nonaktif; aktifkan dahulu di data pelanggan.`);
    return r;
  }

  async create(u: RequestUser, s: ScopeContext, b: OrderInput, requestId: string) {
    const branch = String(b.branch ?? (s.branch === 'ALL' ? '' : s.branch)).toUpperCase();
    if (!/^[A-Z]{3}$/.test(branch)) throw invalid('BRANCH_REQUIRED', 'Pilih cabang pesanan.');
    assertBranch(u, s, branch);
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const br = (await c.query('SELECT status FROM branches WHERE company_id = $1 AND code = $2', [u.companyId, branch])).rows[0];
      if (!br || br.status !== 'aktif') throw invalid('BRANCH_INACTIVE', `Cabang ${branch} tidak aktif.`);
      const cust = await this.customer(c, u.companyId, b.customerId);
      const { lines, totals } = await resolveLines(c, u.companyId, b.lines ?? []);
      const date = b.orderDate ?? todayWib();
      const docNo = await nextDocNo(c, u.companyId, 'SO', Number(date.slice(0, 4)));
      const o = (await c.query(
        `INSERT INTO sales_orders (company_id, branch_code, doc_no, customer_id, order_date, delivery_date, channel, notes, subtotal, discount, net_amount, ppn_amount, total, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [u.companyId, branch, docNo, cust.id, date, b.deliveryDate ?? addDays(date, 14), b.channel ?? cust.segment, b.notes ?? null,
          totals.subtotal, totals.discount, totals.net, totals.ppn, totals.total, u.id, u.name])).rows[0];
      await insertLines(c, 'sales_order_lines', 'order_id', o.id, u.companyId, branch, lines);
      await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'sales_order.created', entityType: 'sales_order', entityId: docNo, after: { customer: cust.name, total: totals.total, lines: lines.length }, requestId });
      if (b.submit) await this.doSubmit(c, u, o.id, requestId);
      return this.load(c, u.companyId, o.id);
    });
  }

  async update(u: RequestUser, s: ScopeContext, id: string, b: OrderInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const o = await this.row(c, u.companyId, id, true);
      if (!['draf', 'ditolak'].includes(o.status)) throw conflict('ORDER_LOCKED', `Pesanan ${o.doc_no} berstatus ${STATUS_LABEL[o.status]}; hanya draf atau pesanan ditolak yang dapat diubah.`);
      const cust = await this.customer(c, u.companyId, b.customerId ?? o.customer_id);
      const { lines, totals } = b.lines ? await resolveLines(c, u.companyId, b.lines) : { lines: null, totals: null };
      await c.query(
        `UPDATE sales_orders SET customer_id = $2, order_date = coalesce($3, order_date), delivery_date = coalesce($4, delivery_date), channel = coalesce($5, channel), notes = coalesce($6, notes),
            subtotal = coalesce($7, subtotal), discount = coalesce($8, discount), net_amount = coalesce($9, net_amount), ppn_amount = coalesce($10, ppn_amount), total = coalesce($11, total),
            status = 'draf', approval_reasons = '[]'::jsonb, updated_at = now() WHERE id = $1`,
        [id, cust.id, b.orderDate ?? null, b.deliveryDate ?? null, b.channel ?? null, b.notes ?? null, totals?.subtotal ?? null, totals?.discount ?? null, totals?.net ?? null, totals?.ppn ?? null, totals?.total ?? null]);
      if (lines) await insertLines(c, 'sales_order_lines', 'order_id', id, u.companyId, trimBranch(o.branch_code), lines);
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(o.branch_code), userId: u.id, sessionId: u.sessionId, action: 'sales_order.updated', entityType: 'sales_order', entityId: o.doc_no, after: { total: totals?.total ?? o.total }, requestId });
      if (b.submit) await this.doSubmit(c, u, id, requestId);
      return this.load(c, u.companyId, id);
    });
  }

  async submit(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => { await this.doSubmit(c, u, id, requestId); return this.load(c, u.companyId, id); });
  }

  /** Ajukan: lolos pemeriksaan → langsung disetujui; bila tidak → menunggu persetujuan manajer. */
  private async doSubmit(c: PoolClient, u: RequestUser, id: string, requestId: string) {
    const o = await this.row(c, u.companyId, id, true);
    if (o.status !== 'draf') throw conflict('ORDER_NOT_DRAFT', `Pesanan ${o.doc_no} bukan draf.`);
    if (o.total <= 0) throw invalid('ORDER_EMPTY', 'Nilai pesanan nol.');
    const cust = await this.customer(c, u.companyId, o.customer_id);
    const exposure = (await exposures(c, u.companyId, cust.id, id)).get(cust.id)?.total ?? 0;
    const check = creditCheck({ status: cust.status, creditLimit: cust.credit_limit }, exposure, o.total, await companyPolicies(c, u.companyId));
    const status = check.needsApproval ? 'menunggu' : 'disetujui';
    await c.query(
      `UPDATE sales_orders SET status = $2, approval_reasons = $3::jsonb, submitted_at = now(), updated_at = now(),
          decided_by = NULL, decided_by_name = CASE WHEN $2 = 'disetujui' THEN 'Sistem (lolos pemeriksaan)' END, decided_at = CASE WHEN $2 = 'disetujui' THEN now() END, decision_note = NULL
        WHERE id = $1`, [id, status, JSON.stringify(check.reasons)]);
    await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(o.branch_code), userId: u.id, sessionId: u.sessionId, action: check.needsApproval ? 'sales_order.submitted' : 'sales_order.auto_approved',
      entityType: 'sales_order', entityId: o.doc_no, after: { total: o.total, exposure, limit: cust.credit_limit, reasons: check.reasons }, requestId });
  }

  async approve(u: RequestUser, s: ScopeContext, id: string, note: string | undefined, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const o = await this.row(c, u.companyId, id, true);
      if (o.status !== 'menunggu') throw conflict('ORDER_NOT_PENDING', `Pesanan ${o.doc_no} tidak sedang menunggu persetujuan.`);
      if (o.created_by === u.id) throw new DomainError('SOD_ORDER', 'Pembuat pesanan tidak boleh menyetujui pesanannya sendiri (kontrol empat mata).', HttpStatus.FORBIDDEN);
      await c.query(`UPDATE sales_orders SET status = 'disetujui', decided_by = $2, decided_by_name = $3, decided_at = now(), decision_note = $4, updated_at = now() WHERE id = $1`, [id, u.id, u.name, note ?? null]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(o.branch_code), userId: u.id, sessionId: u.sessionId, action: 'sales_order.approved', entityType: 'sales_order', entityId: o.doc_no, after: { note, reasons: o.approval_reasons }, requestId });
      return this.load(c, u.companyId, id);
    });
  }

  async reject(u: RequestUser, s: ScopeContext, id: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const o = await this.row(c, u.companyId, id, true);
      if (o.status !== 'menunggu') throw conflict('ORDER_NOT_PENDING', `Pesanan ${o.doc_no} tidak sedang menunggu persetujuan.`);
      if (o.created_by === u.id) throw new DomainError('SOD_ORDER', 'Pembuat pesanan tidak boleh memutus pesanannya sendiri.', HttpStatus.FORBIDDEN);
      await c.query(`UPDATE sales_orders SET status = 'ditolak', decided_by = $2, decided_by_name = $3, decided_at = now(), decision_note = $4, updated_at = now() WHERE id = $1`, [id, u.id, u.name, reason]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(o.branch_code), userId: u.id, sessionId: u.sessionId, action: 'sales_order.rejected', entityType: 'sales_order', entityId: o.doc_no, after: { reason }, requestId });
      return this.load(c, u.companyId, id);
    });
  }

  async cancel(u: RequestUser, s: ScopeContext, id: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const o = await this.row(c, u.companyId, id, true);
      if (!['draf', 'menunggu', 'disetujui', 'ditolak'].includes(o.status)) throw conflict('ORDER_LOCKED', `Pesanan ${o.doc_no} berstatus ${STATUS_LABEL[o.status]} dan tidak dapat dibatalkan.`);
      const mayCancel = o.created_by === u.id || u.permissions.has('sales.order.approve');
      if (!mayCancel) throw forbidden('Hanya pembuat pesanan atau penyetuju yang dapat membatalkan pesanan.');
      await c.query(`UPDATE sales_orders SET status = 'batal', decision_note = $2, updated_at = now() WHERE id = $1`, [id, reason]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(o.branch_code), userId: u.id, sessionId: u.sessionId, action: 'sales_order.cancelled', entityType: 'sales_order', entityId: o.doc_no, after: { reason }, requestId });
      return this.load(c, u.companyId, id);
    });
  }

  /** Buat faktur draf dari pesanan yang disetujui; pesanan menjadi selesai. Pembatalan faktur mengembalikannya. */
  async toInvoice(u: RequestUser, s: ScopeContext, id: string, invoiceDate: string | undefined, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const o = await this.row(c, u.companyId, id, true);
      if (!['disetujui', 'dikirim'].includes(o.status)) throw conflict('ORDER_NOT_APPROVED', `Pesanan ${o.doc_no} belum disetujui.`);
      const cust = await this.customer(c, u.companyId, o.customer_id);
      const date = invoiceDate ?? todayWib();
      if (date < o.order_date) throw invalid('INVOICE_DATE', 'Tanggal faktur tidak boleh sebelum tanggal pesanan.');
      const docNo = await nextDocNo(c, u.companyId, 'INV', Number(date.slice(0, 4)));
      const inv = (await c.query(
        `INSERT INTO invoices (company_id, branch_code, doc_no, customer_name, customer_id, sales_order_id, invoice_date, due_date, total_gross, subtotal, discount, net_amount, ppn_amount, status, notes, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draf',$14,$15,$16) RETURNING id`,
        [u.companyId, trimBranch(o.branch_code), docNo, cust.name, cust.id, o.id, date, addDays(date, cust.terms_days), o.total, o.subtotal, o.discount, o.net_amount, o.ppn_amount, `Dari pesanan ${o.doc_no}`, u.id, u.name])).rows[0];
      await c.query(
        `INSERT INTO invoice_lines (invoice_id, company_id, branch_code, line_no, product_id, sku, description, kind, qty, unit, price, disc_pct, net)
         SELECT $1, company_id, branch_code, line_no, product_id, sku, description, kind, qty, unit, price, disc_pct, net FROM sales_order_lines WHERE order_id = $2 ORDER BY line_no`, [inv.id, id]);
      await c.query(`UPDATE sales_orders SET status = 'selesai', invoice_id = $2, updated_at = now() WHERE id = $1`, [id, inv.id]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(o.branch_code), userId: u.id, sessionId: u.sessionId, action: 'sales_order.invoiced', entityType: 'sales_order', entityId: o.doc_no, after: { invoice: docNo }, requestId });
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(o.branch_code), userId: u.id, sessionId: u.sessionId, action: 'invoice.created', entityType: 'invoice', entityId: docNo, after: { order: o.doc_no, total: o.total }, requestId });
      return { invoiceId: inv.id as string, invoiceNo: docNo, order: await this.load(c, u.companyId, id) };
    });
  }
}
