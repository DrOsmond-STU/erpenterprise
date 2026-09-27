"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapPoLine = void 0;
exports.resolvePoLines = resolvePoLines;
exports.insertPoLines = insertPoLines;
const domain_1 = require("@erp/domain");
const ledger_shared_js_1 = require("../ledger/ledger.shared.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
async function resolvePoLines(c, companyId, branch, input) {
    if (!input.length)
        throw (0, sales_shared_js_1.invalid)('PURCHASE_NO_LINES', 'Dokumen memerlukan minimal satu baris.');
    const ids = [...new Set(input.map((l) => l.productId).filter(Boolean))];
    const products = new Map();
    if (ids.length)
        for (const p of (await c.query('SELECT * FROM products WHERE company_id = $1 AND id = ANY($2::uuid[])', [companyId, ids])).rows)
            products.set(p.id, p);
    const codes = [...new Set(input.map((l) => l.expenseAccount).filter(Boolean))];
    const accounts = new Map();
    if (codes.length)
        for (const a of (await c.query('SELECT * FROM chart_of_accounts WHERE company_id = $1 AND code = ANY($2::text[])', [companyId, codes])).rows)
            accounts.set(a.code, (0, ledger_shared_js_1.mapAccount)(a));
    const errs = [];
    const lines = [];
    for (const [i, l] of input.entries()) {
        const p = l.productId ? products.get(l.productId) : null;
        if (l.productId && !p)
            errs.push(`Baris ${i + 1}: produk tidak dikenal.`);
        if (p && p.status !== 'aktif')
            errs.push(`Baris ${i + 1}: produk ${p.sku} nonaktif.`);
        const kind = p ? p.kind : l.kind ?? 'jasa';
        if (kind === 'barang' && !p)
            errs.push(`Baris ${i + 1}: baris barang harus memilih produk agar stok tercatat.`);
        let expense = null;
        if (kind === 'jasa') {
            expense = l.expenseAccount ?? null;
            const why = expense ? (0, domain_1.expenseAccountProblem)(accounts.get(expense)) : 'pilih akun biaya (detail).';
            if (why)
                errs.push(`Baris ${i + 1}: ${why}`);
        }
        /* Harga bawaan barang: harga pokok rata-rata cabang (bila ada), selain itu harga jual produk. */
        let price = l.price;
        if (price === undefined && p) {
            const st = (await c.query('SELECT max(avg_cost) AS c FROM stock_items WHERE company_id = $1 AND branch_code = $2 AND sku = $3', [companyId, branch, p.sku])).rows[0];
            price = Number(st?.c) || p.price;
        }
        const description = (l.description?.trim() || p?.name || '').slice(0, 200);
        if (!description)
            errs.push(`Baris ${i + 1}: uraian wajib diisi.`);
        const line = { productId: p?.id ?? null, sku: p?.sku ?? null, description, kind, unit: (p?.unit ?? l.unit ?? 'paket').slice(0, 20), qty: l.qty, price: price ?? 0, discPct: l.discPct ?? 0, net: 0, expenseAccount: expense };
        errs.push(...(0, domain_1.lineProblems)(line, i));
        lines.push(line);
    }
    if (errs.length)
        throw (0, sales_shared_js_1.invalid)('PURCHASE_INVALID_LINES', errs[0], errs);
    const t = (0, domain_1.salesTotals)(lines);
    lines.forEach((l, i) => { l.net = t.lines[i]; });
    return { lines, totals: t };
}
async function insertPoLines(c, orderId, companyId, branch, lines) {
    await c.query('DELETE FROM purchase_order_lines WHERE order_id = $1', [orderId]);
    let n = 0;
    for (const l of lines) {
        n += 1;
        await c.query(`INSERT INTO purchase_order_lines (order_id, company_id, branch_code, line_no, product_id, sku, description, kind, expense_account_code, qty, unit, price, disc_pct, net)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [orderId, companyId, branch, n, l.productId, l.sku, l.description, l.kind, l.expenseAccount, l.qty, l.unit, l.price, l.discPct, l.net]);
    }
}
const mapPoLine = (l) => ({
    id: Number(l.id), lineNo: l.line_no, productId: l.product_id, sku: l.sku, description: l.description, kind: l.kind, expenseAccount: l.expense_account_code,
    qty: Number(l.qty), unit: l.unit, price: l.price, discPct: Number(l.disc_pct), net: l.net, qtyReceived: Number(l.qty_received), qtyInvoiced: Number(l.qty_invoiced),
});
exports.mapPoLine = mapPoLine;
//# sourceMappingURL=lines.js.map