-- 0010 — Persediaan (Fase 3 sprint 7): gudang, penyesuaian/opname stok dengan
-- persetujuan, dan transfer stok antar gudang/cabang (dikirim → dalam
-- perjalanan → diterima). Semua mutasi bernilai diposting ke buku besar.

CREATE TABLE warehouses (
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  branch_code char(3) NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, code)
);

CREATE TABLE stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  warehouse_code text NOT NULL,
  doc_no text NOT NULL,
  adj_date date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('opname','rusak','hilang','koreksi')),
  notes text,
  status text NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','diposting','ditolak','batal')),
  total_value bigint NOT NULL DEFAULT 0,          -- Σ nilai selisih saat diposting (negatif = susut)
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem', created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid, decided_by_name text, decided_at timestamptz, decision_note text,
  UNIQUE (company_id, doc_no)
);
CREATE TABLE stock_adjustment_lines (
  id bigserial PRIMARY KEY,
  adjustment_id uuid NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  line_no int NOT NULL,
  sku text NOT NULL,
  counted_qty numeric(18,4) NOT NULL CHECK (counted_qty >= 0),
  system_qty numeric(18,4),                        -- saat diposting
  diff_qty numeric(18,4),
  unit_cost bigint,
  value bigint,
  note text,
  UNIQUE (adjustment_id, line_no)
);

CREATE TABLE stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,                    -- cabang asal
  to_branch_code char(3) NOT NULL,
  from_warehouse text NOT NULL,
  to_warehouse text NOT NULL,
  doc_no text NOT NULL,
  transfer_date date NOT NULL,
  status text NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','dikirim','diterima','batal')),
  notes text,
  total_value bigint NOT NULL DEFAULT 0,
  shipped_date date, shipped_by_name text,
  received_date date, received_by_name text,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_no),
  CHECK (from_warehouse <> to_warehouse)
);
CREATE TABLE stock_transfer_lines (
  id bigserial PRIMARY KEY,
  transfer_id uuid NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  line_no int NOT NULL,
  sku text NOT NULL,
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  unit_cost bigint, value bigint,
  UNIQUE (transfer_id, line_no)
);

-- Gudang dari kartu stok yang sudah ada + satu gudang per cabang (nama kota).
DO $$ DECLARE co record;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true);
    INSERT INTO warehouses (company_id, code, branch_code, name)
    SELECT DISTINCT ON (si.warehouse_code) co.id, si.warehouse_code, si.branch_code, 'Gudang ' || si.warehouse_code
      FROM stock_items si WHERE si.company_id = co.id ORDER BY si.warehouse_code
    ON CONFLICT DO NOTHING;
    INSERT INTO warehouses (company_id, code, branch_code, name)
    SELECT co.id, coalesce(nullif(split_part(b.short_name, ' ', 1), ''), b.code), b.code, 'Gudang ' || coalesce(nullif(split_part(b.short_name, ' ', 1), ''), b.code)
      FROM branches b WHERE b.company_id = co.id AND NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.company_id = co.id AND w.branch_code = b.code)
    ON CONFLICT DO NOTHING;
    -- Akun barang dalam perjalanan (transfer antar cabang).
    IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = co.id AND code = '1-1500' AND type = 'header')
       AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = co.id AND code = '1-1504') THEN
      INSERT INTO chart_of_accounts (company_id, code, name, type, category, parent_code, level, normal_side, status)
      VALUES (co.id, '1-1504', 'Persediaan dalam Perjalanan', 'detail', 'Aset', '1-1500', 4, 'debit', 'aktif');
    END IF;
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses FORCE ROW LEVEL SECURITY;
CREATE POLICY warehouses_scope ON warehouses USING (company_id = app_company()) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text));
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_transfers_scope ON stock_transfers
  USING (company_id = app_company() AND (app_branch_allowed(branch_code::text) OR app_branch_allowed(to_branch_code::text)))
  WITH CHECK (company_id = app_company() AND (app_branch_allowed(branch_code::text) OR app_branch_allowed(to_branch_code::text)));
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_adjustments','stock_adjustment_lines','stock_transfer_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON warehouses, stock_adjustments, stock_adjustment_lines, stock_transfers, stock_transfer_lines TO erp_app;
GRANT DELETE ON stock_adjustment_lines, stock_transfer_lines TO erp_app;
GRANT USAGE, SELECT ON SEQUENCE stock_adjustment_lines_id_seq, stock_transfer_lines_id_seq TO erp_app;

INSERT INTO permissions (code) VALUES ('inventory.adjust.approve'), ('inventory.warehouse.manage') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('akuntan_senior','inventory.adjust.approve'), ('manajer','inventory.adjust.approve'), ('manajer','inventory.warehouse.manage')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;
