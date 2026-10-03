"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryModule = void 0;
const common_1 = require("@nestjs/common");
const ledger_module_js_1 = require("../ledger/ledger.module.js");
const adjustments_service_js_1 = require("./adjustments.service.js");
const inventory_controller_js_1 = require("./inventory.controller.js");
const inventory_service_js_1 = require("./inventory.service.js");
const stock_transfers_service_js_1 = require("./stock-transfers.service.js");
let InventoryModule = class InventoryModule {
};
exports.InventoryModule = InventoryModule;
exports.InventoryModule = InventoryModule = __decorate([
    (0, common_1.Module)({ imports: [ledger_module_js_1.LedgerModule], controllers: [inventory_controller_js_1.InventoryController], providers: [inventory_service_js_1.InventoryService, adjustments_service_js_1.StockAdjustmentsService, stock_transfers_service_js_1.StockTransfersService] })
], InventoryModule);
//# sourceMappingURL=inventory.module.js.map