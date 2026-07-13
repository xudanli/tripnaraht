#!/usr/bin/env bash
# Start Nest :3002 from dist build with assertion promotion shadow env.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="${NEST3002_LOG:-/tmp/nest3002-prod.log}"

pkill -f 'dist/src/main.js' 2>/dev/null || true
pkill -f 'nest start --watch' 2>/dev/null || true
sleep 2

export DATABASE_URL="$(grep '^DATABASE_URL=' "$ROOT/.env" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"')"
export PORT=3002
export DISABLE_REDIS="${DISABLE_REDIS:-true}"

set -a
# shellcheck disable=SC1091
source "$ROOT/config/decision-runtime/assertion-promotion.env"
set +a

export CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE="${CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE:-1}"
export CANONICAL_WEATHER_ACTIVITY_PROHIBITED="${CANONICAL_WEATHER_ACTIVITY_PROHIBITED:-1}"
export CANONICAL_ROAD_SEGMENT_UNAVAILABLE="${CANONICAL_ROAD_SEGMENT_UNAVAILABLE:-1}"
export DECISION_GATEWAY_UNIFIED="${DECISION_GATEWAY_UNIFIED:-1}"
export DECISION_TRIGGER_GATEWAY_ENABLED="${DECISION_TRIGGER_GATEWAY_ENABLED:-1}"

nohup node dist/src/main.js >"$LOG" 2>&1 &
echo "[start-nest-3002-prod] pid=$! log=$LOG"
for i in $(seq 1 45); do
  if curl -sf --max-time 2 http://127.0.0.1:3002/health >/dev/null 2>&1; then
    echo "[start-nest-3002-prod] health ok"
    exit 0
  fi
  sleep 2
done
echo "[start-nest-3002-prod] failed — tail $LOG" >&2
tail -30 "$LOG" >&2
exit 1
