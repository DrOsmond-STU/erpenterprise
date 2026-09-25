"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerModule = void 0;
const common_1 = require("@nestjs/common");
const journals_service_js_1 = require("./journals.service.js");
const ledger_controller_js_1 = require("./ledger.controller.js");
const ledger_shared_js_1 = require("./ledger.shared.js");
const reconciliation_service_js_1 = require("./reconciliation.service.js");
const reports_service_js_1 = require("./reports.service.js");
let LedgerModule = class LedgerModule {
};
exports.LedgerModule = LedgerModule;
exports.LedgerModule = LedgerModule = __decorate([
    (0, common_1.Module)({
        controllers: [ledger_controller_js_1.LedgerController],
        providers: [ledger_shared_js_1.LedgerRefs, journals_service_js_1.JournalsService, reports_service_js_1.ReportsService, reconciliation_service_js_1.ReconciliationService],
        exports: [ledger_shared_js_1.LedgerRefs, reconciliation_service_js_1.ReconciliationService, reports_service_js_1.ReportsService],
    })
], LedgerModule);
//# sourceMappingURL=ledger.module.js.map