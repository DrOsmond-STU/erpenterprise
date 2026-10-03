import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { PTKP } from '@erp/domain';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AttendanceService } from './attendance.service.js';
import { EmployeesService } from './employees.service.js';
import { PayrollService } from './payroll.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periode berformat YYYY-MM');
const money = z.number().int('Nilai rupiah bulat').min(0).max(1e11);
const text = (max: number) => z.string().trim().max(max);
const branch = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Pilih cabang');
const digits = (min: number, max: number, label: string) => z.string().trim().transform((v) => v.replace(/[\s.-]/g, '')).pipe(z.string().regex(new RegExp(`^\\d{${min},${max}}$`), label));
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jam berformat HH:MM');

const employeeInput = z.object({
  name: z.string().trim().min(3, 'Nama minimal 3 karakter').max(120), branch, dept: z.string().trim().min(2).max(60), title: text(80).optional(), joinDate: date.optional(),
  employment: z.enum(['tetap', 'kontrak', 'magang']).default('tetap'), ptkp: z.enum(Object.keys(PTKP) as [string, ...string[]]).default('TK/0'),
  basicSalary: money, fixedAllowance: money.default(0), email: z.string().trim().email('Email tidak sah').max(120).optional(),
  nik: digits(16, 16, 'NIK 16 digit').optional(), npwp: digits(15, 16, 'NPWP 15–16 digit').optional(), bankName: text(60).optional(), bankAccount: digits(6, 20, 'Nomor rekening 6–20 digit').optional(),
});
const employeePatch = employeeInput.partial().extend({ status: z.enum(['aktif', 'keluar']).optional() });
const attendanceInput = z.object({
  employeeId: z.string().uuid(), date, status: z.enum(['hadir', 'terlambat', 'izin', 'sakit', 'cuti', 'alpa']),
  clockIn: time.nullable().optional(), clockOut: time.nullable().optional(), overtimeHours: z.number().min(0).max(12).optional(), note: text(200).optional(),
});
const runInput = z.object({ branch, period });
const reasonOnly = z.object({ reason: z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300) });
const payInput = z.object({ bankAccount: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/, 'Pilih rekening'), date, slipIds: z.array(z.string().uuid()).min(1, 'Pilih slip').max(500) });
const dayQuery = z.object({ date });

@Controller('hr')
export class HrController {
  constructor(private readonly emp: EmployeesService, private readonly att: AttendanceService, private readonly pay: PayrollService) {}

  @Get('employees') @RequirePermission('hr.read')
  list(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.emp.list(u, s, r.requestId); }

  @Get('employees/:id') @RequirePermission('hr.read')
  get(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.emp.get(u, s, id, r.requestId); }

  @Post('employees/:id/reveal') @HttpCode(200) @RequirePermission('hr.restricted.read')
  reveal(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.emp.reveal(u, s, id, r.requestId); }

  @Post('employees') @RequirePermission('hr.manage')
  create(@Body(new ZodValidationPipe(employeeInput)) b: z.infer<typeof employeeInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.emp.create(u, s, b as any, r.requestId); }

  @Patch('employees/:id') @RequirePermission('hr.manage')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(employeePatch)) b: z.infer<typeof employeePatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.emp.update(u, s, id, b as any, r.requestId);
  }

  @Get('attendance') @RequirePermission('hr.read')
  day(@Query(new ZodValidationPipe(dayQuery)) q: z.infer<typeof dayQuery>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.att.day(u, s, q.date, r.requestId); }

  @Post('attendance') @HttpCode(200) @RequirePermission('hr.manage')
  record(@Body(new ZodValidationPipe(attendanceInput)) b: z.infer<typeof attendanceInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.att.upsert(u, s, b, r.requestId); }

  @Post('attendance/fill') @HttpCode(200) @RequirePermission('hr.manage')
  fill(@Body(new ZodValidationPipe(dayQuery)) b: z.infer<typeof dayQuery>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.att.fillPresent(u, s, b.date, r.requestId); }

  @Get('payroll/runs') @RequirePermission('hr.read')
  runs(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.pay.runs(u, s, r.requestId); }

  @Get('payroll/runs/:id') @RequirePermission('hr.read')
  getRun(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.pay.getRun(u, s, id, r.requestId); }

  @Post('payroll/runs') @RequirePermission('payroll.process')
  createRun(@Body(new ZodValidationPipe(runInput)) b: z.infer<typeof runInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.pay.createRun(u, s, b, r.requestId); }

  @Post('payroll/runs/:id/post') @HttpCode(200) @RequirePermission('payroll.approve')
  postRun(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.pay.postRun(u, s, id, r.requestId); }

  @Post('payroll/runs/:id/cancel') @HttpCode(200) @RequirePermission('payroll.process|payroll.approve')
  cancelRun(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.pay.cancelRun(u, s, id, b.reason, r.requestId);
  }

  @Get('payroll/payable') @RequirePermission('payroll.pay|payroll.approve')
  payable(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.pay.payable(u, s, r.requestId); }

  @Get('payroll/payments') @RequirePermission('hr.read|payroll.pay')
  payments(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.pay.payments(u, s, r.requestId); }

  @Post('payroll/payments') @RequirePermission('payroll.pay')
  payNow(@Body(new ZodValidationPipe(payInput)) b: z.infer<typeof payInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.pay.pay(u, s, b, r.requestId); }
}
