#!/usr/bin/env bash
set -euo pipefail

BRIDGE_URL="${ROLL_BRIDGE_URL:-http://localhost:8001}"
DURATION_HOURS="${BURNIN_HOURS:-48}"
INTERVAL_SEC="${BURNIN_INTERVAL_SEC:-15}"
OUT_FILE="${BURNIN_OUTPUT:-burnin-summary.jsonl}"

echo "[burnin] bridge=${BRIDGE_URL} duration_hours=${DURATION_HOURS} interval_sec=${INTERVAL_SEC}"
echo -n "" > "${OUT_FILE}"

end_ts=$(( $(date +%s) + DURATION_HOURS * 3600 ))
total=0
success=0
fallback=0
simulation=0
errors=0

while [ "$(date +%s)" -lt "${end_ts}" ]; do
  total=$((total + 1))
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  set +e
  resp="$(
    curl -sS -X POST "${BRIDGE_URL}/api/policy/predict" \
      -H "Content-Type: application/json" \
      -d '{
        "userRequest":"burnin check",
        "origin":"SHA",
        "destination":"BKK",
        "constraints":{"budget":{"total":4000}},
        "preferences":{"pace":"moderate"}
      }'
  )"
  code=$?
  set -e

  if [ "${code}" -ne 0 ]; then
    errors=$((errors + 1))
    echo "{\"ts\":\"${ts}\",\"ok\":false,\"type\":\"http_error\"}" >> "${OUT_FILE}"
    sleep "${INTERVAL_SEC}"
    continue
  fi

  if echo "${resp}" | rg -q "\"success\"\\s*:\\s*true"; then
    success=$((success + 1))
  fi
  if echo "${resp}" | rg -q "fallback-v1.0|默认策略"; then
    fallback=$((fallback + 1))
  fi
  if echo "${resp}" | rg -q "模拟策略推理"; then
    simulation=$((simulation + 1))
  fi

  echo "{\"ts\":\"${ts}\",\"ok\":true,\"response\":${resp}}" >> "${OUT_FILE}"
  sleep "${INTERVAL_SEC}"
done

success_rate="0"
if [ "${total}" -gt 0 ]; then
  success_rate=$(python3 - <<PY
total=${total}
success=${success}
print(f"{success/total:.6f}")
PY
)
fi

echo "[burnin] total=${total} success=${success} errors=${errors} fallback=${fallback} simulation=${simulation} success_rate=${success_rate}"
