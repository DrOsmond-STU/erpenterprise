"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appRole = appRole;
exports.migrate = migrate;
/**
 * Pelaksana migrasi SQL. Berjalan sebagai pemilik skema (DATABASE_ADMIN_URL).
 *
 *   node dist/db/migrate.js            # terapkan yang belum diterapkan
 *
 * Berkas migrasi: src/db/migrations/NNNN_nama.sql, diterapkan berurutan dalam
 * satu transaksi per berkas dan dicatat di schema_migrations.
 */
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const pg_1 = __importDefault(require("pg"));
const here = __dirname;
/**
 * Nama peran aplikasi dapat diganti lewat DATABASE_APP_ROLE (mis. hosting cPanel
 * yang mewajibkan awalan akun: "akun_erpapp"). Peran itu harus sudah ada bila
 * pemilik skema tidak berhak CREATE ROLE; migrasi hanya memberi hak akses.
 */
function appRole() {
    const role = process.env.DATABASE_APP_ROLE || 'erp_app';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role))
        throw new Error('DATABASE_APP_ROLE tidak sah.');
    return role;
}
async function migrate(adminUrl, dir = (0, node_path_1.resolve)(here, 'migrations')) {
    const role = appRole();
    const client = new pg_1.default.Client({ connectionString: adminUrl });
    await client.connect();
    const applied = [];
    try {
        await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
        const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
        const files = (0, node_fs_1.readdirSync)(dir).filter((f) => f.endsWith('.sql')).sort();
        for (const f of files) {
            if (done.has(f))
                continue;
            const sql = (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(dir, f), 'utf8').replace(/\berp_app\b/g, role);
            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
                await client.query('COMMIT');
                applied.push(f);
            }
            catch (e) {
                await client.query('ROLLBACK');
                throw new Error(`Migrasi ${f} gagal: ${e.message}`);
            }
        }
    }
    finally {
        await client.end();
    }
    return applied;
}
if (require.main === module) {
    const url = process.env.DATABASE_ADMIN_URL;
    if (!url) {
        console.error('DATABASE_ADMIN_URL belum disetel.');
        process.exit(1);
    }
    migrate(url).then((a) => { console.log(a.length ? `Diterapkan: ${a.join(', ')}` : 'Tidak ada migrasi baru.'); })
        .catch((e) => { console.error(e.message); process.exit(1); });
}
//# sourceMappingURL=migrate.js.map