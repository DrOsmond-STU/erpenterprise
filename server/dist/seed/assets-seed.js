"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedAssets = seedAssets;
async function seedAssets(c, company, DATA) {
    await c.query(`UPDATE assets a SET
      useful_life_months = coalesce(a.useful_life_months, CASE WHEN a.monthly_depreciation > 0 THEN greatest(1, round(a.acquisition_cost::numeric / a.monthly_depreciation))::int END),
      depreciated_through = coalesce(a.depreciated_through, (SELECT max(j.journal_date) FROM journals j WHERE j.company_id = $1 AND j.source_type = 'depreciation' AND j.branch_code = a.branch_code AND j.status IN ('posted','reversed')))
    WHERE a.company_id = $1`, [company]);
    for (const a of DATA.assets)
        await c.query('UPDATE assets SET location = $3 WHERE company_id = $1 AND code = $2 AND location IS NULL', [company, a.id, a.location]);
    if ((await c.query('SELECT 1 FROM maintenance_orders WHERE company_id = $1 LIMIT 1', [company])).rowCount)
        return { skipped: true, orders: 0 };
    let n = 0;
    for (const m of DATA.maintenanceOrders) {
        const asset = (await c.query('SELECT id, branch_code FROM assets WHERE company_id = $1 AND code = $2', [company, m.assetId])).rows[0];
        if (!asset)
            continue;
        const done = m.status === 'selesai';
        await c.query(`INSERT INTO maintenance_orders (company_id, branch_code, doc_no, asset_id, kind, priority, assignee, scheduled_date, description, estimated_cost, status, completed_date, service_cost, parts_cost, legacy)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [company, asset.branch_code, m.id, asset.id, m.type === 'Korektif' ? 'korektif' : 'preventif', m.priority, m.assignee, m.scheduledDate, m.desc, m.cost,
            m.status === 'berjalan' ? 'berjalan' : done ? 'selesai' : 'dijadwalkan', done ? m.scheduledDate : null, done ? m.cost : null, done ? 0 : null, done]);
        n += 1;
    }
    await c.query(`INSERT INTO document_sequences (company_id, doc_type, year, last_no) VALUES ($1, 'MNT', 2026, 212) ON CONFLICT (company_id, doc_type, year) DO UPDATE SET last_no = greatest(document_sequences.last_no, 212)`, [company]);
    return { skipped: false, orders: n };
}
//# sourceMappingURL=assets-seed.js.map