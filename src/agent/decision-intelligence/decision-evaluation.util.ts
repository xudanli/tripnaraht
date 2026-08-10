/**
 * DecisionEvaluation — 将 Arrival / Fatigue / Risk Reconciliation 转为可评价决策结果。
 * 原则：Prediction ≠ Decision；Counterfactual ≠ Observed Outcome。
 */

import type { OutcomeKind, OutcomeReconciliationV1 } from '../state-learning/outcome-reconciliation.util';

export const DECISION_EVALUATION_SCHEMA = 'nara.decision_evaluation@v1' as const;

export type DecisionEvaluationGrade = 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'INCONCLUSIVE';

export type DecisionEvaluationV1 = {
  schemaId: typeof DECISION_EVALUATION_SCHEMA;
  version: 1;
  evaluationId: string;
  tripId: string;
  outcomeKind: OutcomeKind;
  outcomeId: string;
  /** 预测值（非决策本身） */
  predictionZh: string;
  /** 观测结果（非反事实） */
  observedOutcomeZh: string;
  /** 当时正式决策/推荐（可与预测不同） */
  productionDecisionZh?: string;
  grade: DecisionEvaluationGrade;
  score: number;
  deltaZh?: string;
  /** 显式分离标记 */
  predictionIsNotDecision: true;
  counterfactualIsNotObserved: true;
  evaluatedAt: string;
};

function gradeFromDelta(kind: OutcomeKind, predicted: string, observed: string): {
  grade: DecisionEvaluationGrade;
  score: number;
} {
  const p = predicted.trim();
  const o = observed.trim();
  if (!p || !o) return { grade: 'INCONCLUSIVE', score: 0.5 };

  if (kind === 'ARRIVAL_TIME') {
    const pm = p.match(/([+-]?\d+)\s*min/i) ?? p.match(/([+-]?\d+)/);
    const om = o.match(/([+-]?\d+)\s*min/i) ?? o.match(/([+-]?\d+)/);
    if (pm && om) {
      const err = Math.abs(Number(pm[1]) - Number(om[1]));
      if (err <= 15) return { grade: 'GOOD', score: 0.9 };
      if (err <= 45) return { grade: 'ACCEPTABLE', score: 0.65 };
      return { grade: 'POOR', score: 0.3 };
    }
  }

  if (kind === 'FATIGUE') {
    const rank = (x: string) =>
      /HIGH|高/.test(x) ? 3 : /LOW|低/.test(x) ? 1 : 2;
    const d = Math.abs(rank(p) - rank(o));
    if (d === 0) return { grade: 'GOOD', score: 0.9 };
    if (d === 1) return { grade: 'ACCEPTABLE', score: 0.6 };
    return { grade: 'POOR', score: 0.3 };
  }

  if (kind === 'RISK') {
    const bad = /封闭|不可|危险|阻断|关闭/.test(o);
    const predictedSafe = /通行|可控|安全|可去/.test(p);
    if (bad && predictedSafe) return { grade: 'POOR', score: 0.25 };
    if (!bad && predictedSafe) return { grade: 'GOOD', score: 0.85 };
    return { grade: 'ACCEPTABLE', score: 0.55 };
  }

  if (p === o || p.includes(o) || o.includes(p)) {
    return { grade: 'GOOD', score: 0.8 };
  }
  return { grade: 'ACCEPTABLE', score: 0.5 };
}

/** Reconciliation → 可评价决策结果（评价预测质量，不等于改写决策） */
export function evaluateDecisionFromReconciliation(input: {
  reconciliation: OutcomeReconciliationV1;
  productionDecisionZh?: string;
  evaluationId?: string;
}): DecisionEvaluationV1 {
  const r = input.reconciliation;
  const { grade, score } = gradeFromDelta(
    r.kind,
    r.predicted.valueZh,
    r.observed.valueZh,
  );
  return {
    schemaId: DECISION_EVALUATION_SCHEMA,
    version: 1,
    evaluationId: input.evaluationId ?? `eval_${r.outcomeId}`,
    tripId: r.tripId,
    outcomeKind: r.kind,
    outcomeId: r.outcomeId,
    predictionZh: r.predicted.valueZh,
    observedOutcomeZh: r.observed.valueZh,
    productionDecisionZh: input.productionDecisionZh,
    grade,
    score,
    deltaZh: r.deltaZh,
    predictionIsNotDecision: true,
    counterfactualIsNotObserved: true,
    evaluatedAt: new Date().toISOString(),
  };
}

export function projectDecisionEvaluationForObservability(
  e: DecisionEvaluationV1,
): Record<string, unknown> {
  return {
    schema_id: e.schemaId,
    evaluation_id: e.evaluationId,
    outcome_kind: e.outcomeKind,
    grade: e.grade,
    score: e.score,
    prediction_is_not_decision: e.predictionIsNotDecision,
    counterfactual_is_not_observed: e.counterfactualIsNotObserved,
  };
}
