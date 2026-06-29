/**
 * Backfill metadata.constraints.maxSegmentDistanceKm / warnSegmentDistanceKm for Iceland trips.
 *
 * Usage:
 *   npx tsx scripts/backfill-iceland-segment-distance-constraints.ts           # dry-run
 *   npx tsx scripts/backfill-iceland-segment-distance-constraints.ts --apply   # write DB
 *   npx tsx scripts/backfill-iceland-segment-distance-constraints.ts --apply --tripId=<uuid>
 */
import { PrismaClient } from '@prisma/client';
import { bumpConstraintsVersion } from '../src/trips/trip-constraint-solver/utils/constraints-metadata.util';
import {
  ensureSegmentDistanceConstraints,
  readUserMaxSegmentDistanceKm,
  readUserWarnSegmentDistanceKm,
} from '../src/trips/trip-constraint-solver/utils/segment-distance-threshold.util';

const prisma = new PrismaClient();

function parseArgs() {
  const apply = process.argv.includes('--apply');
  const tripIdArg = process.argv.find((a) => a.startsWith('--tripId='));
  const tripId = tripIdArg?.slice('--tripId='.length);
  return { apply, tripId };
}

function isIcelandDestination(destination: string): boolean {
  const code = destination.trim().toUpperCase();
  return code === 'IS' || code === 'ICELAND';
}

async function main() {
  const { apply, tripId } = parseArgs();

  const trips = await prisma.trip.findMany({
    where: tripId
      ? { id: tripId }
      : {
          OR: [
            { destination: { equals: 'IS', mode: 'insensitive' } },
            { destination: { equals: 'ICELAND', mode: 'insensitive' } },
          ],
        },
    select: { id: true, destination: true, metadata: true, name: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (tripId && trips.length === 0) {
    throw new Error(`Trip ${tripId} not found`);
  }

  const report: Array<{
    tripId: string;
    name: string | null;
    before: { max?: number; warn?: number };
    after: { max?: number; warn?: number };
    action: 'skip' | 'update';
  }> = [];

  for (const trip of trips) {
    if (!isIcelandDestination(trip.destination)) {
      report.push({
        tripId: trip.id,
        name: trip.name,
        before: {},
        after: {},
        action: 'skip',
      });
      continue;
    }

    const metadata = { ...((trip.metadata as Record<string, unknown> | null) ?? {}) };
    const before = {
      max: readUserMaxSegmentDistanceKm(metadata),
      warn: readUserWarnSegmentDistanceKm(metadata),
    };

    const changed = ensureSegmentDistanceConstraints(trip.destination, metadata);
    const after = {
      max: readUserMaxSegmentDistanceKm(metadata),
      warn: readUserWarnSegmentDistanceKm(metadata),
    };

    if (!changed) {
      report.push({ tripId: trip.id, name: trip.name, before, after, action: 'skip' });
      continue;
    }

    report.push({ tripId: trip.id, name: trip.name, before, after, action: 'update' });

    if (apply) {
      const bumped = bumpConstraintsVersion(metadata);
      await prisma.trip.update({
        where: { id: trip.id },
        data: { metadata: bumped as object },
      });
    }
  }

  const updates = report.filter((r) => r.action === 'update');
  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        total: report.length,
        toUpdate: updates.length,
        skipped: report.length - updates.length,
        updates,
      },
      null,
      2,
    ),
  );

  if (!apply && updates.length > 0) {
    console.log('\nRe-run with --apply to persist changes.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
