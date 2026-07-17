/**
 * P2 — append LOCAL_SUBSTITUTION candidates that still clear lastEntryAt
 * after road-close detours blocked earlier Neptune options.
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { Rfc001RepairCandidate } from '../contracts/guardian-outputs.types';
import type { RoadCloseImpactResult } from '../detection/road-close-impact.types';
import { assessRoadCandidateOpeningWindow } from '../assessment/road-candidate-opening-window.assessor';
import { buildRepairCandidate } from './repair-candidate.adapter';
import {
  inferRoadRepairContext,
  resolveRoadRepairPackBundle,
} from './neptune-road-repair.adapter';
import {
  loadStillOpenRoadFallbacks,
  type StillOpenRoadFallback,
} from './still-open-road-substitute.catalog';
import type { RoadOpeningWindowEvaluationContext } from './road-opening-window-context.util';

export const STILL_OPEN_CANDIDATE_IDS = ['cand_open_a', 'cand_open_b'] as const;
export const STILL_OPEN_GENERATOR_VERSION = 'still-open-road-substitute-0.1.0';

export function buildStillOpenRoadSubstituteCandidates(input: {
  workspaceId: string;
  problem: Rfc001DecisionProblem;
  impact: RoadCloseImpactResult;
  basePlan: RoutePlanDraft;
  openingContext: RoadOpeningWindowEvaluationContext;
  existingCandidates: Rfc001RepairCandidate[];
  countryCode?: string;
  tripMetadata?: unknown;
  evidenceRefs?: string[];
  limit?: number;
}): {
  candidates: Rfc001RepairCandidate[];
  /** POI windows to merge into opening-window context before Abu gate */
  windowsByPoiId: RoadOpeningWindowEvaluationContext['windowsByPoiId'];
} {
  const limit = input.limit ?? STILL_OPEN_CANDIDATE_IDS.length;
  const pack = input.countryCode
    ? resolveRoadRepairPackBundle(input.countryCode)
    : null;
  const repairCtx = inferRoadRepairContext({
    basePlan: input.basePlan,
    impact: input.impact,
    pack,
  });

  const closedRoad = input.impact.roadId.trim().toUpperCase();
  const usedPoiIds = new Set(
    input.existingCandidates.flatMap((c) =>
      c.proposedOperations
        .filter((op) => op.kind === 'REPLACE_ITEM' && op.parameters?.substitutePoiId)
        .map((op) => String(op.parameters.substitutePoiId)),
    ),
  );

  const fallbacks = loadStillOpenRoadFallbacks({
    countryCode: input.countryCode,
    tripMetadata: input.tripMetadata,
  });

  const ranked = fallbacks
    .filter((fb) => filterFallback(fb, repairCtx, closedRoad, usedPoiIds))
    .map((fb) => ({
      fb,
      assessment: assessRoadCandidateOpeningWindow({
        referenceArrivalIso: input.openingContext.referenceArrivalIso,
        addedDurationMinutes: fb.estimatedAddedDurationMinutes,
        window: fb.window,
      }),
      score:
        fb.estimatedIntentPreservation * 100 -
        Math.max(0, fb.estimatedAddedDurationMinutes) * 0.1,
    }))
    .filter((row) => !row.assessment.infeasible)
    .sort((a, b) => b.score - a.score);

  const candidates: Rfc001RepairCandidate[] = [];
  const windowsByPoiId: RoadOpeningWindowEvaluationContext['windowsByPoiId'] = {};

  for (let i = 0; i < ranked.length && candidates.length < limit; i++) {
    const { fb } = ranked[i];
    const candidateId = STILL_OPEN_CANDIDATE_IDS[candidates.length];
    if (!candidateId) break;

    const replaces = input.impact.affectedPlanItemIds;
    candidates.push({
      ...buildRepairCandidate({
        workspaceId: input.workspaceId,
        candidateId,
        basePlanVersionId: input.problem.planVersionId,
        replacesPlanItemIds: replaces,
        generationMethod: 'LOCAL_SUBSTITUTION',
        estimatedIntentPreservation: fb.estimatedIntentPreservation,
        estimatedAddedDurationMinutes: fb.estimatedAddedDurationMinutes,
        preservedIntentRefs: [
          ...fb.intentRefs,
          'intent_still_open_alternative',
        ],
        evidenceRefs: [
          ...(input.evidenceRefs ?? []),
          `still_open:${fb.poiId}`,
        ],
        operations: replaces.map((itemId, idx) => ({
          operationId: `op_still_open_${fb.poiId}_${idx}`,
          kind: 'REPLACE_ITEM' as const,
          targetRefs: [{ kind: 'PLAN_ITEM' as const, id: itemId }],
          parameters: {
            itineraryItemId: itemId,
            substitutePoiId: fb.poiId,
            exposure: 'indoor',
            title: fb.title,
            stillOpenFallback: true,
          },
        })),
      }),
      generatorVersion: STILL_OPEN_GENERATOR_VERSION,
    });
    windowsByPoiId[fb.poiId] = fb.window;
    usedPoiIds.add(fb.poiId);
  }

  return { candidates, windowsByPoiId };
}

/** True when at least one existing candidate misses a hard opening window. */
export function shouldGenerateStillOpenRoadSubstitutes(
  existingCandidates: Rfc001RepairCandidate[],
  openingContext: RoadOpeningWindowEvaluationContext,
): boolean {
  for (const candidate of existingCandidates) {
    const substitutePoiId = candidate.proposedOperations.find(
      (op) => op.kind === 'REPLACE_ITEM' && op.parameters?.substitutePoiId,
    )?.parameters?.substitutePoiId;
    const window =
      (typeof substitutePoiId === 'string'
        ? openingContext.windowsByPoiId[substitutePoiId]
        : undefined) ??
      openingContext.windowsByActivityId[candidate.replacesPlanItemIds[0]] ??
      null;

    const assessment = assessRoadCandidateOpeningWindow({
      referenceArrivalIso: openingContext.referenceArrivalIso,
      addedDurationMinutes: candidate.estimatedAddedDurationMinutes,
      window,
    });
    if (assessment.infeasible) return true;
  }
  return false;
}

function filterFallback(
  fb: StillOpenRoadFallback,
  repairCtx: ReturnType<typeof inferRoadRepairContext>,
  closedRoad: string,
  usedPoiIds: Set<string>,
): boolean {
  if (usedPoiIds.has(fb.poiId)) return false;
  if (fb.requiresOpenRoadIds?.map((r) => r.toUpperCase()).includes(closedRoad)) {
    return false;
  }
  if (!fb.regionCodes.some((r) => repairCtx.regionCodes.includes(r))) {
    return false;
  }
  const intentHit = fb.intentRefs.some((i) => repairCtx.intentRefs.includes(i));
  const categoryHit = fb.experienceCategories.some((c) =>
    repairCtx.experienceCategories.includes(c as never),
  );
  const indoorSoft =
    fb.intentRefs.includes('intent_indoor_alternative') &&
    repairCtx.intentRefs.length > 0;
  return intentHit || categoryHit || indoorSoft;
}
