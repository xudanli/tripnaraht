#!/usr/bin/env bash
# Live smoke against OR-Tools sidecar (ADR-008). Does NOT promote authority.
# Requires: uvicorn on OR_TOOLS_SOLVER_URL (default http://127.0.0.1:8091)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="${OR_TOOLS_SOLVER_URL:-http://127.0.0.1:8091}"
BASE="${BASE%/}"
OUT_DIR="${ORTOOLS_LIVE_OUT_DIR:-$ROOT/artifacts/ortools-live-smoke}"
FIXTURE="$ROOT/python/solver/fixtures/day_shift_swap_10.json"
mkdir -p "$OUT_DIR"

echo "==> OR-Tools live smoke → $BASE"

health="$(curl -sf --max-time 5 "$BASE/health")" || {
  echo "FAIL: health unreachable at $BASE"
  exit 1
}
echo "$health" | python3 -c "
import sys,json
h=json.load(sys.stdin)
assert h.get('ok') is True, h
assert h.get('nativeCpSat') is False, h
ops=set(h.get('mvpOperations') or [])
need={'SHIFT','SWAP','REROUTE','SHORTEN','REPLACE'}
assert need <= ops, (ops, need)
print('health OK', sorted(ops))
"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

run_op() {
  local op="$1"
  python3 - "$FIXTURE" "$op" <<'PY' >"$tmp"
import json,sys
raw=json.load(open(sys.argv[1]))
raw["operation"]=sys.argv[2]
raw["requestId"]=f"live-smoke-{sys.argv[2].lower()}"
if sys.argv[2]=="REPLACE":
    # stamp REPLACE_POOL from a4→a6 if present
    ids={n["nodeId"] for n in raw["nodes"]}
    if "a4" in ids and "a6" in ids:
        raw.setdefault("constraints",[]).append({
            "constraintId":"replace-pool-live",
            "kind":"REPLACE_POOL",
            "hard":False,
            "payload":{"fromNodeId":"a4","toNodeId":"a6"},
        })
print(json.dumps(raw))
PY
  local resp
  resp="$(curl -sf --max-time 10 -X POST "$BASE/v1/solve" \
    -H 'content-type: application/json' --data @"$tmp")"
  echo "$resp" | python3 -c "
import sys,json
r=json.load(sys.stdin)
assert r.get('schemaId')=='tripnara.solver_response@v1', r
assert r.get('solverMeta',{}).get('nativeCpSat') is False, r
status=r.get('status')
n=len(r.get('candidates') or [])
print(f\"{sys.argv[1]} status={status} candidates={n}\")
assert status in ('SOLVED','PARTIAL','TIMEOUT','INFEASIBLE'), status
assert status!='ERROR', r
" "$op"
  echo "$resp" >"$OUT_DIR/solve-${op,,}.json"
}

for op in SWAP REROUTE SHORTEN REPLACE; do
  run_op "$op"
done

echo "==> Nest live harness (optional)"
if command -v npm >/dev/null 2>&1; then
  (
    cd "$ROOT"
    OR_TOOLS_SOLVER_URL="$BASE" OR_TOOLS_REPAIR_SHADOW=1 \
      npm test -- --testPathPatterns='ortools-road-close-shadow.harness' --no-coverage
  )
fi

cat >"$OUT_DIR/summary.json" <<EOF
{
  "schemaId": "tripnara.ortools_live_smoke@v1",
  "authoritativePromotion": false,
  "nativeCpSat": false,
  "solverUrl": "$BASE",
  "verdict": "PASS",
  "ops": ["SWAP", "REROUTE", "SHORTEN", "REPLACE"]
}
EOF

echo "==> OR-Tools live smoke PASS (report: $OUT_DIR/summary.json)"
