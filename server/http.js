/* Lapisan HTTP: header keamanan, pembatasan laju, parsing badan JSON,
   proteksi CSRF & Origin, penyajian berkas statis yang aman, dan
   penanganan galat tanpa membocorkan detail internal.
   ISO 27001 A.8.20–8.23 (keamanan jaringan & web), A.8.12 (pencegahan kebocoran). */
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { HttpError } from './lib/util.js';
import { securityPolicy } from './lib/settings.js';

export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
};

export function applySecurityHeaders(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
}

/* --- Logging terstruktur (tanpa data sensitif) ------------------------------- */
export function logEvent(level, msg, data = {}) {
  const levels = { debug: 10, info: 20, warn: 30, error: 40 };
  if (levels[level] < levels[config.logLevel] && level !== 'error') return;
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...data }) + '\n');
}

/* --- Pembatas laju (jendela tetap, dalam memori) ------------------------------- */
const buckets = new Map();
export function rateLimit(key, limit, windowMs = 60_000) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  if (b.n > limit) throw new HttpError(429, 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60_000).unref();

/* --- Permintaan ------------------------------------------------------------------- */
export function clientIp(req) {
  if (config.trustProxy) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xf) return xf.slice(0, 64);
  }
  return (req.socket.remoteAddress || '').slice(0, 64);
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const COOKIE = config.cookieSecure ? '__Host-erp_sid' : 'erp_sid';

export function sessionCookie(value, maxAgeSec) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (config.cookieSecure) parts.push('Secure');
  if (maxAgeSec !== undefined) parts.push(`Max-Age=${maxAgeSec}`);
  return parts.join('; ');
}

export async function readJson(req, maxBytes = config.maxBodyBytes) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') return {};
  const type = String(req.headers['content-type'] || '');
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Content-Type harus application/json.');
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > maxBytes) throw new HttpError(413, 'Ukuran permintaan terlalu besar.');
    chunks.push(c);
  }
  if (!size) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    // Tolak kunci berbahaya untuk mencegah prototype pollution.
    const walk = (o, d = 0) => {
      if (d > 8) throw new HttpError(400, 'Struktur JSON terlalu dalam.');
      if (o && typeof o === 'object') for (const k of Object.keys(o)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new HttpError(400, 'Kunci JSON tidak diizinkan.');
        walk(o[k], d + 1);
      }
    };
    walk(body);
    return body;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'Badan JSON tidak valid.');
  }
}

/** Pemeriksaan Origin untuk permintaan yang mengubah data (pertahanan CSRF lapis kedua). */
export function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return; // Permintaan non-peramban / same-origin lama; token CSRF tetap wajib.
  const host = req.headers.host;
  const allowed = new Set([`http://${host}`, `https://${host}`]);
  if (config.publicOrigin) allowed.add(config.publicOrigin);
  if (!allowed.has(origin)) throw new HttpError(403, 'Origin permintaan tidak diizinkan.');
}

export function sendJson(res, status, body, headers = {}) {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Pragma: 'no-cache', ...headers });
  res.end(s);
}

export function sendError(res, err, reqId) {
  if (err instanceof HttpError || err?.expose) {
    return sendJson(res, err.status || 400, { error: err.message, details: err.details });
  }
  if (err?.code === 'ERR_SQLITE_ERROR' && /RAISE|immutable|append-only|tidak dapat/i.test(err.message)) {
    return sendJson(res, 409, { error: err.message.replace(/^.*?: /, '') });
  }
  if (err?.code === 'ERR_SQLITE_ERROR' && /UNIQUE/i.test(err.message)) return sendJson(res, 409, { error: 'Data duplikat: nilai unik sudah dipakai.' });
  logEvent('error', 'unhandled', { reqId, err: err?.stack || String(err) });
  sendJson(res, 500, { error: 'Terjadi kesalahan internal. Hubungi admin dengan kode referensi.', ref: reqId });
}

/* --- Berkas statis ------------------------------------------------------------------ */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const SHARED = { '/assets/tokens.css': 'prototype/assets/tokens.css', '/assets/app.css': 'prototype/assets/app.css', '/assets/charts.js': 'prototype/assets/charts.js' };
const webRoot = resolve(config.root, 'web');

export async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let file;
  if (SHARED[pathname]) file = resolve(config.root, SHARED[pathname]);
  else {
    let p = pathname === '/' ? '/index.html' : pathname;
    if (p === '/login') p = '/login.html';
    if (p.includes('\0') || p.includes('..')) return false;
    file = resolve(webRoot, '.' + p);
    if (!file.startsWith(webRoot + sep)) return false;
  }
  const type = TYPES[extname(file)];
  if (!type) return false;
  try {
    const st = await stat(file);
    if (!st.isFile()) return false;
    const etag = `W/"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); res.end(); return true; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, ETag: etag, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  } catch {
    return false;
  }
}

export const newReqId = () => randomUUID();
export const apiLimit = () => securityPolicy().apiRateLimitPerMinute;
export const loginLimit = () => securityPolicy().loginRateLimitPerMinute;
