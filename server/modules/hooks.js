/* Kait (hook) per entitas: perhitungan total dokumen, aturan bisnis
   sebelum simpan, dan perlakuan khusus akun pengguna. */
import * as db from '../db.js';
import { round2, sum, bad, forbidden, conflict } from '../lib/util.js';
import { checkPasswordPolicy, setPassword } from '../security/auth.js';
import { hashPassword } from '../security/crypto.js';
import { clearPermCache, can, LEVEL } from '../security/rbac.js';
import { clearAccountCache } from '../ledger/posting.js';

/** Baris dagang: jumlah = qty × harga × (1 − diskon). Header: subtotal, PPN, total. */
function tradeTotals(_ctx, row, lines) {
  if (!lines) return;
  for (const l of lines) {
    if (!l.price && l.price !== 0 && l.product_id) l.price = db.get('SELECT price FROM products WHERE id = ?', l.product_id)?.price || 0;
    l.amount = round2((l.qty || 0) * (l.price || 0) * (1 - (l.discount_pct || 0) / 100));
  }
  row.subtotal = sum(lines, (l) => l.amount);
  row.tax_rate = row.tax_rate ?? 11;
  row.tax = round2(row.subtotal * row.tax_rate / 100);
  row.total = round2(row.subtotal + row.tax);
}

const amountTotal = (_ctx, row, lines) => { if (lines) row.total = sum(lines, (l) => l.amount); };

function defaultDue(row, partyTable, partyField) {
  if (row.due_date || !row.date || !row[partyField]) return;
  const p = db.get(`SELECT terms_days FROM ${partyTable} WHERE id = ?`, row[partyField]);
  const d = new Date(row.date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + (p?.terms_days ?? 30));
  row.due_date = d.toISOString().slice(0, 10);
}

const STAGE_PROB = { prospek: 10, kualifikasi: 25, penawaran: 50, negosiasi: 75, menang: 100, kalah: 0 };

export const HOOKS = {
  quotations: { compute: tradeTotals },
  sales_orders: { compute: tradeTotals },
  purchase_orders: { compute: tradeTotals },
  sales_invoices: { compute: (ctx, row, lines) => { tradeTotals(ctx, row, lines); defaultDue(row, 'customers', 'customer_id'); row.paid = row.paid || 0; } },
  purchase_bills: {
    compute: (ctx, row, lines) => {
      if (lines) for (const l of lines) if (!l.product_id && !l.account_id) throw bad('Setiap baris tagihan harus memilih barang atau akun.');
      tradeTotals(ctx, row, lines); defaultDue(row, 'suppliers', 'supplier_id'); row.paid = row.paid || 0;
    },
  },
  pos_sales: {
    beforeCreate: (ctx, row) => { row.cashier = ctx.user.full_name; },
    compute: tradeTotals,
  },
  purchase_requests: { compute: (_c, row, lines) => { if (!lines) return; for (const l of lines) l.amount = round2((l.qty || 0) * (l.price || 0)); row.total = sum(lines, (l) => l.amount); } },
  rfqs: { compute: (_c, row, lines) => { if (lines?.length) row.best_price = Math.min(...lines.map((l) => l.amount || 0)); } },
  customer_receipts: { compute: amountTotal },
  supplier_payments: { compute: amountTotal },
  cash_transactions: { compute: amountTotal },
  journals: {
    compute: (_c, row, lines) => {
      if (!lines) return;
      for (const l of lines) {
        if ((l.debit || 0) > 0 && (l.credit || 0) > 0) throw bad('Satu baris jurnal tidak boleh berisi debit dan kredit sekaligus.');
      }
      row.total = sum(lines, (l) => l.debit);
      row.source_type = row.source_type || 'manual';
    },
  },
  stock_adjustments: { compute: (_c, row, lines) => { if (lines) row.total = sum(lines, (l) => (l.qty || 0) * (l.unit_cost || 0)); } },
  payroll_runs: {
    compute: (_c, row, lines) => {
      if (!lines) return;
      for (const l of lines) l.net = round2((l.basic || 0) + (l.allowance || 0) + (l.overtime || 0) - (l.bpjs || 0) - (l.pph21 || 0));
      row.gross = sum(lines, (l) => (l.basic || 0) + (l.allowance || 0) + (l.overtime || 0));
      row.total = sum(lines, (l) => l.net);
    },
  },
  fixed_assets: {
    compute: (_c, row) => {
      if (row.status === 'draf' || !row.status) { row.accumulated = 0; row.book_value = row.cost; }
      if ((row.salvage_value || 0) > (row.cost || 0)) throw bad('Nilai sisa tidak boleh melebihi harga perolehan.');
    },
  },
  leads: {
    beforeUpdate: (_c, row, existing) => { if (row.stage && row.stage !== existing.stage && row.probability === undefined) row.probability = STAGE_PROB[row.stage]; },
    beforeCreate: (_c, row) => { if (row.probability == null) row.probability = STAGE_PROB[row.stage || 'prospek']; },
  },
  leave_requests: { compute: (_c, row) => { if (row.end_date < row.start_date) throw bad('Tanggal selesai harus setelah tanggal mulai.'); } },
  project_tasks: { compute: (_c, row) => { if (row.end_date < row.start_date) throw bad('Tanggal selesai harus setelah tanggal mulai.'); } },
  fiscal_periods: { compute: (_c, row) => { if (row.end_date < row.start_date) throw bad('Tanggal selesai harus setelah tanggal mulai.'); } },
  bank_transfers: { compute: (_c, row) => { if (row.from_bank_id === row.to_bank_id) throw bad('Rekening asal dan tujuan tidak boleh sama.'); } },
  stock_transfers: { compute: (_c, row) => { if (row.from_warehouse_id === row.to_warehouse_id) throw bad('Gudang asal dan tujuan tidak boleh sama.'); } },
  companies: {
    beforeUpdate: (_c, row, existing) => { if (row.parent_id && row.parent_id === existing.id) throw bad('Perusahaan tidak boleh menjadi induk dirinya sendiri.'); },
  },
  accounts: {
    beforeUpdate: (_c, row, existing) => {
      clearAccountCache();
      if (row.is_header === 1 && !existing.is_header && db.get('SELECT 1 FROM journal_lines WHERE account_id = ? LIMIT 1', existing.id)) throw conflict('Akun yang sudah memiliki transaksi tidak dapat dijadikan akun induk.');
      if (row.type && row.type !== existing.type && db.get('SELECT 1 FROM journal_lines WHERE account_id = ? LIMIT 1', existing.id)) throw conflict('Golongan akun yang sudah memiliki transaksi tidak dapat diubah.');
    },
  },
  roles: { beforeUpdate: () => clearPermCache(), beforeDelete: (_c, r) => { if (r.code === 'ADMIN') throw conflict('Peran administrator bawaan tidak dapat dihapus.'); } },

  users: {
    async beforeCreate(ctx, row, body) {
      row.username = String(row.username || '').toLowerCase();
      const errs = await checkPasswordPolicy(body.password, { username: row.username });
      if (errs.length) throw bad(`Kata sandi harus ${errs.join(', ')}.`);
      guardPrivilege(ctx, row);
      delete row.password;
      row.must_change_password = 1;
      row.mfa_enabled = 0;
      row.failed_attempts = 0;
    },
    async afterCommit(_ctx, id, _row, body) {
      await setPassword(id, body.password, { mustChange: true });
    },
    async beforeAction(ctx, action, u, p) {
      if (action !== 'reset_password') return null;
      if (u.id === ctx.user.id) throw forbidden('Gunakan menu Profil untuk mengganti sandi Anda sendiri.');
      guardPrivilege(ctx, u);
      const errs = await checkPasswordPolicy(p.password, u);
      if (errs.length) throw bad(`Kata sandi harus ${errs.join(', ')}.`);
      return hashPassword(p.password);
    },
    async beforeUpdate(ctx, row, existing) {
      if (row.username) row.username = row.username.toLowerCase();
      if (existing.id === ctx.user.id && ((row.role_id && row.role_id !== existing.role_id) || (row.status && row.status !== existing.status))) {
        throw forbidden('Anda tidak dapat mengubah peran atau status akun Anda sendiri.');
      }
      guardPrivilege(ctx, { ...existing, ...row });
      if (row.status === 'aktif' && existing.status === 'terkunci') { row.failed_attempts = 0; row.locked_until = null; }
    },
  },
};

/** Pengguna tanpa hak admin penuh tidak boleh membuat/menaikkan akun ke peran admin. */
function guardPrivilege(ctx, row) {
  const role = db.get('SELECT code FROM roles WHERE id = ?', row.role_id);
  const lvl = db.get("SELECT level FROM role_permissions WHERE role_id = ? AND module = 'admin'", row.role_id)?.level || 0;
  if ((lvl >= 3 || role?.code === 'ADMIN') && !can(ctx, 'admin', LEVEL.admin)) throw forbidden('Hanya administrator utama yang dapat memberikan peran administratif.');
}
