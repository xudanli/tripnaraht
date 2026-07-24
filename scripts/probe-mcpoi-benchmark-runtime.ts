/**
 * Probe MCPOI benchmark runtime integration (DB + projections).
 *
 * Usage:
 *   npx tsx scripts/probe-mcpoi-benchmark-runtime.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { MCPOI_BENCHMARK_TRIP_ID } from '../src/trips/arrange-itinerary/fixtures/multi-constraint-poi-arrangement-benchmark.fixture';
import { loadMcpoiBenchmarkSnapshot } from '../src/trips/benchmarks/multi-constraint-poi/mcpoi-benchmark-runtime.util';

async function main() {
  const prisma = new PrismaClient();
  try {
    const snapshot = await loadMcpoiBenchmarkSnapshot(prisma, MCPOI_BENCHMARK_TRIP_ID);
    if (!snapshot) {
      console.log(JSON.stringify({ ok: false, error: 'benchmark trip not found — run seed first' }, null, 2));
      process.exit(1);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          tripId: snapshot.tripId,
          evaluatedDays: snapshot.evaluations.map((e) => ({
            dayIndex: e.dayIndex,
            status: e.status,
            hardViolations: e.hardViolations,
            softViolations: e.softViolations,
          })),
          issueCount: snapshot.issues.length,
          sampleIssues: snapshot.issues.slice(0, 5).map((i) => ({
            id: i.id,
            priority: i.priority,
            message: i.message,
            resolutionMode: i.resolutionMode,
          })),
          apis: {
            feasibility: `/api/trips/${MCPOI_BENCHMARK_TRIP_ID}/feasibility`,
            decisionSpaceBundle: `/api/trips/${MCPOI_BENCHMARK_TRIP_ID}/decision-space-bundle`,
            decisionInspector: `/api/trips/${MCPOI_BENCHMARK_TRIP_ID}/arrange-itinerary/decision-inspector`,
            decisionCausalChain: `/api/trips/${MCPOI_BENCHMARK_TRIP_ID}/arrange-itinerary/decision-causal-chain`,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
