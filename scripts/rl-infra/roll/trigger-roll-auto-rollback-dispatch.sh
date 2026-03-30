#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   GITHUB_TOKEN=xxx ./trigger-roll-auto-rollback-dispatch.sh <owner> <repo> <current> <previous> <fallback_rate> <error_rate> <simulation_rate> [reason]

if [ $# -lt 7 ]; then
  echo "Usage: GITHUB_TOKEN=xxx $0 <owner> <repo> <current> <previous> <fallback_rate> <error_rate> <simulation_rate> [reason]"
  exit 1
fi

OWNER="$1"
REPO="$2"
CURRENT="$3"
PREVIOUS="$4"
FALLBACK_RATE="$5"
ERROR_RATE="$6"
SIMULATION_RATE="$7"
REASON="${8:-auto trigger from monitoring}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN is required"
  exit 1
fi

tmp_json="$(mktemp)"
cat > "${tmp_json}" <<EOF
{
  "event_type": "roll_auto_rollback",
  "client_payload": {
    "current_model_version": "${CURRENT}",
    "previous_model_version": "${PREVIOUS}",
    "fallback_rate": ${FALLBACK_RATE},
    "error_rate": ${ERROR_RATE},
    "simulation_rate": ${SIMULATION_RATE},
    "trigger_reason": "${REASON}"
  }
}
EOF

curl -sS -X POST "https://api.github.com/repos/${OWNER}/${REPO}/dispatches" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -d @"${tmp_json}"

echo
echo "[dispatch] sent to ${OWNER}/${REPO}"
