#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./rollback-consecutive-guard.sh <anomaly_detected:true|false> [state_file]
#
# Env:
#   ROLLBACK_MIN_CONSECUTIVE_WINDOWS (default: 2)
#
# Output:
#   consecutive_block=true/false
#   consecutive_count=<int>

ANOMALY="${1:-}"
STATE_FILE="${2:-rollback-consecutive-state.env}"
MIN_CONSEC="${ROLLBACK_MIN_CONSECUTIVE_WINDOWS:-2}"

if [ -z "${ANOMALY}" ]; then
  echo "Usage: $0 <anomaly_detected:true|false> [state_file]"
  exit 1
fi

if [ "${ANOMALY}" != "true" ] && [ "${ANOMALY}" != "false" ]; then
  echo "anomaly_detected must be true|false"
  exit 1
fi

if ! [[ "${MIN_CONSEC}" =~ ^[0-9]+$ ]] || [ "${MIN_CONSEC}" -lt 1 ]; then
  echo "ROLLBACK_MIN_CONSECUTIVE_WINDOWS must be integer >= 1"
  exit 1
fi

count=0
if [ -f "${STATE_FILE}" ]; then
  # shellcheck disable=SC1090
  source "${STATE_FILE}" || true
  count="${CONSECUTIVE_ANOMALY_COUNT:-0}"
fi

if [ "${ANOMALY}" = "true" ]; then
  count=$((count + 1))
else
  count=0
fi

consecutive_block="true"
if [ "${count}" -ge "${MIN_CONSEC}" ]; then
  consecutive_block="false"
fi

cat > "${STATE_FILE}" <<EOF
CONSECUTIVE_ANOMALY_COUNT=${count}
ROLLBACK_MIN_CONSECUTIVE_WINDOWS=${MIN_CONSEC}
LAST_UPDATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "consecutive_block=${consecutive_block}"
    echo "consecutive_count=${count}"
  } >> "${GITHUB_OUTPUT}"
fi

echo "[consecutive] anomaly=${ANOMALY} count=${count} min=${MIN_CONSEC} block=${consecutive_block}"
