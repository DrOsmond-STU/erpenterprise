/* Pengaturan aplikasi tersimpan sebagai JSON di tabel settings. */
import * as db from '../db.js';
import { DEFAULT_SECURITY_POLICY } from '../config.js';
import { nowIso } from './util.js';

const cache = new Map();

export function getSetting(key, fallback = null) {
  if (cache.has(key)) return cache.get(key);
  const row = db.get('SELECT value FROM settings WHERE key = ?', key);
  const v = row ? JSON.parse(row.value) : fallback;
  cache.set(key, v);
  return v;
}

export function setSetting(key, value, userId = null) {
  db.run(
    `INSERT INTO settings(key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    key, JSON.stringify(value), nowIso(), userId,
  );
  cache.set(key, value);
}

export const clearSettingsCache = () => cache.clear();

export const securityPolicy = () => ({ ...DEFAULT_SECURITY_POLICY, ...(getSetting('security_policy', {}) || {}) });

/** Peta akun default untuk posting otomatis (kode akun). */
export const DEFAULT_ACCOUNT_MAP = {
  ar: '1-1200', ic_receivable: '1-1600', inventory: '1-1340', vat_in: '1-1400', inter_branch: '1-1700',
  investment_sub: '1-2900', ap: '2-1100', ic_payable: '2-1500', vat_out: '2-1200',
  salary_payable: '2-1300', pph21_payable: '2-1310', bpjs_payable: '2-1320',
  share_capital: '3-1000', retained_earnings: '3-2000',
  sales: '4-1100', ic_sales: '4-1400', cogs: '5-1100',
  salary_expense: '6-1000', maintenance_expense: '6-2200', stock_adjustment: '6-2700',
  gain_disposal: '7-1100', loss_disposal: '7-2200', wip: '1-1320',
};

export const accountMap = () => ({ ...DEFAULT_ACCOUNT_MAP, ...(getSetting('account_map', {}) || {}) });

export const DEFAULT_APPROVAL = { poThreshold: 150_000_000, paymentThreshold: 0, requireJournalApproval: true };
export const approvalPolicy = () => ({ ...DEFAULT_APPROVAL, ...(getSetting('approval_policy', {}) || {}) });
