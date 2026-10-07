/* Cadangan terenkripsi dari baris perintah (untuk cron/systemd timer).
 *   node tools/backup.mjs
 * Membaca DB_FILE, BACKUP_DIR, DATA_KEY dari lingkungan. */
import { config } from '../server/config.js';
import * as db from '../server/db.js';
import { createBackup } from '../server/lib/backup.js';

db.open(config.dbFile);
const b = await createBackup();
db.close();
console.log(JSON.stringify({ ok: true, ...b }));
