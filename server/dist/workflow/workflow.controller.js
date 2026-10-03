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
exports.WorkflowController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const compliance_service_js_1 = require("./compliance.service.js");
const documents_service_js_1 = require("./documents.service.js");
const inbox_service_js_1 = require("./inbox.service.js");
const text = (max) => zod_1.z.string().trim().max(max);
const file = zod_1.z.object({ name: zod_1.z.string().trim().min(1).max(200), mime: zod_1.z.string().trim().max(120), base64: zod_1.z.string().min(4).max(1_420_000, 'Ukuran berkas maksimal 1 MB') });
const docInput = zod_1.z.object({
    name: zod_1.z.string().trim().min(3, 'Nama minimal 3 karakter').max(200), docType: zod_1.z.string().trim().min(2).max(40), folder: zod_1.z.string().trim().min(2).max(120).default('Umum'),
    branch: zod_1.z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(), entityType: text(40).optional(), entityRef: text(80).optional(),
    status: zod_1.z.enum(['draf', 'berlaku', 'arsip']).default('berlaku'), expiryDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: text(300).optional(), file,
});
const versionInput = zod_1.z.object({ file, note: text(300).optional() });
const docPatch = zod_1.z.object({ status: zod_1.z.enum(['draf', 'berlaku', 'arsip']).optional(), expiryDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), folder: zod_1.z.string().trim().min(2).max(120).optional(), name: zod_1.z.string().trim().min(3).max(200).optional() });
const listQuery = zod_1.z.object({ entityType: text(40).optional(), entityRef: text(80).optional() });
let WorkflowController = class WorkflowController {
    inbox;
    compliance;
    docs;
    constructor(inbox, compliance, docs) {
        this.inbox = inbox;
        this.compliance = compliance;
        this.docs = docs;
    }
    /** Kotak persetujuan — tanpa izin khusus: isinya disaring izin pengguna sendiri. */
    items(u, s, r) { return this.inbox.items(u, s, r.requestId); }
    sod(u, s, r) { return this.compliance.sod(u, s, r.requestId); }
    chain(u, s, r) { return this.compliance.auditChain(u, s, r.requestId); }
    list(q, u, s, r) { return this.docs.list(u, s, q, r.requestId); }
    get(id, u, s, r) { return this.docs.get(u, s, id, r.requestId); }
    create(b, u, s, r) { return this.docs.create(u, s, b, r.requestId); }
    addVersion(id, b, u, s, r) {
        return this.docs.addVersion(u, s, id, b, r.requestId);
    }
    update(id, b, u, s, r) { return this.docs.update(u, s, id, b, r.requestId); }
    async download(id, v, u, s, r, res) {
        const f = await this.docs.download(u, s, id, v && /^\d+$/.test(v) ? Number(v) : null, r.requestId);
        res.setHeader('Content-Type', f.mime);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Content-SHA256', f.sha256);
        res.setHeader('Cache-Control', 'private, no-store');
        res.end(f.content);
    }
};
exports.WorkflowController = WorkflowController;
__decorate([
    (0, common_1.Get)('inbox'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "items", null);
__decorate([
    (0, common_1.Get)('compliance/sod'),
    (0, context_js_1.RequirePermission)('compliance.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "sod", null);
__decorate([
    (0, common_1.Get)('compliance/audit-chain'),
    (0, context_js_1.RequirePermission)('compliance.read|admin.audit.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "chain", null);
__decorate([
    (0, common_1.Get)('documents'),
    (0, context_js_1.RequirePermission)('doc.read'),
    __param(0, (0, common_1.Query)(new zod_pipe_js_1.ZodValidationPipe(listQuery))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('documents/:id'),
    (0, context_js_1.RequirePermission)('doc.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('documents'),
    (0, context_js_1.RequirePermission)('doc.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(docInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('documents/:id/versions'),
    (0, context_js_1.RequirePermission)('doc.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(versionInput))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "addVersion", null);
__decorate([
    (0, common_1.Patch)('documents/:id'),
    (0, context_js_1.RequirePermission)('doc.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(docPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "update", null);
__decorate([
    (0, common_1.Get)('documents/:id/download'),
    (0, context_js_1.RequirePermission)('doc.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('version')),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __param(5, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], WorkflowController.prototype, "download", null);
exports.WorkflowController = WorkflowController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [inbox_service_js_1.InboxService, compliance_service_js_1.ComplianceService, documents_service_js_1.DocumentsService])
], WorkflowController);
//# sourceMappingURL=workflow.controller.js.map