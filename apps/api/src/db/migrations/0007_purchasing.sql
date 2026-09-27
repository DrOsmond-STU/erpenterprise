-- 0007 — Pembelian & hutang (Fase 2 sprint 5, dok. 07 §6 & §10.3, dok. 11 K-24…K-26).
-- Pemasok (rekening bank dengan persetujuan orang kedua + masa tunggu), pesanan
-- pembelian, penerimaan barang (stok + jurnal ke akun barang diterima belum
-- ditagih), tagihan pemasok berbaris (kecocokan tiga arah), dan pembayaran
-- dengan persetujuan satu/dua orang. Data contoh diisi oleh seed.

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  name text NOT NULL,
  category text,
  pic text, phone text, email text, address text, city text, npwp text,
  branch_code char(3),
  terms_days int NOT NULL DEFAULT 30 CHECK (terms_days BETWEEN 0 AND 365),
  lead_days int NOT NULL DEFAULT 7 CHECK (lead_days BETWEEN 0 AND 365),
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','pantau','diblokir','nonaktif')),
  -- Rekening pembayaran (hanya 4 digit terakhir; nomor lengkap di luar sistem, K-41).
  bank_name text, bank_account_last4 text, bank_holder text,
  bank_verified_at timestamptz, bank_verified_by uuid,
  bank_pending jsonb, bank_pending_by uuid, bank_pending_by_name text, bank_pending_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (company_id, code)
);
CREATE UNIQUE INDEX suppliers_name_uq ON suppliers (company_id, lower(name));

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  order_date date NOT NULL,
  expected_date date,
  status text NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','menunggu','disetujui','ditolak','diterima-sebagian','selesai','batal')),
  subtotal bigint NOT NULL DEFAULT 0, discount bigint NOT NULL DEFAULT 0, net_amount bigint NOT NULL DEFAULT 0,
  ppn_amount bigint NOT NULL DEFAULT 0, total bigint NOT NULL DEFAULT 0,
  notes text,
  approval_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  submitted_at timestamptz,
  decided_by uuid, decided_by_name text, decided_at timestamptz, decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (company_id, doc_no)
);
CREATE INDEX purchase_orders_scope_idx ON purchase_orders (company_id, branch_code, order_date);

CREATE TABLE purchase_order_lines (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  line_no int NOT NULL,
  product_id uuid REFERENCES products(id),
  sku text, description text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('barang','jasa')),
  expense_account_code text,                   -- baris jasa/biaya: akun detail yang didebit saat tagihan diposting
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  unit text NOT NULL,
  price bigint NOT NULL CHECK (price >= 0),
  disc_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (disc_pct BETWEEN 0 AND 100),
  net bigint NOT NULL,
  qty_received numeric(18,4) NOT NULL DEFAULT 0,
  qty_invoiced numeric(18,4) NOT NULL DEFAULT 0,
  UNIQUE (order_id, line_no),
  CHECK (qty_received >= 0 AND qty_received <= qty AND qty_invoiced >= 0 AND qty_invoiced <= qty)
);

CREATE TABLE goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  order_id uuid NOT NULL REFERENCES purchase_orders(id),
  receipt_date date NOT NULL,
  warehouse_code text NOT NULL,
  delivery_note text,
  total_value bigint NOT NULL DEFAULT 0,
  journal_id uuid REFERENCES journals(id),
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_no)
);
CREATE TABLE goods_receipt_lines (
  id bigserial PRIMARY KEY,
  receipt_id uuid NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  order_line_id bigint NOT NULL REFERENCES purchase_order_lines(id),
  sku text NOT NULL, description text NOT NULL,
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  unit_cost bigint NOT NULL,
  value bigint NOT NULL,
  invoice_id uuid                              -- tagihan yang menagih baris ini (GRNI dilunasi tepat sebesar nilainya)
);

-- Tagihan pemasok: tabel sub-buku 0001 diperluas menjadi dokumen penuh.
ALTER TABLE ap_invoices ADD COLUMN supplier_id uuid REFERENCES suppliers(id);
-- (goods_receipt_lines.invoice_id merujuk ap_invoices; FK ditambahkan setelah kolom ada)
ALTER TABLE ap_invoices ADD COLUMN purchase_order_id uuid REFERENCES purchase_orders(id);
ALTER TABLE ap_invoices ADD COLUMN supplier_invoice_no text;
ALTER TABLE ap_invoices ADD COLUMN subtotal bigint NOT NULL DEFAULT 0;
ALTER TABLE ap_invoices ADD COLUMN discount bigint NOT NULL DEFAULT 0;
ALTER TABLE ap_invoices ADD COLUMN net_amount bigint NOT NULL DEFAULT 0;
ALTER TABLE ap_invoices ADD COLUMN ppn_amount bigint NOT NULL DEFAULT 0;
ALTER TABLE ap_invoices ADD COLUMN notes text;
ALTER TABLE ap_invoices ADD COLUMN created_by uuid;
ALTER TABLE ap_invoices ADD COLUMN created_by_name text NOT NULL DEFAULT 'Sistem';
ALTER TABLE ap_invoices ADD COLUMN posted_by uuid;
ALTER TABLE ap_invoices ADD COLUMN posted_by_name text;
ALTER TABLE ap_invoices ADD COLUMN posted_at timestamptz;
ALTER TABLE ap_invoices ADD COLUMN cancel_date date;
ALTER TABLE ap_invoices ADD COLUMN cancel_reason text;
ALTER TABLE ap_invoices ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE ap_invoices ADD COLUMN updated_at timestamptz;
ALTER TABLE goods_receipt_lines ADD CONSTRAINT goods_receipt_lines_invoice_fk FOREIGN KEY (invoice_id) REFERENCES ap_invoices(id);
CREATE INDEX ap_invoices_scope_idx ON ap_invoices (company_id, branch_code, invoice_date);
CREATE INDEX ap_invoices_supplier_idx ON ap_invoices (company_id, supplier_id, status);

CREATE TABLE ap_invoice_lines (
  id bigserial PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES ap_invoices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  line_no int NOT NULL,
  order_line_id bigint REFERENCES purchase_order_lines(id),
  sku text, description text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('barang','jasa')),
  account_code text NOT NULL,                  -- akun detail yang didebit (barang: pemetaan GRNI; jasa: akun biaya)
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  unit text NOT NULL,
  price bigint NOT NULL CHECK (price >= 0),
  net bigint NOT NULL,
  UNIQUE (invoice_id, line_no)
);

CREATE TABLE supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  payment_date date NOT NULL,
  invoice_id uuid NOT NULL REFERENCES ap_invoices(id),
  supplier_id uuid REFERENCES suppliers(id),
  amount bigint NOT NULL CHECK (amount > 0),
  bank_account_code text NOT NULL,
  method text NOT NULL DEFAULT 'transfer' CHECK (method IN ('transfer','tunai','giro')),
  reference text,
  status text NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','disetujui','dibayar','ditolak','batal')),
  required_approvals int NOT NULL DEFAULT 1 CHECK (required_approvals BETWEEN 1 AND 2),
  approvals jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{userId, name, at, note}]
  decision_note text,
  journal_id uuid REFERENCES journals(id),
  paid_at timestamptz, paid_by uuid, paid_by_name text,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (company_id, doc_no)
);
CREATE INDEX supplier_payments_invoice_idx ON supplier_payments (company_id, invoice_id, status);

-- Status tagihan: "jatuh tempo" dihitung saat tampil; normalisasi data lama.
DO $$ DECLARE co record;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true);
    UPDATE ap_invoices SET status = CASE WHEN paid_amount <= 0 THEN 'belum-dibayar' WHEN paid_amount >= total_gross THEN 'lunas' ELSE 'sebagian' END
     WHERE status NOT IN ('draf','belum-dibayar','sebagian','lunas','batal');
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;
ALTER TABLE ap_invoices ADD CONSTRAINT ap_invoices_status_chk CHECK (status IN ('draf','belum-dibayar','sebagian','lunas','batal'));
ALTER TABLE ap_invoices ADD CONSTRAINT ap_invoices_paid_chk CHECK (paid_amount >= 0 AND paid_amount <= total_gross);

-- Pembayaran historis dari kolom paid_* tagihan lama (idempoten; dipakai migrasi & seed).
CREATE OR REPLACE FUNCTION backfill_legacy_supplier_payments() RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  INSERT INTO supplier_payments (company_id, branch_code, doc_no, payment_date, invoice_id, supplier_id, amount, bank_account_code, method, reference, status, approvals, journal_id, paid_at, paid_by_name, created_by_name)
  SELECT i.company_id, i.branch_code, 'PAY-L-' || i.doc_no, coalesce(i.paid_date, i.invoice_date), i.id, i.supplier_id, i.paid_amount,
         coalesce(i.bank_account_code, b.main_bank_account_code), 'transfer', 'Data awal', 'dibayar', '[]'::jsonb,
         (SELECT j.id FROM journals j WHERE j.company_id = i.company_id AND j.ref = i.doc_no AND j.source_type = 'cash' ORDER BY j.journal_date LIMIT 1),
         coalesce(i.paid_date, i.invoice_date)::timestamptz, 'Data awal', 'Data awal'
    FROM ap_invoices i JOIN branches b ON b.company_id = i.company_id AND b.code = i.branch_code
   WHERE i.company_id = app_company() AND i.paid_amount > 0
     AND NOT EXISTS (SELECT 1 FROM supplier_payments p WHERE p.invoice_id = i.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Akun baru: Utang Barang Diterima Belum Ditagih (GRNI) di bawah 2-1100 Utang Usaha.
DO $$ DECLARE co record;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true);
    IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = co.id AND code = '2-1100' AND type = 'header')
       AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = co.id AND code = '2-1102') THEN
      INSERT INTO chart_of_accounts (company_id, code, name, type, category, parent_code, level, normal_side, status)
      VALUES (co.id, '2-1102', 'Utang Barang Diterima Belum Ditagih', 'detail', 'Liabilitas', '2-1100', 4, 'credit', 'aktif');
    END IF;
    PERFORM backfill_legacy_supplier_payments();
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;

-- Referensi akun baru ikut dijaga pengaman bagan akun (0006).
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
     OR EXISTS (SELECT 1 FROM ap_invoice_lines l WHERE l.company_id = OLD.company_id AND l.account_code = OLD.code) THEN
    RAISE EXCEPTION 'ERP:ACCOUNT_LINKED:Akun % terkait dokumen lain.', OLD.code;
  END IF;
  RETURN OLD;
END $$;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines','ap_invoice_lines','supplier_payments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
END $$;

-- Pemasok berlaku seperusahaan (lintas cabang).
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
CREATE POLICY suppliers_scope ON suppliers USING (company_id = app_company()) WITH CHECK (company_id = app_company());

GRANT SELECT, INSERT, UPDATE ON suppliers, purchase_orders, purchase_order_lines, goods_receipts, goods_receipt_lines, ap_invoice_lines, supplier_payments TO erp_app;
GRANT USAGE, SELECT ON SEQUENCE purchase_order_lines_id_seq, goods_receipt_lines_id_seq, ap_invoice_lines_id_seq TO erp_app;
GRANT DELETE ON purchase_order_lines, ap_invoice_lines TO erp_app;
GRANT INSERT ON stock_items TO erp_app;

INSERT INTO permissions (code) VALUES ('purchasing.supplier.manage'), ('purchasing.order.create'), ('purchasing.order.approve'), ('purchasing.receipt.create'),
  ('purchasing.invoice.create'), ('purchasing.invoice.post'), ('purchasing.payment.approve') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('staf_keuangan','purchasing.order.create'), ('staf_keuangan','purchasing.invoice.create'), ('staf_keuangan','purchasing.payment.create'),
               ('akuntan_senior','purchasing.invoice.post'), ('akuntan_senior','purchasing.payment.approve'),
               ('manajer','purchasing.supplier.manage'), ('manajer','purchasing.order.approve'), ('manajer','purchasing.payment.approve'),
               ('gudang','purchasing.receipt.create')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;
