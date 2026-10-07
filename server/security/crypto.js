/* Kriptografi: hash sandi scrypt, enkripsi AES-256-GCM untuk data rahasia
   saat tersimpan (rahasia MFA, berkas cadangan). ISO 27001 A.8.24. */
import { scrypt, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from '../config.js';

const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const KEYLEN = 64;

const scryptAsync = (pw, salt, opts) => new Promise((ok, fail) => scrypt(pw, salt, KEYLEN, opts, (e, k) => (e ? fail(e) : ok(k))));

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(String(password).normalize('NFKC'), salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/* Hash tiruan agar waktu respons sama ketika nama pengguna tidak ada
   (mencegah enumerasi akun lewat analisis waktu). */
let dummyHash = null;
export async function verifyPassword(password, stored) {
  if (!stored) {
    dummyHash = dummyHash || (await hashPassword('dummy-password-for-timing'));
    stored = dummyHash;
    await verifyPassword(password, stored);
    return false;
  }
  const [alg, N, r, p, saltB64, keyB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(String(password).normalize('NFKC'), Buffer.from(saltB64, 'base64'), { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/* --- Kunci data ----------------------------------------------------------- */
let dataKey = null;
export function getDataKey() {
  if (dataKey) return dataKey;
  if (config.dataKey) {
    if (!/^[0-9a-f]{64}$/i.test(config.dataKey)) throw new Error('DATA_KEY harus 64 karakter heksadesimal (256 bit).');
    dataKey = Buffer.from(config.dataKey, 'hex');
    return dataKey;
  }
  if (config.production) throw new Error('DATA_KEY wajib di-set pada lingkungan produksi.');
  // Pengembangan: kunci acak disimpan di samping basis data dengan izin 0600.
  const file = resolve(dirname(config.dbFile === ':memory:' ? resolve(config.root, 'data', 'x') : config.dbFile), '.data-key');
  if (existsSync(file)) {
    dataKey = Buffer.from(readFileSync(file, 'utf8').trim(), 'hex');
  } else {
    mkdirSync(dirname(file), { recursive: true });
    dataKey = randomBytes(32);
    writeFileSync(file, dataKey.toString('hex'), { mode: 0o600 });
    try { chmodSync(file, 0o600); } catch { /* sistem berkas tanpa izin POSIX */ }
  }
  return dataKey;
}

export function encrypt(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', getDataKey(), iv);
  const ct = Buffer.concat([c.update(Buffer.isBuffer(plain) ? plain : Buffer.from(String(plain), 'utf8')), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

export function decrypt(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'base64');
  const d = createDecipheriv('aes-256-gcm', getDataKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]);
}

export const encryptText = (s) => encrypt(s).toString('base64');
export const decryptText = (s) => decrypt(Buffer.from(s, 'base64')).toString('utf8');
