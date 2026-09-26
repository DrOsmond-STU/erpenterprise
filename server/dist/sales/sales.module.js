"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalesModule = void 0;
const common_1 = require("@nestjs/common");
const ledger_module_js_1 = require("../ledger/ledger.module.js");
const customers_service_js_1 = require("./customers.service.js");
const invoices_service_js_1 = require("./invoices.service.js");
const orders_service_js_1 = require("./orders.service.js");
const sales_controller_js_1 = require("./sales.controller.js");
let SalesModule = class SalesModule {
};
exports.SalesModule = SalesModule;
exports.SalesModule = SalesModule = __decorate([
    (0, common_1.Module)({ imports: [ledger_module_js_1.LedgerModule], controllers: [sales_controller_js_1.SalesController], providers: [customers_service_js_1.CustomersService, orders_service_js_1.OrdersService, invoices_service_js_1.InvoicesService], exports: [invoices_service_js_1.InvoicesService] })
], SalesModule);
//# sourceMappingURL=sales.module.js.map