/* Pemutakhiran data referensi yang idempoten — dijalankan setiap kali server
   mulai, sehingga basis data lama memperoleh akun, peran, dan mata uang baru
   tanpa kehilangan data (migrasi skema aditif ada di schema.js). */
import * as db from './db.js';
import { ROLES, COA, CURRENCIES } from './seed-master.js';
import { nowIso } from './lib/util.js';
import { clearAccountCache } from './ledger/posting.js';
import { clearPermCache } from './security/rbac.js';
import { spread } from './ledger/budget.js';
import { syncInstallments } from './ledger/payments.js';
import { BUDGET_MONTHS } from './modules/entities.js';

export function upgrade() {
  db.tx(() => {
    // Bagan akun: tambah akun yang belum ada.
    for (const [code, name, type, parent, header, subtype = null, cf = 'operating', ic = 0] of COA) {
      if (db.get('SELECT id FROM accounts WHERE code = ?', code)) continue;
      const parentId = parent ? db.get('SELECT id FROM accounts WHERE code = ?', parent)?.id ?? null : null;
      db.insert('accounts', { code, name, type, parent_id: parentId, is_header: header, subtype, cash_flow: cf, is_intercompany: ic, status: 'aktif', created_at: nowIso() });
    }
    // Mata uang: IDR sebagai mata uang dasar wajib ada.
    for (const [code, name, symbol, base] of CURRENCIES) {
      if (db.get('SELECT id FROM currencies WHERE code = ?', code)) continue;
      if (!base && !db.get('SELECT id FROM currencies LIMIT 1') && code !== 'IDR') continue;
      db.insert('currencies', { code, name, symbol, is_base: base, status: 'aktif', created_at: nowIso() });
    }
    db.run("UPDATE currencies SET is_base = CASE WHEN code = 'IDR' THEN 1 ELSE 0 END");
    // Peran: tambah peran baru & modul izin baru (bawaan 0 kecuali admin).
    for (const r of ROLES) {
      let role = db.get('SELECT id FROM roles WHERE code = ?', r.code);
      if (!role) role = { id: db.insert('roles', { code: r.code, name: r.name, description: r.description, created_at: nowIso() }) };
      for (const [m, lvl] of Object.entries(r.perms)) {
        db.run('INSERT INTO role_permissions(role_id, module, level) VALUES (?, ?, ?) ON CONFLICT(role_id, module) DO NOTHING', role.id, m, lvl);
      }
    }
    // Faktur/tagihan terbuka sebelum fitur angsuran: satu angsuran pada jatuh tempo.
    for (const t of ['sales_invoices', 'purchase_bills']) {
      for (const d of db.all(`SELECT id FROM "${t}" WHERE status IN ('terbit','sebagian','lunas') AND id NOT IN (SELECT doc_id FROM installments WHERE doc_type = ?)`, t)) syncInstallments(t, d.id);
    }
    db.run("UPDATE customer_receipts SET mode = 'pelunasan' WHERE mode IS NULL");
    db.run("UPDATE customer_receipts SET method = 'transfer' WHERE method IS NULL");
    db.run("UPDATE supplier_payments SET method = 'transfer' WHERE method IS NULL");
    db.run("UPDATE supplier_payments SET mode = 'pelunasan' WHERE mode IS NULL");
    db.run('UPDATE customer_receipt_lines SET settled = amount + COALESCE(discount,0) + COALESCE(pph23,0) WHERE settled IS NULL');
    db.run('UPDATE supplier_payment_lines SET settled = amount + COALESCE(discount,0) + COALESCE(pph23,0) WHERE settled IS NULL');
    db.run("UPDATE customer_receipts SET settled = (SELECT COALESCE(SUM(settled),0) FROM customer_receipt_lines WHERE parent_id = customer_receipts.id) WHERE settled IS NULL");
    db.run("UPDATE supplier_payments SET settled = (SELECT COALESCE(SUM(settled),0) FROM supplier_payment_lines WHERE parent_id = supplier_payments.id) WHERE settled IS NULL");
    // Anggaran versi lama (tanpa rincian bulanan & status): bagi merata, anggap sudah disetujui.
    for (const b of db.all('SELECT id, amount, status, phasing FROM budgets WHERE status IS NULL OR phasing IS NULL OR m01 IS NULL')) {
      const months = spread(Number(b.amount) || 0);
      db.update('budgets', b.id, { status: b.status || 'disetujui', phasing: b.phasing || 'rata', ...Object.fromEntries(BUDGET_MONTHS.map((k, i) => [k, months[i]])) });
    }
  });
  clearAccountCache();
  clearPermCache();
}
