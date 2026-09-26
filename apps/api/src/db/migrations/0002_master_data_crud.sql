-- 0002 — CRUD data induk: bagan akun & rekening kas/bank.
-- Aplikasi boleh MENGHAPUS akun/rekening hanya lewat layanan yang memastikan
-- data itu belum pernah dipakai jurnal (lihat master.service.ts). Jurnal dan
-- jejak audit tetap tanpa hak DELETE.
GRANT DELETE ON chart_of_accounts, bank_accounts TO erp_app;

-- Pencarian "apakah akun/rekening pernah dipakai" harus cepat.
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON journal_lines (company_id, account_code);
CREATE INDEX IF NOT EXISTS journal_lines_bank_idx ON journal_lines (company_id, bank_account_code) WHERE bank_account_code IS NOT NULL;

-- Rekening nonaktif tidak boleh menerima baris jurnal baru.
CREATE OR REPLACE FUNCTION assert_line_account() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE acc record; bank record;
BEGIN
  SELECT type, status, is_cash, is_computed INTO acc FROM chart_of_accounts WHERE company_id = NEW.company_id AND code = NEW.account_code;
  IF acc IS NULL THEN RAISE EXCEPTION 'ERP:LEDGER_UNKNOWN_ACCOUNT:Akun % tidak ada di bagan akun.', NEW.account_code; END IF;
  IF acc.type <> 'detail' OR acc.is_computed THEN RAISE EXCEPTION 'ERP:LEDGER_HEADER_ACCOUNT:Akun % adalah akun header/dihitung — hanya akun detail yang menerima jurnal.', NEW.account_code; END IF;
  IF acc.status <> 'aktif' THEN RAISE EXCEPTION 'ERP:LEDGER_INACTIVE_ACCOUNT:Akun % nonaktif.', NEW.account_code; END IF;
  IF acc.is_cash THEN
    IF NEW.bank_account_code IS NULL THEN RAISE EXCEPTION 'ERP:LEDGER_CASH_NEEDS_BANK:Baris Kas & Bank harus menyebut rekening.'; END IF;
    SELECT branch_code, currency, status INTO bank FROM bank_accounts WHERE company_id = NEW.company_id AND code = NEW.bank_account_code;
    IF bank IS NULL THEN RAISE EXCEPTION 'ERP:LEDGER_UNKNOWN_BANK:Rekening % tidak dikenal.', NEW.bank_account_code; END IF;
    IF bank.branch_code <> NEW.branch_code THEN RAISE EXCEPTION 'ERP:LEDGER_BANK_BRANCH:Rekening % milik cabang %, bukan %.', NEW.bank_account_code, bank.branch_code, NEW.branch_code; END IF;
    IF bank.status <> 'aktif' THEN RAISE EXCEPTION 'ERP:LEDGER_INACTIVE_BANK:Rekening % nonaktif.', NEW.bank_account_code; END IF;
    IF bank.currency <> 'IDR' THEN RAISE EXCEPTION 'ERP:LEDGER_BANK_CURRENCY:Rekening % berdenominasi valas.', NEW.bank_account_code; END IF;
  END IF;
  RETURN NEW;
END $$;

-- Buka-kembali periode sebelumnya tidak dimiliki peran mana pun. Diberikan ke
-- Admin Sistem (bukan penutup periode), sehingga pemisahan tugas tutup ≠ buka tetap terjaga.
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'ledger.period.reopen' FROM roles r WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;
