/**
 * Probe Iceland Unified Decision fixture — DB + optional HTTP API.
 *
 * Usage:
 *   npx tsx scripts/probe-iceland-unified-decision-fixture.ts
 *   STAGING_API_BASE=https://staging.example.com/api AUTH_TOKEN=<jwt> npx tsx scripts/probe-iceland-unified-decision-fixture.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_ID } from '../src/trips/decision-semantics/fixtures/iceland-unified-decision.fixture';

const tripId = ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_ID;
const localBase = (process.env.LOCAL_API_BASE ?? 'http://localhost:3000/api').replace(/\/$/, '');
const stagingBase = process.env.STAGING_API_BASE?.replace(/\/$/, '');

async function probeDb(prisma: PrismaClient) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      name: true,
      metadata: true,
      TripCollaborator: { select: { userId: true, role: true } },
      TripDay: { select: { id: true }, take: 8 },
    },
  });

  const scenario = await prisma.explorationScenario.findFirst({
    where: { OR: [{ tripId }, { contextId: tripId }, { id: tripId }] },
    select: { id: true, contextId: true, tripId: true, status: true },
  });

  console.log('--- Database ---');
  console.log(
    JSON.stringify(
      {
        databaseUrlHost: maskDbHost(process.env.DATABASE_URL),
        tripFound: Boolean(trip),
        tripName: trip?.name ?? null,
        owner: trip?.TripCollaborator.find((c) => c.role === 'OWNER')?.userId ?? null,
        dayCount: trip?.TripDay.length ?? 0,
        travelContextId:
          (trip?.metadata as Record<string, unknown> | null)?.travelContextId ?? null,
        explorationScenarioId:
          (trip?.metadata as Record<string, unknown> | null)?.explorationScenarioId ?? null,
        linkedScenario: scenario,
      },
      null,
      2,
    ),
  );
}

async function probeHttp(label: string, baseUrl: string) {
  const headers: Record<string, string> = {};
  const token = process.env.AUTH_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const resolveUrl = `${baseUrl}/travel-contexts/resolve/by-trip/${tripId}`;
  const tripUrl = `${baseUrl}/trips/${tripId}`;

  console.log(`\n--- HTTP (${label}: ${baseUrl}) ---`);

  for (const [name, url] of [
    ['resolve/by-trip', resolveUrl],
    ['GET trip', tripUrl],
  ] as const) {
    try {
      const res = await fetch(url, { headers });
      const body = await res.text();
      let parsed: unknown = body;
      try {
        parsed = JSON.parse(body);
      } catch {
        /* keep text */
      }
      console.log(
        JSON.stringify(
          { endpoint: name, status: res.status, ok: res.ok, body: parsed },
          null,
          2,
        ),
      );
    } catch (err) {
      console.log(JSON.stringify({ endpoint: name, error: String(err) }, null, 2));
    }
  }
}

function maskDbHost(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname}/${u.pathname.replace(/^\//, '').split('?')[0]}`;
  } catch {
    return '(unparseable)';
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await probeDb(prisma);
    await probeHttp('local', localBase);
    if (stagingBase) {
      await probeHttp('staging', stagingBase);
    } else {
      console.log('\n--- HTTP (staging) ---');
      console.log('Skipped — set STAGING_API_BASE to probe staging.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
