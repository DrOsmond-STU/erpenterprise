/**
 * Data contoh penjualan dari purwarupa: pelanggan, produk/jasa, pesanan
 * penjualan (dengan baris), serta penautan faktur sub-buku lama ke pelanggan.
 * Idempoten — dilewati bila perusahaan sudah memiliki pelanggan — dan dipakai
 * baik saat seed baru maupun saat meng-upgrade basis data yang sudah berisi.
 * Harus dijalankan dengan app.company_id & app.branch_codes='*' tersetel.
 */
import type pg from 'pg';
import { salesTotals, splitPPN, termDays, type ItemKind } from '@erp/domain';

const SERVICES = [
  { sku: 'JAS-0031', name: 'Jasa pemasangan di lokasi', unit: 'paket', price: 24_500_000 },
  { sku: 'JAS-0010', name: 'Jasa perawatan mesin berkala', unit: 'kunjungan', price: 7_500_000 },
  { sku: 'JAS-0020', name: 'Jasa kalibrasi & pengujian', unit: 'paket', price: 3_250_000 },
];

export async function seedSales(c: pg.Client | pg.PoolClient, company: string, DATA: any): Promise<{ skipped: boolean; customers?: number; orders?: number }> {
  const has = await c.query('SELECT 1 FROM customers WHERE company_id = $1 LIMIT 1', [company]);
  if (has.rowCount) return { skipped: true };

  /* Pelanggan */
  const custIds: Record<string, string> = {};
  let maxCode = 0;
  for (const cu of DATA.customers) {
    const r = await c.query(
      `INSERT INTO customers (company_id, code, name, segment, pic, city, branch_code, credit_limit, terms_days, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [company, cu.id, cu.name, cu.segment, cu.pic, cu.city, cu.branch, cu.limit, termDays(cu.terms), cu.status]);
    custIds[cu.name] = r.rows[0].id;
    maxCode = Math.max(maxCode, Number(cu.id.replace(/\D/g, '')));
  }
  await c.query(`INSERT INTO document_sequences (company_id, doc_type, year, last_no) VALUES ($1, 'CUST', 0, $2) ON CONFLICT (company_id, doc_type, year) DO UPDATE SET last_no = GREATEST(document_sequences.last_no, $2)`, [company, maxCode]);

  /* Produk: barang dari kartu stok (harga jual dari baris pesanan bila ada) + jasa */
  const listPrice: Record<string, number> = {};
  for (const lines of [...Object.values(DATA.salesOrderLines ?? {}), DATA.defaultLines ?? []] as any[][]) for (const l of lines) listPrice[l.sku] = l.price;
  const products: Record<string, { id: string; kind: ItemKind; name: string; unit: string; price: number }> = {};
  for (const s of DATA.stockItems) {
    if (products[s.sku]) continue;
    const price = listPrice[s.sku] ?? Math.round((s.cost * 1.4) / 500) * 500;
    const r = await c.query(`INSERT INTO products (company_id, sku, name, kind, unit, price) VALUES ($1,$2,$3,'barang',$4,$5) RETURNING id`, [company, s.sku, s.name, s.unit, price]);
    products[s.sku] = { id: r.rows[0].id, kind: 'barang', name: s.name, unit: s.unit, price };
  }
  for (const s of SERVICES) {
    const r = await c.query(`INSERT INTO products (company_id, sku, name, kind, unit, price) VALUES ($1,$2,$3,'jasa',$4,$5) RETURNING id`, [company, s.sku, s.name, s.unit, listPrice[s.sku] ?? s.price]);
    products[s.sku] = { id: r.rows[0].id, kind: 'jasa', name: s.name, unit: s.unit, price: listPrice[s.sku] ?? s.price };
  }

  /* Faktur lama → pelanggan, rincian neto/PPN, satu baris ringkas; lalu penerimaan historis. */
  const invs = (await c.query('SELECT id, doc_no, customer_name, total_gross, cogs_amount, branch_code FROM invoices WHERE company_id = $1', [company])).rows;
  for (const i of invs) {
    const { net, ppn } = splitPPN(i.total_gross);
    await c.query(`UPDATE invoices SET customer_id = $2, subtotal = CASE WHEN subtotal = 0 THEN $3 ELSE subtotal END, net_amount = CASE WHEN net_amount = 0 THEN $3 ELSE net_amount END,
                     ppn_amount = CASE WHEN ppn_amount = 0 THEN $4 ELSE ppn_amount END, created_by_name = 'Data awal', issued_by_name = coalesce(issued_by_name, 'Data awal') WHERE id = $1`,
      [i.id, custIds[i.customer_name] ?? null, net, ppn]);
    const lines = await c.query('SELECT 1 FROM invoice_lines WHERE invoice_id = $1 LIMIT 1', [i.id]);
    if (!lines.rowCount) {
      await c.query(`INSERT INTO invoice_lines (invoice_id, company_id, branch_code, line_no, description, kind, qty, unit, price, net, cost_amount) VALUES ($1,$2,$3,1,'Penjualan barang (data awal, rincian di sistem lama)','barang',1,'paket',$4,$4,$5)`,
        [i.id, company, i.branch_code, net, i.cogs_amount ?? 0]);
    }
  }
  await c.query('SELECT backfill_legacy_receipts()');
  await c.query('UPDATE receipts r SET customer_id = i.customer_id FROM invoices i WHERE r.invoice_id = i.id AND r.company_id = $1 AND r.customer_id IS NULL', [company]);

  /* Pesanan penjualan */
  const users = Object.fromEntries((await c.query('SELECT id, display_name FROM users WHERE company_id = $1', [company])).rows.map((u: any) => [u.display_name, u.id]));
  const stock = (await c.query('SELECT sku, branch_code, on_hand FROM stock_items WHERE company_id = $1', [company])).rows;
  const onHand = (sku: string, br: string) => stock.filter((s: any) => s.sku === sku && String(s.branch_code).trim() === br).reduce((t: number, s: any) => t + Number(s.on_hand), 0);
  let maxSo = 0; let orders = 0;
  for (const so of DATA.salesOrders) {
    const custId = custIds[so.customer];
    if (!custId) continue;
    let lines: { sku: string | null; description: string; kind: ItemKind; qty: number; unit: string; price: number; discPct: number }[];
    const src = DATA.salesOrderLines?.[so.id];
    if (src) {
      lines = src.map((l: any) => ({ sku: l.sku, description: l.name, kind: products[l.sku]?.kind ?? (l.sku.startsWith('JAS') ? 'jasa' : 'barang'), qty: l.qty, unit: l.unit, price: l.price, discPct: l.disc ?? 0 }));
    } else {
      /* Purwarupa hanya menyimpan nilai: susun baris barang jadi (bila ada stok di cabang) + jasa sisa nilai. */
      const net = Math.round(so.amount / 1.11);
      const fg = ['BRG-1108', 'BRG-9014'].find((sku) => onHand(sku, so.branch) > 0);
      lines = [];
      let rest = net;
      if (fg) {
        const p = products[fg];
        const qty = Math.max(1, Math.min(Math.floor(onHand(fg, so.branch) / 4), Math.floor((net * 0.7) / p.price)));
        lines.push({ sku: fg, description: p.name, kind: 'barang', qty, unit: p.unit, price: p.price, discPct: 0 });
        rest -= qty * p.price;
      }
      if (rest > 0) lines.push({ sku: 'JAS-0031', description: 'Jasa pemasangan & komisioning', kind: 'jasa', qty: 1, unit: 'paket', price: rest, discPct: 0 });
    }
    const t = salesTotals(lines);
    const decided = ['disetujui', 'dikirim', 'selesai'].includes(so.status);
    const inv = so.status === 'selesai'
      ? (await c.query(`SELECT id FROM invoices WHERE company_id = $1 AND customer_id = $2 AND total_gross = $3 LIMIT 1`, [company, custId, so.amount])).rows[0]?.id ?? null : null;
    const r = await c.query(
      `INSERT INTO sales_orders (company_id, branch_code, doc_no, customer_id, order_date, delivery_date, channel, status, subtotal, discount, net_amount, ppn_amount, total,
         approval_reasons, created_by, created_by_name, submitted_at, decided_by, decided_by_name, decided_at, invoice_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
      [company, so.branch, so.id, custId, so.date, so.due, so.channel, so.status, t.subtotal, t.discount, t.net, t.ppn, t.total,
        JSON.stringify(so.status === 'menunggu' ? ['Nilai pesanan melebihi sisa plafon kredit atau batas persetujuan (data awal).'] : []),
        users[so.pic] ?? null, so.pic, so.status === 'draf' ? null : `${so.date}T09:00:00+07:00`,
        decided ? users['Osmond Pratama'] ?? null : null, decided ? 'Osmond Pratama' : null, decided ? `${so.date}T11:00:00+07:00` : null, inv]);
    let n = 0;
    for (const [i, l] of lines.entries()) {
      n += 1;
      await c.query(
        `INSERT INTO sales_order_lines (order_id, company_id, branch_code, line_no, product_id, sku, description, kind, qty, unit, price, disc_pct, net) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [r.rows[0].id, company, so.branch, n, l.sku ? products[l.sku]?.id ?? null : null, l.sku, l.description, l.kind, l.qty, l.unit, l.price, l.discPct, t.lines[i]]);
    }
    if (inv) await c.query('UPDATE invoices SET sales_order_id = $2 WHERE id = $1 AND sales_order_id IS NULL', [inv, r.rows[0].id]);
    maxSo = Math.max(maxSo, Number(so.id.slice(-4)));
    orders += 1;
  }
  const maxInv = Math.max(0, ...invs.map((i: any) => Number(String(i.doc_no).slice(-4)) || 0));
  for (const [type, last] of [['SO', maxSo], ['INV', maxInv]] as const) {
    await c.query(`INSERT INTO document_sequences (company_id, doc_type, year, last_no) VALUES ($1, $2, 2026, $3) ON CONFLICT (company_id, doc_type, year) DO UPDATE SET last_no = GREATEST(document_sequences.last_no, $3)`, [company, type, last]);
  }
  return { skipped: false, customers: DATA.customers.length, orders };
}
