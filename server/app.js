/* Perakit aplikasi: handler HTTP yang dapat dipakai server maupun pengujian. */
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { config } from './config.js';
import * as db from './db.js';
import { migrate } from './schema.js';
import { match } from './routes.js';
import * as auth from './security/auth.js';
import { permissionsFor } from './security/rbac.js';
import {
  applySecurityHeaders, rateLimit, clientIp, parseCookies, COOKIE, sessionCookie, readJson,
  checkOrigin, sendJson, sendError, serveStatic, logEvent, newReqId, apiLimit, loginLimit,
} from './http.js';
import { HttpError, setToday } from './lib/util.js';
import { securityPolicy } from './lib/settings.js';

export function initDb(file = config.dbFile) {
  db.open(file);
  migrate();
}

export async function handle(req, res) {
  const started = Date.now();
  const reqId = newReqId();
  const ip = clientIp(req);
  applySecurityHeaders(res);
  res.setHeader('X-Request-Id', reqId);
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return sendJson(res, 400, { error: 'URL tidak valid.' });
  }
  const pathname = url.pathname;
  const ctx = { ip, ua: req.headers['user-agent'] || '', headers: req.headers, reqId };

  try {
    if (!pathname.startsWith('/api/')) {
      if (await serveStatic(req, res, pathname)) return;
      // Rute SPA: kembalikan index.html untuk jalur tanpa ekstensi.
      if (req.method === 'GET' && !/\.[a-z0-9]+$/i.test(pathname) && (await serveStatic(req, res, '/index.html'))) return;
      return sendJson(res, 404, { error: 'Tidak ditemukan.' });
    }

    const r = match(req.method, pathname);
    if (!r) throw new HttpError(404, 'Rute API tidak ditemukan.');

    rateLimit(`api:${ip}`, apiLimit());
    if (r.opts.login) rateLimit(`login:${ip}`, loginLimit());

    const cookies = parseCookies(req);
    let cookieOut = null;
    ctx.setSession = (raw) => { cookieOut = sessionCookie(raw); };
    ctx.clearSession = () => { cookieOut = sessionCookie('', 0); };

    if (!r.opts.public) {
      const loaded = auth.loadSession(cookies[COOKIE]);
      if (!loaded) throw new HttpError(401, 'Sesi berakhir atau belum masuk. Silakan masuk kembali.');
      ctx.session = loaded.session;
      ctx.user = loaded.user;
      ctx.perms = permissionsFor(loaded.user.role_id);
      if (ctx.session.mfa_pending && !r.opts.allowMfaPending) throw new HttpError(401, 'Verifikasi MFA diperlukan.');
      const policy = securityPolicy();
      const expired = ctx.user.password_changed_at && Date.parse(ctx.user.password_changed_at) + policy.passwordMaxAgeDays * 864e5 < Date.now();
      if ((ctx.user.must_change_password || expired) && !r.opts.allowMustChange) throw new HttpError(428, 'Anda wajib mengganti kata sandi sebelum melanjutkan.');
    }

    if (!['GET', 'HEAD'].includes(req.method)) {
      checkOrigin(req);
      if (!r.opts.public) {
        const token = req.headers['x-csrf-token'];
        if (!token || token !== ctx.session.csrf) throw new HttpError(403, 'Token CSRF tidak valid. Muat ulang halaman.');
      }
    }

    const body = await readJson(req);
    const query = Object.fromEntries(url.searchParams);
    const out = await r.handler(ctx, body, r.params, query);
    const headers = cookieOut ? { 'Set-Cookie': cookieOut } : {};
    if (out && out.__raw !== undefined) {
      res.writeHead(200, { 'Content-Type': out.type, 'Content-Disposition': `attachment; filename="${out.filename.replace(/[^\w.-]/g, '_')}"`, 'Cache-Control': 'no-store', ...headers });
      res.end(out.__raw);
    } else {
      sendJson(res, 200, out ?? { ok: true }, headers);
    }
  } catch (err) {
    sendError(res, err, reqId);
  } finally {
    if (pathname.startsWith('/api/')) {
      logEvent(res.statusCode >= 500 ? 'error' : 'info', 'request', { reqId, method: req.method, path: pathname, status: res.statusCode, ms: Date.now() - started, user: ctx.user?.username, ip });
    }
  }
}

export function createApp() {
  const server = createServer({ requestTimeout: 30_000, headersTimeout: 15_000 }, handle);
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  return server;
}

export { setToday };
