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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttendanceService = void 0;
/** Kehadiran harian & jam lembur (dasar lembur di penggajian). */
const common_1 = require("@nestjs/common");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
let AttendanceService = class AttendanceService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    /** Daftar harian: semua karyawan aktif cabang beserta catatannya (kosong bila belum diisi). */
    async day(u, s, date, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const rows = (await c.query(`SELECT e.id, e.code, e.name, e.dept, e.branch_code, a.status, a.clock_in, a.clock_out, a.overtime_hours, a.note, a.recorded_by_name
           FROM employees e LEFT JOIN attendance a ON a.employee_id = e.id AND a.att_date = $3
          WHERE e.company_id = $1 AND e.status = 'aktif' AND ($2::text IS NULL OR e.branch_code = $2) ORDER BY e.branch_code, e.name`, [u.companyId, s.branch === 'ALL' ? null : s.branch, date])).rows;
            const out = rows.map((r) => ({ employeeId: r.id, code: r.code, name: r.name, dept: r.dept, branch: (0, sales_shared_js_1.trimBranch)(r.branch_code), status: r.status, clockIn: r.clock_in?.slice(0, 5) ?? null,
                clockOut: r.clock_out?.slice(0, 5) ?? null, overtimeHours: r.overtime_hours === null ? 0 : Number(r.overtime_hours), note: r.note, recordedBy: r.recorded_by_name }));
            const count = (k) => out.filter((r) => r.status === k).length;
            return { date, rows: out, summary: { total: out.length, filled: out.filter((r) => r.status).length, hadir: count('hadir') + count('terlambat'), terlambat: count('terlambat'), absen: count('izin') + count('sakit') + count('cuti') + count('alpa'), overtime: out.reduce((t, r) => t + r.overtimeHours, 0) } };
        });
    }
    async upsert(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            if (!sales_shared_js_1.UUID.test(b.employeeId))
                throw (0, errors_js_1.notFound)('Karyawan');
            const e = (await c.query(`SELECT * FROM employees WHERE company_id = $1 AND id = $2`, [u.companyId, b.employeeId])).rows[0];
            if (!e)
                throw (0, errors_js_1.notFound)('Karyawan');
            const present = b.status === 'hadir' || b.status === 'terlambat';
            if (!present && (b.overtimeHours ?? 0) > 0)
                throw (0, sales_shared_js_1.invalid)('ATT_OVERTIME', 'Lembur hanya untuk karyawan yang hadir.');
            if ((await c.query(`SELECT 1 FROM payslips WHERE employee_id = $1 AND period_code = $2 AND status IN ('diproses','dibayar')`, [b.employeeId, b.date.slice(0, 7)])).rowCount)
                throw (0, sales_shared_js_1.invalid)('ATT_LOCKED', 'Gaji periode ini sudah diposting; kehadiran terkunci.');
            await c.query(`INSERT INTO attendance (company_id, branch_code, employee_id, att_date, status, clock_in, clock_out, overtime_hours, note, recorded_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                     ON CONFLICT (employee_id, att_date) DO UPDATE SET status = EXCLUDED.status, clock_in = EXCLUDED.clock_in, clock_out = EXCLUDED.clock_out, overtime_hours = EXCLUDED.overtime_hours,
                       note = EXCLUDED.note, recorded_by_name = EXCLUDED.recorded_by_name, updated_at = now()`, [u.companyId, e.branch_code, e.id, b.date, b.status, present ? b.clockIn ?? null : null, present ? b.clockOut ?? null : null, present ? b.overtimeHours ?? 0 : 0, b.note ?? null, u.name]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(e.branch_code), userId: u.id, sessionId: u.sessionId, action: 'attendance.recorded', entityType: 'employee', entityId: e.code, after: { date: b.date, status: b.status, overtime: b.overtimeHours ?? 0 }, requestId });
            return { ok: true };
        });
    }
    /** Isi "hadir" untuk karyawan aktif yang belum punya catatan pada tanggal itu. */
    async fillPresent(u, s, date, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const r = await c.query(`INSERT INTO attendance (company_id, branch_code, employee_id, att_date, status, clock_in, clock_out, recorded_by_name)
          SELECT e.company_id, e.branch_code, e.id, $3, 'hadir', '08:00', '17:00', $4 FROM employees e
           WHERE e.company_id = $1 AND e.status = 'aktif' AND ($2::text IS NULL OR e.branch_code = $2)
             AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.employee_id = e.id AND a.att_date = $3)`, [u.companyId, s.branch === 'ALL' ? null : s.branch, date, u.name]);
            return { inserted: r.rowCount };
        });
    }
};
exports.AttendanceService = AttendanceService;
exports.AttendanceService = AttendanceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], AttendanceService);
//# sourceMappingURL=attendance.service.js.map