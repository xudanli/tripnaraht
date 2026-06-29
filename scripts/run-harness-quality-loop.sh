#!/usr/bin/env bash
# Cron-friendly：L1 smoke + decision-closure golden → artifacts/harness-quality-loop/last-run.json
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
npx ts-node --transpile-only scripts/run-harness-quality-loop.ts
