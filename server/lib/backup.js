/* Pencadangan terenkripsi (AES-256-GCM) dengan checksum SHA-256 dan retensi.
   ISO 27001 A.8.13 (cadangan informasi), A.8.24 (kriptografi). */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import * as db from '../db.js';
import { config } from '../config.js';
import { encrypt, decrypt } from '../security/crypto.js';

const RETAIN = Number(process.env.BACKUP_RETAIN || 14);

export async function createBackup(dir = config.backupDir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const tmp = resolve(dir, `.tmp-${stamp}.sqlite`);
  if (existsSync(tmp)) unlinkSync(tmp);
  db.raw().prepare('VACUUM INTO ?').run(tmp);
  const plain = readFileSync(tmp);
  unlinkSync(tmp);
  const file = resolve(dir, `erp-${stamp}.sqlite.enc`);
  writeFileSync(file, encrypt(plain), { mode: 0o600 });
  const sha256 = createHash('sha256').update(plain).digest('hex');
  writeFileSync(file + '.sha256', sha256 + '\n', { mode: 0o600 });
  // Retensi: simpan N cadangan terbaru.
  const all = listBackups(dir);
  for (const old of all.slice(RETAIN)) {
    unlinkSync(resolve(dir, old.file));
    if (existsSync(resolve(dir, old.file + '.sha256'))) unlinkSync(resolve(dir, old.file + '.sha256'));
  }
  return { file: file.split(/[\\/]/).pop(), bytes: plain.length, sha256 };
}

export function listBackups(dir = config.backupDir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.sqlite.enc')).sort().reverse()
    .map((f) => ({ file: f, bytes: statSync(resolve(dir, f)).size, created: statSync(resolve(dir, f)).mtime.toISOString() }));
}

/** Dekripsi berkas cadangan ke berkas SQLite biasa (dipakai tools/restore.mjs). */
export function decryptBackup(file, out) {
  const plain = decrypt(readFileSync(file));
  const sumFile = file + '.sha256';
  if (existsSync(sumFile)) {
    const expected = readFileSync(sumFile, 'utf8').trim();
    const actual = createHash('sha256').update(plain).digest('hex');
    if (expected !== actual) throw new Error('Checksum cadangan tidak cocok — berkas rusak atau diubah.');
  }
  writeFileSync(out, plain, { mode: 0o600 });
}
