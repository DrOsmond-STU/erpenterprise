import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/** Kesalahan domain dengan kode stabil (dok. 12 §3). */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = HttpStatus.UNPROCESSABLE_ENTITY,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new DomainError('NOT_FOUND', `${what} tidak ditemukan.`, HttpStatus.NOT_FOUND);
export const forbidden = (msg = 'Anda tidak berwenang melakukan tindakan ini.') => new DomainError('FORBIDDEN', msg, HttpStatus.FORBIDDEN);
export const conflict = (code: string, msg: string) => new DomainError(code, msg, HttpStatus.CONFLICT);

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('HTTP');

  catch(err: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: { code: string; message: string; details?: unknown } = { code: 'INTERNAL', message: 'Terjadi kesalahan internal.' };

    if (err instanceof DomainError) {
      status = err.status;
      body = { code: err.code, message: err.message, details: err.details };
    } else if (err instanceof HttpException) {
      status = err.getStatus();
      const r = err.getResponse();
      body = typeof r === 'string' ? { code: httpCode(status), message: r } : { code: httpCode(status), message: (r as any).message ?? err.message, details: (r as any).details };
    } else if (isPgError(err)) {
      /* Pelanggaran invarian basis data (trigger/constraint) — dipetakan ke kode domain, detail tidak bocor. */
      const mapped = mapPgError(err);
      status = mapped.status; body = { code: mapped.code, message: mapped.message };
      if (status >= 500) this.log.error(`${req.method} ${req.url} pg:${err.code} ${err.message}`, undefined, requestId);
    } else {
      this.log.error(`${req.method} ${req.url} ${(err as Error)?.stack ?? err}`, undefined, requestId);
    }
    res.status(status).json({ error: { ...body, request_id: requestId } });
  }
}

const httpCode = (s: number) => ({ 400: 'BAD_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 412: 'PRECONDITION_FAILED', 422: 'VALIDATION', 429: 'RATE_LIMITED' } as Record<number, string>)[s] ?? 'ERROR';

function isPgError(e: unknown): e is { code: string; message: string; constraint?: string } {
  return typeof e === 'object' && e !== null && 'code' in e && typeof (e as any).code === 'string' && /^[0-9A-Z]{5}$/.test((e as any).code);
}

function mapPgError(e: { code: string; message: string; constraint?: string }) {
  if (e.code === 'P0001' || e.code === '23514' || e.code === '23505') {
    const m = /ERP:([A-Z_]+):(.*)$/.exec(e.message);
    if (m) return { status: 422, code: m[1], message: m[2] };
    if (e.code === '23505') return { status: 409, code: 'DUPLICATE', message: 'Data sudah ada.' };
    return { status: 422, code: 'CONSTRAINT', message: 'Data melanggar aturan basis data.' };
  }
  if (e.code === '42501') return { status: 403, code: 'FORBIDDEN', message: 'Akses ke data ini ditolak.' };
  return { status: 500, code: 'DB_ERROR', message: 'Kesalahan basis data.' };
}
