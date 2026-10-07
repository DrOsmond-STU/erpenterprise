/* Pembentuk skema: tabel inti (keamanan, audit, stok) ditulis tangan;
   tabel entitas dibentuk dari definisi di modules/entities.js. */
import { ENTITIES } from './modules/entities.js';
import * as db from './db.js';

const SQL_TYPE = { text: 'TEXT', textarea: 'TEXT', email: 'TEXT', select: 'TEXT', date: 'TEXT', int: 'INTEGER', bool: 'INTEGER', ref: 'INTEGER', money: 'REAL', number: 'REAL', pct: 'REAL' };

const CORE = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT, updated_by INTEGER);
CREATE TABLE IF NOT EXISTS sequences (key TEXT PRIMARY KEY, last INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 4),
  PRIMARY KEY (role_id, module)
);
CREATE TABLE IF NOT EXISTS password_history (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, created_at TEXT NOT NULL, last_seen TEXT NOT NULL, expires_at TEXT NOT NULL,
  ip TEXT, user_agent TEXT, mfa_pending INTEGER NOT NULL DEFAULT 0, revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, username TEXT, ip TEXT, success INTEGER NOT NULL, reason TEXT
);
CREATE INDEX IF NOT EXISTS ix_login_attempts_ts ON login_attempts(ts);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, user_id INTEGER, username TEXT, ip TEXT,
  action TEXT NOT NULL, entity TEXT, entity_id INTEGER, company_id INTEGER, branch_id INTEGER,
  detail TEXT, prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_ts ON audit_log(ts);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'Jejak audit bersifat append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'Jejak audit bersifat append-only'); END;

CREATE TABLE IF NOT EXISTS stock_balances (
  product_id INTEGER NOT NULL REFERENCES products(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  qty REAL NOT NULL DEFAULT 0, avg_cost REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, warehouse_id)
);
`;

const TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS journals_posted_immutable BEFORE UPDATE ON journals
  WHEN OLD.status = 'diposting' AND (NEW.status IS NOT OLD.status OR NEW.date IS NOT OLD.date OR NEW.total IS NOT OLD.total
    OR NEW.company_id IS NOT OLD.company_id OR NEW.branch_id IS NOT OLD.branch_id OR NEW.number IS NOT OLD.number
    OR NEW.description IS NOT OLD.description OR NEW.source_type IS NOT OLD.source_type OR NEW.source_id IS NOT OLD.source_id
    OR NEW.reversal_of IS NOT OLD.reversal_of OR NEW.posted_at IS NOT OLD.posted_at)
  BEGIN SELECT RAISE(ABORT, 'Jurnal yang sudah diposting tidak dapat diubah; gunakan jurnal pembalik'); END;
CREATE TRIGGER IF NOT EXISTS journals_posted_nodelete BEFORE DELETE ON journals
  WHEN OLD.status = 'diposting'
  BEGIN SELECT RAISE(ABORT, 'Jurnal yang sudah diposting tidak dapat dihapus'); END;
CREATE TRIGGER IF NOT EXISTS journal_lines_immutable_u BEFORE UPDATE ON journal_lines
  WHEN (SELECT status FROM journals WHERE id = OLD.parent_id) = 'diposting'
  BEGIN SELECT RAISE(ABORT, 'Baris jurnal terposting tidak dapat diubah'); END;
CREATE TRIGGER IF NOT EXISTS journal_lines_immutable_d BEFORE DELETE ON journal_lines
  WHEN (SELECT status FROM journals WHERE id = OLD.parent_id) = 'diposting'
  BEGIN SELECT RAISE(ABORT, 'Baris jurnal terposting tidak dapat dihapus'); END;
CREATE TRIGGER IF NOT EXISTS journal_lines_insert_posted BEFORE INSERT ON journal_lines
  WHEN (SELECT status FROM journals WHERE id = NEW.parent_id) = 'diposting'
  BEGIN SELECT RAISE(ABORT, 'Tidak dapat menambah baris ke jurnal terposting'); END;
CREATE TRIGGER IF NOT EXISTS stock_moves_no_update BEFORE UPDATE ON stock_moves
  BEGIN SELECT RAISE(ABORT, 'Mutasi stok bersifat append-only'); END;
CREATE TRIGGER IF NOT EXISTS stock_moves_no_delete BEFORE DELETE ON stock_moves
  BEGIN SELECT RAISE(ABORT, 'Mutasi stok bersifat append-only'); END;
`;

/* Kolom tambahan yang tidak tampil di formulir. */
const EXTRA = {
  users: ['password_hash TEXT', 'mfa_secret TEXT', 'locked_until TEXT', 'must_change_password INTEGER NOT NULL DEFAULT 0', 'mfa_last_step INTEGER'],
  journals: ['posted_at TEXT', 'posted_by INTEGER'],
  stock_moves: ['source_id INTEGER', 'company_id_src INTEGER'],
};
const LINE_EXTRA = {
  journal_lines: ['company_id INTEGER', 'partner_type TEXT', 'partner_id INTEGER', 'is_system INTEGER NOT NULL DEFAULT 0'],
  sales_invoice_lines: ['unit_cost REAL'],
  pos_sale_lines: ['unit_cost REAL'],
};

function colDef(f) {
  const t = SQL_TYPE[f.type] || 'TEXT';
  let s = `"${f.name}" ${t}`;
  if (f.type === 'ref') s += ` REFERENCES "${f.ref === 'users' ? 'users' : f.ref}"(id)`;
  return s;
}

function entityDDL(e) {
  const cols = ['id INTEGER PRIMARY KEY'];
  if (e.scope === 'company' || e.scope === 'branch') cols.push('company_id INTEGER NOT NULL REFERENCES companies(id)');
  if (e.scope === 'branch') cols.push('branch_id INTEGER NOT NULL REFERENCES branches(id)');
  for (const f of e.fields) if (!f.virtual) cols.push(colDef(f));
  for (const x of EXTRA[e.table] || []) cols.push(x);
  cols.push('created_at TEXT', 'created_by INTEGER', 'updated_at TEXT', 'updated_by INTEGER', 'row_version INTEGER NOT NULL DEFAULT 1');
  const out = [`CREATE TABLE IF NOT EXISTS "${e.table}" (\n  ${cols.join(',\n  ')}\n);`];

  const uniq = e.fields.filter((f) => f.unique);
  for (const f of uniq) {
    const scopeCols = e.scope === 'global' ? '' : 'company_id, ';
    out.push(`CREATE UNIQUE INDEX IF NOT EXISTS ux_${e.table}_${f.name} ON "${e.table}"(${scopeCols}"${f.name}");`);
  }
  if (e.number) out.push(`CREATE UNIQUE INDEX IF NOT EXISTS ux_${e.table}_number ON "${e.table}"(company_id, number);`);
  if (e.scope !== 'global') out.push(`CREATE INDEX IF NOT EXISTS ix_${e.table}_scope ON "${e.table}"(company_id${e.scope === 'branch' ? ', branch_id' : ''});`);
  for (const f of e.fields) {
    if (f.type === 'ref' || f.name === 'date' || f.name === 'status') out.push(`CREATE INDEX IF NOT EXISTS ix_${e.table}_${f.name} ON "${e.table}"("${f.name}");`);
  }

  if (e.lines) {
    const lc = [
      'id INTEGER PRIMARY KEY',
      `parent_id INTEGER NOT NULL REFERENCES "${e.table}"(id) ON DELETE CASCADE`,
      'line_no INTEGER NOT NULL DEFAULT 0',
      ...e.lines.fields.map(colDef),
      ...(LINE_EXTRA[e.lines.table] || []),
    ];
    out.push(`CREATE TABLE IF NOT EXISTS "${e.lines.table}" (\n  ${lc.join(',\n  ')}\n);`);
    out.push(`CREATE INDEX IF NOT EXISTS ix_${e.lines.table}_parent ON "${e.lines.table}"(parent_id);`);
    for (const f of e.lines.fields) if (f.type === 'ref') out.push(`CREATE INDEX IF NOT EXISTS ix_${e.lines.table}_${f.name} ON "${e.lines.table}"("${f.name}");`);
  }
  return out.join('\n');
}

export function migrate() {
  const ddl = Object.values(ENTITIES).map(entityDDL).join('\n\n');
  db.exec(ddl);
  db.exec(CORE);
  db.exec(TRIGGERS);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_journal_lines_acct ON journal_lines(account_id, branch_id);
           CREATE INDEX IF NOT EXISTS ix_journals_date ON journals(company_id, date, status);
           CREATE INDEX IF NOT EXISTS ix_stock_moves_pw ON stock_moves(product_id, warehouse_id);`);
  db.run(`INSERT INTO meta(key, value) VALUES ('schema_version', '1') ON CONFLICT(key) DO NOTHING`);
}

export { entityDDL };
