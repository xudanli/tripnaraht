#!/usr/bin/env bash
# Start :3000 with Production Transition observation env + weekly ops smoke.
#
# Usage:
#   npm run production-transition:dev-3000
#   bash scripts/decision-runtime/start-production-transition-dev-3000.sh [--skip-build] [--no-ops]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SKIP_BUILD=0
RUN_OPS=1
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-ops) RUN_OPS=0 ;;
  esac
done

LOG_DIR="$ROOT/artifacts/production-transition/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dev-3000-observation.log"
PID_FILE="$LOG_DIR/dev-3000.pid"

log() {
  echo "[$(date -Iseconds)] [production-transition] $*"
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

set -a
# shellcheck source=/dev/null
source "$ROOT/config/decision-runtime/production-transition.observation.env"
if [ -f "$ROOT/.env.production-transition.local" ]; then
  # shellcheck source=/dev/null
  source "$ROOT/.env.production-transition.local"
fi
set +a

export PORT=3000

log "starting :3000 observation profile (log: $LOG_FILE)"
MAIN_ENTRY="dist/main.js"
if [ -f "dist/src/main.js" ] && [ -f "dist/src/app.module.js" ]; then
  MAIN_ENTRY="dist/src/main.js"
fi
nohup node "$MAIN_ENTRY" >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"
log "pid=$(cat "$PID_FILE")"

wait_for_health

BASELINE="$ROOT/artifacts/production-observation/baseline.json"
if [ ! -f "$BASELINE" ]; then
  mkdir -p "$(dirname "$BASELINE")"
  node -e "
    const fs=require('fs');
    let closure=null;
    try{closure=JSON.parse(fs.readFileSync('artifacts/p4-phase-status/closure.json','utf8'))}catch{}
    fs.writeFileSync(process.argv[1], JSON.stringify({
      schemaId:'tripnara.production_observation_baseline@v1',
      startedAt:new Date().toISOString(),
      selectiveClosureAt:closure?.generatedAt??null,
      selectiveClosureOverall:closure?.overall??null,
      profile:'selective-observation',
      minObservationDays:Number(process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS||30),
      baseUrl:process.env.DECISION_RUNTIME_BASE_URL||null
    },null,2));
  " "$BASELINE"
  log "observation baseline created: $BASELINE"
fi

export DECISION_RUNTIME_BASE_URL="${DECISION_RUNTIME_BASE_URL:-http://localhost:3000/api}"

log "trigger-wiring + observation report:"
npm run trigger-wiring:status
npm run production-observation:report

if [ "$RUN_OPS" -eq 1 ]; then
  log "running p5-weekly-ops"
  npm run p5-weekly-ops
fi

log "done — server on :3000 (pid $(cat "$PID_FILE"))"
log "M7 preview: npm run m7-trigger-center:preview"
