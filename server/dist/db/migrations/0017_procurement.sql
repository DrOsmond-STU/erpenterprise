-- 0017 — Pengadaan (Fase 6 sprint 12, dok. 07 §6.1–6.2): permintaan pembelian
-- (PR) dari unit kerja dengan persetujuan & SLA prioritas, permintaan penawaran
-- (RFQ) ke minimal dua pemasok, evaluasi harga terbaik, lalu konversi ke PO.
-- PR & RFQ adalah komitmen pra-akuntansi (tidak menjurnal); jurnal terjadi saat
-- PO hasil konversi diterima (persediaan / GRNI) dan ditagih (utang usaha).

CREATE TABLE purchase_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  request_date date NOT NULL,
  needed_date date,
  department text NOT NULL,
  requester_name text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'sedang' CHECK (priority IN ('rendah','sedang','tinggi')),
  status text NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','menunggu','disetujui','ditolak','selesai','batal')),
  estimated_total bigint NOT NULL DEFAULT 0,
  notes text,
  submitted_at timestamptz,
  sla_due_at timestamptz,                       -- batas keputusan menurut prioritas (tinggi 24 jam)
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  decided_by uuid, decided_by_name text, decided_at timestamptz, decision_note text,
  rfq_id uuid,                                  -- RFQ aktif (diisi saat RFQ dibuat, dikosongkan bila RFQ batal)
  order_id uuid REFERENCES purchase_orders(id), -- PO hasil konversi
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (company_id, doc_no)
);
CREATE INDEX purchase_requisitions_scope_idx ON purchase_requisitions (company_id, branch_code, request_date);
CREATE INDEX purchase_requisitions_status_idx ON purchase_requisitions (company_id, status);

CREATE TABLE purchase_requisition_lines (
  id bigserial PRIMARY KEY,
  requisition_id uuid NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  line_no int NOT NULL,
  product_id uuid REFERENCES products(id),
  sku text, description text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('barang','jasa')),
  expense_account_code text,
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  unit text NOT NULL,
  est_price bigint NOT NULL CHECK (est_price >= 0),
  est_total bigint NOT NULL,
  UNIQUE (requisition_id, line_no)
);

CREATE TABLE rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  requisition_id uuid NOT NULL REFERENCES purchase_requisitions(id),
  title text NOT NULL,
  rfq_date date NOT NULL,
  deadline date NOT NULL,
  status text NOT NULL DEFAULT 'terbuka' CHECK (status IN ('terbuka','dipesan','batal')),
  awarded_quote_id uuid,
  award_reason text,
  order_id uuid REFERENCES purchase_orders(id),
  cancel_reason text,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  awarded_by uuid, awarded_by_name text, awarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (company_id, doc_no),
  CHECK (deadline >= rfq_date)
);
CREATE INDEX rfqs_scope_idx ON rfqs (company_id, branch_code, rfq_date);
ALTER TABLE purchase_requisitions ADD CONSTRAINT purchase_requisitions_rfq_fk FOREIGN KEY (rfq_id) REFERENCES rfqs(id);

-- Satu baris per pemasok yang diundang; penawaran yang masuk mengisi harga per baris PR.
CREATE TABLE rfq_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES rfqs(id),
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  status text NOT NULL DEFAULT 'diundang' CHECK (status IN ('diundang','masuk','menolak')),
  quote_ref text,
  quote_date date,
  lead_days int CHECK (lead_days BETWEEN 0 AND 365),
  valid_until date,
  prices jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{lineNo, price, discPct}]
  net_amount bigint, ppn_amount bigint, total bigint,
  notes text,
  entered_by uuid, entered_by_name text, entered_at timestamptz,
  UNIQUE (rfq_id, supplier_id)
);
ALTER TABLE rfqs ADD CONSTRAINT rfqs_awarded_fk FOREIGN KEY (awarded_quote_id) REFERENCES rfq_quotes(id);

ALTER TABLE purchase_orders ADD COLUMN requisition_id uuid REFERENCES purchase_requisitions(id);
ALTER TABLE purchase_orders ADD COLUMN rfq_id uuid REFERENCES rfqs(id);

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_requisitions','purchase_requisition_lines','rfqs','rfq_quotes'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON purchase_requisitions, purchase_requisition_lines, rfqs, rfq_quotes TO erp_app;
GRANT DELETE ON purchase_requisition_lines TO erp_app;
GRANT USAGE, SELECT ON SEQUENCE purchase_requisition_lines_id_seq TO erp_app;

-- Akun biaya yang dipakai baris PR ikut dijaga pengaman bagan akun.
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
     OR EXISTS (SELECT 1 FROM purchase_requisition_lines l WHERE l.company_id = OLD.company_id AND l.expense_account_code = OLD.code)
     OR EXISTS (SELECT 1 FROM ap_invoice_lines l WHERE l.company_id = OLD.company_id AND l.account_code = OLD.code) THEN
    RAISE EXCEPTION 'ERP:ACCOUNT_LINKED:Akun % terkait dokumen lain.', OLD.code;
  END IF;
  RETURN OLD;
END $$;

INSERT INTO permissions (code) VALUES ('purchasing.requisition.create'), ('purchasing.requisition.approve'), ('purchasing.rfq.manage') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('staf_keuangan','purchasing.requisition.create'), ('staf_keuangan','purchasing.rfq.manage'),
               ('gudang','purchasing.requisition.create'), ('produksi','purchasing.requisition.create'),
               ('manajer','purchasing.requisition.create'), ('manajer','purchasing.requisition.approve'), ('manajer','purchasing.rfq.manage')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;

-- Data contoh pengadaan untuk perusahaan demo (dipanggil migrasi ini untuk KNM yang
-- sudah ada, dan oleh seed untuk basis data baru). Idempoten: hanya bila belum ada PR.
CREATE OR REPLACE FUNCTION seed_procurement_demo(co uuid) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  fitri record; osm record; sari record; kabel record; bearing record; acct text; sups uuid[];
  y int := extract(year FROM current_date)::int; pr uuid; q uuid; doc text;
BEGIN
  IF EXISTS (SELECT 1 FROM purchase_requisitions WHERE company_id = co) THEN RETURN 0; END IF;
  SELECT id, display_name INTO fitri FROM users WHERE company_id = co AND email = 'fitri@knm.co.id';
  SELECT id, display_name INTO osm FROM users WHERE company_id = co AND email = 'osmond@knm.co.id';
  SELECT id, display_name INTO sari FROM users WHERE company_id = co AND email = 'sari@knm.co.id';
  SELECT id, sku, name, unit INTO kabel FROM products WHERE company_id = co AND sku = 'BRG-3390';
  SELECT id, sku, name, unit INTO bearing FROM products WHERE company_id = co AND sku = 'BRG-2217';
  SELECT code INTO acct FROM chart_of_accounts WHERE company_id = co AND code = '5-2401' AND type = 'detail' AND status = 'aktif';
  SELECT array_agg(id ORDER BY code) INTO sups FROM (SELECT id, code FROM suppliers WHERE company_id = co AND status = 'aktif' ORDER BY code LIMIT 3) s;
  IF fitri.id IS NULL OR osm.id IS NULL OR sari.id IS NULL OR kabel.id IS NULL OR bearing.id IS NULL OR acct IS NULL OR coalesce(array_length(sups, 1), 0) < 3 THEN RETURN 0; END IF;

  -- 1. Prioritas tinggi menunggu persetujuan (SLA 24 jam berjalan).
  doc := 'PR-' || y || '-' || lpad(next_doc_no(co, 'PR', y)::text, 4, '0');
  INSERT INTO purchase_requisitions (company_id, branch_code, doc_no, request_date, needed_date, department, requester_name, description, priority, status, estimated_total, submitted_at, sla_due_at, created_by, created_by_name)
  VALUES (co, 'SBY', doc, current_date, current_date + 7, 'Gudang', fitri.display_name, 'Kabel NYY 4x16 — stok kritis untuk proyek panel', 'tinggi', 'menunggu', 17500000, now() - interval '20 hours', now() + interval '4 hours', fitri.id, fitri.display_name)
  RETURNING id INTO pr;
  INSERT INTO purchase_requisition_lines (requisition_id, company_id, branch_code, line_no, product_id, sku, description, kind, qty, unit, est_price, est_total)
  VALUES (pr, co, 'SBY', 1, kabel.id, kabel.sku, kabel.name, 'barang', 500, kabel.unit, 35000, 17500000);

  -- 2. Disetujui dan sedang RFQ ke tiga pemasok (dua penawaran masuk).
  doc := 'PR-' || y || '-' || lpad(next_doc_no(co, 'PR', y)::text, 4, '0');
  INSERT INTO purchase_requisitions (company_id, branch_code, doc_no, request_date, needed_date, department, requester_name, description, priority, status, estimated_total, submitted_at, sla_due_at, created_by, created_by_name, decided_by, decided_by_name, decided_at, decision_note)
  VALUES (co, 'CKR', doc, current_date - 3, current_date + 14, 'Produksi', 'Slamet Riyadi', 'Bearing 6205 untuk perawatan lini 2', 'sedang', 'disetujui', 16000000, now() - interval '3 days', now(), sari.id, sari.display_name, osm.id, osm.display_name, now() - interval '2 days', 'Sesuai jadwal perawatan')
  RETURNING id INTO pr;
  INSERT INTO purchase_requisition_lines (requisition_id, company_id, branch_code, line_no, product_id, sku, description, kind, qty, unit, est_price, est_total)
  VALUES (pr, co, 'CKR', 1, bearing.id, bearing.sku, bearing.name, 'barang', 200, bearing.unit, 80000, 16000000);
  doc := 'RFQ-' || y || '-' || lpad(next_doc_no(co, 'RFQ', y)::text, 4, '0');
  INSERT INTO rfqs (company_id, branch_code, doc_no, requisition_id, title, rfq_date, deadline, created_by, created_by_name)
  VALUES (co, 'CKR', doc, pr, 'Bearing 6205 — 200 pcs', current_date - 2, current_date + 3, sari.id, sari.display_name) RETURNING id INTO q;
  UPDATE purchase_requisitions SET rfq_id = q WHERE id = pr;
  INSERT INTO rfq_quotes (rfq_id, company_id, branch_code, supplier_id, status, quote_ref, quote_date, lead_days, valid_until, prices, net_amount, ppn_amount, total, entered_by, entered_by_name, entered_at)
  VALUES (q, co, 'CKR', sups[1], 'masuk', 'Q-0915', current_date - 1, 7, current_date + 30, '[{"lineNo":1,"price":78000,"discPct":0}]', 15600000, 1716000, 17316000, sari.id, sari.display_name, now() - interval '1 day'),
         (q, co, 'CKR', sups[2], 'masuk', 'SP/221', current_date - 1, 10, current_date + 21, '[{"lineNo":1,"price":76500,"discPct":0}]', 15300000, 1683000, 16983000, sari.id, sari.display_name, now() - interval '20 hours'),
         (q, co, 'CKR', sups[3], 'diundang', NULL, NULL, NULL, NULL, '[]', NULL, NULL, NULL, NULL, NULL, NULL);

  -- 3. Jasa ditolak (beralasan).
  doc := 'PR-' || y || '-' || lpad(next_doc_no(co, 'PR', y)::text, 4, '0');
  INSERT INTO purchase_requisitions (company_id, branch_code, doc_no, request_date, department, requester_name, description, priority, status, estimated_total, submitted_at, sla_due_at, created_by, created_by_name, decided_by, decided_by_name, decided_at, decision_note)
  VALUES (co, 'CKR', doc, current_date - 6, 'Gudang', 'Reza Alfarizi', 'Jasa angkut peti kayu ekspor tambahan', 'rendah', 'ditolak', 5250000, now() - interval '6 days', now() - interval '1 day', sari.id, sari.display_name, osm.id, osm.display_name, now() - interval '5 days', 'Gunakan kontrak angkutan tahunan yang sudah ada')
  RETURNING id INTO pr;
  INSERT INTO purchase_requisition_lines (requisition_id, company_id, branch_code, line_no, description, kind, expense_account_code, qty, unit, est_price, est_total)
  VALUES (pr, co, 'CKR', 1, 'Jasa angkut peti kayu Cikarang–Tanjung Priok', 'jasa', acct, 3, 'rit', 1750000, 5250000);
  RETURN 3;
END $$;

DO $$ DECLARE co uuid;
BEGIN
  SELECT id INTO co FROM companies WHERE code = 'KNM';
  IF co IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.company_id', co::text, true), set_config('app.branch_codes', '*', true);
  PERFORM seed_procurement_demo(co);
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;
