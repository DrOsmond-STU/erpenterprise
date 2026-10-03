/** Bill of materials: resep bahan per barang hasil produksi (berlaku seluruh perusahaan). */
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { acrossBranches, invalid, UUID } from '../sales/sales.shared.js';

export interface BomInput { code: string; sku: string; name?: string; batchQty: number; notes?: string; lines: { sku: string; qty: number }[] }
export interface BomPatch { name?: string; batchQty?: number; notes?: string; status?: 'aktif' | 'nonaktif'; lines?: { sku: string; qty: number }[] }

/** Nama, satuan, dan HPP rata-rata perusahaan per SKU (lintas gudang). */
export async function skuInfo(c: PoolClient, companyId: string, skus: string[]) {
  const rows = await acrossBranches(c, async () => (await c.query(
    `SELECT s.sku, coalesce(p.name, si.name) AS name, coalesce(p.unit, si.uom) AS uom, p.kind, si.category,
            CASE WHEN si.qty > 0 THEN round(si.val / si.qty) ELSE si.avg END AS avg_cost
       FROM unnest($2::text[]) AS s(sku)
       LEFT JOIN products p ON p.company_id = $1 AND p.sku = s.sku
       LEFT JOIN LATERAL (SELECT max(name) AS name, max(uom) AS uom, max(category) AS category, sum(on_hand) AS qty, sum(on_hand * avg_cost) AS val, max(avg_cost) AS avg
                            FROM stock_items WHERE company_id = $1 AND sku = s.sku) si ON true`, [companyId, skus])).rows);
  return new Map(rows.map((r: any) => [r.sku, { name: r.name as string | null, uom: r.uom as string | null, kind: r.kind as string | null, category: r.category as string | null, avgCost: Number(r.avg_cost ?? 0) }]));
}

@Injectable()
export class BomsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  private async load(c: PoolClient, companyId: string, id: string) {
    if (!UUID.test(id)) throw notFound('BOM');
    const b = (await c.query('SELECT * FROM boms WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
    if (!b) throw notFound('BOM');
    const lines = (await c.query('SELECT * FROM bom_lines WHERE bom_id = $1 ORDER BY line_no', [id])).rows;
    const info = await skuInfo(c, companyId, [b.sku, ...lines.map((l: any) => l.sku)]);
    const ls = lines.map((l: any) => {
      const i = info.get(l.sku);
      return { lineNo: l.line_no, sku: l.sku, name: i?.name ?? l.sku, uom: i?.uom ?? '', qty: Number(l.qty), unitCost: i?.avgCost ?? 0, cost: Math.round(Number(l.qty) * (i?.avgCost ?? 0)) };
    });
    const batchCost = ls.reduce((t, l) => t + l.cost, 0);
    const out = info.get(b.sku);
    const used = Number((await c.query('SELECT count(*) FROM work_orders WHERE company_id = $1 AND bom_id = $2', [companyId, id])).rows[0].count);
    return {
      id: b.id, code: b.code, sku: b.sku, productName: out?.name ?? b.sku, uom: out?.uom ?? '', name: b.name, batchQty: Number(b.batch_qty), status: b.status, notes: b.notes,
      lines: ls, batchCost, unitCost: Math.round(batchCost / Number(b.batch_qty)), workOrders: used, createdByName: b.created_by_name, createdAt: b.created_at,
    };
  }

  async list(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const ids = (await c.query('SELECT id FROM boms WHERE company_id = $1 ORDER BY status, code', [u.companyId])).rows;
      const out = [];
      for (const r of ids) out.push(await this.load(c, u.companyId, r.id));
      return out;
    });
  }

  async get(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), (c) => this.load(c, u.companyId, id));
  }

  private async validate(c: PoolClient, companyId: string, sku: string, lines: { sku: string; qty: number }[]) {
    const seen = new Set<string>();
    for (const l of lines) {
      if (l.sku === sku) throw invalid('BOM_SELF', 'Barang hasil tidak boleh menjadi bahannya sendiri.');
      if (seen.has(l.sku)) throw invalid('BOM_DUP_SKU', `Bahan ${l.sku} tercantum lebih dari sekali.`);
      seen.add(l.sku);
    }
    const info = await skuInfo(c, companyId, [sku, ...lines.map((l) => l.sku)]);
    const out = info.get(sku);
    if (!out?.name || out.kind === 'jasa') throw invalid('BOM_PRODUCT', `Barang hasil ${sku} tidak dikenal atau berupa jasa.`);
    for (const l of lines) {
      const i = info.get(l.sku);
      if (!i?.name || i.kind === 'jasa') throw invalid('BOM_COMPONENT', `Bahan ${l.sku} tidak dikenal atau berupa jasa.`);
    }
    return out;
  }

  private async writeLines(c: PoolClient, companyId: string, bomId: string, lines: { sku: string; qty: number }[]) {
    await c.query('DELETE FROM bom_lines WHERE bom_id = $1', [bomId]);
    let n = 0;
    for (const l of lines) { n += 1; await c.query('INSERT INTO bom_lines (bom_id, company_id, line_no, sku, qty) VALUES ($1,$2,$3,$4,$5)', [bomId, companyId, n, l.sku, l.qty]); }
  }

  async create(u: RequestUser, s: ScopeContext, b: BomInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      if ((await c.query('SELECT 1 FROM boms WHERE company_id = $1 AND lower(code) = lower($2)', [u.companyId, b.code])).rowCount) throw conflict('BOM_EXISTS', `Kode BOM ${b.code} sudah dipakai.`);
      const out = await this.validate(c, u.companyId, b.sku, b.lines);
      const r = (await c.query(`INSERT INTO boms (company_id, code, sku, name, batch_qty, notes, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [u.companyId, b.code, b.sku, b.name || `BOM ${out.name}`, b.batchQty, b.notes ?? null, u.id, u.name])).rows[0];
      await this.writeLines(c, u.companyId, r.id, b.lines);
      await this.audit.record(c, { companyId: u.companyId, branchCode: null, userId: u.id, sessionId: u.sessionId, action: 'bom.created', entityType: 'bom', entityId: b.code, after: { sku: b.sku, batchQty: b.batchQty, lines: b.lines }, requestId });
      return this.load(c, u.companyId, r.id);
    });
  }

  async update(u: RequestUser, s: ScopeContext, id: string, b: BomPatch, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const before = await this.load(c, u.companyId, id);
      if (b.lines) {
        await this.validate(c, u.companyId, before.sku, b.lines);
        await this.writeLines(c, u.companyId, id, b.lines);
      }
      await c.query(`UPDATE boms SET name = coalesce($3, name), batch_qty = coalesce($4, batch_qty), notes = coalesce($5, notes), status = coalesce($6, status), updated_at = now() WHERE company_id = $1 AND id = $2`,
        [u.companyId, id, b.name ?? null, b.batchQty ?? null, b.notes ?? null, b.status ?? null]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: null, userId: u.id, sessionId: u.sessionId, action: 'bom.updated', entityType: 'bom', entityId: before.code,
        before: { batchQty: before.batchQty, status: before.status, lines: before.lines.map((l) => ({ sku: l.sku, qty: l.qty })) }, after: b, requestId });
      return this.load(c, u.companyId, id);
    });
  }
}
