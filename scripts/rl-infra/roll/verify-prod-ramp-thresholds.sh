#!/usr/bin/env bash
set -euo pipefail

# Inputs from monitoring pipeline (Prometheus/Grafana export or manual)
REAL_POLICY_RATE="${REAL_POLICY_RATE:-0}"
FALLBACK_RATE="${FALLBACK_RATE:-1}"
SIMULATION_RATE="${SIMULATION_RATE:-0}"
P95_LATENCY_MS="${P95_LATENCY_MS:-9999}"
ERROR_RATE="${ERROR_RATE:-1}"
CONTRACT_VIOLATION_RATE="${CONTRACT_VIOLATION_RATE:-1}"

# Thresholds
MIN_REAL_POLICY_RATE="${MIN_REAL_POLICY_RATE:-0.95}"
MAX_FALLBACK_RATE="${MAX_FALLBACK_RATE:-0.01}"
MAX_SIMULATION_RATE="${MAX_SIMULATION_RATE:-0.0}"
MAX_P95_LATENCY_MS="${MAX_P95_LATENCY_MS:-1500}"
MAX_ERROR_RATE="${MAX_ERROR_RATE:-0.02}"
MAX_CONTRACT_VIOLATION_RATE="${MAX_CONTRACT_VIOLATION_RATE:-0.001}"

fail=0

check_gte() {
  local value="$1"; local threshold="$2"; local name="$3"
  python3 - <<PY || fail=1
v=float("${value}"); t=float("${threshold}")
assert v >= t, f"{v} < {t}"
PY
  echo "[ramp] ${name}: ${value} >= ${threshold}"
}

check_lte() {
  local value="$1"; local threshold="$2"; local name="$3"
  python3 - <<PY || fail=1
v=float("${value}"); t=float("${threshold}")
assert v <= t, f"{v} > {t}"
PY
  echo "[ramp] ${name}: ${value} <= ${threshold}"
}

check_gte "${REAL_POLICY_RATE}" "${MIN_REAL_POLICY_RATE}" "real_policy_rate"
check_lte "${FALLBACK_RATE}" "${MAX_FALLBACK_RATE}" "fallback_rate"
check_lte "${SIMULATION_RATE}" "${MAX_SIMULATION_RATE}" "simulation_rate"
check_lte "${P95_LATENCY_MS}" "${MAX_P95_LATENCY_MS}" "p95_latency_ms"
check_lte "${ERROR_RATE}" "${MAX_ERROR_RATE}" "error_rate"
check_lte "${CONTRACT_VIOLATION_RATE}" "${MAX_CONTRACT_VIOLATION_RATE}" "contract_violation_rate"

if [ "${fail}" -ne 0 ]; then
  echo "[ramp] failed: thresholds not met"
  exit 1
fi

echo "[ramp] pass: all thresholds met"
