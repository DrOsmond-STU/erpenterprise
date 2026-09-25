"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DbService = exports.systemContext = void 0;
exports.contextOf = contextOf;
const common_1 = require("@nestjs/common");
const pg_1 = __importDefault(require("pg"));
const config_js_1 = require("../config.js");
/* pg mengembalikan bigint/numeric sebagai string; buku besar memakai integer rupiah. */
pg_1.default.types.setTypeParser(20, (v) => Number(v)); // int8
pg_1.default.types.setTypeParser(1700, (v) => Number(v)); // numeric
pg_1.default.types.setTypeParser(1082, (v) => v); // date → 'YYYY-MM-DD' apa adanya
const systemContext = (companyId = null) => ({ userId: null, companyId, branches: '*' });
exports.systemContext = systemContext;
function contextOf(user, scope, requestId) {
    return { userId: user.id, companyId: user.companyId, branches: scope.rlsBranches, requestId };
}
/**
 * Akses basis data. Semua kueri yang menyentuh data transaksi berjalan di
 * dalam `run()` — satu transaksi yang menyetel `app.*` sehingga kebijakan
 * row-level security (dok. 09 §6) membaca konteks pengguna.
 */
let DbService = class DbService {
    log = new common_1.Logger('Db');
    pool;
    constructor() {
        const cfg = (0, config_js_1.loadConfig)();
        this.pool = new pg_1.default.Pool({ connectionString: cfg.DATABASE_URL, max: 10, statement_timeout: 30_000 });
        this.pool.on('error', (e) => this.log.error(`pool: ${e.message}`));
    }
    async run(ctx, fn) {
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
        }
        catch (e) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw e;
        }
        finally {
            client.release();
        }
    }
    onModuleDestroy() { return this.pool.end(); }
};
exports.DbService = DbService;
exports.DbService = DbService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], DbService);
//# sourceMappingURL=db.service.js.map