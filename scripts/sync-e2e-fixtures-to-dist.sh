#!/usr/bin/env bash
# nest start --watch 编译到 dist/ 后，E2E example 仍从 __dirname 读 JSON；同步到 dist 避免 ENOENT
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src/trips/decision/evaluation/e2e-cases"
DST="$ROOT/dist/src/trips/decision/evaluation/e2e-cases"
if [[ ! -d "$SRC" ]]; then exit 0; fi
mkdir -p "$DST"
cp -f "$SRC"/*.json "$DST/" 2>/dev/null || true
