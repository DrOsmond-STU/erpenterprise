/* Autentikasi & manajemen sesi.
   ISO 27001 A.5.17 (informasi autentikasi), A.8.5 (autentikasi aman),
   A.8.2 (hak akses istimewa), A.5.16 (manajemen identitas). */
import * as db from '../db.js';
import { hashPassword, verifyPassword, sha256, encryptText, decryptText } from './crypto.js';
import * as totp from './totp.js';
import * as audit from './audit.js';
import { securityPolicy } from '../lib/settings.js';
import { permissionsFor } from './rbac.js';
import { HttpError, bad, nowIso, token } from '../lib/util.js';

const COMMON = new Set(['password', 'password123', 'qwerty123456', '123456789012', 'admin12345678', 'welcome12345', 'p@ssw0rd1234', 'passw0rd!234']);

/** Validasi kebijakan sandi. Mengembalikan daftar pelanggaran (kosong = lolos). */
export async function checkPasswordPolicy(password, user = null) {
  const p = securityPolicy();
  const errs = [];
  const pw = String(password || '');
  if (pw.length < p.passwordMinLength) errs.push(`minimal ${p.passwordMinLength} karakter`);
  if (pw.length > 128) errs.push('maksimal 128 karakter');
  if (!/[a-z]/.test(pw)) errs.push('memuat huruf kecil');
  if (!/[A-Z]/.test(pw)) errs.push('memuat huruf besar');
  if (!/\d/.test(pw)) errs.push('memuat angka');
  if (!/[^A-Za-z0-9]/.test(pw)) errs.push('memuat simbol');
  if (COMMON.has(pw.toLowerCase())) errs.push('tidak termasuk sandi umum');
  if (user && user.username && pw.toLowerCase().includes(String(user.username).toLowerCase())) errs.push('tidak memuat nama pengguna');
  if (user?.id && !errs.length) {
    const hist = db.all('SELECT hash FROM password_history WHERE user_id = ? ORDER BY id DESC LIMIT ?', user.id, p.passwordHistory);
    for (const h of hist) if (await verifyPassword(pw, h.hash)) { errs.push(`tidak sama dengan ${p.passwordHistory} sandi terakhir`); break; }
  }
  return errs;
}

export async function setPassword(userId, password, { mustChange = false } = {}) {
  const hash = await hashPassword(password);
  db.run('UPDATE users SET password_hash = ?, password_changed_at = ?, must_change_password = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?', hash, nowIso(), mustChange ? 1 : 0, userId);
  db.run('INSERT INTO password_history(user_id, hash, created_at) VALUES (?, ?, ?)', userId, hash, nowIso());
  const keep = securityPolicy().passwordHistory;
  db.run('DELETE FROM password_history WHERE user_id = ? AND id NOT IN (SELECT id FROM password_history WHERE user_id = ? ORDER BY id DESC LIMIT ?)', userId, userId, keep);
}

/* --- Sesi ----------------------------------------------------------------- */
export function createSession(user, ip, ua, { mfaPending = false } = {}) {
  const p = securityPolicy();
  const raw = token(32);
  const now = new Date();
  db.insert('sessions', {
    id: sha256(raw),
    user_id: user.id,
    csrf: token(24),
    created_at: now.toISOString(),
    last_seen: now.toISOString(),
    expires_at: new Date(now.getTime() + p.sessionAbsoluteHours * 3600e3).toISOString(),
    ip, user_agent: String(ua || '').slice(0, 300),
    mfa_pending: mfaPending ? 1 : 0,
  });
  return raw;
}

export function loadSession(raw) {
  if (!raw || raw.length > 100) return null;
  const s = db.get('SELECT * FROM sessions WHERE id = ?', sha256(raw));
  if (!s || s.revoked_at) return null;
  const p = securityPolicy();
  const now = Date.now();
  if (Date.parse(s.expires_at) < now || Date.parse(s.last_seen) + p.sessionIdleMinutes * 60e3 < now) {
    db.run('UPDATE sessions SET revoked_at = ? WHERE id = ?', nowIso(), s.id);
    return null;
  }
  const user = db.get('SELECT * FROM users WHERE id = ?', s.user_id);
  if (!user || user.status !== 'aktif') return null;
  // Perbarui last_seen paling sering tiap 30 detik untuk menekan beban tulis.
  if (now - Date.parse(s.last_seen) > 30e3) db.run('UPDATE sessions SET last_seen = ? WHERE id = ?', nowIso(), s.id);
  return { session: s, user };
}

export function revokeSession(id) {
  db.run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', nowIso(), id);
}

export function revokeAllSessions(userId, exceptId = null) {
  db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id IS NOT ?', nowIso(), userId, exceptId);
}

/* --- Masuk ---------------------------------------------------------------- */
const GENERIC = 'Nama pengguna atau kata sandi salah.';

export async function login({ username, password, ip, ua }) {
  const p = securityPolicy();
  const uname = String(username || '').trim().toLowerCase().slice(0, 60);
  const user = db.get('SELECT * FROM users WHERE username = ?', uname);
  const record = (success, reason) => db.run('INSERT INTO login_attempts(ts, username, ip, success, reason) VALUES (?, ?, ?, ?, ?)', nowIso(), uname, ip, success ? 1 : 0, reason);

  const ok = await verifyPassword(String(password || ''), user?.password_hash);
  const ctx = { user: user ? { id: user.id, username: user.username } : null, username: uname, ip };

  if (user && user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    record(false, 'terkunci');
    audit.log(ctx, 'auth.login_blocked', { entity: 'users', entityId: user.id });
    throw new HttpError(423, `Akun dikunci sementara karena terlalu banyak percobaan gagal. Coba lagi setelah ${p.lockoutMinutes} menit atau hubungi admin.`);
  }
  if (!user || !ok || user.status !== 'aktif') {
    record(false, !user ? 'tidak-dikenal' : !ok ? 'sandi-salah' : `status-${user.status}`);
    if (user && !ok) {
      const n = (user.failed_attempts || 0) + 1;
      const lock = n >= p.lockoutThreshold;
      db.run('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', n, lock ? new Date(Date.now() + p.lockoutMinutes * 60e3).toISOString() : null, user.id);
      audit.log(ctx, lock ? 'auth.account_locked' : 'auth.login_failed', { entity: 'users', entityId: user.id, detail: { attempts: n } });
    } else {
      audit.log(ctx, 'auth.login_failed', { detail: { reason: !user ? 'unknown_user' : 'inactive' } });
    }
    throw new HttpError(401, GENERIC);
  }

  db.run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', user.id);
  const perms = permissionsFor(user.role_id);
  const mfaRequired = !!user.mfa_enabled;
  const raw = createSession(user, ip, ua, { mfaPending: mfaRequired });
  if (!mfaRequired) finishLogin(user, ip);
  record(true, mfaRequired ? 'mfa-pending' : 'ok');
  audit.log(ctx, mfaRequired ? 'auth.password_ok_mfa_pending' : 'auth.login', { entity: 'users', entityId: user.id });

  const p2 = securityPolicy();
  const expired = user.password_changed_at && Date.parse(user.password_changed_at) + p2.passwordMaxAgeDays * 864e5 < Date.now();
  const mfaSetupRequired = !user.mfa_enabled && p2.mfaRequiredForAdmin && (perms.admin || 0) >= 3;
  return { token: raw, mfaRequired, mustChangePassword: !!user.must_change_password || !!expired, mfaSetupRequired };
}

function finishLogin(user, ip) {
  db.run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), user.id);
}

export function verifyMfaLogin(sess, code, ctx) {
  const user = db.get('SELECT * FROM users WHERE id = ?', sess.user_id);
  if (!user?.mfa_enabled || !user.mfa_secret) throw bad('MFA tidak aktif.');
  const step = totp.verify(decryptText(user.mfa_secret), code, user.mfa_last_step);
  if (step === null) {
    const n = (user.failed_attempts || 0) + 1;
    const p = securityPolicy();
    const lock = n >= p.lockoutThreshold;
    db.run('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', n, lock ? new Date(Date.now() + p.lockoutMinutes * 60e3).toISOString() : null, user.id);
    if (lock) revokeSession(sess.id);
    audit.log(ctx, 'auth.mfa_failed', { entity: 'users', entityId: user.id });
    throw new HttpError(401, 'Kode MFA tidak valid.');
  }
  db.run('UPDATE users SET mfa_last_step = ?, failed_attempts = 0 WHERE id = ?', step, user.id);
  // Rotasi pengenal sesi setelah naik tingkat autentikasi (cegah session fixation).
  revokeSession(sess.id);
  const raw = createSession(user, ctx.ip, ctx.ua);
  finishLogin(user, ctx.ip);
  audit.log(ctx, 'auth.login', { entity: 'users', entityId: user.id, detail: { mfa: true } });
  return raw;
}

export function startMfaSetup(user) {
  const secret = totp.newSecret();
  db.run('UPDATE users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?', encryptText(secret), user.id);
  return { secret, uri: totp.otpauthUri(secret, user.username) };
}

export function enableMfa(user, code) {
  const u = db.get('SELECT mfa_secret FROM users WHERE id = ?', user.id);
  if (!u?.mfa_secret) throw bad('Mulai pengaturan MFA terlebih dahulu.');
  const step = totp.verify(decryptText(u.mfa_secret), code);
  if (step === null) throw bad('Kode tidak cocok. Pastikan jam perangkat sinkron.');
  db.run('UPDATE users SET mfa_enabled = 1, mfa_last_step = ? WHERE id = ?', step, user.id);
}
