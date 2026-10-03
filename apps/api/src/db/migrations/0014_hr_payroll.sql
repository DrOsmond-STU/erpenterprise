-- 0014 — SDM & penggajian (Fase 4 sprint 10): karyawan (data rahasia terenkripsi,
-- K-41), kehadiran & lembur, proses gaji per cabang per periode (BPJS, PPh 21) →
-- posting, dan pembayaran gaji (lintas cabang lewat RK).

-- Akun utang BPJS (di bawah header baru Utang Lain-lain).
DO $$ DECLARE co record;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true);
    IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = co.id AND code = '2-1000') THEN
      INSERT INTO chart_of_accounts (company_id, code, name, type, category, parent_code, level, normal_side, status)
      SELECT co.id, '2-1600', 'Utang Lain-lain', 'header', 'Liabilitas', '2-1000', 3, 'credit', 'aktif'
       WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = co.id AND code = '2-1600');
      INSERT INTO chart_of_accounts (company_id, code, name, type, category, parent_code, level, normal_side, status)
      SELECT co.id, '2-1601', 'Utang BPJS', 'detail', 'Liabilitas', '2-1600', 4, 'credit', 'aktif'
       WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = co.id AND code = '2-1601');
    END IF;
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;

CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  dept text NOT NULL,
  title text,
  join_date date,
  employment text NOT NULL DEFAULT 'tetap' CHECK (employment IN ('tetap','kontrak','magang')),
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','keluar')),
  ptkp text NOT NULL DEFAULT 'TK/0',
  basic_salary bigint NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  fixed_allowance bigint NOT NULL DEFAULT 0 CHECK (fixed_allowance >= 0),
  nik_enc text, npwp_enc text, bank_account_enc text,      -- AES-256-GCM (K-41)
  nik_masked text, npwp_masked text, bank_account_masked text, bank_name text,
  email text,
  created_by_name text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (company_id, code)
);

CREATE TABLE attendance (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  employee_id uuid NOT NULL REFERENCES employees(id),
  att_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('hadir','terlambat','izin','sakit','cuti','alpa')),
  clock_in time, clock_out time,
  overtime_hours numeric(4,2) NOT NULL DEFAULT 0 CHECK (overtime_hours BETWEEN 0 AND 12),
  note text,
  recorded_by_name text, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, att_date)
);
CREATE INDEX attendance_scope_idx ON attendance (company_id, branch_code, att_date);

CREATE TABLE payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  period_code text NOT NULL,
  status text NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','diposting','batal')),
  totals jsonb,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem', created_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid, posted_by_name text, posted_at timestamptz,
  UNIQUE (company_id, doc_no)
);
CREATE UNIQUE INDEX payroll_runs_period_uq ON payroll_runs (company_id, branch_code, period_code) WHERE status <> 'batal';

CREATE TABLE payroll_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,                     -- cabang rekening pembayar
  doc_no text NOT NULL,
  pay_date date NOT NULL,
  bank_account text NOT NULL,
  total bigint NOT NULL,
  slip_count int NOT NULL,
  branches text[] NOT NULL,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_no)
);

ALTER TABLE payslips
  ADD COLUMN run_id uuid REFERENCES payroll_runs(id),
  ADD COLUMN employee_id uuid REFERENCES employees(id),
  ADD COLUMN gross bigint,
  ADD COLUMN bpjs_employee bigint, ADD COLUMN bpjs_employer bigint, ADD COLUMN pph21 bigint, ADD COLUMN other_deduction bigint,
  ADD COLUMN overtime_hours numeric(6,2),
  ADD COLUMN payment_id uuid REFERENCES payroll_payments(id),
  ADD COLUMN paid_date date;

-- Karyawan dari slip gaji yang sudah ada (data awal).
DO $$ DECLARE co record;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true);
    INSERT INTO employees (company_id, branch_code, code, name, dept, basic_salary, fixed_allowance, created_by_name)
    SELECT DISTINCT ON (p.employee_code) co.id, p.branch_code, p.employee_code, p.employee_name, p.dept, p.basic, p.allowance, 'Migrasi'
      FROM payslips p WHERE p.company_id = co.id ORDER BY p.employee_code, p.period_code DESC
    ON CONFLICT DO NOTHING;
    UPDATE payslips p SET employee_id = e.id FROM employees e WHERE e.company_id = co.id AND p.company_id = co.id AND e.code = p.employee_code AND p.employee_id IS NULL;
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employees','attendance','payroll_runs','payroll_payments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON employees, attendance, payroll_runs, payroll_payments TO erp_app;
GRANT DELETE ON payslips TO erp_app;
GRANT USAGE, SELECT ON SEQUENCE attendance_id_seq TO erp_app;

INSERT INTO permissions (code) VALUES ('hr.read'), ('hr.manage'), ('hr.restricted.read'), ('payroll.process'), ('payroll.approve'), ('payroll.pay') ON CONFLICT DO NOTHING;
DO $$ DECLARE co record;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true);
    INSERT INTO roles (company_id, code, name) VALUES (co.id, 'sdm', 'Staf SDM') ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('akuntan_senior','hr.read'), ('akuntan_senior','payroll.approve'), ('staf_keuangan','payroll.pay'), ('manajer','hr.read'),
               ('sdm','org.branch.read'), ('sdm','hr.read'), ('sdm','hr.manage'), ('sdm','hr.restricted.read'), ('sdm','payroll.process')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;
