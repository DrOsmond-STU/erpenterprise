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
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const audit_service_js_1 = require("../audit/audit.service.js");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const db_service_js_1 = require("../db/db.service.js");
const auditQuery = zod_1.z.object({
    entity: zod_1.z.string().trim().max(40).optional(),
    entityId: zod_1.z.string().trim().max(80).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    size: zod_1.z.coerce.number().int().min(1).max(200).default(50),
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
            const total = (await c.query(`SELECT count(*)::int AS n FROM audit_log a WHERE ${where.join(' AND ')}`, args)).rows[0].n;
            args.push(q.size, (q.page - 1) * q.size);
            const rows = (await c.query(`SELECT a.id, a.at, a.branch_code, a.user_id, u.display_name AS user_name, a.action, a.entity_type, a.entity_id, a.before, a.after, host(a.ip) AS ip, a.request_id
           FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
            const chain = await this.audit.verifyChain(c, 5000);
            return { data: rows, meta: { page: q.page, size: q.size, total, chain } };
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
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map