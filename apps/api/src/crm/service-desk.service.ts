/**
 * Penagihan piutang & tiket layanan.
 * - Penagihan: daftar faktur terbuka per tingkat (dunning) dari umur keterlambatan, kontak
 *   terakhir, janji bayar (status dihitung dari penerimaan faktur), dan tahan kredit pelanggan
 *   (status ditahan → pesanan baru otomatis menunggu persetujuan manajer).
 * - Tiket: keluhan pelanggan (tertaut faktur/pesanan) & klaim ke pemasok (tertaut PO),
 *   SLA menurut prioritas, alur status, resolusi & kepuasan.
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { dunningLevel, overdueDays, promiseStatus, TICKET_FLOW, ticketSlaDue, type TicketPriority } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, DomainError, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { assertBranch, auditTrail, invalid, nextDocNo, todayWib, trimBranch, UUID } from '../sales/sales.shared.js';
import { ACTIVITY_SELECT, mapActivity, RelationsService } from './relations.service.js';

export interface TicketInput {
  branch?: string; partyType?: 'customer' | 'supplier'; customerId?: string | null; supplierId?: string | null; invoiceId?: string | null; salesOrderId?: string | null; purchaseOrderId?: string | null;
  subject?: string; description?: string | null; category?: string; priority?: TicketPriority; assigneeName?: string | null;
}

const T_SELECT = `SELECT t.*, cu.name AS customer_name, su.name AS supplier_name, i.doc_no AS invoice_no, so.doc_no AS so_no, po.doc_no AS po_no
  FROM support_tickets t LEFT JOIN customers cu ON cu.id = t.customer_id LEFT JOIN suppliers su ON su.id = t.supplier_id LEFT JOIN invoices i ON i.id = t.invoice_id
  LEFT JOIN sales_orders so ON so.id = t.sales_order_id LEFT JOIN purchase_orders po ON po.id = t.purchase_order_id`;
const mapTicket = (t: any) => {
  const open = !['selesai', 'ditutup'].includes(t.status);
  return {
    id: t.id, code: t.code, branch: trimBranch(t.branch_code), partyType: t.party_type, customerId: t.customer_id, customerName: t.customer_name, supplierId: t.supplier_id, supplierName: t.supplier_name,
    partyName: t.customer_name ?? t.supplier_name, invoiceId: t.invoice_id, invoiceNo: t.invoice_no, salesOrderId: t.sales_order_id, salesOrderNo: t.so_no, purchaseOrderId: t.purchase_order_id, purchaseOrderNo: t.po_no,
    subject: t.subject, description: t.description, category: t.category, priority: t.priority, status: t.status, slaDueAt: t.sla_due_at, assigneeName: t.assignee_name,
    resolution: t.resolution, resolvedAt: t.resolved_at, closedAt: t.closed_at, satisfaction: t.satisfaction, createdByName: t.created_by_name, createdAt: t.created_at,
    breached: open ? new Date(t.sla_due_at).getTime() < Date.now() : t.resolved_at ? new Date(t.resolved_at).getTime() > new Date(t.sla_due_at).getTime() : false,
  };
};

@Injectable()
export class ServiceDeskService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly relations: RelationsService) {}

  private rec(c: PoolClient, u: RequestUser, branch: string, action: string, entityType: string, entityId: string, after: unknown, requestId: string) {
    return this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action, entityType, entityId, after, requestId });
  }

  /* ------------------------------ Penagihan ------------------------------ */

  async collections(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const today = todayWib();
      const soon = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10);
      const rows = (await c.query(
        `SELECT i.id, i.doc_no, i.branch_code, i.invoice_date, i.due_date, i.total_gross, i.paid_amount, i.customer_id, coalesce(cu.name, i.customer_name) AS customer_name, cu.status AS customer_status,
                cu.code AS customer_code, cu.phone AS customer_phone, cu.pic AS customer_pic,
                (SELECT max(coalesce(a.done_at, a.created_at)) FROM crm_activities a WHERE a.invoice_id = i.id AND a.status = 'selesai') AS last_contact,
                (SELECT count(*)::int FROM crm_activities a WHERE a.invoice_id = i.id AND a.status = 'selesai') AS contacts
           FROM invoices i LEFT JOIN customers cu ON cu.id = i.customer_id
          WHERE i.company_id = $1 AND ($2::text IS NULL OR i.branch_code = $2) AND i.status IN ('belum-dibayar','sebagian') AND i.due_date <= $3
          ORDER BY i.due_date, i.doc_no`, [u.companyId, s.branch === 'ALL' ? null : s.branch, soon])).rows;
      const promises = rows.length ? (await c.query(`SELECT * FROM collection_promises WHERE company_id = $1 AND invoice_id = ANY($2::uuid[]) AND status = 'aktif' ORDER BY created_at DESC`, [u.companyId, rows.map((r: any) => r.id)])).rows : [];
      const items = rows.map((r: any) => {
        const open = Number(r.total_gross) - Number(r.paid_amount);
        const od = overdueDays(r.due_date, today, open);
        const p = promises.find((x: any) => x.invoice_id === r.id);
        return {
          invoiceId: r.id, invoiceNo: r.doc_no, branch: trimBranch(r.branch_code), date: r.invoice_date, dueDate: r.due_date, total: Number(r.total_gross), paid: Number(r.paid_amount), open, overdueDays: od,
          dunning: dunningLevel(od), customerId: r.customer_id, customerName: r.customer_name, customerCode: r.customer_code, customerStatus: r.customer_status, customerPhone: r.customer_phone, customerPic: r.customer_pic,
          lastContact: r.last_contact, contacts: r.contacts,
          promise: p ? { id: p.id, date: p.promise_date, amount: Number(p.amount), note: p.note, status: promiseStatus({ amount: Number(p.amount), paidBefore: Number(p.paid_before), promiseDate: p.promise_date, status: p.status }, Number(r.paid_amount), today) } : null,
        };
      });
      const overdue = items.filter((i) => i.overdueDays > 0);
      const byLevel = [0, 1, 2, 3, 4].map((lv) => ({ level: lv, label: dunningLevel(lv === 0 ? 0 : [0, 15, 45, 75, 120][lv]).label, count: items.filter((i) => i.dunning.level === lv).length, value: items.filter((i) => i.dunning.level === lv).reduce((t, i) => t + i.open, 0) }));
      const hold = [...new Map(items.filter((i) => i.dunning.level >= 4 && i.customerStatus === 'aktif' && i.customerId).map((i) => [i.customerId, { customerId: i.customerId, customerName: i.customerName }])).values()];
      return {
        items, byLevel, holdSuggestions: hold,
        summary: { overdue: overdue.reduce((t, i) => t + i.open, 0), overdueCount: overdue.length, dueSoon: items.filter((i) => i.overdueDays === 0).reduce((t, i) => t + i.open, 0),
          promisesWaiting: items.filter((i) => i.promise?.status === 'menunggu').length, promisesBroken: items.filter((i) => i.promise?.status === 'ingkar').length,
          notContacted: overdue.filter((i) => !i.contacts).length },
      };
    });
  }

  private async openInvoice(c: PoolClient, companyId: string, id: string) {
    if (!UUID.test(id)) throw notFound('Faktur');
    const i = (await c.query('SELECT * FROM invoices WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id])).rows[0];
    if (!i) throw notFound('Faktur');
    if (!['belum-dibayar', 'sebagian'].includes(i.status)) throw conflict('INVOICE_NOT_OPEN', `Faktur ${i.doc_no} tidak memiliki sisa tagihan.`);
    return i;
  }

  /** Catat kontak penagihan (selesai) + tindak lanjut opsional. */
  async logCollection(u: RequestUser, s: ScopeContext, b: { invoiceId: string; kind: string; note: string; nextDate?: string | null }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const i = await this.openInvoice(c, u.companyId, b.invoiceId);
      await this.relations.createActivityIn(c, u, s, { kind: b.kind, subject: `Penagihan ${i.doc_no}`, notes: b.note, done: true, invoiceId: i.id, customerId: i.customer_id }, requestId);
      if (b.nextDate) await this.relations.createActivityIn(c, u, s, { kind: 'penagihan', subject: `Tindak lanjut penagihan ${i.doc_no}`, dueAt: `${b.nextDate}T09:00:00+07:00`, invoiceId: i.id, customerId: i.customer_id }, requestId);
      await this.rec(c, u, trimBranch(i.branch_code), 'collection.contacted', 'invoice', i.doc_no, { kind: b.kind, note: b.note, nextDate: b.nextDate ?? undefined }, requestId);
      return (await c.query(`${ACTIVITY_SELECT} WHERE a.company_id = $1 AND a.invoice_id = $2 ORDER BY coalesce(a.done_at, a.due_at, a.created_at) DESC`, [u.companyId, i.id])).rows.map((a: any) => mapActivity(a));
    });
  }

  /** Janji bayar: menggantikan janji aktif sebelumnya; tugas konfirmasi pada tanggal janji. */
  async promise(u: RequestUser, s: ScopeContext, b: { invoiceId: string; promiseDate: string; amount: number; note?: string | null }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const i = await this.openInvoice(c, u.companyId, b.invoiceId);
      const open = Number(i.total_gross) - Number(i.paid_amount);
      if (b.promiseDate < todayWib()) throw invalid('PROMISE_DATE', 'Tanggal janji bayar tidak boleh di masa lalu.');
      if (b.amount > open) throw invalid('PROMISE_AMOUNT', `Nilai janji melebihi sisa tagihan Rp ${open.toLocaleString('id-ID')}.`);
      await c.query(`UPDATE collection_promises SET status = 'batal' WHERE company_id = $1 AND invoice_id = $2 AND status = 'aktif'`, [u.companyId, i.id]);
      const p = (await c.query(`INSERT INTO collection_promises (company_id, branch_code, invoice_id, customer_id, promise_date, amount, paid_before, note, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [u.companyId, i.branch_code, i.id, i.customer_id, b.promiseDate, b.amount, i.paid_amount, b.note ?? null, u.id, u.name])).rows[0];
      await this.relations.createActivityIn(c, u, s, { kind: 'penagihan', subject: `Janji bayar ${i.doc_no}: Rp ${b.amount.toLocaleString('id-ID')} pada ${b.promiseDate}`, notes: b.note ?? null, done: true, invoiceId: i.id, customerId: i.customer_id }, requestId);
      await this.relations.createActivityIn(c, u, s, { kind: 'penagihan', subject: `Konfirmasi janji bayar ${i.doc_no}`, dueAt: `${b.promiseDate}T16:00:00+07:00`, invoiceId: i.id, customerId: i.customer_id }, requestId);
      await this.rec(c, u, trimBranch(i.branch_code), 'collection.promised', 'invoice', i.doc_no, { promiseDate: b.promiseDate, amount: b.amount }, requestId);
      return { id: p.id, invoiceId: i.id, promiseDate: p.promise_date, amount: Number(p.amount), status: 'menunggu' };
    });
  }

  async cancelPromise(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    if (!UUID.test(id)) throw notFound('Janji bayar');
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const r = await c.query(`UPDATE collection_promises SET status = 'batal' WHERE company_id = $1 AND id = $2 AND status = 'aktif' RETURNING id`, [u.companyId, id]);
      if (!r.rowCount) throw conflict('PROMISE_CLOSED', 'Janji bayar tidak aktif.');
      return { id, status: 'batal' };
    });
  }

  /** Tahan kredit pelanggan (tingkat eskalasi): pesanan baru menunggu persetujuan manajer. */
  async holdCustomer(u: RequestUser, s: ScopeContext, customerId: string, reason: string, requestId: string) {
    if (!UUID.test(customerId)) throw notFound('Pelanggan');
    if (!u.permissions.has('sales.customer.manage')) throw new DomainError('FORBIDDEN', 'Menahan kredit pelanggan memerlukan izin kelola pelanggan.', HttpStatus.FORBIDDEN);
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const cu = (await c.query('SELECT * FROM customers WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, customerId])).rows[0];
      if (!cu) throw notFound('Pelanggan');
      if (cu.status !== 'aktif') throw conflict('CUSTOMER_NOT_ACTIVE', `Pelanggan ${cu.name} berstatus ${cu.status}.`);
      await c.query(`UPDATE customers SET status = 'ditahan', updated_at = now() WHERE id = $1`, [customerId]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'customer.updated', entityType: 'customer', entityId: cu.code, before: { status: 'aktif' }, after: { status: 'ditahan', reason, via: 'penagihan' }, requestId });
      await this.relations.createActivityIn(c, u, s, { kind: 'catatan', subject: `Kredit ${cu.name} ditahan`, notes: reason, done: true, customerId }, requestId);
      return { id: customerId, status: 'ditahan' };
    });
  }

  /* ------------------------------ Tiket ------------------------------ */

  async listTickets(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const rows = (await c.query(`${T_SELECT} WHERE t.company_id = $1 AND ($2::text IS NULL OR t.branch_code = $2) ORDER BY (t.status IN ('selesai','ditutup')), t.sla_due_at LIMIT 5000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(mapTicket);
      const open = rows.filter((t) => !['selesai', 'ditutup'].includes(t.status));
      const rated = rows.filter((t) => t.satisfaction);
      const resolved = rows.filter((t) => t.resolvedAt);
      return { rows, summary: { open: open.length, breached: open.filter((t) => t.breached).length, supplierClaims: open.filter((t) => t.partyType === 'supplier').length,
        slaMet: resolved.length ? Math.round((resolved.filter((t) => !t.breached).length / resolved.length) * 1000) / 10 : null,
        avgSatisfaction: rated.length ? Math.round((rated.reduce((t, x) => t + (x.satisfaction ?? 0), 0) / rated.length) * 10) / 10 : null } };
    });
  }

  private async ticketRow(c: PoolClient, companyId: string, id: string, lock = false) {
    if (!UUID.test(id)) throw notFound('Tiket');
    if (lock) await c.query('SELECT 1 FROM support_tickets WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
    const t = (await c.query(`${T_SELECT} WHERE t.company_id = $1 AND t.id = $2`, [companyId, id])).rows[0];
    if (!t) throw notFound('Tiket');
    return t;
  }

  async loadTicket(c: PoolClient, companyId: string, id: string) {
    const t = await this.ticketRow(c, companyId, id);
    const activities = (await c.query(`${ACTIVITY_SELECT} WHERE a.company_id = $1 AND a.ticket_id = $2 ORDER BY coalesce(a.done_at, a.due_at, a.created_at) DESC`, [companyId, id])).rows.map((a: any) => mapActivity(a));
    return { ...mapTicket(t), activities, timeline: await auditTrail(c, companyId, 'ticket', t.code) };
  }

  async getTicket(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), (c) => this.loadTicket(c, u.companyId, id));
  }

  async createTicket(u: RequestUser, s: ScopeContext, b: TicketInput, requestId: string) {
    if (!b.subject?.trim()) throw invalid('TICKET_SUBJECT', 'Isi judul tiket.');
    const type = b.partyType ?? (b.supplierId ? 'supplier' : 'customer');
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      let branch: string | null = b.branch ? b.branch.toUpperCase() : null;
      const one = async (sql: string, id: string | null | undefined, label: string) => {
        if (!id) return null;
        if (!UUID.test(id)) throw invalid('TICKET_LINK', `${label} tidak dikenal.`);
        const r = (await c.query(sql, [u.companyId, id])).rows[0];
        if (!r) throw invalid('TICKET_LINK', `${label} tidak dikenal.`);
        return r;
      };
      let partyBranch: string | null = null;
      if (type === 'customer') {
        const cu = await one('SELECT id, branch_code FROM customers WHERE company_id = $1 AND id = $2', b.customerId, 'Pelanggan');
        if (!cu) throw invalid('TICKET_PARTY', 'Pilih pelanggan untuk tiket keluhan.');
        partyBranch = cu.branch_code ? trimBranch(cu.branch_code) : null;
        const inv = await one('SELECT customer_id, branch_code FROM invoices WHERE company_id = $1 AND id = $2', b.invoiceId, 'Faktur');
        if (inv && inv.customer_id !== cu.id) throw invalid('TICKET_LINK', 'Faktur bukan milik pelanggan ini.');
        const so = await one('SELECT customer_id, branch_code FROM sales_orders WHERE company_id = $1 AND id = $2', b.salesOrderId, 'Pesanan');
        if (so && so.customer_id !== cu.id) throw invalid('TICKET_LINK', 'Pesanan bukan milik pelanggan ini.');
        branch ??= (inv ?? so)?.branch_code ? trimBranch((inv ?? so).branch_code) : null;
      } else {
        const su = await one('SELECT id, branch_code FROM suppliers WHERE company_id = $1 AND id = $2', b.supplierId, 'Pemasok');
        if (!su) throw invalid('TICKET_PARTY', 'Pilih pemasok untuk klaim.');
        partyBranch = su.branch_code ? trimBranch(su.branch_code) : null;
        const po = await one('SELECT supplier_id, branch_code FROM purchase_orders WHERE company_id = $1 AND id = $2', b.purchaseOrderId, 'Pesanan pembelian');
        if (po && po.supplier_id !== su.id) throw invalid('TICKET_LINK', 'PO bukan milik pemasok ini.');
        branch ??= po?.branch_code ? trimBranch(po.branch_code) : null;
      }
      branch ??= s.branch !== 'ALL' ? s.branch : partyBranch;
      if (!branch || !/^[A-Z]{3}$/.test(branch)) throw invalid('BRANCH_REQUIRED', 'Pilih cabang penanggung jawab tiket.');
      assertBranch(u, s, branch);
      const priority = b.priority ?? 'sedang';
      const now = new Date();
      const code = await nextDocNo(c, u.companyId, 'TKT', Number(todayWib().slice(0, 4)));
      const t = (await c.query(
        `INSERT INTO support_tickets (company_id, branch_code, code, party_type, customer_id, supplier_id, invoice_id, sales_order_id, purchase_order_id, subject, description, category, priority, sla_due_at, assignee_name, created_by, created_by_name, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18) RETURNING id`,
        [u.companyId, branch, code, type, type === 'customer' ? b.customerId : null, type === 'supplier' ? b.supplierId : null, type === 'customer' ? b.invoiceId ?? null : null,
          type === 'customer' ? b.salesOrderId ?? null : null, type === 'supplier' ? b.purchaseOrderId ?? null : null, b.subject!.trim().slice(0, 200), b.description ?? null,
          b.category ?? 'lainnya', priority, ticketSlaDue(now, priority), b.assigneeName?.trim() || u.name, u.id, u.name, now])).rows[0];
      await this.rec(c, u, branch, 'ticket.created', 'ticket', code, { subject: b.subject, priority, party: type }, requestId);
      return this.loadTicket(c, u.companyId, t.id);
    });
  }

  async updateTicket(u: RequestUser, s: ScopeContext, id: string, b: { priority?: TicketPriority; assigneeName?: string; category?: string }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const t = await this.ticketRow(c, u.companyId, id, true);
      if (['selesai', 'ditutup'].includes(t.status)) throw conflict('TICKET_CLOSED', `${t.code} sudah ${t.status}.`);
      const sla = b.priority && b.priority !== t.priority ? ticketSlaDue(new Date(t.created_at), b.priority) : null;
      await c.query('UPDATE support_tickets SET priority = coalesce($2, priority), sla_due_at = coalesce($3, sla_due_at), assignee_name = coalesce($4, assignee_name), category = coalesce($5, category), updated_at = now() WHERE id = $1',
        [id, b.priority ?? null, sla, b.assigneeName?.trim() || null, b.category ?? null]);
      await this.rec(c, u, trimBranch(t.branch_code), 'ticket.updated', 'ticket', t.code, { priority: b.priority, assignee: b.assigneeName }, requestId);
      return this.loadTicket(c, u.companyId, id);
    });
  }

  async setTicketStatus(u: RequestUser, s: ScopeContext, id: string, b: { status: string; resolution?: string | null; satisfaction?: number | null; note?: string | null }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const t = await this.ticketRow(c, u.companyId, id, true);
      if (!(TICKET_FLOW[t.status] ?? []).includes(b.status)) throw conflict('TICKET_FLOW', `Tiket ${t.code} berstatus ${t.status}; tidak dapat menjadi ${b.status}.`);
      if (b.status === 'selesai' && (b.resolution ?? '').trim().length < 5) throw invalid('TICKET_RESOLUTION', 'Isi resolusi (minimal 5 karakter) sebelum menyelesaikan tiket.');
      await c.query(
        `UPDATE support_tickets SET status = $2, resolution = CASE WHEN $2 = 'selesai' THEN $3 ELSE resolution END, resolved_at = CASE WHEN $2 = 'selesai' THEN now() WHEN $2 = 'diproses' THEN NULL ELSE resolved_at END,
            closed_at = CASE WHEN $2 = 'ditutup' THEN now() ELSE closed_at END, satisfaction = coalesce($4, satisfaction), updated_at = now() WHERE id = $1`,
        [id, b.status, b.resolution?.trim() ?? null, b.satisfaction ?? null]);
      await this.relations.createActivityIn(c, u, s, { kind: 'catatan', subject: `Status ${t.code}: ${t.status} → ${b.status}`, notes: b.resolution ?? b.note ?? null, done: true, ticketId: id,
        customerId: t.customer_id, supplierId: t.supplier_id }, requestId);
      await this.rec(c, u, trimBranch(t.branch_code), 'ticket.status_changed', 'ticket', t.code, { from: t.status, to: b.status, resolution: b.resolution ?? undefined, satisfaction: b.satisfaction ?? undefined }, requestId);
      return this.loadTicket(c, u.companyId, id);
    });
  }
}
