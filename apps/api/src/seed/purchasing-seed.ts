/**
 * Data contoh pembelian dari purwarupa: pemasok (rekening terverifikasi),
 * pesanan pembelian berbaris, penautan tagihan sub-buku lama ke pemasok/PO,
 * dan pembayaran historis. PO yang sudah memiliki tagihan dianggap selesai
 * (barang diterima & ditagih di sistem lama, tanpa jurnal baru); PO lain yang
 * sudah dikirim pemasok menjadi "disetujui" dan siap diterima.
 * Idempoten — dilewati bila perusahaan sudah memiliki pemasok. Harus dijalankan
 * dengan app.company_id & app.branch_codes='*' tersetel.
 */
import type pg from 'pg';
import { LEGACY_ACCOUNT_MAP, splitPPN, termDays, type ItemKind } from '@erp/domain';

/** Barang utama per pemasok (sesuai kategori pemasok & kartu stok cabangnya). */
const SUPPLIER_SKU: Record<string, string> = {
  'CV Logam Jaya Abadi': 'BRG-1042', 'PT Baja Sentral Indo': 'BRG-1042', 'PT Bearing Nusantara': 'BRG-2217', 'PT Pelumas Andalan': 'BRG-0885',
  'PT Kabel Cipta Sarana': 'BRG-3390', 'PT Mesin Presisi Tama': 'BRG-8302', 'PT Kemasan Prima': 'BRG-6110',
};
const SUPPLIER_BANK: Record<string, string> = { 'CV Medan Logistik': 'Bank Sumut', 'PT Sumatera Grafika': 'Bank Sumut', 'PT Telkom Indonesia': 'Mandiri', 'PT Baja Sentral Indo': 'BNI', 'PT Kemasan Prima': 'BRI' };

export async function seedPurchasing(c: pg.Client | pg.PoolClient, company: string, DATA: any): Promise<{ skipped: boolean; suppliers?: number; orders?: number }> {
  const has = await c.query('SELECT 1 FROM suppliers WHERE company_id = $1 LIMIT 1', [company]);
  if (has.rowCount) return { skipped: true };
  const users = Object.fromEntries((await c.query('SELECT id, display_name FROM users WHERE company_id = $1', [company])).rows.map((u: any) => [u.display_name, u.id]));

  /* Pemasok: rekening contoh sudah diverifikasi jauh sebelum hari ini (masa tunggu terlewati). */
  const supIds: Record<string, string> = {};
  let maxCode = 0;
  for (const s of DATA.suppliers) {
    const digits = s.id.replace(/\D/g, '');
    const r = await c.query(
      `INSERT INTO suppliers (company_id, code, name, category, city, branch_code, terms_days, lead_days, status, bank_name, bank_account_last4, bank_holder, bank_verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'2026-01-05T09:00:00+07:00') RETURNING id`,
      [company, s.id, s.name, s.category, s.city, s.branch, termDays(s.terms), s.lead, s.status, SUPPLIER_BANK[s.name] ?? 'BCA', `${digits}${digits}`.slice(-4).padStart(4, '0'), s.name]);
    supIds[s.name] = r.rows[0].id;
    maxCode = Math.max(maxCode, Number(digits));
  }
  await c.query(`INSERT INTO document_sequences (company_id, doc_type, year, last_no) VALUES ($1, 'SUP', 0, $2) ON CONFLICT (company_id, doc_type, year) DO UPDATE SET last_no = GREATEST(document_sequences.last_no, $2)`, [company, maxCode]);

  /* Tagihan lama → pemasok, rincian neto/PPN. */
  const invs = (await c.query('SELECT * FROM ap_invoices WHERE company_id = $1', [company])).rows;
  for (const i of invs) {
    const { net, ppn } = splitPPN(i.total_gross);
    await c.query(`UPDATE ap_invoices SET supplier_id = $2, subtotal = CASE WHEN subtotal = 0 THEN $3 ELSE subtotal END, net_amount = CASE WHEN net_amount = 0 THEN $3 ELSE net_amount END,
                     ppn_amount = CASE WHEN ppn_amount = 0 THEN $4 ELSE ppn_amount END, created_by_name = 'Data awal', posted_by_name = coalesce(posted_by_name, 'Data awal') WHERE id = $1`,
      [i.id, supIds[i.supplier_name] ?? null, net, ppn]);
  }

  /* Produk & kartu stok untuk harga bawaan baris PO. */
  const products = Object.fromEntries((await c.query('SELECT id, sku, name, unit FROM products WHERE company_id = $1', [company])).rows.map((p: any) => [p.sku, p]));
  const cost = Object.fromEntries((DATA.stockItems as any[]).map((s) => [s.sku, s.cost]));
  const invByPo = new Map<string, any>(invs.filter((i: any) => i.po_ref).map((i: any) => [i.po_ref, i]));
  let maxPo = 0; let orders = 0;
  for (const po of DATA.purchaseOrders) {
    const supId = supIds[po.supplier];
    if (!supId) continue;
    const inv = invByPo.get(po.id);
    const status = inv ? 'selesai' : po.status === 'dikirim-pemasok' || po.status === 'diterima-sebagian' ? 'disetujui' : po.status;
    const net = splitPPN(po.amount).net;
    const sku = SUPPLIER_SKU[po.supplier];
    let line: { productId: string | null; sku: string | null; description: string; kind: ItemKind; qty: number; unit: string; price: number; expense: string | null };
    if (sku && products[sku]) {
      const qty = Math.max(1, Math.round(net / (cost[sku] ?? net)));
      line = { productId: products[sku].id, sku, description: products[sku].name, kind: 'barang', qty, unit: products[sku].unit, price: Math.round(net / qty), expense: null };
    } else {
      const acct = inv?.expense_account_code ?? LEGACY_ACCOUNT_MAP['5-2400'];
      line = { productId: null, sku: null, description: `Jasa ${String(DATA.suppliers.find((s: any) => s.name === po.supplier)?.category ?? 'pemasok').toLowerCase()}`, kind: 'jasa', qty: 1, unit: 'paket', price: net, expense: acct };
    }
    /* Nilai PO = nilai purwarupa persis (neto baris tidak dibulatkan ulang dari qty × harga). */
    const split = splitPPN(po.amount);
    const t = { subtotal: split.net, discount: 0, net: split.net, ppn: split.ppn, total: po.amount, lines: [split.net] };
    const decided = !['draf', 'menunggu'].includes(status);
    const approver = t.total > 150_000_000 ? 'Osmond Pratama' : 'Sistem (di bawah ambang)';
    const r = await c.query(
      `INSERT INTO purchase_orders (company_id, branch_code, doc_no, supplier_id, order_date, expected_date, status, subtotal, discount, net_amount, ppn_amount, total,
         approval_reasons, created_by, created_by_name, submitted_at, decided_by, decided_by_name, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [company, po.branch, po.id, supId, po.date, po.eta, status, t.subtotal, t.discount, t.net, t.ppn, t.total,
        JSON.stringify(status === 'menunggu' ? ['Nilai PO di atas batas persetujuan (data awal).'] : []),
        users[po.buyer] ?? null, po.buyer, status === 'draf' ? null : `${po.date}T09:00:00+07:00`,
        decided && approver !== 'Sistem (di bawah ambang)' ? users[approver] ?? null : null, decided ? approver : null, decided ? `${po.date}T11:00:00+07:00` : null]);
    const done = status === 'selesai' ? line.qty : 0;
    const l = await c.query(
      `INSERT INTO purchase_order_lines (order_id, company_id, branch_code, line_no, product_id, sku, description, kind, expense_account_code, qty, unit, price, disc_pct, net, qty_received, qty_invoiced)
       VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13,$14) RETURNING id`,
      [r.rows[0].id, company, po.branch, line.productId, line.sku, line.description, line.kind, line.expense, line.qty, line.unit, line.price, t.lines[0], line.kind === 'barang' ? done : 0, done]);
    if (inv) {
      await c.query('UPDATE ap_invoices SET purchase_order_id = $2 WHERE id = $1', [inv.id, r.rows[0].id]);
      inv._orderLine = { id: l.rows[0].id, line };
    }
    maxPo = Math.max(maxPo, Number(po.id.slice(-4)));
    orders += 1;
  }

  /* Satu baris ringkas per tagihan lama (rincian di sistem lama). */
  for (const i of invs) {
    const exists = await c.query('SELECT 1 FROM ap_invoice_lines WHERE invoice_id = $1 LIMIT 1', [i.id]);
    if (exists.rowCount) continue;
    const { net } = splitPPN(i.total_gross);
    const goods = i.kind !== 'service';
    const ol = i._orderLine;
    await c.query(
      `INSERT INTO ap_invoice_lines (invoice_id, company_id, branch_code, line_no, order_line_id, sku, description, kind, account_code, qty, unit, price, net) VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,1,'paket',$9,$9)`,
      [i.id, company, i.branch_code, ol?.id ?? null, ol?.line.sku ?? null, goods ? 'Pembelian barang (data awal, rincian di sistem lama)' : 'Jasa/biaya (data awal)', goods ? 'barang' : 'jasa',
        goods ? '1-1501' : i.expense_account_code ?? LEGACY_ACCOUNT_MAP['5-3100'], net]);
  }
  await c.query('SELECT backfill_legacy_supplier_payments()');
  await c.query('UPDATE supplier_payments p SET supplier_id = i.supplier_id FROM ap_invoices i WHERE p.invoice_id = i.id AND p.company_id = $1 AND p.supplier_id IS NULL', [company]);

  const maxApv = Math.max(0, ...invs.map((i: any) => Number(String(i.doc_no).slice(-4)) || 0));
  for (const [type, last] of [['PO', maxPo], ['APV', maxApv], ['GR', 512]] as const) {
    await c.query(`INSERT INTO document_sequences (company_id, doc_type, year, last_no) VALUES ($1, $2, 2026, $3) ON CONFLICT (company_id, doc_type, year) DO UPDATE SET last_no = GREATEST(document_sequences.last_no, $3)`, [company, type, last]);
  }
  return { skipped: false, suppliers: DATA.suppliers.length, orders };
}
