/**
 * Confirm multi-instance live proof — real PostgreSQL + dual PrismaClient.
 *
 * Opt-in:
 *   CONFIRM_MULTI_INSTANCE_LIVE=1 DATABASE_URL=postgresql://... \
 *     npx jest src/decision-runtime/execution/authoritative-write/confirm-multi-instance-live.e2e.spec.ts --runInBand
 *
 * Refuses production DATABASE_URL. Cleans up seeded rows after each scenario.
 */

import { PrismaClient, type ItemType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { toInputJsonValue } from '../../../trips/budget-os/utils/prisma-json.util';
import { executeItineraryAdjustAuthoritativeCanary } from './itinerary-adjust-canary.executor';

export const CONFIRM_LIVE_TRIP_ID = 'uwc_confirm_live_mi';
export const CONFIRM_LIVE_DAY_ID = 'uwc_confirm_live_mi_day1';
export const CONFIRM_LIVE_ITEM_ID = 'uwc_confirm_live_mi_item1';

export function isConfirmMultiInstanceLiveEnabled(): boolean {
  if (process.env.CONFIRM_MULTI_INSTANCE_LIVE !== '1') return false;
  const url =
    process.env.CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    '';
  if (!url) return false;
  // Never enable against production — suite skips cleanly.
  if (/tripnara_prod|production/i.test(url)) return false;
  return true;
}

export function resolveConfirmLiveDatabaseUrl(): string {
  assertConfirmMultiInstanceLiveAllowed();
  return (
    process.env.CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL!.trim()
  );
}

export function assertConfirmMultiInstanceLiveAllowed(): void {
  if (process.env.CONFIRM_MULTI_INSTANCE_LIVE !== '1') {
    throw new Error(
      'Confirm multi-instance live disabled — set CONFIRM_MULTI_INSTANCE_LIVE=1',
    );
  }
  const url =
    process.env.CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    '';
  if (!url) {
    throw new Error(
      'Confirm multi-instance live needs CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL or DATABASE_URL',
    );
  }
  if (/tripnara_prod|production/i.test(url)) {
    throw new Error(
      'Refusing Confirm multi-instance live proof on production DATABASE_URL — set CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL to a staging/local DB',
    );
  }
}

export function createConfirmLivePrisma(): PrismaClient {
  const url = resolveConfirmLiveDatabaseUrl();
  return new PrismaClient({ datasources: { db: { url } } });
}

export type ConfirmLiveFixture = {
  tripId: string;
  dayId: string;
  itemId: string;
  revision: number;
  startTimeIso: string;
  endTimeIso: string;
};

export async function cleanupConfirmLiveFixture(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.itineraryItem.deleteMany({
    where: { tripDayId: CONFIRM_LIVE_DAY_ID },
  });
  await prisma.tripDay.deleteMany({ where: { tripId: CONFIRM_LIVE_TRIP_ID } });
  await prisma.trip.deleteMany({ where: { id: CONFIRM_LIVE_TRIP_ID } });
}

export async function seedConfirmLiveFixture(
  prisma: PrismaClient,
): Promise<ConfirmLiveFixture> {
  await cleanupConfirmLiveFixture(prisma);
  const now = new Date();
  const start = new Date('2026-07-24T09:00:00.000Z');
  const end = new Date('2026-07-24T10:00:00.000Z');
  const revision = 1;

  await prisma.trip.create({
    data: {
      id: CONFIRM_LIVE_TRIP_ID,
      destination: 'IS',
      startDate: new Date('2026-07-24T00:00:00.000Z'),
      endDate: new Date('2026-07-28T00:00:00.000Z'),
      updatedAt: now,
      status: 'PLANNING',
      name: 'UWC Confirm Multi-Instance Live',
      metadata: toInputJsonValue({ revision }),
    },
  });

  await prisma.tripDay.create({
    data: {
      id: CONFIRM_LIVE_DAY_ID,
      tripId: CONFIRM_LIVE_TRIP_ID,
      date: new Date('2026-07-24T00:00:00.000Z'),
    },
  });

  await prisma.itineraryItem.create({
    data: {
      id: CONFIRM_LIVE_ITEM_ID,
      tripDayId: CONFIRM_LIVE_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 1,
      note: 'confirm live multi-instance',
      startTime: start,
      endTime: end,
    },
  });

  return {
    tripId: CONFIRM_LIVE_TRIP_ID,
    dayId: CONFIRM_LIVE_DAY_ID,
    itemId: CONFIRM_LIVE_ITEM_ID,
    revision,
    startTimeIso: start.toISOString(),
    endTimeIso: end.toISOString(),
  };
}

export type ConfirmLiveScenarioResult = {
  scenarioId: string;
  passed: boolean;
  message: string;
  appliedCount?: number;
  replayCount?: number;
  conflictCount?: number;
  itemUpdateObserved?: boolean;
  durableIdemHit?: boolean;
};

function countOutcomes(
  results: Array<{ outcome: string }>,
): { applied: number; replay: number; conflict: number } {
  return {
    applied: results.filter((r) => r.outcome === 'APPLIED').length,
    replay: results.filter((r) => r.outcome === 'IDEMPOTENT_REPLAY').length,
    conflict: results.filter((r) => r.outcome === 'CONFLICT').length,
  };
}

async function readDurableIdem(
  prisma: PrismaClient,
  tripId: string,
  idempotencyKey: string,
): Promise<boolean> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
  const map =
    meta.uwcItineraryCanaryIdem && typeof meta.uwcItineraryCanaryIdem === 'object'
      ? (meta.uwcItineraryCanaryIdem as Record<string, unknown>)
      : {};
  return map[idempotencyKey] === 'APPLIED';
}

async function readItemTimes(
  prisma: PrismaClient,
  itemId: string,
): Promise<{ start: string | null; end: string | null }> {
  const item = await prisma.itineraryItem.findUnique({
    where: { id: itemId },
    select: { startTime: true, endTime: true },
  });
  return {
    start: item?.startTime?.toISOString() ?? null,
    end: item?.endTime?.toISOString() ?? null,
  };
}

/**
 * Instance A Apply → Instance B (fresh PrismaClient) same key → IDEMPOTENT_REPLAY.
 * Proves durable Trip.metadata idem map across process boundaries.
 */
export async function runCrossClientSequentialLive(
  prismaA: PrismaClient,
  prismaB: PrismaClient,
): Promise<ConfirmLiveScenarioResult> {
  const fixture = await seedConfirmLiveFixture(prismaA);
  const idempotencyKey = `live-seq-${randomUUID()}`;
  const nextStart = '2026-07-24T10:00:00.000Z';
  const nextEnd = '2026-07-24T11:00:00.000Z';

  try {
    const first = await executeItineraryAdjustAuthoritativeCanary({
      prisma: prismaA,
      tripId: fixture.tripId,
      idempotencyKey,
      expectedTripRevision: fixture.revision,
      timeUpdates: [
        {
          itemId: fixture.itemId,
          startTimeIso: nextStart,
          endTimeIso: nextEnd,
        },
      ],
    });

    const second = await executeItineraryAdjustAuthoritativeCanary({
      prisma: prismaB,
      tripId: fixture.tripId,
      idempotencyKey,
      expectedTripRevision: fixture.revision + 1,
      timeUpdates: [
        {
          itemId: fixture.itemId,
          startTimeIso: nextStart,
          endTimeIso: nextEnd,
        },
      ],
    });

    const times = await readItemTimes(prismaB, fixture.itemId);
    const durableIdemHit = await readDurableIdem(
      prismaB,
      fixture.tripId,
      idempotencyKey,
    );

    const passed =
      first.outcome === 'APPLIED' &&
      second.outcome === 'IDEMPOTENT_REPLAY' &&
      times.start === nextStart &&
      times.end === nextEnd &&
      durableIdemHit;

    return {
      scenarioId: 'LIVE-CROSS-CLIENT-SEQUENTIAL',
      passed,
      message: passed
        ? 'A APPLIED → B IDEMPOTENT_REPLAY; durable idem + single time mutate'
        : `first=${first.outcome} second=${second.outcome} times=${JSON.stringify(times)} durable=${durableIdemHit}`,
      appliedCount: first.outcome === 'APPLIED' ? 1 : 0,
      replayCount: second.outcome === 'IDEMPOTENT_REPLAY' ? 1 : 0,
      itemUpdateObserved: times.start === nextStart,
      durableIdemHit,
    };
  } finally {
    await cleanupConfirmLiveFixture(prismaA);
  }
}

/**
 * Dual PrismaClient concurrent Apply (same key + expected revision).
 * With Trip FOR UPDATE: ≤1 APPLIED; rest IDEMPOTENT_REPLAY or CONFLICT; durable idem once.
 */
export async function runCrossClientConcurrentLive(
  prismaA: PrismaClient,
  prismaB: PrismaClient,
): Promise<ConfirmLiveScenarioResult> {
  const fixture = await seedConfirmLiveFixture(prismaA);
  const idempotencyKey = `live-conc-${randomUUID()}`;
  const nextStart = '2026-07-24T12:00:00.000Z';
  const nextEnd = '2026-07-24T13:00:00.000Z';
  const inputBase = {
    tripId: fixture.tripId,
    idempotencyKey,
    expectedTripRevision: fixture.revision,
    timeUpdates: [
      {
        itemId: fixture.itemId,
        startTimeIso: nextStart,
        endTimeIso: nextEnd,
      },
    ] as const,
  };

  try {
    const [a, b] = await Promise.all([
      executeItineraryAdjustAuthoritativeCanary({
        prisma: prismaA,
        ...inputBase,
      }),
      executeItineraryAdjustAuthoritativeCanary({
        prisma: prismaB,
        ...inputBase,
      }),
    ]);

    const counts = countOutcomes([a, b]);
    const times = await readItemTimes(prismaA, fixture.itemId);
    const durableIdemHit = await readDurableIdem(
      prismaA,
      fixture.tripId,
      idempotencyKey,
    );

    const passed =
      counts.applied === 1 &&
      counts.applied + counts.replay + counts.conflict === 2 &&
      times.start === nextStart &&
      times.end === nextEnd &&
      durableIdemHit;

    return {
      scenarioId: 'LIVE-CROSS-CLIENT-CONCURRENT',
      passed,
      message: passed
        ? `concurrent coalesced: applied=${counts.applied} replay=${counts.replay} conflict=${counts.conflict}`
        : `outcomes a=${a.outcome} b=${b.outcome}; counts=${JSON.stringify(counts)}; times=${JSON.stringify(times)}; durable=${durableIdemHit}`,
      appliedCount: counts.applied,
      replayCount: counts.replay,
      conflictCount: counts.conflict,
      itemUpdateObserved: times.start === nextStart,
      durableIdemHit,
    };
  } finally {
    await cleanupConfirmLiveFixture(prismaA);
  }
}
