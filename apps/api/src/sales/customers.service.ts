/**
 * Data induk penjualan: pelanggan (plafon, termin, status) dan produk/jasa.
 * Plafon & status pelanggan mengendalikan persetujuan pesanan (dok. 07 §4.4).
 */
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { exposures, invalid, trimBranch, UUID } from './sales.shared.js';

export interface CustomerInput {
  name?: string; segment?: string; pic?: string; phone?: string; email?: string; address?: string; city?: string; npwp?: string;
  branch?: string | null; creditLimit?: number; termsDays?: number; status?: 'aktif' | 'ditahan' | 'nonaktif'; reason?: string;
}
export interface ProductInput { sku?: string; name?: string; kind?: 'barang' | 'jasa'; unit?: string; price?: number; status?: 'aktif' | 'nonaktif'; reason?: string }

export const mapCustomer = (r: any) => ({
  id: r.id, code: r.code, name: r.name, segment: r.segment, pic: r.pic, phone: r.phone, email: r.email, address: r.address, city: r.city, npwp: r.npwp,
  branch: r.branch_code ? trimBranch(r.branch_code) : null, creditLimit: r.credit_limit, termsDays: r.terms_days, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
});
const mapProduct = (r: any) => ({ id: r.id, sku: r.sku, name: r.name, kind: r.kind, unit: r.unit, price: r.price, status: r.status, stock: r.stock ?? [], updatedAt: r.updated_at });

@Injectable()
export class CustomersService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  private async withExposure(c: PoolClient, companyId: string, rows: any[]) {
    const ex = await exposures(c, companyId);
    return rows.map((r) => {
      const e = ex.get(r.id) ?? { openAr: 0, overdue: 0, drafts: 0, openOrders: 0, total: 0 };
      return { ...mapCustomer(r), exposure: e, available: r.credit_limit - e.total };
    });
  }

  async list(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const rows = (await c.query('SELECT * FROM customers WHERE company_id = $1 ORDER BY name', [u.companyId])).rows;
      return this.withExposure(c, u.companyId, rows);
    });
  }

  async get(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    if (!UUID.test(id)) throw notFound('Pelanggan');
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const r = (await c.query('SELECT * FROM customers WHERE company_id = $1 AND id = $2', [u.companyId, id])).rows[0];
      if (!r) throw notFound('Pelanggan');
      const [cust] = await this.withExposure(c, u.companyId, [r]);
      /* Dokumen di bawah ini mengikuti RLS: hanya cabang yang boleh dilihat pengguna. */
      const invoices = (await c.query(
        `SELECT id, doc_no, branch_code, invoice_date, due_date, total_gross, paid_amount, status FROM invoices
          WHERE company_id = $1 AND customer_id = $2 ORDER BY invoice_date DESC, doc_no DESC LIMIT 100`, [u.companyId, id])).rows
        .map((i: any) => ({ id: i.id, docNo: i.doc_no, branch: trimBranch(i.branch_code), date: i.invoice_date, dueDate: i.due_date, total: i.total_gross, paid: i.paid_amount, open: i.status === 'batal' || i.status === 'draf' ? 0 : i.total_gross - i.paid_amount, status: i.status }));
      const orders = (await c.query(
        `SELECT id, doc_no, branch_code, order_date, total, status FROM sales_orders WHERE company_id = $1 AND customer_id = $2 ORDER BY order_date DESC, doc_no DESC LIMIT 100`, [u.companyId, id])).rows
        .map((o: any) => ({ id: o.id, docNo: o.doc_no, branch: trimBranch(o.branch_code), date: o.order_date, total: o.total, status: o.status }));
      return { ...cust, invoices, orders };
    });
  }

  private validate(b: CustomerInput, creating: boolean) {
    const errs: string[] = [];
    if (creating && !b.name) errs.push('Nama pelanggan wajib diisi.');
    const status = b.status ?? 'aktif';
    if (b.creditLimit !== undefined && status === 'aktif' && creating && b.creditLimit <= 0) errs.push('Plafon kredit harus lebih dari nol untuk pelanggan aktif.');
    if (errs.length) throw invalid('CUSTOMER_INVALID', errs[0], errs);
  }

  async create(u: RequestUser, s: ScopeContext, b: CustomerInput, requestId: string) {
    this.validate(b, true);
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const dup = await c.query('SELECT code FROM customers WHERE company_id = $1 AND lower(name) = lower($2)', [u.companyId, b.name]);
      if (dup.rowCount) throw conflict('CUSTOMER_EXISTS', `Pelanggan "${b.name}" sudah terdaftar (${dup.rows[0].code}).`);
      if (b.branch) await this.assertBranchExists(c, u.companyId, b.branch);
      const n = (await c.query(`SELECT next_doc_no($1, 'CUST', 0) AS n`, [u.companyId])).rows[0].n;
      const code = `CUST-${String(n).padStart(4, '0')}`;
      const r = (await c.query(
        `INSERT INTO customers (company_id, code, name, segment, pic, phone, email, address, city, npwp, branch_code, credit_limit, terms_days, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [u.companyId, code, b.name, b.segment ?? 'Langsung', b.pic ?? null, b.phone ?? null, b.email ?? null, b.address ?? null, b.city ?? null, b.npwp ?? null,
          b.branch || null, b.creditLimit ?? 0, b.termsDays ?? 30, b.status ?? 'aktif'])).rows[0];
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'customer.created', entityType: 'customer', entityId: code, after: mapCustomer(r), requestId });
      return mapCustomer(r);
    });
  }

  private async assertBranchExists(c: PoolClient, companyId: string, code: string) {
    const r = await c.query('SELECT 1 FROM branches WHERE company_id = $1 AND code = $2', [companyId, code]);
    if (!r.rowCount) throw invalid('BRANCH_UNKNOWN', `Cabang ${code} tidak dikenal.`);
  }

  async patch(u: RequestUser, s: ScopeContext, id: string, b: CustomerInput, requestId: string) {
    if (!UUID.test(id)) throw notFound('Pelanggan');
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const cur = (await c.query('SELECT * FROM customers WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
      if (!cur) throw notFound('Pelanggan');
      const sensitive = (b.creditLimit !== undefined && b.creditLimit !== cur.credit_limit) || (b.status !== undefined && b.status !== cur.status) || (b.termsDays !== undefined && b.termsDays !== cur.terms_days);
      if (sensitive && (!b.reason || b.reason.trim().length < 3)) throw invalid('REASON_REQUIRED', 'Perubahan plafon, termin, atau status pelanggan wajib diberi alasan.');
      const status = b.status ?? cur.status;
      const limit = b.creditLimit ?? cur.credit_limit;
      if (status === 'aktif' && limit <= 0) throw invalid('CUSTOMER_INVALID', 'Plafon kredit harus lebih dari nol untuk pelanggan aktif.');
      if (b.name && b.name.toLowerCase() !== cur.name.toLowerCase()) {
        const dup = await c.query('SELECT code FROM customers WHERE company_id = $1 AND lower(name) = lower($2) AND id <> $3', [u.companyId, b.name, id]);
        if (dup.rowCount) throw conflict('CUSTOMER_EXISTS', `Nama "${b.name}" sudah dipakai pelanggan ${dup.rows[0].code}.`);
      }
      if (b.branch) await this.assertBranchExists(c, u.companyId, b.branch);
      const r = (await c.query(
        `UPDATE customers SET name = coalesce($3, name), segment = coalesce($4, segment), pic = coalesce($5, pic), phone = coalesce($6, phone), email = coalesce($7, email),
            address = coalesce($8, address), city = coalesce($9, city), npwp = coalesce($10, npwp), branch_code = CASE WHEN $11::text = '' THEN NULL ELSE coalesce($11, branch_code) END,
            credit_limit = $12, terms_days = coalesce($13, terms_days), status = $14, updated_at = now()
          WHERE company_id = $1 AND id = $2 RETURNING *`,
        [u.companyId, id, b.name ?? null, b.segment ?? null, b.pic ?? null, b.phone ?? null, b.email ?? null, b.address ?? null, b.city ?? null, b.npwp ?? null,
          b.branch === undefined ? null : b.branch ?? '', limit, b.termsDays ?? null, status])).rows[0];
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'customer.updated', entityType: 'customer', entityId: cur.code,
        before: mapCustomer(cur), after: { ...mapCustomer(r), reason: b.reason }, requestId });
      const [out] = await this.withExposure(c, u.companyId, [r]);
      return out;
    });
  }

  /* ------------------------------- Produk -------------------------------- */

  async products(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const rows = (await c.query(
        `SELECT p.*, coalesce((SELECT json_agg(json_build_object('branch', trim(si.branch_code), 'warehouse', si.warehouse_code, 'onHand', si.on_hand, 'avgCost', si.avg_cost) ORDER BY si.branch_code)
                                 FROM stock_items si WHERE si.company_id = p.company_id AND si.sku = p.sku), '[]'::json) AS stock
           FROM products p WHERE p.company_id = $1 ORDER BY p.kind, p.sku`, [u.companyId])).rows;
      return rows.map(mapProduct);
    });
  }

  async createProduct(u: RequestUser, s: ScopeContext, b: Required<Pick<ProductInput, 'sku' | 'name' | 'kind' | 'unit' | 'price'>>, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const dup = await c.query('SELECT 1 FROM products WHERE company_id = $1 AND sku = $2', [u.companyId, b.sku]);
      if (dup.rowCount) throw conflict('PRODUCT_EXISTS', `SKU ${b.sku} sudah dipakai.`);
      const r = (await c.query(`INSERT INTO products (company_id, sku, name, kind, unit, price) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [u.companyId, b.sku, b.name, b.kind, b.unit, b.price])).rows[0];
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'product.created', entityType: 'product', entityId: b.sku, after: mapProduct(r), requestId });
      return mapProduct(r);
    });
  }

  async patchProduct(u: RequestUser, s: ScopeContext, sku: string, b: ProductInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const cur = (await c.query('SELECT * FROM products WHERE company_id = $1 AND sku = $2 FOR UPDATE', [u.companyId, sku])).rows[0];
      if (!cur) throw notFound(`Produk ${sku}`);
      if (b.kind && b.kind !== cur.kind && await this.used(c, u.companyId, cur.id)) throw invalid('PRODUCT_IN_USE', 'Jenis produk yang sudah dipakai dokumen tidak dapat diubah.');
      const r = (await c.query(
        `UPDATE products SET name = coalesce($3, name), kind = coalesce($4, kind), unit = coalesce($5, unit), price = coalesce($6, price), status = coalesce($7, status), updated_at = now()
          WHERE company_id = $1 AND sku = $2 RETURNING *`, [u.companyId, sku, b.name ?? null, b.kind ?? null, b.unit ?? null, b.price ?? null, b.status ?? null])).rows[0];
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'product.updated', entityType: 'product', entityId: sku, before: mapProduct(cur), after: { ...mapProduct(r), reason: b.reason }, requestId });
      return mapProduct(r);
    });
  }

  private async used(c: PoolClient, companyId: string, productId: string) {
    const r = await c.query(
      `SELECT EXISTS (SELECT 1 FROM sales_order_lines WHERE company_id = $1 AND product_id = $2) OR EXISTS (SELECT 1 FROM invoice_lines WHERE company_id = $1 AND product_id = $2) AS used`,
      [companyId, productId]);
    return Boolean(r.rows[0].used);
  }

  async deleteProduct(u: RequestUser, s: ScopeContext, sku: string, reason: string, requestId: string) {
    return this.db.run({ ...contextOf(u, s, requestId), branches: '*' }, async (c) => {
      const cur = (await c.query('SELECT * FROM products WHERE company_id = $1 AND sku = $2 FOR UPDATE', [u.companyId, sku])).rows[0];
      if (!cur) throw notFound(`Produk ${sku}`);
      if (await this.used(c, u.companyId, cur.id)) throw invalid('PRODUCT_IN_USE', `Produk ${sku} sudah dipakai pesanan/faktur; nonaktifkan saja.`);
      await c.query('DELETE FROM products WHERE company_id = $1 AND id = $2', [u.companyId, cur.id]);
      await this.audit.record(c, { companyId: u.companyId, userId: u.id, sessionId: u.sessionId, action: 'product.deleted', entityType: 'product', entityId: sku, before: mapProduct(cur), after: { reason }, requestId });
      return { sku, deleted: true };
    });
  }
}
