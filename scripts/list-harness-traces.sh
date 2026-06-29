#!/usr/bin/env bash
# List recent Harness trace JSON exports (newest first).
set -euo pipefail

DIR="${1:-${HARNESS_TRACE_EXPORT_DIR:-artifacts/harness-on-failure}}"
LIMIT="${2:-15}"

if [[ ! -d "$DIR" ]]; then
  echo "[list-harness-traces] directory not found: $DIR" >&2
  echo "  Set HARNESS_TRACE_EXPORT_DIR or pass path as first argument." >&2
  exit 1
fi

echo "[list-harness-traces] dir=$DIR limit=$LIMIT"
find "$DIR" -type f -name '*.json' -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn \
  | head -n "$LIMIT" \
  | while read -r _ts path; do
      base="$(basename "$path")"
      size="$(wc -c < "$path" | tr -d ' ')"
      phase="$(grep -o '"failedPhase"[[:space:]]*:[[:space:]]*"[^"]*"' "$path" 2>/dev/null | head -1 || true)"
      echo "  $base  ${size}B  ${phase:-(no failedPhase)}"
    done
