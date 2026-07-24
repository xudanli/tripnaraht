/**
 * Quick probe for Multi-Constraint POI Arrangement Benchmark fixture.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { MCPOI_BENCHMARK_TRIP_ID } from '../src/trips/arrange-itinerary/fixtures/multi-constraint-poi-arrangement-benchmark.fixture';

async function main() {
  const p = new PrismaClient();
  try {
    const trip = await p.trip.findUnique({
      where: { id: MCPOI_BENCHMARK_TRIP_ID },
      include: {
        TripDay: { orderBy: { date: 'asc' }, include: { ItineraryItem: { orderBy: { order: 'asc' } } } },
        PlanningPlan: true,
      },
    });
    if (!trip) {
      console.log(JSON.stringify({ ok: false, error: 'trip not found' }));
      return;
    }
    const meta = trip.metadata as Record<string, unknown>;
    const benchmark = meta.benchmark as Record<string, unknown> | undefined;
    console.log(
      JSON.stringify(
        {
          ok: true,
          tripId: trip.id,
          name: trip.name,
          dayCount: trip.TripDay.length,
          d3: trip.TripDay[2]?.ItineraryItem.map((i) => ({ note: i.note, start: i.startTime })),
          d4: trip.TripDay[3]?.ItineraryItem.map((i) => ({ note: i.note, start: i.startTime })),
          memberCount: (benchmark?.members as unknown[])?.length,
          constraintCount: (meta.unifiedConstraints as unknown[])?.length,
          harnessCases: (benchmark?.harnessCases as Array<{ caseId: string }>)?.map((c) => c.caseId),
          planVariants: (benchmark?.planVariants as Array<{ variantId: string; expectedStatus: string }>)?.map(
            (v) => `${v.variantId}:${v.expectedStatus}`,
          ),
          worldFactsInDb: await p.worldFact.count({
            where: { snapshotVersion: `trip:${MCPOI_BENCHMARK_TRIP_ID}` },
          }),
          planningPlanStatus: trip.PlanningPlan[0]?.status,
        },
        null,
        2,
      ),
    );
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
