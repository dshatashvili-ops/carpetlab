#!/usr/bin/env bash
# Daily logical backup of the CarpetLAB database. Run from cron, e.g.:  15 3 * * *  /opt/carpetlab/deploy/backup.sh
# Env: DATABASE_ADMIN_URL (required), BACKUP_DIR (default /var/backups/carpetlab), RETENTION_DAYS (default 14).
set -euo pipefail
: "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL is required}"
DIR="${BACKUP_DIR:-/var/backups/carpetlab}"
KEEP="${RETENTION_DAYS:-14}"
mkdir -p "$DIR"
FILE="$DIR/carpetlab-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --dbname="$DATABASE_ADMIN_URL" --file="$FILE"
pg_restore --list "$FILE" >/dev/null          # the archive must be readable
find "$DIR" -name 'carpetlab-*.dump' -mtime +"$KEEP" -delete
echo "backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
