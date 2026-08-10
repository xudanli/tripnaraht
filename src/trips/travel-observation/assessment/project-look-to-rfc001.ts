/**
 * Pure mapper: LookDecisionProblem → Rfc001DecisionProblem draft.
 * Does not Apply / write PlanVersion — persistence only opens a DecisionProblem.
 */

import type {
  Rfc001DecisionProblem,
  Rfc001DecisionProblemType,
} from '../../guardian-decision-core/contracts/decision-problem.types';
import type { LookDecisionProblem } from './look-decision-problem.types';
import type { DecisionProblemKind } from '../observation.types';

export function lookTriggerEventId(observationId: string): string {
  return `look_obs:${observationId}`;
}

export function mapLookTypeToRfc001(
  type: DecisionProblemKind,
): Rfc001DecisionProblemType {
  switch (type) {
    case 'INFEASIBILITY':
      return 'FEASIBILITY_FAILURE';
    case 'RISK':
      return 'SCHEDULE_RISK';
    case 'EXECUTION_DEVIATION':
      return 'EXECUTION_FAILURE';
    case 'DATA_UNCERTAINTY':
      return 'VALUE_TRADEOFF';
    default:
      return 'FEASIBILITY_FAILURE';
  }
}

/** Align F-road Look semantic with TEP ROAD_SEGMENT_RESTRICTED → OFFICIAL_IS_FROAD_2WD */
export function mapLookSemanticCapability(semanticKey: string): string {
  switch (semanticKey) {
    case 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH':
      return 'ROAD_SEGMENT_RESTRICTED';
    case 'EXECUTION_DEVIATION.WRONG_MEETING_POINT':
      return 'EXECUTION_SCHEDULE_INFEASIBLE';
    case 'DATA_CONFLICT.ROAD_STATUS_CONFLICT':
      return 'ROAD_SEGMENT_UNAVAILABLE';
    case 'DATA_CONFLICT.IMAGE_LOCATION_MISMATCH':
      return 'VALUE_TRADEOFF';
    default:
      return semanticKey;
  }
}

export function projectLookToRfc001DecisionProblem(input: {
  look: LookDecisionProblem;
  planVersionId?: string;
  worldStateSnapshotId?: string;
}): Rfc001DecisionProblem {
  const { look } = input;
  return {
    problemId: look.problemId,
    tripId: look.tripId,
    planVersionId: input.planVersionId ?? 'PLAN_VERSION_PENDING_LOOK',
    type: mapLookTypeToRfc001(look.type),
    triggerEventId: lookTriggerEventId(look.observationId),
    affectedEntityRefs: [
      {
        kind: 'PLAN_ITEM',
        id: `look_observation:${look.observationId}`,
      },
    ],
    affectedPlanItemIds: [],
    worldStateSnapshotId:
      input.worldStateSnapshotId ?? `ws_look_${look.observationId}`,
    detectedAt: look.detectedAt,
    urgency: look.urgency,
    status: 'OPEN',
    semanticCapability: mapLookSemanticCapability(look.semanticKey),
  };
}
