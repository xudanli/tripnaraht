/**
 * Proactive Readiness Review — 仅 Intervention Quality 通过后可提交。
 * Auto Action / 实际 Proactive Notification 仍禁止。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import type { TemporalDecisionUtilityV1 } from './temporal-decision-utility.util';
import type { ActionableLeadTimeReportV1 } from './actionable-lead-time.util';
import type { InterventionQualityReportV1 } from './intervention-candidate-shadow.util';
import type { TemporalVisibilityDecisionV1 } from './visibility-gate.util';

export const PROACTIVE_READINESS_REVIEW_SCHEMA =
  'nara.proactive_readiness_review@v1' as const;

export type ProactiveReadinessReviewV1 = {
  schemaId: typeof PROACTIVE_READINESS_REVIEW_SCHEMA;
  version: 1;
  reviewId: string;
  scenarioId: TemporalScenarioId;
  status: 'SUBMITTED_FOR_REVIEW' | 'REJECTED_NOT_READY';
  utilityPassed: boolean;
  leadTimePassed: boolean;
  interventionQualityPassed: boolean;
  userVisibleAllowed: boolean;
  /** 审查入口打开 ≠ 允许发通知 */
  proactiveNotificationStillForbidden: true;
  autoActionStillForbidden: true;
  accuratePredictionIsNotUsefulIntervention: true;
  reasonsZh: string[];
  dodFocusZh: string;
};

export type SubmitProactiveReviewResult =
  | { ok: true; review: ProactiveReadinessReviewV1 }
  | { ok: false; review: ProactiveReadinessReviewV1 };

/**
 * 提交 Proactive Readiness Review（人工评审入口）；不开启通知/Auto Action。
 */
export function submitProactiveReadinessReview(input: {
  scenarioId: TemporalScenarioId;
  visibility: TemporalVisibilityDecisionV1;
  utility: TemporalDecisionUtilityV1;
  leadTime: ActionableLeadTimeReportV1;
  interventionQuality: InterventionQualityReportV1;
  reviewId?: string;
}): SubmitProactiveReviewResult {
  const reasonsZh: string[] = [];
  if (!input.visibility.allowUserVisibleTemporal) {
    reasonsZh.push('尚未 USER_VISIBLE_TEMPORAL');
  }
  if (!input.utility.passed) reasonsZh.push('TemporalDecisionUtility 未通过');
  if (!input.leadTime.passed) reasonsZh.push('ActionableLeadTime 未通过');
  if (!input.interventionQuality.passed) {
    reasonsZh.push('Intervention Quality 未通过');
  }

  const ready = reasonsZh.length === 0;
  if (ready) {
    reasonsZh.push(
      '已提交 Proactive Readiness Review；Proactive Notification 与 Auto Action 仍禁止，待人工评审',
    );
  } else {
    reasonsZh.push('不满足提交条件：继续 Shadow / Utility / Intervention 验证');
  }

  const review: ProactiveReadinessReviewV1 = {
    schemaId: PROACTIVE_READINESS_REVIEW_SCHEMA,
    version: 1,
    reviewId: input.reviewId ?? `prr_${input.scenarioId}_${Date.now()}`,
    scenarioId: input.scenarioId,
    status: ready ? 'SUBMITTED_FOR_REVIEW' : 'REJECTED_NOT_READY',
    utilityPassed: input.utility.passed,
    leadTimePassed: input.leadTime.passed,
    interventionQualityPassed: input.interventionQuality.passed,
    userVisibleAllowed: input.visibility.allowUserVisibleTemporal,
    proactiveNotificationStillForbidden: true,
    autoActionStillForbidden: true,
    accuratePredictionIsNotUsefulIntervention: true,
    reasonsZh,
    dodFocusZh:
      'DoD 不是 Temporal 出现在 UI，而是证明用户看到未来信息后决策更及时、更少后悔、更高质量',
  };

  return ready ? { ok: true, review } : { ok: false, review };
}
