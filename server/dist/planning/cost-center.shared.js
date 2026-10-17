"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapCcRef = exports.ccColumns = void 0;
exports.assertCostCenter = assertCostCenter;
const sales_shared_js_1 = require("../sales/sales.shared.js");
async function assertCostCenter(c, companyId, id, current) {
    if (!id)
        return null;
    if (current && id === current)
        return id;
    if (!sales_shared_js_1.UUID.test(id))
        throw (0, sales_shared_js_1.invalid)('COST_CENTER_UNKNOWN', 'Pusat biaya tidak dikenal.');
    const r = (await c.query('SELECT code, status FROM cost_centers WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
    if (!r)
        throw (0, sales_shared_js_1.invalid)('COST_CENTER_UNKNOWN', 'Pusat biaya tidak dikenal.');
    if (r.status !== 'aktif')
        throw (0, sales_shared_js_1.invalid)('COST_CENTER_INACTIVE', `Pusat biaya ${r.code} nonaktif; tidak dapat menerima transaksi baru.`);
    return id;
}
/** Subkueri kode & nama pusat biaya untuk SELECT dokumen (alias tabel dokumen diberikan). */
const ccColumns = (alias) => `(SELECT cc.code FROM cost_centers cc WHERE cc.id = ${alias}.cost_center_id) AS cost_center_code, (SELECT cc.name FROM cost_centers cc WHERE cc.id = ${alias}.cost_center_id) AS cost_center_name`;
exports.ccColumns = ccColumns;
const mapCcRef = (r) => ({ costCenterId: r.cost_center_id ?? null, costCenterCode: r.cost_center_code ?? null, costCenterName: r.cost_center_name ?? null });
exports.mapCcRef = mapCcRef;
//# sourceMappingURL=cost-center.shared.js.map