#!/usr/bin/env bash
# Tier A — full Legacy Runtime hot rollback (config-only).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
set -a
# shellcheck source=/dev/null
source "$ROOT/config/decision-runtime/production-rollback-legacy.env"
set +a
echo "[rollback-tier-a] Legacy Runtime env applied — restart backend required"
echo "  CURRENT_AUTHORITY=$CURRENT_AUTHORITY CANONICAL_ROLLOUT=$CANONICAL_ROLLOUT"
echo "  DECISION_RUNTIME_MODE=$DECISION_RUNTIME_MODE"
