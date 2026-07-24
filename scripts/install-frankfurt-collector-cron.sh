#!/usr/bin/env bash
# Install Frankfurt ECS cron for Vedur collector (every 15 min).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRANKFURT_HOST="${FRANKFURT_HOST:-root@47.87.131.183}"
REMOTE_DIR="${REMOTE_DIR:-/root/tripnara-collector}"
CRON_SCHEDULE="${CRON_SCHEDULE:-*/15 * * * *}"
LOG_FILE="${LOG_FILE:-/var/log/vedur-collector.log}"

bash "$ROOT/scripts/sync-frankfurt-collector-bundle.sh"

# Cron uses /bin/sh (dash) — never inline `source`; always invoke bash wrapper.
CRON_LINE="${CRON_SCHEDULE} /bin/bash ${REMOTE_DIR}/scripts/run-vedur-collector-cron.sh >> ${LOG_FILE} 2>&1"

ssh -o BatchMode=yes "$FRANKFURT_HOST" bash -s <<REMOTE
set -euo pipefail
touch "$LOG_FILE"
MARKER="# tripnara-vedur-collector"
TMP="\$(mktemp)"
crontab -l 2>/dev/null | grep -vF "\$MARKER" | grep -v 'vedur-collector-minimal.sh' >"\$TMP" || true
echo "${CRON_LINE} \$MARKER" >>"\$TMP"
crontab "\$TMP"
rm -f "\$TMP"
echo "[cron] installed:"
crontab -l | grep vedur-collector || true
REMOTE

echo "[cron] Frankfurt collector scheduled: ${CRON_SCHEDULE}"
