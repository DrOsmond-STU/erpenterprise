"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const helmet_1 = __importDefault(require("helmet"));
const node_crypto_1 = require("node:crypto");
const app_module_js_1 = require("./app.module.js");
const config_js_1 = require("./config.js");
async function createApp() {
    const cfg = (0, config_js_1.loadConfig)();
    const app = await core_1.NestFactory.create(app_module_js_1.AppModule, { logger: cfg.NODE_ENV === 'production' ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'] });
    app.set('trust proxy', 1);
    app.disable('x-powered-by');
    /* K-33/K-64: header keamanan. API tidak menyajikan HTML; CSP dibuat ketat. */
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
        crossOriginResourcePolicy: { policy: 'same-site' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        hsts: cfg.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    }));
    app.use((0, cookie_parser_1.default)());
    app.use((req, res, next) => {
        req.requestId = String(req.headers['x-request-id'] ?? '').slice(0, 64) || (0, node_crypto_1.randomUUID)();
        res.setHeader('X-Request-Id', req.requestId);
        res.setHeader('Cache-Control', 'no-store');
        next();
    });
    app.enableCors({ origin: cfg.WEB_ORIGIN, credentials: true, allowedHeaders: ['Authorization', 'Content-Type', 'X-Branch-Id', 'X-Period-Id', 'X-Request-Id', 'Idempotency-Key', 'If-Match'], exposedHeaders: ['X-Request-Id', 'ETag'] });
    app.setGlobalPrefix('api/v1');
    app.enableShutdownHooks();
    return app;
}
async function bootstrap() {
    const cfg = (0, config_js_1.loadConfig)();
    const app = await createApp();
    await app.listen(cfg.PORT);
    new common_1.Logger('Bootstrap').log(`API siap di http://localhost:${cfg.PORT}/api/v1 (${cfg.NODE_ENV})`);
}
if (require.main === module)
    bootstrap().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=main.js.map