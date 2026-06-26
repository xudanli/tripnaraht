#!/usr/bin/env bash
# Gate1 ↔ Decision Runtime staging verification and reconciliation.
#
# Usage (staging only):
#   export DATABASE_URL='postgresql://...staging...'
#   export TRAVEL_EVENT_STORE_ENABLED=true   # on app server, not this script
#   ./scripts/verify-gate1-runtime-staging.sh
#
# Full reconciliation (JSON report, exits 1 on mismatch):
#   ./scripts/verify-gate1-runtime-staging.sh --reconcile
#
# Single project:
#   ./scripts/verify-gate1-runtime-staging.sh --reconcile --project-id=<uuid>

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required (staging only)." >&2
  exit 1
fi

if echo "$DATABASE_URL" | grep -Eiq 'tripnara_prod|production'; then
  echo "ERROR: Refusing to run against production-like DATABASE_URL." >&2
  exit 1
fi

RECONCILE=false
PROJECT_ID=""

for arg in "$@"; do
  case "$arg" in
    --reconcile) RECONCILE=true ;;
    --project-id=*) PROJECT_ID="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

echo "== Phase A: Schema + SQL spot checks =="
if command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/verify-gate1-runtime-staging.sql"
else
  echo "WARN: psql not found — skipping SQL spot checks (Phase C/D still run via tsx)."
  echo "  Install psql or run: psql \"\$DATABASE_URL\" -f scripts/verify-gate1-runtime-staging.sql"
fi
echo

echo "== Phase B: App prerequisites =="
cat <<'EOF'
1. Staging app: TRAVEL_EVENT_STORE_ENABLED=true
2. Gate1 projects must have linked_trip_id pointing to existing trips.id
3. After advisor actions (decision, conflict publish, etc.), re-run this script
EOF
echo

if [[ "$RECONCILE" == "true" ]]; then
  echo "== Phase C: Shadow projection reconciliation =="
  ARGS=()
  if [[ -n "$PROJECT_ID" ]]; then
    ARGS+=(--project-id="$PROJECT_ID")
  fi
  npx tsx "$ROOT/scripts/reconcile-gate1-runtime-staging.ts" "${ARGS[@]}"
  echo
  echo "== Phase D: M2/M3 acceptance gate =="
  ACCEPT_ARGS=()
  if [[ -n "$PROJECT_ID" ]]; then
    : # acceptance is global; single-project reconcile already ran
  fi
  npx tsx "$ROOT/scripts/gate1-runtime-acceptance.ts" "${ACCEPT_ARGS[@]}"
  echo
  echo "== Phase E: Optional backfill / gray-read smoke =="
  echo "  TRAVEL_EVENT_STORE_ENABLED=true npm run gate1:backfill"
  echo "  DECISION_RUNTIME_READ_FROM_PROJECTION=true npm run gate1:gray-read-smoke"
else
  echo "== Phase C: Skipped (pass --reconcile for full projection diff) =="
  echo "  npx tsx scripts/reconcile-gate1-runtime-staging.ts"
  echo "  npm run gate1:backfill  # idempotent historical backfill"
fi

echo
echo "Gate1 Runtime staging verification completed."
