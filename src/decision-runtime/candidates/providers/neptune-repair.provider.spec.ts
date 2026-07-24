import { NeptuneRepairProvider } from './neptune-repair.provider';
import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';
import type { Rfc001DecisionProblem } from '../../../trips/guardian-decision-core/contracts/decision-problem.types';
import type { RoadCloseImpactResult } from '../../../trips/guardian-decision-core/detection/road-close-impact.types';

const basePlan: RoutePlanDraft = {
  tripId: 'trip-1',
  segments: [
    {
      segmentId: 'seg-1',
      distanceKm: 120,
      metadata: {
        itineraryItemId: 'item-1',
        roadIds: ['F208'],
        intentRef: 'intent_glacier',
      },
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
  downstreamItemIds: [],
  matchedSegments: [],
};

describe('NeptuneRepairProvider', () => {
  const provider = new NeptuneRepairProvider();

  it('returns empty proposals without neptune providerContext', async () => {
    const result = await provider.proposeRepairs({
      tripId: 'trip-1',
      worldState: { context: { destination: 'IS', startDate: '2026-07-01', durationDays: 3, preferences: {} }, candidatesByDate: {}, signals: {} },
    });
    expect(result.proposals).toEqual([]);
    expect(result.providerId).toBe('neptune-repair');
  });

  it('maps Neptune repair candidates to RepairProposal[]', async () => {
    const result = await provider.proposeRepairs({
      tripId: 'trip-1',
      worldState: { context: { destination: 'IS', startDate: '2026-07-01', durationDays: 3, preferences: {} }, candidatesByDate: {}, signals: {} },
      providerContext: {
        neptune: {
          workspaceId: 'ws_1',
          problem,
          impact,
          basePlan,
        },
      },
    });
    expect(result.proposals.length).toBeGreaterThanOrEqual(2);
    expect(result.proposals[0].proposalId).toBe('cand_a');
    expect(result.proposals[0].label).toBeDefined();
    expect(result.rfc001RepairCandidates?.length).toBeGreaterThanOrEqual(2);
  });
});
