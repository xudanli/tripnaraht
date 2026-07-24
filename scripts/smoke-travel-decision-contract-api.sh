#!/usr/bin/env bash
# Smoke test — 旅行决策合同 / 约束控制台 API
# Usage: TRIP_ID=xxx BASE_URL=http://127.0.0.1:3000/api ./scripts/smoke-travel-decision-contract-api.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000/api}"
TRIP_ID="${TRIP_ID:?Set TRIP_ID}"

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; exit 1; }

echo "=== Smoke: Travel Decision Contract API ==="
echo "BASE_URL=$BASE_URL TRIP_ID=$TRIP_ID"
echo

GET=$(curl -sS "$BASE_URL/trips/$TRIP_ID/constraints")
export GET
python3 -c '
import json, os
d = json.loads(os.environ["GET"])
assert d.get("success") is True, d
data = d["data"]
assert "contract" in data, "missing data.contract — restart dev server after latest code"
assert data["contract"]["schemaId"] == "tripnara.travel_decision_contract@v1"
assert "displayPrinciples" in data["contract"]
keys = [s["key"] for s in data["meta"].get("sections") or []]
assert "travel_objectives" in keys, f"expected 7+2 sections, got {keys}"
print("GET ok: sections=", keys[:4], "... principles=", len(data["contract"]["displayPrinciples"]))
' || fail "GET /constraints"
pass "GET /trips/:tripId/constraints"

VERSION=$(python3 -c 'import json,os; print(json.loads(os.environ["GET"])["data"]["meta"]["constraintsVersion"])')

PATCH=$(curl -sS -X PATCH "$BASE_URL/trips/$TRIP_ID/constraints/contract" \
  -H 'Content-Type: application/json' \
  -d "{\"objectives\":{\"rankedPrinciples\":[\"SAFETY\",\"PACE\",\"CORE_EXPERIENCE\",\"BUDGET\"]},\"constraintsVersion\":$VERSION}")
export PATCH
python3 -c '
import json, os
d = json.loads(os.environ["PATCH"])
assert d.get("success") is True, d
c = d["data"]["contract"]
assert c["objectives"]["rankedPrinciples"][0] == "SAFETY"
print("PATCH ok: version", c["constraintsVersion"])
' || fail "PATCH /constraints/contract"
pass "PATCH /trips/:tripId/constraints/contract"

CHECK=$(curl -sS -X POST "$BASE_URL/trips/$TRIP_ID/constraints/check" \
  -H 'Content-Type: application/json' -d '{}')
export CHECK
python3 -c '
import json, os
d = json.loads(os.environ["CHECK"])
assert d.get("success") is True, d
assert "contractConflicts" in d["data"], "missing contractConflicts"
print("CHECK ok: hasConflicts=", d["data"]["hasConflicts"])
' || fail "POST /constraints/check"
pass "POST /trips/:tripId/constraints/check"

VERSION=$(python3 -c 'import json,os; print(json.loads(os.environ["GET"])["data"]["meta"]["constraintsVersion"])')
PREVIEW=$(curl -sS -X POST "$BASE_URL/trips/$TRIP_ID/constraints/preview-impact" \
  -H 'Content-Type: application/json' \
  -d "{\"changes\":[{\"constraintId\":\"c_max_daily_drive\",\"patch\":{\"value\":3}}],\"constraintsVersion\":$VERSION}")
export PREVIEW
python3 -c '
import json, os
d = json.loads(os.environ["PREVIEW"])
assert d.get("success") is True, d
si = d["data"].get("structuredImpact")
assert si and si.get("summaryBullets"), "missing structuredImpact.summaryBullets"
print("PREVIEW ok: bullets=", len(si["summaryBullets"]))
' || fail "POST /constraints/preview-impact"
pass "POST /trips/:tripId/constraints/preview-impact"

echo
echo "All smoke checks passed."
