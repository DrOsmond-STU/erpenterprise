-- 0022 — Cari, saring & ekspor tabel (PDF/XLSX) sesuai RBAC.
-- Ekspor data tabel memakai izin report.export (gerbang di API: POST /exports, dicatat
-- di jejak audit sebagai data.exported). Selain akuntan senior (sudah memegang izin ini)
-- dan admin (seluruh izin), staf keuangan dan manajer operasional diberi izin ekspor.
-- Peran lain (gudang, SDM, kasir, produksi) dapat diberi lewat Peran & Izin.
INSERT INTO permissions (code) VALUES ('report.export') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'report.export' FROM roles r WHERE r.code IN ('akuntan_senior', 'staf_keuangan', 'manajer')
ON CONFLICT DO NOTHING;
