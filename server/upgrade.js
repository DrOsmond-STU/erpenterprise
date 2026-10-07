/* Pemutakhiran data referensi yang idempoten — dijalankan setiap kali server
   mulai, sehingga basis data lama memperoleh akun, peran, dan mata uang baru
   tanpa kehilangan data (migrasi skema aditif ada di schema.js). */
import * as db from './db.js';
import { ROLES, COA, CURRENCIES } from './seed-master.js';
import { nowIso } from './lib/util.js';
import { clearAccountCache } from './ledger/posting.js';
import { clearPermCache } from './security/rbac.js';

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
  });
  clearAccountCache();
  clearPermCache();
}
