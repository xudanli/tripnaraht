#!/usr/bin/env bash
# Enable Decision Runtime flags on production and restart the app.
#
# Local (patch .env only — already done if you use repo .env):
#   ./scripts/deploy-prod-runtime-flags.sh --local
#
# Remote (SSH to production — requires VPN / network access):
#   ./scripts/deploy-prod-runtime-flags.sh --remote
#   PROD_SSH=tripnara ./scripts/deploy-prod-runtime-flags.sh --remote
#   PROD_SSH=deploy@47.253.148.159 PROD_DIR=/srv/tripnaraht ./scripts/deploy-prod-runtime-flags.sh --remote
#
# After deploy, verify from your machine:
#   npm run gate1:verify-prod-live
#   API_BASE_URL=http://47.253.148.159:3000 OPS_TOKEN=<jwt> npm run gate1:verify-prod-live

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROD_SSH="${PROD_SSH:-deploy@47.253.148.159}"
PROD_DIR="${PROD_DIR:-/srv/tripnaraht}"
PM2_APP="${PM2_APP:-tripnara}"

# M3 read flag intentionally false until 48h soak (experts §12.13)
RUNTIME_ENV_BLOCK=$(cat <<'EOF'
# --- Decision Runtime / Gate1 Event Store (auto-managed) ---
TRAVEL_EVENT_STORE_ENABLED=true
RUNTIME_EVENT_OUTBOX_ENABLED=true
GATE1_LINKED_TRIP_AUTO_CREATE=true
GATE1_TRIP_STATUS_SYNC=true
RUNTIME_OUTBOX_CRON_ENABLED=true
DECISION_RUNTIME_READ_FROM_PROJECTION=false
RUNTIME_REPLAY_VALIDATION=true
EOF
)

patch_env_file() {
  local env_file="$1"
  echo "Patching $env_file"

  if [[ ! -f "$env_file" ]]; then
    echo "ERROR: $env_file not found" >&2
    return 1
  fi

  cp "$env_file" "${env_file}.bak.$(date +%Y%m%d%H%M%S)"

  # Remove prior auto-managed block
  sed -i.tmp '/# --- Decision Runtime \/ Gate1 Event Store (auto-managed) ---/,/^RUNTIME_REPLAY_VALIDATION=/d' "$env_file" 2>/dev/null || \
    sed -i '' '/# --- Decision Runtime \/ Gate1 Event Store (auto-managed) ---/,/^RUNTIME_REPLAY_VALIDATION=/d' "$env_file"
  rm -f "${env_file}.tmp" 2>/dev/null || true

  # Upsert individual keys (works even without block marker)
  upsert() {
    local key="$1" val="$2"
    if grep -q "^${key}=" "$env_file" 2>/dev/null; then
      if sed --version >/dev/null 2>&1; then
        sed -i "s|^${key}=.*|${key}=${val}|" "$env_file"
      else
        sed -i '' "s|^${key}=.*|${key}=${val}|" "$env_file"
      fi
    else
      echo "${key}=${val}" >> "$env_file"
    fi
  }

  upsert TRAVEL_EVENT_STORE_ENABLED true
  upsert RUNTIME_EVENT_OUTBOX_ENABLED true
  upsert GATE1_LINKED_TRIP_AUTO_CREATE true
  upsert GATE1_TRIP_STATUS_SYNC true
  upsert RUNTIME_OUTBOX_CRON_ENABLED true
  upsert DECISION_RUNTIME_READ_FROM_PROJECTION false
  upsert RUNTIME_REPLAY_VALIDATION true

  echo "" >> "$env_file"
  echo "$RUNTIME_ENV_BLOCK" >> "$env_file"
  echo "Done."
}

restart_app_local() {
  if command -v pm2 >/dev/null 2>&1 && pm2 describe "$PM2_APP" >/dev/null 2>&1; then
    echo "Restarting PM2: $PM2_APP"
    pm2 restart "$PM2_APP" --update-env
    pm2 save || true
    return
  fi
  if [[ -f "$ROOT/docker-compose.yml" ]] && command -v docker >/dev/null 2>&1; then
    echo "Restarting docker compose app..."
    (cd "$ROOT" && docker compose up -d app)
    return
  fi
  echo "No PM2/docker restart detected — restart the Nest process manually."
}

remote_patch_and_restart() {
  echo "== Remote deploy via SSH: $PROD_SSH =="
  ssh -o ConnectTimeout=15 "$PROD_SSH" "PROD_DIR='$PROD_DIR' PM2_APP='$PM2_APP' bash -s" <<'REMOTE'
set -euo pipefail
cd "$PROD_DIR"
ENV_FILE="$PROD_DIR/.env"

upsert() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
sed -i '/# --- Decision Runtime \/ Gate1 Event Store (auto-managed) ---/,/^RUNTIME_REPLAY_VALIDATION=/d' "$ENV_FILE" 2>/dev/null || true

upsert TRAVEL_EVENT_STORE_ENABLED true
upsert RUNTIME_EVENT_OUTBOX_ENABLED true
upsert GATE1_LINKED_TRIP_AUTO_CREATE true
upsert GATE1_TRIP_STATUS_SYNC true
upsert RUNTIME_OUTBOX_CRON_ENABLED true
upsert DECISION_RUNTIME_READ_FROM_PROJECTION false
upsert RUNTIME_REPLAY_VALIDATION true

cat >> "$ENV_FILE" <<'BLOCK'

# --- Decision Runtime / Gate1 Event Store (auto-managed) ---
TRAVEL_EVENT_STORE_ENABLED=true
RUNTIME_EVENT_OUTBOX_ENABLED=true
GATE1_LINKED_TRIP_AUTO_CREATE=true
GATE1_TRIP_STATUS_SYNC=true
RUNTIME_OUTBOX_CRON_ENABLED=true
DECISION_RUNTIME_READ_FROM_PROJECTION=false
RUNTIME_REPLAY_VALIDATION=true
BLOCK

echo "Patched $ENV_FILE"

if command -v pm2 >/dev/null 2>&1 && pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
  pm2 save || true
  echo "PM2 restarted: $PM2_APP"
elif [[ -f docker-compose.yml ]] && command -v docker >/dev/null 2>&1; then
  docker compose up -d app
  echo "Docker compose app restarted"
else
  echo "WARN: restart app manually (pm2 or docker)"
fi

# Quick flag grep
grep -E 'TRAVEL_EVENT_STORE|RUNTIME_EVENT_OUTBOX|GATE1_LINKED|DECISION_RUNTIME_READ' "$ENV_FILE" || true
REMOTE
}

MODE="${1:-}"

case "$MODE" in
  --local)
    patch_env_file "$ROOT/.env"
    restart_app_local
    ;;
  --remote)
    remote_patch_and_restart
    ;;
  --help|-h|"")
    sed -n '2,18p' "$0"
    echo ""
    echo "Usage: $0 --local | --remote"
    exit 0
    ;;
  *)
    echo "Unknown: $MODE (use --local or --remote)" >&2
    exit 1
    ;;
esac

echo ""
echo "Next: npm run gate1:verify-prod-live"
echo "Optional: API_BASE_URL=http://47.253.148.159:3000 OPS_TOKEN=<jwt> npm run gate1:verify-prod-live"
