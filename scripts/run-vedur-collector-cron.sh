#!/usr/bin/env bash
# Cron entrypoint — must run under bash (dash /bin/sh does not support `source`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${VEDUR_COLLECTOR_RUNTIME_ENV:-$ROOT/vedur-collector.runtime.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing runtime env: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

exec bash "$ROOT/scripts/vedur-collector-minimal.sh"
