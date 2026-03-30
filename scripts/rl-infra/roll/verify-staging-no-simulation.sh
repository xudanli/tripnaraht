#!/usr/bin/env bash
set -euo pipefail

BRIDGE_URL="${ROLL_BRIDGE_URL:-http://localhost:8001}"

echo "[verify] bridge url: ${BRIDGE_URL}"

echo "[verify] check /health"
curl -fsS "${BRIDGE_URL}/health" >/dev/null

echo "[verify] check workers status"
workers_json="$(curl -fsS "${BRIDGE_URL}/api/workers/status")"
echo "${workers_json}" | rg -q "policy_workers|PolicyWorker"

echo "[verify] call policy predict"
resp_json="$(curl -fsS -X POST "${BRIDGE_URL}/api/policy/predict" \
  -H "Content-Type: application/json" \
  -d '{
    "userRequest":"staging smoke test",
    "origin":"SHA",
    "destination":"BKK",
    "constraints":{"budget": {"total": 3000}},
    "preferences":{"pace":"moderate"}
  }')"

# 模拟路径通常会返回“模拟策略推理”文案；staging 禁止出现
if echo "${resp_json}" | rg -q "模拟策略推理"; then
  echo "[verify] failed: simulation response detected"
  exit 1
fi

echo "${resp_json}" | rg -q "\"success\"\\s*:\\s*true|\"action\"\\s*:"

echo "[verify] pass: no simulation response detected"
