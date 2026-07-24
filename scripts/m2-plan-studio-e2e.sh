#!/usr/bin/env bash
# M2 Plan Studio 端到端联调：BLOCK → accept → matrix
#
# 用法:
#   export BASE_URL=http://localhost:3000/api
#   export TRIP_ID=<existing-trip-uuid>
#   export USER_ID=<user-id-or-anonymous>
#   export AUTH_TOKEN=<optional-bearer>
#   ./scripts/m2-plan-studio-e2e.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:3000/api}"
TRIP_ID="${TRIP_ID:?set TRIP_ID}"
USER_ID="${USER_ID:-anonymous}"
AUTH=()
[[ -n "${AUTH_TOKEN:-}" ]] && AUTH=(-H "Authorization: Bearer ${AUTH_TOKEN}")

curl_api() {
  if ((${#AUTH[@]})); then
    curl -sS "${AUTH[@]}" "$@"
  else
    curl -sS "$@"
  fi
}

curl_post_json() {
  local url="$1"
  local body="$2"
  if ((${#AUTH[@]})); then
    curl -sS -X POST "${AUTH[@]}" -H "Content-Type: application/json" -d "$body" "$url"
  else
    curl -sS -X POST -H "Content-Type: application/json" -d "$body" "$url"
  fi
}

REQ_ID_BLOCK="m2-e2e-block-$(date +%s)"
REQ_ID_RECALC="m2-e2e-recalc-$(date +%s)"

echo "== Step 0: constraints baseline =="
BASE_VER=$(curl_api "${BASE_URL}/trips/${TRIP_ID}/constraints-summary" | jq -r '.data.constraintsVersion // .constraintsVersion // 0')
echo "constraintsVersion=${BASE_VER}"

echo "== Step 1: route_and_run (2WD Iceland — expect BLOCK or suggestions) =="
BLOCK_RESP=$(curl_post_json "${BASE_URL}/agent/route_and_run" "$(jq -n \
    --arg rid "$REQ_ID_BLOCK" \
    --arg tid "$TRIP_ID" \
    --arg uid "$USER_ID" \
    '{
      request_id: $rid,
      user_id: $uid,
      trip_id: $tid,
      message: "规划冰岛高地 F 路行程，租2WD",
      trip_plan_request: {
        request_id: $rid,
        trip_id: $tid,
        origin: "Reykjavik",
        destination: { lat: 64.1466, lng: -21.9426 },
        date_range: { start_date: "2026-07-01", end_date: "2026-07-07" },
        days: 7,
        constraints: { vehicle_type: "2WD" }
      },
      options: { allow_partial: true, max_seconds: 60 }
    }')")
echo "$BLOCK_RESP" | jq '{
  status: (.result.status // .status),
  gate: (.result.payload.axiom_gate.gate_result // .result.gate_result.gate_result // null),
  relaxation_count: ((.result.payload.relaxation_suggestions // []) | length),
  comparison_cols: ((.result.payload.comparison.options // []) | length)
}'

RELAX_Q=$(echo "$BLOCK_RESP" | jq -r '.result.payload.relaxation_suggestions_context.questionId // empty')
if [[ -z "$RELAX_Q" ]]; then
  echo "WARN: no relaxation_suggestions_context — gate may not have BLOCKed; continuing with apply-relaxation"
  RELAX_Q="gate_eval_relax_constraints"
fi

echo "== Step 2: apply-relaxation (upgrade 4WD) + recalc =="
APPLY_RESP=$(curl_post_json "${BASE_URL}/trips/${TRIP_ID}/planning-constraints/apply-relaxation" "$(jq -n \
  --argjson ver "${BASE_VER}" \
  '{
    actionIds: ["upgrade_vehicle_to_4wd"],
    constraintsVersion: ($ver | tonumber),
    source: "relaxation_bar",
    recalc: false
  }')")
echo "$APPLY_RESP" | jq '{
  constraintsVersion: (.data.constraintsVersion // .constraintsVersion),
  applied: (.data.applied // .applied),
  recalc: (.data.recalc // .recalc)
}'

echo "== Step 3: route_and_run (clarification submit — INTAKE persist path) =="
RECALC_RESP=$(curl_post_json "${BASE_URL}/agent/route_and_run" "$(jq -n \
    --arg rid "$REQ_ID_RECALC" \
    --arg tid "$TRIP_ID" \
    --arg uid "$USER_ID" \
    --arg qid "$RELAX_Q" \
    '{
      request_id: $rid,
      user_id: $uid,
      trip_id: $tid,
      message: "",
      clarification_answers: [{ questionId: $qid, value: ["upgrade_vehicle_to_4wd"] }],
      options: { allow_partial: true, max_seconds: 60 }
    }')")
echo "$RECALC_RESP" | jq '{
  status: (.result.status // .status),
  gate: (.result.payload.axiom_gate.gate_result // .result.gate_result.gate_result // null),
  relaxation_count: ((.result.payload.relaxation_suggestions // []) | length),
  comparison_cols: ((.result.payload.comparison.options // []) | length),
  comparison_overflow: (.result.payload.comparison.display // null)
}'

echo "== Step 4: verify constraints version bumped =="
curl_api "${BASE_URL}/trips/${TRIP_ID}/constraints-summary" | jq '.data.constraintsVersion // .constraintsVersion'

echo "== Done (check recalc: relaxation_count=0 after resolve, comparison_cols>=2) =="
