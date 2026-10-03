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
exports.HrController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const domain_1 = require("@erp/domain");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const attendance_service_js_1 = require("./attendance.service.js");
const employees_service_js_1 = require("./employees.service.js");
const payroll_service_js_1 = require("./payroll.service.js");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const period = zod_1.z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periode berformat YYYY-MM');
const money = zod_1.z.number().int('Nilai rupiah bulat').min(0).max(1e11);
const text = (max) => zod_1.z.string().trim().max(max);
const branch = zod_1.z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Pilih cabang');
const digits = (min, max, label) => zod_1.z.string().trim().transform((v) => v.replace(/[\s.-]/g, '')).pipe(zod_1.z.string().regex(new RegExp(`^\\d{${min},${max}}$`), label));
const time = zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jam berformat HH:MM');
const employeeInput = zod_1.z.object({
    name: zod_1.z.string().trim().min(3, 'Nama minimal 3 karakter').max(120), branch, dept: zod_1.z.string().trim().min(2).max(60), title: text(80).optional(), joinDate: date.optional(),
    employment: zod_1.z.enum(['tetap', 'kontrak', 'magang']).default('tetap'), ptkp: zod_1.z.enum(Object.keys(domain_1.PTKP)).default('TK/0'),
    basicSalary: money, fixedAllowance: money.default(0), email: zod_1.z.string().trim().email('Email tidak sah').max(120).optional(),
    nik: digits(16, 16, 'NIK 16 digit').optional(), npwp: digits(15, 16, 'NPWP 15–16 digit').optional(), bankName: text(60).optional(), bankAccount: digits(6, 20, 'Nomor rekening 6–20 digit').optional(),
});
const employeePatch = employeeInput.partial().extend({ status: zod_1.z.enum(['aktif', 'keluar']).optional() });
const attendanceInput = zod_1.z.object({
    employeeId: zod_1.z.string().uuid(), date, status: zod_1.z.enum(['hadir', 'terlambat', 'izin', 'sakit', 'cuti', 'alpa']),
    clockIn: time.nullable().optional(), clockOut: time.nullable().optional(), overtimeHours: zod_1.z.number().min(0).max(12).optional(), note: text(200).optional(),
});
const runInput = zod_1.z.object({ branch, period });
const reasonOnly = zod_1.z.object({ reason: zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300) });
const payInput = zod_1.z.object({ bankAccount: zod_1.z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/, 'Pilih rekening'), date, slipIds: zod_1.z.array(zod_1.z.string().uuid()).min(1, 'Pilih slip').max(500) });
const dayQuery = zod_1.z.object({ date });
let HrController = class HrController {
    emp;
    att;
    pay;
    constructor(emp, att, pay) {
        this.emp = emp;
        this.att = att;
        this.pay = pay;
    }
    list(u, s, r) { return this.emp.list(u, s, r.requestId); }
    get(id, u, s, r) { return this.emp.get(u, s, id, r.requestId); }
    reveal(id, u, s, r) { return this.emp.reveal(u, s, id, r.requestId); }
    create(b, u, s, r) { return this.emp.create(u, s, b, r.requestId); }
    update(id, b, u, s, r) {
        return this.emp.update(u, s, id, b, r.requestId);
    }
    day(q, u, s, r) { return this.att.day(u, s, q.date, r.requestId); }
    record(b, u, s, r) { return this.att.upsert(u, s, b, r.requestId); }
    fill(b, u, s, r) { return this.att.fillPresent(u, s, b.date, r.requestId); }
    runs(u, s, r) { return this.pay.runs(u, s, r.requestId); }
    getRun(id, u, s, r) { return this.pay.getRun(u, s, id, r.requestId); }
    createRun(b, u, s, r) { return this.pay.createRun(u, s, b, r.requestId); }
    postRun(id, u, s, r) { return this.pay.postRun(u, s, id, r.requestId); }
    cancelRun(id, b, u, s, r) {
        return this.pay.cancelRun(u, s, id, b.reason, r.requestId);
    }
    payable(u, s, r) { return this.pay.payable(u, s, r.requestId); }
    payments(u, s, r) { return this.pay.payments(u, s, r.requestId); }
    payNow(b, u, s, r) { return this.pay.pay(u, s, b, r.requestId); }
};
exports.HrController = HrController;
__decorate([
    (0, common_1.Get)('employees'),
    (0, context_js_1.RequirePermission)('hr.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('employees/:id'),
    (0, context_js_1.RequirePermission)('hr.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('employees/:id/reveal'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('hr.restricted.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "reveal", null);
__decorate([
    (0, common_1.Post)('employees'),
    (0, context_js_1.RequirePermission)('hr.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(employeeInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('employees/:id'),
    (0, context_js_1.RequirePermission)('hr.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(employeePatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "update", null);
__decorate([
    (0, common_1.Get)('attendance'),
    (0, context_js_1.RequirePermission)('hr.read'),
    __param(0, (0, common_1.Query)(new zod_pipe_js_1.ZodValidationPipe(dayQuery))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "day", null);
__decorate([
    (0, common_1.Post)('attendance'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('hr.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(attendanceInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "record", null);
__decorate([
    (0, common_1.Post)('attendance/fill'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('hr.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(dayQuery))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "fill", null);
__decorate([
    (0, common_1.Get)('payroll/runs'),
    (0, context_js_1.RequirePermission)('hr.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "runs", null);
__decorate([
    (0, common_1.Get)('payroll/runs/:id'),
    (0, context_js_1.RequirePermission)('hr.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "getRun", null);
__decorate([
    (0, common_1.Post)('payroll/runs'),
    (0, context_js_1.RequirePermission)('payroll.process'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(runInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "createRun", null);
__decorate([
    (0, common_1.Post)('payroll/runs/:id/post'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('payroll.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "postRun", null);
__decorate([
    (0, common_1.Post)('payroll/runs/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('payroll.process|payroll.approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "cancelRun", null);
__decorate([
    (0, common_1.Get)('payroll/payable'),
    (0, context_js_1.RequirePermission)('payroll.pay|payroll.approve'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "payable", null);
__decorate([
    (0, common_1.Get)('payroll/payments'),
    (0, context_js_1.RequirePermission)('hr.read|payroll.pay'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "payments", null);
__decorate([
    (0, common_1.Post)('payroll/payments'),
    (0, context_js_1.RequirePermission)('payroll.pay'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(payInput))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "payNow", null);
exports.HrController = HrController = __decorate([
    (0, common_1.Controller)('hr'),
    __metadata("design:paramtypes", [employees_service_js_1.EmployeesService, attendance_service_js_1.AttendanceService, payroll_service_js_1.PayrollService])
], HrController);
//# sourceMappingURL=hr.controller.js.map