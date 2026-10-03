-- 0012 — POS / kasir (Fase 3 sprint 9): shift kasir per toko (gudang), transaksi
-- penjualan eceran, tutup shift dengan hitung kas, dan posting oleh orang lain
-- (penjualan, PPN keluaran, HPP, selisih kas) ke buku besar.

CREATE TABLE pos_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  warehouse_code text NOT NULL,                     -- toko = gudang sumber stok
  cash_account text NOT NULL,                       -- rekening kas toko (bank_accounts)
  settlement_account text,                          -- rekening penampung QRIS/kartu/transfer
  cashier_id uuid NOT NULL, cashier_name text NOT NULL,
  shift_date date NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_cash bigint NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  closed_at timestamptz,
  counted_cash bigint, expected_cash bigint, cash_diff bigint,
  summary jsonb,                                    -- ringkasan saat ditutup
  cogs bigint,
  status text NOT NULL DEFAULT 'buka' CHECK (status IN ('buka','ditutup','diposting')),
  close_note text,
  posted_by uuid, posted_by_name text, posted_at timestamptz,
  UNIQUE (company_id, doc_no)
);
-- Satu shift terbuka per kasir.
CREATE UNIQUE INDEX pos_shifts_open_uq ON pos_shifts (company_id, cashier_id) WHERE status = 'buka';
CREATE INDEX pos_shifts_scope_idx ON pos_shifts (company_id, branch_code, shift_date);

CREATE TABLE pos_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES pos_shifts(id),
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  trx_no text NOT NULL,
  trx_at timestamptz NOT NULL DEFAULT now(),
  net bigint NOT NULL, ppn bigint NOT NULL, total bigint NOT NULL CHECK (total > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('tunai','qris','debit','kredit','transfer')),
  tendered bigint, change_amount bigint,
  reference text,
  status text NOT NULL DEFAULT 'selesai' CHECK (status IN ('selesai','void')),
  void_reason text, voided_by_name text, voided_at timestamptz,
  created_by_name text NOT NULL,
  UNIQUE (company_id, trx_no)
);
CREATE INDEX pos_transactions_shift_idx ON pos_transactions (shift_id);

CREATE TABLE pos_transaction_lines (
  id bigserial PRIMARY KEY,
  trx_id uuid NOT NULL REFERENCES pos_transactions(id),
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  line_no int NOT NULL,
  sku text NOT NULL, name text NOT NULL, uom text NOT NULL,
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  price bigint NOT NULL CHECK (price >= 0),          -- DPP per satuan
  disc_pct numeric(5,2) NOT NULL DEFAULT 0,
  net bigint NOT NULL,
  UNIQUE (trx_id, line_no)
);

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pos_shifts','pos_transactions','pos_transaction_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON pos_shifts, pos_transactions, pos_transaction_lines TO erp_app;
GRANT USAGE, SELECT ON SEQUENCE pos_transaction_lines_id_seq TO erp_app;

INSERT INTO permissions (code) VALUES ('pos.read'), ('pos.operate'), ('pos.shift.post') ON CONFLICT DO NOTHING;
DO $$ DECLARE co record;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true);
    INSERT INTO roles (company_id, code, name) VALUES (co.id, 'kasir', 'Kasir') ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('akuntan_senior','pos.read'), ('akuntan_senior','pos.shift.post'), ('manajer','pos.read'), ('manajer','pos.shift.post'),
               ('kasir','org.branch.read'), ('kasir','pos.read'), ('kasir','pos.operate')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;
