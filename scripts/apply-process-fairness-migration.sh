#!/usr/bin/env bash
# Apply process fairness (F3) tables. Idempotent SQL (CREATE IF NOT EXISTS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required." >&2
  exit 1
fi

echo "Applying prisma/migrations/add_trip_process_fairness.sql ..."
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/add_trip_process_fairness.sql
npx prisma generate --schema prisma/schema.prisma
echo "Done."
