#!/usr/bin/env bash
set -euo pipefail

BRIDGE_URL="${ROLL_BRIDGE_URL:-http://localhost:8001}"
ENV_FILE="${ENV_FILE:-.env.prod}"

echo "[verify-prod] check env file: ${ENV_FILE}"
test -f "${ENV_FILE}"
rg -n "^ROLL_STRICT_MODE=true$" "${ENV_FILE}"
rg -n "^ROLL_ALLOW_SIMULATION=false$" "${ENV_FILE}"
rg -n "^ROLL_ALLOW_FALLBACK=true$" "${ENV_FILE}"

echo "[verify-prod] check health"
curl -fsS "${BRIDGE_URL}/health" >/dev/null

echo "[verify-prod] check workers status"
workers_json="$(curl -fsS "${BRIDGE_URL}/api/workers/status")"
echo "${workers_json}" | rg -q "policy_workers|PolicyWorker"

echo "[verify-prod] check policy endpoint basic response"
resp_json="$(curl -fsS -X POST "${BRIDGE_URL}/api/policy/predict" \
  -H "Content-Type: application/json" \
  -d '{
    "userRequest":"prod guardrails smoke test",
    "origin":"SHA",
    "destination":"BKK",
    "constraints":{"budget": {"total": 5000}},
    "preferences":{"pace":"moderate"}
  }')"

# 生产禁模拟：出现模拟文案直接失败
if echo "${resp_json}" | rg -q "模拟策略推理"; then
  echo "[verify-prod] failed: simulation response detected"
  exit 1
fi

echo "${resp_json}" | rg -q "\"success\"\\s*:\\s*true|\"action\"\\s*:"
echo "[verify-prod] pass"
