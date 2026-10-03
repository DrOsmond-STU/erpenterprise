"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HrModule = void 0;
const common_1 = require("@nestjs/common");
const ledger_module_js_1 = require("../ledger/ledger.module.js");
const attendance_service_js_1 = require("./attendance.service.js");
const employees_service_js_1 = require("./employees.service.js");
const hr_controller_js_1 = require("./hr.controller.js");
const payroll_service_js_1 = require("./payroll.service.js");
let HrModule = class HrModule {
};
exports.HrModule = HrModule;
exports.HrModule = HrModule = __decorate([
    (0, common_1.Module)({ imports: [ledger_module_js_1.LedgerModule], controllers: [hr_controller_js_1.HrController], providers: [employees_service_js_1.EmployeesService, attendance_service_js_1.AttendanceService, payroll_service_js_1.PayrollService] })
], HrModule);
//# sourceMappingURL=hr.module.js.map