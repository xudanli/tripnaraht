/**
 * Counterfactual Comparator — 现实分支 vs 假设分支（多世界比较）
 */

import type { CounterfactualResult } from './counterfactual.simulator';

export interface CounterfactualComparison {
  readonly better: boolean;
  readonly delta: {
    readonly timeSaved: number;
    readonly riskReduced: number;
    readonly feasibilityImproved: number;
  };
  readonly recommendation: 'Switch to alternative plan' | 'Keep current plan';
}

export function compareCounterfactuals(
  actual: CounterfactualResult,
  simulated: CounterfactualResult,
): CounterfactualComparison {
  const timeSaved = actual.costDelta.time - simulated.costDelta.time;
  const riskReduced = actual.costDelta.risk - simulated.costDelta.risk;
  const feasibilityImproved = simulated.feasibleSlots - actual.feasibleSlots;

  const better = simulated.costDelta.time < actual.costDelta.time;

  return {
    better,
    delta: {
      timeSaved,
      riskReduced,
      feasibilityImproved,
    },
    recommendation: better
      ? 'Switch to alternative plan'
      : 'Keep current plan',
  };
}
