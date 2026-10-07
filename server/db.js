/* Lapisan basis data — SQLite bawaan Node (node:sqlite), tanpa dependensi
   pihak ketiga. Seluruh kueri memakai parameter terikat (anti SQL injection,
   ISO 27001 A.8.28). */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let db = null;
const cache = new Map();
let txDepth = 0;

export function open(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = ${file === ':memory:' ? 'MEMORY' : 'WAL'};
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);
  cache.clear();
  return db;
}

export function close() {
  if (db) db.close();
  db = null;
  cache.clear();
}

export function raw() { return db; }

const clean = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

function stmt(sql) {
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}

export const all = (sql, ...p) => stmt(sql).all(...clean(p));
export const get = (sql, ...p) => stmt(sql).get(...clean(p));
export const run = (sql, ...p) => stmt(sql).run(...clean(p));
export const exec = (sql) => db.exec(sql);

/** Transaksi bersarang melalui SAVEPOINT; seluruh posting jurnal berjalan atomik. */
export function tx(fn) {
  const name = `sp${++txDepth}`;
  db.exec(txDepth === 1 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
  try {
    const out = fn();
    db.exec(txDepth === 1 ? 'COMMIT' : `RELEASE ${name}`);
    return out;
  } catch (err) {
    db.exec(txDepth === 1 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
    throw err;
  } finally {
    txDepth--;
  }
}

export function insert(table, row) {
  const keys = Object.keys(row);
  const sql = `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  return Number(run(sql, ...keys.map((k) => row[k])).lastInsertRowid);
}

export function update(table, id, row) {
  const keys = Object.keys(row);
  if (!keys.length) return 0;
  const sql = `UPDATE "${table}" SET ${keys.map((k) => `"${k}" = ?`).join(', ')} WHERE id = ?`;
  return run(sql, ...keys.map((k) => row[k]), id).changes;
}
