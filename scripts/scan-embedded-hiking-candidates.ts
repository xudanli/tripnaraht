/**
 * 扫描可能适合改为 metadata.hikingProfile=embedded 的行程（只报告，不写入）。
 *
 * 用法: npx ts-node -r tsconfig-paths/register scripts/scan-embedded-hiking-candidates.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Candidate = {
  tripId: string;
  name: string | null;
  destination: string | null;
  reason: string[];
};

async function main() {
  const trips = await prisma.trip.findMany({
    select: {
      id: true,
      name: true,
      destination: true,
      metadata: true,
      budgetConfig: true,
    },
    take: 5000,
    orderBy: { updatedAt: 'desc' },
  });

  const candidates: Candidate[] = [];

  for (const trip of trips) {
    const meta =
      trip.metadata && typeof trip.metadata === 'object'
        ? (trip.metadata as Record<string, unknown>)
        : {};
    const profile = meta.hikingProfile;
    if (profile === 'embedded' || profile === 'primary') continue;

    const budget = (trip.budgetConfig as Record<string, unknown>) ?? {};
    const hikingLevel = meta.hikingLevel ?? budget.hikingLevel;
    const travelMode = meta.travelMode ?? budget.travelMode;

    const reasons: string[] = [];
    if (hikingLevel === 'light' && travelMode === 'DRIVING') {
      reasons.push('hikingLevel=light + travelMode=DRIVING');
    }
    if (Array.isArray(meta.hikingSegments) && meta.hikingSegments.length > 0) {
      reasons.push('has hikingSegments without hikingProfile');
    }

    if (reasons.length) {
      candidates.push({
        tripId: trip.id,
        name: trip.name,
        destination: trip.destination,
        reason: reasons,
      });
    }
  }

  console.log(JSON.stringify({ scanned: trips.length, candidates: candidates.length, rows: candidates }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
