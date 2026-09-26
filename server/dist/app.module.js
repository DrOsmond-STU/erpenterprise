"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const throttler_1 = require("@nestjs/throttler");
const admin_controller_js_1 = require("./admin/admin.controller.js");
const assistant_module_js_1 = require("./assistant/assistant.module.js");
const audit_module_js_1 = require("./audit/audit.module.js");
const auth_module_js_1 = require("./auth/auth.module.js");
const errors_js_1 = require("./common/errors.js");
const guards_js_1 = require("./common/guards.js");
const db_module_js_1 = require("./db/db.module.js");
const ledger_module_js_1 = require("./ledger/ledger.module.js");
const org_module_js_1 = require("./org/org.module.js");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            throttler_1.ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }] }),
            db_module_js_1.DbModule, audit_module_js_1.AuditModule, auth_module_js_1.AuthModule, ledger_module_js_1.LedgerModule, org_module_js_1.OrgModule, assistant_module_js_1.AssistantModule,
        ],
        controllers: [admin_controller_js_1.AdminController],
        providers: [
            { provide: core_1.APP_FILTER, useClass: errors_js_1.AppExceptionFilter },
            /* Urutan guard: laju → autentikasi → izin → konteks cabang */
            { provide: core_1.APP_GUARD, useClass: throttler_1.ThrottlerGuard },
            { provide: core_1.APP_GUARD, useClass: guards_js_1.JwtAuthGuard },
            { provide: core_1.APP_GUARD, useClass: guards_js_1.PermissionsGuard },
            { provide: core_1.APP_GUARD, useClass: guards_js_1.BranchContextGuard },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map