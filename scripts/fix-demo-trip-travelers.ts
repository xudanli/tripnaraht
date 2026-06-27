/**
 * Patch pacingConfig.travelers for demo trips (bypasses METADATA_TOO_LARGE on PUT /trips).
 * Usage: npx tsx scripts/fix-demo-trip-travelers.ts <tripId> [count=2]
 */
import { PrismaClient } from '@prisma/client';
import { bumpConstraintsVersion } from '../src/trips/trip-constraint-solver/utils/constraints-metadata.util';

const prisma = new PrismaClient();

async function main() {
  const tripId = process.argv[2];
  const count = Number(process.argv[3] ?? 2);
  if (!tripId) {
    console.error('Usage: npx tsx scripts/fix-demo-trip-travelers.ts <tripId> [count]');
    process.exit(1);
  }

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { TripCollaborator: { select: { userId: true } } },
  });
  if (!trip) throw new Error(`Trip ${tripId} not found`);

  const targetCount = trip.TripCollaborator.length > 0 ? trip.TripCollaborator.length : count;
  const travelers = Array.from({ length: targetCount }, () => ({
    type: 'ADULT',
    mobilityTag: 'CITY_POTATO',
  }));

  const pacingConfig = {
    ...((trip.pacingConfig as Record<string, unknown> | null) ?? {}),
    travelers,
  };

  const metadata = bumpConstraintsVersion(trip.metadata);

  await prisma.trip.update({
    where: { id: tripId },
    data: {
      pacingConfig: pacingConfig as object,
      metadata: metadata as object,
    },
  });

  console.log(
    JSON.stringify(
      {
        tripId,
        travelerCount: travelers.length,
        memberCount: trip.TripCollaborator.length,
        constraintsVersion: metadata.constraintsVersion,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
