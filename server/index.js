/* Titik masuk server ERP Enterprise.
     node server/index.js
   Basis data kosong diinisialisasi otomatis: data demo (SEED_DEMO=1, bawaan
   non-produksi) atau hanya akun admin (ADMIN_INITIAL_PASSWORD, produksi).
*/
import { config } from './config.js';
import { createApp, initDb } from './app.js';
import { logEvent } from './http.js';
import * as db from './db.js';
import { seed } from './seed.js';

if (config.production) {
  // Konfigurasi aman wajib di produksi (ISO 27001 A.8.9).
  if (!/^[0-9a-f]{64}$/i.test(config.dataKey)) { console.error('DATA_KEY (64 hex) wajib di-set pada produksi.'); process.exit(1); }
  if (!config.cookieSecure) console.error('PERINGATAN: COOKIE_SECURE=0 di produksi — cookie sesi dapat bocor lewat HTTP.');
}

initDb();
const empty = !db.get('SELECT id FROM users LIMIT 1');
if (empty) {
  if (!config.seedDemo && !config.adminInitialPassword) {
    console.error('Basis data kosong. Set ADMIN_INITIAL_PASSWORD (produksi) atau SEED_DEMO=1 (demo) untuk inisialisasi.');
    process.exit(1);
  }
  try {
    await seed({ demo: config.seedDemo, adminPassword: config.adminInitialPassword });
  } catch (err) {
    console.error(`Inisialisasi gagal: ${err.message}`);
    process.exit(1);
  }
}

const server = createApp();
server.listen(config.port, config.host, () => {
  logEvent('info', 'server.start', { url: `http://${config.host}:${config.port}`, production: config.production, db: config.dbFile });
});

const shutdown = (sig) => {
  logEvent('info', 'server.stop', { sig });
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
