#!/usr/bin/env bash
# TEP Iceland Pilot — full CI smoke (seed → writeback → runtime hooks)
#
# Requires DATABASE_URL (CI postgres or staging). Refuses production.
#
# Usage:
#   DATABASE_URL=postgresql://... bash scripts/tep-pilot-ci-smoke.sh
#   npm run tep:pilot-ci
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

if [[ "${DATABASE_URL}" =~ tripnara_prod|production ]]; then
  echo "Refusing TEP pilot CI smoke on production DATABASE_URL"
  exit 1
fi

export RFC001_ITINERARY_MATERIALIZE=1

echo "== TEP pilot CI: unit tests (mock DB) =="
npm test -- \
  src/trips/tep/projectors/planning-tep-decision-problem.projector.spec.ts \
  src/trips/tep/certification/is-cert-writeback.integration.spec.ts \
  src/trips/tep/certification/is-cert-404.integration.spec.ts \
  --no-cache

echo "== TEP pilot CI: seed all fixtures (01–10) =="
npx tsx scripts/tep-pilot-is-seed.ts --env=default --template=all --reset

echo "== TEP pilot CI: HTTP E2E (Nest executability + mobile accept) =="
TEP_PILOT_HTTP_E2E=1 npm run test:tep-pilot-http

echo "== TEP pilot CI: re-seed pilot_is_01 after HTTP accept =="
npx tsx scripts/tep-pilot-is-seed.ts --env=default --template=01 --reset

echo "== TEP pilot CI: planning smoke (05/07/08/09/10) =="
npx tsx scripts/tep-pilot-planning-smoke.ts --env=default --template=planning-all

echo "== TEP pilot CI: writeback smoke (01 REMOVE + 03 REPLACE) =="
npx tsx scripts/tep-pilot-accept-smoke.ts --env=default --template=all

echo "== TEP pilot CI: runtime smoke (02 road+404 + 03 weather + 04 slip) =="
npx tsx scripts/tep-pilot-runtime-smoke.ts --env=default --template=all

echo "== TEP pilot CI: concurrent smoke (06 dual accept) =="
npx tsx scripts/tep-pilot-is-seed.ts --env=default --template=06 --reset
npx tsx scripts/tep-pilot-concurrent-smoke.ts --env=default

echo "== TEP pilot CI: PostgreSQL writeback E2E (401/402/403/401-CONCURRENT) =="
TEP_WRITEBACK_PG_E2E=1 npm run test:tep-writeback-pg

echo "== TEP pilot CI: sign-off §0 autocheck =="
npx tsx scripts/tep-signoff-autocheck.ts --from-ci

echo "TEP pilot CI smoke OK"
