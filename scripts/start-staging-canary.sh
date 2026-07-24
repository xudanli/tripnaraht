#!/usr/bin/env bash
# Start Nest as the local staging canary host (tripnara_staging + M4 selected_trips).
#
#   ./scripts/start-staging-canary.sh
#   ./scripts/start-staging-canary.sh --foreground
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_STAGING="$ROOT/.env.staging"
ENV_RUNTIME="$ROOT/.env.staging.runtime"
ENV_CANARY="$ROOT/src/decision-runtime/solver/lab/planning-signoff/.staging-canary-enable.env"

if [[ ! -f "$ENV_CANARY" ]]; then
  echo "FAIL: missing $ENV_CANARY — run: npm run lab:enable-selected-trips-canary" >&2
  exit 1
fi

# Free :3000 if occupied
if pid=$(ss -ltnp 2>/dev/null | awk '/:3000/{print}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1); then
  if [[ -n "$pid" ]]; then
    echo "Stopping pid=$pid on :3000"
    kill "$pid" 2>/dev/null || true
    sleep 2
    kill -9 "$pid" 2>/dev/null || true
  fi
fi
pkill -f "nest start" 2>/dev/null || true
sleep 1

# Do NOT bash-source full .env (unquoted Chinese comments break bash).
# Nest loads .env via dotenv; we only export staging overrides that must win.
load_kv_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *=* ]] && continue
    local key="${line%%=*}"
    local val="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$val" =~ ^\".*\"$ ]]; then val="${val:1:-1}"; fi
    if [[ "$val" =~ ^\'.*\'$ ]]; then val="${val:1:-1}"; fi
    export "$key=$val"
  done < "$f"
}

load_kv_file "$ENV_STAGING"
load_kv_file "$ENV_RUNTIME"
load_kv_file "$ENV_CANARY"

MODE="canary"
if [[ "${1:-}" == "--shadow" || "${1:-}" == "--kill-switch" ]]; then
  MODE="shadow"
  shift || true
fi

# Live evaluate path for M4 selected_trips smoke
export RFC001_ICELAND_ROAD_CLOSE="${RFC001_ICELAND_ROAD_CLOSE:-1}"
export CANONICAL_ROAD_SEGMENT_UNAVAILABLE="${CANONICAL_ROAD_SEGMENT_UNAVAILABLE:-1}"
export OR_TOOLS_SOLVER_URL="${OR_TOOLS_SOLVER_URL:-http://127.0.0.1:8091}"
export OR_TOOLS_REPAIR_SHADOW="${OR_TOOLS_REPAIR_SHADOW:-1}"
export OR_TOOLS_SHADOW_OBSERVABILITY="${OR_TOOLS_SHADOW_OBSERVABILITY:-1}"
export NODE_ENV="${NODE_ENV:-development}"

if [[ "$MODE" == "shadow" ]]; then
  # Kill-switch: canary off, Neptune authoritative
  unset OR_TOOLS_AUTHORITATIVE_CANARY || true
  export OR_TOOLS_AUTHORITATIVE_CANARY=0
  export OR_TOOLS_CANARY_STAGE=shadow
fi

if echo "${DATABASE_URL:-}" | grep -qiE 'tripnara_prod|/production'; then
  echo "FAIL: DATABASE_URL still production — abort" >&2
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "FAIL: DATABASE_URL empty after loading .env.staging" >&2
  exit 1
fi

echo "Starting local staging ($MODE):"
echo "  DB=$(echo "$DATABASE_URL" | sed 's/:[^:@]*@/:***@/')"
echo "  OR_TOOLS_AUTHORITY_ENVIRONMENT=$OR_TOOLS_AUTHORITY_ENVIRONMENT"
echo "  OR_TOOLS_CANARY_STAGE=$OR_TOOLS_CANARY_STAGE"
echo "  OR_TOOLS_AUTHORITATIVE_CANARY=${OR_TOOLS_AUTHORITATIVE_CANARY:-unset}"


mkdir -p "$ROOT/artifacts"

if [[ "${1:-}" == "--foreground" ]]; then
  exec npm run dev
fi

nohup npm run dev >"$ROOT/artifacts/staging-canary-nest.log" 2>&1 &
echo $! >"$ROOT/artifacts/staging-canary-nest.pid"
echo "PID=$(cat "$ROOT/artifacts/staging-canary-nest.pid") log=artifacts/staging-canary-nest.log"
