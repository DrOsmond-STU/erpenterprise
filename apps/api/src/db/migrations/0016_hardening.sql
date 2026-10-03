-- 0016 — Pengerasan (Fase 5): indeks untuk kueri laporan, kartu stok, rekonsiliasi,
-- kotak persetujuan, dan kunci asing yang sering di-join. Idempoten.

CREATE INDEX IF NOT EXISTS stock_moves_wh_idx ON stock_moves (company_id, warehouse_code, sku, move_date);
CREATE INDEX IF NOT EXISTS goods_receipt_lines_receipt_idx ON goods_receipt_lines (receipt_id);
CREATE INDEX IF NOT EXISTS goods_receipt_lines_invoice_idx ON goods_receipt_lines (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS goods_receipt_lines_order_line_idx ON goods_receipt_lines (order_line_id);
CREATE INDEX IF NOT EXISTS ap_invoice_lines_order_line_idx ON ap_invoice_lines (order_line_id) WHERE order_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payslips_status_idx ON payslips (company_id, status, period_code);
CREATE INDEX IF NOT EXISTS payslips_run_idx ON payslips (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payslips_employee_idx ON payslips (employee_id);
CREATE INDEX IF NOT EXISTS depreciation_lines_run_idx ON depreciation_lines (run_id);
CREATE INDEX IF NOT EXISTS depreciation_lines_asset_idx ON depreciation_lines (asset_id);
CREATE INDEX IF NOT EXISTS maintenance_orders_asset_idx ON maintenance_orders (asset_id);
CREATE INDEX IF NOT EXISTS stock_transfers_scope_idx ON stock_transfers (company_id, status, to_branch_code);
CREATE INDEX IF NOT EXISTS stock_adjustments_scope_idx ON stock_adjustments (company_id, branch_code, status);
CREATE INDEX IF NOT EXISTS sales_orders_scope_idx ON sales_orders (company_id, branch_code, status);
CREATE INDEX IF NOT EXISTS purchase_orders_scope_idx ON purchase_orders (company_id, branch_code, status);
CREATE INDEX IF NOT EXISTS cash_transfers_status_idx ON cash_transfers (company_id, status);
CREATE INDEX IF NOT EXISTS pos_shifts_status_idx ON pos_shifts (company_id, status);
CREATE INDEX IF NOT EXISTS payroll_runs_status_idx ON payroll_runs (company_id, status);
CREATE INDEX IF NOT EXISTS audit_company_idx ON audit_log (company_id, at DESC);
CREATE INDEX IF NOT EXISTS document_versions_doc_idx ON document_versions (document_id);

