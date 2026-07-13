#!/usr/bin/env bash
# Execution Slip — post-reset preflight before Native / accept-recommended drill.
#
# Usage:
#   EXEC_SLIP_DRILL_ALLOW_PROD=1 bash scripts/execution-slip-preflight.sh
#   BASE_URL=http://localhost:3002 EXEC_SLIP_DRILL_ALLOW_PROD=1 bash scripts/execution-slip-preflight.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export EXEC_SLIP_DRILL_ALLOW_PROD="${EXEC_SLIP_DRILL_ALLOW_PROD:-1}"
export BASE_URL="${BASE_URL:-http://localhost:3002}"

echo "=== Execution Slip Preflight ==="
echo "BASE_URL=$BASE_URL"

echo "--- 1/3 Health ---"
code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/health" || true)"
if [[ "$code" != "200" ]]; then
  echo "FAIL: GET /health → HTTP $code (start Nest with CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE=1 on port 3002)"
  exit 1
fi
echo "PASS: /health 200"

echo "--- 2/3 Canary seed (DB) ---"
npx tsx scripts/execution-slip-preflight-seed-check.ts

echo "--- 3/3 departure-slip smoke (Scenario A → RECORDED) ---"
npx tsx scripts/execution-slip-preflight-departure-smoke.ts

echo "=== Preflight PASS ==="
