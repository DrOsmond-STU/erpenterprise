-- 0011 — Produksi (Fase 3 sprint 8): BOM, perintah kerja (antre → berjalan →
-- pemeriksaan mutu → selesai), pemakaian bahan ke barang dalam proses (WIP), dan
-- hasil produksi ke barang jadi. Semua mutasi bernilai diposting ke buku besar.

CREATE TABLE boms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  sku text NOT NULL,                               -- barang yang dihasilkan
  name text NOT NULL,
  batch_qty numeric(18,4) NOT NULL CHECK (batch_qty > 0),
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  notes text,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (company_id, code)
);
CREATE TABLE bom_lines (
  id bigserial PRIMARY KEY,
  bom_id uuid NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  line_no int NOT NULL,
  sku text NOT NULL,
  qty numeric(18,4) NOT NULL CHECK (qty > 0),     -- per batch_qty unit hasil
  UNIQUE (bom_id, line_no)
);

CREATE TABLE work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  bom_id uuid NOT NULL REFERENCES boms(id),
  sku text NOT NULL,
  product_name text NOT NULL,
  uom text NOT NULL,
  planned_qty numeric(18,4) NOT NULL CHECK (planned_qty > 0),
  requirements jsonb NOT NULL,                     -- kebutuhan bahan standar (salinan BOM saat dibuat)
  warehouse_code text NOT NULL,                    -- gudang bahan & hasil
  line text,                                       -- lini produksi
  pic text,
  wo_date date NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','antre','berjalan','qc','selesai','batal')),
  progress int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  flag text,
  good_qty numeric(18,4), reject_qty numeric(18,4),
  issued_value bigint NOT NULL DEFAULT 0,
  output_value bigint NOT NULL DEFAULT 0,
  notes text,
  qc_submitted_by uuid, qc_submitted_by_name text, qc_submitted_at timestamptz,
  completed_date date, completed_by uuid, completed_by_name text, qc_note text,
  cancel_reason text,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (company_id, doc_no)
);
CREATE INDEX work_orders_scope_idx ON work_orders (company_id, branch_code, status);

CREATE TABLE wo_consumptions (
  id bigserial PRIMARY KEY,
  wo_id uuid NOT NULL REFERENCES work_orders(id),
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  issue_no int NOT NULL,
  issue_date date NOT NULL,
  sku text NOT NULL,
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  unit_cost bigint NOT NULL,
  value bigint NOT NULL,
  created_by_name text NOT NULL DEFAULT 'Sistem', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wo_consumptions_wo_idx ON wo_consumptions (wo_id);

CREATE TABLE wo_outputs (
  id bigserial PRIMARY KEY,
  wo_id uuid NOT NULL REFERENCES work_orders(id),
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  output_date date NOT NULL,
  good_qty numeric(18,4) NOT NULL CHECK (good_qty > 0),
  reject_qty numeric(18,4) NOT NULL DEFAULT 0 CHECK (reject_qty >= 0),
  unit_cost bigint NOT NULL,
  value bigint NOT NULL,
  created_by_name text NOT NULL DEFAULT 'Sistem', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wo_outputs_wo_idx ON wo_outputs (wo_id);

-- RLS: BOM berlaku seluruh perusahaan; perintah kerja & mutasinya per cabang.
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['boms','bom_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company()) WITH CHECK (company_id = app_company())', t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['work_orders','wo_consumptions','wo_outputs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON boms, bom_lines, work_orders, wo_consumptions, wo_outputs TO erp_app;
GRANT DELETE ON bom_lines TO erp_app;
GRANT USAGE, SELECT ON SEQUENCE bom_lines_id_seq, wo_consumptions_id_seq, wo_outputs_id_seq TO erp_app;

-- Izin (pemicu 0008 ikut memberikannya ke Admin Sistem), peran Staf Produksi.
INSERT INTO permissions (code) VALUES ('production.read'), ('production.manage'), ('production.complete') ON CONFLICT DO NOTHING;
DO $$ DECLARE co record;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true);
    INSERT INTO roles (company_id, code, name) VALUES (co.id, 'produksi', 'Staf Produksi') ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('akuntan_senior','production.read'), ('manajer','production.read'), ('manajer','production.complete'),
               ('produksi','org.branch.read'), ('produksi','inventory.read'), ('produksi','production.read'), ('produksi','production.manage')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;

-- BOM contoh untuk perusahaan demo (KNM) bila barangnya ada; seed baru membuatnya sendiri.
DO $$ DECLARE co uuid; b uuid;
BEGIN
  SELECT id INTO co FROM companies WHERE code = 'KNM';
  IF co IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.company_id', co::text, true), set_config('app.branch_codes', '*', true);
  IF (SELECT count(DISTINCT sku) FROM products WHERE company_id = co AND sku IN ('BRG-1108','BRG-1042','BRG-4501','BRG-5023')) = 4 THEN
    INSERT INTO boms (company_id, code, sku, name, batch_qty) VALUES (co, 'BOM-BRK-B', 'BRG-1108', 'Braket dudukan mesin tipe B — pres & cat', 100)
    ON CONFLICT DO NOTHING RETURNING id INTO b;
    IF b IS NOT NULL THEN
      INSERT INTO bom_lines (bom_id, company_id, line_no, sku, qty) VALUES (b, co, 1, 'BRG-1042', 25), (b, co, 2, 'BRG-4501', 400), (b, co, 3, 'BRG-5023', 5);
    END IF;
  END IF;
  b := NULL;
  IF (SELECT count(DISTINCT sku) FROM products WHERE company_id = co AND sku IN ('BRG-9014','BRG-3390','BRG-4501','BRG-2217','BRG-5023')) = 5 THEN
    INSERT INTO boms (company_id, code, sku, name, batch_qty) VALUES (co, 'BOM-PNL-IP65', 'BRG-9014', 'Panel kendali IP65 — rakit', 1)
    ON CONFLICT DO NOTHING RETURNING id INTO b;
    IF b IS NOT NULL THEN
      INSERT INTO bom_lines (bom_id, company_id, line_no, sku, qty) VALUES (b, co, 1, 'BRG-3390', 12), (b, co, 2, 'BRG-4501', 8), (b, co, 3, 'BRG-2217', 2), (b, co, 4, 'BRG-5023', 0.5);
    END IF;
  END IF;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;
