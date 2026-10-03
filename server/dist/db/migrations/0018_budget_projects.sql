-- 0018 — Anggaran & proyek (Fase 6 sprint 13, dok. 07 §9.1 & §10.6).
-- Anggaran per cabang/tahun/akun/bulan dibandingkan realisasi dari buku besar dan
-- komitmen pengadaan (PO/PR jasa yang belum ditagih). Proyek dengan tugas & kemajuan;
-- biaya/pendapatan aktual proyek = baris jurnal yang ditandai proyek (dimensi baru
-- journal_lines.project_id) — dari jurnal memorial dan tagihan pemasok atas PO proyek.

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  customer_id uuid REFERENCES customers(id),
  customer_name text NOT NULL DEFAULT 'Internal',
  pm_name text NOT NULL,
  budget bigint NOT NULL DEFAULT 0 CHECK (budget >= 0),          -- anggaran biaya
  contract_value bigint NOT NULL DEFAULT 0 CHECK (contract_value >= 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'perencanaan' CHECK (status IN ('perencanaan','berjalan','ditunda','selesai','batal')),
  manual_progress int CHECK (manual_progress BETWEEN 0 AND 100), -- dipakai bila proyek tanpa tugas
  notes text,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (company_id, code),
  CHECK (end_date >= start_date)
);
CREATE INDEX projects_scope_idx ON projects (company_id, branch_code, status);

CREATE TABLE project_tasks (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  line_no int NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  progress int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  weight numeric(8,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  assignee text,
  UNIQUE (project_id, line_no),
  CHECK (end_date >= start_date)
);

-- Dimensi proyek pada buku besar (nullable; tidak mengubah saldo maupun keseimbangan).
ALTER TABLE journal_lines ADD COLUMN project_id uuid REFERENCES projects(id);
CREATE INDEX journal_lines_project_idx ON journal_lines (company_id, project_id) WHERE project_id IS NOT NULL;
ALTER TABLE purchase_requisitions ADD COLUMN project_id uuid REFERENCES projects(id);
ALTER TABLE purchase_orders ADD COLUMN project_id uuid REFERENCES projects(id);
ALTER TABLE ap_invoices ADD COLUMN project_id uuid REFERENCES projects(id);

CREATE TABLE budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  fiscal_year int NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2100),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','menunggu','disetujui')),
  notes text,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  submitted_by uuid, submitted_at timestamptz,
  approved_by uuid, approved_by_name text, approved_at timestamptz,
  revision int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (company_id, branch_code, fiscal_year)
);

CREATE TABLE budget_lines (
  id bigserial PRIMARY KEY,
  budget_id uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  account_code text NOT NULL,
  amounts bigint[] NOT NULL CHECK (array_length(amounts, 1) = 12),  -- Jan..Des
  note text,
  UNIQUE (budget_id, account_code)
);

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects','project_tasks','budgets','budget_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON projects, project_tasks, budgets, budget_lines TO erp_app;
GRANT DELETE ON project_tasks, budget_lines TO erp_app;
GRANT USAGE, SELECT ON SEQUENCE project_tasks_id_seq, budget_lines_id_seq TO erp_app;

-- Akun yang dianggarkan ikut dijaga pengaman bagan akun.
CREATE OR REPLACE FUNCTION coa_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.code <> OLD.code OR NEW.company_id <> OLD.company_id THEN
      RAISE EXCEPTION 'ERP:ACCOUNT_CODE_IMMUTABLE:Nomor akun % tidak dapat diubah.', OLD.code;
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.company_id = OLD.company_id AND c.parent_code = OLD.code) THEN
    RAISE EXCEPTION 'ERP:ACCOUNT_HAS_CHILDREN:Akun % masih memiliki akun di bawahnya.', OLD.code;
  END IF;
  IF EXISTS (SELECT 1 FROM journal_lines l WHERE l.company_id = OLD.company_id AND l.account_code = OLD.code) THEN
    RAISE EXCEPTION 'ERP:ACCOUNT_IN_USE:Akun % sudah dipakai jurnal.', OLD.code;
  END IF;
  IF EXISTS (SELECT 1 FROM ap_invoices a WHERE a.company_id = OLD.company_id AND a.expense_account_code = OLD.code)
     OR EXISTS (SELECT 1 FROM assets a WHERE a.company_id = OLD.company_id AND a.gl_account_code = OLD.code)
     OR EXISTS (SELECT 1 FROM purchase_order_lines l WHERE l.company_id = OLD.company_id AND l.expense_account_code = OLD.code)
     OR EXISTS (SELECT 1 FROM purchase_requisition_lines l WHERE l.company_id = OLD.company_id AND l.expense_account_code = OLD.code)
     OR EXISTS (SELECT 1 FROM budget_lines l WHERE l.company_id = OLD.company_id AND l.account_code = OLD.code)
     OR EXISTS (SELECT 1 FROM ap_invoice_lines l WHERE l.company_id = OLD.company_id AND l.account_code = OLD.code) THEN
    RAISE EXCEPTION 'ERP:ACCOUNT_LINKED:Akun % terkait dokumen lain.', OLD.code;
  END IF;
  RETURN OLD;
END $$;

INSERT INTO permissions (code) VALUES ('budget.read'), ('budget.manage'), ('budget.approve'), ('project.read'), ('project.manage') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('akuntan_senior','budget.read'), ('akuntan_senior','budget.approve'), ('akuntan_senior','project.read'),
               ('staf_keuangan','budget.read'), ('staf_keuangan','budget.manage'), ('staf_keuangan','project.read'),
               ('manajer','budget.read'), ('manajer','budget.approve'), ('manajer','project.read'), ('manajer','project.manage'),
               ('produksi','project.read')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;

-- Data contoh (KNM): anggaran CKR tahun berjalan untuk beberapa akun beban aktif,
-- dan dua proyek dengan tugas. Dipanggil juga oleh seed untuk basis data baru.
CREATE OR REPLACE FUNCTION seed_planning_demo(co uuid) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  y int := extract(year FROM current_date)::int; b uuid; p uuid; acc record; osm record; avgm bigint; n int := 0; cust record;
BEGIN
  IF EXISTS (SELECT 1 FROM budgets WHERE company_id = co) OR EXISTS (SELECT 1 FROM projects WHERE company_id = co) THEN RETURN 0; END IF;
  SELECT id, display_name INTO osm FROM users WHERE company_id = co AND email = 'osmond@knm.co.id';
  IF osm.id IS NULL OR NOT EXISTS (SELECT 1 FROM branches WHERE company_id = co AND code = 'CKR') THEN RETURN 0; END IF;

  INSERT INTO budgets (company_id, branch_code, fiscal_year, name, status, created_by, created_by_name, approved_by, approved_by_name, approved_at)
  VALUES (co, 'CKR', y, 'Anggaran operasional CKR ' || y, 'disetujui', NULL, 'Data contoh', osm.id, osm.display_name, now()) RETURNING id INTO b;
  -- Akun beban dengan realisasi terbesar: anggaran bulanan = rata-rata realisasi × 1,05 (dibulatkan ribuan).
  FOR acc IN
    SELECT l.account_code, sum(l.debit - l.credit) AS amt, count(DISTINCT date_trunc('month', l.journal_date)) AS months
      FROM journal_lines l JOIN journals j ON j.id = l.journal_id JOIN chart_of_accounts a ON a.company_id = l.company_id AND a.code = l.account_code
     WHERE l.company_id = co AND l.branch_code = 'CKR' AND j.status IN ('posted','reversed') AND a.category = 'Beban' AND a.type = 'detail'
       AND extract(year FROM l.journal_date) = y
     GROUP BY l.account_code HAVING sum(l.debit - l.credit) > 0 ORDER BY 2 DESC LIMIT 8
  LOOP
    avgm := round(acc.amt / greatest(acc.months, 1) * 1.05 / 1000) * 1000;
    INSERT INTO budget_lines (budget_id, company_id, branch_code, account_code, amounts) VALUES (b, co, 'CKR', acc.account_code, array_fill(avgm, ARRAY[12]));
    n := n + 1;
  END LOOP;

  SELECT id, name INTO cust FROM customers WHERE company_id = co ORDER BY code LIMIT 1;
  INSERT INTO projects (company_id, branch_code, code, name, customer_id, customer_name, pm_name, budget, contract_value, start_date, end_date, status, created_by_name)
  VALUES (co, 'CKR', 'PRJ-' || y || '-' || lpad(next_doc_no(co, 'PRJ', y)::text, 3, '0'), 'Retrofit lini perakitan', cust.id, coalesce(cust.name, 'Internal'), osm.display_name, 1850000000, 2400000000, make_date(y, 6, 15), make_date(y, 12, 31), 'berjalan', 'Data contoh')
  RETURNING id INTO p;
  INSERT INTO project_tasks (project_id, company_id, branch_code, line_no, name, start_date, end_date, progress, assignee) VALUES
    (p, co, 'CKR', 1, 'Survei & desain', make_date(y, 6, 15), make_date(y, 7, 31), 100, 'Slamet Riyadi'),
    (p, co, 'CKR', 2, 'Pengadaan material', make_date(y, 7, 15), make_date(y, 9, 30), 80, 'Dewi Anggraini'),
    (p, co, 'CKR', 3, 'Fabrikasi & instalasi', make_date(y, 9, 1), make_date(y, 11, 30), 30, 'Dedi Kurnia'),
    (p, co, 'CKR', 4, 'Komisioning & serah terima', make_date(y, 12, 1), make_date(y, 12, 31), 0, 'Yuni Astuti');
  INSERT INTO projects (company_id, branch_code, code, name, customer_name, pm_name, budget, start_date, end_date, status, manual_progress, created_by_name)
  VALUES (co, 'CKR', 'PRJ-' || y || '-' || lpad(next_doc_no(co, 'PRJ', y)::text, 3, '0'), 'Otomasi panel internal', 'Internal', osm.display_name, 320000000, make_date(y, 10, 1), make_date(y + 1, 2, 28), 'perencanaan', 0, 'Data contoh');
  RETURN n;
END $$;

DO $$ DECLARE co uuid;
BEGIN
  SELECT id INTO co FROM companies WHERE code = 'KNM';
  IF co IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.company_id', co::text, true), set_config('app.branch_codes', '*', true);
  PERFORM seed_planning_demo(co);
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;
