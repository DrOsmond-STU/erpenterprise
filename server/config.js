/* Konfigurasi aplikasi — seluruh nilai rahasia dibaca dari variabel
   lingkungan, tidak pernah ditulis di kode (ISO 27001 A.8.9, A.5.17). */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

const production = env.NODE_ENV === 'production';

export const config = {
  root,
  production,
  host: env.HOST || '127.0.0.1',
  port: int(env.PORT, 8080),
  dbFile: env.DB_FILE || resolve(root, 'data', 'erp.sqlite'),
  backupDir: env.BACKUP_DIR || resolve(root, 'data', 'backups'),
  /** Kunci AES-256 (hex 64 karakter) untuk mengenkripsi cadangan & rahasia MFA. */
  dataKey: env.DATA_KEY || '',
  /** Cookie Secure wajib di produksi; di pengembangan lokal (http) boleh mati. */
  cookieSecure: bool(env.COOKIE_SECURE, production),
  trustProxy: bool(env.TRUST_PROXY, false),
  /** Origin publik yang sah, mis. https://erp.contoh.co.id — dipakai pemeriksaan Origin. */
  publicOrigin: env.PUBLIC_ORIGIN || '',
  maxBodyBytes: int(env.MAX_BODY_BYTES, 1024 * 1024),
  logLevel: env.LOG_LEVEL || (production ? 'info' : 'debug'),
  seedDemo: bool(env.SEED_DEMO, !production),
  adminInitialPassword: env.ADMIN_INITIAL_PASSWORD || '',
};

/** Kebijakan keamanan bawaan — dapat diubah admin lewat Pengaturan, disimpan di tabel settings. */
export const DEFAULT_SECURITY_POLICY = {
  passwordMinLength: 12,
  passwordHistory: 5,
  passwordMaxAgeDays: 90,
  lockoutThreshold: 5,
  lockoutMinutes: 15,
  sessionIdleMinutes: 30,
  sessionAbsoluteHours: 10,
  mfaRequiredForAdmin: false,
  loginRateLimitPerMinute: 20,
  apiRateLimitPerMinute: 600,
};
