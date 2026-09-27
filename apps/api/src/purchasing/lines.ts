/** Baris PO: produk (barang berstok) atau jasa/biaya dengan akun detail yang didebit saat ditagih. */
import type { PoolClient } from 'pg';
import { expenseAccountProblem, lineProblems, salesTotals, type ItemKind } from '@erp/domain';
import { mapAccount } from '../ledger/ledger.shared.js';
import { invalid } from '../sales/sales.shared.js';

export interface PoLineInput { productId?: string | null; description?: string; kind?: ItemKind; unit?: string; qty: number; price?: number; discPct?: number; expenseAccount?: string | null }
export interface PoLine { productId: string | null; sku: string | null; description: string; kind: ItemKind; unit: string; qty: number; price: number; discPct: number; net: number; expenseAccount: string | null }

export async function resolvePoLines(c: PoolClient, companyId: string, branch: string, input: PoLineInput[]) {
  if (!input.length) throw invalid('PURCHASE_NO_LINES', 'Dokumen memerlukan minimal satu baris.');
  const ids = [...new Set(input.map((l) => l.productId).filter(Boolean))] as string[];
  const products = new Map<string, any>();
  if (ids.length) for (const p of (await c.query('SELECT * FROM products WHERE company_id = $1 AND id = ANY($2::uuid[])', [companyId, ids])).rows) products.set(p.id, p);
  const codes = [...new Set(input.map((l) => l.expenseAccount).filter(Boolean))] as string[];
  const accounts = new Map<string, any>();
  if (codes.length) for (const a of (await c.query('SELECT * FROM chart_of_accounts WHERE company_id = $1 AND code = ANY($2::text[])', [companyId, codes])).rows) accounts.set(a.code, mapAccount(a));
  const errs: string[] = [];
  const lines: PoLine[] = [];
  for (const [i, l] of input.entries()) {
    const p = l.productId ? products.get(l.productId) : null;
    if (l.productId && !p) errs.push(`Baris ${i + 1}: produk tidak dikenal.`);
    if (p && p.status !== 'aktif') errs.push(`Baris ${i + 1}: produk ${p.sku} nonaktif.`);
    const kind: ItemKind = p ? p.kind : l.kind ?? 'jasa';
    if (kind === 'barang' && !p) errs.push(`Baris ${i + 1}: baris barang harus memilih produk agar stok tercatat.`);
    let expense: string | null = null;
    if (kind === 'jasa') {
      expense = l.expenseAccount ?? null;
      const why = expense ? expenseAccountProblem(accounts.get(expense)) : 'pilih akun biaya (detail).';
      if (why) errs.push(`Baris ${i + 1}: ${why}`);
    }
    /* Harga bawaan barang: harga pokok rata-rata cabang (bila ada), selain itu harga jual produk. */
    let price = l.price;
    if (price === undefined && p) {
      const st = (await c.query('SELECT max(avg_cost) AS c FROM stock_items WHERE company_id = $1 AND branch_code = $2 AND sku = $3', [companyId, branch, p.sku])).rows[0];
      price = Number(st?.c) || p.price;
    }
    const description = (l.description?.trim() || p?.name || '').slice(0, 200);
    if (!description) errs.push(`Baris ${i + 1}: uraian wajib diisi.`);
    const line: PoLine = { productId: p?.id ?? null, sku: p?.sku ?? null, description, kind, unit: (p?.unit ?? l.unit ?? 'paket').slice(0, 20), qty: l.qty, price: price ?? 0, discPct: l.discPct ?? 0, net: 0, expenseAccount: expense };
    errs.push(...lineProblems(line, i));
    lines.push(line);
  }
  if (errs.length) throw invalid('PURCHASE_INVALID_LINES', errs[0], errs);
  const t = salesTotals(lines);
  lines.forEach((l, i) => { l.net = t.lines[i]; });
  return { lines, totals: t };
}

export async function insertPoLines(c: PoolClient, orderId: string, companyId: string, branch: string, lines: PoLine[]) {
  await c.query('DELETE FROM purchase_order_lines WHERE order_id = $1', [orderId]);
  let n = 0;
  for (const l of lines) {
    n += 1;
    await c.query(
      `INSERT INTO purchase_order_lines (order_id, company_id, branch_code, line_no, product_id, sku, description, kind, expense_account_code, qty, unit, price, disc_pct, net)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [orderId, companyId, branch, n, l.productId, l.sku, l.description, l.kind, l.expenseAccount, l.qty, l.unit, l.price, l.discPct, l.net]);
  }
}

export const mapPoLine = (l: any) => ({
  id: Number(l.id), lineNo: l.line_no, productId: l.product_id, sku: l.sku, description: l.description, kind: l.kind, expenseAccount: l.expense_account_code,
  qty: Number(l.qty), unit: l.unit, price: l.price, discPct: Number(l.disc_pct), net: l.net, qtyReceived: Number(l.qty_received), qtyInvoiced: Number(l.qty_invoiced),
});
