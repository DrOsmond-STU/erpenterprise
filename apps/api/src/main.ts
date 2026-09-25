import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';

export async function createApp(): Promise<NestExpressApplication> {
  const cfg = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: cfg.NODE_ENV === 'production' ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'] });
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  /* K-33/K-64: header keamanan. API tidak menyajikan HTML; CSP dibuat ketat. */
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: cfg.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  }));
  app.use(cookieParser());
  app.use((req: any, res: any, next: () => void) => {
    req.requestId = String(req.headers['x-request-id'] ?? '').slice(0, 64) || randomUUID();
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
  const cfg = loadConfig();
  const app = await createApp();
  await app.listen(cfg.PORT);
  new Logger('Bootstrap').log(`API siap di http://localhost:${cfg.PORT}/api/v1 (${cfg.NODE_ENV})`);
}

if (require.main === module) bootstrap().catch((e) => { console.error(e); process.exit(1); });
