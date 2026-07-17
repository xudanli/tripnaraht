/**
 * Map DecisionOutcomeValidation / apply signals → product ActualOutcomeSnapshot
 * for TravelCausalDecision reconciliation on EXECUTE / CALIBRATE.
 */

import type { ActualOutcomeSnapshot } from '../../../travel-causal-decision';
import type {
  DecisionOutcomeValidation,
  ObservedOutcome,
} from '../../../trips/decision-semantics/types/decision-semantics.types';

function findMetric(
  observed: ObservedOutcome[] | undefined,
  metric: string,
): ObservedOutcome | undefined {
  return observed?.find((o) => o.metric === metric);
}

/**
 * Build ActualOutcomeSnapshot from Decision Semantics outcome validation.
 * Returns undefined when there is no observable signal (keep PENDING).
 */
export function extractActualOutcomeFromDecisionValidation(
  validation?: DecisionOutcomeValidation | null,
): ActualOutcomeSnapshot | undefined {
  if (!validation) return undefined;

  const observed = validation.observedOutcomes ?? [];
  if (!observed.length) {
    // Verdict-only calibrate (no metric samples yet)
    if (validation.verdict === 'CONFIRMED') {
      return {
        completed: true,
        metrics: { iceland_miss_prob: 0.05, completion_probability: 0.95 },
        observedAt: validation.evaluatedAt ?? new Date().toISOString(),
        sources: ['SYSTEM_INFERENCE'],
      };
    }
    if (validation.verdict === 'REFUTED') {
      return {
        completed: false,
        metrics: { iceland_miss_prob: 0.9, completion_probability: 0.1 },
        observedAt: validation.evaluatedAt ?? new Date().toISOString(),
        sources: ['SYSTEM_INFERENCE'],
      };
    }
    return undefined;
  }

  const arrival = findMetric(observed, 'ARRIVAL_TIME');
  const completion = findMetric(observed, 'ACTIVITY_COMPLETION');
  const driving = findMetric(observed, 'DRIVING_DURATION');
  const cost = findMetric(observed, 'COST');

  const metrics: Record<string, number> = {};
  if (driving && Number.isFinite(Number(driving.actualValue))) {
    metrics.actual_travel_minutes = Number(driving.actualValue);
  }
  if (cost && Number.isFinite(Number(cost.actualValue))) {
    metrics.actual_cost = Number(cost.actualValue);
  }

  // Infer miss probability from completion boolean when present
  if (completion) {
    const done =
      completion.actualValue === true ||
      completion.actualValue === 'true' ||
      completion.actualValue === 1 ||
      completion.actualValue === '1';
    metrics.iceland_miss_prob = done ? 0.05 : 0.9;
    metrics.completion_probability = done ? 0.95 : 0.1;
  }

  const sources = [...new Set(observed.map((o) => String(o.source)))];

  const hasSignal =
    arrival != null ||
    completion != null ||
    Object.keys(metrics).length > 0 ||
    validation.verdict === 'CONFIRMED' ||
    validation.verdict === 'REFUTED' ||
    validation.verdict === 'PARTIALLY_CONFIRMED';

  if (!hasSignal) return undefined;

  let completed: boolean | undefined;
  if (completion != null) {
    completed =
      completion.actualValue === true ||
      completion.actualValue === 'true' ||
      completion.actualValue === 1 ||
      completion.actualValue === '1';
  } else if (validation.verdict === 'CONFIRMED') {
    completed = true;
  } else if (validation.verdict === 'REFUTED') {
    completed = false;
  }

  return {
    arrivalTime: arrival ? String(arrival.actualValue) : undefined,
    completed,
    actualCost: cost && Number.isFinite(Number(cost.actualValue))
      ? Number(cost.actualValue)
      : undefined,
    metrics: Object.keys(metrics).length ? metrics : undefined,
    observedAt: validation.evaluatedAt ?? new Date().toISOString(),
    sources: sources.length ? sources : ['SYSTEM_INFERENCE'],
  };
}

/**
 * Provisional execute signal — plan version applied, outcome not yet observed.
 * Does not invent metrics; callers may still leave reconciliation PENDING.
 */
export function provisionalActualOutcomeFromApply(input: {
  applied: boolean;
  observedAt?: string;
}): ActualOutcomeSnapshot | undefined {
  if (!input.applied) return undefined;
  return {
    observedAt: input.observedAt ?? new Date().toISOString(),
    sources: ['SYSTEM_INFERENCE'],
    // No completed / metrics → classifyOutcomeReconciliation → UNOBSERVABLE or stay via skip
  };
}
