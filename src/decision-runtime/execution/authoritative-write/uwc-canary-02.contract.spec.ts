import {
  resolveItineraryAdjustCanaryGate,
  UWC_ITINERARY_CANARY_CONTRACT_COMPLETE,
} from './itinerary-adjust-canary.config';
import { admitItineraryAdjustCanaryRequest } from './itinerary-adjust-canary.admit';
import {
  decideItineraryAdjustCanaryRoute,
  decideCanaryLegacyFallback,
} from './itinerary-adjust-canary.router';
import { extractSameDayTimeUpdatesForCanary } from './itinerary-adjust-canary.extract';
import { executeItineraryAdjustAuthoritativeCanary } from './itinerary-adjust-canary.executor';
import {
  advanceCutoverAfterActionsCanaryPass,
  advanceCutoverAfterItineraryCanaryPass,
  beginItineraryAdjustCanary,
  UWC_CORRIDOR_CUTOVER_STATUS,
  assertNoAutoUnlockAll,
} from './corridor-cutover.gate';
import {
  UWC_1C_OCC_UNLOCKED,
  UWC_AUTHORITATIVE_DUAL_GATE_STATUS,
} from './corridor-write-mode.config';
import { UWC_1D_COMPENSATION_EXEC_AUTHORIZED } from './compensation-auth.gate';
import type { Prisma } from '@prisma/client';

describe('UWC-CANARY-02 ITINERARY_ADJUST', () => {
  const tripId = 'trip-canary-02';
  const enabledEnv = {
    UWC_ITINERARY_CANARY_AUTHORIZED: '1',
    UWC_ITINERARY_CANARY_KILL_SWITCH: '0',
    UWC_ITINERARY_CANARY_PERCENT: '100',
    UWC_ITINERARY_CANARY_TRIP_ALLOWLIST: tripId,
    UWC_ITINERARY_CANARY_OP_ALLOWLIST: 'same_day_time_adjust',
  } as NodeJS.ProcessEnv;

  it('canary gate coexists with OCC + compensation unlock', () => {
    expect(UWC_ITINERARY_CANARY_CONTRACT_COMPLETE).toBe(true);
    expect(UWC_1C_OCC_UNLOCKED).toBe(true);
    expect(UWC_AUTHORITATIVE_DUAL_GATE_STATUS.unlocked).toBe(true);
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(true);
  });

  it('kill switch / trip allowlist / op allowlist gate admission', () => {
    expect(
      resolveItineraryAdjustCanaryGate({
        ...enabledEnv,
        UWC_ITINERARY_CANARY_KILL_SWITCH: '1',
      }).enabled,
    ).toBe(false);

    const deniedTrip = admitItineraryAdjustCanaryRequest(
      {
        tripId: 'other-trip',
        operation: 'same_day_time_adjust',
        targetDateIso: '2026-07-24',
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
      },
      enabledEnv,
    );
    expect(deniedTrip.admitted).toBe(false);

    const deniedOp = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'append_sparse_days',
        targetDateIso: '2026-07-24',
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
      },
      enabledEnv,
    );
    expect(deniedOp.admitted).toBe(false);
  });

  it('admits unbooked unlocked same-day time adjust only', () => {
    const ok = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_time_adjust',
        targetDateIso: '2026-07-24',
        applyMode: 'replace_day',
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
        itemFlags: [{ itemId: 'i1', isPaid: false, bookedAt: null, locked: false }],
      },
      enabledEnv,
    );
    expect(ok.admitted).toBe(true);
    expect(ok.writeTargets).toEqual(['Trip', 'ItineraryItem']);

    const booked = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_time_adjust',
        targetDateIso: '2026-07-24',
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
        itemFlags: [{ itemId: 'i1', isPaid: true }],
      },
      enabledEnv,
    );
    expect(booked.admitted).toBe(false);
  });

  it('admits same-day ADD item (no mixed timeUpdates)', () => {
    const addEnv = {
      ...enabledEnv,
      UWC_ITINERARY_CANARY_OP_ALLOWLIST: 'same_day_time_adjust,same_day_add_item',
    } as NodeJS.ProcessEnv;
    const ok = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_add_item',
        targetDateIso: '2026-07-24',
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
      },
      addEnv,
    );
    expect(ok.admitted).toBe(true);
    expect(ok.reasonCodes).toContain('SAME_DAY_ADD_ITEM');

    const mixed = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_add_item',
        targetDateIso: '2026-07-24',
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T12:00:00.000Z',
            endTimeIso: '2026-07-24T13:00:00.000Z',
          },
        ],
      },
      addEnv,
    );
    expect(mixed.admitted).toBe(false);
    expect(mixed.reasonCodes.some((c) => c.startsWith('MIXED_'))).toBe(true);
  });

  it('admits same-day ADD from candidates; rejects without removals', () => {
    const addEnv = {
      ...enabledEnv,
      UWC_ITINERARY_CANARY_OP_ALLOWLIST:
        'same_day_time_adjust,same_day_add_item,same_day_add_from_candidates',
    } as NodeJS.ProcessEnv;
    const ok = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_add_from_candidates',
        targetDateIso: '2026-07-24',
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
            clientItemKey: 'cand-1',
          },
        ],
        candidateRemovals: ['cand-1'],
      },
      addEnv,
    );
    expect(ok.admitted).toBe(true);
    expect(ok.reasonCodes).toContain('SAME_DAY_ADD_FROM_CANDIDATES');

    const noRemovals = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_add_from_candidates',
        targetDateIso: '2026-07-24',
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
        candidateRemovals: [],
      },
      addEnv,
    );
    expect(noRemovals.admitted).toBe(false);
    expect(noRemovals.reasonCodes).toContain('NO_CANDIDATE_REMOVALS');
  });

  it('admits multi-day from-candidates; rejects single tripDay', () => {
    const env = {
      ...enabledEnv,
      UWC_ITINERARY_CANARY_OP_ALLOWLIST:
        'same_day_add_from_candidates,multi_day_add_from_candidates',
    } as NodeJS.ProcessEnv;
    const ok = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'multi_day_add_from_candidates',
        targetDateIso: '2026-07-24',
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
            clientItemKey: 'cand-1',
          },
          {
            tripDayId: 'day2',
            placeId: 43,
            startTimeIso: '2026-07-25T10:00:00.000Z',
            endTimeIso: '2026-07-25T11:00:00.000Z',
            clientItemKey: 'cand-2',
          },
        ],
        candidateRemovals: ['cand-1', 'cand-2'],
      },
      env,
    );
    expect(ok.admitted).toBe(true);
    expect(ok.reasonCodes).toContain('MULTI_DAY_ADD_FROM_CANDIDATES');
    expect(ok.reasonCodes).toContain('ATOMIC_COMPOSITE_NO_CORRIDOR_CHAIN');

    const singleDay = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'multi_day_add_from_candidates',
        targetDateIso: '2026-07-24',
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
        candidateRemovals: ['cand-1'],
      },
      env,
    );
    expect(singleDay.admitted).toBe(false);
    expect(singleDay.reasonCodes).toContain(
      'MULTI_DAY_REQUIRES_MULTIPLE_TRIP_DAYS',
    );
  });

  it('admits same-day REMOVE; rejects mixed with timeUpdates', () => {
    const env = {
      ...enabledEnv,
      UWC_ITINERARY_CANARY_OP_ALLOWLIST:
        'same_day_time_adjust,same_day_add_item,same_day_add_from_candidates,same_day_remove_item',
    } as NodeJS.ProcessEnv;
    const ok = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_remove_item',
        targetDateIso: '2026-07-24',
        itemRemovals: ['i1'],
        itemFlags: [{ itemId: 'i1', isPaid: false, bookedAt: null, locked: false }],
      },
      env,
    );
    expect(ok.admitted).toBe(true);
    expect(ok.reasonCodes).toContain('SAME_DAY_REMOVE_ITEM');

    const mixed = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_remove_item',
        targetDateIso: '2026-07-24',
        itemRemovals: ['i1'],
        timeUpdates: [
          {
            itemId: 'i2',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
      },
      env,
    );
    expect(mixed.admitted).toBe(false);
    expect(mixed.reasonCodes.some((c) => c.startsWith('MIXED_'))).toBe(true);
  });

  it('admits same-day REORDER; rejects mixed with removals', () => {
    const env = {
      ...enabledEnv,
      UWC_ITINERARY_CANARY_OP_ALLOWLIST:
        'same_day_time_adjust,same_day_add_item,same_day_add_from_candidates,same_day_remove_item,same_day_reorder_items',
    } as NodeJS.ProcessEnv;
    const ok = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_reorder_items',
        targetDateIso: '2026-07-24',
        itemReorders: [
          { itemId: 'i1', order: 1 },
          { itemId: 'i2', order: 2 },
        ],
        itemFlags: [
          { itemId: 'i1', isPaid: false, bookedAt: null, locked: false },
          { itemId: 'i2', isPaid: false, bookedAt: null, locked: false },
        ],
      },
      env,
    );
    expect(ok.admitted).toBe(true);
    expect(ok.reasonCodes).toContain('SAME_DAY_REORDER_ITEMS');

    const mixed = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_reorder_items',
        targetDateIso: '2026-07-24',
        itemReorders: [{ itemId: 'i1', order: 1 }],
        itemRemovals: ['i2'],
      },
      env,
    );
    expect(mixed.admitted).toBe(false);
    expect(mixed.reasonCodes.some((c) => c.startsWith('MIXED_'))).toBe(true);
  });

  it('admits same-day MOVE+ADD; rejects pure-op mix and missing half', () => {
    const env = {
      ...enabledEnv,
      UWC_ITINERARY_CANARY_OP_ALLOWLIST:
        'same_day_time_adjust,same_day_add_item,same_day_move_and_add',
    } as NodeJS.ProcessEnv;
    const ok = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_move_and_add',
        targetDateIso: '2026-07-24',
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T09:00:00.000Z',
            endTimeIso: '2026-07-24T10:00:00.000Z',
          },
        ],
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            startTimeIso: '2026-07-24T11:00:00.000Z',
            endTimeIso: '2026-07-24T12:00:00.000Z',
          },
        ],
        itemFlags: [{ itemId: 'i1', isPaid: false, bookedAt: null, locked: false }],
      },
      env,
    );
    expect(ok.admitted).toBe(true);
    expect(ok.reasonCodes).toContain('SAME_DAY_MOVE_AND_ADD');
    expect(ok.reasonCodes).toContain('ATOMIC_COMPOSITE_NO_CORRIDOR_CHAIN');

    const missingAdd = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_move_and_add',
        targetDateIso: '2026-07-24',
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T09:00:00.000Z',
            endTimeIso: '2026-07-24T10:00:00.000Z',
          },
        ],
      },
      env,
    );
    expect(missingAdd.admitted).toBe(false);
    expect(missingAdd.reasonCodes).toContain('NO_ITEM_CREATES');

    const chainedUnderAdd = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_add_item',
        targetDateIso: '2026-07-24',
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T09:00:00.000Z',
            endTimeIso: '2026-07-24T10:00:00.000Z',
          },
        ],
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            startTimeIso: '2026-07-24T11:00:00.000Z',
            endTimeIso: '2026-07-24T12:00:00.000Z',
          },
        ],
      },
      env,
    );
    expect(chainedUnderAdd.admitted).toBe(false);
    expect(chainedUnderAdd.reasonCodes).toContain(
      'MIXED_TIME_UPDATE_AND_ITEM_CREATES',
    );
  });

  it('admits same-day REDUCE_INTENSITY; rejects place-bound creates', () => {
    const env = {
      ...enabledEnv,
      UWC_ITINERARY_CANARY_OP_ALLOWLIST:
        'same_day_reduce_intensity,same_day_move_and_add',
    } as NodeJS.ProcessEnv;
    const ok = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_reduce_intensity',
        targetDateIso: '2026-07-24',
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T15:00:00.000Z',
          },
        ],
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: null,
            type: 'REST',
            startTimeIso: '2026-07-24T15:30:00.000Z',
            endTimeIso: '2026-07-24T16:30:00.000Z',
          },
        ],
        itemFlags: [{ itemId: 'i1', isPaid: false, bookedAt: null, locked: false }],
      },
      env,
    );
    expect(ok.admitted).toBe(true);
    expect(ok.reasonCodes).toContain('SAME_DAY_REDUCE_INTENSITY');

    const withPlace = admitItineraryAdjustCanaryRequest(
      {
        tripId,
        operation: 'same_day_reduce_intensity',
        targetDateIso: '2026-07-24',
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T15:00:00.000Z',
          },
        ],
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            type: 'REST',
            startTimeIso: '2026-07-24T15:30:00.000Z',
            endTimeIso: '2026-07-24T16:30:00.000Z',
          },
        ],
      },
      env,
    );
    expect(withPlace.admitted).toBe(false);
    expect(
      withPlace.reasonCodes.some((c) => c.startsWith('REDUCE_INTENSITY_')),
    ).toBe(true);
  });

  it('extract rejects add/delete style draft item set mismatch', () => {
    const bad = extractSameDayTimeUpdatesForCanary({
      targetDateIso: '2026-07-24',
      tripItems: [
        {
          id: 'i1',
          startTime: '2026-07-24T09:00:00.000Z',
          endTime: '2026-07-24T10:00:00.000Z',
        },
      ],
      draftItems: [
        {
          id: 'i-new',
          start_window: '2026-07-24T10:00:00.000Z',
          end_window: '2026-07-24T11:00:00.000Z',
        },
      ],
    });
    expect(bad.ok).toBe(false);

    const good = extractSameDayTimeUpdatesForCanary({
      targetDateIso: '2026-07-24',
      tripItems: [
        {
          id: 'i1',
          startTime: '2026-07-24T09:00:00.000Z',
          endTime: '2026-07-24T10:00:00.000Z',
        },
      ],
      draftItems: [
        {
          id: 'i1',
          start_window: '2026-07-24T10:00:00.000Z',
          end_window: '2026-07-24T11:00:00.000Z',
        },
      ],
    });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.operation).toBe('same_day_time_adjust');
      expect(good.timeUpdates).toHaveLength(1);
    }
  });

  it('percent routing: selected → AUTHORITATIVE_CANARY; miss → Legacy+Shadow', () => {
    const selected = decideItineraryAdjustCanaryRoute({
      routingKey: 'force-select-key',
      admission: {
        tripId,
        operation: 'same_day_time_adjust',
        targetDateIso: '2026-07-24',
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
      },
      env: enabledEnv,
    });
    expect(selected.selectedForCanary).toBe(true);
    expect(selected.mode).toBe('AUTHORITATIVE_CANARY');

    const miss = decideItineraryAdjustCanaryRoute({
      routingKey: 'force-select-key',
      admission: {
        tripId,
        operation: 'same_day_time_adjust',
        targetDateIso: '2026-07-24',
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
      },
      env: { ...enabledEnv, UWC_ITINERARY_CANARY_PERCENT: '0' },
    });
    expect(miss.selectedForCanary).toBe(false);
    expect(miss.mode).toBe('LEGACY_WITH_SHADOW');
  });

  it('executor commits via DB transaction + RESOURCE_VERSION_SET OCC', async () => {
    let tripMeta: Record<string, unknown> = { revision: 3 };
    let itemStart = new Date('2026-07-24T09:00:00.000Z');
    let itemEnd = new Date('2026-07-24T10:00:00.000Z');
    let committed = false;

    const prisma = {
      $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
        const tx = {
          trip: {
            findUnique: async () => ({
              id: tripId,
              metadata: tripMeta,
              updatedAt: new Date('2026-07-24T00:00:00.000Z'),
            }),
            update: async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
              tripMeta = { ...data.metadata };
              committed = true;
              return { id: tripId };
            },
          },
          itineraryItem: {
            findUnique: async () => ({
              id: 'i1',
              isPaid: false,
              bookedAt: null,
              bookingStatus: null,
              startTime: itemStart,
              endTime: itemEnd,
            }),
            update: async ({
              data,
            }: {
              data: { startTime: Date; endTime: Date };
            }) => {
              itemStart = data.startTime;
              itemEnd = data.endTime;
              return { id: 'i1' };
            },
          },
        } as unknown as Prisma.TransactionClient;
        return fn(tx);
      },
    };

    const applied = await executeItineraryAdjustAuthoritativeCanary({
      prisma,
      tripId,
      idempotencyKey: 'idem-ia-1',
      expectedTripRevision: 3,
      timeUpdates: [
        {
          itemId: 'i1',
          startTimeIso: '2026-07-24T10:00:00.000Z',
          endTimeIso: '2026-07-24T11:00:00.000Z',
        },
      ],
    });
    expect(applied.outcome).toBe('APPLIED');
    expect(applied.corridorResult?.dualExecution).toBe(false);
    expect(applied.corridorResult?.transaction).toBe('committed');
    expect(committed).toBe(true);
    expect(tripMeta.revision).toBe(4);
    expect(itemStart.toISOString()).toBe('2026-07-24T10:00:00.000Z');
  });

  it('OCC conflict aborts transaction and forbids legacy fallback', async () => {
    const prisma = {
      $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
        const tx = {
          trip: {
            findUnique: async () => ({
              id: tripId,
              metadata: { revision: 9 },
              updatedAt: new Date(),
            }),
            update: async () => {
              throw new Error('should_not_update');
            },
          },
          itineraryItem: {
            findUnique: async () => {
              throw new Error('should_not_load_item');
            },
            update: async () => {
              throw new Error('should_not_update_item');
            },
          },
        } as unknown as Prisma.TransactionClient;
        return fn(tx);
      },
    };

    const conflict = await executeItineraryAdjustAuthoritativeCanary({
      prisma,
      tripId,
      idempotencyKey: 'idem-conflict',
      expectedTripRevision: 3,
      timeUpdates: [
        {
          itemId: 'i1',
          startTimeIso: '2026-07-24T10:00:00.000Z',
          endTimeIso: '2026-07-24T11:00:00.000Z',
        },
      ],
    });
    expect(conflict.outcome).toBe('CONFLICT');
    expect(conflict.corridorResult?.transaction).toBe('aborted');
    expect(
      decideCanaryLegacyFallback({
        uwcOutcome: 'CONFLICT',
        sideEffectsStarted: false,
      }).allowLegacyFallback,
    ).toBe(false);
    expect(
      decideCanaryLegacyFallback({
        uwcOutcome: 'REJECTED',
        sideEffectsStarted: false,
      }).allowLegacyFallback,
    ).toBe(false);
  });

  it('booked item rejects inside txn (TRANSACTION_ABORT); compensation stays closed', async () => {
    const prisma = {
      $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
        const tx = {
          trip: {
            findUnique: async () => ({
              id: tripId,
              metadata: { revision: 1 },
              updatedAt: new Date(),
            }),
            update: async () => {
              throw new Error('should_not_commit');
            },
          },
          itineraryItem: {
            findUnique: async () => ({
              id: 'i1',
              isPaid: true,
              bookedAt: new Date(),
              bookingStatus: 'CONFIRMED',
              startTime: new Date('2026-07-24T09:00:00.000Z'),
              endTime: new Date('2026-07-24T10:00:00.000Z'),
            }),
            update: async () => {
              throw new Error('should_not_update');
            },
          },
        } as unknown as Prisma.TransactionClient;
        return fn(tx);
      },
    };

    const rejected = await executeItineraryAdjustAuthoritativeCanary({
      prisma,
      tripId,
      idempotencyKey: 'idem-booked',
      expectedTripRevision: 1,
      timeUpdates: [
        {
          itemId: 'i1',
          startTimeIso: '2026-07-24T10:00:00.000Z',
          endTimeIso: '2026-07-24T11:00:00.000Z',
        },
      ],
    });
    expect(rejected.outcome).toBe('REJECTED');
    expect(rejected.reasonCodes.some((c) => c.includes('TRANSACTION_ABORT'))).toBe(
      true,
    );
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(true);
  });

  it('after ITINERARY canary pass, only UNIFIED advances to next review', () => {
    const prevA = UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT;
    const prevI = UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST;
    const prevU = UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE;

    UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT = 'CANARY_IN_PROGRESS';
    UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST = 'BLOCKED_UNTIL_PRIOR_CORRIDOR';
    UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = 'BLOCKED_UNTIL_PRIOR_CORRIDOR';

    advanceCutoverAfterActionsCanaryPass();
    expect(UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST).toBe(
      'PENDING_CANARY_REVIEW',
    );
    beginItineraryAdjustCanary();
    expect(UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST).toBe(
      'CANARY_IN_PROGRESS',
    );
    expect(UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE).toBe(
      'BLOCKED_UNTIL_PRIOR_CORRIDOR',
    );

    advanceCutoverAfterItineraryCanaryPass();
    expect(UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST).toBe('CANARY_APPROVED');
    expect(UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE).toBe(
      'PENDING_CANARY_REVIEW',
    );
    expect(() => assertNoAutoUnlockAll()).not.toThrow();
    expect(UWC_1C_OCC_UNLOCKED).toBe(true);
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(true);

    UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT = prevA;
    UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST = prevI;
    UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = prevU;
  });
});
