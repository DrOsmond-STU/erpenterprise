"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrmModule = void 0;
const common_1 = require("@nestjs/common");
const sales_module_js_1 = require("../sales/sales.module.js");
const crm_full_controller_js_1 = require("./crm-full.controller.js");
const crm_controller_js_1 = require("./crm.controller.js");
const crm_service_js_1 = require("./crm.service.js");
const leads_service_js_1 = require("./leads.service.js");
const relations_service_js_1 = require("./relations.service.js");
const service_desk_service_js_1 = require("./service-desk.service.js");
let CrmModule = class CrmModule {
};
exports.CrmModule = CrmModule;
exports.CrmModule = CrmModule = __decorate([
    (0, common_1.Module)({ imports: [sales_module_js_1.SalesModule], controllers: [crm_controller_js_1.CrmController, crm_full_controller_js_1.CrmFullController], providers: [crm_service_js_1.CrmService, leads_service_js_1.LeadsService, relations_service_js_1.RelationsService, service_desk_service_js_1.ServiceDeskService] })
], CrmModule);
//# sourceMappingURL=crm.module.js.map