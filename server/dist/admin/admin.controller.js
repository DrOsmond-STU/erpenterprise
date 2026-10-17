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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const audit_service_js_1 = require("../audit/audit.service.js");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const db_service_js_1 = require("../db/db.service.js");
const auditQuery = zod_1.z.object({
    entity: zod_1.z.string().trim().max(40).optional(),
    entityId: zod_1.z.string().trim().max(80).optional(),
    q: zod_1.z.string().trim().max(100).optional(),
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    size: zod_1.z.coerce.number().int().min(1).max(200).default(50),
});
const exportInput = zod_1.z.object({
    resource: zod_1.z.string().trim().min(1).max(120), title: zod_1.z.string().trim().min(1).max(200), format: zod_1.z.enum(['xlsx', 'pdf']),
    rows: zod_1.z.number().int().min(0).max(1_000_000), filters: zod_1.z.string().trim().max(500).optional(),
});
let AdminController = class AdminController {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    /** K-65: health tanpa detail versi/infrastruktur. */
    async health() {
        const ok = await this.db.pool.query('SELECT 1').then(() => true).catch(() => false);
        return { status: ok ? 'ok' : 'degraded' };
    }
    async auditLog(q, u) {
        return this.db.run((0, db_service_js_1.systemContext)(u.companyId), async (c) => {
            const where = ['(a.company_id = $1 OR a.company_id IS NULL)'];
            const args = [u.companyId];
            if (q.entity) {
                args.push(q.entity);
                where.push(`a.entity_type = $${args.length}`);
            }
            if (q.entityId) {
                args.push(q.entityId);
                where.push(`a.entity_id = $${args.length}`);
            }
            if (q.q) {
                args.push(`%${q.q}%`);
                where.push(`(a.action ILIKE $${args.length} OR a.entity_type ILIKE $${args.length} OR coalesce(a.entity_id,'') ILIKE $${args.length} OR coalesce(u.display_name,'') ILIKE $${args.length} OR coalesce(a.after::text,'') ILIKE $${args.length})`);
            }
            if (q.from) {
                args.push(q.from);
                where.push(`a.at >= $${args.length}::date`);
            }
            if (q.to) {
                args.push(q.to);
                where.push(`a.at < $${args.length}::date + 1`);
            }
            const total = (await c.query(`SELECT count(*)::int AS n FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE ${where.join(' AND ')}`, args)).rows[0].n;
            args.push(q.size, (q.page - 1) * q.size);
            const rows = (await c.query(`SELECT a.id, a.at, a.branch_code, a.user_id, u.display_name AS user_name, a.action, a.entity_type, a.entity_id, a.before, a.after, host(a.ip) AS ip, a.request_id
           FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
            const chain = await this.audit.verifyChain(c, 5000);
            return { data: rows, meta: { page: q.page, size: q.size, total, chain } };
        });
    }
    /**
     * Ekspor tabel (PDF/XLSX) dibuat di peramban dari data yang sudah diizinkan API untuk
     * pengguna ini; endpoint ini menjadi gerbang izin `report.export` dan mencatat setiap
     * ekspor (halaman, cakupan cabang/periode, saringan, jumlah baris) di jejak audit.
     */
    async recordExport(b, u, s, r) {
        const id = (0, node_crypto_1.randomUUID)().slice(0, 8).toUpperCase();
        return this.db.run((0, db_service_js_1.contextOf)(u, s, r.requestId), async (c) => {
            await this.audit.record(c, { companyId: u.companyId, branchCode: s.branch === 'ALL' ? null : s.branch, userId: u.id, sessionId: u.sessionId, action: 'data.exported', entityType: 'export', entityId: b.resource,
                after: { ref: id, title: b.title, format: b.format, rows: b.rows, filters: b.filters ?? null, branch: s.branch, period: s.period }, ip: r.ip ?? null, userAgent: r.headers?.['user-agent'], requestId: r.requestId });
            return { id, at: new Date().toISOString() };
        });
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, context_js_1.Public)(),
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('admin/audit-log'),
    (0, context_js_1.RequirePermission)('admin.audit.read'),
    __param(0, (0, common_1.Query)(new zod_pipe_js_1.ZodValidationPipe(auditQuery))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "auditLog", null);
__decorate([
    (0, common_1.Post)('exports'),
    (0, common_1.HttpCode)(201),
    (0, context_js_1.RequirePermission)('report.export'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(exportInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "recordExport", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map