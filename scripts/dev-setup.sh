#!/usr/bin/env bash
# One-time (idempotent) setup of a development machine: PostgreSQL, roles, database, dependencies, migrations, demo prices.
# Works in a GitHub Codespace / any Debian-Ubuntu box. Env: DB_NAME (default carpetlab).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${DB_NAME:-carpetlab}"
SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo"

if ! command -v psql >/dev/null 2>&1 || ! ls /usr/lib/postgresql/*/bin/postgres >/dev/null 2>&1; then
  $SUDO apt-get update -qq && $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-client
fi
$SUDO service postgresql start >/dev/null 2>&1 || $SUDO pg_ctlcluster "$(ls /usr/lib/postgresql | tail -1)" main start || true
# wait (max 60 s) until the server accepts connections; pg_isready never blocks, unlike a bare psql
for i in $(seq 1 60); do pg_isready -q -h /var/run/postgresql && break; sleep 1; done
pg_isready -h /var/run/postgresql || { echo 'PostgreSQL did not start' >&2; exit 1; }

# run "<sql>": executes SQL as the postgres superuser, reading it from stdin (no shell-quoting of $$ blocks)
if [ -z "$SUDO" ]; then PSQL=(su postgres -c "psql -v ON_ERROR_STOP=1 -qAt"); else PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -qAt); fi
run() { printf '%s\n' "$1" | timeout 60 "${PSQL[@]}"; }
run 'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='"'"'carpet_admin'"'"') THEN CREATE ROLE carpet_admin LOGIN SUPERUSER PASSWORD '"'"'carpet'"'"'; END IF; END $$;'
run 'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='"'"'carpet_app'"'"') THEN CREATE ROLE carpet_app LOGIN NOBYPASSRLS PASSWORD '"'"'carpet'"'"'; END IF; END $$;'
[ "$(run "SELECT 1 FROM pg_database WHERE datname='$DB'")" = "1" ] || run "CREATE DATABASE \"$DB\" OWNER carpet_admin"

export DATABASE_ADMIN_URL="postgresql://carpet_admin:carpet@localhost:5432/$DB"
( cd "$ROOT/backend" && npm install --no-audit --no-fund && DATABASE_URL="$DATABASE_ADMIN_URL" npx prisma generate && DATABASE_URL="$DATABASE_ADMIN_URL" npx prisma migrate deploy )
( cd "$ROOT/frontend" && npm install --no-audit --no-fund )

# Demo tariff prices so the "Подписка" screen has something to show (kopecks). Safe to re-run.
PGPASSWORD=carpet psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
INSERT INTO "TariffPrice" (id, plan, months, "priceKopecks") VALUES
 (gen_random_uuid(),1,1,150000),(gen_random_uuid(),1,3,400000),(gen_random_uuid(),1,6,750000),(gen_random_uuid(),1,12,1400000),
 (gen_random_uuid(),2,1,450000),(gen_random_uuid(),2,3,1200000),(gen_random_uuid(),2,6,2300000),(gen_random_uuid(),2,12,4300000),
 (gen_random_uuid(),3,1,1200000),(gen_random_uuid(),3,3,3300000),(gen_random_uuid(),3,6,6300000),(gen_random_uuid(),3,12,11900000)
ON CONFLICT (plan, months) DO NOTHING;
SQL
echo "setup ok (database: $DB)"
