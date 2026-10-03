/**
 * Mutasi stok bernilai: keluar dengan harga pokok rata-rata, masuk dengan rata-rata
 * bergerak. Setiap fungsi mencatat stock_moves; jurnal disusun pemanggil dari nilai
 * yang dikembalikan sehingga kartu stok selalu sama dengan buku besar.
 */
import type { PoolClient } from 'pg';
import { issueValue, receiveInto, type AccountLinks } from '@erp/domain';
import type { RequestUser } from '../common/context.js';
import { invalid } from '../sales/sales.shared.js';

export const inventoryAccount = (category: string, links: AccountLinks) => (category === 'Barang jadi' ? links.invFinished : links.invRaw);

export async function lockItem(c: PoolClient, companyId: string, branch: string, warehouse: string, sku: string) {
  return (await c.query('SELECT * FROM stock_items WHERE company_id = $1 AND branch_code = $2 AND warehouse_code = $3 AND sku = $4 FOR UPDATE', [companyId, branch, warehouse, sku])).rows[0] ?? null;
}

export interface MoveRef { date: string; refType: string; refId: string; refNo: string }

/** Keluarkan stok; gagal bila stok gudang tidak cukup. */
export async function issueStock(c: PoolClient, u: RequestUser, links: AccountLinks, x: { branch: string; warehouse: string; sku: string; qty: number } & MoveRef) {
  const item = await lockItem(c, u.companyId, x.branch, x.warehouse, x.sku);
  if (!item) throw invalid('STOCK_ITEM_UNKNOWN', `SKU ${x.sku} tidak ada di gudang ${x.warehouse}.`);
  if (Number(item.on_hand) + 1e-9 < x.qty) throw invalid('STOCK_INSUFFICIENT', `Stok ${x.sku} di gudang ${x.warehouse} hanya ${Number(item.on_hand).toLocaleString('id-ID')} ${item.uom}, dibutuhkan ${x.qty.toLocaleString('id-ID')}.`);
  const avg = Number(item.avg_cost);
  const value = issueValue(x.qty, avg);
  await c.query('UPDATE stock_items SET on_hand = on_hand - $2 WHERE id = $1', [item.id, x.qty]);
  await c.query(`INSERT INTO stock_moves (company_id, branch_code, warehouse_code, sku, move_date, qty, unit_cost, ref_type, ref_id, ref_no, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [u.companyId, x.branch, x.warehouse, x.sku, x.date, -x.qty, avg, x.refType, x.refId, x.refNo, u.id]);
  return { item, value, unitCost: avg, account: inventoryAccount(item.category, links) };
}

/** Masukkan stok bernilai `value`; membuat kartu stok baru bila belum ada di gudang tujuan. */
export async function receiveStock(c: PoolClient, u: RequestUser, links: AccountLinks, x: { branch: string; warehouse: string; sku: string; qty: number; value: number; template?: { name: string; category: string; uom: string } } & MoveRef) {
  let item = await lockItem(c, u.companyId, x.branch, x.warehouse, x.sku);
  if (!item) {
    const t = x.template ?? (await c.query('SELECT name, category, uom FROM stock_items WHERE company_id = $1 AND sku = $2 LIMIT 1', [u.companyId, x.sku])).rows[0];
    if (!t) throw invalid('STOCK_ITEM_UNKNOWN', `SKU ${x.sku} belum dikenal.`);
    item = (await c.query(`INSERT INTO stock_items (company_id, branch_code, warehouse_code, sku, name, category, uom, on_hand, avg_cost) VALUES ($1,$2,$3,$4,$5,$6,$7,0,0) RETURNING *`,
      [u.companyId, x.branch, x.warehouse, x.sku, t.name, t.category, t.uom])).rows[0];
  }
  const r = receiveInto(Number(item.on_hand), Number(item.avg_cost), x.qty, x.value);
  await c.query('UPDATE stock_items SET on_hand = on_hand + $2, avg_cost = $3 WHERE id = $1', [item.id, x.qty, r.newAvg]);
  await c.query(`INSERT INTO stock_moves (company_id, branch_code, warehouse_code, sku, move_date, qty, unit_cost, ref_type, ref_id, ref_no, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [u.companyId, x.branch, x.warehouse, x.sku, x.date, x.qty, Math.round(x.value / x.qty), x.refType, x.refId, x.refNo, u.id]);
  return { item, ...r, account: inventoryAccount(item.category, links) };
}

/** Menjumlahkan nilai per akun (untuk satu baris jurnal per akun persediaan). */
export function addTo(map: Map<string, number>, account: string, value: number) { map.set(account, (map.get(account) ?? 0) + value); }

export async function warehouseOf(c: PoolClient, companyId: string, code: string) {
  const w = (await c.query('SELECT * FROM warehouses WHERE company_id = $1 AND code = $2', [companyId, code])).rows[0];
  if (!w) throw invalid('WAREHOUSE_UNKNOWN', `Gudang ${code} tidak dikenal.`);
  if (w.status !== 'aktif') throw invalid('WAREHOUSE_INACTIVE', `Gudang ${code} nonaktif.`);
  return { ...w, branch_code: String(w.branch_code).trim() };
}
