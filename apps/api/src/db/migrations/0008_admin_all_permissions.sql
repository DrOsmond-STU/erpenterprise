-- 0008 — Admin Sistem memegang seluruh izin agar dapat mengontrol semua data
-- dan proses input. Izin yang ditambahkan migrasi berikutnya otomatis ikut
-- diberikan ke peran admin. Pemisahan tugas per dokumen (pembuat ≠ penyetuju)
-- tetap ditegakkan layanan, termasuk untuk admin.

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r CROSS JOIN permissions p WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION grant_permission_to_admin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO role_permissions (role_id, permission_code)
  SELECT r.id, NEW.code FROM roles r WHERE r.code = 'admin'
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER permissions_grant_admin AFTER INSERT ON permissions
  FOR EACH ROW EXECUTE FUNCTION grant_permission_to_admin();
