/**
 * Kepatuhan: (1) laporan pemisahan tugas — konflik izin tingkat pengguna dan bukti
 * bahwa kontrol empat mata per dokumen tidak pernah dilanggar; (2) verifikasi penuh
 * rantai hash jejak audit (tautan prev_hash dan hash isi setiap baris, K-71).
 */
import { Injectable } from '@nestjs/common';
import { isSuperuserRole, PER_DOCUMENT_SOD, SOD_CONFLICTS, sodViolations } from '@erp/domain';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { contextOf, DbService } from '../db/db.service.js';

/* Pasangan pembuat/pemutus per jenis dokumen: jumlah dokumen yang diputus oleh pembuatnya sendiri (harus 0). */
/* Setiap kueri mengembalikan nomor dokumen yang diputus oleh pembuatnya sendiri (harus kosong). */
const DOC_CHECKS: { label: string; sql: string }[] = [
  { label: 'Jurnal memorial diposting oleh pembuatnya', sql: `SELECT journal_no AS ref FROM journals WHERE company_id = $1 AND source_type = 'manual' AND reverses_journal_id IS NULL AND status IN ('posted','reversed') AND created_by IS NOT NULL AND created_by = posted_by` },
  { label: 'Transfer kas disetujui pengajunya', sql: `SELECT doc_no AS ref FROM cash_transfers WHERE company_id = $1 AND status IN ('diposting','dibalik') AND created_by = decided_by` },
  { label: 'Penyesuaian stok disetujui pencatatnya', sql: `SELECT doc_no AS ref FROM stock_adjustments WHERE company_id = $1 AND status = 'diposting' AND created_by = decided_by` },
  { label: 'QC produksi diloloskan pelapornya', sql: `SELECT doc_no AS ref FROM work_orders WHERE company_id = $1 AND status = 'selesai' AND qc_submitted_by IS NOT NULL AND qc_submitted_by = completed_by` },
  { label: 'Shift kasir diposting kasirnya', sql: `SELECT doc_no AS ref FROM pos_shifts WHERE company_id = $1 AND status = 'diposting' AND cashier_id = posted_by` },
  { label: 'Daftar gaji diposting penyusunnya', sql: `SELECT doc_no AS ref FROM payroll_runs WHERE company_id = $1 AND status = 'diposting' AND created_by = posted_by` },
  { label: 'Permintaan pembelian disetujui pemohonnya', sql: `SELECT doc_no AS ref FROM purchase_requisitions WHERE company_id = $1 AND status IN ('disetujui','selesai') AND created_by = decided_by` },
  { label: 'Anggaran disetujui penyusunnya', sql: `SELECT trim(branch_code) || '-' || fiscal_year AS ref FROM budgets WHERE company_id = $1 AND status = 'disetujui' AND (approved_by = created_by OR approved_by = submitted_by)` },
  { label: 'Pembayaran pemasok disetujui pengajunya', sql: `SELECT doc_no AS ref FROM supplier_payments WHERE company_id = $1 AND created_by IS NOT NULL AND coalesce(approvals, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('userId', created_by::text))` },
];

@Injectable()
export class ComplianceService {
  constructor(private readonly db: DbService) {}

  async sod(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
      const rows = (await c.query(`SELECT u.id, u.display_name, u.email, u.status, array_remove(array_agg(DISTINCT r.code), NULL) AS roles, array_remove(array_agg(DISTINCT rp.permission_code), NULL) AS perms
           FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id LEFT JOIN role_permissions rp ON rp.role_id = r.id
          WHERE u.company_id = $1 GROUP BY u.id ORDER BY u.display_name`, [u.companyId])).rows;
      const users = rows.map((r: any) => {
        const superuser = (r.roles as string[]).some(isSuperuserRole);
        const perms = new Set<string>(r.perms);
        const perDoc = SOD_CONFLICTS.filter(([a, b]) => PER_DOCUMENT_SOD.has(`${a}|${b}`) && perms.has(a) && perms.has(b)).map(([a, b]) => `${a} ↔ ${b}`);
        return { id: r.id, name: r.display_name, email: r.email, status: r.status, roles: r.roles, superuser, conflicts: superuser ? [] : sodViolations(perms), perDocument: perDoc };
      });
      const documents = [];
      for (const d of DOC_CHECKS) {
        const refs = (await c.query(`${d.sql} ORDER BY 1 LIMIT 50`, [u.companyId])).rows.map((r: any) => r.ref as string);
        documents.push({ label: d.label, count: refs.length, refs });
      }
      return {
        users, documents,
        summary: { users: users.length, withConflicts: users.filter((x) => x.conflicts.length).length, superusers: users.filter((x) => x.superuser).length, documentBreaches: documents.reduce((t, d) => t + d.count, 0) },
      };
    });
  }

  async auditChain(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
      const r = (await c.query(`WITH x AS (
          SELECT id, at, hash, prev_hash, lag(hash) OVER (ORDER BY id) AS expected_prev,
                 sha256(convert_to(coalesce(encode(prev_hash, 'hex'), '') || at::text || coalesce(user_id::text, '') || action || entity_type || coalesce(entity_id, '') || coalesce(before::text, '') || coalesce(after::text, ''), 'UTF8')) AS recomputed
            FROM audit_log)
        SELECT count(*)::int AS checked,
               min(id) FILTER (WHERE prev_hash IS DISTINCT FROM expected_prev) AS link_break,
               min(id) FILTER (WHERE hash <> recomputed) AS content_break,
               max(at) AS last_at, (SELECT encode(hash, 'hex') FROM audit_log ORDER BY id DESC LIMIT 1) AS head
          FROM x`)).rows[0];
      const companyEntries = Number((await c.query('SELECT count(*) FROM audit_log WHERE company_id = $1', [u.companyId])).rows[0].count);
      return { checked: r.checked, companyEntries, linkBrokenAt: r.link_break, contentBrokenAt: r.content_break, intact: r.link_break === null && r.content_break === null, lastAt: r.last_at, head: r.head, verifiedAt: new Date().toISOString() };
    });
  }
}
