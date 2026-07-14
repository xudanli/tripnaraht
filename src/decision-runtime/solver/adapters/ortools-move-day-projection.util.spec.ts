import {
  applyMoveDayCandidateToRoutePlan,
  buildMoveDayRfc001Operations,
  isOrtToolsMoveDayShadowOp,
  parseDayIndexFromDayId,
  solverMoveDayToPlanProposalChanges,
} from './ortools-move-day-projection.util';
import { buildOrtToolsRfc001RepairCandidates } from './ortools-to-rfc001-repair.adapter';
import { solverCandidateToPlanProposalChanges } from './ortools-to-plan-proposal-changes.adapter';
import {
  isOrtToolsMoveDayShadowApplyLeak,
  selectAuthoritativePlanProposalChanges,
} from '../lab/ortools-planning-shadow-apply.guard';
import type { SolverCandidate } from '../contracts/solver-response';
import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';

const moveCand: SolverCandidate = {
  candidateId: 'req:move_day:1',
  operation: 'MOVE_DAY',
  label: 'move-day-rebalance-1',
  dayPlans: [
    {
      dayId: 'day-1',
      nodeIds: ['depot', 'a4', 'a2'],
      startMin: [480, 660, 720],
    },
    {
      dayId: 'day-2',
      nodeIds: ['depot', 'b1', 'a3'],
      startMin: [480, 540, 600],
    },
  ],
  objectiveValue: 120,
  diffHint: {
    movedDayPairs: [
      { nodeId: 'a3', fromDayId: 'day-1', toDayId: 'day-2' },
    ],
  },
};

describe('ortools-move-day-projection (P4.d)', () => {
  it('parses day indices', () => {
    expect(parseDayIndexFromDayId('day-1')).toBe(1);
    expect(parseDayIndexFromDayId('day-2')).toBe(2);
  });

  it('builds RFC001 MOVE_ITEM ops with shadowOnly', () => {
    const ops = buildMoveDayRfc001Operations(moveCand);
    expect(ops.some((o) => o.parameters.operation === 'MOVE_DAY')).toBe(true);
    expect(ops.every((o) => isOrtToolsMoveDayShadowOp(o.parameters))).toBe(true);
    const cross = ops.find((o) => o.parameters.itineraryItemId === 'a3');
    expect(cross?.parameters.toDayId).toBe('day-2');
    expect(cross?.parameters.fromDayId).toBe('day-1');
  });

  it('projects PlanProposal MOVE changes for cross-day moves', () => {
    const changes = solverMoveDayToPlanProposalChanges(moveCand);
    expect(changes.some((c) => c.itemId === 'a3' && c.dayIndex === 2)).toBe(
      true,
    );
    expect(changes.every((c) => c.note?.includes('ortools-shadow'))).toBe(true);
  });

  it('wires through plan-proposal adapter for MOVE_DAY', () => {
    const changes = solverCandidateToPlanProposalChanges({
      candidate: moveCand,
      dayIndex: 1,
      items: [],
    });
    expect(changes.length).toBeGreaterThan(0);
  });

  it('wires through RFC001 repair builder', () => {
    const cands = buildOrtToolsRfc001RepairCandidates({
      workspaceId: 'ws1',
      basePlanVersionId: 'pv1',
      basePlan: { tripId: 't1', segments: [] },
      impact: {
        roadId: 'F208',
        affectedPlanItemIds: ['a3'],
        affectedDayIndexes: [1, 2],
      } as never,
      candidates: [moveCand],
    });
    expect(cands).toHaveLength(1);
    expect(
      cands[0]!.proposedOperations.some(
        (o) => o.parameters.operation === 'MOVE_DAY',
      ),
    ).toBe(true);
  });

  it('materializes multi-day segment dayIndex remaps', () => {
    const base: RoutePlanDraft = {
      tripId: 't1',
      segments: [
        {
          segmentId: 's-a3',
          dayIndex: 1,
          from: { lat: 0, lng: 0 },
          to: { lat: 1, lng: 1 },
          distanceKm: 10,
          metadata: { itineraryItemId: 'a3' },
        },
        {
          segmentId: 's-a2',
          dayIndex: 1,
          from: { lat: 0, lng: 0 },
          to: { lat: 1, lng: 1 },
          distanceKm: 8,
          metadata: { itineraryItemId: 'a2' },
        },
        {
          segmentId: 's-b1',
          dayIndex: 2,
          from: { lat: 0, lng: 0 },
          to: { lat: 1, lng: 1 },
          distanceKm: 5,
          metadata: { itineraryItemId: 'b1' },
        },
      ],
    };
    const out = applyMoveDayCandidateToRoutePlan(base, moveCand);
    const a3 = out.segments?.find(
      (s) => (s.metadata as { itineraryItemId?: string }).itineraryItemId === 'a3',
    );
    expect(a3?.dayIndex).toBe(2);
  });

  it('apply guard strips MOVE_DAY shadow from authoritative changes', () => {
    const auth = selectAuthoritativePlanProposalChanges({
      proposalId: 'p',
      tripId: 't',
      userId: 'u',
      intent: 'OPTIMIZE_ROUTE',
      basePlanVersion: 1,
      contextVersion: 1,
      affectedDays: [1],
      changes: [
        {
          operation: 'MOVE',
          itemId: 'real',
          dayIndex: 1,
          note: 'user confirmed',
        },
        {
          operation: 'MOVE',
          itemId: 'a3',
          dayIndex: 2,
          note: '[ortools-shadow] MOVE_DAY day-1→day-2',
        },
      ],
      tradeoffs: [],
      validation: { status: 'PASS', warnings: [], conflicts: [] },
      diff: { timelineChanges: [], summary: '' },
      requiresConfirmation: true,
      status: 'AWAITING_CONFIRMATION',
      createdAt: '',
      expiresAt: '',
      source: { type: 'ai_action', payload: {} },
    } as never);
    expect(auth).toHaveLength(1);
    expect(auth[0]!.itemId).toBe('real');
    expect(
      isOrtToolsMoveDayShadowApplyLeak({
        appliedChanges: [
          {
            operation: 'MOVE',
            itemId: 'a3',
            dayIndex: 2,
            note: '[ortools-shadow] MOVE_DAY day-1→day-2',
          },
        ],
      }),
    ).toBe(true);
  });
});
