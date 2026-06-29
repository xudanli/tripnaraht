#!/usr/bin/env bash
# Cron-friendly: scan on-failure trace exports → badcase catalog JSON.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EXPORT_DIR="${HARNESS_TRACE_EXPORT_DIR:-artifacts/harness-on-failure}"
CATALOG_DIR="${HARNESS_BADCASE_CATALOG_DIR:-artifacts/harness-badcases}"
LIMIT="${HARNESS_BADCASE_COLLECT_LIMIT:-500}"

if [[ ! -d "$EXPORT_DIR" ]]; then
  echo "[collect-harness-badcases] skip: export dir missing: $EXPORT_DIR" >&2
  exit 0
fi

npx ts-node --transpile-only scripts/collect-harness-badcases.ts \
  --dir "$EXPORT_DIR" \
  --catalog "$CATALOG_DIR/catalog.json" \
  --limit "$LIMIT"
