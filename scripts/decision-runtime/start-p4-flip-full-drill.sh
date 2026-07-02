#!/usr/bin/env bash
# Dev full flip drill — selective → canonical default → canary flip → tier-B rollback.
#
# Usage:
#   npm run p4-flip-full-drill
#   npm run p4-flip-full-drill -- --skip-build
#   npm run p4-flip-full-drill -- --skip-build --keep-servers
#
# Ports:
#   :3000 CANONICAL_SELECTIVE (baseline)
#   :3001 CANONICAL_DEFAULT preview
#   :3002 canary flip → tier-B rollback drill
#
# Artifacts: artifacts/p4-flip-full-drill/report.json

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SKIP_BUILD=0
KEEP_SERVERS=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --keep-servers) KEEP_SERVERS=1 ;;
  esac
done

OUT_DIR="$ROOT/artifacts/p4-flip-full-drill"
LOG_DIR="$OUT_DIR/logs"
mkdir -p "$LOG_DIR"

log() {
  echo "[$(date -Iseconds)] [p4-flip-drill] $*"
}

resolve_main_entry() {
  if [ -f "dist/src/main.js" ] && [ -f "dist/src/app.module.js" ]; then
    echo "dist/src/main.js"
  else
    echo "dist/main.js"
  fi
}

stop_port() {
  local port="$1"
  if fuser "${port}/tcp" >/dev/null 2>&1; then
    log "stopping :${port}"
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
    sleep 2
  fi
}

wait_health() {
  local port="$1"
  local url="http://localhost:${port}/api/decision-engine/v1/health"
  local i
  for i in $(seq 1 60); do
    if curl -sf "$url" >/dev/null 2>&1; then
      log ":${port} health OK after ${i}s"
      return 0
    fi
    sleep 2
  done
  log "ERROR: :${port} health timeout"
  return 1
}

start_backend() {
  local port="$1"
  local log_file="$2"
  local main_entry
  main_entry="$(resolve_main_entry)"
  export PORT="$port"
  nohup node "$main_entry" >>"$log_file" 2>&1 &
  echo $! >"${log_file%.log}.pid"
  log ":${port} pid=$(cat "${log_file%.log}.pid")"
  wait_health "$port"
}

apply_selective_env() {
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
  unset RFC001_SHADOW_MODE 2>/dev/null || true
  unset CANONICAL_FULL_PLAN_SELECTION 2>/dev/null || true
  unset CANONICAL_EXECUTION_ENABLED 2>/dev/null || true
}

apply_canonical_default_env() {
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
}

apply_tier_b_env() {
  # shellcheck source=/dev/null
  source "$ROOT/scripts/decision-runtime/rollback-tier-b-canonical-selective.sh" >/dev/null
}

snapshot_caps() {
  local port="$1"
  local out="$2"
  curl -sf "http://localhost:${port}/api/decision-engine/v1/runtime-capabilities" >"$out" || echo '{"success":false}' >"$out"
}

if [ "$SKIP_BUILD" -eq 0 ]; then
  log "building backend…"
  npm run backend:build
fi

MAIN_ENTRY="$(resolve_main_entry)"
log "main entry: $MAIN_ENTRY"

# ── Phase 1: CANONICAL_SELECTIVE on :3000 ──────────────────────────────────
log "══ Phase 1: CANONICAL_SELECTIVE (:3000) ══"
stop_port 3000
apply_selective_env
start_backend 3000 "$LOG_DIR/phase1-selective.log"
npm run p4-selective:staging
LEGACY_CONVERGENCE_TARGET=CANONICAL_SELECTIVE npm run p4-phase:closure
snapshot_caps 3000 "$OUT_DIR/phase1-caps.json"

# ── Phase 2: CANONICAL_DEFAULT preview on :3001 ────────────────────────────
log "══ Phase 2: CANONICAL_DEFAULT preview (:3001) ══"
stop_port 3001
apply_canonical_default_env
start_backend 3001 "$LOG_DIR/phase2-canonical.log"
CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=0 npm run p4-canonical-default:preview
CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=0 CANONICAL_DEFAULT_STAGING_CLOSURE=1 npm run p4-canonical-default:closure
snapshot_caps 3001 "$OUT_DIR/phase2-caps.json"

# ── Phase 3: Canary flip on :3002 (production CANONICAL_DEFAULT) ───────────
log "══ Phase 3: Canary flip (:3002) ══"
stop_port 3002
apply_canonical_default_env
start_backend 3002 "$LOG_DIR/phase3-canary.log"
P4_CANONICAL_DEFAULT_BASE_URL=http://localhost:3002/api \
  CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=0 \
  npm run p4-canonical-default:preview
snapshot_caps 3002 "$OUT_DIR/phase3-caps.json"

# ── Phase 4: Tier B rollback on :3002 ────────────────────────────────────────
log "══ Phase 4: Tier B rollback drill (:3002) ══"
stop_port 3002
apply_tier_b_env
start_backend 3002 "$LOG_DIR/phase4-rollback.log"
npm run p4-selective:staging -- http://localhost:3002/api
snapshot_caps 3002 "$OUT_DIR/phase4-caps.json"

# ── Phase 5: Offline drills + dev advisory ─────────────────────────────────
log "══ Phase 5: Advisory + legacy-fallback drill ══"
npm run p4-legacy-fallback:drill
P4_FLIP_DEV_DRILL=1 CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=0 npm run p4-production-flip:advisory

npm run p4-observation:status
npm run p4-phase:final-closure
npx tsx scripts/decision-runtime/run-p4-flip-full-drill-report.ts

if [ "$KEEP_SERVERS" -eq 0 ]; then
  log "stopping drill servers (:3002 only; :3000/:3001 left running)"
  stop_port 3002
else
  log "keep-servers: :3000 selective, :3001 canonical, :3002 tier-B rollback"
fi

log "done — see $OUT_DIR/report.json"
