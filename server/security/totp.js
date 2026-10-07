/* TOTP RFC 6238 (HMAC-SHA1, 30 detik, 6 digit) untuk autentikasi multi-faktor.
   Kompatibel dengan Google Authenticator, Microsoft Authenticator, dsb. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHA[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHA[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s) {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHA.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(randomBytes(20));

export function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return code;
}

export const currentStep = (t = Date.now()) => Math.floor(t / 30000);

/** Mengembalikan langkah waktu yang cocok (untuk cegah pemakaian ulang) atau null. */
export function verify(secret, code, lastStep = null, t = Date.now()) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const step = currentStep(t);
  for (const d of [0, -1, 1]) {
    const s = step + d;
    if (lastStep !== null && s <= lastStep) continue;
    const a = Buffer.from(hotp(secret, s)), b = Buffer.from(String(code));
    if (timingSafeEqual(a, b)) return s;
  }
  return null;
}

export const otpauthUri = (secret, account, issuer = 'ERP Enterprise') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
