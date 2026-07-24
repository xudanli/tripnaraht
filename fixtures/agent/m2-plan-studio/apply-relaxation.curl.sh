#!/usr/bin/env bash
# M2 Plan Studio 联调 — Gate BLOCK + Relaxation accept 写链
# 用法：export BASE_URL=http://localhost:3000 TRIP_ID=... AUTH_TOKEN=...

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000/api}"
TRIP_ID="${TRIP_ID:?set TRIP_ID}"
AUTH_HEADER=()
if [[ -n "${AUTH_TOKEN:-}" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${AUTH_TOKEN}")
fi

echo "== 1) GET constraints-summary (baseline version) =="
curl -sS "${AUTH_HEADER[@]}" \
  "${BASE_URL}/trips/${TRIP_ID}/constraints-summary" | jq .

echo "== 2) POST apply-relaxation (upgrade 4WD, optional recalc) =="
curl -sS -X POST "${AUTH_HEADER[@]}" \
  -H "Content-Type: application/json" \
  -d "$(jq '. + {"recalc": false}' fixtures/agent/m2-plan-studio/apply-relaxation-upgrade-4wd.request.json)" \
  "${BASE_URL}/trips/${TRIP_ID}/planning-constraints/apply-relaxation" | jq .

echo "== 3) route_and_run with clarification_answers (gate BLOCK retry) =="
curl -sS -X POST "${AUTH_HEADER[@]}" \
  -H "Content-Type: application/json" \
  -d @fixtures/agent/m2-plan-studio/route-and-run-gate-relaxation.request.json \
  "${BASE_URL}/agent/route_and_run" | jq '.result.payload.relaxation_suggestions, .result.payload.comparison'
