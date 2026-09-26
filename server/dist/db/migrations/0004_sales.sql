-- 0004 — Penjualan & piutang (Fase 2 sprint 4, dok. 07 §4 & §10.2).
-- Pelanggan & produk (data induk perusahaan), pesanan penjualan dengan
-- persetujuan plafon, faktur berbaris → jurnal otomatis, penerimaan kas, dan
-- mutasi stok untuk HPP. Data contoh diisi oleh seed (termasuk jalur upgrade).

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  name text NOT NULL,
  segment text NOT NULL DEFAULT 'Langsung',
  pic text, phone text, email text, address text, city text, npwp text,
  branch_code char(3),                       -- cabang pengelola (untuk saringan); faktur boleh dari cabang mana pun
  credit_limit bigint NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  terms_days int NOT NULL DEFAULT 30 CHECK (terms_days BETWEEN 0 AND 365),
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','ditahan','nonaktif')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (company_id, code)
);
CREATE UNIQUE INDEX customers_name_uq ON customers (company_id, lower(name));

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  sku text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('barang','jasa')),
  unit text NOT NULL,
  price bigint NOT NULL DEFAULT 0 CHECK (price >= 0),
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (company_id, sku)
);

CREATE TABLE sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  order_date date NOT NULL,
  delivery_date date,
  channel text,
  status text NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','menunggu','disetujui','ditolak','dikirim','selesai','batal')),
  subtotal bigint NOT NULL DEFAULT 0, discount bigint NOT NULL DEFAULT 0, net_amount bigint NOT NULL DEFAULT 0,
  ppn_amount bigint NOT NULL DEFAULT 0, total bigint NOT NULL DEFAULT 0,
  notes text,
  approval_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  submitted_at timestamptz,
  decided_by uuid, decided_by_name text, decided_at timestamptz, decision_note text,
  invoice_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (company_id, doc_no)
);
CREATE INDEX sales_orders_scope_idx ON sales_orders (company_id, branch_code, order_date);
CREATE INDEX sales_orders_customer_idx ON sales_orders (company_id, customer_id, status);

CREATE TABLE sales_order_lines (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  line_no int NOT NULL,
  product_id uuid REFERENCES products(id),
  sku text, description text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('barang','jasa')),
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  unit text NOT NULL,
  price bigint NOT NULL CHECK (price >= 0),
  disc_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (disc_pct BETWEEN 0 AND 100),
  net bigint NOT NULL,
  UNIQUE (order_id, line_no)
);

-- Faktur: tabel sub-buku dari 0001 diperluas menjadi dokumen penuh.
ALTER TABLE invoices ADD COLUMN customer_id uuid REFERENCES customers(id);
ALTER TABLE invoices ADD COLUMN sales_order_id uuid REFERENCES sales_orders(id);
ALTER TABLE invoices ADD COLUMN subtotal bigint NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN discount bigint NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN net_amount bigint NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN ppn_amount bigint NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN notes text;
ALTER TABLE invoices ADD COLUMN created_by uuid;
ALTER TABLE invoices ADD COLUMN created_by_name text NOT NULL DEFAULT 'Sistem';
ALTER TABLE invoices ADD COLUMN issued_by uuid;
ALTER TABLE invoices ADD COLUMN issued_by_name text;
ALTER TABLE invoices ADD COLUMN issued_at timestamptz;
ALTER TABLE invoices ADD COLUMN cancel_date date;
ALTER TABLE invoices ADD COLUMN cancel_reason text;
ALTER TABLE invoices ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE invoices ADD COLUMN updated_at timestamptz;
CREATE INDEX invoices_scope_idx ON invoices (company_id, branch_code, invoice_date);
CREATE INDEX invoices_customer_idx ON invoices (company_id, customer_id, status);

CREATE TABLE invoice_lines (
  id bigserial PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  line_no int NOT NULL,
  product_id uuid REFERENCES products(id),
  sku text, description text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('barang','jasa')),
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  unit text NOT NULL,
  price bigint NOT NULL CHECK (price >= 0),
  disc_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (disc_pct BETWEEN 0 AND 100),
  net bigint NOT NULL,
  cost_amount bigint NOT NULL DEFAULT 0,      -- HPP yang dijurnal saat terbit
  UNIQUE (invoice_id, line_no)
);

CREATE TABLE receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  receipt_date date NOT NULL,
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  customer_id uuid REFERENCES customers(id),
  amount bigint NOT NULL CHECK (amount > 0),
  bank_account_code text NOT NULL,
  method text NOT NULL DEFAULT 'transfer' CHECK (method IN ('transfer','tunai','giro')),
  reference text,
  journal_id uuid REFERENCES journals(id),
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_no)
);
CREATE INDEX receipts_invoice_idx ON receipts (company_id, invoice_id, receipt_date);

-- Mutasi stok (kerangka Fase 3): saat ini dipakai pengeluaran barang oleh faktur & pembatalannya.
CREATE TABLE stock_moves (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  warehouse_code text NOT NULL, sku text NOT NULL,
  move_date date NOT NULL,
  qty numeric(18,4) NOT NULL,
  unit_cost bigint NOT NULL,
  ref_type text NOT NULL, ref_id text NOT NULL, ref_no text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_moves_sku_idx ON stock_moves (company_id, sku, branch_code, move_date);

-- Status faktur: "jatuh tempo" dihitung saat tampil, tidak disimpan.
-- RLS (FORCE) berlaku juga bagi pemilik skema, jadi konteks disetel per perusahaan.
DO $$ DECLARE co record;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true);
    UPDATE invoices SET status = CASE WHEN paid_amount <= 0 THEN 'belum-dibayar' WHEN paid_amount >= total_gross THEN 'lunas' ELSE 'sebagian' END
     WHERE status NOT IN ('draf','belum-dibayar','sebagian','lunas','batal');
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_chk CHECK (status IN ('draf','belum-dibayar','sebagian','lunas','batal'));
ALTER TABLE invoices ADD CONSTRAINT invoices_paid_chk CHECK (paid_amount >= 0 AND paid_amount <= total_gross);

-- RLS per cabang untuk dokumen; data induk dibatasi per perusahaan di kueri (seperti bagan akun).
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales_orders','sales_order_lines','invoice_lines','receipts','stock_moves'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON customers, products, sales_orders, sales_order_lines, invoice_lines, receipts, stock_moves TO erp_app;
GRANT USAGE, SELECT ON SEQUENCE sales_order_lines_id_seq, invoice_lines_id_seq, stock_moves_id_seq TO erp_app;
-- Baris draf boleh diganti utuh; produk/pelanggan tak terpakai boleh dihapus (layanan memeriksa).
GRANT DELETE ON sales_order_lines, invoice_lines, products, customers TO erp_app;
REVOKE UPDATE, DELETE ON stock_moves FROM erp_app;

-- Izin baru dan pemberiannya ke peran bawaan yang sudah ada.
INSERT INTO permissions (code) VALUES ('sales.customer.manage'), ('sales.order.create'), ('sales.order.approve'), ('sales.invoice.cancel') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('staf_keuangan','sales.order.create'), ('manajer','sales.order.approve'), ('manajer','sales.customer.manage'),
               ('akuntan_senior','sales.invoice.issue'), ('akuntan_senior','sales.invoice.cancel')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;

-- Penerimaan historis: faktur sub-buku lama menyimpan pembayaran di kolom paid_*.
-- Fungsi ini membuat baris receipts untuknya (idempoten) pada perusahaan di app.company_id;
-- dipanggil migrasi ini untuk data yang sudah ada dan oleh seed untuk basis data baru.
CREATE OR REPLACE FUNCTION backfill_legacy_receipts() RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  INSERT INTO receipts (company_id, branch_code, doc_no, receipt_date, invoice_id, customer_id, amount, bank_account_code, method, reference, journal_id)
  SELECT i.company_id, i.branch_code, 'RCV-L-' || i.doc_no, coalesce(i.paid_date, i.invoice_date), i.id, i.customer_id, i.paid_amount,
         coalesce(i.bank_account_code, b.main_bank_account_code), 'transfer', 'Data awal',
         (SELECT j.id FROM journals j WHERE j.company_id = i.company_id AND j.ref = i.doc_no AND j.source_type = 'cash' ORDER BY j.journal_date LIMIT 1)
    FROM invoices i JOIN branches b ON b.company_id = i.company_id AND b.code = i.branch_code
   WHERE i.company_id = app_company() AND i.paid_amount > 0
     AND NOT EXISTS (SELECT 1 FROM receipts r WHERE r.invoice_id = i.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

DO $$ DECLARE co record;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true);
    PERFORM backfill_legacy_receipts();
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;
