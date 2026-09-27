"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchasingModule = void 0;
const common_1 = require("@nestjs/common");
const ledger_module_js_1 = require("../ledger/ledger.module.js");
const ap_invoices_service_js_1 = require("./ap-invoices.service.js");
const orders_service_js_1 = require("./orders.service.js");
const payments_service_js_1 = require("./payments.service.js");
const purchasing_controller_js_1 = require("./purchasing.controller.js");
const suppliers_service_js_1 = require("./suppliers.service.js");
let PurchasingModule = class PurchasingModule {
};
exports.PurchasingModule = PurchasingModule;
exports.PurchasingModule = PurchasingModule = __decorate([
    (0, common_1.Module)({ imports: [ledger_module_js_1.LedgerModule], controllers: [purchasing_controller_js_1.PurchasingController], providers: [suppliers_service_js_1.SuppliersService, orders_service_js_1.PurchaseOrdersService, ap_invoices_service_js_1.ApInvoicesService, payments_service_js_1.SupplierPaymentsService], exports: [payments_service_js_1.SupplierPaymentsService] })
], PurchasingModule);
//# sourceMappingURL=purchasing.module.js.map