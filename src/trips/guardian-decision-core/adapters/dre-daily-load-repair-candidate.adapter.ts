/**
 * Slice 3 — Dr.Dre daily load repair stubs (split overloaded day).
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { Rfc001RepairCandidate } from '../contracts/guardian-outputs.types';
import type { ExcessiveDailyLoadImpactResult } from '../detection/excessive-daily-load-impact-analyzer';
import {
  ORIGINAL_CANDIDATE_ID,
  buildRepairCandidate,
} from './repair-candidate.adapter';
import {
  indexSegmentsByDay,
  readSegmentItineraryItemId,
} from '../detection/segment-plan-item.util';

export const DAILY_LOAD_SPLIT_CANDIDATE_ID = 'cand_split_day';

export function buildDailyLoadStubCandidates(input: {
  workspaceId: string;
  problem: Rfc001DecisionProblem;
  impact: ExcessiveDailyLoadImpactResult;
  evidenceRefs?: string[];
}): Rfc001RepairCandidate[] {
  const replaces = input.impact.affectedPlanItemIds;
  return [
    buildRepairCandidate({
      workspaceId: input.workspaceId,
      candidateId: DAILY_LOAD_SPLIT_CANDIDATE_ID,
      basePlanVersionId: input.problem.planVersionId,
      replacesPlanItemIds: replaces,
      generationMethod: 'SPLIT_DAY',
      estimatedIntentPreservation: 0.82,
      estimatedAddedDurationMinutes: 0,
      preservedIntentRefs: ['intent_split_overloaded_day'],
      evidenceRefs: input.evidenceRefs,
      operations: [
        {
          operationId: 'op_split_day',
          kind: 'SPLIT_DAY',
          targetRefs: [{ kind: 'DAY', id: `day_${input.impact.dayIndex}` }],
          parameters: {
            dayIndex: input.impact.dayIndex,
            strategy: 'split_driving_load',
          },
        },
      ],
    }),
  ];
}

export function planForDailyLoadCandidate(
  base: RoutePlanDraft,
  candidateId: string,
  impact: ExcessiveDailyLoadImpactResult,
): RoutePlanDraft {
  if (candidateId === ORIGINAL_CANDIDATE_ID) return base;
  if (candidateId !== DAILY_LOAD_SPLIT_CANDIDATE_ID) return base;

  const byDay = indexSegmentsByDay(base);
  const daySegments = byDay.get(impact.dayIndex) ?? [];
  const splitAt = Math.ceil(daySegments.length / 2);
  const moveIds = new Set<string>();
  daySegments.slice(splitAt).forEach((seg) => {
    const id = readSegmentItineraryItemId(seg as any);
    if (id) moveIds.add(id);
  });

  return {
    ...base,
    segments: (base.segments ?? []).map((segment) => {
      const itemId = readSegmentItineraryItemId(segment as any);
      if (itemId && moveIds.has(itemId)) {
        return {
          ...segment,
          dayIndex: impact.dayIndex + 1,
          metadata: {
            ...(segment.metadata as object),
            splitFromDayIndex: impact.dayIndex,
          },
        };
      }
      return segment;
    }),
  };
}
