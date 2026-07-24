/**
 * Abu — hard opening-window gate for road repair candidates.
 * BLOCK (non-overridable) when detour ETA misses lastEntryAt.
 */

import type { Rfc001ConstraintAssertion } from '../contracts/guardian-outputs.types';
import type { Rfc001RepairCandidate } from '../contracts/guardian-outputs.types';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';
import { ORIGINAL_CANDIDATE_ID } from './repair-candidate.adapter';
import {
  assessRoadCandidateOpeningWindow,
  ROAD_OPENING_WINDOW_REASON,
} from '../assessment/road-candidate-opening-window.assessor';
import {
  resolveRoadCandidateTargetWindow,
  type RoadOpeningWindowEvaluationContext,
} from './road-opening-window-context.util';

export const ABU_ROAD_OPENING_WINDOW_RULE_VERSION = 'abu-road-opening-window-0.1.0';
export const ROAD_OPENING_WINDOW_CONSTRAINT_CODE = 'ROAD_CANDIDATE_OPENING_WINDOW';

export function evaluateAbuRoadOpeningWindowConstraintForCandidate(input: {
  workspaceId: string;
  targetCandidateId: string;
  affectedPlanItemIds: string[];
  evidenceRefs?: string[];
  context: RoadOpeningWindowEvaluationContext;
  repairCandidate?: Rfc001RepairCandidate;
  now?: Date;
}): Rfc001ConstraintAssertion {
  const now = input.now ?? new Date();
  const window = resolveRoadCandidateTargetWindow({
    candidateId: input.targetCandidateId,
    candidate: input.repairCandidate,
    affectedPlanItemIds: input.affectedPlanItemIds,
    context: input.context,
  });

  const addedDurationMinutes =
    input.targetCandidateId === ORIGINAL_CANDIDATE_ID
      ? 0
      : input.repairCandidate?.estimatedAddedDurationMinutes ?? 0;

  const assessment = assessRoadCandidateOpeningWindow({
    referenceArrivalIso: input.context.referenceArrivalIso,
    addedDurationMinutes,
    window,
  });

  const base: Omit<
    Rfc001ConstraintAssertion,
    'verdict' | 'constraintCode' | 'reasonCodes' | 'overridable'
  > = {
    assertionId: `abu_road_openwin_${input.workspaceId}_${input.targetCandidateId}_${now.getTime()}`,
    workspaceId: input.workspaceId,
    actor: 'ABU',
    targetCandidateId: input.targetCandidateId,
    affectedEntityRefs: [],
    affectedPlanItemIds: input.affectedPlanItemIds,
    evidenceRefs: input.evidenceRefs ?? [],
    ruleVersion: ABU_ROAD_OPENING_WINDOW_RULE_VERSION,
    confidence: window ? 0.85 : 0.5,
    createdAt: now.toISOString(),
  };

  if (assessment.result === 'NO_HARD_WINDOW') {
    return {
      ...base,
      verdict: 'PASS',
      constraintCode: ROAD_OPENING_WINDOW_CONSTRAINT_CODE,
      reasonCodes: assessment.reasonCodes,
      overridable: true,
    };
  }

  if (assessment.result === 'WINDOW_MISSED') {
    return {
      ...base,
      verdict: 'BLOCK',
      constraintCode: ROAD_OPENING_WINDOW_CONSTRAINT_CODE,
      reasonCodes: [
        ...assessment.reasonCodes,
        RFC001_REASON_CODES.TIME_WINDOW_INFEASIBLE,
      ],
      overridable: false,
    };
  }

  if (assessment.result === 'AT_RISK') {
    return {
      ...base,
      verdict: 'WARNING',
      constraintCode: ROAD_OPENING_WINDOW_CONSTRAINT_CODE,
      reasonCodes: assessment.reasonCodes,
      overridable: true,
    };
  }

  return {
    ...base,
    verdict: 'PASS',
    constraintCode: ROAD_OPENING_WINDOW_CONSTRAINT_CODE,
    reasonCodes: [ROAD_OPENING_WINDOW_REASON.FEASIBLE],
    overridable: true,
  };
}
