import type { Rfc001DecisionProblem } from '../../trips/guardian-decision-core/contracts/decision-problem.types';

export function buildGuidePlanSelectionProblem(input: {
  problemId: string;
  tripId: string;
  planVersionId: string;
  worldStateSnapshotId: string;
  sessionId: string;
}): Rfc001DecisionProblem {
  return {
    problemId: input.problemId,
    tripId: input.tripId,
    planVersionId: input.planVersionId,
    type: 'VALUE_TRADEOFF',
    triggerEventId: `guide_accept_${input.sessionId}`,
    affectedEntityRefs: [],
    affectedPlanItemIds: [],
    worldStateSnapshotId: input.worldStateSnapshotId,
    detectedAt: new Date().toISOString(),
    urgency: 'MEDIUM',
    status: 'EVALUATING',
    semanticCapability: 'GUIDE_PLAN_SELECTION',
  };
}
