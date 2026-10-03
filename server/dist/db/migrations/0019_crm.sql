-- 0019 — CRM & penawaran (Fase 6 sprint 14, dok. 07 §3.1 & §4.1): peluang penjualan
-- (kanban prospek → kualifikasi → penawaran → negosiasi → menang/kalah) dengan
-- aktivitas, dan penawaran harga berbaris (draf → terkirim → diterima/ditolak, masa
-- berlaku) yang dikonversi menjadi pesanan penjualan. Jurnal tetap terjadi pada faktur
-- dari pesanan itu (pendapatan, PPN keluaran, HPP); CRM sendiri tidak menjurnal.

CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  customer_id uuid REFERENCES customers(id),
  company_name text NOT NULL,                         -- nama pelanggan / prospek
  contact_name text, contact_phone text, contact_email text,
  value bigint NOT NULL DEFAULT 0 CHECK (value >= 0),
  stage text NOT NULL DEFAULT 'prospek' CHECK (stage IN ('prospek','kualifikasi','penawaran','negosiasi','menang','kalah')),
  probability int NOT NULL DEFAULT 10 CHECK (probability BETWEEN 0 AND 100),
  source text NOT NULL DEFAULT 'Langsung',
  owner_name text NOT NULL,
  expected_close date,
  next_action text, next_action_date date,
  lost_reason text,
  closed_at timestamptz,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (company_id, code)
);
CREATE INDEX opportunities_scope_idx ON opportunities (company_id, branch_code, stage);

CREATE TABLE opportunity_activities (
  id bigserial PRIMARY KEY,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  company_id uuid NOT NULL, branch_code char(3) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('catatan','telepon','rapat','email','kunjungan','tahap')),
  note text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  by_user uuid, by_name text NOT NULL
);
CREATE INDEX opportunity_activities_idx ON opportunity_activities (opportunity_id, at);

CREATE TABLE quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  doc_no text NOT NULL,
  opportunity_id uuid REFERENCES opportunities(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  quote_date date NOT NULL,
  valid_until date NOT NULL,
  status text NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','terkirim','diterima','ditolak','batal')),
  subtotal bigint NOT NULL DEFAULT 0, discount bigint NOT NULL DEFAULT 0, net_amount bigint NOT NULL DEFAULT 0,
  ppn_amount bigint NOT NULL DEFAULT 0, total bigint NOT NULL DEFAULT 0,
  terms text, notes text,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  sent_at timestamptz, sent_by_name text,
  decided_at timestamptz, decided_by_name text, decision_note text,
  sales_order_id uuid REFERENCES sales_orders(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (company_id, doc_no),
  CHECK (valid_until >= quote_date)
);
CREATE INDEX quotations_scope_idx ON quotations (company_id, branch_code, quote_date);

CREATE TABLE quotation_lines (
  id bigserial PRIMARY KEY,
  quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
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
  UNIQUE (quotation_id, line_no)
);

ALTER TABLE sales_orders ADD COLUMN quotation_id uuid REFERENCES quotations(id);

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['opportunities','opportunity_activities','quotations','quotation_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON opportunities, opportunity_activities, quotations, quotation_lines TO erp_app;
GRANT DELETE ON quotation_lines TO erp_app;
GRANT USAGE, SELECT ON SEQUENCE opportunity_activities_id_seq, quotation_lines_id_seq TO erp_app;

INSERT INTO permissions (code) VALUES ('crm.read'), ('crm.manage'), ('sales.quote.create') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('staf_keuangan','crm.read'), ('staf_keuangan','crm.manage'), ('staf_keuangan','sales.quote.create'),
               ('manajer','crm.read'), ('manajer','crm.manage'), ('manajer','sales.quote.create'),
               ('akuntan_senior','crm.read')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;

-- Data contoh (KNM): peluang di semua tahap untuk pelanggan yang ada, dan penawaran
-- terkirim untuk peluang tahap penawaran/negosiasi. Dipanggil juga oleh seed.
CREATE OR REPLACE FUNCTION seed_crm_demo(co uuid) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  y int := extract(year FROM current_date)::int; cust record; prod record; o uuid; q uuid; i int := 0; doc text;
  stages text[] := ARRAY['prospek','kualifikasi','penawaran','negosiasi','menang','kalah','penawaran','prospek'];
  probs int[] := ARRAY[10,30,50,75,100,0,50,10];
  names text[] := ARRAY['Kontrak tahunan komponen hidrolik','Retrofit lini perakitan','Spare part mesin stamping','Panel kendali gudang otomatis','Jasa machining presisi','Overhaul mesin CNC','Supply rantai conveyor','Braket motor listrik'];
  sources text[] := ARRAY['Tender','Referensi','Website','Langsung','Langsung','Tender','Pameran','Pameran'];
  vals bigint[] := ARRAY[280000000,165000000,42000000,89000000,18500000,72000000,54000000,320000000];
  net bigint; ppn bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM opportunities WHERE company_id = co) THEN RETURN 0; END IF;
  SELECT id, sku, name, unit, price, kind INTO prod FROM products WHERE company_id = co AND kind = 'barang' AND status = 'aktif' AND price > 0 ORDER BY sku LIMIT 1;
  IF prod.id IS NULL THEN RETURN 0; END IF;
  FOR cust IN SELECT id, name, trim(branch_code) AS branch FROM customers WHERE company_id = co AND status <> 'nonaktif' AND branch_code IS NOT NULL ORDER BY code LIMIT 8 LOOP
    i := i + 1;
    doc := 'OPP-' || y || '-' || lpad(next_doc_no(co, 'OPP', y)::text, 4, '0');
    INSERT INTO opportunities (company_id, branch_code, code, name, customer_id, company_name, value, stage, probability, source, owner_name, expected_close, next_action, next_action_date, lost_reason, closed_at, created_by_name)
    VALUES (co, cust.branch, doc, names[i], cust.id, cust.name, vals[i], stages[i], probs[i], sources[i], 'Tim Penjualan', current_date + 30,
            CASE stages[i] WHEN 'menang' THEN 'Proses pesanan' WHEN 'kalah' THEN NULL ELSE 'Tindak lanjut pelanggan' END, CASE WHEN stages[i] IN ('menang','kalah') THEN NULL ELSE current_date + 7 END,
            CASE WHEN stages[i] = 'kalah' THEN 'Harga pesaing lebih rendah' END, CASE WHEN stages[i] IN ('menang','kalah') THEN now() END, 'Data contoh')
    RETURNING id INTO o;
    INSERT INTO opportunity_activities (opportunity_id, company_id, branch_code, kind, note, by_name) VALUES (o, co, cust.branch, 'catatan', 'Peluang dicatat dari data contoh', 'Data contoh');
    IF stages[i] IN ('penawaran','negosiasi') THEN
      net := prod.price * greatest(1, vals[i] / greatest(prod.price, 1) / 10);
      ppn := round(net * 0.11);
      doc := 'QT-' || y || '-' || lpad(next_doc_no(co, 'QT', y)::text, 4, '0');
      INSERT INTO quotations (company_id, branch_code, doc_no, opportunity_id, customer_id, quote_date, valid_until, status, subtotal, net_amount, ppn_amount, total, terms, sent_at, sent_by_name, created_by_name)
      VALUES (co, cust.branch, doc, o, cust.id, current_date - 3, current_date + 27, 'terkirim', net, net, ppn, net + ppn, 'Pembayaran 30 hari setelah faktur', now() - interval '3 days', 'Data contoh', 'Data contoh')
      RETURNING id INTO q;
      INSERT INTO quotation_lines (quotation_id, company_id, branch_code, line_no, product_id, sku, description, kind, qty, unit, price, net)
      VALUES (q, co, cust.branch, 1, prod.id, prod.sku, prod.name, prod.kind, net / prod.price, prod.unit, prod.price, net);
    END IF;
  END LOOP;
  RETURN i;
END $$;

DO $$ DECLARE co uuid;
BEGIN
  SELECT id INTO co FROM companies WHERE code = 'KNM';
  IF co IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.company_id', co::text, true), set_config('app.branch_codes', '*', true);
  PERFORM seed_crm_demo(co);
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;
