#!/usr/bin/env npx ts-node
/**
 * Attraction Explore BFF smoke test
 * Usage: npx ts-node scripts/attraction-explore-smoke.ts [tripId] [baseUrl]
 */
import { PrismaClient } from '@prisma/client';

const tripId = process.argv[2] ?? '3e4a1058-9218-467f-988a-c18008a14385';
const baseUrl = (process.argv[3] ?? 'http://localhost:3000').replace(/\/$/, '');

async function getJson(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json();
  return { status: res.status, json };
}

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function main() {
  console.log(`\n🧪 Attraction Explore smoke — trip=${tripId}\n`);

  const context = await getJson(`/api/trips/${tripId}/attraction-explore/context`);
  console.log('GET context', context.status, context.json.success ? '✅' : '❌');

  const rec = await getJson(
    `/api/trips/${tripId}/attraction-explore/recommendations?viewTab=recommended`,
  );
  const groups = rec.json.data?.groups ?? [];
  const itemCount = groups.reduce(
    (n: number, g: { items?: unknown[] }) => n + (g.items?.length ?? 0),
    0,
  );
  const withImage = groups
    .flatMap((g: { items?: Array<{ imageUrl?: string | null }> }) => g.items ?? [])
    .filter((i: { imageUrl?: string | null }) => i.imageUrl).length;
  console.log(
    'GET recommendations',
    rec.status,
    rec.json.success ? `✅ groups=${groups.length} items=${itemCount} withImage=${withImage}` : '❌',
  );

  const candidates = await getJson(`/api/trips/${tripId}/attraction-explore/candidates`);
  console.log(
    'GET candidates',
    candidates.status,
    candidates.json.success
      ? `✅ count=${candidates.json.data?.candidates?.length ?? 0}`
      : '❌',
  );

  const search = await postJson(`/api/trips/${tripId}/attraction-explore/search`, {
    query: '瀑布',
    limit: 5,
  });
  const searchItems = search.json.data?.groups?.[0]?.items?.length ?? 0;
  console.log('POST search', search.status, search.json.success ? `✅ items=${searchItems}` : '❌');

  const map = await getJson(`/api/trips/${tripId}/attraction-explore/map?viewTab=recommended`);
  console.log(
    'GET map',
    map.status,
    map.json.success ? `✅ pois=${map.json.data?.pois?.length ?? 0}` : '❌',
  );

  const prisma = new PrismaClient();
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { destination: true, metadata: true },
  });
  console.log('\nTrip metadata.attractionExplore:', (trip?.metadata as any)?.attractionExplore);
  await prisma.$disconnect();

  if (!rec.json.success || itemCount === 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
