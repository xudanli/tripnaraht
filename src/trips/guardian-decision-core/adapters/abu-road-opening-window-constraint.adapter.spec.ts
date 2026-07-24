import { evaluateAbuRoadOpeningWindowConstraintForCandidate } from './abu-road-opening-window-constraint.adapter';
import {
  buildRoadOpeningWindowEvaluationContext,
  resolveRoadCandidateTargetWindow,
} from './road-opening-window-context.util';
import { buildRepairCandidate, ORIGINAL_CANDIDATE_ID } from './repair-candidate.adapter';
import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import { candidateHasNonOverridableBlock } from '../policy/write-permission.guard';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';

const basePlan: RoutePlanDraft = {
  tripId: 'trip-1',
  routeDirectionId: 'synthetic-IS',
  segments: [
    {
      segmentId: 'seg-1',
      dayIndex: 0,
      distanceKm: 80,
      ascentM: 0,
      slopePct: 0,
      metadata: {
        itineraryItemId: 'item-museum',
        date: '2026-02-15',
        poiId: 'is.national_museum',
      },
    },
  ],
};

describe('abu-road-opening-window-constraint.adapter', () => {
  it('BLOCKS substitute candidate when detour misses substitute lastEntryAt', () => {
    const context = buildRoadOpeningWindowEvaluationContext({
      tripMetadata: {
        rfc001ExecutionActivityContext: {
          byActivityId: {
            'item-museum': {
              plannedArrivalAt: '2026-02-15T15:30:00.000Z',
            },
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
      affectedPlanItemIds: ['item-museum'],
    });

    const candidate = buildRepairCandidate({
      workspaceId: 'ws_1',
      candidateId: 'cand_a',
      basePlanVersionId: 'plan_v1',
      replacesPlanItemIds: ['item-museum'],
      generationMethod: 'ONTOLOGY_EQUIVALENCE',
      estimatedIntentPreservation: 0.9,
      estimatedAddedDurationMinutes: 45,
      operations: [
        {
          operationId: 'op_1',
          kind: 'REPLACE_ITEM',
          targetRefs: [{ kind: 'PLAN_ITEM', id: 'item-museum' }],
          parameters: {
            itineraryItemId: 'item-museum',
            substitutePoiId: 'is.svinafellsjokull',
          },
        },
      ],
    });

    expect(
      resolveRoadCandidateTargetWindow({
        candidateId: 'cand_a',
        candidate,
        affectedPlanItemIds: ['item-museum'],
        context,
      })?.lastEntryAt,
    ).toBe('16:00');

    const assertion = evaluateAbuRoadOpeningWindowConstraintForCandidate({
      workspaceId: 'ws_1',
      targetCandidateId: 'cand_a',
      affectedPlanItemIds: ['item-museum'],
      context,
      repairCandidate: candidate,
    });

    expect(assertion.verdict).toBe('BLOCK');
    expect(assertion.overridable).toBe(false);
    expect(assertion.reasonCodes).toContain('TIME_WINDOW_INFEASIBLE');

    const workspace = {
      constraintAssertions: [assertion],
    } as DecisionWorkspace;
    expect(candidateHasNonOverridableBlock(workspace, 'cand_a')).toBe(true);
  });

  it('PASS original / candidates when only all-day POIs (no hard window)', () => {
    const context = buildRoadOpeningWindowEvaluationContext({
      tripMetadata: {},
      basePlan,
      affectedPlanItemIds: ['item-museum'],
      now: new Date('2026-02-15T12:00:00.000Z'),
    });

    const assertion = evaluateAbuRoadOpeningWindowConstraintForCandidate({
      workspaceId: 'ws_1',
      targetCandidateId: ORIGINAL_CANDIDATE_ID,
      affectedPlanItemIds: ['item-museum'],
      context,
    });

    expect(assertion.verdict).toBe('PASS');
    expect(assertion.reasonCodes).toContain('ROAD_OPENING_WINDOW_NO_HARD_WINDOW');
  });

  it('uses activity execution window for ROUTE_REPAIR (same POI, longer drive)', () => {
    const context = buildRoadOpeningWindowEvaluationContext({
      tripMetadata: {
        rfc001ExecutionActivityContext: {
          byActivityId: {
            'item-museum': {
              plannedArrivalAt: '2026-02-15T15:30:00.000Z',
              executionWindow: {
                lastEntryAt: '16:00',
                timezone: 'Atlantic/Reykjavik',
              },
            },
          },
        },
      },
      basePlan,
      affectedPlanItemIds: ['item-museum'],
    });

    const candidate = buildRepairCandidate({
      workspaceId: 'ws_1',
      candidateId: 'cand_c',
      basePlanVersionId: 'plan_v1',
      replacesPlanItemIds: ['item-museum'],
      generationMethod: 'ROUTE_REPAIR',
      estimatedIntentPreservation: 0.7,
      estimatedAddedDurationMinutes: 50,
      operations: [
        {
          operationId: 'op_bypass',
          kind: 'CHANGE_ROUTE',
          targetRefs: [{ kind: 'ROUTE_SEGMENT', id: 'seg-1' }],
          parameters: { bypassRoadId: '1' },
        },
      ],
    });

    const assertion = evaluateAbuRoadOpeningWindowConstraintForCandidate({
      workspaceId: 'ws_1',
      targetCandidateId: 'cand_c',
      affectedPlanItemIds: ['item-museum'],
      context,
      repairCandidate: candidate,
    });

    expect(assertion.verdict).toBe('BLOCK');
  });
});
