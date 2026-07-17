/**
 * Loop 2 — attach selection + reconcile predicted vs actual outcomes.
 */

import {
  DECISION_OUTCOME_SCHEMA,
  type ActualOutcomeSnapshot,
  type DecisionOutcome,
  type OutcomeReconciliationStatus,
  type SimulatedOutcomeSnapshot,
} from '../types/decision-outcome.types';
import type { TravelCausalDecision } from '../types/travel-causal-decision.types';

export interface ReconcileDecisionOutcomeInput {
  decisionId: string;
  tripId?: string;
  selectedOptionId?: string;
  predictedOutcome: SimulatedOutcomeSnapshot;
  actualOutcome?: ActualOutcomeSnapshot;
  ledgerRef?: string;
  outcomeValidationId?: string;
  /** Absolute tolerance on completionProbability (default 0.12). */
  completionTolerance?: number;
}

function completionFromActual(actual: ActualOutcomeSnapshot): number | undefined {
  if (actual.metrics?.iceland_miss_prob != null) {
    return 1 - actual.metrics.iceland_miss_prob;
  }
  if (actual.completed === true) return 1;
  if (actual.completed === false) return 0;
  return actual.metrics?.completion_probability;
}

/**
 * Classify product reconciliation status from predicted vs actual.
 */
export function classifyOutcomeReconciliation(
  predicted: SimulatedOutcomeSnapshot,
  actual: ActualOutcomeSnapshot | undefined,
  completionTolerance = 0.12,
): { status: OutcomeReconciliationStatus; explanation: string } {
  if (!actual) {
    return { status: 'PENDING', explanation: '等待实际执行结果' };
  }

  const hasSignal =
    actual.completed != null ||
    actual.arrivalTime != null ||
    actual.metrics != null ||
    actual.observedRiskLevel != null;

  if (!hasSignal) {
    return { status: 'UNOBSERVABLE', explanation: '无可用观测信号' };
  }

  const predictedCompletion = predicted.completionProbability;
  const actualCompletion = completionFromActual(actual);

  if (predictedCompletion == null || actualCompletion == null) {
    if (actual.completed != null && predicted.riskLevel && actual.observedRiskLevel) {
      if (actual.observedRiskLevel === predicted.riskLevel) {
        return { status: 'PARTIAL', explanation: '风险带一致，但缺少完成率对账' };
      }
      return { status: 'DISPROVED', explanation: '风险带与预测不一致' };
    }
    return { status: 'UNOBSERVABLE', explanation: '缺少可对账的完成率指标' };
  }

  const err = Math.abs(predictedCompletion - actualCompletion);
  if (err <= completionTolerance) {
    return {
      status: 'CONFIRMED',
      explanation: `完成率误差 ${err.toFixed(3)} ≤ ${completionTolerance}`,
    };
  }
  if (err <= completionTolerance * 2) {
    return {
      status: 'PARTIAL',
      explanation: `完成率误差 ${err.toFixed(3)} 部分对齐`,
    };
  }
  return {
    status: 'DISPROVED',
    explanation: `完成率误差 ${err.toFixed(3)} 超出容差`,
  };
}

export function buildDecisionOutcome(
  input: ReconcileDecisionOutcomeInput,
): DecisionOutcome {
  const { status, explanation } = classifyOutcomeReconciliation(
    input.predictedOutcome,
    input.actualOutcome,
    input.completionTolerance,
  );

  return {
    schema: DECISION_OUTCOME_SCHEMA,
    decisionId: input.decisionId,
    tripId: input.tripId,
    selectedOptionId: input.selectedOptionId,
    predictedOutcome: input.predictedOutcome,
    actualOutcome: input.actualOutcome,
    reconciliation: status,
    reconciledAt: status === 'PENDING' ? undefined : new Date().toISOString(),
    explanation,
    ledgerRef: input.ledgerRef,
    outcomeValidationId: input.outcomeValidationId,
  };
}

/** Mark user selection on a decision (still PENDING until actuals arrive). */
export function attachSelectedOption(
  decision: TravelCausalDecision,
  selectedOptionId: string,
): TravelCausalDecision {
  const selected = decision.interventions.find((i) => i.optionId === selectedOptionId);
  const predicted = selected?.expectedOutcome ?? decision.baselineOutcome;

  return {
    ...decision,
    outcome: buildDecisionOutcome({
      decisionId: decision.decisionId,
      tripId: decision.tripId,
      selectedOptionId,
      predictedOutcome: predicted,
      ledgerRef: decision.ledgerRef,
    }),
  };
}

/** Apply observed execution result → reconciliation status. */
export function reconcileTravelCausalDecision(
  decision: TravelCausalDecision,
  actual: ActualOutcomeSnapshot,
  opts?: { selectedOptionId?: string; completionTolerance?: number },
): TravelCausalDecision {
  const selectedOptionId =
    opts?.selectedOptionId ?? decision.outcome?.selectedOptionId;
  const selected = selectedOptionId
    ? decision.interventions.find((i) => i.optionId === selectedOptionId)
    : undefined;
  const predicted =
    selected?.expectedOutcome ??
    decision.outcome?.predictedOutcome ??
    decision.baselineOutcome;

  return {
    ...decision,
    outcome: buildDecisionOutcome({
      decisionId: decision.decisionId,
      tripId: decision.tripId,
      selectedOptionId,
      predictedOutcome: predicted,
      actualOutcome: actual,
      ledgerRef: decision.ledgerRef,
      completionTolerance: opts?.completionTolerance,
    }),
  };
}
