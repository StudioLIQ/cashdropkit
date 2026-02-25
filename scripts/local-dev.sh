#!/usr/bin/env sh

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

"$SCRIPT_DIR/local-setup.sh"

cd "$ROOT_DIR"

echo "[local-dev] Starting local Postgres..."
docker compose -f docker-compose.local.yml up -d postgres

echo "[local-dev] Waiting for Postgres health..."
for i in $(seq 1 40); do
  status="$(docker inspect -f '{{.State.Health.Status}}' cashdropkit-postgres 2>/dev/null || true)"
  if [ "$status" = "healthy" ]; then
    break
  fi
  if [ "$i" -eq 40 ]; then
    echo "[local-dev] Postgres did not become healthy in time."
    exit 1
  fi
  sleep 1
done

echo "[local-dev] Running DB migration..."
pnpm --filter @cashdropkit/api db:migrate

echo "[local-dev] Starting API on http://localhost:3001 ..."
pnpm --filter @cashdropkit/api dev &
API_PID=$!

cleanup() {
  echo ""
  echo "[local-dev] Stopping API process..."
  kill "$API_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo "[local-dev] Starting Web on http://localhost:3000 ..."
pnpm --filter @cashdropkit/web dev
