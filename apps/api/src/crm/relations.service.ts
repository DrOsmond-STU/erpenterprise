/**
 * Relasi pelanggan & pemasok: kontak, aktivitas/tugas lintas modul, profil 360 (data
 * induk + pipeline + penjualan + piutang + penagihan + tiket; atau PO + hutang + RFQ +
 * kinerja kirim), dan dasbor CRM. Seluruh angka keuangan dibaca dari dokumen yang sudah
 * menjurnal (faktur, penerimaan, tagihan pemasok, pembayaran) sehingga cocok dengan buku besar.
 */
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { aging, dunningLevel, isClosedStage, overdueDays, promiseStatus, supplierScore } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { mapSupplier } from '../purchasing/suppliers.service.js';
import { mapCustomer } from '../sales/customers.service.js';
import { exposures, invalid, todayWib, trimBranch, UUID } from '../sales/sales.shared.js';

export interface ContactInput { partyType?: 'customer' | 'supplier'; partyId?: string; name?: string; title?: string | null; phone?: string | null; email?: string | null; isPrimary?: boolean; notes?: string | null; status?: 'aktif' | 'nonaktif' }
export interface ActivityInput {
  kind: string; subject: string; notes?: string | null; dueAt?: string | null; done?: boolean; result?: string | null; assigneeName?: string | null;
  customerId?: string | null; supplierId?: string | null; leadId?: string | null; opportunityId?: string | null; invoiceId?: string | null; ticketId?: string | null;
}
export interface ActivityQuery { mine?: boolean; status?: string; customerId?: string; supplierId?: string; leadId?: string; opportunityId?: string; invoiceId?: string; ticketId?: string }

const mapContact = (r: any) => ({ id: r.id, partyType: r.party_type, partyId: r.party_id, name: r.name, title: r.title, phone: r.phone, email: r.email, isPrimary: r.is_primary, notes: r.notes, status: r.status });
export const mapActivity = (a: any, now = Date.now()) => ({
  id: a.id, kind: a.kind, subject: a.subject, notes: a.notes, dueAt: a.due_at, status: a.status, result: a.result, branch: a.branch_code ? trimBranch(a.branch_code) : null,
  assigneeName: a.assignee_name, assigneeId: a.assignee_id, doneAt: a.done_at, doneByName: a.done_by_name, createdByName: a.created_by_name, createdAt: a.created_at,
  overdue: a.status === 'terbuka' && a.due_at && new Date(a.due_at).getTime() < now,
  links: {
    customer: a.customer_id ? { id: a.customer_id, name: a.customer_name } : null, supplier: a.supplier_id ? { id: a.supplier_id, name: a.supplier_name } : null,
    lead: a.lead_id ? { id: a.lead_id, code: a.lead_code } : null, opportunity: a.opportunity_id ? { id: a.opportunity_id, code: a.opp_code } : null,
    invoice: a.invoice_id ? { id: a.invoice_id, docNo: a.invoice_no } : null, ticket: a.ticket_id ? { id: a.ticket_id, code: a.ticket_code } : null,
  },
});
export const ACTIVITY_SELECT = `SELECT a.*, cu.name AS customer_name, su.name AS supplier_name, l.code AS lead_code, o.code AS opp_code, i.doc_no AS invoice_no, t.code AS ticket_code
  FROM crm_activities a LEFT JOIN customers cu ON cu.id = a.customer_id LEFT JOIN suppliers su ON su.id = a.supplier_id LEFT JOIN leads l ON l.id = a.lead_id
  LEFT JOIN opportunities o ON o.id = a.opportunity_id LEFT JOIN invoices i ON i.id = a.invoice_id LEFT JOIN support_tickets t ON t.id = a.ticket_id`;

const yearStart = (d: string) => `${d.slice(0, 4)}-01-01`;

@Injectable()
export class RelationsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  /* ------------------------------ Kontak ------------------------------ */

  private async assertParty(c: PoolClient, companyId: string, type: string | undefined, id: string | undefined) {
    if (!type || !['customer', 'supplier'].includes(type) || !id || !UUID.test(id)) throw invalid('CONTACT_PARTY', 'Pilih pelanggan atau pemasok untuk kontak.');
    const r = (await c.query(`SELECT name FROM ${type === 'customer' ? 'customers' : 'suppliers'} WHERE company_id = $1 AND id = $2`, [companyId, id])).rows[0];
    if (!r) throw invalid('CONTACT_PARTY', `${type === 'customer' ? 'Pelanggan' : 'Pemasok'} tidak dikenal.`);
    return r;
  }

  async contacts(u: RequestUser, s: ScopeContext, partyType: string, partyId: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      await this.assertParty(c, u.companyId, partyType, partyId);
      return (await c.query(`SELECT * FROM contacts WHERE company_id = $1 AND party_type = $2 AND party_id = $3 ORDER BY status, is_primary DESC, name`, [u.companyId, partyType, partyId])).rows.map(mapContact);
    });
  }

  async saveContact(u: RequestUser, s: ScopeContext, id: string | null, b: ContactInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      let row: any = null;
      if (id) {
        if (!UUID.test(id)) throw notFound('Kontak');
        row = (await c.query('SELECT * FROM contacts WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
        if (!row) throw notFound('Kontak');
      }
      const type = row?.party_type ?? b.partyType, pid = row?.party_id ?? b.partyId;
      const party = await this.assertParty(c, u.companyId, type, pid);
      const name = (b.name ?? row?.name ?? '').trim();
      if (name.length < 2) throw invalid('CONTACT_NAME', 'Nama kontak minimal 2 karakter.');
      const primary = b.isPrimary ?? row?.is_primary ?? false;
      const status = b.status ?? row?.status ?? 'aktif';
      /* Satu kontak utama aktif per pihak: kontak utama baru menggeser yang lama. */
      if (primary && status === 'aktif') await c.query(`UPDATE contacts SET is_primary = false, updated_at = now() WHERE company_id = $1 AND party_type = $2 AND party_id = $3 AND is_primary AND id <> coalesce($4::uuid, '00000000-0000-0000-0000-000000000000')`, [u.companyId, type, pid, id]);
      let out: any;
      if (row) {
        out = (await c.query(`UPDATE contacts SET name = $2, title = $3, phone = $4, email = $5, is_primary = $6, notes = $7, status = $8, updated_at = now() WHERE id = $1 RETURNING *`,
          [id, name, b.title !== undefined ? b.title : row.title, b.phone !== undefined ? b.phone : row.phone, b.email !== undefined ? b.email : row.email, primary && status === 'aktif', b.notes !== undefined ? b.notes : row.notes, status])).rows[0];
      } else {
        out = (await c.query(`INSERT INTO contacts (company_id, party_type, party_id, name, title, phone, email, is_primary, notes, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [u.companyId, type, pid, name, b.title ?? null, b.phone ?? null, b.email ?? null, primary, b.notes ?? null, u.name])).rows[0];
      }
      /* Kontak utama menjadi PIC di data induk (dipakai faktur, PO, dan dokumen lain). */
      if (out.is_primary) await c.query(`UPDATE ${type === 'customer' ? 'customers' : 'suppliers'} SET pic = $3, phone = coalesce($4, phone), email = coalesce($5, email), updated_at = now() WHERE company_id = $1 AND id = $2`, [u.companyId, pid, out.name, out.phone, out.email]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: id ? 'contact.updated' : 'contact.created', entityType: type, entityId: party.name, after: { contact: name, primary: out.is_primary, status }, requestId });
      return mapContact(out);
    });
  }

  /* ------------------------------ Aktivitas & tugas ------------------------------ */

  /** Cabang aktivitas mengikuti dokumen/pihak tertaut (agar RLS cabang berlaku), selain itu konteks pengguna. */
  private async resolveLinks(c: PoolClient, companyId: string, s: ScopeContext, b: ActivityInput) {
    const one = async (table: string, id: string | null | undefined, label: string, branchCol = 'branch_code') => {
      if (!id) return null;
      if (!UUID.test(id)) throw invalid('ACTIVITY_LINK', `${label} tidak dikenal.`);
      const r = (await c.query(`SELECT id, ${branchCol} AS branch FROM ${table} WHERE company_id = $1 AND id = $2`, [companyId, id])).rows[0];
      if (!r) throw invalid('ACTIVITY_LINK', `${label} tidak dikenal.`);
      return r.branch ? trimBranch(r.branch) : null;
    };
    const branches = [await one('invoices', b.invoiceId, 'Faktur'), await one('support_tickets', b.ticketId, 'Tiket'), await one('opportunities', b.opportunityId, 'Peluang'),
      await one('leads', b.leadId, 'Lead'), await one('customers', b.customerId, 'Pelanggan'), await one('suppliers', b.supplierId, 'Pemasok')];
    if (![b.invoiceId, b.ticketId, b.opportunityId, b.leadId, b.customerId, b.supplierId].some(Boolean)) throw invalid('ACTIVITY_LINK', 'Aktivitas harus tertaut ke pelanggan, pemasok, lead, peluang, faktur, atau tiket.');
    return branches.find(Boolean) ?? (s.branch !== 'ALL' ? s.branch : null);
  }

  async createActivityIn(c: PoolClient, u: RequestUser, s: ScopeContext, b: ActivityInput, requestId: string) {
    const kinds = ['telepon', 'rapat', 'email', 'kunjungan', 'tugas', 'penagihan', 'catatan'];
    if (!kinds.includes(b.kind)) throw invalid('ACTIVITY_KIND', 'Jenis aktivitas tidak dikenal.');
    if (!b.subject?.trim()) throw invalid('ACTIVITY_SUBJECT', 'Isi judul aktivitas.');
    if (!b.done && !b.dueAt) throw invalid('ACTIVITY_DUE', 'Tugas terjadwal memerlukan tenggat; atau catat sebagai aktivitas selesai.');
    const branch = await this.resolveLinks(c, u.companyId, s, b);
    /* Pelanggan diturunkan dari faktur/peluang bila tidak diisi, agar tampil di profil 360. */
    let customerId = b.customerId ?? null;
    if (!customerId && b.invoiceId) customerId = (await c.query('SELECT customer_id FROM invoices WHERE id = $1', [b.invoiceId])).rows[0]?.customer_id ?? null;
    if (!customerId && b.opportunityId) customerId = (await c.query('SELECT customer_id FROM opportunities WHERE id = $1', [b.opportunityId])).rows[0]?.customer_id ?? null;
    const assignee = b.assigneeName?.trim() || u.name;
    const r = (await c.query(
      `INSERT INTO crm_activities (company_id, branch_code, kind, subject, notes, due_at, status, result, customer_id, supplier_id, lead_id, opportunity_id, invoice_id, ticket_id,
                                   assignee_id, assignee_name, done_at, done_by_name, created_by, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      [u.companyId, branch, b.kind, b.subject.trim().slice(0, 200), b.notes ?? null, b.dueAt ?? null, b.done ? 'selesai' : 'terbuka', b.result ?? null, customerId, b.supplierId ?? null,
        b.leadId ?? null, b.opportunityId ?? null, b.invoiceId ?? null, b.ticketId ?? null, assignee === u.name ? u.id : null, assignee, b.done ? new Date() : null, b.done ? u.name : null, u.id, u.name])).rows[0];
    /* Menghubungi lead baru memajukan statusnya ke dihubungi. */
    if (b.leadId && b.done && ['telepon', 'email', 'rapat', 'kunjungan'].includes(b.kind)) await c.query(`UPDATE leads SET status = 'dihubungi', updated_at = now() WHERE id = $1 AND status = 'baru'`, [b.leadId]);
    return r.id as string;
  }

  async createActivity(u: RequestUser, s: ScopeContext, b: ActivityInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const id = await this.createActivityIn(c, u, s, b, requestId);
      return mapActivity((await c.query(`${ACTIVITY_SELECT} WHERE a.id = $1`, [id])).rows[0]);
    });
  }

  async listActivities(u: RequestUser, s: ScopeContext, q: ActivityQuery, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const conds = ['a.company_id = $1'];
      const args: any[] = [u.companyId];
      const add = (sql: string, v: any) => { args.push(v); conds.push(sql.replace('?', `$${args.length}`)); };
      if (s.branch !== 'ALL') add('(a.branch_code IS NULL OR a.branch_code = ?)', s.branch);
      if (q.mine) { args.push(u.id, u.name); conds.push(`(a.assignee_id = $${args.length - 1} OR a.assignee_name = $${args.length})`); }
      if (q.status && q.status !== 'all') add('a.status = ?', q.status);
      for (const [k, col] of [['customerId', 'customer_id'], ['supplierId', 'supplier_id'], ['leadId', 'lead_id'], ['opportunityId', 'opportunity_id'], ['invoiceId', 'invoice_id'], ['ticketId', 'ticket_id']] as const) {
        const v = (q as any)[k]; if (v) { if (!UUID.test(v)) throw invalid('ACTIVITY_FILTER', 'Saringan tidak sah.'); add(`a.${col} = ?`, v); }
      }
      const rows = (await c.query(`${ACTIVITY_SELECT} WHERE ${conds.join(' AND ')} ORDER BY (a.status = 'terbuka') DESC, coalesce(a.due_at, a.done_at, a.created_at) ${q.status === 'selesai' ? 'DESC' : 'ASC'} LIMIT 1000`, args)).rows.map((a: any) => mapActivity(a));
      /* Agenda juga memuat tindak lanjut peluang & janji bayar yang jatuh tempo (dibaca dari modulnya). */
      const agenda = !q.customerId && !q.supplierId && !q.leadId && !q.opportunityId && !q.invoiceId && !q.ticketId && q.status !== 'selesai';
      const opps = agenda ? (await c.query(`SELECT id, code, name, next_action, next_action_date, owner_name, company_name FROM opportunities WHERE company_id = $1 AND stage NOT IN ('menang','kalah') AND next_action_date IS NOT NULL
          AND ($2::text IS NULL OR branch_code = $2) AND ($3::text IS NULL OR owner_name = $3) ORDER BY next_action_date LIMIT 300`, [u.companyId, s.branch === 'ALL' ? null : s.branch, q.mine ? u.name : null])).rows
        .map((o: any) => ({ id: o.id, code: o.code, title: `${o.next_action ?? 'Tindak lanjut'} — ${o.name}`, companyName: o.company_name, date: o.next_action_date, ownerName: o.owner_name, overdue: o.next_action_date < todayWib() })) : [];
      const today = todayWib();
      const now = Date.now(), endToday = new Date(`${today}T23:59:59+07:00`).getTime();
      const open = rows.filter((r) => r.status === 'terbuka');
      return {
        rows, opportunities: opps,
        summary: { overdue: open.filter((r) => r.overdue).length + opps.filter((o: any) => o.overdue).length, today: open.filter((r) => r.dueAt && new Date(r.dueAt).getTime() >= now && new Date(r.dueAt).getTime() <= endToday).length,
          upcoming: open.filter((r) => r.dueAt && new Date(r.dueAt).getTime() > endToday).length, done7d: rows.filter((r) => r.status === 'selesai' && r.doneAt && now - new Date(r.doneAt).getTime() < 7 * 86_400_000).length },
      };
    });
  }

  async completeActivity(u: RequestUser, s: ScopeContext, id: string, b: { result?: string | null; followUp?: { subject: string; dueAt: string } | null }, requestId: string) {
    if (!UUID.test(id)) throw notFound('Aktivitas');
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const a = (await c.query('SELECT * FROM crm_activities WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
      if (!a) throw notFound('Aktivitas');
      if (a.status !== 'terbuka') throw conflict('ACTIVITY_CLOSED', 'Aktivitas sudah selesai atau batal.');
      await c.query(`UPDATE crm_activities SET status = 'selesai', result = $2, done_at = now(), done_by_name = $3 WHERE id = $1`, [id, b.result ?? null, u.name]);
      if (a.lead_id && ['telepon', 'email', 'rapat', 'kunjungan'].includes(a.kind)) await c.query(`UPDATE leads SET status = 'dihubungi', updated_at = now() WHERE id = $1 AND status = 'baru'`, [a.lead_id]);
      if (b.followUp?.subject && b.followUp.dueAt) {
        await this.createActivityIn(c, u, s, { kind: a.kind === 'catatan' ? 'tugas' : a.kind, subject: b.followUp.subject, dueAt: b.followUp.dueAt, assigneeName: a.assignee_name,
          customerId: a.customer_id, supplierId: a.supplier_id, leadId: a.lead_id, opportunityId: a.opportunity_id, invoiceId: a.invoice_id, ticketId: a.ticket_id }, requestId);
      }
      return mapActivity((await c.query(`${ACTIVITY_SELECT} WHERE a.id = $1`, [id])).rows[0]);
    });
  }

  async cancelActivity(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    if (!UUID.test(id)) throw notFound('Aktivitas');
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const r = await c.query(`UPDATE crm_activities SET status = 'batal', done_at = now(), done_by_name = $3 WHERE company_id = $1 AND id = $2 AND status = 'terbuka' RETURNING id`, [u.companyId, id, u.name]);
      if (!r.rowCount) throw conflict('ACTIVITY_CLOSED', 'Aktivitas tidak terbuka.');
      return mapActivity((await c.query(`${ACTIVITY_SELECT} WHERE a.id = $1`, [id])).rows[0]);
    });
  }

  /* ------------------------------ Profil 360 pelanggan ------------------------------ */

  async customerProfile(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    if (!UUID.test(id)) throw notFound('Pelanggan');
    return this.db.run(contextOf(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
      const r = (await c.query('SELECT * FROM customers WHERE company_id = $1 AND id = $2', [u.companyId, id])).rows[0];
      if (!r) throw notFound('Pelanggan');
      const today = todayWib();
      const ex = (await exposures(c, u.companyId, id)).get(id) ?? { openAr: 0, overdue: 0, drafts: 0, openOrders: 0, total: 0 };
      const inv = (await c.query(`SELECT id, doc_no, branch_code, invoice_date, due_date, net_amount, total_gross, paid_amount, status, sales_order_id FROM invoices WHERE company_id = $1 AND customer_id = $2 ORDER BY invoice_date DESC, doc_no DESC`, [u.companyId, id])).rows;
      const invoices = inv.map((i: any) => {
        const open = ['belum-dibayar', 'sebagian'].includes(i.status) ? Number(i.total_gross) - Number(i.paid_amount) : 0;
        const od = overdueDays(i.due_date, today, open);
        return { id: i.id, docNo: i.doc_no, branch: trimBranch(i.branch_code), date: i.invoice_date, dueDate: i.due_date, net: Number(i.net_amount), total: Number(i.total_gross), paid: Number(i.paid_amount), open, overdueDays: od, dunning: open > 0 ? dunningLevel(od) : null, status: i.status };
      });
      const issued = invoices.filter((i) => !['draf', 'batal'].includes(i.status));
      const ys = yearStart(today), prevYs = `${Number(today.slice(0, 4)) - 1}-01-01`;
      const revenueYtd = issued.filter((i) => i.date >= ys).reduce((t, i) => t + i.net, 0);
      const revenuePrev = issued.filter((i) => i.date >= prevYs && i.date < ys).reduce((t, i) => t + i.net, 0);
      const monthly = Array.from({ length: 12 }, (_, k) => {
        const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - (11 - k), 1)).toISOString().slice(0, 7);
        return { month: d, revenue: issued.filter((i) => i.date.slice(0, 7) === d).reduce((t, i) => t + i.net, 0) };
      });
      const receipts = (await c.query(`SELECT r.id, r.doc_no, r.receipt_date, r.amount, r.method, r.journal_id, i.doc_no AS invoice_no, i.invoice_date FROM receipts r JOIN invoices i ON i.id = r.invoice_id
          WHERE r.company_id = $1 AND (r.customer_id = $2 OR i.customer_id = $2) ORDER BY r.receipt_date DESC, r.doc_no DESC`, [u.companyId, id])).rows;
      const paidRecent = receipts.filter((x: any) => x.receipt_date >= `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`);
      const weight = paidRecent.reduce((t: number, x: any) => t + Number(x.amount), 0);
      const avgDaysToPay = weight ? Math.round(paidRecent.reduce((t: number, x: any) => t + Number(x.amount) * Math.max(0, (Date.parse(x.receipt_date) - Date.parse(x.invoice_date)) / 86_400_000), 0) / weight) : null;
      const orders = (await c.query(`SELECT id, doc_no, branch_code, order_date, total, status, quotation_id FROM sales_orders WHERE company_id = $1 AND customer_id = $2 ORDER BY order_date DESC, doc_no DESC LIMIT 50`, [u.companyId, id])).rows
        .map((o: any) => ({ id: o.id, docNo: o.doc_no, branch: trimBranch(o.branch_code), date: o.order_date, total: Number(o.total), status: o.status, fromQuote: Boolean(o.quotation_id) }));
      const quotes = (await c.query(`SELECT id, doc_no, quote_date, valid_until, total, status, sales_order_id FROM quotations WHERE company_id = $1 AND customer_id = $2 ORDER BY quote_date DESC LIMIT 50`, [u.companyId, id])).rows
        .map((q: any) => ({ id: q.id, docNo: q.doc_no, date: q.quote_date, validUntil: q.valid_until, total: Number(q.total), status: q.status, expired: ['draf', 'terkirim'].includes(q.status) && q.valid_until < today }));
      const opps = (await c.query(`SELECT id, code, name, value, stage, probability, expected_close, owner_name FROM opportunities WHERE company_id = $1 AND customer_id = $2 ORDER BY created_at DESC`, [u.companyId, id])).rows
        .map((o: any) => ({ id: o.id, code: o.code, name: o.name, value: Number(o.value), stage: o.stage, probability: o.probability, expectedClose: o.expected_close, ownerName: o.owner_name }));
      const promisesRaw = (await c.query(`SELECT p.*, i.doc_no, i.paid_amount FROM collection_promises p JOIN invoices i ON i.id = p.invoice_id WHERE p.company_id = $1 AND p.customer_id = $2 ORDER BY p.created_at DESC LIMIT 50`, [u.companyId, id])).rows;
      const promises = promisesRaw.map((p: any) => ({ id: p.id, invoiceId: p.invoice_id, invoiceNo: p.doc_no, promiseDate: p.promise_date, amount: Number(p.amount), note: p.note, createdByName: p.created_by_name,
        status: promiseStatus({ amount: Number(p.amount), paidBefore: Number(p.paid_before), promiseDate: p.promise_date, status: p.status }, Number(p.paid_amount), today) }));
      const tickets = (await c.query(`SELECT id, code, subject, category, priority, status, sla_due_at, created_at FROM support_tickets WHERE company_id = $1 AND customer_id = $2 ORDER BY created_at DESC LIMIT 50`, [u.companyId, id])).rows
        .map((t: any) => ({ id: t.id, code: t.code, subject: t.subject, category: t.category, priority: t.priority, status: t.status, slaDueAt: t.sla_due_at, breached: !['selesai', 'ditutup'].includes(t.status) && new Date(t.sla_due_at).getTime() < Date.now(), createdAt: t.created_at }));
      const contacts = (await c.query(`SELECT * FROM contacts WHERE company_id = $1 AND party_type = 'customer' AND party_id = $2 ORDER BY status, is_primary DESC, name`, [u.companyId, id])).rows.map(mapContact);
      const activities = (await c.query(`${ACTIVITY_SELECT} WHERE a.company_id = $1 AND a.customer_id = $2 ORDER BY coalesce(a.done_at, a.due_at, a.created_at) DESC LIMIT 100`, [u.companyId, id])).rows.map((a: any) => mapActivity(a));
      const projects = (await c.query(`SELECT id, code, name, status FROM projects WHERE company_id = $1 AND customer_id = $2 ORDER BY start_date DESC`, [u.companyId, id])).rows;
      const openInv = invoices.filter((i) => i.open > 0);
      const won = opps.filter((o) => o.stage === 'menang');
      return {
        customer: { ...mapCustomer(r), accountManager: r.account_manager, exposure: ex, available: Number(r.credit_limit) - ex.total },
        kpi: {
          revenueYtd, revenuePrevYear: revenuePrev, invoicesYtd: issued.filter((i) => i.date >= ys).length, openAr: ex.openAr, overdue: ex.overdue, creditLimit: Number(r.credit_limit),
          creditAvailable: Number(r.credit_limit) - ex.total, creditUsedPct: Number(r.credit_limit) > 0 ? Math.round((ex.total / Number(r.credit_limit)) * 1000) / 10 : null, avgDaysToPay,
          lastOrderDate: orders[0]?.date ?? null, pipeline: opps.filter((o) => !isClosedStage(o.stage)).reduce((t, o) => t + Math.round((o.value * o.probability) / 100), 0),
          wonValue: won.reduce((t, o) => t + o.value, 0), openTickets: tickets.filter((t) => !['selesai', 'ditutup'].includes(t.status)).length,
          worstDunning: openInv.reduce((m: any, i) => (!m || (i.dunning && i.dunning.level > m.level) ? i.dunning : m), null),
        },
        aging: aging(openInv.map((i) => ({ dueDate: i.dueDate, open: i.open })), today), monthly,
        contacts, opportunities: opps, quotations: quotes, orders, invoices: invoices.slice(0, 100),
        receipts: receipts.slice(0, 50).map((x: any) => ({ id: x.id, docNo: x.doc_no, date: x.receipt_date, amount: Number(x.amount), method: x.method, invoiceNo: x.invoice_no, journalId: x.journal_id })),
        promises, tickets, activities, projects: projects.map((p: any) => ({ id: p.id, code: p.code, name: p.name, status: p.status })),
      };
    });
  }

  /* ------------------------------ Profil 360 pemasok ------------------------------ */

  async supplierProfile(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    if (!UUID.test(id)) throw notFound('Pemasok');
    return this.db.run(contextOf(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
      const r = (await c.query('SELECT * FROM suppliers WHERE company_id = $1 AND id = $2', [u.companyId, id])).rows[0];
      if (!r) throw notFound('Pemasok');
      const today = todayWib(), ys = yearStart(today);
      const pos = (await c.query(`SELECT id, doc_no, branch_code, order_date, expected_date, total, status FROM purchase_orders WHERE company_id = $1 AND supplier_id = $2 ORDER BY order_date DESC, doc_no DESC`, [u.companyId, id])).rows;
      const aps = (await c.query(`SELECT id, doc_no, branch_code, invoice_date, due_date, net_amount, total_gross, paid_amount, status FROM ap_invoices WHERE company_id = $1 AND supplier_id = $2 ORDER BY invoice_date DESC, doc_no DESC`, [u.companyId, id])).rows;
      const pays = (await c.query(`SELECT p.id, p.doc_no, p.payment_date, p.amount, p.status, i.doc_no AS invoice_no FROM supplier_payments p JOIN ap_invoices i ON i.id = p.invoice_id WHERE p.company_id = $1 AND p.supplier_id = $2 ORDER BY p.payment_date DESC LIMIT 50`, [u.companyId, id])).rows;
      /* Ketepatan kirim: penerimaan pertama tiap PO dibanding perkiraan tiba. */
      const del = (await c.query(`SELECT o.id, o.order_date, o.expected_date, min(g.receipt_date) AS first_receipt FROM purchase_orders o JOIN goods_receipts g ON g.order_id = o.id
          WHERE o.company_id = $1 AND o.supplier_id = $2 GROUP BY o.id, o.order_date, o.expected_date`, [u.companyId, id])).rows;
      const onTime = del.filter((d: any) => !d.expected_date || d.first_receipt <= d.expected_date).length;
      const quotes = (await c.query(`SELECT x.id, x.status, x.total, x.quote_date, q.doc_no, q.title, q.status AS rfq_status, (q.awarded_quote_id = x.id) AS won FROM rfq_quotes x JOIN rfqs q ON q.id = x.rfq_id
          WHERE x.company_id = $1 AND x.supplier_id = $2 ORDER BY q.rfq_date DESC LIMIT 50`, [u.companyId, id])).rows;
      const decided = quotes.filter((q: any) => q.rfq_status === 'dipesan' && q.status === 'masuk');
      const tickets = (await c.query(`SELECT id, code, subject, category, priority, status, sla_due_at, created_at FROM support_tickets WHERE company_id = $1 AND supplier_id = $2 ORDER BY created_at DESC LIMIT 50`, [u.companyId, id])).rows
        .map((t: any) => ({ id: t.id, code: t.code, subject: t.subject, category: t.category, priority: t.priority, status: t.status, slaDueAt: t.sla_due_at, createdAt: t.created_at }));
      const contacts = (await c.query(`SELECT * FROM contacts WHERE company_id = $1 AND party_type = 'supplier' AND party_id = $2 ORDER BY status, is_primary DESC, name`, [u.companyId, id])).rows.map(mapContact);
      const activities = (await c.query(`${ACTIVITY_SELECT} WHERE a.company_id = $1 AND a.supplier_id = $2 ORDER BY coalesce(a.done_at, a.due_at, a.created_at) DESC LIMIT 100`, [u.companyId, id])).rows.map((a: any) => mapActivity(a));
      const posted = aps.filter((a: any) => !['draf', 'batal'].includes(a.status));
      const openAp = posted.filter((a: any) => ['belum-dibayar', 'sebagian'].includes(a.status));
      const leadTimes = del.map((d: any) => (Date.parse(d.first_receipt) - Date.parse(d.order_date)) / 86_400_000);
      const metrics = {
        onTimeRate: del.length ? Math.round((onTime / del.length) * 1000) / 10 : null, deliveries: del.length,
        avgLeadDays: leadTimes.length ? Math.round((leadTimes.reduce((t: number, v: number) => t + v, 0) / leadTimes.length) * 10) / 10 : null,
        rfqInvited: quotes.length, rfqQuoted: quotes.filter((q: any) => q.status === 'masuk').length, rfqWon: quotes.filter((q: any) => q.won).length,
        rfqWinRate: decided.length ? Math.round((decided.filter((q: any) => q.won).length / decided.length) * 1000) / 10 : null, claims: tickets.length,
      };
      return {
        supplier: mapSupplier(r),
        kpi: {
          purchasesYtd: posted.filter((a: any) => a.invoice_date >= ys).reduce((t: number, a: any) => t + Number(a.net_amount), 0),
          openAp: openAp.reduce((t: number, a: any) => t + Number(a.total_gross) - Number(a.paid_amount), 0),
          overdueAp: openAp.filter((a: any) => a.due_date < today).reduce((t: number, a: any) => t + Number(a.total_gross) - Number(a.paid_amount), 0),
          openPo: pos.filter((o: any) => ['menunggu', 'disetujui', 'diterima-sebagian'].includes(o.status)).reduce((t: number, o: any) => t + Number(o.total), 0),
          ...metrics, score: supplierScore({ onTimeRate: metrics.onTimeRate, tickets: tickets.length, receipts: del.length, rfqWinRate: metrics.rfqWinRate }),
        },
        contacts, activities, tickets,
        orders: pos.slice(0, 50).map((o: any) => ({ id: o.id, docNo: o.doc_no, branch: trimBranch(o.branch_code), date: o.order_date, expectedDate: o.expected_date, total: Number(o.total), status: o.status })),
        invoices: aps.slice(0, 50).map((a: any) => ({ id: a.id, docNo: a.doc_no, branch: trimBranch(a.branch_code), date: a.invoice_date, dueDate: a.due_date, total: Number(a.total_gross), paid: Number(a.paid_amount), status: a.status })),
        payments: pays.map((p: any) => ({ id: p.id, docNo: p.doc_no, date: p.payment_date, amount: Number(p.amount), status: p.status, invoiceNo: p.invoice_no })),
        quotes: quotes.map((q: any) => ({ id: q.id, rfqNo: q.doc_no, title: q.title, status: q.status, total: q.total === null ? null : Number(q.total), won: q.won, rfqStatus: q.rfq_status })),
      };
    });
  }

  /* ------------------------------ Dasbor CRM ------------------------------ */

  async dashboard(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const br = s.branch === 'ALL' ? null : s.branch;
      const today = todayWib(), ys = yearStart(today), ms = `${today.slice(0, 7)}-01`;
      const opps = (await c.query(`SELECT stage, value, probability, expected_close, owner_name, closed_at FROM opportunities WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2)`, [u.companyId, br])).rows
        .map((o: any) => ({ ...o, value: Number(o.value) }));
      const stages = ['prospek', 'kualifikasi', 'penawaran', 'negosiasi', 'menang', 'kalah'].map((st) => {
        const xs = opps.filter((o: any) => o.stage === st);
        return { stage: st, count: xs.length, value: xs.reduce((t: number, o: any) => t + o.value, 0), weighted: isClosedStage(st) ? 0 : xs.reduce((t: number, o: any) => t + Math.round((o.value * o.probability) / 100), 0) };
      });
      const open = opps.filter((o: any) => !isClosedStage(o.stage));
      const forecast = Array.from({ length: 6 }, (_, k) => {
        const m = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + k, 1)).toISOString().slice(0, 7);
        const xs = open.filter((o: any) => (o.expected_close ?? '').slice(0, 7) === m);
        return { month: m, count: xs.length, weighted: xs.reduce((t: number, o: any) => t + Math.round((o.value * o.probability) / 100), 0) };
      });
      const owners = Object.values(open.reduce((m: Record<string, any>, o: any) => { const k = o.owner_name; m[k] ??= { owner: k, count: 0, weighted: 0 }; m[k].count += 1; m[k].weighted += Math.round((o.value * o.probability) / 100); return m; }, {}))
        .sort((a: any, b: any) => b.weighted - a.weighted);
      const since90 = Date.now() - 90 * 86_400_000;
      const closed90 = opps.filter((o: any) => isClosedStage(o.stage) && o.closed_at && new Date(o.closed_at).getTime() >= since90);
      const leads = (await c.query(`SELECT status, source, created_at FROM leads WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2)`, [u.companyId, br])).rows;
      const sales = (await c.query(`SELECT coalesce(sum(net_amount) FILTER (WHERE invoice_date >= $3), 0)::bigint AS mtd, coalesce(sum(net_amount), 0)::bigint AS ytd FROM invoices
          WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2) AND status NOT IN ('draf','batal') AND invoice_date >= $4`, [u.companyId, br, ms, ys])).rows[0];
      const top = (await c.query(`SELECT c.id, c.name, sum(i.net_amount)::bigint AS revenue FROM invoices i JOIN customers c ON c.id = i.customer_id
          WHERE i.company_id = $1 AND ($2::text IS NULL OR i.branch_code = $2) AND i.status NOT IN ('draf','batal') AND i.invoice_date >= $3 GROUP BY c.id, c.name ORDER BY 3 DESC LIMIT 5`, [u.companyId, br, ys])).rows
        .map((r: any) => ({ id: r.id, name: r.name, revenue: Number(r.revenue) }));
      const ar = (await c.query(`SELECT coalesce(sum(total_gross - paid_amount), 0)::bigint AS open, coalesce(sum(total_gross - paid_amount) FILTER (WHERE due_date < $3), 0)::bigint AS overdue,
          count(*) FILTER (WHERE due_date < $3)::int AS overdue_count FROM invoices WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2) AND status IN ('belum-dibayar','sebagian')`, [u.companyId, br, today])).rows[0];
      const prom = (await c.query(`SELECT p.amount, p.paid_before, p.promise_date, p.status, i.paid_amount FROM collection_promises p JOIN invoices i ON i.id = p.invoice_id WHERE p.company_id = $1 AND ($2::text IS NULL OR p.branch_code = $2) AND p.status = 'aktif'`, [u.companyId, br])).rows
        .map((p: any) => promiseStatus({ amount: Number(p.amount), paidBefore: Number(p.paid_before), promiseDate: p.promise_date, status: p.status }, Number(p.paid_amount), today));
      const tk = (await c.query(`SELECT priority, status, sla_due_at, satisfaction, closed_at FROM support_tickets WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2)`, [u.companyId, br])).rows;
      const openTk = tk.filter((t: any) => !['selesai', 'ditutup'].includes(t.status));
      const rated = tk.filter((t: any) => t.satisfaction);
      const acts = (await c.query(`SELECT due_at, assignee_id, assignee_name FROM crm_activities WHERE company_id = $1 AND ($2::text IS NULL OR branch_code IS NULL OR branch_code = $2) AND status = 'terbuka'`, [u.companyId, br])).rows;
      const qts = (await c.query(`SELECT total, valid_until FROM quotations WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2) AND status = 'terkirim'`, [u.companyId, br])).rows;
      const in7 = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10);
      const mine = (a: any) => a.assignee_id === u.id || a.assignee_name === u.name;
      return {
        pipeline: { stages, forecast, owners, openCount: open.length, weighted: stages.reduce((t, x) => t + x.weighted, 0),
          winRate90: closed90.length ? Math.round((closed90.filter((o: any) => o.stage === 'menang').length / closed90.length) * 1000) / 10 : null },
        leads: { total: leads.length, newThisMonth: leads.filter((l: any) => new Date(l.created_at).toISOString().slice(0, 10) >= ms).length,
          byStatus: ['baru', 'dihubungi', 'kualifikasi', 'dikonversi', 'diskualifikasi'].map((st) => ({ status: st, count: leads.filter((l: any) => l.status === st).length })),
          bySource: Object.entries(leads.reduce((m: Record<string, number>, l: any) => { m[l.source] = (m[l.source] ?? 0) + 1; return m; }, {})).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count) },
        sales: { mtd: Number(sales.mtd), ytd: Number(sales.ytd), topCustomers: top },
        quotations: { sentCount: qts.length, sentValue: qts.reduce((t: number, q: any) => t + Number(q.total), 0), expiring7: qts.filter((q: any) => q.valid_until >= today && q.valid_until <= in7).length, expired: qts.filter((q: any) => q.valid_until < today).length },
        collection: { openAr: Number(ar.open), overdue: Number(ar.overdue), overdueCount: ar.overdue_count, promisesWaiting: prom.filter((p) => p === 'menunggu').length, promisesBroken: prom.filter((p) => p === 'ingkar').length, promisesKept: prom.filter((p) => p === 'ditepati').length },
        tickets: { open: openTk.length, breached: openTk.filter((t: any) => new Date(t.sla_due_at).getTime() < Date.now()).length,
          byPriority: ['kritis', 'tinggi', 'sedang', 'rendah'].map((p) => ({ priority: p, count: openTk.filter((t: any) => t.priority === p).length })),
          avgSatisfaction: rated.length ? Math.round((rated.reduce((t: number, x: any) => t + x.satisfaction, 0) / rated.length) * 10) / 10 : null },
        activities: { overdue: acts.filter((a: any) => a.due_at && new Date(a.due_at).getTime() < Date.now()).length, mineOpen: acts.filter(mine).length, mineOverdue: acts.filter((a: any) => mine(a) && a.due_at && new Date(a.due_at).getTime() < Date.now()).length },
      };
    });
  }
}
