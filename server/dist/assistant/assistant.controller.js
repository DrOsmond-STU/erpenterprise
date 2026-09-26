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
exports.AssistantController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const assistant_service_js_1 = require("./assistant.service.js");
/* Riwayat percakapan dikirim klien (tanpa status di server); dibatasi agar biaya & ukuran terkendali. */
const chatSchema = zod_1.z.object({
    messages: zod_1.z.array(zod_1.z.object({ role: zod_1.z.enum(['user', 'assistant']), content: zod_1.z.string().trim().min(1).max(4000) })).min(1).max(20),
}).refine((b) => b.messages[0].role === 'user' && b.messages[b.messages.length - 1].role === 'user' && b.messages.every((m, i) => i === 0 || m.role !== b.messages[i - 1].role), {
    message: 'Percakapan harus bergantian pengguna/asisten, diawali dan diakhiri pesan pengguna.',
});
let AssistantController = class AssistantController {
    assistant;
    constructor(assistant) {
        this.assistant = assistant;
    }
    status() { return this.assistant.status(); }
    chat(b, u, s, r) {
        return this.assistant.chat(u, s, b.messages, { requestId: r.requestId, ip: r.ip, userAgent: r.headers['user-agent'] });
    }
};
exports.AssistantController = AssistantController;
__decorate([
    (0, common_1.Get)('assistant/status'),
    (0, context_js_1.RequirePermission)('ledger.report.read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AssistantController.prototype, "status", null);
__decorate([
    (0, common_1.Post)('assistant/chat'),
    (0, context_js_1.RequirePermission)('ledger.report.read'),
    (0, common_1.HttpCode)(200),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(chatSchema))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AssistantController.prototype, "chat", null);
exports.AssistantController = AssistantController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [assistant_service_js_1.AssistantService])
], AssistantController);
//# sourceMappingURL=assistant.controller.js.map