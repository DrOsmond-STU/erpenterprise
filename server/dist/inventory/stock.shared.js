"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryAccount = void 0;
exports.lockItem = lockItem;
exports.issueStock = issueStock;
exports.receiveStock = receiveStock;
exports.addTo = addTo;
exports.warehouseOf = warehouseOf;
const domain_1 = require("@erp/domain");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const inventoryAccount = (category, links) => (category === 'Barang jadi' ? links.invFinished : links.invRaw);
exports.inventoryAccount = inventoryAccount;
async function lockItem(c, companyId, branch, warehouse, sku) {
    return (await c.query('SELECT * FROM stock_items WHERE company_id = $1 AND branch_code = $2 AND warehouse_code = $3 AND sku = $4 FOR UPDATE', [companyId, branch, warehouse, sku])).rows[0] ?? null;
}
/** Keluarkan stok; gagal bila stok gudang tidak cukup. */
async function issueStock(c, u, links, x) {
    const item = await lockItem(c, u.companyId, x.branch, x.warehouse, x.sku);
    if (!item)
        throw (0, sales_shared_js_1.invalid)('STOCK_ITEM_UNKNOWN', `SKU ${x.sku} tidak ada di gudang ${x.warehouse}.`);
    if (Number(item.on_hand) + 1e-9 < x.qty)
        throw (0, sales_shared_js_1.invalid)('STOCK_INSUFFICIENT', `Stok ${x.sku} di gudang ${x.warehouse} hanya ${Number(item.on_hand).toLocaleString('id-ID')} ${item.uom}, dibutuhkan ${x.qty.toLocaleString('id-ID')}.`);
    const avg = Number(item.avg_cost);
    const value = (0, domain_1.issueValue)(x.qty, avg);
    await c.query('UPDATE stock_items SET on_hand = on_hand - $2 WHERE id = $1', [item.id, x.qty]);
    await c.query(`INSERT INTO stock_moves (company_id, branch_code, warehouse_code, sku, move_date, qty, unit_cost, ref_type, ref_id, ref_no, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [u.companyId, x.branch, x.warehouse, x.sku, x.date, -x.qty, avg, x.refType, x.refId, x.refNo, u.id]);
    return { item, value, unitCost: avg, account: (0, exports.inventoryAccount)(item.category, links) };
}
/** Masukkan stok bernilai `value`; membuat kartu stok baru bila belum ada di gudang tujuan. */
async function receiveStock(c, u, links, x) {
    let item = await lockItem(c, u.companyId, x.branch, x.warehouse, x.sku);
    if (!item) {
        const t = x.template ?? (await c.query('SELECT name, category, uom FROM stock_items WHERE company_id = $1 AND sku = $2 LIMIT 1', [u.companyId, x.sku])).rows[0];
        if (!t)
            throw (0, sales_shared_js_1.invalid)('STOCK_ITEM_UNKNOWN', `SKU ${x.sku} belum dikenal.`);
        item = (await c.query(`INSERT INTO stock_items (company_id, branch_code, warehouse_code, sku, name, category, uom, on_hand, avg_cost) VALUES ($1,$2,$3,$4,$5,$6,$7,0,0) RETURNING *`, [u.companyId, x.branch, x.warehouse, x.sku, t.name, t.category, t.uom])).rows[0];
    }
    const r = (0, domain_1.receiveInto)(Number(item.on_hand), Number(item.avg_cost), x.qty, x.value);
    await c.query('UPDATE stock_items SET on_hand = on_hand + $2, avg_cost = $3 WHERE id = $1', [item.id, x.qty, r.newAvg]);
    await c.query(`INSERT INTO stock_moves (company_id, branch_code, warehouse_code, sku, move_date, qty, unit_cost, ref_type, ref_id, ref_no, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [u.companyId, x.branch, x.warehouse, x.sku, x.date, x.qty, Math.round(x.value / x.qty), x.refType, x.refId, x.refNo, u.id]);
    return { item, ...r, account: (0, exports.inventoryAccount)(item.category, links) };
}
/** Menjumlahkan nilai per akun (untuk satu baris jurnal per akun persediaan). */
function addTo(map, account, value) { map.set(account, (map.get(account) ?? 0) + value); }
async function warehouseOf(c, companyId, code) {
    const w = (await c.query('SELECT * FROM warehouses WHERE company_id = $1 AND code = $2', [companyId, code])).rows[0];
    if (!w)
        throw (0, sales_shared_js_1.invalid)('WAREHOUSE_UNKNOWN', `Gudang ${code} tidak dikenal.`);
    if (w.status !== 'aktif')
        throw (0, sales_shared_js_1.invalid)('WAREHOUSE_INACTIVE', `Gudang ${code} nonaktif.`);
    return { ...w, branch_code: String(w.branch_code).trim() };
}
//# sourceMappingURL=stock.shared.js.map