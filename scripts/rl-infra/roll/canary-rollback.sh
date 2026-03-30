#!/usr/bin/env bash
set -euo pipefail

STATE_FILE="${ROLL_CANARY_STATE_FILE:-./canary-state.env}"

if [ ! -f "${STATE_FILE}" ]; then
  echo "[rollback] state file not found: ${STATE_FILE}"
  exit 1
fi

# shellcheck disable=SC1090
source "${STATE_FILE}"

if [ -z "${ROLL_PREVIOUS_MODEL_VERSION:-}" ] || [ "${ROLL_PREVIOUS_MODEL_VERSION}" = "unknown" ]; then
  echo "[rollback] previous model version is unavailable"
  exit 1
fi

echo "[rollback] rolling back from ${ROLL_CANARY_MODEL_VERSION:-unknown} to ${ROLL_PREVIOUS_MODEL_VERSION}"
echo "ROLL_CANARY_TRAFFIC_PERCENT=0" > "${STATE_FILE}"
echo "ROLL_CURRENT_MODEL_VERSION=${ROLL_PREVIOUS_MODEL_VERSION}" >> "${STATE_FILE}"
echo "ROLL_ROLLBACK_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "${STATE_FILE}"
echo "[rollback] done; apply router switch and verify production metrics"
