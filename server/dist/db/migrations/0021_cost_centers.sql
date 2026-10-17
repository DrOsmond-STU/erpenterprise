-- 0021 — Pusat biaya (cost center): dimensi analitis pada baris jurnal akun laba rugi,
-- laba rugi per pusat biaya, dan anggaran per pusat biaya.
--  * cost_centers: master tingkat perusahaan (berlaku lintas cabang), hierarki opsional
--    (induk) untuk laporan yang digabung, jenis pusat biaya / pusat laba.
--  * journal_lines.cost_center_id: dimensi baru (nullable; tidak mengubah saldo maupun
--    keseimbangan). Diisi dari jurnal memorial (per baris), faktur penjualan (pendapatan
--    & HPP), tagihan pemasok/PO/PR (beban jasa), dan penggajian (pusat biaya karyawan).
--  * budgets.cost_center_id: anggaran cabang × tahun × pusat biaya (NULL = anggaran
--    cabang seperti sebelumnya); realisasi = baris jurnal bertanda pusat biaya itu.

CREATE TABLE cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'biaya' CHECK (kind IN ('biaya','laba')),
  parent_id uuid REFERENCES cost_centers(id),
  manager_name text,
  description text,
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (company_id, code),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers FORCE ROW LEVEL SECURITY;
CREATE POLICY cost_centers_scope ON cost_centers USING (company_id = app_company()) WITH CHECK (company_id = app_company());
GRANT SELECT, INSERT, UPDATE, DELETE ON cost_centers TO erp_app;

ALTER TABLE journal_lines ADD COLUMN cost_center_id uuid REFERENCES cost_centers(id);
CREATE INDEX journal_lines_cost_center_idx ON journal_lines (company_id, cost_center_id, journal_date) WHERE cost_center_id IS NOT NULL;
ALTER TABLE invoices ADD COLUMN cost_center_id uuid REFERENCES cost_centers(id);
ALTER TABLE ap_invoices ADD COLUMN cost_center_id uuid REFERENCES cost_centers(id);
ALTER TABLE purchase_orders ADD COLUMN cost_center_id uuid REFERENCES cost_centers(id);
ALTER TABLE purchase_requisitions ADD COLUMN cost_center_id uuid REFERENCES cost_centers(id);
ALTER TABLE employees ADD COLUMN cost_center_id uuid REFERENCES cost_centers(id);
ALTER TABLE payslips ADD COLUMN cost_center_id uuid REFERENCES cost_centers(id);

-- Satu anggaran per cabang × tahun × pusat biaya (tanpa pusat biaya = anggaran cabang).
ALTER TABLE budgets ADD COLUMN cost_center_id uuid REFERENCES cost_centers(id);
ALTER TABLE budgets DROP CONSTRAINT budgets_company_id_branch_code_fiscal_year_key;
CREATE UNIQUE INDEX budgets_scope_uq ON budgets (company_id, branch_code, fiscal_year, coalesce(cost_center_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Baris jurnal terposting tetap tidak dapat diubah. Pengecualian sempit untuk migrasi/seed
-- (app.migration = on): menandai dimensi pusat biaya saja, seluruh kolom lain identik.
CREATE OR REPLACE FUNCTION journal_lines_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  IF TG_OP = 'UPDATE' AND coalesce(current_setting('app.migration', true), '') = 'on'
     AND (to_jsonb(NEW) - 'cost_center_id') = (to_jsonb(OLD) - 'cost_center_id') THEN
    RETURN NEW;
  END IF;
  SELECT status INTO st FROM journals WHERE id = coalesce(NEW.journal_id, OLD.journal_id);
  IF st IN ('posted','reversed') THEN RAISE EXCEPTION 'ERP:LEDGER_IMMUTABLE:Baris jurnal terposting tidak dapat diubah.'; END IF;
  RETURN coalesce(NEW, OLD);
END $$;

INSERT INTO permissions (code) VALUES ('costcenter.read'), ('costcenter.manage') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('akuntan_senior','costcenter.read'), ('akuntan_senior','costcenter.manage'),
               ('staf_keuangan','costcenter.read'), ('manajer','costcenter.read')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;

-- Data contoh (KNM): hierarki pusat biaya, penandaan baris jurnal contoh menurut akun,
-- pusat biaya karyawan menurut departemen, dan anggaran pusat biaya CKR tahun berjalan.
-- Dipanggil juga oleh seed untuk basis data baru (setelah jurnal, karyawan & anggaran).
CREATE OR REPLACE FUNCTION seed_cost_center_demo(co uuid) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  y int := extract(year FROM current_date)::int; osm record; ops uuid; kom uuid; cc record; b uuid; acc record; n int := 0; avgm bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM cost_centers WHERE company_id = co) THEN RETURN 0; END IF;
  SELECT id, display_name INTO osm FROM users WHERE company_id = co AND email = 'osmond@knm.co.id';
  IF osm.id IS NULL THEN RETURN 0; END IF;

  INSERT INTO cost_centers (company_id, code, name, kind, manager_name, description, created_by_name)
  VALUES (co, 'PB-OPS', 'Operasional', 'biaya', 'Dedi Kurnia', 'Induk pusat biaya pabrik & logistik', 'Data contoh') RETURNING id INTO ops;
  INSERT INTO cost_centers (company_id, code, name, kind, manager_name, description, created_by_name)
  VALUES (co, 'PB-KOM', 'Komersial', 'laba', 'Rina Wulandari', 'Induk pusat laba penjualan & jasa', 'Data contoh') RETURNING id INTO kom;
  INSERT INTO cost_centers (company_id, code, name, kind, parent_id, manager_name, description, created_by_name) VALUES
    (co, 'PB-PRD', 'Produksi', 'biaya', ops, 'Slamet Riyadi', 'Lini produksi: tenaga kerja langsung, utilitas, penyusutan & pemeliharaan mesin', 'Data contoh'),
    (co, 'PB-GDG', 'Gudang & Logistik', 'biaya', ops, 'Dewi Anggraini', 'Pergudangan, angkutan & selisih persediaan', 'Data contoh'),
    (co, 'PB-PJL', 'Penjualan Barang', 'laba', kom, 'Rina Wulandari', 'Pendapatan penjualan barang, HPP, pemasaran & perjalanan dinas', 'Data contoh'),
    (co, 'PB-JSA', 'Layanan Jasa', 'laba', kom, 'Yuni Astuti', 'Pendapatan jasa & biaya langsungnya', 'Data contoh'),
    (co, 'PB-ADM', 'Administrasi & Umum', 'biaya', NULL, osm.display_name, 'Kantor, keuangan, SDM: gaji staf, sewa, asuransi & perlengkapan', 'Data contoh');

  -- Penandaan data contoh hanya pada dimensi (nilai & akun tidak berubah); diizinkan
  -- pengaman baris jurnal karena berjalan dalam konteks migrasi/seed.
  PERFORM set_config('app.migration', 'on', true);
  UPDATE journal_lines l SET cost_center_id = c.id
    FROM (VALUES ('4-1101','PB-PJL'), ('4-1201','PB-JSA'), ('5-1101','PB-PJL'), ('5-1901','PB-GDG'), ('5-2101','PB-PRD'), ('5-2201','PB-ADM'),
                 ('5-2301','PB-PJL'), ('5-2401','PB-GDG'), ('5-3101','PB-PRD'), ('5-3201','PB-PRD'), ('5-3301','PB-ADM'), ('5-3401','PB-PRD'),
                 ('5-3501','PB-ADM'), ('5-3601','PB-PJL'), ('5-3701','PB-ADM')) AS m(account, cc)
    JOIN cost_centers c ON c.company_id = co AND c.code = m.cc
   WHERE l.company_id = co AND l.account_code = m.account AND l.cost_center_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE employees e SET cost_center_id = c.id
    FROM cost_centers c
   WHERE e.company_id = co AND c.company_id = co AND e.cost_center_id IS NULL
     AND c.code = CASE e.dept WHEN 'Produksi' THEN 'PB-PRD' WHEN 'Gudang' THEN 'PB-GDG' WHEN 'Penjualan' THEN 'PB-PJL' ELSE 'PB-ADM' END;

  -- Anggaran pusat biaya CKR (disetujui): rata-rata realisasi bulanan bertanda × 1,05.
  IF EXISTS (SELECT 1 FROM branches WHERE company_id = co AND code = 'CKR') THEN
    FOR cc IN SELECT id, code, name FROM cost_centers WHERE company_id = co AND code IN ('PB-PRD','PB-PJL','PB-ADM') ORDER BY code LOOP
      INSERT INTO budgets (company_id, branch_code, fiscal_year, name, status, created_by_name, approved_by, approved_by_name, approved_at, cost_center_id)
      VALUES (co, 'CKR', y, 'Anggaran ' || cc.name || ' CKR ' || y, 'disetujui', 'Data contoh', osm.id, osm.display_name, now(), cc.id) RETURNING id INTO b;
      FOR acc IN
        SELECT l.account_code, a.category, sum(CASE WHEN a.category = 'Beban' THEN l.debit - l.credit ELSE l.credit - l.debit END) AS amt,
               count(DISTINCT date_trunc('month', l.journal_date)) AS months
          FROM journal_lines l JOIN journals j ON j.id = l.journal_id JOIN chart_of_accounts a ON a.company_id = l.company_id AND a.code = l.account_code
         WHERE l.company_id = co AND l.branch_code = 'CKR' AND l.cost_center_id = cc.id AND j.status IN ('posted','reversed') AND a.type = 'detail'
           AND extract(year FROM l.journal_date) = y
         GROUP BY l.account_code, a.category HAVING sum(CASE WHEN a.category = 'Beban' THEN l.debit - l.credit ELSE l.credit - l.debit END) > 0
      LOOP
        avgm := round(acc.amt / greatest(acc.months, 1) * CASE WHEN acc.category = 'Beban' THEN 1.05 ELSE 1.08 END / 1000) * 1000;
        INSERT INTO budget_lines (budget_id, company_id, branch_code, account_code, amounts) VALUES (b, co, 'CKR', acc.account_code, array_fill(avgm, ARRAY[12]));
      END LOOP;
    END LOOP;
  END IF;
  RETURN n;
END $$;

DO $$ DECLARE co uuid;
BEGIN
  SELECT id INTO co FROM companies WHERE code = 'KNM';
  IF co IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.company_id', co::text, true), set_config('app.branch_codes', '*', true);
  PERFORM seed_cost_center_demo(co);
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;
