-- 0005 — Bagan akun bertingkat (permintaan pengguna):
--   level 1–3 = header (tampil di neraca & laba rugi), level 4–5 = detail
--   (transaksi, neraca saldo, kartu buku besar). Header tidak menerima
--   jurnal dan tidak dapat ditautkan ke fitur lain. Setiap rekening kas/bank
--   menjadi akun detail sendiri di bawah header 1-1100 Bank / 1-1200 Kas.
--
-- Data yang sudah ada dipetakan dari struktur lama (level 0–2) ke struktur
-- baru: baris jurnal dipindah ke akun detail padanannya (baris 1-1100 ke
-- akun rekeningnya). Saldo & laporan tidak berubah nilainya.

ALTER TABLE bank_accounts ADD COLUMN gl_account_code text;
CREATE UNIQUE INDEX bank_accounts_gl_uq ON bank_accounts (company_id, gl_account_code) WHERE gl_account_code IS NOT NULL;

/* COA standar (sumber: packages/domain/src/coa.ts). */
CREATE OR REPLACE FUNCTION coa_standard() RETURNS TABLE (code text, name text, type text, category text, parent_code text, level int, normal_side text, is_intercompany boolean, is_contra boolean, is_cash boolean, is_computed boolean)
LANGUAGE sql IMMUTABLE AS $$ VALUES
  ('1-0000', 'Aset', 'header', 'Aset', NULL, 1, 'debit', false, false, false, false),
  ('1-1000', 'Aset Lancar', 'header', 'Aset', '1-0000', 2, 'debit', false, false, false, false),
  ('1-1100', 'Bank', 'header', 'Aset', '1-1000', 3, 'debit', false, false, true, false),
  ('1-1200', 'Kas', 'header', 'Aset', '1-1000', 3, 'debit', false, false, true, false),
  ('1-1300', 'Piutang Usaha', 'header', 'Aset', '1-1000', 3, 'debit', false, false, false, false),
  ('1-1301', 'Piutang Usaha', 'detail', 'Aset', '1-1300', 4, 'debit', false, false, false, false),
  ('1-1400', 'Piutang Lain-lain', 'header', 'Aset', '1-1000', 3, 'debit', false, false, false, false),
  ('1-1401', 'Piutang Lain-lain', 'detail', 'Aset', '1-1400', 4, 'debit', false, false, false, false),
  ('1-1500', 'Persediaan', 'header', 'Aset', '1-1000', 3, 'debit', false, false, false, false),
  ('1-1501', 'Persediaan Bahan Baku & Penolong', 'detail', 'Aset', '1-1500', 4, 'debit', false, false, false, false),
  ('1-1502', 'Persediaan Barang Dalam Proses', 'detail', 'Aset', '1-1500', 4, 'debit', false, false, false, false),
  ('1-1503', 'Persediaan Barang Jadi', 'detail', 'Aset', '1-1500', 4, 'debit', false, false, false, false),
  ('1-1600', 'Biaya Dibayar di Muka', 'header', 'Aset', '1-1000', 3, 'debit', false, false, false, false),
  ('1-1601', 'Biaya Dibayar di Muka', 'detail', 'Aset', '1-1600', 4, 'debit', false, false, false, false),
  ('1-1700', 'Pajak Dibayar di Muka', 'header', 'Aset', '1-1000', 3, 'debit', false, false, false, false),
  ('1-1701', 'PPN Masukan', 'detail', 'Aset', '1-1700', 4, 'debit', false, false, false, false),
  ('1-2000', 'Aset Tetap', 'header', 'Aset', '1-0000', 2, 'debit', false, false, false, false),
  ('1-2100', 'Tanah', 'header', 'Aset', '1-2000', 3, 'debit', false, false, false, false),
  ('1-2101', 'Tanah', 'detail', 'Aset', '1-2100', 4, 'debit', false, false, false, false),
  ('1-2200', 'Bangunan', 'header', 'Aset', '1-2000', 3, 'debit', false, false, false, false),
  ('1-2201', 'Bangunan', 'detail', 'Aset', '1-2200', 4, 'debit', false, false, false, false),
  ('1-2300', 'Mesin & Peralatan', 'header', 'Aset', '1-2000', 3, 'debit', false, false, false, false),
  ('1-2301', 'Mesin & Peralatan', 'detail', 'Aset', '1-2300', 4, 'debit', false, false, false, false),
  ('1-2400', 'Kendaraan', 'header', 'Aset', '1-2000', 3, 'debit', false, false, false, false),
  ('1-2401', 'Kendaraan', 'detail', 'Aset', '1-2400', 4, 'debit', false, false, false, false),
  ('1-2500', 'Peralatan Kantor', 'header', 'Aset', '1-2000', 3, 'debit', false, false, false, false),
  ('1-2501', 'Peralatan Kantor', 'detail', 'Aset', '1-2500', 4, 'debit', false, false, false, false),
  ('1-2900', 'Akumulasi Penyusutan', 'header', 'Aset', '1-2000', 3, 'debit', false, false, false, false),
  ('1-2901', 'Akumulasi Penyusutan', 'detail', 'Aset', '1-2900', 4, 'debit', false, true, false, false),
  ('1-3000', 'Rekening Koran Antar Kantor', 'header', 'Aset', '1-0000', 2, 'debit', false, false, false, false),
  ('1-3100', 'RK Cabang', 'header', 'Aset', '1-3000', 3, 'debit', false, false, false, false),
  ('1-3101', 'RK Cabang (buku kantor pusat)', 'detail', 'Aset', '1-3100', 4, 'debit', true, false, false, false),
  ('2-0000', 'Liabilitas', 'header', 'Liabilitas', NULL, 1, 'credit', false, false, false, false),
  ('2-1000', 'Liabilitas Jangka Pendek', 'header', 'Liabilitas', '2-0000', 2, 'credit', false, false, false, false),
  ('2-1100', 'Utang Usaha', 'header', 'Liabilitas', '2-1000', 3, 'credit', false, false, false, false),
  ('2-1101', 'Utang Usaha', 'detail', 'Liabilitas', '2-1100', 4, 'credit', false, false, false, false),
  ('2-1200', 'Utang Gaji', 'header', 'Liabilitas', '2-1000', 3, 'credit', false, false, false, false),
  ('2-1201', 'Utang Gaji', 'detail', 'Liabilitas', '2-1200', 4, 'credit', false, false, false, false),
  ('2-1300', 'Utang Pajak', 'header', 'Liabilitas', '2-1000', 3, 'credit', false, false, false, false),
  ('2-1301', 'Utang Pajak', 'detail', 'Liabilitas', '2-1300', 4, 'credit', false, false, false, false),
  ('2-1400', 'PPN Keluaran', 'header', 'Liabilitas', '2-1000', 3, 'credit', false, false, false, false),
  ('2-1401', 'PPN Keluaran', 'detail', 'Liabilitas', '2-1400', 4, 'credit', false, false, false, false),
  ('2-1500', 'Pendapatan Diterima di Muka', 'header', 'Liabilitas', '2-1000', 3, 'credit', false, false, false, false),
  ('2-1501', 'Pendapatan Diterima di Muka', 'detail', 'Liabilitas', '2-1500', 4, 'credit', false, false, false, false),
  ('2-2000', 'Liabilitas Jangka Panjang', 'header', 'Liabilitas', '2-0000', 2, 'credit', false, false, false, false),
  ('2-2100', 'Utang Bank', 'header', 'Liabilitas', '2-2000', 3, 'credit', false, false, false, false),
  ('2-2101', 'Utang Bank', 'detail', 'Liabilitas', '2-2100', 4, 'credit', false, false, false, false),
  ('2-2200', 'Utang Sewa Guna', 'header', 'Liabilitas', '2-2000', 3, 'credit', false, false, false, false),
  ('2-2201', 'Utang Sewa Guna', 'detail', 'Liabilitas', '2-2200', 4, 'credit', false, false, false, false),
  ('3-0000', 'Ekuitas', 'header', 'Ekuitas', NULL, 1, 'credit', false, false, false, false),
  ('3-1000', 'Modal & Rekening Kantor Pusat', 'header', 'Ekuitas', '3-0000', 2, 'credit', false, false, false, false),
  ('3-1100', 'Modal Disetor', 'header', 'Ekuitas', '3-1000', 3, 'credit', false, false, false, false),
  ('3-1101', 'Modal Disetor', 'detail', 'Ekuitas', '3-1100', 4, 'credit', false, false, false, false),
  ('3-1500', 'RK Kantor Pusat', 'header', 'Ekuitas', '3-1000', 3, 'credit', false, false, false, false),
  ('3-1501', 'RK Kantor Pusat (buku cabang)', 'detail', 'Ekuitas', '3-1500', 4, 'credit', true, false, false, false),
  ('3-2000', 'Saldo Laba', 'header', 'Ekuitas', '3-0000', 2, 'credit', false, false, false, false),
  ('3-2100', 'Laba Ditahan', 'header', 'Ekuitas', '3-2000', 3, 'credit', false, false, false, false),
  ('3-2101', 'Laba Ditahan', 'detail', 'Ekuitas', '3-2100', 4, 'credit', false, false, false, false),
  ('3-2200', 'Laba Periode Berjalan', 'header', 'Ekuitas', '3-2000', 3, 'credit', false, false, false, false),
  ('3-2201', 'Laba Periode Berjalan', 'detail', 'Ekuitas', '3-2200', 4, 'credit', false, false, false, true),
  ('4-0000', 'Pendapatan', 'header', 'Pendapatan', NULL, 1, 'credit', false, false, false, false),
  ('4-1000', 'Pendapatan Usaha', 'header', 'Pendapatan', '4-0000', 2, 'credit', false, false, false, false),
  ('4-1100', 'Penjualan Barang', 'header', 'Pendapatan', '4-1000', 3, 'credit', false, false, false, false),
  ('4-1101', 'Pendapatan Penjualan', 'detail', 'Pendapatan', '4-1100', 4, 'credit', false, false, false, false),
  ('4-1200', 'Pendapatan Jasa', 'header', 'Pendapatan', '4-1000', 3, 'credit', false, false, false, false),
  ('4-1201', 'Pendapatan Jasa', 'detail', 'Pendapatan', '4-1200', 4, 'credit', false, false, false, false),
  ('4-1900', 'Retur & Potongan Penjualan', 'header', 'Pendapatan', '4-1000', 3, 'credit', false, false, false, false),
  ('4-1901', 'Retur & Potongan Penjualan', 'detail', 'Pendapatan', '4-1900', 4, 'credit', false, false, false, false),
  ('4-2000', 'Pendapatan Lain-lain', 'header', 'Pendapatan', '4-0000', 2, 'credit', false, false, false, false),
  ('4-2100', 'Pendapatan Lain-lain', 'header', 'Pendapatan', '4-2000', 3, 'credit', false, false, false, false),
  ('4-2101', 'Pendapatan Lain-lain', 'detail', 'Pendapatan', '4-2100', 4, 'credit', false, false, false, false),
  ('5-0000', 'Beban', 'header', 'Beban', NULL, 1, 'debit', false, false, false, false),
  ('5-1000', 'Harga Pokok Penjualan', 'header', 'Beban', '5-0000', 2, 'debit', false, false, false, false),
  ('5-1100', 'Harga Pokok Penjualan', 'header', 'Beban', '5-1000', 3, 'debit', false, false, false, false),
  ('5-1101', 'Harga Pokok Penjualan', 'detail', 'Beban', '5-1100', 4, 'debit', false, false, false, false),
  ('5-1900', 'Selisih Persediaan', 'header', 'Beban', '5-1000', 3, 'debit', false, false, false, false),
  ('5-1901', 'Selisih Persediaan', 'detail', 'Beban', '5-1900', 4, 'debit', false, false, false, false),
  ('5-2000', 'Beban Operasional', 'header', 'Beban', '5-0000', 2, 'debit', false, false, false, false),
  ('5-2100', 'Beban Tenaga Kerja Langsung', 'header', 'Beban', '5-2000', 3, 'debit', false, false, false, false),
  ('5-2101', 'Beban Tenaga Kerja Langsung', 'detail', 'Beban', '5-2100', 4, 'debit', false, false, false, false),
  ('5-2200', 'Beban Gaji & Tunjangan', 'header', 'Beban', '5-2000', 3, 'debit', false, false, false, false),
  ('5-2201', 'Beban Gaji & Tunjangan', 'detail', 'Beban', '5-2200', 4, 'debit', false, false, false, false),
  ('5-2300', 'Beban Pemasaran', 'header', 'Beban', '5-2000', 3, 'debit', false, false, false, false),
  ('5-2301', 'Beban Pemasaran', 'detail', 'Beban', '5-2300', 4, 'debit', false, false, false, false),
  ('5-2400', 'Beban Angkut', 'header', 'Beban', '5-2000', 3, 'debit', false, false, false, false),
  ('5-2401', 'Beban Angkut', 'detail', 'Beban', '5-2400', 4, 'debit', false, false, false, false),
  ('5-3000', 'Beban Umum & Administrasi', 'header', 'Beban', '5-0000', 2, 'debit', false, false, false, false),
  ('5-3100', 'Beban Utilitas', 'header', 'Beban', '5-3000', 3, 'debit', false, false, false, false),
  ('5-3101', 'Beban Utilitas', 'detail', 'Beban', '5-3100', 4, 'debit', false, false, false, false),
  ('5-3200', 'Beban Penyusutan', 'header', 'Beban', '5-3000', 3, 'debit', false, false, false, false),
  ('5-3201', 'Beban Penyusutan', 'detail', 'Beban', '5-3200', 4, 'debit', false, false, false, false),
  ('5-3300', 'Beban Sewa', 'header', 'Beban', '5-3000', 3, 'debit', false, false, false, false),
  ('5-3301', 'Beban Sewa', 'detail', 'Beban', '5-3300', 4, 'debit', false, false, false, false),
  ('5-3400', 'Beban Pemeliharaan', 'header', 'Beban', '5-3000', 3, 'debit', false, false, false, false),
  ('5-3401', 'Beban Pemeliharaan', 'detail', 'Beban', '5-3400', 4, 'debit', false, false, false, false),
  ('5-3500', 'Beban Asuransi', 'header', 'Beban', '5-3000', 3, 'debit', false, false, false, false),
  ('5-3501', 'Beban Asuransi', 'detail', 'Beban', '5-3500', 4, 'debit', false, false, false, false),
  ('5-3600', 'Beban Perjalanan Dinas', 'header', 'Beban', '5-3000', 3, 'debit', false, false, false, false),
  ('5-3601', 'Beban Perjalanan Dinas', 'detail', 'Beban', '5-3600', 4, 'debit', false, false, false, false),
  ('5-3700', 'Beban Perlengkapan Kantor', 'header', 'Beban', '5-3000', 3, 'debit', false, false, false, false),
  ('5-3701', 'Beban Perlengkapan Kantor', 'detail', 'Beban', '5-3700', 4, 'debit', false, false, false, false),
  ('5-4000', 'Beban Lain-lain', 'header', 'Beban', '5-0000', 2, 'debit', false, false, false, false),
  ('5-4100', 'Beban Lain-lain', 'header', 'Beban', '5-4000', 3, 'debit', false, false, false, false),
  ('5-4101', 'Beban Lain-lain', 'detail', 'Beban', '5-4100', 4, 'debit', false, false, false, false),
  ('5-4200', 'Beban Bunga Bank', 'header', 'Beban', '5-4000', 3, 'debit', false, false, false, false),
  ('5-4201', 'Beban Bunga Bank', 'detail', 'Beban', '5-4200', 4, 'debit', false, false, false, false)
$$;

CREATE OR REPLACE FUNCTION coa_legacy_map() RETURNS TABLE (old_code text, new_code text) LANGUAGE sql IMMUTABLE AS $$ VALUES
  ('1-1200', '1-1301'), ('1-1300', '1-1401'), ('1-1400', '1-1501'), ('1-1450', '1-1502'), ('1-1500', '1-1503'), ('1-1600', '1-1601'), ('1-1700', '1-1701'), ('1-2100', '1-2101'), ('1-2200', '1-2201'), ('1-2300', '1-2301'), ('1-2400', '1-2401'), ('1-2500', '1-2501'), ('1-2900', '1-2901'), ('1-3100', '1-3101'), ('2-1100', '2-1101'), ('2-1200', '2-1201'), ('2-1300', '2-1301'), ('2-1400', '2-1401'), ('2-1500', '2-1501'), ('2-2100', '2-2101'), ('2-2200', '2-2201'), ('3-1000', '3-1101'), ('3-1500', '3-1501'), ('3-2000', '3-2101'), ('3-3000', '3-2201'), ('4-1000', '4-1101'), ('4-2000', '4-1201'), ('4-3000', '4-2101'), ('4-9000', '4-1901'), ('5-1000', '5-1101'), ('5-1900', '5-1901'), ('5-2100', '5-2101'), ('5-2200', '5-2201'), ('5-2300', '5-2301'), ('5-2400', '5-2401'), ('5-3100', '5-3101'), ('5-3200', '5-3201'), ('5-3300', '5-3301'), ('5-3400', '5-3401'), ('5-3500', '5-3501'), ('5-3600', '5-3601'), ('5-3700', '5-3701'), ('5-4000', '5-4101'), ('5-4100', '5-4201')
$$;

-- Aturan struktur: level dari pola kode, induk harus header sesuai pola, 1–3 header, 5 detail.
CREATE OR REPLACE FUNCTION coa_level_of(p_code text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_code !~ '^[1-5]-[0-9]{4}(\.[0-9]{2})?$' THEN NULL
    WHEN p_code ~ '\.' THEN CASE WHEN p_code ~ '\.00$' OR substr(p_code, 5, 2) = '00' THEN NULL ELSE 5 END
    WHEN substr(p_code, 3) = '0000' THEN 1
    WHEN substr(p_code, 4) = '000' THEN 2
    WHEN substr(p_code, 5) = '00' THEN 3
    ELSE 4 END $$;
CREATE OR REPLACE FUNCTION coa_parent_of(p_code text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE coa_level_of(p_code)
    WHEN 5 THEN substr(p_code, 1, 6)
    WHEN 4 THEN substr(p_code, 1, 4) || '00'
    WHEN 3 THEN substr(p_code, 1, 3) || '000'
    WHEN 2 THEN substr(p_code, 1, 2) || '0000'
    ELSE NULL END $$;

CREATE OR REPLACE FUNCTION assert_coa_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lvl int; par record;
BEGIN
  lvl := coa_level_of(NEW.code);
  IF lvl IS NULL THEN RAISE EXCEPTION 'ERP:ACCOUNT_CODE:Kode akun % tidak sah (pola 9-9999 atau 9-9999.99).', NEW.code; END IF;
  IF lvl <= 3 AND NEW.type <> 'header' THEN RAISE EXCEPTION 'ERP:ACCOUNT_LEVEL:Akun % berada di level % dan harus header; akun detail berada di level 4 atau 5.', NEW.code, lvl; END IF;
  IF lvl = 5 AND NEW.type <> 'detail' THEN RAISE EXCEPTION 'ERP:ACCOUNT_LEVEL:Akun level 5 (%) harus detail.', NEW.code; END IF;
  NEW.level := lvl;
  NEW.parent_code := coa_parent_of(NEW.code);
  IF NEW.parent_code IS NOT NULL THEN
    SELECT type INTO par FROM chart_of_accounts WHERE company_id = NEW.company_id AND code = NEW.parent_code;
    IF par IS NULL THEN RAISE EXCEPTION 'ERP:ACCOUNT_PARENT:Induk % untuk akun % belum ada.', NEW.parent_code, NEW.code; END IF;
    IF par.type <> 'header' THEN RAISE EXCEPTION 'ERP:ACCOUNT_PARENT_DETAIL:Induk % adalah akun detail; akun baru harus berada di bawah header.', NEW.parent_code; END IF;
  END IF;
  RETURN NEW;
END $$;

/* Rekening kas/bank → akun detail baru di bawah header Kas (nama bank "Kas") atau Bank. */
CREATE OR REPLACE FUNCTION alloc_bank_gl_account(p_company uuid, p_bank_name text, p_name text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_parent text; v_n int; v_code text;
BEGIN
  v_parent := CASE WHEN p_bank_name ~* '^\s*kas\M' THEN '1-1200' ELSE '1-1100' END;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.company_id = p_company AND c.code = v_parent AND c.type = 'header') THEN
    RAISE EXCEPTION 'ERP:ACCOUNT_PARENT:Header % (Kas/Bank) belum ada di bagan akun.', v_parent;
  END IF;
  SELECT coalesce(max(substr(c.code, 5, 2)::int), 0) + 1 INTO v_n FROM chart_of_accounts c
   WHERE c.company_id = p_company AND c.parent_code = v_parent AND c.code ~ '^[1-5]-[0-9]{4}$';
  IF v_n > 99 THEN RAISE EXCEPTION 'ERP:ACCOUNT_FULL:Header % sudah memiliki 99 akun.', v_parent; END IF;
  v_code := substr(v_parent, 1, 4) || lpad(v_n::text, 2, '0');
  INSERT INTO chart_of_accounts (company_id, code, name, type, category, parent_code, level, normal_side, is_cash, status)
  VALUES (p_company, v_code, p_name, 'detail', 'Aset', v_parent, 4, 'debit', true, 'aktif');
  RETURN v_code;
END $$;

CREATE OR REPLACE FUNCTION bank_accounts_gl() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.gl_account_code IS NULL THEN NEW.gl_account_code := alloc_bank_gl_account(NEW.company_id, NEW.bank_name, NEW.name); END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE chart_of_accounts SET name = NEW.name, status = NEW.status WHERE company_id = NEW.company_id AND code = NEW.gl_account_code AND (name <> NEW.name OR status <> NEW.status);
    RETURN NEW;
  ELSE
    DELETE FROM chart_of_accounts c WHERE c.company_id = OLD.company_id AND c.code = OLD.gl_account_code
      AND NOT EXISTS (SELECT 1 FROM journal_lines l WHERE l.company_id = OLD.company_id AND l.account_code = OLD.gl_account_code);
    RETURN OLD;
  END IF;
END $$;

/* Baris jurnal: hanya akun detail; akun kas/bank menurunkan rekening sub-buku dari tautannya. */
CREATE OR REPLACE FUNCTION assert_line_account() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE acc record; bank record; mig boolean;
BEGIN
  SELECT type, status, is_cash, is_computed INTO acc FROM chart_of_accounts WHERE company_id = NEW.company_id AND code = NEW.account_code;
  IF acc IS NULL THEN RAISE EXCEPTION 'ERP:LEDGER_UNKNOWN_ACCOUNT:Akun % tidak ada di bagan akun.', NEW.account_code; END IF;
  IF acc.type <> 'detail' OR acc.is_computed THEN RAISE EXCEPTION 'ERP:LEDGER_HEADER_ACCOUNT:Akun % adalah akun header/dihitung — hanya akun detail yang menerima jurnal.', NEW.account_code; END IF;
  mig := coalesce(current_setting('app.migration', true), '') = 'on';   -- pemetaan data historis
  IF acc.status <> 'aktif' AND NOT mig THEN RAISE EXCEPTION 'ERP:LEDGER_INACTIVE_ACCOUNT:Akun % nonaktif.', NEW.account_code; END IF;
  IF acc.is_cash THEN
    SELECT code, branch_code, currency, status INTO bank FROM bank_accounts WHERE company_id = NEW.company_id AND gl_account_code = NEW.account_code;
    IF bank IS NULL THEN RAISE EXCEPTION 'ERP:LEDGER_UNKNOWN_BANK:Akun kas/bank % tidak terhubung ke rekening yang dapat diakses.', NEW.account_code; END IF;
    IF NEW.bank_account_code IS NOT NULL AND NEW.bank_account_code <> bank.code THEN
      RAISE EXCEPTION 'ERP:LEDGER_BANK_MISMATCH:Rekening % tidak sesuai dengan akun % (%).', NEW.bank_account_code, NEW.account_code, bank.code;
    END IF;
    NEW.bank_account_code := bank.code;
    IF bank.branch_code <> NEW.branch_code THEN RAISE EXCEPTION 'ERP:LEDGER_BANK_BRANCH:Rekening % milik cabang %, bukan %.', bank.code, bank.branch_code, NEW.branch_code; END IF;
    IF bank.status <> 'aktif' AND NOT mig THEN RAISE EXCEPTION 'ERP:LEDGER_INACTIVE_BANK:Rekening % nonaktif.', bank.code; END IF;
    IF bank.currency <> 'IDR' THEN RAISE EXCEPTION 'ERP:LEDGER_BANK_CURRENCY:Rekening % berdenominasi valas.', bank.code; END IF;
  ELSIF NEW.bank_account_code IS NOT NULL THEN
    RAISE EXCEPTION 'ERP:LEDGER_BANK_MISMATCH:Rekening hanya boleh pada baris akun kas/bank.';
  END IF;
  RETURN NEW;
END $$;

/* ------------------------------------------------------------------------ */
/* Pemetaan data yang sudah ada (per perusahaan, dengan konteks RLS penuh)   */
/* ------------------------------------------------------------------------ */
ALTER TABLE journal_lines DISABLE TRIGGER journal_lines_immutable_trg;
DO $$ DECLARE co record; b record; moved int;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true), set_config('app.migration', 'on', true);
    IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = co.id AND code = '1-1101') THEN CONTINUE; END IF;  -- sudah berstruktur baru

    -- 1. Ganti akun struktur lama (yang dikenal) dengan COA standar.
    DELETE FROM chart_of_accounts WHERE company_id = co.id
      AND (code IN (SELECT old_code FROM coa_legacy_map()) OR code IN ('1-1100') OR code IN (SELECT s.code FROM coa_standard() s));
    INSERT INTO chart_of_accounts (company_id, code, name, type, category, parent_code, level, normal_side, is_intercompany, is_contra, is_cash, is_computed, status)
    SELECT co.id, s.code, s.name, s.type, s.category, s.parent_code, s.level, s.normal_side, s.is_intercompany, s.is_contra, s.is_cash, s.is_computed, 'aktif'
      FROM coa_standard() s ORDER BY s.level, s.code;

    -- 2. Akun detail per rekening (urut kode rekening).
    FOR b IN SELECT * FROM bank_accounts WHERE company_id = co.id ORDER BY code LOOP
      UPDATE bank_accounts SET gl_account_code = alloc_bank_gl_account(co.id, b.bank_name, b.name) WHERE id = b.id;
    END LOOP;
    UPDATE chart_of_accounts c SET status = ba.status FROM bank_accounts ba WHERE ba.company_id = co.id AND c.company_id = co.id AND c.code = ba.gl_account_code;

    -- 3. Pindahkan baris jurnal & tautan dokumen ke akun detail baru.
    UPDATE journal_lines jl SET account_code = ba.gl_account_code
      FROM bank_accounts ba WHERE jl.company_id = co.id AND jl.account_code = '1-1100' AND ba.company_id = co.id AND ba.code = jl.bank_account_code;
    UPDATE journal_lines jl SET account_code = m.new_code FROM coa_legacy_map() m WHERE jl.company_id = co.id AND jl.account_code = m.old_code;
    GET DIAGNOSTICS moved = ROW_COUNT;
    UPDATE ap_invoices a SET expense_account_code = m.new_code FROM coa_legacy_map() m WHERE a.company_id = co.id AND a.expense_account_code = m.old_code;
    UPDATE assets a SET gl_account_code = m.new_code FROM coa_legacy_map() m WHERE a.company_id = co.id AND a.gl_account_code = m.old_code;
    IF EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.company_id = co.id AND NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.company_id = co.id AND c.code = jl.account_code AND c.type = 'detail')) THEN
      RAISE EXCEPTION 'Restrukturisasi COA: masih ada baris jurnal pada akun yang bukan detail.';
    END IF;
    INSERT INTO audit_log (company_id, action, entity_type, entity_id, after)
    VALUES (co.id, 'coa.restructured', 'company', co.id::text, jsonb_build_object('struktur', 'header level 1-3, detail level 4-5', 'barisDipindah', moved));
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true), set_config('app.migration', '', true);
END $$;
SET CONSTRAINTS ALL IMMEDIATE;   -- jalankan pemeriksaan keseimbangan tertunda sebelum mengaktifkan kembali trigger
ALTER TABLE journal_lines ENABLE TRIGGER journal_lines_immutable_trg;

CREATE TRIGGER chart_of_accounts_structure BEFORE INSERT OR UPDATE OF code, type, parent_code ON chart_of_accounts FOR EACH ROW EXECUTE FUNCTION assert_coa_row();
CREATE TRIGGER bank_accounts_gl_ins BEFORE INSERT ON bank_accounts FOR EACH ROW EXECUTE FUNCTION bank_accounts_gl();
CREATE TRIGGER bank_accounts_gl_upd AFTER UPDATE OF name, status ON bank_accounts FOR EACH ROW EXECUTE FUNCTION bank_accounts_gl();
CREATE TRIGGER bank_accounts_gl_del AFTER DELETE ON bank_accounts FOR EACH ROW EXECUTE FUNCTION bank_accounts_gl();
