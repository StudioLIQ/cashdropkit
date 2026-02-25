#!/usr/bin/env sh

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"

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

set_key "DATABASE_URL" "postgresql://postgres:postgres@localhost:5432/cashdropkit"
set_key "API_ACCESS_TOKEN" "cashdropkit-public-client-token"
set_key "SESSION_SECRET" "2b531e8dddf398e4178d5f1f9abe60ae331f3f331b869a94269cb883e94f1d93"
set_key "CORS_ALLOWED_ORIGINS" "https://cashdropkit.com,https://www.cashdropkit.com,http://localhost:3000"
set_key "ELECTRUM_TESTNET_URL" "wss://chipnet.imaginary.cash:50004"
set_key "NEXT_PUBLIC_DEFAULT_NETWORK" "testnet"
set_key "NEXT_PUBLIC_TESTNET_ELECTRUM_URL" "wss://chipnet.imaginary.cash:50004"
set_key "NEXT_PUBLIC_TESTNET_EXPLORER_URL" "https://chipnet.imaginary.cash"
set_key "NEXT_PUBLIC_AUTO_LOCK_MINUTES" "15"

printf '\n[local-setup] .env.local is ready.\n'
printf '[local-setup] DATABASE_URL=%s\n' "postgresql://postgres:postgres@localhost:5432/cashdropkit"
printf '[local-setup] API_ACCESS_TOKEN=%s\n' "cashdropkit-public-client-token"
