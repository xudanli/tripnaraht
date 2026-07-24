/**
 * Slice 3 — execution slip impact analysis.
 */

import type { EntityRef } from '../contracts/entity-ref.types';
import type {
  EffectivePlanActivity,
  ExecutionDepartureObservation,
  ExecutionScheduleAssessment,
  PoiExecutionWindow,
} from '../contracts/execution-slip.types';
import { assessExecutionScheduleFeasibility } from '../assessment/execution-slip-assessor.util';

export interface ExecutionSlipImpactResult {
  tripId: string;
  currentActivityId: string;
  nextActivityId: string;
  affectedPlanItemIds: string[];
  affectedEntityRefs: EntityRef[];
  assessment: ExecutionScheduleAssessment;
  nextWindow: PoiExecutionWindow | null;
  travelDurationMinutes: number;
  /** Minutes to subtract from current stay for shorten candidate feasibility */
  shortenDeltaMinutes: number;
}

export function analyzeExecutionSlipImpact(input: {
  tripId: string;
  observation: ExecutionDepartureObservation;
  currentActivity: EffectivePlanActivity;
  nextActivity: EffectivePlanActivity;
  nextWindow: PoiExecutionWindow | null;
  travelDurationMinutes: number;
}): ExecutionSlipImpactResult {
  const assessment = assessExecutionScheduleFeasibility({
    observation: input.observation,
    currentActivity: input.currentActivity,
    nextActivity: input.nextActivity,
    travelDurationMinutes: input.travelDurationMinutes,
    nextWindow: input.nextWindow,
  });

  const affectedPlanItemIds = [
    input.currentActivity.activityId,
    input.nextActivity.activityId,
  ];

  const affectedEntityRefs: EntityRef[] = [
    { kind: 'PLAN_ITEM', id: input.currentActivity.activityId },
    { kind: 'PLAN_ITEM', id: input.nextActivity.activityId },
  ];
  if (input.nextWindow) {
    affectedEntityRefs.push({
      kind: 'POI',
      id: input.nextWindow.poiId,
    });
  }

  const slipOver = assessment.slipMinutes;
  const shortenDeltaMinutes = Math.max(15, Math.min(60, slipOver + 15));

  return {
    tripId: input.tripId,
    currentActivityId: input.currentActivity.activityId,
    nextActivityId: input.nextActivity.activityId,
    affectedPlanItemIds,
    affectedEntityRefs,
    assessment,
    nextWindow: input.nextWindow,
    travelDurationMinutes: input.travelDurationMinutes,
    shortenDeltaMinutes,
  };
}

export function assertExecutionSlipHasImpact(
  impact: ExecutionSlipImpactResult,
): void {
  if (!impact.assessment.infeasible) {
    throw new Error('Execution slip impact requires infeasible schedule assessment');
  }
}
