#!/usr/bin/env bash
# Rollback Nest :3002 to assertion promotion shadow + disable Internal Dual-Read.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export ATTENTION_INTERNAL_DUAL_READ_ENABLED=0
export ATTENTION_ROOT_CAUSE_PRIMARY_SSO=0

exec "$ROOT/scripts/start-nest-3002-prod.sh"
