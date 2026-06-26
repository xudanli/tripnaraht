/**
 * Backfill Gate1 historical facts into Travel Event Store (idempotent).
 *
 * Usage:
 *   TRAVEL_EVENT_STORE_ENABLED=true DATABASE_URL=... npx tsx scripts/backfill-gate1-runtime-events.ts
 *   ... --project-id=<uuid>
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { Gate1RuntimeBackfillService } from '../src/decision-runtime/services/gate1-runtime-backfill.service';
import { Gate1RuntimeEventService } from '../src/decision-runtime/services/gate1-runtime-event.service';
import { RuntimeEventOutboxService } from '../src/decision-runtime/services/runtime-event-outbox.service';
import { TravelEventPersistenceService } from '../src/trips/event-store/travel-event-persistence.service';
import { isTravelEventStoreEnabled } from '../src/trips/event-store/travel-event-store.config';

loadEnv({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (/tripnara_prod|production/i.test(url) && process.env.GATE1_RUNTIME_ALLOW_PROD !== '1') {
    console.error('Refusing to run against production DATABASE_URL');
    process.exit(1);
  }

  if (!isTravelEventStoreEnabled()) {
    console.warn('WARN: TRAVEL_EVENT_STORE_ENABLED is not true — no rows will be persisted');
  }

  const projectIdArg = process.argv.find((a) => a.startsWith('--project-id='));
  const projectId = projectIdArg?.split('=')[1];

  const persistence = new TravelEventPersistenceService(prisma as never);
  const outbox = new RuntimeEventOutboxService(prisma as never, persistence);
  const runtimeEvents = new Gate1RuntimeEventService(prisma as never, persistence, outbox);
  const backfill = new Gate1RuntimeBackfillService(prisma as never, runtimeEvents);

  const results = projectId
    ? [await backfill.backfillProject(projectId)]
    : await backfill.backfillAllLinked();

  for (const r of results) {
    if (r.skippedNoTrip) {
      console.log(`⏭  ${r.projectId} — no linkedTripId`);
      continue;
    }
    console.log(`✓  ${r.projectId} trip=${r.tripId} persisted=${r.persisted}/${r.attempted}`);
    for (const [k, v] of Object.entries(r.byEvent)) {
      console.log(`     ${k}: ${v}`);
    }
  }

  console.log('---');
  console.log(`Projects: ${results.length}, persisted: ${results.reduce((s, r) => s + r.persisted, 0)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
