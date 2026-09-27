-- 0006 — Pengaman bagan akun di lapisan basis data (melengkapi aturan API):
--   * nomor akun tidak dapat diubah (acuan riwayat jurnal & tautan fitur);
--   * akun yang masih memiliki akun di bawahnya tidak dapat dihapus;
--   * akun yang sudah dipakai jurnal atau terkait rekening/tagihan/aset tidak dapat dihapus.
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
     OR EXISTS (SELECT 1 FROM assets a WHERE a.company_id = OLD.company_id AND a.gl_account_code = OLD.code) THEN
    RAISE EXCEPTION 'ERP:ACCOUNT_LINKED:Akun % terkait dokumen lain.', OLD.code;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER chart_of_accounts_guard BEFORE UPDATE OF code, company_id OR DELETE ON chart_of_accounts FOR EACH ROW EXECUTE FUNCTION coa_guard();
