-- 0013 — Aset tetap & pemeliharaan (Fase 4 sprint 10): perolehan, penyusutan bulanan
-- per cabang, pelepasan, dan perintah pemeliharaan (biaya kas + suku cadang dari
-- stok). Semua diposting ke buku besar.

ALTER TABLE assets
  ADD COLUMN location text,
  ADD COLUMN useful_life_months int CHECK (useful_life_months IS NULL OR useful_life_months > 0),
  ADD COLUMN salvage_value bigint NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  ADD COLUMN depreciated_through date,             -- akhir bulan penyusutan terakhir yang dijurnal
  ADD COLUMN disposed_date date,                   -- diisi bila dilepas lewat sistem (dijurnal)
  ADD COLUMN disposal_proceeds bigint,
  ADD COLUMN disposal_note text,
  ADD COLUMN funding_bank text,
  ADD COLUMN created_by_name text,
  ADD COLUMN created_at timestamptz DEFAULT now();

-- Data lama: umur manfaat dari tarif bulanan; penyusutan s.d. jurnal penyusutan terakhir cabang.
DO $$ DECLARE co record;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true);
    UPDATE assets a SET
      useful_life_months = CASE WHEN a.monthly_depreciation > 0 THEN greatest(1, round(a.acquisition_cost::numeric / a.monthly_depreciation))::int END,
      depreciated_through = (SELECT max(j.journal_date) FROM journals j WHERE j.company_id = co.id AND j.source_type = 'depreciation' AND j.branch_code = a.branch_code AND j.status IN ('posted','reversed'))
     WHERE a.company_id = co.id;
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;

CREATE TABLE depreciation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  period_code text NOT NULL,
  run_date date NOT NULL,
  total bigint NOT NULL,
  asset_count int NOT NULL,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_no),
  UNIQUE (company_id, branch_code, period_code)
);
CREATE TABLE depreciation_lines (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES depreciation_runs(id),
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  asset_id uuid NOT NULL REFERENCES assets(id),
  amount bigint NOT NULL,
  book_value_after bigint NOT NULL
);

CREATE TABLE maintenance_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  asset_id uuid NOT NULL REFERENCES assets(id),
  kind text NOT NULL CHECK (kind IN ('preventif','korektif')),
  priority text NOT NULL DEFAULT 'sedang' CHECK (priority IN ('rendah','sedang','tinggi')),
  assignee text,
  scheduled_date date NOT NULL,
  description text NOT NULL,
  estimated_cost bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'dijadwalkan' CHECK (status IN ('dijadwalkan','berjalan','selesai','batal')),
  completed_date date,
  service_cost bigint,                              -- biaya jasa/kas
  parts_cost bigint,                                -- suku cadang dari stok
  bank_account text,
  legacy boolean NOT NULL DEFAULT false,            -- data awal yang jurnalnya sudah ada
  notes text,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem', created_at timestamptz NOT NULL DEFAULT now(),
  completed_by_name text,
  UNIQUE (company_id, doc_no)
);
CREATE TABLE maintenance_parts (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES maintenance_orders(id),
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  warehouse_code text NOT NULL, sku text NOT NULL,
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  unit_cost bigint NOT NULL, value bigint NOT NULL
);

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['depreciation_runs','depreciation_lines','maintenance_orders','maintenance_parts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON depreciation_runs, depreciation_lines, maintenance_orders, maintenance_parts TO erp_app;
GRANT USAGE, SELECT ON SEQUENCE depreciation_lines_id_seq, maintenance_parts_id_seq TO erp_app;

INSERT INTO permissions (code) VALUES ('asset.read'), ('asset.manage'), ('asset.depreciate') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('akuntan_senior','asset.read'), ('akuntan_senior','asset.depreciate'), ('staf_keuangan','asset.read'), ('staf_keuangan','asset.manage'),
               ('manajer','asset.read'), ('manajer','asset.manage')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;
