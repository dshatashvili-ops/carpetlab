#!/usr/bin/env bash
# Makes a registered user an operator of the service itself (tariff prices, invoice confirmation). Usage: scripts/make-admin.sh you@example.com
set -euo pipefail
EMAIL="${1:?usage: make-admin.sh <email>}"; DB="${DB_NAME:-carpetlab}"
PGPASSWORD=carpet psql "postgresql://carpet_admin@localhost:5432/$DB" -v email="$EMAIL" -c "UPDATE \"User\" SET \"isServiceAdmin\" = true WHERE email = lower(:'email')"
