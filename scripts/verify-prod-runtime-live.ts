/**
 * P0: Post-deploy live dual-write verification (reads .env DATABASE_URL).
 *
 * Usage:
 *   npm run gate1:verify-prod-live
 *   API_BASE_URL=https://tripnara.com OPS_TOKEN=... npm run gate1:verify-prod-live
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: path.resolve(__dirname, '..', '.env') });

async function checkHttpFlags(baseUrl: string, token: string) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/ops/runtime/flags`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`flags HTTP ${res.status}`);
  }
  const body = (await res.json()) as { data?: Record<string, boolean> };
  return body.data ?? body;
}

async function main() {
  const prisma = new PrismaClient();
  const baseUrl = process.env.API_BASE_URL ?? process.env.REACT_APP_API_URL;
  const token = process.env.OPS_TOKEN;

  console.log('=== P0 Production Runtime Live Verification ===\n');

  try {
    const eventCountBefore = await prisma.travelEvent.count({
      where: {
        OR: [{ source: 'gate1.runtime' }, { eventType: { startsWith: 'gate1.' } }],
      },
    });
    console.log(`Gate1 travel_events (current): ${eventCountBefore}`);

    const outbox = await prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
      SELECT status, COUNT(*)::bigint AS cnt FROM runtime_event_outbox GROUP BY status
    `.catch(() => null);
    if (outbox) {
      console.log(`Outbox: ${JSON.stringify(Object.fromEntries(outbox.map((r) => [r.status, Number(r.cnt)])))}`);
    }

    if (baseUrl && token) {
      console.log(`\nChecking ${baseUrl}/ops/runtime/flags ...`);
      const flags = await checkHttpFlags(baseUrl, token);
      console.log('Runtime flags:', flags);
      const required = [
        'travelEventStoreEnabled',
        'runtimeEventOutbox',
        'linkedTripAutoCreate',
        'tripStatusSync',
      ] as const;
      const missing = required.filter((k) => !flags[k]);
      if (missing.length) {
        console.error('\nFAIL: missing or false flags:', missing.join(', '));
        process.exit(1);
      }
      console.log('\nOK: all required runtime flags enabled on server');
    } else {
      console.log('\nSkip HTTP flags (set API_BASE_URL + OPS_TOKEN to verify deployed app)');
      console.log('Required server env:');
      console.log('  TRAVEL_EVENT_STORE_ENABLED=true');
      console.log('  RUNTIME_EVENT_OUTBOX_ENABLED=true');
      console.log('  GATE1_LINKED_TRIP_AUTO_CREATE=true');
      console.log('  GATE1_TRIP_STATUS_SYNC=true');
      console.log('  RUNTIME_OUTBOX_CRON_ENABLED=true');
    }

    console.log('\n--- Live dual-write test (manual) ---');
    console.log('1. Ops: publish one conflict report on any Gate1 project');
    console.log('2. Re-run: npm run gate1:rds-audit');
    console.log('3. Expect travel_events count >', eventCountBefore);
    console.log('4. Repeat daily for 48h soak; outbox failed must stay 0');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
