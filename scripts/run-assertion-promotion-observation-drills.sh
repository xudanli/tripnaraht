#!/usr/bin/env bash
# Run both Weather Auto-Promotion Shadow Observation drills.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
EVIDENCE=internal-docs/operations/evidence
STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
LOG="$EVIDENCE/assertion-promotion-observation-logs-${STAMP}.txt"
mkdir -p "$EVIDENCE"
exec > >(tee -a "$LOG") 2>&1

echo "=== Observation Drills $STAMP ==="
date -u

set -a
source "$ROOT/.env" 2>/dev/null || true
source "$ROOT/config/decision-runtime/vedur-collector-ingest.env"
source "$ROOT/config/decision-runtime/assertion-promotion.env"
set +a
export DATABASE_URL="${DATABASE_URL:-$(grep '^DATABASE_URL=' "$ROOT/.env" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"')}"

echo ""
echo "=== Phase 1: Hazard Lifecycle (normal shadow, no failpoint) ==="
bash "$ROOT/scripts/start-nest-3002-drill.sh"
sleep 2
npx tsx "$ROOT/scripts/run-assertion-promotion-observation-drills.ts" --drill=lifecycle

echo ""
echo "=== Phase 2: Retry Scheduler (fail-once on :3002) ==="
ASSERTION_PROMOTION_DRILL_FAIL_ONCE=1 bash "$ROOT/scripts/start-nest-3002-drill.sh"
sleep 2
ASSERTION_PROMOTION_TEST_FAIL_ONCE=1 npx tsx "$ROOT/scripts/run-assertion-promotion-observation-drills.ts" --drill=retry

echo ""
echo "=== Restore normal shadow (failpoint off) ==="
bash "$ROOT/scripts/start-nest-3002-prod.sh"

echo ""
echo "DONE log=$LOG"
