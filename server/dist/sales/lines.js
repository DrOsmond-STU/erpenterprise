"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapLine = void 0;
exports.resolveLines = resolveLines;
exports.insertLines = insertLines;
const domain_1 = require("@erp/domain");
const sales_shared_js_1 = require("./sales.shared.js");
async function resolveLines(c, companyId, input) {
    if (!input.length)
        throw (0, sales_shared_js_1.invalid)('SALES_NO_LINES', 'Dokumen memerlukan minimal satu baris.');
    const ids = [...new Set(input.map((l) => l.productId).filter(Boolean))];
    const products = new Map();
    if (ids.length)
        for (const p of (await c.query('SELECT * FROM products WHERE company_id = $1 AND id = ANY($2::uuid[])', [companyId, ids])).rows)
            products.set(p.id, p);
    const errs = [];
    const lines = input.map((l, i) => {
        const p = l.productId ? products.get(l.productId) : null;
        if (l.productId && !p)
            errs.push(`Baris ${i + 1}: produk tidak dikenal.`);
        if (p && p.status !== 'aktif')
            errs.push(`Baris ${i + 1}: produk ${p.sku} nonaktif.`);
        const kind = p ? p.kind : l.kind ?? 'jasa';
        if (!p && kind === 'barang')
            errs.push(`Baris ${i + 1}: baris barang harus memilih produk agar stok & HPP tercatat.`);
        const description = (l.description?.trim() || p?.name || '').slice(0, 200);
        if (!description)
            errs.push(`Baris ${i + 1}: uraian wajib diisi.`);
        const price = l.price ?? p?.price ?? 0;
        const line = { productId: p?.id ?? null, sku: p?.sku ?? null, description, kind, unit: (p?.unit ?? l.unit ?? 'paket').slice(0, 20), qty: l.qty, price, discPct: l.discPct ?? 0, net: 0 };
        errs.push(...(0, domain_1.lineProblems)(line, i));
        return line;
    });
    if (errs.length)
        throw (0, sales_shared_js_1.invalid)('SALES_INVALID_LINES', errs[0], errs);
    const t = (0, domain_1.salesTotals)(lines);
    lines.forEach((l, i) => { l.net = t.lines[i]; });
    return { lines, totals: t };
}
async function insertLines(c, table, fk, docId, companyId, branch, lines) {
    await c.query(`DELETE FROM ${table} WHERE ${fk} = $1`, [docId]);
    let n = 0;
    for (const l of lines) {
        n += 1;
        await c.query(`INSERT INTO ${table} (${fk}, company_id, branch_code, line_no, product_id, sku, description, kind, qty, unit, price, disc_pct, net) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [docId, companyId, branch, n, l.productId, l.sku, l.description, l.kind, l.qty, l.unit, l.price, l.discPct, l.net]);
    }
}
const mapLine = (l) => ({
    lineNo: l.line_no, productId: l.product_id, sku: l.sku, description: l.description, kind: l.kind, qty: Number(l.qty), unit: l.unit,
    price: l.price, discPct: Number(l.disc_pct), net: l.net, cost: l.cost_amount ?? undefined,
});
exports.mapLine = mapLine;
//# sourceMappingURL=lines.js.map