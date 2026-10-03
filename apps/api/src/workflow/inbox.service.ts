/**
 * Kotak persetujuan: semua dokumen yang menunggu keputusan pengguna ini — sesuai izin,
 * cabang (RLS), dan bukan dokumen buatannya sendiri (empat mata).
 */
import { Injectable } from '@nestjs/common';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { contextOf, DbService } from '../db/db.service.js';
import { trimBranch } from '../sales/sales.shared.js';

interface Source { kind: string; label: string; perm: string; link: string; action: string; sql: string }
/* $1 = perusahaan, $2 = id pengguna (teks). Kolom: id, doc_no, title, amount, branch_code, by_name, at. */
const SOURCES: Source[] = [
  { kind: 'journal', label: 'Jurnal memorial', perm: 'ledger.journal.post', link: '/jurnal', action: 'Posting / tolak',
    sql: `SELECT id, journal_no AS doc_no, description AS title, total_debit AS amount, branch_code, created_by_name AS by_name, created_at AS at FROM journals WHERE company_id = $1 AND status = 'pending' AND coalesce(created_by::text, '') <> $2` },
  { kind: 'sales_order', label: 'Pesanan penjualan', perm: 'sales.order.approve', link: '/pesanan-penjualan', action: 'Setujui / tolak',
    sql: `SELECT o.id, o.doc_no, c.name AS title, o.total AS amount, o.branch_code, o.created_by_name AS by_name, o.created_at AS at FROM sales_orders o JOIN customers c ON c.id = o.customer_id WHERE o.company_id = $1 AND o.status = 'menunggu' AND coalesce(o.created_by::text, '') <> $2` },
  { kind: 'invoice', label: 'Faktur draf', perm: 'sales.invoice.issue', link: '/faktur', action: 'Terbitkan',
    sql: `SELECT id, doc_no, customer_name AS title, total_gross AS amount, branch_code, 'Staf' AS by_name, now() AS at FROM invoices WHERE company_id = $1 AND status = 'draf' AND coalesce(created_by::text, '') <> $2` },
  { kind: 'purchase_order', label: 'Pesanan pembelian', perm: 'purchasing.order.approve', link: '/pesanan-pembelian', action: 'Setujui / tolak',
    sql: `SELECT p.id, p.doc_no, s.name AS title, p.total AS amount, p.branch_code, p.created_by_name AS by_name, p.created_at AS at FROM purchase_orders p JOIN suppliers s ON s.id = p.supplier_id WHERE p.company_id = $1 AND p.status = 'menunggu' AND coalesce(p.created_by::text, '') <> $2` },
  { kind: 'purchase_requisition', label: 'Permintaan pembelian', perm: 'purchasing.requisition.approve', link: '/permintaan-pembelian', action: 'Setujui / tolak',
    sql: `SELECT id, doc_no, description || ' (' || department || ', prioritas ' || priority || ')' AS title, estimated_total AS amount, branch_code, requester_name AS by_name, submitted_at AS at FROM purchase_requisitions WHERE company_id = $1 AND status = 'menunggu' AND coalesce(created_by::text, '') <> $2` },
  { kind: 'ap_invoice', label: 'Tagihan pemasok draf', perm: 'purchasing.invoice.post', link: '/tagihan-pemasok', action: 'Posting',
    sql: `SELECT id, doc_no, supplier_name AS title, total_gross AS amount, branch_code, 'Staf' AS by_name, now() AS at FROM ap_invoices WHERE company_id = $1 AND status = 'draf' AND coalesce(created_by::text, '') <> $2` },
  { kind: 'supplier_payment', label: 'Pembayaran pemasok', perm: 'purchasing.payment.approve', link: '/pembayaran', action: 'Setujui',
    sql: `SELECT p.id, p.doc_no, s.name AS title, p.amount, p.branch_code, p.created_by_name AS by_name, p.created_at AS at FROM supplier_payments p JOIN suppliers s ON s.id = p.supplier_id
           WHERE p.company_id = $1 AND p.status = 'menunggu' AND coalesce(p.created_by::text, '') <> $2 AND NOT (coalesce(p.approvals, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('userId', $2)))` },
  { kind: 'cash_transfer', label: 'Transfer kas & bank', perm: 'cash.transfer.approve', link: '/transfer-kas', action: 'Setujui / tolak',
    sql: `SELECT id, doc_no, from_bank_code || ' → ' || to_bank_code AS title, amount, branch_code, created_by_name AS by_name, created_at AS at FROM cash_transfers WHERE company_id = $1 AND status = 'menunggu' AND coalesce(created_by::text, '') <> $2` },
  { kind: 'bank_statement', label: 'Rekonsiliasi bank', perm: 'cash.reconcile.approve', link: '/rekonsiliasi-bank', action: 'Finalisasi',
    sql: `SELECT id, doc_no, bank_account_code || ' ' || period_from || ' s.d. ' || period_to AS title, closing_balance AS amount, branch_code, created_by_name AS by_name, created_at AS at FROM bank_statements WHERE company_id = $1 AND status = 'proses' AND coalesce(created_by::text, '') <> $2` },
  { kind: 'tax_settlement', label: 'Setoran PPN', perm: 'tax.settlement.post', link: '/setoran-pajak', action: 'Posting',
    sql: `SELECT id, doc_no, 'PPN masa ' || period_code AS title, net_amount AS amount, branch_code, created_by_name AS by_name, created_at AS at FROM tax_settlements WHERE company_id = $1 AND status = 'draf' AND coalesce(created_by::text, '') <> $2` },
  { kind: 'stock_adjustment', label: 'Penyesuaian stok', perm: 'inventory.adjust.approve', link: '/penyesuaian-stok', action: 'Setujui / tolak',
    sql: `SELECT id, doc_no, reason || ' — ' || warehouse_code AS title, 0::bigint AS amount, branch_code, created_by_name AS by_name, created_at AS at FROM stock_adjustments WHERE company_id = $1 AND status = 'menunggu' AND coalesce(created_by::text, '') <> $2` },
  { kind: 'stock_transfer', label: 'Transfer stok masuk', perm: 'inventory.transfer', link: '/transfer-stok', action: 'Terima barang',
    sql: `SELECT id, doc_no, from_warehouse || ' → ' || to_warehouse AS title, total_value AS amount, to_branch_code AS branch_code, shipped_by_name AS by_name, created_at AS at FROM stock_transfers WHERE company_id = $1 AND status = 'dikirim' AND app_branch_allowed(to_branch_code::text) AND $2 = $2` },
  { kind: 'work_order', label: 'Pemeriksaan mutu produksi', perm: 'production.complete', link: '/perintah-kerja', action: 'Loloskan QC',
    sql: `SELECT id, doc_no, product_name AS title, issued_value - output_value AS amount, branch_code, qc_submitted_by_name AS by_name, qc_submitted_at AS at FROM work_orders WHERE company_id = $1 AND status = 'qc' AND coalesce(qc_submitted_by::text, '') <> $2` },
  { kind: 'pos_shift', label: 'Shift kasir', perm: 'pos.shift.post', link: '/kasir', action: 'Posting shift',
    sql: `SELECT id, doc_no, cashier_name || ' — toko ' || warehouse_code AS title, coalesce((summary->>'gross')::bigint, 0) AS amount, branch_code, cashier_name AS by_name, closed_at AS at FROM pos_shifts WHERE company_id = $1 AND status = 'ditutup' AND cashier_id::text <> $2` },
  { kind: 'payroll_run', label: 'Daftar gaji', perm: 'payroll.approve', link: '/penggajian', action: 'Posting',
    sql: `SELECT id, doc_no, 'Gaji ' || period_code AS title, coalesce((totals->>'net')::bigint, 0) AS amount, branch_code, created_by_name AS by_name, created_at AS at FROM payroll_runs WHERE company_id = $1 AND status = 'draf' AND coalesce(created_by::text, '') <> $2` },
];

@Injectable()
export class InboxService {
  constructor(private readonly db: DbService) {}

  async items(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
      const out: any[] = [];
      for (const src of SOURCES) {
        if (!u.permissions.has(src.perm)) continue;
        const rows = (await c.query(`${src.sql} ORDER BY 7 DESC NULLS LAST LIMIT 200`, [u.companyId, u.id])).rows;
        for (const r of rows) out.push({ kind: src.kind, label: src.label, action: src.action, link: src.link, id: r.id, docNo: r.doc_no, title: r.title, amount: Number(r.amount ?? 0), branch: trimBranch(r.branch_code), by: r.by_name, at: r.at });
      }
      const byKind = Object.fromEntries(SOURCES.map((x) => [x.kind, out.filter((i) => i.kind === x.kind).length]).filter(([, n]) => n));
      return { count: out.length, byKind, items: out };
    });
  }
}
