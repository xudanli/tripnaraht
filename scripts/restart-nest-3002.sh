#!/usr/bin/env bash
# Restart Nest API on :3002 with Assertion Promotion shadow env (preserves soak flags).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="${NEST3002_LOG:-/tmp/nest3002-watch.log}"

echo "[restart-nest-3002] stopping existing nest watch..."
pkill -f 'nest start --watch' 2>/dev/null || true
sleep 2

set -a
# shellcheck disable=SC1091
source "$ROOT/.env" 2>/dev/null || true
# shellcheck disable=SC1091
source "$ROOT/config/decision-runtime/assertion-promotion.env" 2>/dev/null || true
set +a

export PORT=3002
export CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE="${CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE:-1}"
export CANONICAL_WEATHER_ACTIVITY_PROHIBITED="${CANONICAL_WEATHER_ACTIVITY_PROHIBITED:-1}"
export CANONICAL_ROAD_SEGMENT_UNAVAILABLE="${CANONICAL_ROAD_SEGMENT_UNAVAILABLE:-1}"
export DECISION_GATEWAY_UNIFIED="${DECISION_GATEWAY_UNIFIED:-1}"
export DECISION_TRIGGER_GATEWAY_ENABLED="${DECISION_TRIGGER_GATEWAY_ENABLED:-1}"

nohup npm run backend:dev >"$LOG" 2>&1 &
echo "[restart-nest-3002] started pid=$! log=$LOG"
for i in $(seq 1 60); do
  if curl -sf --max-time 2 http://127.0.0.1:3002/health >/dev/null 2>&1; then
    echo "[restart-nest-3002] health ok"
    exit 0
  fi
  sleep 2
done
echo "[restart-nest-3002] health timeout — check $LOG" >&2
exit 1
