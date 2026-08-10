/**
 * Outcome Attribution — 区分预测错误 / 用户行为变化 / 外部环境变化 / 干预成功。
 * Counterfactual ≠ Observed Outcome：反事实假设不得记为观测。
 */

import type { DecisionEvaluationV1 } from './decision-evaluation.util';
import type { OutcomeReconciliationV1 } from '../state-learning/outcome-reconciliation.util';

export const OUTCOME_ATTRIBUTION_SCHEMA = 'nara.outcome_attribution@v1' as const;

export type OutcomeAttributionKind =
  | 'PREDICTION_ERROR'
  | 'USER_BEHAVIOR_CHANGE'
  | 'EXTERNAL_ENVIRONMENT_CHANGE'
  | 'INTERVENTION_SUCCESS';

export type OutcomeAttributionV1 = {
  schemaId: typeof OUTCOME_ATTRIBUTION_SCHEMA;
  version: 1;
  attributionId: string;
  tripId: string;
  outcomeId: string;
  primary: OutcomeAttributionKind;
  secondary?: OutcomeAttributionKind[];
  confidence: number;
  rationaleZh: string;
  /** 若输入含反事实，仅作注释，不算 observed */
  counterfactualNoteZh?: string;
  counterfactualIsNotObserved: true;
};

export type AttributionHints = {
  userChangedPlan?: boolean;
  externalShock?: boolean;
  interventionApplied?: boolean;
  interventionImprovedOutcome?: boolean;
  /** 明确标记的反事实叙述（不得当观测） */
  counterfactualZh?: string;
};

/**
 * 规则归因（可解释、可测）；不改 Policy。
 */
export function attributeOutcome(input: {
  reconciliation: OutcomeReconciliationV1;
  evaluation?: DecisionEvaluationV1 | null;
  hints?: AttributionHints;
  attributionId?: string;
}): OutcomeAttributionV1 {
  const hints = input.hints ?? {};
  const secondary: OutcomeAttributionKind[] = [];
  let primary: OutcomeAttributionKind = 'PREDICTION_ERROR';
  let rationaleZh = '预测与观测不一致，默认归因预测误差';
  let confidence = 0.55;

  if (hints.interventionApplied && hints.interventionImprovedOutcome) {
    primary = 'INTERVENTION_SUCCESS';
    rationaleZh = '已实施干预且观测相对改善，归因干预成功';
    confidence = 0.8;
  } else if (hints.externalShock) {
    primary = 'EXTERNAL_ENVIRONMENT_CHANGE';
    rationaleZh = '检测到外部环境冲击（天气/路况/封闭等）';
    confidence = 0.75;
    if (input.evaluation?.grade === 'POOR') {
      secondary.push('PREDICTION_ERROR');
    }
  } else if (hints.userChangedPlan) {
    primary = 'USER_BEHAVIOR_CHANGE';
    rationaleZh = '用户行为/计划变更导致观测偏离预测';
    confidence = 0.7;
  } else if (input.evaluation?.grade === 'GOOD') {
    primary = 'PREDICTION_ERROR';
    rationaleZh = '观测与预测大体一致；若仍有偏差视为轻微预测误差';
    confidence = 0.6;
  }

  if (hints.counterfactualZh) {
    secondary.push('PREDICTION_ERROR');
  }

  return {
    schemaId: OUTCOME_ATTRIBUTION_SCHEMA,
    version: 1,
    attributionId: input.attributionId ?? `attr_${input.reconciliation.outcomeId}`,
    tripId: input.reconciliation.tripId,
    outcomeId: input.reconciliation.outcomeId,
    primary,
    secondary: secondary.length ? secondary : undefined,
    confidence,
    rationaleZh,
    counterfactualNoteZh: hints.counterfactualZh,
    counterfactualIsNotObserved: true,
  };
}
