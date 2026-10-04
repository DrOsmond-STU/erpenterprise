-- 0020 — CRM lengkap (Fase 6 sprint 15): prospek/lead & kampanye, kontak pelanggan &
-- pemasok, aktivitas & tugas lintas modul, penagihan piutang (janji bayar), tiket layanan
-- (keluhan pelanggan & klaim ke pemasok). Terhubung ke data induk & dokumen yang sudah ada:
-- pelanggan, pesanan/faktur/penerimaan (piutang), pemasok, PO/tagihan pemasok (hutang).
-- Biaya kampanye = tagihan pemasok bertanda kampanye yang diposting (sudah dijurnal).

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'Lainnya',
  start_date date NOT NULL,
  end_date date NOT NULL,
  budget bigint NOT NULL DEFAULT 0 CHECK (budget >= 0),
  status text NOT NULL DEFAULT 'rencana' CHECK (status IN ('rencana','berjalan','selesai','batal')),
  notes text,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (company_id, code),
  CHECK (end_date >= start_date)
);

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  code text NOT NULL,
  name text NOT NULL,                       -- nama orang
  company_name text,
  title text, phone text, email text, city text,
  source text NOT NULL DEFAULT 'Lainnya',
  campaign_id uuid REFERENCES campaigns(id),
  status text NOT NULL DEFAULT 'baru' CHECK (status IN ('baru','dihubungi','kualifikasi','diskualifikasi','dikonversi')),
  owner_name text NOT NULL,
  estimated_value bigint NOT NULL DEFAULT 0 CHECK (estimated_value >= 0),
  notes text,
  disqualify_reason text,
  converted_customer_id uuid REFERENCES customers(id),
  converted_opportunity_id uuid REFERENCES opportunities(id),
  converted_at timestamptz,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (company_id, code)
);
CREATE INDEX leads_scope_idx ON leads (company_id, branch_code, status);

ALTER TABLE opportunities ADD COLUMN lead_id uuid REFERENCES leads(id);
ALTER TABLE opportunities ADD COLUMN campaign_id uuid REFERENCES campaigns(id);
ALTER TABLE customers ADD COLUMN account_manager text;
ALTER TABLE customers ADD COLUMN lead_id uuid REFERENCES leads(id);
ALTER TABLE ap_invoices ADD COLUMN campaign_id uuid REFERENCES campaigns(id);

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  party_type text NOT NULL CHECK (party_type IN ('customer','supplier')),
  party_id uuid NOT NULL,
  name text NOT NULL,
  title text, phone text, email text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz
);
CREATE INDEX contacts_party_idx ON contacts (company_id, party_type, party_id);
CREATE UNIQUE INDEX contacts_primary_uq ON contacts (company_id, party_type, party_id) WHERE is_primary AND status = 'aktif';

CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  code text NOT NULL,
  party_type text NOT NULL CHECK (party_type IN ('customer','supplier')),
  customer_id uuid REFERENCES customers(id),
  supplier_id uuid REFERENCES suppliers(id),
  invoice_id uuid REFERENCES invoices(id),
  sales_order_id uuid REFERENCES sales_orders(id),
  purchase_order_id uuid REFERENCES purchase_orders(id),
  subject text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'lainnya' CHECK (category IN ('produk','pengiriman','tagihan','layanan','mutu','lainnya')),
  priority text NOT NULL DEFAULT 'sedang' CHECK (priority IN ('rendah','sedang','tinggi','kritis')),
  status text NOT NULL DEFAULT 'baru' CHECK (status IN ('baru','diproses','menunggu','selesai','ditutup')),
  sla_due_at timestamptz NOT NULL,
  assignee_name text,
  resolution text,
  resolved_at timestamptz,
  closed_at timestamptz,
  satisfaction int CHECK (satisfaction BETWEEN 1 AND 5),
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (company_id, code),
  CHECK ((party_type = 'customer' AND customer_id IS NOT NULL) OR (party_type = 'supplier' AND supplier_id IS NOT NULL))
);
CREATE INDEX support_tickets_scope_idx ON support_tickets (company_id, branch_code, status);

-- Aktivitas & tugas: log interaksi (selesai) dan tugas terjadwal (terbuka, tenggat, PIC),
-- tertaut ke pelanggan/pemasok/lead/peluang/faktur/tiket.
CREATE TABLE crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3),
  kind text NOT NULL CHECK (kind IN ('telepon','rapat','email','kunjungan','tugas','penagihan','catatan')),
  subject text NOT NULL,
  notes text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'terbuka' CHECK (status IN ('terbuka','selesai','batal')),
  result text,
  customer_id uuid REFERENCES customers(id),
  supplier_id uuid REFERENCES suppliers(id),
  lead_id uuid REFERENCES leads(id),
  opportunity_id uuid REFERENCES opportunities(id),
  invoice_id uuid REFERENCES invoices(id),
  ticket_id uuid REFERENCES support_tickets(id),
  assignee_id uuid, assignee_name text NOT NULL,
  done_at timestamptz, done_by_name text,
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_activities_due_idx ON crm_activities (company_id, status, due_at);
CREATE INDEX crm_activities_customer_idx ON crm_activities (company_id, customer_id);
CREATE INDEX crm_activities_supplier_idx ON crm_activities (company_id, supplier_id);
CREATE INDEX crm_activities_invoice_idx ON crm_activities (company_id, invoice_id);

-- Janji bayar pelanggan atas faktur; status (menunggu/ditepati/ingkar) dihitung dari
-- pembayaran faktur sejak janji dibuat (paid_before) — terhubung ke penerimaan piutang.
CREATE TABLE collection_promises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3) NOT NULL,
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  customer_id uuid REFERENCES customers(id),
  promise_date date NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  paid_before bigint NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','batal')),
  created_by uuid, created_by_name text NOT NULL DEFAULT 'Sistem',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX collection_promises_invoice_idx ON collection_promises (company_id, invoice_id);

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','support_tickets','collection_promises'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company() AND app_branch_allowed(branch_code::text)) WITH CHECK (company_id = app_company() AND app_branch_allowed(branch_code::text))', t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['campaigns','contacts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_scope ON %I USING (company_id = app_company()) WITH CHECK (company_id = app_company())', t, t);
  END LOOP;
END $$;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities FORCE ROW LEVEL SECURITY;
-- Aktivitas tanpa cabang (mis. pemasok seperusahaan) terlihat seluruh perusahaan.
CREATE POLICY crm_activities_scope ON crm_activities USING (company_id = app_company() AND (branch_code IS NULL OR app_branch_allowed(branch_code::text)))
  WITH CHECK (company_id = app_company() AND (branch_code IS NULL OR app_branch_allowed(branch_code::text)));
GRANT SELECT, INSERT, UPDATE ON campaigns, leads, contacts, support_tickets, crm_activities, collection_promises TO erp_app;

-- Kontak utama awal dari kolom PIC pelanggan & pemasok yang sudah ada.
DO $$ DECLARE co record;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', co.id::text, true), set_config('app.branch_codes', '*', true);
    INSERT INTO contacts (company_id, party_type, party_id, name, phone, email, is_primary, created_by_name)
    SELECT company_id, 'customer', id, pic, phone, email, true, 'Migrasi' FROM customers WHERE company_id = co.id AND coalesce(trim(pic), '') <> '';
    INSERT INTO contacts (company_id, party_type, party_id, name, phone, email, is_primary, created_by_name)
    SELECT company_id, 'supplier', id, pic, phone, email, true, 'Migrasi' FROM suppliers WHERE company_id = co.id AND coalesce(trim(pic), '') <> '';
  END LOOP;
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;

INSERT INTO permissions (code) VALUES ('crm.collection'), ('crm.ticket'), ('crm.campaign') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('staf_keuangan','crm.collection'), ('staf_keuangan','crm.ticket'),
               ('akuntan_senior','crm.collection'),
               ('manajer','crm.collection'), ('manajer','crm.ticket'), ('manajer','crm.campaign'),
               ('gudang','crm.ticket')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;

-- Data contoh (KNM): kampanye, prospek di semua status, tiket pelanggan & klaim pemasok,
-- tugas & janji bayar atas faktur jatuh tempo. Dipanggil juga oleh seed.
CREATE OR REPLACE FUNCTION seed_crm_full_demo(co uuid) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  y int := extract(year FROM current_date)::int; c1 uuid; c2 uuid; cust record; sup record; inv record; po record; doc text; n int := 0;
  st text[] := ARRAY['baru','dihubungi','kualifikasi','diskualifikasi','baru','dihubungi'];
  nm text[] := ARRAY['Budi Santoso','Ratna Dewi','Agus Wibowo','Lina Marlina','Fajar Nugroho','Sinta Lestari'];
  cmp text[] := ARRAY['PT Sinar Logam Prima','CV Maju Teknik','PT Andalan Otomasi','UD Sumber Rejeki','PT Nusantara Fabrikasi','PT Graha Mesin'];
  src text[] := ARRAY['Pameran','Website','Referensi','Pameran','Website','Telemarketing'];
BEGIN
  IF EXISTS (SELECT 1 FROM leads WHERE company_id = co) THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM branches WHERE company_id = co AND code = 'CKR') THEN RETURN 0; END IF;
  INSERT INTO campaigns (company_id, code, name, channel, start_date, end_date, budget, status, created_by_name)
  VALUES (co, 'CMP-' || y || '-' || lpad(next_doc_no(co, 'CMP', y)::text, 3, '0'), 'Pameran Manufacturing Indonesia ' || y, 'Pameran', make_date(y, 9, 1), make_date(y, 12, 31), 150000000, 'berjalan', 'Data contoh')
  RETURNING id INTO c1;
  INSERT INTO campaigns (company_id, code, name, channel, start_date, end_date, budget, status, created_by_name)
  VALUES (co, 'CMP-' || y || '-' || lpad(next_doc_no(co, 'CMP', y)::text, 3, '0'), 'Iklan digital panel kendali', 'Digital', make_date(y, 8, 1), make_date(y, 10, 31), 40000000, 'berjalan', 'Data contoh')
  RETURNING id INTO c2;
  FOR i IN 1..6 LOOP
    INSERT INTO leads (company_id, branch_code, code, name, company_name, phone, email, source, campaign_id, status, owner_name, estimated_value, disqualify_reason, created_by_name)
    VALUES (co, CASE WHEN i % 2 = 0 THEN 'CKR' ELSE 'JKT' END, 'LEAD-' || y || '-' || lpad(next_doc_no(co, 'LEAD', y)::text, 4, '0'), nm[i], cmp[i],
            '08' || (1200000000 + i * 7919)::text, lower(split_part(nm[i], ' ', 1)) || '@' || lower(replace(split_part(cmp[i], ' ', 2), '.', '')) || '.co.id', src[i],
            CASE WHEN src[i] = 'Pameran' THEN c1 WHEN src[i] = 'Website' THEN c2 END, st[i], 'Tim Penjualan', (i * 35000000)::bigint,
            CASE WHEN st[i] = 'diskualifikasi' THEN 'Tidak ada anggaran tahun ini' END, 'Data contoh');
    n := n + 1;
  END LOOP;

  SELECT id, name, trim(branch_code) AS branch INTO cust FROM customers WHERE company_id = co AND status = 'aktif' AND branch_code IS NOT NULL ORDER BY code LIMIT 1;
  SELECT id, name INTO sup FROM suppliers WHERE company_id = co AND status = 'aktif' ORDER BY code LIMIT 1;
  IF cust.id IS NOT NULL THEN
    INSERT INTO support_tickets (company_id, branch_code, code, party_type, customer_id, subject, description, category, priority, status, sla_due_at, assignee_name, created_by_name)
    VALUES (co, cust.branch, 'TKT-' || y || '-' || lpad(next_doc_no(co, 'TKT', y)::text, 4, '0'), 'customer', cust.id, 'Keterlambatan pengiriman braket', 'Pelanggan menanyakan jadwal kirim ulang', 'pengiriman', 'tinggi', 'diproses', now() + interval '6 hours', 'Tim Layanan', 'Data contoh');
  END IF;
  SELECT o.id, trim(o.branch_code) AS branch, o.supplier_id INTO po FROM purchase_orders o WHERE o.company_id = co AND o.status IN ('selesai','diterima-sebagian') ORDER BY o.order_date DESC LIMIT 1;
  IF po.id IS NOT NULL THEN
    INSERT INTO support_tickets (company_id, branch_code, code, party_type, supplier_id, purchase_order_id, subject, description, category, priority, status, sla_due_at, assignee_name, created_by_name)
    VALUES (co, po.branch, 'TKT-' || y || '-' || lpad(next_doc_no(co, 'TKT', y)::text, 4, '0'), 'supplier', po.supplier_id, po.id, 'Klaim mutu: sebagian barang cacat', 'Retur 2% barang tidak sesuai spesifikasi', 'mutu', 'sedang', 'baru', now() + interval '72 hours', 'Tim Gudang', 'Data contoh');
  END IF;
  -- Tugas penagihan & janji bayar untuk faktur jatuh tempo terbesar.
  SELECT i.id, trim(i.branch_code) AS branch, i.customer_id, i.total_gross - i.paid_amount AS open, i.paid_amount, i.doc_no INTO inv
    FROM invoices i WHERE i.company_id = co AND i.status IN ('belum-dibayar','sebagian') AND i.due_date < current_date AND i.customer_id IS NOT NULL ORDER BY i.total_gross - i.paid_amount DESC LIMIT 1;
  IF inv.id IS NOT NULL THEN
    INSERT INTO collection_promises (company_id, branch_code, invoice_id, customer_id, promise_date, amount, paid_before, note, created_by_name)
    VALUES (co, inv.branch, inv.id, inv.customer_id, current_date + 5, greatest(1, inv.open / 2), inv.paid_amount, 'Janji transfer setengah tagihan', 'Data contoh');
    INSERT INTO crm_activities (company_id, branch_code, kind, subject, notes, status, customer_id, invoice_id, assignee_name, done_at, done_by_name, created_by_name)
    VALUES (co, inv.branch, 'penagihan', 'Telepon penagihan ' || inv.doc_no, 'Bagian keuangan pelanggan berjanji transfer sebagian minggu ini', 'selesai', inv.customer_id, inv.id, 'Tim Penagihan', now() - interval '1 day', 'Data contoh', 'Data contoh');
    INSERT INTO crm_activities (company_id, branch_code, kind, subject, due_at, status, customer_id, invoice_id, assignee_name, created_by_name)
    VALUES (co, inv.branch, 'penagihan', 'Konfirmasi transfer ' || inv.doc_no, now() + interval '5 days', 'terbuka', inv.customer_id, inv.id, 'Tim Penagihan', 'Data contoh');
  END IF;
  IF cust.id IS NOT NULL THEN
    INSERT INTO crm_activities (company_id, branch_code, kind, subject, due_at, status, customer_id, assignee_name, created_by_name)
    VALUES (co, cust.branch, 'kunjungan', 'Kunjungan rutin ' || cust.name, now() + interval '2 days', 'terbuka', cust.id, 'Tim Penjualan', 'Data contoh');
  END IF;
  IF sup.id IS NOT NULL THEN
    INSERT INTO crm_activities (company_id, kind, subject, due_at, status, supplier_id, assignee_name, created_by_name)
    VALUES (co, 'rapat', 'Evaluasi kinerja pemasok ' || sup.name, now() - interval '1 day', 'terbuka', sup.id, 'Tim Pengadaan', 'Data contoh');
  END IF;
  RETURN n;
END $$;

DO $$ DECLARE co uuid;
BEGIN
  SELECT id INTO co FROM companies WHERE code = 'KNM';
  IF co IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.company_id', co::text, true), set_config('app.branch_codes', '*', true);
  PERFORM seed_crm_full_demo(co);
  PERFORM set_config('app.company_id', '', true), set_config('app.branch_codes', '', true);
END $$;
