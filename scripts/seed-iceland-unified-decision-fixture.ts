/**
 * Upsert Iceland Unified Decision fixture trip (fixed UUID) for local / shared DB联调.
 *
 * Usage:
 *   npx tsx scripts/seed-iceland-unified-decision-fixture.ts
 *   npx tsx scripts/seed-iceland-unified-decision-fixture.ts --force
 *
 * Env:
 *   FIXTURE_OWNER_USER_ID  — Trip OWNER (default: 5872f534-… from dev scripts)
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  ICELAND_UNIFIED_DECISION_FIXTURE_DEFAULT_OWNER_USER_ID,
  ICELAND_UNIFIED_DECISION_FIXTURE_F208_DRIVE_ITEM_ID,
  ICELAND_UNIFIED_DECISION_FIXTURE_SCENARIO_ID,
  ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_DAYS,
  ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_ID,
} from '../src/trips/decision-semantics/fixtures/iceland-unified-decision.fixture';
import {
  buildExplorationArchive,
  mergeTravelContextExplorationArchive,
} from '../src/trips/exploration/utils/exploration-archive.util';

const force = process.argv.includes('--force');

async function resolveOwnerUserId(prisma: PrismaClient): Promise<string> {
  const fromEnv = process.env.FIXTURE_OWNER_USER_ID?.trim();
  if (fromEnv) {
    const user = await prisma.user.findUnique({ where: { id: fromEnv }, select: { id: true } });
    if (!user) throw new Error(`FIXTURE_OWNER_USER_ID not found: ${fromEnv}`);
    return user.id;
  }

  const defaultUser = await prisma.user.findUnique({
    where: { id: ICELAND_UNIFIED_DECISION_FIXTURE_DEFAULT_OWNER_USER_ID },
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
  const tripId = ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_ID;
  const scenarioId = ICELAND_UNIFIED_DECISION_FIXTURE_SCENARIO_ID;

  await prisma.productDiscoverySession.deleteMany({ where: { scenarioId } });
  await prisma.explorationRouteVariant.deleteMany({ where: { scenarioId } });
  await prisma.explorationScenario.deleteMany({
    where: { OR: [{ id: scenarioId }, { tripId }] },
  });

  for (const day of ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_DAYS) {
    await prisma.itineraryItem.deleteMany({ where: { tripDayId: day.id } });
  }
  await prisma.tripDay.deleteMany({ where: { tripId } });
  await prisma.tripCollaborator.deleteMany({ where: { tripId } });
  await prisma.trip.deleteMany({ where: { id: tripId } });
}

async function main() {
  const prisma = new PrismaClient();
  const tripId = ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_ID;
  const scenarioId = ICELAND_UNIFIED_DECISION_FIXTURE_SCENARIO_ID;

  try {
    const existing = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
    if (existing && !force) {
      console.log(`Fixture trip already exists: ${tripId}`);
      console.log('Use --force to delete and recreate.');
      return;
    }
    if (existing && force) {
      console.log('Deleting existing fixture (--force)...');
      await deleteFixture(prisma);
    }

    const ownerUserId = await resolveOwnerUserId(prisma);
    const startDate = DateTime.fromISO('2026-08-01').startOf('day');
    const endDate = startDate.plus({ days: 6 }).endOf('day');
    const now = new Date();

    const explorationArchive = buildExplorationArchive({
      variants: [{ routeId: 'route_fixture_south_coast', status: 'SELECTED' }],
      materializedAt: now.toISOString(),
      principles: ['LOW_DRIVING', 'SCENIC_PRIORITY'],
    });

    const baseMetadata = mergeTravelContextExplorationArchive(
      {
        source: 'exploration',
        explorationScenarioId: scenarioId,
        tripVersion: 1,
        fixture: 'iceland-unified-decision-v1',
        explorationInput: {
          destinationCodes: ['IS'],
          dateRange: {
            startDate: startDate.toISODate(),
            endDate: endDate.toISODate(),
          },
          travelers: [{ role: 'ADULT', count: 2 }],
          source: 'USER_CREATED',
        },
      },
      { contextId: scenarioId, explorationArchive },
    );

    await prisma.$transaction(async (tx) => {
      await tx.trip.create({
        data: {
          id: tripId,
          name: '冰岛联调 Fixture（Unified Decision）',
          destination: 'IS',
          startDate: startDate.toJSDate(),
          endDate: endDate.toJSDate(),
          status: 'PLANNING',
          updatedAt: now,
          metadata: baseMetadata as Prisma.InputJsonValue,
          pacingConfig: { pace: 'moderate', riskTolerance: 'medium' },
          budgetConfig: { totalBudget: 30000, currency: 'CNY' },
        },
      });

      await tx.explorationScenario.create({
        data: {
          id: scenarioId,
          contextId: scenarioId,
          userId: ownerUserId,
          status: 'MATERIALIZED',
          researchProtocolId: null,
          initialInput: {
            destinationCodes: ['IS'],
            dateRange: {
              startDate: startDate.toISODate(),
              endDate: endDate.toISODate(),
            },
            travelers: [{ role: 'ADULT', count: 2 }],
            source: 'USER_CREATED',
          } as Prisma.InputJsonValue,
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
          protocolId: 'consumer',
          metadata: { mode: 'CONSUMER', fixture: true },
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

      for (const day of ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_DAYS) {
        const dayDate = startDate.plus({ days: day.dayIndex });
        await tx.tripDay.create({
          data: {
            id: day.id,
            tripId,
            date: dayDate.toJSDate(),
          },
        });
      }

      const day6 = ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_DAYS[5];
      const day6Date = startDate.plus({ days: 5 });
      await tx.itineraryItem.create({
        data: {
          id: ICELAND_UNIFIED_DECISION_FIXTURE_F208_DRIVE_ITEM_ID,
          tripDayId: day6.id,
          type: 'TRANSIT',
          startTime: day6Date.set({ hour: 9 }).toJSDate(),
          endTime: day6Date.set({ hour: 12 }).toJSDate(),
          note: 'Driving segment — 红沙滩 (F208 fixture binding target)',
          travelMode: 'DRIVE',
          order: 1,
        },
      });

      await tx.itineraryItem.create({
        data: {
          id: randomUUID(),
          tripDayId: day6.id,
          type: 'ACTIVITY',
          startTime: day6Date.set({ hour: 14 }).toJSDate(),
          endTime: day6Date.set({ hour: 16 }).toJSDate(),
          note: '红沙滩',
          order: 2,
        },
      });
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          tripId,
          scenarioId,
          contextId: scenarioId,
          ownerUserId,
          contextCheckerUrl: `/dashboard/internal/trips/${tripId}/context`,
          resolveApi: `/api/travel-contexts/resolve/by-trip/${tripId}`,
          f208Simulate: `npm run decision-center:simulate-f208 -- ${tripId}`,
          unifiedQa: `npm run decision-center:unified-qa -- ${tripId}`,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
