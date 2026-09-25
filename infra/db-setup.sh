#!/usr/bin/env sh
# Menyiapkan basis data lokal: pemilik skema (erp_owner) dan basis data erp.
# Peran aplikasi erp_app dibuat oleh migrasi 0001 (tanpa BYPASSRLS).
# Pemakaian: sudo -u postgres sh infra/db-setup.sh   (atau sebagai superuser lain)
set -eu
DB=${ERP_DB:-erp}
OWNER_PW=${ERP_OWNER_PASSWORD:-erp_owner_dev}
psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_owner') THEN
    CREATE ROLE erp_owner LOGIN CREATEROLE PASSWORD '${OWNER_PW}';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE ${DB} OWNER erp_owner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB}')\gexec
SQL
psql -v ON_ERROR_STOP=1 -d "$DB" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext; ALTER SCHEMA public OWNER TO erp_owner;"
echo "Basis data ${DB} siap (pemilik erp_owner)."
