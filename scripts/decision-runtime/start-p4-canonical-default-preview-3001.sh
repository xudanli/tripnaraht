#!/usr/bin/env bash
# Start :3001 with CANONICAL_DEFAULT preview env (does not touch :3000 selective).
#
# Usage:
#   npm run p4-canonical-default:dev-3001
#   npm run p4-canonical-default:dev-3001 -- --skip-build

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
  esac
done

LOG_DIR="$ROOT/artifacts/p4-canonical-default-preview/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dev-3001-canonical-default.log"
PID_FILE="$LOG_DIR/dev-3001.pid"

log() {
  echo "[$(date -Iseconds)] [p4-canonical-3001] $*"
}

stop_port_3001() {
  if fuser 3001/tcp >/dev/null 2>&1; then
    log "stopping process on :3001"
    fuser -k 3001/tcp >/dev/null 2>&1 || true
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
  local url="http://localhost:3001/api/decision-engine/v1/health"
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

stop_port_3001

export PORT=3001
export DECISION_RUNTIME_MODE=CANONICAL
export CONSTRAINT_GATEWAY_MODE=ON
export CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1
export CANONICAL_FULL_PLAN_SELECTION=1
export CANONICAL_EXECUTION_ENABLED=1
export GUIDE_CANONICAL_PLAN_SELECTION=1
export GUIDE_CANONICAL_ACCEPT_EXECUTE=1
export DECISION_TRIGGER_GATEWAY_ENABLED=1
export DECISION_TRIGGER_LINEAGE_ENABLED=1
export REPLANNING_TRIGGER_POLICY_ENABLED=1
export BOUNDED_LNS_REPAIR_ENABLED=1
export AUTHORIZATION_POLICY_GATEWAY_ENABLED=1
export DECISION_PACK_RULES=1
export LEGACY_CONVERGENCE_TARGET=CANONICAL_DEFAULT
export OPTIMIZATION_STRATEGY_MODE=AUTO

unset RFC001_SHADOW_MODE 2>/dev/null || true
unset CONSTRAINT_GATEWAY_ON_SCENARIOS 2>/dev/null || true

log "starting backend on :3001 (log: $LOG_FILE)"
MAIN_ENTRY="dist/main.js"
if [ -f "dist/src/main.js" ] && [ -f "dist/src/app.module.js" ]; then
  MAIN_ENTRY="dist/src/main.js"
fi
nohup node "$MAIN_ENTRY" >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"
log "pid=$(cat "$PID_FILE")"

wait_for_health

log "running canonical-default preview gates"
CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=0 npm run p4-canonical-default:preview
CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=0 CANONICAL_DEFAULT_STAGING_CLOSURE=1 npm run p4-canonical-default:closure

log "done — preview server on :3001 (pid $(cat "$PID_FILE"))"
