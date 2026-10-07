/* Jejak audit berantai hash (tamper-evident). Setiap entri menyimpan hash
   SHA-256 dari entri sebelumnya; perubahan satu baris memutus rantai.
   Tabel dilindungi trigger append-only. ISO 27001 A.8.15, A.5.28. */
import * as db from '../db.js';
import { sha256 } from './crypto.js';
import { nowIso } from '../lib/util.js';

const GENESIS = '0'.repeat(64);
const SENSITIVE_KEYS = /password|secret|token|csrf|hash/i;

function scrub(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(scrub);
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = SENSITIVE_KEYS.test(k) ? '[disamarkan]' : scrub(v);
  return out;
}

const canonical = (e) => JSON.stringify([e.ts, e.user_id, e.username, e.ip, e.action, e.entity, e.entity_id, e.company_id, e.branch_id, e.detail, e.prev_hash]);

export function log(ctx, action, { entity = null, entityId = null, companyId = null, branchId = null, detail = null } = {}) {
  const prev = db.get('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1');
  const e = {
    ts: nowIso(),
    user_id: ctx?.user?.id ?? null,
    username: ctx?.user?.username ?? ctx?.username ?? null,
    ip: ctx?.ip ?? null,
    action,
    entity,
    entity_id: entityId,
    company_id: companyId,
    branch_id: branchId,
    detail: detail == null ? null : JSON.stringify(scrub(detail)),
    prev_hash: prev ? prev.hash : GENESIS,
  };
  e.hash = sha256(canonical(e));
  db.insert('audit_log', e);
}

/** Memverifikasi keutuhan seluruh rantai. */
export function verifyChain() {
  let prev = GENESIS, count = 0;
  for (const row of db.all('SELECT * FROM audit_log ORDER BY id')) {
    count++;
    if (row.prev_hash !== prev || sha256(canonical(row)) !== row.hash) {
      return { ok: false, count, brokenAt: row.id };
    }
    prev = row.hash;
  }
  return { ok: true, count, head: prev };
}

/** Selisih before/after untuk detail audit. */
export function diff(before, after) {
  const out = {};
  for (const k of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    if (['updated_at', 'updated_by', 'row_version', 'lines'].includes(k)) continue;
    const a = before?.[k], b = after?.[k];
    if (String(a ?? '') !== String(b ?? '')) out[k] = [a ?? null, b ?? null];
  }
  return out;
}
