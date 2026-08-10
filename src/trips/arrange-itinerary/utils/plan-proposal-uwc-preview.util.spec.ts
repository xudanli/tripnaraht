import type { PlanProposal } from '../types/plan-proposal.types';
import {
  projectPlanProposalUwcPreview,
  type PlanProposalUwcPreview,
} from './plan-proposal-uwc-preview.util';

function baseProposal(overrides: Partial<PlanProposal> = {}): PlanProposal {
  return {
    proposalId: 'proposal_1',
    tripId: 'trip_1',
    userId: 'user_1',
    intent: 'MOVE_ITEM',
    basePlanVersion: 1,
    contextVersion: 1,
    affectedDays: [1],
    changes: [],
    tradeoffs: [],
    validation: { status: 'PASS', warnings: [], conflicts: [] },
    diff: { summary: '', timelineChanges: [] },
    requiresConfirmation: true,
    status: 'AWAITING_CONFIRMATION',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    source: { type: 'ai_action', payload: {} },
    ...overrides,
  };
}

describe('plan-proposal-uwc-preview.util', () => {
  it('opens UNIFIED when decisionId/planVersionId/expectedPlanVersionId present', async () => {
    const prisma = {
      trip: { findUnique: async () => null },
    } as never;
    const out = await projectPlanProposalUwcPreview(
      prisma,
      baseProposal({
        source: {
          type: 'ai_action',
          payload: {
            decisionId: 'dec-1',
            planVersionId: 'pv_new',
            expectedPlanVersionId: 'pv_parent',
          },
        },
      }),
    );
    expect(out).toEqual({
      open: true,
      slice: 'unified_plan_version_only',
      decisionId: 'dec-1',
      planVersionId: 'pv_new',
      expectedPlanVersionId: 'pv_parent',
    } satisfies PlanProposalUwcPreview);
  });

  it('opens same-day time adjust with timeUpdates', async () => {
    const dayDate = new Date('2026-07-24T00:00:00.000Z');
    const prisma = {
      trip: {
        findUnique: async () => ({
          updatedAt: dayDate,
          metadata: { revision: 7 },
          TripDay: [{ id: 'day1', date: dayDate }],
        }),
      },
    } as never;

    const out = await projectPlanProposalUwcPreview(
      prisma,
      baseProposal({
        changes: [
          {
            operation: 'MOVE',
            itemId: 'i1',
            dayIndex: 1,
            startTime: '10:00',
            endTime: '11:00',
          },
        ],
      }),
    );
    expect(out.open).toBe(true);
    if (!out.open || out.slice !== 'itinerary_same_day_time_adjust') {
      throw new Error('expected itinerary open');
    }
    expect(out.expectedTripRevision).toBe(7);
    expect(out.timeUpdates).toHaveLength(1);
    expect(out.timeUpdates[0]!.itemId).toBe('i1');
    expect(out.timeUpdates[0]!.startTimeIso).toContain('T10:00:00');
  });

  it('opens same-day ADD with itemCreates when placeId + times present', async () => {
    const dayDate = new Date('2026-07-24T00:00:00.000Z');
    const prisma = {
      trip: {
        findUnique: async () => ({
          updatedAt: dayDate,
          metadata: { revision: 7 },
          TripDay: [{ id: 'day1', date: dayDate }],
        }),
      },
    } as never;

    const out = await projectPlanProposalUwcPreview(
      prisma,
      baseProposal({
        intent: 'ADD_ITEM',
        changes: [
          {
            operation: 'ADD',
            dayIndex: 1,
            startTime: '10:00',
            endTime: '11:00',
            placeId: 42,
            label: '瀑布',
          },
        ],
      }),
    );
    expect(out.open).toBe(true);
    if (!out.open || out.slice !== 'itinerary_same_day_add_item') {
      throw new Error('expected itinerary ADD open');
    }
    expect(out.expectedTripRevision).toBe(7);
    expect(out.itemCreates).toHaveLength(1);
    expect(out.itemCreates[0]!.tripDayId).toBe('day1');
    expect(out.itemCreates[0]!.placeId).toBe(42);
    expect(out.itemCreates[0]!.startTimeIso).toContain('T10:00:00');
  });

  it('opens same-day ADD from candidates (AUTO_ARRANGE single-day)', async () => {
    const dayDate = new Date('2026-07-24T00:00:00.000Z');
    const prisma = {
      trip: {
        findUnique: async () => ({
          updatedAt: dayDate,
          metadata: { revision: 4 },
          TripDay: [{ id: 'day1', date: dayDate }],
        }),
      },
    } as never;

    const out = await projectPlanProposalUwcPreview(
      prisma,
      baseProposal({
        intent: 'AUTO_ARRANGE',
        changes: [
          {
            operation: 'ADD',
            dayIndex: 1,
            startTime: '10:00',
            endTime: '11:00',
            placeId: 7,
            candidateId: 'cand-1',
            removeFromCandidates: true,
            label: '瀑布',
          },
          {
            operation: 'REMOVE_CANDIDATE',
            dayIndex: 1,
            candidateId: 'cand-1',
            label: '瀑布',
          },
        ],
      }),
    );
    expect(out.open).toBe(true);
    if (!out.open || out.slice !== 'itinerary_same_day_add_from_candidates') {
      throw new Error('expected from-candidates open');
    }
    expect(out.expectedTripRevision).toBe(4);
    expect(out.itemCreates).toHaveLength(1);
    expect(out.candidateRemovals).toEqual(['cand-1']);
  });

  it('opens multi-day AUTO_ARRANGE from-candidates (≥2 days)', async () => {
    const d1 = new Date('2026-07-24T00:00:00.000Z');
    const d2 = new Date('2026-07-25T00:00:00.000Z');
    const prisma = {
      trip: {
        findUnique: async () => ({
          updatedAt: d1,
          metadata: { revision: 9 },
          TripDay: [
            { id: 'day1', date: d1 },
            { id: 'day2', date: d2 },
          ],
        }),
      },
    } as never;

    const out = await projectPlanProposalUwcPreview(
      prisma,
      baseProposal({
        intent: 'AUTO_ARRANGE',
        changes: [
          {
            operation: 'ADD',
            dayIndex: 1,
            startTime: '10:00',
            endTime: '11:00',
            placeId: 42,
            candidateId: 'cand-1',
            removeFromCandidates: true,
          },
          {
            operation: 'REMOVE_CANDIDATE',
            dayIndex: 1,
            candidateId: 'cand-1',
          },
          {
            operation: 'ADD',
            dayIndex: 2,
            startTime: '10:00',
            endTime: '11:00',
            placeId: 43,
            candidateId: 'cand-2',
            removeFromCandidates: true,
          },
          {
            operation: 'REMOVE_CANDIDATE',
            dayIndex: 2,
            candidateId: 'cand-2',
          },
        ],
      }),
    );
    expect(out.open).toBe(true);
    if (
      !out.open ||
      out.slice !== 'itinerary_multi_day_add_from_candidates'
    ) {
      throw new Error('expected multi-day from-candidates open');
    }
    expect(out.expectedTripRevision).toBe(9);
    expect(out.itemCreates).toHaveLength(2);
    expect(new Set(out.itemCreates.map((c) => c.tripDayId)).size).toBe(2);
    expect(out.candidateRemovals).toEqual(['cand-1', 'cand-2']);
  });

  it('opens same-day REMOVE with itemRemovals', async () => {
    const dayDate = new Date('2026-07-24T00:00:00.000Z');
    const prisma = {
      trip: {
        findUnique: async () => ({
          updatedAt: dayDate,
          metadata: { revision: 5 },
          TripDay: [{ id: 'day1', date: dayDate }],
        }),
      },
    } as never;

    const out = await projectPlanProposalUwcPreview(
      prisma,
      baseProposal({
        changes: [
          { operation: 'REMOVE', itemId: 'i1', dayIndex: 1 },
          { operation: 'REMOVE', itemId: 'i2', dayIndex: 1 },
        ],
      }),
    );
    expect(out.open).toBe(true);
    if (!out.open || out.slice !== 'itinerary_same_day_remove_item') {
      throw new Error('expected REMOVE open');
    }
    expect(out.expectedTripRevision).toBe(5);
    expect(out.itemRemovals).toEqual(['i1', 'i2']);
  });

  it('opens same-day REORDER with itemReorders (dense order)', async () => {
    const dayDate = new Date('2026-07-24T00:00:00.000Z');
    const prisma = {
      trip: {
        findUnique: async () => ({
          updatedAt: dayDate,
          metadata: { revision: 6 },
          TripDay: [{ id: 'day1', date: dayDate }],
        }),
      },
    } as never;

    const out = await projectPlanProposalUwcPreview(
      prisma,
      baseProposal({
        changes: [
          { operation: 'REORDER', itemId: 'i2', dayIndex: 1 },
          { operation: 'REORDER', itemId: 'i1', dayIndex: 1, order: 5 },
        ],
      }),
    );
    expect(out.open).toBe(true);
    if (!out.open || out.slice !== 'itinerary_same_day_reorder_items') {
      throw new Error('expected REORDER open');
    }
    expect(out.expectedTripRevision).toBe(6);
    expect(out.itemReorders).toEqual([
      { itemId: 'i2', order: 1 },
      { itemId: 'i1', order: 5 },
    ]);
  });

  it('opens same-day MOVE+ADD atomic composite', async () => {
    const dayDate = new Date('2026-07-24T00:00:00.000Z');
    const prisma = {
      trip: {
        findUnique: async () => ({
          updatedAt: dayDate,
          metadata: { revision: 7 },
          TripDay: [{ id: 'day1', date: dayDate }],
        }),
      },
    } as never;

    const out = await projectPlanProposalUwcPreview(
      prisma,
      baseProposal({
        changes: [
          {
            operation: 'MOVE',
            itemId: 'i1',
            dayIndex: 1,
            startTime: '09:00',
            endTime: '10:00',
          },
          {
            operation: 'ADD',
            dayIndex: 1,
            startTime: '11:00',
            endTime: '12:00',
            placeId: 42,
            label: '黑沙滩',
          },
        ],
      }),
    );
    expect(out.open).toBe(true);
    if (!out.open || out.slice !== 'itinerary_same_day_move_and_add') {
      throw new Error('expected MOVE+ADD open');
    }
    expect(out.expectedTripRevision).toBe(7);
    expect(out.timeUpdates).toHaveLength(1);
    expect(out.itemCreates).toHaveLength(1);
    expect(out.itemCreates[0]?.placeId).toBe(42);
  });

  it('opens same-day REDUCE_INTENSITY (REST ADD + MOVE)', async () => {
    const dayDate = new Date('2026-07-24T00:00:00.000Z');
    const prisma = {
      trip: {
        findUnique: async () => ({
          updatedAt: dayDate,
          metadata: { revision: 8 },
          TripDay: [{ id: 'day1', date: dayDate }],
        }),
      },
    } as never;

    const out = await projectPlanProposalUwcPreview(
      prisma,
      baseProposal({
        intent: 'REDUCE_INTENSITY',
        changes: [
          {
            operation: 'ADD',
            dayIndex: 1,
            startTime: '15:30',
            endTime: '16:30',
            itemType: 'REST',
            label: '休息 / 降强度',
          },
          {
            operation: 'MOVE',
            itemId: 'i-last',
            dayIndex: 1,
            startTime: '10:00',
            endTime: '15:00',
          },
        ],
      }),
    );
    expect(out.open).toBe(true);
    if (!out.open || out.slice !== 'itinerary_same_day_reduce_intensity') {
      throw new Error('expected REDUCE_INTENSITY open');
    }
    expect(out.expectedTripRevision).toBe(8);
    expect(out.timeUpdates).toHaveLength(1);
    expect(out.itemCreates).toHaveLength(1);
    expect(out.itemCreates[0]?.type).toBe('REST');
    expect(out.itemCreates[0]?.placeId).toBeNull();
  });

  it('stays closed (legacy) when ADD lacks placeId/times or MIXED ops', async () => {
    const prisma = {
      trip: {
        findUnique: async () => ({
          updatedAt: new Date(),
          metadata: {},
          TripDay: [{ id: 'day1', date: new Date('2026-07-24T00:00:00.000Z') }],
        }),
      },
    } as never;
    const out = await projectPlanProposalUwcPreview(
      prisma,
      baseProposal({
        changes: [
          {
            operation: 'ADD',
            dayIndex: 1,
            itemId: 'x',
          },
        ],
      }),
    );
    expect(out).toMatchObject({ open: false });
  });
});
