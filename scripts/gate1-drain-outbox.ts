/**
 * Drain runtime_event_outbox → travel_events (Tier 1.2).
 * Uses Prisma directly — no full Nest bootstrap.
 *
 * Usage:
 *   npm run gate1:drain-outbox
 *   npm run gate1:drain-outbox -- --stats
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { RuntimeEventOutboxService } from '../src/decision-runtime/services/runtime-event-outbox.service';
import { TravelEventPersistenceService } from '../src/trips/event-store/travel-event-persistence.service';

loadEnv({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const statsOnly = process.argv.includes('--stats');
  const prisma = new PrismaClient();

  try {
    const persistence = new TravelEventPersistenceService(prisma as never);
    const outbox = new RuntimeEventOutboxService(prisma as never, persistence);

    if (statsOnly) {
      const stats = await outbox.getStats();
      console.log(JSON.stringify({ enabled: outbox.isEnabled(), ...stats }, null, 2));
      return;
    }

    const result = await outbox.drainPending(500);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
