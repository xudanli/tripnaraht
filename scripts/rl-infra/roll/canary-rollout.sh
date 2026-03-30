#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <new_model_version> <traffic_percent>"
  exit 1
fi

NEW_VERSION="$1"
TRAFFIC_PERCENT="$2"
STATE_FILE="${ROLL_CANARY_STATE_FILE:-./canary-state.env}"

if ! [[ "${TRAFFIC_PERCENT}" =~ ^[0-9]+$ ]] || [ "${TRAFFIC_PERCENT}" -lt 0 ] || [ "${TRAFFIC_PERCENT}" -gt 100 ]; then
  echo "traffic_percent must be an integer in [0,100]"
  exit 1
fi

PREV_VERSION="${ROLL_CURRENT_MODEL_VERSION:-unknown}"
echo "ROLL_PREVIOUS_MODEL_VERSION=${PREV_VERSION}" > "${STATE_FILE}"
echo "ROLL_CANARY_MODEL_VERSION=${NEW_VERSION}" >> "${STATE_FILE}"
echo "ROLL_CANARY_TRAFFIC_PERCENT=${TRAFFIC_PERCENT}" >> "${STATE_FILE}"
echo "ROLL_CANARY_UPDATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "${STATE_FILE}"

echo "[canary] previous=${PREV_VERSION} new=${NEW_VERSION} traffic=${TRAFFIC_PERCENT}% state_file=${STATE_FILE}"
echo "[canary] next: apply router config and monitor fallback/error/latency metrics"
