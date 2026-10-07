/* ==========================================================================
   Pemenuhan pesanan penjualan: pesanan terbuka (dipesan → dikirim →
   difakturkan) dan surat jalan yang belum difakturkan. Nilai pokok surat
   jalan belum difakturkan direkonsiliasi dengan akun "Persediaan Terkirim
   Belum Difakturkan" di buku besar.
   ========================================================================== */
import * as db from '../db.js';
import { acct } from './posting.js';
import { round2, today } from '../lib/util.js';

const days = (from, to) => Math.max(0, Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5));

export function fulfillmentReport(ctx, { companyId, branchId, asOf }) {
  const t = asOf || today();
  const bf = branchId ? ' AND so.branch_id = ?' : '';
  const bp = branchId ? [branchId] : [];
  const orderLines = db.all(`SELECT so.id so_id, so.number, so.date, so.status, so.delivery_date, c.name customer, p.code, p.name product, sl.id line_id, sl.qty ordered, sl.price, sl.discount_pct,
      ROUND(COALESCE(so.exchange_rate,1), 6) rate,
      (SELECT COALESCE(SUM(dl.qty),0) FROM delivery_order_lines dl JOIN delivery_orders d ON d.id = dl.parent_id WHERE dl.so_line_id = sl.id AND d.status IN ('dikirim','difakturkan')) delivered,
      (SELECT COALESCE(SUM(dl.qty),0) FROM delivery_order_lines dl JOIN delivery_orders d ON d.id = dl.parent_id WHERE dl.so_line_id = sl.id AND d.status = 'difakturkan') invoiced
    FROM sales_orders so JOIN sales_order_lines sl ON sl.parent_id = so.id JOIN customers c ON c.id = so.customer_id JOIN products p ON p.id = sl.product_id
    WHERE so.company_id = ? AND so.status IN ('disetujui','dikirim_sebagian','terkirim')${bf} ORDER BY so.date, so.number, sl.line_no`, companyId, ...bp);
  for (const l of orderLines) {
    l.toDeliver = round2(l.ordered - l.delivered);
    l.toInvoice = round2(l.delivered - l.invoiced);
    const net = l.price * (1 - (l.discount_pct || 0) / 100) * l.rate;
    l.backlogValue = round2(l.toDeliver * net);
    l.late = !!(l.delivery_date && l.delivery_date < t && l.toDeliver > 1e-9);
  }
  const dbf = branchId ? ' AND d.branch_id = ?' : '';
  const unbilled = db.all(`SELECT d.id, d.number, d.date, d.value, d.cost, d.invoice_id, so.number so_number, ROUND(COALESCE(so.exchange_rate,1),6) rate, c.name customer, w.name warehouse, i.number invoice_number
    FROM delivery_orders d JOIN sales_orders so ON so.id = d.sales_order_id JOIN customers c ON c.id = d.customer_id JOIN warehouses w ON w.id = d.warehouse_id LEFT JOIN sales_invoices i ON i.id = d.invoice_id
    WHERE d.company_id = ? AND d.status = 'dikirim'${dbf} ORDER BY d.date, d.number`, companyId, ...bp);
  for (const d of unbilled) { d.age = days(d.date, t); d.valueIdr = round2(d.value * d.rate); }
  // Akun barang terkirim dicatat di cabang gudang; untuk tampilan per cabang gunakan cabang gudang surat jalan.
  const glBranch = branchId ? ' AND jl.branch_id = ?' : '';
  const gl = db.get(`SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status = 'diposting' AND jl.company_id = ? AND jl.account_id = ?${glBranch}`, companyId, acct('goods_delivered'), ...bp).v;
  const unbilledCostGl = branchId
    ? round2(db.get(`SELECT COALESCE(SUM(d.cost),0) v FROM delivery_orders d JOIN warehouses w ON w.id = d.warehouse_id WHERE d.company_id = ? AND d.status = 'dikirim' AND w.branch_id = ?`, companyId, branchId).v)
    : round2(unbilled.reduce((s, d) => s + (d.cost || 0), 0));
  const sumBy = (xs, k) => round2(xs.reduce((s, x) => s + (x[k] || 0), 0));
  return {
    title: 'Pemenuhan Pesanan & Surat Jalan Belum Difakturkan', asOf: t,
    orders: orderLines,
    unbilled,
    totals: {
      openOrders: new Set(orderLines.map((l) => l.so_id)).size,
      backlogValue: sumBy(orderLines, 'backlogValue'),
      lateLines: orderLines.filter((l) => l.late).length,
      unbilledCount: unbilled.length, unbilledValue: sumBy(unbilled, 'valueIdr'), unbilledCost: sumBy(unbilled, 'cost'),
      draftInvoiced: unbilled.filter((d) => d.invoice_id).length,
      over30: unbilled.filter((d) => d.age > 30).length,
    },
    glBalance: gl, reconciled: Math.abs(gl - unbilledCostGl) < 1,
  };
}
