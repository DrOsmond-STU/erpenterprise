/* Utilitas umum server. */
import { randomBytes } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
    this.expose = true;
  }
}

export const bad = (msg, details) => new HttpError(400, msg, details);
export const forbidden = (msg = 'Anda tidak memiliki izin untuk tindakan ini.') => new HttpError(403, msg);
export const notFound = (msg = 'Data tidak ditemukan.') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Pembulatan 2 desimal yang konsisten untuk seluruh nilai uang. */
export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
export const sum = (arr, f = (x) => x) => round2(arr.reduce((a, x) => a + Number(f(x) || 0), 0));

export const nowIso = () => new Date().toISOString();
/* Jam aplikasi dapat dipatok (dipakai pengisian data contoh & pengujian). */
let fixedToday = null;
export const setToday = (d) => { fixedToday = d; };
export const today = () => fixedToday || new Date().toISOString().slice(0, 10);
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const token = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function monthEnd(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function fmtRp(v) {
  return 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(v));
}
