import { randomUUID } from 'crypto';
import type { PlanDiff } from '../../../generated/execution-risk-contracts';
import type { PlanOperation } from '../../guardian-decision-core/contracts/plan-operation.types';

export function planDiffToPlanOperations(planDiff: PlanDiff): PlanOperation[] {
  const operations: PlanOperation[] = [];

  for (const activity of planDiff.removedActivities) {
    operations.push({
      operationId: `erc_remove_${activity.activityId}`,
      kind: 'REMOVE_ITEM',
      targetRefs: [{ kind: 'PLAN_ITEM', id: activity.activityId }],
      parameters: {
        itineraryItemId: activity.activityId,
        source: 'EXECUTION_RISK_CONFIRM',
      },
    });
  }

  for (const activity of planDiff.addedActivities) {
    operations.push({
      operationId: `erc_add_${activity.activityId}`,
      kind: 'ADD_ITEM',
      targetRefs: [{ kind: 'PLAN_ITEM', id: activity.activityId }],
      parameters: {
        itineraryItemId: activity.activityId,
        name: activity.name,
        type: activity.type,
        durationMinutes: activity.durationMinutes,
        source: 'EXECUTION_RISK_CONFIRM',
      },
    });
  }

  for (const change of planDiff.modifiedActivities) {
    operations.push({
      operationId: `erc_shift_${change.after.activityId}`,
      kind: 'SHIFT_TIME',
      targetRefs: [{ kind: 'PLAN_ITEM', id: change.after.activityId }],
      parameters: {
        itineraryItemId: change.after.activityId,
        before: change.before,
        after: change.after,
        timeDeltaMinutes: planDiff.timeDeltaMinutes,
        propagationMode: 'UNTIL_FIXED_ANCHOR',
        source: 'EXECUTION_RISK_CONFIRM',
      },
    });
  }

  return operations;
}

export function buildErcPlanVersionId(tripId: string, decisionId: string): string {
  return `erc_pv_${tripId}_${decisionId.slice(-8)}_${randomUUID().slice(0, 6)}`;
}
