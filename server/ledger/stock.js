/* Persediaan perpetual dengan metode rata-rata tertimbang (moving average).
   Setiap mutasi tercatat append-only di stock_moves dan selalu disertai jurnal,
   sehingga nilai persediaan di buku besar = valuasi stok. */
import * as db from '../db.js';
import { bad, round2, nowIso } from '../lib/util.js';

export const isStockable = (product) => product && product.kind !== 'jasa';

export function warehouse(id) {
  const w = db.get('SELECT * FROM warehouses WHERE id = ?', id);
  if (!w) throw bad('Gudang tidak ditemukan.');
  return w;
}

export function balance(productId, warehouseId) {
  return db.get('SELECT qty, avg_cost FROM stock_balances WHERE product_id = ? AND warehouse_id = ?', productId, warehouseId) || { qty: 0, avg_cost: 0 };
}

function move(ctx, m) {
  db.insert('stock_moves', {
    company_id: m.companyId, branch_id: m.branchId, date: m.date, warehouse_id: m.warehouseId, product_id: m.productId,
    qty: m.qty, unit_cost: round2(m.unitCost), value: round2(m.qty * m.unitCost),
    source_type: m.sourceType, source_id: m.sourceId, source_no: m.sourceNo,
    created_at: nowIso(), created_by: ctx.user?.id ?? null,
  });
}

/** Barang masuk; memperbarui biaya rata-rata. Mengembalikan nilai masuk. */
export function stockIn(ctx, { warehouseId, productId, qty, unitCost, date, sourceType, sourceId, sourceNo }) {
  if (!(qty > 0)) throw bad('Kuantitas masuk harus positif.');
  const w = warehouse(warehouseId);
  const b = balance(productId, warehouseId);
  const newQty = b.qty + qty;
  const newAvg = newQty > 0 ? ((Math.max(b.qty, 0) * b.avg_cost) + qty * unitCost) / (Math.max(b.qty, 0) + qty) : unitCost;
  db.run(`INSERT INTO stock_balances(product_id, warehouse_id, qty, avg_cost) VALUES (?, ?, ?, ?)
          ON CONFLICT(product_id, warehouse_id) DO UPDATE SET qty = excluded.qty, avg_cost = excluded.avg_cost`, productId, warehouseId, newQty, newAvg);
  move(ctx, { companyId: w.company_id, branchId: w.branch_id, date, warehouseId, productId, qty, unitCost, sourceType, sourceId, sourceNo });
  return round2(qty * unitCost);
}

/** Barang keluar pada biaya rata-rata. Mengembalikan { unitCost, value }. */
export function stockOut(ctx, { warehouseId, productId, qty, date, sourceType, sourceId, sourceNo }) {
  if (!(qty > 0)) throw bad('Kuantitas keluar harus positif.');
  const w = warehouse(warehouseId);
  const b = balance(productId, warehouseId);
  if (b.qty + 1e-9 < qty) {
    const p = db.get('SELECT code, name FROM products WHERE id = ?', productId);
    throw bad(`Stok ${p?.code} ${p?.name} di gudang ${w.name} tidak cukup (tersedia ${b.qty}, diminta ${qty}).`);
  }
  db.run('UPDATE stock_balances SET qty = qty - ? WHERE product_id = ? AND warehouse_id = ?', qty, productId, warehouseId);
  move(ctx, { companyId: w.company_id, branchId: w.branch_id, date, warehouseId, productId, qty: -qty, unitCost: b.avg_cost, sourceType, sourceId, sourceNo });
  return { unitCost: b.avg_cost, value: round2(qty * b.avg_cost) };
}
