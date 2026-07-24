import {
  ORIGINAL_CANDIDATE_ID,
  applyProposedOperationsToPlan,
  buildRoadCloseStubCandidates,
  planForCandidate,
} from './repair-candidate.adapter';
import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { RoadCloseImpactResult } from '../detection/road-close-impact.types';

const basePlan: RoutePlanDraft = {
  tripId: 'trip-1',
  segments: [
    {
      segmentId: 'seg-1',
      distanceKm: 12,
      ascentM: 0,
      metadata: { itineraryItemId: 'item-1', roadIds: ['F208'] },
    },
  ],
};

const problem: Rfc001DecisionProblem = {
  problemId: 'problem_1',
  tripId: 'trip-1',
  planVersionId: 'plan_v1',
  type: 'FEASIBILITY_FAILURE',
  triggerEventId: 'evt_1',
  affectedEntityRefs: [],
  affectedPlanItemIds: ['item-1'],
  worldStateSnapshotId: 'wss_1',
  detectedAt: '2026-06-30T10:00:00Z',
  urgency: 'HIGH',
  status: 'OPEN',
};

const impact: RoadCloseImpactResult = {
  roadId: 'F208',
  affectedPlanItemIds: ['item-1'],
  matchedSegmentIds: ['seg-1'],
  affectedEntityRefs: [],
  sameDayDownstreamItemIds: [],
};

describe('repair-candidate.adapter (PR-C)', () => {
  it('builds 3 structurally diverse Iceland stub candidates', () => {
    const candidates = buildRoadCloseStubCandidates({
      workspaceId: 'ws_1',
      problem,
      impact,
      basePlan,
    });
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.generationMethod)).toEqual([
      'ONTOLOGY_EQUIVALENCE',
      'LOCAL_SUBSTITUTION',
      'ROUTE_REPAIR',
    ]);
  });

  it('applyProposedOperationsToPlan does not mutate base reference', () => {
    const candidates = buildRoadCloseStubCandidates({
      workspaceId: 'ws_1',
      problem,
      impact,
      basePlan,
    });
    const mutated = planForCandidate(basePlan, candidates[0]);
    expect(mutated).not.toBe(basePlan);
    expect(basePlan.segments).toHaveLength(1);
    expect(mutated.segments?.length).toBeLessThanOrEqual(1);
  });

  it('CHANGE_ROUTE updates segment roadIds', () => {
    const next = applyProposedOperationsToPlan(basePlan, [
      {
        operationId: 'op_bypass',
        kind: 'CHANGE_ROUTE',
        targetRefs: [{ kind: 'ROUTE_SEGMENT', id: 'seg-1' }],
        parameters: { bypassRoadId: 'RING_ROAD' },
      },
    ]);
    expect((next.segments![0].metadata as any).roadIds).toEqual(['RING_ROAD']);
  });

  it('original candidate id is stable', () => {
    expect(ORIGINAL_CANDIDATE_ID).toBe('original');
  });
});
