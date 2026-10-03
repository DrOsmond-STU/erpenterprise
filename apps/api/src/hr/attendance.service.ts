/** Kehadiran harian & jam lembur (dasar lembur di penggajian). */
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { invalid, trimBranch, UUID } from '../sales/sales.shared.js';

export interface AttendanceInput { employeeId: string; date: string; status: 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'cuti' | 'alpa'; clockIn?: string | null; clockOut?: string | null; overtimeHours?: number; note?: string }

@Injectable()
export class AttendanceService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  /** Daftar harian: semua karyawan aktif cabang beserta catatannya (kosong bila belum diisi). */
  async day(u: RequestUser, s: ScopeContext, date: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const rows = (await c.query(`SELECT e.id, e.code, e.name, e.dept, e.branch_code, a.status, a.clock_in, a.clock_out, a.overtime_hours, a.note, a.recorded_by_name
           FROM employees e LEFT JOIN attendance a ON a.employee_id = e.id AND a.att_date = $3
          WHERE e.company_id = $1 AND e.status = 'aktif' AND ($2::text IS NULL OR e.branch_code = $2) ORDER BY e.branch_code, e.name`, [u.companyId, s.branch === 'ALL' ? null : s.branch, date])).rows;
      const out = rows.map((r: any) => ({ employeeId: r.id, code: r.code, name: r.name, dept: r.dept, branch: trimBranch(r.branch_code), status: r.status, clockIn: r.clock_in?.slice(0, 5) ?? null,
        clockOut: r.clock_out?.slice(0, 5) ?? null, overtimeHours: r.overtime_hours === null ? 0 : Number(r.overtime_hours), note: r.note, recordedBy: r.recorded_by_name }));
      const count = (k: string) => out.filter((r) => r.status === k).length;
      return { date, rows: out, summary: { total: out.length, filled: out.filter((r) => r.status).length, hadir: count('hadir') + count('terlambat'), terlambat: count('terlambat'), absen: count('izin') + count('sakit') + count('cuti') + count('alpa'), overtime: out.reduce((t, r) => t + r.overtimeHours, 0) } };
    });
  }

  async upsert(u: RequestUser, s: ScopeContext, b: AttendanceInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      if (!UUID.test(b.employeeId)) throw notFound('Karyawan');
      const e = (await c.query(`SELECT * FROM employees WHERE company_id = $1 AND id = $2`, [u.companyId, b.employeeId])).rows[0];
      if (!e) throw notFound('Karyawan');
      const present = b.status === 'hadir' || b.status === 'terlambat';
      if (!present && (b.overtimeHours ?? 0) > 0) throw invalid('ATT_OVERTIME', 'Lembur hanya untuk karyawan yang hadir.');
      if ((await c.query(`SELECT 1 FROM payslips WHERE employee_id = $1 AND period_code = $2 AND status IN ('diproses','dibayar')`, [b.employeeId, b.date.slice(0, 7)])).rowCount) throw invalid('ATT_LOCKED', 'Gaji periode ini sudah diposting; kehadiran terkunci.');
      await c.query(`INSERT INTO attendance (company_id, branch_code, employee_id, att_date, status, clock_in, clock_out, overtime_hours, note, recorded_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                     ON CONFLICT (employee_id, att_date) DO UPDATE SET status = EXCLUDED.status, clock_in = EXCLUDED.clock_in, clock_out = EXCLUDED.clock_out, overtime_hours = EXCLUDED.overtime_hours,
                       note = EXCLUDED.note, recorded_by_name = EXCLUDED.recorded_by_name, updated_at = now()`,
        [u.companyId, e.branch_code, e.id, b.date, b.status, present ? b.clockIn ?? null : null, present ? b.clockOut ?? null : null, present ? b.overtimeHours ?? 0 : 0, b.note ?? null, u.name]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(e.branch_code), userId: u.id, sessionId: u.sessionId, action: 'attendance.recorded', entityType: 'employee', entityId: e.code, after: { date: b.date, status: b.status, overtime: b.overtimeHours ?? 0 }, requestId });
      return { ok: true };
    });
  }

  /** Isi "hadir" untuk karyawan aktif yang belum punya catatan pada tanggal itu. */
  async fillPresent(u: RequestUser, s: ScopeContext, date: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const r = await c.query(`INSERT INTO attendance (company_id, branch_code, employee_id, att_date, status, clock_in, clock_out, recorded_by_name)
          SELECT e.company_id, e.branch_code, e.id, $3, 'hadir', '08:00', '17:00', $4 FROM employees e
           WHERE e.company_id = $1 AND e.status = 'aktif' AND ($2::text IS NULL OR e.branch_code = $2)
             AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.employee_id = e.id AND a.att_date = $3)`, [u.companyId, s.branch === 'ALL' ? null : s.branch, date, u.name]);
      return { inserted: r.rowCount };
    });
  }
}
