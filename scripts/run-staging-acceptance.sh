#!/usr/bin/env bash
# Gate1 Decision Runtime — Staging M2/M3 acceptance (one-shot).
#
# Prerequisites (Staging app server env — not this script):
#   TRAVEL_EVENT_STORE_ENABLED=true
#   RUNTIME_EVENT_OUTBOX_ENABLED=true   # recommended
#   GATE1_LINKED_TRIP_AUTO_CREATE=true  # default ON
#   GATE1_TRIP_STATUS_SYNC=true         # default ON
#
# Usage:
#   export DATABASE_URL='postgresql://...staging...'
#   ./scripts/run-staging-acceptance.sh
#
# Options:
#   --skip-migrate     Skip prisma migrate deploy
#   --skip-link        Skip linkedTripId backfill
#   --skip-backfill    Skip historical event backfill
#   --with-m3          Also run gray-read smoke (M3)
#   --json             JSON output for acceptance report only
#   --project-id=UUID  Reconcile single project (pass-through)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_MIGRATE=false
SKIP_LINK=false
SKIP_BACKFILL=false
WITH_M3=false
JSON=false
PROJECT_ID=""

for arg in "$@"; do
  case "$arg" in
    --skip-migrate) SKIP_MIGRATE=true ;;
    --skip-link) SKIP_LINK=true ;;
    --skip-backfill) SKIP_BACKFILL=true ;;
    --with-m3) WITH_M3=true ;;
    --json) JSON=true ;;
    --project-id=*) PROJECT_ID="${arg#*=}" ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $arg (try --help)" >&2; exit 1 ;;
  esac
done

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required (staging only)." >&2
  echo "  export DATABASE_URL='postgresql://user:pass@host:5432/dbname'" >&2
  exit 1
fi

if echo "$DATABASE_URL" | grep -Eiq 'tripnara_prod|production'; then
  echo "ERROR: Refusing production-like DATABASE_URL." >&2
  exit 1
fi

echo "== Preflight =="
npm run gate1:staging-preflight -- --quick
echo

export TRAVEL_EVENT_STORE_ENABLED="${TRAVEL_EVENT_STORE_ENABLED:-true}"
export RUNTIME_EVENT_OUTBOX_ENABLED="${RUNTIME_EVENT_OUTBOX_ENABLED:-true}"

echo "== Gate1 Runtime Staging Acceptance =="
echo "Flags (this run): TRAVEL_EVENT_STORE_ENABLED=$TRAVEL_EVENT_STORE_ENABLED RUNTIME_EVENT_OUTBOX_ENABLED=$RUNTIME_EVENT_OUTBOX_ENABLED"
echo

if [[ "$SKIP_MIGRATE" != "true" ]]; then
  echo "== Step 1/6: Apply migrations (runtime_event_outbox, etc.) =="
  npx prisma migrate deploy
  echo
else
  echo "== Step 1/6: Skipped (--skip-migrate) =="
  echo
fi

if [[ "$SKIP_LINK" != "true" ]]; then
  echo "== Step 2/6: linkedTripId backfill =="
  npm run gate1:link-trips -- --backfill
  echo
else
  echo "== Step 2/6: Skipped (--skip-link) =="
  echo
fi

echo "== Step 3/6: Outbox drain (clear PENDING before backfill) =="
npm run gate1:drain-outbox || true
echo

if [[ "$SKIP_BACKFILL" != "true" ]]; then
  echo "== Step 4/6: Historical backfill (idempotent) =="
  npm run gate1:backfill
  echo
else
  echo "== Step 4/6: Skipped (--skip-backfill) =="
  echo
fi

echo "== Step 5/6: Reconcile + M2 acceptance gate =="
VERIFY_ARGS=(--reconcile)
if [[ -n "$PROJECT_ID" ]]; then
  VERIFY_ARGS+=(--project-id="$PROJECT_ID")
fi
if [[ "$JSON" == "true" ]]; then
  npx tsx "$ROOT/scripts/gate1-runtime-acceptance.ts" --json
else
  bash "$ROOT/scripts/verify-gate1-runtime-staging.sh" "${VERIFY_ARGS[@]}"
fi
echo

if [[ "$WITH_M3" == "true" ]]; then
  echo "== Step 6/6: M3 gray-read smoke =="
  export DECISION_RUNTIME_READ_FROM_PROJECTION="${DECISION_RUNTIME_READ_FROM_PROJECTION:-true}"
  export RUNTIME_REPLAY_VALIDATION="${RUNTIME_REPLAY_VALIDATION:-true}"
  M3_ARGS=()
  if [[ -n "$PROJECT_ID" ]]; then
    M3_ARGS+=(--project-id="$PROJECT_ID")
  fi
  npm run gate1:gray-read-smoke -- "${M3_ARGS[@]}"
  echo
else
  echo "== Step 6/6: M3 skipped (pass --with-m3 to run gray-read smoke) =="
  echo "  DECISION_RUNTIME_READ_FROM_PROJECTION=true npm run gate1:gray-read-smoke"
fi

echo
echo "Staging acceptance run completed."
echo "Reminder: Staging app must also have TRAVEL_EVENT_STORE_ENABLED=true for live dual-write."
echo "HTTP check (ops auth): GET /ops/runtime/acceptance · GET /ops/runtime/flags"
