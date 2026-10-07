/* Pemulihan cadangan terenkripsi.
 *   node tools/restore.mjs <berkas.sqlite.enc> <tujuan.sqlite>
 * Memverifikasi checksum SHA-256 sebelum menulis. Hentikan server terlebih
 * dahulu, lalu arahkan DB_FILE ke berkas hasil pemulihan. */
import { existsSync } from 'node:fs';
import { decryptBackup } from '../server/lib/backup.js';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('Pemakaian: node tools/restore.mjs <berkas.sqlite.enc> <tujuan.sqlite>');
  process.exit(2);
}
if (existsSync(out)) {
  console.error(`Tujuan ${out} sudah ada — tidak ditimpa.`);
  process.exit(1);
}
decryptBackup(src, out);
console.log(`Dipulihkan ke ${out} (checksum cocok).`);
