"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const zod_1 = require("zod");
const schema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z.coerce.number().int().min(1).max(65535).default(3000),
    WEB_ORIGIN: zod_1.z.string().url().default('http://localhost:5173'),
    DATABASE_URL: zod_1.z.string().min(1),
    DATABASE_ADMIN_URL: zod_1.z.string().min(1).optional(),
    JWT_SECRET: zod_1.z.string().min(32, 'JWT_SECRET minimal 32 karakter'),
    ACCESS_TOKEN_TTL_SECONDS: zod_1.z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_SECONDS: zod_1.z.coerce.number().int().min(300).max(86400).default(43200),
    SEED_PASSWORD: zod_1.z.string().min(12).optional(),
});
let cached = null;
/** Konfigurasi 12-factor: semua dari variabel lingkungan, divalidasi saat start (dok. 12 §3). */
function loadConfig() {
    if (cached)
        return cached;
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new Error(`Konfigurasi tidak sah — ${msg}`);
    }
    if (parsed.data.NODE_ENV === 'production' && parsed.data.SEED_PASSWORD) {
        throw new Error('SEED_PASSWORD tidak boleh disetel di produksi.');
    }
    cached = parsed.data;
    return cached;
}
//# sourceMappingURL=config.js.map