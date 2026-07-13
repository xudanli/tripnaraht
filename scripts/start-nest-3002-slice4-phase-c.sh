#!/usr/bin/env bash
# Start Nest :3002 for Slice 4 Phase C — Attention Primary SSO visible cutover (Canary allowlist).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="${NEST3002_LOG:-/tmp/nest3002-slice4-phase-c.log}"

pkill -f 'dist/src/main.js' 2>/dev/null || true
pkill -f 'nest start --watch' 2>/dev/null || true
sleep 2

export DATABASE_URL="$(grep '^DATABASE_URL=' "$ROOT/.env" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"')"
export PORT=3002
export DISABLE_REDIS="${DISABLE_REDIS:-true}"

set -a
# shellcheck disable=SC1091
source "$ROOT/config/decision-runtime/slice4-phase-c-primary-sso.env"
set +a

echo "[start-nest-3002-slice4-phase-c] building..."
npm run build --silent 2>/dev/null || npx nest build

nohup node dist/src/main.js >"$LOG" 2>&1 &
echo "[start-nest-3002-slice4-phase-c] pid=$!"
echo "  PRIMARY_SSO=${ATTENTION_ROOT_CAUSE_PRIMARY_SSO}"
echo "  TRIP_ALLOWLIST=${ATTENTION_PRIMARY_SSO_TRIP_ALLOWLIST}"
echo "  DUAL_READ=${ATTENTION_INTERNAL_DUAL_READ_ENABLED:-0}"
echo "  log=$LOG"

for i in $(seq 1 45); do
  if curl -sf --max-time 2 http://127.0.0.1:3002/health >/dev/null 2>&1; then
    echo "[start-nest-3002-slice4-phase-c] health ok"
    exit 0
  fi
  sleep 2
done

echo "[start-nest-3002-slice4-phase-c] failed — tail $LOG"
tail -40 "$LOG" >&2
exit 1
