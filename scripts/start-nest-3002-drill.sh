#!/usr/bin/env bash
# Start Nest :3002 for observation drills (optional test failpoint).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="${NEST3002_LOG:-/tmp/nest3002-prod.log}"

pkill -f 'dist/src/main.js' 2>/dev/null || true
sleep 2

export DATABASE_URL="$(grep '^DATABASE_URL=' "$ROOT/.env" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"')"
export PORT=3002
export DISABLE_REDIS="${DISABLE_REDIS:-true}"

set -a
# shellcheck disable=SC1091
source "$ROOT/config/decision-runtime/assertion-promotion.env"
# shellcheck disable=SC1091
source "$ROOT/config/decision-runtime/assertion-promotion-drill.env"
set +a

# Override for retry drill: ASSERTION_PROMOTION_DRILL_FAIL_ONCE=1 ./scripts/start-nest-3002-drill.sh
if [ "${ASSERTION_PROMOTION_DRILL_FAIL_ONCE:-0}" = "1" ]; then
  export ASSERTION_PROMOTION_TEST_FAIL_ONCE=1
  echo "[start-nest-3002-drill] TEST_FAIL_ONCE=1"
fi

export CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE="${CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE:-1}"
export CANONICAL_WEATHER_ACTIVITY_PROHIBITED="${CANONICAL_WEATHER_ACTIVITY_PROHIBITED:-1}"
export CANONICAL_ROAD_SEGMENT_UNAVAILABLE="${CANONICAL_ROAD_SEGMENT_UNAVAILABLE:-1}"
export DECISION_GATEWAY_UNIFIED="${DECISION_GATEWAY_UNIFIED:-1}"
export DECISION_TRIGGER_GATEWAY_ENABLED="${DECISION_TRIGGER_GATEWAY_ENABLED:-1}"

echo "[start-nest-3002-drill] building..."
npm run build --silent 2>/dev/null || npx nest build

nohup node dist/src/main.js >"$LOG" 2>&1 &
echo "[start-nest-3002-drill] pid=$! log=$LOG"
for i in $(seq 1 45); do
  if curl -sf --max-time 2 http://127.0.0.1:3002/health >/dev/null 2>&1; then
    echo "[start-nest-3002-drill] health ok SHADOW_MODE=${ASSERTION_PROMOTION_SHADOW_MODE} FAIL_ONCE=${ASSERTION_PROMOTION_TEST_FAIL_ONCE:-0}"
    exit 0
  fi
  sleep 2
done
tail -30 "$LOG" >&2
exit 1
