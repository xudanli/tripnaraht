/**
 * Dual-instance Prisma-shaped store with Trip FOR UPDATE mutex.
 * Exercises the real canary executor without touching production DATABASE_URL.
 */

import type { Prisma } from '@prisma/client';
import { executeItineraryAdjustAuthoritativeCanary } from './itinerary-adjust-canary.executor';

type TripRow = {
  id: string;
  metadata: Record<string, unknown>;
  updatedAt: Date;
};

type ItemRow = {
  id: string;
  isPaid: boolean;
  bookedAt: Date | null;
  bookingStatus: string | null;
  startTime: Date;
  endTime: Date;
  updateCount: number;
};

class AsyncMutex {
  private chain: Promise<void> = Promise.resolve();
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((r) => {
      release = r;
    });
    const prev = this.chain;
    this.chain = prev.then(() => next);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export function createDualInstanceItineraryStore(seed: {
  tripId: string;
  itemId: string;
  revision: number;
  startTime: Date;
  endTime: Date;
}) {
  const trip: TripRow = {
    id: seed.tripId,
    metadata: { revision: seed.revision },
    updatedAt: new Date('2026-07-24T00:00:00.000Z'),
  };
  const item: ItemRow = {
    id: seed.itemId,
    isPaid: false,
    bookedAt: null,
    bookingStatus: null,
    startTime: seed.startTime,
    endTime: seed.endTime,
    updateCount: 0,
  };
  const tripLocks = new Map<string, AsyncMutex>();

  function mutexFor(tripId: string): AsyncMutex {
    let m = tripLocks.get(tripId);
    if (!m) {
      m = new AsyncMutex();
      tripLocks.set(tripId, m);
    }
    return m;
  }

  function buildClient() {
    return {
      $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
        // Outer mutex acquired only when FOR UPDATE is requested (mirrors PG row lock).
        let held: AsyncMutex | null = null;
        let releaseOuter: (() => void) | null = null;

        const tx = {
          $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = strings.join('?');
            if (/FOR UPDATE/i.test(sql)) {
              const tripId = String(values[0] ?? '');
              held = mutexFor(tripId);
              await new Promise<void>((resolve) => {
                void held!.runExclusive(async () => {
                  await new Promise<void>((innerRelease) => {
                    releaseOuter = innerRelease;
                    resolve();
                  });
                });
              });
              return [{ id: tripId }];
            }
            return [];
          },
          trip: {
            findUnique: async () => ({
              id: trip.id,
              metadata: { ...trip.metadata },
              updatedAt: trip.updatedAt,
            }),
            update: async ({
              data,
            }: {
              data: { metadata: Record<string, unknown>; updatedAt: Date };
            }) => {
              trip.metadata = { ...data.metadata };
              trip.updatedAt = data.updatedAt;
              return { id: trip.id };
            },
          },
          itineraryItem: {
            findUnique: async () => ({
              id: item.id,
              isPaid: item.isPaid,
              bookedAt: item.bookedAt,
              bookingStatus: item.bookingStatus,
              startTime: item.startTime,
              endTime: item.endTime,
            }),
            update: async ({
              data,
            }: {
              data: { startTime: Date; endTime: Date };
            }) => {
              item.updateCount += 1;
              item.startTime = data.startTime;
              item.endTime = data.endTime;
              return { id: item.id };
            },
          },
        } as unknown as Prisma.TransactionClient;

        try {
          return await fn(tx);
        } finally {
          releaseOuter?.();
        }
      },
    };
  }

  return {
    clientA: buildClient(),
    clientB: buildClient(),
    getItemUpdateCount: () => item.updateCount,
    getMeta: () => ({ ...trip.metadata }),
    getItemTimes: () => ({
      start: item.startTime.toISOString(),
      end: item.endTime.toISOString(),
    }),
  };
}

export async function runFidelitySequential(): Promise<{
  passed: boolean;
  message: string;
}> {
  const tripId = 'trip-fidelity-seq';
  const itemId = 'item-fidelity-seq';
  const store = createDualInstanceItineraryStore({
    tripId,
    itemId,
    revision: 1,
    startTime: new Date('2026-07-24T09:00:00.000Z'),
    endTime: new Date('2026-07-24T10:00:00.000Z'),
  });
  const idem = 'idem-fidelity-seq';
  const nextStart = '2026-07-24T10:00:00.000Z';
  const nextEnd = '2026-07-24T11:00:00.000Z';
  const updates = [
    { itemId, startTimeIso: nextStart, endTimeIso: nextEnd },
  ] as const;

  const first = await executeItineraryAdjustAuthoritativeCanary({
    prisma: store.clientA,
    tripId,
    idempotencyKey: idem,
    expectedTripRevision: 1,
    timeUpdates: [...updates],
  });
  const second = await executeItineraryAdjustAuthoritativeCanary({
    prisma: store.clientB,
    tripId,
    idempotencyKey: idem,
    expectedTripRevision: 2,
    timeUpdates: [...updates],
  });

  const passed =
    first.outcome === 'APPLIED' &&
    second.outcome === 'IDEMPOTENT_REPLAY' &&
    store.getItemUpdateCount() === 1 &&
    store.getItemTimes().start === nextStart &&
    (store.getMeta().uwcItineraryCanaryIdem as Record<string, string>)?.[idem] ===
      'APPLIED';

  return {
    passed,
    message: passed
      ? 'A APPLIED → B IDEMPOTENT_REPLAY; one Item write; durable idem map'
      : `first=${first.outcome} second=${second.outcome} updates=${store.getItemUpdateCount()}`,
  };
}

export async function runFidelityConcurrent(): Promise<{
  passed: boolean;
  message: string;
  applied: number;
  replay: number;
  conflict: number;
}> {
  const tripId = 'trip-fidelity-conc';
  const itemId = 'item-fidelity-conc';
  const store = createDualInstanceItineraryStore({
    tripId,
    itemId,
    revision: 1,
    startTime: new Date('2026-07-24T09:00:00.000Z'),
    endTime: new Date('2026-07-24T10:00:00.000Z'),
  });
  const idem = 'idem-fidelity-conc';
  const updates = [
    {
      itemId,
      startTimeIso: '2026-07-24T12:00:00.000Z',
      endTimeIso: '2026-07-24T13:00:00.000Z',
    },
  ] as const;

  const [a, b] = await Promise.all([
    executeItineraryAdjustAuthoritativeCanary({
      prisma: store.clientA,
      tripId,
      idempotencyKey: idem,
      expectedTripRevision: 1,
      timeUpdates: [...updates],
    }),
    executeItineraryAdjustAuthoritativeCanary({
      prisma: store.clientB,
      tripId,
      idempotencyKey: idem,
      expectedTripRevision: 1,
      timeUpdates: [...updates],
    }),
  ]);

  const outcomes = [a.outcome, b.outcome];
  const applied = outcomes.filter((o) => o === 'APPLIED').length;
  const replay = outcomes.filter((o) => o === 'IDEMPOTENT_REPLAY').length;
  const conflict = outcomes.filter((o) => o === 'CONFLICT').length;
  const passed =
    applied === 1 &&
    applied + replay + conflict === 2 &&
    store.getItemUpdateCount() === 1;

  return {
    passed,
    message: passed
      ? `coalesced applied=${applied} replay=${replay} conflict=${conflict}`
      : `a=${a.outcome} b=${b.outcome} updates=${store.getItemUpdateCount()}`,
    applied,
    replay,
    conflict,
  };
}
