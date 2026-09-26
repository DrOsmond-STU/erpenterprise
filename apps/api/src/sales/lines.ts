/** Normalisasi baris pesanan/faktur: produk → SKU, nama, jenis, satuan, harga bawaan; hitung neto & total. */
import type { PoolClient } from 'pg';
import { lineProblems, salesTotals, type ItemKind } from '@erp/domain';
import { invalid } from './sales.shared.js';

export interface LineInput { productId?: string | null; description?: string; kind?: ItemKind; unit?: string; qty: number; price?: number; discPct?: number }
export interface Line { productId: string | null; sku: string | null; description: string; kind: ItemKind; unit: string; qty: number; price: number; discPct: number; net: number }

export async function resolveLines(c: PoolClient, companyId: string, input: LineInput[]) {
  if (!input.length) throw invalid('SALES_NO_LINES', 'Dokumen memerlukan minimal satu baris.');
  const ids = [...new Set(input.map((l) => l.productId).filter(Boolean))] as string[];
  const products = new Map<string, any>();
  if (ids.length) for (const p of (await c.query('SELECT * FROM products WHERE company_id = $1 AND id = ANY($2::uuid[])', [companyId, ids])).rows) products.set(p.id, p);
  const errs: string[] = [];
  const lines: Line[] = input.map((l, i) => {
    const p = l.productId ? products.get(l.productId) : null;
    if (l.productId && !p) errs.push(`Baris ${i + 1}: produk tidak dikenal.`);
    if (p && p.status !== 'aktif') errs.push(`Baris ${i + 1}: produk ${p.sku} nonaktif.`);
    const kind: ItemKind = p ? p.kind : l.kind ?? 'jasa';
    if (!p && kind === 'barang') errs.push(`Baris ${i + 1}: baris barang harus memilih produk agar stok & HPP tercatat.`);
    const description = (l.description?.trim() || p?.name || '').slice(0, 200);
    if (!description) errs.push(`Baris ${i + 1}: uraian wajib diisi.`);
    const price = l.price ?? p?.price ?? 0;
    const line = { productId: p?.id ?? null, sku: p?.sku ?? null, description, kind, unit: (p?.unit ?? l.unit ?? 'paket').slice(0, 20), qty: l.qty, price, discPct: l.discPct ?? 0, net: 0 };
    errs.push(...lineProblems(line, i));
    return line;
  });
  if (errs.length) throw invalid('SALES_INVALID_LINES', errs[0], errs);
  const t = salesTotals(lines);
  lines.forEach((l, i) => { l.net = t.lines[i]; });
  return { lines, totals: t };
}

export async function insertLines(c: PoolClient, table: 'sales_order_lines' | 'invoice_lines', fk: 'order_id' | 'invoice_id', docId: string, companyId: string, branch: string, lines: Line[]) {
  await c.query(`DELETE FROM ${table} WHERE ${fk} = $1`, [docId]);
  let n = 0;
  for (const l of lines) {
    n += 1;
    await c.query(
      `INSERT INTO ${table} (${fk}, company_id, branch_code, line_no, product_id, sku, description, kind, qty, unit, price, disc_pct, net) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [docId, companyId, branch, n, l.productId, l.sku, l.description, l.kind, l.qty, l.unit, l.price, l.discPct, l.net]);
  }
}

export const mapLine = (l: any) => ({
  lineNo: l.line_no, productId: l.product_id, sku: l.sku, description: l.description, kind: l.kind, qty: Number(l.qty), unit: l.unit,
  price: l.price, discPct: Number(l.disc_pct), net: l.net, cost: l.cost_amount ?? undefined,
});
