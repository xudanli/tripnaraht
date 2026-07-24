import { Rfc001ItineraryMaterializerService } from './rfc001-itinerary-materializer.service';
import { stampExecutionLock } from './rfc001-execution-lock.util';
import type { PlanOperation } from '../contracts/plan-operation.types';
import {
  EffectivePlanWriteBypassError,
  EffectivePlanWriteGuardService,
} from '../../../decision-runtime/execution/effective-plan-write-guard.service';

function createMaterializerMockPrisma() {
  const items = new Map<string, Record<string, unknown>>([
    [
      'item_day3_drive',
      {
        id: 'item_day3_drive',
        tripDayId: 'day3',
        type: 'ACTIVITY',
        order: 1,
        note: 'drive F208',
      },
    ],
  ]);
  const tripMeta: Record<string, unknown> = {
    revision: 17,
    rfc001IcelandRoadBindings: { byItemId: { item_day3_drive: ['F208'] } },
  };

  return {
    trip: {
      findUnique: jest.fn(async () => ({
        id: 'trip_mat',
        metadata: tripMeta,
        updatedAt: new Date(),
      })),
      update: jest.fn(async ({ data }: { data: { metadata?: unknown } }) => {
        if (data.metadata) Object.assign(tripMeta, data.metadata as object);
        return { metadata: tripMeta };
      }),
    },
    itineraryItem: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        items.get(where.id) ?? null,
      ),
      findMany: jest.fn(async () => [...items.values()]),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const existing = items.get(where.id);
        if (existing) items.set(where.id, { ...existing, ...data });
        return items.get(where.id);
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        items.delete(where.id);
        return { id: where.id };
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        items.set(String(data.id), data);
        return data;
      }),
    },
    items,
    tripMeta,
  };
}

describe('Rfc001ItineraryMaterializerService (WP3)', () => {
  const prevMat = process.env.RFC001_ITINERARY_MATERIALIZE;

  beforeEach(() => {
    process.env.RFC001_ITINERARY_MATERIALIZE = '1';
  });

  afterEach(() => {
    if (prevMat === undefined) delete process.env.RFC001_ITINERARY_MATERIALIZE;
    else process.env.RFC001_ITINERARY_MATERIALIZE = prevMat;
  });

  it('MAT-001 ERC: SHIFT_TIME cascades subsequent items until fixed anchor', async () => {
    const mock = createMaterializerMockPrisma();
    const dayDate = new Date('2026-08-01T00:00:00.000Z');
    mock.tripDay = {
      findUnique: jest.fn(async () => ({ id: 'day1', tripId: 'trip_mat', date: dayDate })),
      findMany: jest.fn(async () => [{ id: 'day1', tripId: 'trip_mat', date: dayDate }]),
    };

    const t = (h: number, m: number) =>
      new Date(Date.UTC(2026, 7, 1, h, m, 0));
    mock.items.set('item_glacier', {
      id: 'item_glacier',
      tripDayId: 'day1',
      type: 'ACTIVITY',
      order: 1,
      startTime: t(9, 0),
      endTime: t(11, 0),
    });
    mock.items.set('item_drive', {
      id: 'item_drive',
      tripDayId: 'day1',
      type: 'ACTIVITY',
      order: 2,
      startTime: t(11, 0),
      endTime: t(12, 0),
    });
    mock.items.set('item_hotel', {
      id: 'item_hotel',
      tripDayId: 'day1',
      type: 'REST',
      order: 3,
      startTime: t(21, 0),
      endTime: t(21, 30),
      note: '[fixed-anchor] hotel check-in',
      bookingStatus: 'CONFIRMED',
    });

    const prisma = mock as unknown as import('../../../prisma/prisma.service').PrismaService;
    const svc = new Rfc001ItineraryMaterializerService(prisma);
    await stampExecutionLock(prisma, 'trip_mat', 'dec_shift_1');

    const result = await svc.applyPlanOperations({
      tripId: 'trip_mat',
      decisionId: 'dec_shift_1',
      operations: [
        {
          operationId: 'op_shift_glacier',
          kind: 'SHIFT_TIME',
          targetRefs: [{ kind: 'PLAN_ITEM', id: 'item_glacier' }],
          parameters: {
            itineraryItemId: 'item_glacier',
            timeDeltaMinutes: 30,
            propagationMode: 'UNTIL_FIXED_ANCHOR',
          },
        },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.updatedItemIds).toEqual(['item_glacier', 'item_drive']);
    expect(mock.items.get('item_glacier')?.startTime).toEqual(t(9, 30));
    expect(mock.items.get('item_drive')?.startTime).toEqual(t(11, 30));
    expect(mock.items.get('item_hotel')?.startTime).toEqual(t(21, 0));
  });

  it('MAT-006: ADD_ITEM creates itinerary row on trip day', async () => {
    const mock = createMaterializerMockPrisma();
    mock.tripDay = {
      findMany: jest.fn(async () => [
        { id: 'day1', tripId: 'trip_mat', date: new Date('2026-08-01T00:00:00.000Z') },
      ]),
    };
    const prisma = mock as unknown as import('../../../prisma/prisma.service').PrismaService;
    const svc = new Rfc001ItineraryMaterializerService(prisma);
    await stampExecutionLock(prisma, 'trip_mat', 'dec_add_1');

    const result = await svc.applyPlanOperations({
      tripId: 'trip_mat',
      decisionId: 'dec_add_1',
      operations: [
        {
          operationId: 'op_add_1',
          kind: 'ADD_ITEM',
          targetRefs: [{ kind: 'DAY', id: '0' }],
          parameters: {
            tripDayIndex: 0,
            itineraryItemId: 'guide_item_trip_mat_slot1',
            title: '蓝湖',
            activityType: 'sightseeing',
            startTime: '10:00',
            endTime: '12:00',
            sourceTag: 'guide',
          },
        },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.createdItemIds).toContain('guide_item_trip_mat_slot1');
    expect(mock.items.has('guide_item_trip_mat_slot1')).toBe(true);
  });

  it('MAT-003: REPLACE_ITEM deletes and creates substitute row', async () => {
    const mock = createMaterializerMockPrisma();
    const prisma = mock as unknown as import('../../../prisma/prisma.service').PrismaService;
    const svc = new Rfc001ItineraryMaterializerService(prisma);

    await stampExecutionLock(prisma, 'trip_mat', 'dec_mat_1');

    const ops: PlanOperation[] = [
      {
        operationId: 'op_cand_a',
        kind: 'REPLACE_ITEM',
        targetRefs: [{ kind: 'PLAN_ITEM', id: 'item_day3_drive' }],
        parameters: {
          itineraryItemId: 'item_day3_drive',
          substitutePoiId: 'is.svinafellsjokull',
        },
      },
    ];

    const result = await svc.applyPlanOperations({
      tripId: 'trip_mat',
      decisionId: 'dec_mat_1',
      operations: ops,
    });

    expect(result.applied).toBe(true);
    expect(result.removedItemIds).toContain('item_day3_drive');
    expect(result.createdItemIds.length).toBe(1);
    expect(mock.items.has('item_day3_drive')).toBe(false);
    expect(mock.itineraryItem.delete).toHaveBeenCalled();
    expect(mock.itineraryItem.create).toHaveBeenCalled();
  });

  it('MAT-004: CHANGE_ROUTE updates road bindings in trip metadata', async () => {
    const mock = createMaterializerMockPrisma();
    const prisma = mock as unknown as import('../../../prisma/prisma.service').PrismaService;
    const svc = new Rfc001ItineraryMaterializerService(prisma);
    await stampExecutionLock(prisma, 'trip_mat', 'dec_mat_2');

    await svc.applyPlanOperations({
      tripId: 'trip_mat',
      decisionId: 'dec_mat_2',
      operations: [
        {
          operationId: 'op_bypass',
          kind: 'CHANGE_ROUTE',
          targetRefs: [{ kind: 'ROUTE_SEGMENT', id: 'seg-1' }],
          parameters: {
            bypassRoadId: 'RING_ROAD',
            itineraryItemId: 'item_day3_drive',
          },
        },
      ],
    });

    const bindings = (mock.tripMeta.rfc001IcelandRoadBindings as any).byItemId;
    expect(bindings.item_day3_drive).toEqual(['RING_ROAD']);
  });

  it('MAT-005: rollback restores deleted item from journal', async () => {
    const mock = createMaterializerMockPrisma();
    const prisma = mock as unknown as import('../../../prisma/prisma.service').PrismaService;
    const svc = new Rfc001ItineraryMaterializerService(prisma);
    await stampExecutionLock(prisma, 'trip_mat', 'dec_mat_3');

    await svc.applyPlanOperations({
      tripId: 'trip_mat',
      decisionId: 'dec_mat_3',
      operations: [
        {
          operationId: 'op_remove',
          kind: 'REMOVE_ITEM',
          targetRefs: [{ kind: 'PLAN_ITEM', id: 'item_day3_drive' }],
          parameters: { itineraryItemId: 'item_day3_drive' },
        },
      ],
    });
    expect(mock.items.has('item_day3_drive')).toBe(false);

    const rolled = await svc.rollbackMaterialization({
      tripId: 'trip_mat',
      decisionId: 'dec_mat_3',
    });
    expect(rolled.restoredItemIds).toContain('item_day3_drive');
    expect(mock.items.has('item_day3_drive')).toBe(true);
  });

  it('CAS-085: blocks applyPlanOperations without execute authority when write chain on', async () => {
    const prevChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    try {
      const mock = createMaterializerMockPrisma();
      const prisma = mock as unknown as import('../../../prisma/prisma.service').PrismaService;
      const guard = new EffectivePlanWriteGuardService();
      const svc = new Rfc001ItineraryMaterializerService(prisma, guard);
      await stampExecutionLock(prisma, 'trip_mat', 'dec_guard_1');

      await expect(
        svc.applyPlanOperations({
          tripId: 'trip_mat',
          decisionId: 'dec_guard_1',
          operations: [
            {
              operationId: 'op_rm_1',
              kind: 'REMOVE_ITEM',
              targetRefs: [{ kind: 'PLAN_ITEM', id: 'item_day3_drive' }],
              parameters: { itineraryItemId: 'item_day3_drive' },
            },
          ],
        }),
      ).rejects.toThrow(EffectivePlanWriteBypassError);
    } finally {
      if (prevChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
      else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = prevChain;
    }
  });
});
