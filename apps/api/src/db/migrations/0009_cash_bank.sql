-- 0009 — Kas & bank (Fase 2 sprint 6): transfer antar rekening/cabang dengan
-- persetujuan, rekonsiliasi bank dari mutasi rekening koran (CSV/MT940), dan
-- setoran PPN masa terpusat.

CREATE TABLE cash_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,                 -- cabang asal (rekening sumber)
  to_branch_code char(3) NOT NULL,              -- cabang tujuan
  doc_no text NOT NULL,
  transfer_date date NOT NULL,
  from_bank_code text NOT NULL,
  to_bank_code text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','diposting','ditolak','batal','dibalik')),
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  decided_by uuid, decided_by_name text, decided_at timestamptz, decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (company_id, doc_no),
  CHECK (from_bank_code <> to_bank_code)
);
CREATE INDEX cash_transfers_scope_idx ON cash_transfers (company_id, branch_code, transfer_date);

CREATE TABLE bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  bank_account_code text NOT NULL,
  doc_no text NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  opening_balance bigint NOT NULL,
  closing_balance bigint NOT NULL,
  source text NOT NULL CHECK (source IN ('csv','mt940')),
  file_name text,
  status text NOT NULL DEFAULT 'proses' CHECK (status IN ('proses','selesai','batal')),
  summary jsonb,                                -- ringkasan saat finalisasi
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_by uuid, finalized_by_name text, finalized_at timestamptz,
  UNIQUE (company_id, doc_no),
  CHECK (period_from <= period_to)
);
CREATE INDEX bank_statements_account_idx ON bank_statements (company_id, bank_account_code, period_to);

CREATE TABLE bank_statement_lines (
  id bigserial PRIMARY KEY,
  statement_id uuid NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  line_no int NOT NULL,
  tx_date date NOT NULL,
  description text NOT NULL,
  reference text,
  amount bigint NOT NULL CHECK (amount <> 0),   -- + masuk ke rekening, − keluar
  balance bigint,
  status text NOT NULL DEFAULT 'belum' CHECK (status IN ('belum','cocok','diabaikan')),
  journal_line_id bigint REFERENCES journal_lines(id),
  match_kind text CHECK (match_kind IN ('otomatis','manual')),
  matched_by_name text, matched_at timestamptz,
  journal_id uuid REFERENCES journals(id),      -- jurnal yang dibuat dari baris ini (biaya/bunga bank)
  note text,
  UNIQUE (statement_id, line_no),
  CHECK ((status = 'cocok') = (journal_line_id IS NOT NULL))
);
-- Satu baris buku hanya boleh dicocokkan dengan satu baris rekening koran.
CREATE UNIQUE INDEX bank_statement_lines_jl_uq ON bank_statement_lines (journal_line_id) WHERE journal_line_id IS NOT NULL;

CREATE TABLE tax_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,                 -- kantor pusat (pemusatan PPN)
  doc_no text NOT NULL,
  tax_type text NOT NULL DEFAULT 'PPN' CHECK (tax_type IN ('PPN')),
  period_code text NOT NULL,
  settle_date date NOT NULL,                    -- akhir masa pajak
  output_tax bigint NOT NULL, input_tax bigint NOT NULL, net_amount bigint NOT NULL,   -- net > 0 kurang bayar, < 0 lebih bayar
  details jsonb NOT NULL,                       -- saldo per cabang saat dibuat
  status text NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','diposting','dibayar','batal')),
  bank_account_code text, payment_date date, ntpn text, payment_journal_id uuid REFERENCES journals(id),
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem', created_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid, posted_by_name text, posted_at timestamptz,
  paid_by_name text, paid_at timestamptz,
  cancel_reason text, updated_at timestamptz,
  UNIQUE (company_id, doc_no)
);
CREATE UNIQUE INDEX tax_settlements_period_uq ON tax_settlements (company_id, tax_type, period_code) WHERE status <> 'batal';

-- RLS: transfer terlihat oleh cabang asal maupun tujuan; lainnya per cabang dokumen.
ALTER TABLE cash_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transfers FORCE ROW LEVEL SECURITY;
CREATE POLICY cash_transfers_scope ON cash_transfers
  USING (company_id = app_company() AND (app_branch_allowed(branch_code::text) OR app_branch_allowed(to_branch_code::text)))
  WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text));
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_statements','bank_statement_lines','tax_settlements'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON cash_transfers, bank_statements, bank_statement_lines, tax_settlements TO erp_app;
GRANT USAGE, SELECT ON SEQUENCE bank_statement_lines_id_seq TO erp_app;

-- Izin baru (pemicu 0008 ikut memberikannya ke Admin Sistem) dan pemberian ke peran bawaan.
INSERT INTO permissions (code) VALUES ('cash.transfer.create'), ('cash.transfer.approve'), ('cash.reconcile'), ('cash.reconcile.approve'),
  ('tax.settlement.create'), ('tax.settlement.post') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('staf_keuangan','cash.transfer.create'), ('staf_keuangan','cash.reconcile'), ('staf_keuangan','tax.settlement.create'),
               ('akuntan_senior','cash.transfer.approve'), ('akuntan_senior','cash.reconcile'), ('akuntan_senior','cash.reconcile.approve'),
               ('akuntan_senior','tax.settlement.post')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;
