"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppExceptionFilter = exports.conflict = exports.forbidden = exports.notFound = exports.DomainError = void 0;
const common_1 = require("@nestjs/common");
/** Kesalahan domain dengan kode stabil (dok. 12 §3). */
class DomainError extends Error {
    code;
    status;
    details;
    constructor(code, message, status = common_1.HttpStatus.UNPROCESSABLE_ENTITY, details) {
        super(message);
        this.code = code;
        this.status = status;
        this.details = details;
    }
}
exports.DomainError = DomainError;
const notFound = (what) => new DomainError('NOT_FOUND', `${what} tidak ditemukan.`, common_1.HttpStatus.NOT_FOUND);
exports.notFound = notFound;
const forbidden = (msg = 'Anda tidak berwenang melakukan tindakan ini.') => new DomainError('FORBIDDEN', msg, common_1.HttpStatus.FORBIDDEN);
exports.forbidden = forbidden;
const conflict = (code, msg) => new DomainError(code, msg, common_1.HttpStatus.CONFLICT);
exports.conflict = conflict;
let AppExceptionFilter = class AppExceptionFilter {
    log = new common_1.Logger('HTTP');
    catch(err, host) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse();
        const req = ctx.getRequest();
        const requestId = req.requestId;
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let body = { code: 'INTERNAL', message: 'Terjadi kesalahan internal.' };
        if (err instanceof DomainError) {
            status = err.status;
            body = { code: err.code, message: err.message, details: err.details };
        }
        else if (err instanceof common_1.HttpException) {
            status = err.getStatus();
            const r = err.getResponse();
            body = typeof r === 'string' ? { code: httpCode(status), message: r } : { code: httpCode(status), message: r.message ?? err.message, details: r.details };
        }
        else if (isPgError(err)) {
            /* Pelanggaran invarian basis data (trigger/constraint) — dipetakan ke kode domain, detail tidak bocor. */
            const mapped = mapPgError(err);
            status = mapped.status;
            body = { code: mapped.code, message: mapped.message };
            if (status >= 500)
                this.log.error(`${req.method} ${req.url} pg:${err.code} ${err.message}`, undefined, requestId);
        }
        else {
            this.log.error(`${req.method} ${req.url} ${err?.stack ?? err}`, undefined, requestId);
        }
        res.status(status).json({ error: { ...body, request_id: requestId } });
    }
};
exports.AppExceptionFilter = AppExceptionFilter;
exports.AppExceptionFilter = AppExceptionFilter = __decorate([
    (0, common_1.Catch)()
], AppExceptionFilter);
const httpCode = (s) => ({ 400: 'BAD_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 412: 'PRECONDITION_FAILED', 422: 'VALIDATION', 429: 'RATE_LIMITED' }[s] ?? 'ERROR');
function isPgError(e) {
    return typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code);
}
function mapPgError(e) {
    if (e.code === 'P0001' || e.code === '23514' || e.code === '23505') {
        const m = /ERP:([A-Z_]+):(.*)$/.exec(e.message);
        if (m)
            return { status: 422, code: m[1], message: m[2] };
        if (e.code === '23505')
            return { status: 409, code: 'DUPLICATE', message: 'Data sudah ada.' };
        return { status: 422, code: 'CONSTRAINT', message: 'Data melanggar aturan basis data.' };
    }
    if (e.code === '42501')
        return { status: 403, code: 'FORBIDDEN', message: 'Akses ke data ini ditolak.' };
    return { status: 500, code: 'DB_ERROR', message: 'Kesalahan basis data.' };
}
//# sourceMappingURL=errors.js.map