/**
 * Pelaksana migrasi SQL. Berjalan sebagai pemilik skema (DATABASE_ADMIN_URL).
 *
 *   node dist/db/migrate.js            # terapkan yang belum diterapkan
 *
 * Berkas migrasi: src/db/migrations/NNNN_nama.sql, diterapkan berurutan dalam
 * satu transaksi per berkas dan dicatat di schema_migrations.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const here = __dirname;

export async function migrate(adminUrl: string, dir = resolve(here, 'migrations')): Promise<string[]> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r: any) => r.name));
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = readFileSync(resolve(dir, f), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
        await client.query('COMMIT');
        applied.push(f);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migrasi ${f} gagal: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

if (require.main === module) {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) { console.error('DATABASE_ADMIN_URL belum disetel.'); process.exit(1); }
  migrate(url).then((a) => { console.log(a.length ? `Diterapkan: ${a.join(', ')}` : 'Tidak ada migrasi baru.'); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
