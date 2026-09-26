-- 0003 — Pengguna, peran & izin, pengaturan perusahaan.

-- Pengguna baru & hasil reset wajib mengganti kata sandi saat pertama masuk.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by uuid;

-- Profil & kebijakan perusahaan (halaman Pengaturan).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Izin baru untuk mengelola pengaturan; diberikan ke Admin Sistem.
INSERT INTO permissions (code) VALUES ('admin.settings.manage') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'admin.settings.manage' FROM roles r WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

-- Peran yang tidak lagi dipakai boleh dihapus (layanan memastikan tidak ada pengguna).
GRANT DELETE ON roles TO erp_app;
