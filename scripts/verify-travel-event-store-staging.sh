#!/usr/bin/env bash
# Travel Event Store staging verification checklist runner.
# Usage (staging only):
#   export DATABASE_URL='postgresql://...staging...'
#   export APP_BASE_URL='https://staging.example.com'
#   export AUTH_TOKEN='...'
#   ./scripts/verify-travel-event-store-staging.sh
#
# Constraints:
# - Do NOT point DATABASE_URL at production (tripnara_prod).
# - TRAVEL_EVENT_STORE_ENABLED remains false until migration checks pass.

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

echo "== Phase A: Apply migration on staging =="
echo "Run manually once:"
echo "  npx prisma migrate deploy"
echo

echo "== Phase B: Schema verification =="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/verify-travel-event-store-staging.sql"
echo

echo "== Phase C: Boot checks =="
echo "1) TRAVEL_EVENT_STORE_ENABLED=false -> app should boot, no travel_events writes"
echo "2) TRAVEL_EVENT_STORE_ENABLED=true  -> app should boot, subscriber attaches"
echo "(Start app separately and confirm health endpoint.)"
echo

echo "== Phase D: Event persistence manual test (TRAVEL_EVENT_STORE_ENABLED=true) =="
cat <<'EOF'
1. Pick a staging Trip in PLANNING with planConfirmed metadata if testing -> TRAVELING
2. PATCH /trips/:id { "status": "TRAVELING" } with auth
3. Verify exactly one row:
     SELECT COUNT(*) FROM travel_events
     WHERE trip_id = '<trip-id>' AND event_type = 'trip.lifecycle.state_changed';
4. Verify segment/payload:
     SELECT segment, payload FROM travel_events WHERE trip_id = '<trip-id>' ORDER BY occurred_at DESC LIMIT 1;
   Expect: segment = STATE, payload.previousStatus/newStatus populated
5. Repeat same status PATCH -> count must NOT increase (idempotency at app layer)
6. PATCH non-status field only (e.g. name) -> no new lifecycle row
7. Simulate persistence failure (optional): break DB write permissions temporarily;
   Trip update must still succeed (fail-open)
EOF

echo
echo "Staging verification script completed (read-only DB checks done)."
