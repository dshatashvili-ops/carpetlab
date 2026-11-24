#!/usr/bin/env bash
# Runs the full-stack smoke against a freshly built backend + frontend. Needs PostgreSQL (see backend/.env.example).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DATABASE_URL="${DATABASE_URL:-postgresql://carpet_app:carpet@localhost:5432/carpetlab}"
export DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL:-postgresql://carpet_admin:carpet@localhost:5432/carpetlab}"
export PORT="${PORT:-3000}" BASE_URL="${BASE_URL:-http://localhost:4173}"
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

( cd "$ROOT/backend" && DATABASE_URL="$DATABASE_ADMIN_URL" npx prisma migrate deploy && npm run build )
( cd "$ROOT/frontend" && npm run build )
( cd "$ROOT/backend" && exec node dist/main.js ) & PIDS+=($!)
( cd "$ROOT/frontend" && exec node node_modules/vite/bin/vite.js preview --port 4173 --strictPort ) & PIDS+=($!)
for i in $(seq 1 40); do curl -fs "http://localhost:$PORT/api/health" >/dev/null && curl -fs "$BASE_URL/" >/dev/null && break; sleep 0.5; done
node "$ROOT/e2e/smoke.mjs"
