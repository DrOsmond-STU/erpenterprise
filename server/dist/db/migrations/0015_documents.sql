-- 0015 — Repositori dokumen (Fase 4 sprint 11): dokumen berversi dengan lampiran
-- (disimpan di basis data, SHA-256 per versi), tautan ke transaksi, masa berlaku.

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_code char(3),
  doc_no text NOT NULL,
  name text NOT NULL,
  doc_type text NOT NULL,
  folder text NOT NULL DEFAULT 'Umum',
  entity_type text, entity_ref text,                -- tautan ke dokumen transaksi (mis. invoice / INV-2026-0101)
  owner_name text NOT NULL,
  status text NOT NULL DEFAULT 'berlaku' CHECK (status IN ('draf','berlaku','arsip')),
  expiry_date date,
  current_version int NOT NULL DEFAULT 0,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  UNIQUE (company_id, doc_no)
);
CREATE INDEX documents_entity_idx ON documents (company_id, entity_type, entity_ref);

CREATE TABLE document_versions (
  id bigserial PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(id),
  company_id uuid NOT NULL,
  version int NOT NULL,
  file_name text NOT NULL,
  mime text NOT NULL,
  size_bytes int NOT NULL CHECK (size_bytes BETWEEN 1 AND 1048576),
  sha256 bytea NOT NULL,
  content bytea NOT NULL,
  note text,
  uploaded_by uuid, uploaded_by_name text NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['documents','document_versions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
-- Dokumen cabang hanya terlihat oleh cabang itu; dokumen tanpa cabang berlaku seluruh perusahaan.
CREATE POLICY documents_scope ON documents USING (company_id = app_company() AND (branch_code IS NULL OR app_branch_allowed(branch_code::text)))
  WITH CHECK (company_id = app_company() AND (branch_code IS NULL OR app_branch_allowed(branch_code::text)));
CREATE POLICY document_versions_scope ON document_versions USING (company_id = app_company() AND EXISTS (SELECT 1 FROM documents d WHERE d.id = document_id))
  WITH CHECK (company_id = app_company());
GRANT SELECT, INSERT, UPDATE ON documents, document_versions TO erp_app;
GRANT USAGE, SELECT ON SEQUENCE document_versions_id_seq TO erp_app;

INSERT INTO permissions (code) VALUES ('doc.read'), ('doc.manage'), ('compliance.read') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm FROM roles r
  JOIN (VALUES ('akuntan_senior','doc.read'), ('akuntan_senior','doc.manage'), ('akuntan_senior','compliance.read'), ('staf_keuangan','doc.read'), ('staf_keuangan','doc.manage'),
               ('manajer','doc.read'), ('manajer','doc.manage'), ('manajer','compliance.read'), ('gudang','doc.read'), ('sdm','doc.read'), ('sdm','doc.manage'),
               ('produksi','doc.read'), ('kasir','doc.read')) AS p(role, perm) ON p.role = r.code
ON CONFLICT DO NOTHING;
