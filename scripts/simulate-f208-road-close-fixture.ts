/**
 * Inject F208 CLOSED on Iceland unified-decision fixture + print impactScopeView.
 *
 * Usage:
 *   npx tsx scripts/simulate-f208-road-close-fixture.ts [tripId]
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildRoadStatusChangedEvent } from '../src/trips/guardian-decision-core/evidence/road-status-changed.event';
import { buildItemSegmentId } from '../src/trips/guardian-decision-core/detection/road-close-impact-analyzer';
import { buildIcelandRoadCloseHarnessStack } from '../src/trips/guardian-decision-core/e2e/iceland-road-close.harness.util';
import type { PrismaService } from '../src/prisma/prisma.service';

const DEFAULT_TRIP_ID = '3e4a1058-9218-467f-988a-c18008a14385';
/** Day 6 drive segment → 红沙滩 (south coast; bound to F208 for demo) */
const DEFAULT_DRIVE_ITEM = 'acf2d20c-8085-4f6d-b9a6-caa3abfbb481';

async function mergeRoadBindings(
  prisma: PrismaClient,
  tripId: string,
  itemId: string,
  roadId: string,
): Promise<void> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  if (!trip) throw new Error(`Trip ${tripId} not found`);

  const meta = (trip.metadata ?? {}) as Record<string, unknown>;
  const existing = (meta.rfc001IcelandRoadBindings ?? {}) as {
    byItemId?: Record<string, string[]>;
  };
  const byItemId = { ...(existing.byItemId ?? {}), [itemId]: [roadId.toUpperCase()] };
  await prisma.trip.update({
    where: { id: tripId },
    data: {
      metadata: {
        ...meta,
        rfc001IcelandRoadBindings: { ...existing, byItemId },
      },
    },
  });
}

async function main() {
  const tripId = process.argv[2] ?? DEFAULT_TRIP_ID;
  const driveItemId = process.argv[3] ?? DEFAULT_DRIVE_ITEM;
  const roadId = 'F208';

  process.env.RFC001_SHADOW_MODE = '0';

  const prisma = new PrismaClient();
  const prismaSvc = prisma as unknown as PrismaService;

  console.log(`F208 simulate — trip=${tripId} item=${driveItemId}\n`);

  await mergeRoadBindings(prisma, tripId, driveItemId, roadId);

  const stack = buildIcelandRoadCloseHarnessStack(prismaSvc);
  const segmentId = buildItemSegmentId(tripId, driveItemId);
  const event = buildRoadStatusChangedEvent({
    tripId,
    roadId,
    status: 'CLOSED',
    previousStatus: 'OPEN',
    segmentId,
    sourceProvider: 'admin_injection',
  });

  const run = await stack.runner.runFullFromEvent(event, {
    bindings: { byItemId: { [driveItemId]: [roadId] } },
  });

  if (!run.problem) {
    console.error('No problem created — check bindings / plan items');
    process.exit(1);
  }

  const view = await stack.readModel.getProblemView(tripId, run.problem.problemId);

  console.log('--- Pipeline ---');
  console.log(JSON.stringify({
    problemId: run.problem.problemId,
    semanticCapability: run.problem.semanticCapability,
    affectedPlanItemIds: run.problem.affectedPlanItemIds,
    candidateCount: run.workspace?.repairCandidates.length ?? 0,
    decisionId: run.record?.decisionId,
  }, null, 2));

  console.log('\n--- impactScopeView ---');
  console.log(JSON.stringify(view.impactScopeView, null, 2));

  console.log('\n--- Unified Gateway curl ---');
  console.log(
    `curl -s http://localhost:3000/api/trips/${tripId}/decision-problems/${run.problem.problemId} | jq '.data.data.impactScopeView.narrative'`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
