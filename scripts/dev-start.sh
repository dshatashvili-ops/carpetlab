#!/usr/bin/env bash
# Starts the backend (port 3000) and the frontend (port 5173). Open http://localhost:5173 (in a Codespace: the forwarded port 5173).
# Registration e-mails are only logged to the console in development; registration itself works without them.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${DB_NAME:-carpetlab}"
export DATABASE_URL="postgresql://carpet_app:carpet@localhost:5432/$DB" PORT=3000 APP_URL="${APP_URL:-http://localhost:5173}"
PIDS=(); trap 'for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done' EXIT
( cd "$ROOT/backend" && npm run build >/dev/null && exec node dist/main.js ) & PIDS+=($!)
( cd "$ROOT/frontend" && exec node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173 --strictPort ) & PIDS+=($!)
wait
