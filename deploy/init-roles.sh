#!/bin/sh
# Creates the restricted application role (idempotent) and prepares the WAL archive directory.
set -eu
chown postgres:postgres /wal
psql "postgresql://carpet_admin:${POSTGRES_PASSWORD}@db:5432/carpetlab" -v ON_ERROR_STOP=1 -v app_password="${APP_DB_PASSWORD}" <<'SQL'
SELECT 'CREATE ROLE carpet_app LOGIN NOBYPASSRLS PASSWORD ' || quote_literal(:'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carpet_app')
\gexec
SQL
