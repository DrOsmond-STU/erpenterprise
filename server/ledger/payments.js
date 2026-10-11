/* ==========================================================================
   Pembayaran bertahap: jadwal angsuran per faktur/tagihan dari termin
   pembayaran, alokasi pembayaran ke angsuran (FIFO), saldo uang muka
   pelanggan/pemasok, dan jadwal angsuran untuk umur piutang/hutang.
   ========================================================================== */
import * as db from '../db.js';
import { acct } from './posting.js';
import { bad, round2, today } from '../lib/util.js';

export const DOC = { sales_invoices: 'customer', purchase_bills: 'supplier' };
const addDays = (date, n) => { const x = new Date(date + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** Tahap termin (label, %, hari) — kosong bila termin tidak ada/aktif. */
export function termStages(termId) {
  if (!termId) return [];
  return db.all('SELECT label, pct, days FROM payment_term_lines WHERE parent_id = ? ORDER BY line_no, id', termId);
}

/** Tanggal jatuh tempo akhir dokumen menurut termin bertahap (null bila tanpa termin). */
export function termDueDate(termId, date) {
  const st = termStages(termId);
  if (!st.length || !date) return null;
  return addDays(date, Math.max(...st.map((s) => Number(s.days) || 0)));
}

/** Validasi termin: total persentase 100%, setiap tahap > 0%. */
export function validateTerm(lines) {
  if (!lines) return;
  if (!lines.length) throw bad('Termin memerlukan minimal satu tahap.');
  if (lines.some((l) => !(Number(l.pct) > 0))) throw bad('Persentase setiap tahap harus lebih dari 0%.');
  const tot = round2(lines.reduce((s, l) => s + Number(l.pct), 0));
  if (Math.abs(tot - 100) > 0.001) throw bad(`Jumlah persentase termin harus 100% (sekarang ${tot}%).`);
}

/** Bentuk angsuran saat faktur/tagihan diposting. Tanpa termin = satu angsuran pada jatuh tempo dokumen. */
export function createInstallments(docType, doc) {
  db.run('DELETE FROM installments WHERE doc_type = ? AND doc_id = ?', docType, doc.id);
  const st = termStages(doc.payment_term_id);
  const total = round2(doc.total);
  const rows = st.length
    ? st.map((s, i) => ({ seq: i + 1, label: s.label, due_date: addDays(doc.date, Number(s.days) || 0), amount: round2(total * Number(s.pct) / 100) }))
    : [{ seq: 1, label: 'Pelunasan', due_date: doc.due_date || doc.date, amount: total }];
  const diff = round2(total - rows.reduce((s, r) => s + r.amount, 0));
  rows[rows.length - 1].amount = round2(rows[rows.length - 1].amount + diff);
  for (const r of rows) db.insert('installments', { company_id: doc.company_id, doc_type: docType, doc_id: doc.id, ...r, paid: 0 });
  syncInstallments(docType, doc.id);
}

/** Alokasikan total terbayar dokumen ke angsuran berurutan (angsuran tertua lunas lebih dulu). */
export function syncInstallments(docType, docId) {
  const doc = db.get(`SELECT id, company_id, date, due_date, total, paid FROM "${docType}" WHERE id = ?`, docId);
  if (!doc) return;
  let rows = db.all('SELECT id, amount FROM installments WHERE doc_type = ? AND doc_id = ? ORDER BY seq', docType, docId);
  if (!rows.length) {
    // Dokumen lama (sebelum fitur angsuran): satu angsuran pada jatuh tempo.
    db.insert('installments', { company_id: doc.company_id, doc_type: docType, doc_id: doc.id, seq: 1, label: 'Pelunasan', due_date: doc.due_date || doc.date, amount: round2(doc.total), paid: 0 });
    rows = db.all('SELECT id, amount FROM installments WHERE doc_type = ? AND doc_id = ? ORDER BY seq', docType, docId);
  }
  let left = round2(doc.paid || 0);
  for (const r of rows) {
    const p = round2(Math.max(0, Math.min(r.amount, left)));
    db.run('UPDATE installments SET paid = ? WHERE id = ?', p, r.id);
    left = round2(left - p);
  }
}

export const deleteInstallments = (docType, docId) => db.run('DELETE FROM installments WHERE doc_type = ? AND doc_id = ?', docType, docId);

/** Jadwal angsuran dokumen + status tiap angsuran per tanggal. */
export function installmentsOf(docType, docId, asOf = today()) {
  return db.all('SELECT seq, label, due_date, amount, paid FROM installments WHERE doc_type = ? AND doc_id = ? ORDER BY seq', docType, docId).map((r) => {
    const open = round2(r.amount - r.paid);
    return { ...r, open, status: open <= 0.005 ? 'lunas' : r.paid > 0.005 ? (r.due_date < asOf ? 'terlambat' : 'sebagian') : r.due_date < asOf ? 'terlambat' : 'belum' };
  });
}

/** Saldo uang muka mitra (IDR) dari buku besar: pelanggan = saldo kredit akun uang muka pelanggan; pemasok = saldo debit uang muka pembelian. */
export function advanceBalance(partyType, partyId, companyId = null) {
  const account = acct(partyType === 'customer' ? 'customer_advance' : 'supplier_advance');
  const cf = companyId ? ' AND jl.company_id = ?' : '';
  const v = db.get(`SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id
    WHERE j.status = 'diposting' AND jl.account_id = ? AND jl.partner_type = ? AND jl.partner_id = ?${cf}`, account, partyType, partyId, ...(companyId ? [companyId] : [])).v;
  return round2(partyType === 'customer' ? -v : v);
}

/** Jadwal angsuran terbuka (piutang/hutang) untuk perencanaan arus kas & penagihan. */
export function installmentSchedule(ctx, { companyId, branchId, asOf, side = 'ar', days = 60 }) {
  const t = asOf || today();
  const docTypes = side === 'ap' ? ['purchase_bills', 'supplier_credit_notes', 'purchase_advances'] : ['sales_invoices', 'customer_debit_notes', 'sales_advances'];
  const party = side === 'ap' ? ['suppliers', 'supplier_id'] : ['customers', 'customer_id'];
  const until = addDays(t, Math.max(1, Math.min(365, Number(days) || 60)));
  const bf = branchId ? ' AND d.branch_id = ?' : '';
  const rows = docTypes.flatMap((docType) => db.all(`SELECT i.doc_id, i.doc_type entity, i.seq, i.label, i.due_date, i.amount, i.paid, ROUND(i.amount - i.paid, 2) open, d.number, d.date, d.total, d.status doc_status,
      COALESCE(d.exchange_rate,1) rate, p.name party, p.id party_id, (SELECT COUNT(*) FROM installments x WHERE x.doc_type = i.doc_type AND x.doc_id = i.doc_id) stages
    FROM installments i JOIN "${docType}" d ON d.id = i.doc_id JOIN "${party[0]}" p ON p.id = d."${party[1]}"
    WHERE i.doc_type = ? AND d.company_id = ? AND d.status IN ('terbit','sebagian') AND i.amount - i.paid > 0.005 AND i.due_date <= ?${bf}`, docType, companyId, until, ...(branchId ? [branchId] : [])))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.number.localeCompare(b.number) || a.seq - b.seq);
  for (const r of rows) {
    r.openIdr = round2(r.open * r.rate);
    r.amountIdr = round2(r.amount * r.rate);
    r.paidIdr = round2(r.paid * r.rate);
    r.overdueDays = Math.max(0, Math.round((Date.parse(t) - Date.parse(r.due_date)) / 864e5));
    r.status = r.due_date < t ? 'terlambat' : r.paid > 0.005 ? 'sebagian' : 'belum';
  }
  const sumBy = (xs) => round2(xs.reduce((s, r) => s + r.openIdr, 0));
  // Saldo uang muka per mitra (belum dipakai).
  const advAcct = acct(side === 'ap' ? 'supplier_advance' : 'customer_advance');
  const ptype = side === 'ap' ? 'supplier' : 'customer';
  const advances = db.all(`SELECT jl.partner_id id, p.name party, ROUND(SUM(jl.debit - jl.credit),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN "${party[0]}" p ON p.id = jl.partner_id
    WHERE j.status = 'diposting' AND jl.company_id = ? AND jl.account_id = ? AND jl.partner_type = ? GROUP BY jl.partner_id HAVING ABS(v) > 0.004 ORDER BY p.name`, companyId, advAcct, ptype)
    .map((a) => ({ id: a.id, party: a.party, balance: round2(side === 'ap' ? a.v : -a.v) }));
  return {
    title: side === 'ap' ? 'Jadwal Angsuran Hutang' : 'Jadwal Angsuran Piutang', side, asOf: t, until,
    rows,
    totals: { overdue: sumBy(rows.filter((r) => r.due_date < t)), next7: sumBy(rows.filter((r) => r.due_date >= t && r.due_date <= addDays(t, 7))), next30: sumBy(rows.filter((r) => r.due_date >= t && r.due_date <= addDays(t, 30))), all: sumBy(rows), staged: new Set(rows.filter((r) => r.stages > 1).map((r) => r.doc_id)).size },
    advances, advanceTotal: round2(advances.reduce((s, a) => s + a.balance, 0)),
  };
}

/* --- Register giro mundur ------------------------------------------------------- */
/**
 * Giro masuk (dari pelanggan) / keluar (ke pemasok): belum cair, cair, ditolak.
 * Saldo giro belum cair direkonsiliasi dengan akun 1-1250 (masuk) / 2-1150 (keluar).
 */
export function giroRegister(ctx, { companyId, branchId, asOf, side = 'in', from = null }) {
  const t = asOf || today();
  const incoming = side !== 'out';
  const table = incoming ? 'customer_receipts' : 'supplier_payments';
  const party = incoming ? ['customers', 'customer_id'] : ['suppliers', 'supplier_id'];
  const since = from || addDays(t, -90);
  const bf = branchId ? ' AND d.branch_id = ?' : '';
  const rows = db.all(`SELECT d.id, d.number, d.date, d.giro_no, d.giro_bank, d.giro_due, d.giro_status, d.giro_cleared, d.total amount, d.status, p.name party, b.name bank
    FROM "${table}" d JOIN "${party[0]}" p ON p.id = d."${party[1]}" LEFT JOIN bank_accounts b ON b.id = d.bank_account_id
    WHERE d.company_id = ? AND d.method = 'giro' AND d.giro_status IS NOT NULL AND d.giro_status <> ''
      AND (d.giro_status = 'beredar' OR COALESCE(d.giro_cleared, d.date) >= ?)${bf}
    ORDER BY CASE d.giro_status WHEN 'beredar' THEN 0 ELSE 1 END, d.giro_due, d.number`, companyId, since, ...(branchId ? [branchId] : []));
  for (const r of rows) {
    r.daysToDue = Math.round((Date.parse(r.giro_due) - Date.parse(t)) / 864e5);
    r.state = r.giro_status !== 'beredar' ? r.giro_status : r.daysToDue < 0 ? 'lewat' : r.daysToDue <= 7 ? 'segera' : 'beredar';
  }
  const open = rows.filter((r) => r.giro_status === 'beredar');
  const sumBy = (xs) => round2(xs.reduce((s, r) => s + r.amount, 0));
  const account = acct(incoming ? 'giro_receivable' : 'giro_payable');
  const glRaw = db.get(`SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status = 'diposting' AND jl.company_id = ? AND jl.account_id = ?`, companyId, account).v;
  const glBalance = round2(incoming ? glRaw : -glRaw);
  const openAll = branchId ? round2(db.get(`SELECT COALESCE(SUM(total),0) v FROM "${table}" WHERE company_id = ? AND method = 'giro' AND giro_status = 'beredar'`, companyId).v) : sumBy(open);
  return {
    title: incoming ? 'Register Giro Masuk' : 'Register Giro Keluar', side: incoming ? 'in' : 'out', asOf: t, since,
    rows,
    totals: {
      open: sumBy(open), openCount: open.length, due7: sumBy(open.filter((r) => r.daysToDue >= 0 && r.daysToDue <= 7)), overdue: sumBy(open.filter((r) => r.daysToDue < 0)),
      cleared: sumBy(rows.filter((r) => r.giro_status === 'cair')), bounced: sumBy(rows.filter((r) => r.giro_status === 'tolak')), bouncedCount: rows.filter((r) => r.giro_status === 'tolak').length,
    },
    glBalance, reconciled: Math.abs(glBalance - openAll) < 1,
  };
}

/* --- Faktur uang muka (penjualan/pembelian atas SO/PO) ---------------------------- */
export const ADVANCE = {
  sales_advances: { party: 'customer_id', order: 'sales_order_id', orderTable: 'sales_orders', docTable: 'sales_invoices', ar: true },
  purchase_advances: { party: 'supplier_id', order: 'purchase_order_id', orderTable: 'purchase_orders', docTable: 'purchase_bills', ar: false },
};
export const advanceOf = (docTable) => (docTable === 'sales_invoices' ? 'sales_advances' : 'purchase_advances');

/**
 * Potongan uang muka pada faktur/tagihan akhir: DPP dokumen dikurangi DPP uang muka, PPN dihitung
 * atas sisa DPP. Hanya uang muka lunas milik mitra yang sama dan dokumen IDR. Mengubah row (tax, total).
 */
export function applyAdvanceDeduction(row, docTable) {
  const advTable = advanceOf(docTable), cfg = ADVANCE[advTable];
  const rate = Number(row.tax_rate ?? 11) || 0;
  if (!row.advance_id) row.advance_amount = 0;
  else {
    const a = db.get(`SELECT * FROM "${advTable}" WHERE id = ?`, row.advance_id);
    if (!a || a[cfg.party] !== row[cfg.party]) throw bad('Uang muka yang dipotong bukan milik mitra dokumen ini.');
    if (a.status !== 'lunas') throw bad(`Uang muka ${a.number} belum lunas atau sudah habis dipotongkan — hanya uang muka yang sudah dibayar yang dapat dipotong.`);
    if ((Number(row.exchange_rate) || 1) !== 1) throw bad('Potongan uang muka hanya untuk dokumen IDR.');
    const rem = round2(a.amount - (a.applied || 0));
    const sub = round2(row.subtotal || 0);
    if (row.advance_amount == null || row.advance_amount === '' || Number(row.advance_amount) === 0) row.advance_amount = Math.min(rem, sub);
    row.advance_amount = round2(row.advance_amount);
    if (row.advance_amount > rem + 0.005) throw bad(`Potongan melebihi sisa uang muka ${a.number} (${rem.toLocaleString('id-ID')}).`);
    if (row.advance_amount > sub + 0.005) throw bad('Potongan uang muka melebihi DPP dokumen.');
    if (!(row.advance_amount > 0)) { row.advance_id = null; row.advance_amount = 0; }
  }
  const dpp = round2((row.subtotal || 0) - (row.advance_amount || 0));
  row.tax = round2(dpp * rate / 100);
  row.total = round2(dpp + row.tax);
}

/** Usulan potongan uang muka untuk faktur/tagihan dari pesanan: uang muka lunas tertua, proporsional DPP (sisa penuh bila pesanan habis ditagih). */
export function proposeAdvance(advTable, orderId, subtotal, finalBilling) {
  const cfg = ADVANCE[advTable];
  const a = db.get(`SELECT * FROM "${advTable}" WHERE ${cfg.order} = ? AND status = 'lunas' AND amount - COALESCE(applied,0) > 0.005 ORDER BY date, id LIMIT 1`, orderId);
  if (!a) return {};
  const o = db.get(`SELECT subtotal FROM "${cfg.orderTable}" WHERE id = ?`, orderId);
  const rem = round2(a.amount - (a.applied || 0));
  const prop = o?.subtotal > 0 ? round2(subtotal * a.amount / o.subtotal) : rem;
  return { advance_id: a.id, advance_amount: round2(Math.min(rem, subtotal, finalBilling ? rem : prop)) };
}

/**
 * Register uang muka penjualan / pembelian: belum dibayar, siap dipotong, sudah dipotong.
 * Sisa DPP belum dipotong (uang muka terposting) direkonsiliasi dengan akun 2-1610 / 1-1520.
 */
export function advanceRegister(ctx, { companyId, branchId, side = 'ar' }) {
  const ar = side !== 'ap';
  const table = ar ? 'sales_advances' : 'purchase_advances', cfg = ADVANCE[table];
  const bf = branchId ? ' AND d.branch_id = ?' : '';
  const rows = db.all(`SELECT d.id, d.number, d.date, d.due_date, d.status, d.amount, d.tax, d.total, d.paid, COALESCE(d.applied,0) applied, ROUND(d.amount - COALESCE(d.applied,0),2) remaining,
      p.name party, o.id order_id, o.number order_no, o.subtotal order_dpp, b.name branch
    FROM "${table}" d JOIN "${ar ? 'customers' : 'suppliers'}" p ON p.id = d."${cfg.party}" JOIN "${cfg.orderTable}" o ON o.id = d."${cfg.order}" JOIN branches b ON b.id = d.branch_id
    WHERE d.company_id = ? AND d.status IN ('terbit','sebagian','lunas','diterapkan')${bf}
    ORDER BY CASE d.status WHEN 'diterapkan' THEN 2 WHEN 'lunas' THEN 1 ELSE 0 END, d.date DESC, d.number`, companyId, ...(branchId ? [branchId] : []));
  for (const r of rows) r.pct = r.order_dpp > 0 ? round2(r.amount * 100 / r.order_dpp) : null;
  const sumBy = (xs, f) => round2(xs.reduce((s, r) => s + f(r), 0));
  const unpaid = rows.filter((r) => ['terbit', 'sebagian'].includes(r.status));
  const glRaw = db.get(`SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status = 'diposting' AND jl.company_id = ? AND jl.account_id = ?`, companyId, acct(ar ? 'sales_dp' : 'purchase_dp')).v;
  const glBalance = round2(ar ? -glRaw : glRaw);
  const remainingAll = branchId
    ? round2(db.get(`SELECT COALESCE(SUM(amount - COALESCE(applied,0)),0) v FROM "${table}" WHERE company_id = ? AND status IN ('terbit','sebagian','lunas','diterapkan')`, companyId).v)
    : sumBy(rows, (r) => r.remaining);
  return {
    title: ar ? 'Register Uang Muka Penjualan' : 'Register Uang Muka Pembelian', side: ar ? 'ar' : 'ap',
    rows,
    totals: {
      unpaid: sumBy(unpaid, (r) => r.total - r.paid), unpaidCount: unpaid.length,
      ready: sumBy(rows.filter((r) => r.status === 'lunas'), (r) => r.remaining), readyCount: rows.filter((r) => r.status === 'lunas').length,
      remaining: sumBy(rows, (r) => r.remaining), applied: sumBy(rows, (r) => r.applied),
    },
    glBalance, reconciled: Math.abs(glBalance - remainingAll) < 1,
  };
}

/**
 * Register deposit pelanggan (liabilitas 2-1620/2-1630) atau deposit di pemasok (aset 1-1530/1-1540):
 * saldo per deposit, jaminan yang jatuh tempo dikembalikan ≤ 30 hari, direkonsiliasi dengan buku besar.
 */
export function depositRegister(ctx, { companyId, branchId, asOf, side = 'ar' }) {
  const ar = side !== 'ap';
  const t = asOf || today();
  const table = ar ? 'customer_deposits' : 'supplier_deposits';
  const [partyTable, partyField] = ar ? ['customers', 'customer_id'] : ['suppliers', 'supplier_id'];
  const live = ar ? "('diterima','terpakai','habis')" : "('dibayar','terpakai','habis')";
  const bf = branchId ? ' AND d.branch_id = ?' : '';
  const rows = db.all(`SELECT d.id, d.number, d.date, d.kind, d.reference, d.return_date, d.status, d.amount, COALESCE(d.used,0) used, COALESCE(d.refunded,0) refunded, COALESCE(d.forfeited,0) forfeited,
      ROUND(d.amount - COALESCE(d.used,0) - COALESCE(d.refunded,0) - COALESCE(d.forfeited,0),2) remaining, p.name party, p.id party_id, b.name branch
    FROM "${table}" d JOIN "${partyTable}" p ON p.id = d."${partyField}" JOIN branches b ON b.id = d.branch_id
    WHERE d.company_id = ? AND d.status IN ${live}${bf}
    ORDER BY CASE d.status WHEN 'habis' THEN 1 ELSE 0 END, d.kind, d.date DESC, d.number`, companyId, ...(branchId ? [branchId] : []));
  for (const r of rows) r.daysToReturn = r.return_date ? Math.round((Date.parse(r.return_date) - Date.parse(t)) / 864e5) : null;
  const open = rows.filter((r) => r.remaining > 0.005);
  const sumBy = (xs) => round2(xs.reduce((s2, r) => s2 + r.remaining, 0));
  const sign = ar ? -1 : 1; // liabilitas bersaldo kredit, aset bersaldo debit
  const gl = (code) => round2(sign * db.get(`SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status = 'diposting' AND jl.company_id = ? AND jl.account_id = ?`, companyId, acct(code)).v);
  const all = (kind) => round2(db.get(`SELECT COALESCE(SUM(amount - COALESCE(used,0) - COALESCE(refunded,0) - COALESCE(forfeited,0)),0) v FROM "${table}" WHERE company_id = ? AND kind = ? AND status IN ${live}`, companyId, kind).v);
  const glSaldo = gl(ar ? 'deposit_saldo' : 'sdeposit_saldo'), glJaminan = gl(ar ? 'deposit_guarantee' : 'sdeposit_guarantee');
  const dueSoon = open.filter((r) => r.kind === 'jaminan' && r.daysToReturn != null && r.daysToReturn <= 30);
  return {
    title: ar ? 'Register Deposit Pelanggan' : 'Register Deposit di Pemasok', side: ar ? 'ar' : 'ap', asOf: t,
    accounts: ar ? ['2-1620', '2-1630'] : ['1-1530', '1-1540'],
    rows,
    totals: {
      saldo: sumBy(open.filter((r) => r.kind === 'saldo')), jaminan: sumBy(open.filter((r) => r.kind === 'jaminan')),
      dueSoon: sumBy(dueSoon), dueSoonCount: dueSoon.length, parties: new Set(open.map((r) => r.party_id)).size,
      used: round2(rows.reduce((s2, r) => s2 + r.used, 0)), refunded: round2(rows.reduce((s2, r) => s2 + r.refunded, 0)), forfeited: round2(rows.reduce((s2, r) => s2 + r.forfeited, 0)),
    },
    glSaldo, glJaminan, reconciled: Math.abs(glSaldo - all('saldo')) < 1 && Math.abs(glJaminan - all('jaminan')) < 1,
  };
}
