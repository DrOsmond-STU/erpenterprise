"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashModule = void 0;
const common_1 = require("@nestjs/common");
const ledger_module_js_1 = require("../ledger/ledger.module.js");
const cash_controller_js_1 = require("./cash.controller.js");
const statements_service_js_1 = require("./statements.service.js");
const tax_service_js_1 = require("./tax.service.js");
const transfers_service_js_1 = require("./transfers.service.js");
let CashModule = class CashModule {
};
exports.CashModule = CashModule;
exports.CashModule = CashModule = __decorate([
    (0, common_1.Module)({ imports: [ledger_module_js_1.LedgerModule], controllers: [cash_controller_js_1.CashController], providers: [transfers_service_js_1.CashTransfersService, statements_service_js_1.BankStatementsService, tax_service_js_1.TaxSettlementsService] })
], CashModule);
//# sourceMappingURL=cash.module.js.map