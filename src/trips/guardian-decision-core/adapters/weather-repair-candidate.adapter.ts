/**
 * Slice 2 — weather activity repair stubs (indoor substitution).
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { Rfc001RepairCandidate } from '../contracts/guardian-outputs.types';
import type { WeatherActivityImpactResult } from '../detection/weather-activity-impact-analyzer';
import {
  ORIGINAL_CANDIDATE_ID,
  buildRepairCandidate,
} from './repair-candidate.adapter';
import { readSegmentItineraryItemId } from '../detection/segment-plan-item.util';

export const WEATHER_INDOOR_CANDIDATE_ID = 'cand_indoor';

export function buildWeatherActivityStubCandidates(input: {
  workspaceId: string;
  problem: Rfc001DecisionProblem;
  impact: WeatherActivityImpactResult;
  evidenceRefs?: string[];
}): Rfc001RepairCandidate[] {
  const replaces = input.impact.affectedPlanItemIds;
  return [
    buildRepairCandidate({
      workspaceId: input.workspaceId,
      candidateId: WEATHER_INDOOR_CANDIDATE_ID,
      basePlanVersionId: input.problem.planVersionId,
      replacesPlanItemIds: replaces,
      generationMethod: 'LOCAL_SUBSTITUTION',
      estimatedIntentPreservation: 0.78,
      estimatedAddedDurationMinutes: 0,
      preservedIntentRefs: ['intent_indoor_alternative'],
      evidenceRefs: input.evidenceRefs,
      operations: replaces.map((itemId, i) => ({
        operationId: `op_indoor_${i}`,
        kind: 'REPLACE_ITEM' as const,
        targetRefs: [{ kind: 'PLAN_ITEM' as const, id: itemId }],
        parameters: {
          itineraryItemId: itemId,
          substitutePoiId: 'poi_indoor_museum',
          exposure: 'indoor',
        },
      })),
    }),
  ];
}

export function planForWeatherCandidate(
  base: RoutePlanDraft,
  candidateId: string,
  affectedPlanItemIds: string[],
): RoutePlanDraft {
  if (candidateId === ORIGINAL_CANDIDATE_ID) return base;
  if (candidateId !== WEATHER_INDOOR_CANDIDATE_ID) return base;

  return {
    ...base,
    segments: (base.segments ?? []).map((segment) => {
      const itemId = readSegmentItineraryItemId(segment as any);
      if (itemId && affectedPlanItemIds.includes(itemId)) {
        return {
          ...segment,
          metadata: {
            ...(segment.metadata as object),
            exposure: 'indoor',
            activityType: 'INDOOR_MUSEUM',
          },
        };
      }
      return segment;
    }),
  };
}
