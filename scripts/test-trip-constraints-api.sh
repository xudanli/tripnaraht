#!/usr/bin/env bash
# Trip Constraints API smoke test
# Usage: BACKEND=http://127.0.0.1:3000 TRIP_ID=<uuid> ./scripts/test-trip-constraints-api.sh

set -euo pipefail

BACKEND="${BACKEND:-http://127.0.0.1:3000}"
TRIP_ID="${TRIP_ID:-492ff5d0-8461-461a-b975-3f65474e8108}"
BASE="${BACKEND}/api/trips/${TRIP_ID}"

echo "=== GET constraints ==="
curl -sf "${BASE}/constraints" | jq '{success, total: .data.meta.total, version: .data.meta.constraintsVersion}'

echo "=== POST constraints/check ==="
curl -sf -X POST "${BASE}/constraints/check" | jq '{success, mustHandle: .data.summary.mustHandle}'

echo "=== POST constraints/preview-impact (quick) ==="
curl -sf -X POST "${BASE}/constraints/preview-impact" \
  -H 'Content-Type: application/json' \
  -d '{"changes":[{"constraintId":"c_pacing_level","patch":{"value":"relaxed"}}]}' \
  | jq '{success, refreshType: .data.refreshType, assessBefore: .data.assessBefore}'

echo "=== POST planning/commands (dry — no recalc) ==="
VERSION=$(curl -sf "${BASE}/constraints-summary" | jq -r '.data.constraintsVersion')
curl -sf -X POST "${BASE}/planning/commands" \
  -H 'Content-Type: application/json' \
  -d "{\"command\":\"UPDATE_CONSTRAINTS\",\"constraintsVersion\":${VERSION},\"changes\":[{\"constraintId\":\"c_pacing_level\",\"patch\":{\"value\":\"relaxed\"}}],\"recalculate\":false}" \
  | jq '{success, applied: .data.applied, version: .data.constraintsVersion}'

echo "OK"
