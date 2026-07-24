import {
  buildStillOpenRoadSubstituteCandidates,
  shouldGenerateStillOpenRoadSubstitutes,
  STILL_OPEN_GENERATOR_VERSION,
} from './still-open-road-substitute.adapter';
import { buildRoadOpeningWindowEvaluationContext } from './road-opening-window-context.util';
import { buildRepairCandidate } from './repair-candidate.adapter';
import { evaluateAbuRoadOpeningWindowConstraintForCandidate } from './abu-road-opening-window-constraint.adapter';
import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { RoadCloseImpactResult } from '../detection/road-close-impact.types';

const basePlan: RoutePlanDraft = {
  tripId: 'trip-1',
  routeDirectionId: 'synthetic-IS',
  segments: [
    {
      segmentId: 'seg-1',
      dayIndex: 0,
      distanceKm: 100,
      ascentM: 0,
      slopePct: 0,
      metadata: {
        itineraryItemId: 'item-1',
        date: '2026-02-15',
        roadIds: ['F208'],
        intentRef: 'intent_glacier',
        poiId: 'is.skaftafell',
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

describe('still-open-road-substitute.adapter', () => {
  it('P2: generates cand_open_* that PASS opening window after blocked Neptune sub', () => {
    const openingContext = buildRoadOpeningWindowEvaluationContext({
      tripMetadata: {
        rfc001ExecutionActivityContext: {
          byActivityId: {
            'item-1': { plannedArrivalAt: '2026-02-15T15:30:00.000Z' },
          },
        },
        rfc001PoiOpeningWindows: {
          'is.svinafellsjokull': {
            lastEntryAt: '16:00',
            timezone: 'Atlantic/Reykjavik',
          },
        },
      },
      basePlan,
      affectedPlanItemIds: ['item-1'],
    });

    const blocked = buildRepairCandidate({
      workspaceId: 'ws_1',
      candidateId: 'cand_a',
      basePlanVersionId: 'plan_v1',
      replacesPlanItemIds: ['item-1'],
      generationMethod: 'ONTOLOGY_EQUIVALENCE',
      estimatedIntentPreservation: 0.91,
      estimatedAddedDurationMinutes: 45,
      operations: [
        {
          operationId: 'op_1',
          kind: 'REPLACE_ITEM',
          targetRefs: [{ kind: 'PLAN_ITEM', id: 'item-1' }],
          parameters: {
            itineraryItemId: 'item-1',
            substitutePoiId: 'is.svinafellsjokull',
          },
        },
      ],
    });

    expect(
      shouldGenerateStillOpenRoadSubstitutes([blocked], openingContext),
    ).toBe(true);

    const { candidates, windowsByPoiId } = buildStillOpenRoadSubstituteCandidates({
      workspaceId: 'ws_1',
      problem,
      impact,
      basePlan,
      openingContext,
      existingCandidates: [blocked],
      countryCode: 'IS',
    });

    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].candidateId).toBe('cand_open_a');
    expect(candidates[0].generatorVersion).toBe(STILL_OPEN_GENERATOR_VERSION);
    expect(candidates[0].preservedIntentRefs).toContain(
      'intent_still_open_alternative',
    );

    const mergedContext = {
      ...openingContext,
      windowsByPoiId: { ...openingContext.windowsByPoiId, ...windowsByPoiId },
    };

    const assertion = evaluateAbuRoadOpeningWindowConstraintForCandidate({
      workspaceId: 'ws_1',
      targetCandidateId: candidates[0].candidateId,
      affectedPlanItemIds: ['item-1'],
      context: mergedContext,
      repairCandidate: candidates[0],
    });
    expect(assertion.verdict).not.toBe('BLOCK');
  });

  it('does not generate when no candidate misses a hard window', () => {
    const openingContext = buildRoadOpeningWindowEvaluationContext({
      tripMetadata: {},
      basePlan,
      affectedPlanItemIds: ['item-1'],
      now: new Date('2026-02-15T12:00:00.000Z'),
    });
    const ok = buildRepairCandidate({
      workspaceId: 'ws_1',
      candidateId: 'cand_a',
      basePlanVersionId: 'plan_v1',
      replacesPlanItemIds: ['item-1'],
      generationMethod: 'LOCAL_SUBSTITUTION',
      estimatedIntentPreservation: 0.8,
      estimatedAddedDurationMinutes: 10,
      operations: [
        {
          operationId: 'op_1',
          kind: 'REPLACE_ITEM',
          targetRefs: [{ kind: 'PLAN_ITEM', id: 'item-1' }],
          parameters: { itineraryItemId: 'item-1', substitutePoiId: 'is.skogafoss' },
        },
      ],
    });
    expect(shouldGenerateStillOpenRoadSubstitutes([ok], openingContext)).toBe(
      false,
    );
  });
});
