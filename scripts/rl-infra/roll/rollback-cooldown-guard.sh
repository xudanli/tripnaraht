#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./rollback-cooldown-guard.sh [state_file]
#
# Output:
# - Writes cooldown_block=true/false to GITHUB_OUTPUT
# - Updates state file with latest rollback timestamp (UTC epoch seconds)

STATE_FILE="${1:-rollback-cooldown-state.env}"
COOLDOWN_MINUTES="${ROLLBACK_COOLDOWN_MINUTES:-10}"

if ! [[ "${COOLDOWN_MINUTES}" =~ ^[0-9]+$ ]]; then
  echo "ROLLBACK_COOLDOWN_MINUTES must be integer"
  exit 1
fi

now_ts="$(date +%s)"
cooldown_sec="$(( COOLDOWN_MINUTES * 60 ))"
last_ts=0

if [ -f "${STATE_FILE}" ]; then
  # shellcheck disable=SC1090
  source "${STATE_FILE}" || true
  last_ts="${LAST_ROLLBACK_TS:-0}"
fi

delta="$(( now_ts - last_ts ))"
cooldown_block="false"

if [ "${last_ts}" -gt 0 ] && [ "${delta}" -lt "${cooldown_sec}" ]; then
  cooldown_block="true"
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "cooldown_block=${cooldown_block}"
    echo "cooldown_remaining_sec=$(( cooldown_sec - delta < 0 ? 0 : cooldown_sec - delta ))"
  } >> "${GITHUB_OUTPUT}"
fi

if [ "${cooldown_block}" = "false" ]; then
  cat > "${STATE_FILE}" <<EOF
LAST_ROLLBACK_TS=${now_ts}
LAST_ROLLBACK_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ROLLBACK_COOLDOWN_MINUTES=${COOLDOWN_MINUTES}
EOF
fi

echo "[cooldown] block=${cooldown_block} delta_sec=${delta} cooldown_sec=${cooldown_sec}"
