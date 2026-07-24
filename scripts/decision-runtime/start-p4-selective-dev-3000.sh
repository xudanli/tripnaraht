#!/usr/bin/env bash
# Start :3000 with P4 CANONICAL_SELECTIVE env, wait for health, run staging probes.
#
# Usage:
#   npm run p4-selective:dev-3000
#   bash scripts/decision-runtime/start-p4-selective-dev-3000.sh [--skip-build] [--no-staging]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SKIP_BUILD=0
RUN_STAGING=1
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-staging) RUN_STAGING=0 ;;
  esac
done

LOG_DIR="$ROOT/artifacts/p4-selective-staging/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dev-3000-selective.log"
PID_FILE="$LOG_DIR/dev-3000.pid"

log() {
  echo "[$(date -Iseconds)] [p4-dev-3000] $*"
}

stop_port_3000() {
  if fuser 3000/tcp >/dev/null 2>&1; then
    log "stopping process on :3000"
    fuser -k 3000/tcp >/dev/null 2>&1 || true
    sleep 2
  fi
  if [ -f "$PID_FILE" ]; then
    OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
      kill -15 "$OLD_PID" 2>/dev/null || true
      sleep 1
      kill -9 "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
}

wait_for_health() {
  local url="http://localhost:3000/api/decision-engine/v1/health"
  local i
  for i in $(seq 1 60); do
    if curl -sf "$url" >/dev/null 2>&1; then
      log "health OK after ${i}s"
      return 0
    fi
    sleep 2
  done
  log "ERROR: health check timeout — see $LOG_FILE"
  tail -n 40 "$LOG_FILE" || true
  return 1
}

if [ "$SKIP_BUILD" -eq 0 ]; then
  log "building backend…"
  npm run backend:build
fi

stop_port_3000

export PORT=3000
export DECISION_RUNTIME_MODE=SHADOW
export CONSTRAINT_GATEWAY_MODE=ON_FOR_SELECTED
export CONSTRAINT_GATEWAY_ON_SCENARIOS=iceland-road-closed,weather-outdoor-storm,daily-load-excessive,in-trip-replan,full-plan-selection,guide-plan-selection,opening-hours-conflict
export CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1
export DECISION_TRIGGER_GATEWAY_ENABLED=1
export DECISION_TRIGGER_LINEAGE_ENABLED=1
export REPLANNING_TRIGGER_POLICY_ENABLED=1
export BOUNDED_LNS_REPAIR_ENABLED=1
export AUTHORIZATION_POLICY_GATEWAY_ENABLED=1
export DECISION_PACK_RULES=1
export LEGACY_CONVERGENCE_TARGET=CANONICAL_SELECTIVE

# Explicit SHADOW — do not inherit CANONICAL from DECISION_GATEWAY_UNIFIED alone
unset RFC001_SHADOW_MODE 2>/dev/null || true

log "starting backend on :3000 (log: $LOG_FILE)"
MAIN_ENTRY="dist/main.js"
if [ -f "dist/src/main.js" ] && [ -f "dist/src/app.module.js" ]; then
  MAIN_ENTRY="dist/src/main.js"
fi
nohup node "$MAIN_ENTRY" >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"
log "pid=$(cat "$PID_FILE")"

wait_for_health

log "runtime-capabilities snapshot:"
curl -sf "http://localhost:3000/api/decision-engine/v1/runtime-capabilities" | head -c 600 || true
echo ""

if [ "$RUN_STAGING" -eq 1 ]; then
  log "running p4-selective:staging"
  npm run p4-selective:staging
fi

log "done — server still running on :3000 (pid $(cat "$PID_FILE"))"
