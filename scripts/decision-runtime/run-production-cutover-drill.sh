#!/usr/bin/env bash
# Full Canonical Runtime Cutover drill (devbox / staging).
#
# Two-phase by design:
#   A. Legacy posture → pre-cutover preflight (preCutoverReady=true)
#   B. Cutover env + restart → verify / smoke / post-restart gate
#
# Usage:
#   npm run production-cutover:drill
#   CUTOVER_OPERATOR=alice npm run production-cutover:drill
#   npm run production-cutover:drill -- --skip-restart   # gates only, backend already on target env
#   npm run production-cutover:drill -- --write-probe    # include unified-qa --write (mutates trip)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

OPERATOR="${CUTOVER_OPERATOR:-cutover-drill}"
SNAPSHOT_ID="${CUTOVER_DB_SNAPSHOT_ID:-devbox-cutover-drill-$(date +%Y%m%d)}"
API_BASE="${DECISION_RUNTIME_BASE_URL:-http://localhost:3000/api}"
TRIP_ID="${CUTOVER_DRILL_TRIP_ID:-3e4a1058-9218-467f-988a-c18008a14385}"
OUT_DIR="$ROOT/artifacts/production-cutover"
LOG_DIR="$OUT_DIR/logs"
SKIP_RESTART=0
WRITE_PROBE=0

for arg in "$@"; do
  case "$arg" in
    --skip-restart) SKIP_RESTART=1 ;;
    --write-probe) WRITE_PROBE=1 ;;
  esac
done

mkdir -p "$OUT_DIR" "$LOG_DIR"

log() {
  echo "[$(date -Iseconds)] [cutover-drill] $*"
}

fail() {
  log "FAIL: $*"
  exit 1
}

wait_health() {
  local url="${API_BASE%/}/decision-engine/v1/health"
  local i
  for i in $(seq 1 45); do
    if curl -sf "$url" >/dev/null 2>&1; then
      log "health OK (${i}s)"
      return 0
    fi
    sleep 2
  done
  fail "backend not healthy at $url"
}

restart_backend() {
  local env_file="$1"
  local tag="$2"
  if [[ "$SKIP_RESTART" -eq 1 ]]; then
    log "skip restart ($tag) — --skip-restart"
    wait_health
    return 0
  fi
  if fuser 3000/tcp >/dev/null 2>&1; then
    log "stopping :3000"
    fuser -k 3000/tcp >/dev/null 2>&1 || true
    sleep 2
  fi
  set -a
  # shellcheck source=/dev/null
  source "$env_file"
  set +a
  export PORT=3000
  export DECISION_GATEWAY_UNIFIED=1
  local main="dist/src/main.js"
  [[ -f dist/main.js ]] && main="dist/main.js"
  local logfile="$LOG_DIR/drill-${tag}-$(date +%Y%m%dT%H%M%S).log"
  log "start backend ($tag) env=$env_file log=$logfile"
  nohup node "$main" >>"$logfile" 2>&1 &
  echo $! >"$LOG_DIR/drill-${tag}.pid"
  wait_health
}

build_overlay() {
  node -e "
    const fs=require('fs');
    const p='$OUT_DIR';
    const s=JSON.parse(fs.readFileSync(p+'/inflight-overlay.scaffold.json','utf8'));
    const now=new Date().toISOString();
    s.pendingQueueWriteJobs={
      value:0,
      source:process.env.CUTOVER_QUEUE_EVIDENCE_SOURCE||'not-applicable',
      checkedAt:now,
      checkedBy:'$OPERATOR',
      evidence:process.env.CUTOVER_QUEUE_EVIDENCE||'not-applicable:drill-no-queue-workers'
    };
    if (s.pausedDecisionRunsAcknowledged) {
      s.pausedDecisionRunsAcknowledged.evidence='not-applicable:pausedDecisionRuns=0';
    }
    fs.writeFileSync(p+'/inflight-overlay.json', JSON.stringify(s,null,2));
  "
  log "inflight-overlay.json updated"
}

export CUTOVER_OPERATOR="$OPERATOR"
export CUTOVER_DB_SNAPSHOT_ID="$SNAPSHOT_ID"
export CUTOVER_DB_SNAPSHOT_STATUS=available
export CUTOVER_DATABASE_IDENTIFIER="${CUTOVER_DATABASE_IDENTIFIER:-devbox-postgres}"
export DECISION_RUNTIME_BASE_URL="$API_BASE"

log "======== DRILL START operator=$OPERATOR trip=$TRIP_ID api=$API_BASE ========"

log "--- unit: cutover reconciliation ---"
npx jest src/trips/guardian-decision-core/cutover/cutover-reconciliation.util.spec.ts --no-cache --runInBand

log "--- env check ---"
npm run decision-center:unified-env-check

log "--- inflight db-probe ---"
npm run production-cutover:inflight-db-probe
build_overlay

log "--- inflight clearance ---"
npm run production-cutover:inflight-clearance
node -e "
  const j=require('$OUT_DIR/inflight-clearance.json');
  if (!j.ready) { console.error('clearance not ready', j.blockers); process.exit(1); }
  console.log('clearance ready=true');
"

export CUTOVER_INFLIGHT_CLEAR_CONFIRMED=1
export CUTOVER_DB_SNAPSHOT_CONFIRMED=1

log "--- PHASE A: legacy env + pre-cutover preflight ---"
restart_backend "$ROOT/config/decision-runtime/production-rollback-legacy.env" "legacy"
npm run production-cutover:preflight || fail "pre-cutover preflight — expect preCutoverReady=true on Legacy backend"

log "--- manifest (baseline before cutover) ---"
npm run production-cutover:manifest

log "--- PHASE B: cutover env + post-restart gates ---"
restart_backend "$ROOT/config/decision-runtime/production-cutover.env" "cutover"
npm run production-cutover:verify-runtime
npm run production-cutover:smoke
npm run production-cutover:preflight -- --stage post-restart

log "--- unified-qa (read) ---"
npm run decision-center:unified-qa -- "$TRIP_ID" "$API_BASE"

if [[ "$WRITE_PROBE" -eq 1 ]]; then
  log "--- unified-qa --write (mutates trip) ---"
  npx tsx scripts/unified-decision-frontend-qa.ts --write "$TRIP_ID" "$API_BASE"
fi

npm run production-probation:status || true

log "======== DRILL COMPLETE ========"
log "artifacts: $OUT_DIR"
log "UI: Plan Studio /dashboard/plan-studio?tripId=$TRIP_ID&decisionSpace=1"
log "rollback drill: source config/decision-runtime/production-rollback-legacy.env && restart"
