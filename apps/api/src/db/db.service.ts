import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { loadConfig } from '../config.js';
import type { RequestUser, ScopeContext } from '../common/context.js';

/* pg mengembalikan bigint/numeric sebagai string; buku besar memakai integer rupiah. */
pg.types.setTypeParser(20, (v) => Number(v));       // int8
pg.types.setTypeParser(1700, (v) => Number(v));     // numeric
pg.types.setTypeParser(1082, (v) => v);             // date → 'YYYY-MM-DD' apa adanya

export type Queryable = pg.PoolClient | pg.Pool;

export interface DbContext {
  userId: string | null;
  companyId: string | null;
  branches: '*' | string[];
  requestId?: string;
}

export const systemContext = (companyId: string | null = null): DbContext => ({ userId: null, companyId, branches: '*' });

export function contextOf(user: RequestUser, scope: ScopeContext, requestId?: string): DbContext {
  return { userId: user.id, companyId: user.companyId, branches: scope.rlsBranches, requestId };
}

/**
 * Akses basis data. Semua kueri yang menyentuh data transaksi berjalan di
 * dalam `run()` — satu transaksi yang menyetel `app.*` sehingga kebijakan
 * row-level security (dok. 09 §6) membaca konteks pengguna.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly log = new Logger('Db');
  readonly pool: pg.Pool;

  constructor() {
    const cfg = loadConfig();
    this.pool = new pg.Pool({ connectionString: cfg.DATABASE_URL, max: 10, statement_timeout: 30_000 });
    this.pool.on('error', (e) => this.log.error(`pool: ${e.message}`));
  }

  async run<T>(ctx: DbContext, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true), set_config($3, $4, true), set_config($5, $6, true), set_config($7, $8, true)', [
        'app.user_id', ctx.userId ?? '',
        'app.company_id', ctx.companyId ?? '',
        'app.branch_codes', ctx.branches === '*' ? '*' : ctx.branches.join(','),
        'app.request_id', ctx.requestId ?? '',
      ]);
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  onModuleDestroy() { return this.pool.end(); }
}
