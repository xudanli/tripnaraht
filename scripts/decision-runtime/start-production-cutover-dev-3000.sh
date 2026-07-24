#!/usr/bin/env bash
# Start :3000 with Production Cutover env (Canonical Runtime ON, legacy-frozen, Lex shadow).
#
# Usage:
#   npm run production-cutover:dev-3000
#   npm run production-cutover:dev-3000 -- --skip-build

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
  esac
done

LOG_DIR="$ROOT/artifacts/production-cutover/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dev-3000-cutover.log"
PID_FILE="$LOG_DIR/dev-3000.pid"
BASELINE="$ROOT/artifacts/production-cutover/cutover-baseline.json"

log() {
  echo "[$(date -Iseconds)] [production-cutover] $*"
}

stop_port_3000() {
  if fuser 3000/tcp >/dev/null 2>&1; then
    log "stopping process on :3000"
    fuser -k 3000/tcp >/dev/null 2>&1 || true
    sleep 2
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
  return 1
}

if [ "$SKIP_BUILD" -eq 0 ]; then
  log "building backend…"
  npm run backend:build
fi

stop_port_3000

set -a
# shellcheck source=/dev/null
source "$ROOT/config/decision-runtime/production-cutover.env"
set +a
export PORT=3000

log "recording cutover manifest…"
CUTOVER_OPERATOR="${CUTOVER_OPERATOR:-dev-cutover}" npm run production-cutover:manifest || true

log "starting cutover profile (log: $LOG_FILE)"
MAIN_ENTRY="dist/main.js"
if [ -f "dist/src/main.js" ]; then MAIN_ENTRY="dist/src/main.js"; fi
nohup node "$MAIN_ENTRY" >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"

wait_for_health

export DECISION_RUNTIME_BASE_URL="${DECISION_RUNTIME_BASE_URL:-http://localhost:3000/api}"
npm run production-cutover:verify-runtime
npm run production-cutover:smoke || true
npm run production-probation:status || true

if [ ! -f "$BASELINE" ]; then
  log "probation baseline not anchored — verify-runtime + smoke must both pass"
fi

log "done — Canonical Runtime on :3000 (pid $(cat "$PID_FILE"))"
log "rollback: source config/decision-runtime/production-rollback-legacy.env && restart"
