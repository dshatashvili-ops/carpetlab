#!/usr/bin/env bash
# Restores a dump into a scratch database and compares row counts with the source. Usage: verify-restore.sh <dump> 
# Env: DATABASE_ADMIN_URL (source, also used to create the scratch DB). Never touches the source data.
set -euo pipefail
DUMP="${1:?usage: verify-restore.sh <dump-file>}"
: "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL is required}"
SCRATCH="carpetlab_restore_check"
ADMIN_DB_URL="${DATABASE_ADMIN_URL%/*}/postgres"
SCRATCH_URL="${DATABASE_ADMIN_URL%/*}/$SCRATCH"
psql "$ADMIN_DB_URL" -qc "DROP DATABASE IF EXISTS $SCRATCH" -c "CREATE DATABASE $SCRATCH"
pg_restore --no-owner --dbname="$SCRATCH_URL" "$DUMP"
status=0
for t in Organization User Membership Subscription Article SizeTemplate Material Sku StockMovement CutDocument CutDocumentLine CutDocumentVersion; do
  src=$(psql "$DATABASE_ADMIN_URL" -Atc "SELECT count(*) FROM \"$t\"")
  dst=$(psql "$SCRATCH_URL" -Atc "SELECT count(*) FROM \"$t\"")
  if [ "$src" = "$dst" ]; then echo "OK   $t: $src"; else echo "DIFF $t: source=$src restored=$dst"; status=1; fi
done
psql "$ADMIN_DB_URL" -qc "DROP DATABASE $SCRATCH"
exit $status
