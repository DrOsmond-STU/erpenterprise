/** Daftar stok bernilai, gudang, dan kartu stok (mutasi berjalan per SKU & gudang). */
import { Injectable } from '@nestjs/common';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, forbidden, notFound } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from '../ledger/ledger.shared.js';
import { invalid, trimBranch } from '../sales/sales.shared.js';

const REF_LABEL: Record<string, string> = {
  goods_receipt: 'Penerimaan barang', invoice: 'Faktur penjualan', invoice_cancel: 'Batal faktur', adjustment: 'Penyesuaian stok',
  transfer_out: 'Transfer keluar', transfer_in: 'Transfer masuk', production_issue: 'Pemakaian produksi', production_output: 'Hasil produksi', pos: 'Penjualan POS',
};

@Injectable()
export class InventoryService {
  constructor(private readonly db: DbService, private readonly refs: LedgerRefs, private readonly audit: AuditService) {}

  async createWarehouse(u: RequestUser, s: ScopeContext, b: { code: string; name: string; branch: string }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      if (u.branches !== '*' && !u.branches.includes(b.branch)) throw forbidden(`Memerlukan akses ke cabang ${b.branch}.`);
      const br = (await c.query('SELECT status FROM branches WHERE company_id = $1 AND code = $2', [u.companyId, b.branch])).rows[0];
      if (!br) throw invalid('BRANCH_UNKNOWN', `Cabang ${b.branch} tidak dikenal.`);
      if ((await c.query('SELECT 1 FROM warehouses WHERE company_id = $1 AND lower(code) = lower($2)', [u.companyId, b.code])).rowCount) throw conflict('WAREHOUSE_EXISTS', `Kode gudang ${b.code} sudah dipakai.`);
      await c.query('INSERT INTO warehouses (company_id, code, branch_code, name) VALUES ($1,$2,$3,$4)', [u.companyId, b.code, b.branch, b.name]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: b.branch, userId: u.id, sessionId: u.sessionId, action: 'warehouse.created', entityType: 'warehouse', entityId: b.code, after: b, requestId });
      return { code: b.code, name: b.name, branch: b.branch, status: 'aktif', items: 0 };
    });
  }

  async updateWarehouse(u: RequestUser, s: ScopeContext, code: string, b: { name?: string; status?: 'aktif' | 'nonaktif' }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const w = (await c.query('SELECT * FROM warehouses WHERE company_id = $1 AND code = $2 FOR UPDATE', [u.companyId, code])).rows[0];
      if (!w) throw notFound(`Gudang ${code}`);
      const branch = trimBranch(w.branch_code);
      if (u.branches !== '*' && !u.branches.includes(branch)) throw forbidden(`Memerlukan akses ke cabang ${branch}.`);
      if (b.status === 'nonaktif') {
        const busy = (await c.query(`SELECT (SELECT count(*) FROM stock_items WHERE company_id = $1 AND warehouse_code = $2 AND on_hand <> 0)::int AS stock,
            (SELECT count(*) FROM stock_transfers WHERE company_id = $1 AND (from_warehouse = $2 OR to_warehouse = $2) AND status IN ('draf','dikirim'))::int AS open`, [u.companyId, code])).rows[0];
        if (busy.stock || busy.open) throw conflict('WAREHOUSE_IN_USE', `Gudang ${code} masih menyimpan stok atau memiliki transfer terbuka.`);
      }
      await c.query('UPDATE warehouses SET name = coalesce($3, name), status = coalesce($4, status) WHERE company_id = $1 AND code = $2', [u.companyId, code, b.name ?? null, b.status ?? null]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'warehouse.updated', entityType: 'warehouse', entityId: code, before: { name: w.name, status: w.status }, after: b, requestId });
      const r = (await c.query('SELECT * FROM warehouses WHERE company_id = $1 AND code = $2', [u.companyId, code])).rows[0];
      return { code: r.code, name: r.name, branch, status: r.status };
    });
  }

  /** `all`: seluruh gudang perusahaan (pilihan tujuan transfer antar cabang). */
  async warehouses(u: RequestUser, s: ScopeContext, all: boolean, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) =>
      (await c.query(`SELECT w.*, (SELECT count(*)::int FROM stock_items si WHERE si.company_id = w.company_id AND si.warehouse_code = w.code) AS items
          FROM warehouses w WHERE w.company_id = $1 AND ($2::text IS NULL OR w.branch_code = $2) ORDER BY w.branch_code, w.code`, [u.companyId, s.branch === 'ALL' || all ? null : s.branch])).rows
        .map((w: any) => ({ code: w.code, name: w.name, branch: trimBranch(w.branch_code), status: w.status, items: w.items })));
  }

  async stock(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const links = await this.refs.links(c, u.companyId);
      const rows = (await c.query(
        `SELECT si.*, p.id AS product_id, p.price AS list_price,
                (SELECT max(m.move_date) FROM stock_moves m WHERE m.company_id = si.company_id AND m.sku = si.sku AND m.warehouse_code = si.warehouse_code AND m.branch_code = si.branch_code) AS last_move
           FROM stock_items si LEFT JOIN products p ON p.company_id = si.company_id AND p.sku = si.sku
          WHERE si.company_id = $1 AND ($2::text IS NULL OR si.branch_code = $2) ORDER BY si.branch_code, si.warehouse_code, si.sku`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows;
      const items = rows.map((r: any) => {
        const onHand = Number(r.on_hand), min = Number(r.min_qty), max = r.max_qty === null ? null : Number(r.max_qty);
        return {
          id: r.id, sku: r.sku, name: r.name, category: r.category, uom: r.uom, branch: trimBranch(r.branch_code), warehouse: r.warehouse_code, onHand, min, max,
          avgCost: Number(r.avg_cost), value: Math.round(onHand * Number(r.avg_cost)), account: r.category === 'Barang jadi' ? links.invFinished : links.invRaw,
          status: onHand <= 0 ? 'habis' : onHand < min ? 'di-bawah-minimum' : max !== null && onHand > max ? 'di-atas-maksimum' : 'normal', lastMove: r.last_move, productId: r.product_id,
        };
      });
      const byAccount = items.reduce((m: Record<string, number>, i) => { m[i.account] = (m[i.account] ?? 0) + i.value; return m; }, {});
      return { items, total: items.reduce((t, i) => t + i.value, 0), byAccount, accounts: { raw: links.invRaw, finished: links.invFinished } };
    });
  }

  /** Kartu stok: saldo awal periode, mutasi periode dengan saldo berjalan (qty & nilai). */
  async card(u: RequestUser, s: ScopeContext, sku: string, warehouse: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const item = (await c.query('SELECT * FROM stock_items WHERE company_id = $1 AND sku = $2 AND warehouse_code = $3', [u.companyId, sku, warehouse])).rows[0];
      if (!item) throw notFound(`Kartu stok ${sku} di ${warehouse}`);
      const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
      const moves = (await c.query(
        `SELECT m.*, u.display_name AS by_name FROM stock_moves m LEFT JOIN users u ON u.id = m.created_by
          WHERE m.company_id = $1 AND m.sku = $2 AND m.warehouse_code = $3 ORDER BY m.move_date, m.id`, [u.companyId, sku, warehouse])).rows;
      const totalMoved = moves.reduce((t: number, m: any) => t + Number(m.qty), 0);
      const base = Number(item.on_hand) - totalMoved;                 // stok sebelum mutasi tercatat pertama (saldo data awal)
      const before = moves.filter((m: any) => m.move_date < period.from).reduce((t: number, m: any) => t + Number(m.qty), 0);
      let qty = base + before;
      const opening = qty;
      const lines = moves.filter((m: any) => m.move_date >= period.from && m.move_date <= period.to).map((m: any) => {
        qty += Number(m.qty);
        return { id: Number(m.id), date: m.move_date, refType: m.ref_type, refLabel: REF_LABEL[m.ref_type] ?? m.ref_type, refNo: m.ref_no, refId: m.ref_id,
          qtyIn: Number(m.qty) > 0 ? Number(m.qty) : 0, qtyOut: Number(m.qty) < 0 ? -Number(m.qty) : 0, unitCost: Number(m.unit_cost), value: Math.round(Number(m.qty) * Number(m.unit_cost)), balance: qty, byName: m.by_name };
      });
      return {
        period, item: { sku: item.sku, name: item.name, category: item.category, uom: item.uom, branch: trimBranch(item.branch_code), warehouse: item.warehouse_code, onHand: Number(item.on_hand), avgCost: Number(item.avg_cost), value: Math.round(Number(item.on_hand) * Number(item.avg_cost)) },
        opening, closing: qty, lines,
      };
    });
  }
}
