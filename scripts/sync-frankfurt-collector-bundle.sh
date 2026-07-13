#!/usr/bin/env bash
# Sync collector scripts + runtime env to Frankfurt ECS (password SSH).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRANKFURT_HOST="${FRANKFURT_HOST:-root@47.87.131.183}"
REMOTE_DIR="${REMOTE_DIR:-/root/tripnara-collector}"

bash "$ROOT/scripts/start-collector-stack.sh" env

echo "[sync] → $FRANKFURT_HOST:$REMOTE_DIR"
ssh "$FRANKFURT_HOST" "mkdir -p $REMOTE_DIR/scripts"
scp "$ROOT/scripts/vedur-collector-minimal.sh" \
  "$ROOT/scripts/frankfurt-collector-e2e.sh" \
  "$ROOT/scripts/vedur-collector-feasibility-spike.sh" \
  "$ROOT/scripts/gagnaveita-collector-minimal.sh" \
  "$ROOT/scripts/frankfurt-gagnaveita-collector-e2e.sh" \
  "$FRANKFURT_HOST:$REMOTE_DIR/scripts/"
scp "$ROOT/config/decision-runtime/vedur-collector-frankfurt.runtime.env" \
  "$FRANKFURT_HOST:$REMOTE_DIR/vedur-collector.runtime.env"
scp "$ROOT/config/decision-runtime/gagnaveita-collector-frankfurt.runtime.env" \
  "$FRANKFURT_HOST:$REMOTE_DIR/gagnaveita-collector.runtime.env"

echo ""
echo "On Frankfurt, run:"
echo "  set -a && source $REMOTE_DIR/vedur-collector.runtime.env && set +a"
echo "  bash $REMOTE_DIR/scripts/frankfurt-collector-e2e.sh"
