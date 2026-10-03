/**
 * Enkripsi kolom rahasia (K-41): AES-256-GCM, format `v1:<base64(iv | tag | ciphertext)>`.
 * Kunci = SHA-256(DATA_ENCRYPTION_KEY), atau diturunkan dari JWT_SECRET bila belum disetel.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { loadConfig } from '../config.js';

let key: Buffer | null = null;
const dataKey = () => {
  if (!key) {
    const cfg = loadConfig();
    key = createHash('sha256').update(cfg.DATA_ENCRYPTION_KEY ?? `erp-data-key:${cfg.JWT_SECRET}`).digest();
  }
  return key;
};

export function encryptField(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', dataKey(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')}`;
}

export function decryptField(enc: string | null | undefined): string | null {
  if (!enc) return null;
  if (!enc.startsWith('v1:')) throw new Error('Format data terenkripsi tidak dikenal');
  const raw = Buffer.from(enc.slice(3), 'base64');
  const d = createDecipheriv('aes-256-gcm', dataKey(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}
