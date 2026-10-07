/* Bantuan pengujian: menjalankan server di memori dengan data demo. */
process.env.DB_FILE = ':memory:';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.BACKUP_DIR = process.env.BACKUP_DIR || new URL('../test-results/backups', import.meta.url).pathname;

const { initDb, createApp } = await import('../server/app.js');
const { seed, DEMO_PASSWORD } = await import('../server/seed.js');
export const db = await import('../server/db.js');
export { DEMO_PASSWORD };

let server, base;

export async function start() {
  if (server) return base;
  initDb(':memory:');
  await seed({ demo: true });
  server = createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}

export function stop() { server?.close(); server = null; }

/** Klien HTTP dengan cookie & token CSRF per pengguna. */
export class Client {
  constructor() { this.cookie = ''; this.csrf = ''; this.headers = {}; }
  async req(method, path, body, extra = {}) {
    const headers = { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...this.headers, ...extra };
    if (this.cookie) headers.Cookie = this.cookie;
    if (method !== 'GET' && this.csrf && !('X-CSRF-Token' in extra)) headers['X-CSRF-Token'] = this.csrf;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  }
  get(p, h) { return this.req('GET', p, undefined, h); }
  post(p, b = {}, h) { return this.req('POST', p, b, h); }
  put(p, b = {}, h) { return this.req('PUT', p, b, h); }
  del(p, h) { return this.req('DELETE', p, undefined, h); }
  async login(username, password = DEMO_PASSWORD) {
    const r = await this.post('/api/auth/login', { username, password });
    if (r.status !== 200) throw new Error(`login ${username} gagal: ${r.status} ${JSON.stringify(r.body)}`);
    const me = await this.get('/api/auth/me');
    this.csrf = me.body.csrf;
    this.me = me.body;
    return this;
  }
}

export const as = async (username) => new Client().login(username);
