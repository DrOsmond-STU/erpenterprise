/* Uji kontrol keamanan (ISO 27001 Annex A) melalui API HTTP sungguhan. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, Client, as, db, DEMO_PASSWORD } from './helpers.mjs';
import { hotp, currentStep } from '../server/security/totp.js';

let admin;
before(async () => {
  await start();
  admin = await as('admin');
  // Longgarkan pembatas laju selama pengujian; diuji terpisah di akhir.
  await admin.put('/api/settings/security_policy', { loginRateLimitPerMinute: 1000, apiRateLimitPerMinute: 100000 });
});
after(stop);

test('header keamanan HTTP terpasang (A.8.23)', async () => {
  const r = await new Client().get('/api/health');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'.*script-src 'self'.*frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('cookie sesi HttpOnly + SameSite=Strict, token sesi disimpan sebagai hash', async () => {
  const c = new Client();
  const r = await c.post('/api/auth/login', { username: 'auditor', password: DEMO_PASSWORD });
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Strict/);
  const raw = sc.split(';')[0].split('=')[1];
  assert.equal(db.get('SELECT COUNT(*) n FROM sessions WHERE id = ?', raw).n, 0, 'token mentah tidak boleh tersimpan');
});

test('pesan galat masuk generik & tidak membocorkan keberadaan akun', async () => {
  const a = await new Client().post('/api/auth/login', { username: 'tidak-ada', password: 'x' });
  const b = await new Client().post('/api/auth/login', { username: 'auditor', password: 'salah' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.body.error, b.body.error);
});

test('akun terkunci setelah percobaan gagal berulang (A.8.5)', async () => {
  for (let i = 0; i < 5; i++) await new Client().post('/api/auth/login', { username: 'yoga.kasir', password: 'salah-' + i });
  const r = await new Client().post('/api/auth/login', { username: 'yoga.kasir', password: DEMO_PASSWORD });
  assert.equal(r.status, 423);
  const u = db.get("SELECT id FROM users WHERE username = 'yoga.kasir'");
  const un = await admin.post(`/api/e/users/${u.id}/actions/unlock`, {});
  assert.equal(un.status, 200);
  await new Client().login('yoga.kasir');
});

test('permintaan tanpa sesi ditolak; tanpa token CSRF ditolak; Origin asing ditolak', async () => {
  assert.equal((await new Client().get('/api/e/customers')).status, 401);
  const c = await as('admin');
  const noCsrf = await c.post('/api/e/customers', { code: 'X1', name: 'X' }, { 'X-CSRF-Token': '' });
  assert.equal(noCsrf.status, 403);
  const evil = await c.post('/api/e/customers', { code: 'X1', name: 'X' }, { Origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
});

test('validasi masukan: JSON rusak, prototype pollution, tipe konten, ukuran', async () => {
  const c = await as('admin');
  assert.equal((await c.req('POST', '/api/e/customers', '{rusak')).status, 400);
  assert.equal((await c.req('POST', '/api/e/customers', '{"__proto__":{"x":1},"name":"a"}')).status, 400);
  assert.equal((await c.req('POST', '/api/e/customers', 'a=b', { 'Content-Type': 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await c.req('POST', '/api/e/customers', JSON.stringify({ name: 'x'.repeat(1_100_000) }))).status, 413);
  const bad = await c.post('/api/e/customers', { code: 'C-ERR', name: 'A', credit_limit: 'banyak' });
  assert.equal(bad.status, 400);
  const inj = await c.get("/api/e/customers?sort=name;DROP TABLE users&q=' OR 1=1 --");
  assert.equal(inj.status, 200);
  assert.ok(db.get('SELECT COUNT(*) n FROM users').n > 0);
});

test('RBAC: peran tanpa izin modul ditolak (A.5.15)', async () => {
  const sales = await as('sari.sales');
  assert.equal((await sales.get('/api/e/journals')).status, 403);
  assert.equal((await sales.get('/api/reports/neraca')).status, 403);
  assert.equal((await sales.get('/api/audit')).status, 403);
  assert.equal((await sales.get('/api/e/sales_orders')).status, 200);
  const auditor = await as('auditor');
  assert.equal((await auditor.get('/api/e/journals')).status, 200);
  assert.equal((await auditor.post('/api/e/customers', { code: 'AUD1', name: 'x' })).status, 403);
});

test('pembatasan cakupan: pengguna cabang hanya melihat cabangnya, tidak dapat membaca perusahaan lain (IDOR)', async () => {
  const kasir = await as('yoga.kasir');
  const list = await kasir.get('/api/e/pos_sales?size=200');
  assert.equal(list.status, 200);
  const mdn = db.get("SELECT id FROM branches WHERE code = 'MDN'").id;
  assert.ok(list.body.rows.length > 0);
  assert.ok(list.body.rows.every((r) => r.branch_id === mdn));
  const otherBranch = db.get("SELECT id FROM pos_sales WHERE branch_id != ? LIMIT 1", mdn);
  assert.equal((await kasir.get(`/api/e/pos_sales/${otherBranch.id}`)).status, 403);
  const ops = await as('budi.ops');
  const nlp = db.get("SELECT id FROM companies WHERE code = 'NLP'").id;
  assert.equal((await ops.get(`/api/e/customers?company=${nlp}`)).status, 403);
  const nlpCustomer = db.get('SELECT id FROM customers WHERE company_id = ?', nlp);
  assert.equal((await ops.get(`/api/e/customers/${nlpCustomer.id}`)).status, 403);
});

test('data pribadi disamarkan untuk peran tanpa izin PII (A.8.11 / UU PDP)', async () => {
  const sales = await as('sari.sales');
  const r = await sales.get('/api/e/customers?size=3');
  assert.ok(r.body.rows[0].npwp.startsWith('••••'));
  const hr = await as('dewi.hr');
  const e = await hr.get('/api/e/employees?size=3');
  assert.ok(!String(e.body.rows[0].nik).startsWith('••••'));
  const ops = await as('budi.ops');
  const masked = await ops.get('/api/e/employees?size=3');
  assert.equal(masked.body.rows[0].basic_salary, null);
});

test('pemisahan tugas: pembuat jurnal tidak dapat menyetujui sendiri (A.5.3)', async () => {
  const rina = await as('rina.akuntan');
  const acc = (code) => db.get('SELECT id FROM accounts WHERE code = ?', code).id;
  const jkt = db.get("SELECT id FROM branches WHERE code = 'JKT'").id;
  const j = await rina.post('/api/e/journals', { branch_id: jkt, date: '2026-10-07', description: 'Uji SoD', lines: [{ account_id: acc('6-2600'), debit: 100000 }, { account_id: acc('1-1110'), credit: 100000 }] });
  assert.equal(j.status, 200);
  assert.equal((await rina.post(`/api/e/journals/${j.body.id}/actions/submit`)).status, 200);
  assert.equal((await rina.post(`/api/e/journals/${j.body.id}/actions/approve`)).status, 403);
  const osmond = await as('osmond');
  const ok = await osmond.post(`/api/e/journals/${j.body.id}/actions/approve`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.record.status, 'diposting');
});

test('jurnal terposting & jejak audit tidak dapat diubah di tingkat basis data', () => {
  const j = db.get("SELECT id FROM journals WHERE status = 'diposting' LIMIT 1");
  assert.throws(() => db.run('UPDATE journals SET total = 1 WHERE id = ?', j.id), /tidak dapat diubah/);
  assert.throws(() => db.run('DELETE FROM journal_lines WHERE parent_id = ?', j.id), /tidak dapat dihapus/);
  assert.throws(() => db.run('UPDATE audit_log SET action = ? WHERE id = 1', 'x'), /append-only/);
  assert.throws(() => db.run('DELETE FROM audit_log WHERE id = 1'), /append-only/);
});

test('rantai hash jejak audit utuh dan terverifikasi (A.8.15)', async () => {
  const r = await admin.get('/api/audit/verify');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.ok(r.body.count > 1000);
  const logins = await admin.get('/api/audit?action=auth.login');
  assert.ok(logins.body.total > 0);
  const detail = db.all("SELECT detail FROM audit_log WHERE detail LIKE '%password%'");
  assert.ok(detail.every((d) => !/Erp#Demo/.test(d.detail)), 'sandi tidak boleh tercatat di jejak audit');
});

test('kebijakan sandi & reset sandi admin memaksa penggantian (A.5.17)', async () => {
  const c = await as('auditor');
  const weak = await c.post('/api/auth/password', { current: DEMO_PASSWORD, next: 'pendek' });
  assert.equal(weak.status, 400);
  const reuse = await c.post('/api/auth/password', { current: DEMO_PASSWORD, next: DEMO_PASSWORD });
  assert.equal(reuse.status, 400);
  const uid = db.get("SELECT id FROM users WHERE username = 'agus.gudang'").id;
  const temp = 'Sementara#2026xyz';
  assert.equal((await admin.post(`/api/e/users/${uid}/actions/reset_password`, { password: temp })).status, 200);
  const agus = new Client();
  const lg = await agus.post('/api/auth/login', { username: 'agus.gudang', password: temp });
  assert.equal(lg.body.mustChangePassword, true);
  agus.csrf = (await agus.get('/api/auth/me')).body.csrf;
  assert.equal((await agus.get('/api/e/stock_moves')).status, 428);
  assert.equal((await agus.post('/api/auth/password', { current: temp, next: 'GudangBaru#2026!' })).status, 200);
  assert.equal((await agus.get('/api/e/stock_moves')).status, 200);
});

test('MFA TOTP: pendaftaran, verifikasi saat masuk, tolak kode salah & pemakaian ulang (A.8.5)', async () => {
  const c = await as('budi.ops');
  const setup = await c.post('/api/auth/mfa/setup');
  assert.equal(setup.status, 200);
  const step = currentStep();
  assert.equal((await c.post('/api/auth/mfa/enable', { code: '000000' })).status, 400);
  assert.equal((await c.post('/api/auth/mfa/enable', { code: hotp(setup.body.secret, step) })).status, 200);
  const enc = db.get("SELECT mfa_secret FROM users WHERE username = 'budi.ops'").mfa_secret;
  assert.ok(!enc.includes(setup.body.secret), 'rahasia MFA harus terenkripsi');
  const c2 = new Client();
  const lg = await c2.post('/api/auth/login', { username: 'budi.ops', password: DEMO_PASSWORD });
  assert.equal(lg.body.mfaRequired, true);
  c2.csrf = (await c2.get('/api/auth/me')).body.csrf;
  assert.equal((await c2.get('/api/e/customers')).status, 401, 'sesi MFA-pending tidak boleh mengakses data');
  assert.equal((await c2.post('/api/auth/mfa', { code: hotp(setup.body.secret, step) })).status, 401, 'kode yang sama tidak boleh dipakai ulang');
  assert.equal((await c2.post('/api/auth/mfa', { code: hotp(setup.body.secret, step + 1) })).status, 200);
  c2.csrf = (await c2.get('/api/auth/me')).body.csrf;
  assert.equal((await c2.get('/api/e/customers')).status, 200);
});

test('logout mencabut sesi di server', async () => {
  const c = await as('auditor');
  const saved = c.cookie;
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  c.cookie = saved;
  assert.equal((await c.get('/api/auth/me')).status, 401);
});

test('pengguna tidak dapat menaikkan hak aksesnya sendiri', async () => {
  const osmond = await as('osmond');
  const role = db.get("SELECT id FROM roles WHERE code = 'DIREKSI'").id;
  assert.equal((await osmond.put(`/api/roles/${role}/permissions`, { permissions: { admin: 4 } })).status, 403);
  const adminRole = db.get("SELECT id FROM roles WHERE code = 'ADMIN'").id;
  const me = db.get("SELECT id FROM users WHERE username = 'osmond'").id;
  assert.equal((await osmond.put(`/api/e/users/${me}`, { role_id: adminRole })).status, 403);
});

test('ekspor CSV menetralkan injeksi formula dan dicatat', async () => {
  const c = await as('admin');
  await c.post('/api/e/customers', { code: 'CSV1', name: '=HYPERLINK("http://evil")', credit_limit: 0 });
  const r = await c.get('/api/export/customers?q=CSV1');
  assert.equal(r.status, 200);
  assert.match(r.body, /'=HYPERLINK/);
  assert.ok(db.get("SELECT COUNT(*) n FROM audit_log WHERE action = 'export'").n > 0);
});

test('cadangan terenkripsi dapat dibuat & dipulihkan dengan checksum', async () => {
  const r = await admin.post('/api/admin/backup');
  assert.equal(r.status, 200);
  assert.match(r.body.sha256, /^[0-9a-f]{64}$/);
  const { decryptBackup } = await import('../server/lib/backup.js');
  const { readFileSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = process.env.BACKUP_DIR;
  const enc = readFileSync(join(dir, r.body.file));
  assert.notEqual(enc.subarray(0, 15).toString(), 'SQLite format 3', 'cadangan tidak boleh berupa teks jelas');
  const out = join(mkdtempSync(join(tmpdir(), 'erp-')), 'restore.sqlite');
  decryptBackup(join(dir, r.body.file), out);
  assert.equal(readFileSync(out).subarray(0, 15).toString(), 'SQLite format 3');
});

test('pembatas laju menolak banjir percobaan masuk (A.8.6)', async () => {
  await admin.put('/api/settings/security_policy', { loginRateLimitPerMinute: 3 });
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await new Client().post('/api/auth/login', { username: 'x', password: 'y' })).status);
  assert.ok(codes.includes(429));
  await admin.put('/api/settings/security_policy', { loginRateLimitPerMinute: 1000 });
});

test('lookup rujukan mengikuti hak akses modul (hak minimum)', async () => {
  const sales = await as('sari.sales');
  assert.equal((await sales.get('/api/lookup/employees')).status, 403);
  assert.equal((await sales.get('/api/lookup/users')).status, 403);
  assert.equal((await sales.get('/api/lookup/products')).status, 200);
  const kasir = await as('yoga.kasir');
  assert.equal((await kasir.get('/api/lookup/bank_accounts')).status, 200, 'data induk bersama tetap dapat dirujuk');
});

test('data pribadi tidak tercatat dalam jejak audit', async () => {
  const hr = await as('dewi.hr');
  const r = await hr.post('/api/e/employees', { branch_id: db.get("SELECT id FROM branches WHERE code = 'JKT'").id, code: 'E-PII', name: 'Uji PII', nik: '3171999988887777', basic_salary: 12345678 });
  assert.equal(r.status, 200);
  const row = db.get("SELECT detail FROM audit_log WHERE entity = 'employees' AND entity_id = ? AND action = 'create'", r.body.id);
  assert.ok(!row.detail.includes('3171999988887777'));
  assert.ok(!row.detail.includes('12345678'));
  assert.match(row.detail, /\[PII\]/);
});
