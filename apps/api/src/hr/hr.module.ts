import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { AttendanceService } from './attendance.service.js';
import { EmployeesService } from './employees.service.js';
import { HrController } from './hr.controller.js';
import { PayrollService } from './payroll.service.js';

@Module({ imports: [LedgerModule], controllers: [HrController], providers: [EmployeesService, AttendanceService, PayrollService] })
export class HrModule {}
