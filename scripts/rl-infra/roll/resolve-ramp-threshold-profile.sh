#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./resolve-ramp-threshold-profile.sh <target_traffic_percent> [out_env_file]
#
# Output env file variables:
# - MIN_REAL_POLICY_RATE
# - MAX_FALLBACK_RATE
# - MAX_SIMULATION_RATE
# - MAX_P95_LATENCY_MS
# - MAX_ERROR_RATE
# - MAX_CONTRACT_VIOLATION_RATE

TARGET_TRAFFIC="${1:-}"
OUT_ENV="${2:-ramp-thresholds.env}"

if [ -z "${TARGET_TRAFFIC}" ]; then
  echo "Usage: $0 <target_traffic_percent> [out_env_file]"
  exit 1
fi

if ! [[ "${TARGET_TRAFFIC}" =~ ^[0-9]+$ ]] || [ "${TARGET_TRAFFIC}" -lt 0 ] || [ "${TARGET_TRAFFIC}" -gt 100 ]; then
  echo "target_traffic_percent must be an integer in [0,100]"
  exit 1
fi

# Default baseline (most strict)
min_real_policy_rate="0.95"
max_fallback_rate="0.01"
max_simulation_rate="0.0"
max_p95_latency_ms="1500"
max_error_rate="0.02"
max_contract_violation_rate="0.001"

if [ "${TARGET_TRAFFIC}" -lt 30 ]; then
  # 10% ramp: allow slightly relaxed guardrail for early canary
  min_real_policy_rate="0.90"
  max_fallback_rate="0.03"
  max_simulation_rate="0.0"
  max_p95_latency_ms="1800"
  max_error_rate="0.03"
  max_contract_violation_rate="0.002"
elif [ "${TARGET_TRAFFIC}" -lt 60 ]; then
  # 30% ramp: medium strict
  min_real_policy_rate="0.93"
  max_fallback_rate="0.02"
  max_simulation_rate="0.0"
  max_p95_latency_ms="1600"
  max_error_rate="0.025"
  max_contract_violation_rate="0.0015"
fi

cat > "${OUT_ENV}" <<EOF
MIN_REAL_POLICY_RATE=${min_real_policy_rate}
MAX_FALLBACK_RATE=${max_fallback_rate}
MAX_SIMULATION_RATE=${max_simulation_rate}
MAX_P95_LATENCY_MS=${max_p95_latency_ms}
MAX_ERROR_RATE=${max_error_rate}
MAX_CONTRACT_VIOLATION_RATE=${max_contract_violation_rate}
EOF

echo "[threshold-profile] target=${TARGET_TRAFFIC}% -> ${OUT_ENV}"
cat "${OUT_ENV}"
