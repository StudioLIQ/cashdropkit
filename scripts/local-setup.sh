#!/usr/bin/env sh

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
TARGET_DB_NAME="cashdropkit"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT_DIR/.env.example" "$ENV_FILE"
fi

set_key() {
  key="$1"
  value="$2"

  if grep -q "^${key}=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$value" '
      BEGIN { FS = OFS = "=" }
      $1 == k { $0 = k "=" v }
      { print }
    ' "$ENV_FILE" > "$ENV_FILE.tmp"
    mv "$ENV_FILE.tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

unset_key() {
  key="$1"
  if grep -q "^${key}=" "$ENV_FILE"; then
    awk -v k="$key" '
      BEGIN { FS = OFS = "=" }
      $1 != k { print }
    ' "$ENV_FILE" > "$ENV_FILE.tmp"
    mv "$ENV_FILE.tmp" "$ENV_FILE"
  fi
}

detect_existing_postgres_container_on_5432() {
  docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}' 2>/dev/null \
    | awk -F'|' '
        $2 ~ /^postgres:/ && $3 ~ /0\.0\.0\.0:5432->5432\/tcp/ { print $1; exit }
      '
}

build_database_url_from_container() {
  container="$1"
  user="$(docker inspect "$container" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | sed -n 's/^POSTGRES_USER=//p' | head -n1)"
  password="$(docker inspect "$container" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | sed -n 's/^POSTGRES_PASSWORD=//p' | head -n1)"

  if [ -n "$user" ] && [ -n "$password" ]; then
    printf 'postgresql://%s:%s@localhost:5432/%s\n' "$user" "$password" "$TARGET_DB_NAME"
    return
  fi

  if [ -n "$user" ]; then
    printf 'postgresql://%s@localhost:5432/%s\n' "$user" "$TARGET_DB_NAME"
    return
  fi

  printf 'postgresql://postgres:postgres@localhost:5432/%s\n' "$TARGET_DB_NAME"
}

existing_container="$(detect_existing_postgres_container_on_5432 || true)"
if [ -n "$existing_container" ]; then
  detected_database_url="$(build_database_url_from_container "$existing_container")"
  set_key "DATABASE_URL" "$detected_database_url"
  printf '[local-setup] Reusing existing Postgres container: %s\n' "$existing_container"
else
  set_key "DATABASE_URL" "postgresql://postgres:postgres@localhost:5432/$TARGET_DB_NAME"
fi

set_key "API_ACCESS_TOKEN" "cashdropkit-public-client-token"
set_key "SESSION_SECRET" "2b531e8dddf398e4178d5f1f9abe60ae331f3f331b869a94269cb883e94f1d93"
set_key "CORS_ALLOWED_ORIGINS" "https://cashdropkit.com,https://www.cashdropkit.com,http://localhost:3000"
set_key "ELECTRUM_TESTNET_URL" "wss://chipnet.imaginary.cash:50004"
set_key "NEXT_PUBLIC_DEFAULT_NETWORK" "testnet"
set_key "NEXT_PUBLIC_TESTNET_ELECTRUM_URL" "wss://chipnet.imaginary.cash:50004"
set_key "NEXT_PUBLIC_TESTNET_EXPLORER_URL" "https://chipnet.imaginary.cash"
set_key "NEXT_PUBLIC_AUTO_LOCK_MINUTES" "15"

# Prevent Next.js dev server from accidentally binding API port.
# API defaults to 3001 without needing PORT in env.
unset_key "PORT"

printf '\n[local-setup] .env.local is ready.\n'
printf '[local-setup] DATABASE_URL=%s\n' "$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE" | head -n1)"
printf '[local-setup] API_ACCESS_TOKEN=%s\n' "cashdropkit-public-client-token"
