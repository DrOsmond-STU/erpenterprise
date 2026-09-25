-- ==========================================================================
-- 0001 — Skema awal: organisasi, identitas, bagan akun, buku besar, audit,
--        sub-buku minimum untuk rekonsiliasi. Lihat docs/09-skema-basis-data.md.
-- Dijalankan oleh pemilik skema (erp_owner). Aplikasi terhubung sebagai erp_app.
-- ==========================================================================

-- Tanpa ekstensi: gen_random_uuid() dan sha256() adalah fungsi inti PostgreSQL 13+,
-- sehingga skema ini juga berjalan di hosting yang tidak menyediakan contrib.

-- Peran aplikasi tanpa BYPASSRLS; kata sandi diatur oleh operator (lihat infra/db-setup.sh).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    CREATE ROLE erp_app LOGIN NOBYPASSRLS PASSWORD 'erp_app_dev';
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- Organisasi
-- --------------------------------------------------------------------------
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  npwp text,
  base_currency text NOT NULL DEFAULT 'IDR',
  fiscal_year_start_month int NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code char(3) NOT NULL CHECK (code ~ '^[A-Z]{3}$'),
  name text NOT NULL,
  short_name text NOT NULL,
  type text NOT NULL,
  city text NOT NULL,
  address text,
  phone text,
  manager_name text,
  is_head_office boolean NOT NULL DEFAULT false,
  main_bank_account_code text,
  petty_cash_account_code text,
  target_monthly bigint NOT NULL DEFAULT 0,
  budget_share numeric(6,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  opened_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  label text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL CHECK (date_to >= date_from),
  period_group text NOT NULL DEFAULT 'Bulan' CHECK (period_group IN ('Bulan','Kuartal','Tahun')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closing','closed')),
  closed_at timestamptz,
  closed_by uuid,
  UNIQUE (company_id, code)
);

-- --------------------------------------------------------------------------
-- Identitas & otorisasi
-- --------------------------------------------------------------------------
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  email text NOT NULL,
  display_name text NOT NULL,
  password_hash text,                       -- Argon2id; NULL bila hanya lewat IdP
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  mfa_enabled boolean NOT NULL DEFAULT false,
  failed_logins int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_uq ON users (company_id, lower(email));

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  name text NOT NULL,
  UNIQUE (company_id, code)
);

CREATE TABLE permissions (code text PRIMARY KEY, description text);
CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permissions(code),
  PRIMARY KEY (role_id, permission_code)
);
-- branch_code 'ALL' = seluruh cabang; selain itu kode cabang 3 huruf
CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  branch_code char(3) NOT NULL DEFAULT 'ALL' CHECK (branch_code ~ '^[A-Z]{3}$'),
  PRIMARY KEY (user_id, role_id, branch_code)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid
);
CREATE INDEX sessions_user_idx ON sessions(user_id, revoked_at);

-- --------------------------------------------------------------------------
-- Bagan akun & rekening
-- --------------------------------------------------------------------------
CREATE TABLE chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('header','detail')),
  category text NOT NULL CHECK (category IN ('Aset','Liabilitas','Ekuitas','Pendapatan','Beban')),
  parent_code text,
  level int NOT NULL DEFAULT 0,
  normal_side text NOT NULL CHECK (normal_side IN ('debit','credit')),
  is_intercompany boolean NOT NULL DEFAULT false,
  is_contra boolean NOT NULL DEFAULT false,
  is_cash boolean NOT NULL DEFAULT false,
  is_computed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  UNIQUE (company_id, code)
);

CREATE TABLE bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  bank_name text NOT NULL,
  account_no_masked text,                   -- hanya 4 digit terakhir; nomor lengkap terenkripsi di kolom terpisah (K-41)
  account_no_enc bytea,
  currency text NOT NULL DEFAULT 'IDR',
  opening_balance bigint NOT NULL DEFAULT 0,
  opening_date date NOT NULL,
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  UNIQUE (company_id, code)
);

-- --------------------------------------------------------------------------
-- Buku besar
-- --------------------------------------------------------------------------
CREATE TABLE journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  period_code text NOT NULL,
  journal_no text NOT NULL,
  journal_date date NOT NULL,
  source_type text NOT NULL,                -- invoice, ap_invoice, payslip, ..., manual, opening
  source_id text,
  rule_code text NOT NULL DEFAULT 'MANUAL',
  ref text,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','posted','rejected','reversed')),
  total_debit bigint NOT NULL DEFAULT 0,
  total_credit bigint NOT NULL DEFAULT 0,
  posted_at timestamptz,
  posted_by uuid,
  reversed_by_journal_id uuid,
  reverses_journal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_by_name text NOT NULL DEFAULT 'Sistem',
  UNIQUE (company_id, journal_no)
);
-- Idempoten posting otomatis (K-22)
CREATE UNIQUE INDEX journals_source_rule_uq ON journals (company_id, source_type, source_id, rule_code) WHERE source_id IS NOT NULL AND status <> 'rejected';
CREATE INDEX journals_scope_idx ON journals (company_id, branch_code, journal_date, status);

CREATE TABLE journal_lines (
  id bigserial PRIMARY KEY,
  journal_id uuid NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  branch_code char(3) NOT NULL,
  journal_date date NOT NULL,
  line_no int NOT NULL,
  account_code text NOT NULL,
  debit bigint NOT NULL DEFAULT 0,
  credit bigint NOT NULL DEFAULT 0,
  bank_account_code text,
  party text,
  counter_branch char(3),
  memo text,
  CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0) AND (debit > 0 OR credit > 0)),
  UNIQUE (journal_id, line_no)
);
CREATE INDEX journal_lines_account_idx ON journal_lines (company_id, account_code, journal_date);
CREATE INDEX journal_lines_bank_idx ON journal_lines (company_id, bank_account_code, journal_date) WHERE bank_account_code IS NOT NULL;
CREATE INDEX journal_lines_branch_idx ON journal_lines (company_id, branch_code, journal_date);

-- Penomoran dokumen per perusahaan/jenis/tahun; baris dikunci saat ambil nomor
CREATE TABLE document_sequences (
  company_id uuid NOT NULL REFERENCES companies(id),
  doc_type text NOT NULL,
  year int NOT NULL,
  last_no int NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, doc_type, year)
);
CREATE OR REPLACE FUNCTION next_doc_no(p_company uuid, p_type text, p_year int) RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  INSERT INTO document_sequences (company_id, doc_type, year, last_no) VALUES (p_company, p_type, p_year, 1)
    ON CONFLICT (company_id, doc_type, year) DO UPDATE SET last_no = document_sequences.last_no + 1
    RETURNING last_no INTO n;
  RETURN n;
END $$;

CREATE TABLE posting_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  source_type text NOT NULL,
  event text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  lines jsonb NOT NULL,
  version int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (company_id, code, version)
);

CREATE TABLE reconciliation_runs (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL,
  branch_code char(3),
  period_code text NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  check_code text NOT NULL,
  subledger_value bigint NOT NULL,
  gl_value bigint NOT NULL,
  diff bigint NOT NULL,
  ok boolean NOT NULL,
  note text
);

-- --------------------------------------------------------------------------
-- Sub-buku minimum (untuk rekonsiliasi Fase 1; modul operasional penuh di Fase 2–4)
-- --------------------------------------------------------------------------
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  doc_no text NOT NULL, customer_name text NOT NULL,
  invoice_date date NOT NULL, due_date date NOT NULL,
  total_gross bigint NOT NULL, cogs_amount bigint NOT NULL DEFAULT 0,
  paid_amount bigint NOT NULL DEFAULT 0, paid_date date, bank_account_code text,
  status text NOT NULL,
  UNIQUE (company_id, doc_no)
);
CREATE TABLE ap_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  doc_no text NOT NULL, supplier_name text NOT NULL, po_ref text,
  kind text NOT NULL DEFAULT 'goods' CHECK (kind IN ('goods','service')), expense_account_code text,
  invoice_date date NOT NULL, due_date date NOT NULL,
  total_gross bigint NOT NULL, paid_amount bigint NOT NULL DEFAULT 0, paid_date date, bank_account_code text,
  three_way_matched boolean NOT NULL DEFAULT false, status text NOT NULL,
  UNIQUE (company_id, doc_no)
);
CREATE TABLE stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL, branch_code char(3) NOT NULL, warehouse_code text NOT NULL,
  sku text NOT NULL, name text NOT NULL, category text NOT NULL, uom text NOT NULL,
  on_hand numeric(18,4) NOT NULL DEFAULT 0, min_qty numeric(18,4) NOT NULL DEFAULT 0, max_qty numeric(18,4),
  avg_cost bigint NOT NULL DEFAULT 0,
  UNIQUE (company_id, sku, branch_code, warehouse_code)
);
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  code text NOT NULL, name text NOT NULL, category text NOT NULL, gl_account_code text NOT NULL,
  acquisition_date date NOT NULL, acquisition_cost bigint NOT NULL, book_value bigint NOT NULL,
  monthly_depreciation bigint NOT NULL DEFAULT 0, status text NOT NULL,
  UNIQUE (company_id, code)
);
CREATE TABLE payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  doc_no text NOT NULL, employee_code text NOT NULL, employee_name text NOT NULL, dept text NOT NULL,
  period_code text NOT NULL, basic bigint NOT NULL, allowance bigint NOT NULL DEFAULT 0, overtime bigint NOT NULL DEFAULT 0,
  deduction bigint NOT NULL DEFAULT 0, net_pay bigint NOT NULL, status text NOT NULL,
  UNIQUE (company_id, doc_no)
);

-- --------------------------------------------------------------------------
-- Jejak audit — append-only dengan rantai hash (K-70, K-71)
-- --------------------------------------------------------------------------
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  company_id uuid,
  branch_code char(3),
  user_id uuid,
  session_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before jsonb,
  after jsonb,
  ip inet,
  user_agent text,
  request_id text,
  prev_hash bytea,
  hash bytea NOT NULL
);
CREATE INDEX audit_entity_idx ON audit_log (entity_type, entity_id, at);
CREATE INDEX audit_user_idx ON audit_log (user_id, at);

CREATE OR REPLACE FUNCTION audit_chain_hash() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prev bytea;
BEGIN
  SELECT hash INTO prev FROM audit_log ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := prev;
  NEW.hash := sha256(convert_to(coalesce(encode(prev, 'hex'), '') || NEW.at::text || coalesce(NEW.user_id::text, '') || NEW.action || NEW.entity_type || coalesce(NEW.entity_id, '') || coalesce(NEW.before::text, '') || coalesce(NEW.after::text, ''), 'UTF8'));
  RETURN NEW;
END $$;
CREATE TRIGGER audit_chain BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_chain_hash();

CREATE OR REPLACE FUNCTION raise_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ERP:IMMUTABLE:Jejak audit tidak dapat diubah atau dihapus.'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION raise_immutable();

-- --------------------------------------------------------------------------
-- Invarian buku besar (dok. 09 §4)
-- --------------------------------------------------------------------------

-- 1. Jurnal terposting seimbang — diperiksa saat COMMIT (constraint trigger tertunda)
CREATE OR REPLACE FUNCTION assert_journal_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE jid uuid; st text; dr bigint; cr bigint; n int;
BEGIN
  IF TG_TABLE_NAME = 'journals' THEN jid := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN jid := OLD.journal_id;
  ELSE jid := NEW.journal_id; END IF;
  SELECT status INTO st FROM journals WHERE id = jid;
  IF st IN ('posted','reversed') THEN
    SELECT coalesce(sum(debit),0), coalesce(sum(credit),0), count(*) INTO dr, cr, n FROM journal_lines WHERE journal_id = jid;
    IF n < 2 THEN RAISE EXCEPTION 'ERP:LEDGER_TOO_FEW_LINES:Jurnal % memerlukan minimal dua baris.', jid; END IF;
    IF dr <> cr THEN RAISE EXCEPTION 'ERP:LEDGER_UNBALANCED:Jurnal % tidak seimbang (debit % ≠ kredit %).', jid, dr, cr; END IF;
    UPDATE journals SET total_debit = dr, total_credit = cr WHERE id = jid AND (total_debit <> dr OR total_credit <> cr);
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journals_balanced AFTER INSERT OR UPDATE OF status ON journals
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_journal_balanced();
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_journal_balanced();

-- 2. Hanya akun detail aktif yang menerima baris; baris kas wajib rekening cabang yang sama
CREATE OR REPLACE FUNCTION assert_line_account() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE acc record; bank record;
BEGIN
  SELECT type, status, is_cash, is_computed INTO acc FROM chart_of_accounts WHERE company_id = NEW.company_id AND code = NEW.account_code;
  IF acc IS NULL THEN RAISE EXCEPTION 'ERP:LEDGER_UNKNOWN_ACCOUNT:Akun % tidak ada di bagan akun.', NEW.account_code; END IF;
  IF acc.type <> 'detail' OR acc.is_computed THEN RAISE EXCEPTION 'ERP:LEDGER_HEADER_ACCOUNT:Akun % adalah akun header/dihitung — hanya akun detail yang menerima jurnal.', NEW.account_code; END IF;
  IF acc.status <> 'aktif' THEN RAISE EXCEPTION 'ERP:LEDGER_INACTIVE_ACCOUNT:Akun % nonaktif.', NEW.account_code; END IF;
  IF acc.is_cash THEN
    IF NEW.bank_account_code IS NULL THEN RAISE EXCEPTION 'ERP:LEDGER_CASH_NEEDS_BANK:Baris Kas & Bank harus menyebut rekening.'; END IF;
    SELECT branch_code, currency INTO bank FROM bank_accounts WHERE company_id = NEW.company_id AND code = NEW.bank_account_code;
    IF bank IS NULL THEN RAISE EXCEPTION 'ERP:LEDGER_UNKNOWN_BANK:Rekening % tidak dikenal.', NEW.bank_account_code; END IF;
    IF bank.branch_code <> NEW.branch_code THEN RAISE EXCEPTION 'ERP:LEDGER_BANK_BRANCH:Rekening % milik cabang %, bukan %.', NEW.bank_account_code, bank.branch_code, NEW.branch_code; END IF;
    IF bank.currency <> 'IDR' THEN RAISE EXCEPTION 'ERP:LEDGER_BANK_CURRENCY:Rekening % berdenominasi valas.', NEW.bank_account_code; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_lines_account BEFORE INSERT OR UPDATE ON journal_lines FOR EACH ROW EXECUTE FUNCTION assert_line_account();

-- 3. Jurnal terposting tidak dapat diubah/dihapus (kecuali transisi posted -> reversed & pengisian penunjuk balik)
CREATE OR REPLACE FUNCTION journals_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('posted','reversed') THEN RAISE EXCEPTION 'ERP:LEDGER_IMMUTABLE:Jurnal terposting tidak dapat dihapus; buat jurnal balik.'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('posted','reversed') THEN
    IF NEW.status NOT IN ('posted','reversed')
       OR NEW.journal_date <> OLD.journal_date OR NEW.branch_code <> OLD.branch_code OR NEW.description <> OLD.description
       OR NEW.journal_no <> OLD.journal_no OR NEW.source_type <> OLD.source_type OR NEW.period_code <> OLD.period_code THEN
      RAISE EXCEPTION 'ERP:LEDGER_IMMUTABLE:Jurnal terposting tidak dapat diubah; buat jurnal balik.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journals_immutable_trg BEFORE UPDATE OR DELETE ON journals FOR EACH ROW EXECUTE FUNCTION journals_immutable();

CREATE OR REPLACE FUNCTION journal_lines_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM journals WHERE id = coalesce(NEW.journal_id, OLD.journal_id);
  IF st IN ('posted','reversed') THEN RAISE EXCEPTION 'ERP:LEDGER_IMMUTABLE:Baris jurnal terposting tidak dapat diubah.'; END IF;
  RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER journal_lines_immutable_trg BEFORE UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION journal_lines_immutable();

-- 4. Tidak ada posting ke periode tertutup; period_code harus memuat tanggal jurnal
CREATE OR REPLACE FUNCTION assert_period_open() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p record;
BEGIN
  IF NEW.status = 'posted' AND (TG_OP = 'INSERT' OR OLD.status <> 'posted') THEN
    SELECT status, date_from, date_to, label INTO p FROM fiscal_periods WHERE company_id = NEW.company_id AND code = NEW.period_code;
    IF p IS NULL THEN RAISE EXCEPTION 'ERP:LEDGER_UNKNOWN_PERIOD:Periode % tidak terdaftar.', NEW.period_code; END IF;
    IF NEW.journal_date < p.date_from OR NEW.journal_date > p.date_to THEN RAISE EXCEPTION 'ERP:LEDGER_PERIOD_MISMATCH:Tanggal jurnal di luar periode %.', p.label; END IF;
    IF p.status <> 'open' AND coalesce(current_setting('app.migration', true), '') <> 'on' THEN
      RAISE EXCEPTION 'ERP:LEDGER_PERIOD_CLOSED:Periode % sudah ditutup; jurnal tidak dapat diposting ke periode terkunci.', p.label;
    END IF;
    NEW.posted_at := coalesce(NEW.posted_at, now());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journals_period_open BEFORE INSERT OR UPDATE OF status ON journals FOR EACH ROW EXECUTE FUNCTION assert_period_open();

-- --------------------------------------------------------------------------
-- Row-level security per cabang (dok. 09 §6) — aplikasi menyetel app.* per transaksi
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_company() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.company_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_branch_allowed(b text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.branch_codes', true), '') = '*'
      OR b = ANY (string_to_array(coalesce(current_setting('app.branch_codes', true), ''), ',')) $$;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['journals','journal_lines','invoices','ap_invoices','stock_items','assets','payslips','bank_accounts','reconciliation_runs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
END $$;

-- Hak peran aplikasi: tanpa DELETE pada jurnal/audit, tanpa tulis pada audit_log selain INSERT
GRANT USAGE ON SCHEMA public TO erp_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO erp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_app;
REVOKE UPDATE, DELETE ON audit_log FROM erp_app;
REVOKE DELETE ON journals, journal_lines FROM erp_app;
GRANT DELETE ON sessions, user_roles, role_permissions TO erp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO erp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO erp_app;

-- Katalog izin (dok. 11 §14)
INSERT INTO permissions(code) VALUES
 ('org.branch.read'),('org.branch.manage'),('org.period.read'),
 ('ledger.period.close'),('ledger.period.reopen'),
 ('ledger.account.read'),('ledger.account.manage'),
 ('ledger.journal.read'),('ledger.journal.create'),('ledger.journal.post'),('ledger.journal.reverse'),
 ('ledger.rules.manage'),('ledger.report.read'),
 ('report.consolidated'),('report.export'),
 ('sales.invoice.read'),('sales.invoice.create'),('sales.invoice.issue'),('sales.receipt.create'),
 ('purchasing.invoice.read'),('purchasing.payment.create'),
 ('inventory.read'),('inventory.adjust'),('inventory.transfer'),
 ('admin.user.manage'),('admin.role.manage'),('admin.audit.read');
