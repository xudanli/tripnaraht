/**
 * Upsert Multi-Constraint POI Arrangement Benchmark v1 trip (TRIP-ICELAND-MULTI-001).
 *
 * Usage:
 *   npm run seed:multi-constraint-poi-benchmark
 *   npm run seed:multi-constraint-poi-benchmark -- --force
 *
 * Env:
 *   FIXTURE_OWNER_USER_ID  — Trip OWNER (default: dev fixture user)
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { ItemType, PrismaClient, type Prisma } from '@prisma/client';
import {
  MCPOI_BENCHMARK_DATE_RANGE,
  MCPOI_BENCHMARK_DEFAULT_OWNER_USER_ID,
  MCPOI_BENCHMARK_PLAN_VARIANTS,
  MCPOI_BENCHMARK_SCENARIO_ID,
  MCPOI_BENCHMARK_TRIP_DAYS,
  MCPOI_BENCHMARK_TRIP_ID,
  MCPOI_BENCHMARK_WORLD_FACTS,
  buildMcpoiBenchmarkTripMetadata,
  type McpoiScheduledItem,
} from '../src/trips/arrange-itinerary/fixtures/multi-constraint-poi-arrangement-benchmark.fixture';
import {
  buildExplorationArchive,
  mergeTravelContextExplorationArchive,
} from '../src/trips/exploration/utils/exploration-archive.util';

const force = process.argv.includes('--force');

function mapItemType(type: McpoiScheduledItem['type']): ItemType {
  switch (type) {
    case 'TRANSIT':
      return ItemType.TRANSIT;
    case 'MEAL':
      return ItemType.MEAL_ANCHOR;
    case 'HOTEL':
      return ItemType.REST;
    default:
      return ItemType.ACTIVITY;
  }
}

function parseTimeOnDay(dateIso: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return DateTime.fromISO(dateIso, { zone: 'Atlantic/Reykjavik' })
    .set({ hour: h, minute: m, second: 0, millisecond: 0 })
    .toJSDate();
}

async function resolveOwnerUserId(prisma: PrismaClient): Promise<string> {
  const fromEnv = process.env.FIXTURE_OWNER_USER_ID?.trim();
  if (fromEnv) {
    const user = await prisma.user.findUnique({ where: { id: fromEnv }, select: { id: true } });
    if (!user) throw new Error(`FIXTURE_OWNER_USER_ID not found: ${fromEnv}`);
    return user.id;
  }

  const defaultUser = await prisma.user.findUnique({
    where: { id: MCPOI_BENCHMARK_DEFAULT_OWNER_USER_ID },
    select: { id: true },
  });
  if (defaultUser) return defaultUser.id;

  const anyOwner = await prisma.tripCollaborator.findFirst({
    where: { role: 'OWNER' },
    select: { userId: true },
  });
  if (!anyOwner) {
    throw new Error(
      'No OWNER user found. Set FIXTURE_OWNER_USER_ID or create a user with TripCollaborator first.',
    );
  }
  return anyOwner.userId;
}

async function deleteFixture(prisma: PrismaClient): Promise<void> {
  const tripId = MCPOI_BENCHMARK_TRIP_ID;
  const scenarioId = MCPOI_BENCHMARK_SCENARIO_ID;

  await prisma.worldFact.deleteMany({
    where: { snapshotVersion: `trip:${tripId}` },
  });
  await prisma.planningPlan.deleteMany({ where: { tripId } });
  await prisma.productDiscoverySession.deleteMany({ where: { scenarioId } });
  await prisma.explorationRouteVariant.deleteMany({ where: { scenarioId } });
  await prisma.explorationScenario.deleteMany({
    where: { OR: [{ id: scenarioId }, { tripId }] },
  });

  for (const day of MCPOI_BENCHMARK_TRIP_DAYS) {
    await prisma.itineraryItem.deleteMany({ where: { tripDayId: day.id } });
  }
  await prisma.tripDay.deleteMany({ where: { tripId } });
  await prisma.tripCollaborator.deleteMany({ where: { tripId } });
  await prisma.trip.deleteMany({ where: { id: tripId } });
}

async function seedWorldFacts(prisma: PrismaClient, tripId: string): Promise<number> {
  let count = 0;
  for (const wf of MCPOI_BENCHMARK_WORLD_FACTS) {
    const [fromH, fromM] = wf.effectiveTime.split('-')[0].split(':').map(Number);
    const [toH, toM] = wf.effectiveTime.split('-')[1].split(':').map(Number);
    const validFrom = DateTime.fromISO(wf.date, { zone: 'Atlantic/Reykjavik' })
      .set({ hour: fromH, minute: fromM })
      .toJSDate();
    const validTo = DateTime.fromISO(wf.date, { zone: 'Atlantic/Reykjavik' })
      .set({ hour: toH, minute: toM })
      .toJSDate();

    await prisma.worldFact.create({
      data: {
        factKey: `trip:${tripId}:benchmark:${wf.id}`,
        subjectType: 'Area',
        subjectId: wf.area,
        predicate: `weather.${wf.type.toLowerCase()}`,
        valueJson: {
          id: wf.id,
          date: wf.date,
          area: wf.area,
          type: wf.type,
          value: wf.value,
          effectiveTime: wf.effectiveTime,
          severity: wf.severity,
          scope: { tripId, benchmark: true, testData: true },
          payload: wf.value,
        },
        severity: wf.severity,
        sourceType: 'BENCHMARK_FIXTURE',
        sourceRef: MCPOI_BENCHMARK_TRIP_ID,
        validFrom,
        validTo,
        observedAt: validFrom,
        snapshotVersion: `trip:${tripId}`,
      },
    });
    count += 1;
  }
  return count;
}

async function seedItineraryForVariant(
  tx: Prisma.TransactionClient,
  variantId: 'A' | 'D',
): Promise<number> {
  const variant = MCPOI_BENCHMARK_PLAN_VARIANTS.find((v) => v.variantId === variantId);
  if (!variant) return 0;

  const day = MCPOI_BENCHMARK_TRIP_DAYS[variant.dayIndex];
  let order = 1;
  for (const item of variant.items) {
    await tx.itineraryItem.create({
      data: {
        id: item.itemId,
        tripDayId: day.id,
        type: mapItemType(item.type),
        startTime: parseTimeOnDay(day.date, item.startTime),
        endTime: parseTimeOnDay(day.date, item.endTime),
        note: item.label,
        order,
        travelMode: item.type === 'TRANSIT' ? 'DRIVE' : undefined,
      },
    });
    order += 1;
  }
  return variant.items.length;
}

async function main() {
  const prisma = new PrismaClient();
  const tripId = MCPOI_BENCHMARK_TRIP_ID;
  const scenarioId = MCPOI_BENCHMARK_SCENARIO_ID;

  try {
    const existing = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
    if (existing && !force) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            skipped: true,
            tripId,
            message: 'Fixture already exists. Use --force to delete and recreate.',
            urls: fixtureUrls(tripId),
          },
          null,
          2,
        ),
      );
      return;
    }
    if (existing && force) {
      console.log('Deleting existing benchmark fixture (--force)...');
      await deleteFixture(prisma);
    }

    const ownerUserId = await resolveOwnerUserId(prisma);
    const startDate = DateTime.fromISO(MCPOI_BENCHMARK_DATE_RANGE.startDate).startOf('day');
    const endDate = DateTime.fromISO(MCPOI_BENCHMARK_DATE_RANGE.endDate).endOf('day');
    const now = new Date();

    const explorationArchive = buildExplorationArchive({
      variants: [{ routeId: 'route_benchmark_south_coast_multi', status: 'SELECTED' }],
      materializedAt: now.toISOString(),
      principles: ['SAFETY_FIRST', 'MEMBER_EXPERIENCE', 'GLACIER_MUST'],
    });

    const baseMetadata = mergeTravelContextExplorationArchive(
      buildMcpoiBenchmarkTripMetadata({ scenarioId, activePlanVariant: 'A' }),
      { contextId: scenarioId, explorationArchive },
    );

    let itemCount = 0;

    await prisma.$transaction(async (tx) => {
      await tx.trip.create({
        data: {
          id: tripId,
          name: '冰岛南岸多人旅行（Multi-Constraint POI Benchmark v1）',
          destination: 'IS',
          startDate: startDate.toJSDate(),
          endDate: endDate.toJSDate(),
          status: 'PLANNING',
          updatedAt: now,
          metadata: baseMetadata as Prisma.InputJsonValue,
          pacingConfig: {
            pace: 'moderate',
            riskTolerance: 'low',
            priorityOrder: ['safety', 'memberExperience', 'poiCount'],
          },
          budgetConfig: {
            totalBudget: 45000,
            currency: 'CNY',
            travelers: [
              { type: 'ADULT', count: 3, mobilityTag: 'NORMAL' },
              { type: 'SENIOR', count: 1, mobilityTag: 'LOW' },
              { type: 'CHILD', count: 1, mobilityTag: 'CHILD' },
            ],
          },
        },
      });

      await tx.explorationScenario.create({
        data: {
          id: scenarioId,
          contextId: scenarioId,
          userId: ownerUserId,
          status: 'MATERIALIZED',
          researchProtocolId: null,
          initialInput: (baseMetadata as Record<string, unknown>).explorationInput as Prisma.InputJsonValue,
          tripId,
          materializedAt: now,
          updatedAt: now,
        },
      });

      await tx.productDiscoverySession.create({
        data: {
          id: randomUUID(),
          scenarioId,
          userId: ownerUserId,
          protocolId: 'benchmark',
          metadata: { mode: 'BENCHMARK', fixture: 'multi-constraint-poi-arrangement-v1' },
        },
      });

      await tx.tripCollaborator.create({
        data: {
          id: randomUUID(),
          tripId,
          userId: ownerUserId,
          role: 'OWNER',
          updatedAt: now,
        },
      });

      for (const day of MCPOI_BENCHMARK_TRIP_DAYS) {
        await tx.tripDay.create({
          data: {
            id: day.id,
            tripId,
            date: DateTime.fromISO(day.date).toJSDate(),
          },
        });
      }

      itemCount += await seedItineraryForVariant(tx, 'A');
      itemCount += await seedItineraryForVariant(tx, 'D');

      const planState = {
        schema: 'tripnara.benchmark_plan_state@v1',
        activeVariant: 'A',
        variants: MCPOI_BENCHMARK_PLAN_VARIANTS,
        seededDays: {
          D3: 'A',
          D4: 'D',
        },
      };

      await tx.planningPlan.create({
        data: {
          id: randomUUID(),
          tripId,
          planVersion: 1,
          status: 'ACTIVE',
          planState: planState as Prisma.InputJsonValue,
          summary: {
            headline: 'Multi-Constraint POI Arrangement Benchmark v1',
            memberCount: 5,
            focusDays: ['D3', 'D4'],
          } as Prisma.InputJsonValue,
          createdBy: ownerUserId,
        },
      });
    });

    const worldFactCount = await seedWorldFacts(prisma, tripId);

    console.log(
      JSON.stringify(
        {
          ok: true,
          tripId,
          scenarioId,
          contextId: scenarioId,
          ownerUserId,
          itineraryItemCount: itemCount,
          worldFactCount,
          activePlanVariant: 'A',
          seededItinerary: { D3: '方案 A（INFEASIBLE 基线）', D4: '方案 D（FEASIBLE_WITH_SPLIT 基线）' },
          harnessCaseCount: 8,
          ...fixtureUrls(tripId),
          disclaimer: '所有天气、道路、营业时间均为测试假数据，不能用于真实旅行。',
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

function fixtureUrls(tripId: string) {
  return {
    contextCheckerUrl: `/dashboard/internal/trips/${tripId}/context`,
    resolveApi: `/api/travel-contexts/resolve/by-trip/${tripId}`,
    decisionSpaceBundle: `/api/trips/${tripId}/decision-space-bundle`,
    constraintsApi: `/api/trips/${tripId}/constraints`,
    feasibilityApi: `/api/trips/${tripId}/feasibility`,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
