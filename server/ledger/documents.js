/* ==========================================================================
   Aksi alur kerja dokumen & integrasi ke buku besar.
   Setiap transaksi bernilai keuangan menghasilkan jurnal otomatis sehingga
   Neraca dan Laba Rugi selalu mencerminkan seluruh modul operasional.
   Handler dipanggil di dalam transaksi DB oleh crud.runAction().
   ========================================================================== */
import * as db from '../db.js';
import { acct, postJournal, postExistingJournal, validateJournalLines, reverseJournal, reverseDocumentJournals, nextNumber } from './posting.js';
import { stockIn, stockOut, isStockable, warehouse } from './stock.js';
import { approvalPolicy } from '../lib/settings.js';
import { bad, conflict, round2, sum, nowIso, today, monthEnd } from '../lib/util.js';

const setStatus = (table, id, status, extra = {}) => db.update(table, id, { status, ...extra });
const lines = (table, id) => db.all(`SELECT * FROM "${table}" WHERE parent_id = ? ORDER BY line_no, id`, id);
const product = (id) => db.get('SELECT * FROM products WHERE id = ?', id);
const bank = (id) => {
  const b = db.get('SELECT * FROM bank_accounts WHERE id = ?', id);
  if (!b) throw bad('Rekening kas/bank tidak ditemukan.');
  return b;
};
const productAcct = (p, field, fallbackKey) => p?.[field] || acct(fallbackKey);
const needLines = (ls, what = 'dokumen') => { if (!ls.length) throw bad(`Tambahkan minimal satu baris pada ${what}.`); };

/** Buat dokumen baru (header + baris) dari dokumen lain. */
function createDoc(ctx, table, prefix, header, ls, lineTable) {
  const number = nextNumber(prefix, header.company_id, header.date);
  const id = db.insert(table, { ...header, number, created_at: nowIso(), created_by: ctx.user.id, updated_at: nowIso(), updated_by: ctx.user.id });
  ls.forEach((l, i) => db.insert(lineTable, { ...l, parent_id: id, line_no: i + 1 }));
  return { id, number };
}

/* Konversi mata uang dokumen ke IDR (mata uang buku besar). */
const rateOf = (doc) => Number(doc?.exchange_rate) || 1;
const toBase = (v, doc) => round2((Number(v) || 0) * rateOf(doc));
const sameCurrency = (a, b) => (a.currency_id || null) === (b.currency_id || null) || ((!a.currency_id || isBaseCurrency(a.currency_id)) && (!b.currency_id || isBaseCurrency(b.currency_id)));
const isBaseCurrency = (id) => !!db.get('SELECT is_base FROM currencies WHERE id = ?', id)?.is_base;
const fxCopy = (d) => ({ currency_id: d.currency_id ?? null, exchange_rate: d.exchange_rate ?? 1 });

/** Baris selisih kurs: positif = laba (kredit), negatif = rugi (debit). */
function fxLine(diff, branchId, memo) {
  const d = round2(diff);
  if (Math.abs(d) < 0.005) return null;
  return d > 0 ? { account_id: acct('fx_gain'), branch_id: branchId, credit: d, memo } : { account_id: acct('fx_loss'), branch_id: branchId, debit: -d, memo };
}

const tradeCopy = (ls) => ls.map((l) => ({ product_id: l.product_id, description: l.description, qty: l.qty, price: l.price, discount_pct: l.discount_pct, amount: l.amount }));

/* --- Penjualan -------------------------------------------------------------- */
function postSalesInvoice(ctx, inv) {
  const ls = lines('sales_invoice_lines', inv.id);
  needLines(ls, 'faktur');
  const cust = db.get('SELECT * FROM customers WHERE id = ?', inv.customer_id);
  if (cust.status === 'ditahan') throw bad(`Pelanggan ${cust.name} sedang ditahan; faktur tidak dapat diterbitkan.`);
  const ic = !!cust.related_company_id;
  const wh = warehouse(inv.warehouse_id);
  if (wh.company_id !== inv.company_id) throw bad('Gudang harus milik perusahaan yang sama.');
  const jl = [];
  const arLine = { account_id: acct(ic ? 'ic_receivable' : 'ar'), debit: 0, memo: `Piutang ${cust.name}`, partner_type: 'customer', partner_id: cust.id };
  jl.push(arLine);
  for (const l of ls) {
    const p = product(l.product_id);
    jl.push({ account_id: ic ? acct('ic_sales') : productAcct(p, 'revenue_account_id', 'sales'), credit: toBase(l.amount, inv), memo: `${p.code} ${p.name}` });
    if (isStockable(p)) {
      const { value, unitCost } = stockOut(ctx, { warehouseId: inv.warehouse_id, productId: p.id, qty: l.qty, date: inv.date, sourceType: 'sales_invoices', sourceId: inv.id, sourceNo: inv.number });
      db.run('UPDATE sales_invoice_lines SET unit_cost = ? WHERE id = ?', unitCost, l.id);
      if (value > 0) {
        jl.push({ account_id: productAcct(p, 'cogs_account_id', 'cogs'), debit: value, branch_id: wh.branch_id, memo: `HPP ${p.code}` });
        jl.push({ account_id: productAcct(p, 'inventory_account_id', 'inventory'), credit: value, branch_id: wh.branch_id, memo: `Persediaan keluar ${p.code}` });
      }
    }
  }
  if (inv.tax > 0) jl.push({ account_id: acct('vat_out'), credit: toBase(inv.tax, inv), memo: 'PPN keluaran' });
  // Piutang (IDR) = jumlah pendapatan + PPN yang sudah dikonversi — menghindari selisih pembulatan.
  arLine.debit = round2(jl.filter((x) => x.credit && !x.branch_id).reduce((a, x) => a + x.credit, 0));
  postJournal(ctx, { companyId: inv.company_id, branchId: inv.branch_id, date: inv.date, description: `Faktur ${inv.number} — ${cust.name}`, sourceType: 'sales_invoices', sourceId: inv.id, sourceNo: inv.number, lines: jl });
  setStatus('sales_invoices', inv.id, 'terbit');
}

function voidSalesInvoice(ctx, inv) {
  if (inv.paid > 0) throw conflict('Faktur yang sudah menerima pembayaran tidak dapat dibatalkan; batalkan penerimaannya terlebih dahulu.');
  for (const l of lines('sales_invoice_lines', inv.id)) {
    const p = product(l.product_id);
    if (isStockable(p)) stockIn(ctx, { warehouseId: inv.warehouse_id, productId: p.id, qty: l.qty, unitCost: l.unit_cost || 0, date: today(), sourceType: 'sales_invoices', sourceId: inv.id, sourceNo: `${inv.number} (batal)` });
  }
  reverseDocumentJournals(ctx, 'sales_invoices', inv.id, today(), `Pembatalan faktur ${inv.number}`);
  setStatus('sales_invoices', inv.id, 'batal');
}

function settle(table, id, delta) {
  const d = db.get(`SELECT total, paid FROM "${table}" WHERE id = ?`, id);
  const paid = round2((d.paid || 0) + delta);
  if (paid - d.total > 0.005) throw bad('Pembayaran melebihi sisa tagihan.');
  if (paid < -0.005) throw bad('Saldo pembayaran negatif.');
  const status = paid <= 0.005 ? 'terbit' : paid >= d.total - 0.005 ? 'lunas' : 'sebagian';
  db.update(table, id, { paid, status });
}

function postReceipt(ctx, r) {
  const ls = lines('customer_receipt_lines', r.id);
  needLines(ls, 'penerimaan');
  const b = bank(r.bank_account_id);
  const cust = db.get('SELECT * FROM customers WHERE id = ?', r.customer_id);
  const bankDebit = toBase(r.total, r);
  const jl = [{ account_id: b.account_id, branch_id: b.branch_id, debit: bankDebit, memo: `Penerimaan ${cust.name}` }];
  let arCredit = 0;
  for (const l of ls) {
    const inv = db.get('SELECT * FROM sales_invoices WHERE id = ?', l.invoice_id);
    if (!inv || inv.customer_id !== r.customer_id) throw bad('Faktur pada baris penerimaan bukan milik pelanggan ini.');
    if (!['terbit', 'sebagian'].includes(inv.status)) throw bad(`Faktur ${inv.number} tidak dalam status terbuka.`);
    if (!(l.amount > 0)) throw bad('Nilai pembayaran per faktur harus positif.');
    if (!sameCurrency(inv, r)) throw bad(`Mata uang penerimaan harus sama dengan mata uang faktur ${inv.number}.`);
    settle('sales_invoices', inv.id, l.amount);
    const base = toBase(l.amount, inv);
    arCredit += base;
    jl.push({ account_id: acct(cust.related_company_id ? 'ic_receivable' : 'ar'), branch_id: inv.branch_id, credit: base, memo: `Pelunasan ${inv.number}`, partner_type: 'customer', partner_id: cust.id });
  }
  const fx = fxLine(bankDebit - arCredit, b.branch_id, 'Selisih kurs terealisasi');
  if (fx) jl.push(fx);
  postJournal(ctx, { companyId: r.company_id, branchId: r.branch_id, date: r.date, description: `Penerimaan ${r.number} — ${cust.name}`, sourceType: 'customer_receipts', sourceId: r.id, sourceNo: r.number, lines: jl });
  setStatus('customer_receipts', r.id, 'diposting');
}

function voidReceipt(ctx, r) {
  for (const l of lines('customer_receipt_lines', r.id)) settle('sales_invoices', l.invoice_id, -l.amount);
  reverseDocumentJournals(ctx, 'customer_receipts', r.id, today(), `Pembatalan penerimaan ${r.number}`);
  setStatus('customer_receipts', r.id, 'batal');
}

function postPos(ctx, s) {
  const ls = lines('pos_sale_lines', s.id);
  needLines(ls, 'transaksi kasir');
  const b = bank(s.bank_account_id);
  const wh = warehouse(s.warehouse_id);
  const jl = [{ account_id: b.account_id, branch_id: b.branch_id, debit: s.total, memo: `POS ${s.payment_method}` }];
  for (const l of ls) {
    const p = product(l.product_id);
    jl.push({ account_id: productAcct(p, 'revenue_account_id', 'sales'), credit: l.amount, memo: `${p.code} ${p.name}` });
    if (isStockable(p)) {
      const { value, unitCost } = stockOut(ctx, { warehouseId: s.warehouse_id, productId: p.id, qty: l.qty, date: s.date, sourceType: 'pos_sales', sourceId: s.id, sourceNo: s.number });
      db.run('UPDATE pos_sale_lines SET unit_cost = ? WHERE id = ?', unitCost, l.id);
      if (value > 0) {
        jl.push({ account_id: productAcct(p, 'cogs_account_id', 'cogs'), debit: value, branch_id: wh.branch_id });
        jl.push({ account_id: productAcct(p, 'inventory_account_id', 'inventory'), credit: value, branch_id: wh.branch_id });
      }
    }
  }
  if (s.tax > 0) jl.push({ account_id: acct('vat_out'), credit: s.tax, memo: 'PPN keluaran' });
  postJournal(ctx, { companyId: s.company_id, branchId: s.branch_id, date: s.date, description: `Penjualan kasir ${s.number}`, sourceType: 'pos_sales', sourceId: s.id, sourceNo: s.number, lines: jl });
  setStatus('pos_sales', s.id, 'lunas');
}

function voidPos(ctx, s) {
  for (const l of lines('pos_sale_lines', s.id)) {
    const p = product(l.product_id);
    if (isStockable(p)) stockIn(ctx, { warehouseId: s.warehouse_id, productId: p.id, qty: l.qty, unitCost: l.unit_cost || 0, date: today(), sourceType: 'pos_sales', sourceId: s.id, sourceNo: `${s.number} (void)` });
  }
  reverseDocumentJournals(ctx, 'pos_sales', s.id, today(), `Void ${s.number}`);
  setStatus('pos_sales', s.id, 'void');
}

/* --- Pembelian -------------------------------------------------------------- */
function postBill(ctx, bill) {
  const ls = lines('purchase_bill_lines', bill.id);
  needLines(ls, 'tagihan');
  const sup = db.get('SELECT * FROM suppliers WHERE id = ?', bill.supplier_id);
  const jl = [];
  const factor = bill.subtotal ? 1 : 0;
  for (const l of ls) {
    const p = l.product_id ? product(l.product_id) : null;
    if (p && isStockable(p)) {
      if (!bill.warehouse_id) throw bad('Pilih gudang penerima untuk baris barang persediaan.');
      const wh = warehouse(bill.warehouse_id);
      const baseAmt = toBase(l.amount, bill) * factor;
      const unit = l.qty ? baseAmt / l.qty : 0;
      stockIn(ctx, { warehouseId: bill.warehouse_id, productId: p.id, qty: l.qty, unitCost: unit, date: bill.date, sourceType: 'purchase_bills', sourceId: bill.id, sourceNo: bill.number });
      jl.push({ account_id: productAcct(p, 'inventory_account_id', 'inventory'), branch_id: wh.branch_id, debit: round2(baseAmt), memo: `${p.code} ${p.name}`, project_id: l.project_id });
    } else {
      const account = l.account_id || (p ? productAcct(p, 'cogs_account_id', 'cogs') : null);
      if (!account) throw bad('Baris jasa/beban harus memilih akun.');
      jl.push({ account_id: account, debit: toBase(l.amount, bill), memo: l.description || p?.name, cost_center_id: l.cost_center_id, project_id: l.project_id });
    }
  }
  if (bill.tax > 0) jl.push({ account_id: acct('vat_in'), debit: toBase(bill.tax, bill), memo: 'PPN masukan' });
  jl.push({ account_id: acct(sup.related_company_id ? 'ic_payable' : 'ap'), credit: round2(jl.reduce((a, x) => a + (x.debit || 0), 0)), memo: `Hutang ${sup.name}`, partner_type: 'supplier', partner_id: sup.id });
  postJournal(ctx, { companyId: bill.company_id, branchId: bill.branch_id, date: bill.date, description: `Tagihan ${bill.number} (${bill.supplier_invoice_no || '-'}) — ${sup.name}`, sourceType: 'purchase_bills', sourceId: bill.id, sourceNo: bill.number, lines: jl });
  setStatus('purchase_bills', bill.id, 'terbit');
  if (bill.purchase_order_id) setStatus('purchase_orders', bill.purchase_order_id, 'diterima');
}

function voidBill(ctx, bill) {
  if (bill.paid > 0) throw conflict('Tagihan yang sudah dibayar tidak dapat dibatalkan.');
  for (const l of lines('purchase_bill_lines', bill.id)) {
    const p = l.product_id ? product(l.product_id) : null;
    if (p && isStockable(p)) stockOut(ctx, { warehouseId: bill.warehouse_id, productId: p.id, qty: l.qty, date: today(), sourceType: 'purchase_bills', sourceId: bill.id, sourceNo: `${bill.number} (batal)` });
  }
  reverseDocumentJournals(ctx, 'purchase_bills', bill.id, today(), `Pembatalan tagihan ${bill.number}`);
  setStatus('purchase_bills', bill.id, 'batal');
}

function postPayment(ctx, pay) {
  const ls = lines('supplier_payment_lines', pay.id);
  needLines(ls, 'pembayaran');
  const b = bank(pay.bank_account_id);
  const sup = db.get('SELECT * FROM suppliers WHERE id = ?', pay.supplier_id);
  const jl = [];
  let apDebit = 0;
  for (const l of ls) {
    const bill = db.get('SELECT * FROM purchase_bills WHERE id = ?', l.bill_id);
    if (!bill || bill.supplier_id !== pay.supplier_id) throw bad('Tagihan pada baris pembayaran bukan milik pemasok ini.');
    if (!['terbit', 'sebagian'].includes(bill.status)) throw bad(`Tagihan ${bill.number} tidak dalam status terbuka.`);
    if (!(l.amount > 0)) throw bad('Nilai pembayaran per tagihan harus positif.');
    if (!sameCurrency(bill, pay)) throw bad(`Mata uang pembayaran harus sama dengan mata uang tagihan ${bill.number}.`);
    settle('purchase_bills', bill.id, l.amount);
    const base = toBase(l.amount, bill);
    apDebit += base;
    jl.push({ account_id: acct(sup.related_company_id ? 'ic_payable' : 'ap'), branch_id: bill.branch_id, debit: base, memo: `Pelunasan ${bill.number}`, partner_type: 'supplier', partner_id: sup.id });
  }
  const bankCredit = toBase(pay.total, pay);
  jl.push({ account_id: b.account_id, branch_id: b.branch_id, credit: bankCredit, memo: `Pembayaran ${sup.name}` });
  const fx = fxLine(apDebit - bankCredit, b.branch_id, 'Selisih kurs terealisasi');
  if (fx) jl.push(fx);
  postJournal(ctx, { companyId: pay.company_id, branchId: pay.branch_id, date: pay.date, description: `Pembayaran ${pay.number} — ${sup.name}`, sourceType: 'supplier_payments', sourceId: pay.id, sourceNo: pay.number, lines: jl });
  setStatus('supplier_payments', pay.id, 'diposting');
}

function voidPayment(ctx, pay) {
  for (const l of lines('supplier_payment_lines', pay.id)) settle('purchase_bills', l.bill_id, -l.amount);
  reverseDocumentJournals(ctx, 'supplier_payments', pay.id, today(), `Pembatalan pembayaran ${pay.number}`);
  setStatus('supplier_payments', pay.id, 'batal');
}

/* --- Kas & bank ----------------------------------------------------------------- */
function postCash(ctx, c) {
  const ls = lines('cash_transaction_lines', c.id);
  needLines(ls, 'transaksi kas');
  const b = bank(c.bank_account_id);
  const out = c.direction === 'keluar';
  const jl = ls.map((l) => ({ account_id: l.account_id, [out ? 'debit' : 'credit']: l.amount, memo: l.memo || c.description, cost_center_id: l.cost_center_id, project_id: l.project_id }));
  jl.push({ account_id: b.account_id, branch_id: b.branch_id, [out ? 'credit' : 'debit']: c.total, memo: c.description });
  postJournal(ctx, { companyId: c.company_id, branchId: c.branch_id, date: c.date, description: `${out ? 'Kas keluar' : 'Kas masuk'} ${c.number}: ${c.description}`, sourceType: 'cash_transactions', sourceId: c.id, sourceNo: c.number, lines: jl });
  setStatus('cash_transactions', c.id, 'diposting');
}

function postTransfer(ctx, t) {
  const from = bank(t.from_bank_id), to = bank(t.to_bank_id);
  if (from.company_id !== to.company_id) throw bad('Transfer antar perusahaan dicatat lewat faktur/tagihan antar perusahaan, bukan transfer rekening.');
  if (!(t.amount > 0)) throw bad('Jumlah transfer harus positif.');
  postJournal(ctx, {
    companyId: t.company_id, branchId: t.branch_id, date: t.date, description: `Transfer ${t.number}: ${t.description}`, sourceType: 'bank_transfers', sourceId: t.id, sourceNo: t.number,
    lines: [
      { account_id: to.account_id, branch_id: to.branch_id, debit: t.amount, memo: `Ke ${to.name}` },
      { account_id: from.account_id, branch_id: from.branch_id, credit: t.amount, memo: `Dari ${from.name}` },
    ],
  });
  setStatus('bank_transfers', t.id, 'diposting');
}

const voidSimple = (table, label) => (ctx, d) => {
  reverseDocumentJournals(ctx, table, d.id, today(), `Pembatalan ${label} ${d.number}`);
  setStatus(table, d.id, 'batal');
};

/* --- Jurnal manual ------------------------------------------------------------ */
function submitJournal(ctx, j) {
  validateJournalLines(j.company_id, j.branch_id, lines('journal_lines', j.id));
  setStatus('journals', j.id, approvalPolicy().requireJournalApproval ? 'diajukan' : 'diajukan');
}

/* --- Persediaan --------------------------------------------------------------- */
function postAdjustment(ctx, a) {
  const ls = lines('stock_adjustment_lines', a.id);
  needLines(ls, 'penyesuaian');
  const wh = warehouse(a.warehouse_id);
  const jl = [];
  let total = 0;
  for (const l of ls) {
    const p = product(l.product_id);
    if (!isStockable(p)) throw bad(`${p.code} adalah jasa dan tidak memiliki stok.`);
    const invAcct = productAcct(p, 'inventory_account_id', 'inventory');
    if (l.qty > 0) {
      const unit = l.unit_cost || db.get('SELECT avg_cost FROM stock_balances WHERE product_id = ? AND warehouse_id = ?', p.id, wh.id)?.avg_cost || p.standard_cost || 0;
      const v = stockIn(ctx, { warehouseId: wh.id, productId: p.id, qty: l.qty, unitCost: unit, date: a.date, sourceType: 'stock_adjustments', sourceId: a.id, sourceNo: a.number });
      jl.push({ account_id: invAcct, debit: v, branch_id: wh.branch_id, memo: `${p.code} +${l.qty}` });
      jl.push({ account_id: a.account_id, credit: v, branch_id: wh.branch_id, memo: a.reason });
      total += v;
    } else if (l.qty < 0) {
      const { value } = stockOut(ctx, { warehouseId: wh.id, productId: p.id, qty: -l.qty, date: a.date, sourceType: 'stock_adjustments', sourceId: a.id, sourceNo: a.number });
      jl.push({ account_id: a.account_id, debit: value, branch_id: wh.branch_id, memo: a.reason });
      jl.push({ account_id: invAcct, credit: value, branch_id: wh.branch_id, memo: `${p.code} ${l.qty}` });
      total -= value;
    }
  }
  if (jl.length) postJournal(ctx, { companyId: a.company_id, branchId: wh.branch_id, date: a.date, description: `Penyesuaian stok ${a.number}: ${a.reason}`, sourceType: 'stock_adjustments', sourceId: a.id, sourceNo: a.number, lines: jl });
  setStatus('stock_adjustments', a.id, 'diposting', { total: round2(total) });
}

function postStockTransfer(ctx, t) {
  const ls = lines('stock_transfer_lines', t.id);
  needLines(ls, 'transfer stok');
  const from = warehouse(t.from_warehouse_id), to = warehouse(t.to_warehouse_id);
  if (from.company_id !== to.company_id) throw bad('Transfer stok hanya antar gudang dalam satu perusahaan.');
  const jl = [];
  let total = 0;
  for (const l of ls) {
    const p = product(l.product_id);
    const { value, unitCost } = stockOut(ctx, { warehouseId: from.id, productId: p.id, qty: l.qty, date: t.date, sourceType: 'stock_transfers', sourceId: t.id, sourceNo: t.number });
    stockIn(ctx, { warehouseId: to.id, productId: p.id, qty: l.qty, unitCost, date: t.date, sourceType: 'stock_transfers', sourceId: t.id, sourceNo: t.number });
    total += value;
    if (from.branch_id !== to.branch_id && value > 0) {
      const ia = productAcct(p, 'inventory_account_id', 'inventory');
      jl.push({ account_id: ia, branch_id: to.branch_id, debit: value, memo: `${p.code} masuk dari ${from.name}` });
      jl.push({ account_id: ia, branch_id: from.branch_id, credit: value, memo: `${p.code} keluar ke ${to.name}` });
    }
  }
  if (jl.length) postJournal(ctx, { companyId: t.company_id, branchId: t.branch_id, date: t.date, description: `Transfer stok antar cabang ${t.number}`, sourceType: 'stock_transfers', sourceId: t.id, sourceNo: t.number, lines: jl });
  setStatus('stock_transfers', t.id, 'diposting', { total: round2(total) });
}

/* --- Produksi ------------------------------------------------------------------ */
function completeWorkOrder(ctx, wo) {
  const bom = db.get('SELECT * FROM boms WHERE id = ?', wo.bom_id);
  const comps = lines('bom_lines', bom.id);
  if (!comps.length) throw bad('BOM belum memiliki komponen.');
  const wh = warehouse(wo.warehouse_id);
  const fg = product(bom.product_id);
  const jl = [];
  let total = 0;
  for (const c of comps) {
    const p = product(c.component_id);
    const qty = round2(c.qty * wo.qty * 10000) / 10000;
    if (!isStockable(p)) continue;
    const { value } = stockOut(ctx, { warehouseId: wh.id, productId: p.id, qty, date: today(), sourceType: 'work_orders', sourceId: wo.id, sourceNo: wo.number });
    jl.push({ account_id: productAcct(p, 'inventory_account_id', 'inventory'), branch_id: wh.branch_id, credit: value, memo: `Pemakaian ${p.code}` });
    total += value;
  }
  const outQty = round2((bom.output_qty || 1) * wo.qty * 10000) / 10000;
  const date = today();
  stockIn(ctx, { warehouseId: wh.id, productId: fg.id, qty: outQty, unitCost: outQty ? total / outQty : 0, date, sourceType: 'work_orders', sourceId: wo.id, sourceNo: wo.number });
  jl.push({ account_id: productAcct(fg, 'inventory_account_id', 'inventory'), branch_id: wh.branch_id, debit: round2(total), memo: `Hasil produksi ${fg.code} × ${outQty}` });
  if (total > 0) postJournal(ctx, { companyId: wo.company_id, branchId: wh.branch_id, date, description: `Penyelesaian ${wo.number} — ${fg.name}`, sourceType: 'work_orders', sourceId: wo.id, sourceNo: wo.number, lines: jl });
  setStatus('work_orders', wo.id, 'selesai', { progress: 100, total: round2(total) });
}

/* --- SDM: penggajian ---------------------------------------------------------- */
function generatePayroll(ctx, run) {
  const emps = db.all("SELECT * FROM employees WHERE company_id = ? AND branch_id = ? AND status = 'aktif' ORDER BY code", run.company_id, run.branch_id);
  if (!emps.length) throw bad('Tidak ada karyawan aktif di cabang ini.');
  db.run('DELETE FROM payroll_lines WHERE parent_id = ?', run.id);
  const [y, m] = run.period.split('-').map(Number);
  const from = `${run.period}-01`, to = monthEnd(y, m);
  emps.forEach((e, i) => {
    const ot = db.get("SELECT COALESCE(SUM(overtime_hours),0) h FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?", e.id, from, to).h;
    const basic = e.basic_salary || 0, allowance = e.allowance || 0;
    const overtime = round2(ot * (basic / 173) * 1.5);
    const bpjs = round2(basic * 0.04);
    const gross = basic + allowance + overtime;
    const pph21 = round2(Math.max(0, gross - 4_500_000) * 0.05);
    db.insert('payroll_lines', { parent_id: run.id, line_no: i + 1, employee_id: e.id, basic, allowance, overtime, bpjs, pph21, net: round2(gross - bpjs - pph21) });
  });
  const ls = lines('payroll_lines', run.id);
  db.update('payroll_runs', run.id, { gross: sum(ls, (l) => l.basic + l.allowance + l.overtime), total: sum(ls, (l) => l.net) });
  return { message: `${ls.length} slip gaji dibuat.` };
}

function postPayroll(ctx, run) {
  const ls = lines('payroll_lines', run.id);
  needLines(ls, 'penggajian');
  const gross = sum(ls, (l) => l.basic + l.allowance + l.overtime);
  const pph = sum(ls, (l) => l.pph21), bpjs = sum(ls, (l) => l.bpjs), net = sum(ls, (l) => l.net);
  postJournal(ctx, {
    companyId: run.company_id, branchId: run.branch_id, date: run.pay_date, description: `Beban gaji periode ${run.period}`, sourceType: 'payroll_runs', sourceId: run.id, sourceNo: run.number,
    lines: [
      { account_id: acct('salary_expense'), debit: gross, memo: `Gaji bruto ${ls.length} karyawan` },
      { account_id: acct('pph21_payable'), credit: pph, memo: 'PPh 21 terutang' },
      { account_id: acct('bpjs_payable'), credit: bpjs, memo: 'Iuran BPJS' },
      { account_id: acct('salary_payable'), credit: net, memo: 'Gaji neto terutang' },
    ],
  });
  setStatus('payroll_runs', run.id, 'diposting');
}

function payPayroll(ctx, run) {
  const b = bank(run.bank_account_id);
  postJournal(ctx, {
    companyId: run.company_id, branchId: run.branch_id, date: run.pay_date, description: `Pembayaran gaji ${run.period}`, sourceType: 'payroll_runs', sourceId: run.id, sourceNo: run.number,
    lines: [{ account_id: acct('salary_payable'), debit: run.total }, { account_id: b.account_id, branch_id: b.branch_id, credit: run.total }],
  });
  setStatus('payroll_runs', run.id, 'dibayar');
}

/* --- Aset tetap --------------------------------------------------------------- */
function activateAsset(ctx, a) {
  postJournal(ctx, {
    companyId: a.company_id, branchId: a.branch_id, date: a.acquisition_date, description: `Perolehan aset ${a.code} ${a.name}`, sourceType: 'fixed_assets', sourceId: a.id, sourceNo: a.code,
    lines: [{ account_id: a.asset_account_id, debit: a.cost }, { account_id: a.credit_account_id, credit: a.cost }],
  });
  setStatus('fixed_assets', a.id, 'aktif', { accumulated: 0, book_value: a.cost });
}

function disposeAsset(ctx, a, p) {
  const proceeds = round2(p.proceeds || 0);
  if (proceeds > 0 && !p.bank_account_id) throw bad('Pilih rekening penerimaan hasil penjualan.');
  const book = round2(a.cost - a.accumulated);
  const jl = [
    { account_id: a.accum_account_id, debit: a.accumulated },
    { account_id: a.asset_account_id, credit: a.cost },
  ];
  if (proceeds > 0) { const b = bank(p.bank_account_id); jl.push({ account_id: b.account_id, branch_id: b.branch_id, debit: proceeds }); }
  const gain = round2(proceeds - book);
  if (gain > 0) jl.push({ account_id: acct('gain_disposal'), credit: gain });
  if (gain < 0) jl.push({ account_id: acct('loss_disposal'), debit: -gain });
  postJournal(ctx, { companyId: a.company_id, branchId: a.branch_id, date: p.date, description: `Pelepasan aset ${a.code} ${a.name}`, sourceType: 'fixed_assets', sourceId: a.id, sourceNo: a.code, lines: jl.filter((l) => (l.debit || l.credit) > 0) });
  setStatus('fixed_assets', a.id, 'dilepas', { book_value: 0 });
}

function monthsBetween(fromDate, period) {
  const [y1, m1] = fromDate.split('-').map(Number);
  const [y2, m2] = period.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

function postDepreciation(ctx, run) {
  if (db.get("SELECT id FROM depreciation_runs WHERE company_id = ? AND period = ? AND status = 'diposting' AND id != ?", run.company_id, run.period, run.id)) throw conflict(`Penyusutan periode ${run.period} sudah diposting.`);
  const [y, m] = run.period.split('-').map(Number);
  const end = monthEnd(y, m);
  const assets = db.all("SELECT * FROM fixed_assets WHERE company_id = ? AND status = 'aktif' AND acquisition_date <= ?", run.company_id, end);
  const jl = [];
  let total = 0, count = 0;
  for (const a of assets) {
    if (monthsBetween(a.acquisition_date, run.period) < 1) continue;
    const base = a.cost - (a.salvage_value || 0);
    const monthly = round2(base / a.useful_life_months);
    const amount = round2(Math.min(monthly, base - a.accumulated));
    if (amount <= 0) continue;
    jl.push({ account_id: a.expense_account_id, branch_id: a.branch_id, debit: amount, memo: `${a.code} ${a.name}` });
    jl.push({ account_id: a.accum_account_id, branch_id: a.branch_id, credit: amount, memo: a.code });
    db.update('fixed_assets', a.id, { accumulated: round2(a.accumulated + amount), book_value: round2(a.cost - a.accumulated - amount) });
    total += amount; count++;
  }
  if (!jl.length) throw bad('Tidak ada aset yang perlu disusutkan pada periode ini.');
  const headBranch = db.get('SELECT id FROM branches WHERE company_id = ? ORDER BY is_head_office DESC, id LIMIT 1', run.company_id).id;
  postJournal(ctx, { companyId: run.company_id, branchId: headBranch, date: end, description: `Penyusutan aset tetap ${run.period}`, sourceType: 'depreciation_runs', sourceId: run.id, sourceNo: run.number, lines: jl });
  setStatus('depreciation_runs', run.id, 'diposting', { total: round2(total), asset_count: count });
}

function voidDepreciation(ctx, run) {
  if (db.get("SELECT id FROM depreciation_runs WHERE company_id = ? AND period > ? AND status = 'diposting'", run.company_id, run.period)) throw conflict('Batalkan penyusutan periode setelahnya terlebih dahulu.');
  const j = db.get("SELECT id FROM journals WHERE source_type = 'depreciation_runs' AND source_id = ? AND reversal_of IS NULL", run.id);
  for (const l of db.all('SELECT * FROM journal_lines WHERE parent_id = ? AND credit > 0 AND is_system = 0', j.id)) {
    const a = db.get('SELECT * FROM fixed_assets WHERE code = ? AND company_id = ?', l.memo, run.company_id);
    if (a) db.update('fixed_assets', a.id, { accumulated: round2(a.accumulated - l.credit), book_value: round2(a.book_value + l.credit) });
  }
  reverseDocumentJournals(ctx, 'depreciation_runs', run.id, today(), `Pembatalan penyusutan ${run.period}`);
  setStatus('depreciation_runs', run.id, 'batal');
}

function completeMaintenance(ctx, mo) {
  if (mo.cost > 0) {
    if (!mo.bank_account_id) throw bad('Pilih rekening pembayaran biaya pemeliharaan.');
    const b = bank(mo.bank_account_id);
    const asset = db.get('SELECT code, name FROM fixed_assets WHERE id = ?', mo.asset_id);
    postJournal(ctx, {
      companyId: mo.company_id, branchId: mo.branch_id, date: today(), description: `Biaya pemeliharaan ${mo.number} — ${asset.code} ${asset.name}`, sourceType: 'maintenance_orders', sourceId: mo.id, sourceNo: mo.number,
      lines: [{ account_id: acct('maintenance_expense'), debit: mo.cost }, { account_id: b.account_id, branch_id: b.branch_id, credit: mo.cost }],
    });
  }
  setStatus('maintenance_orders', mo.id, 'selesai');
}

/* --- Retur penjualan & pembelian ---------------------------------------------- */
function returnedQty(table, field, docId, productId, excludeId) {
  const lt = table === 'sales_returns' ? 'sales_return_lines' : 'purchase_return_lines';
  return db.get(`SELECT COALESCE(SUM(l.qty),0) q FROM "${lt}" l JOIN "${table}" d ON d.id = l.parent_id
    WHERE d."${field}" = ? AND d.status = 'diposting' AND l.product_id = ? AND d.id != ?`, docId, productId, excludeId).q;
}

function postSalesReturn(ctx, r) {
  const ls = lines('sales_return_lines', r.id);
  needLines(ls, 'retur');
  const inv = db.get('SELECT * FROM sales_invoices WHERE id = ?', r.sales_invoice_id);
  if (!inv || !['terbit', 'sebagian', 'lunas'].includes(inv.status)) throw bad('Faktur asal tidak valid atau belum terbit.');
  const cust = db.get('SELECT * FROM customers WHERE id = ?', inv.customer_id);
  const invLines = lines('sales_invoice_lines', inv.id);
  const wh = warehouse(r.warehouse_id);
  const jl = [];
  for (const l of ls) {
    const src = invLines.find((x) => x.product_id === l.product_id);
    if (!src) throw bad('Barang retur tidak terdapat pada faktur asal.');
    const sold = invLines.filter((x) => x.product_id === l.product_id).reduce((a, x) => a + x.qty, 0);
    if (returnedQty('sales_returns', 'sales_invoice_id', inv.id, l.product_id, r.id) + l.qty > sold + 1e-9) throw bad(`Qty retur ${product(l.product_id).code} melebihi qty pada faktur (${sold}).`);
    const p = product(l.product_id);
    jl.push({ account_id: acct('sales_returns'), debit: toBase(l.amount, inv), memo: `Retur ${p.code}` });
    if (isStockable(p)) {
      const unit = src.unit_cost || 0;
      const v = stockIn(ctx, { warehouseId: wh.id, productId: p.id, qty: l.qty, unitCost: unit, date: r.date, sourceType: 'sales_returns', sourceId: r.id, sourceNo: r.number });
      db.run('UPDATE sales_return_lines SET unit_cost = ? WHERE id = ?', unit, l.id);
      if (v > 0) {
        jl.push({ account_id: productAcct(p, 'inventory_account_id', 'inventory'), branch_id: wh.branch_id, debit: v, memo: `Barang retur ${p.code}` });
        jl.push({ account_id: productAcct(p, 'cogs_account_id', 'cogs'), branch_id: wh.branch_id, credit: v, memo: `Koreksi HPP ${p.code}` });
      }
    }
  }
  if (r.tax > 0) jl.push({ account_id: acct('vat_out'), debit: toBase(r.tax, inv), memo: 'Koreksi PPN keluaran' });
  const credit = round2(jl.filter((x) => x.debit && !x.branch_id).reduce((a, x) => a + x.debit, 0));
  jl.push({ account_id: acct(cust.related_company_id ? 'ic_receivable' : 'ar'), branch_id: inv.branch_id, credit, memo: `Nota kredit ${cust.name}`, partner_type: 'customer', partner_id: cust.id });
  settle('sales_invoices', inv.id, r.total);
  postJournal(ctx, { companyId: r.company_id, branchId: r.branch_id, date: r.date, description: `Retur penjualan ${r.number} atas ${inv.number} — ${cust.name}`, sourceType: 'sales_returns', sourceId: r.id, sourceNo: r.number, lines: jl });
  setStatus('sales_returns', r.id, 'diposting');
}

function voidSalesReturn(ctx, r) {
  for (const l of lines('sales_return_lines', r.id)) {
    const p = product(l.product_id);
    if (isStockable(p)) stockOut(ctx, { warehouseId: r.warehouse_id, productId: p.id, qty: l.qty, date: today(), sourceType: 'sales_returns', sourceId: r.id, sourceNo: `${r.number} (batal)` });
  }
  settle('sales_invoices', r.sales_invoice_id, -r.total);
  reverseDocumentJournals(ctx, 'sales_returns', r.id, today(), `Pembatalan retur ${r.number}`);
  setStatus('sales_returns', r.id, 'batal');
}

function postPurchaseReturn(ctx, r) {
  const ls = lines('purchase_return_lines', r.id);
  needLines(ls, 'retur');
  const bill = db.get('SELECT * FROM purchase_bills WHERE id = ?', r.purchase_bill_id);
  if (!bill || !['terbit', 'sebagian', 'lunas'].includes(bill.status)) throw bad('Tagihan asal tidak valid atau belum diposting.');
  const sup = db.get('SELECT * FROM suppliers WHERE id = ?', bill.supplier_id);
  const billLines = lines('purchase_bill_lines', bill.id);
  const wh = warehouse(r.warehouse_id);
  const jl = [];
  let stockValue = 0;
  for (const l of ls) {
    const bought = billLines.filter((x) => x.product_id === l.product_id).reduce((a, x) => a + x.qty, 0);
    if (!bought) throw bad('Barang retur tidak terdapat pada tagihan asal.');
    if (returnedQty('purchase_returns', 'purchase_bill_id', bill.id, l.product_id, r.id) + l.qty > bought + 1e-9) throw bad(`Qty retur ${product(l.product_id).code} melebihi qty pada tagihan (${bought}).`);
    const p = product(l.product_id);
    if (isStockable(p)) {
      const { value, unitCost } = stockOut(ctx, { warehouseId: wh.id, productId: p.id, qty: l.qty, date: r.date, sourceType: 'purchase_returns', sourceId: r.id, sourceNo: r.number });
      db.run('UPDATE purchase_return_lines SET unit_cost = ? WHERE id = ?', unitCost, l.id);
      if (value > 0) jl.push({ account_id: productAcct(p, 'inventory_account_id', 'inventory'), branch_id: wh.branch_id, credit: value, memo: `Retur ${p.code}` });
      stockValue += value;
    }
  }
  const subtotalBase = toBase(r.subtotal, bill);
  const nonStock = round2(subtotalBase - stockValue);
  if (Math.abs(nonStock) >= 0.005) jl.push(nonStock > 0 ? { account_id: acct('purchase_variance'), credit: nonStock, memo: 'Selisih harga retur' } : { account_id: acct('purchase_variance'), debit: -nonStock, memo: 'Selisih harga retur' });
  if (r.tax > 0) jl.push({ account_id: acct('vat_in'), credit: toBase(r.tax, bill), memo: 'Koreksi PPN masukan' });
  const debit = round2(jl.reduce((a, x) => a + (x.credit || 0) - (x.debit || 0), 0));
  jl.push({ account_id: acct(sup.related_company_id ? 'ic_payable' : 'ap'), branch_id: bill.branch_id, debit, memo: `Nota debit ${sup.name}`, partner_type: 'supplier', partner_id: sup.id });
  settle('purchase_bills', bill.id, r.total);
  postJournal(ctx, { companyId: r.company_id, branchId: r.branch_id, date: r.date, description: `Retur pembelian ${r.number} atas ${bill.number} — ${sup.name}`, sourceType: 'purchase_returns', sourceId: r.id, sourceNo: r.number, lines: jl });
  setStatus('purchase_returns', r.id, 'diposting');
}

function voidPurchaseReturn(ctx, r) {
  for (const l of lines('purchase_return_lines', r.id)) {
    const p = product(l.product_id);
    if (isStockable(p)) stockIn(ctx, { warehouseId: r.warehouse_id, productId: p.id, qty: l.qty, unitCost: l.unit_cost || 0, date: today(), sourceType: 'purchase_returns', sourceId: r.id, sourceNo: `${r.number} (batal)` });
  }
  settle('purchase_bills', r.purchase_bill_id, -r.total);
  reverseDocumentJournals(ctx, 'purchase_returns', r.id, today(), `Pembatalan retur ${r.number}`);
  setStatus('purchase_returns', r.id, 'batal');
}

/* --- Rekonsiliasi bank ---------------------------------------------------------- */
export function reconState(recon) {
  const b = bank(recon.bank_account_id);
  const gl = round2(db.get(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id
    WHERE j.status = 'diposting' AND jl.account_id = ? AND jl.branch_id = ? AND j.date <= ?`, b.account_id, b.branch_id, recon.statement_date).v);
  const cleared = round2(db.get(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) v FROM reconciliation_items ri JOIN journal_lines jl ON jl.id = ri.journal_line_id
    JOIN bank_reconciliations r ON r.id = ri.recon_id WHERE r.bank_account_id = ? AND (r.status = 'selesai' OR r.id = ?)`, recon.bank_account_id, recon.id).v);
  return { bank: b, gl, cleared, difference: round2((recon.statement_balance || 0) - cleared) };
}

function finalizeRecon(_ctx, recon) {
  const st = reconState(recon);
  if (Math.abs(st.difference) >= 0.005) throw bad(`Rekonsiliasi belum seimbang: selisih ${st.difference.toLocaleString('id-ID')}. Centang mutasi yang sudah tercantum di rekening koran.`);
  setStatus('bank_reconciliations', recon.id, 'selesai', { gl_balance: st.gl, cleared_balance: st.cleared, difference: 0 });
}

/* --- Shift kasir ------------------------------------------------------------------ */
function closeShift(ctx, sh, p) {
  const b = bank(sh.bank_account_id);
  const sales = db.get(`SELECT COUNT(*) n, COALESCE(SUM(total),0) v FROM pos_sales WHERE bank_account_id = ? AND status = 'lunas' AND payment_method = 'Tunai'
    AND date = ? AND created_at >= ?`, sh.bank_account_id, sh.date, sh.created_at);
  const expected = round2(sh.opening_cash + sales.v);
  const counted = round2(p.closing_cash);
  const diff = round2(counted - expected);
  if (Math.abs(diff) >= 0.005) {
    postJournal(ctx, {
      companyId: sh.company_id, branchId: sh.branch_id, date: sh.date, description: `Selisih kas shift ${sh.number} (${sh.cashier})`, sourceType: 'pos_shifts', sourceId: sh.id, sourceNo: sh.number,
      lines: diff < 0
        ? [{ account_id: acct('cash_over_short'), debit: -diff, memo: 'Kekurangan kas' }, { account_id: b.account_id, branch_id: b.branch_id, credit: -diff }]
        : [{ account_id: b.account_id, branch_id: b.branch_id, debit: diff }, { account_id: acct('cash_over_short'), credit: diff, memo: 'Kelebihan kas' }],
    });
  }
  setStatus('pos_shifts', sh.id, 'tutup', { sales_total: round2(sales.v), transactions: sales.n, expected_cash: expected, closing_cash: counted, difference: diff });
  return { message: Math.abs(diff) < 0.005 ? 'Shift ditutup — kas sesuai.' : `Shift ditutup — selisih ${diff.toLocaleString('id-ID')} dijurnal.` };
}

/* --- Tutup buku tahunan ---------------------------------------------------------- */
function closeYear(ctx, period) {
  const year = period.start_date.slice(0, 4);
  const end = `${year}-12-31`;
  if (db.get("SELECT id FROM journals WHERE company_id = ? AND source_type = 'year_closing' AND source_no = ? AND status = 'diposting' AND reversal_of IS NULL", period.company_id, year)) {
    throw conflict(`Tutup buku tahun ${year} sudah dilakukan.`);
  }
  const rows = db.all(`SELECT jl.account_id, jl.branch_id, ROUND(SUM(jl.debit - jl.credit), 2) net FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id
    JOIN accounts a ON a.id = jl.account_id WHERE j.status = 'diposting' AND jl.company_id = ? AND j.date BETWEEN ? AND ?
    AND a.type IN ('revenue','cogs','expense','other_income','other_expense','tax') GROUP BY jl.account_id, jl.branch_id HAVING ABS(net) > 0.004`, period.company_id, `${year}-01-01`, end);
  if (!rows.length) throw bad(`Tidak ada saldo laba rugi tahun ${year}.`);
  const re = acct('retained_earnings');
  const jl = rows.map((r) => (r.net > 0 ? { account_id: r.account_id, branch_id: r.branch_id, credit: r.net } : { account_id: r.account_id, branch_id: r.branch_id, debit: -r.net }));
  const perBranch = new Map();
  for (const r of rows) perBranch.set(r.branch_id, round2((perBranch.get(r.branch_id) || 0) + r.net));
  for (const [branchId, net] of perBranch) if (Math.abs(net) >= 0.005) jl.push(net > 0 ? { account_id: re, branch_id: branchId, debit: net, memo: 'Rugi tahun berjalan ke saldo laba' } : { account_id: re, branch_id: branchId, credit: -net, memo: 'Laba tahun berjalan ke saldo laba' });
  const head = db.get('SELECT id FROM branches WHERE company_id = ? ORDER BY is_head_office DESC, id LIMIT 1', period.company_id).id;
  postJournal(ctx, { companyId: period.company_id, branchId: head, date: end, description: `Jurnal penutup tahun buku ${year}`, sourceType: 'year_closing', sourceId: period.id, sourceNo: year, lines: jl });
  return { message: `Tutup buku ${year} selesai: ${rows.length} saldo akun laba rugi dipindahkan ke Saldo Laba.` };
}

/* --- Daftar aksi -------------------------------------------------------------- */
const to = (table, status) => (_ctx, d) => setStatus(table, d.id, status);

export const ACTIONS = {
  journals: {
    submit: submitJournal,
    approve: (ctx, j) => postExistingJournal(ctx, j.id),
    reject: (_ctx, j, p) => setStatus('journals', j.id, 'ditolak', { reference: `Ditolak: ${p.reason}`.slice(0, 60) }),
    reverse: (ctx, j, p) => { const id = reverseJournal(ctx, j.id, p.date); return { redirect: { entity: 'journals', id }, message: 'Jurnal pembalik diposting.' }; },
  },
  cash_transactions: { post: postCash, void: voidSimple('cash_transactions', 'transaksi kas') },
  bank_transfers: { post: postTransfer, void: voidSimple('bank_transfers', 'transfer') },
  fiscal_periods: { close: to('fiscal_periods', 'tutup'), reopen: to('fiscal_periods', 'terbuka'), close_year: closeYear },
  sales_returns: { post: postSalesReturn, void: voidSalesReturn },
  purchase_returns: { post: postPurchaseReturn, void: voidPurchaseReturn },
  bank_reconciliations: { finalize: finalizeRecon },
  pos_shifts: { close: closeShift },
  fixed_assets: { activate: activateAsset, dispose: disposeAsset },
  depreciation_runs: { post: postDepreciation, void: voidDepreciation },
  maintenance_orders: { start: to('maintenance_orders', 'berjalan'), complete: completeMaintenance, cancel: to('maintenance_orders', 'batal') },

  quotations: {
    send: to('quotations', 'terkirim'), accept: to('quotations', 'diterima'), reject: to('quotations', 'ditolak'),
    to_order: (ctx, q) => {
      const wh = db.get("SELECT id FROM warehouses WHERE branch_id = ? AND status = 'aktif' ORDER BY id LIMIT 1", q.branch_id) || db.get("SELECT id FROM warehouses WHERE company_id = ? ORDER BY id LIMIT 1", q.company_id);
      if (!wh) throw bad('Belum ada gudang di perusahaan ini.');
      const { id, number } = createDoc(ctx, 'sales_orders', 'SO', {
        company_id: q.company_id, branch_id: q.branch_id, date: today(), customer_id: q.customer_id, warehouse_id: wh.id, quotation_id: q.id, ...fxCopy(q),
        subtotal: q.subtotal, tax_rate: q.tax_rate, tax: q.tax, total: q.total, status: 'draf', notes: `Dari penawaran ${q.number}`,
      }, tradeCopy(lines('quotation_lines', q.id)), 'sales_order_lines');
      return { redirect: { entity: 'sales_orders', id }, message: `Pesanan ${number} dibuat.` };
    },
  },
  sales_orders: {
    submit: (_ctx, so) => {
      needLines(lines('sales_order_lines', so.id), 'pesanan');
      const c = db.get('SELECT * FROM customers WHERE id = ?', so.customer_id);
      const open = db.get("SELECT COALESCE(SUM(total - paid),0) v FROM sales_invoices WHERE customer_id = ? AND status IN ('terbit','sebagian')", c.id).v;
      const over = c.credit_limit > 0 && open + so.total > c.credit_limit;
      const reason = c.status === 'ditahan' ? 'Pelanggan berstatus ditahan' : over ? `Melebihi plafon kredit (terbuka ${Math.round(open).toLocaleString('id-ID')} + pesanan ${Math.round(so.total).toLocaleString('id-ID')} > plafon ${Math.round(c.credit_limit).toLocaleString('id-ID')})` : null;
      setStatus('sales_orders', so.id, reason ? 'menunggu' : 'disetujui', { approval_note: reason || 'Dalam plafon kredit — disetujui otomatis' });
      return { message: reason ? `Butuh persetujuan: ${reason}.` : 'Pesanan disetujui otomatis (dalam plafon).' };
    },
    approve: (_c, so) => setStatus('sales_orders', so.id, 'disetujui'),
    reject: (_c, so, p) => setStatus('sales_orders', so.id, 'batal', { approval_note: `Ditolak: ${p.reason}` }),
    cancel: to('sales_orders', 'batal'),
    to_invoice: (ctx, so) => {
      const { id, number } = createDoc(ctx, 'sales_invoices', 'INV', {
        company_id: so.company_id, branch_id: so.branch_id, date: today(), customer_id: so.customer_id, warehouse_id: so.warehouse_id, sales_order_id: so.id, ...fxCopy(so),
        subtotal: so.subtotal, tax_rate: so.tax_rate, tax: so.tax, total: so.total, paid: 0, status: 'draf',
      }, tradeCopy(lines('sales_order_lines', so.id)), 'sales_invoice_lines');
      const c = db.get('SELECT terms_days FROM customers WHERE id = ?', so.customer_id);
      const d = new Date(today() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + (c?.terms_days ?? 30));
      db.update('sales_invoices', id, { due_date: d.toISOString().slice(0, 10) });
      setStatus('sales_orders', so.id, 'selesai');
      return { redirect: { entity: 'sales_invoices', id }, message: `Faktur ${number} dibuat (draf). Terbitkan untuk memposting.` };
    },
  },
  sales_invoices: { post: postSalesInvoice, void: voidSalesInvoice },
  customer_receipts: { post: postReceipt, void: voidReceipt },
  pos_sales: { pay: postPos, void: voidPos },

  purchase_requests: {
    submit: (_c, pr) => { needLines(lines('purchase_request_lines', pr.id), 'permintaan'); setStatus('purchase_requests', pr.id, 'menunggu'); },
    approve: to('purchase_requests', 'disetujui'),
    reject: (_c, pr, p) => setStatus('purchase_requests', pr.id, 'ditolak', { notes: `${pr.notes || ''}\nDitolak: ${p.reason}`.trim() }),
    to_po: (ctx, pr, p) => {
      const ls = lines('purchase_request_lines', pr.id).map((l) => ({ product_id: l.product_id, description: l.description, qty: l.qty, price: l.price, discount_pct: 0, amount: l.amount }));
      const subtotal = sum(ls, (l) => l.amount), tax = round2(subtotal * 0.11);
      const { id, number } = createDoc(ctx, 'purchase_orders', 'PO', {
        company_id: pr.company_id, branch_id: pr.branch_id, date: today(), supplier_id: p.supplier_id, warehouse_id: p.warehouse_id, purchase_request_id: pr.id,
        buyer: ctx.user.full_name, subtotal, tax_rate: 11, tax, total: round2(subtotal + tax), status: 'draf',
      }, ls, 'purchase_order_lines');
      setStatus('purchase_requests', pr.id, 'selesai');
      return { redirect: { entity: 'purchase_orders', id }, message: `PO ${number} dibuat.` };
    },
  },
  rfqs: {
    open: (_c, r) => { if (lines('rfq_lines', r.id).length < 2) throw bad('RFQ memerlukan penawaran dari minimal 2 pemasok.'); setStatus('rfqs', r.id, 'terbuka'); },
    award: (_c, r) => {
      const ls = lines('rfq_lines', r.id);
      if (ls.length < 2) throw bad('RFQ memerlukan penawaran dari minimal 2 pemasok.');
      const best = ls.reduce((a, b) => (b.amount < a.amount ? b : a));
      setStatus('rfqs', r.id, 'selesai', { awarded_supplier_id: best.supplier_id, best_price: best.amount });
    },
    cancel: to('rfqs', 'batal'),
  },
  purchase_orders: {
    submit: (_c, po) => {
      needLines(lines('purchase_order_lines', po.id), 'PO');
      const need = po.total > approvalPolicy().poThreshold;
      setStatus('purchase_orders', po.id, need ? 'menunggu' : 'disetujui');
      return { message: need ? 'PO di atas ambang — menunggu persetujuan manajer.' : 'PO disetujui otomatis.' };
    },
    approve: to('purchase_orders', 'disetujui'),
    reject: (_c, po, p) => setStatus('purchase_orders', po.id, 'batal', { notes: `${po.notes || ''}\nDitolak: ${p.reason}`.trim() }),
    cancel: to('purchase_orders', 'batal'),
    to_bill: (ctx, po, p) => {
      const { id, number } = createDoc(ctx, 'purchase_bills', 'BILL', {
        company_id: po.company_id, branch_id: po.branch_id, date: today(), supplier_id: po.supplier_id, warehouse_id: po.warehouse_id, purchase_order_id: po.id, ...fxCopy(po),
        supplier_invoice_no: p.supplier_invoice_no, subtotal: po.subtotal, tax_rate: po.tax_rate, tax: po.tax, total: po.total, paid: 0, status: 'draf',
      }, tradeCopy(lines('purchase_order_lines', po.id)), 'purchase_bill_lines');
      const s = db.get('SELECT terms_days FROM suppliers WHERE id = ?', po.supplier_id);
      const d = new Date(today() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + (s?.terms_days ?? 30));
      db.update('purchase_bills', id, { due_date: d.toISOString().slice(0, 10) });
      return { redirect: { entity: 'purchase_bills', id }, message: `Tagihan ${number} dibuat (draf). Posting untuk menerima stok & mencatat hutang.` };
    },
  },
  purchase_bills: { post: postBill, void: voidBill },
  supplier_payments: {
    submit: (_c, p) => {
      needLines(lines('supplier_payment_lines', p.id), 'pembayaran');
      setStatus('supplier_payments', p.id, 'menunggu');
    },
    post: postPayment, void: voidPayment,
  },
  stock_adjustments: { post: postAdjustment },
  stock_transfers: { post: postStockTransfer },
  work_orders: { start: to('work_orders', 'berjalan'), to_qc: (_c, w) => setStatus('work_orders', w.id, 'qc', { progress: 100 }), complete: completeWorkOrder, cancel: to('work_orders', 'batal') },
  payroll_runs: { generate: generatePayroll, approve: to('payroll_runs', 'disetujui'), post: postPayroll, pay: payPayroll },
  leave_requests: { approve: to('leave_requests', 'disetujui'), reject: to('leave_requests', 'ditolak') },
  leads: {
    convert: (ctx, lead) => {
      let cust = lead.customer_id ? db.get('SELECT * FROM customers WHERE id = ?', lead.customer_id) : db.get('SELECT * FROM customers WHERE company_id = ? AND name = ?', lead.company_id, lead.company_name);
      if (!cust) {
        const code = nextNumber('CUS', lead.company_id, today()).replace(/^CUS-\d{4}-/, 'C');
        const cid = db.insert('customers', { company_id: lead.company_id, code, name: lead.company_name, segment: 'Korporasi', pic: lead.contact, email: lead.email, phone: lead.phone, credit_limit: 0, terms_days: 30, status: 'aktif', created_at: nowIso(), created_by: ctx.user.id });
        cust = { id: cid };
      }
      const subtotal = round2(lead.value || 0), tax = round2(subtotal * 0.11);
      const { id, number } = createDoc(ctx, 'quotations', 'QT', {
        company_id: lead.company_id, branch_id: lead.branch_id, date: today(), customer_id: cust.id, lead_id: lead.id, subtotal, tax_rate: 11, tax, total: round2(subtotal + tax), status: 'draf', notes: lead.title,
      }, [], 'quotation_lines');
      db.update('leads', lead.id, { customer_id: cust.id });
      return { redirect: { entity: 'quotations', id }, message: `Penawaran ${number} dibuat. Lengkapi baris barangnya.` };
    },
  },
  users: {
    reset_password: (ctx, u, _p, hash) => {
      db.run('UPDATE users SET password_hash = ?, must_change_password = 1, password_changed_at = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?', hash, nowIso(), u.id);
      db.run('INSERT INTO password_history(user_id, hash, created_at) VALUES (?, ?, ?)', u.id, hash, nowIso());
      db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', nowIso(), u.id);
      return { message: 'Sandi sementara ditetapkan; pengguna wajib menggantinya saat masuk.' };
    },
    unlock: (_c, u) => db.run("UPDATE users SET status = 'aktif', failed_attempts = 0, locked_until = NULL WHERE id = ?", u.id),
    reset_mfa: (_c, u) => db.run('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, mfa_last_step = NULL WHERE id = ?', u.id),
    revoke_sessions: (_c, u) => { db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', nowIso(), u.id); return { message: 'Seluruh sesi pengguna dicabut.' }; },
  },
};
