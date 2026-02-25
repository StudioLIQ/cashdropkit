#!/usr/bin/env sh

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
TARGET_DB_NAME="cashdropkit"

"$SCRIPT_DIR/local-setup.sh"

cd "$ROOT_DIR"

set -a
. "$ENV_FILE"
set +a

detect_existing_postgres_container_on_5432() {
  docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}' 2>/dev/null \
    | awk -F'|' '
        $2 ~ /^postgres:/ && $3 ~ /0\.0\.0\.0:5432->5432\/tcp/ { print $1; exit }
      '
}

get_container_env() {
  container="$1"
  key="$2"
  docker inspect "$container" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | sed -n "s/^${key}=//p" | head -n1
}

ensure_database_exists_if_possible() {
  container="$(detect_existing_postgres_container_on_5432 || true)"
  if [ -z "$container" ]; then
    return 0
  fi

  pg_user="$(get_container_env "$container" "POSTGRES_USER")"
  pg_password="$(get_container_env "$container" "POSTGRES_PASSWORD")"
  if [ -z "$pg_user" ] || [ -z "$pg_password" ]; then
    return 0
  fi

  echo "[local-dev] Ensuring database '${TARGET_DB_NAME}' exists in ${container} ..."
  docker exec -e PGPASSWORD="$pg_password" "$container" \
    psql -U "$pg_user" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB_NAME}'" \
    | grep -q 1 || \
  docker exec -e PGPASSWORD="$pg_password" "$container" \
    psql -U "$pg_user" -d postgres -c "CREATE DATABASE ${TARGET_DB_NAME};"
}

if lsof -nP -iTCP:5432 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[local-dev] Detected existing service on :5432, reusing it."
else
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
fi

ensure_database_exists_if_possible

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
